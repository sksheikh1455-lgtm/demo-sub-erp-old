import React, { useState, useRef, useEffect } from 'react';
import { Settings2 } from 'lucide-react';

export interface ColumnDef {
  id: string;
  label: string;
  visible: boolean;
}

export function useColumns(storageKey: string, defaultColumns: ColumnDef[]) {
  const [columns, setColumns] = useState<ColumnDef[]>(() => {
    const saved = localStorage.getItem(`columns_${storageKey}`);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        // Merge parsed with defaultColumns to ensure new columns are added and old ones removed
        const merged = (Array.isArray(parsed) ? parsed : []).map((p: any) => {
          const def = (defaultColumns || []).find(d => d.id === p.id);
          return def ? { ...def, visible: p.visible } : null;
        }).filter(Boolean);
        
        // Add any default columns that are not in parsed
        (defaultColumns || []).forEach(def => {
          if (!merged.find((m: any) => m.id === def.id)) {
            merged.push(def);
          }
        });
        return merged;
      } catch (e) {
        return defaultColumns;
      }
    }
    return defaultColumns;
  });

  useEffect(() => {
    localStorage.setItem(`columns_${storageKey}`, JSON.stringify(columns));
  }, [columns, storageKey]);

  return [columns, setColumns] as const;
}

interface ColumnSelectorProps {
  columns: ColumnDef[];
  onChange: (columns: ColumnDef[]) => void;
}

const ColumnSelector: React.FC<ColumnSelectorProps> = ({ columns, onChange }) => {
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const toggleColumn = (id: string) => {
    onChange(columns.map(c => c.id === id ? { ...c, visible: !c.visible } : c));
  };

  return (
    <div className="relative inline-block text-left" ref={ref}>
      <button
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen(!isOpen);
        }}
        className="p-1 text-slate-400 hover:text-white hover:bg-slate-700 rounded transition-colors flex items-center justify-center"
        title="Select Columns"
      >
        <Settings2 className="w-4 h-4" />
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-48 bg-white border border-slate-200 rounded-lg shadow-xl z-[100] py-1 animate-in fade-in zoom-in-95 duration-100">
          <div className="px-3 py-2 border-b border-slate-100">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Visible Columns</span>
          </div>
          <div className="max-h-64 overflow-y-auto p-1">
            {columns.map(col => (
              <label key={col.id} className="flex items-center px-2 py-1.5 hover:bg-slate-50 rounded cursor-pointer group">
                <input
                  type="checkbox"
                  checked={col.visible}
                  onChange={() => toggleColumn(col.id)}
                  className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 w-3.5 h-3.5"
                />
                <span className="ml-2 text-xs font-medium text-slate-700 group-hover:text-slate-900">{col.label}</span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default ColumnSelector;
