
import React, { useState, useMemo, useRef, useEffect } from 'react';
import Pagination from './Pagination';

interface SearchableSelectProps {
  options: { 
    id: string; 
    name: string; 
    extra?: string; 
    subExtra?: string; 
    margin?: number; 
    stock?: number; 
    category?: string; 
    serialNumbers?: string[];
  }[];
  value: string;
  onSelect: (id: string, identifier?: string | number) => void;
  identifier?: string | number;
  onQuickCreate?: (name: string, identifier?: string | number) => void;
  placeholder: string;
  className?: string;
  labelClass?: string;
  disabled?: boolean;
  quickCreateLabel?: string;
  emptyMessage?: string;
  inputRef?: React.RefObject<HTMLInputElement>;
  themeColor?: string;
  displayLimit?: number;
  onFocus?: () => void;
  onSearchChange?: (q: string) => void;
}

const SearchableSelect: React.FC<SearchableSelectProps> = ({ 
  options, 
  value, 
  onSelect, 
  identifier,
  onQuickCreate, 
  placeholder, 
  className, 
  labelClass, 
  disabled, 
  quickCreateLabel = 'Product', 
  emptyMessage = 'No items found...',
  inputRef,
  themeColor = '#714B67',
  displayLimit = 100,
  onFocus,
  onSearchChange
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [showFullList, setShowFullList] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen || !onSearchChange) return;
    const timer = setTimeout(() => {
      onSearchChange(search);
    }, 200);
    return () => clearTimeout(timer);
  }, [search, isOpen, onSearchChange]);

  const selectedName = useMemo(() => options.find(o => o.id === value)?.name || '', [options, value]);
  
  const filteredOptionsArr = useMemo(() => {
    const lowerSearch = (search || '').trim().toLowerCase();
    if (!lowerSearch) {
      const seen = new Set<string>();
      return (options || []).filter(o => {
        if (!o || !o.id) return false;
        if (seen.has(o.id)) return false;
        seen.add(o.id);
        return true;
      });
    }

    const searchTerms = lowerSearch.split(/\s+/).filter(Boolean);
    const filtered = (options || []).filter(o => {
       if (!o) return false;
       const name = String(o.name || '').toLowerCase();
       const extra = String(o.extra || '').toLowerCase();
       const subExtra = String(o.subExtra || '').toLowerCase();
       const category = String(o.category || '').toLowerCase();
       const sns = (o.serialNumbers || []).map(s => String(s).toLowerCase()).join(' ');
       const target = `${name} ${extra} ${subExtra} ${category} ${sns} ${o.id || ''}`;
       return searchTerms.every(term => target.includes(term));
    });

    const seen = new Set<string>();
    return filtered.filter(o => {
      if (!o || !o.id) return false;
      if (seen.has(o.id)) return false;
      seen.add(o.id);
      return true;
    });
  }, [options, search]);

  const displayOptions = useMemo(() => filteredOptionsArr.slice(0, displayLimit), [filteredOptionsArr, displayLimit]);
  const hasMore = filteredOptionsArr.length > displayLimit;

  useEffect(() => {
    setSelectedIndex(0);
  }, [displayOptions]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => { 
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'Enter') setIsOpen(true);
      return;
    }

    const maxIndex = displayOptions.length + (hasMore ? 1 : 0) + (onQuickCreate ? 1 : 0);

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex(prev => (prev + 1) % maxIndex);
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(prev => (prev - 1 + maxIndex) % maxIndex);
        break;
      case 'Enter':
        e.preventDefault();
        if (selectedIndex < displayOptions.length) {
          onSelect(displayOptions[selectedIndex].id, identifier);
          setIsOpen(false);
        } else if (hasMore && selectedIndex === displayOptions.length) {
          setShowFullList(true);
          setIsOpen(false);
        } else if (onQuickCreate) {
          onQuickCreate(search || `New ${quickCreateLabel}`, identifier);
          setIsOpen(false);
        }
        break;
      case 'Escape':
        e.preventDefault();
        setIsOpen(false);
        break;
      case 'Tab':
        setIsOpen(false);
        break;
    }
  };

  if (disabled) {
    return (
      <div className={`py-1 text-sm font-bold text-slate-800 border-b border-transparent ${className}`}>
        {selectedName || value || <span className="text-slate-300">N/A</span>}
      </div>
    );
  }

  return (
    <div className={`relative ${className}`} ref={containerRef}>
      <div className="relative group/search">
        <div className="absolute left-0 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within/search:text-indigo-500 transition-colors pointer-events-none">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
        </div>
        <input
          ref={inputRef}
          className={`w-full border-b border-dashed border-slate-300 outline-none py-1 pl-5 text-sm bg-transparent transition-all ${labelClass || 'font-bold text-[#00A09D]'}`}
          style={{ borderColor: isOpen ? themeColor : undefined }}
          placeholder={selectedName || value || placeholder}
          value={isOpen ? search : (selectedName || value || '')}
          onChange={(e) => { setSearch(e.target.value); setIsOpen(true); }}
          onFocus={() => { 
            setIsOpen(true); 
            setSearch(''); 
            if (onFocus) onFocus();
          }}
          onKeyDown={handleKeyDown}
        />
      </div>
      {isOpen && (
        <div className="absolute top-full left-0 w-[400px] bg-white border border-slate-200 shadow-2xl z-[100] max-h-[500px] overflow-y-auto mt-1 rounded-md py-1 animate-in fade-in slide-in-from-top-1">
          <div className="px-4 py-1 border-b bg-slate-50 text-[9px] font-black uppercase text-slate-400 tracking-widest flex justify-between items-center">
            <span>Results</span>
            <span>{filteredOptionsArr.length} items Found</span>
          </div>
          {displayOptions.length > 0 ? (
            displayOptions.map((opt, idx) => (
              <div 
                key={opt.id} 
                onClick={() => { onSelect(opt.id, identifier); setIsOpen(false); }} 
                className={`px-4 py-2 cursor-pointer text-[11px] font-bold flex items-center justify-between transition-colors border-b border-slate-50 last:border-0 ${idx === selectedIndex ? 'bg-slate-50 text-indigo-700 border-l-4 border-indigo-500' : 'hover:bg-slate-50 text-slate-700'}`}
              >
                <div className="flex-1 flex flex-col">
                  <div className="flex items-center space-x-2">
                    <span className={`leading-tight ${idx === selectedIndex ? 'text-indigo-900' : 'text-slate-800'}`}>{opt.name}</span>
                    {opt.category && (
                      <span className="px-1 py-0.5 bg-slate-100 text-slate-500 rounded-[3px] text-[8px] font-black uppercase">
                        {opt.category}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center space-x-2 mt-0.5">
                    <span className="text-slate-400 font-medium text-[9px]">{opt.extra}</span>
                    {opt.stock !== undefined && (
                      <span className={`px-1.5 py-0 rounded-[2px] text-[8px] font-black uppercase ${opt.stock > 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
                        {opt.stock} Stock
                      </span>
                    )}
                  </div>
                </div>
                {opt.margin !== undefined && (
                  <span className={`text-[9px] font-black px-1.5 py-0.5 rounded ml-2 ${opt.margin > 0 ? 'bg-indigo-100 text-indigo-700' : 'bg-rose-100 text-rose-700'}`}>
                    {(opt.margin || 0).toFixed(1)}%
                  </span>
                )}
              </div>
            ))
          ) : (
            <div className="px-4 py-3 text-xs text-slate-400 italic">{emptyMessage}</div>
          )}
          
          {hasMore && (
            <button 
              type="button"
              className={`w-full px-4 py-3 text-[10px] font-black text-center uppercase tracking-widest cursor-pointer transition-colors border-t border-slate-100 flex items-center justify-center space-x-2 ${selectedIndex === displayOptions.length ? 'bg-indigo-600 text-white' : 'text-indigo-600 bg-indigo-50/50 hover:bg-indigo-100'}`}
              onClick={() => {
                setShowFullList(true);
                setIsOpen(false);
              }}
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
              <span>See More Results ({filteredOptionsArr.length - displayLimit} more)</span>
            </button>
          )}

          {onQuickCreate && (
            <div 
              onClick={() => { onQuickCreate(search || `New ${quickCreateLabel}`, identifier); setIsOpen(false); }} 
              className={`px-4 py-3 border-t cursor-pointer text-xs font-black flex items-center transition-colors ${selectedIndex === (displayOptions.length + (hasMore ? 1 : 0)) ? 'bg-slate-900 text-white' : 'bg-slate-50 text-slate-900 hover:bg-slate-900 hover:text-white'}`}
            >
              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"/></svg>
              {search.length > 0 ? `Add ${quickCreateLabel}: "${search}"` : `Add New ${quickCreateLabel}`}
            </div>
          )}
        </div>
      )}

      {showFullList && (
        <FullListModal 
          options={options} 
          onSelect={(id) => { onSelect(id, identifier); setShowFullList(false); }} 
          onClose={() => setShowFullList(false)}
          title={`All ${quickCreateLabel}s`}
          placeholder={placeholder}
          themeColor={themeColor}
          onQuickCreate={onQuickCreate ? (name) => { onQuickCreate(name, identifier); setShowFullList(false); } : undefined}
          quickCreateLabel={quickCreateLabel}
        />
      )}
    </div>
  );
};

const FullListModal: React.FC<{
  options: any[];
  onSelect: (id: string) => void;
  onClose: () => void;
  title: string;
  placeholder: string;
  themeColor: string;
  onQuickCreate?: (name: string) => void;
  quickCreateLabel?: string;
}> = ({ options, onSelect, onClose, title, placeholder, themeColor, onQuickCreate, quickCreateLabel }) => {
  const [modalSearch, setModalSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 80;

  const filtered = useMemo(() => {
    const q = modalSearch.toLowerCase();
    return (options || []).filter(o => 
      String(o.name || '').toLowerCase().includes(q) ||
      String(o.extra || '').toLowerCase().includes(q) ||
      String(o.category || '').toLowerCase().includes(q) ||
      (o.serialNumbers || []).some((sn: string) => String(sn).toLowerCase().includes(q))
    );
  }, [options, modalSearch]);

  const totalPages = Math.ceil(filtered.length / pageSize);
  const paginated = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-4xl rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden animate-in zoom-in duration-200">
        <div className="px-8 py-6 border-b flex justify-between items-center bg-slate-50">
          <div>
            <h3 className="text-xl font-black text-slate-800 uppercase tracking-tighter">{title}</h3>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{filtered.length} items total</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full transition-colors">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>

        <div className="p-8 border-b bg-white">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <input 
                autoFocus
                className="w-full px-12 py-4 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-indigo-500 font-bold transition-all"
                placeholder={`Search in ${title}...`}
                value={modalSearch}
                onChange={(e) => { setModalSearch(e.target.value); setCurrentPage(1); }}
              />
              <svg className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
            </div>
            {onQuickCreate && (
              <button
                onClick={() => onQuickCreate(modalSearch || `New ${quickCreateLabel}`)}
                className="px-6 py-4 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl transition-colors whitespace-nowrap flex items-center justify-center shadow-lg shadow-indigo-200"
              >
                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"/></svg>
                {modalSearch ? `Add "${modalSearch}"` : `Add New ${quickCreateLabel}`}
              </button>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {paginated.map((opt) => (
              <div 
                key={opt.id}
                onClick={() => onSelect(opt.id)}
                className="p-4 border rounded-xl hover:bg-slate-50 cursor-pointer flex items-center justify-between group transition-all"
              >
                <div className="flex-1">
                  <h4 className="font-bold text-slate-800 group-hover:text-indigo-600 transition-colors uppercase text-sm tracking-tight">{opt.name}</h4>
                  <div className="flex items-center space-x-2 mt-1">
                    <span className="text-[10px] text-slate-400 font-medium">{opt.extra}</span>
                    {opt.category && <span className="text-[10px] px-1 bg-slate-100 text-slate-500 rounded font-black uppercase">{opt.category}</span>}
                  </div>
                </div>
                <div className="text-right">
                   {opt.stock !== undefined && (
                     <p className={`text-[10px] font-black uppercase ${opt.stock > 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                       {opt.stock} in stock
                     </p>
                   )}
                   {opt.subExtra && <p className="text-[10px] font-bold text-slate-400">{opt.subExtra}</p>}
                </div>
              </div>
            ))}
          </div>
          {filtered.length === 0 && (
            <div className="py-20 text-center">
              <p className="text-slate-400 font-bold italic uppercase tracking-widest text-xs">No matching results found...</p>
            </div>
          )}
        </div>

        <div className="p-6 bg-slate-50 border-t">
          <Pagination 
            currentPage={currentPage}
            totalPages={totalPages}
            totalItems={filtered.length}
            itemsPerPage={pageSize}
            onPageChange={setCurrentPage}
          />
        </div>
      </div>
    </div>
  );
};

export default React.memo(SearchableSelect);
