
import React, { useState, useEffect, useMemo } from 'react';
import { Contact, ContactType } from '../types';
import {formatNumber, exportToXLSX, exportToPDF, getOpDateBST, formatDateTime} from '../constants';
import FaceAttendance from './FaceAttendance';
import { Scan, UserCheck, X, LayoutGrid, List, Download, FileSpreadsheet, Filter, ArrowRight, Search, MapPin, Calendar, Wallet, Plus } from 'lucide-react';

import Pagination from './Pagination';

const ContactManager: React.FC<{ 
  store: any; 
  defaultCreate?: boolean; 
  defaultType?: ContactType; 
  filterType?: ContactType; 
  title?: string;
  initialSearch?: string | null;
  initialContactId?: string | null;
  onClearSearch?: () => void;
  onNavigateToLedger?: (partnerId: string, partnerType: ContactType) => void;
}> = ({ store, defaultCreate, defaultType, filterType, title, initialSearch, initialContactId, onClearSearch, onNavigateToLedger }) => {
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showFaceEnrollModal, setShowFaceEnrollModal] = useState(false);
  const [enrollEmployeeId, setEnrollEmployeeId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'kanban' | 'list'>('kanban');
  const [showFilters, setShowFilters] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(80);
  
  const [activePartnerTab, setActivePartnerTab] = useState<ContactType | 'ALL'>(filterType || ContactType.CUSTOMER);
  const [searchQuery, setSearchQuery] = useState(initialSearch || '');
  const [contactIdFilter, setContactIdFilter] = useState<string | null>(initialContactId || null);
  const [exportCompanyId, setExportCompanyId] = useState<string>(store.activeCompanyIds[0] || '');
  const [selectedContactIds, setSelectedContactIds] = useState<Set<string>>(new Set());
  const [showMergeModal, setShowMergeModal] = useState(false);
  const [masterContactId, setMasterContactId] = useState('');
  const [isMerging, setIsMerging] = useState(false);

  const handleToggleSelectContact = (id: string) => {
    setSelectedContactIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) newSet.delete(id);
      else newSet.add(id);
      return newSet;
    });
  };

  const handleMergeContacts = async () => {
    if (!masterContactId) {
      if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('app-toast', { detail: { message: 'Please select a master contact', type: 'error' } }));
      return;
    }
    if (selectedContactIds.size < 2) {
      if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('app-toast', { detail: { message: 'At least 2 contacts must be selected', type: 'error' } }));
      return;
    }
    
    setIsMerging(true);
    try {
      const mergeIds = Array.from(selectedContactIds);
      await store.mergeContacts(mergeIds, masterContactId);
      setShowMergeModal(false);
      setSelectedContactIds(new Set());
    } catch (e: any) {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('app-toast', { detail: { message: `Failed to merge contacts: ${e.message || 'Unknown error'}`, type: 'error' } }));
      }
    } finally {
      setIsMerging(false);
    }
  };

  useEffect(() => {
    const handleNav = (e: any) => {
      if (e.detail?.screen === 'CONTACTS' && e.detail.filter) {
        if (e.detail.filter.searchQuery) {
          setSearchQuery(e.detail.filter.searchQuery);
        }
        if (e.detail.filter.contactId) {
          setContactIdFilter(e.detail.filter.contactId);
          setActivePartnerTab('ALL');
        }
        setShowForm(false);
      }
    };
    window.addEventListener('accounting-nav', handleNav);
    return () => window.removeEventListener('accounting-nav', handleNav);
  }, []);

  useEffect(() => {
    if (initialSearch) {
      setSearchQuery(initialSearch);
      setActivePartnerTab('ALL');
      if (onClearSearch) onClearSearch();
      setShowForm(false);
    }
  }, [initialSearch, onClearSearch]);

  // Advanced Filters State
  const [advancedFilters, setAdvancedFilters] = useState({
    search: '',
    type: filterType || '',
    minBalance: '',
    maxBalance: '',
    location: '',
    lastTransactionDate: ''
  });

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    type: defaultType || ContactType.CUSTOMER,
    phone: '',
    address: '',
    taxId: '',
    assignedUserId: '',
    companyId: store.activeCompanyIds[0] || store.companies[0]?.id,
    monthlyFixedSalary: 0,
    advanceSalary: 0,
    designation: ''
  });

  useEffect(() => {
    const options: any = {
      limit: pageSize,
      offset: (currentPage - 1) * pageSize,
      sortField: 'name',
      sortOrder: 'asc' as const,
      filters: {
        ...(activePartnerTab !== 'ALL' && { type: activePartnerTab }),
        ...(filterType && { type: filterType }),
        ...(contactIdFilter && { id: contactIdFilter }),
      }
    };
    
    if (searchQuery) {
        options.search = searchQuery;
    }

    store.fetchContacts(options);
  }, [store.fetchContacts, searchQuery, activePartnerTab, filterType, contactIdFilter, currentPage, pageSize]);

  const filteredContacts = store.paginatedContacts;
  const paginatedContacts = store.paginatedContacts;
  const totalPages = Math.ceil(store.contactCount / pageSize);

  const handleExport = (format: 'xlsx' | 'pdf') => {
    const targetComp = (store.companies || []).find((c: any) => c.id === exportCompanyId);
    const isExcel = format === 'xlsx';
    
    // Headers: External ID only for Excel
    const headers = isExcel 
      ? ['Unique External ID', 'Name', 'Type', 'Email', 'Phone', 'Opening Balance', 'Company', 'Address']
      : ['Name', 'Type', 'Email', 'Phone', 'Opening Balance', 'Company', 'Address'];
    
    const data = filteredContacts
      .filter((c: Contact) => (c?.companyIds || []).includes(exportCompanyId) || (!c?.companyIds && (c as any).companyId === exportCompanyId))
      .map((c: Contact) => {
        const row = [
          c.name,
          c.type,
          c.email,
          c.phone || '',
          store.getPartnerBalance(c.id, exportCompanyId),
          targetComp?.name || exportCompanyId,
          c.address || ''
        ];
        if (isExcel) {
          row.unshift(c.externalId || '');
        }
        return row;
      });

    if (format === 'xlsx') {
      exportToXLSX(`${title || 'Contacts'}_${targetComp?.name || 'Export'}`, [headers, ...data]);
    } else {
      exportToPDF(`${title || 'Contacts'}_${targetComp?.name || 'Export'}`, [headers, ...data]);
    }
  };

  // Handle auto-create from quick actions
  useEffect(() => {
    if (showForm && store.fetchEmployees) {
       store.fetchEmployees();
    }
    if (defaultCreate) {
      setEditingId(null);
      setFormData({ name: '', email: '', type: defaultType || ContactType.CUSTOMER, phone: '', address: '', taxId: '', assignedUserId: '', companyId: store.activeCompanyIds[0] || store.companies[0]?.id, monthlyFixedSalary: 0, advanceSalary: 0, designation: '' });
      setShowForm(true);
    }
  }, [defaultCreate, defaultType, showForm]);

  const [showDiscountModal, setShowDiscountModal] = useState<string | null>(null);
  const [showDiscountListModal, setShowDiscountListModal] = useState<string | null>(null);
  const [discountData, setDiscountData] = useState({ amount: 0, date: getOpDateBST(), description: '' });

  const handleDiscountSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (showDiscountModal) {
      store.recordPartnerDiscount(showDiscountModal, discountData.amount, discountData.date, discountData.description);
      setShowDiscountModal(null);
      setDiscountData({ amount: 0, date: getOpDateBST(), description: '' });
      alert('Discount recorded successfully.');
    }
  };

  const handleEdit = (contact: Contact) => {
    setEditingId(contact.id);
    setFormData({
      name: contact.name || '',
      email: contact.email || '',
      type: contact.type || 'CUSTOMER',
      phone: contact.phone || '',
      address: contact.address || '',
      taxId: contact.taxId || '',
      assignedUserId: contact.assignedUserId || '',
      srId: contact.srId || '',
      companyId: contact?.companyIds?.[0] || store.activeCompanyIds[0] || store.companies[0]?.id,
      monthlyFixedSalary: contact.monthlyFixedSalary || 0,
      designation: contact.designation || '',
      openingBalance: contact.openingBalances?.[contact?.companyIds?.[0] || store.activeCompanyIds[0]] || 0,
      advanceSalary: 0
    });
    setShowForm(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // For Partner types (Customer/Vendor), assume they apply to all active companies
    // For Employee types, they apply to the specific selected company
    const selectedCompanyIds = (formData.type === ContactType.EMPLOYEE && formData?.companyId) 
      ? [formData?.companyId] 
      : store.activeCompanyIds;

    const openingBalances: Record<string, number> = {};
    if (formData.openingBalance !== 0) {
      // Set opening balance for all selected companies or at least the primary one
      selectedCompanyIds.forEach(cid => {
        openingBalances[cid] = formData.openingBalance || 0;
      });
    }

    if (editingId) {
      store.updateContact(editingId, {
        ...formData,
        assignedUserId: formData.assignedUserId || undefined,
        companyIds: selectedCompanyIds,
        openingBalances: openingBalances,
        monthlyFixedSalary: formData.type === ContactType.EMPLOYEE ? formData.monthlyFixedSalary : undefined,
        designation: formData.type === ContactType.EMPLOYEE ? formData.designation : undefined
      });
    } else {
      store.addContact({
        ...formData,
        assignedUserId: formData.assignedUserId || undefined,
        companyIds: selectedCompanyIds,
        openingBalances: openingBalances,
        monthlyFixedSalary: formData.type === ContactType.EMPLOYEE ? formData.monthlyFixedSalary : undefined,
        designation: formData.type === ContactType.EMPLOYEE ? formData.designation : undefined
      });
    }
    setShowForm(false);
    setEditingId(null);
    setFormData({ name: '', email: '', type: ContactType.CUSTOMER, phone: '', address: '', taxId: '', assignedUserId: '', companyId: store.activeCompanyIds[0] || store.companies[0]?.id, monthlyFixedSalary: 0, openingBalance: 0, advanceSalary: 0, designation: '' });
  };

  return (
    <div className="max-w-7xl mx-auto p-2 lg:p-6 space-y-4 animate-in fade-in duration-500">
      {/* Smart Header & Action Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 pb-6 border-b border-slate-100">
        <div className="flex items-center space-x-5">
          <div className={`p-4 rounded-[2rem] shadow-2xl ${filterType === ContactType.EMPLOYEE ? 'bg-rose-600 shadow-rose-200' : 'bg-indigo-600 shadow-indigo-200'} transform -rotate-3 hover:rotate-0 transition-transform`}>
            {filterType === ContactType.EMPLOYEE ? <Scan className="w-8 h-8 text-white" /> : <Wallet className="w-8 h-8 text-white" />}
          </div>
          <div>
            <h2 className="text-3xl font-black text-slate-900 uppercase tracking-tighter leading-none italic">{title || (activePartnerTab === 'ALL' ? 'All Partners' : `${activePartnerTab}s`)}</h2>
            <p className="text-sm font-medium text-slate-500 mt-1">
              {filterType === ContactType.EMPLOYEE ? 'Personnel records and attendance tracking' : 'Unified partner directory and credit/debit management'}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 no-print">
          {/* View Toggle */}
          <div className="flex bg-slate-100 p-1.5 rounded-2xl shadow-inner border border-slate-200">
            <button 
              onClick={() => setViewMode('list')}
              className={`p-2 rounded-xl transition-all ${viewMode === 'list' ? 'bg-white text-indigo-600 shadow-lg' : 'text-slate-400 hover:text-slate-600'}`}
              title="List View"
            >
              <List size={20} />
            </button>
            <button 
              onClick={() => setViewMode('kanban')}
              className={`p-2 rounded-xl transition-all ${viewMode === 'kanban' ? 'bg-white text-indigo-600 shadow-lg' : 'text-slate-400 hover:text-slate-600'}`}
              title="Kanban View"
            >
              <LayoutGrid size={20} />
            </button>
          </div>

          <div className="h-8 w-px bg-slate-200 hidden sm:block mx-1"></div>

          {/* Export Actions */}
          <div className="flex items-center space-x-2">
            <div className="flex items-center bg-slate-100 p-1.5 rounded-[1.5rem] border border-slate-200">
              <span className="text-[10px] font-black uppercase text-slate-400 pl-3">Filter:</span>
              <select 
                value={exportCompanyId || ""}
                onChange={(e) => setExportCompanyId(e.target.value)}
                className="bg-transparent border-none text-[10px] font-black uppercase text-slate-800 focus:ring-0 cursor-pointer px-3"
              >
                {(store.companies || []).filter((c: any) => store.activeCompanyIds.includes(c.id)).map((c: any) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <button 
              onClick={() => handleExport('xlsx')}
              className="flex items-center space-x-2 px-4 py-2 bg-emerald-50 border border-emerald-100 rounded-2xl text-[10px] font-black uppercase tracking-widest text-emerald-700 hover:bg-emerald-100 transition-all shadow-sm active:scale-95 group"
            >
              <FileSpreadsheet size={16} className="group-hover:scale-110 transition-transform" />
              <span className="hidden lg:inline">Export To Excel</span>
            </button>
            <button 
              onClick={() => handleExport('pdf')}
              className="flex items-center space-x-2 px-4 py-2 bg-rose-50 border border-rose-100 rounded-2xl text-[10px] font-black uppercase tracking-widest text-rose-700 hover:bg-rose-100 transition-all shadow-sm active:scale-95 group"
            >
              <Download size={16} className="group-hover:scale-110 transition-transform" />
              <span className="hidden lg:inline">Download PDF</span>
            </button>
            {selectedContactIds.size > 1 && (
              <button 
                onClick={() => setShowMergeModal(true)}
                className="flex items-center space-x-2 px-4 py-2 bg-purple-50 border border-purple-100 rounded-2xl text-[10px] font-black uppercase tracking-widest text-purple-700 hover:bg-purple-100 transition-all shadow-sm active:scale-95 group"
              >
                <List size={16} className="group-hover:scale-110 transition-transform" />
                <span className="hidden lg:inline">Merge ({selectedContactIds.size})</span>
              </button>
            )}
          </div>

          <button 
            onClick={() => {
              setEditingId(null);
              const initialType = filterType || (activePartnerTab !== 'ALL' ? activePartnerTab : ContactType.CUSTOMER);
              setFormData({ name: '', email: '', type: initialType, phone: '', address: '', taxId: '', assignedUserId: '', companyId: store.activeCompanyIds[0] || store.companies[0]?.id, monthlyFixedSalary: 0, advanceSalary: 0, designation: '' });
              setShowForm(true);
            }}
            className="flex items-center space-x-2 px-6 py-3 bg-slate-950 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-800 transition-all shadow-2xl shadow-slate-200 active:scale-95 ml-2"
          >
            <Plus size={18} />
            <span>Add New {filterType === ContactType.EMPLOYEE ? 'Employee' : 'Partner'}</span>
          </button>
        </div>
      </div>

      <div className="flex items-center justify-between no-print">
        <div className="flex items-center space-x-3">
          {!filterType && (
            <div className="flex bg-slate-100 p-1 rounded-2xl border border-slate-200 shadow-inner">
              <button 
                onClick={() => setActivePartnerTab(ContactType.CUSTOMER)}
                className={`px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activePartnerTab === ContactType.CUSTOMER ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
              >Customers</button>
              <button 
                onClick={() => setActivePartnerTab(ContactType.VENDOR)}
                className={`px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activePartnerTab === ContactType.VENDOR ? 'bg-white text-amber-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
              >Vendors</button>
              <button 
                onClick={() => setActivePartnerTab('ALL')}
                className={`px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activePartnerTab === 'ALL' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
              >All Partners</button>
            </div>
          )}
        </div>

        <div className="flex items-center space-x-4">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input 
              type="text"
              placeholder="Instant Search..."
              className="pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-2xl text-xs font-bold focus:ring-2 focus:ring-indigo-500/20 outline-none w-64 shadow-sm"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <button 
            onClick={() => setShowFilters(!showFilters)}
            className={`p-2.5 rounded-2xl transition-all shadow-sm ${showFilters ? 'bg-indigo-600 text-white' : 'bg-white text-slate-400 hover:bg-slate-50 border border-slate-200'}`}
            title="Advanced Smart Filters"
          >
            <Filter size={20} />
          </button>
        </div>
      </div>

      <div className="flex gap-6">
        {/* Filter Sidebar */}
        {showFilters && (
          <div className="w-64 flex-shrink-0 space-y-6 animate-in slide-in-from-left duration-300">
            <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Smart Filters</h4>
                <button onClick={() => setAdvancedFilters({ search: '', type: filterType || '', minBalance: '', maxBalance: '', location: '', lastTransactionDate: '' })} className="text-[9px] font-bold text-indigo-600 hover:underline">Reset</button>
              </div>

              <div className="space-y-1.5">
                <label className="text-[9px] font-bold text-slate-500 uppercase ml-1">Search</label>
                <div className="relative">
                  <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input 
                    className="w-full pl-8 pr-3 py-2 bg-slate-50 border border-slate-100 rounded-lg text-xs outline-none focus:ring-2 focus:ring-indigo-500/20"
                    placeholder="Name, email..."
                    value={advancedFilters.search}
                    onChange={(e) => setAdvancedFilters({...advancedFilters, search: e.target.value})}
                  />
                </div>
              </div>

              {!filterType && (
                <div className="space-y-1.5">
                  <label className="text-[9px] font-bold text-slate-500 uppercase ml-1">Contact Type</label>
                  <select 
                    className="w-full px-2 py-2 bg-slate-50 border border-slate-100 rounded-lg text-xs outline-none focus:ring-2 focus:ring-indigo-500/20"
                    value={advancedFilters.type || ""}
                    onChange={(e) => setAdvancedFilters({...advancedFilters, type: e.target.value})}
                  >
                    <option value="">All Types</option>
                    <option value={ContactType.CUSTOMER}>Customer</option>
                    <option value={ContactType.VENDOR}>Vendor</option>
                    <option value={ContactType.EMPLOYEE}>Employee</option>
                  </select>
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-[9px] font-bold text-slate-500 uppercase ml-1">Balance Range</label>
                <div className="grid grid-cols-2 gap-2">
                  <input 
                    type="number"
                    placeholder="Min"
                    className="w-full px-2 py-2 bg-slate-50 border border-slate-100 rounded-lg text-xs outline-none focus:ring-2 focus:ring-indigo-500/20"
                    value={advancedFilters.minBalance}
                    onChange={(e) => setAdvancedFilters({...advancedFilters, minBalance: e.target.value})}
                  />
                  <input 
                    type="number"
                    placeholder="Max"
                    className="w-full px-2 py-2 bg-slate-50 border border-slate-100 rounded-lg text-xs outline-none focus:ring-2 focus:ring-indigo-500/20"
                    value={advancedFilters.maxBalance}
                    onChange={(e) => setAdvancedFilters({...advancedFilters, maxBalance: e.target.value})}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[9px] font-bold text-slate-500 uppercase ml-1">Location / City</label>
                <div className="relative">
                  <MapPin size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input 
                    className="w-full pl-8 pr-3 py-2 bg-slate-50 border border-slate-100 rounded-lg text-xs outline-none focus:ring-2 focus:ring-indigo-500/20"
                    placeholder="e.g. Dhaka"
                    value={advancedFilters.location}
                    onChange={(e) => setAdvancedFilters({...advancedFilters, location: e.target.value})}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[9px] font-bold text-slate-500 uppercase ml-1">Last Transaction</label>
                <div className="relative">
                  <Calendar size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input 
                    type="date"
                    className="w-full pl-8 pr-3 py-2 bg-slate-50 border border-slate-100 rounded-lg text-xs outline-none focus:ring-2 focus:ring-indigo-500/20"
                    value={advancedFilters.lastTransactionDate}
                    onChange={(e) => setAdvancedFilters({...advancedFilters, lastTransactionDate: e.target.value})}
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="flex-1">
          {viewMode === 'kanban' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredContacts.length === 0 ? (
                <div className="col-span-full py-20 text-center bg-white rounded-3xl border-2 border-dashed border-slate-100">
                  <p className="text-slate-400 font-bold italic">No {filterType === ContactType.EMPLOYEE ? 'employees' : 'partners'} found matching your filters.</p>
                </div>
              ) : paginatedContacts.map((contact: Contact) => {
                const balance = store.getPartnerBalance(contact.id);
                const assignedUser = (store.users || []).find((u: any) => u.id === contact.assignedUserId);
                return (
                  <div key={contact.id} className="bg-white rounded-3xl shadow-sm border border-slate-100 p-6 hover:shadow-lg transition-all relative overflow-hidden group border-b-4 border-b-transparent hover:border-b-indigo-500">
                    <div className="absolute top-4 right-4 z-10">
                      <input 
                        type="checkbox"
                        className="w-4 h-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500"
                        checked={selectedContactIds.has(contact.id)}
                        onChange={() => handleToggleSelectContact(contact.id)}
                      />
                    </div>
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center space-x-4">
                        <div className={`h-12 w-12 rounded-2xl flex items-center justify-center text-lg font-black text-white shadow-md ${
                          contact.type === ContactType.CUSTOMER ? 'bg-emerald-500' : 
                          contact.type === ContactType.VENDOR ? 'bg-amber-500' : contact.type === ContactType.LENDER ? 'bg-indigo-500' : 'bg-rose-500'
                        }`}>
                          {String(contact.name || '').substring(0, 1)}
                        </div>
                        <div className="overflow-hidden">
                          <h4 className="font-black text-slate-800 uppercase tracking-tight truncate max-w-[140px]">{contact.name}</h4>
                          <span className={`text-[10px] font-black px-2 py-0.5 rounded uppercase tracking-wider ${
                            contact.type === ContactType.CUSTOMER ? 'bg-emerald-100 text-emerald-700' : 
                            contact.type === ContactType.VENDOR ? 'bg-amber-100 text-amber-700' : contact.type === ContactType.LENDER ? 'bg-indigo-100 text-indigo-700' : 'bg-rose-100 text-rose-700'
                          }`}>
                            {contact.type}
                          </span>
                        </div>
                      </div>
                      <div className="text-right flex flex-col items-end">
                        <div className="flex space-x-1 mb-2">
                          {onNavigateToLedger && contact.type !== ContactType.EMPLOYEE && (
                            <button 
                              onClick={() => onNavigateToLedger(contact.id, contact.type)}
                              className="p-1.5 text-indigo-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                              title="View Ledger"
                            >
                              <ArrowRight size={16} />
                            </button>
                          )}
                          <button 
                            onClick={() => handleEdit(contact)}
                            className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                          </button>
                        </div>
                        {contact.type === ContactType.EMPLOYEE && (
                          <button 
                            onClick={() => {
                              setEnrollEmployeeId(contact.id);
                              setShowFaceEnrollModal(true);
                            }}
                            className={`mb-2 p-1.5 rounded-lg transition-all ${contact.faceDescriptor ? 'text-emerald-500 hover:bg-emerald-50' : 'text-slate-400 hover:text-rose-600 hover:bg-rose-50'}`}
                            title={contact.faceDescriptor ? "Face Enrolled" : "Enroll Face"}
                          >
                            {contact.faceDescriptor ? <UserCheck size={16} /> : <Scan size={16} />}
                          </button>
                        )}
                        {contact.type === ContactType.VENDOR && (
                          <>
                          <button 
                            onClick={() => setShowDiscountListModal(contact.id)}
                            className="mb-2 mr-1 p-1.5 text-emerald-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                            title="View Discounts"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"/></svg>
                          </button>
                          <button 
                            onClick={() => setShowDiscountModal(contact.id)}
                            className="mb-2 p-1.5 text-amber-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
                            title="Record Discount"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/></svg>
                          </button>
                        </>
                        )}
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Balance</p>
                        <p className={`text-sm font-black ${balance > 0 ? 'text-indigo-600' : balance < 0 ? 'text-red-500' : 'text-slate-400'}`}>
                          {formatNumber(balance)}
                        </p>
                      </div>
                    </div>
                    <div className="space-y-2 pt-4 border-t border-slate-50">
                      <p className="text-xs text-slate-500 flex items-center">
                        <svg className="w-3.5 h-3.5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2-2v10a2 2 0 002 2z" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                        {contact.email}
                      </p>
                      {contact.phone && (
                        <p className="text-xs text-slate-500 flex items-center">
                          <svg className="w-3.5 h-3.5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                          {contact.phone}
                        </p>
                      )}
                      {contact.taxId && (
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter mt-1">
                          TAX ID: {contact.taxId}
                        </p>
                      )}
                      {assignedUser && (
                        <div className="pt-3 mt-3 border-t border-slate-50 flex items-center justify-between">
                          <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Assigned To</span>
                          <div className="flex items-center space-x-2">
                            <div className="w-5 h-5 rounded-full bg-indigo-100 flex items-center justify-center text-[8px] font-black text-indigo-600">
                              {assignedUser.name[0]}
                            </div>
                            <span className="text-[10px] font-bold text-slate-600">{assignedUser.name}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="bg-white rounded-3xl border border-slate-100 overflow-hidden shadow-sm">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100">
                    <th className="px-6 py-4 w-12 text-center text-[10px] font-black text-slate-400 uppercase">
                      <input 
                        type="checkbox" 
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedContactIds(new Set(paginatedContacts.map((c: any) => c.id)));
                          } else {
                            setSelectedContactIds(new Set());
                          }
                        }}
                        checked={selectedContactIds.size === paginatedContacts.length && paginatedContacts.length > 0}
                      />
                    </th>
                    <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Partner</th>
                    <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Type</th>
                    <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Contact Info</th>
                    <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Balance</th>
                    <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">SR</th>
                    <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {paginatedContacts.map((contact: Contact) => {
                    const balance = store.getPartnerBalance(contact.id);
                    return (
                      <tr key={contact.id} className="hover:bg-slate-50/50 transition-colors group">
                        <td className="px-6 py-4 w-12 text-center">
                          <input 
                            type="checkbox" 
                            checked={selectedContactIds.has(contact.id)}
                            onChange={() => handleToggleSelectContact(contact.id)}
                          />
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center space-x-3">
                            <div className={`h-8 w-8 rounded-lg flex items-center justify-center text-xs font-black text-white ${
                              contact.type === ContactType.CUSTOMER ? 'bg-emerald-500' : 
                              contact.type === ContactType.VENDOR ? 'bg-amber-500' : contact.type === ContactType.LENDER ? 'bg-indigo-500' : 'bg-rose-500'
                            }`}>
                              {String(contact.name || '').substring(0, 1)}
                            </div>
                            <span className="font-bold text-slate-800">{contact.name}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`text-[9px] font-black px-2 py-0.5 rounded uppercase tracking-wider ${
                            contact.type === ContactType.CUSTOMER ? 'bg-emerald-100 text-emerald-700' : 
                            contact.type === ContactType.VENDOR ? 'bg-amber-100 text-amber-700' : contact.type === ContactType.LENDER ? 'bg-indigo-100 text-indigo-700' : 'bg-rose-100 text-rose-700'
                          }`}>
                            {contact.type}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex flex-col">
                            <span className="text-xs text-slate-600 font-medium">{contact.email}</span>
                            <span className="text-[10px] text-slate-400">{contact.phone}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <span className={`text-sm font-black ${balance > 0 ? 'text-indigo-600' : balance < 0 ? 'text-red-500' : 'text-slate-400'}`}>
                            {formatNumber(balance)}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          {contact.srId && (
                            <span className="text-[10px] font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded">
                              {(store.contacts || []).find((c: any) => c.id === contact.srId)?.name || 'Unknown SR'}
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex justify-end space-x-1 opacity-100 transition-opacity transition-opacity">
                            {onNavigateToLedger && contact.type !== ContactType.EMPLOYEE && (
                              <button 
                                onClick={() => onNavigateToLedger(contact.id, contact.type)}
                                className="p-1.5 text-indigo-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                                title="View Ledger"
                              >
                                <ArrowRight size={14} />
                              </button>
                            )}
                            <button 
                              onClick={() => handleEdit(contact)}
                              className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                              title="Edit Contact"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                            </button>
                            {contact.type === ContactType.EMPLOYEE && (
                              <button 
                                onClick={() => {
                                  setEnrollEmployeeId(contact.id);
                                  setShowFaceEnrollModal(true);
                                }}
                                className={`p-1.5 rounded-lg transition-all ${contact.faceDescriptor ? 'text-emerald-500 hover:bg-emerald-50' : 'text-slate-400 hover:text-rose-600 hover:bg-rose-50'}`}
                                title={contact.faceDescriptor ? "Face Enrolled" : "Enroll Face"}
                              >
                                {contact.faceDescriptor ? <UserCheck size={14} /> : <Scan size={14} />}
                              </button>
                            )}
                            {contact.type === ContactType.VENDOR && (
                          <>
                          <button 
                            onClick={() => setShowDiscountListModal(contact.id)}
                            className="mb-2 mr-1 p-1.5 text-emerald-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                            title="View Discounts"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"/></svg>
                          </button>
                          <button 
                            onClick={() => setShowDiscountModal(contact.id)}
                                className="p-1.5 text-amber-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
                                title="Record Discount"
                              >
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/></svg>
                              </button>
                            </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <Pagination 
        currentPage={currentPage}
        totalPages={totalPages}
        totalItems={store.contactCount}
        itemsPerPage={pageSize}
        onPageChange={setCurrentPage}
        onItemsPerPageChange={setPageSize}
      />

      {showForm && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl w-full max-w-md overflow-hidden shadow-2xl animate-in zoom-in duration-300 max-h-[95vh] flex flex-col">
            <form onSubmit={handleSubmit} className="flex flex-col overflow-hidden max-h-full">
              <div className="p-6 border-b bg-slate-50 shrink-0">
                <h4 className="text-2xl font-black text-slate-800 tracking-tighter uppercase">{editingId ? 'Edit Partner' : 'New Partner'}</h4>
                <p className="text-sm text-slate-500 font-medium">{editingId ? 'Update partner details.' : 'Add a new customer or vendor to your records.'}</p>
              </div>
              <div className="p-6 space-y-4 flex-1 overflow-y-auto overflow-x-hidden min-h-0">
                <div className="flex bg-slate-100 p-1 rounded-xl mb-2">
                  <button 
                    type="button" 
                    onClick={() => setFormData({...formData, type: ContactType.CUSTOMER})}
                    className={`flex-1 py-2 text-[10px] font-black uppercase rounded-lg transition-all ${formData.type === ContactType.CUSTOMER ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-400'}`}
                  >Customer</button>
                  <button 
                    type="button" 
                    onClick={() => setFormData({...formData, type: ContactType.VENDOR})}
                    className={`flex-1 py-2 text-[10px] font-black uppercase rounded-lg transition-all ${formData.type === ContactType.VENDOR ? 'bg-white text-amber-600 shadow-sm' : 'text-slate-400'}`}
                  >Vendor</button>
                  <button 
                    type="button" 
                    onClick={() => setFormData({...formData, type: ContactType.EMPLOYEE})}
                    className={`flex-1 py-2 text-[10px] font-black uppercase rounded-lg transition-all ${formData.type === ContactType.EMPLOYEE ? 'bg-white text-rose-600 shadow-sm' : 'text-slate-400'}`}
                  >Employee</button>
                  <button 
                    type="button" 
                    onClick={() => setFormData({...formData, type: ContactType.LENDER})}
                    className={`flex-1 py-2 text-[10px] font-black uppercase rounded-lg transition-all ${formData.type === ContactType.LENDER ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400'}`}
                  >Lender</button>
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-400 mb-1 uppercase tracking-widest">Full Name</label>
                  <input 
                    required
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-sm font-bold" 
                    placeholder="e.g. Acme Corp"
                    value={formData.name || ''}
                    onChange={(e) => setFormData({...formData, name: e.target.value})}
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-400 mb-1 uppercase tracking-widest">Email Address</label>
                  <input 
                    type="email"
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-sm font-bold" 
                    placeholder="billing@acme.com"
                    value={formData.email || ''}
                    onChange={(e) => setFormData({...formData, email: e.target.value})}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 mb-1 uppercase tracking-widest">Phone</label>
                    <input 
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-sm font-bold" 
                      value={formData.phone || ''}
                      onChange={(e) => setFormData({...formData, phone: e.target.value})}
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 mb-1 uppercase tracking-widest">Opening Balance</label>
                    <input 
                      type="number"
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-sm font-bold" 
                      placeholder="0.00"
                      value={formData.openingBalance || ''}
                      onChange={(e) => setFormData({...formData, openingBalance: parseFloat(e.target.value) || 0})}
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-400 mb-1 uppercase tracking-widest">Tax ID</label>
                  <input 
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-sm font-bold" 
                    value={formData.taxId || ''}
                    onChange={(e) => setFormData({...formData, taxId: e.target.value})}
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-400 mb-1 uppercase tracking-widest">Assign to User</label>
                  <select 
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-sm font-bold"
                    value={formData.assignedUserId || ''}
                    onChange={(e) => setFormData({...formData, assignedUserId: e.target.value})}
                  >
                    <option value="">No Assignment</option>
                    {(store.users || []).map((u: any) => (
                      <option key={u.id} value={u.id}>{u.name}</option>
                    ))}
                  </select>
                </div>
                {formData.type === ContactType.CUSTOMER && (
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 mb-1 uppercase tracking-widest">Assign SR (Sales Representative)</label>
                    <select 
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-sm font-bold"
                      value={formData.srId || ''}
                      onChange={(e) => setFormData({...formData, srId: e.target.value})}
                    >
                      <option value="">No SR Assigned</option>
                      {(store.contacts || []).filter((c: any) => c.type?.toUpperCase() === 'EMPLOYEE' && (c.designation === 'SR' || c.designation === 'Salesperson')).map((sr: any) => (
                        <option key={sr.id} value={sr.id}>{sr.name}</option>
                      ))}
                    </select>
                  </div>
                )}
                {formData.type === ContactType.EMPLOYEE && (
                  <>
                    <div>
                      <label className="block text-[10px] font-black text-slate-400 mb-1 uppercase tracking-widest">Company</label>
                      <select 
                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-sm font-bold"
                        value={formData?.companyId || ''}
                        onChange={(e) => setFormData({...formData, companyId: e.target.value})}
                      >
                        {store.companies.map((c: any) => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] font-black text-slate-400 mb-1 uppercase tracking-widest">Monthly Fixed Salary</label>
                      <input 
                        type="number"
                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-sm font-bold" 
                        value={formData.monthlyFixedSalary || ''}
                        onChange={(e) => setFormData({...formData, monthlyFixedSalary: parseFloat(e.target.value) || 0})}
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-black text-slate-400 mb-1 uppercase tracking-widest">Designation</label>
                      <select 
                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-sm font-bold"
                        value={formData.designation || ''}
                        onChange={(e) => setFormData({...formData, designation: e.target.value})}
                      >
                        <option value="">None</option>
                        <option value="Delivery Man">Delivery Man</option>
                        <option value="SR">SR</option>
                        <option value="Salesperson">Salesperson</option>
                        <option value="Manager">Manager</option>
                        <option value="Other">Other</option>
                      </select>
                    </div>
                  </>
                )}
              </div>
              <div className="p-6 bg-slate-50 border-t flex justify-end space-x-3 shrink-0">
                <button type="button" onClick={() => { setShowForm(false); setEditingId(null); }} className="px-6 py-2.5 text-slate-500 font-black text-xs uppercase tracking-widest hover:text-slate-800 transition-colors">Cancel</button>
                <button 
                  type="submit"
                  className="px-8 py-2.5 bg-indigo-600 text-white font-black text-xs uppercase tracking-widest rounded-xl shadow-lg hover:bg-indigo-700 transition-all active:scale-95"
                >
                  {editingId ? 'Update Partner' : 'Create Partner'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      
      {showDiscountListModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl flex flex-col overflow-hidden">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <div>
                <h4 className="text-2xl font-black text-slate-800 tracking-tighter uppercase">Vendor Discounts</h4>
                <p className="text-sm text-slate-500 font-medium">History of discounts received from this vendor</p>
              </div>
              <button onClick={() => setShowDiscountListModal(null)} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors">
                <X size={20} />
              </button>
            </div>
            <div className="p-6 overflow-y-auto max-h-[60vh]">
              {(() => {
                const contact = store.contacts.find(c => c.id === showDiscountListModal);
                // Find journal entries related to this contact where journalType is PURCHASE_DISCOUNT
                // docs_journal_lines has contactId, docs_journals has journalType
                const discountEntries = (store.allEntries || []).filter((entry: any) => 
                  entry.data?.journalType === 'PURCHASE_DISCOUNT' && 
                  (entry.lines || []).some((line: any) => line.contactId === showDiscountListModal)
                ).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

                if (discountEntries.length === 0) {
                  return (
                    <div className="text-center py-12">
                      <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <svg className="w-8 h-8 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"/></svg>
                      </div>
                      <p className="text-slate-500 font-medium">No discounts recorded yet.</p>
                    </div>
                  );
                }

                return (
                  <div className="space-y-4">
                    {discountEntries.map(entry => {
                      const amount = entry.lines.reduce((sum, line) => sum + (line.debit || 0), 0);
                      return (
                        <div key={entry.id} className="bg-white border border-slate-200 rounded-xl p-4 hover:border-emerald-200 hover:shadow-md transition-all group relative overflow-hidden">
                          <div className="absolute left-0 top-0 bottom-0 w-1 bg-emerald-500 rounded-l-xl opacity-0 group-hover:opacity-100 transition-opacity"></div>
                          <div className="flex justify-between items-start">
                            <div>
                              <div className="flex items-center space-x-2 mb-1">
                                <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 text-[10px] font-black rounded uppercase tracking-wider">
                                  {entry.data?.journalType?.replace('_', ' ')}
                                </span>
                                <span className="text-xs font-bold text-slate-400">
                                  {formatDateTime(entry.date)}
                                </span>
                              </div>
                              <p className="text-sm font-medium text-slate-700 mt-2">{entry.data?.description || 'Vendor Discount'}</p>
                              
                              <div className="mt-3 flex items-center space-x-2 text-xs">
                                <span className="text-slate-400">Journal Ref:</span>
                                <button 
                                  onClick={() => {
                                    setShowDiscountListModal(null);
                                    if (onNavigateToLedger) {
                                      // Normally we'd navigate to journal view, but ContactManager receives onNavigateToLedger
                                      // Or we can just show the ID
                                    }
                                  }}
                                  className="font-mono text-indigo-600 hover:text-indigo-800 bg-indigo-50 px-1.5 py-0.5 rounded cursor-pointer"
                                  title="We would navigate to journal view here"
                                >
                                  {entry.referenceNumber}
                                </button>
                              </div>
                            </div>
                            <div className="text-right">
                              <p className="text-2xl font-black text-emerald-600">
                                {new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'BDT' }).format(amount)}
                              </p>
                              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">
                                {entry.status}
                              </p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {showDiscountModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl w-full max-w-md overflow-hidden shadow-2xl animate-in zoom-in duration-300">
            <form onSubmit={handleDiscountSubmit}>
              <div className="p-8 border-b bg-amber-50">
                <h4 className="text-2xl font-black text-amber-800 tracking-tighter uppercase">Record Partner Discount</h4>
                <p className="text-sm text-amber-600 font-medium">Record an earned discount from this vendor.</p>
              </div>
              <div className="p-8 space-y-4">
                <div>
                  <label className="block text-[10px] font-black text-slate-400 mb-1 uppercase tracking-widest">Discount Amount (৳)</label>
                  <input 
                    required
                    type="number"
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-amber-500 outline-none text-sm font-bold" 
                    placeholder="0.00"
                    value={discountData.amount || ''}
                    onChange={(e) => setDiscountData({...discountData, amount: parseFloat(e.target.value) || 0})}
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-400 mb-1 uppercase tracking-widest">Date</label>
                  <input 
                    required
                    type="date"
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-amber-500 outline-none text-sm font-bold" 
                    value={discountData.date}
                    onChange={(e) => setDiscountData({...discountData, date: e.target.value})}
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-400 mb-1 uppercase tracking-widest">Description</label>
                  <textarea 
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-amber-500 outline-none text-sm font-bold" 
                    placeholder="e.g. Cash discount for early payment"
                    value={discountData.description || ''}
                    onChange={(e) => setDiscountData({...discountData, description: e.target.value})}
                  />
                </div>
              </div>
              <div className="p-8 bg-slate-50 border-t flex justify-end space-x-3">
                <button type="button" onClick={() => setShowDiscountModal(null)} className="px-6 py-2.5 text-slate-500 font-black text-xs uppercase tracking-widest hover:text-slate-800 transition-colors">Cancel</button>
                <button 
                  type="submit"
                  className="px-8 py-2.5 bg-amber-600 text-white font-black text-xs uppercase tracking-widest rounded-xl shadow-lg hover:bg-amber-700 transition-all active:scale-95"
                >
                  Record Discount
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Merge Contacts Modal */}
      {showMergeModal && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md flex flex-col items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
            <div className="p-6 border-b bg-purple-50 shrink-0 border-purple-100 flex justify-between items-center">
              <div>
                <h4 className="text-2xl font-black text-purple-900 tracking-tighter uppercase">Merge Contacts</h4>
                <p className="text-sm text-purple-700 font-medium">Select the master contact to merge the others into.</p>
              </div>
              <button 
                onClick={() => setShowMergeModal(false)}
                className="p-2 hover:bg-purple-200 text-purple-600 rounded-lg transition-all"
              >
                <X size={20} />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto overflow-x-hidden flex-1 min-h-0 bg-slate-50 space-y-4">
              <div className="bg-amber-50 border border-amber-200 text-amber-800 p-4 rounded-xl text-xs font-bold leading-relaxed shadow-sm">
                <strong className="text-amber-900 block mb-1">WARNING - DESTRUCTIVE ACTION</strong>
                All selected contacts will be permanently merged into the Master Contact. Transactions, invoices, bills, loans, and ledger entries from the duplicates will be reassigned to the Master Contact. Their emails and phones will be appended to the Master if missing. The duplicate records will be deleted. This cannot be undone.
              </div>

              <div>
                <label className="block text-xs font-black text-slate-500 mb-2 uppercase tracking-widest">Select Master Contact</label>
                <div className="space-y-2">
                  {Array.from(selectedContactIds).map(id => {
                    const c = (store.contacts || []).find((x: any) => x.id === id);
                    if (!c) return null;
                    const balance = store.getPartnerBalance(c.id);
                    return (
                      <label 
                        key={id} 
                        className={`flex items-center p-4 border rounded-xl cursor-pointer transition-all ${masterContactId === id ? 'border-purple-500 bg-purple-50 shadow-md ring-1 ring-purple-500' : 'border-slate-200 bg-white hover:border-purple-300'}`}
                      >
                        <input 
                          type="radio" 
                          name="masterContact" 
                          value={id} 
                          checked={masterContactId === id}
                          onChange={(e) => setMasterContactId(e.target.value)}
                          className="w-4 h-4 text-purple-600 border-slate-300 focus:ring-purple-500"
                        />
                        <div className="ml-4 flex-1">
                          <div className="flex justify-between items-center">
                            <span className="font-bold text-slate-800">{c.name}</span>
                            <span className={`text-xs font-black px-2 py-0.5 rounded uppercase ${
                              balance > 0 ? 'bg-indigo-100 text-indigo-700' : balance < 0 ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-500'
                            }`}>
                              Bal: {formatNumber(balance)}
                            </span>
                          </div>
                          <div className="text-xs text-slate-500 mt-1 flex gap-3">
                            <span>{c.email || 'No email'}</span>
                            <span>{c.phone || 'No phone'}</span>
                            <span>{c.type}</span>
                          </div>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="p-6 bg-white border-t flex justify-between items-center shrink-0">
              <span className="text-xs font-bold text-slate-400">Merging {selectedContactIds.size} contacts</span>
              <div className="flex space-x-3">
                <button type="button" onClick={() => setShowMergeModal(false)} className="px-6 py-2.5 text-slate-500 font-black text-xs uppercase tracking-widest hover:text-slate-800 transition-colors" disabled={isMerging}>Cancel</button>
                <button 
                  type="button"
                  onClick={handleMergeContacts}
                  disabled={!masterContactId || isMerging}
                  className="px-8 py-2.5 bg-purple-600 disabled:bg-slate-300 disabled:text-slate-500 text-white font-black text-xs uppercase tracking-widest rounded-xl shadow-lg hover:bg-purple-700 transition-all active:scale-95 flex items-center"
                >
                  {isMerging ? 'Merging...' : 'Confirm Merge'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Face Enrollment Modal */}
      {showFaceEnrollModal && enrollEmployeeId && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md flex items-center justify-center z-[60] p-4">
          <div className="w-full max-w-2xl">
            <div className="flex justify-end mb-4">
              <button 
                onClick={() => setShowFaceEnrollModal(false)}
                className="p-3 bg-white/10 hover:bg-white/20 text-white rounded-full backdrop-blur-md transition-all"
              >
                <X size={24} />
              </button>
            </div>
            <FaceAttendance 
              store={store} 
              mode="enroll" 
              employeeId={enrollEmployeeId}
              onComplete={() => setShowFaceEnrollModal(false)} 
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default ContactManager;
