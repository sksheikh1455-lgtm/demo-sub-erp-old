
import React from 'react';
import { ICONS } from '../constants';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: any) => void;
  onOpenAddMenu: () => void;
  onQuickAction?: (tab: any) => void;
  isCollapsed?: boolean;
  currentUser?: any;
  hasPermission?: (perm: any) => boolean;
  loginRole?: 'USER' | 'CASHIER' | null;
  setLoginRole?: (role: 'USER' | 'CASHIER' | null) => void;
  isStoreSyncing?: boolean;
  lastSyncTime?: string | null;
  loadError?: string | null;
}

const Sidebar: React.FC<SidebarProps> = ({ 
  activeTab, 
  setActiveTab, 
  onOpenAddMenu, 
  onQuickAction, 
  isCollapsed, 
  currentUser, 
  hasPermission, 
  loginRole, 
  setLoginRole,
  isStoreSyncing,
  lastSyncTime,
  loadError
}) => {
  const sections = [
    {
      title: 'Accounting',
      items: [
        { id: 'dashboard', label: 'Dashboard', icon: ICONS.Dashboard },
        ...(loginRole === 'CASHIER' ? [
          { id: 'cashier', label: 'Cashier Terminal', icon: (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg>
          )}
        ] : []),
        { id: 'accounts', label: 'Chart of Accounts', icon: (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"/></svg>
        ), permission: 'ledger_view' },
        { id: 'invoices', label: 'Invoices', icon: ICONS.Invoice, permission: 'invoice_view' },
        { id: 'credit_notes', label: 'Credit Notes', icon: (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"/></svg>
        ), permission: 'invoice_view' },
        { id: 'bills', label: 'Bills', icon: (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/></svg>
        ), permission: 'bill_view' },
        { id: 'expenses', label: 'Expenses', icon: (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z"/></svg>
        ), permission: 'bill_view' },
        { id: 'payments', label: 'Payments', icon: (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"/></svg>
        ), permission: 'payment_view' },
        { id: 'ledger', label: 'Ledger', icon: ICONS.Journal, permission: 'ledger_view' },
        { id: 'cash_ledger', label: 'Cash Ledger', icon: (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
        ), permission: 'ledger_view' },
        { id: 'journal', label: 'Journal Entries', icon: (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
        ), permission: 'ledger_view' },
        { id: 'loans', label: 'Loans & Financing', icon: (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
        ), permission: 'ledger_view' },
      ]
    },
    {
      title: 'Reporting',
      items: [
        { id: 'reports', label: 'Financial Statements', icon: ICONS.Chart, permission: 'report_financial' },
        { id: 'advanced_sales_analysis', label: 'Sales Analysis', icon: (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z"/></svg>
        ), permission: 'report_sales' },
        { id: 'advanced_purchase_analysis', label: 'Purchase Analysis', icon: (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"/></svg>
        ), permission: 'report_purchase' },
        { id: 'credit_note_analysis', label: 'Credit Note Analysis', icon: (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/>
          </svg>
        ), permission: 'report_sales' },
        { id: 'partner_ledger', label: 'Partner Ledger', icon: (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"/></svg>
        ), permission: 'report_financial' },
        { id: 'monthly_ledger', label: 'Daily Gen. Report', icon: (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
        ), permission: 'report_financial' },
        { id: 'receivables', label: 'Receivables', icon: (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"/></svg>
        ), permission: 'report_financial' },
        { id: 'payables', label: 'Payables', icon: (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 17h8m0 0V9m0 8l-8-8-4 4-6-6"/></svg>
        ), permission: 'report_financial' },
      ]
    },
    {
      title: 'Inventory',
      items: [
        { id: 'products', label: 'Products', icon: (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/></svg>
        ), permission: 'product_view' },
        { id: 'categories', label: 'Categories', icon: (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"/></svg>
        ), permission: 'category_manage' },
        { id: 'brands', label: 'Brands', icon: (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"/></svg>
        ), permission: 'brand_manage' },
        { id: 'inventory_adjustment', label: 'Inventory Adjustment', icon: (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
        ), permission: 'inventory_adjustment_view' },
        { id: 'inventory_valuation', label: 'Stock Valuation', icon: (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2"/></svg>
        ), permission: 'inventory_valuation_view' },
      ]
    },
    {
      title: 'People',
      items: [
        { id: 'contacts', label: 'Contacts', icon: (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"/></svg>
        ), permission: 'customer_view' },
        { id: 'employees', label: 'Employees', icon: (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></svg>
        ), permission: 'employee_view' },
        { id: 'payroll', label: 'Payroll Management', icon: (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z"/></svg>
        ), permission: 'payroll_view' },
      ]
    },
    {
      title: 'System',
      items: [
        { id: 'import', label: 'Data Import', icon: ICONS.Import, permission: 'data_import' },
        { id: 'users', label: 'Users & Roles', icon: (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"/></svg>
        ), permission: 'team_manage' },
        { id: 'settings', label: 'Settings', icon: ICONS.Settings, permission: 'settings_manage' },
      ]
    }
  ];

  const filteredSections = sections.map(section => ({
    ...section,
    items: (section.items || []).filter(item => {
      const i = item as any;
      if (!i.permission) return true;
      if (!hasPermission) return true;
      return hasPermission(i.permission);
    })
  })).filter(section => section.items.length > 0);

  return (
    <aside className={`${isCollapsed ? 'w-16' : 'w-64'} bg-[#714B67] h-full flex flex-col text-white/70 overflow-y-auto shrink-0 transition-all duration-300 ease-in-out z-40`}>
      <div className="p-4 flex items-center justify-center border-b border-white/10 mb-4 sticky top-0 bg-[#714B67] z-10">
        <div className="w-10 h-10 bg-white/10 rounded-lg flex items-center justify-center text-white font-black text-xl shadow-inner">
          L
        </div>
        {!isCollapsed && <span className="ml-3 font-black text-white tracking-tighter text-lg">Sub ERP</span>}
      </div>

      <nav className="flex-1 px-2 space-y-6 pb-10">
        {filteredSections.map(section => (
          <div key={section.title}>
            {!isCollapsed && (
              <p className="px-3 text-[9px] font-black uppercase text-white/30 tracking-[0.2em] mb-3">{section.title}</p>
            )}
            <div className="space-y-1">
              {section.items.map(item => (
                <div
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className={`w-full flex items-center cursor-pointer ${isCollapsed ? 'justify-center' : 'px-3'} py-2 rounded-xl transition-all group ${
                    activeTab === item.id 
                    ? 'bg-white/20 text-white shadow-lg shadow-black/10' 
                    : 'hover:bg-white/10 hover:text-white'
                  }`}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setActiveTab(item.id);
                    }
                  }}
                >
                  <span className={`${activeTab === item.id ? 'text-white' : 'text-white/50 group-hover:text-white'} transition-colors`}>
                    {item.icon}
                  </span>
                  {!isCollapsed && (
                    <span className="ml-3 text-[13px] font-bold tracking-tight">{item.label}</span>
                  )}
                  {!isCollapsed && activeTab === item.id && (
                    <div className="ml-auto w-1.5 h-1.5 bg-white rounded-full"></div>
                  )}
                  {!isCollapsed && onQuickAction && (item.id === 'contacts' || item.id === 'users' || item.id === 'invoices' || item.id === 'bills') && (
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        onQuickAction(item.id);
                      }}
                      className="ml-auto p-1 hover:bg-white/20 rounded-lg opacity-100 transition-opacity transition-opacity"
                      title={`Create New ${item.label}`}
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M12 6v6m0 0v6m0-6h6m-6 0H6"/></svg>
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </nav>

      {currentUser?.isCashier && setLoginRole && (
        <div className="px-4 py-3 border-t border-white/10 bg-black/5">
          <button 
            onClick={() => {
              const newRole = loginRole === 'CASHIER' ? 'USER' : 'CASHIER';
              setLoginRole(newRole);
              setActiveTab(newRole === 'CASHIER' ? 'cashier' : 'dashboard');
            }}
            className="w-full flex items-center justify-center space-x-2 px-3 py-2 bg-white/10 hover:bg-white/20 rounded-xl transition-all group"
          >
            <svg className="w-3.5 h-3.5 text-indigo-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"/></svg>
            {!isCollapsed && <span className="text-[10px] font-black uppercase tracking-widest text-white">Switch to {loginRole === 'CASHIER' ? 'User' : 'Cashier'}</span>}
          </button>
        </div>
      )}

      {/* Cloud Sync Status */}
      {!isCollapsed && (
        <div className={`px-4 py-3 mx-2 mb-2 rounded-xl border ${loadError ? 'bg-red-500/10 border-red-500/20' : 'bg-white/5 border-white/5'}`}>
          <div className="flex items-center justify-between mb-1">
            <span className={`text-[9px] font-black uppercase tracking-widest ${loadError ? 'text-red-400' : 'text-white/40'}`}>
              {loadError ? 'Sync Error' : 'Cloud Sync'}
            </span>
            <div className={`w-1.5 h-1.5 rounded-full ${
              loadError ? 'bg-red-500 animate-pulse' :
              isStoreSyncing ? 'bg-amber-400 animate-pulse' : 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.5)]'
            }`}></div>
          </div>
          <p className="text-[8px] text-white/60 font-bold truncate" title={loadError || undefined}>
            {loadError ? 'Paused / Offline' : isStoreSyncing ? 'Saving changes...' : (lastSyncTime ? `Saved ${lastSyncTime}` : 'Up to date')}
          </p>
        </div>
      )}

      <div className="p-4 border-t border-white/10 mt-auto bg-black/10">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 rounded-xl bg-emerald-500 border-2 border-emerald-400 flex items-center justify-center text-[10px] font-black text-white uppercase shadow-lg">
            {(currentUser?.name || 'U')[0]}
          </div>
          {!isCollapsed && (
            <div className="overflow-hidden">
              <p className="text-xs font-black text-white truncate leading-none">{currentUser?.name || 'Guest User'}</p>
              <p className="text-[9px] font-bold opacity-40 uppercase tracking-widest mt-1">
                {currentUser?.roleId === 'role-admin' ? 'Admin Mode' : 'Standard User'}
              </p>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;
