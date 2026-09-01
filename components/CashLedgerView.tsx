import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { formatBDT, getOpDateBST, exportToXLSX } from '../constants';
import { Activity, RefreshCw } from 'lucide-react';
import ReportFilters, { FilterState } from './ReportFilters';
import Pagination from './Pagination';
import ExportButtons from './ExportButtons';
import { generateLedgerPDF } from '../services/pdfService';

export interface CashTransaction {
  line_id: string;
  journal_id: string;
  date: string;
  reference_number: string;
  journal_type: string;
  description: string;
  debit: number;
  credit: number;
  impact: number;
  company_id: string;
  created_at: string;
  partner_name?: string;
  prepared_by?: string;
}

const CashLedgerView: React.FC<{ store: any, onNavigate?: (tab: string) => void }> = ({ store, onNavigate }) => {
  const todayStr = getOpDateBST();
  const [filters, setFilters] = useState<FilterState>({
    startDate: todayStr,
    endDate: todayStr,
    searchQuery: '',
    activeFilters: []
  });

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [openingBalance, setOpeningBalance] = useState<number>(0);
  const [transactions, setTransactions] = useState<CashTransaction[]>([]);

  const fetchCashLedger = useCallback(async () => {
    if (!filters.startDate || !filters.endDate) return;
    setLoading(true);
    setErrorMsg(null);
    try {
      const activeIds = (store.activeCompanyIds || []);

      console.log('Fetching cash ledger:', { activeIds, start: filters.startDate, end: filters.endDate });
      const { data, error } = await supabase.rpc('get_cash_ledger', {
        p_company_ids: activeIds.length > 0 ? activeIds : null,
        p_start_date: filters.startDate,
        p_end_date: filters.endDate
      });

      if (error) {
        console.error('Supabase RPC Error:', error);
        alert('RPC Error: ' + error.message);
        setErrorMsg(error.message || 'Error fetching data');
      }
      if (data) {
        let parsed = data;
        if (typeof data === 'string') {
          try {
            parsed = JSON.parse(data);
          } catch (e) {
            console.error('Failed to parse cash ledger data', e);
          }
        }
        
        let txs = [];
        let ob = 0;
        
        if (parsed) {
           if (parsed.transactions && Array.isArray(parsed.transactions)) {
             txs = parsed.transactions;
             ob = parsed.opening_balance || 0;
           } else if (Array.isArray(parsed) && parsed.length > 0 && parsed[0].get_cash_ledger) {
             txs = parsed[0].get_cash_ledger.transactions || [];
             ob = parsed[0].get_cash_ledger.opening_balance || 0;
           } else if (Array.isArray(parsed)) {
             txs = parsed;
           }
        }
        
        
        // Deduplicate JE-PAY- if JE-CPAY- exists
        const cpayIds = new Set(txs.filter((l:any) => l.journal_id && l.journal_id.startsWith('JE-CPAY-')).map((l:any) => l.journal_id.replace('JE-CPAY-', '')));
        const vpayIds = new Set(txs.filter((l:any) => l.journal_id && l.journal_id.startsWith('JE-VPAY-')).map((l:any) => l.journal_id.replace('JE-VPAY-', '')));
        
        txs = txs.filter((tx: any) => {
           if (tx.journal_id && tx.journal_id.startsWith('JE-PAY-')) {
               const base = tx.journal_id.replace('JE-PAY-', '');
               if (cpayIds.has(base) || vpayIds.has(base)) return false;
           }
           return true;
        });
        
        setOpeningBalance(ob);
        setTransactions(txs);
      }
    } catch (err: any) {
      console.error('Error fetching cash ledger', err);
      setErrorMsg(err.message || 'Error fetching data');
    } finally {
      setLoading(false);
    }
  }, [filters.startDate, filters.endDate, store.activeCompanyIds, store.companies]);

  useEffect(() => {
    fetchCashLedger();
  }, [fetchCashLedger]);

  const filteredTransactions = useMemo(() => {
    if (!filters.searchQuery) return transactions;
    const q = filters.searchQuery.toLowerCase();
    return transactions.filter(t => 
      (t.reference_number || '').toLowerCase().includes(q) ||
      (t.description || '').toLowerCase().includes(q)
    );
  }, [transactions, filters.searchQuery]);

  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 50;
  const totalPages = Math.ceil(filteredTransactions.length / itemsPerPage);

  const paginatedTransactions = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredTransactions.slice(start, start + itemsPerPage);
  }, [filteredTransactions, currentPage]);

  const handleExport = (format: 'excel' | 'pdf', scope: 'page' | 'all') => {
    const rawData = scope === 'page' ? paginatedTransactions : filteredTransactions;
    
    let exportOpeningBalance = openingBalance;
    if (scope === 'page' && currentPage > 1) {
      exportOpeningBalance = openingBalance;
      for (let i = 0; i < (currentPage - 1) * itemsPerPage; i++) {
        exportOpeningBalance += filteredTransactions[i].impact;
      }
    }

    const companyInfo = (store.companies || []).find((c: any) => c.id === store.activeCompanyIds?.[0]) || { name: 'Local Company' };
    const printedBy = store.currentUser?.name || 'System';
    const filename = `Cash_Ledger_${filters.startDate}_to_${filters.endDate}`;

    // Map to Ledger format
    const dataToExport: any[] = [];
    dataToExport.push({ type: 'header', account: { name: 'Cash', code: '100100' } });
    dataToExport.push({ type: 'opening', balance: exportOpeningBalance });
    
    let rb = exportOpeningBalance;
    let groupDebit = 0;
    let groupCredit = 0;
    
    rawData.forEach(tx => {
      rb += tx.impact;
      groupDebit += (tx.debit || 0);
      groupCredit += (tx.credit || 0);
      dataToExport.push({
        type: 'transaction',
        tx: {
          date: tx.date,
          reference: tx.reference_number,
          description: tx.description,
          partner_name: tx.partner_name || '',
          prepared_by: tx.prepared_by || '',
          debit: tx.debit,
          credit: tx.credit,
          running_balance: rb
        }
      });
    });
    dataToExport.push({ type: 'total', groupDebit, groupCredit, runningBal: rb });

    if (format === 'pdf') {
      generateLedgerPDF({
        companyName: store.targetMode === 'CONSOLIDATED' ? 'CONSOLIDATED LEDGER' : companyInfo.name,
        dataToExport,
        dateRange: `From ${filters.startDate} To ${filters.endDate}`,
        printedBy,
        filename
      });
    } else if (format === 'excel') {
      const rows: any[][] = [['Date', 'Reference', 'Description', 'Partner', 'User', 'Debit', 'Credit', 'Balance']];
      rows.push(['', '', 'Opening Balance', '', '', '', '', exportOpeningBalance]);
      
      let erb = exportOpeningBalance;
      rawData.forEach(tx => {
         erb += tx.impact;
         rows.push([
           tx.date || '',
           tx.reference_number || '',
           tx.description || '',
           tx.partner_name || '',
           tx.prepared_by || '',
           tx.debit > 0 ? tx.debit : 0,
           tx.credit > 0 ? tx.credit : 0,
           erb
         ]);
      });
      rows.push(['Closing Balance', '', '', '', '', '', '', erb]);
      exportToXLSX(filename, rows);
    }
  };

  let runningBalance = openingBalance;
  if (currentPage > 1) {
    for (let i = 0; i < (currentPage - 1) * itemsPerPage; i++) {
      if (filteredTransactions[i]) {
        runningBalance += filteredTransactions[i].impact;
      }
    }
  }

  const displayOpeningBalance = runningBalance;

  return (
    <div className="flex-1 overflow-auto bg-slate-50 relative pb-32">
      {errorMsg && <div className="p-4 bg-red-100 text-red-800">{errorMsg}</div>}
      <div className="absolute inset-0 bg-slate-50" />
      <div className="absolute top-0 inset-x-0 h-64 bg-slate-900 shadow-2xl" />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        <div className="bg-white rounded-xl shadow-xl overflow-hidden border border-slate-200">
          <div className="px-6 py-6 border-b border-slate-200">
             <div className="flex justify-between items-center">
                 <div>
                    <h1 className="text-3xl font-black text-slate-900 tracking-tighter uppercase">Cash Ledger</h1>
                    <p className="text-sm font-medium text-slate-500 uppercase tracking-widest mt-1">Unified Cash Account Tracking (100100)</p>
                 </div>
                 <div className="flex items-center space-x-3">
                    <button onClick={fetchCashLedger} className="p-2 bg-slate-100 text-slate-600 rounded-lg hover:bg-slate-200 hover:text-slate-900 transition-colors">
                       <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin text-slate-900' : ''}`} />
                    </button>
                 </div>
             </div>
          </div>

          <div className="bg-slate-50/50 p-4 border-b border-slate-200 space-y-4">
            {errorMsg && <div className="mb-4 p-3 bg-red-100 text-red-700 text-xs font-bold rounded">{errorMsg}</div>}
            
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex bg-white border border-slate-200 rounded-lg p-1 shadow-sm">
                <button 
                  onClick={() => {
                    const today = getOpDateBST();
                    setFilters({...filters, startDate: today, endDate: today});
                  }}
                  className={`px-4 py-1.5 text-xs font-bold rounded-md transition-colors ${
                    filters.startDate === todayStr && filters.endDate === todayStr
                    ? 'bg-slate-900 text-white' 
                    : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  Today
                </button>
                <button 
                  onClick={() => {
                    const dateObj = new Date();
                    dateObj.setDate(dateObj.getDate() - 1);
                    const bstTime = dateObj.getTime() + (6 * 60 * 60 * 1000);
                    const yest = new Date(bstTime).toISOString().split('T')[0];
                    setFilters({...filters, startDate: yest, endDate: yest});
                  }}
                  className={`px-4 py-1.5 text-xs font-bold rounded-md transition-colors ${
                    filters.startDate === (() => {
                      const d = new Date(); d.setDate(d.getDate()-1);
                      return new Date(d.getTime() + (6 * 60 * 60 * 1000)).toISOString().split('T')[0];
                    })() && 
                    filters.endDate === (() => {
                      const d = new Date(); d.setDate(d.getDate()-1);
                      return new Date(d.getTime() + (6 * 60 * 60 * 1000)).toISOString().split('T')[0];
                    })()
                    ? 'bg-slate-900 text-white' 
                    : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  Yesterday
                </button>
              </div>

              <div className="flex items-center space-x-2 bg-white border border-slate-200 rounded-lg p-1.5 shadow-sm">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-2">Custom:</span>
                <input 
                  type="date" 
                  className="bg-transparent border-none text-xs font-medium outline-none text-slate-700 cursor-pointer"
                  value={filters.startDate || ''}
                  onChange={(e) => setFilters({...filters, startDate: e.target.value || null})}
                />
                <span className="text-slate-300">-</span>
                <input 
                  type="date" 
                  className="bg-transparent border-none text-xs font-medium outline-none text-slate-700 cursor-pointer"
                  value={filters.endDate || ''}
                  onChange={(e) => setFilters({...filters, endDate: e.target.value || null})}
                />
              </div>
            </div>

            <ReportFilters filters={filters} setFilters={setFilters} />
          </div>

          <div className="overflow-x-auto">
             <table className="w-full text-left border-collapse">
                <thead>
                   <tr className="bg-slate-50/50 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] border-b border-slate-100">
                     <th className="px-8 py-6 w-32">Date</th>
                     <th className="px-8 py-6">Ref</th>
                     <th className="px-8 py-6">Narration</th>
                     <th className="px-8 py-6">Partner</th>
                     <th className="px-8 py-6">User</th>
                     <th className="px-8 py-6 text-right w-40">Debit</th>
                     <th className="px-8 py-6 text-right w-40">Credit</th>
                     <th className="px-8 py-6 text-right w-40 bg-slate-50/80">Balance</th>
                   </tr>
                </thead>
                <tbody className="text-[11px]">
                   <tr className="border-b border-slate-50 font-bold bg-white text-slate-400 italic">
                      <td className="px-8 py-4"></td>
                      <td className="px-8 py-4 uppercase tracking-[0.1em] text-[10px]">Opening</td>
                      <td className="px-8 py-4">Prior periods consolidated as of {filters.startDate}</td>
                      <td className="px-8 py-4"></td>
                      <td className="px-8 py-4"></td>
                      <td className="px-8 py-4 text-right">-</td>
                      <td className="px-8 py-4 text-right">-</td>
                      <td className="px-8 py-4 text-right font-black bg-slate-50/20">{formatBDT(displayOpeningBalance)}</td>
                   </tr>
                   {paginatedTransactions.length === 0 && !loading && (
                      <tr>
                        <td colSpan={8} className="px-4 py-12 text-center">
                           <Activity className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                           <p className="text-slate-500 font-medium text-sm">No cash movements found for this period.</p>
                        </td>
                      </tr>
                   )}
                   {paginatedTransactions.map((tx, idx) => {
                      runningBalance += tx.impact;
                      return (
                        <tr key={tx.line_id || idx} className="border-b border-slate-50 hover:bg-slate-50 transition-colors bg-white group">
                           <td className="px-8 py-4 text-slate-500 font-medium">{tx.date}</td>
                           <td className="px-8 py-4">
                             <span className="px-2 py-1 bg-slate-100 text-slate-600 rounded-md font-mono text-[9px] tracking-wider uppercase">
                               {tx.reference_number || '-'}
                             </span>
                           </td>
                           <td className="px-8 py-4 text-slate-700 max-w-xs truncate" title={tx.description}>{tx.description || '-'}</td>
                           <td className="px-8 py-4 text-slate-600 font-medium uppercase tracking-tight">{tx.partner_name || '-'}</td>
                           <td className="px-8 py-4 text-slate-500 font-medium">{tx.prepared_by || 'System'}</td>
                           <td className="px-8 py-4 text-right text-slate-600 font-mono">{tx.debit > 0 ? formatBDT(tx.debit) : '-'}</td>
                           <td className="px-8 py-4 text-right text-slate-600 font-mono">{tx.credit > 0 ? formatBDT(tx.credit) : '-'}</td>
                           <td className="px-8 py-4 text-right font-black text-slate-900 bg-slate-50/20">{formatBDT(runningBalance)}</td>
                        </tr>
                      );
                   })}
                   {paginatedTransactions.length > 0 && (
                     <tr className="bg-slate-50/80 border-t-2 border-slate-200">
                        <td colSpan={5} className="px-8 py-4 text-right text-[10px] font-black text-slate-400 uppercase tracking-widest">Closing Balance as of {filters.endDate}</td>
                        <td className="px-8 py-4"></td>
                        <td className="px-8 py-4"></td>
                        <td className="px-8 py-4 text-right text-sm font-black text-slate-800">{formatBDT(Math.round(runningBalance * 100) / 100)}</td>
                     </tr>
                   )}
                </tbody>
             </table>
          </div>
          
          <div className="px-4 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
             <Pagination 
                currentPage={currentPage}
                totalPages={totalPages}
                onPageChange={setCurrentPage}
                totalItems={filteredTransactions.length}
                itemsPerPage={itemsPerPage}
             />
             <div className="flex items-center space-x-2">
                 <button 
                onClick={() => handleExport('excel', 'all')} 
                className="px-4 py-2 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg text-xs font-black uppercase tracking-widest hover:bg-emerald-100 hover:border-emerald-300 transition-all flex items-center shadow-sm"
              >
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
                Excel
              </button>
              <button 
                onClick={() => handleExport('pdf', 'all')} 
                className="px-4 py-2 bg-rose-50 text-rose-700 border border-rose-200 rounded-lg text-xs font-black uppercase tracking-widest hover:bg-rose-100 hover:border-rose-300 transition-all flex items-center shadow-sm"
              >
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"/></svg>
                PDF
              </button>
             </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CashLedgerView;
