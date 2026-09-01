
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Search, User, Package, FileText, CreditCard, Hash, BookOpen, Layers, Tag as TagIcon, X, Loader2, ArrowRight } from 'lucide-react';
import { ContactType } from '../types';

interface GlobalSearchProps {
  store: any;
  onNavigate: (tab: string, filter?: any, context?: any) => void;
}

interface SearchResult {
  id: string;
  type: 'contact' | 'product' | 'invoice' | 'bill' | 'credit_note' | 'journal' | 'account' | 'category' | 'brand' | 'loan' | 'payment' | 'task';
  title: string;
  subtitle?: string;
  extra?: string;
  data: any;
}

const GlobalSearch: React.FC<GlobalSearchProps> = ({ store, onNavigate }) => {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // Focus search on Ctrl+K or Cmd+K
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
        setIsOpen(true);
      }
      // Focus search on / (if not in an input)
      if (e.key === '/' && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
        e.preventDefault();
        inputRef.current?.focus();
        setIsOpen(true);
      }
    };
    document.addEventListener('keydown', handleGlobalKeyDown);
    return () => document.removeEventListener('keydown', handleGlobalKeyDown);
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const results = useMemo(() => {
    if (query.length < 2) return [];

    const q = query.toLowerCase();
    const searchResults: SearchResult[] = [];

    // Filter by active companies
    const activeIds = store.activeCompanyIds || [];

    // Contacts
    (store.contacts || []).forEach((c: any) => {
      const qLower = q;
      if (
        String(c.name || '').toLowerCase().includes(qLower) || 
        String(c.email || '').toLowerCase().includes(qLower) || 
        String(c.phone || '').toLowerCase().includes(qLower) ||
        String(c.externalId || '').toLowerCase().includes(qLower)
      ) {
        searchResults.push({
          id: `contact-${c.id}`,
          type: 'contact',
          title: c.name || 'Unnamed Contact',
          subtitle: c.type === ContactType.CUSTOMER ? 'Customer' : c.type === ContactType.VENDOR ? 'Vendor' : c.type === ContactType.LENDER ? 'Lender' : 'Employee',
          extra: c.externalId ? `ID: ${c.externalId}` : (c.email || c.phone),
          data: c
        });
      }
    });

    // Products
    (store.products || []).forEach((p: any) => {
      const qLower = q;
      if (
        String(p.name || '').toLowerCase().includes(qLower) || 
        String(p.sku || '').toLowerCase().includes(qLower) || 
        String(p.brand || '').toLowerCase().includes(qLower) || 
        String(p.category || '').toLowerCase().includes(qLower) ||
        (p.serialNumbers || []).some((sn: string) => String(sn).toLowerCase().includes(qLower))
      ) {
        searchResults.push({
          id: `product-${p.id}`,
          type: 'product',
          title: p.name || 'Unnamed Product',
          subtitle: `SKU: ${p.sku || 'N/A'} | Brand: ${p.brand || 'No Brand'}`,
          extra: `${(p.price || 0).toFixed(2)} ৳`,
          data: p
        });
      }
    });

    // Invoices
    (store.invoices || []).forEach((inv: any) => {
      const qLower = q;
      if (
        String(inv.number || '').toLowerCase().includes(qLower) || 
        String(inv.reference || '').toLowerCase().includes(qLower) ||
        String(inv.customerName || '').toLowerCase().includes(qLower)
      ) {
        searchResults.push({
          id: `inv-${inv.id}`,
          type: 'invoice',
          title: inv.number || 'INV-???',
          subtitle: `Invoice | ${inv.date} | ${inv.reference || ''}`,
          extra: `${(inv.total || 0).toFixed(2)} ৳`,
          data: inv
        });
      }
    });

    // Bills
    (store.bills || []).forEach((b: any) => {
      const qLower = q;
      if (
        String(b.number || '').toLowerCase().includes(qLower) || 
        String(b.reference || '').toLowerCase().includes(qLower) ||
        String(b.vendorName || '').toLowerCase().includes(qLower)
      ) {
        searchResults.push({
          id: `bill-${b.id}`,
          type: 'bill',
          title: b.number || 'BILL-???',
          subtitle: `Bill | ${b.date} | ${b.reference || ''}`,
          extra: `${(b.total || 0).toFixed(2)} ৳`,
          data: b
        });
      }
    });

    // Credit Notes
    (store.creditNotes || []).forEach((cn: any) => {
      if (cn.reference?.toLowerCase().includes(q)) {
        searchResults.push({
          id: `cn-${cn.id}`,
          type: 'credit_note',
          title: cn.reference,
          subtitle: `Credit Note | ${cn.date}`,
          extra: `${cn.total?.toFixed(2)} ৳`,
          data: cn
        });
      }
    });

    // Payments
    (store.payments || []).forEach((p: any) => {
      if (p.reference?.toLowerCase().includes(q) || p.memo?.toLowerCase().includes(q)) {
        searchResults.push({
          id: `payment-${p.id}`,
          type: 'payment',
          title: p.reference || 'Payment',
          subtitle: `Payment [${p.paymentMethod}] | ${p.date}`,
          extra: `${p.amount?.toFixed(2)} ৳`,
          data: p
        });
      }
    });

    // Ledger Accounts
    (store.accounts || []).forEach((a: any) => {
      if (a.name?.toLowerCase().includes(q) || a.code?.toLowerCase().includes(q)) {
        const balance = store.getAccountBalance ? store.getAccountBalance(a.id) : 0;
        searchResults.push({
          id: `acc-${a.id}`,
          type: 'account',
          title: a.name,
          subtitle: `Account [${a.code}]`,
          extra: `${balance.toFixed(2)} ৳`,
          data: a
        });
      }
    });

    // Journal Entries
    (store.entries || []).filter((e: any) => e.status !== 'DELETED').forEach((e: any) => {
      if (e.reference?.toLowerCase().includes(q) || e.summary?.toLowerCase().includes(q)) {
        searchResults.push({
          id: `journal-${e.id}`,
          type: 'journal',
          title: e.reference || 'Journal Entry',
          subtitle: e.summary,
          extra: e.date,
          data: e
        });
      }
    });

    // Categories
    (store.categories || []).forEach((c: any) => {
      if (c.name?.toLowerCase().includes(q)) {
        searchResults.push({
          id: `cat-${c.id}`,
          type: 'category',
          title: c.name,
          subtitle: 'Product Category',
          data: c
        });
      }
    });

    // Brands
    (store.brands || []).forEach((b: any) => {
      if (b.name?.toLowerCase().includes(q)) {
        searchResults.push({
          id: `brand-${b.id}`,
          type: 'brand',
          title: b.name,
          subtitle: 'Product Brand',
          data: b
        });
      }
    });

    // Loans
    (store.loans || []).forEach((l: any) => {
      if (l.name?.toLowerCase().includes(q) || l.reference?.toLowerCase().includes(q)) {
        searchResults.push({
          id: `loan-${l.id}`,
          type: 'loan',
          title: l.name,
          subtitle: `Loan | ${l.status}`,
          extra: `${l.amount?.toFixed(2)} ৳`,
          data: l
        });
      }
    });

    // Tasks
    (store.tasks || []).forEach((t: any) => {
      if (t.title?.toLowerCase().includes(q) || t.description?.toLowerCase().includes(q)) {
        searchResults.push({
          id: `task-${t.id}`,
          type: 'task',
          title: t.title,
          subtitle: `Task | ${t.status}`,
          extra: t.priority,
          data: t
        });
      }
    });

    return searchResults.slice(0, 15);
  }, [query, store.contacts, store.products, store.invoices, store.bills, store.creditNotes, store.payments, store.accounts, store.entries, store.categories, store.brands, store.loans, store.tasks]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => Math.min(prev + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter') {
      if (selectedIndex >= 0 && results[selectedIndex]) {
        handleSelect(results[selectedIndex]);
      }
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    }
  };

  const handleSelect = (result: SearchResult) => {
    setIsOpen(false);
    setQuery('');
    setSelectedIndex(-1);

    switch (result.type) {
      case 'contact':
        onNavigate('contacts', { contactId: result.data.id });
        break;
      case 'product':
        onNavigate('products', { productId: result.data.id });
        break;
      case 'invoice':
        onNavigate('invoices', { searchQuery: result.data.reference });
        break;
      case 'bill':
        onNavigate('bills', { searchQuery: result.data.reference });
        break;
      case 'credit_note':
        onNavigate('credit_notes');
        break;
      case 'payment':
        onNavigate('payments', { searchQuery: result.data.reference });
        break;
      case 'account':
        // Ledger view doesn't have direct account selection filter yet, but could go to chart of accounts
        onNavigate('accounts');
        break;
      case 'journal':
        onNavigate('journal', { reference: result.data.reference });
        break;
      case 'category':
        onNavigate('categories');
        break;
      case 'brand':
        onNavigate('brands');
        break;
      case 'loan':
        onNavigate('loans');
        break;
      case 'task':
        onNavigate('settings'); // Tasks are usually in settings or a dashboard
        break;
    }
  };

  const getIcon = (type: SearchResult['type']) => {
    switch (type) {
      case 'contact': return <User className="w-4 h-4" />;
      case 'product': return <Package className="w-4 h-4" />;
      case 'invoice': return <FileText className="w-4 h-4" />;
      case 'bill': return <CreditCard className="w-4 h-4" />;
      case 'credit_note': return <Hash className="w-4 h-4" />;
      case 'journal': return <BookOpen className="w-4 h-4" />;
      case 'account': return <Layers className="w-4 h-4" />;
      case 'category': return <TagIcon className="w-4 h-4" />;
      case 'brand': return <TagIcon className="w-4 h-4" />;
      case 'loan': return <CreditCard className="w-4 h-4" />;
      case 'payment': return <CreditCard className="w-4 h-4" />;
      case 'task': return <FileText className="w-4 h-4" />;
      default: return <Search className="w-4 h-4" />;
    }
  };

  return (
    <div className="relative group" ref={containerRef}>
      <div className={`flex items-center bg-slate-50 border transition-all duration-200 rounded-xl px-3 py-1.5 ${isOpen ? 'border-indigo-400 bg-white ring-4 ring-indigo-50 w-64 lg:w-96' : 'border-slate-200 hover:border-slate-300 w-48 lg:w-64'}`}>
        <Search className={`w-4 h-4 transition-colors ${isOpen ? 'text-indigo-500' : 'text-slate-400'}`} />
        <input 
          ref={inputRef}
          type="text" 
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setIsOpen(true);
            setSelectedIndex(-1);
          }}
          onFocus={() => setIsOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder="Search everywhere..." 
          className="flex-1 bg-transparent border-none outline-none text-[11px] font-bold text-slate-700 px-2 placeholder:text-slate-400"
        />
        {(query || isOpen) && (
          <button 
            onClick={() => {
              setQuery('');
              setIsOpen(false);
            }}
            className="p-1 hover:bg-slate-100 rounded-full text-slate-400 transition-colors"
          >
            <X className="w-3 h-3" />
          </button>
        )}
      </div>

      {isOpen && query.length >= 2 && (
        <div className="absolute top-full mt-2 w-full bg-white border border-slate-200 rounded-2xl shadow-2xl overflow-hidden z-[100] animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="max-h-[400px] overflow-y-auto p-2 space-y-1">
            {results.length > 0 ? (
              results.map((result, index) => (
                <button
                  key={result.id}
                  onClick={() => handleSelect(result)}
                  onMouseEnter={() => setSelectedIndex(index)}
                  className={`w-full flex items-center p-3 rounded-xl transition-all group ${selectedIndex === index ? 'bg-indigo-50 text-indigo-700' : 'hover:bg-slate-50 text-slate-600'}`}
                >
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center mr-3 transition-colors ${selectedIndex === index ? 'bg-indigo-100 text-indigo-600' : 'bg-slate-100 text-slate-400'}`}>
                    {getIcon(result.type)}
                  </div>
                  <div className="flex-1 text-left min-w-0">
                    <p className={`text-xs font-black truncate uppercase tracking-tight ${selectedIndex === index ? 'text-indigo-900' : 'text-slate-900'}`}>{result.title}</p>
                    <p className="text-[10px] font-bold opacity-70 truncate uppercase tracking-widest">{result.subtitle}</p>
                  </div>
                  {result.extra && (
                    <div className="text-right ml-2 group-hover:block hidden md:block">
                      <p className="text-[10px] font-black uppercase whitespace-nowrap">{result.extra}</p>
                    </div>
                  )}
                  <ArrowRight className={`w-3 h-3 ml-2 transition-transform duration-200 ${selectedIndex === index ? 'translate-x-0 opacity-100' : '-translate-x-2 opacity-0'}`} />
                </button>
              ))
            ) : (
              <div className="p-12 text-center">
                <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Search className="w-8 h-8 text-slate-300" />
                </div>
                <h4 className="text-sm font-black text-slate-800 uppercase tracking-tighter">No matches found</h4>
                <p className="text-xs text-slate-400 font-medium mt-1">Try searching for keywords, references, or codes.</p>
              </div>
            )}
          </div>
          
          <div className="bg-slate-50 p-2 text-center border-t border-slate-100 italic">
            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">
              Tip: Press <span className="bg-white border rounded px-1 text-slate-500">Enter</span> to navigate • <span className="bg-white border rounded px-1 text-slate-500">Esc</span> to close
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default GlobalSearch;
