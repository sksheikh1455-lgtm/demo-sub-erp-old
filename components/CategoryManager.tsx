
import React, { useState, useMemo } from 'react';
import { ICONS, formatBDT, exportToXLSX, exportToPDF } from '../constants';
import { generatePDFReport } from '../services/pdfService';
import ExportButtons from './ExportButtons';
import Pagination from './Pagination';
import ColumnSelector, { useColumns, ColumnDef } from './ColumnSelector';
import { Package, ArrowRightLeft, ShoppingCart, ShoppingBag, TrendingUp, Search, Download, LayoutGrid, List } from 'lucide-react';

const CategoryManager: React.FC<{ store: any; onNavigateToReport: (context: any) => void }> = ({ store, onNavigateToReport }) => {
  const [showModal, setShowModal] = useState(false);
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<'kanban' | 'list'>('kanban');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 80;
  const [editingCategory, setEditingCategory] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedBrand, setSelectedBrand] = useState<string>('All');
  const [formData, setFormData] = useState({ name: '', description: '' });

  const [columns, setColumns] = useColumns('category_list', [
    { id: 'name', label: 'Category Name', visible: true },
    { id: 'products', label: 'Total Products', visible: true },
    { id: 'stock', label: 'Total Stock', visible: true },
    { id: 'value', label: 'Inventory Value', visible: true },
    { id: 'sales', label: 'Total Sales', visible: true },
    { id: 'profit', label: 'Profit (Tk)', visible: true },
    { id: 'margin', label: 'Margin (%)', visible: true },
  ]);

  const brands = useMemo(() => {
    const productBrands = Array.from(new Set((store.products || []).map((p: any) => p.brand).filter(Boolean))) as string[];
    const storeBrands = (store.brands || []).map((b: any) => b.name);
    const allBrands = Array.from(new Set([...productBrands, ...storeBrands]));
    return ['All', ...allBrands.filter(b => b !== 'All').sort()];
  }, [store.products, store.brands]);

  const categories = useMemo(() => {
    const productCats = Array.from(new Set((store.products || []).map((p: any) => p.category).filter(Boolean))) as string[];
    const storeCats = (store.categories || []).map((c: any) => c.name);
    const allCats = Array.from(new Set([...productCats, ...storeCats]));
    return ['All', ...allCats.filter(c => c !== 'All').sort()];
  }, [store.products, store.categories]);

  const filteredCategories = useMemo(() => {
    const query = search.toLowerCase();
    return categories.filter(c => String(c || '').toLowerCase().includes(query));
  }, [categories, search]);

  const categoryStats = useMemo(() => {
    const stats: Record<string, { products: number, stock: number, value: number, salesTotal: number, salesCost: number }> = {};
    
    categories.forEach(c => {
      stats[c] = { products: 0, stock: 0, value: 0, salesTotal: 0, salesCost: 0 };
    });

    (store.products || []).forEach((p: any) => {
      const cat = p.category || 'N/A';
      if (stats[cat]) {
        stats[cat].products += 1;
        stats[cat].stock += ((store.activeCompanyIds?.length === 1 ? (p.stockLevels?.[store.activeCompanyIds[0]] || 0) : (p.quantityOnHand || 0)) || 0);
        stats[cat].value += (((store.activeCompanyIds?.length === 1 ? (p.stockLevels?.[store.activeCompanyIds[0]] || 0) : (p.quantityOnHand || 0)) || 0) * (p.costPrice || 0));
      }
      if (stats['All']) {
        stats['All'].products += 1;
        stats['All'].stock += ((store.activeCompanyIds?.length === 1 ? (p.stockLevels?.[store.activeCompanyIds[0]] || 0) : (p.quantityOnHand || 0)) || 0);
        stats['All'].value += (((store.activeCompanyIds?.length === 1 ? (p.stockLevels?.[store.activeCompanyIds[0]] || 0) : (p.quantityOnHand || 0)) || 0) * (p.costPrice || 0));
      }
    });

    const validInvoices = (store.invoices || []).filter((inv: any) => ['POSTED', 'PAID', 'PARTIAL', 'PARTIAL_REFUNDED', 'FULL_REFUNDED', 'SENT'].includes(inv.status));
    validInvoices.forEach((inv: any) => {
      (inv.items || []).forEach((item: any) => {
        const product = (store.products || []).find((p: any) => p.id === item.productId);
        if (product) {
          const cat = product.category || 'N/A';
          const itemTotal = item.total || (item.quantity * item.unitPrice);
          const itemCost = item.quantity * (product.costPrice || 0);
          
          if (stats[cat]) {
            stats[cat].salesTotal += itemTotal;
            stats[cat].salesCost += itemCost;
          }
          if (stats['All']) {
            stats['All'].salesTotal += itemTotal;
            stats['All'].salesCost += itemCost;
          }
        }
      });
    });

    return stats;
  }, [store.products, store.invoices, categories]);

  const totalPages = Math.ceil(filteredCategories.length / itemsPerPage);
  const paginatedCategories = filteredCategories.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const handleExport = (format: 'excel' | 'pdf', scope: 'page' | 'all') => {
    if (selectedCategory) {
      // Export products in the selected category
      const catProducts = (store.products || []).filter((p: any) => {
        const catMatch = selectedCategory === 'All' || p.category === selectedCategory;
        const brandMatch = selectedBrand === 'All' || p.brand === selectedBrand;
        return catMatch && brandMatch;
      });

      const headers = ['Product Name', 'SKU', 'Brand', 'Category', 'Purchase Rate', 'Sales Price', 'Stock', 'Inventory Value'];
      const rows = [
        headers,
        ...catProducts.map((p: any) => [
          p.name,
          p.sku,
          p.brand || 'N/A',
          p.category || 'N/A',
          p.lastPurchasePrice || 0,
          p.price || 0,
          (store.activeCompanyIds?.length === 1 ? (p.stockLevels?.[store.activeCompanyIds[0]] || 0) : (p.quantityOnHand || 0)) || 0,
          ((store.activeCompanyIds?.length === 1 ? (p.stockLevels?.[store.activeCompanyIds[0]] || 0) : (p.quantityOnHand || 0)) || 0) * (p.costPrice || 0)
        ])
      ];

      if (format === 'excel') {
        exportToXLSX(`Products_${selectedCategory}`, rows);
      } else {
        const pdfCols = headers.map(h => ({ header: h, dataKey: h }));
        const pdfData = catProducts.map((p: any) => ({
          'Product Name': p.name,
          'SKU': p.sku,
          'Brand': p.brand || 'N/A',
          'Category': p.category || 'N/A',
          'Purchase Rate': p.lastPurchasePrice || 0,
          'Sales Price': p.price || 0,
          'Stock': (store.activeCompanyIds?.length === 1 ? (p.stockLevels?.[store.activeCompanyIds[0]] || 0) : (p.quantityOnHand || 0)) || 0,
          'Inventory Value': ((store.activeCompanyIds?.length === 1 ? (p.stockLevels?.[store.activeCompanyIds[0]] || 0) : (p.quantityOnHand || 0)) || 0) * (p.costPrice || 0)
        }));
        generatePDFReport({
          title: `Products - ${selectedCategory}`,
          companyName: store.currentCompany?.name || 'Company',
          filename: `Products_${selectedCategory}`,
          orientation: 'portrait'
        }, pdfCols, pdfData);
      }
      return;
    }

    const dataToExport = scope === 'page' ? paginatedCategories : filteredCategories;
    const visibleCols = columns.filter(c => c.visible);
    
    const exportData = dataToExport.map(c => {
      const stats = categoryStats[c] || { products: 0, stock: 0, value: 0, salesTotal: 0, salesCost: 0 };
      const profit = stats.salesTotal - stats.salesCost;
      const margin = stats.salesTotal > 0 ? (profit / stats.salesTotal) * 100 : 0;
      
      return {
        name: c,
        products: stats.products,
        stock: stats.stock,
        value: stats.value,
        sales: stats.salesTotal,
        profit: profit,
        margin: margin
      };
    });

    if (format === 'excel') {
      const headers = visibleCols.map(c => c.label);
      const rows = [
        headers,
        ...exportData.map(row => visibleCols.map(c => {
          if (c.id === 'margin') return `${(row.margin || 0).toFixed(2)}%`;
          return (row as any)[c.id];
        }))
      ];
      exportToXLSX('Category_List', rows);
    } else {
      const pdfCols = visibleCols.map(c => ({
        header: c.label,
        dataKey: c.id,
        align: ['products', 'stock', 'value', 'sales', 'profit', 'margin'].includes(c.id) ? 'right' : 'left' as any
      }));
      
      const pdfData = exportData.map(row => ({
        name: row.name,
        products: row.products.toString(),
        stock: row.stock.toString(),
        value: formatBDT(row.value),
        sales: formatBDT(row.sales),
        profit: formatBDT(row.profit),
        margin: `${(row.margin || 0).toFixed(2)}%`
      }));

      generatePDFReport({
        title: 'Category List',
        companyName: store.currentCompany?.name || 'Company',
        filename: 'Category_List',
        orientation: visibleCols.length > 5 ? 'landscape' : 'portrait'
      }, pdfCols, pdfData);
    }
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    store.addCategory({ name: formData.name, description: formData.description });
    setShowModal(false);
    setEditingCategory(null);
    setFormData({ name: '', description: '' });
  };

  if (selectedCategory) {
    const catProducts = (store.products || []).filter((p: any) => {
      const catMatch = selectedCategory === 'All' || p.category === selectedCategory;
      const brandMatch = selectedBrand === 'All' || p.brand === selectedBrand;
      return catMatch && brandMatch;
    });
    const totalStock = catProducts.reduce((sum: number, p: any) => sum + ((store.activeCompanyIds?.length === 1 ? (p.stockLevels?.[store.activeCompanyIds[0]] || 0) : (p.quantityOnHand || 0)) || 0), 0);
    const totalValue = catProducts.reduce((sum: number, p: any) => sum + (((store.activeCompanyIds?.length === 1 ? (p.stockLevels?.[store.activeCompanyIds[0]] || 0) : (p.quantityOnHand || 0)) || 0) * (p.costPrice || 0)), 0);

    return (
      <div className="space-y-6 max-w-7xl mx-auto p-4 lg:p-8 animate-in slide-in-from-right duration-500">
        {/* Detail Header with Smart Buttons */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-8 border-b flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
            <div className="flex items-center gap-4">
              <button 
                onClick={() => setSelectedCategory(null)}
                className="p-2 hover:bg-slate-100 rounded-xl transition-colors text-slate-400 hover:text-slate-600"
              >
                <ArrowRightLeft className="w-5 h-5 rotate-180" />
              </button>
              <div>
                <div className="flex items-center gap-2">
                  <Package className="w-5 h-5 text-[#714B67]" />
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Category</span>
                </div>
                <h3 className="text-4xl font-black text-slate-800 uppercase tracking-tighter mt-1">{selectedCategory}</h3>
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <button 
                onClick={() => onNavigateToReport({ category: selectedCategory, brand: selectedBrand, view: 'detail', type: 'inventory' })}
                className="flex flex-col items-center justify-center w-24 h-20 bg-white border border-slate-200 rounded-xl hover:border-[#714B67] hover:shadow-md transition-all group"
              >
                <ArrowRightLeft className="w-5 h-5 text-indigo-500 mb-1 group-hover:scale-110 transition-transform" />
                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">In/Out</span>
                <span className="text-xs font-bold text-slate-700 mt-0.5">{catProducts.length}</span>
              </button>
              <button 
                onClick={() => onNavigateToReport({ category: selectedCategory, brand: selectedBrand, type: 'purchases' })}
                className="flex flex-col items-center justify-center w-24 h-20 bg-white border border-slate-200 rounded-xl hover:border-[#714B67] hover:shadow-md transition-all group"
              >
                <ShoppingBag className="w-5 h-5 text-emerald-500 mb-1 group-hover:scale-110 transition-transform" />
                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Purchased</span>
                <span className="text-xs font-bold text-slate-700 mt-0.5">{totalStock}</span>
              </button>
              <button 
                onClick={() => onNavigateToReport({ category: selectedCategory, brand: selectedBrand, type: 'sales' })}
                className="flex flex-col items-center justify-center w-24 h-20 bg-white border border-slate-200 rounded-xl hover:border-[#714B67] hover:shadow-md transition-all group"
              >
                <ShoppingCart className="w-5 h-5 text-orange-500 mb-1 group-hover:scale-110 transition-transform" />
                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Sales</span>
                <span className="text-xs font-bold text-slate-700 mt-0.5">Report</span>
              </button>
              <button 
                onClick={() => onNavigateToReport({ category: selectedCategory, brand: selectedBrand, type: 'analysis' })}
                className="flex flex-col items-center justify-center w-24 h-20 bg-white border border-slate-200 rounded-xl hover:border-[#714B67] hover:shadow-md transition-all group"
              >
                <TrendingUp className="w-5 h-5 text-purple-500 mb-1 group-hover:scale-110 transition-transform" />
                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Analysis</span>
                <span className="text-xs font-bold text-slate-700 mt-0.5">{formatBDT(totalValue)}</span>
              </button>
            </div>
          </div>

          <div className="p-8 grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="space-y-6">
              <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest border-b pb-2">Category Information</h4>
              <div className="space-y-4">
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Filter by Brand</label>
                  <select 
                    value={selectedBrand || ""}
                    onChange={(e) => setSelectedBrand(e.target.value)}
                    className="w-full mt-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-bold outline-none focus:ring-2 focus:ring-[#714B67]/20"
                  >
                    {brands.map(b => (
                      <option key={b} value={b}>{b}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Description</p>
                  <p className="text-sm text-slate-600 mt-1 leading-relaxed">
                    Products belonging to the {selectedCategory} category. This includes various items managed under this classification.
                  </p>
                </div>
              </div>
            </div>

            <div className="md:col-span-2 space-y-6">
              <div className="flex items-center justify-between border-b pb-2">
                <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest">Products in Category</h4>
                <div className="flex items-center space-x-2">
                  <button onClick={() => handleExport('excel', 'page')} className="text-[10px] font-black uppercase tracking-widest text-emerald-600 hover:text-emerald-500 transition-colors flex items-center"><Download size={12} className="mr-1" /> Excel</button>
                  <button onClick={() => handleExport('pdf', 'page')} className="text-[10px] font-black uppercase tracking-widest text-rose-600 hover:text-rose-500 transition-colors flex items-center"><Download size={12} className="mr-1" /> PDF</button>
                </div>
              </div>
              <div className="overflow-hidden border border-slate-100 rounded-xl">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                    <tr>
                      <th className="px-4 py-3">Product</th>
                      <th className="px-4 py-3">SKU</th>
                      <th className="px-4 py-3 text-right">Purchase Rate</th>
                      <th className="px-4 py-3 text-right">Sales Price</th>
                      <th className="px-4 py-3 text-right">Stock</th>
                      <th className="px-4 py-3 text-right">Value</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {catProducts.map((p: any) => (
                      <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-3 font-bold text-slate-700">{p.name}</td>
                        <td className="px-4 py-3 text-slate-500 font-mono text-xs">{p.sku}</td>
                        <td className="px-4 py-3 text-right text-slate-500">{formatBDT(p.lastPurchasePrice || 0)}</td>
                        <td className="px-4 py-3 text-right font-medium">{formatBDT(p.price)}</td>
                        <td className="px-4 py-3 text-right font-bold text-slate-600">{(store.activeCompanyIds?.length === 1 ? (p.stockLevels?.[store.activeCompanyIds[0]] || 0) : (p.quantityOnHand || 0)) || 0}</td>
                        <td className="px-4 py-3 text-right font-bold text-slate-600">{formatBDT(((store.activeCompanyIds?.length === 1 ? (p.stockLevels?.[store.activeCompanyIds[0]] || 0) : (p.quantityOnHand || 0)) || 0) * (p.costPrice || 0))}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-slate-50 font-bold text-slate-800 border-t-2 border-slate-200">
                    <tr>
                      <td colSpan={2} className="px-4 py-3 text-right uppercase text-[10px] tracking-widest text-slate-500">Grand Total</td>
                      <td className="px-4 py-3 text-right">{formatBDT(catProducts.reduce((sum: number, p: any) => sum + (p.lastPurchasePrice || 0), 0))}</td>
                      <td className="px-4 py-3 text-right">{formatBDT(catProducts.reduce((sum: number, p: any) => sum + p.price, 0))}</td>
                      <td className="px-4 py-3 text-right">{catProducts.reduce((sum: number, p: any) => sum + ((store.activeCompanyIds?.length === 1 ? (p.stockLevels?.[store.activeCompanyIds[0]] || 0) : (p.quantityOnHand || 0)) || 0), 0)}</td>
                      <td className="px-4 py-3 text-right">{formatBDT(catProducts.reduce((sum: number, p: any) => sum + (((store.activeCompanyIds?.length === 1 ? (p.stockLevels?.[store.activeCompanyIds[0]] || 0) : (p.quantityOnHand || 0)) || 0) * (p.costPrice || 0)), 0))}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto p-4 lg:p-8 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center bg-white p-8 rounded-2xl border border-slate-200 shadow-sm gap-4">
        <div>
          <h3 className="text-3xl font-black text-slate-800 uppercase tracking-tighter">Product Categories</h3>
          <p className="text-slate-500 font-medium mt-1">Organize your inventory into logical groups.</p>
        </div>
        <button 
          onClick={() => {
            setEditingCategory(null);
            setFormData({ name: '', description: '' });
            setShowModal(true);
          }}
          className="px-8 py-3 bg-[#714B67] text-white font-black text-xs uppercase tracking-widest rounded-lg shadow-lg hover:bg-[#5a3c52] transition-all active:scale-95 flex items-center"
        >
          <Package className="w-4 h-4 mr-2" />
          New Category
        </button>
      </div>

      <div className="bg-white border p-4 rounded-xl shadow-sm flex items-center justify-between gap-4">
        <div className="flex items-center gap-4 flex-1">
          <div className="relative flex-1 max-w-md">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
              <Search className="w-4 h-4" />
            </span>
            <input 
              type="text" 
              placeholder="Search categories..." 
              className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#714B67]/20 focus:border-[#714B67] transition-all"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }}
            />
          </div>
          <div className="flex items-center bg-slate-100 p-1 rounded-lg border border-slate-200">
            <button 
              onClick={() => setViewMode('kanban')}
              className={`p-1.5 rounded-md transition-all ${viewMode === 'kanban' ? 'bg-white shadow-sm text-[#714B67]' : 'text-slate-400 hover:text-slate-600'}`}
            >
              <LayoutGrid size={18} />
            </button>
            <button 
              onClick={() => setViewMode('list')}
              className={`p-1.5 rounded-md transition-all ${viewMode === 'list' ? 'bg-white shadow-sm text-[#714B67]' : 'text-slate-400 hover:text-slate-600'}`}
            >
              <List size={18} />
            </button>
          </div>
        </div>
        <ExportButtons onExport={handleExport} />
      </div>

      {viewMode === 'kanban' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {paginatedCategories.map(cat => {
            const catProducts = (store.products || []).filter((p: any) => cat === 'All' ? true : p.category === cat);
            const totalStock = catProducts.reduce((sum: number, p: any) => sum + ((store.activeCompanyIds?.length === 1 ? (p.stockLevels?.[store.activeCompanyIds[0]] || 0) : (p.quantityOnHand || 0)) || 0), 0);
            const totalValue = catProducts.reduce((sum: number, p: any) => sum + (((store.activeCompanyIds?.length === 1 ? (p.stockLevels?.[store.activeCompanyIds[0]] || 0) : (p.quantityOnHand || 0)) || 0) * (p.costPrice || 0)), 0);

            return (
              <div 
                key={cat} 
                onClick={() => setSelectedCategory(cat)}
                className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden hover:shadow-md transition-all group cursor-pointer hover:-translate-y-1"
              >
                <div className="p-6 border-b bg-slate-50/50">
                  <div className="flex justify-between items-start">
                    <div>
                      <h4 className="text-xl font-black text-slate-800 uppercase tracking-tighter group-hover:text-[#714B67] transition-colors">{cat}</h4>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">{catProducts.length} Products</p>
                    </div>
                    <div className="p-2 bg-white rounded-xl shadow-sm border border-slate-100">
                      <Package className="w-5 h-5 text-slate-400" />
                    </div>
                  </div>
                </div>
                
                <div className="p-6 space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Total Stock</p>
                      <p className="text-lg font-black text-slate-800 tabular-nums">{totalStock}</p>
                    </div>
                    <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Valuation</p>
                      <p className="text-lg font-black text-slate-800 tabular-nums">{formatBDT(totalValue)}</p>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b">
              <tr>
                {columns.find(c => c.id === 'name')?.visible && <th className="px-6 py-4">Category Name</th>}
                {columns.find(c => c.id === 'products')?.visible && <th className="px-6 py-4 text-right">Total Products</th>}
                {columns.find(c => c.id === 'stock')?.visible && <th className="px-6 py-4 text-right">Total Stock</th>}
                {columns.find(c => c.id === 'value')?.visible && <th className="px-6 py-4 text-right">Inventory Value</th>}
                {columns.find(c => c.id === 'sales')?.visible && <th className="px-6 py-4 text-right">Total Sales</th>}
                {columns.find(c => c.id === 'profit')?.visible && <th className="px-6 py-4 text-right">Profit (Tk)</th>}
                {columns.find(c => c.id === 'margin')?.visible && <th className="px-6 py-4 text-right">Margin (%)</th>}
                <th className="px-6 py-4 text-right w-10">
                  <ColumnSelector columns={columns} onChange={setColumns} />
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {paginatedCategories.map(cat => {
                const stats = categoryStats[cat] || { products: 0, stock: 0, value: 0, salesTotal: 0, salesCost: 0 };
                const profit = stats.salesTotal - stats.salesCost;
                const margin = stats.salesTotal > 0 ? (profit / stats.salesTotal) * 100 : 0;
                return (
                  <tr 
                    key={cat} 
                    onClick={() => setSelectedCategory(cat)}
                    className="hover:bg-slate-50 transition-colors cursor-pointer group"
                  >
                    {columns.find(c => c.id === 'name')?.visible && <td className="px-6 py-4 font-bold text-slate-700 group-hover:text-[#714B67]">{cat}</td>}
                    {columns.find(c => c.id === 'products')?.visible && <td className="px-6 py-4 text-right font-medium text-slate-600">{stats.products || 0}</td>}
                    {columns.find(c => c.id === 'stock')?.visible && <td className="px-6 py-4 text-right font-medium text-slate-600">{stats.stock || 0}</td>}
                    {columns.find(c => c.id === 'value')?.visible && <td className="px-6 py-4 text-right font-bold text-slate-800">{formatBDT(stats.value)}</td>}
                    {columns.find(c => c.id === 'sales')?.visible && <td className="px-6 py-4 text-right font-medium text-slate-600">{formatBDT(stats.salesTotal)}</td>}
                    {columns.find(c => c.id === 'profit')?.visible && <td className="px-6 py-4 text-right font-bold text-emerald-600">{formatBDT(profit)}</td>}
                    {columns.find(c => c.id === 'margin')?.visible && <td className="px-6 py-4 text-right font-bold text-emerald-600">{(margin || 0).toFixed(2)}%</td>}
                    <td className="px-6 py-4"></td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="bg-slate-50 font-black text-slate-800 border-t-2 border-slate-200">
              <tr>
                {columns.find(c => c.id === 'name')?.visible && <td className="px-6 py-4 uppercase text-[10px] tracking-widest text-slate-500">Grand Total</td>}
                {columns.find(c => c.id === 'products')?.visible && <td className="px-6 py-4 text-right">
                  {filteredCategories.reduce((sum, cat) => sum + (categoryStats[cat]?.products || 0), 0)}
                </td>}
                {columns.find(c => c.id === 'stock')?.visible && <td className="px-6 py-4 text-right">
                  {filteredCategories.reduce((sum, cat) => sum + (categoryStats[cat]?.stock || 0), 0)}
                </td>}
                {columns.find(c => c.id === 'value')?.visible && <td className="px-6 py-4 text-right text-[#714B67]">
                  {formatBDT(filteredCategories.reduce((sum, cat) => sum + (categoryStats[cat]?.value || 0), 0))}
                </td>}
                {columns.find(c => c.id === 'sales')?.visible && <td className="px-6 py-4 text-right text-[#714B67]">
                  {formatBDT(filteredCategories.reduce((sum, cat) => sum + (categoryStats[cat]?.salesTotal || 0), 0))}
                </td>}
                {columns.find(c => c.id === 'profit')?.visible && <td className="px-6 py-4 text-right text-emerald-600">
                  {formatBDT(filteredCategories.reduce((sum, cat) => sum + ((categoryStats[cat]?.salesTotal || 0) - (categoryStats[cat]?.salesCost || 0)), 0))}
                </td>}
                {columns.find(c => c.id === 'margin')?.visible && <td className="px-6 py-4 text-right text-emerald-600">
                  {(() => {
                    const totalSales = filteredCategories.reduce((sum, cat) => sum + (categoryStats[cat]?.salesTotal || 0), 0);
                    const totalCost = filteredCategories.reduce((sum, cat) => sum + (categoryStats[cat]?.salesCost || 0), 0);
                    const totalProfit = totalSales - totalCost;
                    return totalSales > 0 ? `${(((totalProfit || 0) / totalSales) * 100).toFixed(2)}%` : '0.00%';
                  })()}
                </td>}
                <td className="px-6 py-4"></td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      <Pagination 
        currentPage={currentPage} 
        totalPages={totalPages} 
        totalItems={filteredCategories.length} 
        itemsPerPage={itemsPerPage} 
        onPageChange={setCurrentPage} 
      />

      {showModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl animate-in zoom-in duration-300">
            <form onSubmit={handleSave}>
              <div className="p-8 border-b bg-slate-50 flex justify-between items-center">
                <div>
                  <h4 className="text-2xl font-black text-slate-800 tracking-tighter uppercase">{editingCategory ? 'Edit Category' : 'New Category'}</h4>
                  <p className="text-sm text-slate-500 font-medium">Define product classification.</p>
                </div>
                <button type="button" onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600">✕</button>
              </div>
              
              <div className="p-8 space-y-5">
                <div>
                  <label className="block text-[10px] font-black text-slate-400 mb-1 uppercase tracking-widest">Category Name</label>
                  <input 
                    required
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-[#714B67]/20 focus:border-[#714B67] outline-none text-sm font-bold" 
                    placeholder="e.g. Electronics"
                    value={formData.name}
                    onChange={(e) => setFormData({...formData, name: e.target.value})}
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-black text-slate-400 mb-1 uppercase tracking-widest">Description</label>
                  <textarea 
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-[#714B67]/20 focus:border-[#714B67] outline-none text-sm font-medium h-24 resize-none" 
                    placeholder="Category details..."
                    value={formData.description}
                    onChange={(e) => setFormData({...formData, description: e.target.value})}
                  />
                </div>
              </div>

              <div className="p-8 bg-slate-50 border-t flex justify-end space-x-3">
                <button type="button" onClick={() => setShowModal(false)} className="px-6 py-2.5 text-slate-500 font-black text-xs uppercase tracking-widest">Cancel</button>
                <button type="submit" className="px-8 py-2.5 bg-[#714B67] text-white font-black text-xs uppercase tracking-widest rounded-lg shadow-lg hover:bg-[#5a3c52]">Save Category</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default CategoryManager;
