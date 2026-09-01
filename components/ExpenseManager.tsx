
import React, { useState, useMemo, useEffect } from 'react';
import { Account, AccountType, Contact, ContactType } from '../types';
import { formatBDT, formatNumber, exportToXLSX, getOpDateBST, generateUUID } from '../constants';
import { generatePDFReport, generateExpensePDF } from '../services/pdfService';
import SmartFilterBar, { SmartFilterState } from './SmartFilterBar';
import ExportButtons from './ExportButtons';
import Pagination from './Pagination';
import ColumnSelector, { useColumns, ColumnDef } from './ColumnSelector';
import SearchableSelect from './SearchableSelect';
import QuickContactModal from './QuickContactModal';

const ExpenseManager: React.FC<{ store: any; defaultCreate?: boolean; onNavigate?: (tab: string, filter?: any, ctx?: any) => void }> = ({ store, defaultCreate, onNavigate }) => {
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [quickVendorName, setQuickVendorName] = useState<string | null>(null);
  const [viewingExpense, setViewingExpense] = useState<any | null>(null);
  
  const cashInShopAccount = (store.accounts || []).find((a: Account) => a.code === '100100') || (store.accounts || []).find((a: Account) => a.type === AccountType.ASSET && (a.subType === 'CASH' || (a.name || '').toLowerCase().includes('cash')));
  const operatingExpenseParent = (store.accounts || []).find((a: Account) => a.type === AccountType.EXPENSE && ((a.name || '').toLowerCase().includes('operating') || a.code === '600000' || a.code === '500000'));
  
  const paymentAccounts = (store.accounts || []).filter((a: Account) => a.type === AccountType.ASSET);
  // Show all expense accounts, but we'll prioritize sub-accounts of Operating Expenses
  const categoryAccounts = (store.accounts || []).filter((a: Account) => a.type === AccountType.EXPENSE);
  const vendors = (store.contacts || []).filter((c: Contact) => c.type === ContactType.VENDOR);
  const [isAddingCategory, setIsAddingCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const [formData, setFormData] = useState({
    date: getOpDateBST(),
    description: '',
    amount: 0,
    fromAccountId: cashInShopAccount?.id || paymentAccounts[0]?.id || '',
    toAccountId: categoryAccounts[0]?.id || '',
    contactId: '',
    reference: '',
    expenseType: ''
  });

  // Handle auto-create from quick actions
  useEffect(() => {
    if (defaultCreate) {
      setFormData({
        date: getOpDateBST(),
        description: '',
        amount: 0,
        fromAccountId: cashInShopAccount?.id || paymentAccounts[0]?.id || '',
        toAccountId: categoryAccounts[0]?.id || '',
        contactId: '',
        reference: '',
        expenseType: ''
      });
      setShowForm(true);
    }
  }, [defaultCreate, cashInShopAccount, paymentAccounts, categoryAccounts]);

  // Synchronize default accounts once they are loaded
  useEffect(() => {
    if (!editingId && showForm) {
      setFormData(prev => {
        let changed = false;
        const next = { ...prev };
        if (!next.fromAccountId && (cashInShopAccount?.id || paymentAccounts[0]?.id)) {
          next.fromAccountId = cashInShopAccount?.id || paymentAccounts[0]?.id || '';
          changed = true;
        }
        if (!next.toAccountId && (categoryAccounts[0]?.id)) {
          next.toAccountId = categoryAccounts[0]?.id || '';
          changed = true;
        }
        return changed ? next : prev;
      });
    }
  }, [cashInShopAccount, paymentAccounts, categoryAccounts, editingId, showForm]);

  const handleQuickAddCategory = () => {
    if (!newCategoryName.trim()) return;
    
    // Determine parent: use currently selected if it's an expense, otherwise use Operating Expenses parent
    const selectedAccount = (store.accounts || []).find((a: Account) => a.id === formData.toAccountId);
    const parent = (selectedAccount && selectedAccount.type === AccountType.EXPENSE) ? selectedAccount : operatingExpenseParent;

    if (!parent) return alert("No parent expense account found to add sub-category under.");

    // Find next code: If parent is 600000, children are 600001, 600002...
    const children = (store.accounts || []).filter((a: Account) => a.parentId === parent.id);
    let nextCode = "";
    
    if (parent.code === '600000') {
      nextCode = (600000 + children.length + 1).toString();
    } else {
      nextCode = `${parent.code}${children.length + 1}`.slice(0, 8);
    }

    try {
      const newAcc = store.addAccount({
        name: newCategoryName.trim(),
        code: nextCode,
        type: AccountType.EXPENSE,
        parentId: parent.id,
        description: `Quick added sub-category of ${parent.name}`
      });
      setFormData({ ...formData, toAccountId: newAcc.id });
      setNewCategoryName('');
      setIsAddingCategory(false);
    } catch (e: any) {
      alert(e.message);
    }
  };

  const currentEntry = useMemo(() => editingId ? ((store.paginatedEntries || store.entries) || []).find((e: any) => e.id === editingId) : null, [editingId, (store.paginatedEntries || store.entries)]);
  const status = currentEntry?.status || 'POSTED';
  const isEditable = (!editingId && store.hasPermission('bill_create')) || (editingId && status === 'DRAFT' && store.hasPermission('bill_edit'));

  const handleSave = async (status: 'POSTED' | 'DRAFT' = 'POSTED') => {
    if (!isEditable) return alert("You do not have permission to edit this expense.");
    if (formData.amount <= 0) return alert("Magnitude must be positive.");
    if (!formData.fromAccountId || !formData.toAccountId) return alert("Select accounts.");
    if (isSaving) return;

    setIsSaving(true);
    try {
      if (editingId) {
        let finalRef = formData.reference;
        if (status === 'POSTED' && (!finalRef || String(finalRef).startsWith('DRAFT-'))) {
          // It's becoming POSTED but has no real reference, so assign one
          finalRef = store.generateNextNumber('EXPENSE', formData.date, store.activeCompanyIds[0]);
        }
        await store.updateJournalEntry(editingId, {
          date: formData.date,
          description: `Expense: ${formData.description}`,
          reference: finalRef,
          journalType: 'EXPENSE',
          expenseType: formData.expenseType,
          lines: [
            { id: generateUUID(), accountId: formData.toAccountId, debit: formData.amount, credit: 0, description: formData.description },
            { id: generateUUID(), accountId: formData.fromAccountId, debit: 0, credit: formData.amount, contactId: formData.contactId, description: formData.description }
          ],
          status
        });
        if (status === 'POSTED') {
          setShowForm(false);
          setEditingId(null);
        } else {
          alert("Draft updated.");
        }
        return;
      }

      const entry = await store.addExpense({ 
        ...formData, 
        status
      });
      
      if (status === 'DRAFT') {
        setEditingId(entry.id);
        setFormData(prev => ({ ...prev, reference: entry.reference }));
        alert("Expense saved as draft.");
      } else {
        setShowForm(false);
        setFormData({ 
          date: getOpDateBST(), 
          description: '', 
          amount: 0, 
          fromAccountId: cashInShopAccount?.id || paymentAccounts[0]?.id || '', 
          toAccountId: categoryAccounts[0]?.id || '', 
          contactId: '', 
          reference: '' 
        });
      }
    } catch (e: any) { 
      alert(e.message || JSON.stringify(e)); 
      console.error(e); 
    } finally {
      setIsSaving(false);
    }
  };

  useEffect(() => {
    const handler = () => {
      const currentEntry = editingId ? ((store.paginatedEntries || store.entries) || []).find((e: any) => e.id === editingId) : null;
      const currentStatus = currentEntry?.status || 'POSTED';
      if (showForm && (!editingId || currentStatus === 'DRAFT')) {
        handleSave('DRAFT');
      }
    };
    window.addEventListener('smart-save-draft', handler);
    return () => window.removeEventListener('smart-save-draft', handler);
  }, [showForm, formData, editingId]);

  const [filterState, setFilterState] = useState<SmartFilterState>({
    searchQuery: '',
    startDate: getOpDateBST(),
    endDate: getOpDateBST(),
    datePreset: 'today',
    contactId: '',
    status: '',
    reference: '',
    minAmount: '',
    maxAmount: ''
  });

  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(80);

  const [columns, setColumns] = useColumns('expense_list', [
    { id: 'date', label: 'Date', visible: true },
    { id: 'reference', label: 'Reference', visible: true },
    { id: 'description', label: 'Description', visible: true },
    { id: 'category', label: 'Category', visible: true },
    { id: 'paymentMethod', label: 'Payment Method', visible: true },
    { id: 'vendor', label: 'Vendor', visible: true },
    { id: 'type', label: 'Type', visible: true },
    { id: 'amount', label: 'Amount', visible: true },
    { id: 'createdBy', label: 'Created By', visible: false }
  ]);

  useEffect(() => {
    store.fetchEntries({ limit: 1000 });
  }, [store.fetchEntries]);

  const recentExpenses = useMemo(() => {
    const query = (filterState.searchQuery || '').toLowerCase();
    return ((store.paginatedEntries || store.entries) || []).filter((e: any) => {
      const desc = String(e.description || '').toLowerCase();
      const isExpense = desc.startsWith('expense:') || e.journalType === 'EXPENSE';
      if (!isExpense) return false;
      
      const debitLine = (e.lines || []).find((l:any) => l.debit > 0);
      const amount = debitLine?.debit || 0;
      const creditLine = (e.lines || []).find((l:any) => l.credit > 0);
      const contactId = creditLine?.contactId;
      const categoryName = String((store.accounts || []).find((a:any) => a.id === debitLine?.accountId)?.name || '').toLowerCase();
      const matchesSearch = !query || String(e.description || '').toLowerCase().includes(query) || categoryName.includes(query) || String(e.reference || '').toLowerCase().includes(query);
      if (!matchesSearch) return false;

      // Advanced Filters
      if (filterState.startDate && e.date < filterState.startDate) return false;
      if (filterState.endDate && e.date > filterState.endDate) return false;
      if (filterState.contactId && contactId !== filterState.contactId) return false;
      if (filterState.status && e.status !== filterState.status) return false;
      if (filterState.reference && !String(e.reference || '').toLowerCase().includes(filterState.reference.toLowerCase())) return false;
      if (filterState.expenseType && e.expenseType !== filterState.expenseType) return false;
      
      if (filterState.minAmount && amount < parseFloat(filterState.minAmount)) return false;
      if (filterState.maxAmount && amount > parseFloat(filterState.maxAmount)) return false;

      return true;
    }).slice().reverse();
  }, [(store.paginatedEntries || store.entries), store.accounts, filterState]);

  const paginatedExpenses = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return recentExpenses.slice(start, start + pageSize);
  }, [recentExpenses, currentPage, pageSize]);

  const totalPages = Math.ceil(recentExpenses.length / pageSize);

  const handleExport = (format: 'excel' | 'pdf', scope: 'page' | 'all') => {
    const dataToExport = scope === 'page' ? paginatedExpenses : recentExpenses;
    
    const exportData = dataToExport.map((exp: any) => {
      const debitLine = (exp.lines || []).find((l:any) => l.debit > 0);
      const creditLine = (exp.lines || []).find((l:any) => l.credit > 0);
      const category = (store.accounts || []).find((a:any) => a.id === debitLine?.accountId);
      const method = (store.accounts || []).find((a:any) => a.id === creditLine?.accountId);
      const contact = (store.contacts || []).find((c:any) => c.id === creditLine?.contactId);

      return {
        Date: exp.date,
        Category: category?.name || 'Unknown',
        Method: method?.name || 'Unknown',
        Vendor: contact?.name || '-',
        Type: exp.expenseType || '-',
        Reference: exp.reference || '-',
        Description: String(exp.description || '').replace('Expense: ', ''),
        Amount: debitLine?.debit || 0,
        Status: exp.status
      };
    });

    const totalAmount = exportData.reduce((sum: number, item: any) => sum + (item.Amount || 0), 0);

    if (format === 'excel') {
      const rows = [
        ['Date', 'Category', 'Method', 'Vendor', 'Type', 'Reference', 'Description', 'Amount', 'Status'],
        ...exportData.map((item: any) => [
          item.Date,
          item.Category,
          item.Method,
          item.Vendor,
          item.Type,
          item.Reference,
          item.Description,
          item.Amount,
          item.Status
        ]),
        ['TOTAL', '', '', '', '', '', '', totalAmount, '']
      ];
      exportToXLSX(`Expenses_${getOpDateBST()}`, rows);
    } else {
      const columns = [
        { header: 'Date', dataKey: 'Date' },
        { header: 'Category', dataKey: 'Category' },
        { header: 'Method', dataKey: 'Method' },
        { header: 'Vendor', dataKey: 'Vendor' },
        { header: 'Type', dataKey: 'Type' },
        { header: 'Reference', dataKey: 'Reference' },
        { header: 'Description', dataKey: 'Description' },
        { header: 'Amount', dataKey: 'Amount', align: 'right' as const },
        { header: 'Status', dataKey: 'Status' }
      ];
      
      const pdfData = [
        ...exportData.map((item: any) => ({
          ...item,
          Amount: formatNumber(item.Amount)
        })),
        {
          Date: 'TOTAL',
          Category: '',
          Method: '',
          Vendor: '',
          Reference: '',
          Description: '',
          Amount: formatNumber(totalAmount),
          Status: ''
        }
      ];

      generatePDFReport({
        title: 'Expenses Report',
        companyName: store.currentCompany.name,
        dateRange: `${filterState.startDate || 'All Time'} to ${filterState.endDate || 'Now'}`,
        filename: `Expenses_${getOpDateBST()}`,
        printedBy: store.currentUser?.name
      }, columns, pdfData);
    }
  };

  const modal = quickVendorName && (
    <QuickContactModal 
      name={quickVendorName} 
      type={ContactType.VENDOR} 
      store={store} 
      onCancel={() => setQuickVendorName(null)} 
      onSave={c => { setFormData(prev => ({...prev, contactId: c.id})); setQuickVendorName(null); }} 
      themeColor="#f43f5e"
    />
  );

  if (showForm) {
    return (
      <>
      {modal}
      <div className="space-y-6 max-w-[98%] mx-auto p-4 lg:p-10 pb-24 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="bg-white rounded-[2.5rem] shadow-sm border border-slate-100 overflow-hidden">
          <div className="p-8 border-b bg-slate-50 flex justify-between items-center">
            <div>
              <h4 className="text-3xl font-black text-slate-800 tracking-tighter uppercase">
                {editingId ? 'Edit Expense' : 'Record New Expense'}
              </h4>
              <p className="text-slate-500 font-medium mt-1">Fill in the details to post an operational expenditure.</p>
            </div>
            <div className="flex items-center space-x-3">
              {editingId && status === 'POSTED' && onNavigate && (
                <button 
                  type="button"
                  onClick={() => {
                     onNavigate('journal', { reference: editingId });
                  }}
                  className="px-6 py-3 bg-emerald-100 text-emerald-700 font-black text-xs uppercase tracking-widest rounded-xl hover:bg-emerald-200 transition-all flex items-center"
                >
                  <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/></svg>
                  View Journal
                </button>
              )}
              <button onClick={() => { setShowForm(false); setEditingId(null); }} className="px-6 py-3 bg-slate-200 text-slate-700 font-black text-xs uppercase tracking-widest rounded-xl hover:bg-slate-300 transition-all">
                Back to List
              </button>
            </div>
          </div>
          
          <div className="p-10 grid grid-cols-1 lg:grid-cols-2 gap-12">
            <div className="space-y-8">
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <label className="block text-[10px] font-black text-slate-400 mb-2 uppercase tracking-widest">Date</label>
                  <input 
                    type="date" 
                    className="w-full px-6 py-4 bg-slate-50 border-2 border-transparent focus:border-rose-500 rounded-2xl text-sm font-black outline-none transition-all" 
                    value={formData.date || ''} 
                    onChange={e => setFormData({...formData, date: e.target.value})} 
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-400 mb-2 uppercase tracking-widest">Reference / Exp #</label>
                  <input 
                    type="text" 
                    className="w-full px-6 py-4 bg-slate-50 border-2 border-transparent focus:border-rose-500 rounded-2xl text-sm font-black outline-none transition-all" 
                    placeholder="Auto-generated if blank"
                    value={formData.reference || ''} 
                    onChange={e => setFormData({...formData, reference: e.target.value})} 
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-400 mb-2 uppercase tracking-widest">Amount (৳)</label>
                  <input 
                    type="number" 
                    className="w-full px-6 py-4 bg-slate-50 border-2 border-transparent focus:border-rose-500 rounded-2xl text-2xl font-black text-rose-600 outline-none transition-all" 
                    placeholder="0.00"
                    value={formData.amount || ''} 
                    onChange={e => setFormData({...formData, amount: parseFloat(e.target.value) || 0})} 
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Expense Category (Sub-Account)</label>
                  {!isAddingCategory && (
                    <button 
                      onClick={() => setIsAddingCategory(true)}
                      className="text-[10px] font-black text-rose-600 uppercase tracking-widest hover:text-rose-700 transition-colors flex items-center"
                    >
                      <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M12 4v16m8-8H4"/></svg>
                      Quick Add
                    </button>
                  )}
                </div>
                
                {isAddingCategory ? (
                  <div className="flex space-x-2 animate-in slide-in-from-top-2 duration-300">
                    <input 
                      autoFocus
                      type="text" 
                      className="flex-1 px-6 py-4 bg-slate-50 border-2 border-rose-200 focus:border-rose-500 rounded-2xl text-sm font-black outline-none transition-all" 
                      placeholder="New Category Name (e.g. Electricity)" 
                      value={newCategoryName}
                      onChange={e => setNewCategoryName(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') handleQuickAddCategory();
                        if (e.key === 'Escape') setIsAddingCategory(false);
                      }}
                    />
                    <button 
                      onClick={handleQuickAddCategory}
                      className="px-6 py-4 bg-rose-600 text-white font-black text-xs uppercase tracking-widest rounded-2xl hover:bg-rose-700 transition-all"
                    >
                      Save
                    </button>
                    <button 
                      onClick={() => setIsAddingCategory(false)}
                      className="px-4 py-4 bg-slate-200 text-slate-600 font-black text-xs uppercase tracking-widest rounded-2xl hover:bg-slate-300 transition-all"
                    >
                      ✕
                    </button>
                  </div>
                ) : (
                  <SearchableSelect
                    placeholder="Select an expense account..."
                    options={categoryAccounts.map((a: Account) => ({
                      id: a.id,
                      name: a.name,
                      extra: a.code,
                      category: a.parentId ? 'Sub-Account' : 'Parent'
                    }))}
                    value={formData.toAccountId}
                    onSelect={id => setFormData({...formData, toAccountId: id})}
                    themeColor="#f43f5e"
                    quickCreateLabel="Category"
                  />
                )}
                <p className="text-[10px] text-slate-400 mt-2 font-medium italic">Showing sub-accounts of Operating Expenses.</p>
              </div>

              <div>
                <label className="block text-[10px] font-black text-slate-400 mb-2 uppercase tracking-widest">Payment Source</label>
                <select 
                  className="w-full px-6 py-4 bg-slate-50 border-2 border-transparent focus:border-rose-500 rounded-2xl text-sm font-black outline-none transition-all" 
                  value={formData.fromAccountId || ''} 
                  onChange={e => setFormData({...formData, fromAccountId: e.target.value})}
                >
                  {paymentAccounts.map((a: Account) => (
                    <option key={a.id} value={a.id}>{a.code} - {a.name}</option>
                  ))}
                </select>
                <p className="text-[10px] text-slate-400 mt-2 font-medium italic">Defaulted to 'Cash in Shop' per company policy.</p>
              </div>
            </div>

            <div className="space-y-8">
              <div>
                <label className="block text-[10px] font-black text-slate-400 mb-2 uppercase tracking-widest">Vendor / Payee (Optional)</label>
                <div className="bg-slate-50 rounded-2xl px-6 py-3.5 focus-within:ring-2 focus-within:ring-rose-500 transition-all border-2 border-transparent">
                  <SearchableSelect 
                    className="w-full text-base font-black outline-none" 
                    placeholder="No specific vendor"
                    options={vendors.map((v: Contact) => ({ id: v.id, name: v.name }))}
                    value={formData.contactId} 
                    onSelect={id => setFormData({...formData, contactId: id})}
                    onFocus={store.fetchContacts}
                    onSearchChange={store.searchContactsOnDemand}
                    onQuickCreate={setQuickVendorName}
                    quickCreateLabel="Vendor / Payee"
                    emptyMessage="No vendors found..."
                    themeColor="#f43f5e"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-black text-slate-400 mb-2 uppercase tracking-widest">Description / Narrative</label>
                <textarea 
                  className="w-full px-6 py-4 bg-slate-50 border-2 border-transparent focus:border-rose-500 rounded-2xl text-sm font-black outline-none min-h-[120px] transition-all" 
                  placeholder="What was this spending for? (e.g. Monthly Rent for Shop A)" 
                  value={formData.description} 
                  onChange={e => setFormData({...formData, description: e.target.value})} 
                />
              </div>

              <div>
                <label className="block text-[10px] font-black text-slate-400 mb-2 uppercase tracking-widest">Expense Type</label>
                <select 
                  className="w-full px-6 py-4 bg-slate-50 border-2 border-transparent focus:border-rose-500 rounded-2xl text-sm font-black outline-none transition-all" 
                  value={formData.expenseType || ''} 
                  onChange={e => setFormData({...formData, expenseType: e.target.value})}
                >
                  <option value="">None / Unclassified</option>
                  <option value="MARKET">Market</option>
                  <option value="OFFICE">Office</option>
                  <option value="UTILITY">Utility</option>
                  <option value="MAINTENANCE">Maintenance</option>
                  <option value="OTHER">Other</option>
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-black text-slate-400 mb-2 uppercase tracking-widest">Reference Number</label>
                <input 
                  className="w-full px-6 py-4 bg-slate-50 border-2 border-transparent focus:border-rose-500 rounded-2xl text-sm font-black outline-none" 
                  placeholder="Auto-generated if left blank" 
                  value={formData.reference || ''} 
                  onChange={e => setFormData({...formData, reference: e.target.value})} 
                />
              </div>
            </div>
          </div>

          <div className="p-10 bg-slate-50 border-t flex justify-end items-center space-x-6">
            <button onClick={() => { setShowForm(false); setEditingId(null); }} className="text-slate-400 font-black text-xs uppercase tracking-widest hover:text-slate-700 transition-colors">Discard Changes</button>
            <div className="flex space-x-4">
              <button 
                onClick={() => handleSave('DRAFT')} 
                className="px-8 py-4 bg-white border-2 border-slate-200 text-slate-700 font-black text-xs uppercase tracking-widest rounded-2xl shadow-sm hover:border-indigo-500 hover:text-indigo-600 transition-all flex items-center"
              >
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4"/></svg>
                {editingId ? 'Update Draft' : 'Save as Draft'}
              </button>
              {editingId && store.currentUser?.roleId === 'role-admin' && (
                <button 
                  onClick={() => {
                    if (deleteConfirmId === editingId) {
                      try {
                        store.deleteJournalEntry(editingId);
                        setShowForm(false);
                        setEditingId(null);
                        setDeleteConfirmId(null);
                      } catch (error: any) {
                        alert(error.message);
                      }
                    } else {
                      setDeleteConfirmId(editingId);
                      setTimeout(() => setDeleteConfirmId(null), 3000);
                    }
                  }}
                  className="px-8 py-4 bg-rose-50 text-rose-600 font-black text-xs uppercase tracking-widest rounded-2xl shadow-sm hover:bg-rose-100 transition-all"
                >
                  {deleteConfirmId === editingId ? 'Confirm Delete' : 'Delete'}
                </button>
              )}
              {status === 'POSTED' && store.hasPermission('ledger_edit') && store.currentUser?.roleId === 'role-admin' && (
                <button 
                  onClick={() => {
                    if (window.confirm('Are you sure you want to reset this expense to draft?')) {
                      store.resetJournalEntryToDraft(editingId!).then(() => setFormData(prev => ({ ...prev, status: 'DRAFT' })));
                    }
                  }}
                  className="px-8 py-4 bg-white border-2 border-slate-200 text-amber-600 font-black text-xs uppercase tracking-widest rounded-2xl shadow-sm hover:border-amber-500 hover:text-amber-600 transition-all"
                >
                  Reset to Draft
                </button>
              )}
              <button 
                onClick={() => handleSave('POSTED')} 
                className="px-12 py-4 bg-rose-600 text-white font-black text-xs uppercase tracking-widest rounded-2xl shadow-xl shadow-rose-200 hover:bg-rose-700 active:scale-95 transition-all"
              >
                Post Expense
              </button>
              {(status === 'POSTED') && editingId && onNavigate && (
                <button 
                  type="button"
                  onClick={() => {
                     onNavigate('journal', { reference: editingId });
                  }}
                  className="px-8 py-4 bg-emerald-600 text-white font-black text-xs uppercase tracking-widest rounded-2xl shadow-xl shadow-emerald-200 hover:bg-emerald-700 active:scale-95 transition-all flex items-center"
                >
                  <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
                  View Journal
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
      </>
    );
  }

  const viewingModal = viewingExpense && (() => {
    const debitLine = (viewingExpense.lines || []).find((l:any) => l.debit > 0);
    const creditLine = (viewingExpense.lines || []).find((l:any) => l.credit > 0);
    const category = (store.accounts || []).find((a:any) => a.id === debitLine?.accountId);
    const method = (store.accounts || []).find((a:any) => a.id === creditLine?.accountId);
    const vendor = (store.contacts || []).find((c:any) => c.id === creditLine?.contactId);
    
    return (
      <div id="expense-view-overlay" className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex justify-center items-center z-50 p-4" onClick={() => setViewingExpense(null)}>
        <div className="bg-white rounded-[2rem] shadow-2xl border border-slate-100 w-full max-w-xl overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col" onClick={e => e.stopPropagation()}>
          {/* Header */}
          <div className="p-6 bg-rose-600 text-white flex justify-between items-center">
            <div>
              <span className="text-[10px] font-black uppercase tracking-widest bg-rose-500/50 px-2 py-1 rounded text-white inline-block mb-1 font-mono">
                {viewingExpense.status === 'DRAFT' ? 'DRAFT EXPENSE' : 'POSTED EXPENSE'}
              </span>
              <h4 className="text-xl font-bold tracking-tight">Expense Invoice</h4>
            </div>
            <button onClick={() => setViewingExpense(null)} className="text-white hover:text-rose-100 transition-colors">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"/></svg>
            </button>
          </div>

          {/* Content */}
          <div className="p-8 space-y-6 overflow-y-auto max-h-[75vh]">
            {/* Invoice Top Row */}
            <div className="flex justify-between items-start">
              <div>
                <p className="text-[10px] uppercase font-black tracking-widest text-slate-400">Expense ID / Reference</p>
                <p className="text-lg font-mono font-black text-rose-600">{viewingExpense.reference || 'DRAFT'}</p>
              </div>
              <div className="text-right">
                <p className="text-[10px] uppercase font-black tracking-widest text-slate-400">Transaction Date</p>
                <p className="text-sm font-bold text-slate-700">{viewingExpense.date}</p>
              </div>
            </div>

            <hr className="border-slate-100" />

            {/* Vendor & Company Details */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-[10px] uppercase font-black tracking-widest text-slate-400 mb-1">Company</p>
                <p className="text-sm font-black text-slate-800">{store.currentCompany?.name}</p>
                <p className="text-xs text-slate-500">{store.currentCompany?.address || 'Dhaka, Bangladesh'}</p>
              </div>
              <div className="text-right">
                <p className="text-[10px] uppercase font-black tracking-widest text-slate-400 mb-1">Payee / Vendor</p>
                <p className="text-sm font-black text-slate-800">{vendor?.name || 'Miscellaneous Vendor'}</p>
                {vendor?.phone && <p className="text-xs text-slate-500">{vendor.phone}</p>}
                {vendor?.email && <p className="text-xs text-slate-500">{vendor.email}</p>}
              </div>
            </div>

            <div className="bg-slate-50 rounded-2xl p-6 space-y-4 border border-slate-100">
              {/* Items row */}
              <div className="flex justify-between text-xs text-slate-400 font-extrabold uppercase tracking-wider border-b border-slate-200/60 pb-2">
                <span>Description & Account Category</span>
                <span className="text-right">Total Amount</span>
              </div>
              <div className="flex justify-between items-start py-1">
                <div className="space-y-1">
                  <p className="text-sm font-black text-slate-800">{String(viewingExpense.description || '').replace('Expense: ', '')}</p>
                  <p className="text-xs text-slate-500 flex items-center flex-wrap gap-y-1">
                    <span className="px-2 py-0.5 bg-rose-50 text-rose-600 rounded mr-2 font-bold text-[10px]">{category?.name || 'Operating Expenses'}</span>
                    <span className="text-slate-400">Source:</span>
                    <span className="font-semibold text-slate-600 ml-1">{method?.name || 'Cash'}</span>
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-base font-black text-rose-600 tabular-nums">{formatBDT(debitLine?.debit || 0)}</p>
                </div>
              </div>
            </div>

            {/* Preparation Details */}
            <hr className="border-slate-100" />
            <div className="flex justify-between items-center text-xs text-slate-400 bg-slate-50/50 p-3 rounded-lg border border-slate-100">
              <span className="font-medium">Prepared By: <strong className="text-slate-700 font-black">{store.resolveUserName(viewingExpense.createdById) || viewingExpense.preparedBy || '-'}</strong></span>
              {viewingExpense.updated_at && (
                <span className="font-medium">Updated: <strong className="text-slate-700 font-semibold">{new Date(viewingExpense.updated_at).toLocaleDateString()}</strong></span>
              )}
            </div>

            {/* Vouchers Signature Board */}
            <div className="grid grid-cols-3 gap-4 pt-4 border-t border-slate-200 border-dashed text-center">
              <div>
                <div className="h-8 border-b border-slate-200"></div>
                <p className="text-[8px] font-black uppercase tracking-wider text-slate-400 mt-1">Prepared By</p>
              </div>
              <div>
                <div className="h-8 border-b border-slate-200"></div>
                <p className="text-[8px] font-black uppercase tracking-wider text-slate-400 mt-1">Verified By</p>
              </div>
              <div>
                <div className="h-8 border-b border-slate-200"></div>
                <p className="text-[8px] font-black uppercase tracking-wider text-slate-400 mt-1">Approved By</p>
              </div>
            </div>
          </div>

          {/* Footer controls */}
          <div className="p-6 bg-slate-50 border-t border-slate-100 flex justify-between items-center">
            {viewingExpense.status === 'DRAFT' ? (
              <button 
                onClick={() => {
                  setFormData({
                    date: viewingExpense.date,
                    description: String(viewingExpense.description || '').replace('Expense: ', ''),
                    amount: debitLine?.debit || 0,
                    fromAccountId: creditLine?.accountId || '',
                    toAccountId: debitLine?.accountId || '',
                    contactId: creditLine?.contactId || '',
                    reference: viewingExpense.reference || ''
                  });
                  setEditingId(viewingExpense.id);
                  setViewingExpense(null);
                  setShowForm(true);
                }}
                className="px-6 py-2.5 bg-amber-500 hover:bg-amber-600 text-white font-black text-xs uppercase tracking-widest rounded-xl transition-all shadow-md shadow-amber-100"
              >
                Edit Draft
              </button>
            ) : (
              <div />
            )}
            <div className="flex space-x-3">
              <button 
                onClick={() => {
                  generateExpensePDF({
                    expense: { ...viewingExpense, amount: debitLine?.debit || 0 },
                    category,
                    paymentMethod: method,
                    vendor,
                    company: store.currentCompany,
                    printedBy: store.currentUser?.name
                  });
                }}
                className="px-6 py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-black text-xs uppercase tracking-widest rounded-xl transition-all shadow-md shadow-rose-100 flex items-center"
              >
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
                PDF
              </button>
              {viewingExpense.status === 'POSTED' && onNavigate && (
                <button 
                  onClick={() => {
                     setViewingExpense(null);
                     onNavigate('journal', { reference: viewingExpense.id });
                  }}
                  className="px-6 py-2.5 bg-emerald-100 text-emerald-700 font-black text-xs uppercase tracking-widest rounded-xl hover:bg-emerald-200 transition-all flex items-center shadow-sm"
                >
                  <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/></svg>
                  View Journal
                </button>
              )}
              <button onClick={() => setViewingExpense(null)} className="px-6 py-2.5 bg-slate-200 text-slate-700 font-black text-xs uppercase tracking-widest rounded-xl hover:bg-slate-300 transition-all">
                Close
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  })();

  return (
    <>
    {modal}
    {viewingModal}
    <div className="space-y-6 max-w-[98%] mx-auto p-4 lg:p-10 pb-24 animate-in fade-in duration-500">
      <SmartFilterBar 
        title={
          <div className="flex flex-col">
            <h3 className="text-xl font-black text-slate-800 uppercase tracking-tighter">Expense Hub</h3>
          </div>
        }
        actions={
          <>
            <button onClick={() => setShowForm(true)} className="px-6 py-2 bg-rose-600 text-white font-black text-xs uppercase tracking-widest rounded-lg shadow-md hover:bg-rose-700 active:scale-95 flex items-center shrink-0">
              <svg className="w-3 h-3 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M12 4v16m8-8H4"/></svg>
              Record Expense
            </button>
            <ExportButtons onExport={handleExport} />
          </>
        }
        filters={filterState} customFields={[
          { id: 'expenseType', label: 'Expense Flow', type: 'selection', options: [{ id: 'DIRECT', label: 'Direct Expense' }, { id: 'INDIRECT', label: 'Indirect Expense' }] }
        ]} 
        setFilters={(newFilters) => {
          setFilterState(newFilters);
          setCurrentPage(1);
        }} 
        contacts={store.contacts || []}
        users={store.users || []}
        statuses={[
          { id: 'DRAFT', label: 'Draft' },
          { id: 'POSTED', label: 'Posted' },
        ]}
        type="expense"
        placeholder="Search by Description, Category, Reference..."
      />

      <div className="bg-white rounded-[2.5rem] shadow-sm border border-slate-100 overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50/50 border-b border-slate-100">
              {columns.find(c => c.id === 'date')?.visible && <th className="px-8 py-6 text-[10px] font-black text-slate-400 uppercase tracking-widest">Date</th>}
              {columns.find(c => c.id === 'reference')?.visible && <th className="px-8 py-6 text-[10px] font-black text-slate-400 uppercase tracking-widest">Reference</th>}
              {columns.find(c => c.id === 'category')?.visible && <th className="px-8 py-6 text-[10px] font-black text-slate-400 uppercase tracking-widest">Category</th>}
              {columns.find(c => c.id === 'paymentMethod')?.visible && <th className="px-8 py-6 text-[10px] font-black text-slate-400 uppercase tracking-widest">Payment Source</th>}
              {columns.find(c => c.id === 'vendor')?.visible && <th className="px-8 py-6 text-[10px] font-black text-slate-400 uppercase tracking-widest">Vendor</th>}
              {columns.find(c => c.id === 'type')?.visible && <th className="px-8 py-6 text-[10px] font-black text-slate-400 uppercase tracking-widest">Type</th>}
              {columns.find(c => c.id === 'description')?.visible && <th className="px-8 py-6 text-[10px] font-black text-slate-400 uppercase tracking-widest">Description</th>}
              {columns.find(c => c.id === 'amount')?.visible && <th className="px-8 py-6 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Amount</th>}
              {columns.find(c => c.id === 'createdBy')?.visible && <th className="px-8 py-6 text-[10px] font-black text-slate-400 uppercase tracking-widest">Created By</th>}
              <th className="px-8 py-6 text-right w-10">
                <ColumnSelector columns={columns} onChange={setColumns} />
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {paginatedExpenses.length === 0 ? (
              <tr>
                <td colSpan={columns.filter(c => c.visible).length + 1} className="px-8 py-20 text-center text-slate-400 font-medium italic">No expenses found matching your filters.</td>
              </tr>
            ) : (
              paginatedExpenses.map((exp: any) => {
                const debitLine = (exp.lines || []).find((l:any) => l.debit > 0);
                const creditLine = (exp.lines || []).find((l:any) => l.credit > 0);
                const category = (store.accounts || []).find((a:any) => a.id === debitLine?.accountId);
                const method = (store.accounts || []).find((a:any) => a.id === creditLine?.accountId);
                
                return (
                  <tr 
                    key={exp.id} 
                    className="hover:bg-slate-50/80 transition-all group cursor-pointer" 
                    onClick={() => {
                      setViewingExpense(exp);
                    }}
                  >
                    {columns.find(c => c.id === 'date')?.visible && <td className="px-8 py-6">
                      <div className="flex flex-col">
                        <span className="text-sm font-black text-slate-700">{exp.date}</span>
                        {exp.status === 'DRAFT' && <span className="inline-flex items-center px-2 py-0.5 rounded text-[8px] font-black bg-amber-100 text-amber-700 uppercase tracking-widest mt-1 w-fit">Draft</span>}
                      </div>
                    </td>}
                    {columns.find(c => c.id === 'reference')?.visible && <td className="px-8 py-6">
                      <span className="text-xs font-black text-slate-500">{exp.reference?.startsWith('DRAFT-') ? 'DRAFT' : exp.reference}</span>
                    </td>}
                    {columns.find(c => c.id === 'category')?.visible && <td className="px-8 py-6">
                      <span className="text-sm font-bold text-slate-700">{category?.name || 'Uncategorized'}</span>
                    </td>}
                    {columns.find(c => c.id === 'paymentMethod')?.visible && <td className="px-8 py-6">
                      <span className="px-3 py-1 bg-slate-100 text-slate-600 text-[10px] font-black uppercase rounded-lg border border-slate-200">
                        {method?.name || 'Cash'}
                      </span>
                    </td>}
                    {columns.find(c => c.id === 'vendor')?.visible && <td className="px-8 py-6 text-sm text-slate-800 font-bold max-w-[150px] truncate">
                      {(store.contacts || []).find((ct:any) => ct.id === creditLine?.contactId)?.name || '-'}
                    </td>}
                    {columns.find(c => c.id === 'type')?.visible && <td className="px-8 py-6">
                      <span className="px-2 py-1 bg-slate-50 text-slate-600 border border-slate-200 rounded text-[10px] font-black uppercase tracking-wider">{exp.expenseType || '-'}</span>
                    </td>}
                    {columns.find(c => c.id === 'description')?.visible && <td className="px-8 py-6 text-sm text-slate-500 font-medium max-w-xs truncate">
                      {String(exp.description || '').replace('Expense: ', '')}
                    </td>}
                    {columns.find(c => c.id === 'amount')?.visible && <td className="px-8 py-6 text-right font-black text-rose-600 text-lg tabular-nums">
                      {formatBDT(debitLine?.debit || 0)}
                    </td>}
                    {columns.find(c => c.id === 'createdBy')?.visible && (
                      <td className="px-8 py-6 text-sm text-slate-500">
                        {store.resolveUserName(exp.createdById) || exp.preparedBy || '-'}
                      </td>
                    )}
                    <td className="px-8 py-6 text-right" onClick={(e) => e.stopPropagation()}>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
        <Pagination 
          currentPage={currentPage} 
          totalPages={totalPages} 
          totalItems={recentExpenses.length} 
          itemsPerPage={pageSize} 
          onPageChange={setCurrentPage} 
          onItemsPerPageChange={setPageSize}
        />
      </div>
    </div>
    </>
  );
};

export default ExpenseManager;
