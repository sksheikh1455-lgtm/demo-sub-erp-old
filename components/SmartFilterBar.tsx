import { getOpDateBST } from '../constants';

import React, { useState, useMemo } from 'react';
import { Search, Filter, X, ChevronDown, Calendar, User, Tag, Hash, Percent, RotateCcw, Check } from 'lucide-react';

export interface SmartFilterState {
  searchQuery: string;
  startDate: string;
  endDate: string;
  datePreset: string;
  productId?: string;
  contactId?: string;
  status?: string;
  salesperson?: string;
  deliveryPerson?: string;
  sr?: string;
  createdById?: string;
  reference?: string;
  minAmount?: string;
  maxAmount?: string;
  brand?: string;
  category?: string;
  expenseType?: string;
  paymentCategory?: string;
  type?: string;
  selectedCategories?: string[];
  selectedBrands?: string[];
  minQty?: string;
  maxQty?: string;
  showDeleted?: boolean;
  canBeSold?: boolean | null;
  canBePurchased?: boolean | null;
}

interface SmartFilterBarProps {
  filters: SmartFilterState;
  setFilters: (filters: SmartFilterState) => void;
  products?: any[];
  contacts?: any[];
  users?: any[];
  statuses?: { id: string; label: string }[];
  type: 'invoice' | 'bill' | 'payment' | 'expense' | 'credit_note' | 'product';
  placeholder?: string;
  title?: React.ReactNode;
  actions?: React.ReactNode;
}

export const SmartSearch: React.FC<{
  options: { id: string; label: string; sublabel?: string; searchKey: string }[];
  value: string | string[];
  onChange: (val: any) => void;
  placeholder: string;
  label: string;
  icon: React.ReactNode;
  multi?: boolean;
}> = ({ options, value, onChange, placeholder, label, icon, multi }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  
  const isSelected = (id: string) => {
    if (multi && Array.isArray(value)) {
      return value.includes(id);
    }
    return value === id;
  };

  const selectedLabels = useMemo(() => {
    if (multi && Array.isArray(value)) {
      if (value.length === 0) return null;
      if (value.length === 1) return options.find(o => o.id === value[0])?.label;
      return `${value.length} Selected`;
    }
    return options.find(o => o.id === value)?.label;
  }, [value, options, multi]);

  const filteredOptions = useMemo(() => {
    const searchTerms = search.toLowerCase().split(/\s+/).filter(Boolean);
    const filtered = (options || []).filter(o => {
      const target = String(o.searchKey || '').toLowerCase();
      return searchTerms.length === 0 ? true : searchTerms.every(term => target.includes(term));
    });
    const seen = new Set<string>();
    return filtered.filter(o => {
      if (!o || !o.id) return false;
      if (seen.has(o.id)) return false;
      seen.add(o.id);
      return true;
    }).slice(0, 50);
  }, [options, search]);

  const toggleOption = (id: string) => {
    if (multi && Array.isArray(value)) {
      const next = value.includes(id) ? value.filter(x => x !== id) : [...value, id];
      onChange(next);
    } else {
      onChange(id);
      setIsOpen(false);
      setSearch('');
    }
  };

  return (
    <div className="space-y-1.5 relative">
      <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center ml-1">
        {icon} <span className="ml-1.5">{label}</span>
      </label>
      <div 
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full bg-[#1a1c23] border rounded-lg px-3 py-2 text-[11px] outline-none transition-all cursor-pointer flex justify-between items-center hover:border-slate-500 ${
          isOpen ? 'border-[#00A09D] ring-2 ring-[#00A09D]/20' : 'border-slate-700'
        } ${isSelected('') === false ? 'border-[#00A09D]/50 bg-[#00A09D]/5' : ''}`}
      >
        <span className="truncate font-medium">
          {selectedLabels ? (
            <span className="text-slate-200">{selectedLabels}</span>
          ) : (
            <span className="text-slate-600 italic">{placeholder}</span>
          )}
        </span>
        <ChevronDown size={14} className={`text-slate-500 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
      </div>
      
      {isOpen && (
        <div className="absolute z-[100] mt-2 w-full min-w-[240px] bg-[#242731] border border-slate-700 rounded-xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] overflow-hidden animate-in fade-in zoom-in-95 duration-200">
          <div className="p-3 border-b border-slate-700 bg-[#1a1c23]/50">
            <div className="relative">
              <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input 
                autoFocus
                className="w-full pl-8 pr-3 py-2 bg-[#242731] border border-slate-700 rounded-lg text-[11px] font-medium outline-none focus:border-[#00A09D] transition-all"
                placeholder={`Search ${label}...`}
                value={search}
                onChange={e => setSearch(e.target.value)}
                onClick={e => e.stopPropagation()}
              />
            </div>
          </div>
          <div className="max-h-64 overflow-y-auto custom-scrollbar">
            {!multi && (
              <div 
                onClick={() => { onChange(''); setIsOpen(false); setSearch(''); }}
                className={`px-4 py-2.5 hover:bg-slate-700/50 cursor-pointer text-[11px] font-bold border-b border-slate-700/30 transition-colors ${!value ? 'text-[#00A09D] bg-[#00A09D]/5' : 'text-slate-400'}`}
              >
                All {label}s
              </div>
            )}
            {multi && (
              <div className="flex justify-between items-center px-4 py-2 border-b border-slate-700/30 bg-[#1a1c23]/30">
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    const searchTerms = search.toLowerCase().split(/\s+/).filter(Boolean);
                    const allIds = (options || []).filter(o => {
                      const target = String(o.searchKey || '').toLowerCase();
                      return searchTerms.length === 0 ? true : searchTerms.every(term => target.includes(term));
                    }).map(o => o.id);
                    onChange(Array.from(new Set([...(value as string[]), ...allIds])));
                  }}
                  className="text-[9px] font-black text-[#00A09D] uppercase tracking-widest hover:text-[#00c2be] transition-colors"
                >
                  Select All
                </button>
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    onChange([]);
                  }}
                  className="text-[9px] font-black text-rose-500 uppercase tracking-widest hover:text-rose-400 transition-colors"
                >
                  Clear
                </button>
              </div>
            )}
            <div className="py-1">
              {filteredOptions.length > 0 ? (
                filteredOptions.map(opt => (
                  <div 
                    key={opt.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleOption(opt.id);
                    }}
                    className={`px-4 py-2.5 hover:bg-slate-700/50 cursor-pointer flex items-center justify-between transition-colors group ${
                      isSelected(opt.id) ? 'bg-[#00A09D]/10 text-[#00A09D]' : 'text-slate-300'
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] font-bold truncate">{opt.label}</p>
                      {opt.sublabel && (
                        <p className="text-[9px] font-medium text-slate-500 truncate mt-0.5 group-hover:text-slate-400">
                          {opt.sublabel}
                        </p>
                      )}
                    </div>
                    {isSelected(opt.id) && (
                      <div className="ml-3 flex-shrink-0">
                        <Check size={14} className="text-[#00A09D]" />
                      </div>
                    )}
                  </div>
                ))
              ) : (
                <div className="px-4 py-8 text-center">
                  <p className="text-[10px] font-black text-slate-600 uppercase tracking-widest">No matches found</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      {isOpen && <div className="fixed inset-0 z-[90]" onClick={() => setIsOpen(false)} />}
    </div>
  );
};

const SmartFilterBar: React.FC<SmartFilterBarProps> = ({ 
  filters, 
  setFilters, 
  products = [], 
  contacts = [], 
  users = [],
  statuses = [],
  type,
  placeholder,
  title,
  actions
}) => {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const today = getOpDateBST();

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
        return;
    }

    setFilters({ ...filters, datePreset: preset, startDate: start, endDate: end });
  };

  const resetFilters = () => {
    setFilters({
      searchQuery: '',
      startDate: today,
      endDate: today,
      datePreset: 'today',
      productId: '',
      contactId: '',
      status: '',
      salesperson: '',
      reference: '',
      minAmount: '',
      maxAmount: '',
      brand: '',
      category: 'All',
      expenseType: '',
      selectedCategories: [],
      selectedBrands: [],
      minQty: '',
      maxQty: ''
    });
  };

  const uniqueBrands = useMemo(() => {
    const brands = new Set<string>();
    products.forEach(p => {
      if (p.brand) brands.add(p.brand);
    });
    return Array.from(brands).sort();
  }, [products]);

  const uniqueCategories = useMemo(() => {
    const cats = new Set<string>();
    products.forEach(p => {
      if (p.category) cats.add(p.category);
    });
    return Array.from(cats).sort();
  }, [products]);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filters.productId) count++;
    if (filters.contactId) count++;
    if (filters.status) count++;
    if (filters.reference) count++;
    if (filters.minAmount) count++;
    if (filters.maxAmount) count++;
    if (filters.selectedCategories?.length) count++;
    if (filters.selectedBrands?.length) count++;
    if (filters.minQty) count++;
    if (filters.maxQty) count++;
    if (filters.datePreset !== 'all') count++;
    return count;
  }, [filters]);

  const removeFilter = (key: keyof SmartFilterState) => {
    const defaults: Partial<SmartFilterState> = {
      productId: '',
      contactId: '',
      status: '',
      salesperson: '',
      reference: '',
      minAmount: '',
      maxAmount: '',
      selectedCategories: [],
      selectedBrands: [],
      minQty: '',
      maxQty: '',
      datePreset: 'all',
      startDate: '',
      endDate: ''
    };
    setFilters({ ...filters, [key]: defaults[key] });
  };

  const filterTokens = useMemo(() => {
    const tokens: { key: keyof SmartFilterState; label: string; value: string }[] = [];
    
    if (filters.productId && products.length > 0) {
      const p = products.find(x => x.id === filters.productId);
      if (p) tokens.push({ key: 'productId', label: 'Product', value: p.name });
    }
    if (filters.contactId && contacts.length > 0) {
      const c = contacts.find(x => x.id === filters.contactId);
      if (c) tokens.push({ key: 'contactId', label: 'Contact', value: c.name });
    }
    if (filters.status && statuses.length > 0) {
      const s = statuses.find(x => x.id === filters.status);
      if (s) tokens.push({ key: 'status', label: 'Status', value: s.label });
    }
    if (filters.selectedCategories?.length) {
      tokens.push({ key: 'selectedCategories', label: 'Categories', value: `${filters.selectedCategories.length} selected` });
    }
    if (filters.selectedBrands?.length) {
      tokens.push({ key: 'selectedBrands', label: 'Brands', value: `${filters.selectedBrands.length} selected` });
    }
    if (filters.datePreset !== 'all') {
      tokens.push({ key: 'datePreset', label: 'Date', value: filters.datePreset.replace('_', ' ') });
    }
    if (filters.minAmount || filters.maxAmount) {
      tokens.push({ key: 'minAmount', label: 'Amount', value: `${filters.minAmount || 0} - ${filters.maxAmount || '∞'}` });
    }
    if (filters.deliveryPerson) {
      tokens.push({ key: 'deliveryPerson', label: 'Delivery', value: filters.deliveryPerson });
    }
    if (filters.sr) {
      tokens.push({ key: 'sr', label: 'SR', value: filters.sr });
    }
    if (filters.reference) {
      tokens.push({ key: 'reference', label: 'Ref', value: filters.reference });
    }

    return tokens;
  }, [filters, products, contacts, statuses]);

  return (
    <div className="px-4 py-2 bg-[#1a1c23] border-b border-slate-700/50 flex flex-col w-full shadow-lg">
      <div className="flex items-center space-x-3 w-full">
        {title && (
          <div className="flex-shrink-0 mr-2">
            {title}
          </div>
        )}
        
        <div className="flex items-center bg-[#242731] border border-slate-700 rounded-lg px-3 py-1.5 flex-1 min-w-[200px] max-w-md group focus-within:border-[#00A09D] transition-all">
          <Search size={14} className="text-slate-500 mr-2 group-focus-within:text-[#00A09D]" />
          <input 
            type="text" 
            placeholder={placeholder || "Search..."}
            className="bg-transparent outline-none text-xs flex-1 text-slate-200 placeholder:text-slate-600 font-medium"
            value={filters.searchQuery}
            onChange={(e) => setFilters({...filters, searchQuery: e.target.value})}
          />
          {filters.searchQuery && (
            <X 
              size={12} 
              className="text-slate-500 cursor-pointer hover:text-white transition-colors" 
              onClick={() => setFilters({...filters, searchQuery: ''})} 
            />
          )}
        </div>

        {/* Filter Tokens Inline */}
        {filterTokens.length > 0 && (
          <div className="hidden md:flex flex-wrap items-center gap-1.5 flex-1 overflow-hidden">
            {filterTokens.slice(0, 3).map((token) => (
              <div 
                key={token.key}
                className="flex items-center bg-[#242731] border border-slate-700 rounded-full pl-2 pr-1 py-0.5 group hover:border-[#00A09D] transition-all whitespace-nowrap"
              >
                <span className="text-[9px] font-bold text-slate-400 uppercase mr-1">{token.label}:</span>
                <span className="text-[10px] font-bold text-slate-200 mr-1.5">{token.value}</span>
                <button 
                  onClick={() => removeFilter(token.key)}
                  className="p-0.5 rounded-full text-slate-500 hover:bg-rose-500 hover:text-white transition-all"
                >
                  <X size={10} />
                </button>
              </div>
            ))}
            {filterTokens.length > 3 && (
              <span className="text-[9px] font-bold text-slate-500">+{filterTokens.length - 3} more</span>
            )}
            <button 
              onClick={resetFilters}
              className="p-1 text-slate-500 hover:text-rose-500 hover:bg-rose-500/10 rounded-full transition-all ml-1"
              title="Reset All Filters"
            >
              <RotateCcw size={12} />
            </button>
          </div>
        )}

        <div className="flex-1"></div>

        <div className="flex items-center space-x-2 shrink-0">
          <button 
            onClick={() => setShowAdvanced(!showAdvanced)}
            className={`px-3 py-1.5 rounded-lg border transition-all text-[10px] font-black uppercase tracking-widest flex items-center space-x-1.5 relative ${
              showAdvanced || activeFilterCount > 0 
                ? 'bg-[#00A09D]/10 border-[#00A09D] text-[#00A09D]' 
                : 'bg-[#242731] border-slate-700 text-slate-400 hover:text-white hover:border-slate-500'
            }`}
          >
            <Filter size={12} />
            <span>Filters</span>
            {activeFilterCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-[#00A09D] text-white text-[8px] rounded-full flex items-center justify-center border border-[#1a1c23] shadow-lg">
                {activeFilterCount}
              </span>
            )}
          </button>
          
          {actions && (
            <div className="flex items-center space-x-2 border-l border-slate-700 pl-2 ml-2">
              {actions}
            </div>
          )}
        </div>
      </div>

      {showAdvanced && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 p-6 bg-[#242731] rounded-xl border border-slate-700 animate-in slide-in-from-top-2 duration-200 shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 left-0 w-1 h-full bg-[#00A09D]" />
          {products.length > 0 && (
            <SmartSearch 
              label="Product"
              icon={<Tag size={10} className="mr-1" />}
              placeholder="Search Product..."
              value={filters.productId || ''}
              onChange={(val) => setFilters({...filters, productId: val})}
              options={(products || []).map((p: any) => ({
                id: p.id,
                label: p.name,
                sublabel: p.sku,
                searchKey: `${p.name} ${p.sku}`
              }))}
            />
          )}

          {contacts.length > 0 && (
            <>
              {(contacts || []).some(c => c.type === 'CUSTOMER') && (
                <SmartSearch 
                  label="Customer"
                  icon={<User size={10} className="mr-1" />}
                  placeholder="Filter by Customer..."
                  value={filters.contactId && contacts.find(c => c.id === filters.contactId)?.type === 'CUSTOMER' ? filters.contactId : ''}
                  onChange={(val) => setFilters({...filters, contactId: val})}
                  options={(contacts || []).filter(c => c.type === 'CUSTOMER').map((c: any) => ({
                    id: c.id,
                    label: c.name,
                    sublabel: c.email,
                    searchKey: `${c.name} ${c.email || ''}`
                  }))}
                />
              )}
              {(contacts || []).some(c => c.type === 'VENDOR') && (
                <SmartSearch 
                  label="Vendor"
                  icon={<User size={10} className="mr-1" />}
                  placeholder="Filter by Vendor..."
                  value={filters.contactId && contacts.find(c => c.id === filters.contactId)?.type === 'VENDOR' ? filters.contactId : ''}
                  onChange={(val) => setFilters({...filters, contactId: val})}
                  options={(contacts || []).filter(c => c.type === 'VENDOR').map((c: any) => ({
                    id: c.id,
                    label: c.name,
                    sublabel: c.email,
                    searchKey: `${c.name} ${c.email || ''}`
                  }))}
                />
              )}
              {!(contacts || []).some(c => c.type === 'CUSTOMER') && !(contacts || []).some(c => c.type === 'VENDOR') && (
                <SmartSearch 
                  label="Contact"
                  icon={<User size={10} className="mr-1" />}
                  placeholder="Search Contact..."
                  value={filters.contactId || ''}
                  onChange={(val) => setFilters({...filters, contactId: val})}
                  options={(contacts || []).map((c: any) => ({
                    id: c.id,
                    label: c.name,
                    sublabel: c.email,
                    searchKey: `${c.name} ${c.email || ''}`
                  }))}
                />
              )}
            </>
          )}

          <div className="space-y-1">
            <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest flex items-center">
              <Calendar size={10} className="mr-1" /> Date Range Preset
            </label>
            <select 
              className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-[11px] outline-none focus:border-[#00A09D] text-slate-200"
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
                className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-[10px] flex-1 outline-none focus:border-[#00A09D] text-slate-200"
                value={filters.startDate}
                onChange={(e) => setFilters({...filters, startDate: e.target.value, datePreset: 'custom'})}
              />
              <span className="text-slate-600">-</span>
              <input 
                type="date" 
                className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-[10px] flex-1 outline-none focus:border-[#00A09D] text-slate-200"
                value={filters.endDate}
                onChange={(e) => setFilters({...filters, endDate: e.target.value, datePreset: 'custom'})}
              />
            </div>
          </div>

          {statuses.length > 0 && (
            <div className="space-y-1">
              <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest flex items-center">
                <Filter size={10} className="mr-1" /> Status
              </label>
              <select 
                className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-[11px] outline-none focus:border-[#00A09D] text-slate-200"
                value={filters.status || ''}
                onChange={(e) => setFilters({...filters, status: e.target.value})}
              >
                <option value="">All Statuses</option>
                {(statuses || []).map(s => (
                  <option key={s.id} value={s.id}>{s.label}</option>
                ))}
              </select>
            </div>
          )}

          <div className="space-y-1">
            <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest flex items-center">
              <Hash size={10} className="mr-1" /> Reference / Doc #
            </label>
            <input 
              type="text" 
              placeholder="Search ref..."
              className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-[11px] outline-none focus:border-[#00A09D] text-slate-200"
              value={filters.reference || ''}
              onChange={(e) => setFilters({...filters, reference: e.target.value})}
            />
          </div>

          {type === 'invoice' && (
            <>
              <div className="space-y-1">
                <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest flex items-center">
                  <User size={10} className="mr-1" /> Delivery Person
                </label>
                <input 
                  type="text" 
                  placeholder="Search Delivery Person..."
                  className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-[11px] outline-none focus:border-[#00A09D] text-slate-200"
                  value={filters.deliveryPerson || ''}
                  onChange={(e) => setFilters({...filters, deliveryPerson: e.target.value})}
                />
              </div>
              <div className="space-y-1">
                <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest flex items-center">
                  <User size={10} className="mr-1" /> SR
                </label>
                <input 
                  type="text" 
                  placeholder="Search SR..."
                  className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-[11px] outline-none focus:border-[#00A09D] text-slate-200"
                  value={filters.sr || ''}
                  onChange={(e) => setFilters({...filters, sr: e.target.value})}
                />
              </div>
              <SmartSearch 
                label="Created By"
                icon={<User size={10} className="mr-1" />}
                placeholder="Filter by Creator..."
                value={filters.createdById || ''}
                onChange={(val) => setFilters({...filters, createdById: val})}
                options={(users || []).map((u: any) => ({
                  id: u.id,
                  label: u.name || u.email || u.username,
                  sublabel: u.email,
                  searchKey: `${u.name || ''} ${u.email || ''}`
                }))}
              />
            </>
          )}

          {type === 'payment' && (
            <div className="space-y-4">
              <div>
                <label className="block text-[10px] font-black text-slate-400 mb-1.5 uppercase tracking-widest flex items-center">
                  <Filter size={10} className="mr-1" /> Flow Type
                </label>
                <select 
                  className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-[11px] outline-none focus:border-[#00A09D] text-slate-200"
                  value={filters.type || ''}
                  onChange={(e) => setFilters({...filters, type: e.target.value})}
                >
                  <option value="">All Types</option>
                  <option value="RECEIPT">Inbound (Receipt)</option>
                  <option value="PAYMENT">Outbound (Payment)</option>
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-black text-slate-400 mb-1.5 uppercase tracking-widest flex items-center">
                  <Filter size={10} className="mr-1" /> Payment Category
                </label>
                <select 
                  className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-[11px] outline-none focus:border-[#00A09D] text-slate-200"
                  value={filters.paymentCategory || ''}
                  onChange={(e) => setFilters({...filters, paymentCategory: e.target.value})}
                >
                  <option value="">All Categories</option>
                  <option value="MARKET">Market</option>
                  <option value="OFFICE">Office</option>
                  <option value="UTILITY">Utility</option>
                  <option value="MAINTENANCE">Maintenance</option>
                  <option value="OTHER">Other</option>
                </select>
              </div>
            </div>
          )}

          {type === 'expense' && (
            <div className="space-y-1">
              <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest flex items-center">
                <Tag size={10} className="mr-1" /> Expense Type
              </label>
              <select 
                className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-[11px] outline-none focus:border-[#00A09D] text-slate-200"
                value={filters.expenseType || ''}
                onChange={(e) => setFilters({...filters, expenseType: e.target.value})}
              >
                <option value="">All Types</option>
                <option value="MARKET">Market</option>
                <option value="OFFICE">Office</option>
                <option value="UTILITY">Utility</option>
                <option value="MAINTENANCE">Maintenance</option>
                <option value="OTHER">Other</option>
              </select>
            </div>
          )}

          {(type === 'product' || products.length > 0) && (
            <>
              <SmartSearch 
                label="Categories"
                icon={<Tag size={10} className="mr-1" />}
                placeholder="Filter by Categories..."
                value={filters.selectedCategories || []}
                onChange={(val) => setFilters({...filters, selectedCategories: val})}
                multi={true}
                options={uniqueCategories.map(c => ({
                  id: c,
                  label: c,
                  searchKey: c
                }))}
              />

              <SmartSearch 
                label="Brands"
                icon={<Tag size={10} className="mr-1" />}
                placeholder="Filter by Brands..."
                value={filters.selectedBrands || []}
                onChange={(val) => setFilters({...filters, selectedBrands: val})}
                multi={true}
                options={uniqueBrands.map(b => ({
                  id: b,
                  label: b,
                  searchKey: b
                }))}
              />
            </>
          )}

          {type === 'product' && (
            <div className="space-y-1">
              <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest flex items-center">
                <Hash size={10} className="mr-1" /> Qty Range
              </label>
              <div className="flex items-center space-x-2">
                <input 
                  type="number" 
                  placeholder="Min"
                  className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-[10px] flex-1 outline-none focus:border-[#00A09D] text-slate-200"
                  value={filters.minQty || ''}
                  onChange={(e) => setFilters({...filters, minQty: e.target.value})}
                />
                <span className="text-slate-600">-</span>
                <input 
                  type="number" 
                  placeholder="Max"
                  className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-[10px] flex-1 outline-none focus:border-[#00A09D] text-slate-200"
                  value={filters.maxQty || ''}
                  onChange={(e) => setFilters({...filters, maxQty: e.target.value})}
                />
              </div>
            </div>
          )}

          <div className="space-y-1">
            <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest flex items-center">
              <Percent size={10} className="mr-1" /> {type === 'product' ? 'Price Range' : 'Amount Range'}
            </label>
            <div className="flex items-center space-x-2">
              <input 
                type="number" 
                placeholder="Min"
                className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-[10px] flex-1 outline-none focus:border-[#00A09D] text-slate-200 transition-colors hover:border-slate-500"
                value={filters.minAmount || ''}
                onChange={(e) => setFilters({...filters, minAmount: e.target.value})}
              />
              <span className="text-slate-600">-</span>
              <input 
                type="number" 
                placeholder="Max"
                className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-[10px] flex-1 outline-none focus:border-[#00A09D] text-slate-200 transition-colors hover:border-slate-500"
                value={filters.maxAmount || ''}
                onChange={(e) => setFilters({...filters, maxAmount: e.target.value})}
              />
            </div>
          </div>

          <div className="flex items-center justify-between lg:col-span-4 pt-4 border-t border-slate-700/50 mt-2">
            <div className="flex items-center space-x-6">
              <button 
                onClick={resetFilters}
                className="px-4 py-2 text-[10px] font-black uppercase text-slate-500 hover:text-rose-500 transition-all flex items-center space-x-2"
              >
                <RotateCcw size={12} />
                <span>Reset All</span>
              </button>

              {type === 'product' ? (
                <>
                  <div className="flex items-center space-x-2 bg-slate-800/50 px-3 py-1.5 rounded-lg border border-slate-700/50 hover:bg-slate-800 transition-colors">
                    <input 
                      type="checkbox" 
                      id="canBeSold"
                      checked={filters.canBeSold === true}
                      onChange={(e) => setFilters({...filters, canBeSold: e.target.checked ? true : null})}
                      className="w-3.5 h-3.5 rounded border-slate-700 bg-slate-900 text-[#00A09D] focus:ring-[#00A09D]/20 accent-[#00A09D]"
                    />
                    <label htmlFor="canBeSold" className="text-[10px] font-black text-slate-500 uppercase tracking-widest cursor-pointer select-none">
                      Can be Sold
                    </label>
                  </div>
                  <div className="flex items-center space-x-2 bg-slate-800/50 px-3 py-1.5 rounded-lg border border-slate-700/50 hover:bg-slate-800 transition-colors">
                    <input 
                      type="checkbox" 
                      id="canBePurchased"
                      checked={filters.canBePurchased === true}
                      onChange={(e) => setFilters({...filters, canBePurchased: e.target.checked ? true : null})}
                      className="w-3.5 h-3.5 rounded border-slate-700 bg-slate-900 text-[#00A09D] focus:ring-[#00A09D]/20 accent-[#00A09D]"
                    />
                    <label htmlFor="canBePurchased" className="text-[10px] font-black text-slate-500 uppercase tracking-widest cursor-pointer select-none">
                      Can be Purchased
                    </label>
                  </div>
                </>
              ) : (
                <div className="flex items-center space-x-2 bg-slate-800/50 px-3 py-1.5 rounded-lg border border-slate-700/50 hover:bg-slate-800 transition-colors">
                  <input 
                    type="checkbox" 
                    id="showDeleted"
                    checked={filters.showDeleted || false}
                    onChange={(e) => setFilters({...filters, showDeleted: e.target.checked})}
                    className="w-3.5 h-3.5 rounded border-slate-700 bg-slate-900 text-[#00A09D] focus:ring-[#00A09D]/20 accent-[#00A09D]"
                  />
                  <label htmlFor="showDeleted" className="text-[10px] font-black text-slate-500 uppercase tracking-widest cursor-pointer select-none">
                    Show Deleted Records
                  </label>
                </div>
              )}
            </div>
            <div className="flex items-center space-x-3">
              <button 
                onClick={() => setShowAdvanced(false)}
                className="px-6 py-2 bg-[#00A09D] hover:bg-[#008a88] text-white rounded-lg text-[10px] font-black uppercase tracking-widest transition-all shadow-lg shadow-[#00A09D]/20"
              >
                Apply Filters
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SmartFilterBar;
