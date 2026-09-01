import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import {  jsPDF } from "jspdf";
import { Invoice, InvoiceItem, Product, Contact, ContactType, InvoiceItemType, DiscountMode, Account, JournalEntry, Payment } from '../types';
import { formatBDT, formatNumber, formatDateTime, exportToXLSX, exportToPDF, getOpDateBST, generateUUID } from '../constants';
import { generateInvoicePDF, generateBulkInvoicePDF } from '../services/pdfService';
import SmartFilterBar, { SmartFilterState } from './SmartFilterBar';
import Chatter from './Chatter';
import QuickProductModal from './QuickProductModal';
import QuickContactModal from './QuickContactModal';
import ExportButtons from './ExportButtons';
import Pagination from './Pagination';
import ColumnSelector, { useColumns, ColumnDef } from './ColumnSelector';
import { supabase } from '../lib/supabase';
import { dbService } from '../services/db';

const INVOICE_COLORS = {
  primary: 'bg-amber-600',
  primaryHover: 'hover:bg-amber-700',
  secondary: 'bg-amber-500',
  border: 'border-[#dee2e6]',
  headerBg: 'bg-[#f8f9fa]',
  textMuted: 'text-[#666666]',
  link: 'text-amber-600'
};

import SearchableSelect from './SearchableSelect';
// --- MAIN COMPONENT ---

interface InvoiceManagerProps {
  store: any;
  defaultCreate?: boolean;
  initialSearch?: string | null;
  initialContext?: { brand?: string; category?: string } | null;
  onClearSearch?: () => void;
  onNavigate?: (tab: string, filter?: any, ctx?: any) => void;
}


export function calculateInvoiceProfit(inv: any, products: any[], creditNotes: any[], productMap?: Map<string, any>, creditNotesMap?: Map<string, any[]>) {
  const originalCost = (inv.items || []).reduce((sum: number, item: any) => {
    if (item.type === 'PRODUCT' && item.productId) {
      const prod = productMap ? productMap.get(item.productId) : products.find((p: any) => p.id === item.productId);
      const costPerUnit = typeof item.costPriceAtSale === 'number'
        ? item.costPriceAtSale
        : (typeof item.cost_price_at_sale === 'number'
            ? item.cost_price_at_sale
            : (prod ? (prod.costPrice !== undefined ? prod.costPrice : (prod.cost_price !== undefined ? Number(prod.cost_price) : 0)) : 0));
      return sum + (costPerUnit * item.quantity);
    }
    return sum;
  }, 0);

  const returnCreditNotes = creditNotesMap ? (creditNotesMap.get(inv.id) || []) : (creditNotes || []).filter((cn: any) => 
    (cn.status === 'POSTED' || cn.status === 'CLOSED') && cn.originInvoiceId === inv.id
  );

  const returnedCost = returnCreditNotes.reduce((sum: number, cn: any) => {
    return sum + (cn.items || []).reduce((iSum: number, item: any) => {
      if (item.type === 'PRODUCT' && item.productId) {
         const prod = products.find((p: any) => p.id === item.productId);
         const costPerUnit = typeof item.costPriceAtSale === 'number'
           ? item.costPriceAtSale
           : (typeof item.cost_price_at_sale === 'number'
               ? item.cost_price_at_sale
               : (prod ? (prod.costPrice !== undefined ? prod.costPrice : (prod.cost_price !== undefined ? Number(prod.cost_price) : 0)) : 0));
         return iSum + (costPerUnit * item.quantity);
      }
      return iSum;
    }, 0);
  }, 0);

  const returnedRevenue = returnCreditNotes.reduce((sum: number, cn: any) => sum + (cn.total || 0), 0);
  const netRevenue = (inv.total || 0) - returnedRevenue;
  const netCost = originalCost - returnedCost;
  
  if (inv.status === 'FULL_REFUNDED' || netRevenue <= 0) {
     return { profit: 0, marginPercent: 0, netRevenue: 0, netCost: 0 };
  }

  const profit = netRevenue - netCost;
  const marginPercent = netRevenue > 0 ? (profit / netRevenue) * 100 : 0;

  return { profit, marginPercent, netRevenue, netCost };
}

const InvoiceManager: React.FC<InvoiceManagerProps> = ({ store, defaultCreate, initialSearch, initialContext, onClearSearch, onNavigate }) => {
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'lines' | 'journal'>('lines');
  
  const [filterState, setFilterState] = useState<SmartFilterState>({
    searchQuery: initialSearch || '',
    startDate: (() => {
      const d = new Date();
      d.setDate(1);
      d.setMonth(0);
      return d.toISOString().split('T')[0];
    })(),
    endDate: (() => {
      const d = new Date();
      d.setDate(d.getDate() + 2);
      return d.toISOString().split('T')[0];
    })(),
    datePreset: 'last30',
    contactId: '',
    status: '',
    reference: '', customerNote: '', deliveryPerson: '', srId: '',
    minAmount: '',
    maxAmount: '',
    selectedCategories: initialContext?.category && initialContext.category !== 'All' ? [initialContext.category] : [],
    selectedBrands: initialContext?.brand && initialContext.brand !== 'All' ? [initialContext.brand] : [],
  });
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(80);
  const [selectedInvoiceIds, setSelectedInvoiceIds] = useState<string[]>([]);
  const [showBatchPaymentModal, setShowBatchPaymentModal] = useState(false);
  const [isSubmittingBatch, setIsSubmittingBatch] = useState(false);
  const [batchPaymentData, setBatchPaymentData] = useState({
    date: getOpDateBST(),
    method: 'CASH',
    reference: '', deliveryPerson: '', srId: '',
    amount: 0,
    paymentCategory: ''
  });

  const [columns, setColumns] = useColumns('invoice_list', [
    { id: 'number', label: 'Number', visible: true },
    { id: 'customer', label: 'Customer', visible: true },
    { id: 'date', label: 'Invoice Date', visible: true },
    { id: 'reference', label: 'Reference', visible: true },
    { id: 'total', label: 'Total', visible: true },
    { id: 'amount_due', label: 'Amount Due', visible: true },
    { id: 'margin_amount', label: 'Profit (Amt)', visible: true },
    { id: 'margin_percent', label: 'Profit (%)', visible: true },
    { id: 'status', label: 'Status', visible: true },
    { id: 'createdBy', label: 'Created By', visible: false }
  ]);

  useEffect(() => {
    let active = true;
    if (initialSearch || initialContext) {
      setFilterState(prev => ({ 
        ...prev, 
        searchQuery: initialSearch || prev.searchQuery,
        selectedCategories: initialContext?.category && initialContext.category !== 'All' ? [initialContext.category] : prev.selectedCategories,
        selectedBrands: initialContext?.brand && initialContext.brand !== 'All' ? [initialContext.brand] : prev.selectedBrands,
      }));
      if (initialSearch) {
        const searchUpper = initialSearch.toUpperCase();
        const exactMatch = store.paginatedInvoices?.find((b: any) => b.number === initialSearch || b.id === initialSearch || b.id?.toUpperCase() === searchUpper)
            || store.invoices?.find((b: any) => b.number === initialSearch || b.id === initialSearch || b.id?.toUpperCase() === searchUpper);
        if (exactMatch && !editingId) {
            setEditingId(exactMatch.id);
            if (onClearSearch) onClearSearch();
        } else if (!editingId) {
            const fetchAndSelect = async () => {
              try {
                const { data, error } = await supabase.from('docs_invoices')
                  .select('*')
                  .or(`id.eq.${initialSearch},invoice_number.eq.${initialSearch},reference.eq.${initialSearch}`)
                  .maybeSingle();
                
                if (!active) return;

                if (data) {
                  setEditingId(data.id);
                }
                if (onClearSearch) onClearSearch();
              } catch (e) {
                console.error("Failed to select invoice statically:", e);
                if (!active) return;
                if (onClearSearch) onClearSearch();
              }
            };
            fetchAndSelect();
        }
      } else {
        if (onClearSearch) onClearSearch();
      }
    }
    return () => { active = false; };
  }, [initialSearch, initialContext, store.paginatedInvoices, store.invoices]);

  const [quickCustomerName, setQuickCustomerName] = useState<string | null>(null);
  const [quickProductName, setQuickProductName] = useState<{ name: string; index: number } | null>(null);

  const [colWidths, setColWidths] = useState([40, 10, 15, 15, 20]); // Percentages
  const resizingRef = useRef<{ index: number; startX: number; startWidths: number[] } | null>(null);
  const tableRef = useRef<HTMLDivElement>(null);

  const [focusedPriceIndex, setFocusedPriceIndex] = useState<number | null>(null);
  const [priceHistory, setPriceHistory] = useState<{ rate: number; date: string; number: string }[]>([]);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!resizingRef.current || !tableRef.current) return;
    const { index, startX, startWidths } = resizingRef.current;
    const tableWidth = tableRef.current.getBoundingClientRect().width;
    if (tableWidth === 0) return;
    
    const deltaPercent = ((e.clientX - startX) / tableWidth) * 100;
    
    setColWidths(prevWidths => {
      const newWidths = [...startWidths];
      const nextIndex = index + 1;
      
      if (nextIndex < newWidths.length) {
        const newCurrentWidth = Math.max(5, startWidths[index] + deltaPercent);
        const newNextWidth = Math.max(5, startWidths[nextIndex] - (newCurrentWidth - startWidths[index]));
        
        newWidths[index] = newCurrentWidth;
        newWidths[nextIndex] = newNextWidth;
        return newWidths;
      }
      return prevWidths;
    });
  }, []);

  const handleMouseUp = useCallback(() => {
    resizingRef.current = null;
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);
    document.body.style.cursor = '';
  }, [handleMouseMove]);

  const handleMouseDown = (index: number, e: React.MouseEvent) => {
    if (!tableRef.current) return;
    resizingRef.current = { 
      index, 
      startX: e.clientX, 
      startWidths: [...colWidths] 
    };
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.body.style.cursor = 'col-resize';
  };

  const fetchPriceHistory = async (productId: string) => {
    if (!productId || !formData.customerId) {
      setPriceHistory([]);
      return;
    }

    const history = (store.invoices || [])
      .filter((b: Invoice) => b.customerId === formData.customerId && b.status !== 'DRAFT')
      .sort((a: Invoice, b: Invoice) => String(b.date || '').localeCompare(String(a.date || '')));

    let rates: { rate: number; date: string; number: string }[] = [];
    for (const b of history) {
      const item = (b.items || []).find((it: InvoiceItem) => it.productId === productId);
      if (item) {
        rates.push({ rate: item.unitPrice, date: b.date || '', number: b.number || '' });
        if (rates.length >= 2) break;
      }
    }

    if (rates.length < 2) {
      try {
        const { data: invData } = await supabase
          .from('docs_invoices')
          .select('id, invoice_number, invoice_date, data')
          .eq('customer_id', formData.customerId)
          .neq('status', 'DRAFT')
          .order('invoice_date', { ascending: false })
          .limit(10);
        
        if (invData && invData.length > 0) {
          const invIds = invData.map((d: any) => d.id);
          const { data: linesData } = await supabase
            .from('docs_invoice_lines')
            .select('invoice_id, unit_price, data')
            .in('invoice_id', invIds)
            .eq('product_id', productId);
            
          if (linesData && linesData.length > 0) {
            rates = [];
            for (const inv of invData) {
              const line = linesData.find((l: any) => l.invoice_id === inv.id);
              if (line) {
                rates.push({ rate: line.unit_price || line.data?.unitPrice || 0, date: inv.invoice_date || inv.data?.date || '', number: inv.invoice_number || inv.data?.number || '' });
                if (rates.length >= 2) break;
              }
            }
          }
        }
      } catch (e) {
        console.warn("Could not fetch price history from DB", e);
      }
    }

    setPriceHistory(rates);
  };

  const [showNoteIndices, setShowNoteIndices] = useState<Set<number>>(new Set());
  const toggleNote = (idx: number) => {
    const newSet = new Set(showNoteIndices);
    if (newSet.has(idx)) newSet.delete(idx);
    else newSet.add(idx);
    setShowNoteIndices(newSet);
  };
  const [formData, setFormData] = useState({
    customerId: '',
    items: [] as InvoiceItem[],
    date: getOpDateBST(),
    dueDate: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    reference: '', deliveryPerson: '', srId: '', paymentMethod: 'CREDIT',
  });

  const productOptions = useMemo(() => {
    const opts = (store.products || []).map((p:any)=>{
      const coId = (store.activeCompanyIds?.[0] || store.companies?.[0]?.id || '');
      const stock = p.quantityOnHand || 0;
      return {
      id:p.id, 
      name:p.name, 
      extra: `SKU: ${p.sku} | On Hand: ${stock} | Last Pur: ${new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'BDT' }).format(p.costPrice || 0)}`,
      subExtra: new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'BDT' }).format(p.price || 0),
      category: p.category,
      serialNumbers: p.serialNumbers,
      stock: stock,
      margin: p.price > 0 ? ((p.price - p.costPrice) / p.price) * 100 : 0
      };
    });

    (formData.items || []).forEach(item => {
      if (item.type === 'PRODUCT' && item.productId && !opts.some(o => o.id === item.productId)) {
        opts.push({
          id: item.productId,
          name: item.description || 'Unknown Product',
          extra: 'Not loaded entirely in view',
          subExtra: '',
          category: '',
          serialNumbers: [],
          stock: 0,
          margin: 0
        });
      }
    });

    return opts;
  }, [store.products, formData.items]);

  const currentInvoice = useMemo(() => {
    if (!editingId) return null;
    return (store.paginatedInvoices || []).find((b: Invoice) => b.id === editingId) ||
           (store.invoices || []).find((b: Invoice) => b.id === editingId) ||
           null;
  }, [editingId, store.paginatedInvoices, store.invoices]);
  
  
  const rawStatus = currentInvoice?.status || 'DRAFT';
  const detailPaid = (store.payments || []).filter((p: any) => 
    p.status === 'POSTED' && (p.invoiceId === currentInvoice?.id || (p.appliedInvoices || []).some((a: any) => a.invoiceId === currentInvoice?.id))
  ).reduce((s: number, p: any) => {
    const a = (p.appliedInvoices || []).find((ai: any) => ai.invoiceId === currentInvoice?.id);
    return s + (a ? a.amount : (p.invoiceId === currentInvoice?.id ? p.amount : 0));
  }, 0);
  const detailCredits = (store.creditNotes || []).filter((cn: any) => 
    (cn.status === 'POSTED' || cn.status === 'CLOSED') && (
      cn.originInvoiceId === currentInvoice?.id || 
      (cn.appliedInvoices || []).some((a: any) => a.invoiceId === currentInvoice?.id)
    )
  ).reduce((s: number, cn: any) => {
    if (cn.originInvoiceId === currentInvoice?.id) return s + (cn.total || 0);
    const applied = (cn.appliedInvoices || []).find((a: any) => a.invoiceId === currentInvoice?.id);
    return s + (applied?.amount || 0);
  }, 0);
  const detailBalance = currentInvoice ? Math.max(0, currentInvoice.total - detailPaid - detailCredits) : 0;
  const status = rawStatus === 'DELETED' ? 'DELETED' : (detailBalance <= 0 && rawStatus !== 'DRAFT') ? 'PAID' : rawStatus;

  const isEditable = (!editingId && store.hasPermission('invoice_create')) || (editingId && status === 'DRAFT' && store.hasPermission('invoice_edit'));
  const isPosted = status === 'POSTED' || status === 'PAID' || status === 'PARTIAL' || status === 'IN_PAYMENT';
  const isPaid = status === 'PAID';

  const [fetchedJournal, setFetchedJournal] = useState<JournalEntry | null>(null);

  useEffect(() => {
    if (currentInvoice?.journalEntryId && !store.allEntries?.find((e: JournalEntry) => e.id === currentInvoice.journalEntryId)) {
      const fetchIt = async () => {
        try {
          
          const { data, error } = await supabase.from('docs_journals').select('*').eq('id', currentInvoice.journalEntryId).single();
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
  }, [currentInvoice?.journalEntryId, store.allEntries]);

  const linkedJournalEntry = useMemo(() => 
    currentInvoice?.journalEntryId 
      ? (store.allEntries || []).find((e: JournalEntry) => e.id === currentInvoice.journalEntryId) || fetchedJournal
      : null, 
    [currentInvoice?.journalEntryId, store.allEntries, fetchedJournal]
  );

  const linkedPayments = useMemo(() => 
    (store.payments || []).filter((p: Payment) => 
      p.status !== 'DELETED' && p.type === 'PAYMENT' && (p.invoiceId === currentInvoice?.id || (p.appliedInvoices || []).some(a => a.invoiceId === currentInvoice?.id))
    ),
    [currentInvoice, store.payments]
  );

  const paymentsTotal = useMemo(() => linkedPayments.reduce((s, p) => {
    if (p.status !== 'POSTED') return s;
    const a = (p.appliedInvoices || []).find((ai: any) => ai.invoiceId === currentInvoice?.id);
    if (a) return s + a.amount;
    if (p.invoiceId === currentInvoice?.id) return s + p.amount;
    return s;
  }, 0), [linkedPayments, currentInvoice?.id]);

  const paymentEntry = useMemo(() => {
    const lastPayment = linkedPayments[linkedPayments.length - 1];
    return lastPayment?.journalEntryId 
      ? (store.allEntries || []).find((e: JournalEntry) => e.id === lastPayment.journalEntryId) 
      : null;
  }, [linkedPayments, store.allEntries]);

  useEffect(() => {
    if (defaultCreate) {
      setEditingId(null);
      const cs = (store.contacts || []).find((c:any)=>c.name?.toLowerCase().includes('cash sale') || c.type==='CASH');
      setFormData({ 
        customerId: cs ? cs.id : '', 
        items: [{ id: generateUUID(), type: 'PRODUCT', description: '', quantity: 1, unitPrice: 0 }], 
        date: getOpDateBST(), 
        dueDate: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        reference: '', customerNote: '', deliveryPerson: '', srId: ''
      });
      setShowForm(true);
    }
  }, [defaultCreate]);

  const [draggedItemIndex, setDraggedItemIndex] = useState<number | null>(null);
  const [dragOverItemIndex, setDragOverItemIndex] = useState<number | null>(null);
  const [advancedRowId, setAdvancedRowId] = useState<string | null>(null);

  const handleDragStartItem = (e: React.DragEvent, index: number) => {
    setDraggedItemIndex(index);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragEnterItem = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedItemIndex === null || draggedItemIndex === index) return;
    setDragOverItemIndex(index);
  };

  const handleDragOverItem = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDropItem = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedItemIndex !== null && draggedItemIndex !== index) {
      setFormData((prev: any) => {
        const newItems = [...prev.items];
        const [movedItem] = newItems.splice(draggedItemIndex, 1);
        newItems.splice(index, 0, movedItem);
        return { ...prev, items: newItems };
      });
    }
    setDraggedItemIndex(null);
    setDragOverItemIndex(null);
  };

  const handleDragEndItem = (e: React.DragEvent) => {
    setDraggedItemIndex(null);
    setDragOverItemIndex(null);
  };

  const totals = useMemo(() => {
    let sub = 0;
    let disc = 0;
    let totalCost = 0;
    let runningSubtotal = 0;
    let hasLineDiscount = false;

    // 1. Calculate Gross Subtotal exactly as sum of (quantity * unitPrice) for all line items
    sub = (formData.items || []).reduce((acc, item) => {
      if (item.type === 'PRODUCT' || item.type === 'SERVICE') {
        return acc + Math.round((item.quantity * item.unitPrice) * 100) / 100;
      }
      return acc;
    }, 0);
    sub = Math.round(sub * 100) / 100;

    const itemsWithCalc = (formData.items || []).map(item => {
      let lineValue = 0;
      let lineDisc = 0;

      if (item.type === 'PRODUCT') {
        const prod = (store.products || []).find((p: any) => p.id === item.productId);
        const lineGross = Math.round((item.quantity * item.unitPrice) * 100) / 100;

        if (item.discountMode === 'FIXED') {
          lineDisc = Math.round((item.discountRate || 0) * 100) / 100;
        } else {
          lineDisc = Math.round((lineGross * ((item.discountRate || 0) / 100)) * 100) / 100;
        }

        if (lineDisc > 0) hasLineDiscount = true;
        lineValue = Math.round((lineGross - lineDisc) * 100) / 100;
        disc = Math.round((disc + lineDisc) * 100) / 100;
        totalCost = Math.round((totalCost + ((prod?.costPrice || 0) * item.quantity)) * 100) / 100;
        runningSubtotal = Math.round((runningSubtotal + lineValue) * 100) / 100;
      } else if (item.type === 'SERVICE') {
        const lineGross = Math.round((item.quantity * item.unitPrice) * 100) / 100;
        
        if (item.discountMode === 'FIXED') {
          lineDisc = Math.round((item.discountRate || 0) * 100) / 100;
        } else {
          lineDisc = Math.round((lineGross * ((item.discountRate || 0) / 100)) * 100) / 100;
        }
        
        if (lineDisc > 0) hasLineDiscount = true;
        lineValue = Math.round((lineGross - lineDisc) * 100) / 100;
        disc = Math.round((disc + lineDisc) * 100) / 100;
        runningSubtotal = Math.round((runningSubtotal + lineValue) * 100) / 100;
      } else if (item.type === 'TAX') {
        lineValue = item.manualValue !== undefined ? Math.round(item.manualValue * 100) / 100 : Math.round((runningSubtotal * ((item.taxRate || 0) / 100)) * 100) / 100;
        runningSubtotal = Math.round((runningSubtotal + lineValue) * 100) / 100;
      } else if (item.type === 'DISCOUNT') {
        if (item.discountMode === 'PERCENT') {
          lineValue = -Math.round((runningSubtotal * ((item.discountRate || 0) / 100)) * 100) / 100;
        } else {
          lineValue = -Math.round((item.discountRate || 0) * 100) / 100;
        }
        lineDisc = Math.abs(lineValue);
        disc = Math.round((disc + lineDisc) * 100) / 100;
        runningSubtotal = Math.round((runningSubtotal + lineValue) * 100) / 100;
      } else if (item.type === 'SUBTOTAL') {
        lineValue = item.manualValue !== undefined ? Math.round(item.manualValue * 100) / 100 : runningSubtotal;
        runningSubtotal = Math.round(lineValue * 100) / 100;
      }

      return { ...item, lineValue, discountValue: lineDisc };
    });

    const tax = Math.round(itemsWithCalc.filter(i => i.type === 'TAX').reduce((acc, i) => acc + (i.lineValue || 0), 0) * 100) / 100;
    
    // 3. Fix total (Grand Total): MUST be calculated as subtotal - discountTotal + taxes
    const totalAmount = Math.round((sub - disc + tax) * 100) / 100;
    const amountDue = Math.max(0, Math.round((totalAmount - paymentsTotal) * 100) / 100);

    return { itemsWithCalc, sub, disc, untaxed: Math.round((sub - disc) * 100) / 100, tax, total: totalAmount, amountDue, hasLineDiscount };
  }, [formData.items, store.products, paymentsTotal]);

  const handleBatchPayment = () => {
    if (selectedInvoiceIds.length === 0) return;
    const selectedInvoices = selectedInvoiceIds.map(id => (
       store.invoices?.find((b: Invoice) => b.id === id) || 
       store.paginatedInvoices?.data?.find((b: Invoice) => b.id === id) ||
       paginatedInvoices.find((b: Invoice) => b.id === id)
    )).filter(Boolean);

    // Group selected invoices by customer
    const invoicesGroupByCustomer = selectedInvoices.reduce((acc: any, invoice: any) => {
      acc[invoice.customerId] = acc[invoice.customerId] || [];
      acc[invoice.customerId].push(invoice);
      return acc;
    }, {});

    let netBatchTotal = 0;

    for (const [customerId, invoices] of Object.entries(invoicesGroupByCustomer)) {
        const customerDue = (invoices as any[]).reduce((sum: number, invoice: any) => {
          const paid = (store.payments || []).filter((p: any) => p.status === 'POSTED' && p.type === 'PAYMENT' && (p.invoiceId === invoice.id || (p.appliedInvoices || p.applied_invoices || []).some((a: any) => a.invoiceId === invoice.id))).reduce((s: number, p: any) => {
            if (p.invoiceId === invoice.id) return s + p.amount;
            const a = (p.appliedInvoices || p.applied_invoices || []).find((ai: any) => ai.invoiceId === invoice.id);
            return s + (a?.amount || 0);
          }, 0);
          return sum + Math.max(0, invoice.total - paid);
        }, 0);

        const unallocatedAdvances = (store.payments || []).filter((p: any) => p.status === 'POSTED' && p.type === 'PAYMENT' && (p.contactId === customerId || p.contact_id === customerId))
          .reduce((sum, p) => {
            const applied = (p.appliedInvoices || p.applied_invoices || []).reduce((s: number, a: any) => s + Number(a.amount || 0), 0) + (p.invoiceId ? Number(p.amount) : 0);
            const unallocated = Number(p.amount || 0) - applied;
            return sum + (unallocated > 0 ? unallocated : 0);
          }, 0);

        netBatchTotal += Math.max(0, customerDue - unallocatedAdvances);
    }
    
    // Group customers for a cleaner reference if multiple
    const customerIds = new Set(selectedInvoices.map((b: any) => b.customerId));

    setBatchPaymentData({
      date: getOpDateBST(),
      method: 'CASH',
      reference: `Batch Pay: ${selectedInvoices.length > 5 ? selectedInvoices.length + ' Invoices' : selectedInvoices.map((b: any) => b.number).join(', ')}${customerIds.size > 1 ? ' (Mixed Customers)' : ''}`,
      amount: netBatchTotal,
      paymentCategory: ''
    });
    setShowBatchPaymentModal(true);
  };

  const confirmBatchPayment = async () => {
    if (isSubmittingBatch) return;
    setIsSubmittingBatch(true);
    try {
      if (!batchPaymentData.reference) {
         throw new Error("Memo/Reference is required.");
      }
      
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      
      const response = await fetch('/api/batch-payment', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          type: 'INVOICE',
          documentIds: selectedInvoiceIds,
          amount: batchPaymentData.amount,
          date: batchPaymentData.date,
          method: batchPaymentData.method,
          paymentCategory: batchPaymentData.paymentCategory,
          reference: batchPaymentData.reference,
          accountId: batchPaymentData.accountId,
          companyId: store.activeCompanyIds?.[0] || store.companies?.[0]?.id || ''
        })
      });
      
      const result = await response.json();
      if (!result.success) {
         throw new Error(result.error || "Batch payment failed.");
      }

      window.dispatchEvent(new CustomEvent('app-toast', { detail: { message: `Batch payment registered successfully.`, type: 'success' } }));
      setShowBatchPaymentModal(false);
      setSelectedInvoiceIds([]);
      store.fetchInitialData(store.currentUser?.id || '');
    } catch (error: any) {
      console.error(error);
      window.dispatchEvent(new CustomEvent('app-toast', { detail: { message: `Failed: ${error.message || error}`, type: 'error' } }));
    } finally {
      setIsSubmittingBatch(false);
    }
  };

  const handleDownloadPDF = async () => {
    if (!currentInvoice) return;
    
    const customer = (store.contacts || []).find((v: any) => v.id === currentInvoice.customerId);
    const company = (store.companies || []).find((c: any) => c.id === currentInvoice?.companyId);
    
    // Calculate customer balance using server-verified full ledger balance
    const customerId = currentInvoice.customerId;
    let previousBalance = store.getPartnerBalance ? store.getPartnerBalance(customerId) : 0;
    
    // Fetch fresh balance from DB just in case we recently posted
    try {
       const activeCids = store.activeCompanyIds || [];
       if (activeCids.length > 0) {
         
         const balances = await dbService.getPartnerBalances(activeCids);
         if (balances && typeof balances[customerId] === 'number') {
           previousBalance = balances[customerId];
         }
       }
    } catch (e) {
       console.warn('Failed to fetch fresh balance for PDF', e);
    }
    
    // Check if the current invoice is already in the ledger balance
    const isPosted = currentInvoice.status === 'POSTED' || currentInvoice.status === 'PAID' || currentInvoice.status === 'PARTIAL';
    
    const targetTotals = {
      total: currentInvoice.total,
      amountDue: currentInvoice.total - paymentsTotal
    };
    
    const outstandingBalance = isPosted ? previousBalance : (previousBalance + targetTotals.amountDue);

    generateInvoicePDF({
      invoice: currentInvoice,
      customer,
      company,
      employees: store.employees || [],
      items: currentInvoice.items || [],
      totals: {
        total: currentInvoice.total,
        amountDue: currentInvoice.total - paymentsTotal
      },
      outstandingBalance,
      printedBy: store.currentUser?.name || store.currentUser?.email || 'System'
    });

    // Log print activity
    if (editingId) {
      await store.updateInvoice(editingId, {
        messages: [...(currentInvoice?.messages || []), {
          id: generateUUID(),
          authorId: store.currentUser?.id || 'user-1',
          body: `Invoice ${currentInvoice?.number} was downloaded as PDF.`,
          date: new Date().toISOString(),
          type: 'notification'
        }]
      });
    }
  };

  const availableCustomFields = useMemo(() => [
    { id: 'number', label: 'Invoice Number', type: 'text' as const },
    { id: 'customerId', label: 'Customer', type: 'selection' as const, options: (store.contacts || []).filter((c:any) => c.type?.toUpperCase() === ContactType.CUSTOMER).map((c:any) => ({ id: c.id, label: c.name })) },
    { id: 'date', label: 'Invoice Date', type: 'date' as const },
    { id: 'dueDate', label: 'Due Date', type: 'date' as const },
    { id: 'total', label: 'Total Amount', type: 'number' as const },
    { id: 'status', label: 'Status', type: 'selection' as const, options: [
      { id: 'DRAFT', label: 'Draft' },
      { id: 'POSTED', label: 'Posted' },
      { id: 'PAID', label: 'Paid' },
      { id: 'VOID', label: 'Void' },
    ]},
  ], [store.contacts]);

  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const options = {
      limit: pageSize,
      offset: (currentPage - 1) * pageSize,
      sortField: 'date',
      sortOrder: 'desc' as const,
      filters: {
        ...(filterState.status && { status: filterState.status }),
        ...(filterState.contactId && { customerId: filterState.contactId }),
        ...(filterState.startDate && { startDate: filterState.startDate }),
        ...(filterState.endDate && { endDate: filterState.endDate }),
      }
    };
    
    if (filterState.searchQuery) {
        if (filterState.searchQuery.includes(',')) {
             const nums = filterState.searchQuery.split(',').map(s => s.trim()).filter(Boolean);
             if (nums.length > 0) {
                 (options.filters as any).invoiceNumber = nums.map(n => `%${n}%`);
             }
        } else {
             (options.filters as any).invoiceNumber = `%${filterState.searchQuery}%`;
        }
    }

    if (refreshKey > 0) {
      (options as any).forceRefresh = true;
    }

    store.fetchInvoices(options);
  }, [store.fetchInvoices, filterState.status, filterState.contactId, filterState.searchQuery, filterState.startDate, filterState.endDate, currentPage, pageSize, refreshKey]);

  const filteredInvoices = store.paginatedInvoices;
  const sortedInvoices = store.paginatedInvoices;
  const paginatedInvoices = store.paginatedInvoices;

  const { paymentsMap, productMap, creditNotesMap } = useMemo(() => {
    const map = new Map();
    const pMap = new Map();
    const cnMap = new Map();
    (store.products || []).forEach((p: any) => pMap.set(p.id, p));
    (store.creditNotes || []).forEach((cn: any) => {
        if ((cn.status === 'POSTED' || cn.status === 'CLOSED') && cn.originInvoiceId) {
            if (!cnMap.has(cn.originInvoiceId)) cnMap.set(cn.originInvoiceId, []);
            cnMap.get(cn.originInvoiceId).push(cn);
        }
    });
    (store.payments || []).filter((p: any) => p.status === 'POSTED').forEach((p: any) => {
       if (p.invoiceId) {
          map.set(p.invoiceId, (map.get(p.invoiceId) || 0) + p.amount);
       }
       if (p.appliedInvoices) {
          p.appliedInvoices.forEach((ai: any) => {
             map.set(ai.invoiceId, (map.get(ai.invoiceId) || 0) + ai.amount);
          });
       }
    });
    return { paymentsMap: map, productMap: pMap, creditNotesMap: cnMap };
  }, [store.payments, store.products, store.creditNotes]);
  const totalPages = Math.ceil(store.invoiceCount / pageSize);

  const handleLineProductSelect = useCallback((productId: string, identifier?: string | number) => {
    if (identifier === undefined) return;
    const idx = identifier as number;
    setFormData(prev => {
      const p = (store.products || []).find((x:any)=>x.id===productId);
      const lastRate = (() => {
        if (!productId || !prev.customerId) return null;
        const history = (store.invoices || [])
          .filter((b: any) => b.customerId === prev.customerId && b.status !== 'DRAFT')
          .sort((a: any, b: any) => String(b.date || '').localeCompare(String(a.date || '')));
        for (const b of history) {
          const item = (b.items || []).find((it: any) => it.productId === productId);
          if (item) return item.unitPrice;
        }
        return null;
      })();
      
      const ni = [...prev.items];
      ni[idx] = { 
        ...ni[idx], 
        productId: productId, 
        description: p?.name || '', 
        unitPrice: lastRate !== null ? lastRate : (p?.price || 0), 
        serialNumbers: [] 
      };
      return {...prev, items: ni};
    });
  }, [store.products, store.invoices]);

  const handleLineProductCreate = useCallback((name: string, identifier?: string | number) => {
    if (identifier === undefined) return;
    setQuickProductName({name, index: identifier as number});
  }, []);

  const handleExport = (format: 'excel' | 'pdf', scope: 'page' | 'all') => {
    const invoicesToExport = scope === 'page' ? paginatedInvoices : sortedInvoices;

    if (invoicesToExport.length === 0) return alert("No invoices to export.");

    const totalSub = invoicesToExport.reduce((sum, b) => sum + (b.subtotal || 0), 0);
    const totalTotal = invoicesToExport.reduce((sum, b) => sum + (b.total || 0), 0);

    const headers = ['Invoice Number', 'Customer', 'Date', 'Due Date', 'Reference', 'Subtotal', 'Total', 'Status'];
    const rows = [
      headers,
      ...invoicesToExport.map(invoice => {
        const customer = (store.contacts || []).find((c: any) => c.id === invoice.customerId)?.name || 'N/A';
        return [
          invoice.number,
          customer,
          invoice.date,
          invoice.dueDate,
          invoice.reference || '',
          invoice.subtotal,
          invoice.total,
          invoice.status
        ];
      }),
      ['TOTAL', '', '', '', '', totalSub, totalTotal, '']
    ];

    if (format === 'excel') {
      exportToXLSX('Customer_Invoices', rows);
    } else {
      exportToPDF('Customer_Invoices', rows);
    }
  };

  const [isAutoSaving, setIsAutoSaving] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const isSavingRef = useRef(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const lastSavedDataRef = useRef<string>('');

  useEffect(() => {
    if (!isPosted && editingId && !isSaving) {
      const dataToSave = {
        ...formData,
        items: totals.itemsWithCalc,
        subtotal: totals.sub,
        discountTotal: totals.disc,
        taxTotal: totals.tax,
        total: totals.total
      };
      const currentDataStr = JSON.stringify(dataToSave);
      if (lastSavedDataRef.current === currentDataStr) return;

      const timer = setTimeout(async () => {
        if (isSavingRef && isSavingRef.current) return;
        try {
          setIsAutoSaving(true);
          isSavingRef.current = true;
          lastSavedDataRef.current = currentDataStr;
          await store.updateInvoice(editingId, dataToSave);
        } catch (error: any) {
          console.error("Auto-save failed", error);
        } finally {
          setIsAutoSaving(false);
          isSavingRef.current = false;
        }
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [formData, totals, isPosted, editingId, store, isSaving]);

  const handleConfirm = async (post: boolean = true, createNew: boolean = false) => {
    if (isSavingRef.current) return;
    if (!formData.customerId || !formData.customerId.trim()) return alert("Select customer.");
    if (formData.items.length === 0) return alert("Add at least one item.");
    
    try {
      isSavingRef.current = true;
      setIsSaving(true);
      if (editingId) {
        if (status === 'POSTED' && post) {
          alert("This invoice is already posted. To make changes, reset it to draft first.");
          return;
        }

        if (status === 'DRAFT' || !post) {
          const updates = {
            ...formData,
            items: formData.items, // Let backend calculate
            subtotal: totals.sub,
            discountTotal: totals.disc,
            taxTotal: totals.tax,
            total: totals.total,
            status: 'DRAFT' // Maintain draft status in DB during update
          };
          
        const existingInvoice = (store.invoices || []).find((b: any) => b.id === editingId) || (store.paginatedInvoices || []).find((b: any) => b.id === editingId);
        if (!post) {
            updates.messages = [...(existingInvoice?.messages || []), {
              id: generateUUID(),
              authorId: store.currentUser?.id || 'user-1',
              body: 'Draft invoice updated. Items and totals recalculated.',
              date: new Date().toISOString(),
              type: 'notification'
            }];
        }
        const updatedInvoice = await store.updateInvoice(editingId, updates);
          let finalInvoice: any = updatedInvoice || { ...existingInvoice, ...updates, id: editingId };
          if (post) {
              const returned = await store.postInvoice({ ...finalInvoice, status: 'DRAFT' });
              if (returned) { finalInvoice = returned; finalInvoice.status = 'POSTED'; }
              if ((formData as any).paymentMethod && (formData as any).paymentMethod !== 'CREDIT') {
                try {
                  await store.payInvoice(finalInvoice.id, {
                    id: generateUUID(), // explicit random id to avoid backend duplication limits
                    amount: finalInvoice.total,
                    date: formData.date || getOpDateBST(),
                    method: (formData as any).paymentMethod,
                    notes: `Auto payment recorded via ${(formData as any).paymentMethod}`
                  });
                  finalInvoice.status = 'PAID';
                } catch (payErr) {
                  console.error("Auto payment error:", payErr);
                }
              }
          }

          if (!post) {
            window.dispatchEvent(new CustomEvent('app-toast', { detail: { message: "Draft updated.", type: 'success' } }));
          } else {
            window.dispatchEvent(new CustomEvent('app-toast', { detail: { message: "Invoice confirmed successfully.", type: 'success' } }));
            // Automatically download PDF for the confirmed invoice
            const customer = (store.contacts || []).find((v: any) => v.id === finalInvoice.customerId);
            const company = (store.companies || []).find((c: any) => c.id === finalInvoice?.companyId);
            const paymentsTotal = (store.payments || []).filter((p: any) => p.status === 'POSTED' && (p.invoiceId === finalInvoice.id || (p.appliedInvoices || []).some((a: any) => a.invoiceId === finalInvoice.id))).reduce((s: number, p: any) => {
              if (p.invoiceId === finalInvoice.id) return s + p.amount;
              const ab = (p.appliedInvoices || []).find((ai: any) => ai.invoiceId === finalInvoice.id);
              return s + (ab?.amount || 0);
            }, 0);
            const customerId = finalInvoice.customerId;
            let previousBalance = store.getPartnerBalance ? store.getPartnerBalance(customerId) : 0;
            const outstandingBalance = previousBalance + (finalInvoice.total - paymentsTotal);

            generateInvoicePDF({
              invoice: finalInvoice,
              customer,
              company,
              employees: store.employees || [],
              items: finalInvoice.items || [],
              totals: {
                total: finalInvoice.total,
                amountDue: finalInvoice.total - paymentsTotal
              },
              outstandingBalance,
              printedBy: store.currentUser?.name || store.currentUser?.email || 'System'
            });
          }
        }
      } else {
        const newInvoice = await store.addInvoice({ 
          ...formData, 
          items: formData.items, // Let backend calculate
          number: '',
          subtotal: totals.sub,
          discountTotal: totals.disc,
          taxTotal: totals.tax,
          total: totals.total,
          status: 'DRAFT'
        });
        let finalInvoice: any = newInvoice;
        if (post) {
          const returned = await store.postInvoice(newInvoice);
          if (returned) { finalInvoice = returned; finalInvoice.status = 'POSTED'; }
          if ((formData as any).paymentMethod && (formData as any).paymentMethod !== 'CREDIT') {
            try {
              await store.payInvoice(finalInvoice.id, {
                id: generateUUID(), // Prevent duplicate sequence constraints 
                amount: finalInvoice.total,
                date: formData.date || getOpDateBST(),
                method: (formData as any).paymentMethod,
                notes: `Auto payment recorded via ${(formData as any).paymentMethod}`
              });
              finalInvoice.status = 'PAID';
            } catch (payErr) {
              console.error("Auto payment error:", payErr);
            }
          }
        }
        setEditingId(newInvoice.id);

        if (!post) {
          window.dispatchEvent(new CustomEvent('app-toast', { detail: { message: "Invoice saved as draft.", type: 'success' } }));
        } else {
          window.dispatchEvent(new CustomEvent('app-toast', { detail: { message: "Invoice confirmed successfully.", type: 'success' } }));
          // Automatically download PDF for the confirmed invoice
          const customer = (store.contacts || []).find((v: any) => v.id === finalInvoice.customerId);
            const company = (store.companies || []).find((c: any) => c.id === finalInvoice?.companyId);
            const paymentsTotal = (store.payments || []).filter((p: any) => p.status === 'POSTED' && (p.invoiceId === finalInvoice.id || (p.appliedInvoices || []).some((a: any) => a.invoiceId === finalInvoice.id))).reduce((s: number, p: any) => {
              if (p.invoiceId === finalInvoice.id) return s + p.amount;
              const ab = (p.appliedInvoices || []).find((ai: any) => ai.invoiceId === finalInvoice.id);
              return s + (ab?.amount || 0);
            }, 0);
            const customerId = finalInvoice.customerId;
            let previousBalance = store.getPartnerBalance ? store.getPartnerBalance(customerId) : 0;
            const outstandingBalance = previousBalance + (finalInvoice.total - paymentsTotal);

            generateInvoicePDF({
              invoice: finalInvoice,
              customer,
              company,
              employees: store.employees || [],
              items: finalInvoice.items || [],
              totals: {
                total: finalInvoice.total,
                amountDue: finalInvoice.total - paymentsTotal
              },
              outstandingBalance,
              printedBy: store.currentUser?.name || store.currentUser?.email || 'System'
            });
        }
      }
      if (createNew) {
        setEditingId(null);
        const cs = (store.contacts || []).find((c:any)=>c.name?.toLowerCase().includes('cash sale') || c.type==='CASH');
        setFormData({ 
          customerId: cs ? cs.id : '', 
          items: [{ id: generateUUID(), type: 'PRODUCT', description: '', quantity: 1, unitPrice: 0 }], 
          date: getOpDateBST(), 
          dueDate: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          reference: '', customerNote: '', deliveryPerson: '', srId: '' 
        });
      } else if (post) {
        setShowForm(false);
      }

    } catch (err: any) {
      console.error('Invoice confirm error:', err);
      // More descriptive error for common issues
      let msg = err.message || 'Unknown error';
      if (msg.includes('column "warehouse_id"')) {
        msg = "System synchronization issue: inventory table is missing columns. Please try again in 30 seconds.";
      } else if (msg.includes('Failed to fetch')) {
        msg = "Network error: Connection to database failed. Please check your internet or try again in a few seconds. If you have many items, the process might be timing out.";
      }
      window.dispatchEvent(new CustomEvent('app-toast', { detail: { message: `Invoice Failed: ${msg}`, type: 'error' } }));
    } finally {
      setIsSaving(false);
      isSavingRef.current = false;
      setRefreshKey(prev => prev + 1);
    }
  };

  useEffect(() => {
    const handler = () => {
      if (showForm && (!editingId || isEditable)) {
        handleConfirm(false);
      }
    };
    window.addEventListener('smart-save-draft', handler);
    return () => window.removeEventListener('smart-save-draft', handler);
  }, [showForm, editingId, status, formData, totals]);

  // On-demand product loading for Invoice Creator
  useEffect(() => {
    if (showForm && store.fetchEmployees) {
      store.fetchEmployees();
    }
    if (showForm && store.fetchProductsOnDemand) {
      store.fetchProductsOnDemand(false);
    }
  }, [showForm]);

  useEffect(() => {
    if (store.fetchProductsOnDemand) {
      store.fetchProductsOnDemand(false);
    }
  }, [store.activeCompanyIds]);

  const handleResetToDraft = async () => {
    if (editingId) {
      try {
        await store.resetInvoiceToDraft(editingId);
        setFormData(prev => ({ ...prev, status: 'DRAFT' }));
        window.dispatchEvent(new CustomEvent('app-toast', { detail: { message: "Invoice reset to draft.", type: 'success' } }));
      } catch (error: any) {
        window.dispatchEvent(new CustomEvent('app-toast', { detail: { message: error.message, type: 'error' } }));
      }
    }
  };

  const handlePayment = async () => {
    if (editingId) {
      const payment = await store.payInvoice(editingId, { 
        id: generateUUID(), // explicit id
        amount: totals.amountDue,
        date: getOpDateBST(), 
        method: 'CASH' 
      });
      if (payment?.clearingStatus === 'PENDING') {
        alert("Payment sent to cashier for clearing.");
      } else {
        alert("Payment registered successfully.");
      }
    }
  };

  const addLine = (type: InvoiceItemType = 'PRODUCT', productId: string = '') => {
    if (isPosted) return;
    let desc = '';
    let price = 0;
    
    if (type === 'PRODUCT' && productId) {
        const p = (store.products || []).find((item: any) => item.id === productId);
        if (p) {
            desc = p.name;
            price = p.price || 0;
        }
    }

    const newItem: InvoiceItem = { 
      id: generateUUID(), 
      type, 
      productId: productId || undefined,
      description: desc || (type === 'SUBTOTAL' ? 'Subtotal' : type === 'DISCOUNT' ? 'Manual Discount' : ''), 
      quantity: type === 'PRODUCT' ? 1 : 0, 
      unitPrice: price, 
      discountRate: 0,
      discountMode: 'PERCENT'
    };
    setFormData({ ...formData, items: [...formData.items, newItem] });
  };

  const formatAccounting = (num: number) => {
    return formatNumber(num);
  };

  if (showForm) {
    return (
      <div className="flex flex-col h-full bg-[#F1F1F1] overflow-hidden animate-in fade-in duration-300">
        {quickCustomerName && (
          <QuickContactModal 
            name={quickCustomerName} 
            type={ContactType.CUSTOMER} 
            store={store} 
            onCancel={() => setQuickCustomerName(null)} 
            onSave={c => { setFormData(prev => ({...prev, customerId: c.id})); setQuickCustomerName(null); }} 
            themeColor="#D97706"
          />
        )}
        
        {quickProductName && (
          <QuickProductModal 
            name={quickProductName.name} 
            store={store} 
            onCancel={() => setQuickProductName(null)} 
            onSave={p => { 
              const targetIdx = quickProductName.index;
              setFormData(prev => {
                const ni = [...prev.items]; 
                if (ni[targetIdx]) {
                  ni[targetIdx] = { ...ni[targetIdx], productId: p.id, description: p.name, unitPrice: p.price || 0 }; 
                }
                return { ...prev, items: ni };
              });
              setQuickProductName(null); 
            }} 
            themeColor="#D97706"
          />
        )}

        <div className="bg-white border-b px-4 py-2 flex justify-between items-center z-10 shadow-sm">
          <div className="flex items-center space-x-2 text-sm">
            <button onClick={() => setShowForm(false)} className="text-[#00A09D] hover:underline">Invoices</button>
            <span className="text-slate-400">/</span>
            <span className="font-bold text-slate-800">{editingId ? currentInvoice?.number : 'New Invoice'}</span>
          </div>
          <div className="flex bg-white border rounded text-[10px] font-bold uppercase overflow-hidden">
             <div className={`px-4 py-2 ${status === 'DRAFT' ? 'bg-amber-600 text-white' : 'text-slate-400 border-r'}`}>Draft</div>
             <div className={`px-4 py-2 ${status === 'POSTED' ? 'bg-amber-600 text-white' : 'text-slate-400 border-r'}`}>Posted</div>
             <div className={`px-4 py-2 ${status === 'PARTIAL' ? 'bg-emerald-500 text-white' : 'text-slate-400 border-r'}`}>Partial</div>
             <div className={`px-4 py-2 ${status === 'IN_PAYMENT' ? 'bg-amber-500 text-white' : 'text-slate-400 border-r'}`}>In Payment</div>
             <div className={`px-4 py-2 ${status === 'PAID' ? 'bg-emerald-600 text-white' : 'text-slate-400'}`}>Paid</div>
          </div>
        </div>

        <div className="bg-white border-b px-4 py-2 flex space-x-2 z-10 items-center">
          {isEditable && (
            <>
              <button onClick={() => handleConfirm(true)} className="bg-amber-600 text-white px-6 py-1.5 rounded text-sm font-bold shadow-sm hover:brightness-110 transition-all flex items-center">
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"/></svg>
                Confirm Invoice
              </button>
              <button onClick={() => handleConfirm(true, true)} className="bg-indigo-600 text-white px-6 py-1.5 rounded text-sm font-bold shadow-sm hover:brightness-110 transition-all flex items-center">
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4"/></svg>
                Confirm & New Invoice
              </button>
              <button onClick={() => handleConfirm(false)} className="bg-white border border-slate-200 text-indigo-600 px-6 py-1.5 rounded text-sm font-bold shadow-sm hover:bg-indigo-50 flex items-center transition-all">
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4"/></svg>
                {editingId ? 'Update Draft' : 'Save Draft'}
              </button>
              <div className="relative group/search-btn">
                <div className="absolute left-3 top-1/2 -translate-y-1/2 text-emerald-500 z-10 pointer-events-none">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
                </div>
                <SearchableSelect
                  options={productOptions}
                  value=""
                  onSelect={(id) => {
                    const product = (store.products || []).find((p: any) => p.id === id);
                    if (product) {
                      addLine('PRODUCT', id);
                    }
                  }}
                  onFocus={() => store.fetchProductsOnDemand(false)}
                  onSearchChange={store.searchProductsOnDemand}
                  placeholder="Search Product..."
                  className="w-48"
                  labelClass="font-bold text-emerald-600 pl-8 focus:pl-8"
                  themeColor="#10b981"
                  displayLimit={7}
                />
              </div>
              {editingId && store.currentUser?.roleId === 'role-admin' && (
                <button 
                  onClick={() => {
                    if (deleteConfirmId === editingId) {
                      try {
                        store.deleteInvoice(editingId);
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
            </>
          )}
          { (status === 'POSTED' || status === 'PARTIAL' || status === 'IN_PAYMENT' || status === 'PAID') && (
            <>
              {status !== 'PAID' && <button onClick={handlePayment} className="bg-emerald-600 text-white px-6 py-1.5 rounded text-sm font-bold shadow-sm hover:brightness-110">Register Payment</button>}
              <button onClick={() => window.dispatchEvent(new CustomEvent('accounting-create-credit-note', { detail: currentInvoice }))} className="bg-rose-600 text-white px-6 py-1.5 rounded text-sm font-bold shadow-sm hover:brightness-110 ml-2">Credit Note</button>
            {status === 'POSTED' && store.hasPermission('invoice_edit') && store.currentUser?.roleId === 'role-admin' && (
              <button onClick={handleResetToDraft} className="bg-white border border-slate-300 text-slate-600 px-6 py-1.5 rounded text-sm font-bold shadow-sm hover:bg-slate-50 transition-colors">Reset to Draft</button>
            )}
            </>
          )}
          {editingId && (
            <>
              <button 
                onClick={handleDownloadPDF} 
                className="bg-amber-600 hover:brightness-110 text-white px-6 py-1.5 rounded text-sm font-bold shadow-sm transition-colors flex items-center"
              >
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
                Download PDF
              </button>
              {(status === 'POSTED' || status === 'PAID' || status === 'PARTIAL' || status === 'IN_PAYMENT') && onNavigate && (
                <button 
                  type="button"
                  onClick={() => {
                     const searchRef = currentInvoice?.journalEntryId || currentInvoice?.id;
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
            {(isAutoSaving || isSaving) && (
              <div className="flex items-center text-[10px] text-emerald-600 font-bold animate-pulse ml-2">
                <svg className={`w-3 h-3 mr-1 ${isSaving ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  {isSaving ? (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  ) : (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"/>
                  )}
                </svg>
                {isSaving ? 'Saving...' : 'Autosaved'}
              </div>
            )}
            <button onClick={() => setShowForm(false)} className="bg-white border text-slate-700 px-6 py-1.5 rounded text-sm font-bold hover:bg-slate-50 transition-colors">Discard</button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 lg:p-10">
          <div className="bg-white max-w-6xl mx-auto shadow-2xl border p-12 min-h-[900px] flex flex-col rounded-sm relative">
            <h1 className="text-4xl font-bold mb-10 tracking-tight">{editingId ? currentInvoice?.number : 'New Invoice'}</h1>
            
            <div className="grid grid-cols-2 gap-20 mb-10">
               <div className="space-y-4">
                  <div className="flex items-baseline border-b border-dashed border-slate-200 pb-1">
                     <label className="w-32 text-sm font-bold text-slate-500 uppercase tracking-tighter">Customer</label>
                     <SearchableSelect 
                        className="flex-1" placeholder="Select Customer..."
                        options={(store.contacts || []).filter((c:any)=>!c.type || c.type?.toUpperCase() === 'CUSTOMER' || c.type?.toUpperCase() === 'BOTH' || c.type?.toUpperCase() === 'CASH').map((c:any)=>({id:c.id, name:c.name || 'Unnamed', extra:`Phone: ${c.phone || ''} | ${c.email || ''} | ${c.code || ''}`.trim()}))}
                        value={formData.customerId} onSelect={id => setFormData({...formData, customerId: id})} onQuickCreate={setQuickCustomerName}
                        onFocus={store.fetchContacts}
                        onSearchChange={store.searchContactsOnDemand}
                        disabled={!isEditable}
                        quickCreateLabel="Customer"
                        emptyMessage="No customers found..."
                        themeColor="#d97706"
                     />
                  </div>
                  {formData.customerId && (
                    <div className="flex items-baseline mt-1">
                       <label className="w-32 text-[10px] font-bold text-slate-400 uppercase tracking-tighter">Outstanding</label>
                       <div className="flex-1 text-[11px] font-bold text-rose-500">
                          {formatBDT(Math.abs(store.getPartnerBalance ? store.getPartnerBalance(formData.customerId) : 0))} 
                          {(store.getPartnerBalance ? store.getPartnerBalance(formData.customerId) : 0) < 0 ? ' (Adv)' : ' Due'}
                       </div>
                    </div>
                  )}
               </div>
               <div className="space-y-4">
                  <div className="flex items-baseline border-b border-dashed border-slate-200 pb-1">
                    <label className="w-32 text-sm font-medium text-slate-500">Invoice Date</label>
                    <input type="date" disabled={!isEditable} className="w-full bg-transparent outline-none text-sm font-bold" value={formData.date || ''} onChange={e => setFormData({...formData, date: e.target.value})} />
                  </div>
                  <div className="flex items-baseline border-b border-dashed border-slate-200 pb-1">
                    <label className="w-32 text-sm font-medium text-slate-500">Reference</label>
                    <input type="text" disabled={!isEditable} placeholder="Invoice Ref / Doc #" className="w-full bg-transparent outline-none text-sm font-bold" value={formData.reference || ''} onChange={e => setFormData({...formData, reference: e.target.value})} />
                  </div>
                  <div className="flex items-baseline border-b border-dashed border-slate-200 pb-1">
                    <label className="w-32 text-sm font-medium text-slate-500">Delivery Person</label>
                    <select 
                      disabled={!isEditable} 
                      className="w-full bg-transparent outline-none text-sm font-bold" 
                      value={(formData as any).deliveryPerson || ''} 
                      onChange={e => setFormData({...formData, deliveryPerson: e.target.value})}
                    >
                      <option value="">Select Delivery Person</option>
                      {(store.employees || []).map((emp: any) => (
                        <option key={emp.id} value={emp.id}>{emp.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex items-baseline border-b border-dashed border-slate-200 pb-1">
                    <label className="w-32 text-sm font-medium text-slate-500">Sales Rep (SR)</label>
                    <select 
                      disabled={!isEditable} 
                      className="w-full bg-transparent outline-none text-sm font-bold" 
                      value={(formData as any).srId || ''} 
                      onChange={e => setFormData({...formData, srId: e.target.value})}
                    >
                      <option value="">Select Sales Rep (SR)</option>
                      {(store.employees || []).map((emp: any) => (
                        <option key={emp.id} value={emp.id}>{emp.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex items-baseline border-b border-dashed border-slate-200 pb-1">
                    <label className="w-32 text-sm font-medium text-slate-500">Payment Method</label>
                    <select 
                      disabled={!isEditable} 
                      className="w-full bg-transparent outline-none text-sm font-bold text-amber-700 font-semibold" 
                      value={(formData as any).paymentMethod || 'CREDIT'} 
                      onChange={e => setFormData({...formData, paymentMethod: e.target.value})}
                    >
                      <option value="CREDIT">Due / Credit Sale (Pay Later)</option>
                      <option value="CASH">💵 Cash Payment (Auto Paid)</option>
                      <option value="BANK">🏦 Bank Transfer (Auto Paid)</option>
                      <option value="MOBILE_BANKING">📱 Mobile Banking (Auto Paid)</option>
                    </select>
                  </div>
               </div>
            </div>

            <div className="border-b flex space-x-10 mb-8 items-center">
               <button onClick={() => setActiveTab('lines')} className={`pb-3 text-sm font-bold border-b-2 transition-all ${activeTab === 'lines' ? 'border-amber-600 text-amber-600' : 'border-transparent text-slate-400'}`}>Invoice Lines</button>
               <button onClick={() => setActiveTab('journal')} className={`pb-3 text-sm font-bold border-b-2 transition-all ${activeTab === 'journal' ? 'border-amber-600 text-amber-600' : 'border-transparent text-slate-400'}`}>Journal Items</button>
               {linkedJournalEntry && (
                  <button 
                    onClick={() => {
                        window.dispatchEvent(new CustomEvent('accounting-nav', { detail: { screen: 'JOURNAL', filter: { reference: linkedJournalEntry.id } } }));
                    }}
                    className="pb-3 text-sm font-bold border-b-2 border-transparent text-indigo-500 hover:text-indigo-600 transition-all flex items-center"
                  >
                    <svg className="w-3.5 h-3.5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/></svg>
                    View Journal Entry
                  </button>
                )}
            </div>

            {activeTab === 'lines' ? (
              <div className="w-full" ref={tableRef}>
                <div className="pb-2">
                  <div className="w-full">
                    <div 
                      className="grid gap-4 border-b pb-2 font-bold text-slate-800 uppercase text-[10px] tracking-widest px-2 relative"
                      style={{ gridTemplateColumns: colWidths.map(w => `${w}%`).join(' ') }}
                    >
                  <div className="relative group">
                    Product
                    <div 
                      onMouseDown={(e) => handleMouseDown(0, e)}
                      className="absolute right-[-4px] top-0 bottom-0 w-[8px] cursor-col-resize hover:bg-amber-600/30 transition-colors z-10 group-hover:bg-slate-200"
                    />
                  </div>
                  <div className="text-right relative group">
                    Quantity
                    <div 
                      onMouseDown={(e) => handleMouseDown(1, e)}
                      className="absolute right-[-4px] top-0 bottom-0 w-[8px] cursor-col-resize hover:bg-amber-600/30 transition-colors z-10 group-hover:bg-slate-200"
                    />
                  </div>
                  <div className="text-right relative group">
                    Unit Price
                    <div 
                      onMouseDown={(e) => handleMouseDown(2, e)}
                      className="absolute right-[-4px] top-0 bottom-0 w-[8px] cursor-col-resize hover:bg-amber-600/30 transition-colors z-10 group-hover:bg-slate-200"
                    />
                  </div>
                  <div className="text-center relative group">
                    Disc %
                    <div 
                      onMouseDown={(e) => handleMouseDown(3, e)}
                      className="absolute right-[-4px] top-0 bottom-0 w-[8px] cursor-col-resize hover:bg-amber-600/30 transition-colors z-10 group-hover:bg-slate-200"
                    />
                  </div>
                  <div className="text-right">Total</div>
                </div>
                
                <div className="divide-y">
                  {totals.itemsWithCalc.map((item, idx) => {
                    const isDragged = draggedItemIndex === idx;
                    const isDragOver = dragOverItemIndex === idx;

                    return (
                    <div key={item.id} className="flex flex-col relative border-b border-transparent hover:border-slate-100">
                    <div 
                      draggable={isEditable}
                      onDragStart={(e) => handleDragStartItem(e, idx)}
                      onDragEnter={(e) => handleDragEnterItem(e, idx)}
                      onDragOver={(e) => handleDragOverItem(e, idx)}
                      onDrop={(e) => handleDropItem(e, idx)}
                      onDragEnd={handleDragEndItem}
                      className={`grid gap-4 py-3 items-center px-2 group ${item.type !== 'PRODUCT' ? 'bg-slate-50/50' : ''} ${isDragged ? 'opacity-40' : ''} ${isDragOver ? 'border-t-2 border-indigo-500' : 'border-t-2 border-transparent'}`}
                      style={{ gridTemplateColumns: colWidths.map(w => `${w}%`).join(' ') }}
                    >
                      <div className="overflow-visible relative flex items-start">
                        <div 
                            className={`absolute -left-5 top-2 cursor-grab active:cursor-grabbing text-slate-300 hover:text-slate-500 opacity-0 transition-opacity ${isEditable ? 'group-hover:opacity-100' : 'hidden'}`}
                            onMouseDown={() => {}} 
                        >
                             <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="12" r="1"></circle><circle cx="9" cy="5" r="1"></circle><circle cx="9" cy="19" r="1"></circle><circle cx="15" cy="12" r="1"></circle><circle cx="15" cy="5" r="1"></circle><circle cx="15" cy="19" r="1"></circle></svg>
                        </div>
                        <div className="flex-1 w-full relative">
                        {item.type === 'PRODUCT' ? (
                          <>
                            <div className="flex items-center space-x-2 w-full">
<div className="flex-1 min-w-0">
                            <SearchableSelect 
                              disabled={!isEditable}
                              placeholder="Select Product..."
                              options={productOptions}
                              value={item.productId || ''}
                              identifier={idx}
                              onSelect={handleLineProductSelect}
                              onQuickCreate={handleLineProductCreate}
                              onFocus={() => store.fetchProductsOnDemand(false)}
                              onSearchChange={store.searchProductsOnDemand}
                              themeColor="#d97706"
                              displayLimit={7}
                            />
</div>
                            {isEditable && (
                              <button 
                                onClick={() => typeof toggleNote === 'function' ? toggleNote(idx) : null}
                                className={`p-1.5 rounded transition-colors ${(typeof showNoteIndices !== 'undefined' && showNoteIndices.has && showNoteIndices.has(idx)) ? 'bg-indigo-100 text-indigo-600' : 'text-slate-400 hover:bg-slate-100'}`}
                                title="Toggle Product Note"
                              >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 20h9"></path><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
                              </button>
                            )}
                            </div>
                            {item.productId && (() => {
                              const p = (store.products || []).find((x:any)=>x.id===item.productId);
                              const stock = store.activeCompanyIds?.length === 1 ? (p?.stockLevels?.[store.activeCompanyIds[0]] || p?.quantityOnHand || 0) : (p?.quantityOnHand || 0);
                              return (
                                <div className="mt-1 flex items-center space-x-3 text-[10px] font-bold">
                                  <button 
                                    onClick={() => {
                                      window.dispatchEvent(new CustomEvent('accounting-nav', { detail: { screen: 'PRODUCTS', filter: { searchQuery: p?.name, productId: p?.id } } }));
                                    }}
                                    className="flex items-center space-x-1 text-indigo-500 hover:text-indigo-700 transition-all opacity-100 transition-opacity"
                                    title="View Product Profile"
                                  >
                                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/></svg>
                                    <span>Profile</span>
                                  </button>
                                  {p && (
                                    <>
                                      <span className="text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">Stock: {stock}</span>
                                      <span className="text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">Pur. Rate: {formatBDT(p.costPrice || 0)}</span>
                                    </>
                                  )}
                                </div>
                              );
                            })()}
                            {isEditable && (typeof showNoteIndices !== 'undefined' && showNoteIndices.has && showNoteIndices.has(idx)) && (
                                <input 
                                  className="w-full text-[11px] font-medium text-indigo-800 border-b border-dashed border-indigo-200 focus:border-indigo-500 outline-none bg-indigo-50/30 italic px-2 py-1 mt-1 rounded-sm animate-in fade-in slide-in-from-top-1 duration-200"
                                  placeholder="Add custom product note..."
                                  value={item.note || ''}
                                  onChange={e => {
                                    const ni = [...formData.items];
                                    ni[idx] = { ...ni[idx], note: e.target.value };
                                    setFormData({ ...formData, items: ni });
                                  }}
                                />
                            )}
                            {(() => {
                              const prod = (store.products || []).find((p: any) => p.id === item.productId);
                              if (prod?.trackingType === 'SERIAL') {
                                return (
                                  <div className="space-y-1">
                                    <div className="flex flex-wrap gap-1">
                                      {(item.serialNumbers || []).map((sn, snIdx) => (
                                        <span key={snIdx} className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-amber-100 text-amber-700">
                                          {sn}
                                          {!isEditable && (
                                            <button 
                                              onClick={() => {
                                                const ni = [...formData.items];
                                                const currentSerials = [...(ni[idx].serialNumbers || [])];
                                                currentSerials.splice(snIdx, 1);
                                                ni[idx] = { ...ni[idx], serialNumbers: currentSerials, quantity: currentSerials.length };
                                                setFormData({ ...formData, items: ni });
                                              }}
                                              className="ml-1 hover:text-amber-900"
                                            >
                                              ×
                                            </button>
                                          )}
                                        </span>
                                      ))}
                                    </div>
                                    {!isEditable && (
                                      <div className="flex space-x-1">
                                        <input 
                                          className="flex-1 text-[10px] border-b border-dashed border-slate-300 focus:border-[#714B67] outline-none bg-transparent font-bold text-amber-600"
                                          placeholder="Scan or Type SN & Enter"
                                          onKeyDown={e => {
                                            if (e.key === 'Enter') {
                                              e.preventDefault();
                                              const val = (e.target as HTMLInputElement).value.trim();
                                              if (val) {
                                                const ni = [...formData.items];
                                                const currentSerials = [...(ni[idx].serialNumbers || [])];
                                                if (!currentSerials.includes(val)) {
                                                  currentSerials.push(val);
                                                  ni[idx] = { ...ni[idx], serialNumbers: currentSerials, quantity: currentSerials.length };
                                                  setFormData({ ...formData, items: ni });
                                                }
                                                (e.target as HTMLInputElement).value = '';
                                              }
                                            }
                                          }}
                                        />
                                        <button 
                                          onClick={() => {
                                            const ni = [...formData.items];
                                            const needed = Math.max(0, item.quantity - (item.serialNumbers || []).length);
                                            const count = needed > 0 ? needed : 1;
                                            const newSerials = Array.from({ length: count }, (_, i) => generateUUID());
                                            const finalSerials = [...(item.serialNumbers || []), ...newSerials];
                                            ni[idx] = { ...ni[idx], serialNumbers: finalSerials, quantity: finalSerials.length };
                                            setFormData({ ...formData, items: ni });
                                          }}
                                          className="text-[9px] font-bold text-amber-600 hover:underline"
                                        >
                                          Auto-Gen
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                );
                              }
                              return null;
                            })()}
                          </>
                        ) : (
                          <input 
                            disabled={!isEditable}
                            className="w-full bg-transparent outline-none font-bold text-slate-500 italic"
                            value={item.description || ''}
                            onChange={e => {
                              const ni = [...formData.items];
                              ni[idx] = { ...ni[idx], description: e.target.value };
                              setFormData({...formData, items: ni});
                            }}
                          />
                        )}
                      </div>
                      </div>
                      <div className="text-right">
                        {item.type === 'PRODUCT' && (
                          <input type="number" disabled={!isEditable} className="w-full text-right bg-transparent outline-none font-bold" value={item.quantity || ''} onFocus={e => e.target.select()} onChange={e => { const ni=[...formData.items]; ni[idx] = { ...ni[idx], quantity: parseFloat(e.target.value)||0 }; setFormData({...formData, items:ni}); }} />
                        )}
                      </div>
                      <div className="text-right relative">
                        {item.type === 'PRODUCT' && (
                          <div className="flex items-center justify-end space-x-1">
                            <input 
                              type="number" 
                              disabled={!isEditable} 
                              className="w-full text-right bg-transparent outline-none font-bold" 
                              value={item.unitPrice || ''} 
                              onFocus={() => {
                                setFocusedPriceIndex(idx);
                                if (item.productId) fetchPriceHistory(item.productId);
                              }}
                              onBlur={() => {
                                setTimeout(() => setFocusedPriceIndex(null), 200);
                              }}
                              onChange={e => { 
                                const ni=[...formData.items]; 
                                ni[idx] = { ...ni[idx], unitPrice: parseFloat(e.target.value)||0 }; 
                                setFormData({...formData, items:ni}); 
                              }} 
                            />
                            {priceHistory.length > 0 && focusedPriceIndex === idx && (
                              <button
                                className="absolute -right-2 top-1/2 -translate-y-1/2 p-1 text-amber-500 animate-pulse transition-transform hover:scale-110"
                                title="Click to see last 2 sale prices"
                              >
                                ✨
                              </button>
                            )}
                            {focusedPriceIndex === idx && priceHistory.length > 0 && (
                              <div className="absolute top-full right-0 z-[100] bg-white border border-amber-200 rounded-lg p-2.5 shadow-2xl mt-1 min-w-[200px] text-left animate-in fade-in slide-in-from-top-1">
                                <div className="text-[9px] font-black text-amber-600 uppercase tracking-widest mb-2 border-b border-amber-100 pb-1 flex items-center">
                                  <span className="mr-1">✨</span> Last 2 Sale Prices
                                </div>
                                <div className="space-y-2">
                                  {priceHistory.map((rate, rIdx) => (
                                    <div key={rIdx} className="bg-amber-50/50 p-1.5 rounded-md border border-amber-100/50 hover:bg-amber-50 transition-colors cursor-pointer"
                                      onClick={() => {
                                        const ni=[...formData.items]; 
                                        ni[idx] = { ...ni[idx], unitPrice: rate.rate }; 
                                        setFormData({...formData, items:ni});
                                      }}
                                    >
                                      <div className="flex justify-between items-center">
                                        <span className="text-xs font-black text-amber-900 tabular-nums">{formatBDT(rate.rate)}</span>
                                        <span className="text-[9px] font-bold text-amber-500">{rate.date}</span>
                                      </div>
                                      <div className="text-[8px] text-amber-400 font-medium">Invoice: {rate.number}</div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                      <div className="text-center">
                        {(item.type === 'PRODUCT' || item.type === 'DISCOUNT') && (
                          <div className="flex items-center justify-center space-x-1">
                            <input 
                              type="number" 
                              disabled={!isEditable} 
                              className="w-12 text-center bg-transparent outline-none font-bold text-rose-500" 
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
                                  ni[idx] = { ...currentItem, discountMode: newMode, discountRate: parseFloat((newRate || 0).toFixed(2)) };
                                  setFormData({ ...formData, items: ni });
                                }}
                                className={`px-1.5 py-0.5 text-[10px] font-bold rounded transition-all ${item.discountMode === 'PERCENT' || !item.discountMode ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-400 hover:text-slate-600'}`}
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
                                  ni[idx] = { ...currentItem, discountMode: newMode, discountRate: parseFloat((newRate || 0).toFixed(2)) };
                                  setFormData({ ...formData, items: ni });
                                }}
                                onKeyDown={e => {
                                  if (e.key === 'Tab' && !e.shiftKey && idx === formData.items.length - 1) {
                                    const ni = [...formData.items, { id: generateUUID(), type: 'PRODUCT', description: '', quantity: 1, unitPrice: 0, discountRate: 0 }];
                                    setFormData({...formData, items: ni});
                                  }
                                }}
                                className={`px-1.5 py-0.5 text-[10px] font-bold rounded transition-all ${item.discountMode === 'FIXED' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-400 hover:text-slate-600'}`}
                              >
                                ৳
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                      <div className="text-right font-black tabular-nums flex items-center justify-end space-x-2 min-w-[100px]">
                        {item.type === 'SUBTOTAL' ? (
                          <input 
                            type="number"
                            disabled={!isEditable}
                            className="w-full text-right bg-transparent outline-none font-black text-indigo-600"
                            value={item.manualValue !== undefined ? (isNaN(item.manualValue) ? '' : item.manualValue) : (isNaN(item.lineValue) ? '' : item.lineValue)}
                            onChange={e => {
                              const ni = [...formData.items];
                              ni[idx] = { ...ni[idx], manualValue: parseFloat(e.target.value) || 0 };
                              setFormData({...formData, items: ni});
                            }}
                            onKeyDown={e => {
                              if (e.key === 'Tab' && !e.shiftKey && idx === formData.items.length - 1) {
                                const ni = [...formData.items, { id: generateUUID(), type: 'PRODUCT', description: '', quantity: 1, unitPrice: 0, discountRate: 0 }];
                                setFormData({...formData, items: ni});
                              }
                            }}
                          />
                        ) : (
                          <span className="truncate">{formatBDT(item.lineValue)}</span>
                        )}
                        {isEditable && (
                          <button 
                            onClick={() => {
                              const ni = [...formData.items];
                              ni.splice(idx, 1);
                              setFormData({...formData, items: ni});
                            }}
                            className="opacity-100 transition-opacity text-slate-300 hover:text-rose-500 transition-all shrink-0"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                          </button>
                        )}
                        <button onClick={() => setAdvancedRowId(advancedRowId === item.id ? null : item.id)} className="opacity-100 transition-opacity text-slate-300 hover:text-indigo-500 transition-all shrink-0 ml-1">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4"/></svg>
                        </button>
                      </div>
                    </div>
                    {advancedRowId === item.id && (
                      <div className="pl-10 pr-4 pb-3 pt-1 bg-slate-50/50 flex space-x-4">
                        <div className="flex-1 space-y-1">
                          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Internal Note</label>
                          <input type="text" disabled={!isEditable} className="w-full bg-white border border-slate-200 rounded px-2 py-1 text-xs outline-none focus:border-indigo-500" value={item.note || ''} onChange={e => { const ni=[...formData.items]; ni[idx] = { ...ni[idx], note: e.target.value }; setFormData({...formData, items:ni}); }} placeholder="Add a note to this line..." />
                        </div>
                        <div className="w-32 space-y-1">
                          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Tax Rate (%)</label>
                          <input type="number" disabled={!isEditable} className="w-full bg-white border border-slate-200 rounded px-2 py-1 text-xs outline-none focus:border-indigo-500" value={item.taxRate || 0} onChange={e => { const ni=[...formData.items]; ni[idx] = { ...ni[idx], taxRate: parseFloat(e.target.value)||0 }; setFormData({...formData, items:ni}); }} />
                        </div>
                      </div>
                    )}
                    </div>
                    );
                  })}
                </div>
              </div>
            </div>
                {!isPosted && (
                  <div className="mt-4 flex space-x-4">
                    <button onClick={() => addLine('PRODUCT')} className="text-amber-600 font-bold text-xs hover:underline flex items-center group">
                      <svg className="w-3.5 h-3.5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M12 4v16m8-8H4"/></svg>
                      Add a line
                    </button>
                    <button onClick={() => addLine('DISCOUNT')} className="text-rose-600 font-bold text-xs hover:underline flex items-center group">
                      <svg className="w-3.5 h-3.5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M12 4v16m8-8H4"/></svg>
                      Add discount
                    </button>
                    <button onClick={() => addLine('SUBTOTAL')} className="text-indigo-600 font-bold text-xs hover:underline flex items-center group">
                      <svg className="w-3.5 h-3.5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M12 4v16m8-8H4"/></svg>
                      Add subtotal
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-12 animate-in fade-in duration-300">
                {/* Entry 1: Invoice Posting */}
                <div>
                  <h3 className="text-xs font-black uppercase text-slate-400 mb-3 tracking-widest">Entry 1: Invoice Posting (AP & Inventory)</h3>
                  {linkedJournalEntry ? (
                    <table className="w-full text-left border rounded overflow-hidden">
                      <thead className="bg-[#f8f9fa] border-b text-[11px] font-bold uppercase text-slate-600">
                        <tr>
                          <th className="px-6 py-4">Account (Number & Name)</th>
                          <th className="px-6 py-4 text-right">Debit (৳)</th>
                          <th className="px-6 py-4 text-right">Credit (৳)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y text-[13px] tabular-nums">
                        {(linkedJournalEntry.lines || []).map((l: any, i: number) => {
                          const acc = (store.accounts || []).find((a: Account) => a.id === l.accountId || a.code === l.accountId);
                          return (
                            <tr key={i} className="hover:bg-slate-50 transition-colors">
                              <td className="px-6 py-4 font-bold text-amber-700">
                                {acc ? `${acc.code} - ${acc.name}` : l.accountId}
                              </td>
                              <td className="px-6 py-4 text-right font-medium">
                                {l.debit > 0 ? formatAccounting(l.debit) : '-'}
                              </td>
                              <td className="px-6 py-4 text-right font-medium">
                                {l.credit > 0 ? formatAccounting(l.credit) : '-'}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot className="bg-slate-50 border-t font-black text-slate-900">
                        <tr>
                          <td className="px-6 py-4 text-xs uppercase text-slate-400">Ledger Totals</td>
                          <td className="px-6 py-4 text-right">
                            {formatAccounting((linkedJournalEntry.lines || []).reduce((s, l) => s + (l.debit || 0), 0))}
                          </td>
                          <td className="px-6 py-4 text-right">
                            {formatAccounting((linkedJournalEntry.lines || []).reduce((s, l) => s + (l.credit || 0), 0))}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  ) : (
                    <div className="py-10 text-center text-slate-300 italic border-2 border-dashed rounded-lg bg-slate-50/50">
                      Posting entry will appear here once the invoice is confirmed.
                    </div>
                  )}
                </div>

                {/* Entry 2: Payment Settlement */}
                {isPaid && (
                  <div className="animate-in slide-in-from-bottom duration-500">
                    <h3 className="text-xs font-black uppercase text-emerald-600 mb-3 tracking-widest">Entry 2: Payment Settlement (AP Clearance)</h3>
                    {paymentEntry ? (
                      <table className="w-full text-left border border-emerald-100 rounded overflow-hidden shadow-sm">
                        <thead className="bg-emerald-50/50 border-b text-[11px] font-bold uppercase text-emerald-800">
                          <tr>
                            <th className="px-6 py-4">Account (Number & Name)</th>
                            <th className="px-6 py-4 text-right">Debit (৳)</th>
                            <th className="px-6 py-4 text-right">Credit (৳)</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y text-[13px] tabular-nums bg-white">
                          {(paymentEntry.lines || []).map((l: any, i: number) => {
                            const acc = (store.accounts || []).find((a: Account) => a.id === l.accountId || a.code === l.accountId);
                            return (
                              <tr key={i} className="hover:bg-emerald-50/20">
                                <td className="px-6 py-4 font-bold text-slate-700">
                                  {acc ? `${acc.code} - ${acc.name}` : l.accountId}
                                </td>
                                <td className="px-6 py-4 text-right font-medium text-emerald-600">
                                  {l.debit > 0 ? formatAccounting(l.debit) : '-'}
                                </td>
                                <td className="px-6 py-4 text-right font-medium text-rose-600">
                                  {l.credit > 0 ? formatAccounting(l.credit) : '-'}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                        <tfoot className="bg-emerald-50/20 border-t font-black text-emerald-900">
                          <tr>
                            <td className="px-6 py-4 text-xs uppercase text-emerald-400">Payment Totals</td>
                            <td className="px-6 py-4 text-right">
                              {formatAccounting((paymentEntry.lines || []).reduce((s, l) => s + (l.debit || 0), 0))}
                            </td>
                            <td className="px-6 py-4 text-right">
                              {formatAccounting((paymentEntry.lines || []).reduce((s, l) => s + (l.credit || 0), 0))}
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    ) : (
                      <div className="py-10 text-center text-slate-300 italic">Finding associated payment entry...</div>
                    )}
                  </div>
                )}
              </div>
            )}

            <div className="mt-auto pt-10 flex justify-end">
               <div className="w-full sm:w-80 space-y-2 p-6 bg-slate-50 rounded border border-slate-200">
                  <div className="flex justify-between text-sm text-slate-600"><span>Subtotal</span><span className="font-bold">{formatBDT(totals.sub)}</span></div>
                  {totals.disc > 0 && <div className="flex justify-between text-sm text-rose-600"><span>Discount</span><span className="font-bold">-{formatBDT(totals.disc)}</span></div>}
                  <div className="flex justify-between text-xl font-black text-amber-600 border-t-2 border-amber-600 pt-4 mt-2"><span>Total Invoice</span><span>{formatBDT(totals.total)}</span></div>
                  {Math.abs(totals.total - totals.amountDue) > 0.01 && (
                    <div className="flex justify-between text-lg font-black text-emerald-600 border-t border-dashed border-emerald-200 pt-2 mt-2">
                      <span>Amount Due</span>
                      <span>{formatBDT(totals.amountDue)}</span>
                    </div>
                  )}
               </div>
            </div>
            
            <div className="mt-8">
              <div>
                <label className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 block">Customer Note</label>
                <textarea 
                  disabled={!isEditable}
                  className="w-full border rounded-lg p-2.5 text-sm bg-slate-50 outline-none focus:ring-2 focus:ring-[#714B67]/20 transition-all min-h-[44px]"
                  placeholder="Add a note for the customer..."
                  value={(formData as any).customerNote || ''}
                  onChange={e => setFormData({...formData, customerNote: e.target.value})}
                />
              </div>
            </div>
             {editingId && (
               <Chatter 
                 messages={currentInvoice?.messages || []} 
                 users={store.users} 
                 onSendMessage={(body) => store.updateInvoice(editingId, { 
                   messages: [...(currentInvoice?.messages || []), {
                     id: generateUUID(),
                     authorId: store.currentUser?.id || 'user-1',
                     body,
                     date: new Date().toISOString(),
                     type: 'comment'
                   }]
                 })}
                 entityType="Invoice"
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
        title={<h2 className="text-2xl font-bold text-slate-800">Customer Invoices</h2>}
        actions={
          <>
            <button onClick={() => { setEditingId(null); const cs = (store.contacts || []).find((c:any)=>c.name?.toLowerCase().includes('cash sale') || c.type==='CASH'); setFormData({ customerId: cs ? cs.id : '', items: [], date: getOpDateBST(), dueDate: '', reference: '', customerNote: '', deliveryPerson: '', srId: '', paymentMethod: 'CREDIT' }); setShowForm(true); }} className="bg-amber-600 text-white px-8 py-2 rounded font-bold shadow-md hover:brightness-110 active:scale-95 transition-all">New</button>
            <ExportButtons onExport={handleExport} />
            {selectedInvoiceIds.length > 0 && (
              <button
                onClick={async () => {
                   
                   const selectedInvoices = (store.paginatedInvoices || []).filter((i: any) => selectedInvoiceIds.includes(i.id));
                   
                   const paramsList = selectedInvoices.map((inv: any) => {
                     const customer = (store.contacts || []).find((c: any) => c.id === inv.customerId);
                     const company = (store.companies || []).find((c: any) => c.id === inv?.companyId);
                     const paymentsTotal = (store.payments || []).filter((p: any) => p.status === 'POSTED' && (p.invoiceId === inv.id || (p.appliedInvoices || []).some((a: any) => a.invoiceId === inv.id))).reduce((s: number, p: any) => {
                       if (p.invoiceId === inv.id) return s + p.amount;
                       const ab = (p.appliedInvoices || []).find((ai: any) => ai.invoiceId === inv.id);
                       return s + (ab?.amount || 0);
                     }, 0);
                     const outstandingBalance = store.getPartnerBalance ? store.getPartnerBalance(inv.customerId) : 0;

                     return {
                       invoice: inv,
                       customer,
                       company,
                       employees: store.employees || [],
                       items: inv.items || [],
                       totals: {
                         total: inv.total,
                         amountDue: inv.total - paymentsTotal
                       },
                       outstandingBalance,
                       printedBy: store.currentUser?.name || store.currentUser?.email || 'System'
                     };
                   });
                   
                   await generateBulkInvoicePDF(paramsList);
                }}
                className="bg-indigo-600 text-white px-6 py-2 rounded font-bold shadow-md hover:brightness-110 active:scale-95 transition-all flex items-center"
              >
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
                Bulk PDF ({selectedInvoiceIds.length})
              </button>
            )}
            {selectedInvoiceIds.length > 0 && !selectedInvoiceIds.some(id => (store.invoices || []).find((b: any) => b.id === id)?.status === 'DRAFT') && (
              <button 
                onClick={handleBatchPayment}
                className="bg-emerald-600 text-white px-6 py-2 rounded font-bold shadow-md hover:brightness-110 active:scale-95 transition-all flex items-center"
              >
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z"/></svg>
                Register Payment ({selectedInvoiceIds.length})
              </button>
            )}
          </>
        }
        filters={filterState} 
        setFilters={setFilterState} 
        contacts={store.contacts || []}
        products={store.products || []}
        users={store.users || []}
        statuses={[
          { id: 'DRAFT', label: 'Draft' },
          { id: 'POSTED', label: 'Posted' },
          { id: 'PAID', label: 'Paid' },
          { id: 'VOID', label: 'Void' },
        ]}
        type="invoice"
        placeholder="Search by Invoice #, Customer..."
      />
      <div className="flex-none bg-white border-b border-slate-200 px-6 py-2 shadow-sm">
        <Pagination 
          currentPage={currentPage} 
          totalPages={totalPages} 
          totalItems={store.invoiceCount} 
          itemsPerPage={pageSize} 
          onPageChange={setCurrentPage} 
          onItemsPerPageChange={setPageSize}
          pageOptions={[50, 80, 100, 250, 500]}
        />
      </div>
      <div className="flex-1 overflow-auto bg-white m-6 mt-2 rounded-lg shadow-xl border border-slate-200">
        <table className="w-full text-left text-sm border-collapse">
          <thead className="bg-slate-800 text-white text-[10px] font-black uppercase tracking-widest">
            <tr>
              <th className="p-4 pl-6 w-10">
                <input 
                  type="checkbox" 
                  className="rounded border-slate-600 bg-transparent" 
                  checked={selectedInvoiceIds.length === paginatedInvoices.length && paginatedInvoices.length > 0}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setSelectedInvoiceIds(paginatedInvoices.map(i => i.id));
                    } else {
                      setSelectedInvoiceIds([]);
                    }
                  }}
                />
              </th>
              {columns.find(c => c.id === 'number')?.visible && <th className="p-4">Invoice #</th>}
              {columns.find(c => c.id === 'customer')?.visible && <th className="p-4">Customer</th>}
              {columns.find(c => c.id === 'date')?.visible && <th className="p-4">Date & Time</th>}
              {columns.find(c => c.id === 'reference')?.visible && <th className="p-4">Reference</th>}
              {columns.find(c => c.id === 'total')?.visible && <th className="p-4 text-right">Total</th>}
              {columns.find(c => c.id === 'amount_due')?.visible && <th className="p-4 text-right">Amount Due</th>}
              {columns.find(c => c.id === 'margin_amount')?.visible && <th className="p-4 text-right">Profit (Amt)</th>}
              {columns.find(c => c.id === 'margin_percent')?.visible && <th className="p-4 text-right">Profit (%)</th>}
              {columns.find(c => c.id === 'status')?.visible && <th className="p-4">Status</th>}
              {columns.find(c => c.id === 'createdBy')?.visible && <th className="p-4">Created By</th>}
              <th className="p-4 w-10 text-right">
                <ColumnSelector columns={columns} onChange={setColumns} />
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {paginatedInvoices.length === 0 ? (
               <tr><td colSpan={8} className="p-20 text-center italic text-slate-300 font-black tracking-widest uppercase">No Invoices Found</td></tr>
            ) :
              paginatedInvoices.map((invoice: Invoice) => {
                const paid = paymentsMap.get(invoice.id) || 0;
                const balanceDue = Math.max(0, invoice.total - paid);
                const displayStatus = invoice.status === 'DELETED' ? 'DELETED' : (balanceDue <= 0 && invoice.status !== 'DRAFT') ? 'PAID' : invoice.status;
                const { profit, marginPercent } = calculateInvoiceProfit(invoice, store.products || [], store.creditNotes || [], productMap, creditNotesMap);
                return (
              <tr key={invoice.id} className={`hover:bg-slate-50 cursor-pointer ${selectedInvoiceIds.includes(invoice.id) ? 'bg-amber-50' : ''}`} onClick={() => { setEditingId(invoice.id); setFormData({ customerId: invoice.customerId, items: invoice.items, date: invoice.date, dueDate: invoice.dueDate, reference: invoice.reference || '', customerNote: invoice.customerNote || '', deliveryPerson: invoice.deliveryPerson || '', srId: invoice.srId || '', paymentMethod: (invoice as any).paymentMethod || 'CREDIT' }); setShowForm(true); }}>
                <td className="p-4 pl-6" onClick={e => e.stopPropagation()}>
                  <input 
                    type="checkbox" 
                    className="rounded border-slate-300 text-amber-600 focus:ring-amber-500" 
                    checked={selectedInvoiceIds.includes(invoice.id)}
                    onChange={(e) => {
                      e.stopPropagation();
                      if (e.target.checked) {
                        setSelectedInvoiceIds([...selectedInvoiceIds, invoice.id]);
                      } else {
                        setSelectedInvoiceIds(selectedInvoiceIds.filter(id => id !== invoice.id));
                      }
                    }}
                  />
                </td>
                {columns.find(c => c.id === 'number')?.visible && <td className="p-4 font-bold text-amber-600">{invoice.number}</td>}
                {columns.find(c => c.id === 'customer')?.visible && (
                  <td className="p-4 font-medium text-slate-700">
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        const customer = (store.contacts || []).find((c: any) => c.id === invoice.customerId);
                        window.dispatchEvent(new CustomEvent('accounting-nav', { detail: { screen: 'CONTACTS', filter: { searchQuery: customer?.name, contactId: customer?.id } } }));
                      }}
                      className="hover:underline hover:text-amber-600 text-left"
                    >
                      {(store.contacts || []).find((c: any) => c.id === invoice.customerId)?.name}
                    </button>
                  </td>
                )}
                {columns.find(c => c.id === 'date')?.visible && <td className="p-4 text-slate-500 whitespace-nowrap">{formatDateTime(invoice.createdAt || invoice.updatedAt || invoice.date)}</td>}
                {columns.find(c => c.id === 'reference')?.visible && <td className="p-4 text-slate-500">{invoice.reference || '-'}</td>}
                {columns.find(c => c.id === 'total')?.visible && <td className="p-4 text-right font-black tabular-nums">{formatBDT(invoice.total)}</td>}
                {columns.find(c => c.id === 'amount_due')?.visible && <td className="p-4 text-right font-bold tabular-nums text-rose-600">
                  {formatBDT(balanceDue)}
                </td>}
                {columns.find(c => c.id === 'margin_amount')?.visible && <td className="p-4 text-right">
                  <span className={`font-bold tabular-nums ${profit >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                    {profit >= 0 ? '+' : ''}{formatBDT(profit)}
                  </span>
                </td>}
                {columns.find(c => c.id === 'margin_percent')?.visible && <td className="p-4 text-right">
                  <span className={`text-[10px] font-black ${marginPercent >= 0 ? 'text-emerald-500/70' : 'text-rose-500/70'}`}>
                    {marginPercent.toFixed(1)}%
                  </span>
                </td>}
                {columns.find(c => c.id === 'status')?.visible && <td className="p-4">
                  <span className={`px-4 py-1 rounded-full text-[10px] font-black uppercase tracking-tighter ${
                    ((balanceDue <= 0 && displayStatus !== 'DRAFT' && displayStatus !== 'DELETED') || displayStatus === 'PAID') ? 'bg-emerald-100 text-emerald-700' : 
                    displayStatus === 'PARTIAL' ? 'bg-emerald-50 text-emerald-600' :
                    displayStatus === 'IN_PAYMENT' ? 'bg-amber-100 text-amber-700' :
                    displayStatus === 'POSTED' ? 'bg-amber-100 text-amber-700' : 
                    displayStatus === 'DELETED' ? 'bg-rose-100 text-rose-700' :
                    'bg-slate-100 text-slate-500'
                  }`}>{displayStatus === 'IN_PAYMENT' ? 'In Payment' : (displayStatus === 'DELETED' ? 'Deleted' : displayStatus)}</span>
                </td>}
                {columns.find(c => c.id === 'createdBy')?.visible && (
                  <td className="p-4 text-slate-500">
                    {invoice.preparedBy || store.resolveUserName(invoice.createdById) || '-'}
                  </td>
                )}
                <td className="p-4" onClick={e => e.stopPropagation()}>
                  {invoice.status === 'DELETED' && store.currentUser?.roleId === 'role-admin' && (
                    <div className="flex items-center justify-end space-x-2">
                       <button 
                         onClick={() => store.restoreRecord('invoice', invoice.id)}
                         className="px-2 py-1 text-[9px] font-black uppercase text-amber-600 hover:bg-amber-50 rounded border border-amber-200"
                       >
                         Restore
                       </button>
                       <button 
                         onClick={() => { if(confirm('Permanently delete this invoice?')) store.permanentDeleteRecord('invoice', invoice.id); }}
                         className="px-2 py-1 text-[9px] font-black uppercase text-rose-600 hover:bg-rose-50 rounded border border-rose-200"
                       >
                         Delete
                       </button>
                    </div>
                  )}
                </td>
              </tr>
            )
          })
        }
      </tbody>
        </table>
      </div>
      {showBatchPaymentModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
          <div className="bg-[#1a1d21] border border-slate-700 w-full max-w-md rounded-xl shadow-2xl overflow-hidden animate-in zoom-in duration-200">
            <div className="px-6 py-4 border-b border-slate-700 flex justify-between items-center bg-[#25282c]">
              <h3 className="font-bold text-white uppercase tracking-widest text-xs tracking-widest">Register Batch Payment (Customers)</h3>
              <button onClick={() => setShowBatchPaymentModal(false)} className="text-slate-400 hover:text-white transition-colors">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"/></svg>
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Payment Date</label>
                <input 
                  type="date" 
                  className="w-full bg-[#0d1012] border border-slate-700 rounded-lg px-4 py-2 text-white text-sm outline-none focus:ring-2 focus:ring-amber-500/50 transition-all font-bold"
                  value={batchPaymentData.date}
                  onChange={e => setBatchPaymentData({...batchPaymentData, date: e.target.value})}
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Payment Method</label>
                <select 
                  className="w-full bg-[#0d1012] border border-slate-700 rounded-lg px-4 py-2 text-white text-sm outline-none focus:ring-2 focus:ring-amber-500/50 transition-all font-bold"
                  value={batchPaymentData.method || ""}
                  onChange={e => setBatchPaymentData({...batchPaymentData, method: e.target.value})}
                >
                  <option value="CASH">Cash</option>
                  <option value="BANK">Bank Transfer</option>
                  <option value="CHEQUE">Cheque</option>
                  <option value="BKASH">bKash</option>
                  <option value="NAGAD">Nagad</option>
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Reference</label>
                <input 
                  type="text" 
                  placeholder="Memo / Reference..."
                  className="w-full bg-[#0d1012] border border-slate-700 rounded-lg px-4 py-2 text-white text-sm outline-none focus:ring-2 focus:ring-amber-500/50 transition-all font-bold italic"
                  value={batchPaymentData.reference}
                  onChange={e => setBatchPaymentData({...batchPaymentData, reference: e.target.value})}
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Category / Type</label>
                <select 
                  className="w-full bg-[#0d1012] border border-slate-700 rounded-lg px-4 py-2 text-white text-sm outline-none focus:ring-2 focus:ring-amber-500/50 transition-all font-bold"
                  value={batchPaymentData.paymentCategory || ''}
                  onChange={e => setBatchPaymentData({...batchPaymentData, paymentCategory: e.target.value})}
                >
                  <option value="">Select Category...</option>
                  {(store.payments || []).map((p: any) => p.paymentCategory).filter(Boolean).filter((v: any, i: number, a: any[]) => a.indexOf(v) === i).map(cat => (
                    <option key={String(cat)} value={String(cat)}>{String(cat)}</option>
                  ))}
                  <option value="MARKET">MARKET</option>
                  <option value="CORPORATE">CORPORATE</option>
                </select>
              </div>
              <div className="pt-2">
                <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-5 flex justify-between items-center shadow-inner">
                  <span className="text-[10px] font-bold text-amber-500/70 uppercase tracking-widest">Total Amount</span>
                  <span className="text-xl font-black text-amber-500">{formatBDT(batchPaymentData.amount)}</span>
                </div>
              </div>
            </div>
            <div className="px-6 py-4 bg-[#25282c] border-t border-slate-700 flex justify-end space-x-3">
              <button 
                onClick={() => setShowBatchPaymentModal(false)}
                className="px-4 py-2 text-xs font-black text-slate-400 hover:text-white transition-all uppercase tracking-widest"
              >
                Cancel
              </button>
              <button 
                onClick={confirmBatchPayment}
                disabled={isSubmittingBatch}
                className="bg-amber-600 text-white px-8 py-2 rounded-lg text-xs font-black shadow-lg hover:brightness-110 active:scale-95 transition-all uppercase tracking-widest"
              >
                Register Payment
              </button>
            </div>
          </div>
        </div>
      )}


    </div>
  );
};

export default InvoiceManager;