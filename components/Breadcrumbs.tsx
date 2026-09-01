
import React from 'react';
import { ChevronRight, Home, ArrowLeft } from 'lucide-react';

interface BreadcrumbProps {
  activeTab: string;
  setActiveTab: (tab: any) => void;
  onBack: () => void;
  reportContext?: any;
  navStack: any[];
}

const Breadcrumbs: React.FC<BreadcrumbProps> = ({ activeTab, setActiveTab, onBack, reportContext, navStack }) => {
  const getHierarchy = (tab: string): { id: string; label: string }[] => {
    const hierarchy: { id: string; label: string }[] = [{ id: 'dashboard', label: 'Home' }];

    switch (tab) {
      case 'dashboard':
        return hierarchy;
      
      // Accounting
      case 'accounts':
        hierarchy.push({ id: 'dashboard', label: 'Accounting' });
        hierarchy.push({ id: 'accounts', label: 'Chart of Accounts' });
        break;
      case 'ledger':
        hierarchy.push({ id: 'dashboard', label: 'Accounting' });
        hierarchy.push({ id: 'ledger', label: 'General Ledger' });
        break;
      case 'journal':
        hierarchy.push({ id: 'dashboard', label: 'Accounting' });
        hierarchy.push({ id: 'journal', label: 'Journal Entries' });
        break;
      case 'loans':
        hierarchy.push({ id: 'dashboard', label: 'Accounting' });
        hierarchy.push({ id: 'loans', label: 'Loans & Financing' });
        break;

      // Sales
      case 'invoices':
        hierarchy.push({ id: 'dashboard', label: 'Sales' });
        hierarchy.push({ id: 'invoices', label: 'Invoices' });
        break;
      case 'credit_notes':
        hierarchy.push({ id: 'dashboard', label: 'Sales' });
        hierarchy.push({ id: 'credit_notes', label: 'Credit Notes' });
        break;
      case 'sales_analysis':
      case 'advanced_sales_analysis':
        hierarchy.push({ id: 'dashboard', label: 'Sales' });
        hierarchy.push({ id: 'advanced_sales_analysis', label: 'Sales Analysis' });
        break;

      // Purchases
      case 'bills':
        hierarchy.push({ id: 'dashboard', label: 'Purchases' });
        hierarchy.push({ id: 'bills', label: 'Bills' });
        break;
      case 'expenses':
        hierarchy.push({ id: 'dashboard', label: 'Purchases' });
        hierarchy.push({ id: 'expenses', label: 'Expenses' });
        break;
      case 'advanced_purchase_analysis':
        hierarchy.push({ id: 'dashboard', label: 'Purchases' });
        hierarchy.push({ id: 'advanced_purchase_analysis', label: 'Purchase Analysis' });
        break;

      // Inventory
      case 'products':
        hierarchy.push({ id: 'dashboard', label: 'Inventory' });
        hierarchy.push({ id: 'products', label: 'Products' });
        break;
      case 'categories':
        hierarchy.push({ id: 'dashboard', label: 'Inventory' });
        hierarchy.push({ id: 'categories', label: 'Categories' });
        break;
      case 'brands':
        hierarchy.push({ id: 'dashboard', label: 'Inventory' });
        hierarchy.push({ id: 'brands', label: 'Brands' });
        break;
      case 'inventory_adjustment':
        hierarchy.push({ id: 'dashboard', label: 'Inventory' });
        hierarchy.push({ id: 'inventory_adjustment', label: 'Stock Adjustments' });
        break;

      // Reporting
      case 'reports':
        hierarchy.push({ id: 'dashboard', label: 'Reports' });
        hierarchy.push({ id: 'reports', label: 'Financial Statements' });
        break;
      case 'partner_ledger':
        hierarchy.push({ id: 'dashboard', label: 'Reports' });
        const lastTab = navStack.length > 0 ? navStack[navStack.length - 1].tab : null;
        if (lastTab === 'contacts' || lastTab === 'employees') {
            hierarchy.push({ id: lastTab, label: lastTab === 'contacts' ? 'Contacts' : 'Employees' });
        } else {
            hierarchy.push({ id: 'reports', label: 'Reporting' });
        }
        hierarchy.push({ id: 'partner_ledger', label: 'Partner Ledger' });
        break;
      case 'inventory_valuation':
        hierarchy.push({ id: 'dashboard', label: 'Reports' });
        hierarchy.push({ id: 'inventory_valuation', label: 'Inventory Valuation' });
        break;
      case 'receivables':
        hierarchy.push({ id: 'dashboard', label: 'Reports' });
        hierarchy.push({ id: 'receivables', label: 'Receivables' });
        break;
      case 'payables':
        hierarchy.push({ id: 'dashboard', label: 'Reports' });
        hierarchy.push({ id: 'payables', label: 'Payables' });
        break;

      // Team
      case 'employees':
        hierarchy.push({ id: 'dashboard', label: 'Team' });
        hierarchy.push({ id: 'employees', label: 'Employees' });
        break;
      case 'payroll':
        hierarchy.push({ id: 'dashboard', label: 'Team' });
        hierarchy.push({ id: 'payroll', label: 'Payroll' });
        break;
      case 'contacts':
        hierarchy.push({ id: 'dashboard', label: 'People' });
        hierarchy.push({ id: 'contacts', label: 'Contacts' });
        break;

      // Settings
      case 'settings':
        hierarchy.push({ id: 'dashboard', label: 'Management' });
        hierarchy.push({ id: 'settings', label: 'Settings' });
        break;
      case 'users':
        hierarchy.push({ id: 'dashboard', label: 'Management' });
        hierarchy.push({ id: 'users', label: 'User Management' });
        break;
      case 'import':
        hierarchy.push({ id: 'dashboard', label: 'Management' });
        hierarchy.push({ id: 'import', label: 'Data Pipeline' });
        break;

      default:
        hierarchy.push({ id: tab, label: tab.charAt(0).toUpperCase() + tab.slice(1).replace('_', ' ') });
    }

    return hierarchy;
  };

  const steps = getHierarchy(activeTab);

  const handleBackAction = () => {
    onBack();
  };

  return (
    <div className="flex items-center space-x-1 sm:space-x-2 no-scrollbar overflow-x-auto min-w-0">
      <button
        onClick={handleBackAction}
        className="flex-shrink-0 flex items-center justify-center w-6 h-6 bg-slate-100 text-slate-600 rounded-md hover:bg-slate-200 hover:text-slate-900 transition-all shadow-sm active:scale-95"
        title="Go Back"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
      </button>

      <div className="flex items-center space-x-1 min-w-0 overflow-hidden">
        {steps.map((step, idx) => {
          // Compact labels
          let label = step.label;
          if (label === 'Financial Statements') label = 'Financials';
          if (label === 'Inventory Valuation') label = 'Valuation';
          if (label === 'Stock Adjustments') label = 'Adjustments';

          return (
            <React.Fragment key={`${step.id}-${idx}`}>
              {idx > 0 && <ChevronRight className="w-3 h-3 text-slate-300 flex-shrink-0" />}
              <button
                onClick={() => setActiveTab(step.id)}
                disabled={idx === steps.length - 1}
                className={`flex items-center px-1.5 py-0.5 rounded text-[10px] sm:text-xs font-bold uppercase tracking-tight transition-all truncate min-w-0 ${
                  idx === steps.length - 1
                    ? 'text-slate-800 cursor-default bg-slate-100/50'
                    : 'text-slate-400 hover:text-indigo-600 hover:bg-slate-50'
                }`}
                title={step.label}
              >
                {idx === 0 && <Home className="w-(3 sm:3.5) h-(3 sm:3.5) sm:mr-1 hidden sm:block" />}
                <span className="truncate">{label}</span>
              </button>
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
};

export default Breadcrumbs;
