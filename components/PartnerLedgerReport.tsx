import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { Users, ArrowLeft, ChevronRight, Home, Search, Calendar, Filter, X, Check, Building2, Tag, Hash, ChevronDown, RotateCcw, Loader2 } from 'lucide-react';
import { Contact, ContactType, JournalEntry } from '../types';
import {formatBDT, formatNumber, exportToCSV, exportToXLSX, getOpDateBST} from '../constants';
import { generatePDFReport, generatePartnerLedgerPDF } from '../services/pdfService';
import { reportingService } from '../services/reportingService';
import ExportButtons from './ExportButtons';
import Pagination from './Pagination';
import ColumnSelector, { useColumns } from './ColumnSelector';

interface PartnerLedgerFilterState {
  startDate: string;
  endDate: string;
  datePreset: string;
  partnerIds: string[];
  transactionType: string;
  reference: string;
  entryStatus: string;
  searchQuery: string;
}

const SmartSearchMulti: React.FC<{
  options: { id: string; label: string; sublabel?: string; searchKey: string }[];
  value: string[];
  onChange: (val: string[]) => void;
  label: string;
  icon: React.ReactNode;
}> = ({ options, value, onChange, label, icon }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  
  const filteredOptions = useMemo(() => {
    return (options || []).filter(o => 
      String(o.searchKey || '').toLowerCase().includes(search.toLowerCase())
    ).slice(0, 50);
  }, [options, search]);

  const toggleOption = (id: string) => {
    const next = value.includes(id) ? value.filter(x => x !== id) : [...value, id];
    onChange(next);
  };

  const selectedSummary = value.length === 0 ? 'All' : value.length === 1 ? options.find(o => o.id === value[0])?.label : `${value.length} Selected`;

  return (
    <div className="relative">
      <div 
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-between w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl hover:border-indigo-500 transition-all cursor-pointer select-none"
      >
        <div className="flex items-center space-x-3 overflow-hidden">
          {icon}
          <div className="flex flex-col">
            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none mb-0.5">{label}</span>
            <span className="text-sm font-bold text-slate-700 truncate max-w-[120px]">{selectedSummary}</span>
          </div>
        </div>
        <ChevronDown size={14} className={`text-slate-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
      </div>
      
      {isOpen && (
        <div className="absolute top-full left-0 mt-2 w-full min-w-[280px] bg-white border border-slate-200 rounded-2xl shadow-2xl z-[100] animate-in fade-in slide-in-from-top-2">
          <div className="p-3 border-b border-slate-100">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input 
                autoFocus
                className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all"
                placeholder="Search..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                onClick={e => e.stopPropagation()}
              />
            </div>
            <div className="flex justify-between items-center mt-2 px-1">
              <button 
                onClick={(e) => { e.stopPropagation(); onChange(options.map(o => o.id)); }}
                className="text-[10px] font-black text-indigo-600 uppercase tracking-widest hover:text-indigo-700"
              >
                Select All
              </button>
              <button 
                onClick={(e) => { e.stopPropagation(); onChange([]); }}
                className="text-[10px] font-black text-slate-400 uppercase tracking-widest hover:text-rose-500"
              >
                Clear
              </button>
            </div>
          </div>
          <div className="max-h-[300px] overflow-y-auto p-2 space-y-1">
            {filteredOptions.length > 0 ? (
              filteredOptions.map(opt => {
                const checked = value.includes(opt.id);
                return (
                  <div 
                    key={opt.id}
                    onClick={(e) => { e.stopPropagation(); toggleOption(opt.id); }}
                    className={`flex items-center justify-between px-3 py-2 rounded-xl cursor-pointer transition-all ${
                      checked ? 'bg-indigo-50 text-indigo-700' : 'hover:bg-slate-50 text-slate-600'
                    }`}
                  >
                    <div className="flex flex-col min-w-0">
                      <span className="text-sm font-bold truncate">{opt.label}</span>
                      {opt.sublabel && <span className="text-[10px] font-medium opacity-60 truncate">{opt.sublabel}</span>}
                    </div>
                    {checked && <Check size={14} className="shrink-0 ml-2" />}
                  </div>
                );
              })
            ) : (
              <div className="py-8 text-center text-slate-400 italic text-sm">No matches found</div>
            )}
          </div>
        </div>
      )}
      {isOpen && <div className="fixed inset-0 z-[90]" onClick={() => setIsOpen(false)} />}
    </div>
  );
};
const PartnerLedgerReport: React.FC<{ 
  store: any; 
  defaultCreate?: boolean; 
  initialPartnerId?: string; 
  initialPartnerType?: ContactType; 
  onClearContext?: () => void;
  onBack?: () => void;
  onNavigate?: (tab: string, filter?: any) => void;
hideHeader?: boolean;
}> = ({ store, defaultCreate, initialPartnerId, initialPartnerType, onClearContext, onBack, onNavigate, hideHeader }) => {
  const isAssetTx = useCallback((t: any) => {
    if (!t?.accountName && !t?.account_name) return false;
    const name = String(t.accountName || t.account_name).toLowerCase();
    return (
      name.includes('receivable') ||
      name.includes('asset') ||
      name.includes('savings deposit') ||
      name.includes('deposit') ||
      name.includes('loan provided')
    ) && !name.includes('payable');
  }, []);

  const todayStr = getOpDateBST();
  const [filters, setFilters] = useState<PartnerLedgerFilterState>({
    startDate: todayStr.substring(0,4) + '-01-01',
    endDate: todayStr,
    datePreset: 'all',
    partnerIds: initialPartnerId ? [initialPartnerId] : [],
    transactionType: 'ALL',
    reference: '',
    entryStatus: 'POSTED',
    searchQuery: ''
  });

  const [columns, setColumns] = useColumns('partner_ledger_list', [
    { id: 'date', label: 'Date', visible: true },
    { id: 'account', label: 'Account', visible: true },
    { id: 'reference', label: 'Reference', visible: true },
    { id: 'narration', label: 'Narration', visible: true },
    { id: 'preparedBy', label: 'Prepared By', visible: true },
    { id: 'debit', label: 'Debit', visible: true },
    { id: 'credit', label: 'Credit', visible: true },
    { id: 'balance', label: 'Balance', visible: true },
  ]);

  const [partnerType, setPartnerType] = useState<ContactType>(initialPartnerType || ContactType.CUSTOMER);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(80);
  const [isDataLoading, setIsDataLoading] = useState(false);
  const [partnerLedgerData, setPartnerLedgerData] = useState<Record<string, any[]>>({});
  const [partnerOpeningBalances, setPartnerOpeningBalances] = useState<Record<string, number>>({});

  const activeCompanyIds = useMemo(() => {
    return store.activeCompanyIds?.length > 0 ? store.activeCompanyIds : [store.currentCompany?.id].filter(Boolean);
  }, [store.activeCompanyIds, store.currentCompany?.id]);

  const activeCompanyIdsStr = useMemo(() => JSON.stringify(activeCompanyIds), [activeCompanyIds]);
  const partnerIdsStr = useMemo(() => JSON.stringify(filters.partnerIds), [filters.partnerIds]);

  useEffect(() => {
    let isMounted = true;
    const fetchData = async () => {
      setIsDataLoading(true);
      try {
        const partnerIds = filters.partnerIds.length > 0 && filters.partnerIds.length < 50 ? filters.partnerIds : null;
        
        // 1. Fetch transactions (ledger)
        const ledger = await reportingService.getPartnerLedger(
          activeCompanyIds,
          partnerIds,
          filters.startDate || '2000-01-01',
          filters.endDate || '2100-01-01',
          partnerType
        );

        // 2. Fetch opening balances (balances as of startDate)
        const summaries = filters.startDate ? await reportingService.getPartnerSummary(
          activeCompanyIds,
          partnerType,
          filters.startDate
        ) : [];

        if (!isMounted) return;

        // Group ledger by partner
        const groupedLedger: Record<string, any[]> = {};
        ledger.forEach((tx: any) => {
          const partnerId = tx.partner_id || 'contact-cash-sale-global';

          // Skip opening balance journal entries because the Ledger prepends an explicit "Opening Balance" row
          
          // Hard drop duplicate JE-PAY- if System and CPAY exists. Actually, drop any JE-PAY- if another JE-CPAY- exists for the same base ID.
          if (tx.journal_id && tx.journal_id.startsWith('JE-PAY-')) {
             const base = tx.journal_id.replace('JE-PAY-', '');
             if (ledger.some((l:any) => l.journal_id === 'JE-CPAY-' + base || l.journal_id === 'JE-VPAY-' + base)) {
                 return;
             }
          }
          
          const isOpBalTx = 
            String(tx.journal_id || '').toUpperCase().includes('INIT') ||
            String(tx.reference || '').toUpperCase().startsWith('INIT') ||
            String(tx.description || '').toLowerCase().startsWith('initial balance');

          if (isOpBalTx) {
            return;
          }

          let customNarration = tx.description || '-';
          const refString = String(tx.reference || '');
          const descString = String(tx.description || '');
          
          if (refString.startsWith('INV-') || refString.startsWith('BIL-') || refString.startsWith('CN-')) {
             customNarration = refString.split(' ')[0]; // Just the number
          } else if (refString.startsWith('PAY-') || descString.includes('PAY-')) {
             // Look for applied invoices/bills in the reference or description string
             const combinedString = refString + ' ' + descString;
             const docMatches = combinedString.match(/(?:INV|BIL|CN)-[A-Z0-9-]+/g);
             if (docMatches && docMatches.length > 0) {
               // Deduplicate matches
               customNarration = [...new Set(docMatches)].join(', ');
             } else {
               // Try looking in store.payments if loaded in memory
               const payRef = refString.startsWith('PAY-') ? refString : (descString.match(/PAY-[A-Z0-9-]+/) || [])[0] || '';
               const pay = (store.payments || []).find((p: any) => payRef && (p.paymentNumber === payRef || p.id === payRef || payRef.includes(p.paymentNumber) || payRef.includes(p.id)));
               if (pay) {
                  const apps = pay.appliedInvoices || pay.appliedBills || pay.applied_invoices || pay.applied_bills || [];
                  if (apps && apps.length > 0) {
                     const nums = apps.map((a: any) => a.invoiceNumber || a.billNumber || a.invoiceId || a.billId).filter(Boolean);
                     if (nums.length > 0) {
                        customNarration = nums.join(', ');
                     } else {
                        customNarration = payRef.split(' ')[0] || '-';
                     }
                  } else {
                     customNarration = payRef.split(' ')[0] || '-';
                  }
               } else {
                  customNarration = payRef ? payRef.split(' ')[0] : '-';
               }
             }
          } else if (refString) {
             customNarration = refString.split(' ')[0];
          }

          if (!groupedLedger[partnerId]) groupedLedger[partnerId] = [];
          groupedLedger[partnerId].push({
            id: tx.journal_id,
            date: tx.journal_date,
            accountName: tx.account_name,
            reference: tx.reference,
            narration: customNarration,
            preparedBy: tx.responsible_name || '-',
            debit: tx.debit,
            credit: tx.credit,
            contactName: tx.contact_name
          });
        });

        // Map opening balances
        const obs: Record<string, number> = {};
        summaries.forEach((s: any) => {
          obs[s.contact_id] = s.balance;
        });

        setPartnerLedgerData(groupedLedger);
        setPartnerOpeningBalances(obs);
      } catch (err) {
        console.error('Failed to fetch partner ledger data:', err);
      } finally {
        if (isMounted) setIsDataLoading(false);
      }
    };

    fetchData();
    
    // ensure contacts of the requested type are loaded into the store
    if (store.fetchContacts && (partnerType === ContactType.CUSTOMER || partnerType === ContactType.VENDOR || partnerType === ContactType.EMPLOYEE || partnerType === ContactType.LENDER)) {
      store.fetchContacts({ type: partnerType, limit: 1000, forceRefresh: false });
    }
    
    return () => { isMounted = false; };
  }, [activeCompanyIdsStr, partnerIdsStr, filters.startDate, filters.endDate, partnerType]);

  const activePartners = useMemo(() => {
    const storeMap = new Map();
    (store.contacts || []).forEach((c: any) => storeMap.set(c.id, c));

    const dataPartnerIds = new Set([
      ...Object.keys(partnerLedgerData),
      ...Object.keys(partnerOpeningBalances)
    ]);

    const allPartners: any[] = [];
    
    (store.contacts || []).forEach((c: any) => {
      const isCashSale = c.id === 'contact-cash-sale-global' || String(c.id).startsWith('contact-cash-sale-');
      let matchesType = false;
      if (partnerType === 'LOAN_RECEIVABLE' || partnerType === 'LOAN_PAYABLE') {
        const hasLedger = partnerLedgerData[c.id] && partnerLedgerData[c.id].length > 0;
        const hasOpBal = partnerOpeningBalances[c.id] && partnerOpeningBalances[c.id] !== 0;
        const loanTypeFilter = partnerType === 'LOAN_RECEIVABLE' ? 'GIVEN' : 'RECEIVED';
        const hasActiveLoan = (store.loans || []).some((l: any) => 
          (l.contactId || l.contact_id) === c.id && 
          l.status === 'ACTIVE' && 
          l.type === loanTypeFilter && 
          activeCompanyIds.includes(l.companyId || l.company_id)
        );
        matchesType = Boolean(hasLedger || hasOpBal || hasActiveLoan);
      } else {
        matchesType = c.type === (partnerType as any) || (isCashSale && (partnerType === 'CUSTOMER' || partnerType === 'VENDOR'));
      }
      if (matchesType) {
        allPartners.push(c);
      }
    });

    dataPartnerIds.forEach(id => {
      if (!storeMap.has(id)) {
        const txs = partnerLedgerData[id] || [];
        let inferredName = 'Unknown Partner';
        if (txs.length > 0) {
           inferredName = txs[0].contactName || 'Unknown Partner';
        }
        allPartners.push({ id, name: inferredName, type: partnerType });
      }
    });

    return allPartners.filter(c => {
      const ob = partnerOpeningBalances[c.id] || 0;
      const txs = partnerLedgerData[c.id] || [];
      const hasData = txs.length > 0 || Math.abs(ob) > 0.005;

      if (!hasData && filters.partnerIds.length === 0) return false;

      const matchesPartnerIds = filters.partnerIds.length === 0 || filters.partnerIds.includes(c.id);
      const matchesSearch = !filters.searchQuery || 
        String(c.name).toLowerCase().includes(filters.searchQuery.toLowerCase()) ||
        String(c.externalId || '').toLowerCase().includes(filters.searchQuery.toLowerCase());
      
      return matchesPartnerIds && matchesSearch;
    });
  }, [store.contacts, partnerType, filters.partnerIds, filters.searchQuery, partnerLedgerData, partnerOpeningBalances, store.loans, activeCompanyIds]);

  const totalPages = Math.ceil(activePartners.length / pageSize);
  const paginatedPartners = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return activePartners.slice(start, start + pageSize);
  }, [activePartners, currentPage, pageSize]);

  const getRawPartnerOpeningBalance = useCallback((partnerId: string) => {
    let rawBal = 0;
    if (partnerOpeningBalances[partnerId] !== undefined && partnerOpeningBalances[partnerId] !== 0) {
      rawBal = partnerOpeningBalances[partnerId];
    } else {
      const contact = (store.contacts || []).find((c: any) => c.id === partnerId);
      if (contact && contact.openingBalances) {
        rawBal = activeCompanyIds.reduce((sum: number, cid: string) => sum + (contact.openingBalances?.[cid] || 0), 0);
      }
    }
    const isCustomerOrAsset = ['CUSTOMER', 'EMPLOYEE', 'LOAN_RECEIVABLE'].includes(partnerType as string);
    return isCustomerOrAsset ? rawBal : -rawBal;
  }, [partnerOpeningBalances, store.contacts, activeCompanyIds, partnerType]);

  const getPartnerTransactions = (partnerId: string) => {
    return partnerLedgerData[partnerId] || [];
  };

  const handleExport = useCallback((format: 'excel' | 'pdf', scope: 'page' | 'all') => {
    const partnersToExport = scope === 'page' ? paginatedPartners : activePartners;
    let typeName = 'Employee';
    if (partnerType === ContactType.CUSTOMER) typeName = 'Customer';
    else if (partnerType === ContactType.VENDOR) typeName = 'Vendor';
    else if (partnerType === ContactType.LENDER) typeName = 'Lender';
    else if (partnerType === 'LOAN_RECEIVABLE') typeName = 'Loan Receivable';
    else if (partnerType === 'LOAN_PAYABLE') typeName = 'Loan Payable';

    const title = `${typeName} Ledger Report`;
    const visibleCols = columns.filter(c => c.visible);
    
    if (format === 'excel') {
      const rows: any[][] = [['Partner', 'Unique External ID', ...visibleCols.map(c => c.label)]];
      let grandDebit = 0;
      let grandCredit = 0;
      
      partnersToExport.forEach((p: Contact) => {
        const partnerHeader: any = { 
          partner: String(p.name || '').toUpperCase(),
          externalId: p.externalId || ''
        };
        rows.push([partnerHeader.partner, partnerHeader.externalId, ...visibleCols.map(c => partnerHeader[c.id] || '')]);
        
        const opBal = getRawPartnerOpeningBalance(p.id);
        const displayOpBal = opBal;
        let bal = displayOpBal;
        let partnerDebit = opBal > 0 ? opBal : 0;
        let partnerCredit = opBal < 0 ? Math.abs(opBal) : 0;
        
        const isCustomer = partnerType === ContactType.CUSTOMER;
        const opDebit = opBal > 0 ? opBal : 0;
        const opCredit = opBal < 0 ? Math.abs(opBal) : 0;
        
        // Add Opening Balance Row to Excel
        if (opBal !== 0) {
          const opRow: any = {
            date: 'OPENING BALANCE',
            reference: 'INITIAL',
            debit: opDebit > 0 ? opDebit : 0,
            credit: opCredit > 0 ? opCredit : 0,
            balance: bal
          };
          rows.push(['', '', ...visibleCols.map(c => opRow[c.id])]);
        }

        const txs = getPartnerTransactions(p.id);
        
        txs.forEach((t: any) => {
          const currentBal = t.debit - t.credit;
          bal += currentBal;
          partnerDebit += t.debit;
          partnerCredit += t.credit;
          
          const rowData: any = {
            date: t.date,
            account: t.accountName,
            reference: t.reference,
            narration: t.narration,
            preparedBy: t.preparedBy,
            debit: t.debit || 0,
            credit: t.credit || 0,
            balance: bal || 0
          };
          rows.push(['', '', ...visibleCols.map(c => rowData[c.id])]);
        });
        
        const totalRow: any = {
          date: 'TOTAL',
          debit: partnerDebit || 0,
          credit: partnerCredit || 0,
          balance: bal || 0
        };
        rows.push(['', '', ...visibleCols.map(c => totalRow[c.id] || '')]);
        rows.push([]);
        
        grandDebit += partnerDebit;
        grandCredit += partnerCredit;
      });
      
      const grandTotalRow: any = {
        date: 'GRAND TOTAL',
        debit: grandDebit || 0,
        credit: grandCredit || 0,
        balance: (grandDebit - grandCredit) || 0
      };
      rows.push(['', '', ...visibleCols.map(c => grandTotalRow[c.id] || '')]);
      
      exportToXLSX('Partner_Ledger', rows);
    } else {
      const dataToExport: any[] = [];
      partnersToExport.forEach((p: Contact) => {
        dataToExport.push({ type: 'header', partnerName: p.name });
        
        const opBal = getRawPartnerOpeningBalance(p.id);
        const displayOpBal = opBal;
        let bal = displayOpBal;
        let partnerDebit = opBal > 0 ? opBal : 0;
        let partnerCredit = opBal < 0 ? Math.abs(opBal) : 0;
        
        const isCustomer = partnerType === ContactType.CUSTOMER;
        const opDebit = opBal > 0 ? opBal : 0;
        const opCredit = opBal < 0 ? Math.abs(opBal) : 0;

        // Add Opening Balance Row to PDF
        if (opBal !== 0 && !isNaN(opBal)) {
          dataToExport.push({
            type: 'opening',
            balance: bal,
            debit: opDebit,
            credit: opCredit
          });
        }

        const txs = getPartnerTransactions(p.id);
        txs.forEach((t: any) => {
          bal += t.debit - t.credit;
          partnerDebit += t.debit;
          partnerCredit += t.credit;
          dataToExport.push({
            type: 'transaction',
            tx: {
              date: t.date,
              account: t.accountName,
              reference: t.reference,
              narration: t.narration,
              preparedBy: t.preparedBy,
              debit: t.debit || 0,
              credit: t.credit || 0,
              balance: bal || 0
            }
          });
        });

        dataToExport.push({ 
          type: 'total',
          partnerName: p.name, 
          groupDebit: partnerDebit || 0, 
          groupCredit: partnerCredit || 0, 
          runningBal: bal || 0
        });
        dataToExport.push({ type: 'spacer' });
      });

      generatePartnerLedgerPDF({
        title,
        companyName: store.currentCompany?.name || 'Local Company',
        dataToExport,
        dateRange: dateRangeText,
        filename: `Partner_Ledger_${getOpDateBST()}`,
        printedBy: store.currentUser?.name
      });
    }
  }, [paginatedPartners, activePartners, partnerType, columns, store.currentCompany.name, store.currentUser?.name]);

  const dateRangeText = useMemo(() => {
    if (filters.datePreset === 'all') return 'All Time';
    const start = filters.startDate || 'Beginning';
    const end = filters.endDate || 'Current';
    if (start === end) return start;
    return `${start} to ${end}`;
  }, [filters.startDate, filters.endDate, filters.datePreset]);

  return (
    <div className="space-y-6">
      {/* Breadcrumbs & Navigation */}
      {!hideHeader && <div className="flex items-center justify-between no-print">
        <nav className="flex items-center space-x-2 text-[10px] font-black uppercase tracking-widest text-slate-400">
          <button onClick={() => onBack && onBack()} className="flex items-center hover:text-indigo-600 transition-colors">
            <Home size={12} className="mr-1" />
            Dashboard
          </button>
          <ChevronRight size={10} />
          <button onClick={() => onBack && onBack()} className="hover:text-indigo-600 transition-colors">
            Partners
          </button>
          <ChevronRight size={10} />
          <span className="text-slate-800">Partner Ledger</span>
        </nav>
        
        {onBack && (
          <button 
            onClick={onBack}
            className="flex items-center space-x-2 px-4 py-1.5 bg-white border border-slate-200 rounded-xl text-[10px] font-black uppercase tracking-widest text-slate-600 hover:bg-slate-50 hover:border-slate-300 transition-all shadow-sm active:scale-95"
          >
            <ArrowLeft size={14} />
            <span>Back to Contacts</span>
          </button>
        )}
      </div> }

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center space-x-4">
          <div className="p-3 bg-indigo-600 rounded-2xl shadow-lg shadow-indigo-200">
            <Users className="w-6 h-6 text-white" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-slate-800 tracking-tight">Partner Ledger</h2>
            <p className="text-sm font-medium text-slate-500">Detailed transaction history by partner</p>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          <ExportButtons onExport={handleExport} />
        </div>
      </div>

      {/* Advanced Filter Bar */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 space-y-4 no-print transition-all">
        <div className="flex flex-wrap items-center gap-4">
          {/* Search Query */}
          <div className="relative flex-1 min-w-[200px] group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-indigo-500 transition-colors" />
            <input 
              type="text" 
              placeholder="Search by name or ID..."
              className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
              value={filters.searchQuery}
              onChange={(e) => setFilters(prev => ({ ...prev, searchQuery: e.target.value }))}
            />
          </div>

          {/* Date Range Preset */}
          <div className="relative min-w-[160px]">
            <select 
              className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 appearance-none cursor-pointer"
              value={filters.datePreset || ""}
              onChange={(e) => {
                const preset = e.target.value;
                const today = new Date();
                let start = '';
                let end = '';
                
                if (preset === 'today') {
                  start = today.toISOString().split('T')[0];
                  end = start;
                } else if (preset === 'yesterday') {
                  const y = new Date();
                  y.setDate(y.getDate() - 1);
                  start = y.toISOString().split('T')[0];
                  end = start;
                } else if (preset === 'this_week') {
                  const d = new Date();
                  const day = d.getDay();
                  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday
                  start = new Date(d.setDate(diff)).toISOString().split('T')[0];
                  end = getOpDateBST();
                } else if (preset === 'last_week') {
                  const d1 = new Date();
                  const d2 = new Date();
                  const day = d1.getDay();
                  const mondayDiff = day === 0 ? 13 : day + 6;
                  const sundayDiff = day === 0 ? 7 : day;
                  d1.setDate(d1.getDate() - mondayDiff);
                  d2.setDate(d2.getDate() - sundayDiff);
                  start = d1.toISOString().split('T')[0];
                  end = d2.toISOString().split('T')[0];
                } else if (preset === 'this_month') {
                  const d = new Date();
                  start = new Date(d.getFullYear(), d.getMonth(), 1).toISOString().split('T')[0];
                  end = getOpDateBST();
                } else if (preset === 'this_year') {
                  const d = new Date();
                  start = new Date(d.getFullYear(), 0, 1).toISOString().split('T')[0];
                  end = getOpDateBST();
                }
                
                setFilters(prev => ({ ...prev, datePreset: preset, startDate: start, endDate: end }));
              }}
            >
              <option value="all">All Dates</option>
              <option value="today">Today</option>
              <option value="yesterday">Yesterday</option>
              <option value="this_week">This Week</option>
              <option value="last_week">Last Week</option>
              <option value="this_month">This Month</option>
              <option value="this_year">This Year</option>
              <option value="custom">Custom Range</option>
            </select>
            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          </div>

          {/* Multi-select Partners */}
          <div className="relative min-w-[200px]">
             <SmartSearchMulti 
              label="Select Partners"
              options={(store.contacts || []).filter((c: any) => c.type === partnerType).map((c: any) => ({
                id: c.id,
                label: c.name,
                sublabel: c.externalId || c.type,
                searchKey: `${c.name} ${c.externalId || ''}`
              }))}
              value={filters.partnerIds}
              onChange={(val) => setFilters(prev => ({ ...prev, partnerIds: val }))}
              icon={<Users size={14} className="text-indigo-500" />}
             />
          </div>

          <button 
            onClick={() => setFilters({
              startDate: todayStr.substring(0,4) + '-01-01',
              endDate: todayStr,
              datePreset: 'all',
              partnerIds: [],
              transactionType: 'ALL',
              reference: '',
              entryStatus: 'POSTED',
              searchQuery: ''
            })}
            className="p-2.5 bg-slate-100 text-slate-500 rounded-xl hover:bg-slate-200 hover:text-slate-700 transition-all flex items-center justify-center group"
            title="Reset Filters"
          >
            <RotateCcw size={16} className="group-active:rotate-180 transition-transform duration-500" />
          </button>
        </div>

        {/* Second Row of Filters */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

          <div className="space-y-1.5">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center ml-1">
              <Tag size={12} className="mr-1.5" /> Type
            </label>
            <select 
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500/20"
              value={filters.transactionType || ""}
              onChange={(e) => setFilters(prev => ({ ...prev, transactionType: e.target.value }))}
            >
              <option value="ALL">All Types</option>
              <option value="BILL">Vendor Bills</option>
              <option value="INVOICE">Customer Invoices</option>
              <option value="PAYMENT">Payments</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center ml-1">
              <Hash size={12} className="mr-1.5" /> Reference #
            </label>
            <input 
              type="text" 
              placeholder="Filter by ref..."
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500/20"
              value={filters.reference}
              onChange={(e) => setFilters(prev => ({ ...prev, reference: e.target.value }))}
            />
          </div>

          {filters.datePreset === 'custom' && (
            <div className="md:col-span-1 grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center ml-1">
                  Start Date
                </label>
                <input 
                  type="date" 
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none"
                  value={filters.startDate}
                  onChange={(e) => setFilters(prev => ({ ...prev, startDate: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center ml-1">
                  End Date
                </label>
                <input 
                  type="date" 
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none"
                  value={filters.endDate}
                  onChange={(e) => setFilters(prev => ({ ...prev, endDate: e.target.value }))}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-1 p-1 bg-slate-100 rounded-2xl w-fit">
        {[
          { id: ContactType.CUSTOMER, label: 'Customers' },
          { id: ContactType.VENDOR, label: 'Vendors' },
          { id: ContactType.EMPLOYEE, label: 'Employees' },
          { id: ContactType.LENDER, label: 'Lenders' },
          { id: 'LOAN_RECEIVABLE', label: 'Loan Receivable' },
          { id: 'LOAN_PAYABLE', label: 'Loan Payable' }
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => {
              setPartnerType(tab.id as any);
              setCurrentPage(1);
            }}
            className={`px-6 py-2 rounded-xl text-sm font-bold transition-all ${
              partnerType === tab.id
                ? 'bg-white text-indigo-600 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-3xl shadow-xl shadow-slate-200/60 border border-slate-100 overflow-hidden">
        <div className="p-8 border-b border-slate-100 bg-slate-50/50">
          <div className="flex justify-between items-end">
            <div>
              <h3 className="text-lg font-bold text-slate-800">{partnerType} Ledger Report</h3>
              <p className="text-sm font-medium text-slate-500 mt-1">Period: {dateRangeText}</p>
            </div>
            <div className="text-right">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Companies</p>
              <p className="text-sm font-bold text-slate-700">
                 {store.activeCompanyIds?.length > 0 ? `${store.activeCompanyIds.length} Selected` : (store.currentCompany?.name || 'Selected Company')}
              </p>
            </div>
          </div>
        </div>

        {isDataLoading && (
          <div className="py-32 flex flex-col items-center justify-center space-y-4">
            <Loader2 className="w-12 h-12 text-indigo-600 animate-spin" />
            <p className="text-sm font-black text-slate-400 uppercase tracking-[0.3em] animate-pulse">Reconstructing Financial History...</p>
            <p className="text-[10px] font-bold text-slate-400 italic">Querying deep journal archives</p>
          </div>
        )}

        {!isDataLoading && (
          <div className="overflow-x-auto">
          <div className="min-w-full inline-block align-middle">
            <table className="min-w-full divide-y divide-slate-100">
              <thead>
                <tr className="bg-slate-50/50">
                  {columns.find(c => c.id === 'date')?.visible && <th className="px-8 py-4 text-left text-xs font-bold text-slate-400 uppercase tracking-wider">Date</th>}
                  {columns.find(c => c.id === 'account')?.visible && <th className="px-8 py-4 text-left text-xs font-bold text-slate-400 uppercase tracking-wider">Account</th>}
                  {columns.find(c => c.id === 'reference')?.visible && <th className="px-8 py-4 text-left text-xs font-bold text-slate-400 uppercase tracking-wider">Reference</th>}
                  {columns.find(c => c.id === 'narration')?.visible && <th className="px-8 py-4 text-left text-xs font-bold text-slate-400 uppercase tracking-wider">Narration</th>}
                  {columns.find(c => c.id === 'preparedBy')?.visible && <th className="px-8 py-4 text-left text-xs font-bold text-slate-400 uppercase tracking-wider">Prepared By</th>}
                  {columns.find(c => c.id === 'debit')?.visible && <th className="px-8 py-4 text-right text-xs font-bold text-slate-400 uppercase tracking-wider">Debit</th>}
                  {columns.find(c => c.id === 'credit')?.visible && <th className="px-8 py-4 text-right text-xs font-bold text-slate-400 uppercase tracking-wider">Credit</th>}
                  {columns.find(c => c.id === 'balance')?.visible && <th className="px-8 py-4 text-right text-xs font-bold text-slate-400 uppercase tracking-wider">Balance</th>}
                  <th className="px-8 py-4 text-right w-10">
                    <ColumnSelector columns={columns} onChange={setColumns} />
                  </th>
                </tr>
              </thead>
              <tbody className="text-sm font-medium">
                {paginatedPartners.length === 0 ? (
                  <tr><td colSpan={columns.filter(c => c.visible).length + 1} className="px-8 py-20 text-center text-slate-300 italic font-bold">No partners found matching current filters.</td></tr>
                ) : paginatedPartners.map((partner: Contact) => {
                  const transactions = getPartnerTransactions(partner.id);
                  const isCustomer = partnerType === ContactType.CUSTOMER;
                  
                  const openingBalance = getRawPartnerOpeningBalance(partner.id);
                  const displayOpBal = openingBalance;
                  let runningBal = displayOpBal;
                  
                  const totalDebit = transactions.reduce((sum, t) => sum + (t.debit || 0), 0);
                  const totalCredit = transactions.reduce((sum, t) => sum + (t.credit || 0), 0);
                  const ledgerBalance = transactions.reduce((sum, t) => {
                    const addition = (t.debit || 0) - (t.credit || 0);
                    return sum + addition;
                  }, 0);
                  const finalBalance = displayOpBal + ledgerBalance;
 
                  return (
                    <React.Fragment key={partner.id}>
                      <tr className="bg-indigo-50/30 border-t border-indigo-100/50">
                        <td colSpan={columns.filter(c => c.visible).length + 1} className="px-8 py-3 text-indigo-700 font-bold uppercase tracking-wide text-xs">
                          {partner.name}
                        </td>
                      </tr>
                      {/* Opening Balance Row */}
                      {(() => {
                        const opBal = getRawPartnerOpeningBalance(partner.id);
                        if (opBal === 0 && (!transactions || transactions.length === 0)) return null;
                        
                        const isCustomer = partnerType === ContactType.CUSTOMER;
                        const displayOpBal = opBal;
                        runningBal = displayOpBal;
                        
                        const opDebit = opBal > 0 ? opBal : 0;
                        const opCredit = opBal < 0 ? Math.abs(opBal) : 0;
                        
                        return (
                          <tr className="bg-slate-50/30 border-b border-slate-50 italic">
                            {columns.find(c => c.id === 'date')?.visible && <td className="px-8 py-2 text-slate-500">Opening Balance</td>}
                            {columns.find(c => c.id === 'account')?.visible && <td className="px-8 py-2 text-slate-400">-</td>}
                            {columns.find(c => c.id === 'reference')?.visible && <td className="px-8 py-2 text-slate-400">INITIAL</td>}
                            {columns.find(c => c.id === 'narration')?.visible && <td className="px-8 py-2 text-slate-400">-</td>}
                            {columns.find(c => c.id === 'preparedBy')?.visible && <td className="px-8 py-2 text-slate-400">-</td>}
                            {columns.find(c => c.id === 'debit')?.visible && <td className="px-8 py-2 text-right text-slate-400">{opDebit > 0 ? formatNumber(opDebit) : '-'}</td>}
                            {columns.find(c => c.id === 'credit')?.visible && <td className="px-8 py-2 text-right text-slate-400">{opCredit > 0 ? formatNumber(opCredit) : '-'}</td>}
                            {columns.find(c => c.id === 'balance')?.visible && <td className="px-8 py-2 text-right font-bold text-slate-600">{formatNumber(runningBal)}</td>}
                            <td className="px-8 py-2"></td>
                          </tr>
                        );
                      })()}
                      {transactions.map((t: any, idx: number) => {
                        runningBal += t.debit - t.credit;
                        return (
                          <tr key={idx} className="hover:bg-slate-50 border-b border-slate-100 last:border-0 group">
                            {columns.find(c => c.id === 'date')?.visible && <td className="px-8 py-4 text-slate-800 border-r border-slate-50 group-hover:border-slate-100">{t.date}</td>}
                            {columns.find(c => c.id === 'account')?.visible && <td className="px-8 py-4 border-r border-slate-50 group-hover:border-slate-100">
                              <div className="text-[11px] font-bold text-slate-700 uppercase tracking-tight">{t.accountName}</div>
                            </td>}
                            {columns.find(c => c.id === 'reference')?.visible && <td className="px-8 py-4 text-slate-600">
                              {onNavigate && t.reference !== 'INITIAL' && t.reference ? (
                                <button
                                  onClick={() => {
                                    const ref = t.reference || '';
                                    if (ref.startsWith('INV-')) onNavigate('invoices', { searchQuery: ref });
                                    else if (ref.startsWith('BIL-')) onNavigate('bills', { searchQuery: ref });
                                    else if (ref.startsWith('PAY-')) onNavigate('payments', { searchQuery: ref });
                                    else onNavigate('journal', { reference: ref });
                                  }}
                                  className="text-indigo-600 font-bold tracking-tight uppercase hover:underline text-left break-words"
                                >
                                  {t.reference}
                                </button>
                              ) : (
                                t.reference
                              )}
                            </td>}
                            {columns.find(c => c.id === 'narration')?.visible && <td className="px-8 py-4 text-slate-600 italic">
                              <div className="max-w-[150px] truncate" title={t.narration}>{t.narration || '-'}</div>
                            </td>}
                            {columns.find(c => c.id === 'preparedBy')?.visible && <td className="px-8 py-4 text-slate-500 font-bold uppercase text-[9px]">
                              {(t.preparedBy || '-').split(' ')[0]}
                            </td>}
                            {columns.find(c => c.id === 'debit')?.visible && <td className="px-8 py-4 text-right text-slate-700">{t.debit > 0 ? formatNumber(t.debit) : '-'}</td>}
                            {columns.find(c => c.id === 'credit')?.visible && <td className="px-8 py-4 text-right text-slate-700">{t.credit > 0 ? formatNumber(t.credit) : '-'}</td>}
                            {columns.find(c => c.id === 'balance')?.visible && <td className="px-8 py-4 text-right font-bold text-slate-800">{formatNumber(runningBal)}</td>}
                            <td className="px-8 py-4"></td>
                          </tr>
                        );
                      })}
                      <tr className="bg-slate-50/30 border-b border-slate-100">
                        <td colSpan={columns.filter(c => ['date', 'account', 'reference', 'narration', 'preparedBy'].includes(c.id) && c.visible).length} className="px-8 py-3 text-right text-xs font-bold text-slate-400 uppercase tracking-wider">
                          Total for {partner.name}
                        </td>
                        {columns.find(c => c.id === 'debit')?.visible && <td className="px-8 py-3 text-right font-bold text-slate-700">{formatNumber(totalDebit)}</td>}
                        {columns.find(c => c.id === 'credit')?.visible && <td className="px-8 py-3 text-right font-bold text-slate-700">{formatNumber(totalCredit)}</td>}
                        {columns.find(c => c.id === 'balance')?.visible && <td className="px-8 py-3 text-right font-bold text-indigo-600">{formatNumber(finalBalance)}</td>}
                        <td className="px-8 py-3"></td>
                      </tr>
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              totalItems={activePartners.length}
              itemsPerPage={pageSize}
              onPageChange={setCurrentPage}
              onItemsPerPageChange={setPageSize}
            />
          </div>
        </div>
      )}
    </div>
  </div>
  );
};

export default PartnerLedgerReport;
