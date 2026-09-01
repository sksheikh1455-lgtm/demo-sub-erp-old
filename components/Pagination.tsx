import React from 'react';

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  itemsPerPage: number;
  onPageChange: (page: number) => void;
  onItemsPerPageChange?: (itemsPerPage: number) => void;
  pageOptions?: number[];
  showAllOption?: boolean;
}

const Pagination: React.FC<PaginationProps> = ({ 
  currentPage, 
  totalPages, 
  totalItems, 
  itemsPerPage, 
  onPageChange,
  onItemsPerPageChange,
  pageOptions = [20, 50, 80, 100, 200, 250, 500],
  showAllOption = false
}) => {
  const validTotalPages = isNaN(totalPages) ? 1 : totalPages;
  const validCurrentPage = isNaN(currentPage) ? 1 : currentPage;
  const validItemsPerPage = isNaN(itemsPerPage) ? 1 : itemsPerPage;
  const validTotalItems = isNaN(totalItems) ? 0 : totalItems;

  const startItem = validTotalItems === 0 ? 0 : (validCurrentPage - 1) * validItemsPerPage + 1;
  const endItem = Math.min(validCurrentPage * validItemsPerPage, validTotalItems);

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between px-6 py-3 bg-[#f8fafc] rounded-lg gap-4">
      <div className="flex items-center space-x-4">
        <div className="flex items-center bg-white border border-slate-200 rounded-lg px-3 py-1.5 shadow-sm group hover:border-indigo-300 transition-colors">
          <span className="text-[11px] font-black text-slate-400 mr-2 uppercase tracking-tighter">Smart View</span>
          <span className="text-xs font-black text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded cursor-help" title={`Showing ${startItem} to ${validItemsPerPage >= 9999999 ? validTotalItems : endItem} of ${validTotalItems} entries`}>
            [{startItem}-{validItemsPerPage >= 9999999 ? validTotalItems : endItem}/{validTotalItems}]
          </span>
        </div>

        {onItemsPerPageChange && (
          <div className="flex items-center space-x-2">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Show</span>
            <select
              value={validItemsPerPage || ""}
              onChange={(e) => onItemsPerPageChange(parseInt(e.target.value))}
              className="bg-white border border-slate-200 rounded-lg text-xs font-black px-2 py-1.5 outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 shadow-sm min-w-[70px]"
            >
              {pageOptions.map(opt => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
              {showAllOption && (
                <option value={9999999}>All</option>
              )}
              {!pageOptions.includes(validItemsPerPage) && validItemsPerPage !== 9999999 && (
                <option value={validItemsPerPage}>{validItemsPerPage}</option>
              )}
            </select>
          </div>
        )}
      </div>

      <div className="flex items-center space-x-1">
        <button 
          onClick={() => onPageChange(validCurrentPage - 1)} 
          disabled={validCurrentPage === 1}
          className="p-2 bg-white border border-slate-200 rounded-lg text-slate-500 hover:bg-slate-50 hover:text-indigo-600 disabled:opacity-30 disabled:cursor-not-allowed transition-all shadow-sm group"
          title="Previous Page"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" /></svg>
        </button>
        
        <div className="flex items-center px-4 py-2 bg-white border border-slate-200 rounded-lg shadow-sm">
          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mr-2">Page</span>
          <span className="text-xs font-black text-slate-700">{validCurrentPage}</span>
          <span className="text-[10px] font-bold text-slate-300 mx-2 text-xl font-light">/</span>
          <span className="text-xs font-black text-slate-400">{validTotalPages}</span>
        </div>

        <button 
          onClick={() => onPageChange(validCurrentPage + 1)} 
          disabled={validCurrentPage === validTotalPages || validTotalPages === 0}
          className="p-2 bg-white border border-slate-200 rounded-lg text-slate-500 hover:bg-slate-50 hover:text-indigo-600 disabled:opacity-30 disabled:cursor-not-allowed transition-all shadow-sm"
          title="Next Page"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" /></svg>
        </button>
      </div>
    </div>
  );
};

export default Pagination;
