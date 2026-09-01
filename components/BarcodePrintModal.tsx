
import React, { useState, useMemo } from 'react';
import { X, Barcode, Filter, Check, Search, Tag, Hash } from 'lucide-react';
import { Product } from '../types';
import { generateBarcodePDF } from '../services/barcodeService';

interface BarcodePrintModalProps {
  isOpen: boolean;
  onClose: () => void;
  products: Product[];
}

const BarcodePrintModal: React.FC<BarcodePrintModalProps> = ({ isOpen, onClose, products }) => {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('All');
  const [brand, setBrand] = useState('All');
  const [includeSerials, setIncludeSerials] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const categories = useMemo(() => {
    const cats = new Set<string>(['All']);
    products.forEach(p => { if (p.category) cats.add(p.category); });
    return Array.from(cats).sort();
  }, [products]);

  const brands = useMemo(() => {
    const bnds = new Set<string>(['All']);
    products.forEach(p => { if (p.brand) bnds.add(p.brand); });
    return Array.from(bnds).sort();
  }, [products]);

  const filtered = useMemo(() => {
    return products.filter(p => {
      const matchesSearch = String(p.name || '').toLowerCase().includes(search.toLowerCase()) || 
                            String(p.sku || '').toLowerCase().includes(search.toLowerCase());
      const matchesCategory = category === 'All' || p.category === category;
      const matchesBrand = brand === 'All' || p.brand === brand;
      return matchesSearch && matchesCategory && matchesBrand;
    });
  }, [products, search, category, brand]);

  const handleToggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const handleSelectAll = () => {
    if (selectedIds.size === filtered.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map(p => p.id)));
    }
  };

  const handlePrint = () => {
    const selectedProducts = products.filter(p => selectedIds.has(p.id));
    if (selectedProducts.length === 0) return alert('Please select products to print');
    generateBarcodePDF(selectedProducts, { includeSerials });
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
      <div className="bg-[#1a1c23] border border-slate-700 w-full max-w-4xl rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="p-6 border-b border-slate-700 flex justify-between items-center bg-[#242731]">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-indigo-500/20 rounded-xl flex items-center justify-center">
              <Barcode className="text-indigo-400 w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-black text-white uppercase tracking-widest">Advanced Barcode Printing</h2>
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Bulk Label Generation with SAP-style filtering</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-700 rounded-full transition-colors">
            <X className="text-slate-400 w-5 h-5" />
          </button>
        </div>

        <div className="p-6 bg-[#1a1c23] border-b border-slate-700 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-1">
            <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest flex items-center">
              <Search size={10} className="mr-1" /> Search Products
            </label>
            <input 
              type="text" 
              className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-xs font-bold text-white outline-none focus:border-indigo-500"
              placeholder="Name or SKU..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest flex items-center">
              <Tag size={10} className="mr-1" /> Category
            </label>
            <select 
              className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-xs font-bold text-white outline-none focus:border-indigo-500"
              value={category || ""}
              onChange={e => setCategory(e.target.value)}
            >
              {categories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest flex items-center">
              <Filter size={10} className="mr-1" /> Brand
            </label>
            <select 
              className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-xs font-bold text-white outline-none focus:border-indigo-500"
              value={brand || ""}
              onChange={e => setBrand(e.target.value)}
            >
              {brands.map(b => <option key={b} value={b}>{b}</option>)}
            </select>
          </div>
        </div>

        <div className="p-4 bg-indigo-500/5 border-b border-slate-700 flex items-center justify-between">
          <div className="flex items-center space-x-6">
            <label className="flex items-center space-x-2 cursor-pointer group">
              <div 
                onClick={() => setIncludeSerials(!includeSerials)}
                className={`w-5 h-5 rounded border flex items-center justify-center transition-all ${includeSerials ? 'bg-indigo-500 border-indigo-400' : 'border-slate-600 group-hover:border-slate-400'}`}
              >
                {includeSerials && <Check size={12} className="text-white" />}
              </div>
              <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest">Print Labels for Serial Numbers</span>
            </label>
          </div>
          <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
            {selectedIds.size} of {filtered.length} products selected
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-0">
          <table className="w-full text-left border-collapse">
            <thead className="sticky top-0 bg-[#242731] z-10 shadow-sm">
              <tr>
                <th className="p-4 w-10">
                  <div 
                    onClick={handleSelectAll}
                    className={`w-4 h-4 rounded border flex items-center justify-center cursor-pointer transition-all ${selectedIds.size === filtered.length && filtered.length > 0 ? 'bg-indigo-500 border-indigo-400' : 'border-slate-600'}`}
                  >
                    {selectedIds.size === filtered.length && filtered.length > 0 && <Check size={10} className="text-white" />}
                  </div>
                </th>
                <th className="p-4 text-[9px] font-black text-slate-500 uppercase tracking-widest">Product Info</th>
                <th className="p-4 text-[9px] font-black text-slate-500 uppercase tracking-widest">SKU</th>
                <th className="p-4 text-[9px] font-black text-slate-500 uppercase tracking-widest">Stock / Serials</th>
                <th className="p-4 text-[9px] font-black text-slate-500 uppercase tracking-widest text-right">Price</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {filtered.map(product => (
                <tr 
                  key={product.id} 
                  onClick={() => handleToggleSelect(product.id)}
                  className={`hover:bg-slate-800/50 cursor-pointer transition-colors ${selectedIds.has(product.id) ? 'bg-indigo-500/5' : ''}`}
                >
                  <td className="p-4">
                    <div className={`w-4 h-4 rounded border flex items-center justify-center transition-all ${selectedIds.has(product.id) ? 'bg-indigo-500 border-indigo-400' : 'border-slate-700'}`}>
                      {selectedIds.has(product.id) && <Check size={10} className="text-white" />}
                    </div>
                  </td>
                  <td className="p-4">
                    <div className="text-xs font-bold text-slate-200">{product.name}</div>
                    <div className="text-[9px] font-black text-slate-500 uppercase tracking-widest">{product.category} | {product.brand || 'No Brand'}</div>
                  </td>
                  <td className="p-4 text-xs font-mono text-indigo-400">{product.sku}</td>
                  <td className="p-4">
                    <div className="flex items-center space-x-2">
                      <Hash size={12} className="text-slate-500" />
                      <span className="text-xs font-bold text-slate-300">{product.quantityOnHand || 0}</span>
                      {product.trackingType === 'SERIAL' && (
                        <span className="bg-amber-500/10 text-amber-500 text-[8px] font-black px-1.5 py-0.5 rounded uppercase tracking-tighter">
                          {product.serialNumbers?.length || 0} Serials
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="p-4 text-xs font-bold text-slate-200 text-right">${(product.price || 0).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="p-6 border-t border-slate-700 bg-[#242731] flex justify-between items-center">
          <button 
            onClick={onClose}
            className="px-6 py-2 text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button 
            onClick={handlePrint}
            disabled={selectedIds.size === 0}
            className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white px-8 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-indigo-500/20 transition-all flex items-center space-x-2"
          >
            <Barcode size={16} />
            <span>Generate Labels ({selectedIds.size})</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default BarcodePrintModal;
