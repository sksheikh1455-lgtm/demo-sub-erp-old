import { supabase } from '../lib/supabase';

import React, { useState, useMemo, useEffect, useRef } from 'react';
import {  CreditNote, Invoice, InvoiceItem, Product, Contact, ContactType, InvoiceItemType, JournalEntry, Account, Payment } from '../types';
import { formatDateTime, formatBDT, formatNumber, exportToXLSX, exportToPDF, getOpDateBST, generateUUID } from '../constants';
import SmartFilterBar, { SmartFilterState } from './SmartFilterBar';
import Chatter from './Chatter';
import ExportButtons from './ExportButtons';
import Pagination from './Pagination';
import ColumnSelector, { useColumns, ColumnDef } from './ColumnSelector';

import SearchableSelect from './SearchableSelect';
// --- MAIN COMPONENT ---
interface CreditNoteManagerProps {
  store: any;
  defaultCreate?: boolean;
  originInvoice?: Invoice | null;
  onClearOrigin?: () => void;
  onNavigate?: (tab: string, filter?: any, ctx?: any) => void;
}

const CreditNoteManager: React.FC<CreditNoteManagerProps> = ({ store, defaultCreate, originInvoice, onClearOrigin, onNavigate }) => {
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'lines' | 'journal'>('lines');
  const [isPosting, setIsPosting] = useState(false);
  const isPostingRef = useRef(false);
  
  // New workflow states
  const [showAvailableCreditPopup, setShowAvailableCreditPopup] = useState(false);
  const [creditAction, setCreditAction] = useState<'refund' | 'apply'>('apply');
  const [showApplyToInvoiceModal, setShowApplyToInvoiceModal] = useState(false);
  const [productFocusForInvoices, setProductFocusForInvoices] = useState<string | null>(null);
  const [showInvoiceSelectionPopup, setShowInvoiceSelectionPopup] = useState(false);
  const [selectedCustomerIdForInvoices, setSelectedCustomerIdForInvoices] = useState<string | null>(null);
  const [showRefundModal, setShowRefundModal] = useState(false);
  const [refundData, setRefundData] = useState({
    date: getOpDateBST(),
    method: 'Cash',
    accountId: '', 
    checkNo: '',
    address: '',
    memo: '',
    toBePrinted: true
  });

  useEffect(() => {
    if (store.accounts?.length > 0 && !refundData.accountId) {
      const cash100100 = (store.accounts || []).find((a: any) => a.code === '100100');
      const cashAcc = cash100100 || (store.accounts || []).find((a: any) => a.type === 'ASSET' && (a.subType === 'CASH' || (a.name || '').toLowerCase().includes('cash')));
      if (cashAcc) setRefundData(prev => ({ ...prev, accountId: cashAcc.id }));
      else if (store.accounts[0]) setRefundData(prev => ({ ...prev, accountId: store.accounts[0].id }));
    }
  }, [store.accounts, refundData.accountId]);

  // On-demand product loading for Credit Note Creator
  useEffect(() => {
    if (showForm && store.fetchProductsOnDemand) {
      store.fetchProductsOnDemand(false);
    }
  }, [showForm]);

  useEffect(() => {
    if (store.fetchProductsOnDemand) {
      store.fetchProductsOnDemand(false);
    }
  }, [store.activeCompanyIds]);
  const [appliedAmounts, setAppliedAmounts] = useState<Record<string, number>>({});
  const [pendingCN, setPendingCN] = useState<CreditNote | null>(null);
  
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

  const [columns, setColumns] = useColumns('credit_note_list', [
    { id: 'number', label: 'Number', visible: true },
    { id: 'date', label: 'Date & Time', visible: true },
    { id: 'customer', label: 'Customer', visible: true },
    { id: 'invoice', label: 'Source Invoice', visible: true },
    { id: 'amount', label: 'Amount', visible: true },
    { id: 'status', label: 'Status', visible: true },
    { id: 'createdBy', label: 'Created By', visible: false },
  ]);

  const [formData, setFormData] = useState(() => {
    return { 
      customerId: 'contact-cash-sale-global', 
      items: [] as InvoiceItem[], 
      date: getOpDateBST() 
    };
  });

  const currentCN = useMemo(() => 
    editingId ? (store.creditNotes || []).find((c: CreditNote) => c.id === editingId) : null, 
    [editingId, store.creditNotes]
  );
  
  const status = currentCN?.status || 'DRAFT';
  const isEditable = (!editingId && store.hasPermission('credit_note_create')) || (editingId && status === 'DRAFT' && store.hasPermission('credit_note_edit'));
  const isPosted = status === 'POSTED';
  
  const [fetchedJournal, setFetchedJournal] = useState<JournalEntry | null>(null);

  useEffect(() => {
    if (currentCN?.journalEntryId && !store.entries?.find((e: JournalEntry) => e.id === currentCN.journalEntryId)) {
      const fetchIt = async () => {
        try {
          
          const { data, error } = await supabase.from('docs_journals').select('*').eq('id', currentCN.journalEntryId).single();
          if (data) {
             const { data: lines } = await supabase.from('docs_journal_lines').select('*').eq('journal_id', data.id);
             setFetchedJournal({
                id: data.id,
                date: data.date,
                journalType: data.journal_type,
                status: data.status,
                reference: data.reference || data.reference_number,
                lines: (lines || []).map((l: any) => ({
                   id: l.id,
                   accountId: l.account_id,
                   contactId: l.contact_id,
                   debit: Number(l.debit),
                   credit: Number(l.credit),
                   description: l.description
                }))
             } as any);
          }
        } catch (e) {}
      };
      fetchIt();
    }
  }, [currentCN?.journalEntryId, store.entries]);

  const linkedJournalEntry = useMemo(() => 
    currentCN?.journalEntryId 
      ? (store.entries || []).find((e: JournalEntry) => e.id === currentCN.journalEntryId) || fetchedJournal
      : null, 
    [currentCN?.journalEntryId, store.entries, fetchedJournal]
  );

  const filteredCNs = useMemo(() => {
    const query = (filterState.searchQuery || '').toLowerCase();
    const results = (store.creditNotes || []).filter((cn: CreditNote) => {
      // Soft Delete Filter
      if (cn.status === 'DELETED' && !filterState.showDeleted) return false;
      if (cn.status !== 'DELETED' && filterState.showDeleted) return false;

      // 1. Basic Search
      const customerName = String((store.contacts || []).find((c: any) => c.id === cn.customerId)?.name || '').toLowerCase();
      const matchesSearch = !query || String(cn.number || '').toLowerCase().includes(query) || customerName.includes(query) || String(cn.reference || '').toLowerCase().includes(query);
      if (!matchesSearch) return false;

      // 2. Advanced Filters
      if (filterState.startDate && cn.date < filterState.startDate) return false;
      if (filterState.endDate && cn.date > filterState.endDate) return false;
      if (filterState.contactId && cn.customerId !== filterState.contactId) return false;
      if (filterState.productId && !(cn.items || []).some(item => item.productId === filterState.productId)) return false;
      
      if (filterState.brand || filterState.category) {
        const matchesProductFilters = (cn.items || []).some(item => {
          const product = (store.products || []).find((p: any) => p.id === item.productId);
          if (!product) return false;
          if (filterState.brand && !String(product.brand || '').toLowerCase().includes(filterState.brand.toLowerCase())) return false;
          if (filterState.category && product.category !== filterState.category) return false;
          return true;
        });
        if (!matchesProductFilters) return false;
      }

      if (filterState.status) {
        if (filterState.status === 'OPEN') {
          if (cn.status !== 'OPEN' && cn.status !== 'POSTED') return false;
        } else {
          if (cn.status !== filterState.status) return false;
        }
      }
      if (filterState.reference && !String(cn.reference || '').toLowerCase().includes(filterState.reference.toLowerCase())) return false;
      
      if (filterState.minAmount && cn.total < parseFloat(filterState.minAmount)) return false;
      if (filterState.maxAmount && cn.total > parseFloat(filterState.maxAmount)) return false;

      return true;
    });

    return results.sort((a, b) => {
      if (a.date !== b.date) return String(b.date || '').localeCompare(String(a.date || ''));
      return String(b.number || '').localeCompare(String(a.number || ''), undefined, { numeric: true, sensitivity: 'base' });
    });
  }, [store.creditNotes, store.contacts, store.products, filterState]);

  const totalPages = Math.ceil(filteredCNs.length / pageSize);
  const paginatedCNs = filteredCNs.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const handleExport = (format: 'excel' | 'pdf', scope: 'page' | 'all') => {
    const cnsToExport = scope === 'page' ? paginatedCNs : filteredCNs;

    if (cnsToExport.length === 0) return alert("No credit notes to export.");

    const totalSub = cnsToExport.reduce((sum, cn) => sum + (cn.subtotal || 0), 0);
    const totalTotal = cnsToExport.reduce((sum, cn) => sum + (cn.total || 0), 0);

    const headers = ['Note Number', 'Customer', 'Date', 'Reference', 'Subtotal', 'Total', 'Status'];
    const rows = [
      headers,
      ...cnsToExport.map(cn => {
        const customer = (store.contacts || []).find((c: any) => c.id === cn.customerId)?.name || 'N/A';
        return [
          cn.number,
          customer,
          cn.date,
          cn.reference || '',
          cn.subtotal,
          cn.total,
          cn.status
        ];
      }),
      ['TOTAL', '', '', '', totalSub, totalTotal, '']
    ];

    if (format === 'excel') {
      exportToXLSX('Credit_Notes', rows);
    } else {
      exportToPDF('Credit_Notes', rows);
    }
  };

  const productOptions = useMemo(() => {
    const opts = (store.products || []).map((prod:any)=>({
      id:prod.id, 
      name:prod.name, 
      extra: prod.sku,
      category: prod.category,
      serialNumbers: prod.serialNumbers,
      stock: (store.activeCompanyIds?.length === 1 ? (prod.stockLevels?.[store.activeCompanyIds[0]] || 0) : (prod.quantityOnHand || 0))
    }));

    (formData.items || []).forEach(item => {
      if (item.type === 'PRODUCT' && item.productId && !opts.some(o => o.id === item.productId)) {
        opts.push({
          id: item.productId,
          name: item.description || 'Unknown Product',
          extra: 'Not loaded entirely in view',
          category: '',
          serialNumbers: [],
          stock: 0
        });
      }
    });

    return opts;
  }, [store.products, formData.items]);

  const totals = useMemo(() => {
    let grossSubtotal = 0; // Sum of (Qty * Rate) for all products
    let lineDiscountTotal = 0; // Sum of line-level discounts
    let globalDiscountTotal = 0; // Sum of DISCOUNT type items
    let runningSubtotal = 0;
    let sequence = 0;
    let taxTotal = 0;

    const itemsWithCalc = (formData.items || []).map(item => {
      let lineValue = 0;
      let displayDescription = item.description || '';

      if (item.type === 'PRODUCT' || item.type === 'SERVICE' || item.type === 'CHARGE' || !item.type) {
        sequence++;
        const lineGross = Math.round((Number(item.quantity || 0) * Number(item.unitPrice || 0)) * 100) / 100;
        let lineDisc = 0;
        if (item.discountMode === 'FIXED') {
          lineDisc = Math.round(Number(item.discountRate || 0) * 100) / 100;
        } else {
          lineDisc = Math.round((lineGross * (Number(item.discountRate || 0)/100)) * 100) / 100;
        }
        lineValue = Math.round((lineGross - lineDisc) * 100) / 100;
        grossSubtotal = Math.round((grossSubtotal + lineGross) * 100) / 100;
        lineDiscountTotal = Math.round((lineDiscountTotal + lineDisc) * 100) / 100;
        runningSubtotal = Math.round((runningSubtotal + lineValue) * 100) / 100;
      } else if (item.type === 'DISCOUNT') {
        if (item.discountMode === 'PERCENT') {
          lineValue = -Math.round((runningSubtotal * (Number(item.discountRate || 0) / 100)) * 100) / 100;
        } else {
          lineValue = -Math.round(Number(item.discountRate || 0) * 100) / 100;
        }
        globalDiscountTotal = Math.round((globalDiscountTotal + Math.abs(lineValue)) * 100) / 100;
        runningSubtotal = Math.round((runningSubtotal + lineValue) * 100) / 100;
      } else if (item.type === 'TAX') {
        lineValue = item.manualValue !== undefined ? Math.round(item.manualValue * 100) / 100 : Math.round((runningSubtotal * ((item.taxRate || 0) / 100)) * 100) / 100;
        taxTotal = Math.round((taxTotal + lineValue) * 100) / 100;
        runningSubtotal = Math.round((runningSubtotal + lineValue) * 100) / 100;
      } else if (item.type === 'SUBTOTAL') {
        lineValue = item.manualValue !== undefined ? Math.round(item.manualValue * 100) / 100 : runningSubtotal;
        runningSubtotal = Math.round(lineValue * 100) / 100;
      }

      return { ...item, lineValue, displayDescription };
    });

    const totalAmount = Math.round(runningSubtotal * 100) / 100;

    return { 
      itemsWithCalc, 
      grossSubtotal, 
      lineDiscountTotal, 
      untaxed: Math.round((grossSubtotal - lineDiscountTotal) * 100) / 100, 
      tax: taxTotal, 
      total: totalAmount 
    };
  }, [formData.items]);

  useEffect(() => { 
    if (defaultCreate || originInvoice) { 
      setEditingId(null); 
      if (originInvoice) {
        setFormData({
          customerId: originInvoice.customerId,
          items: originInvoice.items.map(item => ({ ...item, id: `refund-${generateUUID()}` })),
          date: getOpDateBST()
        });
      } else {
        const cashSaleId = 'contact-cash-sale-global';
        setFormData({ 
          customerId: cashSaleId, 
          items: [{ id: generateUUID(), type: 'PRODUCT', description: '', quantity: 1, unitPrice: 0, discountRate: 0 }], 
          date: getOpDateBST() 
        }); 
      }
      setShowForm(true); 
    } 
  }, [defaultCreate, originInvoice, store.activeCompanyIds]);

  const handleSaveDraft = async () => {
    if (isPosting) return;
    if (!formData.customerId && !originInvoice) return alert("Select customer.");
    if (formData.items.length === 0) return alert("Please add at least one line.");

    setIsPosting(true);
    try {
      if (editingId) {
        await store.updateCreditNote(editingId, {
          ...formData,
          items: totals.itemsWithCalc, // Persist calculated values
          subtotal: totals.untaxed,
          taxTotal: totals.tax,
          total: totals.total,
        });
        setShowForm(false);
        setEditingId(null);
      } else {
        await store.addCreditNote({ 
          ...formData, 
          items: totals.itemsWithCalc, // Persist calculated values
          number: '', 
          subtotal: totals.untaxed, 
          discountTotal: 0,
          taxTotal: totals.tax, 
          total: totals.total, 
          status: 'DRAFT', 
          dueDate: '',
          originInvoiceId: originInvoice?.id || undefined
        });
        setShowForm(false);
      }
    } catch (err: any) {
      alert("Error saving draft: " + err.message);
    } finally {
      setIsPosting(false);
    }
  };

  const handleConfirm = async () => {
    if (isPosting) return;
    if (!formData.customerId && !originInvoice) return alert("Select customer.");
    if (formData.items.length === 0) return alert("Please add at least one line.");
    
    setIsPosting(true);
    let cnToPost;
    try {
      if (editingId) {
        await store.updateCreditNote(editingId, {
          ...formData,
          items: totals.itemsWithCalc, // Persist calculated values
          subtotal: totals.untaxed,
          taxTotal: totals.tax,
          total: totals.total,
        });
        const existingCN = (store.creditNotes || []).find((c: CreditNote) => c.id === editingId) || (store.allCreditNotes || []).find((c: CreditNote) => c.id === editingId);
        cnToPost = { 
          ...(existingCN || {}), 
          ...formData, 
          id: editingId,
          companyId: existingCN?.companyId || store.activeCompanyIds[0] || (formData as any).companyId,
          items: totals.itemsWithCalc, 
          subtotal: totals.untaxed, 
          taxTotal: totals.tax, 
          total: totals.total 
        } as CreditNote;
      } else {
        cnToPost = await store.addCreditNote({ 
          ...formData, 
          items: totals.itemsWithCalc, // Persist calculated values
          number: '', 
          subtotal: totals.untaxed, 
          discountTotal: 0,
          taxTotal: totals.tax, 
          total: totals.total, 
          status: 'DRAFT', 
          dueDate: '',
          originInvoiceId: originInvoice?.id || undefined
        });
        setEditingId(cnToPost.id);
      }

      // Automatically post immediately on confirm to reflect inventory
      const postedCN = await store.postCreditNote(cnToPost);
      const activeCN = postedCN || cnToPost;
      setPendingCN(activeCN);
      
      const customer = (store.contacts || []).find((c) => c.id === activeCN.customerId);
      const isCashSale = customer && customer.name.toLowerCase() === 'cash sale';

      if (isCashSale) {
        // Automatically give a refund for cash sales
        await store.postPayment({
          id: `PAY-REF-${activeCN.id}`,
          amount: activeCN.total,
          contactId: activeCN.customerId,
          date: activeCN.date,
          method: 'CASH',
          type: 'REFUND', 
          reference: `CPAY/REF-${String(activeCN.number || '').split('/').pop()}`,
          accountId: findLiquidityAccount(store.accounts),
          partnerAccountId: findPartnerAccount(store.accounts, 'RECEIVABLE'),
          companyId: activeCN?.companyId,
          status: 'POSTED'
        });

        if (activeCN.originInvoiceId) {
          try {
            await store.applyCreditToInvoice(activeCN.id, activeCN.originInvoiceId, activeCN.total);
          } catch (e) {
            console.warn("Auto-apply to origin invoice failed during refund:", e);
          }
        } else {
          await store.updateCreditNote(activeCN.id, { 
            amountPaid: (activeCN.amountPaid || 0) + activeCN.total,
            status: 'CLOSED'
          });
        }
        
        setEditingId(null);
        setShowForm(false);
        setPendingCN(null);
        if (typeof onClearOrigin === 'function') onClearOrigin();
        window.dispatchEvent(new CustomEvent('app-toast', { detail: { message: 'Cash refund processed automatically', type: 'success' } }));
      } else {
        setShowAvailableCreditPopup(true);
      }
    } catch (err: any) {
      alert("Error confirming credit note: " + err.message);
    } finally {
      setIsPosting(false);
    }
  };

  const findLiquidityAccount = (accounts: any[]) => {
    const cash100100 = (accounts || []).find((a: any) => a.code === '100100');
    if (cash100100) return cash100100.id;
    return (accounts || []).find((a: any) => a.type === 'ASSET' && (a.subType === 'CASH' || a.subType === 'BANK' || (a.name || '').toLowerCase().includes('cash') || (a.name || '').toLowerCase().includes('bank')))?.id;
  };

  const findPartnerAccount = (accounts: any[], type: 'RECEIVABLE' | 'PAYABLE') => {
    const list = accounts || [];
    if (type === 'RECEIVABLE') {
      const exact = list.find((a: any) => a.code === '100201' || a.subType === 'ACCOUNTS_RECEIVABLE');
      if (exact) return exact.id;
      return list.find((a: any) => (a.code === '100200' || (a.name || '').toLowerCase().includes('receivable')) && !(a.name || '').toLowerCase().includes('loan'))?.id || '100201';
    }
    const exactPayable = list.find((a: any) => a.code === '200101' || a.subType === 'ACCOUNTS_PAYABLE' || a.code === '2100');
    if (exactPayable) return exactPayable.id;
    return list.find((a: any) => a.code === '200100' || (a.name || '').toLowerCase().includes('payable'))?.id || '2100';
  };

  const handleFinalizePosting = async () => {
    if (!pendingCN || isPostingRef.current) return;
    
    try {
      isPostingRef.current = true;
      setIsPosting(true);
      
      // CN is already posted in handleConfirm, now we just handle the credit distribution
      const postedCN = pendingCN;
      if (postedCN) setPendingCN(postedCN);
      
      window.dispatchEvent(new CustomEvent('app-toast', { detail: { message: 'Credit Note posted successfully', type: 'success' } }));
      
      if (creditAction === 'apply') {
        setShowAvailableCreditPopup(false);
        // Show the advanced application modal instead of silent auto-apply
        // This addresses the user's request for a "smart advanced window" 
        setAppliedAmounts(postedCN?.originInvoiceId ? { [postedCN.originInvoiceId]: postedCN.total } : {});
        setShowApplyToInvoiceModal(true);
        // We keep pendingCN so the modal can use it
        setPendingCN(postedCN || pendingCN);
      } else if (creditAction === 'refund') {
        setShowAvailableCreditPopup(false);
        const activeCN = postedCN || pendingCN;
        if (!activeCN) return;

        setPendingCN(activeCN);
        setShowRefundModal(true);
      } else {
        setEditingId(null);
        setShowForm(false);
        setShowAvailableCreditPopup(false);
        setPendingCN(null);
        if (onClearOrigin) onClearOrigin();
      }
    } catch (err: any) {
      console.error("Credit note posting error:", err);
      alert("Failed to post credit note: " + (err.message || err));
    } finally {
      setIsPosting(false);
      isPostingRef.current = false;
    }
  };

  const handleIssueRefund = async () => {
    if (!pendingCN || isPosting) return;
    
    setIsPosting(true);
    try {
      // Record the refund payment as POSTED so it performs real cash transaction and decreases cash/bank
      await store.postPayment({
        id: `PAY-REF-${pendingCN.id}`,
        amount: pendingCN.total,
        contactId: pendingCN.customerId,
        date: refundData.date,
        method: String(refundData.method || '').toUpperCase(),
        type: 'REFUND', 
        reference: `CPAY/REF-${String(pendingCN.number || '').split('/').pop()}`,
        accountId: refundData.accountId || findLiquidityAccount(store.accounts),
        partnerAccountId: findPartnerAccount(store.accounts, 'RECEIVABLE'), // Customer AR
        companyId: pendingCN?.companyId,
        status: 'POSTED'
      });

      // If it originated from an invoice, link the application for records/status
      if (pendingCN.originInvoiceId) {
        try {
          await store.applyCreditToInvoice(pendingCN.id, pendingCN.originInvoiceId, pendingCN.total);
        } catch (e) {
          console.warn("Auto-apply to origin invoice failed during refund:", e);
        }
      } else {
        await store.updateCreditNote(pendingCN.id, { 
          amountPaid: (pendingCN.amountPaid || 0) + pendingCN.total,
          status: 'CLOSED'
        });
      }

      setEditingId(null);
      setShowForm(false);
      setShowRefundModal(false);
      setPendingCN(null);
      if (onClearOrigin) onClearOrigin();
      window.dispatchEvent(new CustomEvent('app-toast', { detail: { message: 'Refund processed successfully', type: 'success' } }));
    } catch (err: any) {
      console.error("Refund error:", err);
      alert("Failed to process refund: " + (err.message || err));
    } finally {
      setIsPosting(false);
    }
  };

  const handleApplyToInvoices = async () => {
    if (!pendingCN || isPosting) return;
    
    setIsPosting(true);
    try {
      // Record applications to invoices
      for (const [invoiceId, amount] of Object.entries(appliedAmounts)) {
        const amt = amount as number;
        if (amt > 0) {
          await store.applyCreditToInvoice(pendingCN.id, invoiceId, amt);
        }
      }

      const selectedTotal = Object.values(appliedAmounts).reduce((a, b) => (a as number) + (b as number), 0) as number;
      
      // The store handles the status closed if amountPaid reaches total.
      // But we need to ensure local consistency if no automatic update happened.
      if (pendingCN.originInvoiceId && !appliedAmounts[pendingCN.originInvoiceId] && selectedTotal < pendingCN.total) {
         await store.updateCreditNote(pendingCN.id, { 
           amountPaid: (pendingCN.amountPaid || 0) + selectedTotal,
         });
      }

      setEditingId(null);
      setShowForm(false);
      setShowApplyToInvoiceModal(false);
      setPendingCN(null);
      if (onClearOrigin) onClearOrigin();
      window.dispatchEvent(new CustomEvent('app-toast', { detail: { message: 'Credit applied to invoices successfully', type: 'success' } }));
    } catch (err: any) {
      console.error("Credit application error:", err);
      alert("Failed to apply credit: " + (err.message || err));
    } finally {
      setIsPosting(false);
    }
  };

  const handleDiscard = () => {
    setShowForm(false);
    if (onClearOrigin) onClearOrigin();
  };

  const addLine = () => {
    if (isPosted) return;
    const newItem: InvoiceItem = { 
      id: generateUUID(), 
      type: 'PRODUCT', 
      description: '', 
      quantity: 1, 
      unitPrice: 0, 
      discountRate: 0,
      discountMode: 'PERCENT'
    };
    setFormData({ ...formData, items: [...formData.items, newItem] });
  };

  const formatAccounting = (num: number) => {
    return formatNumber(num);
  };

  if (showForm) {
    const customer = (store.contacts || []).find((c: any) => c.id === formData.customerId);
    const unpaidInvoices = (store.invoices || []).filter((inv: Invoice) => 
      inv.customerId === formData.customerId && 
      ['POSTED', 'SENT', 'PARTIAL', 'PARTIAL_REFUNDED'].includes(inv.status)
    );

    return (
      <div className="flex flex-col h-full bg-[#F1F1F1] overflow-hidden animate-in fade-in duration-300">
        {/* Available Credit Popup */}
        {showAvailableCreditPopup && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[200] p-4">
            <div className="bg-white rounded-lg shadow-2xl w-full max-w-md overflow-hidden border border-slate-200">
              <div className="bg-[#2B333E] text-white px-4 py-2 flex justify-between items-center">
                <span className="text-sm font-bold">Available Credit</span>
                <button onClick={() => setShowAvailableCreditPopup(false)} className="text-white/60 hover:text-white">✕</button>
              </div>
              <div className="p-8 space-y-6">
                <p className="text-sm text-slate-600">This credit note has been posted. What would you like to do with the credit?</p>
                <div className="space-y-4">
                  <div className="space-y-3">
                    <label className="flex items-center space-x-3 cursor-pointer group">
                      <input type="radio" name="creditAction" checked={creditAction === 'refund'} onChange={() => setCreditAction('refund')} className="w-4 h-4 text-indigo-600 focus:ring-indigo-500" />
                      <span className="text-sm text-slate-700 group-hover:text-indigo-600 transition-colors font-bold">Give a refund</span>
                    </label>
                    <label className="flex items-center space-x-3 cursor-pointer group">
                      <input type="radio" name="creditAction" checked={creditAction === 'apply'} onChange={() => setCreditAction('apply')} className="w-4 h-4 text-indigo-600 focus:ring-indigo-500" />
                      <span className="text-sm text-slate-700 group-hover:text-indigo-600 transition-colors font-bold">Apply to an invoice</span>
                    </label>
                  </div>
                </div>
                <div className="flex justify-center pt-4">
                  <button onClick={handleFinalizePosting} className="bg-[#4A90E2] text-white px-12 py-2 rounded font-bold text-sm shadow-md hover:bg-[#357ABD] transition-all">OK</button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Apply Credit to Invoices Modal */}
        {showRefundModal && pendingCN && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-6 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white w-full max-w-3xl rounded shadow-2xl overflow-hidden flex flex-col border-t-4 border-[#2B333E]">
              <div className="bg-[#2B333E] px-6 py-3 flex justify-between items-center">
                <h3 className="text-white font-bold text-sm uppercase tracking-widest">Issue a Refund</h3>
                <button onClick={() => setShowRefundModal(false)} className="text-white/60 hover:text-white">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"/></svg>
                </button>
              </div>
              
              <div className="p-10 space-y-8">
                <div className="grid grid-cols-2 gap-12">
                  <div className="space-y-6">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">A refund is due to</label>
                      <div className="text-sm font-bold text-slate-800 border-b border-slate-300 pb-1">
                        {(store.contacts || []).find((c: any) => c.id === pendingCN.customerId)?.name || 'Unknown Customer'}
                      </div>
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">Refund Amount</label>
                      <div className="text-2xl font-black text-rose-600 border-b border-slate-300 pb-1">
                        {formatBDT(pendingCN.total)}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">Date</label>
                        <input 
                          type="date" 
                          className="w-full bg-transparent border-b border-slate-300 outline-none text-sm font-bold py-1 focus:border-indigo-500 transition-colors" 
                          value={refundData.date} 
                          onChange={e => setRefundData({...refundData, date: e.target.value})}
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">Ref/Check No.</label>
                        <input 
                          type="text" 
                          className="w-full bg-transparent border-b border-slate-300 outline-none text-sm font-bold py-1 focus:border-indigo-500 transition-colors" 
                          value={refundData.checkNo} 
                          onChange={e => setRefundData({...refundData, checkNo: e.target.value})}
                          placeholder="To Print"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="space-y-6">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">Issue this refund via</label>
                      <select 
                        className="w-full bg-transparent border-b border-slate-300 outline-none text-sm font-bold py-1 focus:border-indigo-500 transition-colors"
                        value={refundData.method || ""}
                        onChange={e => setRefundData({...refundData, method: e.target.value})}
                      >
                        <option>Check</option>
                        <option>Cash</option>
                        <option>Bank Transfer</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">Account</label>
                      <select 
                        className="w-full bg-transparent border-b border-slate-300 outline-none text-sm font-bold py-1 focus:border-indigo-500 transition-colors"
                        value={refundData.accountId || ""}
                        onChange={e => setRefundData({...refundData, accountId: e.target.value})}
                      >
                        {(store.accounts || []).filter((a: any) => (a.code || '').startsWith('101') || String(a.name || '').toLowerCase().includes('bank') || String(a.name || '').toLowerCase().includes('cash')).map((acc: any) => (
                          <option key={acc.id} value={acc.id}>{acc.name}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">Ending Balance</label>
                      <div className="text-sm font-bold text-slate-800 py-1">
                        {formatBDT(store.getAccountBalance(refundData.accountId) - pendingCN.total)}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-6">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">Address</label>
                    <textarea 
                      className="w-full bg-slate-50 border border-slate-200 rounded p-3 text-sm outline-none focus:border-indigo-500 transition-colors h-24"
                      value={refundData.address}
                      onChange={e => setRefundData({...refundData, address: e.target.value})}
                      placeholder="Customer Address"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">Memo</label>
                    <input 
                      type="text" 
                      className="w-full bg-transparent border-b border-slate-300 outline-none text-sm font-bold py-1 focus:border-indigo-500 transition-colors" 
                      value={refundData.memo} 
                      onChange={e => setRefundData({...refundData, memo: e.target.value})}
                      placeholder="Refund for items returned"
                    />
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  <input 
                    type="checkbox" 
                    id="toBePrinted"
                    checked={refundData.toBePrinted} 
                    onChange={e => setRefundData({...refundData, toBePrinted: e.target.checked})}
                    className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500"
                  />
                  <label htmlFor="toBePrinted" className="text-sm font-bold text-slate-600 cursor-pointer">To be printed</label>
                </div>
              </div>

              <div className="bg-slate-100 p-6 border-t flex justify-end space-x-4">
                <button disabled={isPosting} onClick={handleIssueRefund} className={`bg-[#4A90E2] text-white px-12 py-2.5 rounded font-bold text-sm shadow-lg transition-all ${isPosting ? 'opacity-50 cursor-not-allowed' : 'hover:bg-[#357ABD] active:scale-95'}`}>OK</button>
                <button disabled={isPosting} onClick={() => setShowRefundModal(false)} className={`bg-white border border-slate-300 text-slate-700 px-12 py-2.5 rounded font-bold text-sm transition-all ${isPosting ? 'opacity-50 cursor-not-allowed' : 'hover:bg-slate-50'}`}>Cancel</button>
              </div>
            </div>
          </div>
        )}

        {showApplyToInvoiceModal && pendingCN && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[200] p-4">
            <div className="bg-white rounded-lg shadow-2xl w-full max-w-4xl overflow-hidden border border-slate-200 flex flex-col max-h-[90vh]">
              <div className="bg-[#2B333E] text-white px-4 py-2 flex justify-between items-center">
                <span className="text-sm font-bold">Apply Credit to Invoices</span>
                <button onClick={() => setShowApplyToInvoiceModal(false)} className="text-white/60 hover:text-white">✕</button>
              </div>
              <div className="p-6 overflow-y-auto flex-1">
                <div className="flex justify-between items-center mb-6">
                  <div className="border p-4 rounded bg-slate-50 flex-1 mr-4">
                    <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4 border-b pb-2">Credit Memo</h4>
                    <div className="grid grid-cols-2 gap-8">
                      <div className="space-y-2">
                        <div className="flex justify-between text-sm"><span className="text-slate-500">Customer:Job</span><span className="font-bold">{customer?.name || 'cash'}</span></div>
                        <div className="flex justify-between text-sm"><span className="text-slate-500">Ref. No.</span><span className="font-bold">{String(pendingCN.number || '').split('/').pop()}</span></div>
                        <div className="flex justify-between text-sm"><span className="text-slate-500">Date</span><span className="font-bold">{pendingCN.date}</span></div>
                      </div>
                      <div className="space-y-2">
                        <div className="flex justify-between text-sm"><span className="text-slate-500">Original Amt.</span><span className="font-bold">{formatAccounting(pendingCN.total)}</span></div>
                        <div className="flex justify-between text-sm"><span className="text-slate-500 text-rose-600">Remaining Credit</span><span className="font-bold text-rose-600">{formatAccounting(pendingCN.total - (Object.values(appliedAmounts) as number[]).reduce((a, b) => a + b, 0))}</span></div>
                      </div>
                    </div>
                  </div>
                  {pendingCN.items.some(it => it.productId) && (
                    <div className="w-1/3 bg-blue-50 border border-blue-100 p-4 rounded shadow-inner">
                      <div className="flex justify-between items-center mb-2">
                        <h5 className="text-[9px] font-black text-blue-400 uppercase">Smart Advanced Matching</h5>
                        <button 
                          onClick={() => {
                            const newApplied = { ...appliedAmounts };
                            unpaidInvoices.forEach(inv => {
                              const hasMatch = (inv.items || []).some(ai => pendingCN.items.some(ci => ci.productId === ai.productId));
                              if (hasMatch && !newApplied[inv.id]) {
                                const currentTotalApplied = (Object.values(newApplied) as number[]).reduce((sum: number, val: number) => sum + val, 0);
                                const remaining = (pendingCN.total as number) - currentTotalApplied;
                                if (remaining > 0) {
                                  // Simplified auto-fill
                                  const paymentsForInv = (store.payments || []).filter((p: any) => p.invoiceId === inv.id).reduce((s: number, p: any) => s + p.amount, 0);
                                  const creditsForInv = (store.creditNotes || []).filter((c: any) => c.originInvoiceId === inv.id && (c.status === 'POSTED' || c.status === 'CLOSED') && c.id !== pendingCN.id).reduce((sum: number, c: any) => sum + c.total, 0);
                                  const due = inv.total - paymentsForInv - creditsForInv;
                                  const toApply = Math.min(remaining, due);
                                  newApplied[inv.id] = toApply;
                                }
                              }
                            });
                            setAppliedAmounts(newApplied);
                          }}
                          className="text-[9px] bg-blue-600 text-white px-2 py-0.5 rounded font-bold hover:bg-blue-700 transition-colors"
                        >
                          Auto-Match
                        </button>
                      </div>
                      <div className="text-[10px] text-blue-800 space-y-1">
                        <p>We've identified <span className="font-bold">{(pendingCN.items || []).filter(it => it.productId).length} products</span> in this return.</p>
                        <ul className="list-disc pl-3">
                          {(pendingCN.items || []).filter(it => it.productId).slice(0, 3).map(it => {
                            const name = (store.products || []).find((p:any)=>p.id===it.productId)?.name;
                            return (
                              <li key={it.id} className="truncate group relative">
                                {name}
                                <div className="hidden group-hover:block absolute left-full top-0 ml-2 bg-white border shadow-lg p-2 z-[300] w-48 text-[10px] text-slate-700 rounded-md">
                                  <p className="font-bold underline mb-1">Recent Sales info:</p>
                                  {(store.invoices || []).filter((inv: any) => inv.customerId === pendingCN.customerId && (inv.items || []).some((ai: any) => ai.productId === it.productId)).slice(0, 5).map((inv: any) => (
                                    <div key={inv.id} className="flex justify-between border-b last:border-0 py-0.5">
                                      <span>{inv.number?.split('/').pop()}</span>
                                      <span className="font-bold">{(inv.items || []).find((ai: any) => ai.productId === it.productId)?.quantity} sold</span>
                                    </div>
                                  ))}
                                </div>
                              </li>
                            );
                          })}
                        </ul>
                        <p className="mt-2 text-rose-600 font-bold">Matching invoices are highlighted below.</p>
                      </div>
                    </div>
                  )}
                </div>

                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-y text-slate-500 font-bold uppercase tracking-tighter">
                      <th className="p-2 w-10">✓</th>
                      <th className="p-2">Date</th>
                      <th className="p-2">Job</th>
                      <th className="p-2">Number</th>
                      <th className="p-2 text-right">Orig. Amt.</th>
                      <th className="p-2 text-right">Amt. Due</th>
                      <th className="p-2 text-right">Amt. Applied</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {unpaidInvoices.sort((a, b) => {
                      // Sort by matching products first
                      const aHasMatched = (a.items || []).some(ai => pendingCN.items.some(ci => ci.productId === ai.productId));
                      const bHasMatched = (b.items || []).some(bi => pendingCN.items.some(ci => ci.productId === bi.productId));
                      if (aHasMatched && !bHasMatched) return -1;
                      if (!aHasMatched && bHasMatched) return 1;
                      return new Date(b.date).getTime() - new Date(a.date).getTime();
                    }).map(inv => {
                      const applied = appliedAmounts[inv.id] || 0;
                      const isChecked = applied > 0;
                      const hasMatchedProduct = (inv.items || []).some(ai => pendingCN.items.some(ci => ci.productId === ai.productId));
                      
                      // Calculate due amount (total - payments - other credits)
                      const paymentsForInv = (store.payments || []).filter((p: any) => p.invoiceId === inv.id).reduce((s: number, p: any) => s + p.amount, 0);
                      const creditsForInv = (store.creditNotes || []).filter((c: any) => c.originInvoiceId === inv.id && (c.status === 'POSTED' || c.status === 'CLOSED') && c.id !== pendingCN.id).reduce((s: number, c: any) => s + c.total, 0);
                      const due = inv.total - paymentsForInv - creditsForInv;

                      return (
                        <tr key={inv.id} className={`hover:bg-slate-50 ${isChecked ? 'bg-blue-50/50' : hasMatchedProduct ? 'bg-amber-50/30' : ''}`}>
                          <td className="p-2">
                            <input 
                              type="checkbox" 
                              checked={isChecked} 
                              onChange={(e) => {
                                const applied = appliedAmounts[inv.id] || 0;
                                const remaining = pendingCN.total - (Object.values(appliedAmounts) as number[]).reduce((a, b) => a + b, 0) + applied;
                                if (e.target.checked) {
                                  const toApply = Math.min(remaining, due);
                                  setAppliedAmounts({ ...appliedAmounts, [inv.id]: toApply });
                                } else {
                                  const { [inv.id]: _, ...rest } = appliedAmounts;
                                  setAppliedAmounts(rest);
                                }
                              }}
                              className="rounded border-slate-300 text-blue-600 focus:ring-blue-500" 
                            />
                          </td>
                          <td className="p-2 flex items-center space-x-2">
                            {inv.date}
                            {hasMatchedProduct && <span className="bg-rose-100 text-rose-600 px-1 rounded text-[8px] font-black uppercase">Match</span>}
                          </td>
                          <td className="p-2">{customer?.name}</td>
                          <td className="p-2">{String(inv.number || '').split('/').pop()}</td>
                          <td className="p-2 text-right">{formatAccounting(inv.total)}</td>
                          <td className="p-2 text-right">{formatAccounting(due)}</td>
                          <td className="p-2 text-right">
                            <input 
                              type="number" 
                              className="w-24 text-right border-b border-slate-200 outline-none focus:border-blue-500 bg-transparent font-bold"
                              value={applied || ''}
                              onChange={(e) => {
                                const val = parseFloat(e.target.value) || 0;
                                const otherApplied = Object.entries(appliedAmounts).reduce((s, [id, amt]) => id === inv.id ? s : s + (amt as number), 0);
                                const maxPossible = Math.min(due, pendingCN.total - otherApplied);
                                setAppliedAmounts({ ...appliedAmounts, [inv.id]: Math.min(val, maxPossible) });
                              }}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot className="bg-slate-50 font-bold border-t">
                    <tr>
                      <td colSpan={4} className="p-2 text-right uppercase text-[10px] text-slate-400">Totals</td>
                      <td className="p-2 text-right">{formatAccounting(unpaidInvoices.reduce((s, i) => s + i.total, 0))}</td>
                      <td className="p-2 text-right">{formatAccounting(unpaidInvoices.reduce((s, i) => {
                        const paymentsForInv = (store.payments || []).filter((p: any) => p.invoiceId === i.id).reduce((sum: number, p: any) => sum + p.amount, 0);
                        const creditsForInv = (store.creditNotes || []).filter((c: any) => c.originInvoiceId === i.id && c.status === 'POSTED' && c.id !== pendingCN.id).reduce((sum: number, c: any) => sum + c.total, 0);
                        return s + (i.total - paymentsForInv - creditsForInv);
                      }, 0))}</td>
                      <td className="p-2 text-right text-blue-600">{formatAccounting((Object.values(appliedAmounts) as number[]).reduce((a, b) => a + b, 0))}</td>
                    </tr>
                  </tfoot>
                </table>
                
                <div className="mt-6">
                  <button onClick={() => setAppliedAmounts({})} className="px-6 py-1.5 bg-slate-100 border border-slate-300 rounded text-xs font-bold text-slate-700 hover:bg-slate-200 transition-all">Clear Selections</button>
                </div>
              </div>
              <div className="bg-slate-50 p-4 border-t flex justify-end space-x-3">
                <button disabled={isPosting} onClick={handleApplyToInvoices} className={`bg-[#4A90E2] text-white px-10 py-1.5 rounded font-bold text-sm shadow-md transition-all ${isPosting ? 'opacity-50 cursor-not-allowed' : 'hover:bg-[#357ABD]'}`}>Done</button>
                <button disabled={isPosting} onClick={() => setShowApplyToInvoiceModal(false)} className={`bg-white border border-slate-300 text-slate-700 px-10 py-1.5 rounded font-bold text-sm transition-all ${isPosting ? 'opacity-50 cursor-not-allowed' : 'hover:bg-slate-50'}`}>Cancel</button>
              </div>
            </div>
          </div>
        )}

        {/* Source Invoice Selection Popup */}
        {showInvoiceSelectionPopup && (formData.customerId || selectedCustomerIdForInvoices) && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[200] p-4">
            <div className="bg-white rounded-lg shadow-2xl w-full max-w-4xl overflow-hidden border border-slate-200 flex flex-col max-h-[80vh]">
              <div className="bg-[#2B333E] text-white px-4 py-3 flex justify-between items-center">
                <div className="flex items-center space-x-3">
                  <span className="text-sm font-bold uppercase tracking-widest">Select Invoice to Refund</span>
                  {productFocusForInvoices && (
                    <span className="bg-rose-500 text-white text-[10px] px-2 py-0.5 rounded font-black animate-pulse">SMART FILTER ACTIVE</span>
                  )}
                </div>
                <button onClick={() => { setShowInvoiceSelectionPopup(false); setProductFocusForInvoices(null); }} className="text-white/60 hover:text-white">✕</button>
              </div>
              <div className="p-6 overflow-y-auto flex-1 bg-slate-50">
                {productFocusForInvoices && (
                  <div className="mb-4 p-3 bg-rose-50 border border-rose-100 rounded text-rose-800 text-xs flex justify-between items-center">
                    <div>
                      Filtering by Product: <span className="font-bold">{(store.products || []).find((p:any)=>p.id===productFocusForInvoices)?.name}</span>
                    </div>
                    <button onClick={()=>setProductFocusForInvoices(null)} className="font-bold underline">Show All Invoices</button>
                  </div>
                )}
                <p className="text-sm text-slate-600 mb-6">Select an invoice to auto-populate the credit note, or skip to create a blank form.</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {(store.invoices || []).filter((inv: Invoice) => {
                    const cid = formData.customerId || selectedCustomerIdForInvoices;
                    if (inv.customerId !== cid) return false;
                    if (!['POSTED', 'SENT', 'PARTIAL', 'PARTIAL_REFUNDED', 'PAID'].includes(inv.status)) return false;
                    if (productFocusForInvoices) {
                      return (inv.items || []).some(item => item.productId === productFocusForInvoices);
                    }
                    return true;
                  }).reverse().map((inv: Invoice) => (
                    <div 
                      key={inv.id} 
                      onClick={() => {
                        setFormData(prev => ({
                          ...prev,
                          customerId: inv.customerId,
                          items: (inv.items || []).map(item => ({ ...item, id: `refund-${generateUUID()}` }))
                        }));
                        setShowInvoiceSelectionPopup(false);
                        setProductFocusForInvoices(null);
                      }}
                      className="border bg-white rounded-lg p-5 cursor-pointer hover:border-rose-500 hover:shadow-lg transition-all group relative overflow-hidden"
                    >
                      <div className="absolute top-0 left-0 w-1 h-full bg-slate-200 group-hover:bg-rose-500 transition-colors"></div>
                      <div className="flex justify-between items-center mb-3 text-sm">
                        <span className="font-black text-slate-800 group-hover:text-rose-600 transition-colors uppercase tracking-wider">{String(inv.number || '').split('/').pop()}</span>
                        <span className="font-bold text-slate-500">{inv.date}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-xs bg-slate-100 text-slate-600 px-2 py-1 rounded font-bold">{(inv.items || []).length} items</span>
                        <span className="font-black text-rose-600 text-lg">{formatAccounting(inv.total)}</span>
                      </div>
                      {productFocusForInvoices && (
                        <div className="mt-2 text-[10px] text-rose-500 font-bold">
                          Contains targeted product: {(inv.items || []).find(it => it.productId === productFocusForInvoices)?.quantity} sold
                        </div>
                      )}
                    </div>
                  ))}
                  {(store.invoices || []).filter((inv: Invoice) => {
                    const cid = formData.customerId || selectedCustomerIdForInvoices;
                    return inv.customerId === cid && ['POSTED', 'SENT', 'PARTIAL', 'PARTIAL_REFUNDED', 'PAID'].includes(inv.status) && productFocusForInvoices && !(inv.items || []).some(item => item.productId === productFocusForInvoices);
                  }).length > 0 && !productFocusForInvoices && (
                    <div className="text-xs text-slate-400 p-4 border border-dashed rounded text-center col-span-full">No other invoices found...</div>
                  )}
                </div>
              </div>
              <div className="bg-white p-4 border-t flex justify-between items-center">
                <button onClick={() => { setShowInvoiceSelectionPopup(false); setProductFocusForInvoices(null); }} className="bg-slate-100 text-slate-700 px-6 py-2 rounded font-bold text-sm hover:bg-slate-200 transition-all">Skip / Blank Entry</button>
              </div>
            </div>
          </div>
        )}

        <div className="bg-white border-b px-4 py-2 flex justify-between items-center z-10 shadow-sm">
          <div className="flex items-center space-x-2 text-sm">
            <button onClick={handleDiscard} className="text-[#00A09D] hover:underline">Credit Notes</button>
            <span className="text-slate-400">/</span>
            <span className="font-bold text-slate-800">{editingId ? currentCN?.number : 'New Credit Note'}</span>
          </div>
          <div className="flex bg-white border rounded text-[10px] font-bold uppercase overflow-hidden">
             <div className={`px-4 py-2 ${status === 'DRAFT' ? 'bg-rose-600 text-white' : 'text-slate-400 border-r'}`}>Draft</div>
             <div className={`px-4 py-2 ${status === 'OPEN' || status === 'POSTED' ? 'bg-sky-600 text-white' : 'text-slate-400 border-r'}`}>Open</div>
             <div className={`px-4 py-2 ${status === 'CLOSED' ? 'bg-emerald-600 text-white' : 'text-slate-400'}`}>Closed</div>
          </div>
        </div>

        <div className="bg-white border-b px-4 py-2 flex space-x-2 z-10">
          {isEditable && (
            <button 
              disabled={isPosting} 
              onClick={handleConfirm} 
              className={`bg-rose-600 text-white px-6 py-1.5 rounded text-sm font-bold shadow-sm hover:brightness-110 flex items-center ${isPosting ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              {isPosting ? (
                <>
                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                  Confirming...
                </>
              ) : 'Confirm Return'}
            </button>
          )}
          {isEditable && <button onClick={handleSaveDraft} className="bg-white border border-slate-300 text-slate-700 px-6 py-1.5 rounded text-sm font-bold shadow-sm hover:bg-slate-50 transition-colors">Save</button>}
          {editingId && store.currentUser?.roleId === 'role-admin' && (
            <button 
              onClick={() => {
                if (deleteConfirmId === editingId) {
                  try {
                    store.deleteCreditNote(editingId);
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
              className="bg-rose-50 text-rose-600 px-6 py-1.5 rounded text-sm font-bold shadow-sm hover:bg-rose-100 transition-colors"
            >
              {deleteConfirmId === editingId ? 'Confirm Delete' : 'Delete'}
            </button>
          )}
          {editingId && (status === 'POSTED' || status === 'OPEN') && store.hasPermission('credit_note_edit') && store.currentUser?.roleId === 'role-admin' && (
            <button 
              onClick={() => {
                if (window.confirm('Are you sure you want to reset this credit note to draft?')) {
                  store.resetCreditNoteToDraft(editingId!).then(() => setFormData(prev => ({ ...prev, status: 'DRAFT' })));
                }
              }}
              className="bg-white border border-slate-300 text-slate-600 px-6 py-1.5 rounded text-sm font-bold shadow-sm hover:bg-slate-50 transition-colors"
            >
              Reset to Draft
            </button>
          )}
          {editingId && (
            <>
              <button 
                onClick={() => {
                  window.print();
                  const currentCN = (store.creditNotes || []).find((cn: CreditNote) => cn.id === editingId);
                  store.updateCreditNote(editingId, {
                    messages: [...(currentCN?.messages || []), {
                      id: generateUUID(),
                      authorId: store.currentUser?.id || 'user-1',
                      body: `Credit Note ${currentCN?.number} was printed.`,
                      date: new Date().toISOString(),
                      type: 'notification'
                    }]
                  });
                }} 
                className="bg-white border border-slate-300 text-slate-600 px-6 py-1.5 rounded text-sm font-bold shadow-sm hover:bg-slate-50 transition-colors flex items-center"
              >
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"/></svg>
                Print
              </button>
              {(status === 'POSTED' || status === 'OPEN' || status === 'CLOSED') && onNavigate && (
                <button 
                  type="button"
                  onClick={() => {
                     const currentCN = (store.creditNotes || []).find((cn: CreditNote) => cn.id === editingId);
                     const searchRef = currentCN?.journalEntryId || currentCN?.id;
                     onNavigate('journal', { reference: searchRef });
                  }}
                  className="bg-emerald-600 text-white px-6 py-1.5 rounded text-sm font-bold shadow-sm hover:bg-emerald-700 transition-colors flex items-center"
                >
                  <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
                  View Journal
                </button>
              )}
            </>
          )}
          <button onClick={handleDiscard} className="bg-white border text-slate-700 px-6 py-1.5 rounded text-sm font-bold shadow-sm hover:bg-slate-50 transition-colors">Discard</button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 lg:p-10">
          <div className={`bg-white max-w-6xl mx-auto shadow-2xl border p-12 min-h-[900px] flex flex-col rounded-sm relative`}>
            {isPosted && <div className="absolute top-4 right-4 bg-rose-50 border border-rose-200 text-rose-600 px-4 py-2 rounded font-black text-[10px] uppercase tracking-widest z-50">STOCK RETURNED TO INVENTORY</div>}
            {status === 'OPEN' && <div className="absolute top-4 right-4 bg-sky-50 border border-sky-200 text-sky-600 px-4 py-2 rounded font-black text-[10px] uppercase tracking-widest z-50">STOCK RETURNED TO INVENTORY</div>}
            {status === 'CLOSED' && <div className="absolute top-4 right-4 bg-emerald-50 border border-emerald-200 text-emerald-600 px-4 py-2 rounded font-black text-[10px] uppercase tracking-widest z-50">CREDIT FULLY UTILIZED</div>}
            
            <h1 className="text-4xl font-bold mb-10 tracking-tight text-rose-600">{editingId ? currentCN?.number : 'New Credit Note'}</h1>
            
            {originInvoice && !isEditable && (
               <div className="mb-8 p-4 bg-amber-50 border border-amber-100 rounded-lg flex items-center space-x-3">
                  <svg className="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                  <span className="text-xs font-bold text-amber-900 italic uppercase tracking-wider">Refunding items from Invoice: <span className="underline">{originInvoice.number}</span></span>
               </div>
            )}

            <div className="grid grid-cols-2 gap-20 mb-10">
               <div className="space-y-4">
                  <div className="flex items-baseline border-b border-dashed border-slate-200 pb-1">
                     <label className="w-32 text-sm font-bold text-slate-500 uppercase tracking-tighter">Customer</label>
                     <SearchableSelect 
                        className="flex-1" placeholder="Select Customer..."
                        options={(store.contacts || []).filter((c:any)=>!c.type || c.type?.toUpperCase() === 'CUSTOMER' || c.type?.toUpperCase() === 'BOTH' || c.type?.toUpperCase() === 'CASH').map((c:any)=>({id:c.id, name:c.name || 'Unnamed', extra:`Phone: ${c.phone || ''} | ${c.email || ''} | ${c.code || ''}`.trim()}))}
                        value={formData.customerId} onSelect={id => {
                          setFormData({...formData, customerId: id});
                          if (isEditable && !originInvoice) {
                            const hasInvoices = (store.invoices || []).some((inv: Invoice) => inv.customerId === id && ['POSTED', 'SENT', 'PARTIAL', 'PARTIAL_REFUNDED', 'PAID'].includes(inv.status));
                            if (hasInvoices) {
                              setSelectedCustomerIdForInvoices(id);
                              setShowInvoiceSelectionPopup(true);
                            }
                          }
                        }} 
                        onFocus={store.fetchContacts}
                        onSearchChange={store.searchContactsOnDemand}
                        onQuickCreate={()=>{}}
                        disabled={!isEditable}
                        quickCreateLabel="Customer"
                        emptyMessage="No customers found..."
                        themeColor="#e11d48"
                     />
                  </div>
               </div>
               <div className="space-y-4">
                  <div className="flex items-baseline border-b border-dashed border-slate-200 pb-1">
                    <label className="w-32 text-sm font-medium text-slate-500">Post Date</label>
                    <input type="date" disabled={!isEditable} className="w-full bg-transparent outline-none text-sm font-bold" value={formData.date || ''} onChange={e => setFormData({...formData, date: e.target.value})} />
                  </div>
               </div>
            </div>

            <div className="border-b flex space-x-10 mb-8">
               <button onClick={() => setActiveTab('lines')} className={`pb-3 text-sm font-bold border-b-2 transition-all ${activeTab === 'lines' ? 'border-rose-600 text-rose-600' : 'border-transparent text-slate-400'}`}>Refund Items</button>
               <button onClick={() => setActiveTab('journal')} className={`pb-3 text-sm font-bold border-b-2 transition-all ${activeTab === 'journal' ? 'border-rose-600 text-rose-600' : 'border-transparent text-slate-400'}`}>Journal Items (Audit)</button>
            </div>

            {activeTab === 'lines' ? (
               <div className="flex-1 overflow-x-auto">
                   <table className="w-full text-left text-sm min-w-[800px]">
                    <thead className="border-b font-bold text-slate-800">
                       <tr>
                          <th className="py-2">Product / Reason</th>
                          <th className="py-2 text-right w-20">Qty</th>
                          <th className="py-2 text-right w-28">Price</th>
                          <th className="py-2 text-right w-32">Total Refund</th>
                       </tr>
                    </thead>
                    <tbody className="divide-y">
                       {totals.itemsWithCalc.map((item, idx) => (
                          <tr key={item.id} className="group">
                             <td className="py-3">
                                <>
                                  <SearchableSelect 
                                  disabled={!isEditable}
                                  placeholder="Select Product to Refund..." 
                                  options={productOptions}
                                  onFocus={() => store.fetchProductsOnDemand(false)}
                                  onSearchChange={store.searchProductsOnDemand}
                                  value={item.productId || ''} 
                                  onSelect={id => { 
                                    const pr = (store.products || []).find((x:any)=>x.id===id); 
                                    const ni = [...formData.items]; 
                                    ni[idx]={...ni[idx], productId: id, description: pr.name, unitPrice: pr.price, serialNumbers: []}; 
                                    setFormData({...formData, items: ni}); 
                                  }}
                                  onQuickCreate={()=>{}}
                                  themeColor="#e11d48"
                                />
                                {item.productId && (
                                  <div className="flex items-center space-x-2 mt-1">
                                    <button 
                                      onClick={() => {
                                        setProductFocusForInvoices(item.productId!);
                                        setShowInvoiceSelectionPopup(true);
                                      }}
                                      className="text-[10px] font-bold text-sky-600 hover:underline flex items-center"
                                    >
                                      <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"/></svg>
                                      View Sales History
                                    </button>
                                  </div>
                                )}
                                {(() => {
                                  const prod = (store.products || []).find((p: any) => p.id === item.productId);
                                  if (prod?.trackingType === 'SERIAL') {
                                    return (
                                      <div className="space-y-1">
                                        <div className="flex flex-wrap gap-1">
                                          {(item.serialNumbers || []).map((sn, snIdx) => (
                                            <span key={snIdx} className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-rose-100 text-rose-700">
                                              {sn}
                                              {isEditable && (
                                                <button 
                                                  onClick={() => {
                                                    const ni = [...formData.items];
                                                    const currentSerials = [...(ni[idx].serialNumbers || [])];
                                                    currentSerials.splice(snIdx, 1);
                                                    ni[idx] = { ...ni[idx], serialNumbers: currentSerials, quantity: currentSerials.length };
                                                    setFormData({ ...formData, items: ni });
                                                  }}
                                                  className="ml-1 hover:text-rose-900"
                                                >
                                                  ×
                                                </button>
                                              )}
                                            </span>
                                          ))}
                                        </div>
                                        {isEditable && (
                                          <div className="flex space-x-1">
                                            <select 
                                              className="flex-1 text-[10px] border-b border-dashed border-slate-300 focus:border-rose-500 outline-none bg-transparent font-bold text-rose-600"
                                              value=""
                                              onChange={e => {
                                                if (!e.target.value) return;
                                                const ni = [...formData.items];
                                                const currentSerials = [...(ni[idx].serialNumbers || [])];
                                                if (!currentSerials.includes(e.target.value)) {
                                                  currentSerials.push(e.target.value);
                                                  ni[idx] = { ...ni[idx], serialNumbers: currentSerials, quantity: currentSerials.length };
                                                  setFormData({ ...formData, items: ni });
                                                }
                                              }}
                                            >
                                              <option value="">Add Serial Number...</option>
                                              {(prod.serialNumbers || []).filter(sn => !(item.serialNumbers || []).includes(sn)).map(sn => (
                                                <option key={sn} value={sn}>{sn}</option>
                                              ))}
                                            </select>
                                            <button 
                                              onClick={() => {
                                                const ni = [...formData.items];
                                                const available = (prod.serialNumbers || []).filter(sn => !(item.serialNumbers || []).includes(sn));
                                                const needed = Math.max(0, item.quantity - (item.serialNumbers || []).length);
                                                const count = needed > 0 ? needed : (available.length > 0 ? 1 : 0);
                                                const toAdd = available.slice(0, count);
                                                const finalSerials = [...(item.serialNumbers || []), ...toAdd];
                                                ni[idx] = { ...ni[idx], serialNumbers: finalSerials, quantity: finalSerials.length };
                                                setFormData({ ...formData, items: ni });
                                              }}
                                              className="text-[9px] font-bold text-rose-600 hover:underline"
                                            >
                                              Auto-Fill
                                            </button>
                                          </div>
                                        )}
                                      </div>
                                    );
                                  }
                                  return null;
                                })()}
                             </>
                             </td>
                             <td className="py-3 text-right">
                                <input type="number" disabled={!isEditable} className="w-full text-right font-bold outline-none border-b border-transparent focus:border-slate-300 bg-transparent" value={item.quantity || ''} onChange={e => { const ni=[...formData.items]; ni[idx] = { ...ni[idx], quantity: parseFloat(e.target.value)||0 }; setFormData({...formData, items: ni}); }} />
                             </td>
                             <td className="py-3 text-right">
                                <div className="flex items-center justify-end space-x-1">
                                  <input 
                                    type="number" 
                                    disabled={!isEditable} 
                                    className="w-16 text-right font-bold outline-none border-b border-transparent focus:border-slate-300 bg-transparent" 
                                    value={item.unitPrice || ''} 
                                    onChange={e => { 
                                      const ni=[...formData.items]; 
                                      ni[idx] = { ...ni[idx], unitPrice: parseFloat(e.target.value)||0 }; 
                                      setFormData({...formData, items: ni}); 
                                    }} 
                                  />
                                  <div className="flex items-center space-x-1 ml-2 border-l pl-2">
                                    <input 
                                      type="number" 
                                      disabled={!isEditable} 
                                      className="w-10 text-center bg-transparent outline-none font-bold text-rose-500 text-[10px]" 
                                      value={item.discountRate || ''} 
                                      onChange={e => { 
                                        const ni=[...formData.items]; 
                                        ni[idx] = { ...ni[idx], discountRate: parseFloat(e.target.value)||0 }; 
                                        setFormData({...formData, items:ni}); 
                                      }} 
                                    />
                                    <div className="flex items-center bg-slate-100 rounded-md p-0.5">
                                      <button
                                        type="button"
                                        disabled={!isEditable}
                                        onClick={() => {
                                          if (item.discountMode === 'PERCENT') return;
                                          const newMode = 'PERCENT';
                                          const ni = [...formData.items];
                                          const currentItem = ni[idx];
                                          const lineGross = currentItem.quantity * currentItem.unitPrice;
                                          let newRate = currentItem.discountRate || 0;
                                          if (lineGross > 0) {
                                            newRate = (newRate / lineGross) * 100;
                                          }
                                          ni[idx] = { ...currentItem, discountMode: newMode, discountRate: parseFloat(newRate.toFixed(2)) };
                                          setFormData({ ...formData, items: ni });
                                        }}
                                        className={`px-1.5 py-0.5 text-[10px] font-bold rounded transition-all ${item.discountMode === 'PERCENT' || !item.discountMode ? 'bg-white shadow-sm text-rose-600' : 'text-slate-400 hover:text-slate-600'}`}
                                      >
                                        %
                                      </button>
                                      <button
                                        type="button"
                                        disabled={!isEditable}
                                        onClick={() => {
                                          if (item.discountMode === 'FIXED') return;
                                          const newMode = 'FIXED';
                                          const ni = [...formData.items];
                                          const currentItem = ni[idx];
                                          const lineGross = currentItem.quantity * currentItem.unitPrice;
                                          let newRate = currentItem.discountRate || 0;
                                          if (lineGross > 0) {
                                            newRate = lineGross * (newRate / 100);
                                          }
                                          ni[idx] = { ...currentItem, discountMode: newMode, discountRate: parseFloat(newRate.toFixed(2)) };
                                          setFormData({ ...formData, items: ni });
                                        }}
                                        onKeyDown={e => {
                                          if (e.key === 'Tab' && !e.shiftKey && idx === formData.items.length - 1) {
                                            const ni = [...formData.items, { id: generateUUID(), type: 'PRODUCT', description: '', quantity: 1, unitPrice: 0, discountRate: 0 }];
                                            setFormData({...formData, items: ni});
                                          }
                                        }}
                                        className={`px-1.5 py-0.5 text-[10px] font-bold rounded transition-all ${item.discountMode === 'FIXED' ? 'bg-white shadow-sm text-rose-600' : 'text-slate-400 hover:text-slate-600'}`}
                                      >
                                        ৳
                                      </button>
                                    </div>
                                  </div>
                                </div>
                             </td>
                             <td className="py-3 text-right font-black tabular-nums">
                                <div className="flex items-center justify-end space-x-2">
                                  <span>{formatBDT(item.lineValue || 0)}</span>
                                  {isEditable && (
                                    <button 
                                      onClick={() => {
                                        const ni = [...formData.items];
                                        ni.splice(idx, 1);
                                        setFormData({...formData, items: ni});
                                      }}
                                      className="opacity-100 transition-opacity text-slate-300 hover:text-rose-500 transition-all"
                                    >
                                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                                    </button>
                                  )}
                                </div>
                              </td>
                          </tr>
                       ))}
                    </tbody>
                 </table>
                 {isEditable && (
                   <button onClick={addLine} className="mt-6 text-rose-500 font-bold text-xs hover:underline flex items-center group">
                      <svg className="w-3.5 h-3.5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M12 4v16m8-8H4"/></svg>
                      Add refund line
                   </button>
                 )}
               </div>
            ) : (
               <div className="space-y-6 animate-in fade-in duration-300">
                  <h3 className="text-xs font-black uppercase text-slate-400 mb-3 tracking-widest">Double-Entry Impact (GAAP Reversal)</h3>
                  {linkedJournalEntry ? (
                    <table className="w-full text-left border rounded overflow-hidden">
                      <thead className="bg-[#f8f9fa] border-b text-[11px] font-bold uppercase text-slate-600">
                        <tr>
                          <th className="px-6 py-4">Account</th>
                          <th className="px-6 py-4 text-right">Debit (৳)</th>
                          <th className="px-6 py-4 text-right">Credit (৳)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y text-[13px] tabular-nums">
                        {(linkedJournalEntry.lines || []).map((l: any, i: number) => {
                          const acc = (store.accounts || []).find((a: Account) => a.id === l.accountId || a.code === l.accountId);
                          return (
                            <tr key={i} className="hover:bg-slate-50 transition-colors">
                              <td className="px-6 py-4 font-bold text-rose-700">{acc ? `${acc.code} - ${acc.name}` : l.accountId}</td>
                              <td className="px-6 py-4 text-right font-medium">{l.debit > 0 ? formatAccounting(l.debit) : '-'}</td>
                              <td className="px-6 py-4 text-right font-medium">{l.credit > 0 ? formatAccounting(l.credit) : '-'}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot className="bg-slate-50 border-t font-black text-slate-900">
                        <tr>
                          <td className="px-6 py-4 text-xs uppercase text-slate-400">Total Entry Balance</td>
                          <td className="px-6 py-4 text-right">{formatAccounting((linkedJournalEntry.lines || []).reduce((s, l) => s + (l.debit || 0), 0))}</td>
                          <td className="px-6 py-4 text-right">{formatAccounting((linkedJournalEntry.lines || []).reduce((s, l) => s + (l.credit || 0), 0))}</td>
                        </tr>
                      </tfoot>
                    </table>
                  ) : (
                    <div className="py-10 text-center text-slate-300 italic border-2 border-dashed rounded-lg bg-slate-50/50">Ledger movement will be visible after Note confirmation.</div>
                  )}
               </div>
            )}

            <div className="mt-auto pt-10 flex justify-end">
               <div className="w-80 space-y-2 p-6 bg-slate-50 rounded border border-rose-100 shadow-inner">
                  <div className="flex justify-between text-sm text-slate-600"><span>Untaxed Refund</span><span className="font-bold">{formatBDT(totals.untaxed)}</span></div>
                  <div className="flex justify-between text-xl font-black text-rose-600 border-t-2 border-rose-600 pt-4 mt-2"><span>Total Refund</span><span>{formatBDT(totals.total)}</span></div>
               </div>
            </div>
             {editingId && (
               <Chatter 
                 messages={currentCN?.messages || []} 
                 users={store.users} 
                 onSendMessage={(body) => store.updateCreditNote(editingId, { 
                   messages: [...(currentCN?.messages || []), {
                     id: generateUUID(),
                     authorId: store.currentUser?.id || 'user-1',
                     body,
                     date: new Date().toISOString(),
                     type: 'comment'
                   }]
                 })}
                 entityType="Credit Note"
               />
             )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-[#F1F1F1] overflow-hidden">
      <SmartFilterBar 
        title={<h2 className="text-2xl font-bold text-slate-800">Credit Notes</h2>}
        actions={
          <div className="flex items-center space-x-2">
            <button 
              onClick={() => {
                if (store.setActiveTab) store.setActiveTab('credit_note_analysis');
                else window.dispatchEvent(new CustomEvent('accounting-nav', { detail: { screen: 'CREDIT_NOTE_ANALYSIS' } }));
              }} 
              className="px-6 py-2 bg-indigo-600 text-white rounded font-bold shadow-md hover:brightness-110 active:scale-95 transition-all text-sm flex items-center space-x-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/></svg>
              <span>Advance Analysis</span>
            </button>
            <button onClick={() => { setEditingId(null); setFormData({ customerId: '', items: [{ id: generateUUID(), type: 'PRODUCT', description: '', quantity: 1, unitPrice: 0, discountRate: 0 }], date: getOpDateBST() }); setShowForm(true); }} className="bg-rose-600 text-white px-8 py-2 rounded font-bold shadow-md hover:brightness-110 active:scale-95 transition-all">New refund</button>
            <ExportButtons onExport={handleExport} />
          </div>
        }
        filters={filterState} 
        setFilters={setFilterState} 
        contacts={store.contacts || []}
        products={store.products || []}
        users={store.users || []}
        statuses={[
          { id: 'DRAFT', label: 'Draft' },
          { id: 'OPEN', label: 'Open' },
          { id: 'CLOSED', label: 'Closed' },
          { id: 'VOID', label: 'Void' },
        ]}
        type="credit_note"
        placeholder="Search by Credit Note #, Customer, Reference..."
      />
      <div className="flex-1 overflow-auto bg-white m-6 rounded-lg shadow-xl border border-slate-200">
        <table className="w-full text-left text-sm border-collapse">
          <thead className="bg-slate-800 text-white text-[10px] font-black uppercase tracking-widest">
            <tr>
              {columns.find(c => c.id === 'number')?.visible && <th className="p-4 pl-6">Note #</th>}
              {columns.find(c => c.id === 'customer')?.visible && <th className="p-4">Customer</th>}
              {columns.find(c => c.id === 'date')?.visible && <th className="p-4">Date & Time</th>}
              {columns.find(c => c.id === 'amount')?.visible && <th className="p-4 text-right">Refund Total</th>}
              {columns.find(c => c.id === 'status')?.visible && <th className="p-4">Status</th>}
              {columns.find(c => c.id === 'createdBy')?.visible && <th className="p-4">Created By</th>}
              <th className="p-4 text-right w-10">
                <ColumnSelector columns={columns} onChange={setColumns} />
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {paginatedCNs.length === 0 ? (
               <tr><td colSpan={columns.filter(c => c.visible).length + 1} className="p-20 text-center italic text-slate-300 uppercase font-black">No Credit Notes Found</td></tr>
            ) : paginatedCNs.map((cn: CreditNote) => (
              <tr key={cn.id} className="hover:bg-slate-50 cursor-pointer" onClick={() => { setEditingId(cn.id); setFormData({ customerId: cn.customerId, items: cn.items, date: cn.date }); setShowForm(true); }}>
                {columns.find(c => c.id === 'number')?.visible && <td className="p-4 pl-6 font-bold text-rose-600">{cn.number}</td>}
                {columns.find(c => c.id === 'customer')?.visible && <td className="p-4 font-medium text-slate-700">{(store.contacts || []).find((c:any)=>c.id===cn.customerId)?.name || (cn.customerId ? `Unknown Customer (ID: ${cn.customerId.substring(0,6)}...)` : '---')}</td>}
                {columns.find(c => c.id === 'date')?.visible && <td className="p-4 text-slate-500 whitespace-nowrap">{formatDateTime(cn.createdAt || cn.updatedAt || cn.date)}</td>}
                {columns.find(c => c.id === 'amount')?.visible && <td className="p-4 text-right font-black tabular-nums">{formatBDT(cn.total)}</td>}
                {columns.find(c => c.id === 'status')?.visible && <td className="p-4">
                  <span className={`px-4 py-1 rounded-full text-[10px] font-black uppercase tracking-tighter ${
                    cn.status === 'CLOSED' ? 'bg-emerald-100 text-emerald-700' : 
                    (cn.status === 'POSTED' || cn.status === 'OPEN') ? 'bg-sky-100 text-sky-700' : 
                    cn.status === 'DELETED' ? 'bg-rose-100 text-rose-700' : 
                    'bg-slate-100 text-slate-500'
                  }`}>
                    {cn.status === 'DELETED' ? 'Deleted' : cn.status}
                  </span>
                </td>}
                {columns.find(c => c.id === 'createdBy')?.visible && (
                   <td className="p-4 text-slate-500">
                     {store.resolveUserName(cn.createdById)}
                   </td>
                )}
                <td className="p-4" onClick={e => e.stopPropagation()}>
                  {cn.status === 'DELETED' && store.currentUser?.roleId === 'role-admin' && (
                    <div className="flex items-center justify-end space-x-2">
                       <button 
                         onClick={() => store.restoreRecord('creditNote', cn.id)}
                         className="px-2 py-1 text-[9px] font-black uppercase text-rose-600 hover:bg-rose-50 rounded border border-rose-200"
                       >
                         Restore
                       </button>
                       <button 
                         onClick={() => { if(confirm('Permanently delete this credit note?')) store.permanentDeleteRecord('creditNote', cn.id); }}
                         className="px-2 py-1 text-[9px] font-black uppercase text-rose-600 hover:bg-rose-50 rounded border border-rose-200"
                       >
                         Delete
                       </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <Pagination 
          currentPage={currentPage} 
          totalPages={totalPages} 
          totalItems={filteredCNs.length} 
          itemsPerPage={pageSize} 
          onPageChange={setCurrentPage} 
          onItemsPerPageChange={setPageSize}
        />
      </div>
    </div>
  );
};

export default CreditNoteManager;
