import { getOpDateBST } from '../constants';

import React, { useState, useMemo, useEffect } from 'react';
import { Package, Search, Tag, Save, AlertCircle, Plus, Minus, ChevronLeft, ChevronRight, History, Download, FileText, UserPlus, X, CheckCircle2, Clock, Trash2 } from 'lucide-react';
import { Product, ContactType, InventoryAdjustment, InventoryAdjustmentItem, Contact } from '../types';
import { generateInventoryAdjustmentPDF } from '../services/pdfService';
import { SmartSearch } from './SmartFilterBar';
import ColumnSelector, { useColumns, ColumnDef } from './ColumnSelector';
import Pagination from './Pagination';

interface InventoryAdjustmentManagerProps {
  store: any;
}

const InventoryAdjustmentManager: React.FC<InventoryAdjustmentManagerProps> = ({ store }) => {
  const [search, setSearch] = useState('');
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedBrands, setSelectedBrands] = useState<string[]>([]);
  const [adjustments, setAdjustments] = useState<{ [id: string]: { newQty: number; reason: string } }>({});
  const [selectedContactId, setSelectedContactId] = useState<string>('');
  const [editingAdjustmentId, setEditingAdjustmentId] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(80);
  const [showHistory, setShowHistory] = useState(false);
  const [showQuickEmployee, setShowQuickEmployee] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [newEmployeeName, setNewEmployeeName] = useState('');
  const [newEmployeeEmail, setNewEmployeeEmail] = useState('');
  const [showConfirm, setShowConfirm] = useState<{ show: boolean; title: string; message: string; onConfirm: () => void } | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  const [columns, setColumns] = useColumns('inventory_adjustment_list', [
    { id: 'product', label: 'Product', visible: true },
    { id: 'sku', label: 'Internal Reference', visible: true },
    { id: 'category', label: 'Category', visible: true },
    { id: 'brand', label: 'Brand', visible: true },
    { id: 'onHand', label: 'On Hand', visible: true },
    { id: 'newQty', label: 'New Quantity', visible: true },
    { id: 'difference', label: 'Difference', visible: true },
    { id: 'reason', label: 'Reason', visible: true },
  ]);

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const products = store.products || [];
  const contacts = store.contacts || [];
  const inventoryAdjustments = store.inventoryAdjustments;
  const activeCompany = store.activeCompanies[0];

  useEffect(() => {
    setCurrentPage(1);
  }, [search, selectedCategories, selectedBrands]);

  const categories = useMemo(() => {
    const cats = new Set<string>();
    products.forEach((p: Product) => { if (p.category) cats.add(p.category); });
    return Array.from(cats).sort();
  }, [products]);

  const brands = useMemo(() => {
    const bnds = new Set<string>();
    products.forEach((p: Product) => { if (p.brand) bnds.add(p.brand); });
    return Array.from(bnds).sort();
  }, [products]);

  const filtered = useMemo(() => {
    return products.filter((p: Product) => {
      const query = (search || '').toLowerCase();
      const matchesSearch = String(p.name || '').toLowerCase().includes(query) || 
                            String(p.sku || '').toLowerCase().includes(query) ||
                            String(p.category || '').toLowerCase().includes(query) ||
                            String(p.brand || '').toLowerCase().includes(query);
      const matchesCategory = selectedCategories.length === 0 || (p.category && selectedCategories.includes(p.category));
      const matchesBrand = selectedBrands.length === 0 || (p.brand && selectedBrands.includes(p.brand));
      return matchesSearch && matchesCategory && matchesBrand;
    });
  }, [products, search, selectedCategories, selectedBrands]);

  const totalPages = useMemo(() => {
    if (pageSize === -1) return 1;
    return Math.ceil(filtered.length / pageSize);
  }, [filtered, pageSize]);

  const paginatedProducts = useMemo(() => {
    if (pageSize === -1) return filtered;
    const start = (currentPage - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, currentPage, pageSize]);

  const getPageNumbers = () => {
    const pages = [];
    const maxButtons = 5;
    let startPage = Math.max(1, currentPage - Math.floor(maxButtons / 2));
    let endPage = startPage + maxButtons - 1;

    if (endPage > totalPages) {
      endPage = totalPages;
      startPage = Math.max(1, endPage - maxButtons + 1);
    }

    for (let i = startPage; i <= endPage; i++) {
      pages.push(i);
    }
    return pages;
  };

  const handleQtyChange = (id: string, currentQty: number, delta: number) => {
    const adj = adjustments[id] || { newQty: currentQty, reason: 'Inventory Adjustment' };
    setAdjustments({
      ...adjustments,
      [id]: { ...adj, newQty: Math.max(0, adj.newQty + delta) }
    });
  };

  const handleManualQtyChange = (id: string, val: string) => {
    const num = parseFloat(val) || 0;
    const adj = adjustments[id] || { newQty: num, reason: 'Inventory Adjustment' };
    setAdjustments({
      ...adjustments,
      [id]: { ...adj, newQty: Math.max(0, num) }
    });
  };

  const handleReasonChange = (id: string, reason: string) => {
    const adj = adjustments[id] || { newQty: products.find((p: Product) => p.id === id)?.quantityOnHand || 0, reason: '' };
    setAdjustments({
      ...adjustments,
      [id]: { ...adj, reason }
    });
  };

  const handleQuickEmployeeSave = async () => {
    if (!newEmployeeName) return showToast('Employee name is required', 'error');
    try {
      const newContact = await store.addContact({
        name: newEmployeeName,
        email: newEmployeeEmail,
        type: ContactType.EMPLOYEE,
        status: 'ACTIVE'
      });
      setSelectedContactId(newContact.id);
      setShowQuickEmployee(false);
      setNewEmployeeName('');
      setNewEmployeeEmail('');
      showToast('Employee added successfully', 'success');
    } catch (error) {
      console.error('Failed to add employee:', error);
      showToast('Failed to add employee', 'error');
    }
  };

  const handleSave = async (status: 'DRAFT' | 'POSTED') => {
    const canCreate = store.hasPermission('inventory_adjustment_create');
    const canEdit = store.hasPermission('inventory_adjustment_edit');
    
    if (!editingAdjustmentId && !canCreate) {
      return showToast('You do not have permission to create inventory adjustments.', 'error');
    }
    if (editingAdjustmentId && !canEdit) {
      return showToast('You do not have permission to edit inventory adjustments.', 'error');
    }
    const finalItems: InventoryAdjustmentItem[] = Object.keys(adjustments).map(id => {
      const product = products.find((p: Product) => p.id === id);
      return {
        productId: id,
        productName: product?.name || 'Unknown',
        sku: product?.sku || '',
        brand: product?.brand,
        currentQty: (store.activeCompanyIds?.length === 1 ? (product.stockLevels?.[store.activeCompanyIds[0]] || 0) : (product.quantityOnHand || 0)) || 0,
        newQty: adjustments[id].newQty,
        difference: adjustments[id].newQty - ((store.activeCompanyIds?.length === 1 ? (product.stockLevels?.[store.activeCompanyIds[0]] || 0) : (product.quantityOnHand || 0)) || 0),
        reason: adjustments[id].reason
      };
    }).filter(item => item.difference !== 0);
    
    if (finalItems.length === 0) return showToast('No adjustments made', 'info');
    if (!selectedContactId) return showToast('Responsible Employee is mandatory.', 'error');
    
    try {
      if (editingAdjustmentId) {
        await store.updateInventoryAdjustment(editingAdjustmentId, {
          contactId: selectedContactId,
          items: finalItems,
          status: status
        });
        
        if (status === 'POSTED') {
          await store.postInventoryAdjustment(editingAdjustmentId);
        }
      } else {
        const nextNumber = store.generateNextNumber('ADJUSTMENT', getOpDateBST());
        
        const adjustment = await store.addInventoryAdjustment({
          number: nextNumber,
          date: getOpDateBST(),
          contactId: selectedContactId,
          items: finalItems,
          status: status,
          notes: ''
        });

        if (status === 'POSTED') {
          await store.postInventoryAdjustment(adjustment);
        }
      }
      
      showToast(`Inventory adjustment ${status === 'DRAFT' ? 'saved as draft' : 'posted'} successfully`, 'success');
      setAdjustments({});
      setEditingAdjustmentId(null);
      setSelectedContactId('');
      if (status === 'POSTED') setShowHistory(true);
    } catch (error) {
      console.error('Failed to save adjustment:', error);
      showToast('Failed to save adjustment. Please try again.', 'error');
    }
  };

  const handleEditDraft = (adj: InventoryAdjustment) => {
    const newAdjustments: { [id: string]: { newQty: number; reason: string } } = {};
    adj.items.forEach(item => {
      newAdjustments[item.productId] = {
        newQty: item.newQty,
        reason: item.reason || ''
      };
    });
    setAdjustments(newAdjustments);
    setSelectedContactId(adj.contactId);
    setEditingAdjustmentId(adj.id);
    setShowHistory(false);
  };

  const handleDownloadPDF = (adj: InventoryAdjustment) => {
    const employee = contacts.find((c: any) => c.id === adj.contactId);
    generateInventoryAdjustmentPDF(adj, activeCompany, employee, store.currentUser?.name);
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 relative">
      {/* Custom Confirmation Modal */}
      {showConfirm && (
        <div className="fixed inset-0 z-[100] bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-6">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-8 animate-in zoom-in-95 duration-200">
            <h3 className="text-lg font-black text-slate-900 mb-2">{showConfirm.title}</h3>
            <p className="text-sm text-slate-500 mb-8 leading-relaxed">{showConfirm.message}</p>
            <div className="flex space-x-3">
              <button onClick={showConfirm.onConfirm} className="flex-1 px-6 py-3 bg-indigo-600 text-white rounded-xl font-bold text-xs uppercase tracking-widest hover:bg-indigo-700 transition-all">Confirm</button>
              <button onClick={() => setShowConfirm(null)} className="flex-1 px-6 py-3 bg-slate-100 text-slate-600 rounded-xl font-bold text-xs uppercase tracking-widest hover:bg-slate-200 transition-all">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {toast && (
        <div className={`fixed top-20 right-10 z-[200] px-6 py-4 rounded-xl shadow-2xl flex items-center space-x-3 animate-in slide-in-from-right-10 duration-300 ${
          toast.type === 'success' ? 'bg-emerald-600 text-white' : 
          toast.type === 'error' ? 'bg-rose-600 text-white' : 'bg-slate-900 text-white'
        }`}>
          {toast.type === 'success' && <CheckCircle2 size={18} />}
          {toast.type === 'error' && <AlertCircle size={18} />}
          <span className="text-xs font-bold">{toast.message}</span>
        </div>
      )}
      {/* Compact Header & Filters in One Line */}
      <div className="p-2 border-b bg-white flex items-center space-x-3 sticky top-0 z-50 shadow-sm overflow-x-auto no-scrollbar">
        <div className="flex items-center space-x-2 min-w-fit pr-2 border-r border-slate-100">
          <div className="w-7 h-7 bg-emerald-500/10 rounded flex items-center justify-center">
            <Package className="text-emerald-600 w-4 h-4" />
          </div>
          <h1 className="text-[11px] font-black text-slate-800 uppercase tracking-tight whitespace-nowrap">Inventory Adjustment</h1>
        </div>

        <div className="flex-1 flex items-center space-x-2 min-w-fit">
          {!showHistory && (
            <>
              <div className="relative w-48">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" size={12} />
                <input 
                  type="text" 
                  className="w-full bg-slate-50 border border-slate-200 rounded-md pl-8 pr-2 py-1 text-[11px] font-bold text-slate-700 outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                  placeholder="Search products..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
              </div>

              <button 
                onClick={() => setShowFilters(!showFilters)}
                className={`p-1.5 rounded-md transition-all flex items-center space-x-1 ${showFilters ? 'bg-emerald-100 text-emerald-700' : 'text-slate-400 hover:bg-slate-50'}`}
                title="Advanced Filters"
              >
                <Tag size={14} />
                <span className="text-[10px] font-black uppercase tracking-widest">Filters</span>
              </button>

              {showFilters && (
                <>
                  <div className="w-32">
                    <SmartSearch 
                      label=""
                      placeholder="Categories"
                      value={selectedCategories}
                      onChange={setSelectedCategories}
                      multi={true}
                      options={categories.map(c => ({ id: c, label: c, searchKey: c }))}
                      className="!py-1 !text-[10px] !h-7"
                    />
                  </div>

                  <div className="w-32">
                    <SmartSearch 
                      label=""
                      placeholder="Brands"
                      value={selectedBrands}
                      onChange={setSelectedBrands}
                      multi={true}
                      options={brands.map(b => ({ id: b, label: b, searchKey: b }))}
                      className="!py-1 !text-[10px] !h-7"
                    />
                  </div>
                </>
              )}

              <div className="flex items-center space-x-1 min-w-fit">
                <select 
                  className="bg-slate-50 border border-slate-200 rounded-md px-2 py-1 text-[11px] font-bold text-slate-700 outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all w-40"
                  value={selectedContactId || ""}
                  onChange={e => setSelectedContactId(e.target.value)}
                >
                  <option value="">Responsible...</option>
                  {contacts.filter((c: any) => c.type === ContactType.EMPLOYEE).map((c: any) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
                <button 
                  onClick={() => setShowQuickEmployee(true)}
                  className="p-1 text-emerald-600 hover:bg-emerald-50 rounded transition-all"
                  title="Quick Create Employee"
                >
                  <UserPlus size={14} />
                </button>
              </div>
            </>
          )}
        </div>

        <div className="flex items-center space-x-1.5 border-l border-slate-100 pl-2 min-w-fit">
          <button 
            onClick={() => setShowHistory(!showHistory)}
            className={`px-2.5 py-1 rounded text-[10px] font-black uppercase tracking-widest transition-all flex items-center space-x-1 ${showHistory ? 'bg-slate-800 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`}
          >
            <History size={12} />
            <span>{showHistory ? 'Back' : 'History'}</span>
          </button>
          
          {!showHistory && (
            <>
              <button 
                onClick={() => handleSave('DRAFT')}
                className="bg-white border border-emerald-600 text-emerald-600 hover:bg-emerald-50 px-2.5 py-1 rounded text-[10px] font-black uppercase tracking-widest transition-all flex items-center space-x-1"
              >
                <FileText size={12} />
                <span>Draft</span>
              </button>
              <button 
                onClick={() => handleSave('POSTED')}
                className="bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1 rounded text-[10px] font-black uppercase tracking-widest shadow-md shadow-emerald-500/10 transition-all flex items-center space-x-1"
              >
                <Save size={12} />
                <span>Post ({Object.keys(adjustments).length})</span>
              </button>
            </>
          )}
        </div>
      </div>

      {showHistory ? (
        <div className="flex-1 overflow-hidden flex flex-col p-6">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col flex-1">
            <div className="p-4 border-b bg-slate-50 flex justify-between items-center">
              <h2 className="text-sm font-black text-slate-800 uppercase tracking-widest flex items-center">
                <History size={14} className="mr-2 text-emerald-600" /> Adjustment History
              </h2>
            </div>
            <div className="flex-1 overflow-y-auto">
              <table className="w-full text-left border-collapse">
                <thead className="sticky top-0 bg-slate-50 z-10">
                  <tr>
                    <th className="p-4 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b">Number</th>
                    <th className="p-4 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b">Date</th>
                    <th className="p-4 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b">Employee</th>
                    <th className="p-4 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b">Items</th>
                    <th className="p-4 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b">Status</th>
                    <th className="p-4 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {inventoryAdjustments.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-12 text-center">
                        <div className="flex flex-col items-center">
                          <History size={48} className="text-slate-200 mb-4" />
                          <p className="text-sm font-bold text-slate-400">No adjustment history found</p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    [...inventoryAdjustments].sort((a, b) => {
                      if (a.date !== b.date) return String(b.date || '').localeCompare(String(a.date || ''));
                      return String(b.number || '').localeCompare(String(a.number || ''), undefined, { numeric: true, sensitivity: 'base' });
                    }).map((adj: InventoryAdjustment) => {
                      const employee = contacts.find((c: any) => c.id === adj.contactId);
                      return (
                        <tr key={adj.id} className="hover:bg-slate-50 transition-colors">
                          <td className="p-4">
                            <div className="text-sm font-bold text-slate-700">{adj.number}</div>
                          </td>
                          <td className="p-4">
                            <div className="text-sm font-bold text-slate-500">{adj.date}</div>
                          </td>
                          <td className="p-4">
                            <div className="text-sm font-bold text-slate-700">{employee?.name || 'Unknown'}</div>
                          </td>
                          <td className="p-4">
                            <div className="text-xs font-bold text-slate-500">{adj.items.length} items</div>
                          </td>
                          <td className="p-4">
                            <span className={`px-2 py-1 rounded-md text-[10px] font-black uppercase tracking-widest flex items-center w-fit ${
                              adj.status === 'POSTED' ? 'bg-emerald-100 text-emerald-700' : 
                              adj.status === 'DRAFT' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-700'
                            }`}>
                              {adj.status === 'POSTED' ? <CheckCircle2 size={10} className="mr-1" /> : <Clock size={10} className="mr-1" />}
                              {adj.status}
                            </span>
                          </td>
                          <td className="p-4 text-right">
                            <div className="flex justify-end space-x-2">
                              <button 
                                onClick={() => handleDownloadPDF(adj)}
                                className="p-2 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-all"
                                title="Download PDF"
                              >
                                <Download size={18} />
                              </button>
                              {adj.status === 'DRAFT' && store.currentUser?.roleId === 'role-admin' && (
                                <button 
                                  onClick={() => {
                                    setShowConfirm({
                                      show: true,
                                      title: 'Delete Adjustment',
                                      message: 'Are you sure you want to delete this draft adjustment?',
                                      onConfirm: async () => {
                                        try {
                                          store.deleteInventoryAdjustment(adj.id);
                                          showToast('Adjustment deleted successfully', 'success');
                                          setShowConfirm(null);
                                        } catch (error: any) {
                                          showToast(error.message || 'Failed to delete adjustment', 'error');
                                        }
                                      }
                                    });
                                  }}
                                  className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all"
                                  title="Delete Adjustment"
                                >
                                  <Trash2 size={18} />
                                </button>
                              )}
                              {adj.status === 'POSTED' && store.hasPermission('inventory_adjustment_edit') && store.currentUser?.roleId === 'role-admin' && (
                                <button 
                                  onClick={() => {
                                    setShowConfirm({
                                      show: true,
                                      title: 'Reset to Draft',
                                      message: 'Reset this adjustment to draft? This will also delete the associated journal entry.',
                                      onConfirm: async () => {
                                        try {
                                          await store.resetInventoryAdjustmentToDraft(adj.id);
                                          showToast('Adjustment reset to draft successfully', 'success');
                                          setShowConfirm(null);
                                        } catch (error) {
                                          showToast('Failed to reset adjustment', 'error');
                                        }
                                      }
                                    });
                                  }}
                                  className="p-2 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-all"
                                  title="Reset to Draft"
                                >
                                  <Clock size={18} />
                                </button>
                              )}
                              {adj.status === 'DRAFT' && (
                                <>
                                  <button 
                                    onClick={() => handleEditDraft(adj)}
                                    className="p-2 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-all"
                                    title="Edit Draft"
                                  >
                                    <FileText size={18} />
                                  </button>
                                  <button 
                                    onClick={async () => {
                                      setShowConfirm({
                                        show: true,
                                        title: 'Post Adjustment',
                                        message: 'Are you sure you want to post this adjustment?',
                                        onConfirm: async () => {
                                          try {
                                            await store.postInventoryAdjustment(adj.id);
                                            showToast('Adjustment posted successfully', 'success');
                                            setShowConfirm(null);
                                          } catch (error) {
                                            showToast('Failed to post adjustment', 'error');
                                          }
                                        }
                                      });
                                    }}
                                    className="p-2 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-all"
                                    title="Post Adjustment"
                                  >
                                    <Save size={18} />
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* Removed old filter section */}
          <div className="flex-1 overflow-hidden flex flex-col">
            <div className="flex-1 overflow-y-auto">
              <table className="w-full text-left border-collapse">
                <thead className="sticky top-0 bg-slate-50 z-10">
                  <tr>
                    {columns.find(c => c.id === 'product')?.visible && <th className="p-4 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b">Product Info</th>}
                    {columns.find(c => c.id === 'onHand')?.visible && <th className="p-4 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b">Current Qty</th>}
                    {columns.find(c => c.id === 'newQty')?.visible && <th className="p-4 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b">New Qty</th>}
                    {columns.find(c => c.id === 'difference')?.visible && <th className="p-4 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b">Difference</th>}
                    {columns.find(c => c.id === 'reason')?.visible && <th className="p-4 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b">Adjustment Reason</th>}
                    <th className="p-4 text-right w-10 border-b">
                      <ColumnSelector columns={columns} onChange={setColumns} />
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {paginatedProducts.map((product: Product) => {
                    const onHand = (store.activeCompanyIds?.length === 1 ? (product.stockLevels?.[store.activeCompanyIds[0]] || 0) : (product.quantityOnHand || 0)) || 0;
                    const adj = adjustments[product.id] || { newQty: onHand, reason: 'Inventory Adjustment' };
                    const diff = (adj.newQty || 0) - onHand;
                    
                    return (
                      <tr key={product.id} className="hover:bg-slate-50/50 transition-colors group">
                        {columns.find(c => c.id === 'product')?.visible && <td className="p-4">
                          <div className="text-sm font-bold text-slate-700">{product.name}</div>
                          {columns.find(c => c.id === 'sku')?.visible && <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{product.sku}</div>}
                        </td>}
                        {columns.find(c => c.id === 'onHand')?.visible && <td className="p-4">
                          <div className="text-sm font-bold text-slate-500">{onHand}</div>
                        </td>}
                        {columns.find(c => c.id === 'newQty')?.visible && <td className="p-4">
                          <div className="flex items-center space-x-2">
                            <button 
                              onClick={() => handleQtyChange(product.id, (store.activeCompanyIds?.length === 1 ? (product.stockLevels?.[store.activeCompanyIds[0]] || 0) : (product.quantityOnHand || 0)), -1)}
                              className="w-8 h-8 bg-white border border-slate-200 rounded-lg flex items-center justify-center hover:bg-slate-50 text-slate-400 hover:text-slate-600 transition-all active:scale-90"
                            >
                              <Minus size={14} />
                            </button>
                            <input 
                              type="number" 
                              className="w-20 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-sm font-bold text-slate-700 text-center outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                              value={adj.newQty || 0}
                              onChange={e => handleManualQtyChange(product.id, e.target.value)}
                            />
                            <button 
                              onClick={() => handleQtyChange(product.id, (store.activeCompanyIds?.length === 1 ? (product.stockLevels?.[store.activeCompanyIds[0]] || 0) : (product.quantityOnHand || 0)), 1)}
                              className="w-8 h-8 bg-white border border-slate-200 rounded-lg flex items-center justify-center hover:bg-slate-50 text-slate-400 hover:text-slate-600 transition-all active:scale-90"
                            >
                              <Plus size={14} />
                            </button>
                          </div>
                        </td>}
                        {columns.find(c => c.id === 'difference')?.visible && <td className="p-4">
                          <div className={`text-sm font-black ${diff > 0 ? 'text-emerald-600' : diff < 0 ? 'text-rose-600' : 'text-slate-300'}`}>
                            {diff > 0 ? `+${(diff || 0).toFixed(2)}` : (diff || 0).toFixed(2)}
                          </div>
                        </td>}
                        {columns.find(c => c.id === 'reason')?.visible && <td className="p-4">
                          <input 
                            type="text" 
                            className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2 text-xs font-bold text-slate-600 outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                            placeholder="Reason for adjustment..."
                            value={adj.reason || ''}
                            onChange={e => handleReasonChange(product.id, e.target.value)}
                          />
                        </td>}
                        <td className="p-4"></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination Section */}
            <div className="border-t">
              <Pagination 
                currentPage={currentPage} 
                totalPages={totalPages} 
                totalItems={filtered.length} 
                itemsPerPage={pageSize} 
                onPageChange={setCurrentPage} 
                onItemsPerPageChange={setPageSize}
              />
            </div>

            <div className="p-4 bg-emerald-50 border-t border-emerald-100 flex items-center space-x-3 text-emerald-700">
              <AlertCircle size={16} className="flex-shrink-0" />
              <span className="text-[10px] font-black uppercase tracking-widest">
                Important: All inventory adjustments are permanently logged in the product history. Ensure you have selected the correct responsible employee before posting.
              </span>
            </div>
          </div>
        </>
      )}

      {/* Quick Employee Modal */}
      {showQuickEmployee && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="p-6 border-b flex justify-between items-center bg-slate-50">
              <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest flex items-center">
                <UserPlus size={16} className="mr-2 text-emerald-600" /> Quick Create Employee
              </h3>
              <button onClick={() => setShowQuickEmployee(false)} className="text-slate-400 hover:text-slate-600">
                <X size={20} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Full Name</label>
                <input 
                  type="text" 
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                  placeholder="e.g. John Doe"
                  value={newEmployeeName}
                  onChange={e => setNewEmployeeName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Email (Optional)</label>
                <input 
                  type="email" 
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                  placeholder="john@example.com"
                  value={newEmployeeEmail}
                  onChange={e => setNewEmployeeEmail(e.target.value)}
                />
              </div>
            </div>
            <div className="p-6 bg-slate-50 border-t flex justify-end space-x-3">
              <button 
                onClick={() => setShowQuickEmployee(false)}
                className="px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest text-slate-500 hover:bg-slate-100 transition-all"
              >
                Cancel
              </button>
              <button 
                onClick={handleQuickEmployeeSave}
                className="bg-emerald-600 hover:bg-emerald-500 text-white px-8 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest shadow-lg shadow-emerald-500/20 transition-all"
              >
                Create Employee
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default InventoryAdjustmentManager;
