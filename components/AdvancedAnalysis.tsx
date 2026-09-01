
import React, { useMemo, useState, useCallback } from 'react';
import { Invoice, Bill, Product, Contact, InvoiceItem } from '../types';
import {formatBDT, exportToXLSX, exportToPDF, getOpDateBST} from '../constants';
import { 
  Search, Filter, X, ChevronLeft, ChevronRight, 
  LayoutGrid, List, BarChart2, Settings, Download, 
  FileSpreadsheet, Calendar, User, Tag, Hash, Percent, FileText
} from 'lucide-react';
import ExportButtons from './ExportButtons';
import Pagination from './Pagination';
import ColumnSelector, { useColumns, ColumnDef } from './ColumnSelector';
import { generatePDFReport } from '../services/pdfService';

interface AdvancedAnalysisProps {
  store: any;
  type: 'sales' | 'purchase';
  initialBrand?: string;
  initialCategory?: string;
  initialProductId?: string;
}

const SmartSearch: React.FC<{
  options: { id: string; label: string; sublabel?: string; searchKey: string }[];
  value: string;
  onChange: (id: string) => void;
  placeholder: string;
  label: string;
  icon: React.ReactNode;
}> = ({ options, value, onChange, placeholder, label, icon }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  
  const selectedOption = options.find(o => o.id === value);
  const filteredOptions = (options || []).filter(o => 
    String(o.searchKey || '').toLowerCase().includes(search.toLowerCase())
  ).slice(0, 50);

  return (
    <div className="space-y-1 relative">
      <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest flex items-center">
        {icon} {label}
      </label>
      <div 
        onClick={() => setIsOpen(!isOpen)}
        className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-[11px] outline-none focus:border-[#00A09D] cursor-pointer flex justify-between items-center hover:border-slate-500 transition-colors"
      >
        <span className="truncate">
          {selectedOption ? selectedOption.label : <span className="text-slate-500">{placeholder}</span>}
        </span>
        <ChevronRight size={12} className={`text-slate-500 transition-transform ${isOpen ? 'rotate-90' : ''}`} />
      </div>
      
      {isOpen && (
        <div className="absolute z-[100] mt-1 w-full bg-[#242731] border border-slate-700 rounded-lg shadow-2xl overflow-hidden animate-in fade-in slide-in-from-top-2">
          <div className="p-2 border-b border-slate-700 bg-[#1a1c23]">
            <input 
              autoFocus
              className="w-full px-3 py-1.5 bg-slate-800 border border-slate-700 rounded text-[10px] font-bold outline-none focus:border-[#00A09D]"
              placeholder="Search..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              onClick={e => e.stopPropagation()}
            />
          </div>
          <div className="max-h-60 overflow-y-auto">
            <div 
              onClick={() => { onChange(''); setIsOpen(false); setSearch(''); }}
              className={`px-3 py-2 hover:bg-slate-700 cursor-pointer text-[10px] font-bold border-b border-slate-700/50 ${!value ? 'text-[#00A09D]' : 'text-slate-400'}`}
            >
              Show All {label}s
            </div>
            {filteredOptions.length > 0 ? (
              filteredOptions.map(opt => (
                <div 
                  key={opt.id}
                  onClick={() => {
                    onChange(opt.id);
                    setIsOpen(false);
                    setSearch('');
                  }}
                  className={`px-3 py-2 hover:bg-slate-700 cursor-pointer border-b border-slate-700/50 last:border-0 ${value === opt.id ? 'bg-slate-700/50 text-[#00A09D]' : ''}`}
                >
                  <p className="text-[10px] font-bold text-slate-200">{opt.label}</p>
                  {opt.sublabel && <p className="text-[8px] font-black text-slate-500 uppercase tracking-tighter">{opt.sublabel}</p>}
                </div>
              ))
            ) : (
              <div className="px-3 py-4 text-center text-[9px] font-black text-slate-500 uppercase tracking-widest">No matches found</div>
            )}
          </div>
        </div>
      )}
      {isOpen && <div className="fixed inset-0 z-[90]" onClick={() => setIsOpen(false)} />}
    </div>
  );
};

const AdvancedAnalysis: React.FC<AdvancedAnalysisProps> = ({ store, type, initialBrand, initialCategory, initialProductId }) => {
  const today = getOpDateBST();
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(80);

  // Advanced Filters State
  const [filters, setFilters] = useState({
    productId: initialProductId || '',
    contactId: '',
    salesperson: '',
    startDate: today,
    endDate: today,
    minMargin: '',
    maxMargin: '',
    invoiceNumber: '',
    datePreset: 'today',
    brand: initialBrand || '',
    category: initialCategory || ''
  });

  const [activeQuickFilters, setActiveQuickFilters] = useState<string[]>([]);
  const [showFilters, setShowFilters] = useState(false);

  const [columns, setColumns] = useColumns(`analysis_${type}`, [
    { id: 'date', label: 'Date', visible: true },
    { id: 'number', label: 'Document', visible: true },
    { id: 'contact', label: type === 'sales' ? 'Customer' : 'Vendor', visible: true },
    { id: 'product', label: 'Product', visible: true },
    { id: 'brand', label: 'Brand', visible: true },
    { id: 'category', label: 'Category', visible: true },
    { id: 'qty', label: 'Qty', visible: true },
    { id: 'preparedBy', label: 'Prepared By', visible: true },
    { id: 'price', label: 'Unit Price', visible: true },
    { id: 'total', label: 'Total', visible: true },
    ...(type === 'sales' ? [
      { id: 'cost', label: 'Cost', visible: true },
      { id: 'margin', label: 'Margin %', visible: true },
      { id: 'marginAmount', label: 'Margin Amt', visible: true },
    ] : [])
  ]);

  const rawData = useMemo(() => {
    const users = store.users || [];
    const getUserName = (id?: string) => store.resolveUserName(id);

    if (type === 'sales') {
      const invoices = (store.invoices || []).filter((inv: Invoice) => inv.status !== 'VOID');
      const creditNotes = (store.creditNotes || []).filter((cn: any) => cn.status !== 'VOID' && cn.status !== 'DRAFT');

      const invData = invoices.flatMap(inv => {
        return (inv.items || []).filter(item => item.productId).map(item => {
          const product = (store.products || []).find((p: Product) => p.id === item.productId);
          const cost = typeof item.costPriceAtSale === 'number'
            ? item.costPriceAtSale
            : (typeof item.cost_price_at_sale === 'number'
                ? item.cost_price_at_sale
                : (product?.costPrice || 0));
          const marginAmount = (item.unitPrice - cost) * item.quantity;
          const marginPercent = item.unitPrice > 0 ? (marginAmount / (item.unitPrice * item.quantity)) * 100 : 0;
          return {
            id: `${inv.id}-${item.id}`,
            date: inv.date,
            number: inv.number,
            productId: item.productId,
            productName: product?.name || item.description || 'Unknown',
            sku: product?.sku || '',
            brand: product?.brand || '',
            category: product?.category || '',
            contactId: inv.customerId,
            contactName: (store.contacts || []).find((c: Contact) => c.id === inv.customerId)?.name || 'Unknown',
            salesperson: inv.salesperson || getUserName(inv.createdById),
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            costPrice: cost,
            total: item.quantity * item.unitPrice,
            preparedBy: inv.salesperson || getUserName(inv.createdById),
            margin: marginPercent,
            marginAmount: marginAmount,
            createdById: inv.createdById
          };
        });
      });

      const cnData = creditNotes.flatMap(cn => {
        return (cn.items || []).filter((item: any) => item.productId).map((item: any) => {
          const product = (store.products || []).find((p: Product) => p.id === item.productId);
          const cost = typeof item.costPriceAtSale === 'number'
            ? item.costPriceAtSale
            : (typeof item.cost_price_at_sale === 'number'
                ? item.cost_price_at_sale
                : (product?.costPrice || 0));
          const marginAmount = -((item.unitPrice - cost) * item.quantity); // Negative profit for return
          const marginPercent = item.unitPrice > 0 ? (marginAmount / (-(item.unitPrice * item.quantity))) * 100 : 0;
          return {
            id: `${cn.id}-${item.id}`,
            date: cn.date || cn.created_at?.split('T')[0] || (cn as any).credit_note_date,
            number: cn.number || (cn as any).credit_note_number || 'CN',
            productId: item.productId,
            productName: product?.name || item.description || 'Unknown',
            sku: product?.sku || '',
            brand: product?.brand || '',
            category: product?.category || '',
            contactId: cn.customerId,
            contactName: (store.contacts || []).find((c: Contact) => c.id === cn.customerId)?.name || 'Unknown',
            salesperson: cn.preparedBy || getUserName(cn.createdById),
            quantity: -item.quantity, // Negative quantity
            unitPrice: item.unitPrice,
            costPrice: cost,
            total: -(item.quantity * item.unitPrice), // Negative total
            preparedBy: cn.preparedBy || getUserName(cn.createdById),
            margin: marginPercent,
            marginAmount: marginAmount,
            createdById: cn.createdById
          };
        });
      });
      return [...invData, ...cnData];
    } else {
      const bills = (store.bills || []).filter((b: Bill) => b.status !== 'VOID');
      return bills.flatMap(bill => {
        return (bill.items || []).filter(item => item.productId).map(item => {
          const product = (store.products || []).find((p: Product) => p.id === item.productId);
          return {
            id: `${bill.id}-${item.id}`,
            date: bill.date,
            number: bill.number,
            productId: item.productId,
            productName: product?.name || item.description || 'Unknown',
            sku: product?.sku || '',
            brand: product?.brand || '',
            category: product?.category || '',
            contactId: bill.vendorId,
            contactName: (store.contacts || []).find((c: Contact) => c.id === bill.vendorId)?.name || 'Unknown',
            salesperson: getUserName(bill.createdById),
            quantity: item.quantity,
            unitPrice: item.netUnitCost || item.unitPrice,
            costPrice: item.netUnitCost || item.unitPrice, // For purchase, actual cost is netUnitCost
            total: item.quantity * (item.netUnitCost || item.unitPrice),
            preparedBy: getUserName(bill.createdById),
            margin: 0,
            marginAmount: 0,
            createdById: bill.createdById
          };
        });
      });
    }
  }, [store.invoices, store.bills, store.products, store.contacts, store.users, type]);

  const filteredData = useMemo(() => {
    const today = new Date();
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0];

    return rawData.filter(d => {
      // Quick Filters
      if (activeQuickFilters.includes('this_month') && d.date < startOfMonth) return false;
      if (activeQuickFilters.includes('high_margin') && type === 'sales' && d.margin < 20) return false;
      if (activeQuickFilters.includes('my_records') && d.createdById !== store.currentUser?.id) return false;

      const matchesSearch = !searchQuery || 
        String(d.number || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        String(d.productName || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        String(d.contactName || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        String(d.salesperson || '').toLowerCase().includes(searchQuery.toLowerCase());

      const matchesProduct = !filters.productId || d.productId === filters.productId;
      const matchesBrand = !filters.brand || filters.brand === 'All' || d.brand === filters.brand;
      const matchesCategory = !filters.category || filters.category === 'All' || d.category === filters.category;
      const matchesContact = !filters.contactId || d.contactId === filters.contactId;
      const matchesSalesperson = !filters.salesperson || String(d.salesperson || '').toLowerCase().includes(filters.salesperson.toLowerCase());
      const matchesDate = (!filters.startDate || d.date >= filters.startDate) && (!filters.endDate || d.date <= filters.endDate);
      const matchesNumber = !filters.invoiceNumber || String(d.number || '').toLowerCase().includes(filters.invoiceNumber.toLowerCase());
      
      let matchesMargin = true;
      if (type === 'sales') {
        const minM = parseFloat(filters.minMargin);
        const maxM = parseFloat(filters.maxMargin);
        if (!isNaN(minM)) matchesMargin = matchesMargin && d.margin >= minM;
        if (!isNaN(maxM)) matchesMargin = matchesMargin && d.margin <= maxM;
      }

      return matchesSearch && matchesProduct && matchesBrand && matchesCategory && matchesContact && matchesSalesperson && matchesDate && matchesNumber && matchesMargin;
    });
  }, [rawData, searchQuery, filters, activeQuickFilters, type]);

  const paginatedData = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredData.slice(start, start + pageSize);
  }, [filteredData, currentPage]);

  const totalPages = Math.ceil(filteredData.length / pageSize);

  const totals = useMemo(() => {
    const qty = filteredData.reduce((sum, d) => sum + d.quantity, 0);
    const total = filteredData.reduce((sum, d) => sum + d.total, 0);
    const avgPrice = qty > 0 ? total / qty : 0;
    const totalCost = filteredData.reduce((sum, d) => sum + (d.quantity * d.costPrice), 0);
    const profit = total - totalCost;
    const margin = total > 0 ? (profit / total) * 100 : 0;
    return { qty, total, avgPrice, profit, margin };
  }, [filteredData]);

  const handleExport = useCallback((format: 'excel' | 'pdf', scope: 'page' | 'all') => {
    const dataToExport = scope === 'page' ? paginatedData : filteredData;
    const fileName = `${type}_analysis_${scope}`;
    
    const totalQty = dataToExport.reduce((sum, d) => sum + d.quantity, 0);
    const totalTotal = dataToExport.reduce((sum, d) => sum + d.total, 0);
    const totalMarginAmount = dataToExport.reduce((sum, d) => sum + (d.marginAmount || 0), 0);
    const avgMargin = totalTotal > 0 ? (totalMarginAmount / totalTotal) * 100 : 0;

    if (format === 'excel') {
      const headers = ['Date', 'Number', 'SKU', 'Product', type === 'sales' ? 'Customer' : 'Vendor', 'Salesperson', 'Quantity', 'Unit Price', 'Total', 'Margin %', 'Margin Amount'];
      const rows = [
        headers,
        ...dataToExport.map(d => [
          d.date,
          d.number,
          d.sku,
          d.productName,
          d.contactName,
          d.salesperson,
          (d.quantity || 0).toFixed(2),
          (d.unitPrice || 0).toFixed(2),
          (d.total || 0).toFixed(2),
          type === 'sales' ? `${(d.margin || 0).toFixed(2)}%` : '0.00%',
          type === 'sales' ? (d.marginAmount || 0).toFixed(2) : '0.00'
        ]),
        ['TOTAL', '', '', '', '', '', (totalQty || 0).toFixed(2), '', (totalTotal || 0).toFixed(2), `${(avgMargin || 0).toFixed(2)}%`, (totalMarginAmount || 0).toFixed(2)]
      ];
      exportToXLSX(fileName, rows);
    } else {
      const columns = [
        { header: 'Date', dataKey: 'date' },
        { header: 'Number', dataKey: 'number' },
        { header: 'Product', dataKey: 'productName' },
        { header: type === 'sales' ? 'Customer' : 'Vendor', dataKey: 'contactName' },
        { header: 'Prepared By', dataKey: 'preparedBy' },
        { header: 'Qty', dataKey: 'quantity' },
        { header: 'Price', dataKey: 'unitPrice' },
        { header: 'Total', dataKey: 'total' }
      ];

      if (type === 'sales') {
        columns.push({ header: 'Margin %', dataKey: 'margin' });
      }

      const pdfData = [
        ...dataToExport.map(d => ({
          date: d.date,
          number: d.number,
          productName: d.productName,
          contactName: d.contactName,
          preparedBy: d.preparedBy,
          quantity: (d.quantity || 0).toFixed(2),
          unitPrice: formatBDT(d.unitPrice || 0),
          total: formatBDT(d.total || 0),
          margin: type === 'sales' ? `${(d.margin || 0).toFixed(2)}%` : ''
        })),
        {
          date: 'TOTAL',
          number: '',
          productName: '',
          contactName: '',
          quantity: (totalQty || 0).toFixed(2),
          unitPrice: '',
          total: formatBDT(totalTotal || 0),
          margin: type === 'sales' ? `${(avgMargin || 0).toFixed(2)}%` : ''
        }
      ];

      generatePDFReport({
        title: type === 'sales' ? 'Sales Analysis Report' : 'Purchase Analysis Report',
        companyName: store.currentCompany.name,
        filename: fileName,
        orientation: columns.length > 5 ? 'landscape' : 'portrait',
        printedBy: store.currentUser?.name
      }, columns, pdfData);
    }
  }, [paginatedData, filteredData, type, store.currentCompany.name, store.currentUser?.name]);

  const toggleQuickFilter = (id: string) => {
    setActiveQuickFilters(prev => 
      prev.includes(id) ? prev.filter(f => f !== id) : [...prev, id]
    );
    setCurrentPage(1);
  };

  const handleDatePresetChange = (preset: string) => {
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    let start = todayStr;
    let end = todayStr;

    switch (preset) {
      case 'yesterday':
        const yesterday = new Date(now);
        yesterday.setDate(now.getDate() - 1);
        start = yesterday.toISOString().split('T')[0];
        end = start;
        break;
      case 'last_3_days':
        const last3 = new Date(now);
        last3.setDate(now.getDate() - 2);
        start = last3.toISOString().split('T')[0];
        break;
      case 'this_week':
        const day = now.getDay();
        const diff = now.getDate() - day + (day === 0 ? -6 : 1);
        const monday = new Date(now.setDate(diff));
        start = monday.toISOString().split('T')[0];
        break;
      case 'this_month':
        start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
        break;
      case 'previous_month':
        start = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().split('T')[0];
        end = new Date(now.getFullYear(), now.getMonth(), 0).toISOString().split('T')[0];
        break;
      case 'last_3_months':
        start = new Date(now.getFullYear(), now.getMonth() - 2, 1).toISOString().split('T')[0];
        break;
      case 'this_year':
        start = new Date(now.getFullYear(), 0, 1).toISOString().split('T')[0];
        break;
      case 'all':
        start = '';
        end = '';
        break;
      case 'custom':
        return; // Don't change dates, just let user pick
    }

    setFilters(prev => ({ ...prev, datePreset: preset, startDate: start, endDate: end }));
  };

  return (
    <div className="flex flex-col h-full bg-[#1a1c23] text-slate-300 overflow-hidden font-sans">
      {/* Header */}
      <div className="px-4 py-3 flex items-center justify-between border-b border-slate-700/50 shrink-0">
        <div className="flex items-center space-x-4">
          <h2 className="text-lg font-black text-slate-100 uppercase tracking-tighter flex items-center">
            {type === 'sales' ? 'Advanced Sales Analysis' : 'Advanced Purchase Analysis'}
            <BarChart2 size={18} className="ml-2 text-[#00A09D]" />
          </h2>
          <div className="h-4 w-px bg-slate-700"></div>
          <div className="flex items-center space-x-1 text-[10px] font-bold text-slate-500 uppercase tracking-widest">
            <span>Total Records:</span>
            <span className="text-slate-200">{filteredData.length}</span>
          </div>
        </div>
        
        <div className="flex items-center space-x-3">
          <ExportButtons onExport={handleExport} />
        </div>
      </div>

      {/* Filter Bar */}
      <div className="px-4 py-3 bg-[#242731] border-b border-slate-700/50 flex flex-col space-y-3 shrink-0">
        <div className="flex items-center space-x-3">
          <div className="flex items-center bg-[#1a1c23] border border-slate-700 rounded px-3 py-1.5 flex-1 max-w-3xl">
            <Search size={16} className="text-slate-500 mr-3" />
            <input 
              type="text" 
              placeholder={`Search by ${type === 'sales' ? 'Invoice' : 'Bill'} #, Product, ${type === 'sales' ? 'Customer' : 'Vendor'}...`}
              className="bg-transparent outline-none text-xs flex-1 text-slate-200 placeholder:text-slate-600"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && <X size={14} className="text-slate-500 cursor-pointer hover:text-white" onClick={() => setSearchQuery('')} />}
          </div>
          
          <div className="flex items-center space-x-2">
            <button 
              onClick={() => toggleQuickFilter('this_month')}
              className={`px-3 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest transition-all border ${
                activeQuickFilters.includes('this_month') ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-500'
              }`}
            >
              This Month
            </button>
            <button 
              onClick={() => toggleQuickFilter('my_records')}
              className={`px-3 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest transition-all border ${
                activeQuickFilters.includes('my_records') ? 'bg-emerald-600 border-emerald-500 text-white' : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-500'
              }`}
            >
              My Records
            </button>
            {type === 'sales' && (
              <button 
                onClick={() => toggleQuickFilter('high_margin')}
                className={`px-3 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest transition-all border ${
                  activeQuickFilters.includes('high_margin') ? 'bg-amber-600 border-amber-500 text-white' : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-500'
                }`}
              >
                High Margin
              </button>
            )}
          </div>

          <div className="flex-1"></div>

          <button 
            onClick={() => setShowFilters(!showFilters)}
            className={`px-4 py-1.5 rounded border transition-all text-[10px] font-black uppercase tracking-widest flex items-center space-x-2 ${
              showFilters ? 'bg-[#00A09D] border-[#00A09D] text-white' : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white'
            }`}
          >
            <Filter size={14} />
            <span>Advanced Filters</span>
          </button>
        </div>

        {showFilters && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 p-4 bg-[#1a1c23] rounded-xl border border-slate-700 animate-in slide-in-from-top-2 duration-200">
            <SmartSearch 
              label="Product"
              icon={<Tag size={10} className="mr-1" />}
              placeholder="Search Product..."
              value={filters.productId}
              onChange={(val) => setFilters({...filters, productId: val})}
              options={(store.products || []).map((p: Product) => ({
                id: p.id,
                label: p.name,
                sublabel: p.sku,
                searchKey: `${p.name} ${p.sku}`
              }))}
            />

            <SmartSearch 
              label={type === 'sales' ? 'Customer' : 'Vendor'}
              icon={<User size={10} className="mr-1" />}
              placeholder={`Search ${type === 'sales' ? 'Customer' : 'Vendor'}...`}
              value={filters.contactId}
              onChange={(val) => setFilters({...filters, contactId: val})}
              options={(store.contacts || []).filter((c: Contact) => c.type === (type === 'sales' ? 'CUSTOMER' : 'VENDOR')).map((c: Contact) => ({
                id: c.id,
                label: c.name,
                sublabel: c.email,
                searchKey: `${c.name} ${c.email || ''}`
              }))}
            />

            <div className="space-y-1">
              <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest flex items-center">
                <Calendar size={10} className="mr-1" /> Date Range Preset
              </label>
              <select 
                className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-[11px] outline-none focus:border-[#00A09D]"
                value={filters.datePreset || ""}
                onChange={(e) => handleDatePresetChange(e.target.value)}
              >
                <option value="today">Today</option>
                <option value="yesterday">Yesterday</option>
                <option value="last_3_days">Last 3 Days</option>
                <option value="this_week">This Week</option>
                <option value="this_month">This Month</option>
                <option value="previous_month">Previous Month</option>
                <option value="last_3_months">Last 3 Months</option>
                <option value="this_year">This Year</option>
                <option value="all">All Time</option>
                <option value="custom">Custom Range</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest flex items-center">
                <Calendar size={10} className="mr-1" /> Custom Dates
              </label>
              <div className="flex items-center space-x-2">
                <input 
                  type="date" 
                  className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-[10px] flex-1 outline-none focus:border-[#00A09D]"
                  value={filters.startDate}
                  onChange={(e) => setFilters({...filters, startDate: e.target.value, datePreset: 'custom'})}
                />
                <span className="text-slate-600">-</span>
                <input 
                  type="date" 
                  className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-[10px] flex-1 outline-none focus:border-[#00A09D]"
                  value={filters.endDate}
                  onChange={(e) => setFilters({...filters, endDate: e.target.value, datePreset: 'custom'})}
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest flex items-center">
                <Tag size={10} className="mr-1" /> Brand
              </label>
              <select 
                className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-[11px] outline-none focus:border-[#00A09D]"
                value={filters.brand || ""}
                onChange={(e) => setFilters({...filters, brand: e.target.value})}
              >
                <option value="All">All Brands</option>
                {Array.from(new Set((store.products || []).map((p: any) => p.brand).filter(Boolean))).map((b: any) => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest flex items-center">
                <Tag size={10} className="mr-1" /> Category
              </label>
              <select 
                className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-[11px] outline-none focus:border-[#00A09D]"
                value={filters.category || ""}
                onChange={(e) => setFilters({...filters, category: e.target.value})}
              >
                <option value="All">All Categories</option>
                {Array.from(new Set((store.products || []).map((p: any) => p.category).filter(Boolean))).map((c: any) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest flex items-center">
                <Hash size={10} className="mr-1" /> {type === 'sales' ? 'Invoice' : 'Bill'} #
              </label>
              <input 
                type="text" 
                placeholder="e.g. INV/2024/001"
                className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-[11px] outline-none focus:border-[#00A09D]"
                value={filters.invoiceNumber}
                onChange={(e) => setFilters({...filters, invoiceNumber: e.target.value})}
              />
            </div>

            {type === 'sales' && (
              <div className="space-y-1">
                <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest flex items-center">
                  <Percent size={10} className="mr-1" /> Margin Range (%)
                </label>
                <div className="flex items-center space-x-2">
                  <input 
                    type="number" 
                    placeholder="Min"
                    className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-[10px] flex-1 outline-none focus:border-[#00A09D]"
                    value={filters.minMargin}
                    onChange={(e) => setFilters({...filters, minMargin: e.target.value})}
                  />
                  <span className="text-slate-600">-</span>
                  <input 
                    type="number" 
                    placeholder="Max"
                    className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-[10px] flex-1 outline-none focus:border-[#00A09D]"
                    value={filters.maxMargin}
                    onChange={(e) => setFilters({...filters, maxMargin: e.target.value})}
                  />
                </div>
              </div>
            )}

            <div className="space-y-1">
              <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest flex items-center">
                <User size={10} className="mr-1" /> Salesperson
              </label>
              <input 
                type="text" 
                placeholder="Name..."
                className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-[11px] outline-none focus:border-[#00A09D]"
                value={filters.salesperson}
                onChange={(e) => setFilters({...filters, salesperson: e.target.value})}
              />
            </div>

            <div className="flex items-end justify-end">
              <button 
                onClick={() => setFilters({
                  productId: '', contactId: '', salesperson: '', 
                  startDate: today, endDate: today, minMargin: '', 
                  maxMargin: '', invoiceNumber: '', datePreset: 'today'
                })}
                className="px-4 py-1.5 text-[10px] font-black uppercase text-rose-500 hover:bg-rose-500/10 rounded transition-all"
              >
                Reset Filters
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-left text-[11px] border-collapse">
          <thead className="sticky top-0 bg-[#1a1c23] border-b border-slate-700 z-10">
            <tr className="text-slate-100 font-bold">
              <th className="px-4 py-3 w-8"><input type="checkbox" className="rounded border-slate-600 bg-transparent" /></th>
              {columns.find(c => c.id === 'date')?.visible && <th className="px-4 py-3">Date</th>}
              {columns.find(c => c.id === 'number')?.visible && <th className="px-4 py-3">Number</th>}
              {columns.find(c => c.id === 'product')?.visible && <th className="px-4 py-3">Product</th>}
              {columns.find(c => c.id === 'brand')?.visible && <th className="px-4 py-3">Brand</th>}
              {columns.find(c => c.id === 'category')?.visible && <th className="px-4 py-3">Category</th>}
              {columns.find(c => c.id === 'contact')?.visible && <th className="px-4 py-3">{type === 'sales' ? 'Customer' : 'Vendor'}</th>}
              {columns.find(c => c.id === 'preparedBy')?.visible && <th className="px-4 py-3">Prepared By</th>}
              {columns.find(c => c.id === 'salesperson')?.visible && <th className="px-4 py-3">Salesperson</th>}
              {columns.find(c => c.id === 'qty')?.visible && <th className="px-4 py-3 text-right">Quantity</th>}
              {columns.find(c => c.id === 'price')?.visible && <th className="px-4 py-3 text-right">Unit Price</th>}
              {columns.find(c => c.id === 'total')?.visible && <th className="px-4 py-3 text-right">Total</th>}
              {type === 'sales' && (
                <>
                  {columns.find(c => c.id === 'margin')?.visible && <th className="px-4 py-3 text-right">Margin (%)</th>}
                  {columns.find(c => c.id === 'marginAmount')?.visible && <th className="px-4 py-3 text-right">Margin (৳)</th>}
                </>
              )}
              <th className="px-4 py-3 w-8">
                <ColumnSelector columns={columns} onChange={setColumns} />
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {paginatedData.length === 0 ? (
              <tr>
                <td colSpan={type === 'sales' ? 12 : 10} className="px-4 py-20 text-center text-slate-500 italic uppercase tracking-widest font-bold">
                  No Data Found Matching Criteria
                </td>
              </tr>
            ) : paginatedData.map((row) => (
              <tr key={row.id} className="hover:bg-slate-800/50 transition-colors group">
                <td className="px-4 py-3"><input type="checkbox" className="rounded border-slate-600 bg-transparent" /></td>
                {columns.find(c => c.id === 'date')?.visible && <td className="px-4 py-3 text-slate-400">{row.date}</td>}
                {columns.find(c => c.id === 'number')?.visible && <td className="px-4 py-3 font-medium text-slate-200">{row.number}</td>}
                {columns.find(c => c.id === 'product')?.visible && <td className="px-4 py-3">
                  <div className="flex flex-col">
                    <span className="text-slate-200 font-bold">{row.productName}</span>
                    <span className="text-[9px] text-slate-500 uppercase tracking-tighter">{row.sku}</span>
                  </div>
                </td>}
                {columns.find(c => c.id === 'brand')?.visible && <td className="px-4 py-3 text-slate-400">{row.brand}</td>}
                {columns.find(c => c.id === 'category')?.visible && <td className="px-4 py-3 text-slate-400">{row.category}</td>}
                {columns.find(c => c.id === 'contact')?.visible && <td className="px-4 py-3">
                  <div className="flex items-center space-x-2">
                    <span className="text-xs">🏢</span>
                    <span className="text-slate-200">{row.contactName}</span>
                  </div>
                </td>}
                {columns.find(c => c.id === 'preparedBy')?.visible && <td className="px-4 py-3 text-slate-400 italic text-[10px]">
                  {row.preparedBy}
                </td>}
                {columns.find(c => c.id === 'salesperson')?.visible && <td className="px-4 py-3">
                  <div className="flex items-center space-x-2">
                    <span className="w-5 h-5 bg-slate-700 text-white rounded flex items-center justify-center text-[10px] font-bold">
                      {String(row.salesperson || '').charAt(0)}
                    </span>
                    <span className="text-slate-200">{row.salesperson}</span>
                  </div>
                </td>}
                {columns.find(c => c.id === 'qty')?.visible && <td className="px-4 py-3 text-right font-medium text-slate-200">{(row.quantity || 0).toFixed(2)}</td>}
                {columns.find(c => c.id === 'price')?.visible && <td className="px-4 py-3 text-right text-slate-200">{(row.unitPrice || 0).toFixed(2)} ৳</td>}
                {columns.find(c => c.id === 'total')?.visible && <td className="px-4 py-3 text-right font-bold text-slate-100">{(row.total || 0).toFixed(2)} ৳</td>}
                {type === 'sales' && (
                  <>
                    {columns.find(c => c.id === 'margin')?.visible && <td className="px-4 py-3 text-right">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-black ${(row.margin || 0) > 0 ? 'bg-emerald-500/10 text-emerald-500' : 'bg-rose-500/10 text-rose-500'}`}>
                        {(row.margin || 0).toFixed(2)}%
                      </span>
                    </td>}
                    {columns.find(c => c.id === 'marginAmount')?.visible && <td className={`px-4 py-3 text-right font-bold ${(row.marginAmount || 0) > 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                      {(row.marginAmount || 0).toFixed(2)} ৳
                    </td>}
                  </>
                )}
                <td className="px-4 py-3"></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Footer Summary */}
      <div className="px-4 py-4 bg-[#1a1c23] border-t border-slate-700 shrink-0 flex flex-col space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-6">
          <div className="bg-slate-800/50 p-3 rounded-xl border border-slate-700/50">
            <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Total Quantity</p>
            <p className="text-lg font-black text-slate-100 tabular-nums">{(totals.qty || 0).toFixed(2)}</p>
          </div>
          <div className="bg-slate-800/50 p-3 rounded-xl border border-slate-700/50">
            <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Avg. Unit Price</p>
            <p className="text-lg font-black text-slate-100 tabular-nums">{(totals.avgPrice || 0).toFixed(2)} ৳</p>
          </div>
          <div className="bg-slate-800/50 p-3 rounded-xl border border-slate-700/50">
            <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Total Amount</p>
            <p className="text-lg font-black text-[#00A09D] tabular-nums">{(totals.total || 0).toFixed(2)} ৳</p>
          </div>
          {type === 'sales' && (
            <>
              <div className="bg-slate-800/50 p-3 rounded-xl border border-slate-700/50">
                <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Estimated Profit</p>
                <p className={`text-lg font-black tabular-nums ${totals.profit > 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                  {(totals.profit || 0).toFixed(2)} ৳
                </p>
              </div>
              <div className="bg-slate-800/50 p-3 rounded-xl border border-slate-700/50">
                <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Overall Margin</p>
                <p className={`text-lg font-black tabular-nums ${totals.margin > 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                  {(totals.margin || 0).toFixed(2)}%
                </p>
              </div>
            </>
          )}
        </div>
        
        <div className="bg-[#242731] rounded-lg overflow-hidden border border-slate-700">
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            totalItems={filteredData.length}
            itemsPerPage={pageSize}
            onPageChange={setCurrentPage}
            onItemsPerPageChange={setPageSize}
          />
        </div>
      </div>
    </div>
  );
};

export default AdvancedAnalysis;
