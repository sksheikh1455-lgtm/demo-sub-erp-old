import React, { useState, useEffect, useMemo } from 'react';
import { reportingService, TrialBalanceEntry, BalanceSheetEntry, StockValuationEntry } from '../services/reportingService';
import {formatBDT, getOpDateBST} from '../constants';
import { 
  FileText, 
  BarChart3, 
  PieChart, 
  Calendar, 
  Download, 
  Filter,
  Package,
  TrendingDown,
  TrendingUp,
  Activity,
  Printer,
  Table as TableIcon,
  ChevronDown,
  ChevronRight,
  Users
} from 'lucide-react';
import { generatePDFReport } from '../services/pdfService';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import html2canvas from 'html2canvas';
import ReceivablePayableSummary from './ReceivablePayableSummary';

interface FinancialReportsProps {
  store: any;
  initialState?: any;
  onStateChange?: (state: any) => void;
}

const FinancialReports: React.FC<FinancialReportsProps> = ({ store, initialState, onStateChange }) => {
  const { activeCompanyIds, companies } = store;
  const [dateRange, setDateRange] = useState(initialState?.dateRange || {
    start: new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0],
    end: getOpDateBST()
  });

  const [activeReport, setActiveReport] = useState<'PL' | 'BS' | 'TB' | 'AR' | 'AP'>(initialState?.activeReport || 'PL');
  const [loading, setLoading] = useState(false);
  
  const [reportData, setReportData] = useState<any[]>([]);
  const [compareData, setCompareData] = useState<any[]>([]);
  const [isComparing, setIsComparing] = useState(false);
  const [compareType, setCompareType] = useState<'previous_period' | 'previous_year' | 'opening_balance'>('previous_period');

  const [datePreset, setDatePreset] = useState<string>('This Year');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<string>('ALL');
  const [hideZeroLines, setHideZeroLines] = useState<boolean>(false);

  const [drillDownAccount, setDrillDownAccount] = useState<any>(null);
  const [drillDownData, setDrillDownData] = useState<any[]>([]);
  const [drillDownLoading, setDrillDownLoading] = useState(false);

  useEffect(() => {
    onStateChange?.({ dateRange, activeReport, isComparing, compareType });
  }, [dateRange, activeReport, isComparing, compareType]);

  const fetchDrillDown = async (account: any) => {
    setDrillDownAccount(account);
    setDrillDownLoading(true);
    try {
      const activeIds = store.activeCompanyIds?.length > 0 ? store.activeCompanyIds : [store.currentCompany?.id].filter(Boolean);
      const isConsolidated = activeIds.length > 1;
      const targetMode = isConsolidated ? null : (activeIds[0] || null);
      
      // If we're in consolidated mode, we search by account_code across all active companies
      // Otherwise we use the specific account_id
      const data = isConsolidated && account.code
        ? await reportingService.getGeneralLedgerByCode(activeIds, account.code, dateRange.start, dateRange.end)
        : await store.getGeneralLedger(targetMode, account.id, dateRange.start, dateRange.end);
        
      setDrillDownData(data);
    } catch (err) {
      console.error('Drill down failed:', err);
    } finally {
      setDrillDownLoading(false);
    }
  };

  const getPreviousPeriod = (start: string, end: string, type: 'previous_period' | 'previous_year' | 'opening_balance') => {
    const s = new Date(start);
    const e = new Date(end);
    
    if (type === 'opening_balance') {
      return { start: '2026-05-29', end: '2026-05-29' };
    } else if (type === 'previous_year') {
      const prevS = new Date(s);
      prevS.setFullYear(s.getFullYear() - 1);
      const prevE = new Date(e);
      prevE.setFullYear(e.getFullYear() - 1);
      return { start: prevS.toISOString().split('T')[0], end: prevE.toISOString().split('T')[0] };
    } else {
      const diff = e.getTime() - s.getTime() + (24 * 60 * 60 * 1000);
      const prevE = new Date(s.getTime() - (24 * 60 * 60 * 1000));
      const prevS = new Date(prevE.getTime() - diff + (24 * 60 * 60 * 1000));
      return { start: prevS.toISOString().split('T')[0], end: prevE.toISOString().split('T')[0] };
    }
  };

  const setPreset = (preset: string) => {
    const today = new Date();
    let start = new Date();
    let end = new Date();

    switch (preset) {
      case 'Today':
        start.setHours(0, 0, 0, 0);
        end.setHours(23, 59, 59, 999);
        break;
      case 'Yesterday':
        start.setDate(today.getDate() - 1);
        start.setHours(0, 0, 0, 0);
        end.setDate(today.getDate() - 1);
        end.setHours(23, 59, 59, 999);
        break;
      case 'This Week':
        const day = today.getDay();
        start.setDate(today.getDate() - day);
        start.setHours(0, 0, 0, 0);
        break;
      case 'Previous Week':
        const prevWeekDay = today.getDay();
        start.setDate(today.getDate() - prevWeekDay - 7);
        start.setHours(0, 0, 0, 0);
        end.setDate(today.getDate() - prevWeekDay - 1);
        end.setHours(23, 59, 59, 999);
        break;
      case 'This Month':
        start = new Date(today.getFullYear(), today.getMonth(), 1);
        break;
      case 'Previous Month':
        start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
        end = new Date(today.getFullYear(), today.getMonth(), 0);
        break;
      case 'This Year':
        start = new Date(today.getFullYear(), 0, 1);
        break;
      case 'All Time':
        start = new Date(2000, 0, 1);
        break;
    }

    setDateRange({
      start: start.toISOString().split('T')[0],
      end: end.toISOString().split('T')[0]
    });
    setDatePreset(preset);
  };

  const exportToExcel = () => {
    const table = document.getElementById('main-report-table');
    if (!table) return;
    
    // Create a clone to modify spacing for excel
    const clone = table.cloneNode(true) as HTMLTableElement;
    const cells = clone.querySelectorAll('td, th');
    cells.forEach(c => {
      const el = c as HTMLElement;
      if (el.classList.contains('pl-6')) el.innerText = '      ' + el.innerText;
      else if (el.classList.contains('pl-8')) el.innerText = '          ' + el.innerText;
    });
    
    const ws = XLSX.utils.table_to_sheet(clone);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Financial Report");
    XLSX.writeFile(wb, `${activeReport}_Report_${dateRange.start}_to_${dateRange.end}.xlsx`);
  };

  const exportToPDF = async () => {
    const table = document.getElementById('main-report-table');
    if (!table) return;
    setLoading(true);
    try {
      const activeIds = store.activeCompanyIds?.length > 0 ? store.activeCompanyIds : [store.currentCompany?.id].filter(Boolean);
      const targetModeName = activeIds.length > 1 ? 'Consolidated' : (store.currentCompany?.name || 'Company');
      
      const titleMap: any = {
        'PL': 'Profit & Loss Statement',
        'BS': 'Balance Sheet',
        'TB': 'Trial Balance',
        'STOCK': 'Inventory Assets Valuation'
      };

      const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
      doc.setFontSize(14);
      doc.text(`${targetModeName} - ${titleMap[activeReport] || 'Financial Report'}`, 14, 15);
      doc.setFontSize(10);
      doc.text(`Period: ${dateRange.start} TO ${dateRange.end}`, 14, 22);

      autoTable(doc, { 
        html: '#main-report-table', 
        startY: 30,
        styles: { fontSize: 7, cellPadding: 2, textColor: [30, 30, 30] },
        headStyles: { fillColor: [240, 240, 240], textColor: [40, 40, 40], fontStyle: 'bold' },
        theme: 'grid',
        didParseCell: function(data) {
          if (data.cell.raw instanceof HTMLElement) {
            const raw = data.cell.raw as HTMLElement;
            // Apply indentation based on classes
            if (raw.classList.contains('pl-6')) {
              data.cell.styles.cellPadding = { top: 2, right: 2, bottom: 2, left: 10 };
            }
            if (raw.classList.contains('pl-8')) {
              data.cell.styles.cellPadding = { top: 2, right: 2, bottom: 2, left: 14 };
            }
            // Apply bold text
            if (raw.classList.contains('font-black') || raw.classList.contains('font-bold') || raw.querySelector('div.font-black') || raw.querySelector('div.font-bold') || raw.querySelector('button.font-bold')) {
              data.cell.styles.fontStyle = 'bold';
            }
            // Apply bg colors for subtotals
            if (raw.parentElement?.classList.contains('bg-gray-50') || raw.parentElement?.classList.contains('bg-slate-50')) {
              data.cell.styles.fillColor = [250, 250, 250];
              data.cell.styles.fontStyle = 'bold';
            }
            if (raw.parentElement?.classList.contains('bg-blue-50') || raw.parentElement?.classList.contains('bg-indigo-50')) {
              data.cell.styles.fillColor = [238, 242, 255];
              data.cell.styles.fontStyle = 'bold';
            }
          }
        }
      });

      doc.save(`${activeReport}_Report_${dateRange.start}_to_${dateRange.end}.pdf`);
    } catch (err) {
      console.error('PDF generation failed:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchReport = async () => {
    setLoading(true);
    try {
      const activeIds = store.activeCompanyIds?.length > 0 ? store.activeCompanyIds : [store.currentCompany?.id].filter(Boolean);
      const targetMode = activeIds.length > 1 ? null : (activeIds[0] || null);
      
      let data: any[] = [];
      let comparisonData: any[] = [];

      if (activeReport === 'PL') {
        data = await reportingService.getProfitAndLoss(activeIds, dateRange.start, dateRange.end);
        if (isComparing) {
          const prevRange = getPreviousPeriod(dateRange.start, dateRange.end, compareType);
          comparisonData = await reportingService.getProfitAndLoss(activeIds, prevRange.start, prevRange.end);
        }
      } else if (activeReport === 'BS') {
        data = await reportingService.getBalanceSheet(activeIds, dateRange.end);
        if (isComparing) {
          const prevRange = getPreviousPeriod(dateRange.start, dateRange.end, compareType);
          comparisonData = await reportingService.getBalanceSheet(activeIds, prevRange.end);
        }
      } else if (activeReport === 'TB') {
        data = await reportingService.getTrialBalance(activeIds, dateRange.start, dateRange.end);
      } else if (activeReport === 'STOCK') {
        data = await reportingService.getStockValuation(targetMode);
      }
      
      if (activeIds.length > 0) {
        setReportData((data || []).filter((d: any) => activeReport === 'TB' || activeIds.includes(d.branch_id || d.company_id)));
        setCompareData((comparisonData || []).filter((d: any) => activeReport === 'TB' || activeIds.includes(d.branch_id || d.company_id)));
      } else {
        setReportData([]);
        setCompareData([]);
      }
    } catch (err) {
      console.error('Failed to fetch report:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReport();
  }, [activeReport, store.activeCompanyIds, store.currentCompany?.id, dateRange.start, dateRange.end, isComparing, compareType]); 

  const { isRowCogs, isRowOtherRevenue, isRowRevenue, isRowExpense } = useMemo(() => {
    const checkCogs = (r: any) => {
      const type = (r.account_type || r.type || r.category || '').toUpperCase();
      const subType = (r.account_subtype || r.subType || '').toUpperCase();
      const code = r.account_code || r.code || '';
      const name = (r.account_name || r.name || '').toLowerCase();
      
      // COGS should be strictly related to direct costs of goods
      return subType === 'COGS' || 
             ['COST_OF_SALES', 'COST_OF_REVENUE', 'COGS'].includes(type) ||
             code === '500101' || code === '500100' ||
             name === 'cost of goods sold' || name === 'cogs' ||
             (name.startsWith('cost of') && !name.includes('operating') && !name.includes('expense'));
    };

    const checkOtherRevenue = (r: any) => {
      const type = (r.account_type || r.type || r.category || '').toUpperCase();
      const code = r.account_code || r.code || '';
      return code.startsWith('4004') || ['OTHER_INCOME', 'OTHER_REVENUE'].includes(type);
    };

    const checkRevenue = (r: any) => {
      const type = (r.account_type || r.type || r.category || '').toUpperCase();
      const code = r.account_code || r.code || '';
      return !checkCogs(r) && !checkOtherRevenue(r) && 
             (code.startsWith('4') || ['INCOME', 'REVENUE', 'SALES', 'OPERATING_REVENUE'].includes(type));
    };

    const checkExpense = (r: any) => {
      const type = (r.account_type || r.type || r.category || '').toUpperCase();
      const code = r.account_code || r.code || '';
      
      // Expenses are generally 5 (if not COGS), 6, 7 series or explicit types
      return !checkCogs(r) && !checkOtherRevenue(r) && !checkRevenue(r) && 
             (code.startsWith('5') || code.startsWith('6') || code.startsWith('7') || 
              ['EXPENSE', 'OTHER_EXPENSE', 'OPERATING_EXPENSE', 'OPERATING_EXPENSES', 'ADMINISTRATIVE_EXPENSE'].includes(type));
    };

    return { 
      isRowCogs: checkCogs, 
      isRowOtherRevenue: checkOtherRevenue, 
      isRowRevenue: checkRevenue, 
      isRowExpense: checkExpense 
    };
  }, []);

  const plSummary = useMemo(() => {
    const getNormalBalanceForCard = (d: any) => {
        return (d.amount ?? d.balance ?? 0);
    };

    const income = reportData.filter(isRowRevenue).reduce((s, d) => s + getNormalBalanceForCard(d), 0);
    const otherIncome = reportData.filter(isRowOtherRevenue).reduce((s, d) => s + getNormalBalanceForCard(d), 0);
    const cogs = reportData.filter(isRowCogs).reduce((s, d) => s + getNormalBalanceForCard(d), 0);
    const grossProfit = income - cogs; // Corrected: Other Income is separate
    const opExpenses = reportData.filter(isRowExpense).reduce((s, d) => s + getNormalBalanceForCard(d), 0);
    
    const prevIncome = compareData.filter(isRowRevenue).reduce((s, d) => s + getNormalBalanceForCard(d), 0);
    const prevOtherIncome = compareData.filter(isRowOtherRevenue).reduce((s, d) => s + getNormalBalanceForCard(d), 0);
    const prevCogs = compareData.filter(isRowCogs).reduce((s, d) => s + getNormalBalanceForCard(d), 0);
    const prevGrossProfit = prevIncome - prevCogs;
    const prevOpExpenses = compareData.filter(isRowExpense).reduce((s, d) => s + getNormalBalanceForCard(d), 0);

    return { 
      income, 
      cogs,
      grossProfit,
      otherIncome,
      expense: opExpenses, 
      net: grossProfit + otherIncome - opExpenses,
      prevIncome,
      prevCogs,
      prevGrossProfit,
      prevOtherIncome,
      prevExpense: prevOpExpenses,
      prevNet: prevGrossProfit + prevOtherIncome - prevOpExpenses
    };
  }, [reportData, compareData, activeReport, isRowRevenue, isRowOtherRevenue, isRowCogs, isRowExpense]);

  const aggregated = useMemo(() => {
    if (loading || reportData.length === 0) return { rows: [], columns: [] };
    const activeIds = store.activeCompanyIds?.length > 0 ? store.activeCompanyIds : [store.currentCompany?.id].filter(Boolean);
    const currentCompanies = companies?.filter((c: any) => activeIds.includes(c.id)) || [];
    
    // PIVOT LOGIC
    const rows: Record<string, any> = {};
    
    const processItem = (item: any, isPrevious: boolean) => {
      // Group by Account Code for consolidated reports to merge same accounts across companies
      const id = activeReport === 'STOCK' 
        ? item.product_id 
        : (item.account_code && activeIds.length > 1) 
          ? `CODE-${item.account_code}` 
          : item.account_id;

      if (!rows[id]) {
        rows[id] = { 
          id,
          name: activeReport === 'STOCK' ? item.product_name : item.account_name,
          code: activeReport === 'STOCK' ? item.sku : item.account_code,
          type: (item.account_type || item.category || '').toUpperCase(),
          subType: (item.account_subtype || item.data?.subType || '').toUpperCase(),
          section: item.section, // NEW FROM RPC
          accountGroup: item.account_group, // NEW FROM RPC
          branches: {},
          prevBranches: {}
        };
      }
      
      let rawValue = 0;
      if (activeReport === 'PL') rawValue = item.amount ?? item.balance ?? 0;
      else if (activeReport === 'BS') rawValue = item.balance;
      else if (activeReport === 'TB') rawValue = item.closing_balance ?? item.balance ?? 0;
      else if (activeReport === 'STOCK') rawValue = item.total_value;

      const value = Number(rawValue) || 0;

      const branchId = item.branch_id || item.company_id;
      if (isPrevious) {
        rows[id].prevBranches[branchId] = (rows[id].prevBranches[branchId] || 0) + value;
      } else {
        rows[id].branches[branchId] = (rows[id].branches[branchId] || 0) + value;
      }
    };

    reportData.forEach(item => processItem(item, false));
    compareData.forEach(item => processItem(item, true));

    let resultRows = Object.values(rows);
    
    // Advanced Filtering
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      resultRows = resultRows.filter(r => 
        r.name.toLowerCase().includes(q) || 
        r.code?.toLowerCase().includes(q)
      );
    }

    if (filterType !== 'ALL') {
      resultRows = resultRows.filter(r => r.type === filterType);
    }

    if (hideZeroLines) {
      resultRows = resultRows.filter(r => {
         const hasCurrent = Object.values(r.branches).some((v: any) => v !== 0);
         const hasPrev = isComparing ? Object.values(r.prevBranches).some((v: any) => v !== 0) : false;
         return hasCurrent || hasPrev;
      });
    }

    // Sort to maintain logical report order
    const getTypeWeight = (t: string) => {
       if (t === 'ASSET') return 1;
       if (t === 'LIABILITY') return 2;
       if (t === 'EQUITY') return 3;
       if (t === 'REVENUE' || t === 'INCOME') return 4;
       if (t === 'COGS' || t === 'COST_OF_SALES') return 5;
       if (t === 'EXPENSE' || t === 'OPERATING_EXPENSE') return 6;
       return 99;
    };
    resultRows.sort((a, b) => {
       const wA = getTypeWeight(a.type);
       const wB = getTypeWeight(b.type);
       if (wA !== wB) return wA - wB;
       return (a.code || '').localeCompare(b.code || '');
    });

    return { rows: resultRows, columns: currentCompanies };
  }, [reportData, compareData, activeReport, store.activeCompanyIds, store.currentCompany?.id, companies, searchQuery, filterType, hideZeroLines, isComparing]);

  const reportTable = useMemo(() => {
    if (loading || reportData.length === 0) return null;

    if (activeReport === 'PL') {

      const revenueRows = aggregated.rows.filter(isRowRevenue);
      const cogsRows = aggregated.rows.filter(isRowCogs);
      const otherRevenueRows = aggregated.rows.filter(isRowOtherRevenue);
      const expenseRows = aggregated.rows.filter(isRowExpense);

      const getNormalBalance = (r: any, value: number) => {
         return value; 
      };

      const calcGroupTotal = (rows: any[], colId: string, isPrev = false) => 
        rows.reduce((sum, r) => sum + getNormalBalance(r, (isPrev ? r.prevBranches : r.branches)[colId] || 0), 0);
      
      const calcConsolidatedTotal = (rows: any[], isPrev = false) => 
        rows.reduce((sum, r) => sum + Object.values(isPrev ? r.prevBranches : r.branches).reduce((s: any, v: any) => s + getNormalBalance(r, v), 0), 0);

      const renderRow = (row: any, idx: number, isSubtotal = false, titleOverride?: string) => {
        const rowConsolidated = isSubtotal ? calcConsolidatedTotal(row) : Object.values(row.branches).reduce((s: any, v: any) => s + getNormalBalance(row, v), 0);
        const prevConsolidated = isSubtotal ? calcConsolidatedTotal(row, true) : Object.values(row.prevBranches).reduce((s: any, v: any) => s + getNormalBalance(row, v), 0);
        
        // Dont render line items with 0 balance unless user really wants, but we keep 0s for missing accounts mostly.
        // Wait, the prompt says "Show all accounts even if value = 0 (optional toggle: hide zero lines)"
        // Since we don't have a toggle yet, we'll just show them.
        
        return (
          <tr key={isSubtotal ? `sub-${titleOverride}-${idx}` : `row-${row.id || idx}-${idx}`} className={`${isSubtotal ? 'bg-gray-50 border-t border-b border-gray-200' : 'hover:bg-blue-50/20 group transition-all text-gray-700'}`}>
            <td className={`px-4 py-2 sticky left-0 z-10 border-r border-gray-100 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)] ${isSubtotal ? 'bg-gray-50 font-bold text-gray-900 border-b border-gray-200' : 'bg-white group-hover:bg-blue-50/10'}`}>
              {isSubtotal ? (
                <div className="text-[10px] uppercase tracking-wider font-black">{titleOverride || row.name}</div>
              ) : (
                <button 
                  onClick={() => fetchDrillDown({ ...row, id: row.id })}
                  className="font-bold text-blue-600 hover:text-blue-800 text-[11px] truncate pl-2 text-left hover:underline transition-all"
                >
                  {row.name}
                </button>
              )}
              {!isSubtotal && (
                <div className="text-[8px] text-gray-400 font-mono flex items-center gap-1.5 pl-2 mt-0.5 opacity-60">
                  {row.code}
                  {row.type && <span className="bg-gray-100 px-1 rounded uppercase text-[7px]">{row.type}</span>}
                </div>
              )}
            </td>
            {aggregated.columns.map(c => {
               const val = isSubtotal ? calcGroupTotal(row, c.id) : getNormalBalance(row, row.branches[c.id] || 0);
               const pVal = isSubtotal ? calcGroupTotal(row, c.id, true) : getNormalBalance(row, row.prevBranches[c.id] || 0);
               
               return (
                <React.Fragment key={c.id}>
                  <td className={`px-4 py-2 text-right font-mono text-[11px] border-r border-gray-100 ${isSubtotal ? 'font-bold text-gray-900 bg-gray-50/30' : 'text-gray-600'}`}>
                    {val !== 0 ? formatBDT(val) : <span className="text-gray-200">-</span>}
                  </td>
                  {isComparing && (
                    <td className="px-4 py-2 text-right font-mono text-[10px] border-r border-gray-100 bg-gray-50/20 text-gray-400 italic">
                      {pVal !== 0 ? formatBDT(pVal) : '-'}
                    </td>
                  )}
                </React.Fragment>
               );
            })}
            <td className={`px-4 py-2 text-right font-mono font-bold sticky right-0 z-10 shadow-[-2px_0_5px_-2px_rgba(0,0,0,0.1)] ${isSubtotal ? 'bg-blue-50/20 text-gray-900' : 'bg-blue-50/5 group-hover:bg-blue-50/20 text-gray-800'}`}>
              <div className="text-[11px]">{formatBDT(rowConsolidated as number)}</div>
              {isComparing && (
                <div className={`text-[9px] flex items-center justify-end gap-1 font-bold ${rowConsolidated >= prevConsolidated ? 'text-green-600' : 'text-red-600'}`}>
                  {rowConsolidated >= prevConsolidated ? <TrendingUp className="w-2 h-2" /> : <TrendingDown className="w-2 h-2" />}
                  {prevConsolidated ? (((rowConsolidated as number - (prevConsolidated as number)) / Math.abs(prevConsolidated as number)) * 100).toFixed(1) : '100'}%
                </div>
              )}
            </td>
          </tr>
        );
      };

      const renderSection = (title: string, rows: any[]) => {
        if (rows.length === 0) return null;
        return (
          <>
            <tr className="bg-gray-100/30">
              <td colSpan={aggregated.columns.length * (isComparing ? 2 : 1) + 2} className="px-4 py-1.5 sticky left-0 z-10 font-black text-[9px] text-blue-900/60 uppercase tracking-[0.2em] bg-gray-50/80 border-b border-gray-200 flex items-center gap-2">
                <ChevronRight className="w-3 h-3" />
                {title}
              </td>
            </tr>
            {rows.map((row, idx) => renderRow(row, idx))}
            {renderRow(rows, rows.length, true, `Subtotal ${title}`)}
          </>
        );
      };

      const renderDerivedRow = (title: string, getColVal: (colId: string, isPrev?: boolean) => number, getConsolidatedVal: (isPrev?: boolean) => number, isFinal = false, isPercentage = false) => {
        const consolidatedVal = getConsolidatedVal();
        const prevConsolidatedVal = getConsolidatedVal(true);
        
        return (
          <tr className={isFinal ? 'bg-gray-900 border-t-2 border-black text-white' : 'bg-gray-100 border-t border-gray-300 text-gray-900 shadow-sm'}>
            <td className={`px-4 py-2.5 sticky left-0 z-10 font-black text-[11px] border-r ${isFinal ? 'bg-gray-900 border-gray-800' : 'bg-gray-100 border-gray-200'}`}>
              <div className="flex items-center gap-2">
                {isFinal ? <Activity className="w-3.5 h-3.5 text-blue-400" /> : <TableIcon className="w-3.5 h-3.5 text-gray-400" />}
                {title}
              </div>
            </td>
            {aggregated.columns.map(c => {
              const val = getColVal(c.id);
              const pVal = getColVal(c.id, true);
              return (
                <React.Fragment key={c.id}>
                  <td className={`px-4 py-2.5 text-right font-mono font-bold text-[11px] border-r ${isFinal ? 'border-gray-800 text-blue-400' : 'border-gray-200'}`}>
                    {isPercentage ? `${val.toFixed(2)}%` : formatBDT(val)}
                  </td>
                  {isComparing && (
                    <td className={`px-4 py-2.5 text-right font-mono text-[10px] border-r opacity-50 italic ${isFinal ? 'bg-gray-800' : 'bg-gray-300/30'}`}>
                      {isPercentage ? `${pVal.toFixed(2)}%` : formatBDT(pVal)}
                    </td>
                  )}
                </React.Fragment>
              );
            })}
            <td className={`px-4 py-2.5 text-right font-mono font-black text-[11px] sticky right-0 z-10 ${isFinal ? 'bg-black text-white shadow-[-5px_0_15px_rgba(0,0,0,0.3)]' : 'bg-gray-200 text-gray-900 border-l border-gray-400 shadow-[-2px_0_5px_rgba(0,0,0,0.05)]'}`}>
              <div>{isPercentage ? `${consolidatedVal.toFixed(2)}%` : formatBDT(consolidatedVal)}</div>
              {isComparing && !isPercentage && (
                <div className={`text-[8px] font-black tracking-tighter ${consolidatedVal >= prevConsolidatedVal ? 'text-green-400' : 'text-red-400'}`}>
                  {consolidatedVal >= prevConsolidatedVal ? 'GROWTH ' : 'LOSS '}
                  {prevConsolidatedVal ? (Math.abs((consolidatedVal - prevConsolidatedVal) / prevConsolidatedVal) * 100).toFixed(1) : '0'}%
                </div>
              )}
            </td>
          </tr>
        );
      };

      const getOrdNetIncomeCol = (colId: string, isPrev = false) => {
        const rev = calcGroupTotal(revenueRows, colId, isPrev);
        const cogs = calcGroupTotal(cogsRows, colId, isPrev);
        const other = calcGroupTotal(otherRevenueRows, colId, isPrev);
        const exp = calcGroupTotal(expenseRows, colId, isPrev);
        return (rev - cogs) + other - exp;
      };

      const getOrdNetIncomeConsolidated = (isPrev = false) => {
        const rev = calcConsolidatedTotal(revenueRows, isPrev);
        const cogs = calcConsolidatedTotal(cogsRows, isPrev);
        const other = calcConsolidatedTotal(otherRevenueRows, isPrev);
        const exp = calcConsolidatedTotal(expenseRows, isPrev);
        return (rev - cogs) + other - exp;
      };

      return (
        <table id="main-report-table" className="w-full text-left border-collapse table-fixed min-w-[1000px]">
          <thead className="bg-gray-200/80 backdrop-blur-sm sticky top-0 z-30 border-b border-gray-300">
            <tr>
              <th className="px-4 py-4 text-[10px] font-bold text-gray-600 uppercase w-64 sticky left-0 bg-gray-200 z-40 border-r border-gray-300 shadow-sm">
                Profit & Loss Report
              </th>
              {aggregated.columns.map(c => (
                <th key={c.id} colSpan={isComparing ? 2 : 1} className="px-4 py-4 text-[9px] font-black text-gray-500 uppercase text-center border-r border-gray-300 bg-white/30 truncate">
                  {c.name}
                  {isComparing && (
                    <div className="flex justify-around text-[7px] mt-1 text-gray-400">
                      <span>CURRENT</span>
                      <span>PREVIOUS</span>
                    </div>
                  )}
                </th>
              ))}
              <th className="px-4 py-4 text-[10px] font-black text-blue-800 uppercase text-right bg-blue-100/80 sticky right-0 z-30 shadow-[-2px_0_5px_rgba(0,0,0,0.05)] border-l border-blue-200">
                Consolidated
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {renderSection('Sales Revenue', revenueRows)}
            {renderSection('Cost of Goods Sold', cogsRows)}
            {renderDerivedRow('GROSS PROFIT', 
              (colId, isPrev) => calcGroupTotal(revenueRows, colId, isPrev) - calcGroupTotal(cogsRows, colId, isPrev),
              (isPrev) => calcConsolidatedTotal(revenueRows, isPrev) - calcConsolidatedTotal(cogsRows, isPrev)
            )}
            {renderSection('Operating Expenses', expenseRows)}
            {renderSection('Other Income', otherRevenueRows)}
            {renderDerivedRow('NET PROFIT/LOSS', (c, p) => getOrdNetIncomeCol(c, p), (p) => getOrdNetIncomeConsolidated(p), true)}
            {renderDerivedRow('Net Margin %', 
              (colId, isPrev) => {
                const sales = calcGroupTotal(revenueRows, colId, isPrev);
                const net = getOrdNetIncomeCol(colId, isPrev);
                return sales ? (net / sales) * 100 : 0;
              },
              (isPrev) => {
                const sales = calcConsolidatedTotal(revenueRows, isPrev);
                const net = getOrdNetIncomeConsolidated(isPrev);
                return sales ? (net / sales) * 100 : 0;
              },
              false,
              true
            )}
          </tbody>
        </table>
      );
    } else if (activeReport === 'BS') {
      const calcGroupTotal = (rows: any[], colId: string, isPrev = false) => 
        rows.reduce((sum, r) => sum + ((isPrev ? r.prevBranches : r.branches)[colId] || 0), 0);
      
      const calcConsolidatedTotal = (rows: any[], isPrev = false) => 
        rows.reduce((sum, r) => sum + Object.values(isPrev ? r.prevBranches : r.branches).reduce((s: any, v: any) => s + v, 0), 0);

      const renderRow = (row: any, isSubtotal = false, titleOverride?: string) => {
        const rowConsolidated = isSubtotal ? calcConsolidatedTotal([row]) : Object.values(row.branches).reduce((s: any, v: any) => s + v, 0);
        const prevConsolidated = isSubtotal ? calcConsolidatedTotal([row], true) : Object.values(row.prevBranches).reduce((s: any, v: any) => s + v, 0);
        return (
          <tr key={`bs-${isSubtotal ? 'sub' : 'row'}-${row.id || titleOverride}`} className={`${isSubtotal ? 'bg-blue-50/10 border-t border-b border-blue-100' : 'hover:bg-gray-50/50 group transition-colors'}`}>
            <td className={`px-5 py-2.5 sticky left-0 z-10 border-r border-gray-100 ${isSubtotal ? 'bg-blue-50/30 font-black text-gray-900 border-b border-blue-100 uppercase tracking-wider text-[10px]' : 'bg-white group-hover:bg-gray-50/80 font-medium text-gray-700 text-xs'}`}>
              <div className="flex items-center gap-2">
                {!isSubtotal && <div className="w-1 h-1 bg-gray-300 rounded-full" />}
                {isSubtotal ? (
                  titleOverride
                ) : (
                  <button 
                    onClick={() => fetchDrillDown({ ...row, id: row.id })}
                    className="font-bold text-blue-600 hover:text-blue-800 text-[11px] truncate text-left hover:underline transition-all"
                  >
                    {row.name}
                  </button>
                )}
              </div>
              {!isSubtotal && (
                <div className="text-[9px] text-gray-400 font-mono ml-3 opacity-70 mt-0.5">
                  {row.code}
                </div>
              )}
            </td>
            {aggregated.columns.map(c => {
               const val = isSubtotal ? row.branches[c.id] || 0 : row.branches[c.id] || 0;
               const pVal = isSubtotal ? row.prevBranches[c.id] || 0 : row.prevBranches[c.id] || 0;
               return (
                <React.Fragment key={c.id}>
                  <td className={`px-4 py-2.5 text-right font-mono text-[11px] border-r border-gray-100 ${isSubtotal ? 'font-black text-gray-900 bg-blue-50/10' : 'text-gray-600'}`}>
                    {val !== 0 ? formatBDT(val) : <span className="text-gray-300">-</span>}
                  </td>
                  {isComparing && (
                    <td className="px-4 py-2.5 text-right font-mono text-[10px] border-r border-gray-100 bg-gray-50/30 text-gray-400 italic">
                      {pVal !== 0 ? formatBDT(pVal) : '-'}
                    </td>
                  )}
                </React.Fragment>
               );
            })}
            <td className={`px-4 py-2.5 text-right font-mono sticky right-0 z-10 ${isSubtotal ? 'bg-blue-100/50 text-blue-950 font-black' : 'bg-gray-50 group-hover:bg-gray-100 text-gray-800 font-bold'}`}>
              <div className="text-[11px]">{formatBDT(rowConsolidated as number)}</div>
              {isComparing && (
                 <div className={`text-[9px] flex items-center justify-end gap-1 font-bold ${rowConsolidated >= prevConsolidated ? 'text-green-600' : 'text-red-600'}`}>
                   {rowConsolidated >= prevConsolidated ? '▲' : '▼'}
                   {prevConsolidated ? Math.abs(((rowConsolidated - prevConsolidated) / prevConsolidated) * 100).toFixed(1) : '0'}%
                 </div>
              )}
            </td>
          </tr>
        );
      };

      const renderGroup = (groupTitle: string, groupRows: any[]) => {
        if (groupRows.length === 0) return null;
        
        // Compute group subtotal row dynamically
        const subtotalRow = {
          id: `subtotal-${groupTitle}`,
          branches: {},
          prevBranches: {}
        };
        aggregated.columns.forEach(c => {
          subtotalRow.branches[c.id] = calcGroupTotal(groupRows, c.id);
          subtotalRow.prevBranches[c.id] = calcGroupTotal(groupRows, c.id, true);
        });

        return (
          <React.Fragment key={groupTitle}>
            <tr>
              <td colSpan={aggregated.columns.length * (isComparing ? 2 : 1) + 2} className="px-5 py-3 font-black text-[11px] text-gray-800 uppercase tracking-widest bg-gray-50/50 border-y border-gray-100">
                {groupTitle}
              </td>
            </tr>
            {groupRows.map((r, i) => renderRow(r, false))}
            {renderRow(subtotalRow, true, `Total ${groupTitle}`)}
          </React.Fragment>
        );
      };

      const renderSectionGroup = (sectionTitle: string, groups: {title: string, key: string}[]) => {
        const sectionRows = aggregated.rows.filter(r => r.section === sectionTitle);
        if (sectionRows.length === 0) return null;

        const sectionTotalRow = {
          id: `sectionTotal-${sectionTitle}`,
          branches: {},
          prevBranches: {}
        };
        aggregated.columns.forEach(c => {
          sectionTotalRow.branches[c.id] = calcGroupTotal(sectionRows, c.id);
          sectionTotalRow.prevBranches[c.id] = calcGroupTotal(sectionRows, c.id, true);
        });

        return (
          <React.Fragment key={sectionTitle}>
            <tr>
              <td colSpan={aggregated.columns.length * (isComparing ? 2 : 1) + 2} className="px-5 py-4 font-black text-xs text-blue-900 uppercase tracking-[0.2em] bg-blue-50/50 border-y border-blue-200">
                {sectionTitle}
              </td>
            </tr>
            {groups.map(g => renderGroup(g.title, sectionRows.filter(r => r.accountGroup === g.key)))}
            {/* Render any non-categorized items into 'Other' group */}
            {renderGroup('Other ' + sectionTitle, sectionRows.filter(r => !groups.map(g=>g.key).includes(r.accountGroup)))}
            
            {/* SECTION GRAND TOTAL */}
            <tr>
              <td className="px-5 py-4 sticky left-0 z-10 bg-blue-900 text-white font-black uppercase tracking-widest text-[11px] border-y border-blue-800 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.2)]">
                Total {sectionTitle}
              </td>
              {aggregated.columns.map(c => {
                 const tVal = sectionTotalRow.branches[c.id] || 0;
                 return (
                  <React.Fragment key={c.id}>
                    <td className="px-4 py-4 text-right font-mono font-black text-[12px] bg-blue-800 text-white border-y border-blue-900 border-r border-blue-700/50">
                      {tVal !== 0 ? formatBDT(tVal) : '-'}
                    </td>
                    {isComparing && (
                      <td className="px-4 py-4 text-right font-mono font-bold text-[10px] bg-blue-900 max-w-0 opacity-0 overflow-hidden" style={{display:'none'}} />
                    )}
                  </React.Fragment>
                 );
              })}
              <td className="px-4 py-4 text-right font-mono font-black text-[13px] bg-blue-950 text-emerald-400 sticky right-0 z-10 border-y border-blue-900 shadow-[-2px_0_5px_-2px_rgba(0,0,0,0.3)]">
                {formatBDT(calcConsolidatedTotal([sectionTotalRow]) as number)}
              </td>
            </tr>
          </React.Fragment>
        );
      };

      return (
        <table id="main-report-table" className="w-full text-left border-collapse table-fixed min-w-[1000px]">
          <thead className="bg-gray-100/90 backdrop-blur-sm sticky top-0 z-30 border-b border-gray-300">
            <tr>
              <th className="px-5 py-4 text-[10px] font-black text-gray-600 uppercase tracking-widest w-72 sticky left-0 bg-gray-100 z-40 border-r border-gray-200">
                Balance Sheet
              </th>
              {aggregated.columns.map(c => (
                <th key={c.id} colSpan={isComparing ? 2 : 1} className="px-4 py-4 text-[9px] font-black text-gray-600 uppercase text-center border-r border-gray-200 bg-white/50 truncate">
                  {c.name}
                  {isComparing && (
                    <div className="flex justify-around text-[7px] mt-1 text-gray-400 font-bold">
                      <span>CURRENT</span>
                      <span>PREVIOUS</span>
                    </div>
                  )}
                </th>
              ))}
              <th className="px-4 py-4 text-[10px] font-black text-blue-900 uppercase text-right bg-blue-50/90 sticky right-0 z-30 shadow-[-2px_0_5px_rgba(0,0,0,0.05)] border-l border-blue-100">
                Consolidated
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {renderSectionGroup('ASSETS', [
              { title: 'Current Assets', key: 'Current Assets' },
              { title: 'Non-Current Assets', key: 'Non-Current Assets' }
            ])}
            {renderSectionGroup('LIABILITIES & EQUITY', [
              { title: 'Current Liabilities', key: 'Current Liabilities' },
              { title: 'Long-Term Liabilities', key: 'Long-Term Liabilities' },
              { title: 'Equity', key: 'Equity' }
            ])}
          </tbody>
        </table>
      );
    } else if (activeReport === 'TB') {
      const grandTotalDebit = reportData.reduce((sum, r) => sum + (Number(r.debit_balance) || 0), 0);
      const grandTotalCredit = reportData.reduce((sum, r) => sum + (Number(r.credit_balance) || 0), 0);

      return (
        <table id="main-report-table" className="w-full text-left border-collapse min-w-[800px]">
          <thead className="bg-gray-100/90 backdrop-blur-sm sticky top-0 z-30 border-b border-gray-300">
            <tr>
              <th className="px-5 py-4 text-[10px] font-black text-gray-600 uppercase tracking-widest w-32 left-0 bg-gray-100 z-40 border-r border-gray-200">
                Code
              </th>
              <th className="px-5 py-4 text-[10px] font-black text-gray-600 uppercase tracking-widest bg-gray-100 z-40 border-r border-gray-200">
                Account Name
              </th>
              <th className="px-5 py-4 text-[10px] font-black text-gray-600 uppercase tracking-widest w-40 bg-gray-100 z-40 text-right border-r border-gray-200">
                Debit
              </th>
              <th className="px-5 py-4 text-[10px] font-black text-gray-600 uppercase tracking-widest w-40 bg-gray-100 z-40 text-right">
                Credit
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {reportData.map((row: any, idx: number) => (
              <tr key={`${row.account_id}-${idx}`} className="hover:bg-gray-50 transition-colors group">
                <td className="px-5 py-3 border-r border-gray-100 font-mono text-gray-500 text-xs text-center">
                  {row.account_code || '-'}
                </td>
                <td className="px-5 py-3 border-r border-gray-100 font-medium text-gray-800 text-xs">
                  <button 
                    onClick={() => fetchDrillDown({ id: row.account_id, name: row.account_name, code: row.account_code })}
                    className="font-bold text-blue-600 hover:text-blue-800 text-[11px] truncate text-left hover:underline transition-all"
                  >
                    {row.account_name}
                  </button>
                </td>
                <td className="px-4 py-3 text-right font-mono text-gray-700 text-[11px] border-r border-gray-100">
                  {Number(row.debit_balance) > 0 ? formatBDT(Number(row.debit_balance)) : <span className="text-gray-300">-</span>}
                </td>
                <td className="px-4 py-3 text-right font-mono text-gray-700 text-[11px]">
                  {Number(row.credit_balance) > 0 ? formatBDT(Number(row.credit_balance)) : <span className="text-gray-300">-</span>}
                </td>
              </tr>
            ))}
            {/* Grand Totals */}
            <tr>
              <td colSpan={2} className="px-5 py-4 sticky left-0 z-10 bg-gray-800 text-white font-black uppercase tracking-widest text-[12px] text-right border-y border-gray-700 shadow-sm">
                Grand Total (Trial Balance)
              </td>
              <td className="px-4 py-4 text-right font-mono font-black text-[13px] bg-gray-800 text-white border-y border-gray-700 border-r border-gray-700/50">
                {formatBDT(grandTotalDebit)}
              </td>
              <td className="px-4 py-4 text-right font-mono font-black text-[13px] bg-gray-800 text-white border-y border-gray-700">
                {formatBDT(grandTotalCredit)}
              </td>
            </tr>
          </tbody>
        </table>
      );
    }

    return (
      <table id="main-report-table" className="w-full text-left border-collapse table-fixed min-w-[800px]">
        <thead className="bg-gray-100 border-b border-gray-200">
          <tr>
            <th className="px-6 py-4 text-xs font-bold text-gray-600 uppercase w-64 sticky left-0 bg-gray-100 z-20 border-r border-gray-200 shadow-sm">
              Account / Description
            </th>
            {aggregated.columns.map(c => (
              <th key={c.id} className="px-6 py-4 text-[10px] font-black text-gray-500 uppercase text-right border-r border-gray-200 bg-white/50 truncate">
                {c.name}
              </th>
            ))}
            <th className="px-6 py-4 text-xs font-black text-blue-700 uppercase text-right bg-blue-50/80 sticky right-0 z-10 shadow-[-2px_0_5px_rgba(0,0,0,0.05)]">
              Consolidated
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {aggregated.rows.map((row, idx) => {
            const consolidatedTotal = Object.values(row.branches).reduce((s: any, v: any) => s + v, 0) as number;
            return (
              <tr key={idx} className="hover:bg-blue-50/20 group transition-all">
                <td className="px-6 py-4 sticky left-0 bg-white group-hover:bg-blue-50/10 z-10 border-r border-gray-100 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)]">
                  <div className="font-bold text-gray-800 text-sm truncate">{row.name}</div>
                  <div className="text-[10px] text-gray-400 font-mono flex items-center gap-2">
                    {row.code}
                    {row.type && <span className="bg-gray-100 px-1 rounded opacity-70 uppercase text-[8px]">{row.type}</span>}
                  </div>
                </td>
                {aggregated.columns.map(c => (
                  <td key={c.id} className="px-6 py-4 text-right font-mono text-xs text-gray-600 border-r border-gray-100">
                    {row.branches[c.id] ? formatBDT(row.branches[c.id]) : <span className="text-gray-300">-</span>}
                  </td>
                ))}
                <td className={`px-6 py-4 text-right font-mono font-bold bg-blue-50/5 sticky right-0 group-hover:bg-blue-50/20 z-10 shadow-[-2px_0_5px_-2px_rgba(0,0,0,0.1)] ${consolidatedTotal < 0 ? 'text-red-700' : 'text-blue-900'}`}>
                  {formatBDT(consolidatedTotal)}
                </td>
              </tr>
            )
          })}
          {/* TOTAL ROW */}
          <tr className="bg-gray-50 border-t-2 border-gray-200">
            <td className="px-6 py-4 sticky left-0 bg-gray-50 z-10 font-black text-gray-900 border-r border-gray-200">GRAND TOTAL</td>
            {aggregated.columns.map(c => {
               const colTotal = aggregated.rows.reduce((sum, row) => sum + (row.branches[c.id] || 0), 0);
               return (
                <td key={c.id} className="px-6 py-4 text-right font-mono font-black text-gray-900 border-r border-gray-200">
                  {formatBDT(colTotal)}
                </td>
               );
            })}
            <td className="px-6 py-4 text-right font-mono font-black text-blue-800 bg-blue-100 sticky right-0 z-10">
              {formatBDT(aggregated.rows.reduce((sum, row) => sum + Object.values(row.branches).reduce((s: any, v: any) => s+v, 0), 0))}
            </td>
          </tr>
        </tbody>
      </table>
    );
  }, [reportData, loading, activeReport, store.activeCompanyIds, store.currentCompany?.id, companies]);

  return (
    <div className="p-6 space-y-6 bg-gray-50 min-h-screen">
      {/* HEADER SECTION */}
      <div className="flex flex-col xl:flex-row xl:items-start justify-between gap-6">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-600 rounded-xl shadow-lg shadow-blue-200">
               <Activity className="w-6 h-6 text-white" />
            </div>
            <h1 className="text-2xl font-black text-gray-900 tracking-tight">
              Intelligence Reporting
            </h1>
          </div>
          <p className="text-gray-500 font-medium text-xs ml-11">Advanced financial forensics & consolidation</p>
        </div>

        <div className="flex flex-wrap items-center gap-4 bg-white p-4 rounded-2xl border border-gray-200 shadow-sm grow xl:max-w-4xl">
          {/* SEARCH & ALIGNMENT */}
          <div className="flex flex-col gap-1 w-full md:w-48">
            <label className="text-[10px] font-bold text-gray-400 uppercase ml-1">Universal Search</label>
            <div className="relative">
              <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
              <input 
                type="text"
                placeholder="Account or ID..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold focus:ring-2 focus:ring-blue-500 transition-all focus:bg-white"
              />
            </div>
          </div>

          <div className="h-10 w-px bg-gray-100 hidden md:block" />

          {/* HIDE ZERO LINES TOGGLE */}
          <div className="flex flex-col gap-1 w-full md:w-auto">
            <label className="text-[10px] font-bold text-gray-400 uppercase ml-1">Options</label>
            <button
               onClick={() => setHideZeroLines(!hideZeroLines)}
               className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border transition-all text-xs font-bold ${
                 hideZeroLines ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-gray-50 border-gray-200 text-gray-500'
               }`}
            >
               {hideZeroLines ? 'Showing Non-Zero' : 'Showing All'}
            </button>
          </div>

          {/* PERIOD SELECTION */}
          <div className="flex flex-col gap-1 grow">
            <label className="text-[10px] font-bold text-gray-400 uppercase ml-1">Period Selection</label>
            <div className="flex items-center gap-2 bg-gray-50 px-3 py-1.5 rounded-xl border border-gray-100">
              <Calendar className="w-3.5 h-3.5 text-blue-500" />
              <input 
                type="date" 
                value={dateRange.start}
                onChange={(e) => setDateRange(prev => ({ ...prev, start: e.target.value }))}
                className="text-xs font-bold border-none bg-transparent focus:ring-0 p-0 w-24"
              />
              <span className="text-gray-300 text-xs font-black px-1">TO</span>
              <input 
                type="date" 
                value={dateRange.end}
                onChange={(e) => setDateRange(prev => ({ ...prev, end: e.target.value }))}
                className="text-xs font-bold border-none bg-transparent focus:ring-0 p-0 w-24"
              />
            </div>
          </div>

          <div className="h-10 w-px bg-gray-100 hidden md:block" />

          {/* COMPARISON TOGGLE */}
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-bold text-gray-400 uppercase ml-1">Delta Analysis</label>
            <div className="flex items-center gap-2 bg-gray-50 px-2 py-1.5 rounded-xl border border-gray-100">
              <button
                onClick={() => setIsComparing(!isComparing)}
                className={`text-[10px] font-black px-3 py-1 rounded-lg transition-all ${
                  isComparing ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-400 hover:text-gray-600'
                }`}
              >
                COMPARE
              </button>
              {isComparing && (
                <select
                  value={compareType || ""}
                  onChange={(e) => setCompareType(e.target.value as any)}
                  className="bg-transparent border-none text-[10px] font-black focus:ring-0 p-0 text-blue-600 cursor-pointer"
                >
                  <option value="previous_period">PREV PERIOD</option>
                  <option value="previous_year">PREV YEAR</option>
                  <option value="opening_balance">OPENING BALANCE</option>
                </select>
              )}
            </div>
          </div>

          <div className="hidden 2xl:block h-10 w-px bg-gray-100" />

          <button 
            onClick={fetchReport}
            disabled={loading}
            className="ml-auto bg-gray-900 text-white px-6 py-2.5 rounded-xl text-sm font-bold hover:bg-black disabled:bg-gray-300 transition-all flex items-center gap-2 shadow-lg hover:shadow-xl active:scale-95"
          >
            {loading ? <Activity className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            GENERATE
          </button>
          
          <div className="flex gap-2">
            <button 
              onClick={exportToExcel}
              className="p-2.5 bg-green-50 text-green-700 rounded-xl hover:bg-green-100 transition-all border border-green-200"
              title="Export to Excel"
            >
              <TableIcon className="w-4 h-4" />
            </button>
            <button 
              onClick={exportToPDF}
              className="p-2.5 bg-red-50 text-red-700 rounded-xl hover:bg-red-100 transition-all border border-red-200"
              title="Export to PDF"
            >
              <Printer className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* QUICK DATE PRESETS */}
      <div className="flex flex-wrap gap-2 items-center bg-white p-2 rounded-2xl border border-gray-100 shadow-sm overflow-x-auto">
        <div className="px-3 text-[10px] font-black text-gray-400 uppercase tracking-widest border-r border-gray-100 mr-2">Quick Presets</div>
        {['Today', 'Yesterday', 'This Week', 'Previous Week', 'This Month', 'Previous Month', 'This Year', 'All Time'].map(p => (
          <button
            key={p}
            onClick={() => setPreset(p)}
            className={`px-3 py-1.5 rounded-lg text-[10px] font-black transition-all whitespace-nowrap ${
              datePreset === p 
                ? 'bg-blue-600 text-white shadow-md' 
                : 'bg-gray-50 text-gray-500 hover:bg-gray-100'
            }`}
          >
            {p}
          </button>
        ))}
      </div>

      {/* REPORT SELECTOR & COMPANY PILLS */}
      <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
        <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none w-full md:w-auto">
          {[
            { id: 'PL', label: 'Profit & Loss', icon: TrendingUp, color: 'text-green-600' },
            { id: 'BS', label: 'Balance Sheet', icon: PieChart, color: 'text-blue-600' },
            { id: 'TB', label: 'Trial Balance', icon: BarChart3, color: 'text-purple-600' },
            { id: 'AR', label: 'Receivables', icon: Users, color: 'text-emerald-600' },
            { id: 'AP', label: 'Payables', icon: Users, color: 'text-rose-600' }
          ].map((rep) => (
            <button
              key={rep.id}
              onClick={() => setActiveReport(rep.id as any)}
              className={`flex items-center gap-2.5 px-4 py-2.5 rounded-xl border-2 transition-all whitespace-nowrap ${
                activeReport === rep.id 
                  ? 'bg-white border-blue-600 text-blue-700 shadow-lg -translate-y-0.5' 
                  : 'bg-white border-gray-100 text-gray-500 hover:border-gray-300'
              }`}
            >
              <rep.icon className={`w-4 h-4 ${activeReport === rep.id ? rep.color : 'text-gray-400'}`} />
              <span className="font-black text-[11px] uppercase tracking-wider">{rep.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* STATS CARDS */}
      {activeReport === 'PL' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="bg-white p-6 rounded-3xl border border-gray-200 shadow-sm relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:scale-110 transition-all">
              <TrendingUp className="w-12 h-12 text-emerald-600" />
            </div>
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Total Revenue</p>
            <div className="flex items-baseline gap-3">
              <h3 className="text-2xl font-black text-gray-900 tracking-tight">{formatBDT(plSummary.income)}</h3>
              {isComparing && (
                <span className={`text-[11px] font-black ${plSummary.income >= plSummary.prevIncome ? 'text-emerald-600' : 'text-red-600'}`}>
                   {plSummary.income >= plSummary.prevIncome ? '+' : ''}{plSummary.prevIncome ? (((plSummary.income - plSummary.prevIncome) / plSummary.prevIncome) * 100).toFixed(1) : '0'}%
                </span>
              )}
            </div>
          </div>

          <div className="bg-white p-6 rounded-3xl border border-gray-200 shadow-sm relative overflow-hidden group">
             <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:scale-110 transition-all">
              <Package className="w-12 h-12 text-amber-600" />
            </div>
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Cost of Sales</p>
            <div className="flex items-baseline gap-3">
              <h3 className="text-2xl font-black text-gray-900 tracking-tight">{formatBDT(plSummary.cogs)}</h3>
               {isComparing && (
                <span className={`text-[11px] font-black ${plSummary.cogs <= plSummary.prevCogs ? 'text-emerald-600' : 'text-red-600'}`}>
                   {plSummary.cogs <= plSummary.prevCogs ? '▼' : '▲'}
                   {plSummary.prevCogs ? (((plSummary.cogs - plSummary.prevCogs) / plSummary.prevCogs) * 100).toFixed(1) : '0'}%
                </span>
              )}
            </div>
          </div>

          <div className="bg-emerald-50/50 p-6 rounded-3xl border border-emerald-100 shadow-sm relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:scale-110 transition-all text-emerald-300">
              <TrendingUp className="w-12 h-12" />
            </div>
            <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest mb-1">Gross Profit</p>
            <div className="flex items-baseline gap-3">
              <h3 className="text-2xl font-black text-emerald-900 tracking-tight">{formatBDT(plSummary.grossProfit)}</h3>
              {isComparing && (
                <span className={`text-[11px] font-black ${plSummary.grossProfit >= plSummary.prevGrossProfit ? 'text-emerald-600' : 'text-red-600'}`}>
                   {plSummary.grossProfit >= plSummary.prevGrossProfit ? 'UP ' : 'DOWN '}
                   {plSummary.prevGrossProfit ? (Math.abs((plSummary.grossProfit - plSummary.prevGrossProfit) / plSummary.prevGrossProfit) * 100).toFixed(1) : '0'}%
                </span>
              )}
            </div>
          </div>

          <div className="bg-gray-900 p-6 rounded-3xl shadow-xl relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:scale-110 transition-all">
              <Activity className="w-12 h-12 text-blue-400" />
            </div>
            <p className="text-[10px] font-black text-blue-300 uppercase tracking-widest mb-1">Net Profit</p>
            <div className="flex items-baseline gap-3">
              <h3 className={`text-2xl font-black tracking-tight ${plSummary.net >= 0 ? 'text-white' : 'text-orange-400'}`}>
                {formatBDT(plSummary.net)}
              </h3>
              {isComparing && (
                <span className={`text-[11px] font-black ${plSummary.net >= plSummary.prevNet ? 'text-blue-400' : 'text-orange-400'}`}>
                   {plSummary.net >= plSummary.prevNet ? 'UP ' : 'DOWN '}
                   {plSummary.prevNet ? (Math.abs((plSummary.net - plSummary.prevNet) / plSummary.prevNet) * 100).toFixed(1) : '0'}%
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* MAIN DATA SECTION */}
      {activeReport === 'AR' || activeReport === 'AP' ? (
        <ReceivablePayableSummary store={store} mode={activeReport} />
      ) : (
        <div className="bg-white rounded-[32px] border border-gray-200 shadow-2xl overflow-hidden ring-1 ring-black/5">
          <div className="overflow-x-auto scrollbar-thin scrollbar-thumb-gray-200 scrollbar-track-transparent">
            {loading ? (
              <div className="p-32 flex flex-col items-center justify-center space-y-4">
                <div className="w-16 h-16 border-4 border-gray-900 border-t-blue-600 rounded-full animate-spin"></div>
                <div className="text-center">
                  <p className="text-gray-900 font-black text-sm uppercase tracking-widest">Compiling Matrix</p>
                  <p className="text-gray-400 text-[10px] font-bold mt-1 uppercase">Synchronizing multi-period ledgers...</p>
                </div>
              </div>
            ) : (
              <div className="relative">
                {reportTable}
                {reportData.length === 0 && !loading && (
                  <div className="p-20 text-center">
                    <div className="w-16 h-16 bg-gray-50 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-gray-100">
                      <FileText className="w-8 h-8 text-gray-200" />
                    </div>
                    <h3 className="text-gray-900 font-black text-sm">NO DATA FOUND</h3>
                    <p className="text-gray-400 text-xs mt-1">Try adjusting your filters or selecting more companies</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* DRILL DOWN MODAL */}
      {drillDownAccount && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-[32px] shadow-2xl w-full max-w-4xl max-h-[85vh] flex flex-col overflow-hidden border border-white/20">
            <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-gradient-to-r from-gray-50 to-white">
              <div>
                <h2 className="text-xl font-black text-gray-900 tracking-tight flex items-center gap-2">
                  <Activity className="w-5 h-5 text-blue-600" />
                  {drillDownAccount.name}
                </h2>
                <p className="text-gray-400 text-[10px] font-bold uppercase tracking-widest mt-1">
                  Transaction Drill-Down • {drillDownAccount.code} • {dateRange.start} to {dateRange.end}
                </p>
              </div>
              <button 
                onClick={() => setDrillDownAccount(null)}
                className="p-2 hover:bg-gray-100 rounded-full transition-colors"
              >
                <TrendingUp className="w-5 h-5 text-gray-400 rotate-45" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              {drillDownLoading ? (
                <div className="h-64 flex flex-col items-center justify-center space-y-4">
                  <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                  <p className="text-gray-400 text-[10px] font-black uppercase tracking-tighter animate-pulse text-center">Uncovering Ledger History...</p>
                </div>
              ) : (
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b-2 border-gray-100 italic">
                      <th className="pb-3 text-[10px] font-black text-gray-400 uppercase tracking-widest">Date</th>
                      <th className="pb-3 text-[10px] font-black text-gray-400 uppercase tracking-widest">Reference</th>
                      <th className="pb-3 text-[10px] font-black text-gray-400 uppercase tracking-widest">Description</th>
                      <th className="pb-3 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right">Debit</th>
                      <th className="pb-3 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right">Credit</th>
                      <th className="pb-3 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right">Balance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {drillDownData.map((tx, i) => (
                      <tr key={i} className="hover:bg-blue-50/30 transition-colors group">
                        <td className="py-4 text-[11px] font-bold text-gray-500 whitespace-nowrap">{tx.date}</td>
                        <td className="py-4 text-[11px] font-black text-blue-600 group-hover:underline cursor-pointer">{tx.reference}</td>
                        <td className="py-4 text-[11px] text-gray-600 font-medium max-w-xs truncate">{tx.description}</td>
                        <td className="py-4 text-[11px] font-mono text-right text-gray-900">{tx.debit > 0 ? formatBDT(tx.debit) : '-'}</td>
                        <td className="py-4 text-[11px] font-mono text-right text-gray-900">{tx.credit > 0 ? formatBDT(tx.credit) : '-'}</td>
                        <td className={`py-4 text-[11px] font-mono text-right font-black ${tx.running_balance < 0 ? 'text-red-600' : 'text-gray-900'}`}>
                          {formatBDT(tx.running_balance)}
                        </td>
                      </tr>
                    ))}
                    {drillDownData.length === 0 && (
                      <tr>
                        <td colSpan={6} className="py-20 text-center">
                          <p className="text-gray-300 font-black text-sm uppercase">No transactions found for this period</p>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              )}
            </div>

            <div className="p-6 bg-gray-50 border-t border-gray-100 flex justify-between items-center">
               <div className="flex gap-4">
                  <div className="text-[10px] font-bold text-gray-400 uppercase">Total Debit: <span className="text-gray-900 ml-1">{formatBDT(drillDownData.reduce((s, t) => s + t.debit, 0))}</span></div>
                  <div className="text-[10px] font-bold text-gray-400 uppercase">Total Credit: <span className="text-gray-900 ml-1">{formatBDT(drillDownData.reduce((s, t) => s + t.credit, 0))}</span></div>
               </div>
               <button 
                onClick={() => setDrillDownAccount(null)}
                className="bg-gray-900 text-white px-8 py-2 rounded-xl text-[10px] font-black uppercase hover:bg-black transition-all"
               >
                Close Transaction Log
               </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FinancialReports;
