import { supabase } from '../lib/supabase';

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { CheckCircle2, AlertCircle, Search, Filter, Plus, ChevronLeft, ChevronRight, Download, FileText } from 'lucide-react';
import { Account, JournalLine } from '../types';
import { formatBDT, formatNumber, exportToXLSX, getOpDateBST, formatDateTime, generateUUID } from '../constants';
import { generatePDFReport } from '../services/pdfService';
import ExportButtons from './ExportButtons';
import Pagination from './Pagination';
import ColumnSelector, { useColumns, ColumnDef } from './ColumnSelector';
import { categorizeTransaction } from '../gemini';
import Chatter from './Chatter';

const SmartSearch: React.FC<{
  options: { id: string; label: string; sublabel?: string; searchKey: string }[];
  value: string;
  onChange: (id: string) => void;
  placeholder: string;
  onSearchChange?: (q: string) => void;
}> = ({ options, value, onChange, placeholder, onSearchChange }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  
  React.useEffect(() => {
    if (onSearchChange && search && search.length > 2) {
      const timer = setTimeout(() => {
        onSearchChange(search);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [search, onSearchChange]);

  const selectedOption = options.find(o => o.id === value);
  const searchTerms = (search || '').toLowerCase().split(/\s+/).filter(Boolean);
  const filteredOptions = (options || []).filter(o => {
    const target = String(o.searchKey || '').toLowerCase();
    return searchTerms.length === 0 ? true : searchTerms.every(term => target.includes(term));
  }).slice(0, 50);

  return (
    <div className="relative w-full">
      <div 
        onClick={() => setIsOpen(!isOpen)}
        className="w-full p-3 bg-transparent border border-slate-200 rounded-xl text-xs font-black text-slate-700 cursor-pointer flex justify-between items-center hover:border-indigo-300 transition-colors"
      >
        <span className="truncate">
          {selectedOption ? selectedOption.label : <span className="text-slate-400">{placeholder}</span>}
        </span>
        <svg className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
        </svg>
      </div>
      
      {isOpen && (
        <div className="absolute z-[100] mt-2 w-full bg-white border border-slate-200 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in slide-in-from-top-2">
          <div className="p-3 border-b bg-slate-50">
            <input 
              autoFocus
              className="w-full px-4 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-indigo-500"
              placeholder="Start typing to search..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              onClick={e => e.stopPropagation()}
            />
          </div>
          <div className="max-h-60 overflow-y-auto">
            {filteredOptions.length > 0 ? (
              filteredOptions.map(opt => (
                <div 
                  key={opt.id}
                  onClick={() => {
                    onChange(opt.id);
                    setIsOpen(false);
                    setSearch('');
                  }}
                  className={`px-4 py-3 hover:bg-indigo-50 cursor-pointer border-b border-slate-50 last:border-0 ${value === opt.id ? 'bg-indigo-50' : ''}`}
                >
                  <p className="text-xs font-black text-slate-800">{opt.label}</p>
                  {opt.sublabel && <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">{opt.sublabel}</p>}
                </div>
              ))
            ) : (
              <div className="px-4 py-6 text-center text-[10px] font-black text-slate-400 uppercase tracking-widest">No matches found</div>
            )}
          </div>
        </div>
      )}
      {isOpen && <div className="fixed inset-0 z-[90]" onClick={() => setIsOpen(false)} />}
    </div>
  );
};

const JournalManager: React.FC<{ 
  store: any; 
  defaultCreate?: boolean; 
  initialSearch?: string | null; 
  initialPartnerId?: string | null;
  onClearSearch?: () => void;
  onNavigate?: (tab: string, filter?: any) => void;
}> = ({ store, defaultCreate, initialSearch, initialPartnerId, onClearSearch, onNavigate }) => {
  const [viewMode, setViewMode] = useState<'list' | 'form'>('list');
  const [isCategorizing, setIsCategorizing] = useState(false);
  const isSavingRef = useRef(false);
  const [selectedEntry, setSelectedEntry] = useState<any>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [journalTypeFilter, setJournalTypeFilter] = useState<string>('ALL');
  const [dateRangeFilter, setDateRangeFilter] = useState<string>('ALL');
  const [customDateStart, setCustomDateStart] = useState<string>('');
  const [customDateEnd, setCustomDateEnd] = useState<string>('');
  const [entityFilter, setEntityFilter] = useState<string>('ALL');
  const [partnerIdFilter, setPartnerIdFilter] = useState<string | null>(initialPartnerId || null);
  const [showDeleted, setShowDeleted] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(80);
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    let active = true;
    if (initialSearch || initialPartnerId) {
      if (initialSearch) {
        setSearch(initialSearch);
        
        // Exact match
        const searchUpper = initialSearch.toUpperCase();
        const exactMatch = store.paginatedEntries?.find((e: any) => e.reference === initialSearch || e.id === initialSearch || e.id?.toUpperCase() === searchUpper) || store.paginatedEntries?.find((e: any) => e.id === 'JE-' + searchUpper || e.reference === 'JE-' + searchUpper)
            || store.entries?.find((e: any) => e.reference === initialSearch || e.id === initialSearch || e.id?.toUpperCase() === searchUpper);
            
        if (exactMatch && !selectedEntry) {
            handleEditEntry(exactMatch);
            if (onClearSearch) onClearSearch();
        } else if (!selectedEntry) {
            // Fetch dynamically from Supabase in case it's not loaded on first page
            const fetchAndSelect = async () => {
              try {
                
                // Try searching by specific ID, reference or journal_number
                const { data, error } = await supabase.from('docs_journals')
                  .select('*')
                  .or(`id.ilike."%${initialSearch.replace(/"/g, '""')}%",reference.ilike."%${initialSearch.replace(/"/g, '""')}%",journal_number.ilike."%${initialSearch.replace(/"/g, '""')}%"`)
                  .maybeSingle();
                
                if (!active) return;

                if (data) {
                  // Fetch lines
                  const { data: lines } = await supabase.from('docs_journal_lines')
                    .select('*')
                    .eq('journal_id', data.id)
                    .or('debit.neq.0,credit.neq.0');
                  const nonZeroLines = (lines || []).map(l => ({
                    ...l,
                    accountId: l.account_id || l.accountId,
                    contactId: l.contact_id || l.contactId,
                    journalId: l.journal_id || l.journalId
                  }));
                  
                  // Map to frontend structure
                  const mapped = {
                    id: data.id,
                    date: data.journal_date || data.date,
                    description: data.description,
                    reference: data.reference || data.journal_number,
                    journalType: data.journal_type,
                    status: data.status,
                    companyId: data.company_id,
                    createdById: data.created_by_id,
                    preparedBy: data.prepared_by,
                    lines: nonZeroLines
                  };
                  handleEditEntry(mapped);
                } else if (store.paginatedEntries && store.paginatedEntries.length > 0) {
                  setViewMode('list');
                }
                if (onClearSearch) onClearSearch();
              } catch (e) {
                console.error("Failed to select journal statically:", e);
                if (!active) return;
                if (store.paginatedEntries && store.paginatedEntries.length > 0) {
                  setViewMode('list');
                }
                if (onClearSearch) onClearSearch();
              }
            };
            fetchAndSelect();
        }
      }
      
      if (initialPartnerId) {
        setPartnerIdFilter(initialPartnerId);
        setEntityFilter('ALL');
        if (!selectedEntry) setViewMode('list');
        if (onClearSearch) onClearSearch();
      }
    }
    return () => { active = false; };
  }, [initialSearch, initialPartnerId, store.entries, store.paginatedEntries]); // omit handleEditEntry, selectedEntry, onClearSearch deliberately so we only trigger when we get results or new search

  useEffect(() => {
    let active = true;
    const handleNav = async (e: any) => {
      if (e.detail?.screen === 'JOURNAL' && e.detail.filter) {
        if (e.detail.filter.reference) {
          const ref = e.detail.filter.reference;
          setSearch(ref);
          
          const searchUpper = ref.toUpperCase();
          const exactMatch = store.paginatedEntries?.find((e: any) => e.reference === ref || e.id === ref || e.id?.toUpperCase() === searchUpper) || store.paginatedEntries?.find((e: any) => e.id === 'JE-' + searchUpper || e.reference === 'JE-' + searchUpper)
              || store.entries?.find((e: any) => e.reference === ref || e.id === ref || e.id?.toUpperCase() === searchUpper);
              
          if (exactMatch) {
              handleEditEntry(exactMatch);
          } else {
              try {
                
                const { data, error } = await supabase.from('docs_journals')
                  .select('*')
                  .or(`id.ilike."%${ref.replace(/"/g, '""')}%",reference.ilike."%${ref.replace(/"/g, '""')}%",journal_number.ilike."%${ref.replace(/"/g, '""')}%"`)
                  .maybeSingle();
                
                if (data && active) {
                  const { data: lines } = await supabase.from('docs_journal_lines')
                    .select('*')
                    .eq('journal_id', data.id)
                    .or('debit.neq.0,credit.neq.0');
                  const nonZeroLines = (lines || []).map((l: any) => ({
                    ...l,
                    accountId: l.account_id || l.accountId,
                    contactId: l.contact_id || l.contactId,
                    journalId: l.journal_id || l.journalId
                  }));
                  
                  const mapped = {
                    id: data.id,
                    date: data.journal_date || data.date,
                    description: data.description,
                    reference: data.reference || data.journal_number,
                    journalType: data.journal_type,
                    status: data.status,
                    companyId: data.company_id,
                    createdById: data.created_by_id,
                    preparedBy: data.prepared_by,
                    lines: nonZeroLines
                  };
                  handleEditEntry(mapped);
                } else {
                  setViewMode('list');
                }
              } catch (e) {
                console.error("Failed to select journal from nav:", e);
                setViewMode('list');
              }
          }
        } else if (e.detail.filter.searchQuery) {
          setSearch(e.detail.filter.searchQuery);
          setViewMode('list');
        }
        
        if (e.detail.filter.partnerId) {
          setPartnerIdFilter(e.detail.filter.partnerId);
          setViewMode('list');
        }
      }
    };
    window.addEventListener('accounting-nav', handleNav);
    return () => {
      active = false;
      window.removeEventListener('accounting-nav', handleNav);
    };
  }, [store.entries, store.paginatedEntries]);

  const [columns, setColumns] = useColumns('journal_list', [
    { id: 'date', label: 'Date & Time', visible: true },
    { id: 'number', label: 'Number', visible: true },
    { id: 'partner', label: 'Partner', visible: true },
    { id: 'reference', label: 'Reference', visible: true },
    { id: 'description', label: 'Narration', visible: false },
    { id: 'journal', label: 'Journal', visible: true },
    { id: 'preparedBy', label: 'Prepared By', visible: true },
    { id: 'total', label: 'Total', visible: true },
    { id: 'status', label: 'Status', visible: true },
  ]);

  const cleanContactName = (name: string) => {
    if (!name) return name;
    return name.replace(/\s*\((customer|vendor|employee)\)/gi, '');
  };

  useEffect(() => {
    const options = {
      limit: pageSize,
      offset: (currentPage - 1) * pageSize,
      sortField: 'date',
      sortOrder: 'desc' as const,
      filters: {
        ...(statusFilter !== 'ALL' && { status: statusFilter }),
        ...(journalTypeFilter !== 'ALL' && { journal_type: journalTypeFilter }),
      }
    };
    
    if (search) {
        if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(search) || search.startsWith('JE-')) {
            (options.filters as any).id = search;
        } else if (search.startsWith('INV-') || search.startsWith('BIL-') || search.startsWith('PAY-')) {
            (options.filters as any).referenceNumber = search;
        } else {
            (options as any).search = search;
        }
    }

    store.fetchEntries(options);
  }, [store.fetchEntries, search, statusFilter, journalTypeFilter, dateRangeFilter, customDateStart, customDateEnd, entityFilter, partnerIdFilter, currentPage, pageSize]);

  const filteredEntries = store.paginatedEntries;
  const paginatedEntries = store.paginatedEntries;
  const totalPages = Math.ceil(store.entryCount / pageSize) || 1;

  const handleExport = (format: 'excel' | 'pdf', scope: 'page' | 'all') => {
    const dataToExport = scope === 'page' ? paginatedEntries : filteredEntries;
    const visibleCols = columns.filter(c => c.visible);
    
    const typeMap: Record<string, string> = {
      'INV': 'Customer Invoice',
      'BILL': 'Vendor Bill',
      'BANK': 'Bank',
      'CASH': 'Cash',
      'CUST_PAY': 'Customer Payment',
      'VEND_PAY': 'Vendor Payment',
      'EXPENSE': 'Expense',
      'CREDIT_NOTE': 'Credit Note',
      'MISC': 'Miscellaneous'
    };

    const exportData = dataToExport.map((entry: any) => {
      const totalDebit = (entry.lines || []).reduce((sum: number, l: any) => sum + (l.debit || 0), 0);
      const partnerId = (entry.lines || []).find((l:any) => l.contactId)?.contactId;
      const contact = (store.contacts || []).find((c:any) => c.id === partnerId);
      
      const invoice = (store.invoices || []).find((inv: any) => inv.number === entry.reference || inv.id === entry.reference);
      const bill = (store.bills || []).find((b: any) => b.number === entry.reference || b.id === entry.reference);
      const payment = (store.payments || []).find((p: any) => p.number === entry.reference || p.id === entry.reference);
      const docSalesperson = invoice?.salesperson || bill?.salesperson || payment?.salesperson;

      return {
        date: entry.date,
        number: entry.number || entry.id,
        partner: cleanContactName(contact?.name || '-'),
        reference: entry.reference || '-',
        description: entry.description || '-',
        journal: typeMap[entry.journalType] || 'Miscellaneous',
        preparedBy: (docSalesperson || entry.preparedBy || store.resolveUserName(entry.createdById) || '-').split(' ')[0],
        total: totalDebit,
        status: entry.status,
        debit: totalDebit,
        credit: (entry.lines || []).reduce((sum: number, l: any) => sum + (l.credit || 0), 0)
      };
    });

    if (format === 'excel') {
      const excelRows = [
        visibleCols.map(c => c.label),
        ...exportData.map(item => visibleCols.map(c => (item as any)[c.id]))
      ];
      exportToXLSX(`Journal_Entries_${getOpDateBST()}`, excelRows);
    } else {
      const pdfCols = visibleCols.map(c => ({
        header: c.label,
        dataKey: c.id,
        align: ['total', 'debit', 'credit'].includes(c.id) ? 'right' : 'left' as any
      }));
      
      const pdfDataMapped = exportData.map(item => {
        const obj: any = { ...item };
        if (obj.total !== undefined) obj.total = formatNumber(obj.total);
        if (obj.debit !== undefined) obj.debit = formatNumber(obj.debit);
        if (obj.credit !== undefined) obj.credit = formatNumber(obj.credit);
        return obj;
      });

      generatePDFReport({
        title: 'Journal Entries Report',
        companyName: store.currentCompany.name,
        dateRange: dateRangeFilter === 'ALL' ? 'All Time' : `${customDateStart || 'Start'} to ${customDateEnd || 'End'}`,
        filename: `Journal_Entries_${getOpDateBST()}`,
        printedBy: store.currentUser?.name
      }, pdfCols, pdfDataMapped);
    }
  };

  const [formData, setFormData] = useState({
    date: getOpDateBST(),
    description: '',
    reference: '',
    journalType: 'MISC',
    isNonCash: false,
    lines: [
      { id: '1', accountId: '', contactId: '', debit: 0, credit: 0, description: '' },
      { id: '2', accountId: '', contactId: '', debit: 0, credit: 0, description: '' }
    ] as JournalLine[]
  });

  // Handle auto-create from quick actions
  useEffect(() => {
    if (defaultCreate) {
      handleCreateNew();
    }
  }, [defaultCreate]);

  const handleCreateNew = () => {
    setFormData({
      date: getOpDateBST(),
      description: '',
      reference: '',
      journalType: 'MISC',
      isNonCash: false,
      lines: [
        { id: '1', accountId: '', contactId: '', debit: 0, credit: 0, description: '' },
        { id: '2', accountId: '', contactId: '', debit: 0, credit: 0, description: '' }
      ]
    });
    setSelectedEntry(null);
    setViewMode('form');
  };

  const handleEditEntry = (entry: any) => {
    setFormData({
      date: entry.date,
      description: entry.description,
      reference: entry.reference || '',
      journalType: entry.journalType || 'MISC',
      isNonCash: entry.isNonCash || false,
      lines: entry.lines || []
    });
    setSelectedEntry(entry);
    setViewMode('form');
  };

  const [showConfirm, setShowConfirm] = useState<{ show: boolean; title: string; message: string; onConfirm: () => void } | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const handleResetToDraft = () => {
    if (selectedEntry && selectedEntry.status === 'POSTED') {
      setShowConfirm({
        show: true,
        title: 'Reset to Draft',
        message: 'Reset this entry to draft for editing? This will allow you to modify and re-post it.',
        onConfirm: async () => {
          try {
            await store.resetJournalEntryToDraft(selectedEntry.id);
            const updatedEntry = { ...selectedEntry, status: 'DRAFT' };
            setSelectedEntry(updatedEntry);
            setFormData({
              date: updatedEntry.date,
              description: updatedEntry.description,
              reference: updatedEntry.reference,
              isNonCash: updatedEntry.isNonCash || false,
              lines: updatedEntry.lines
            });
            showToast("Entry reset to draft.", "success");
          } catch (e: any) {
            showToast(e.message, "error");
          } finally {
            setShowConfirm(null);
          }
        }
      });
    }
  };

  const totals = useMemo(() => {
    const debits = (formData.lines || []).reduce((sum, l) => sum + (l.debit || 0), 0);
    const credits = (formData.lines || []).reduce((sum, l) => sum + (l.credit || 0), 0);
    return { debits, credits, balanced: Math.abs(debits - credits) < 0.01 };
  }, [formData.lines]);

  const addLine = () => {
    setFormData({
      ...formData,
      lines: [...formData.lines, { id: generateUUID(), accountId: '', contactId: '', debit: 0, credit: 0, description: '' }]
    });
  };

  const removeLine = (id: string) => {
    if (formData.lines.length <= 1) return;
    setFormData({ ...formData, lines: formData.lines.filter(l => l.id !== id) });
  };

  const updateLine = (id: string, field: keyof JournalLine, value: any) => {
    setFormData({
      ...formData,
      lines: formData.lines.map(l => l.id === id ? { ...l, [field]: value } : l)
    });
  };

  const generateDiffMessage = () => {
    if (!selectedEntry) return null;
    const diffs: string[] = [];
    if (selectedEntry.date !== formData.date) diffs.push(`Date changed from ${selectedEntry.date} to ${formData.date}`);
    if (selectedEntry.description !== formData.description) diffs.push(`Description updated`);
    
    const accountsInfo = (store.accounts || []).reduce((acc: any, a: any) => ({ ...acc, [a.id]: a.code + '-' + a.name }), {});
    
    const oldLines = selectedEntry.lines || [];
    const newLines = formData.lines || [];
    
    for (let i = 0; i < Math.max(oldLines.length, newLines.length); i++) {
        const oLine = oldLines[i];
        const nLine = newLines[i];
        if (oLine && nLine) {
            if (oLine.accountId !== nLine.accountId) {
                const oldName = accountsInfo[oLine.accountId as string] || oLine.accountId || 'None';
                const newName = accountsInfo[nLine.accountId as string] || nLine.accountId || 'None';
                diffs.push(`Line ${i + 1} account changed from ${oldName} to ${newName}`);
            }
            if (oLine.debit !== nLine.debit) diffs.push(`Line ${i + 1} debit changed to ${nLine.debit}`);
            if (oLine.credit !== nLine.credit) diffs.push(`Line ${i + 1} credit changed to ${nLine.credit}`);
        } else if (!oLine && nLine) {
            diffs.push(`Line ${i + 1} added`);
        } else if (oLine && !nLine) {
            diffs.push(`Line ${i + 1} removed`);
        }
    }
    
    if (diffs.length === 0) return null;
    return `Audit: ${diffs.join('; ')}.`;
  };

  const handlePost = async () => {
    if (isSavingRef.current) return;
    if (!totals.balanced) return showToast("Unbalanced journal entries are rejected by the GAAP engine.", "error");
    const emptyAccountLine = (formData.lines || []).findIndex(l => !l.accountId);
    if (emptyAccountLine !== -1) return showToast(`Line ${emptyAccountLine + 1} is missing an account assignment.`, "error");
    
    setShowConfirm({
      show: true,
      title: 'Post Journal Entry',
      message: 'Are you sure you want to post this journal entry? This will lock the entry and update your financial reports.',
      onConfirm: async () => {
        if (isSavingRef.current) return;
        isSavingRef.current = true;
        try {
          if (selectedEntry && selectedEntry.status === 'DRAFT') {
            const diffMsg = generateDiffMessage();
            const newMessages = diffMsg ? [...(selectedEntry.messages || []), { id: generateUUID(), body: diffMsg, date: new Date().toISOString(), authorId: store.currentUser?.id || 'system', type: 'system' }] : selectedEntry.messages;
            await store.updateJournalEntry(selectedEntry.id, { ...formData, status: 'POSTED', messages: newMessages });
          } else {
            await store.addJournalEntry({ ...formData, status: 'POSTED' });
          }
          setViewMode('list');
          setSelectedEntry(null);
          showToast("Journal entry posted successfully.", "success");
          setShowConfirm(null);
        } catch (e: any) { 
          showToast(e.message, "error"); 
          setShowConfirm(null);
        } finally {
          isSavingRef.current = false;
        }
      }
    });
  };

  const handleSaveDraft = async () => {
    if (isSavingRef.current) return;
    isSavingRef.current = true;
    try {
      if (selectedEntry && selectedEntry.status === 'DRAFT') {
        const diffMsg = generateDiffMessage();
        const newMessages = diffMsg ? [...(selectedEntry.messages || []), { id: generateUUID(), body: diffMsg, date: new Date().toISOString(), authorId: store.currentUser?.id || 'system', type: 'system' }] : selectedEntry.messages;
        
        await store.updateJournalEntry(selectedEntry.id, { ...formData, status: 'DRAFT', messages: newMessages });
        
        // Update local selected entry to mirror latest state so diff logic doesn't duplicate
        setSelectedEntry({ ...selectedEntry, ...formData, messages: newMessages });
        
        showToast("Draft updated.", "success");
      } else {
        const newEntry = await store.addJournalEntry({ ...formData, status: 'DRAFT' });
        setSelectedEntry(newEntry);
        showToast("Journal entry saved as draft.", "success");
      }
    } catch (e: any) { 
      showToast(e.message, "error"); 
    } finally {
      isSavingRef.current = false;
    }
  };

  useEffect(() => {
    const handler = () => {
      if (viewMode === 'form' && (!selectedEntry || selectedEntry.status === 'DRAFT')) {
        handleSaveDraft();
      }
    };
    window.addEventListener('smart-save-draft', handler);
    return () => window.removeEventListener('smart-save-draft', handler);
  }, [viewMode, formData, selectedEntry]);

  const handleAiCategorize = async () => {
    if (!formData.description) return showToast("Please provide a Narrative Label first.", "info");
    setIsCategorizing(true);
    try {
      const result = await categorizeTransaction(formData.description, store.accounts);
      if (result && result.accountId) {
        // Update the first line's account if it's empty
        setFormData(prev => ({
          ...prev,
          lines: prev.lines.map((l, i) => i === 0 ? { ...l, accountId: result.accountId } : l)
        }));
        showToast(`AI Suggestion: ${result.reasoning}`, "success");
      } else {
        showToast("AI could not determine a category for this transaction.", "info");
      }
    } catch (error) {
      console.error(error);
      showToast("AI categorization failed.", "error");
    } finally {
      setIsCategorizing(false);
    }
  };

  if (viewMode === 'form') {
    const isDraft = (!selectedEntry && store.hasPermission('ledger_post')) || (selectedEntry && selectedEntry.status === 'DRAFT' && store.hasPermission('ledger_edit'));
    const isPosted = selectedEntry?.status === 'POSTED';

    return (
      <div className="min-h-screen bg-slate-50 flex flex-col">
        {/* Header / Breadcrumbs */}
        <div className="bg-white border-b border-slate-200 px-6 py-3 flex justify-between items-center sticky top-0 z-30">
          <div className="flex items-center space-x-2 text-sm">
            <button onClick={() => setViewMode('list')} className="text-indigo-600 hover:underline font-medium">Journal Entries</button>
            <span className="text-slate-400">/</span>
            <span className="text-slate-600 font-bold">{selectedEntry ? selectedEntry.id : 'New'}</span>
          </div>
          <div className="flex items-center space-x-4">
            <div className="flex bg-slate-100 rounded-lg p-1">
              <div className={`px-4 py-1 rounded-md text-[10px] font-black uppercase tracking-widest transition-all ${isDraft ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400'}`}>Draft</div>
              <div className="px-2 flex items-center"><svg className="w-3 h-3 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M9 5l7 7-7 7" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/></svg></div>
              <div className={`px-4 py-1 rounded-md text-[10px] font-black uppercase tracking-widest transition-all ${isPosted ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-400'}`}>Posted</div>
            </div>
          </div>
        </div>

        {/* Action Bar */}
        <div className="bg-white border-b border-slate-200 px-6 py-4 flex justify-between items-center shadow-sm">
          <div className="flex space-x-3">
            {isDraft && (
              <>
                <button onClick={handlePost} disabled={!totals.balanced || totals.debits === 0} className="px-6 py-2 bg-indigo-600 text-white rounded-lg font-bold text-xs uppercase tracking-widest hover:bg-indigo-700 disabled:opacity-50 transition-all">Post</button>
                <button onClick={handleSaveDraft} className="px-6 py-2 bg-white border border-slate-200 text-slate-700 rounded-lg font-bold text-xs uppercase tracking-widest hover:bg-slate-50 transition-all">Save Draft</button>
              </>
            )}
            {isPosted && store.hasPermission('ledger_edit') && store.currentUser?.roleId === 'role-admin' && (
              <button onClick={handleResetToDraft} className="px-6 py-2 bg-white border border-slate-200 text-amber-600 rounded-lg font-bold text-xs uppercase tracking-widest hover:bg-amber-50 transition-all">Reset to Draft</button>
            )}
            {isPosted && selectedEntry && !selectedEntry.reversalOfId && (
              <button 
                onClick={async () => {
                  try {
                    await store.reverseJournalEntry(selectedEntry.id);
                    setViewMode('list');
                    showToast("Journal entry reversed successfully.", "success");
                  } catch (e: any) {
                    showToast(e.message, "error");
                  }
                }}
                className="px-6 py-2 bg-white border border-slate-200 text-slate-600 rounded-lg font-bold text-xs uppercase tracking-widest hover:bg-slate-50 transition-all"
              >
                Reverse
              </button>
            )}
            <button onClick={() => setViewMode('list')} className="px-6 py-2 bg-white border border-slate-200 text-slate-500 rounded-lg font-bold text-xs uppercase tracking-widest hover:bg-slate-50 transition-all">Cancel</button>
            {selectedEntry?.id && store.currentUser?.roleId === 'role-admin' && (
              <button 
                onClick={() => {
                  if (deleteConfirmId === selectedEntry.id) {
                    const hasLinked = (store.invoices || []).some((i: any) => i.journalEntryId === selectedEntry.id) ||
                                      (store.bills || []).some((b: any) => b.journalEntryId === selectedEntry.id) ||
                                      (store.payments || []).some((p: any) => p.journalEntryId === selectedEntry.id) ||
                                      (store.creditNotes || []).some((c: any) => c.journalEntryId === selectedEntry.id);
                    
                    const performDelete = () => {
                      try {
                        store.deleteJournalEntry(selectedEntry.id);
                        setViewMode('list');
                        setSelectedEntry(null);
                        setDeleteConfirmId(null);
                      } catch (error: any) {
                        alert(error.message);
                      }
                    };

                    if (hasLinked) {
                      setShowConfirm({
                        show: true,
                        title: 'Delete Journal Entry',
                        message: 'Deleting this Journal Entry will also permanently remove the associated Payment/Invoice. Do you want to proceed?',
                        onConfirm: () => {
                          performDelete();
                          setShowConfirm(null);
                        }
                      });
                    } else {
                      performDelete();
                    }
                  } else {
                    setDeleteConfirmId(selectedEntry.id);
                    setTimeout(() => setDeleteConfirmId(null), 3000);
                  }
                }}
                className="px-6 py-2 bg-rose-50 text-rose-600 rounded-lg font-bold text-xs uppercase tracking-widest hover:bg-rose-100 transition-all"
              >
                {deleteConfirmId === selectedEntry.id ? 'Confirm Delete' : 'Delete'}
              </button>
            )}
          </div>
          <div className="flex items-center space-x-6">
            {isPosted && (
              <div className="flex items-center space-x-2 text-emerald-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                <span className="text-[10px] font-black uppercase tracking-widest">Validated & Posted</span>
              </div>
            )}
            <div className="flex items-center space-x-2">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Balance:</span>
              <span className={`text-xs font-black ${totals.balanced ? 'text-emerald-600' : 'text-rose-600'}`}>
                {formatBDT(totals.debits)} / {formatBDT(totals.credits)}
              </span>
            </div>
          </div>
        </div>

        {/* Form Content */}
        <div className="flex-1 p-8 overflow-y-auto">
          <div className="max-w-6xl mx-auto bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden relative">
            {/* Confirmation Modal */}
            {showConfirm && (
              <div className="absolute inset-0 z-[100] bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-6">
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
            <div className="p-10 space-y-10">
              {/* Header Fields */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-16 gap-y-8">
                <div className="space-y-6">
                  <div className="grid grid-cols-3 items-center">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Journal</label>
                    <div className="col-span-2">
                      <select 
                        className="w-full bg-transparent border-b border-slate-200 py-1 text-sm font-bold outline-none focus:border-indigo-500" 
                        disabled={!isDraft}
                        value={formData.journalType || ""}
                        onChange={e => setFormData({...formData, journalType: e.target.value})}
                      >
                        <option value="MISC">Miscellaneous</option>
                        <option value="INV">Customer Invoice</option>
                        <option value="BILL">Vendor Bill</option>
                        <option value="BANK">Bank</option>
                        <option value="CASH">Cash</option>
                        <option value="CUST_PAY">Customer Payment</option>
                        <option value="VEND_PAY">Vendor Payment</option>
                        <option value="EXPENSE">Expense</option>
                        <option value="CREDIT_NOTE">Credit Note</option>
                      </select>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 items-center">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Reference</label>
                    <div className="col-span-2">
                      <input 
                        className="w-full bg-transparent border-b border-slate-200 py-1 text-sm font-bold outline-none focus:border-indigo-500 placeholder:text-slate-300" 
                        placeholder="e.g. INV/2024/001"
                        value={formData.reference || ''}
                        onChange={e => isDraft && setFormData({...formData, reference: e.target.value})}
                        readOnly={!isDraft}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-3 items-center">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Source Document</label>
                    <div className="col-span-2">
                      <input 
                        className="w-full bg-transparent border-b border-slate-200 py-1 text-sm font-bold outline-none focus:border-indigo-500 placeholder:text-slate-300" 
                        placeholder="e.g. PO/001"
                        value={(formData as any).sourceDocument || ''}
                        onChange={e => isDraft && setFormData({...formData, sourceDocument: e.target.value} as any)}
                        readOnly={!isDraft}
                      />
                    </div>
                  </div>
                </div>
                <div className="space-y-6">
                  <div className="grid grid-cols-3 items-center">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Accounting Date</label>
                    <div className="col-span-2">
                      <input 
                        type="date" 
                        className="w-full bg-transparent border-b border-slate-200 py-1 text-sm font-bold outline-none focus:border-indigo-500"
                        value={formData.date || ''}
                        onChange={e => isDraft && setFormData({...formData, date: e.target.value})}
                        readOnly={!isDraft}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-3 items-center">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Company</label>
                    <div className="col-span-2">
                      <p className="py-1 text-sm font-bold text-slate-700">{store.activeCompanies?.[0]?.name || 'Main Company'}</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Description / Narrative */}
              <div className="pt-6 border-t border-slate-100">
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Narrative Label</label>
                <div className="flex space-x-4">
                  <input 
                    className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold outline-none focus:ring-2 ring-indigo-500/20"
                    placeholder="Describe the purpose of this entry..."
                    value={formData.description || ''}
                    onChange={e => isDraft && setFormData({...formData, description: e.target.value})}
                    readOnly={!isDraft}
                  />
                  {isDraft && (
                    <button 
                      onClick={handleAiCategorize}
                      disabled={isCategorizing || !formData.description}
                      className="px-4 bg-indigo-50 text-indigo-600 rounded-xl hover:bg-indigo-100 transition-all flex items-center justify-center"
                    >
                      {isCategorizing ? <div className="w-4 h-4 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin"></div> : <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>}
                    </button>
                  )}
                </div>
              </div>

              {/* Notebook / Tabs */}
              <div className="pt-10">
                <div className="flex border-b border-slate-200 mb-6">
                  <button className="px-6 py-2 border-b-2 border-indigo-600 text-xs font-black uppercase tracking-widest text-indigo-600">Journal Items</button>
                  <button className="px-6 py-2 text-xs font-black uppercase tracking-widest text-slate-400 hover:text-slate-600 transition-colors">Other Info</button>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-200">
                        <th className="pb-4 px-2">Account</th>
                        <th className="pb-4 px-2">Partner</th>
                        <th className="pb-4 px-2">Label</th>
                        <th className="pb-4 px-2 text-right">Debit</th>
                        <th className="pb-4 px-2 text-right">Credit</th>
                        {isDraft && <th className="pb-4 px-2 w-10"></th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {formData.lines.map((line) => (
                        <tr key={line.id} className="group">
                          <td className="py-3 px-2 min-w-[250px]">
                            {isDraft ? (
                              <SmartSearch 
                                placeholder="Select Account"
                                value={line.accountId}
                                onChange={val => updateLine(line.id, 'accountId', val)}
                                options={(store.accounts || []).map((a: Account) => ({
                                  id: a.id,
                                  label: `${a.code} - ${a.name}`,
                                  sublabel: a.type,
                                  searchKey: `${a.code} ${a.name}`
                                }))}
                              />
                            ) : (
                              <div className="py-2">
                                <p className="text-xs font-black text-slate-800">{(store.accounts || []).find((a:any) => a.id === line.accountId)?.name || 'Unknown Account'}</p>
                                <p className="text-[10px] font-bold text-slate-400 uppercase">{(store.accounts || []).find((a:any) => a.id === line.accountId)?.code}</p>
                              </div>
                            )}
                          </td>
                          <td className="py-3 px-2 min-w-[200px]">
                            {isDraft ? (
                              <SmartSearch 
                                placeholder="Select Partner"
                                value={line.contactId || ''}
                                onChange={val => updateLine(line.id, 'contactId', val)}
                                onSearchChange={store.searchContactsOnDemand}
                                options={(store.contacts || []).map((c: any) => ({
                                  id: c.id,
                                  label: c.name,
                                  sublabel: c.type,
                                  searchKey: `${c.name} ${c.type}`
                                }))}
                              />
                            ) : (
                              <div className="text-xs font-bold text-slate-500">{(store.contacts || []).find((c:any) => c.id === line.contactId)?.name || (line.contactId ? 'Unknown Partner (ID: ' + line.contactId.substring(0,6) + '...)' : '---')}</div>
                            )}
                          </td>
                          <td className="py-3 px-2">
                            <input 
                              className={`w-full bg-transparent text-xs font-bold outline-none ${isDraft ? 'hover:bg-slate-50 p-2 rounded border border-transparent focus:border-indigo-200' : ''}`}
                              placeholder="Add a label..."
                              value={line.description || ''}
                              onChange={e => isDraft && updateLine(line.id, 'description', e.target.value)}
                              readOnly={!isDraft}
                            />
                          </td>
                          <td className="py-3 px-2">
                            <input 
                              type="number"
                              className={`w-full bg-transparent text-right text-sm font-black outline-none ${isDraft ? 'hover:bg-slate-50 p-2 rounded border border-transparent focus:border-indigo-200' : ''}`}
                              placeholder="0.00"
                              value={line.debit || ''}
                              onChange={e => isDraft && updateLine(line.id, 'debit', parseFloat(e.target.value) || 0)}
                              readOnly={!isDraft}
                            />
                          </td>
                          <td className="py-3 px-2">
                            <input 
                              type="number"
                              className={`w-full bg-transparent text-right text-sm font-black outline-none ${isDraft ? 'hover:bg-slate-50 p-2 rounded border border-transparent focus:border-indigo-200' : ''}`}
                              placeholder="0.00"
                              value={line.credit || ''}
                              onChange={e => isDraft && updateLine(line.id, 'credit', parseFloat(e.target.value) || 0)}
                              readOnly={!isDraft}
                            />
                          </td>
                          {isDraft && (
                            <td className="py-3 px-2 text-center">
                              <button onClick={() => removeLine(line.id)} className="text-slate-300 hover:text-rose-500 transition-colors ">✕</button>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-slate-200">
                        <td colSpan={3} className="py-6 text-right text-[10px] font-black text-slate-400 uppercase tracking-widest">Total</td>
                        <td className={`py-6 px-2 text-right text-sm font-black tabular-nums ${totals.balanced ? 'text-indigo-600' : 'text-rose-600'}`}>{formatBDT(totals.debits)}</td>
                        <td className={`py-6 px-2 text-right text-sm font-black tabular-nums ${totals.balanced ? 'text-indigo-600' : 'text-rose-600'}`}>{formatBDT(totals.credits)}</td>
                        {isDraft && <td></td>}
                      </tr>
                    </tfoot>
                  </table>
                </div>

                {isDraft && (
                  <button onClick={addLine} className="mt-4 text-[10px] font-black text-indigo-600 uppercase tracking-widest hover:underline flex items-center">
                    <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M12 6v6m0 0v6m0-6h6m-6 0H6"/></svg>
                    Add a line
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Chatter / Audit Trail */}
          {selectedEntry && (
             <Chatter 
               messages={selectedEntry?.messages || []} 
               users={store.users} 
               onSendMessage={(body) => {
                 const newMessages = [...(selectedEntry?.messages || []), {
                   id: generateUUID(),
                   body,
                   date: new Date().toISOString(),
                   authorId: store.currentUser!.id
                 }];
                 store.updateJournalEntry(selectedEntry.id, { messages: newMessages });
                 setSelectedEntry({ ...selectedEntry, messages: newMessages } as any);
               }} 
             />
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-[98%] mx-auto p-4 lg:p-6 space-y-6">
      {/* List View Header */}
      <div className="flex flex-col md:flex-row md:justify-between md:items-end border-b border-slate-200 pb-6 space-y-4 md:space-y-0">
        <div>
          <h1 className="text-3xl font-black text-slate-900 uppercase tracking-tighter">Journal Entries</h1>
          <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mt-1">Global Ledger Pipeline</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
            <input 
              type="text" 
              placeholder="Search journals..." 
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setCurrentPage(1);
              }}
              className="pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-lg text-xs font-bold outline-none focus:border-indigo-500 transition-all w-64"
            />
          </div>
          <button 
            onClick={() => setShowFilters(!showFilters)}
            className={`px-4 py-2 border rounded-lg text-xs font-bold flex items-center transition-all ${showFilters ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}
          >
            <Filter className="w-4 h-4 mr-2" />
            Filters
          </button>
          <ExportButtons onExport={handleExport} />
          <button 
            onClick={handleCreateNew} 
            className="px-6 py-2 bg-indigo-600 text-white rounded-lg font-black text-xs uppercase tracking-widest hover:bg-indigo-700 shadow-lg shadow-indigo-600/20 transition-all active:scale-95 flex items-center"
          >
            <Plus className="w-4 h-4 mr-2" />
            Create
          </button>
        </div>
      </div>

      {/* Advanced Filters Panel */}
      {showFilters && (
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm grid grid-cols-1 md:grid-cols-4 gap-4 animate-in slide-in-from-top-2">
          <div className="space-y-1">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Journal Type</label>
            <select 
              value={journalTypeFilter || ""}
              onChange={(e) => { setJournalTypeFilter(e.target.value); setCurrentPage(1); }}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold outline-none focus:border-indigo-500"
            >
              <option value="ALL">All Types</option>
              <option value="MISC">Miscellaneous</option>
              <option value="INV">Customer Invoice</option>
              <option value="BILL">Vendor Bill</option>
              <option value="BANK">Bank</option>
              <option value="CASH">Cash</option>
              <option value="CUST_PAY">Customer Payment</option>
              <option value="VEND_PAY">Vendor Payment</option>
              <option value="EXPENSE">Expense</option>
              <option value="CREDIT_NOTE">Credit Note</option>
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Status</label>
            <select 
              value={statusFilter || ""}
              onChange={(e) => { setStatusFilter(e.target.value); setCurrentPage(1); }}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold outline-none focus:border-indigo-500"
            >
              <option value="ALL">All Statuses</option>
              <option value="DRAFT">Draft</option>
              <option value="POSTED">Posted</option>
              <option value="DELETED">Deleted</option>
            </select>
          </div>
          <div className="space-y-1 flex items-end">
            <div className="flex items-center space-x-2 bg-slate-50 px-3 py-2 rounded-lg border border-slate-200 w-full hover:border-indigo-300 transition-colors cursor-pointer" onClick={() => setShowDeleted(!showDeleted)}>
              <input 
                type="checkbox" 
                id="showDeletedJournal"
                checked={showDeleted}
                onChange={(e) => { setShowDeleted(e.target.checked); setCurrentPage(1); }}
                className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
              />
              <label htmlFor="showDeletedJournal" className="text-[10px] font-black text-slate-500 uppercase tracking-widest cursor-pointer select-none">
                Show Deleted Records
              </label>
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Entity</label>
            <select 
              value={entityFilter || ""}
              onChange={(e) => { setEntityFilter(e.target.value); setCurrentPage(1); }}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold outline-none focus:border-indigo-500"
            >
              <option value="ALL">All Entities</option>
              <option value="CUSTOMER">Customers</option>
              <option value="VENDOR">Vendors</option>
              <option value="EMPLOYEE">Employees</option>
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Date Range</label>
            <select 
              value={dateRangeFilter || ""}
              onChange={(e) => { setDateRangeFilter(e.target.value); setCurrentPage(1); }}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold outline-none focus:border-indigo-500"
            >
              <option value="ALL">All Time</option>
              <option value="TODAY">Today</option>
              <option value="THIS_MONTH">This Month</option>
              <option value="CUSTOM">Custom Range</option>
            </select>
          </div>
          {dateRangeFilter === 'CUSTOM' && (
            <div className="col-span-1 md:col-span-4 flex space-x-4 pt-2 border-t border-slate-100">
              <div className="flex-1 space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Start Date</label>
                <input 
                  type="date" 
                  value={customDateStart}
                  onChange={(e) => { setCustomDateStart(e.target.value); setCurrentPage(1); }}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold outline-none focus:border-indigo-500"
                />
              </div>
              <div className="flex-1 space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">End Date</label>
                <input 
                  type="date" 
                  value={customDateEnd}
                  onChange={(e) => { setCustomDateEnd(e.target.value); setCurrentPage(1); }}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold outline-none focus:border-indigo-500"
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* List View Table */}
      <div className="bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden flex flex-col">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[800px]">
            <thead>
              <tr className="bg-slate-50 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-200">
                {columns.find(c => c.id === 'date')?.visible && <th className="px-6 py-4">Date & Time</th>}
                {columns.find(c => c.id === 'number')?.visible && <th className="px-6 py-4">Number</th>}
                {columns.find(c => c.id === 'partner')?.visible && <th className="px-6 py-4">Partner</th>}
                {columns.find(c => c.id === 'reference')?.visible && <th className="px-6 py-4">Reference</th>}
                {columns.find(c => c.id === 'description')?.visible && <th className="px-6 py-4">Narration</th>}
                {columns.find(c => c.id === 'journal')?.visible && <th className="px-6 py-4">Journal</th>}
                {columns.find(c => c.id === 'preparedBy')?.visible && <th className="px-6 py-4">Prepared By</th>}
                {columns.find(c => c.id === 'total')?.visible && <th className="px-6 py-4 text-right">Total</th>}
                {columns.find(c => c.id === 'status')?.visible && <th className="px-6 py-4">Status</th>}
                <th className="px-6 py-4 text-right w-10">
                  <ColumnSelector columns={columns} onChange={setColumns} />
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {paginatedEntries.map((entry: any) => {
                const total = (entry.lines || []).reduce((s:any, l:any) => s + l.debit, 0);
                const partner = (entry.lines || []).find((l:any) => l.contactId)?.contactId;
                const contact = (store.contacts || []).find((c:any) => c.id === partner);
                
                return (
                  <tr 
                    key={entry.id} 
                    className="hover:bg-indigo-50/30 transition-colors cursor-pointer group"
                    onClick={() => handleEditEntry(entry)}
                  >
                    {columns.find(c => c.id === 'date')?.visible && <td className="px-6 py-4 text-xs font-bold text-slate-600 whitespace-nowrap">{formatDateTime(entry.createdAt || entry.updatedAt || entry.date)}</td>}
                    {columns.find(c => c.id === 'number')?.visible && <td className="px-6 py-4 font-black text-slate-900 uppercase tracking-tighter group-hover:text-indigo-600 transition-colors">{entry.id}</td>}
                    {columns.find(c => c.id === 'partner')?.visible && <td className="px-6 py-4 text-xs font-bold text-slate-500">{cleanContactName(contact?.name) || (partner ? 'Unknown Partner (ID: ' + partner.substring(0,6) + '...)' : '---')}</td>}
                    {columns.find(c => c.id === 'reference')?.visible && <td className="px-6 py-4 text-xs font-bold text-slate-500">
                      {onNavigate && entry.reference ? (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            const ref = entry.reference || '';
                            if (ref.startsWith('INV-')) onNavigate('invoices', { searchQuery: ref });
                            else if (ref.startsWith('BIL-')) onNavigate('bills', { searchQuery: ref });
                            else if (ref.startsWith('PAY-')) onNavigate('payments', { searchQuery: ref });
                          }}
                          className={`${(entry.reference || '').startsWith('INV-') || (entry.reference || '').startsWith('BIL-') || (entry.reference || '').startsWith('PAY-') ? 'text-indigo-600 hover:underline' : ''}`}
                        >
                          {entry.reference || '---'}
                        </button>
                      ) : (
                        entry.reference || '---'
                      )}
                    </td>}
                    {columns.find(c => c.id === 'description')?.visible && <td className="px-6 py-4 text-xs font-bold text-slate-500 overflow-hidden text-ellipsis whitespace-nowrap max-w-[200px]">{entry.description || '---'}</td>}
                    {columns.find(c => c.id === 'journal')?.visible && <td className="px-6 py-4 text-xs font-bold text-slate-500">
                      {entry.journalType === 'INV' ? 'Customer Invoice' :
                       entry.journalType === 'BILL' ? 'Vendor Bill' :
                       entry.journalType === 'BANK' ? 'Bank' :
                       entry.journalType === 'CASH' ? 'Cash' :
                       entry.journalType === 'CUST_PAY' ? 'Customer Payment' :
                       entry.journalType === 'VEND_PAY' ? 'Vendor Payment' :
                       entry.journalType === 'EXPENSE' ? 'Expense' :
                       entry.journalType === 'CREDIT_NOTE' ? 'Credit Note' :
                       'Miscellaneous'}
                    </td>}
                    {columns.find(c => c.id === 'preparedBy')?.visible && <td className="px-6 py-4 text-xs font-bold text-slate-500">
                      {(() => {
                         const invoice = (store.invoices || []).find((inv: any) => inv.number === entry.reference || inv.id === entry.reference);
                         const bill = (store.bills || []).find((b: any) => b.number === entry.reference || b.id === entry.reference);
                         const payment = (store.payments || []).find((p: any) => p.number === entry.reference || p.id === entry.reference);
                         const docSalesperson = invoice?.salesperson || bill?.salesperson || payment?.salesperson;
                         const usr = { username: store.resolveUserName(entry.createdById), name: store.resolveUserName(entry.createdById) };
                         return (docSalesperson || entry.preparedBy || usr?.username || usr?.name || '---').split(' ')[0];
                      })()}
                    </td>}
                    {columns.find(c => c.id === 'total')?.visible && <td className="px-6 py-4 text-right font-black text-slate-900 tabular-nums">{formatBDT(total)}</td>}
                    {columns.find(c => c.id === 'status')?.visible && <td className="px-6 py-4">
                      <span className={`px-3 py-1 text-[9px] font-black uppercase rounded-md ring-1 ${
                        entry.status === 'POSTED' ? 'bg-emerald-50 text-emerald-700 ring-emerald-100' : 
                        entry.status === 'DRAFT' ? 'bg-amber-50 text-amber-700 ring-amber-100' :
                        entry.status === 'DELETED' ? 'bg-rose-50 text-rose-700 ring-rose-100' :
                        'bg-slate-50 text-slate-700 ring-slate-100'
                      }`}>
                        {entry.status === 'DELETED' ? 'Deleted' : (entry.status || 'POSTED')}
                      </span>
                    </td>}
                    <td className="px-6 py-4" onClick={e => e.stopPropagation()}>
                      {entry.status === 'DELETED' && store.currentUser?.roleId === 'role-admin' && (
                        <div className="flex items-center justify-end space-x-2">
                           <button 
                             onClick={() => store.restoreRecord('journal', entry.id)}
                             className="px-2 py-1 text-[9px] font-black uppercase text-indigo-600 hover:bg-indigo-50 rounded border border-indigo-200"
                           >
                             Restore
                           </button>
                           <button 
                             onClick={() => { if(confirm('Permanently delete this journal entry?')) store.permanentDeleteRecord('journal', entry.id); }}
                             className="px-2 py-1 text-[9px] font-black uppercase text-rose-600 hover:bg-rose-50 rounded border border-rose-200"
                           >
                             Delete
                           </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
              {paginatedEntries.length === 0 && (
                <tr>
                  <td colSpan={columns.filter(c => c.visible).length + 1} className="px-6 py-20 text-center">
                    <div className="flex flex-col items-center">
                      <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mb-4">
                        <FileText className="w-8 h-8 text-slate-300" />
                      </div>
                      <p className="text-xs font-black text-slate-400 uppercase tracking-widest">No Journal Entries Found</p>
                      <button onClick={handleCreateNew} className="mt-4 text-xs font-bold text-indigo-600 hover:underline">Create your first entry</button>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        
        <Pagination 
          currentPage={currentPage} 
          totalPages={totalPages} 
          totalItems={store.entryCount} 
          itemsPerPage={pageSize} 
          onPageChange={setCurrentPage} 
          onItemsPerPageChange={setPageSize}
        />
      </div>
    </div>
  );
};

export default JournalManager;
