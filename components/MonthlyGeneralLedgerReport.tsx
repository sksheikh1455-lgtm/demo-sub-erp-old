import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format } from 'date-fns';

interface Props {
  store: any;
  onNavigate: (view: string) => void;
}

interface LedgerRow {
  transaction_date: string;
  type: string;
  invoice_bill_num: string;
  narration: string;
  partner: string;
  user: string;
  amount: number;
  paid: number;
  due: number;
  balance: number;
  cash_impact: number;
}

const injectMissingSequence = async (items: LedgerRow[]) => {
  const sequenceItems = (items || []).filter(d => ['INV', 'BILL', 'CREDIT_NOTE'].includes(d.type) && d.invoice_bill_num && String(d.invoice_bill_num).match(/-(\d+)$/));
  
  if (sequenceItems.length === 0) return items;
  
  const groups: Record<string, { type: string, min: number, max: number, len: number, items: Map<number, LedgerRow>, prefix: string }> = {};
  sequenceItems.forEach(item => {
    const numStr = String(item.invoice_bill_num);
    const match = numStr.match(/^(.*-)(\d+)$/);
    if (!match) return;
    const prefix = match[1] + '|' + item.type;
    const num = parseInt(match[2], 10);
    const len = match[2].length;
    if (!groups[prefix]) groups[prefix] = { type: item.type, min: num, max: num, len, items: new Map(), prefix: match[1] };
    groups[prefix].min = Math.min(groups[prefix].min, num);
    groups[prefix].max = Math.max(groups[prefix].max, num);
    groups[prefix].items.set(num, item);
  });
  
  const additional: LedgerRow[] = [];
  const missingIdsByType: Record<string, string[]> = { INV: [], BILL: [], CREDIT_NOTE: [] };
  
  for (const groupKey in groups) {
    const group = groups[groupKey];
    for (let i = group.min; i <= group.max; i++) {
       if (!group.items.has(i)) {
          const missingId = group.prefix + String(i).padStart(group.len, '0');
          if (missingIdsByType[group.type]) {
             missingIdsByType[group.type].push(missingId);
          }
       }
    }
  }

  const missingStatusMap: Record<string, string> = {};

  if (missingIdsByType.INV.length > 0) {
     const { data } = await supabase.from('docs_invoices').select('invoice_number, status').in('invoice_number', missingIdsByType.INV);
     (data || []).forEach(d => missingStatusMap[d.invoice_number] = d.status);
  }
  if (missingIdsByType.BILL.length > 0) {
     const { data } = await supabase.from('docs_bills').select('bill_number, status').in('bill_number', missingIdsByType.BILL);
     (data || []).forEach(d => missingStatusMap[d.bill_number] = d.status);
  }
  if (missingIdsByType.CREDIT_NOTE.length > 0) {
     const { data } = await supabase.from('docs_credit_notes').select('cn_number, status').in('cn_number', missingIdsByType.CREDIT_NOTE);
     (data || []).forEach(d => missingStatusMap[d.cn_number] = d.status);
  }

  for (const groupKey in groups) {
    const group = groups[groupKey];
    for (let i = group.min; i <= group.max; i++) {
       if (!group.items.has(i)) {
          let closestDate = (items.find(x => x.transaction_date) || { transaction_date: '' }).transaction_date;
          for (let j = i - 1; j >= group.min; j--) {
             if (group.items.has(j)) {
                 closestDate = group.items.get(j)?.transaction_date || closestDate;
                 break;
             }
          }
          const missingId = group.prefix + String(i).padStart(group.len, '0');
          const status = missingStatusMap[missingId];
          const reason = status ? (status === 'DRAFT' ? 'CANCELLED / DRAFT' : status.toUpperCase()) : 'DELETED FROM SYSTEM';
          
          let label = group.type === 'INV' ? 'INVOICE' : group.type === 'BILL' ? 'BILL' : 'CREDIT NOTE';
          additional.push({
             type: group.type,
             invoice_bill_num: missingId,
             transaction_date: closestDate,
             narration: `MISSING ${label} (${reason})`,
             partner: 'Unknown',
             user: 'System',
             amount: 0, paid: 0, due: 0, cash_impact: 0, balance: 0
          });
       }
    }
  }
  
  return [...items, ...additional];
};

export default function MonthlyGeneralLedgerReport({ store, onNavigate }: Props) {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<LedgerRow[]>([]);
  const [startDate, setStartDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>(store.activeCompanyIds?.[0] || store.companies?.[0]?.id || '');
  const [limit, setLimit] = useState<number | 'ALL'>('ALL');

  const [filterKeyword, setFilterKeyword] = useState('');


  useEffect(() => {
    if (!selectedCompanyId && store.companies?.length > 0) {
      setSelectedCompanyId(store.activeCompanyIds?.[0] || store.companies[0].id);
    }
  }, [store.companies, store.activeCompanyIds, selectedCompanyId]);

  useEffect(() => {
    if (selectedCompanyId) {
      fetchData();
    }
  }, [startDate, endDate, selectedCompanyId]);

  
  const exportToPDF = () => {
    const doc = new jsPDF('portrait');
    autoTable(doc, { html: '#ledger-table', startY: 20, styles: { overflow: 'ellipsize' } });
    doc.save('general-ledger.pdf');
  };
  const exportToExcel = () => {
     let table = document.getElementById('ledger-table');
     let html = table.outerHTML;
     let url = 'data:application/vnd.ms-excel,' + encodeURIComponent(html);
     let downloadLink = document.createElement('a');
     document.body.appendChild(downloadLink);
     downloadLink.href = url;
     downloadLink.download = 'general-ledger.xls';
     downloadLink.click();
     document.body.removeChild(downloadLink);
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data: reportData, error } = await supabase.rpc('get_general_ledger_report', {
        p_company_id: selectedCompanyId,
        p_start_date: startDate,
        p_end_date: endDate
      });

      if (error) {
        console.error("Error fetching general ledger report:", error); alert("Error: " + error.message);
      } else {
        console.log("MonthlyGeneralLedgerReport fetched exactly:", reportData?.length, "rows"); 
        
          // Deduplicate
          let filtered = reportData || [];
          const cpayIds = new Set(filtered.filter((l:any) => l.journal_id && l.journal_id.startsWith('JE-CPAY-')).map((l:any) => l.journal_id.replace('JE-CPAY-', '')));
          const vpayIds = new Set(filtered.filter((l:any) => l.journal_id && l.journal_id.startsWith('JE-VPAY-')).map((l:any) => l.journal_id.replace('JE-VPAY-', '')));
          
          filtered = filtered.filter((tx: any) => {
             if (tx.journal_id && tx.journal_id.startsWith('JE-PAY-')) {
                 const base = tx.journal_id.replace('JE-PAY-', '');
                 if (cpayIds.has(base) || vpayIds.has(base)) return false;
             }
             return true;
          });
          
          const finalData = await injectMissingSequence(filtered);
        setData(finalData);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const safeFormatDate = (dateString?: string, formatStr: string = 'dd MMM yyyy') => {
    if (!dateString) return '';
    try {
      const d = new Date(dateString);
      if (isNaN(d.getTime())) return '';
      return format(d, formatStr);
    } catch {
      return '';
    }
  };

  const formatDash = (num: number | string) => {
    if (num === '') return '';
    const val = Number(num);
    if (!val || val === 0) return '-';
    return val.toLocaleString('en-IN', { minimumFractionDigits: 2 });
  };

  const getRowDisplay = (row: LedgerRow & { isSubtotal?: boolean }) => {
    if (row.type === 'OB') {
       return {
         ref: 'OB-OPENING_BALANCE',
         amount: '-',
         paid: '-',
         due: '-',
         balance: formatDash(row.balance),
         narration: row.narration
       };
    }

    let formattedNarration = row.narration || '';
    if (formattedNarration.startsWith('Paid via ')) {
      const parts = formattedNarration.replace('Paid via ', '').split(', ');
      if (parts.length > 1) {
         const prefix = parts[0].substring(0, parts[0].lastIndexOf('-') + 1);
         if (prefix) {
            const numParts = parts.map((p, idx) => idx === 0 ? p : p.replace(prefix, ''));
            formattedNarration = 'Paid via ' + numParts.join(', ');
         }
      }
    } else if (formattedNarration.startsWith('Settled: ')) {
      const parts = formattedNarration.replace('Settled: ', '').split(', ');
      if (parts.length > 1) {
         const prefix = parts[0].substring(0, parts[0].lastIndexOf('-') + 1);
         if (prefix) {
            const numParts = parts.map((p, idx) => idx === 0 ? p : p.replace(prefix, ''));
            formattedNarration = 'Settled: ' + numParts.join(', ');
         }
      }
    }

    let ref = row.invoice_bill_num;
    
    return {
      ref,
      narration: formattedNarration,
      amount: formatDash(row.amount),
      paid: formatDash(row.paid),
      due: formatDash(row.due),
      balance: formatDash(row.balance)
    };
  };

  const { processedRows, endingBal, totals } = React.useMemo(() => {
    const rowsToSkip = new Set<string>();
    const extraImpacts: Record<string, number> = {};

    data.forEach(d => {
      if (d.type === 'INV' || d.type === 'BILL' || d.type === 'CREDIT_NOTE') {
        if (Number(d.due) === 0 && Math.abs(Number(d.paid)) > 0 && Number(d.amount) === Math.abs(Number(d.paid))) {
          const matchingPay = data.find(p => 
            (p.type === 'RECEIPT' || p.type === 'PAYMENT' || p.type === 'COLLECTION' || p.type === 'REFUND') &&
            p.transaction_date === d.transaction_date &&
            p.partner === d.partner && 
            Number(p.amount) === Math.abs(Number(d.paid)) &&
            !rowsToSkip.has(p.invoice_bill_num)
          );
          if (matchingPay) {
            rowsToSkip.add(matchingPay.invoice_bill_num);
            extraImpacts[d.invoice_bill_num] = (extraImpacts[d.invoice_bill_num] || 0) + Number(matchingPay.cash_impact || 0);
          }
        }
      }
    });

    const transformedData = data.map(d => ({
      ...d,
      cash_impact: Number(d.cash_impact || 0) + (extraImpacts[d.invoice_bill_num] || 0)
    })).filter(d => !rowsToSkip.has(d.invoice_bill_num));

    let obAmt = transformedData.find(d => d.type === 'OB')?.cash_impact || 0;
    
    const getGroupOrder = (t: string) => {
      switch(t) {
        case 'OB': return 0;
        case 'INV': return 1;
        case 'CREDIT_NOTE': return 2;
        case 'RECEIPT': 
        case 'COLLECTION': return 3;
        case 'BILL':
        case 'PAYMENT': 
        case 'REFUND': return 4;
        default: return 5;
      }
    };

    const GROUP_TITLES: Record<number, string> = {
      1: "Total Customer Invoices",
      2: "Total Credit Notes",
      3: "Total Customer Payments",
      4: "Total Vendor Bills & Payments",
      5: "Total Expenses & Journals"
    };

    const preFiltered = [...transformedData].filter(d => d.type !== 'OB');
    const filteredData = preFiltered.filter(d => {
       if (!filterKeyword) return true;
       const kw = filterKeyword.toLowerCase();
       return (d.narration || '').toLowerCase().includes(kw) || 
              (d.partner || '').toLowerCase().includes(kw) || 
              (d.invoice_bill_num || '').toLowerCase().includes(kw);
    });


    filteredData.sort((a, b) => {
       const gA = getGroupOrder(a.type);
       const gB = getGroupOrder(b.type);
       if (gA !== gB) return gA - gB;
       
       const aNum = a.invoice_bill_num || '';
       const bNum = b.invoice_bill_num || '';
       if (aNum !== bNum) {
         return aNum.localeCompare(bNum, undefined, { numeric: true, sensitivity: 'base' });
       }

       const dateDiff = new Date(a.transaction_date).getTime() - new Date(b.transaction_date).getTime();
       if (dateDiff !== 0) return dateDiff;
       return new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime();
    });

    const rows: Array<LedgerRow & { isSubtotal?: boolean, groupTitle?: string }> = [];
    
    // Add OB
    const obRow = transformedData.find(d => d.type === 'OB');
    if (obRow) rows.push(obRow);
    
    let currentBalance = obAmt;
    let currentGroup = -1;
    let groupAmt = 0;
    let groupPaid = 0;
    let groupDue = 0;

    const pushSubtotal = (grp: number) => {
      if (grp > 0 && GROUP_TITLES[grp] && (groupAmt > 0 || groupPaid > 0 || groupDue > 0)) {
        rows.push({
          isSubtotal: true,
          groupTitle: GROUP_TITLES[grp],
          type: 'SUBTOTAL',
          transaction_date: '',
          invoice_bill_num: '',
          narration: '',
          partner: '',
          user: '',
          amount: groupAmt,
          paid: groupPaid,
          due: groupDue,
          balance: 0,
          cash_impact: 0
        });
      }
      groupAmt = 0;
      groupPaid = 0;
      groupDue = 0;
    };

    filteredData.forEach(row => {
      const grp = getGroupOrder(row.type);
      if (currentGroup !== -1 && currentGroup !== grp) {
        pushSubtotal(currentGroup);
      }
      currentGroup = grp;

      let rowPaid: number | string = 0;
      let rowDue: number | string = 0;
      const impact = Number(row.cash_impact || 0);

      const p = Number(row.paid);
      rowPaid = p !== 0 ? p : '';
      const d = Number(row.due);
      rowDue = d !== 0 ? d : '';

      // 3. Protect Cash Balance & Running Parity
      currentBalance += impact;
      
      groupAmt += Number(row.amount || 0);
      groupPaid += Number(rowPaid) || 0;
      groupDue += Number(rowDue) || 0;

      rows.push({
        ...row,
        balance: currentBalance,  
        paid: rowPaid as any,            
        due: rowDue as any
      });
    });

    if (currentGroup !== -1) {
      pushSubtotal(currentGroup);
    }

    let overallAmt = 0;
    let overallPaid = 0;
    let overallDue = 0;
    rows.forEach(r => {
      if (!r.isSubtotal && r.type !== 'OB') {
        overallAmt += Number(r.amount) || 0;
        overallPaid += Number(r.paid) || 0;
        overallDue += Number(r.due) || 0;
      }
    });

    rows.push({
      isSubtotal: true,
      groupTitle: 'GRAND TOTAL',
      type: 'GRAND_TOTAL',
      transaction_date: '',
      invoice_bill_num: '',
      narration: '',
      partner: '',
      user: '',
      amount: overallAmt,
      paid: overallPaid,
      due: overallDue,
      balance: currentBalance,
      cash_impact: 0
    });

    const displayLength = limit === 'ALL' ? rows.length : limit;
    const paginatedRows = rows.slice(0, displayLength);

    return { 
      processedRows: paginatedRows, 
      endingBal: currentBalance,
      totals: {
        totInv: transformedData.filter(d => d.type === 'INV').length,
        totBill: transformedData.filter(d => d.type === 'BILL').length,
        netInflows: transformedData.filter(d => d.type !== 'OB' && d.cash_impact > 0).reduce((sum, d) => sum + d.cash_impact, 0),
        netOutflows: Math.abs(transformedData.filter(d => d.type !== 'OB' && d.cash_impact < 0).reduce((sum, d) => sum + d.cash_impact, 0)),
        OB: obAmt
      }
    };
  }, [data, limit]);

  const handleDownloadPDF = () => {
    const doc = new jsPDF('portrait');
    const company = store.companies.find(c => c.id === selectedCompanyId)?.name || 'Company';

    doc.setFontSize(8);
    doc.setTextColor(30, 41, 59);
    doc.text(`Daily General Report | Company: ${company} | Date: ${safeFormatDate(startDate)} to ${safeFormatDate(endDate)}`, 5, 5);

    const tableColumn = [
      "Ref/Sequence", "Narration", "Partner", "User", "Amount(৳)", "Paid(৳)", "Due(৳)", "Balance(৳)"
    ];

    const tableRows = processedRows.map(row => {
      if (row.isSubtotal) {
        return [
          { content: row.groupTitle, colSpan: 4, styles: { fontStyle: 'bold', halign: 'right' } },
          formatDash(row.amount),
          formatDash(row.paid),
          formatDash(row.due),
          row.type === 'GRAND_TOTAL' ? formatDash(row.balance) : ''
        ];
      }

      const disp = getRowDisplay(row);
      return [
        disp.ref,
        disp.narration || '',
        row.partner || '',
        row.user || '',
        disp.amount,
        disp.paid,
        disp.due,
        disp.balance
      ];
    });

    autoTable(doc, {
      head: [tableColumn],
      body: tableRows as any,
      startY: 7,
      theme: 'grid',
      margin: { top: 5, left: 5, right: 5, bottom: 5 },
      headStyles: { 
        fillColor: [30, 41, 59], 
        textColor: [255, 255, 255], 
        fontStyle: 'bold',
        fontSize: 7,
      },
      styles: { 
        fontSize: 7,
        cellPadding: 0.8,
        lineColor: [200, 200, 200],
        lineWidth: 0.1,
        valign: 'middle',
        overflow: 'ellipsize'
      },
      columnStyles: {
        0: { cellWidth: 32 },
        4: { halign: 'right', cellWidth: 20 },
        5: { halign: 'right', cellWidth: 20 },
        6: { halign: 'right', cellWidth: 20 },
        7: { halign: 'right', fontStyle: 'bold', cellWidth: 22 }
      },
      didParseCell: function(data) {
        if (data.row.raw && Array.isArray(data.row.raw) && (data.row.raw[0] as string | {content: string}).toString().includes('OB-OPENING_BALANCE')) {
          data.cell.styles.fillColor = [241, 245, 249];
          data.cell.styles.fontStyle = 'bold';
        }
        if (data.row.raw && Array.isArray(data.row.raw) && data.row.raw[0] && typeof data.row.raw[0] === 'object' && 'content' in data.row.raw[0]) {
           data.cell.styles.fillColor = [248, 250, 252];
           data.cell.styles.fontStyle = 'bold';
           data.cell.styles.textColor = [15, 23, 42];
        }
      },
      didDrawPage: function (data) {
        let str = 'Page ' + (doc as any).internal.getNumberOfPages();
        doc.setFontSize(7);
        const pageSize = doc.internal.pageSize;
        const pageHeight = pageSize.height ? pageSize.height : pageSize.getHeight();
        doc.text(str, data.settings.margin.left, pageHeight - 2);
      }
    });

    doc.save(`General_Ledger_${startDate}_to_${endDate}_${company}.pdf`);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold font-display text-slate-800">Daily General Report</h2><div className="text-xs bg-gray-100 p-2 overflow-auto max-h-32">DEBUG: Data length = {data.length}, limit = {limit}, company = {selectedCompanyId}, dates = {startDate} to {endDate}</div>
          <p className="text-slate-500 text-sm">Unified view of Opening Balance, running Cash variations, and daily records.</p>
        </div>
        
        <div className="flex items-center gap-4 flex-wrap">
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="rounded-lg border-slate-300 text-sm shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
          />
          <span className="text-slate-500">to</span>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="rounded-lg border-slate-300 text-sm shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
          />
          <select
            value={limit || ""}
            onChange={(e) => setLimit(e.target.value === 'ALL' ? 'ALL' : Number(e.target.value))}
            className="rounded-lg border-slate-300 text-sm shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
          >
            <option value="200">200 rows</option>
            <option value="300">300 rows</option>
            <option value="400">400 rows</option>
            <option value="500">500 rows</option>
            <option value="ALL">All records</option>
          </select>
          <button
            onClick={handleDownloadPDF}
            disabled={loading || processedRows.length === 0}
            className="flex items-center gap-2 px-4 py-2 bg-slate-800 text-white rounded-lg hover:bg-slate-700 disabled:opacity-50 transition-colors shadow-sm"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
            Download PDF
          </button>
        <div className="flex space-x-2 mt-4 sm:mt-0">
          <input type="text" value={filterKeyword} onChange={e => setFilterKeyword(e.target.value)} placeholder="Advanced Filter..." className="h-8 px-3 rounded border text-sm" />
          <button onClick={exportToPDF} className="h-8 px-3 rounded flex items-center justify-center bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors border border-blue-200 shadow-sm text-sm font-medium">
            Export PDF
          </button>
          <button onClick={exportToExcel} className="h-8 px-3 rounded flex items-center justify-center bg-green-50 text-green-600 hover:bg-green-100 transition-colors border border-green-200 shadow-sm text-sm font-medium">
            Export Excel
          </button>
        </div>

        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <p className="text-sm font-medium text-slate-500">Opening Balance</p>
          <p className="text-xl font-bold text-slate-800 font-mono mt-1">৳ {Number(totals.OB).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</p>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <p className="text-sm font-medium text-slate-500">Total Invoices / Bills</p>
          <p className="text-xl font-bold text-slate-800 mt-1">{totals.totInv} / {totals.totBill}</p>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <p className="text-sm font-medium text-slate-500">Net Cash Inflows</p>
          <p className="text-xl font-bold text-emerald-600 font-mono mt-1">৳ {Number(totals.netInflows).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</p>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <p className="text-sm font-medium text-slate-500">Net Cash Outflows</p>
          <p className="text-xl font-bold text-red-600 font-mono mt-1">৳ {Number(totals.netOutflows).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</p>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm border-b-4 border-b-emerald-500">
          <p className="text-sm font-medium text-slate-500">Ending Cash Balance</p>
          <p className="text-xl font-bold text-emerald-600 font-mono mt-1">৳ {Number(endingBal).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</p>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider font-mono whitespace-nowrap">Invoice/Bill Num</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider font-mono whitespace-nowrap">Narration</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider font-mono whitespace-nowrap">Partner</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider font-mono whitespace-nowrap">User</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider font-mono whitespace-nowrap">Amount</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider font-mono whitespace-nowrap">Paid</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider font-mono whitespace-nowrap">Due</th>
                <th className="px-4 py-3 text-right text-xs font-bold text-slate-800 uppercase tracking-wider font-mono bg-slate-100 whitespace-nowrap">Balance</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-slate-200 text-sm">
              {loading ? (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-slate-400">Loading ledger data...</td>
                </tr>
              ) : processedRows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-slate-400">No activity found for this date range.</td>
                </tr>
              ) : (
                processedRows.map((row, i) => {
                  if (row.isSubtotal) {
                    return (
                      <tr key={'subtotal-' + i} className={`transition-colors ${row.type === 'GRAND_TOTAL' ? 'bg-slate-200/70 border-t-2 border-slate-300' : 'bg-slate-100/50 hover:bg-slate-100'}`}>
                        <td colSpan={4} className={`px-4 py-3 whitespace-nowrap text-right font-medium ${row.type === 'GRAND_TOTAL' ? 'text-slate-900 font-bold' : 'text-slate-700'}`}>
                          {row.groupTitle}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-right font-mono font-bold text-slate-800">
                          {formatDash(row.amount)}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-right font-mono font-bold text-slate-800">
                          {formatDash(row.paid)}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-right font-mono font-bold text-slate-800">
                          {formatDash(row.due)}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-right font-mono font-bold text-slate-800 bg-slate-50/50">
                          {row.type === 'GRAND_TOTAL' ? formatDash(row.balance) : ''}
                        </td>
                      </tr>
                    );
                  }

                  const disp = getRowDisplay(row);
                  return (
                  <tr key={i} className={row.type === 'OB' ? 'bg-indigo-50 hover:bg-indigo-50' : 'hover:bg-slate-50 transition-colors'}>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="font-mono text-slate-700 font-medium">{disp.ref}</span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="text-slate-600">{disp.narration}</span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="text-slate-800">{row.partner}</span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-slate-500">
                      {row.user}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-right font-mono text-slate-600">
                     {disp.amount}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-right font-mono text-slate-600">
                     {disp.paid}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-right font-mono text-slate-600">
                     {disp.due}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-right font-mono font-bold text-slate-800 bg-slate-50/50">
                     {disp.balance !== '-' ? '৳ ' : ''}{disp.balance}
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
  );
}
