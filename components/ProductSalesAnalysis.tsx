
import React, { useMemo, useState, useCallback } from 'react';
import { Invoice, Product, Contact, ContactType } from '../types';
import { formatBDT, exportToXLSX, exportToPDF } from '../constants';
import { generatePDFReport } from '../services/pdfService';
import { Search, Filter, X, ChevronLeft, ChevronRight, LayoutGrid, List, BarChart2, Settings } from 'lucide-react';
import ExportButtons from './ExportButtons';
import Pagination from './Pagination';
import ColumnSelector, { useColumns } from './ColumnSelector';

interface ProductSalesAnalysisProps {
  store: any;
  productId?: string;
  brand?: string;
  category?: string;
  onBack: () => void;
}

const ProductSalesAnalysis: React.FC<ProductSalesAnalysisProps> = ({ store, productId, brand, category, onBack }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(80);

  const [columns, setColumns] = useColumns('product_sales_analysis', [
    { id: 'date', label: 'Date', visible: true },
    { id: 'order', label: 'Order', visible: true },
    { id: 'product', label: 'Product', visible: true },
    { id: 'customer', label: 'Customer', visible: true },
    { id: 'salesperson', label: 'Salesperson', visible: true },
    { id: 'quantity', label: 'Quantity', visible: true },
    { id: 'unitPrice', label: 'Unit Price', visible: true },
    { id: 'total', label: 'Total', visible: true },
    { id: 'profit', label: 'Profit', visible: true },
  ]);
  
  const product = useMemo(() => 
    productId ? (store.products || []).find((p: Product) => p.id === productId) : null,
    [store.products, productId]
  );

  const salesData = useMemo(() => {
    const invoices = (store.invoices || []).filter((inv: Invoice) => 
      inv.status !== 'VOID' && 
      (inv.items || []).some(item => {
        const p = (store.products || []).find((prod: Product) => prod.id === item.productId);
        if (!p) return false;
        if (productId && p.id !== productId) return false;
        if (brand && brand !== 'All' && !String(p.brand || '').toLowerCase().includes(brand.toLowerCase())) return false;
        if (category && category !== 'All' && p.category !== category) return false;
        return true;
      })
    );

    const creditNotes = (store.creditNotes || []).filter((cn: any) => 
      cn.status !== 'VOID' && cn.status !== 'DRAFT' &&
      (cn.items || []).some((item: any) => {
        const p = (store.products || []).find((prod: Product) => prod.id === item.productId);
        if (!p) return false;
        if (productId && p.id !== productId) return false;
        if (brand && brand !== 'All' && !String(p.brand || '').toLowerCase().includes(brand.toLowerCase())) return false;
        if (category && category !== 'All' && p.category !== category) return false;
        return true;
      })
    );

    const invData = invoices.flatMap(inv => {
      const productItems = (inv.items || []).filter(item => {
        const p = (store.products || []).find((prod: Product) => prod.id === item.productId);
        if (!p) return false;
        if (productId && p.id !== productId) return false;
        if (brand && brand !== 'All' && !String(p.brand || '').toLowerCase().includes(brand.toLowerCase())) return false;
        if (category && category !== 'All' && p.category !== category) return false;
        return true;
      });
      return productItems.map(item => {
        const p = (store.products || []).find((prod: Product) => prod.id === item.productId);
        const cost = typeof item.costPriceAtSale === 'number'
          ? item.costPriceAtSale
          : (typeof item.cost_price_at_sale === 'number'
              ? item.cost_price_at_sale
              : (p?.costPrice || 0));
        const profit = (item.unitPrice - cost) * item.quantity;
        return {
          id: `${inv.id}-${item.id}`,
          date: inv.date,
          orderNumber: inv.number,
          productName: p?.name || 'Unknown Product',
          customerName: (store.contacts || []).find((c: Contact) => c.id === inv.customerId)?.name || 'Unknown Customer',
          salesperson: inv.salesperson || 'System',
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          total: item.quantity * item.unitPrice,
          profit: profit
        };
      });
    });

    const cnData = creditNotes.flatMap(cn => {
      const productItems = (cn.items || []).filter((item: any) => {
        const p = (store.products || []).find((prod: Product) => prod.id === item.productId);
        if (!p) return false;
        if (productId && p.id !== productId) return false;
        if (brand && brand !== 'All' && !String(p.brand || '').toLowerCase().includes(brand.toLowerCase())) return false;
        if (category && category !== 'All' && p.category !== category) return false;
        return true;
      });
      return productItems.map((item: any) => {
        const p = (store.products || []).find((prod: Product) => prod.id === item.productId);
        const cost = typeof item.costPriceAtSale === 'number'
          ? item.costPriceAtSale
          : (typeof item.cost_price_at_sale === 'number'
              ? item.cost_price_at_sale
              : (p?.costPrice || 0));
        const profit = -((item.unitPrice - cost) * item.quantity); // Negative profit for return
        return {
          id: `${cn.id}-${item.id}`,
          date: cn.date || cn.created_at?.split('T')[0] || (cn as any).credit_note_date,
          orderNumber: cn.number || (cn as any).credit_note_number || 'CN',
          productName: p?.name || 'Unknown Product',
          customerName: (store.contacts || []).find((c: Contact) => c.id === cn.customerId)?.name || 'Unknown Customer',
          salesperson: cn.preparedBy || 'System',
          quantity: -item.quantity, // Negative quantity
          unitPrice: item.unitPrice,
          total: -(item.quantity * item.unitPrice), // Negative total
          profit: profit
        };
      });
    });

    return [...invData, ...cnData].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [store.invoices, store.creditNotes, store.contacts, store.products, productId, brand, category]);

  const filteredData = useMemo(() => {
    let data = salesData;
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      data = data.filter(d => 
        String(d.orderNumber || '').toLowerCase().includes(query) ||
        String(d.customerName || '').toLowerCase().includes(query) ||
        String(d.salesperson || '').toLowerCase().includes(query)
      );
    }
    return data;
  }, [salesData, searchQuery]);

  const totalPages = Math.ceil(filteredData.length / pageSize);
  const paginatedData = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredData.slice(start, start + pageSize);
  }, [filteredData, currentPage, pageSize]);

  const handleExport = useCallback((format: 'excel' | 'pdf', scope: 'page' | 'all') => {
    const dataToExport = scope === 'page' ? paginatedData : filteredData;
    const visibleCols = columns.filter(c => c.visible);
    
    const headers = visibleCols.map(c => c.label);
    const rows = [
      headers,
      ...dataToExport.map(row => {
        const rowData: any = {
          date: row.date,
          order: row.orderNumber,
          product: row.productName,
          customer: row.customerName,
          salesperson: row.salesperson,
          quantity: (row.quantity || 0).toFixed(2),
          unitPrice: (row.unitPrice || 0).toFixed(2),
          total: (row.total || 0).toFixed(2),
          profit: (row.profit || 0).toFixed(2)
        };
        return visibleCols.map(c => rowData[c.id]);
      })
    ];

    const totalQty = dataToExport.reduce((sum, d) => sum + d.quantity, 0);
    const totalTotal = dataToExport.reduce((sum, d) => sum + d.total, 0);
    const totalProfit = dataToExport.reduce((sum, d) => sum + d.profit, 0);

    const footerRow: any = {
      date: 'TOTAL',
      quantity: (totalQty || 0).toFixed(2),
      total: (totalTotal || 0).toFixed(2),
      profit: (totalProfit || 0).toFixed(2)
    };
    rows.push(visibleCols.map(c => footerRow[c.id] || ''));

    const filename = `Sales_Analysis_${productId ? (product?.sku || 'Product') : (brand || category || 'Report')}`;
    if (format === 'excel') {
      exportToXLSX(filename, rows);
    } else {
      const pdfCols = visibleCols.map(c => ({
        header: c.label,
        dataKey: c.id,
        align: ['quantity', 'unitPrice', 'total', 'profit'].includes(c.id) ? 'right' : 'left' as any
      }));
      
      const pdfData = dataToExport.map(row => ({
        date: row.date,
        order: row.orderNumber,
        product: row.productName,
        customer: row.customerName,
        salesperson: row.salesperson,
        quantity: (row.quantity || 0).toFixed(2),
        unitPrice: (row.unitPrice || 0).toFixed(2),
        total: (row.total || 0).toFixed(2),
        profit: (row.profit || 0).toFixed(2)
      }));

      generatePDFReport({
        title: 'Product Sales Analysis',
        subtitle: productId ? (product ? `[${product.sku}] ${product.name}` : '') : (brand || category || ''),
        companyName: store.currentCompany?.name || 'Jamuna',
        filename: filename,
        orientation: visibleCols.length > 5 ? 'landscape' : 'portrait'
      }, pdfCols, pdfData);
    }
  }, [paginatedData, filteredData, product, columns, store.currentCompany]);

  const totals = useMemo(() => {
    const qty = filteredData.reduce((sum, d) => sum + d.quantity, 0);
    const total = filteredData.reduce((sum, d) => sum + d.total, 0);
    const profit = filteredData.reduce((sum, d) => sum + d.profit, 0);
    const avgPrice = qty > 0 ? total / qty : 0;
    return { qty, total, avgPrice, profit };
  }, [filteredData]);

  return (
    <div className="flex flex-col h-full bg-[#1a1c23] text-slate-300 overflow-hidden font-sans">
      {/* Breadcrumb & Header */}
      <div className="px-4 py-2 flex items-center justify-between border-b border-slate-700/50 shrink-0">
        <div className="flex items-center space-x-2 text-xs">
          <button onClick={onBack} className="text-[#00A09D] hover:underline">Products</button>
          <span className="text-slate-500">/</span>
          <span className="text-[#00A09D] font-medium truncate max-w-md">
            {productId ? (product ? `[${product.sku}] ${product.name}` : 'Loading...') : 
             brand && category && category !== 'All' ? `${brand} - ${category}` :
             brand ? brand :
             category ? category : 'All Products'}
          </span>
        </div>
        <div className="flex items-center space-x-2">
          <span className="text-[10px] text-slate-500">1-{filteredData.length} / {filteredData.length}</span>
          <div className="flex bg-slate-800 rounded border border-slate-700">
            <button className="p-1 hover:bg-slate-700 disabled:opacity-30"><ChevronLeft size={14} /></button>
            <button className="p-1 hover:bg-slate-700 disabled:opacity-30 border-l border-slate-700"><ChevronRight size={14} /></button>
          </div>
          <div className="flex bg-slate-800 rounded border border-slate-700 ml-2">
            <button className="p-1.5 bg-[#00A09D] text-white"><List size={14} /></button>
            <button className="p-1.5 hover:bg-slate-700 border-l border-slate-700"><LayoutGrid size={14} /></button>
            <button className="p-1.5 hover:bg-slate-700 border-l border-slate-700"><BarChart2 size={14} /></button>
          </div>
        </div>
      </div>

      {/* Sub-header */}
      <div className="px-4 py-1 flex items-center shrink-0">
        <h2 className="text-sm font-bold text-slate-100 flex items-center">
          Sales Analysis
          <Settings size={12} className="ml-2 text-slate-500 cursor-pointer hover:text-slate-300" />
        </h2>
      </div>

      {/* Filter Bar */}
      <div className="px-4 py-2 flex items-center space-x-2 shrink-0 bg-[#242731] border-y border-slate-700/50">
        <div className="flex items-center bg-[#1a1c23] border border-slate-700 rounded px-2 py-1 flex-1 max-w-2xl">
          <Search size={14} className="text-slate-500 mr-2" />
          
          <div className="flex items-center space-x-1 mr-2">
            <div className="flex items-center bg-[#3b3f4e] text-[10px] font-bold px-1.5 py-0.5 rounded text-slate-200 border border-slate-600">
              <Filter size={10} className="mr-1" />
              Sales Orders
              <X size={10} className="ml-1 cursor-pointer hover:text-white" />
            </div>
            <div className="flex items-center bg-[#3b3f4e] text-[10px] font-bold px-1.5 py-0.5 rounded text-slate-200 border border-slate-600">
              <Filter size={10} className="mr-1" />
              Order Date: Last 365 Days
              <X size={10} className="ml-1 cursor-pointer hover:text-white" />
            </div>
          </div>

          <input 
            type="text" 
            placeholder="Search..." 
            className="bg-transparent outline-none text-xs flex-1 text-slate-200 placeholder:text-slate-600"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setCurrentPage(1);
            }}
          />
        </div>
        <div className="flex items-center space-x-2">
          <ExportButtons onExport={handleExport} />
        </div>
        <button className="p-1.5 hover:bg-slate-700 rounded text-slate-400">
          <ChevronRight size={16} className="rotate-90" />
        </button>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-left text-[11px] border-collapse">
          <thead className="sticky top-0 bg-[#1a1c23] border-b border-slate-700 z-10">
            <tr className="text-slate-100 font-bold">
              <th className="px-4 py-3 w-8"><input type="checkbox" className="rounded border-slate-600 bg-transparent" /></th>
              {columns.find(c => c.id === 'date')?.visible && <th className="px-4 py-3">Order Date</th>}
              {columns.find(c => c.id === 'order')?.visible && <th className="px-4 py-3">Order</th>}
              {columns.find(c => c.id === 'product')?.visible && <th className="px-4 py-3">Product</th>}
              {columns.find(c => c.id === 'customer')?.visible && <th className="px-4 py-3">Customer</th>}
              {columns.find(c => c.id === 'salesperson')?.visible && <th className="px-4 py-3">Salesperson</th>}
              {columns.find(c => c.id === 'quantity')?.visible && <th className="px-4 py-3 text-right">Quantity</th>}
              {columns.find(c => c.id === 'unitPrice')?.visible && <th className="px-4 py-3 text-right">Unit Price</th>}
              {columns.find(c => c.id === 'total')?.visible && <th className="px-4 py-3 text-right">Total</th>}
              {columns.find(c => c.id === 'profit')?.visible && <th className="px-4 py-3 text-right">Profit</th>}
              <th className="px-4 py-3 w-8">
                <ColumnSelector columns={columns} onChange={setColumns} />
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {paginatedData.length === 0 ? (
              <tr>
                <td colSpan={columns.filter(c => c.visible).length + 2} className="px-4 py-20 text-center text-slate-500 italic uppercase tracking-widest font-bold">
                  No Sales Data Found
                </td>
              </tr>
            ) : paginatedData.map((row) => (
              <tr key={row.id} className="hover:bg-slate-800/50 transition-colors group">
                <td className="px-4 py-3"><input type="checkbox" className="rounded border-slate-600 bg-transparent" /></td>
                {columns.find(c => c.id === 'date')?.visible && <td className="px-4 py-3 text-slate-400">{row.date}</td>}
                {columns.find(c => c.id === 'order')?.visible && <td className="px-4 py-3 font-medium text-slate-200">{row.orderNumber}</td>}
                {columns.find(c => c.id === 'product')?.visible && <td className="px-4 py-3 text-slate-400 truncate max-w-[150px]">{row.productName}</td>}
                {columns.find(c => c.id === 'customer')?.visible && <td className="px-4 py-3 flex items-center space-x-2">
                  <span className="text-xs">👦</span>
                  <span className="text-slate-200">{row.customerName}</span>
                </td>}
                {columns.find(c => c.id === 'salesperson')?.visible && <td className="px-4 py-3">
                  <div className="flex items-center space-x-2">
                    <span className="w-5 h-5 bg-emerald-600 text-white rounded flex items-center justify-center text-[10px] font-bold">
                      {String(row.salesperson || '').charAt(0)}
                    </span>
                    <span className="text-slate-200">{row.salesperson}</span>
                  </div>
                </td>}
                {columns.find(c => c.id === 'quantity')?.visible && <td className="px-4 py-3 text-right font-medium text-slate-200">{(row.quantity || 0).toFixed(2)}</td>}
                {columns.find(c => c.id === 'unitPrice')?.visible && <td className="px-4 py-3 text-right text-slate-200">{(row.unitPrice || 0).toFixed(2)} ৳</td>}
                {columns.find(c => c.id === 'total')?.visible && <td className="px-4 py-3 text-right font-bold text-slate-100">{(row.total || 0).toFixed(2)} ৳</td>}
                {columns.find(c => c.id === 'profit')?.visible && <td className="px-4 py-3 text-right font-bold text-emerald-400">{(row.profit || 0).toFixed(2)} ৳</td>}
                <td className="px-4 py-3"></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Footer */}
      <div className="px-4 py-3 bg-[#1a1c23] border-t border-slate-700 shrink-0 flex flex-col space-y-4">
        <div className="flex justify-end items-center space-x-16 text-xs font-bold text-slate-100">
          <div className="flex flex-col items-end">
            <span>{(totals.qty || 0).toFixed(2)}</span>
          </div>
          <div className="flex flex-col items-end">
            <span>{(totals.avgPrice || 0).toFixed(2)} ৳</span>
          </div>
          <div className="flex flex-col items-end">
            <span>{(totals.total || 0).toFixed(2)} ৳</span>
          </div>
          <div className="flex flex-col items-end text-emerald-400">
            <span>{(totals.profit || 0).toFixed(2)} ৳</span>
          </div>
          <div className="w-8"></div>
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

export default ProductSalesAnalysis;
