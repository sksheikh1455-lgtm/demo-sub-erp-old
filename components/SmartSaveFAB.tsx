
import React from 'react';

interface SmartSaveFABProps {
  onClick: () => void;
  visible: boolean;
  label?: string;
}

const SmartSaveFAB: React.FC<SmartSaveFABProps> = ({ onClick, visible, label = "Save Draft" }) => {
  if (!visible) return null;

  return (
    <button
      onClick={onClick}
      className="fixed bottom-8 right-8 z-[100] group flex items-center space-x-3 bg-indigo-600 text-white px-6 py-4 rounded-full shadow-2xl hover:bg-indigo-700 hover:scale-110 active:scale-95 transition-all duration-300 animate-in slide-in-from-bottom-10"
      title={label}
    >
      <div className="relative">
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4"/>
        </svg>
        <span className="absolute -top-1 -right-1 flex h-3 w-3">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-3 w-3 bg-indigo-500"></span>
        </span>
      </div>
      <span className="text-sm font-black uppercase tracking-widest max-w-0 overflow-hidden group-hover:max-w-xs transition-all duration-500 whitespace-nowrap">
        {label}
      </span>
    </button>
  );
};

export default SmartSaveFAB;
