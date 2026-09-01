import React, { useState, useMemo, useEffect, useRef } from 'react';
import {  Contact, ContactType, Invoice, Bill, Payment, JournalLine } from '../types';
import { formatBDT, formatDateTime, exportToXLSX, exportToPDF as exportToPDFUtil, getOpDateBST, generateUUID } from '../constants';
import SmartFilterBar, { SmartFilterState } from './SmartFilterBar';
import Chatter from './Chatter';
import ExportButtons from './ExportButtons';
import Pagination from './Pagination';
import ColumnSelector, { useColumns, ColumnDef } from './ColumnSelector';
import { generatePaymentPDF, generatePDFReport } from '../services/pdfService';
import SearchableSelect from './SearchableSelect';
import { supabase } from '../lib/supabase';

/**
 * ADVANCED ODOO 19 ENTERPRISE PAYMENT MODEL
 * 
 * class AccountPayment(models.Model):
 *     _name = "account.payment"
 *     _description = "Payments"
 * 
 *     amount = fields.Monetary(currency_field='currency_id', tracking=True)
 *     payment_type = fields.Selection([('outbound', 'Send Money'), ('inbound', 'Receive Money')])
 *     partner_id = fields.Many2one('res.partner', string="Customer/Vendor")
 * 
 *     def action_post(self):
 *         ''' Generates the double-entry impact in account.move '''
 *         for pay in self:
 *             move_vals = pay._prepare_move_vals()
 *             move = self.env['account.move'].create(move_vals)
 *             move.action_post()
 *             pay.state = 'posted'
 */

const PAYMENT_METHODS = [
  { id: 'CASH', label: 'Cash', icon: '💵' },
  { id: 'BANK', label: 'Bank Transfer', icon: '🏦' },
];

interface PaymentManagerProps {
  store: any;
  defaultCreate?: boolean;
  initialSearch?: string | null;
  onClearSearch?: () => void;
  onNavigate?: (tab: string, filter?: any, ctx?: any) => void;
}

const PaymentManager: React.FC<PaymentManagerProps> = ({ store, defaultCreate, initialSearch, onClearSearch, onNavigate }) => {
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
  const isSavingRef = useRef(false);
  const printRef = useRef<HTMLDivElement>(null);
  
  // Odoo Form State
  const [type, setType] = useState<'RECEIPT' | 'PAYMENT'>('RECEIPT');
  const [partnerId, setPartnerId] = useState('');
  const [amount, setAmount] = useState(0);
  const [date, setDate] = useState(getOpDateBST());
  const [memo, setMemo] = useState('');
  const [method, setMethod] = useState<'CASH' | 'BANK'>('BANK');
  const [paymentCategory, setPaymentCategory] = useState('');
  const [allocations, setAllocations] = useState<Record<string, number>>({});
  const [salesperson, setSalesperson] = useState('');

  const currentPayment = useMemo(() => editingId ? (store.payments || []).find((p: Payment) => p.id === editingId) : null, [editingId, store.payments]);
  const status = currentPayment?.status || 'DRAFT';
  const isEditable = (!editingId && store.hasPermission('payment_create')) || (editingId && status === 'DRAFT' && store.hasPermission('payment_edit'));

  const [filterState, setFilterState] = useState<SmartFilterState>({
    searchQuery: initialSearch || '',
    startDate: (() => {
      const d = new Date();
      d.setDate(d.getDate() - 30);
      return d.toISOString().split('T')[0];
    })(),
    endDate: getOpDateBST(),
    datePreset: 'last30',
    contactId: '',
    status: '',
    reference: '',
    minAmount: '',
    maxAmount: ''
  });

  useEffect(() => {
    let active = true;
    if (initialSearch) {
      setFilterState(prev => ({ ...prev, searchQuery: initialSearch, datePreset: 'all' }));
      
      const searchUpper = initialSearch.toUpperCase();
      const exactMatch = store.payments?.find((p: any) => p.number === initialSearch || p.reference === initialSearch || p.id === initialSearch || p.id?.toUpperCase() === searchUpper);
      if (exactMatch && !editingId) {
          setEditingId(exactMatch.id);
          if (onClearSearch) onClearSearch();
      } else if (!editingId) {
          const fetchAndSelect = async () => {
            try {
              const { data, error } = await supabase.from('docs_payments')
                .select('*')
                .or(`id.eq.${initialSearch},payment_number.eq.${initialSearch},reference.eq.${initialSearch}`)
                .maybeSingle();
              
              if (!active) return;

              if (data) {
                setEditingId(data.id);
              }
              if (onClearSearch) onClearSearch();
            } catch (e) {
              console.error("Failed to select payment statically:", e);
              if (!active) return;
              if (onClearSearch) onClearSearch();
            }
          };
          fetchAndSelect();
      }
    }
    return () => { active = false; };
  }, [initialSearch, store.payments]);

  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(80);

  const [columns, setColumns] = useColumns('payment_list', [
    { id: 'reference', label: 'Reference', visible: true },
    { id: 'date', label: 'Date & Time', visible: true },
    { id: 'partner', label: 'Partner', visible: true },
    { id: 'journal', label: 'Journal', visible: true },
    { id: 'amount', label: 'Amount', visible: true },
    { id: 'status', label: 'Status', visible: true },
    { id: 'type', label: 'Type', visible: true },
    { id: 'paymentCategory', label: 'Category', visible: true },
    { id: 'createdBy', label: 'Created By', visible: false }
  ]);

  const availableCustomFields = useMemo(() => [
    { id: 'number', label: 'Reference', type: 'text' as const },
    { id: 'date', label: 'Date', type: 'date' as const },
    { id: 'contactId', label: 'Partner', type: 'selection' as const, options: (store.contacts || []).map((c:any) => ({ id: c.id, label: c.name })) },
    { id: 'method', label: 'Payment Method', type: 'selection' as const, options: [
      { id: 'CASH', label: 'Cash' },
      { id: 'BANK', label: 'Bank Transfer' },
    ]},
    { id: 'amount', label: 'Amount', type: 'number' as const },
    { id: 'status', label: 'Status', type: 'selection' as const, options: [
      { id: 'DRAFT', label: 'Draft' },
      { id: 'POSTED', label: 'Posted' },
      { id: 'VOID', label: 'Void' },
    ]},
    { id: 'type', label: 'Payment Type', type: 'selection' as const, options: [
      { id: 'RECEIPT', label: 'Receipt' },
      { id: 'PAYMENT', label: 'Payment' },
    ]},
    { id: 'paymentCategory', label: 'Category', type: 'text' as const },
  ], [store.contacts]);

  const filteredPayments = useMemo(() => {
    const query = (filterState.searchQuery || '').toLowerCase();
    return (store.payments || []).filter((pay: Payment) => {
      // Soft Delete Filter
      if (pay.status === 'DELETED' && !filterState.showDeleted) return false;
      if (pay.status !== 'DELETED' && filterState.showDeleted) return false;

      // 1. Basic Search
      const partnerName = (store.contacts || []).find((c: any) => c.id === pay.contactId)?.name?.toString().toLowerCase() || '';
      const matchesSearch = !query || String(pay.number || '').toLowerCase().includes(query) || String(pay.reference || '').toLowerCase().includes(query) || partnerName.includes(query);
      if (!matchesSearch) return false;

      // 2. Advanced Filters
      if (filterState.startDate && pay.date < filterState.startDate) return false;
      if (filterState.endDate && pay.date > filterState.endDate) return false;
      if (filterState.contactId && pay.contactId !== filterState.contactId) return false;
      if (filterState.status && pay.status !== filterState.status) return false;
      if (filterState.type && pay.type !== filterState.type) return false;
      if (filterState.reference && !String(pay.reference || '').toLowerCase().includes(filterState.reference.toLowerCase())) return false;
      if (filterState.paymentCategory && !String(pay.paymentCategory || '').toLowerCase().includes(String(filterState.paymentCategory).toLowerCase())) return false;
      
      if (filterState.minAmount && pay.amount < parseFloat(filterState.minAmount)) return false;
      if (filterState.maxAmount && pay.amount > parseFloat(filterState.maxAmount)) return false;

      return true;
    });
  }, [store.payments, store.contacts, filterState]);

  const paginatedPayments = useMemo(() => {
    const sorted = filteredPayments.sort((a, b) => {
      if (a.date !== b.date) return String(b.date || '').localeCompare(String(a.date || ''));
      const numA = a.number || a.reference || '';
      const numB = b.number || b.reference || '';
      return String(numB || '').localeCompare(String(numA || ''), undefined, { numeric: true, sensitivity: 'base' });
    });
    const start = (currentPage - 1) * pageSize;
    return sorted.slice(start, start + pageSize);
  }, [filteredPayments, currentPage, pageSize]);

  const totalPages = Math.ceil(filteredPayments.length / pageSize);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [filterState]);

  const handleResetToDraft = async () => {
    if (editingId) {
      try {
        await store.resetPaymentToDraft(editingId);
        window.dispatchEvent(new CustomEvent('app-toast', { detail: { message: "Payment reset to draft.", type: 'success' } }));
      } catch (error: any) {
        window.dispatchEvent(new CustomEvent('app-toast', { detail: { message: error.message, type: 'error' } }));
      }
    }
  };

  // Odoo compute: partner balance
  const partnerBalance = useMemo(() => partnerId ? store.getPartnerBalance(partnerId) : 0, [partnerId, store.entries]);

  // Handle auto-create from quick actions
  useEffect(() => {
    if (defaultCreate) {
      handleNew();
    }
  }, [defaultCreate]);

  const handleNew = () => {
    setEditingId(null);
    setPartnerId('');
    setAmount(0);
    setMemo('');
    setAllocations({});
    setPaymentCategory('');
    setSalesperson('');
    setShowForm(true);
  };

  const partners = useMemo(() => 
    (store.contacts || []).filter((c: Contact) => {
      const t = String(c.type || '').toUpperCase();
      if (type === 'RECEIPT') {
        return !c.type || t === 'CUSTOMER' || t === 'BOTH' || t === 'CASH' || t === 'CLIENT';
      }
      return !c.type || t === 'VENDOR' || t === 'BOTH' || t === 'SUPPLIER';
    }),
    [store.contacts, type]
  );

  const liquidityAccounts = useMemo(() => 
    (store.accounts || []).filter((a: any) => a.type === 'ASSET' && (a.subType === 'CASH' || a.subType === 'BANK' || (a.name || '').toLowerCase().includes('cash') || (a.name || '').toLowerCase().includes('bank'))),
    [store.accounts]
  );

  const [liquidityAccountId, setLiquidityAccountId] = useState('');

  // Reconciliation Logic
  const openDocuments = useMemo(() => {
    if (!partnerId) return [];
    if (type === 'RECEIPT') {
      return (store.invoices || []).filter((inv: Invoice) => inv.customerId === partnerId && ['POSTED', 'PARTIAL', 'PARTIAL_REFUNDED', 'IN_PAYMENT'].includes(inv.status))
        .map(inv => {
          const cTotal = (store.creditNotes || []).filter((cn: any) => 
            (cn.status === 'POSTED' || cn.status === 'CLOSED') && (
              cn.originInvoiceId === inv.id || 
              (cn.appliedInvoices || []).some((a: any) => a.invoiceId === inv.id)
            )
          ).reduce((s: number, cn: any) => {
            if (cn.originInvoiceId === inv.id) return s + (cn.total || 0);
            const a = (cn.appliedInvoices || []).find((ai: any) => ai.invoiceId === inv.id);
            return s + (a?.amount || 0);
          }, 0);

          const pTotal = (store.payments || []).filter((p: any) => 
            p.status === 'POSTED' && (
              p.invoiceId === inv.id || 
              (p.appliedInvoices || []).some((a: any) => a.invoiceId === inv.id)
            )
          ).reduce((s: number, p: any) => {
            const a = (p.appliedInvoices || []).find((ai: any) => ai.invoiceId === inv.id);
            if (a) return s + a.amount;
            if (p.invoiceId === inv.id) return s + p.amount;
            return s;
          }, 0);

          const remaining = Math.max(0, inv.total - cTotal - pTotal);
          return { id: inv.id, number: inv.number, date: inv.date, total: inv.total, remaining };
        }).filter(d => d.remaining > 0);
    } else {
      return (store.bills || []).filter((bill: Bill) => bill.vendorId === partnerId && ['POSTED', 'PARTIAL', 'IN_PAYMENT'].includes(bill.status))
        .map(bill => {
          const pTotal = (store.payments || []).filter((p: any) => 
            p.status === 'POSTED' && (
              p.billId === bill.id || 
              (p.appliedBills || []).some((a: any) => a.billId === bill.id)
            )
          ).reduce((s: number, p: any) => {
            const a = (p.appliedBills || []).find((ab: any) => ab.billId === bill.id);
            if (a) return s + a.amount;
            if (p.billId === bill.id) return s + p.amount;
            return s;
          }, 0);
          
          const remaining = Math.max(0, bill.total - pTotal);
          return { id: bill.id, number: bill.number, date: bill.date, total: bill.total, remaining };
        }).filter(d => d.remaining > 0);
    }
  }, [partnerId, type, store.invoices, store.bills, store.payments, store.creditNotes]);

  useEffect(() => {
    if (!liquidityAccountId && liquidityAccounts.length > 0) {
      const cash100100 = liquidityAccounts.find((a: any) => a.code === '100100');
      if (cash100100) {
        setLiquidityAccountId(cash100100.id);
      } else {
        setLiquidityAccountId(liquidityAccounts[0].id);
      }
    }
  }, [liquidityAccounts]);

  const handleConfirm = async (targetStatus: 'POSTED' | 'DRAFT' = 'POSTED') => {
    if (isSavingRef.current) return;
    if (!partnerId || amount <= 0) return alert("Please select a partner and valid amount.");
    if (!liquidityAccountId) return alert("Please select a liquidity account (Cash/Bank).");
    
    try {
      isSavingRef.current = true;
      
      const lines: JournalLine[] = [
        { id: 'liquidity', accountId: liquidityAccountId, debit: type === 'RECEIPT' ? amount : 0, credit: type === 'RECEIPT' ? 0 : amount, description: `Payment: ${memo}` },
        { id: 'partner', accountId: type === 'RECEIPT' ? (store.accounts.find((a:any) => a.code === '100201' || a.code === '100200')?.id || '100201') : (store.accounts.find((a:any) => a.code === '2100' || a.code === '200100')?.id || '2100'), contactId: partnerId, debit: type === 'RECEIPT' ? 0 : amount, credit: type === 'RECEIPT' ? amount : 0, description: `Reconciliation: ${memo}` }
      ];

      if (editingId && currentPayment) {
        if (currentPayment.journalEntryId) {
          store.updateJournalEntry(currentPayment.journalEntryId, {
            date: date,
            description: `Payment: ${memo}`,
            reference: memo,
            lines,
            status: targetStatus
          });
        }
        
        
        const existingPayment = (store.payments || []).find((p: any) => p.id === editingId) || (store.paginatedPayments || []).find((p: any) => p.id === editingId);
        
        let newMsgs = existingPayment?.messages || [];
        if (targetStatus === 'DRAFT') {
            newMsgs = [...newMsgs, {
              id: generateUUID(),
              authorId: store.currentUser?.id || 'user-1',
              body: 'Draft payment updated.',
              date: new Date().toISOString(),
              type: 'notification'
            }];
        }

        await store.updatePayment(editingId, {
          messages: newMsgs,
          contactId: partnerId,
          amount: amount,
          date: date,
          reference: memo,
          method: method,
          liquidityAccountId,
          type: type,
          paymentCategory,
          status: targetStatus,
          salesperson,
          ...(type === 'RECEIPT' ? {
            appliedInvoices: Object.entries(allocations).map(([invoiceId, amt]) => ({
              invoiceId,
              invoiceNumber: openDocuments.find(d => d.id === invoiceId)?.number || invoiceId,
              amount: amt,
              remaining: (openDocuments.find(d => d.id === invoiceId)?.remaining || 0) - Number(amt)
            }))
          } : {
            appliedBills: Object.entries(allocations).map(([billId, amt]) => ({
              billId,
              billNumber: openDocuments.find(d => d.id === billId)?.number || billId,
              amount: amt,
              remaining: (openDocuments.find(d => d.id === billId)?.remaining || 0) - Number(amt)
            }))
          })
        });

        let pay;
        if (targetStatus === 'POSTED') {
          pay = await store.postPayment({ id: editingId, status: 'POSTED' });
          const newAllocations: Record<string, number> = {};
          (pay.appliedInvoices || []).forEach((a: any) => { newAllocations[a.invoiceId] = a.amount; });
          (pay.appliedBills || []).forEach((a: any) => { newAllocations[a.billId] = a.amount; });
          setAllocations(newAllocations);
        }
        
        alert(targetStatus === 'POSTED' ? "Payment confirmed and posted." : "Draft updated.");
        return;
      }

      const pay = await store.postPayment({
        contactId: partnerId,
        amount: amount,
        date: date,
        reference: memo,
        method: method,
        liquidityAccountId,
        type: type,
        paymentCategory,
        status: targetStatus,
        salesperson,
        createdById: store.currentUser?.id || 'user-1',
        ...(type === 'RECEIPT' ? {
          appliedInvoices: Object.entries(allocations).map(([invoiceId, amt]) => ({
            invoiceId,
            invoiceNumber: openDocuments.find(d => d.id === invoiceId)?.number || invoiceId,
            amount: amt,
            remaining: (openDocuments.find(d => d.id === invoiceId)?.remaining || 0) - Number(amt)
            }))
          } : {
            appliedBills: Object.entries(allocations).map(([billId, amt]) => ({
              billId,
              billNumber: openDocuments.find(d => d.id === billId)?.number || billId,
              amount: amt,
              remaining: (openDocuments.find(d => d.id === billId)?.remaining || 0) - Number(amt)
            }))
          })
        });
      
      setEditingId(pay.id);
      const newAllocations: Record<string, number> = {};
      (pay.appliedInvoices || []).forEach((a: any) => { newAllocations[a.invoiceId] = a.amount; });
      (pay.appliedBills || []).forEach((a: any) => { newAllocations[a.billId] = a.amount; });
      setAllocations(newAllocations);

      if (pay.clearingStatus === 'PENDING') {
        alert("Payment sent to cashier for clearing.");
      } else if (targetStatus === 'DRAFT') {
        alert("Payment saved as draft.");
      } else {
        alert("Payment confirmed and posted.");
      }
    } catch (error: any) {
      console.error("handleConfirm error:", error);
      alert(error.message);
    } finally {
      isSavingRef.current = false;
    }
  };

  const handleDownloadPDF = async () => {
    if (!currentPayment) return;
    const partner = (store.contacts || []).find((c: any) => c.id === partnerId);
    const company = store.currentCompany;
    generatePaymentPDF(currentPayment, company, partner, store.currentUser?.name, partnerBalance);
    await store.updatePayment(currentPayment.id, {
      messages: [...(currentPayment.messages || []), {
        id: generateUUID(),
        authorId: store.currentUser?.id || 'user-1',
        body: `Payment ${currentPayment.number} was downloaded as PDF.`,
        date: new Date().toISOString(),
        type: 'notification'
      }]
    });
  };

  const handleExport = (format: 'excel' | 'pdf', scope: 'page' | 'all') => {
    const dataToExport = scope === 'page' ? paginatedPayments : filteredPayments;

    if (dataToExport.length === 0) return alert("No payments to export.");

    const totalAmount = dataToExport.reduce((sum, p) => sum + (p.amount || 0), 0);

    const headers = ['Reference', 'Date', 'Partner', 'Journal', 'Amount', 'Type', 'Status'];
    const rows = [
      headers,
      ...dataToExport.map(pay => {
        const partner = (store.contacts || []).find((c: any) => c.id === pay.contactId)?.name || 'N/A';
        return [
          pay.number || pay.reference || 'DRAFT',
          pay.date,
          partner,
          pay.method,
          pay.amount,
          pay.type,
          pay.status
        ];
      }),
      ['TOTAL', '', '', '', totalAmount, '', '']
    ];

    if (format === 'excel') {
      exportToXLSX('Payments', rows);
    } else {
      exportToPDFUtil('Payments', rows);
    }
  };

  useEffect(() => {
    const handler = () => {
      if (showForm && (!editingId || status === 'DRAFT')) {
        handleConfirm('DRAFT');
      }
    };
    window.addEventListener('smart-save-draft', handler);
    return () => window.removeEventListener('smart-save-draft', handler);
  }, [showForm, editingId, status, partnerId, amount, date, memo, method, type]);

  if (showForm) {
    return (
      <div className="flex flex-col h-full bg-[#F1F1F1] overflow-hidden animate-in fade-in duration-300">
        {/* Odoo Header Navigation */}
        <div className="bg-white border-b px-4 py-2 flex items-center justify-between shrink-0 shadow-sm z-10">
          <div className="flex items-center space-x-2 text-sm font-medium">
            <button onClick={() => setShowForm(false)} className="text-[#00A09D] hover:underline">Payments</button>
            <span className="text-slate-400">/</span>
            <span className="text-slate-600 font-bold">{editingId ? 'Payment Confirmed' : 'New Payment'}</span>
          </div>
          <div className="flex bg-white border rounded overflow-hidden text-[10px] font-bold uppercase tracking-widest">
             <div className={`px-5 py-2 ${status === 'DRAFT' ? 'bg-[#714B67] text-white' : 'text-slate-400 border-r'}`}>Draft</div>
             <div className={`px-5 py-2 ${status === 'POSTED' ? 'bg-[#714B67] text-white' : 'text-slate-400'}`}>Posted</div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="bg-white border-b px-4 py-2 flex items-center space-x-2 shrink-0 z-10">
          {status === 'DRAFT' && (
            <>
              <button onClick={() => handleConfirm('POSTED')} className="bg-[#714B67] text-white px-5 py-1.5 rounded-md text-sm font-bold shadow-sm hover:brightness-110">Confirm</button>
              <button onClick={() => handleConfirm('DRAFT')} className="bg-indigo-50 text-indigo-600 px-5 py-1.5 rounded-md text-sm font-bold shadow-sm hover:bg-indigo-100 flex items-center">
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4"/></svg>
                {editingId ? 'Update Draft' : 'Save Draft'}
              </button>
              {editingId && store.currentUser?.roleId === 'role-admin' && (
                <button 
                  onClick={() => {
                    if (deleteConfirmId === editingId) {
                      try {
                        store.deletePayment(editingId);
                        setShowForm(false);
                        setDeleteConfirmId(null);
                      } catch (error: any) {
                        alert(error.message);
                      }
                    } else {
                      setDeleteConfirmId(editingId);
                      setTimeout(() => setDeleteConfirmId(null), 3000);
                    }
                  }}
                  className="bg-rose-50 text-rose-600 px-5 py-1.5 rounded-md text-sm font-bold shadow-sm hover:bg-rose-100 transition-colors"
                >
                  {deleteConfirmId === editingId ? 'Confirm Delete' : 'Delete'}
                </button>
              )}
            </>
          )}
          {editingId && status === 'POSTED' && store.hasPermission('payment_edit') && store.currentUser?.roleId === 'role-admin' && (
            <button onClick={handleResetToDraft} className="bg-white border border-slate-300 text-slate-600 px-5 py-1.5 rounded-md text-sm font-bold shadow-sm hover:bg-slate-50 flex items-center">
              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
              Reset to Draft
            </button>
          )}
          {currentPayment?.journalEntryId && (
            <button 
                onClick={() => {
                    window.dispatchEvent(new CustomEvent('accounting-nav', { detail: { screen: 'JOURNAL', filter: { reference: currentPayment?.journalEntryId } } }));
                }}
                className="bg-indigo-50 text-indigo-600 px-5 py-1.5 rounded-md text-sm font-bold shadow-sm hover:bg-indigo-100 flex items-center"
            >
                <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/></svg>
                View Journal Entry
            </button>
          )}
          {editingId && (
            <button 
              onClick={handleDownloadPDF} 
              disabled={isGeneratingPDF}
              className="bg-[#714B67] text-white px-5 py-1.5 rounded-md text-sm font-bold shadow-sm hover:brightness-110 flex items-center disabled:opacity-50"
            >
              {isGeneratingPDF ? (
                <svg className="animate-spin h-4 w-4 mr-2" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
              ) : (
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
              )}
              {isGeneratingPDF ? 'Generating...' : 'Download PDF'}
            </button>
          )}
          {editingId && (
            <>
              <button 
                onClick={() => {
                  window.print();
                }} 
                className="bg-white border border-slate-300 text-slate-600 px-5 py-1.5 rounded-md text-sm font-bold shadow-sm hover:bg-slate-50 flex items-center"
              >
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"/></svg>
                Print
              </button>
              {onNavigate && (
                <button 
                  type="button"
                  onClick={() => {
                     const searchRef = currentPayment?.journalEntryId || currentPayment?.id;
                     onNavigate('journal', { reference: searchRef });
                  }}
                  className="bg-emerald-600 text-white px-5 py-1.5 rounded-md text-sm font-bold shadow-sm hover:bg-emerald-700 transition-colors flex items-center"
                >
                  <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
                  View Journal
                </button>
              )}
            </>
          )}
          <button onClick={() => setShowForm(false)} className="bg-white border text-slate-700 px-5 py-1.5 rounded-md text-sm font-bold hover:bg-slate-50">Discard</button>
        </div>

        {/* The Payment Sheet */}
        <div className="flex-1 overflow-y-auto p-4 lg:p-10">
          <div className="bg-white max-w-5xl mx-auto shadow-xl border border-slate-200 rounded-sm p-12 min-h-[700px] flex flex-col relative">
            <div className="mb-10">
              <div className="flex bg-slate-100 p-1 rounded-lg w-fit mb-6">
                <button onClick={() => setType('RECEIPT')} className={`px-4 py-1.5 text-[10px] font-black uppercase rounded-md transition-all ${type === 'RECEIPT' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500'}`}>Inbound (Receipt)</button>
                <button onClick={() => setType('PAYMENT')} className={`px-4 py-1.5 text-[10px] font-black uppercase rounded-md transition-all ${type === 'PAYMENT' ? 'bg-white text-rose-600 shadow-sm' : 'text-slate-500'}`}>Outbound (Payment)</button>
              </div>

              <div className="grid grid-cols-2 gap-x-20 gap-y-6">
                <div className="space-y-4">
                  <div className="flex items-baseline border-b border-dashed pb-1">
                    <label className="w-32 text-sm font-bold text-slate-500">{type === 'RECEIPT' ? 'Customer' : 'Vendor'}</label>
                    <div className="flex-1">
                      <SearchableSelect 
                        placeholder={type === 'RECEIPT' ? 'Select Customer...' : 'Select Vendor...'}
                        options={partners.map(p => ({
                          id: p.id,
                          name: p.name || 'Unnamed',
                          extra: `Phone: ${p.phone || ''} | ${p.email || ''} | ${p.code || ''} | ${p.companyName || ''}`.trim()
                        }))}
                        value={partnerId}
                        onSelect={setPartnerId}
                        onFocus={store.fetchContacts}
                        onSearchChange={store.searchContactsOnDemand}
                        disabled={!isEditable}
                        quickCreateLabel={type === 'RECEIPT' ? 'Customer' : 'Vendor'}
                        themeColor={type === 'RECEIPT' ? '#3b82f6' : '#f43f5e'}
                      />
                    </div>
                  </div>
                  {partnerId && (
                    <div className="ml-32 mt-2">
                       <span className={`px-3 py-1 rounded text-[10px] font-black uppercase border ${partnerBalance > 0 ? 'bg-rose-50 text-rose-600 border-rose-100' : 'bg-emerald-50 text-emerald-600 border-emerald-100'}`}>
                          Outstanding: {formatBDT(partnerBalance)}
                       </span>
                    </div>
                  )}
                  <div className="flex items-baseline border-b border-dashed pb-1">
                    <label className="w-32 text-sm font-bold text-slate-500">Amount</label>
                    <div className="flex-1 flex items-center space-x-2">
                      <input type="number" className="flex-1 bg-transparent outline-none text-2xl font-black text-slate-800" value={amount || ''} onChange={e => setAmount(parseFloat(e.target.value) || 0)} disabled={!isEditable} />
                      <span className="text-sm font-bold text-slate-400">BDT</span>
                    </div>
                  </div>
                  <div className="flex items-baseline border-b border-dashed pb-1">
                    <label className="w-32 text-sm font-bold text-slate-500">Category / Type</label>
                    <div className="flex-1">
                      <select value={paymentCategory || ""} onChange={e => setPaymentCategory(e.target.value)} className="w-full text-sm font-bold bg-transparent outline-none disabled:opacity-50" disabled={!isEditable}>
                          <option value="">None / Unclassified</option>
                          <option value="MARKET">Market</option>
                          <option value="OFFICE">Office</option>
                          <option value="UTILITY">Utility</option>
                          <option value="MAINTENANCE">Maintenance</option>
                          <option value="OTHER">Other</option>
                        </select>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="flex items-baseline border-b border-dashed pb-1">
                    <label className="w-32 text-sm font-medium text-slate-500">Date</label>
                    <input type="date" className="flex-1 bg-transparent outline-none text-sm font-bold" value={date || ''} onChange={e => setDate(e.target.value)} disabled={!isEditable} />
                  </div>
                  <div className="flex items-baseline border-b border-dashed pb-1">
                    <label className="w-32 text-sm font-medium text-slate-500">Memo</label>
                    <input type="text" className="flex-1 bg-transparent outline-none text-sm font-bold placeholder:font-normal" placeholder="Payment Reference..." value={memo || ''} onChange={e => setMemo(e.target.value)} disabled={!isEditable} />
                  </div>
                  <div className="flex items-baseline border-b border-dashed pb-1">
                    <label className="w-32 text-sm font-medium text-slate-500">Method</label>
                    <select 
                      className="flex-1 bg-transparent outline-none text-sm font-bold text-slate-800" 
                      value={method || ''} 
                      onChange={e => {
                        const newMethod = e.target.value as 'CASH' | 'BANK';
                        setMethod(newMethod);
                        // Auto-select corresponding Cash or Bank account from liquidityAccounts
                        const matched = liquidityAccounts.find((acc: any) => 
                          newMethod === 'CASH' 
                            ? (acc.subType === 'CASH' || (acc.name || '').toLowerCase().includes('cash'))
                            : (acc.subType === 'BANK' || (acc.name || '').toLowerCase().includes('bank'))
                        );
                        if (matched) {
                           setLiquidityAccountId(matched.id);
                        }
                      }}
                      disabled={!isEditable}
                    >
                      <option value="BANK">Bank Transfer (BANK)</option>
                      <option value="CASH">Cash (CASH)</option>
                    </select>
                  </div>
                  <div className="flex items-baseline border-b border-dashed pb-1">
                    <label className="w-32 text-sm font-medium text-slate-500">Journal</label>
                    <select 
                      className="flex-1 bg-transparent outline-none text-sm font-bold text-[#00A09D]" 
                      value={liquidityAccountId || ''} 
                      onChange={e => setLiquidityAccountId(e.target.value)} 
                      disabled={!isEditable}
                    >
                       <option value="">Select Account...</option>
                       {liquidityAccounts.map(acc => (
                         <option key={acc.id} value={acc.id}>{acc.name} ({acc.code})</option>
                       ))}
                    </select>
                  </div>
                  <div className="flex items-baseline border-b border-dashed pb-1">
                    <label className="w-32 text-sm font-medium text-slate-500">Salesperson</label>
                    <div className="flex-1">
                      <SearchableSelect 
                        placeholder="Select Salesperson..."
                        options={(store.contacts || [])
                          .filter((c:any) => !c.type || c.type?.toUpperCase() === 'EMPLOYEE' || c.type === ContactType.EMPLOYEE)
                          .map((emp:any) => ({
                            id: emp.id,
                            name: emp.name || 'Unnamed',
                            extra: `Phone: ${emp.phone || ''} | ${emp.email || ''} | ${emp.code || ''}`.trim()
                          }))}
                        value={(store.contacts || []).find((c:any) => c.name === salesperson && (c.type === ContactType.EMPLOYEE || c.type?.toUpperCase() === 'EMPLOYEE'))?.id || ''}
                        onSelect={id => {
                          const emp = (store.contacts || []).find((c:any) => c.id === id);
                          setSalesperson(emp?.name || '');
                        }}
                        onFocus={store.fetchContacts}
                        onSearchChange={store.searchContactsOnDemand}
                        disabled={!isEditable}
                        quickCreateLabel="Salesperson"
                        themeColor="#714B67"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-8">
              <h4 className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-4">Payment Reconciliation</h4>
              <div className="border rounded overflow-hidden">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 border-b font-bold text-slate-600">
                    <tr>
                      <th className="p-3">Reference</th>
                      <th className="p-3">Date</th>
                      <th className="p-3 text-right">Amount Due</th>
                      <th className="p-3 text-right">Amount to Pay</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y text-slate-500">
                    {openDocuments.length === 0 ? (
                      <tr><td colSpan={4} className="p-10 text-center italic text-slate-300">No open documents for this partner.</td></tr>
                    ) : openDocuments.map(doc => (
                      <tr key={doc.id}>
                        <td className="p-3 font-bold text-indigo-600">{doc.number}</td>
                        <td className="p-3">{doc.date}</td>
                        <td className="p-3 text-right tabular-nums">{formatBDT(doc.remaining)}</td>
                        <td className="p-3 text-right">
                          <input 
                            type="number" 
                            className="w-24 text-right border-b outline-none font-bold" 
                            value={allocations[doc.id] || 0} 
                            onChange={e => {
                              const val = parseFloat(e.target.value) || 0;
                              setAllocations(prev => ({ ...prev, [doc.id]: val }));
                            }}
                            disabled={!isEditable}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
             {editingId && (
               <Chatter 
                 messages={currentPayment?.messages || []} 
                 users={store.users} 
                 onSendMessage={(body) => store.updatePayment(editingId, { 
                   messages: [...(currentPayment?.messages || []), {
                     id: generateUUID(),
                     authorId: store.currentUser?.id || 'user-1',
                     body,
                     date: formatDateTime(new Date()),
                     type: 'comment'
                   }]
                 })}
                 entityType="Payment"
               />
             )}
          </div>
        </div>

        {/* SMART RECEIPT - PRINT ONLY - A5 PORTRAIT */}
        <div ref={printRef} className="print-only bg-white p-4 text-black" style={{ width: '138mm', minHeight: '200mm', margin: '0 auto', fontFamily: 'Inter, sans-serif', fontSize: '10px' }}>
          <div className="border-b border-black pb-2 mb-4 flex justify-between items-end">
            <div>
              <h1 className="text-xl font-black uppercase tracking-tighter">{status === 'POSTED' ? (type === 'RECEIPT' ? 'Money Receipt' : 'Payment Voucher') : 'Draft Voucher'}</h1>
              <p className="text-[9px] font-bold text-gray-600">{status === 'POSTED' ? (currentPayment?.number || '') : 'DRAFT'}</p>
            </div>
            <div className="text-right">
              <p className="text-sm font-black uppercase">{store.currentCompany?.name}</p>
              <p className="text-[8px] text-gray-400">{store.currentCompany?.registrationNumber}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 mb-4 text-[9px]">
            <div>
              <p className="font-bold uppercase text-[8px] text-gray-400 mb-0.5">{type === 'RECEIPT' ? 'Received From:' : 'Paid To:'}</p>
              <p className="font-black text-xs uppercase">{(store.contacts || []).find((c:any)=>c.id===partnerId)?.name}</p>
              <p className="whitespace-pre-wrap text-gray-600 leading-tight">{(store.contacts || []).find((c:any)=>c.id===partnerId)?.address}</p>
            </div>
            <div className="text-right space-y-1">
              <div className="flex justify-between">
                <span className="font-bold uppercase text-[8px] text-gray-400">Date:</span>
                <span className="font-bold">{date}</span>
              </div>
              <div className="flex justify-between">
                <span className="font-bold uppercase text-[8px] text-gray-400">Method:</span>
                <span className="font-bold uppercase">{method}</span>
              </div>
              <div className="flex justify-between">
                <span className="font-bold uppercase text-[8px] text-gray-400">Memo:</span>
                <span className="font-bold">{memo || 'N/A'}</span>
              </div>
            </div>
          </div>

          <div className="bg-gray-50 p-4 rounded border border-gray-100 mb-4">
            <div className="flex justify-between items-center">
              <span className="text-[10px] font-bold uppercase text-gray-500">Amount {type === 'RECEIPT' ? 'Received' : 'Paid'}:</span>
              <span className="text-2xl font-black text-[#714B67]">{formatBDT(amount)}</span>
            </div>
          </div>

          {Object.keys(allocations).length > 0 && (
            <div className="mb-4">
              <p className="text-[8px] font-bold uppercase text-gray-400 mb-1">Applied Documents:</p>
              <table className="w-full text-[8px] border-collapse">
                <thead>
                  <tr className="bg-gray-100 border-y border-gray-200">
                    <th className="py-1 px-2 text-left">Document</th>
                    <th className="py-1 px-2 text-right">Applied</th>
                    <th className="py-1 px-2 text-right">Remaining</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(allocations).map(([invId, amt]) => {
                    const localInv = store.invoices?.find((i: any) => i.id === invId);
                    const localBill = store.bills?.find((b: any) => b.id === invId);
                    const genericDoc = localInv || localBill;
                    const docNumber = genericDoc?.number || genericDoc?.reference || genericDoc?.billNumber || invId;
                    
                    // Best effort remaining amount
                    let postPaymentRemaining = 0;
                    if (genericDoc) {
                      const total = genericDoc.total || 0;
                      // AmountPaid from DB should roughly reflect latest
                      // But if we are looking at draft data we need to be careful
                      // We'll calculate it just like openDocuments
                      const pTotal = (store.payments || []).filter((p: any) => 
                        p.status === 'POSTED' && (
                          p.invoiceId === invId || p.billId === invId ||
                          (p.appliedInvoices || []).some((a: any) => a.invoiceId === invId) ||
                          (p.appliedBills || []).some((a: any) => a.billId === invId)
                        )
                      ).reduce((s: number, p: any) => {
                        const aInv = (p.appliedInvoices || []).find((ai: any) => ai.invoiceId === invId);
                        const aBill = (p.appliedBills || []).find((ab: any) => ab.billId === invId);
                        if (aInv) return s + aInv.amount;
                        if (aBill) return s + aBill.amount;
                        if (p.invoiceId === invId || p.billId === invId) return s + p.amount;
                        return s;
                      }, 0);
                      
                      // if the current payment is POSTED, then pTotal ALREADY includes the amt!
                      // The pdf should show the "Remaining AFTER this payment"
                      const currentIsPosted = status === 'POSTED';
                      const effectivePaid = currentIsPosted ? pTotal : pTotal + Number(amt);
                      // If it's a credit note, it reduces remaining too, but we will ignore it for this simple UI to keep UI clean
                      postPaymentRemaining = Math.max(0, total - effectivePaid);
                    }
                    
                    const amountValue = Number(amt);
                    return (
                      <tr key={invId} className="border-b border-gray-100">
                        <td className="py-1 px-2">{docNumber}</td>
                        <td className="py-1 px-2 text-right font-bold">{formatBDT(amountValue)}</td>
                        <td className="py-1 px-2 text-right text-gray-500">{formatBDT(postPaymentRemaining)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div className="border-t border-black pt-4 mb-8">
            <div className="flex justify-between items-start">
              <div className="space-y-0.5">
                <p className="text-[8px] font-bold uppercase text-gray-400">Outstanding Balance After This:</p>
                <p className="text-sm font-black text-gray-800">{formatBDT(partnerBalance)}</p>
              </div>
              <div className="text-right">
                <p className="text-[8px] font-bold uppercase text-gray-400 mb-4">Authorized Signature</p>
                <div className="w-32 border-t border-gray-300"></div>
              </div>
            </div>
          </div>

          <div className="mt-auto pt-4 border-t border-dashed border-gray-200">
            <div className="flex justify-between items-center text-[7px] text-gray-400 uppercase font-bold tracking-widest">
              <div>Salesperson: {currentPayment?.salesperson || store.resolveUserName(currentPayment?.createdById)}</div>
              <div>Generated on: {formatDateTime(new Date())}</div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-[#F1F1F1] overflow-hidden">
      <SmartFilterBar 
        title={<h2 className="text-2xl font-bold text-slate-800">Payments</h2>}
        actions={
          <>
            <button onClick={handleNew} className="bg-[#714B67] text-white px-8 py-2 rounded font-bold shadow-md hover:brightness-110 active:scale-95 transition-all">New</button>
            <ExportButtons onExport={handleExport} />
          </>
        }
        filters={filterState} 
        setFilters={setFilterState} 
        contacts={store.contacts}
        users={store.users || []}
        customFields={[
          { id: 'type', label: 'Payment Type', type: 'selection', options: [{ id: 'RECEIPT', label: 'Inbound (Receipt)' }, { id: 'PAYMENT', label: 'Outbound (Payment)' }] }
        ]}
        statuses={[
          { id: 'DRAFT', label: 'Draft' },
          { id: 'POSTED', label: 'Posted' },
          { id: 'VOID', label: 'Void' },
        ]}
        type="payment"
        placeholder="Search by Payment #, Partner, Reference..."
      />

      <div className="flex-1 overflow-auto bg-white m-6 rounded-lg shadow-xl border border-slate-200 flex flex-col">
        <div className="flex-1 overflow-auto">
          <table className="w-full text-left text-sm border-collapse">
            <thead className="bg-slate-800 text-white text-[10px] font-black uppercase tracking-widest sticky top-0 z-10">
              <tr>
                {columns.find(c => c.id === 'reference')?.visible && <th className="p-3 pl-6 whitespace-nowrap">Reference</th>}
                {columns.find(c => c.id === 'date')?.visible && <th className="p-3 whitespace-nowrap">Date & Time</th>}
                {columns.find(c => c.id === 'partner')?.visible && <th className="p-3 whitespace-nowrap">Partner</th>}
                {columns.find(c => c.id === 'journal')?.visible && <th className="p-3 whitespace-nowrap">Journal</th>}
                {columns.find(c => c.id === 'amount')?.visible && <th className="p-3 text-right whitespace-nowrap">Amount</th>}
                {columns.find(c => c.id === 'status')?.visible && <th className="p-3 whitespace-nowrap">Status</th>}
                {columns.find(c => c.id === 'type')?.visible && <th className="p-3 whitespace-nowrap">Type</th>}
                {columns.find(c => c.id === 'paymentCategory')?.visible && <th className="p-3 whitespace-nowrap">Category</th>}
                {columns.find(c => c.id === 'createdBy')?.visible && <th className="p-3 whitespace-nowrap">Created By</th>}
                <th className="p-3 text-center whitespace-nowrap w-10">
                  <ColumnSelector columns={columns} onChange={setColumns} />
                </th>
              </tr>
            </thead>
            <tbody className="divide-y text-slate-700">
              {paginatedPayments.length === 0 ? (
                <tr><td colSpan={7} className="p-20 text-center italic text-slate-300 font-bold uppercase tracking-widest">No payment records found</td></tr>
              ) : paginatedPayments.map((pay: Payment) => {
                return (
                  <tr key={pay.id} className="hover:bg-slate-50 cursor-pointer transition-colors group" onClick={() => { 
                    setEditingId(pay.id); 
                    setType(pay.type); 
                    setPartnerId(pay.contactId); 
                    setAmount(pay.amount); 
                    setDate(pay.date); 
                    setMemo(pay.reference || ''); 
                    setMethod(pay.method as any || 'BANK');
                    setLiquidityAccountId(pay.liquidityAccountId || pay.accountId || pay.account_id || '');
                    setPaymentCategory(pay.paymentCategory || '');
                    const initialAllocations: Record<string, number> = {};
                    (pay.appliedInvoices || []).forEach(a => {
                      initialAllocations[a.invoiceId] = a.amount;
                    });
                    (pay.appliedBills || []).forEach(a => {
                      initialAllocations[a.billId] = a.amount;
                    });
                    setAllocations(initialAllocations);
                    setSalesperson(pay.salesperson || '');
                    setShowForm(true); 
                  }}>
                    {columns.find(c => c.id === 'reference')?.visible && <td className="p-2 pl-6 font-bold text-[#00A09D] whitespace-nowrap">{pay.number || pay.reference || 'DRAFT'}</td>}
                    {columns.find(c => c.id === 'paymentCategory')?.visible && <td className="p-2 text-slate-500 font-bold whitespace-nowrap">{pay.paymentCategory || ''}</td>}
                    {columns.find(c => c.id === 'date')?.visible && <td className="p-2 whitespace-nowrap">{formatDateTime(pay.createdAt || pay.updatedAt || pay.date)}</td>}
                    {columns.find(c => c.id === 'partner')?.visible && <td className="p-2 font-medium truncate max-w-[200px]">{(store.contacts || []).find((c:any)=>c.id === pay.contactId)?.name}</td>}
                    {columns.find(c => c.id === 'journal')?.visible && <td className="p-2 text-[10px] font-bold uppercase text-slate-400 whitespace-nowrap">{pay.method}</td>}
                    {columns.find(c => c.id === 'amount')?.visible && <td className={`p-2 text-right font-black tabular-nums whitespace-nowrap ${pay.type === 'RECEIPT' ? 'text-emerald-600' : 'text-rose-600'}`}>
                      {pay.type === 'RECEIPT' ? '+' : '-'}{formatBDT(pay.amount)}
                    </td>}
                    {columns.find(c => c.id === 'type')?.visible && <td className="p-2 text-xs font-black uppercase tracking-widest text-slate-500 whitespace-nowrap">{pay.type}</td>}
                    {columns.find(c => c.id === 'status')?.visible && <td className="p-2 whitespace-nowrap">
                      <span className={`px-2 py-0.5 text-[9px] font-black uppercase rounded-full ring-1 ${
                        pay.status === 'POSTED' ? 'bg-emerald-50 text-emerald-700 ring-emerald-100' : 
                        pay.status === 'DRAFT' ? 'bg-amber-50 text-amber-700 ring-amber-100' :
                        pay.status === 'DELETED' ? 'bg-rose-50 text-rose-700 ring-rose-100' :
                        'bg-slate-50 text-slate-700 ring-slate-100'
                      }`}>
                        {pay.status === 'DELETED' ? 'Deleted' : (pay.status || 'POSTED')}
                      </span>
                    </td>}
                    {columns.find(c => c.id === 'createdBy')?.visible && (
                       <td className="p-2 whitespace-nowrap text-slate-500">
                         {store.resolveUserName(pay.createdById) || '-'}
                       </td>
                    )}
                    <td className="p-2 text-center whitespace-nowrap" onClick={e => e.stopPropagation()}>
                      {pay.status === 'POSTED' && store.hasPermission('payment_edit') && store.currentUser?.roleId === 'role-admin' && (
                        <button 
                          onClick={async (e) => { 
                            e.stopPropagation(); 
                            try {
                              await store.resetPaymentToDraft(pay.id); 
                              window.dispatchEvent(new CustomEvent('app-toast', { detail: { message: "Payment reset to draft.", type: 'success' } }));
                            } catch (error: any) {
                              window.dispatchEvent(new CustomEvent('app-toast', { detail: { message: error.message, type: 'error' } }));
                            }
                          }}
                          className="p-1 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all opacity-100 transition-opacity inline-flex"
                          title="Reset to Draft"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                        </button>
                      )}
                      {pay.status !== 'DELETED' && (
                        <button 
                          onClick={(e) => { e.stopPropagation(); if(confirm('Soft delete this payment?')) store.deletePayment(pay.id); }}
                          className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all opacity-100 transition-opacity inline-flex"
                          title="Delete"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                        </button>
                      )}
                      {pay.status === 'DELETED' && store.currentUser?.roleId === 'role-admin' && (
                        <div className="flex items-center space-x-1 justify-center">
                           <button 
                             onClick={() => store.restoreRecord('payment', pay.id)}
                             className="px-1.5 py-0.5 text-[8px] font-black uppercase text-indigo-600 bg-indigo-50 border border-indigo-200 rounded"
                           >
                             Restore
                           </button>
                           <button 
                             onClick={() => { if(confirm('Permanently delete this payment?')) store.permanentDeleteRecord('payment', pay.id); }}
                             className="px-1.5 py-0.5 text-[8px] font-black uppercase text-rose-600 bg-rose-50 border border-rose-200 rounded"
                           >
                             Delete
                           </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        
        <Pagination 
          currentPage={currentPage} 
          totalPages={totalPages} 
          totalItems={filteredPayments.length} 
          itemsPerPage={pageSize} 
          onPageChange={setCurrentPage} 
          onItemsPerPageChange={setPageSize}
        />
      </div>
    </div>
  );
};

export default PaymentManager;