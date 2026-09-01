
import React, { useState, useMemo, useEffect } from 'react';
import { Product, ProductType, TrackingType, ContactType } from '../types';
import SmartFilterBar, { SmartFilterState } from './SmartFilterBar';
import ExcelImporter from './ExcelImporter';
import Pagination from './Pagination';
import {  formatBDT, formatDateTime, generateUUID , exportToXLSX } from '../constants';
import Chatter from './Chatter';
import { generatePDFReport } from '../services/pdfService';
import { generateBarcodePDF, generateSingleBarcodePDF } from '../services/barcodeService';
import { Barcode, Download, Search, Tag, Hash, Package, Filter, Settings, Plus, Merge } from 'lucide-react';
import ColumnSelector, { useColumns, ColumnDef } from './ColumnSelector';
import SearchableSelect from './SearchableSelect';

/**
 * ODOO 19 PRODUCT FORM COMPONENT
 * Enhanced with Profit Margin Analytics and Purchase Rate Visibility.
 */

interface ProductListProps {
  store: any;
  defaultCreate?: boolean;
  initialSearch?: string | null;
  initialProductId?: string | null;
  onClearSearch?: () => void;
  onNavigateToReport: (context: { searchQuery?: string; view?: 'summary' | 'detail'; category?: string; brand?: string }) => void;
  onNavigateToInvoices: (searchQuery: string) => void;
  onNavigateToBills: (searchQuery: string) => void;
  onNavigateToSalesAnalysis: (productId: string) => void;
  onNavigateToPurchaseAnalysis?: (productId: string) => void;
  onNavigateToAdjustment: () => void;
}

const ProductList: React.FC<ProductListProps> = ({ 
  store, 
  defaultCreate, 
  initialSearch,
  initialProductId,
  onClearSearch,
  onNavigateToReport,
  onNavigateToInvoices,
  onNavigateToBills,
  onNavigateToSalesAnalysis,
  onNavigateToPurchaseAnalysis,
  onNavigateToAdjustment
}) => {
  const [viewMode, setViewMode] = useState<'list' | 'kanban'>('list');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showImportModal, setShowImportModal] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [showMergeModal, setShowMergeModal] = useState(false);
  const [masterProductId, setMasterProductId] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'general' | 'inventory' | 'sales' | 'audit'>('general');
  const [showAdvancedManagement, setShowAdvancedManagement] = useState<'category' | 'brand' | null>(null);
  const [managementSearch, setManagementSearch] = useState('');
  
  const [filterState, setFilterState] = useState<SmartFilterState>({
    searchQuery: initialSearch || '',
    productId: initialProductId || null,
    startDate: '',
    endDate: '',
    datePreset: 'all',
    brand: '',
    category: 'All',
    selectedCategories: [],
    selectedBrands: [],
    minQty: '',
    maxQty: ''
  });

  useEffect(() => {
    if (initialSearch) {
      setFilterState(prev => ({ ...prev, searchQuery: initialSearch }));
      if (onClearSearch) onClearSearch();
      setShowForm(false);
    }
  }, [initialSearch, onClearSearch]);

  useEffect(() => {
    const handleNav = (e: any) => {
      if (e.detail?.screen === 'PRODUCTS' && e.detail.filter) {
        if (e.detail.filter.searchQuery) {
          setFilterState(prev => ({ ...prev, searchQuery: e.detail.filter.searchQuery }));
        }
        if (e.detail.filter.productId) {
          setFilterState(prev => ({ ...prev, productId: e.detail.filter.productId }));
        }
        setShowForm(false);
      }
    };
    window.addEventListener('accounting-nav', handleNav);
    return () => window.removeEventListener('accounting-nav', handleNav);
  }, []);

  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(80);

  const [columns, setColumns] = useColumns('product_list', [
    { id: 'name', label: 'Product Name', visible: true },
    { id: 'sku', label: 'Internal Reference', visible: true },
    { id: 'brand', label: 'Brand', visible: true },
    { id: 'category', label: 'Category', visible: true },
    { id: 'cost', label: 'Purchase Rate', visible: true },
    { id: 'price', label: 'Sales Price', visible: true },
    { id: 'margin', label: 'Margin %', visible: true },
    { id: 'qty', label: 'On Hand', visible: true },
    { id: 'totalValue', label: 'Total Value', visible: true },
  ]);

  const [draggedCol, setDraggedCol] = useState<string | null>(null);

  const handleDragStart = (e: React.DragEvent, id: string) => {
    setDraggedCol(id);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    if (!draggedCol || draggedCol === targetId) return;
    
    const newCols = [...columns];
    const draggedIdx = newCols.findIndex(c => c.id === draggedCol);
    const targetIdx = newCols.findIndex(c => c.id === targetId);
    
    const [draggedItem] = newCols.splice(draggedIdx, 1);
    newCols.splice(targetIdx, 0, draggedItem);
    
    setColumns(newCols);
    setDraggedCol(null);
  };

  const renderCell = (p: Product, colId: string) => {
    switch (colId) {
      case 'name': return <span className="font-bold text-[#00A09D] group-hover:underline text-xs line-clamp-2 min-h-[32px] break-words whitespace-normal">{p.name}</span>;
      case 'sku': return <span className="font-mono text-xs text-slate-500 truncate">{p.sku || '-'}</span>;
      case 'brand': return <span className="uppercase text-[10px] font-black text-slate-500 truncate">{p.brand || '-'}</span>;
      case 'category': return <span className="uppercase text-[10px] font-black text-slate-500 truncate">{p.category || 'All'}</span>;
      case 'price': return <span className="font-medium">{formatBDT(p.price)}</span>;
      case 'cost': return <span className="text-slate-400">{formatBDT(p.lastPurchasePrice || 0)}</span>;
      case 'margin': return <span className={`font-black ${(calculateMargin(p.price, p.costPrice) || 0) > 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{(calculateMargin(p.price, p.costPrice) || 0).toFixed(1)}%</span>;
      case 'qty': return <span className={`font-black ${(p.quantityOnHand) <= 5 ? 'text-rose-500' : 'text-slate-900'}`}>{p.quantityOnHand}</span>;
      case 'totalValue': return <span className="font-bold text-slate-700">{formatBDT((p.quantityOnHand) * (p.costPrice || 0))}</span>;
      default: return null;
    }
  };

  const renderFooterCell = (colId: string, index: number, visibleColumns: any[]) => {
    if (colId === 'name' || (index === 0 && !visibleColumns.find(c => c.id === 'name'))) {
      return <span className="uppercase text-[10px] tracking-widest text-slate-500 font-bold">Grand Total</span>;
    }
    switch (colId) {
      case 'cost': return <span className="font-bold">{formatBDT(filteredProducts.reduce((sum, p) => sum + (p.lastPurchasePrice || 0), 0))}</span>;
      case 'price': return <span className="font-bold">{formatBDT(filteredProducts.reduce((sum, p) => sum + p.price, 0))}</span>;
      case 'margin': return <span className="font-bold">{filteredProducts.length > 0 ? ((filteredProducts.reduce((sum, p) => sum + calculateMargin(p.price, p.costPrice), 0) / filteredProducts.length) || 0).toFixed(1) + '%' : '0.0%'}</span>;
      case 'totalValue': return <span className="font-bold">{formatBDT(filteredProducts.reduce((sum, p) => sum + ((p.quantityOnHand) * (p.costPrice || 0)), 0))}</span>;
      default: return null;
    }
  };

  const getColumnAlignment = (colId: string) => {
    if (['price', 'cost', 'margin', 'qty', 'totalValue'].includes(colId)) return 'justify-end text-right';
    return 'justify-start text-left';
  };

  useEffect(() => {

    setCurrentPage(1);
  }, [filterState]);

  const [formData, setFormData] = useState({
    externalId: '',
    name: '',
    sku: '',
    price: 0,
    costPrice: 0,
    lastPurchasePrice: 0,
    lastPurchaseRate: 0,
    quantityOnHand: 0,
    category: 'All',
    type: 'Goods' as ProductType,
    description: '',
    canBeSold: true,
    canBePurchased: true,
    uom: 'Units',
    brand: '',
    trackingType: 'NONE' as TrackingType,
    serialNumbers: [] as string[],
    companyIds: [] as string[],
  });

  // Handle auto-create trigger from App.tsx
  useEffect(() => {
    if (defaultCreate) {
      handleNew();
    }
  }, [defaultCreate]);

  const handleNew = () => {
    setEditingId(null);
    setFormData({
      externalId: '',
      name: '',
      sku: '',
      price: 0,
      costPrice: 0,
      lastPurchasePrice: 0,
      lastPurchaseRate: 0,
      quantityOnHand: 0,
      category: 'All',
      type: 'Goods',
      description: '',
      canBeSold: true,
      canBePurchased: true,
      uom: 'Units',
      brand: '',
      trackingType: 'NONE',
      serialNumbers: [],
      companyIds: store.activeCompanyIds.length > 0 ? store.activeCompanyIds : [store.companies[0]?.id],
    });
    setShowForm(true);
  };

  const handleDuplicate = async () => {
    if (!editingId) return;
    const newProduct = {
      ...formData,
      id: '',
      name: `${formData.name} (Copy)`,
      sku: formData.sku ? `${formData.sku}-COPY` : '',
      quantityOnHand: 0,
      serialNumbers: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    setEditingId(null);
    setFormData(newProduct as any);
    window.dispatchEvent(new CustomEvent('app-toast', { detail: { message: 'Product duplicated in form. Make changes and save.', type: 'info' } }));
  };

  const handleSave = async () => {
    if (!formData.name) return alert("Product Name is required.");
    
    // Parse numeric fields
    formData.price = Number(formData.price) || 0;
    formData.costPrice = Number(formData.costPrice) || 0;
    if (formData.quantityOnHand !== undefined) formData.quantityOnHand = Number(formData.quantityOnHand) || 0;
    
    try {
      if (editingId) {
        const originalProduct = (store.products || []).find((p: any) => p.id === editingId);
        if (originalProduct && Number(originalProduct.quantityOnHand || 0) !== Number(formData.quantityOnHand || 0) && !formData.adjustmentContactId) {
          return alert("Responsible Employee is mandatory for inventory adjustments.");
        }
        await store.updateProduct(editingId, {
          ...formData,
          companyIds: formData?.companyIds?.length > 0 ? formData?.companyIds : [store.companies[0]?.id]
        });
      } else {
        if (Number(formData.quantityOnHand || 0) !== 0 && !formData.adjustmentContactId) {
          return alert("Responsible Employee is mandatory for initial inventory adjustment.");
        }
        await store.addProduct({
          ...formData,
          companyIds: formData?.companyIds?.length > 0 ? formData?.companyIds : [store.companies[0]?.id],
          invoicingPolicy: 'Ordered quantities',
          trackInventory: true,
        });
      }
      setShowForm(false);
    } catch (err: any) {
      alert("Failed to save product: " + (err.message || JSON.stringify(err)));
    }
  };

  const handleBulkAdjustment = (adjustments: { id: string; newQty: number; reason: string }[], contactId?: string) => {
    adjustments.forEach(adj => {
      const product = (store.products || []).find((p: any) => p.id === adj.id);
      if (product) {
        // Log message
        const msg = {
          id: generateUUID(),
          authorId: store.currentUser?.id || 'system',
          body: `Inventory adjusted from ${product.quantityOnHand} to ${adj.newQty}. Reason: ${adj.reason}`,
          date: new Date().toISOString(),
          type: 'notification'
        };
        store.updateProduct(adj.id, { 
          ...product, 
          quantityOnHand: adj.newQty, 
          adjustmentContactId: contactId,
          messages: [...(product.messages || []), msg] 
        });
      }
    });
  };

  const availableCustomFields = useMemo(() => [
    { id: 'name', label: 'Product Name', type: 'text' as const },
    { id: 'sku', label: 'Internal Reference', type: 'text' as const },
    { id: 'price', label: 'Sales Price', type: 'number' as const },
    { id: 'costPrice', label: 'Cost Price', type: 'number' as const },
    { id: 'quantityOnHand', label: 'Quantity On Hand', type: 'number' as const },
    { id: 'companyIds', label: 'Companies', type: 'selection' as const, multiple: true, options: (store.companies || []).map((c:any) => ({ id: c.id, label: c.name })) },
    { id: 'category', label: 'Category', type: 'selection' as const, options: [
      { id: 'All', label: 'All' },
      ...Array.from(new Set([...(store.categories || []).map((c: any) => c.name), ...(store.products || []).map((p: any) => p.category)].filter(Boolean))).sort().map(c => ({ id: c as string, label: c as string }))
    ]},
    { id: 'type', label: 'Product Type', type: 'selection' as const, options: [
      { id: 'Goods', label: 'Goods' },
      { id: 'Service', label: 'Service' },
      { id: 'Combo', label: 'Combo' },
    ]},
  ], [store.products, store.companies, store.categories]);

  useEffect(() => {
    const options: any = {
      limit: pageSize,
      offset: (currentPage - 1) * pageSize,
      sortField: 'created_at',
      sortOrder: 'desc' as const,
      companyIds: store.activeCompanyIds,
      filters: {
        ...(filterState.productId && { id: filterState.productId }),
        ...(filterState.category && filterState.category !== 'All' && { category: filterState.category }),
      }
    };
    
    if (filterState.searchQuery) {
        options.search = filterState.searchQuery;
    }

    store.fetchProducts(options);
  }, [store.fetchProducts, store.activeCompanyIds, filterState.searchQuery, filterState.category, filterState.productId, currentPage, pageSize]);

  const filteredProducts = store.paginatedProducts;
  const paginatedProducts = store.paginatedProducts;
  const totalProducts = store.totalProductsCount || store.productCount;
  const totalPages = Math.ceil(totalProducts / pageSize);

  const exportToXLSXLocal = (data: Product[], filename: string) => {
    const visibleCols = columns.filter(c => c.visible);
    const headers = visibleCols.map(c => c.label);
    
    const rows = [
      headers,
      ...data.map(p => {
        const rowData: any = {
          name: p.name,
          sku: p.sku || '',
          brand: p.brand || 'N/A',
          category: p.category || 'All',
          price: p.price,
          cost: p.costPrice || 0,
          margin: `${(calculateMargin(p.price, p.costPrice || 0) || 0).toFixed(2)}%`,
          qty: p.quantityOnHand
        };
        return visibleCols.map(c => rowData[c.id]);
      })
    ];

    // removed invalid exportToXLSX call
  };

  const exportToPDF = (data: Product[], filename: string) => {
    const visibleCols = columns.filter(c => c.visible);
    
    const pdfCols = visibleCols.map(c => ({
      header: c.label,
      dataKey: c.id,
      align: ['price', 'cost', 'margin', 'qty'].includes(c.id) ? 'right' : 'left' as any
    }));
    
    const pdfData = data.map(p => ({
      name: p.name,
      sku: p.sku || 'N/A',
      brand: p.brand || 'N/A',
      category: p.category || 'All',
      price: formatBDT(p.price),
      cost: formatBDT(p.costPrice || 0),
      margin: `${(calculateMargin(p.price, p.costPrice || 0) || 0).toFixed(2)}%`,
      qty: (p.quantityOnHand).toString(),
      totalValue: formatBDT((p.quantityOnHand) * (p.costPrice || 0))
    }));

    generatePDFReport({
      title: 'Products List',
      companyName: store.currentCompany?.name || 'Company',
      dateRange: 'ALL TIME',
      filename: filename.replace('.csv', ''),
      printedBy: store.currentUser?.name,
      orientation: visibleCols.length > 5 ? 'landscape' : 'portrait'
    }, pdfCols, pdfData);
  };

  const toggleSelectOne = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) newSelected.delete(id);
    else newSelected.add(id);
    setSelectedIds(newSelected);
  };

  const calculateMargin = (price: number, cost: number) => {
    const p = Number(price);
    const c = Number(cost);
    if (isNaN(p) || isNaN(c) || p === 0) return 0;
    return ((p - c) / p) * 100;
  };

  const getPageNumbers = () => {
    const pages = [];
    const maxButtons = 5;
    let startPage = Math.max(1, currentPage - Math.floor(maxButtons / 2));
    let endPage = startPage + maxButtons - 1;

    if (endPage > totalPages) {
      endPage = totalPages;
      startPage = Math.max(1, endPage - maxButtons + 1);
    }

    for (let i = startPage; i <= endPage; i++) {
      pages.push(i);
    }
    return pages;
  };

  const categories = useMemo(() => {
    const cats = new Set([...(store.categories || []).map((c: any) => c.name), ...(store.products || []).map((p: any) => p.category)].filter(Boolean));
    return Array.from(cats).sort() as string[];
  }, [store.products, store.categories, store.brands]);

  const brands = useMemo(() => {
    const bnds = new Set([...(store.brands || []).map((b: any) => b.name), ...(store.products || []).map((p: any) => p.brand)].filter(Boolean));
    return Array.from(bnds).sort() as string[];
  }, [store.products, store.categories, store.brands]);

  const [newCategory, setNewCategory] = useState('');
  const [showNewCategoryInput, setShowNewCategoryInput] = useState(false);
  const [newBrand, setNewBrand] = useState('');
  const [showNewBrandInput, setShowNewBrandInput] = useState(false);

  if (showForm) {
    const productInvoices = editingId ? (store.invoices || []).filter((inv: any) => 
      (inv.items || []).some((item: any) => item.productId === editingId)
    ) : [];
    const productBills = editingId ? (store.bills || []).filter((bill: any) => 
      (bill.items || []).some((item: any) => item.productId === editingId)
    ) : [];

    return (
      <div className="flex flex-col h-full bg-[#F1F1F1] overflow-hidden animate-in slide-in-from-right duration-300">
        <div className="bg-white border-b px-6 py-2 flex items-center justify-between shrink-0 shadow-sm z-20">
          <div className="flex items-center space-x-2 text-sm">
            <button onClick={() => setShowForm(false)} className="text-[#00A09D] hover:underline">Products</button>
            <span className="text-slate-400">/</span>
            <span className="text-slate-800 font-bold">{formData.name || 'New'}</span>
          </div>
          <div className="flex items-center space-x-2">
             <button onClick={handleSave} className="bg-[#714B67] text-white px-6 py-1.5 rounded-md text-sm font-bold shadow-sm hover:brightness-110">Save</button>
             {editingId && (
                <>
                  <button 
                    onClick={() => {
                      const product = (store.products || []).find((p: any) => p.id === editingId);
                      if (product) generateSingleBarcodePDF(product, 1);
                    }}
                    className="bg-white border border-slate-300 text-[#00A09D] px-6 py-1.5 rounded-md text-sm font-bold hover:bg-slate-50 flex items-center"
                  >
                    <Barcode className="w-4 h-4 mr-2" />
                    Barcode
                  </button>
                  <button 
                    onClick={() => {
                      window.print();
                      const currentProd = (store.products || []).find((p:any) => p.id === editingId);
                      store.updateProduct(editingId, {
                        messages: [...(currentProd?.messages || []), {
                          id: generateUUID(),
                          authorId: store.currentUser?.id || 'user-1',
                          body: `Product ${currentProd?.name} label was printed.`,
                          date: formatDateTime(new Date()),
                          type: 'notification'
                        }]
                      });
                    }} 
                    className="bg-white border border-slate-300 text-slate-700 px-6 py-1.5 rounded-md text-sm font-bold hover:bg-slate-50 flex items-center"
                  >
                    <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"/></svg>
                    Print
                  </button>
                  {store.currentUser?.roleId === 'role-admin' && (
                    <button 
                      onClick={() => {
                        if (deleteConfirmId === editingId) {
                          store.deleteProducts([editingId]);
                          setShowForm(false);
                          setDeleteConfirmId(null);
                        } else {
                          setDeleteConfirmId(editingId);
                          setTimeout(() => setDeleteConfirmId(null), 3000);
                        }
                      }}
                      className="bg-rose-50 text-rose-600 px-6 py-1.5 rounded-md text-sm font-bold shadow-sm hover:bg-rose-100 transition-colors"
                    >
                      {deleteConfirmId === editingId ? 'Confirm Delete' : 'Delete'}
                    </button>
                  )}
                  <button 
                    onClick={handleDuplicate}
                    className="bg-sky-50 outline outline-1 outline-sky-600 outline-offset-[-1px] text-sky-700 px-6 py-1.5 rounded-md text-sm font-bold shadow-sm hover:bg-sky-100 transition-colors"
                  >
                    Duplicate
                  </button>
                </>
             )}
             <button onClick={() => setShowForm(false)} className="bg-white border border-slate-300 text-slate-700 px-6 py-1.5 rounded-md text-sm font-bold hover:bg-slate-50">Discard</button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 lg:p-10">
          <div className="max-w-6xl mx-auto bg-white shadow-sm rounded-sm border p-8 lg:p-12 min-h-[900px] relative">
             {/* Smart Buttons Section */}
             <div className="flex justify-end flex-wrap gap-px mb-10 no-print">
                <button 
                  onClick={() => editingId && onNavigateToReport({ searchQuery: formData.name, view: 'detail' })}
                  className="flex flex-col items-center justify-center w-28 h-16 border bg-white hover:bg-slate-50 transition-all group"
                >
                   <span className="text-[#00A09D] font-black text-sm group-hover:scale-110 transition-transform">
                      {formData.quantityOnHand || 0}
                   </span>
                   <span className="text-[9px] text-slate-500 uppercase font-black tracking-widest mt-1">In/Out</span>
                </button>
                <button 
                  onClick={() => editingId && onNavigateToSalesAnalysis(editingId)}
                  className="flex flex-col items-center justify-center w-28 h-16 border bg-white hover:bg-slate-50 transition-all group"
                >
                   <span className="text-[#00A09D] font-black text-sm group-hover:scale-110 transition-transform">
                      {productInvoices.length}
                   </span>
                   <span className="text-[9px] text-slate-500 uppercase font-black tracking-widest mt-1">Sales</span>
                </button>
                <button 
                  onClick={() => editingId && (onNavigateToPurchaseAnalysis ? onNavigateToPurchaseAnalysis(editingId) : onNavigateToBills(formData.name))}
                  className="flex flex-col items-center justify-center w-28 h-16 border bg-white hover:bg-slate-50 transition-all group"
                >
                   <span className="text-[#00A09D] font-black text-sm group-hover:scale-110 transition-transform">
                      {productBills.length}
                   </span>
                   <span className="text-[9px] text-slate-500 uppercase font-black tracking-widest mt-1">Purchases</span>
                </button>
                <button className="flex flex-col items-center justify-center w-28 h-16 border bg-white hover:bg-slate-50 transition-all group">
                   <span className="text-[#00A09D] font-black text-sm group-hover:scale-110 transition-transform">
                      {calculateMargin(formData.price, formData.costPrice).toFixed(1)}%
                   </span>
                   <span className="text-[9px] text-slate-500 uppercase font-black tracking-widest mt-1">Margin</span>
                </button>
             </div>

             <div className="flex flex-col md:flex-row md:items-start gap-10 mb-12">
                <div className="w-40 h-40 bg-slate-50 border-2 border-dashed border-slate-200 rounded-2xl flex flex-col items-center justify-center text-slate-300 hover:border-[#00A09D] hover:text-[#00A09D] transition-all cursor-pointer group">
                   <svg className="w-12 h-12 mb-2 group-hover:scale-110 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
                   <span className="text-[10px] font-black uppercase tracking-widest">Add Image</span>
                </div>
                
                <div className="flex-1 space-y-6">
                   <div className="flex items-center space-x-6 no-print">
                      <label className="flex items-center space-x-2 cursor-pointer group">
                         <input type="checkbox" checked={formData.canBeSold} onChange={e => setFormData({...formData, canBeSold: e.target.checked})} className="w-4 h-4 rounded text-[#714B67] focus:ring-[#714B67] border-slate-300" />
                         <span className="text-xs font-black uppercase tracking-widest text-slate-500 group-hover:text-slate-800 transition-colors">Can be Sold</span>
                      </label>
                      <label className="flex items-center space-x-2 cursor-pointer group">
                         <input type="checkbox" checked={formData.canBePurchased} onChange={e => setFormData({...formData, canBePurchased: e.target.checked})} className="w-4 h-4 rounded text-[#714B67] focus:ring-[#714B67] border-slate-300" />
                         <span className="text-xs font-black uppercase tracking-widest text-slate-500 group-hover:text-slate-800 transition-colors">Can be Purchased</span>
                      </label>
                   </div>
                   <input 
                     type="text" 
                     placeholder="Product Name" 
                     className="w-full text-5xl font-black text-slate-900 border-b-2 border-transparent focus:border-[#714B67] outline-none py-2 transition-all placeholder:text-slate-200 tracking-tighter"
                     value={formData.name || ''}
                     onChange={e => setFormData({...formData, name: e.target.value})}
                   />
                </div>
             </div>

             <div className="border-b flex space-x-10 mb-10 no-print">
                <button onClick={() => setActiveTab('general')} className={`pb-4 text-xs font-black uppercase tracking-widest transition-all border-b-2 ${activeTab === 'general' ? 'border-[#714B67] text-[#714B67]' : 'border-transparent text-slate-400 hover:text-slate-600'}`}>General Information</button>
                <button onClick={() => setActiveTab('inventory')} className={`pb-4 text-xs font-black uppercase tracking-widest transition-all border-b-2 ${activeTab === 'inventory' ? 'border-[#714B67] text-[#714B67]' : 'border-transparent text-slate-400 hover:text-slate-600'}`}>Inventory</button>
                <button onClick={() => setActiveTab('sales')} className={`pb-4 text-xs font-black uppercase tracking-widest transition-all border-b-2 ${activeTab === 'sales' ? 'border-[#714B67] text-[#714B67]' : 'border-transparent text-slate-400 hover:text-slate-600'}`}>Sales</button>
                <button onClick={() => setActiveTab('audit')} className={`pb-4 text-xs font-black uppercase tracking-widest transition-all border-b-2 ${activeTab === 'audit' ? 'border-[#714B67] text-[#714B67]' : 'border-transparent text-slate-400 hover:text-slate-600'}`}>Audit Trail</button>
             </div>

             <div className="grid grid-cols-1 lg:grid-cols-2 gap-16">
                {activeTab === 'general' && (
                  <>
                    <div className="space-y-6">
                       <div className="flex items-center justify-between border-b border-slate-100 pb-2 group">
                          <label className="text-[11px] font-black uppercase tracking-widest text-slate-400 group-hover:text-slate-600 transition-colors">Product Type</label>
                          <select className="bg-transparent outline-none text-sm font-bold text-slate-800 text-right cursor-pointer" value={formData.type || ""} onChange={e => setFormData({...formData, type: e.target.value as any})}>
                             <option>Goods</option>
                             <option>Service</option>
                             <option>Combo</option>
                          </select>
                       </div>
                       <div className="flex items-center justify-between border-b border-slate-100 pb-2 group">
                          <label className="text-[11px] font-black uppercase tracking-widest text-slate-400 group-hover:text-slate-600 transition-colors shrink-0 mr-4">Product Category</label>
                          <div className="w-64 flex items-center space-x-2">
                            <SearchableSelect
                              options={[{ id: 'All', name: 'All' }, ...categories.filter(c => c !== 'All').map(c => ({ id: c, name: c }))]}
                              value={formData.category || 'All'}
                              onSelect={(id) => setFormData({...formData, category: id})}
                              onQuickCreate={(name) => setFormData({...formData, category: name})}
                              placeholder="Search or add category..."
                              quickCreateLabel="Category"
                              className="flex-1"
                              labelClass="font-bold text-slate-800 text-right w-full block border-none"
                              themeColor="#714B67"
                            />
                            <button 
                              onClick={() => setShowAdvancedManagement('category')}
                              className="p-1.5 text-[#00A09D] hover:bg-[#00A09D]/10 rounded-md transition-colors"
                              title="Advanced Category Management"
                            >
                              <Plus className="w-4 h-4" />
                            </button>
                          </div>
                       </div>
                       <div className="flex items-center justify-between border-b border-slate-100 pb-2 group">
                          <label className="text-[11px] font-black uppercase tracking-widest text-slate-400 group-hover:text-slate-600 transition-colors">Internal Reference</label>
                          <input type="text" className="bg-transparent outline-none text-sm font-bold text-slate-800 text-right placeholder:text-slate-300" value={formData.sku || ''} onChange={e => setFormData({...formData, sku: e.target.value})} placeholder="e.g. LAP-001" />
                       </div>
                       <div className="flex items-center justify-between border-b border-slate-100 pb-2 group">
                          <label className="text-[11px] font-black uppercase tracking-widest text-slate-400 group-hover:text-slate-600 transition-colors">Unit of Measure</label>
                          <select className="bg-transparent outline-none text-sm font-bold text-slate-800 text-right cursor-pointer" value={formData.uom || ""} onChange={e => setFormData({...formData, uom: e.target.value})}>
                             <option>Units</option>
                             <option>kg</option>
                             <option>Liters</option>
                             <option>Meters</option>
                             <option>Pcs</option>
                             <option>Box</option>
                          </select>
                       </div>
                    </div>
                    <div className="space-y-6">
                       <div className="flex items-center justify-between border-b border-slate-100 pb-2 group">
                          <label className="text-[11px] font-black uppercase tracking-widest text-slate-400 group-hover:text-slate-600 transition-colors">Sales Price</label>
                          <div className="flex items-center space-x-2">
                             <input type="number" className="bg-transparent outline-none text-xl font-black text-[#00A09D] text-right w-32" value={formData.price === undefined || isNaN(formData.price) ? '' : formData.price} onChange={e => setFormData({...formData, price: e.target.value === '' ? '' : e.target.value})} />
                             <span className="text-[10px] font-black text-slate-300 uppercase">BDT</span>
                          </div>
                       </div>
                       <div className="flex items-center justify-between border-b border-slate-100 pb-2 group">
                          <label className="text-[11px] font-black uppercase tracking-widest text-slate-400 group-hover:text-slate-600 transition-colors">Average Cost (WAC)</label>
                          <div className="flex items-center space-x-2">
                             <input 
                                type="number" 
                                step="0.01"
                                readOnly={true} 
                                className="bg-transparent outline-none text-sm font-bold text-right w-32 text-slate-400 cursor-not-allowed" 
                                value={formData.costPrice || 0} 
                                onChange={() => {}}
                             />
                             <span className="text-[10px] font-black text-slate-300 uppercase">BDT</span>
                          </div>
                       </div>
                       <div className="flex items-center justify-between border-b border-slate-100 pb-2 group">
                          <label className="text-[11px] font-black uppercase tracking-widest text-slate-400 group-hover:text-slate-600 transition-colors">Last Purchase Rate</label>
                          <div className="flex items-center space-x-2">
                             <input 
                               type="number" 
                               step="0.01"
                               className="bg-transparent outline-none text-sm font-bold text-slate-800 text-right w-32 focus:border-b focus:border-indigo-500" 
                               value={formData.lastPurchaseRate || 0} 
                               onChange={e => setFormData({...formData, lastPurchaseRate: parseFloat(e.target.value) || 0})}
                             />
                             <span className="text-[10px] font-black text-slate-300 uppercase">BDT</span>
                          </div>
                       </div>
                       <div className="flex items-center justify-between border-b border-slate-100 pb-2 group">
                          <label className="text-[11px] font-black uppercase tracking-widest text-slate-400 group-hover:text-slate-600 transition-colors shrink-0 mr-4">Brand</label>
                          <div className="w-64 flex items-center space-x-2">
                            <SearchableSelect
                              options={[{ id: '', name: '-- No Brand --' }, ...brands.map(b => ({ id: b, name: b }))]}
                              value={formData.brand || ''}
                              onSelect={(id) => setFormData({...formData, brand: id})}
                              onQuickCreate={(name) => setFormData({...formData, brand: name})}
                              placeholder="Search or add brand..."
                              quickCreateLabel="Brand"
                              className="flex-1"
                              labelClass="font-bold text-slate-800 text-right w-full block border-none"
                              themeColor="#714B67"
                            />
                            <button 
                              onClick={() => setShowAdvancedManagement('brand')}
                              className="p-1.5 text-[#00A09D] hover:bg-[#00A09D]/10 rounded-md transition-colors"
                              title="Advanced Brand Management"
                            >
                              <Plus className="w-4 h-4" />
                            </button>
                          </div>
                       </div>
                       <div className="flex flex-col border-b border-slate-100 pb-2 group">
                          <label className="text-[11px] font-black uppercase tracking-widest text-slate-400 group-hover:text-slate-600 transition-colors mb-2">Available In Companies</label>
                          <div className="flex flex-wrap gap-2 justify-end">
                            {store.companies.map((c: any) => (
                              <button
                                key={c.id}
                                type="button"
                                onClick={() => {
                                  const prevIds = formData?.companyIds || [];
                                  const newIds = prevIds.includes(c.id)
                                    ? prevIds.filter((id: string) => id !== c.id)
                                    : [...prevIds, c.id];
                                  setFormData({...formData, companyIds: newIds.length > 0 ? newIds : prevIds});
                                }}
                                className={`px-2 py-1 rounded-md text-[10px] font-bold transition-all border ${
                                  (formData?.companyIds || []).includes(c.id)
                                    ? 'bg-[#714B67] border-[#714B67] text-white'
                                    : 'bg-white border-slate-200 text-slate-500 hover:border-[#714B67]'
                                }`}
                              >
                                {c.name}
                              </button>
                            ))}
                          </div>
                       </div>
                    </div>
                  </>
                )}

                {activeTab === 'inventory' && (
                  <div className="col-span-2 space-y-8 animate-in fade-in duration-300">
                    <div className="bg-slate-50 p-8 rounded-2xl border border-slate-100 space-y-6">
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-2 sm:space-y-0">
                          <h4 className="text-xs font-black uppercase tracking-widest text-slate-400">Stock Status</h4>
                          <span className="text-[9px] bg-red-100 text-red-700 px-2.5 py-1 rounded-full font-bold uppercase tracking-wide">Direct manual edits blocked</span>
                        </div>
                        <div className="grid grid-cols-3 gap-10">
                           <div className="text-center p-4 bg-white rounded-xl shadow-sm border border-slate-100">
                              <p className="text-2xl font-black text-[#00A09D]">{formData.quantityOnHand || 0}</p>
                              <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest mt-1">On Hand</p>
                           </div>
                           <div className="text-center p-4 bg-white rounded-xl shadow-sm border border-slate-100 opacity-50">
                              <p className="text-2xl font-black text-slate-300">0.00</p>
                              <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest mt-1">Forecasted</p>
                           </div>
                           <div className="text-center p-4 bg-white rounded-xl shadow-sm border border-slate-100 opacity-50">
                              <p className="text-2xl font-black text-slate-300">0.00</p>
                              <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest mt-1">Incoming</p>
                           </div>
                        </div>
                        <div className="bg-white p-4 rounded-xl border border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm">
                           <div className="space-y-0.5">
                             <h5 className="text-[11px] font-black uppercase text-slate-700">Need to adjust stock levels?</h5>
                             <p className="text-[10px] text-slate-500">Every stock modification is audited and must post balancing ledger entries to ensure catalog-to-ledger zero-discrepancy sync.</p>
                           </div>
                           <button 
                             type="button"
                             onClick={() => {
                               setShowForm(false);
                               onNavigateToAdjustment();
                             }}
                             className="px-4 py-2 bg-[#714B67] text-white rounded-lg text-[10px] font-black uppercase tracking-wider hover:bg-[#5a3a52] transition-colors shadow flex items-center min-w-fit cursor-pointer self-start md:self-auto"
                           >
                              Go to Inventory Adjustment Form
                           </button>
                        </div>
                     </div>
                    <div className="grid grid-cols-2 gap-10">
                       <div className="space-y-6">
                          <div className="flex items-center justify-between border-b border-slate-100 pb-2 group">
                             <label className="text-[11px] font-black uppercase tracking-widest text-slate-400 group-hover:text-slate-600 transition-colors">Responsible (Employee) <span className="text-rose-500 ml-1 text-[8px]">*Required for adjustments</span></label>
                             <select 
                               className="bg-transparent outline-none text-sm font-bold text-slate-800 text-right cursor-pointer" 
                               value={formData.adjustmentContactId || ''} 
                               onChange={e => setFormData({...formData, adjustmentContactId: e.target.value})}
                             >
                                <option value="">-- No Responsible --</option>
                                {(store.contacts || []).filter((c: any) => c.type === ContactType.EMPLOYEE).map((c: any) => (
                                  <option key={c.id} value={c.id}>{c.name}</option>
                                ))}
                             </select>
                          </div>
                          <div className="flex items-center justify-between border-b border-slate-100 pb-2 group">
                             <label className="text-[11px] font-black uppercase tracking-widest text-slate-400 group-hover:text-slate-600 transition-colors">Tracking Type</label>
                             <select 
                               className="bg-transparent outline-none text-sm font-bold text-slate-800 text-right cursor-pointer" 
                               value={formData.trackingType || ""} 
                               onChange={e => setFormData({...formData, trackingType: e.target.value as TrackingType})}
                             >
                                <option value="NONE">No Tracking</option>
                                <option value="SERIAL">Unique Serial Number</option>
                             </select>
                          </div>
                          {formData.trackingType === 'SERIAL' && (
                            <div className="space-y-2">
                               <label className="text-[11px] font-black uppercase tracking-widest text-slate-400">Available Serial Numbers ({formData.serialNumbers.length})</label>
                               <div className="max-h-40 overflow-y-auto border rounded-xl p-2 bg-white space-y-1">
                                  {formData.serialNumbers.length === 0 ? (
                                    <p className="text-[10px] text-slate-400 italic">No serial numbers assigned. They will be generated upon purchase or can be added manually.</p>
                                  ) : (
                                    formData.serialNumbers.map((sn, i) => (
                                      <div key={i} className="flex items-center justify-between text-[10px] bg-slate-50 px-2 py-1 rounded">
                                        <span className="font-bold text-slate-700">{sn}</span>
                                        <button 
                                          onClick={() => setFormData(prev => ({ ...prev, serialNumbers: prev.serialNumbers.filter((_, idx) => idx !== i) }))}
                                          className="text-rose-500 hover:text-rose-700"
                                        >
                                          ×
                                        </button>
                                      </div>
                                    ))
                                  )}
                               </div>
                               <div className="flex space-x-2">
                                  <input 
                                    type="text" 
                                    className="flex-1 text-[10px] border rounded px-2 py-1 outline-none focus:ring-1 focus:ring-[#714B67]" 
                                    placeholder="Add Serial Number..." 
                                    onKeyDown={e => {
                                      if (e.key === 'Enter') {
                                        const val = e.currentTarget.value.trim();
                                        if (val && !formData.serialNumbers.includes(val)) {
                                          setFormData(prev => ({ ...prev, serialNumbers: [...prev.serialNumbers, val] }));
                                          e.currentTarget.value = '';
                                        }
                                      }
                                    }}
                                  />
                                  <button 
                                    onClick={() => {
                                      const needed = Math.max(0, formData.quantityOnHand - formData.serialNumbers.length);
                                      const count = needed > 0 ? needed : 1;
                                      const newSerials = Array.from({ length: count }, (_, i) => generateUUID());
                                      setFormData(prev => ({ ...prev, serialNumbers: [...prev.serialNumbers, ...newSerials] }));
                                    }}
                                    className="px-3 py-1 bg-slate-100 border border-slate-300 rounded text-[9px] font-bold text-slate-700 hover:bg-slate-200"
                                  >
                                    Auto-Gen
                                  </button>
                               </div>
                            </div>
                          )}
                       </div>
                       <div className="space-y-4">
                          <label className="text-[11px] font-black uppercase tracking-widest text-slate-400">Description for Receipts</label>
                          <textarea 
                             className="w-full h-32 bg-white border border-slate-200 rounded-xl p-4 text-sm outline-none focus:ring-2 focus:ring-[#714B67] transition-all" 
                             placeholder="This note will be printed on receipt..."
                             value={formData.description || ''}
                             onChange={e => setFormData({...formData, description: e.target.value})}
                           />
                       </div>
                    </div>
                  </div>
                )}

                {activeTab === 'sales' && (
                  <div className="col-span-2 space-y-8 animate-in fade-in duration-300">
                    <div className="bg-white border rounded-2xl overflow-hidden shadow-sm">
                       <table className="w-full text-left text-xs">
                          <thead className="bg-slate-50 border-b font-black uppercase tracking-widest text-slate-400">
                             <tr>
                                <th className="px-6 py-4">Invoice #</th>
                                <th className="px-6 py-4">Date</th>
                                <th className="px-6 py-4">Customer</th>
                                <th className="px-6 py-4 text-right">Qty Sold</th>
                                <th className="px-6 py-4 text-right">Amount</th>
                             </tr>
                          </thead>
                          <tbody className="divide-y">
                             {productInvoices.length === 0 ? (
                               <tr><td colSpan={5} className="px-6 py-10 text-center italic text-slate-300 font-black uppercase tracking-widest">No Sales Recorded</td></tr>
                             ) : productInvoices.map((inv: any) => (
                               <tr key={inv.id} className="hover:bg-slate-50 transition-colors cursor-pointer" onClick={() => onNavigateToInvoices(inv.number)}>
                                  <td className="px-6 py-4 font-bold text-[#00A09D]">{inv.number}</td>
                                  <td className="px-6 py-4 text-slate-500">{inv.date}</td>
                                  <td className="px-6 py-4 font-medium">{(store.contacts || []).find((c:any)=>c.id===inv.customerId)?.name}</td>
                                  <td className="px-6 py-4 text-right font-black">{(inv.items || []).find((i:any)=>i.productId===editingId)?.quantity}</td>
                                  <td className="px-6 py-4 text-right font-black">{formatBDT(inv.total)}</td>
                               </tr>
                             ))}
                          </tbody>
                       </table>
                    </div>
                  </div>
                )}

                {activeTab === 'audit' && (
                  <div className="col-span-2 space-y-4 animate-in fade-in duration-300">
                     <div className="bg-slate-50 border rounded-2xl p-6">
                       <h4 className="text-xs font-black uppercase tracking-widest text-slate-400 mb-4 flex items-center">
                         <Settings className="w-3 h-3 mr-2" />
                         Activity Log & Audit Trail
                       </h4>
                       <div className="space-y-3">
                         {(() => {
                           const prod = (store.products || []).find((p: any) => p.id === editingId);
                           const logs = (prod?.messages || [])
                             .filter((m: any) => m.type === 'notification')
                             .sort((a: any, b: any) => String(b.date || '').localeCompare(String(a.date || '')));
                           
                           if (logs.length === 0) {
                             return <p className="text-[10px] text-slate-400 italic text-center py-10 uppercase tracking-widest font-black">No changes recorded yet.</p>;
                           }

                           return logs.map((log: any) => {
                             const author = { name: store.resolveUserName(log.authorId) };
                             return (
                               <div key={log.id} className="bg-white border border-slate-100 p-3 rounded-xl shadow-sm flex items-start space-x-3 group hover:border-[#00A09D] transition-colors">
                                 <div className="w-8 h-8 rounded-full bg-[#00A09D]/10 flex items-center justify-center shrink-0 border border-[#00A09D]/20">
                                   <span className="text-[10px] font-black text-[#00A09D] uppercase">{author?.name?.charAt(0) || 'U'}</span>
                                 </div>
                                 <div className="flex-1 min-w-0">
                                   <div className="flex justify-between items-baseline mb-1">
                                     <span className="text-[11px] font-black text-slate-800 truncate">{author?.name || 'System User'}</span>
                                     <span className="text-[9px] text-slate-400 font-medium">{log.date}</span>
                                   </div>
                                   <p className="text-[11px] text-slate-600 font-medium leading-relaxed">{log.body}</p>
                                 </div>
                               </div>
                             );
                           });
                         })()}
                       </div>
                     </div>
                  </div>
                )}
             </div>

              {showAdvancedManagement && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[100] animate-in fade-in duration-200">
                  <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
                    <div className="bg-[#f8fafc] border-b px-6 py-4 flex justify-between items-center">
                      <h3 className="text-sm font-black uppercase tracking-widest text-slate-800 flex items-center">
                        <Tag className="w-4 h-4 mr-2 text-[#714B67]" />
                        Manage {showAdvancedManagement === 'category' ? 'Categories' : 'Brands'}
                      </h3>
                      <button onClick={() => setShowAdvancedManagement(null)} className="text-slate-400 hover:text-slate-600 transition-colors">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M6 18L18 6M6 6l12 12"/></svg>
                      </button>
                    </div>
                    <div className="p-6 space-y-6">
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input 
                          type="text" 
                          placeholder={`Search or add new ${showAdvancedManagement}...`} 
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[#714B67] transition-all"
                          value={managementSearch}
                          onChange={e => setManagementSearch(e.target.value)}
                        />
                      </div>

                      <div className="max-h-60 overflow-y-auto divide-y border rounded-xl bg-white shadow-inner">
                        {(() => {
                           const items = showAdvancedManagement === 'category' ? categories : brands;
                           const filtered = (items || []).filter(it => it.toLowerCase().includes(managementSearch.toLowerCase()));
                           
                           if (filtered.length === 0 && managementSearch) {
                             return (
                               <button 
                                 onClick={() => {
                                   if (showAdvancedManagement === 'category') setFormData({...formData, category: managementSearch});
                                   else setFormData({...formData, brand: managementSearch});
                                   setShowAdvancedManagement(null);
                                   setManagementSearch('');
                                 }}
                                 className="w-full p-4 text-left hover:bg-[#714B67]/5 transition-colors group flex items-center justify-between"
                               >
                                 <div>
                                   <p className="text-xs font-bold text-slate-800 uppercase tracking-tighter">Create New: <span className="text-[#714B67]">{managementSearch}</span></p>
                                   <p className="text-[10px] text-slate-400">Click to add this as a new {showAdvancedManagement}</p>
                                 </div>
                                 <Plus className="w-4 h-4 text-[#714B67] opacity-100 transition-opacity transition-opacity" />
                               </button>
                             );
                           }

                           return filtered.map(item => (
                             <button 
                               key={item}
                               onClick={() => {
                                 if (showAdvancedManagement === 'category') setFormData({...formData, category: item});
                                 else setFormData({...formData, brand: item});
                                 setShowAdvancedManagement(null);
                                 setManagementSearch('');
                               }}
                               className="w-full p-3 font-bold text-xs text-slate-700 hover:bg-[#714B67]/5 hover:text-[#714B67] transition-all text-left flex justify-between items-center group uppercase tracking-widest"
                             >
                               {item}
                               {managementSearch && item.toLowerCase() === managementSearch.toLowerCase() && (
                                 <span className="text-[9px] bg-[#714B67] text-white px-2 py-0.5 rounded-full">Exact Match</span>
                               )}
                             </button>
                           ));
                        })()}
                      </div>
                      
                      <div className="flex justify-end pt-2">
                        <button 
                          onClick={() => setShowAdvancedManagement(null)}
                          className="text-[11px] font-black uppercase tracking-widest text-[#714B67] hover:underline"
                        >
                          Close Window
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

             {editingId && (
               <div className="mt-20 pt-10 border-t">
                 <Chatter 
                   messages={(store.products || []).find((p:any)=>p.id===editingId)?.messages || []} 
                   users={store.users} 
                   onSendMessage={(body) => store.updateProduct(editingId, { 
                     messages: [...((store.products || []).find((p:any)=>p.id===editingId)?.messages || []), {
                       id: generateUUID(),
                       authorId: store.currentUser?.id || 'user-1',
                       body,
                       date: formatDateTime(new Date()),
                       type: 'comment'
                     }]
                   })}
                   entityType="Product"
                 />
               </div>
             )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-[#F1F1F1] overflow-hidden animate-in fade-in duration-500">
      <div className="bg-white border-b px-6 py-3 flex flex-col space-y-4 shrink-0 shadow-sm z-30">
        <div className="w-full">
          <SmartFilterBar 
            title={
              <div className="flex items-center space-x-2 text-sm text-slate-400">
                <span className="hover:text-[#00A09D] cursor-pointer">Inventory</span>
                <span>/</span>
                <span className="text-slate-800 font-bold text-lg">Products</span>
              </div>
            }
            actions={
              <>
                <button onClick={handleNew} className="bg-[#714B67] text-white px-4 py-1.5 rounded-md text-xs font-bold shadow-md hover:brightness-110 active:scale-95 transition-all">New</button>
                <button onClick={() => setShowImportModal(true)} className="bg-white border border-slate-300 text-slate-700 px-4 py-1.5 rounded-md text-xs font-bold hover:bg-slate-50 transition-all">Import</button>
                <button 
                  onClick={onNavigateToAdjustment} 
                  className="bg-white border border-slate-300 text-[#714B67] px-4 py-1.5 rounded-md text-xs font-bold hover:bg-slate-50 transition-all flex items-center space-x-2"
                >
                  <Package className="w-3 h-3" />
                  <span>Inventory Adj.</span>
                </button>
                <div className="flex items-center bg-slate-100 rounded-md border ml-2">
                  <button 
                    onClick={() => exportToXLSXLocal(paginatedProducts, `products_page_${currentPage}`)}
                    className="px-2 py-1.5 text-[9px] font-black uppercase tracking-widest text-emerald-600 hover:text-emerald-700 border-r"
                  >
                    Excel Page
                  </button>
                  <button 
                    onClick={() => exportToXLSXLocal(filteredProducts, 'all_products')}
                    className="px-2 py-1.5 text-[9px] font-black uppercase tracking-widest text-emerald-600 hover:text-emerald-700"
                  >
                    Excel All
                  </button>
                </div>
                <button 
                  onClick={() => exportToPDF(filteredProducts, 'Product_List')}
                  className="bg-slate-900 text-white px-4 py-1.5 rounded-md text-xs font-bold shadow-md hover:bg-slate-800 flex items-center space-x-2"
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"/></svg>
                  <span>Smart PDF</span>
                </button>
                <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border ml-2">
                  <button onClick={() => setViewMode('kanban')} className={`p-1 rounded-md transition-all ${viewMode === 'kanban' ? 'bg-white shadow text-[#00A09D]' : 'text-slate-400 hover:text-slate-600'}`}><svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path d="M5 3a2 2 0 00-2 2v2a2 2 0 002-2h2a2 2 0 002-2V5a2 2 0 00-2-2H5zM5 11a2 2 0 00-2 2v2a2 2 0 002-2h2a2 2 0 002-2V5a2 2 0 00-2-2H5zM11 5a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V5zM11 13a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V5zM11 13a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"/></svg></button>
                  <button onClick={() => setViewMode('list')} className={`p-1 rounded-md transition-all ${viewMode === 'list' ? 'bg-white shadow text-[#00A09D]' : 'text-slate-400 hover:text-slate-600'}`}><svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M3 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd"/></svg></button>
                </div>
              </>
            }
            filters={filterState} 
            setFilters={setFilterState} 
            products={store.products || []}
            type="product"
            placeholder="Search by Product Name, SKU..."
          />
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6 relative">
        {selectedIds.size > 0 && (
          <div className="fixed bottom-10 left-1/2 -translate-x-1/2 bg-slate-900 text-white px-8 py-4 rounded-2xl shadow-2xl z-[100] flex items-center space-x-8 animate-in slide-in-from-bottom-10">
            <div className="flex items-center space-x-3 border-r border-white/20 pr-8">
              <span className="bg-indigo-500 w-8 h-8 rounded-full flex items-center justify-center text-xs font-black">{selectedIds.size}</span>
              <span className="text-sm font-bold uppercase tracking-widest">Products Selected</span>
            </div>
            <div className="flex items-center space-x-4">
              <button 
                onClick={() => {
                  const selectedProducts = (store.products || []).filter((p: any) => selectedIds.has(p.id));
                  generateBarcodePDF(selectedProducts);
                }}
                className="flex items-center space-x-2 text-xs font-black uppercase tracking-widest hover:text-[#00A09D] transition-colors"
              >
                <Barcode className="w-4 h-4" />
                <span>Barcodes</span>
              </button>
              {selectedIds.size > 1 && (
                <button 
                  onClick={() => setShowMergeModal(true)}
                  className="flex items-center space-x-2 text-xs font-black uppercase tracking-widest hover:text-indigo-400 transition-colors"
                >
                  <Merge className="w-4 h-4" />
                  <span>Merge</span>
                </button>
              )}
              <button 
                onClick={() => {
                  if (deleteConfirm) {
                    store.deleteProducts(Array.from(selectedIds));
                    setSelectedIds(new Set());
                    setDeleteConfirm(false);
                  } else {
                    setDeleteConfirm(true);
                    setTimeout(() => setDeleteConfirm(false), 3000);
                  }
                }}
                className="text-xs font-black uppercase tracking-widest hover:text-rose-400 transition-colors"
              >
                {deleteConfirm ? 'Confirm Delete' : 'Delete'}
              </button>
              <button 
                onClick={() => setSelectedIds(new Set())}
                className="text-xs font-black uppercase tracking-widest hover:text-slate-400 transition-colors"
              >
                Clear
              </button>
            </div>
          </div>
        )}

        {viewMode === 'kanban' ? (
          <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-6">
              {paginatedProducts.map((p: Product) => {
                const margin = calculateMargin(p.price, p.costPrice);
                return (
                <div 
                  key={p.id}
                  onClick={() => {
                    setEditingId(p.id);
                    setFormData({
                      externalId: p.externalId || '',
                      name: p.name,
                      sku: p.sku,
                      price: p.price,
                      costPrice: p.costPrice,
                      lastPurchasePrice: p.lastPurchasePrice || 0,
                      quantityOnHand: p.quantityOnHand,
                      category: p.category || 'All',
                      type: p.type,
                      description: p.description || '',
                      canBeSold: p.canBeSold,
                      canBePurchased: p.canBePurchased,
                      uom: p.uom || 'Units',
                      brand: p.brand || '',
                      trackingType: p.trackingType || 'NONE',
                      serialNumbers: p.serialNumbers || [],
                      companyIds: p?.companyIds || [],
                    });
                    setShowForm(true);
                  }}
                  className={`bg-white rounded-xl shadow-sm border p-4 flex flex-col space-y-4 hover:shadow-xl hover:-translate-y-1 transition-all cursor-pointer relative group ${selectedIds.has(p.id) ? 'ring-2 ring-[#00A09D] border-transparent' : 'border-slate-200'}`}
                >
                  <div className="flex justify-between items-start">
                    <div className="w-16 h-16 bg-slate-100 rounded-lg flex items-center justify-center text-slate-300">
                      <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-black text-[#00A09D]">{formatBDT(p.price)}</p>
                      <span className={`inline-block px-2 py-0.5 rounded text-[9px] font-bold uppercase mt-1 ${p.quantityOnHand > 5 ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                        {p.quantityOnHand} On Hand
                      </span>
                    </div>
                  </div>
                  <div>
                    <h4 className="font-bold text-slate-800 line-clamp-1 group-hover:text-[#00A09D] transition-colors">{p.name}</h4>
                    <div className="flex items-center space-x-2 mt-2">
                      <span className={`text-[10px] font-black px-2 py-0.5 rounded ${margin > 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
                        Margin: {margin.toFixed(1)}%
                      </span>
                      <span className="text-[10px] text-slate-400 italic">Purchase Rate: {formatBDT(p.lastPurchasePrice || 0)}</span>
                    </div>
                    <div className="flex items-center space-x-2 mt-2">
                      <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">{p.category || 'All'}</span>
                      {p.brand && <span className="text-[9px] font-black uppercase tracking-widest text-[#714B67] bg-[#714B67]/10 px-1.5 py-0.5 rounded">{p.brand}</span>}
                    </div>
                  </div>
                </div>
              )})}
            </div>

            <Pagination 
              currentPage={currentPage}
              totalPages={totalPages}
              totalItems={totalProducts}
              itemsPerPage={pageSize}
              onPageChange={setCurrentPage}
              onItemsPerPageChange={setPageSize}
            />
          </div>
        ) : (
          <div className="space-y-6">
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden overflow-x-auto">
              <div 
                className="min-w-[800px] grid" 
                style={{ 
                  gridTemplateColumns: `48px ${columns.filter(c => c.visible).map(c => {
                    if (c.id === 'name') return 'minmax(200px, 2fr)';
                    if (c.id === 'qty' || c.id === 'margin') return 'minmax(80px, 1fr)';
                    return 'minmax(120px, 1fr)';
                  }).join(' ')} 48px` 
                }}
              >
                {/* Header Row */}
                <div className="contents">
                  <div className="p-4 bg-[#2B333E] sticky top-0 z-10 flex items-center justify-center">
                    <input type="checkbox" className="rounded border-slate-600 bg-transparent text-[#00A09D] focus:ring-[#00A09D]" checked={selectedIds.size > 0 && selectedIds.size === paginatedProducts.length} onChange={() => { if (selectedIds.size === paginatedProducts.length) setSelectedIds(new Set()); else setSelectedIds(new Set(paginatedProducts.map(p => p.id))); }} />
                  </div>
                  {columns.filter(c => c.visible).map(col => (
                    <div 
                      key={col.id} 
                      className={`p-4 bg-[#2B333E] sticky top-0 z-10 flex items-center text-white text-[11px] font-bold uppercase tracking-wider cursor-move select-none ${getColumnAlignment(col.id)}`}
                      draggable
                      onDragStart={(e) => handleDragStart(e, col.id)}
                      onDragOver={handleDragOver}
                      onDrop={(e) => handleDrop(e, col.id)}
                    >
                      {col.label}
                    </div>
                  ))}
                  <div className="p-4 bg-[#2B333E] sticky top-0 z-10 flex items-center justify-center">
                    <ColumnSelector columns={columns} onChange={setColumns} />
                  </div>
                </div>

                {/* Body Rows */}
                {paginatedProducts.map((p: Product) => (
                  <div 
                    key={p.id} 
                    className="contents group cursor-pointer"
                    onClick={() => {
                      setEditingId(p.id);
                      setFormData({
                        externalId: p.externalId || '',
                        name: p.name,
                        sku: p.sku,
                        price: p.price,
                        costPrice: p.costPrice,
                        lastPurchasePrice: p.lastPurchasePrice || 0,
                        quantityOnHand: p.quantityOnHand,
                        category: p.category || 'All',
                        type: p.type,
                        description: p.description || '',
                        canBeSold: p.canBeSold,
                        canBePurchased: p.canBePurchased,
                        uom: p.uom || 'Units',
                        brand: p.brand || '',
                        trackingType: p.trackingType || 'NONE',
                        serialNumbers: p.serialNumbers || [],
                        companyIds: p?.companyIds || [],
                      });
                      setShowForm(true);
                    }}
                  >
                    <div className={`p-4 border-b border-slate-100 flex items-center justify-center transition-colors ${selectedIds.has(p.id) ? 'bg-[#E0F2F1]' : 'group-hover:bg-[#f2f6f9]'}`} onClick={e => { e.stopPropagation(); toggleSelectOne(p.id); }}>
                      <input type="checkbox" className="rounded border-slate-300 text-[#00A09D] focus:ring-[#00A09D]" checked={selectedIds.has(p.id)} onChange={() => toggleSelectOne(p.id)} />
                    </div>
                    {columns.filter(c => c.visible).map(col => (
                      <div key={col.id} className={`p-4 border-b border-slate-100 flex items-center transition-colors ${selectedIds.has(p.id) ? 'bg-[#E0F2F1]' : 'group-hover:bg-[#f2f6f9]'} ${getColumnAlignment(col.id)}`}>
                        {renderCell(p, col.id)}
                      </div>
                    ))}
                    <div className={`p-4 border-b border-slate-100 flex items-center justify-center transition-colors ${selectedIds.has(p.id) ? 'bg-[#E0F2F1]' : 'group-hover:bg-[#f2f6f9]'}`}>
                      {/* Empty space for the settings column */}
                    </div>
                  </div>
                ))}
                
                {/* Footer Row */}
                <div className="contents">
                  <div className="p-4 bg-slate-50 border-t-2 border-slate-200 flex items-center justify-center"></div>
                  {columns.filter(c => c.visible).map((col, idx) => (
                    <div key={col.id} className={`p-4 bg-slate-50 border-t-2 border-slate-200 flex items-center text-slate-800 ${getColumnAlignment(col.id)}`}>
                      {renderFooterCell(col.id, idx, columns.filter(c => c.visible))}
                    </div>
                  ))}
                  <div className="p-4 bg-slate-50 border-t-2 border-slate-200"></div>
                </div>
              </div>
            </div>

            <Pagination 
              currentPage={currentPage}
              totalPages={totalPages}
              totalItems={totalProducts}
              itemsPerPage={pageSize}
              onPageChange={setCurrentPage}
              onItemsPerPageChange={setPageSize}
            />
          </div>
        )}
        {showImportModal && (
          <ExcelImporter 
            onImport={(data) => {
              data.forEach(p => {
                const companyIds = (p?.companyIds && p?.companyIds.length > 0) 
                  ? p?.companyIds 
                  : (store.activeCompanyIds.length > 0 ? store.activeCompanyIds : [store.companies[0]?.id].filter(Boolean));
                
                store.addProduct({
                  ...p,
                  companyIds
                });
              });
              setShowImportModal(false);
            }} 
            onClose={() => setShowImportModal(false)} 
          />
        )}
        {showMergeModal && (
          <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex justify-center items-center z-[150] p-4">
            <div className="bg-white rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl flex flex-col">
              <div className="bg-slate-50 border-b p-6">
                <h2 className="text-xl font-bold text-slate-800 uppercase tracking-wider">Merge Products</h2>
                <p className="text-xs text-slate-500 mt-2 font-medium">Select the master product to retain. The others will be consolidated into the master and deleted.</p>
              </div>
              <div className="p-6 overflow-y-auto max-h-[60vh] flex-1 border-t border-slate-100">
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-3">Master Product</label>
                <div className="space-y-3">
                  {Array.from(selectedIds).map(id => {
                    const prod = store.products?.find((p: any) => p.id === id);
                    if (!prod) return null;
                    return (
                      <label key={id} className={`flex items-start p-4 rounded-xl border-2 cursor-pointer transition-all ${masterProductId === id ? 'border-indigo-500 bg-indigo-50/50' : 'border-slate-200 hover:border-slate-300 bg-white'}`}>
                        <input type="radio" name="masterProduct" value={id} checked={masterProductId === id} onChange={(e) => setMasterProductId(e.target.value)} className="mt-1 text-indigo-600 focus:ring-indigo-500 border-slate-300" />
                        <div className="ml-3">
                          <p className="text-sm font-bold text-slate-800">{prod.name}</p>
                          <div className="text-xs text-slate-500 mt-1 flex space-x-3">
                            {prod.sku && <span>SKU: {prod.sku}</span>}
                            <span>Stock: {prod.quantityOnHand || 0}</span>
                            <span>Cost: {prod.costPrice || 0}</span>
                          </div>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>
              <div className="bg-slate-50 border-t p-4 flex justify-end space-x-3">
                <button onClick={() => { setShowMergeModal(false); setMasterProductId(''); }} className="px-5 py-2.5 text-xs font-black uppercase tracking-widest text-slate-500 hover:bg-slate-200 rounded-lg transition-colors">Cancel</button>
                <button 
                  disabled={!masterProductId}
                  onClick={async () => {
                    const duplicates = Array.from(selectedIds).filter(id => id !== masterProductId);
                    try {
                      await store.mergeProducts(duplicates, masterProductId);
                      setShowMergeModal(false);
                      setSelectedIds(new Set());
                      setMasterProductId('');
                      window.dispatchEvent(new CustomEvent('app-toast', { detail: { message: "Products merged successfully", type: 'success' } }));
                    } catch (e: any) {
                      window.dispatchEvent(new CustomEvent('app-toast', { detail: { message: e.message, type: 'error' } }));
                    }
                  }} 
                  className="bg-indigo-600 shadow border-b-2 border-indigo-700 text-white px-5 py-2.5 text-xs font-black uppercase tracking-widest rounded-lg hover:bg-indigo-700 active:translate-y-[2px] active:border-b-0 transition-all focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Merge Products
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ProductList;
