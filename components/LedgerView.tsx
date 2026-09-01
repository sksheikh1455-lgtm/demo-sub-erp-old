
import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { Account, Contact } from '../types';
import {formatBDT, formatNumber, exportToXLSX, getOpDateBST} from '../constants';
import { generatePDFReport, generateLedgerPDF } from '../services/pdfService';
import ReportFilters, { FilterState } from './ReportFilters';
import ExportButtons from './ExportButtons';
import Pagination from './Pagination';
import ColumnSelector, { useColumns } from './ColumnSelector';
import { reportingService, GeneralLedgerEntry } from '../services/reportingService';
import { Activity, BookOpen, Search } from 'lucide-react';

const LedgerView: React.FC<{ store: any, initialSearch?: string | null, onClearSearch?: () => void, onNavigate?: (tab: string, filter?: any) => void }> = ({ store, initialSearch, onClearSearch, onNavigate }) => {
  const todayStr = getOpDateBST();
  const [filters, setFilters] = useState<FilterState>({
    startDate: todayStr.substring(0,4) + '-01-01', 
    endDate: todayStr,
    searchQuery: initialSearch || '',
    activeFilters: [],
    groupBy: 'account' 
  });

  const [loading, setLoading] = useState(false);
  const [ledgerEntries, setLedgerEntries] = useState<Record<string, GeneralLedgerEntry[]>>({});
  const [sortConfig, setSortConfig] = useState<{ key: 'date' | 'reference' | 'narration', direction: 'asc' | 'desc' } | null>(null);

  const [columns, setColumns] = useColumns('ledger_list', [
    { id: 'date', label: 'Date', visible: true },
    { id: 'reference', label: 'Reference', visible: true },
    { id: 'narration', label: 'Narration', visible: true },
    { id: 'partner', label: 'Partner', visible: true },
    { id: 'preparedBy', label: 'Prepared By', visible: true },
    { id: 'debit', label: 'Debit', visible: true },
    { id: 'credit', label: 'Credit', visible: true },
    { id: 'balance', label: 'Balance', visible: true },
  ]);

  useEffect(() => {
    if (initialSearch !== undefined) {
      setFilters(prev => ({ ...prev, searchQuery: initialSearch || '' }));
    }
  }, [initialSearch]);

  const fetchLedgerData = useCallback(async () => {
    setLoading(true);
    try {
      const activeIds = store.activeCompanyIds?.length > 0 ? store.activeCompanyIds : [];
      const targetMode = activeIds.length === 1 ? activeIds[0] : 'CONSOLIDATED';
      
      const query = filters.searchQuery?.toLowerCase() || '';
      const filteredAccounts = (store.accounts || []).filter((acc: Account) => {
        const matchesActiveFilters = filters.activeFilters.length === 0 || 
          filters.activeFilters.includes(acc.type) || 
          filters.activeFilters.includes(acc.code);
        const matchesSearch = String(acc.name || '').toLowerCase().includes(query) || (acc.code || '').includes(query);
        return matchesActiveFilters && matchesSearch;
      });

      const newLedgerEntries: Record<string, GeneralLedgerEntry[]> = {};
      
      // Fetch GL for each filtered account
      // To prevent massive parallel requests, we do them in batches or limited concurrency
      const BATCH_SIZE = 5;
      for (let i = 0; i < filteredAccounts.length; i += BATCH_SIZE) {
        const batch = filteredAccounts.slice(i, i + BATCH_SIZE);
        await Promise.all(batch.map(async (acc: Account) => {
          const data = await store.getGeneralLedger(
            targetMode === 'CONSOLIDATED' ? null : targetMode, 
            acc.id, 
            filters.startDate, 
            filters.endDate
          );
          newLedgerEntries[acc.id] = data;
        }));
      }
      
      setLedgerEntries(newLedgerEntries);
    } catch (err) {
      console.error('Failed to fetch ledger data:', err);
    } finally {
      setLoading(false);
    }
  }, [store.activeCompanyIds, store.accounts, filters.startDate, filters.endDate, filters.searchQuery, filters.activeFilters]);

  useEffect(() => {
    fetchLedgerData();
  }, [fetchLedgerData]);

  const flattenedLedgerData = useMemo(() => {
    const flat: any[] = [];
    const query = filters.searchQuery?.toLowerCase() || '';
    
    const filteredAccounts = (store.accounts || []).filter((acc: Account) => {
      return ledgerEntries[acc.id];
    });

    filteredAccounts.forEach(acc => {
      const entries = ledgerEntries[acc.id] || [];
      if (entries.length === 0) return;

      const openingEntry = entries.find(e => e.is_opening);
      const transactions = entries.filter(e => !e.is_opening);

      if (transactions.length === 0 && (!openingEntry || openingEntry.running_balance === 0)) return;

      flat.push({ type: 'header', account: acc });
      
      if (openingEntry) {
        flat.push({ type: 'opening', balance: openingEntry.running_balance });
      }

      let groupDebit = 0;
      let groupCredit = 0;
      let lastBalance = openingEntry?.running_balance || 0;

      let sortedTransactions = [...transactions];
      if (sortConfig) {
        sortedTransactions.sort((a, b) => {
          let valA = a[sortConfig.key === 'narration' ? 'description' : sortConfig.key] || '';
          let valB = b[sortConfig.key === 'narration' ? 'description' : sortConfig.key] || '';
          
          if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
          if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
          return 0;
        });
      }

      sortedTransactions.forEach(tx => {
        groupDebit += tx.debit;
        groupCredit += tx.credit;
        lastBalance = tx.running_balance;
        flat.push({ type: 'transaction', tx });
      });

      flat.push({ type: 'total', account: acc, groupDebit, groupCredit, runningBal: lastBalance });
    });

    return flat;
  }, [ledgerEntries, store.accounts, filters.searchQuery, sortConfig]);

  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(200);

  const paginatedLedgerData = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return flattenedLedgerData.slice(start, start + itemsPerPage);
  }, [flattenedLedgerData, currentPage]);

  const totalPages = Math.ceil(flattenedLedgerData.length / itemsPerPage);

  const handleSort = (key: 'date' | 'reference' | 'narration') => {
    setSortConfig(prev => {
      if (prev?.key === key) {
        return { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' };
      }
      return { key, direction: 'asc' };
    });
  };

  const handleExport = (format: 'excel' | 'pdf', scope: 'page' | 'all') => {
    const dataToExport = scope === 'page' ? paginatedLedgerData : flattenedLedgerData;
    const filename = `General_Ledger_${getOpDateBST()}`;

    if (format === 'excel') {
      const rows: any[][] = [['Account', 'Date', 'Reference', 'Narration', 'Partner', 'Prepared By', 'Total Debit', 'Total Credit', 'Balance']];
      dataToExport.forEach((item) => {
        if (item.type === 'header') {
          rows.push([`${item.account.name} (${item.account.code})`]);
        } else if (item.type === 'opening') {
          rows.push(['', '', '', 'Opening Balance', '', '', '', '', item.balance]);
        } else if (item.type === 'transaction') {
          rows.push(['', item.tx.date, item.tx.reference, item.tx.description, item.tx.partner_name, item.tx.prepared_by, item.tx.debit, item.tx.credit, item.tx.running_balance]);
        } else if (item.type === 'total') {
          rows.push(['TOTAL', '', '', '', '', '', item.groupDebit, item.groupCredit, item.runningBal]);
          rows.push([]);
        }
      });
      exportToXLSX(filename, rows);
    } else {
      const companyInfo = (store.companies || []).find((c: any) => c.id === store.activeCompanyIds[0]);
      const dateRangeStr = `From ${filters.startDate || 'Beginning'} To ${filters.endDate || 'Now'}`;
      generateLedgerPDF({
        companyName: companyInfo?.name || 'Local Company',
        dataToExport,
        dateRange: dateRangeStr,
        printedBy: store.currentUser?.name,
        filename
      });
    }
  };

  return (
    <div className="space-y-6 max-w-[98%] mx-auto p-4 lg:p-10 pb-24 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row justify-between items-start no-print mb-8 gap-4">
        <div>
          <div className="flex items-center space-x-3 mb-2">
            <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center text-white shadow-lg border border-indigo-500">
              <BookOpen className="w-6 h-6" />
            </div>
            <h1 className="text-3xl font-black text-slate-900 tracking-tighter uppercase">General Ledger</h1>
          </div>
          <p className="text-slate-500 font-medium ml-1 flex flex-wrap items-center gap-2">
            <Activity className="w-3 h-3 text-indigo-400 animate-pulse" />
            <span>Dynamic audit trail powered by SQL Reporting Engine.</span>
            <button
              onClick={() => setFilters(prev => ({ ...prev, searchQuery: prev.searchQuery === '100100' ? '' : '100100' }))}
              className={`px-2 py-0.5 text-[10px] font-black uppercase rounded-lg border transition-all ${
                filters.searchQuery === '100100'
                  ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm shadow-indigo-200'
                  : 'bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100'
              }`}
            >
              100100 Cash Filter
            </button>
          </p>
        </div>
        <div className="flex items-center space-x-3 flex-1 max-w-2xl bg-white p-2 rounded-2xl border border-slate-100 shadow-sm">
          <ReportFilters 
            filters={filters} 
            setFilters={setFilters} 
            availableFilters={[
              { id: 'ASSET', label: 'Asset Accounts', group: 'Type' },
              { id: 'LIABILITY', label: 'Liability Accounts', group: 'Type' },
              { id: 'REVENUE', label: 'Revenue Accounts', group: 'Type' },
              { id: 'EXPENSE', label: 'Expense Accounts', group: 'Type' },
              { id: 'EQUITY', label: 'Equity Accounts', group: 'Type' },
            ]} 
            availableGroups={[{ id: 'account', label: 'By Account' }]} 
          />
          <div className="h-6 w-px bg-slate-100 mx-2"></div>
          <button 
            onClick={fetchLedgerData}
            className="p-2 hover:bg-slate-50 rounded-xl transition-all group"
            title="Refresh Ledger"
          >
            <Activity className={`w-5 h-5 text-slate-400 group-hover:text-indigo-600 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <ExportButtons onExport={handleExport} />
        </div>
      </div>

      <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-xl overflow-hidden relative">
        {loading && (
          <div className="absolute inset-0 bg-white/60 backdrop-blur-[2px] z-50 flex flex-col items-center justify-center space-y-4">
            <Activity className="w-10 h-10 text-indigo-600 animate-spin" />
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em]">Synching Ledger State...</p>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/50 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] border-b border-slate-100">
                {columns.find(c => c.id === 'date')?.visible && <th className="px-8 py-6 w-32 cursor-pointer hover:bg-slate-100/50 transition-colors" onClick={() => handleSort('date')}>Date {sortConfig?.key === 'date' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : ''}</th>}
                {columns.find(c => c.id === 'reference')?.visible && <th className="px-8 py-6 cursor-pointer hover:bg-slate-100/50 transition-colors" onClick={() => handleSort('reference')}>Ref {sortConfig?.key === 'reference' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : ''}</th>}
                {columns.find(c => c.id === 'narration')?.visible && <th className="px-8 py-6 cursor-pointer hover:bg-slate-100/50 transition-colors" onClick={() => handleSort('narration')}>Narration {sortConfig?.key === 'narration' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : ''}</th>}
                {columns.find(c => c.id === 'partner')?.visible && <th className="px-8 py-6">Partner</th>}
                {columns.find(c => c.id === 'preparedBy')?.visible && <th className="px-8 py-6">User</th>}
                {columns.find(c => c.id === 'debit')?.visible && <th className="px-8 py-6 text-right w-40">Debit</th>}
                {columns.find(c => c.id === 'credit')?.visible && <th className="px-8 py-6 text-right w-40">Credit</th>}
                {columns.find(c => c.id === 'balance')?.visible && <th className="px-8 py-6 text-right w-40 bg-slate-50/80">Balance</th>}
                <th className="px-4 py-6 w-10">
                  <ColumnSelector columns={columns} onChange={setColumns} />
                </th>
              </tr>
            </thead>
            <tbody className="text-[11px]">
              {paginatedLedgerData.map((item, idx) => {
                if (item.type === 'header') {
                  return (
                    <tr key={`header-${idx}`} className="bg-slate-100/50 border-y border-slate-200/50">
                      <td colSpan={columns.filter(c => c.visible).length + 1} className="px-8 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-6 h-6 bg-white border border-slate-200 rounded flex items-center justify-center font-black text-[9px] text-slate-400">
                            {item.account.code}
                          </div>
                          <h3 className="text-sm font-black text-slate-800 tracking-tight uppercase">
                            {item.account.name}
                          </h3>
                        </div>
                      </td>
                    </tr>
                  );
                } else if (item.type === 'opening') {
                  return (
                    <tr key={`opening-${idx}`} className="border-b border-slate-50 font-bold bg-white text-slate-400 italic">
                      {columns.find(c => c.id === 'date')?.visible && <td className="px-8 py-4"></td>}
                      {columns.find(c => c.id === 'reference')?.visible && <td className="px-8 py-4 uppercase tracking-[0.1em] text-[10px]">Opening</td>}
                      {columns.find(c => c.id === 'narration')?.visible && <td className="px-8 py-4">Prior periods consolidated</td>}
                      {columns.find(c => c.id === 'partner')?.visible && <td className="px-8 py-4"></td>}
                      {columns.find(c => c.id === 'preparedBy')?.visible && <td className="px-8 py-4"></td>}
                      {columns.find(c => c.id === 'debit')?.visible && <td className="px-8 py-4 text-right">-</td>}
                      {columns.find(c => c.id === 'credit')?.visible && <td className="px-8 py-4 text-right">-</td>}
                      {columns.find(c => c.id === 'balance')?.visible && <td className="px-8 py-4 text-right font-black bg-slate-50/20">{formatBDT(item.balance)}</td>}
                      <td></td>
                    </tr>
                  );
                } else if (item.type === 'transaction') {
                  return (
                    <tr key={`${item.tx.id}-${idx}`} className="border-b border-slate-50 hover:bg-slate-50 transition-colors bg-white group">
                      {columns.find(c => c.id === 'date')?.visible && <td className="px-8 py-4 text-slate-500 font-medium">{item.tx.date}</td>}
                      {columns.find(c => c.id === 'reference')?.visible && <td className="px-8 py-4">
                        {onNavigate ? (
                          <button
                            onClick={() => {
                              const ref = item.tx.reference || '';
                              if (ref.startsWith('INV-')) onNavigate('invoices', { searchQuery: ref });
                              else if (ref.startsWith('BIL-')) onNavigate('bills', { searchQuery: ref });
                              else if (ref.startsWith('PAY-')) onNavigate('payments', { searchQuery: ref });
                              else onNavigate('journal', { reference: ref });
                            }}
                            className="text-indigo-600 font-black tracking-tighter uppercase whitespace-normal break-words hover:underline text-left"
                          >
                            {item.tx.reference}
                          </button>
                        ) : (
                          <span className="text-indigo-600 font-black tracking-tighter uppercase whitespace-normal break-words">
                            {item.tx.reference}
                          </span>
                        )}
                      </td>}
                      {columns.find(c => c.id === 'narration')?.visible && <td className="px-8 py-4">
                         <span className="text-slate-800 font-medium whitespace-normal break-all">
                           {item.tx.description}
                         </span>
                      </td>}
                      {columns.find(c => c.id === 'partner')?.visible && <td className="px-8 py-4 font-black uppercase text-[10px] text-slate-500">
                        {item.tx.partner_name || '-'}
                      </td>}
                      {columns.find(c => c.id === 'preparedBy')?.visible && <td className="px-8 py-4 font-bold uppercase text-[9px] text-slate-400">
                        {store.resolveUserName(item.tx.responsible_name || item.tx.prepared_by || item.tx.preparedBy)?.split(' ')[0]}
                      </td>}
                      {columns.find(c => c.id === 'debit')?.visible && <td className="px-8 py-4 text-right font-bold text-slate-700 tabular-nums">
                        {item.tx.debit > 0 ? formatNumber(item.tx.debit) : '-'}
                      </td>}
                      {columns.find(c => c.id === 'credit')?.visible && <td className="px-8 py-4 text-right font-bold text-slate-700 tabular-nums">
                        {item.tx.credit > 0 ? formatNumber(item.tx.credit) : '-'}
                      </td>}
                      {columns.find(c => c.id === 'balance')?.visible && <td className="px-8 py-4 text-right font-black text-slate-900 tabular-nums bg-slate-50/20 group-hover:bg-indigo-50/30 transition-colors">
                        {formatBDT(item.tx.running_balance)}
                      </td>}
                      <td></td>
                    </tr>
                  );
                } else if (item.type === 'total') {
                  return (
                    <tr key={`total-${idx}`} className="bg-slate-50/30 border-t border-slate-100">
                      <td colSpan={columns.filter(c => ['date', 'reference', 'narration', 'partner', 'preparedBy'].includes(c.id) && c.visible).length} className="px-8 py-4 text-right">
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mr-4">Movement for {item.account.name}</span>
                      </td>
                      {columns.find(c => c.id === 'debit')?.visible && <td className="px-8 py-4 text-right font-black text-slate-800">{formatNumber(item.groupDebit)}</td>}
                      {columns.find(c => c.id === 'credit')?.visible && <td className="px-8 py-4 text-right font-black text-slate-800">{formatNumber(item.groupCredit)}</td>}
                      {columns.find(c => c.id === 'balance')?.visible && <td className="px-8 py-4 text-right font-black text-slate-800 bg-slate-50/50 italic">{formatBDT(item.runningBal)}</td>}
                      <td></td>
                    </tr>
                  );
                }
                return null;
              })}
            </tbody>
          </table>
        </div>
        
        {flattenedLedgerData.length === 0 && !loading && (
          <div className="py-32 flex flex-col items-center justify-center text-slate-200">
            <Search className="w-16 h-16 mb-4 opacity-20" />
            <p className="font-black uppercase tracking-[0.3em] text-[10px]">No records match your fiscal filters</p>
          </div>
        )}

        <div className="px-8 py-6 bg-slate-50 border-t border-slate-100">
          <Pagination 
            currentPage={currentPage} 
            totalPages={totalPages} 
            totalItems={flattenedLedgerData.length} 
            itemsPerPage={itemsPerPage} 
            onPageChange={setCurrentPage} 
            onItemsPerPageChange={(i) => {
              setItemsPerPage(i);
              setCurrentPage(1);
            }}
            pageOptions={[100, 150, 200, 300, 500]}
            showAllOption={true}
          />
        </div>
      </div>
    </div>
  );
};

export default LedgerView;
