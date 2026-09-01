
import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { useAccountingStore } from './store/useAccountingStore';
import { PermissionKey, ContactType } from './types';
import Sidebar from './components/Sidebar';
import Dashboard from './components/Dashboard';
import ChartOfAccounts from './components/ChartOfAccounts';
import InvoiceManager from './components/InvoiceManager';
import BillManager from './components/BillManager';
import CreditNoteManager from './components/CreditNoteManager';
import LedgerView from './components/LedgerView';
import CashLedgerView from './components/CashLedgerView';
import ExcelImporter from './components/ExcelImporter';
import ProductList from './components/ProductList';
import ProductSalesAnalysis from './components/ProductSalesAnalysis';
import AdvancedAnalysis from './components/AdvancedAnalysis';
import FinancialReports from './components/FinancialReports';
import InventoryValuationReport from './components/InventoryValuationReport';
import InventoryAdjustmentManager from './components/InventoryAdjustmentManager';
import Settings from './components/Settings';
import UserManagement from './components/UserManagement';
import CategoryManager from './components/CategoryManager';
import BrandManager from './components/BrandManager';
import { SetPasswordPage, LoginPage, ForgotPasswordPage, ResetPasswordPage, SignUpPage } from './components/AuthPages';
import ContactManager from './components/ContactManager';
import Breadcrumbs from './components/Breadcrumbs';
import PaymentManager from './components/PaymentManager';
import ReceivablePayableSummary from './components/ReceivablePayableSummary';
import PartnerLedgerReport from './components/PartnerLedgerReport';
import MonthlyGeneralLedgerReport from './components/MonthlyGeneralLedgerReport';
import JournalManager from './components/JournalManager';
import ExpenseManager from './components/ExpenseManager';
import CreditNoteAnalysis from './components/CreditNoteAnalysis';
import LoanManager from './components/LoanManager';
import PayrollModule from './components/PayrollModule';
import CashierScreen from './components/CashierScreen';
import GlobalSearch from './components/GlobalSearch';

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'accounts' | 'invoices' | 'bills' | 'credit_notes' | 'ledger' | 'cash_ledger' | 'import' | 'products' | 'categories' | 'brands' | 'reports' | 'inventory_valuation' | 'inventory_adjustment' | 'settings' | 'users' | 'employees' | 'contacts' | 'payments' | 'receivables' | 'payables' | 'partner_ledger' | 'monthly_ledger' | 'journal' | 'expenses' | 'loans' | 'payroll' | 'sales_analysis' | 'advanced_sales_analysis' | 'advanced_purchase_analysis' | 'credit_note_analysis' | 'cashier'>('dashboard');
  const [previousTab, setPreviousTab] = useState<string | null>(null);
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [autoCreate, setAutoCreate] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [reportContext, setReportContext] = useState<{ searchQuery?: string; view?: 'summary' | 'detail'; category?: string; brand?: string; type?: 'inventory' | 'purchases' | 'sales' | 'analysis' | 'partner_ledger'; partnerId?: string; partnerType?: ContactType } | null>(null);
  const [invoiceSearch, setInvoiceSearch] = useState<string | null>(null);
  const [billSearch, setBillSearch] = useState<string | null>(null);
  const [analysisProductId, setAnalysisProductId] = useState<string | null>(null);
  const [analysisContext, setAnalysisContext] = useState<{ brand?: string; category?: string } | null>(null);
  const [creditNoteOrigin, setCreditNoteOrigin] = useState<any>(null);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [showSignUp, setShowSignUp] = useState(false);
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [showInvitation, setShowInvitation] = useState(false);
  const [financialReportState, setFinancialReportState] = useState<any>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [initialFilter, setInitialFilter] = useState<{ screen: string; filter: any } | null>(null);
  
  const store = useAccountingStore();

  if (window.location.hash === '#debugContacts') {
    return (
      <div className="fixed inset-0 p-10 font-mono text-xs text-black bg-white z-[99999] overflow-auto select-all">
        <h1 className="font-bold text-lg mb-4">Debug Contacts</h1>
        <p>Total contacts: {store.contacts?.length}</p>
        <p className="mb-4">Filtered Customers: {store.contacts?.filter(c => c.type === ContactType.CUSTOMER).length}</p>
        <p className="mb-4">Filtered Vendors: {store.contacts?.filter(c => c.type?.toUpperCase() === ContactType.VENDOR).length}</p>
        <p>First 20: {JSON.stringify(store.contacts?.slice(0, 20), null, 2)}</p>
        
        <button onClick={() => { window.location.hash = ''; window.location.reload(); }} className="mt-4 p-2 bg-blue-500 text-white">Close Debug</button>
      </div>
    );
  }

  useEffect(() => {
    if (store.currentUser) {
      setActiveTab(store.loginRole === 'CASHIER' ? 'cashier' : 'dashboard');
    }
  }, [store.currentUser?.id, store.loginRole]);

  useEffect(() => {
    // Handle Supabase Auth redirects (recovery, invite, etc)
    const handleAuthRedirects = () => {
      const hash = window.location.hash;
      const params = new URLSearchParams(window.location.search);

      if (hash.includes('type=recovery') || params.get('type') === 'recovery') {
        setShowResetPassword(true);
      } else if (hash.includes('type=invite') || hash.includes('type=signup') || params.get('type') === 'invite' || params.get('type') === 'signup') {
        // invitation logic if needed
      }

      if (params.get('token') && (params.get('type') === 'invite' || params.get('email'))) {
        setShowInvitation(true);
      }
    };

    handleAuthRedirects();
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    let screen = params.get('screen');
    
    // Auto-detect screen based on specific params if screen is not explicitly set
    if (!screen && (params.has('journal_ref'))) screen = 'JOURNAL';
    
    if (screen) {
      const filter: any = {};
      if (params.has('reference') || params.has('journal_ref')) filter.reference = params.get('journal_ref') || params.get('reference');
      if (params.has('partnerId') || params.has('partner_id')) filter.partnerId = params.get('partner_id') || params.get('partnerId');
      if (params.has('contactId') || params.has('contact_id')) filter.contactId = params.get('contact_id') || params.get('contactId');
      if (params.has('productId') || params.has('product_id')) filter.productId = params.get('product_id') || params.get('productId');
      if (params.has('searchQuery') || params.has('search_query')) filter.searchQuery = params.get('search_query') || params.get('searchQuery');
      
      switch(screen) {
        case 'JOURNAL': setActiveTab('journal'); break;
        case 'CONTACTS': setActiveTab('contacts'); break;
        case 'PRODUCTS': setActiveTab('products'); break;
        case 'INVOICES': setActiveTab('invoices'); break;
        case 'BILLS': setActiveTab('bills'); break;
      }
      setInitialFilter({ screen, filter });
    }
  }, []);

  useEffect(() => {
    const handleToast = (e: any) => {
      setToast(e.detail);
      setTimeout(() => setToast(null), 3000);
    };
    window.addEventListener('app-toast', handleToast);
    return () => window.removeEventListener('app-toast', handleToast);
  }, []);

  const showToast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'success') => {
    window.dispatchEvent(new CustomEvent('app-toast', { detail: { message, type } }));
  }, []);

  const handleClearInitialFilter = useCallback(() => setInitialFilter(null), []);
  const [showCompanyMenu, setShowCompanyMenu] = useState(false);
  const mainRef = useRef<HTMLDivElement>(null);
  const scrollPositions = useRef<Record<string, number>>({});

  const handleBack = useCallback(() => {
    const last = store.popHistory();
    if (last) {
      setActiveTab(last.tab);
      if (last.filter) setInitialFilter(last.filter);
      if (last.reportContext) setReportContext(last.reportContext);
      
      // Restore scroll after a brief delay
      setTimeout(() => {
        if (mainRef.current) mainRef.current.scrollTop = last.scroll || 0;
      }, 100);
    } else {
      setActiveTab('dashboard');
    }
  }, [store.popHistory]);

  const navigate = useCallback((tab: any, filter?: any, context?: any) => {
    if (tab === activeTab) return;

    // Set or Clear URL parameters to maintain deeplinking cleanly
    const url = new URL(window.location.href);
    url.search = '';
    let hasParams = false;
    
    if (filter && tab === 'journal') {
      url.searchParams.set('screen', 'JOURNAL');
      if (filter.reference) {
        url.searchParams.set('journal_ref', filter.reference);
        hasParams = true;
      }
      if (filter.partnerId) {
         url.searchParams.set('partner_id', filter.partnerId);
         hasParams = true;
      }
    } else if (filter && tab === 'products') {
      url.searchParams.set('screen', 'PRODUCTS');
      if (filter.productId) url.searchParams.set('product_id', filter.productId);
      if (filter.searchQuery) url.searchParams.set('search_query', filter.searchQuery);
      hasParams = true;
    } else if (filter && tab === 'contacts') {
      url.searchParams.set('screen', 'CONTACTS');
      if (filter.contactId) url.searchParams.set('contact_id', filter.contactId);
      if (filter.searchQuery) url.searchParams.set('search_query', filter.searchQuery);
      hasParams = true;
    }

    if (hasParams) {
      window.history.pushState({}, '', url.toString());
    } else {
      window.history.pushState({}, '', window.location.pathname);
    }

    // Save current state to history
    const entry = {
      tab: activeTab,
      filter: initialFilter,
      reportContext: reportContext,
      scroll: mainRef.current?.scrollTop || 0
    };
    store.pushHistory(entry);
    
    // Set new state
    if (filter) {
      if (filter.screen) {
        setInitialFilter(filter);
      } else {
        const screenMap: any = { 'journal': 'JOURNAL', 'products': 'PRODUCTS', 'contacts': 'CONTACTS', 'invoices': 'INVOICES', 'bills': 'BILLS', 'payments': 'PAYMENTS' };
        setInitialFilter({ screen: screenMap[tab] || '', filter });
      }
    }
    
    if (context) setReportContext(context);
    setActiveTab(tab);
    
    // Reset scroll for new page
    if (mainRef.current) mainRef.current.scrollTop = 0;
  }, [activeTab, initialFilter, reportContext, store.pushHistory]);

  useEffect(() => {
    const main = mainRef.current;
    if (!main) return;

    const handleScroll = () => {
      scrollPositions.current[activeTab] = main.scrollTop;
    };
    main.addEventListener('scroll', handleScroll);
    
    return () => main.removeEventListener('scroll', handleScroll);
  }, [activeTab]);

  const handleQuickAction = useCallback((tab: any) => {
    navigate(tab);
    setAutoCreate(true);
    setShowAddMenu(false);
    setTimeout(() => setAutoCreate(false), 500);
  }, [navigate]);

  const handleNavigateToReport = useCallback((context: { searchQuery?: string; view?: 'summary' | 'detail'; category?: string; brand?: string; type?: 'inventory' | 'purchases' | 'sales' | 'analysis' }) => {
    if (context.type === 'purchases') {
      navigate('advanced_purchase_analysis', null, { brand: context.brand, category: context.category });
    } else if (context.type === 'sales') {
      navigate('advanced_sales_analysis', null, { brand: context.brand, category: context.category });
    } else if (context.type === 'analysis') {
      navigate('sales_analysis', null, { brand: context.brand, category: context.category });
    } else {
      navigate('inventory_valuation', null, context);
    }
  }, [navigate]);

  const handleNavigateToInvoices = useCallback((searchQuery: string) => {
    navigate('invoices', { screen: 'INVOICES', filter: { searchQuery } });
  }, [navigate]);

  const handleNavigateToBills = useCallback((searchQuery: string) => {
    navigate('bills', { screen: 'BILLS', filter: { searchQuery } });
  }, [navigate]);

  const handleNavigateToSalesAnalysis = useCallback((productId: string) => {
    setAnalysisProductId(productId);
    navigate('sales_analysis');
  }, [navigate]);

  const handleNavigateToPurchaseAnalysis = useCallback((productId: string) => {
    setAnalysisProductId(productId);
    navigate('advanced_purchase_analysis');
  }, [navigate]);

  const handleNavigateToAdjustment = useCallback(() => {
    navigate('inventory_adjustment');
  }, [navigate]);

  const handleCreateCreditNoteFromInvoice = useCallback((invoice: any) => {
    setCreditNoteOrigin(invoice);
    navigate('credit_notes');
    setAutoCreate(true);
    setTimeout(() => setAutoCreate(false), 500);
  }, [navigate]);

  const handleNavigateToPartnerLedger = useCallback((partnerId: string, partnerType: ContactType) => {
    navigate('partner_ledger', null, { type: 'partner_ledger', partnerId, partnerType });
  }, [navigate]);

  const handleClearReportContext = useCallback(() => setReportContext(null), []);
  const handleClearCreditNoteOrigin = useCallback(() => setCreditNoteOrigin(null), []);

  useEffect(() => {
    const handleNav = (e: any) => {
      const { screen, query, type, partnerId, filter } = e.detail || {};
      
      const targetTabMap: Record<string, string> = {
        'JOURNAL': 'journal',
        'CONTACTS': 'contacts',
        'PRODUCTS': 'products',
        'PAYMENTS': 'payments',
        'INVOICES': 'invoices',
        'BILLS': 'bills'
      };

      const targetTab = targetTabMap[screen];
      
      if (screen === 'PARTNER_LEDGER' && partnerId) {
        navigate('partner_ledger', null, { type: 'partner_ledger', partnerId, partnerType: type || ContactType.CUSTOMER });
      } else if (targetTab) {
        navigate(targetTab as any, filter || (query ? { screen: screen, filter: { searchQuery: query } } : null));
      }
    };
    window.addEventListener('accounting-nav', handleNav);
    const handleCreateCN = (e: any) => handleCreateCreditNoteFromInvoice(e.detail);
    window.addEventListener('accounting-create-credit-note', handleCreateCN);
    return () => { window.removeEventListener('accounting-nav', handleNav); window.removeEventListener('accounting-create-credit-note', handleCreateCN); };
  }, [navigate]);

  const isFormActive = ['invoices', 'expenses', 'payments', 'journal', 'bills'].includes(activeTab);

  // Simple routing for auth pages
  const path = window.location.pathname;
  if (path === '/set-password') {
    return <SetPasswordPage store={store} />;
  }
  if (path === '/reset-password') {
    return <ResetPasswordPage store={store} onBack={() => window.location.href = '/'} />;
  }

  // Handle initialization states
  // We only show splash if we are still checking the session.
  const isInitializing = !store.sessionChecked;
  const initialShowSplash = isInitializing;

  // Prevent flickering by only showing the splash if initialization takes more than 150ms
  const [showSplash, setShowSplash] = useState(false);
  useEffect(() => {
    let timer: any;
    if (initialShowSplash) {
      timer = setTimeout(() => setShowSplash(true), 150);
    } else {
      setShowSplash(false);
    }
    return () => clearTimeout(timer);
  }, [initialShowSplash]);

  useEffect(() => {
    if (showSplash) {
      const t = setTimeout(() => setShowSplash(false), 5000);
      return () => clearTimeout(t);
    }
  }, [showSplash]);

  if (showSplash) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-slate-50 flex-col space-y-4 p-10 text-center">
        {!store.loadError ? (
          <>
            <div className="w-16 h-16 bg-white rounded-2xl shadow-xl flex items-center justify-center relative overflow-hidden group">
              <div className="absolute inset-0 bg-indigo-500 opacity-10 animate-pulse"></div>
              <div className="w-8 h-8 border-3 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
            </div>
            <div className="space-y-1">
              <h2 className="text-xl font-black text-slate-800 uppercase tracking-tighter">
                {!store.sessionChecked ? 'Waking up engine' : 'Syncing Cloud Data'}
              </h2>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest animate-pulse">
                Please wait a moment...
              </p>
            </div>
          </>
        ) : (
          <>
            <div className="w-16 h-16 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center mb-4">
              <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-slate-800">Connection Failed</h2>
            <p className="text-sm text-slate-500 max-w-md">{store.loadError}</p>
            <div className="mt-8 p-6 bg-slate-100 rounded-2xl text-left border border-slate-200">
              <p className="text-[10px] text-slate-500 mb-4 font-medium">Please refresh the application and try again.</p>
            </div>
            <button 
              onClick={() => window.location.reload()} 
              className="mt-6 px-6 py-2 bg-indigo-600 text-white font-bold rounded-lg hover:bg-indigo-700 transition-all"
            >
              Retry Connection
            </button>
          </>
        )}
      </div>
    );
  }

  if (showResetPassword) {
    return (
      <ResetPasswordPage 
        store={store} 
        onBack={async () => {
          try {
            await store.logout();
          } catch (e) {
            console.error(e);
          }
          setShowResetPassword(false);
          if (typeof window !== 'undefined') {
            window.location.hash = '';
            const url = new URL(window.location.href);
            url.searchParams.delete('type');
            url.searchParams.delete('token');
            window.history.replaceState({}, '', url.origin);
          }
        }} 
      />
    );
  }

  if (!store.currentUser) {
    if (showInvitation) {
      return <SetPasswordPage store={store} />;
    }
    if (showForgotPassword) {
      return <ForgotPasswordPage store={store} onBack={() => setShowForgotPassword(false)} />;
    }
    if (showSignUp) {
      return <SignUpPage store={store} onBack={() => setShowSignUp(false)} />;
    }
    return <LoginPage store={store} onForgotPassword={() => setShowForgotPassword(true)} onSignUp={() => setShowSignUp(true)} />;
  }

  // Role selection for cashiers
  if (store.currentUser.isCashier && !store.loginRole) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6">
        <div className="max-w-4xl w-full grid grid-cols-1 md:grid-cols-2 gap-8">
          <button 
            onClick={() => {
              store.setLoginRole('USER');
              setActiveTab('dashboard');
            }}
            className="group bg-slate-900 border border-slate-800 p-12 rounded-[3rem] text-center hover:border-indigo-500/50 transition-all hover:shadow-2xl hover:shadow-indigo-500/10"
          >
            <div className="w-24 h-24 bg-slate-800 rounded-3xl mx-auto mb-8 flex items-center justify-center group-hover:scale-110 transition-transform">
              <svg className="w-12 h-12 text-slate-400 group-hover:text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </div>
            <h3 className="text-2xl font-black text-white uppercase tracking-tighter mb-2 italic">Standard User</h3>
            <p className="text-slate-500 text-sm font-medium">Access full ERP modules, reports, and management tools.</p>
          </button>

          <button 
            onClick={() => {
              store.setLoginRole('CASHIER');
              setActiveTab('cashier');
            }}
            className="group bg-indigo-600 p-12 rounded-[3rem] text-center hover:bg-indigo-500 transition-all shadow-2xl shadow-indigo-500/20"
          >
            <div className="w-24 h-24 bg-white/20 rounded-3xl mx-auto mb-8 flex items-center justify-center group-hover:scale-110 transition-transform">
              <svg className="w-12 h-12 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
            <h3 className="text-2xl font-black text-white uppercase tracking-tighter mb-2 italic">Smart Cashier</h3>
            <p className="text-indigo-100 text-sm font-medium">Dedicated terminal for real-time payment clearing and treasury.</p>
          </button>
        </div>
      </div>
    );
  }

  const renderContent = () => {
    const tabPermissions: Record<string, PermissionKey> = {
      'accounts': 'ledger_view',
      'invoices': 'invoice_view',
      'credit_notes': 'credit_note_view',
      'bills': 'bill_view',
      'expenses': 'expense_view',
      'payments': 'payment_view',
      'ledger': 'ledger_view',
      'journal': 'journal_view',
      'loans': 'loan_view',
      'reports': 'report_financial',
      'advanced_sales_analysis': 'report_sales',
      'advanced_purchase_analysis': 'report_purchase',
      'inventory_valuation': 'inventory_valuation_view',
      'products': 'product_view',
      'categories': 'category_manage',
      'brands': 'brand_manage',
      'inventory_adjustment': 'inventory_adjustment_view',
      'employees': 'employee_view',
      'users': 'team_manage',
      'payroll': 'payroll_view',
      'settings': 'settings_manage',
      'import': 'data_import',
      'contacts': 'customer_view',
      'receivables': 'report_financial',
      'payables': 'report_financial',
      'partner_ledger': 'report_financial',
      'monthly_ledger': 'report_financial',
      'sales_analysis': 'report_sales',
      'credit_note_analysis': 'report_sales',
      'cashier': 'invoice_create'
    };

    if (tabPermissions[activeTab] && !store.hasPermission(tabPermissions[activeTab])) {
      return <Dashboard store={store} />;
    }

    switch (activeTab) {
      case 'dashboard': return <Dashboard store={store} />;
      case 'accounts': return <ChartOfAccounts store={store} />;
      case 'invoices': 
        return (
          <InvoiceManager 
            store={store} 
            defaultCreate={autoCreate} 
            onCreateCreditNote={handleCreateCreditNoteFromInvoice} 
            initialSearch={initialFilter?.screen === 'INVOICES' ? initialFilter.filter?.searchQuery : null}
            initialContext={reportContext?.type === 'sales' ? reportContext : (initialFilter?.screen === 'INVOICES' ? initialFilter.filter?.context : null)}
            onClearSearch={() => {
              handleClearInitialFilter();
              setReportContext(null);
            }}
            onNavigate={navigate}
          />
        );
      case 'bills': 
        return (
          <BillManager 
            store={store} 
            defaultCreate={autoCreate} 
            initialSearch={initialFilter?.screen === 'BILLS' ? initialFilter.filter?.searchQuery : null}
            initialContext={reportContext?.type === 'purchases' ? reportContext : (initialFilter?.screen === 'BILLS' ? initialFilter.filter?.context : null)}
            onClearSearch={() => {
              handleClearInitialFilter();
              setReportContext(null);
            }}
            onNavigate={navigate}
          />
        );
      case 'credit_notes': 
        return (
          <CreditNoteManager 
            store={store} 
            defaultCreate={autoCreate} 
            originInvoice={creditNoteOrigin} 
            onClearOrigin={handleClearCreditNoteOrigin} 
            onNavigate={navigate}
          />
        );
      case 'ledger': return <LedgerView store={store} onNavigate={navigate} />;
      case 'cash_ledger': return <CashLedgerView store={store} onNavigate={navigate} />;
      case 'journal': 
        return (
          <JournalManager 
            store={store} 
            defaultCreate={autoCreate} 
            initialSearch={initialFilter?.screen === 'JOURNAL' ? initialFilter.filter?.reference || initialFilter.filter?.searchQuery : null}
            initialPartnerId={initialFilter?.screen === 'JOURNAL' ? initialFilter.filter?.partnerId : null}
            onClearSearch={handleClearInitialFilter}
            onNavigate={navigate}
          />
        );
      case 'expenses': return <ExpenseManager store={store} defaultCreate={autoCreate} onNavigate={navigate} />;
      case 'products': 
        return (
          <ProductList 
            store={store} 
            defaultCreate={autoCreate} 
            initialSearch={initialFilter?.screen === 'PRODUCTS' ? initialFilter.filter?.searchQuery : null}
            initialProductId={initialFilter?.screen === 'PRODUCTS' ? initialFilter.filter?.productId : null}
            onClearSearch={handleClearInitialFilter}
            onNavigateToReport={handleNavigateToReport} 
            onNavigateToInvoices={handleNavigateToInvoices}
            onNavigateToBills={handleNavigateToBills}
            onNavigateToSalesAnalysis={handleNavigateToSalesAnalysis}
            onNavigateToPurchaseAnalysis={handleNavigateToPurchaseAnalysis}
            onNavigateToAdjustment={handleNavigateToAdjustment}
          />
        );
      case 'categories':
        return <CategoryManager store={store} onNavigateToReport={handleNavigateToReport} />;
      case 'brands':
        return <BrandManager store={store} onNavigateToReport={handleNavigateToReport} />;
      case 'sales_analysis':
        return (
          <ProductSalesAnalysis 
            store={store} 
            productId={analysisProductId || ''} 
            brand={analysisContext?.brand}
            category={analysisContext?.category}
            onBack={() => {
              setAnalysisProductId(null);
              setAnalysisContext(null);
              setActiveTab('products');
            }} 
          />
        );
      case 'credit_note_analysis':
        return <CreditNoteAnalysis store={store} />;
      case 'reports': return <FinancialReports store={store} initialState={financialReportState} onStateChange={setFinancialReportState} />;
      case 'advanced_sales_analysis': return <AdvancedAnalysis store={store} type="sales" initialBrand={analysisContext?.brand} initialCategory={analysisContext?.category} initialProductId={analysisProductId || ''} />;
      case 'advanced_purchase_analysis': return <AdvancedAnalysis store={store} type="purchase" initialBrand={analysisContext?.brand} initialCategory={analysisContext?.category} initialProductId={analysisProductId || ''} />;
      case 'inventory_valuation': 
        return <InventoryValuationReport store={store} initialContext={reportContext} onContextClear={handleClearReportContext} />;
      case 'inventory_adjustment':
        return <InventoryAdjustmentManager store={store} />;
      case 'import': return <ExcelImporter store={store} />;
      case 'settings': return <Settings store={store} />;
      case 'users': return <UserManagement store={store} />;
      case 'employees': 
        return (
          <ContactManager 
            store={store} 
            defaultCreate={autoCreate} 
            defaultType={ContactType.EMPLOYEE} 
            filterType={ContactType.EMPLOYEE} 
            title="Employees" 
            initialSearch={initialFilter?.screen === 'CONTACTS' ? initialFilter.filter?.searchQuery : null}
            initialContactId={initialFilter?.screen === 'CONTACTS' ? initialFilter.filter?.contactId : null}
            onClearSearch={handleClearInitialFilter}
            onNavigateToLedger={handleNavigateToPartnerLedger} 
          />
        );
      case 'contacts': 
        return (
          <ContactManager 
            store={store} 
            defaultCreate={autoCreate} 
            initialSearch={initialFilter?.screen === 'CONTACTS' ? initialFilter.filter?.searchQuery : null}
            initialContactId={initialFilter?.screen === 'CONTACTS' ? initialFilter.filter?.contactId : null}
            onClearSearch={handleClearInitialFilter}
            onNavigateToLedger={handleNavigateToPartnerLedger} 
          />
        );
      case 'payments': 
        return (
          <PaymentManager 
            store={store} 
            defaultCreate={autoCreate} 
            initialSearch={initialFilter?.screen === 'PAYMENTS' ? initialFilter.filter?.searchQuery : null}
            onClearSearch={handleClearInitialFilter}
            onNavigate={navigate}
          />
        );
      case 'receivables': return <ReceivablePayableSummary store={store} mode="AR" />;
      case 'payables': return <ReceivablePayableSummary store={store} mode="AP" />;
      case 'monthly_ledger': return <MonthlyGeneralLedgerReport store={store} onNavigate={navigate} />;
      case 'partner_ledger': 
        return (
          <PartnerLedgerReport 
            store={store} 
            initialPartnerId={reportContext?.partnerId} 
            initialPartnerType={reportContext?.partnerType} 
            onClearContext={handleClearReportContext} 
            onNavigate={navigate}
            onBack={() => {
              if (previousTab) {
                setActiveTab(previousTab as any);
                setPreviousTab(null);
              } else {
                setActiveTab('contacts');
              }
            }}
          />
        );
      case 'loans': return <LoanManager store={store} defaultCreate={autoCreate} onNavigate={navigate} />;
      case 'payroll': return <PayrollModule store={store} />;
      case 'cashier': return <CashierScreen store={store} />;
      default: return <Dashboard store={store} />;
    }
  };

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden font-sans relative">
      <Sidebar 
        activeTab={activeTab} 
        setActiveTab={setActiveTab} 
        onOpenAddMenu={() => setShowAddMenu(true)} 
        onQuickAction={handleQuickAction}
        isCollapsed={isSidebarCollapsed}
        currentUser={store.currentUser}
        hasPermission={store.hasPermission}
        loginRole={store.loginRole}
        setLoginRole={store.setLoginRole}
        isStoreSyncing={store.isStoreSyncing}
        lastSyncTime={store.lastSyncTime}
        loadError={store.loadError}
      />
      
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
        <header className="sticky top-0 z-40 flex items-center justify-between px-3 py-1.5 bg-white border-b shadow-[0_1px_2px_rgba(0,0,0,0.02)] border-slate-200 min-w-0">
          {/* Left: Sidebar Toggle & Breadcrumbs */}
          <div className="flex items-center space-x-2 flex-1 min-w-0">
            <button 
              onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
              className="flex-shrink-0 p-1 hover:bg-slate-100 rounded text-slate-500 transition-colors"
              title={isSidebarCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16"/>
              </svg>
            </button>
            <div className="min-w-0 flex-1">
              <Breadcrumbs activeTab={activeTab} setActiveTab={navigate} onBack={handleBack} reportContext={reportContext} navStack={store.navStack} />
            </div>
          </div>
          
          {/* Right: Search, Actions, Company, User Profile */}
          <div className="flex items-center space-x-2 sm:space-x-4 flex-shrink-0 ml-4">
            
            {/* Global Search Bar */}
            <div className="block">
              <GlobalSearch store={store} onNavigate={navigate} />
            </div>

            <button 
              onClick={() => setShowAddMenu(true)}
              className="w-7 h-7 sm:w-8 sm:h-8 rounded overflow-hidden bg-[#714B67] text-white flex items-center justify-center shadow-sm hover:brightness-110 active:scale-95 transition-all group shrink-0"
              title="Create New Transaction"
            >
              <svg className="w-4 h-4 sm:w-5 sm:h-5 group-hover:rotate-90 transition-transform duration-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M12 6v6m0 0v6m0-6h6m-6 0H6"/>
              </svg>
            </button>

            <div className="relative shrink-0">
              <button 
                onClick={() => setShowCompanyMenu(!showCompanyMenu)}
                className="flex items-center space-x-1.5 px-2 py-1 rounded bg-slate-100 border border-slate-200 hover:bg-slate-200 transition-all group active:scale-95"
              >
                <div className="flex -space-x-1 overflow-hidden">
                  {(store.activeCompanies || []).slice(0, 1).filter(Boolean).map((c: any) => (
                    <div key={c.id} className={`w-4 h-4 sm:w-5 sm:h-5 rounded-[4px] ${c.logoColor || 'bg-slate-500'} border border-white flex items-center justify-center text-[6px] sm:text-[7px] text-white font-black shadow-inner`}>
                      {(c.name || '?').substring(0, 1)}
                    </div>
                  ))}
                </div>
                <div className="text-left hidden lg:block">
                  <p className="text-[10px] font-black text-slate-900 leading-none truncate max-w-[100px]">
                    {store.activeCompanies[0]?.name || 'Select Entity'}
                  </p>
                </div>
                <svg className={`w-3 h-3 text-slate-400 transition-transform duration-200 ${showCompanyMenu ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"/></svg>
              </button>

              {showCompanyMenu && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowCompanyMenu(false)}></div>
                  <div className="absolute right-0 top-full mt-1 w-72 bg-white rounded-xl shadow-xl border border-slate-100 py-2 z-50 animate-in fade-in slide-in-from-top-2 duration-200 overflow-hidden">
                    <div className="px-4 py-2 mb-1 border-b border-slate-50 flex justify-between items-center">
                      <h4 className="text-[11px] font-bold text-slate-800">Active Entities ({store.availableCompanies?.length || 0})</h4>
                      {store.hasPermission('settings_manage') && (
                        <button onClick={store.selectAllCompanies} className="text-[9px] font-black text-indigo-600 uppercase">Select All</button>
                      )}
                    </div>
                    <div className="max-h-[300px] overflow-y-auto px-1.5 space-y-0.5">
                      {(store.availableCompanies || []).filter((c: any) => c && c.name && c.name.trim() !== '').map((c: any) => (
                        <button
                          key={c.id}
                          onClick={(e) => {
                            if (e.ctrlKey || e.metaKey) {
                              const isSelected = store.activeCompanyIds.includes(c.id);
                              let newIds = [];
                              if (isSelected) {
                                newIds = (store.activeCompanyIds || []).filter((id: string) => id !== c.id);
                                if (newIds.length === 0) newIds = [c.id]; // fallback
                              } else {
                                newIds = [...store.activeCompanyIds, c.id];
                              }
                              store.setActiveCompanyIds(newIds);
                            } else {
                              store.setActiveCompanyIds([c.id]);
                              setShowCompanyMenu(false);
                            }
                          }}
                          className={`w-full flex items-center space-x-2.5 px-3 py-1.5 rounded-lg transition-all ${
                            store.activeCompanyIds.includes(c.id) ? 'bg-indigo-50/50' : 'hover:bg-slate-50'
                          }`}
                        >
                          <div className={`w-5 h-5 rounded-md ${c.logoColor || 'bg-slate-500'} flex items-center justify-center text-[7px] text-white font-black shadow-inner`}>{(c.name || '?')[0]}</div>
                          <span className="text-[11px] font-bold text-slate-700 truncate">{c.name || 'Unnamed Company'}</span>
                          {store.activeCompanyIds.includes(c.id) && (
                            <svg className="w-3 h-3 text-indigo-600 ml-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"/></svg>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>

            <div className="flex items-center space-x-1 border-l pl-2 border-slate-200 shrink-0">
              <button 
                onClick={() => {
                  store.logout();
                  setActiveTab('dashboard');
                }}
                className="p-1 text-slate-400 hover:text-rose-500 transition-colors rounded hover:bg-rose-50"
                title="Logout"
              >
                <svg className="w-4 h-4 sm:w-4.5 sm:h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
              </button>
              <div className="h-6 w-6 sm:h-7 sm:w-7 rounded bg-slate-900 text-white flex items-center justify-center font-black text-[9px] shadow-sm ml-1 select-none">
                {(store.currentUser?.name || 'User').split(' ').map((n: string) => n[0]).join('')}
              </div>
            </div>
          </div>
        </header>

        <div ref={mainRef} className="flex-1 overflow-y-auto bg-slate-50/50 relative p-4">
          {renderContent()}
        </div>
      </main>

      {showAddMenu && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/40 backdrop-blur-[2px]">
          <div className="fixed inset-0" onClick={() => setShowAddMenu(false)}></div>
          <div className="relative bg-white w-full max-w-4xl rounded-3xl shadow-2xl border border-slate-200 overflow-hidden animate-in zoom-in duration-200">
            <div className="flex justify-between items-center px-10 py-6 border-b bg-slate-50/50">
               <h3 className="text-xl font-black text-slate-800 uppercase tracking-tighter">Create New Transaction</h3>
               <button onClick={() => setShowAddMenu(false)} className="text-slate-400 hover:text-slate-600 transition-colors w-10 h-10 rounded-full hover:bg-slate-100 flex items-center justify-center">
                 <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"/></svg>
               </button>
            </div>
            
            <div className="p-12 grid grid-cols-4 gap-12 bg-white">
               <div className="space-y-6">
                 <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest border-b pb-3 border-slate-100">Customers</h4>
                 <div className="flex flex-col space-y-4">
                   <button onClick={() => handleQuickAction('invoices')} className="text-sm text-slate-600 hover:text-indigo-600 font-bold text-left hover:translate-x-1 transition-all">Invoice</button>
                   <button onClick={() => handleQuickAction('credit_notes')} className="text-sm text-slate-600 hover:text-indigo-600 font-bold text-left hover:translate-x-1 transition-all text-rose-500">Credit Note (Refund)</button>
                   <button onClick={() => handleQuickAction('payments')} className="text-sm text-slate-600 hover:text-indigo-600 font-bold text-left hover:translate-x-1 transition-all">Receive payment</button>
                   <button onClick={() => handleQuickAction('contacts')} className="text-sm text-slate-600 hover:text-indigo-600 font-bold text-left hover:translate-x-1 transition-all">Add Contact</button>
                   <button onClick={() => handleQuickAction('contacts')} className="text-sm text-slate-600 hover:text-indigo-600 font-bold text-left hover:translate-x-1 transition-all">Estimate</button>
                 </div>
               </div>

               <div className="space-y-6">
                 <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest border-b pb-3 border-slate-100">Vendors</h4>
                 <div className="flex flex-col space-y-4">
                   <button onClick={() => handleQuickAction('expenses')} className="text-sm text-slate-600 hover:text-indigo-600 font-bold text-left hover:translate-x-1 transition-all">Expense</button>
                   <button onClick={() => handleQuickAction('bills')} className="text-sm text-slate-600 hover:text-indigo-600 font-bold text-left hover:translate-x-1 transition-all">Bill</button>
                 </div>
               </div>

               <div className="space-y-6">
                 <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest border-b pb-3 border-slate-100">Team</h4>
                 <div className="flex flex-col space-y-4">
                   <button onClick={() => handleQuickAction('employees')} className="text-sm text-slate-600 hover:text-indigo-600 font-bold text-left hover:translate-x-1 transition-all">Add Employee</button>
                   <button onClick={() => handleQuickAction('payroll')} className="text-sm text-slate-600 hover:text-indigo-600 font-bold text-left hover:translate-x-1 transition-all">Payroll</button>
                 </div>
               </div>

               <div className="space-y-6">
                 <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest border-b pb-3 border-slate-100">Other</h4>
                 <div className="flex flex-col space-y-4">
                   <button onClick={() => handleQuickAction('journal')} className="text-sm text-slate-600 hover:text-indigo-600 font-bold text-left hover:translate-x-1 transition-all">Journal entry</button>
                   <button onClick={() => handleQuickAction('loans')} className="text-sm text-slate-600 hover:text-indigo-600 font-bold text-left hover:translate-x-1 transition-all">New Loan/Financing</button>
                   <button onClick={() => handleQuickAction('products')} className="text-sm text-slate-600 hover:text-indigo-600 font-bold text-left hover:translate-x-1 transition-all">Add product/service</button>
                 </div>
               </div>
            </div>
          </div>
        </div>
      )}

      {/* Toast Notification Overlay */}
      {toast && (
        <div className="fixed bottom-10 left-1/2 -translate-x-1/2 z-[200] animate-in slide-in-from-bottom-5 duration-300">
          <div className={`px-6 py-3 rounded-2xl shadow-2xl flex items-center space-x-3 border ${
            toast.type === 'success' ? 'bg-emerald-600 border-emerald-500 text-white' :
            toast.type === 'error' ? 'bg-rose-600 border-rose-500 text-white' :
            'bg-slate-800 border-slate-700 text-white'
          }`}>
            {toast.type === 'success' ? (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"/></svg>
            ) : toast.type === 'error' ? (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M6 18L18 6M6 6l12 12"/></svg>
            ) : (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
            )}
            <span className="text-xs font-black uppercase tracking-widest">{toast.message}</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
