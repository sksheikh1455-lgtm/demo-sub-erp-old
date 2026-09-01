import { generateUUID } from '../constants';

import React, { useState, useRef, useEffect, useMemo } from 'react';

export interface FilterOption {
  id: string;
  label: string;
  group?: string;
}

export type FilterOperator = 'equal' | 'not_equal' | 'contains' | 'not_contains' | 'is_set' | 'is_not_set' | 'greater_than' | 'less_than';

export interface CustomFilterRule {
  id: string;
  field: string;
  operator: FilterOperator;
  value: any;
}

export interface CustomFilterState {
  matchType: 'any' | 'all';
  rules: CustomFilterRule[];
}

export interface CustomField {
  id: string;
  label: string;
  type: 'text' | 'number' | 'date' | 'selection';
  options?: { id: string; label: string }[];
}

export interface FilterState {
  startDate: string | null;
  endDate: string | null;
  searchQuery?: string;
  activeFilters: string[]; 
  groupBy?: string;
  customFilters?: CustomFilterState;
  comparison?: 'NONE' | 'PREVIOUS_PERIOD' | 'PREVIOUS_YEAR' | 'OPENING_BALANCE';
  analyticTags?: string[];
  entryStatus?: string;
  partnerId?: string;
  category?: string;
  brand?: string;
}

interface ReportFiltersProps {
  filters: FilterState;
  setFilters: (filters: FilterState) => void;
  availableFilters?: FilterOption[];
  availableGroups?: FilterOption[];
  availableCustomFields?: CustomField[];
  // Added optional partners prop used by some callers to resolve TS errors
  partners?: any[];
}

const ReportFilters: React.FC<ReportFiltersProps> = ({ 
  filters, 
  setFilters, 
  availableFilters = [], 
  availableGroups = [],
  availableCustomFields = []
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const [showCustomFilter, setShowCustomFilter] = useState(false);
  const [tempCustomFilter, setTempCustomFilter] = useState<CustomFilterState>({
    matchType: 'all',
    rules: [{ id: generateUUID(), field: availableCustomFields?.[0]?.id || '', operator: 'equal', value: '' }]
  });

  useEffect(() => {
    if (showCustomFilter && tempCustomFilter.rules.length === 0) {
      setTempCustomFilter({
        matchType: 'all',
        rules: [{ id: generateUUID(), field: availableCustomFields?.[0]?.id || '', operator: 'equal', value: '' }]
      });
    }
  }, [showCustomFilter, availableCustomFields]);

  const addCustomRule = () => {
    setTempCustomFilter({
      ...tempCustomFilter,
      rules: [...tempCustomFilter.rules, { id: generateUUID(), field: availableCustomFields?.[0]?.id || '', operator: 'equal', value: '' }]
    });
  };

  const removeCustomRule = (id: string) => {
    setTempCustomFilter({
      ...tempCustomFilter,
      rules: tempCustomFilter.rules.filter(r => r.id !== id)
    });
  };

  const updateCustomRule = (id: string, updates: Partial<CustomFilterRule>) => {
    setTempCustomFilter({
      ...tempCustomFilter,
      rules: tempCustomFilter.rules.map(r => r.id === id ? { ...r, ...updates } : r)
    });
  };

  const applyCustomFilter = () => {
    setFilters({ ...filters, customFilters: tempCustomFilter });
    setShowCustomFilter(false);
    setIsOpen(false);
  };

  const removeCustomFilterTag = () => {
    setFilters({ ...filters, customFilters: undefined });
  };

  const OPERATORS: { id: FilterOperator; label: string }[] = [
    { id: 'equal', label: 'is equal to' },
    { id: 'not_equal', label: 'is not equal to' },
    { id: 'contains', label: 'contains' },
    { id: 'not_contains', label: 'does not contain' },
    { id: 'is_set', label: 'is set' },
    { id: 'is_not_set', label: 'is not set' },
    { id: 'greater_than', label: 'is greater than' },
    { id: 'less_than', label: 'is less than' },
  ];

  const toggleFilter = (id: string) => {
    const active = filters.activeFilters || [];
    const newFilters = active.includes(id)
      ? active.filter(f => f !== id)
      : [...active, id];
    setFilters({ ...filters, activeFilters: newFilters });
  };

  const setGroupBy = (id: string | undefined) => {
    setFilters({ ...filters, groupBy: id === filters.groupBy ? undefined : id });
  };

  const removeFilterTag = (id: string) => {
    setFilters({ ...filters, activeFilters: (filters.activeFilters || []).filter(f => f !== id) });
  };

  const presets = [
    { label: 'All Time', get: () => ({ start: null, end: null }) },
    { label: 'This Month', get: () => ({ start: new Date(new Date().getFullYear(), new Date().getMonth(), 1), end: new Date() }) },
    { label: 'This Year', get: () => ({ start: new Date(new Date().getFullYear(), 0, 1), end: new Date() }) },
    { label: 'Last Quarter', get: () => {
      const now = new Date();
      const quarter = Math.floor(now.getMonth() / 3);
      const start = new Date(now.getFullYear(), (quarter - 1) * 3, 1);
      const end = new Date(now.getFullYear(), quarter * 3, 0);
      return { start, end };
    }},
    { label: 'Previous Year', get: () => ({ start: new Date(new Date().getFullYear() - 1, 0, 1), end: new Date(new Date().getFullYear() - 1, 11, 31) }) },
  ];

  const applyDatePreset = (p: typeof presets[0]) => {
    const res = p.get();
    setFilters({ 
      ...filters, 
      startDate: res.start ? res.start.toISOString().split('T')[0] : null, 
      endDate: res.end ? res.end.toISOString().split('T')[0] : null 
    });
  };

  const groupedFilters = useMemo(() => {
    const groups: Record<string, FilterOption[]> = { 'General': [] };
    availableFilters.forEach(f => {
      const g = f.group || 'General';
      if (!groups[g]) groups[g] = [];
      groups[g].push(f);
    });
    return groups;
  }, [availableFilters]);

  return (
    <div className="relative flex items-center w-full no-print" ref={dropdownRef}>
      <div className="relative flex-1 flex items-center bg-white border border-slate-300 rounded-sm shadow-sm hover:border-slate-400 transition-colors px-2 py-1 min-h-[38px]">
        <span className="text-slate-400 mr-2 flex-shrink-0">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
        </span>
        
        <div className="flex flex-wrap gap-1 items-center flex-1">
          {(filters.activeFilters || []).map(id => {
            const label = availableFilters.find(f => f.id === id)?.label || id;
            return (
              <span key={id} className="flex items-center bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-sm text-[10px] font-bold border border-indigo-200 whitespace-nowrap">
                {label}
                <button onClick={() => removeFilterTag(id)} className="ml-1.5 hover:text-indigo-900">×</button>
              </span>
            );
          })}
          {filters.groupBy && (
             <span className="flex items-center bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-sm text-[10px] font-bold border border-emerald-200 whitespace-nowrap">
              <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"/></svg>
              {availableGroups.find(g => g.id === filters.groupBy)?.label}
              <button onClick={() => setGroupBy(undefined)} className="ml-1.5 hover:text-emerald-900">×</button>
            </span>
          )}
          {filters.customFilters && filters.customFilters.rules.length > 0 && (
            <span className="flex items-center bg-amber-100 text-amber-700 px-2 py-0.5 rounded-sm text-[10px] font-bold border border-amber-200 whitespace-nowrap">
              <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z"/></svg>
              Custom Filter ({filters.customFilters.rules.length})
              <button onClick={removeCustomFilterTag} className="ml-1.5 hover:text-amber-900">×</button>
            </span>
          )}
          <input 
            type="text" 
            placeholder={((filters.activeFilters || []).length === 0 && !filters.groupBy) ? "Search..." : ""} 
            className="flex-1 min-w-[60px] bg-transparent outline-none text-sm px-1 placeholder:text-slate-400"
            value={filters.searchQuery || ''}
            onChange={(e) => setFilters({...filters, searchQuery: e.target.value})}
          />
        </div>

        <button 
          onClick={() => setIsOpen(!isOpen)}
          className={`ml-2 p-1.5 rounded-sm transition-colors flex-shrink-0 ${isOpen ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:bg-slate-100'}`}
        >
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M3 3a1 1 0 011-1h12a1 1 0 011 1v3a1 1 0 01-.293.707L12 11.414V15a1 1 0 01-.293.707l-2 2A1 1 0 018 17v-5.586L3.293 6.707A1 1 0 013 6V3z" clipRule="evenodd"/></svg>
        </button>
      </div>

      {isOpen && (
        <div className="absolute top-full right-0 mt-1 bg-white border border-slate-200 shadow-2xl rounded-sm z-[200] flex animate-in fade-in slide-in-from-top-2 duration-200 min-w-[500px]">
          <div className="flex-1 border-r border-slate-100 p-4 min-w-[180px]">
            <div className="flex items-center text-slate-800 font-bold text-[11px] mb-4 uppercase tracking-wider">
              <svg className="w-3.5 h-3.5 mr-2 text-indigo-500" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M3 3a1 1 0 011-1h12a1 1 0 011 1v3a1 1 0 01-.293.707L12 11.414V15a1 1 0 01-.293.707l-2 2A1 1 0 018 17v-5.586L3.293 6.707A1 1 0 013 6V3z" clipRule="evenodd"/></svg>
              Filters
            </div>
            {Object.entries(groupedFilters).map(([groupName, items]) => {
              // Explicitly cast items to FilterOption[] to fix 'map' error on unknown type
              const filterItems = items as FilterOption[];
              return (
                <div key={groupName} className="mb-4 last:mb-0">
                  {groupName !== 'General' && <div className="text-[9px] font-black text-slate-300 uppercase mb-2 border-b">{groupName}</div>}
                  {filterItems.map(item => (
                    <button 
                      key={item.id}
                      onClick={() => toggleFilter(item.id)}
                      className="w-full flex items-center px-2 py-1.5 hover:bg-slate-50 text-[13px] text-slate-600 rounded-sm group text-left"
                    >
                      <span className={`mr-3 w-4 h-4 border rounded-sm flex items-center justify-center transition-colors ${(filters.activeFilters || []).includes(item.id) ? 'bg-indigo-600 border-indigo-600' : 'border-slate-300 group-hover:border-indigo-400'}`}>
                        {(filters.activeFilters || []).includes(item.id) && <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20"><path d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"/></svg>}
                      </span>
                      {item.label}
                    </button>
                  ))}
                </div>
              );
            })}
          </div>

          <div className="flex-1 border-r border-slate-100 p-4 min-w-[150px]">
            <div className="flex items-center text-slate-800 font-bold text-[11px] mb-4 uppercase tracking-wider">
              <svg className="w-3.5 h-3.5 mr-2 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"/></svg>
              Group By
            </div>
            {availableGroups.map(group => (
              <button 
                key={group.id}
                onClick={() => setGroupBy(group.id)}
                className={`w-full text-left px-2 py-1.5 hover:bg-slate-50 text-[13px] rounded-sm transition-colors mb-1 last:mb-0 ${filters.groupBy === group.id ? 'text-emerald-700 font-bold bg-emerald-50' : 'text-slate-600'}`}
              >
                {group.label}
              </button>
            ))}
          </div>

          <div className="flex-1 p-4 bg-slate-50/30 min-w-[150px]">
            <div className="flex items-center text-slate-800 font-bold text-[11px] mb-4 uppercase tracking-wider">
              <svg className="w-3.5 h-3.5 mr-2 text-amber-500" fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/></svg>
              Periods
            </div>
            <div className="space-y-4">
              {presets.map(p => (
                <button key={p.label} onClick={() => applyDatePreset(p)} className="w-full text-left px-2 py-1.5 hover:bg-white text-[13px] text-slate-600 rounded-sm">
                  {p.label}
                </button>
              ))}
              
              <div className="pt-4 border-t border-slate-200">
                <div className="text-[9px] font-black text-slate-400 uppercase mb-3 tracking-widest">Comparison</div>
                <div className="grid grid-cols-1 gap-1">
                  {[
                    { id: 'NONE' as const, label: 'No Comparison' },
                    { id: 'OPENING_BALANCE' as const, label: 'Opening Balance' },
                    { id: 'PREVIOUS_PERIOD' as const, label: 'Previous Period' },
                    { id: 'PREVIOUS_YEAR' as const, label: 'Previous Year' }
                  ].map(c => (
                    <button 
                      key={c.id}
                      onClick={() => setFilters({...filters, comparison: c.id})}
                      className={`w-full text-left px-2 py-1.5 hover:bg-white text-[13px] rounded-sm transition-colors ${filters.comparison === c.id ? 'text-indigo-600 font-bold bg-indigo-50/50' : 'text-slate-600'}`}
                    >
                      {c.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="pt-4 border-t border-slate-200">
                <div className="text-[9px] font-black text-slate-400 uppercase mb-3">Custom</div>
                <div className="space-y-2">
                  <input type="date" className="w-full px-2 py-1 border border-slate-200 rounded-sm text-[11px] font-medium" value={filters.startDate || ''} onChange={(e) => setFilters({...filters, startDate: e.target.value || null})} />
                  <input type="date" className="w-full px-2 py-1 border border-slate-200 rounded-sm text-[11px] font-medium" value={filters.endDate || ''} onChange={(e) => setFilters({...filters, endDate: e.target.value || null})} />
                </div>
              </div>
              
              <div className="pt-4 border-t border-slate-200">
                <button 
                  onClick={() => setShowCustomFilter(true)}
                  className="w-full flex items-center justify-center px-4 py-2 bg-indigo-50 text-indigo-600 rounded-sm text-[11px] font-bold hover:bg-indigo-100 transition-colors"
                >
                  <svg className="w-3.5 h-3.5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"/></svg>
                  Add Custom Filter
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showCustomFilter && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-[300] p-4">
          <div className="bg-white rounded-sm shadow-2xl w-full max-w-2xl animate-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b flex justify-between items-center bg-slate-50">
              <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">Custom Filter</h3>
              <button onClick={() => setShowCustomFilter(false)} className="text-slate-400 hover:text-slate-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"/></svg>
              </button>
            </div>
            
            <div className="p-6">
              <div className="flex items-center space-x-3 mb-6 text-sm">
                <span className="text-slate-500">Match</span>
                <select 
                  className="bg-slate-100 border-none rounded-sm px-3 py-1 text-sm font-bold text-indigo-600 outline-none"
                  value={tempCustomFilter.matchType || ""}
                  onChange={(e) => setTempCustomFilter({ ...tempCustomFilter, matchType: e.target.value as any })}
                >
                  <option value="all">all</option>
                  <option value="any">any</option>
                </select>
                <span className="text-slate-500">of the following rules:</span>
              </div>

              <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2">
                {tempCustomFilter.rules.map((rule, idx) => (
                  <div key={rule.id} className="flex items-center space-x-2 animate-in slide-in-from-left-2 duration-200">
                    <select 
                      className="flex-1 min-w-[120px] bg-white border border-slate-200 rounded-sm px-3 py-1.5 text-xs outline-none focus:border-indigo-500"
                      value={rule.field || ""}
                      onChange={(e) => updateCustomRule(rule.id, { field: e.target.value })}
                    >
                      {availableCustomFields?.map(f => (
                        <option key={f.id} value={f.id}>{f.label}</option>
                      ))}
                    </select>

                    <select 
                      className="w-40 bg-white border border-slate-200 rounded-sm px-3 py-1.5 text-xs outline-none focus:border-indigo-500"
                      value={rule.operator || ""}
                      onChange={(e) => updateCustomRule(rule.id, { operator: e.target.value as any })}
                    >
                      {OPERATORS.map(op => (
                        <option key={op.id} value={op.id}>{op.label}</option>
                      ))}
                    </select>

                    {rule.operator !== 'is_set' && rule.operator !== 'is_not_set' && (
                      <div className="flex-[1.5]">
                        {availableCustomFields?.find(f => f.id === rule.field)?.type === 'selection' ? (
                          <select 
                            className="w-full bg-white border border-slate-200 rounded-sm px-3 py-1.5 text-xs outline-none focus:border-indigo-500"
                            value={rule.value || ''}
                            onChange={(e) => updateCustomRule(rule.id, { value: e.target.value })}
                          >
                            <option value="">Select...</option>
                            {availableCustomFields?.find(f => f.id === rule.field)?.options?.map(opt => (
                              <option key={opt.id} value={opt.id}>{opt.label}</option>
                            ))}
                          </select>
                        ) : (
                          <input 
                            type={availableCustomFields?.find(f => f.id === rule.field)?.type === 'number' ? 'number' : availableCustomFields?.find(f => f.id === rule.field)?.type === 'date' ? 'date' : 'text'}
                            className="w-full bg-white border border-slate-200 rounded-sm px-3 py-1.5 text-xs outline-none focus:border-indigo-500"
                            placeholder="Value..."
                            value={rule.value || ''}
                            onChange={(e) => updateCustomRule(rule.id, { value: e.target.value })}
                          />
                        )}
                      </div>
                    )}

                    <button 
                      onClick={() => removeCustomRule(rule.id)}
                      className="p-1.5 text-slate-300 hover:text-rose-500 transition-colors"
                      disabled={tempCustomFilter.rules.length === 1}
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                    </button>
                  </div>
                ))}
              </div>

              <button 
                onClick={addCustomRule}
                className="mt-4 flex items-center text-xs font-bold text-indigo-600 hover:text-indigo-800 transition-colors"
              >
                <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"/></svg>
                New Rule
              </button>
            </div>

            <div className="px-6 py-4 bg-slate-50 border-t flex justify-end space-x-3">
              <button 
                onClick={() => setShowCustomFilter(false)}
                className="px-6 py-2 text-xs font-bold text-slate-500 hover:text-slate-700 transition-colors"
              >
                Discard
              </button>
              <button 
                onClick={applyCustomFilter}
                className="px-8 py-2 bg-[#714B67] text-white rounded-sm text-xs font-bold shadow-lg hover:brightness-110 transition-all"
              >
                Search
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ReportFilters;
