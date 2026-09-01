import React from 'react';

interface ExportButtonsProps {
  onExport: (format: 'excel' | 'pdf', scope: 'page' | 'all') => void;
}

const ExportButtons: React.FC<ExportButtonsProps> = ({ onExport }) => {
  return (
    <div className="relative flex space-x-2">
      <button 
        onClick={() => onExport('excel', 'all')} 
        className="px-4 py-2 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg text-xs font-black uppercase tracking-widest hover:bg-emerald-100 hover:border-emerald-300 transition-all flex items-center shadow-sm"
      >
        <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
        Excel
      </button>
      <button 
        onClick={() => onExport('pdf', 'all')} 
        className="px-4 py-2 bg-rose-50 text-rose-700 border border-rose-200 rounded-lg text-xs font-black uppercase tracking-widest hover:bg-rose-100 hover:border-rose-300 transition-all flex items-center shadow-sm"
      >
        <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"/></svg>
        PDF
      </button>
    </div>
  );
};

export default ExportButtons;
