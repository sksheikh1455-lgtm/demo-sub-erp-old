
import React, { useState, useMemo, useEffect } from 'react';
import { Contact, ContactType } from '../types';
import { formatBDT, exportToXLSX, exportToPDF, prepareExportRows } from '../constants';
import ColumnSelector, { useColumns } from './ColumnSelector';
import Pagination from './Pagination';
import { reportingService } from '../services/reportingService';
import { Activity, Users, TrendingUp, TrendingDown, Search } from 'lucide-react';
import SmartFilterBar, { SmartFilterState } from './SmartFilterBar';
import ExportButtons from './ExportButtons';

const ReceivablePayableSummary: React.FC<{ store: any; mode?: 'AR' | 'AP' }> = ({ store, mode }) => {
  const { activeCompanyIds, companies } = store;
  const [custPage, setCustPage] = useState(1);
  const [vendPage, setVendPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [loading, setLoading] = useState(false);
  const [customerData, setCustomerData] = useState<any[]>([]);
  const [vendorData, setVendorData] = useState<any[]>([]);

  const [filters, setFilters] = useState<SmartFilterState>({
    searchQuery: '',
    startDate: '',
    endDate: '',
    datePreset: 'all',
  });

  const fetchSummary = async () => {
    setLoading(true);
    try {
      const activeIds = store.activeCompanyIds?.length > 0 ? store.activeCompanyIds : [store.currentCompany?.id].filter(Boolean);
      const targetMode = activeIds.length > 1 ? 'CONSOLIDATED' : (activeIds[0] || null);

      if (!mode || mode === 'AR') {
        const customers = await reportingService.getPartnerSummary(activeIds, 'CUSTOMER');
        setCustomerData(customers);
      }
      
      if (!mode || mode === 'AP') {
        const vendors = await reportingService.getPartnerSummary(activeIds, 'VENDOR');
        setVendorData(vendors);
      }
    } catch (err) {
      console.error('Failed to fetch partner summary:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSummary();
  }, [store.activeCompanyIds, store.currentCompany?.id, mode]);

  const aggregatePartners = (data: any[]) => {
    const pivot: Record<string, any> = {};

    data.forEach(item => {
      if (!pivot[item.contact_id]) {
        pivot[item.contact_id] = {
          id: item.contact_id,
          name: item.contact_name,
          branches: {},
          total: 0
        };
      }
      pivot[item.contact_id].branches[item.company_id] = (pivot[item.contact_id].branches[item.company_id] || 0) + item.balance;
      pivot[item.contact_id].total += item.balance;
    });

    return Object.values(pivot).filter(p => {
      const matchesSearch = !filters.searchQuery || p.name.toLowerCase().includes(filters.searchQuery.toLowerCase());
      const matchesContact = !filters.contactId || p.id === filters.contactId;
      return p.total !== 0 && matchesSearch && matchesContact;
    }).sort((a, b) => b.total - a.total);
  };

  const aggregatedCustomers = useMemo(() => aggregatePartners(customerData), [customerData, filters.searchQuery, filters.contactId]);
  const aggregatedVendors = useMemo(() => aggregatePartners(vendorData), [vendorData, filters.searchQuery, filters.contactId]);

  const showAR = !mode || mode === 'AR';
  const showAP = !mode || mode === 'AP';

  const totalAR = aggregatedCustomers.reduce((sum, c) => sum + c.total, 0);
  const totalAP_raw = aggregatedVendors.reduce((sum, v) => sum + v.total, 0);
  const totalAP = showAP ? -totalAP_raw : totalAP_raw;

  const paginatedCustomers = aggregatedCustomers.slice((custPage - 1) * pageSize, custPage * pageSize);
  const paginatedVendors = aggregatedVendors.slice((vendPage - 1) * pageSize, vendPage * pageSize);

  const activeCompanies = companies?.filter((c: any) => (activeCompanyIds || []).includes(c.id)) || [];

  const handleExport = (format: 'excel' | 'pdf', scope: 'page' | 'all', type: 'AR' | 'AP') => {
    const data = type === 'AR' 
      ? (scope === 'all' ? aggregatedCustomers : paginatedCustomers)
      : (scope === 'all' ? aggregatedVendors : paginatedVendors);

    const cols = [
      { id: 'name', label: 'Partner Name' },
      ...activeCompanies.map((c: any) => ({ id: c.id, label: c.name })),
      { id: 'total', label: 'Consolidated' }
    ];

    const exportData = data.map(p => {
      const row: any = { name: p.name, total: p.total };
      activeCompanies.forEach((c: any) => {
        row[c.id] = type === 'AR' ? (p.branches[c.id] || 0) : -(p.branches[c.id] || 0);
      });
      if (type === 'AP') row.total = -row.total;
      return row;
    });

    const rows = prepareExportRows(exportData, cols.map(c => ({ ...c, visible: true })));
    const filename = `${type === 'AR' ? 'Receivable' : 'Payable'}_Summary`;

    if (format === 'excel') {
      exportToXLSX(filename, rows);
    } else {
      exportToPDF(filename, rows);
    }
  };

  return (
    <div className="space-y-6 max-w-[98%] mx-auto p-4 lg:p-10 pb-20 animate-in fade-in duration-500">
      <SmartFilterBar 
        filters={filters}
        setFilters={setFilters}
        contacts={store.contacts || []}
        type="payment"
        placeholder="Search partners..."
        title={<h1 className="text-xl font-black text-white tracking-tighter uppercase whitespace-nowrap">AR/AP Summary</h1>}
      />

      {/* Summary Cards */}
      <div className={`grid grid-cols-1 ${!mode ? 'md:grid-cols-2' : ''} gap-8`}>
        {showAR && (
          <div className="bg-emerald-900 text-white p-8 rounded-3xl shadow-2xl relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:scale-110 transition-transform duration-500">
              <TrendingUp className="w-24 h-24" />
            </div>
            <div className="relative z-10">
              <h4 className="text-xs font-black uppercase tracking-[0.2em] text-emerald-400 mb-2">Total Accounts Receivable</h4>
              <div className="flex items-baseline space-x-2">
                <span className="text-5xl font-black tracking-tighter">{formatBDT(totalAR)}</span>
                <span className="text-emerald-400 text-sm font-bold uppercase">BDT</span>
              </div>
              <p className="mt-4 text-emerald-200/60 text-xs font-medium max-w-[320px]">
                {activeCompanyIds?.length > 1 ? 'Consolidated' : 'Individual'} amount currently owed by customers.
              </p>
            </div>
          </div>
        )}

        {showAP && (
          <div className="bg-rose-950 text-white p-8 rounded-3xl shadow-2xl relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:scale-110 transition-transform duration-500">
              <TrendingDown className="w-24 h-24" />
            </div>
            <div className="relative z-10">
              <h4 className="text-xs font-black uppercase tracking-[0.2em] text-rose-400 mb-2">Total Accounts Payable</h4>
              <div className="flex items-baseline space-x-2">
                <span className="text-5xl font-black tracking-tighter">{formatBDT(totalAP)}</span>
                <span className="text-rose-400 text-sm font-bold uppercase">BDT</span>
              </div>
              <p className="mt-4 text-rose-200/60 text-xs font-medium max-w-[320px]">
                {activeCompanyIds?.length > 1 ? 'Consolidated' : 'Individual'} amount currently owed to vendors.
              </p>
            </div>
          </div>
        )}
      </div>

      <div className={`grid grid-cols-1 ${!mode ? 'xl:grid-cols-2' : ''} gap-8`}>
        {/* Customer Breakdown */}
        {showAR && (
          <div className="bg-white rounded-[2.5rem] shadow-sm border border-slate-100 overflow-hidden flex flex-col">
            <div className="px-8 py-6 bg-slate-50 border-b flex justify-between items-center">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-emerald-100 rounded-lg">
                  <Users className="w-4 h-4 text-emerald-600" />
                </div>
                <h4 className="font-black text-slate-800 uppercase text-xs tracking-widest">Customer Balances</h4>
              </div>
              <div className="flex items-center gap-4">
                <ExportButtons onExport={(format, scope) => handleExport(format, scope, 'AR')} />
                <span className="px-2 py-1 bg-emerald-100 text-emerald-700 text-[10px] font-black rounded uppercase">Aging Summary</span>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-slate-50/50 text-slate-400 font-bold text-[10px] uppercase border-b border-slate-100">
                  <tr>
                    <th className="px-8 py-4 sticky left-0 bg-slate-50/50 z-10 w-64">Contact Name</th>
                    {activeCompanies.map(c => (
                      <th key={c.id} className="px-6 py-4 text-right truncate max-w-[120px]">{c.name}</th>
                    ))}
                    <th className="px-8 py-4 text-right bg-emerald-50/30 font-black text-emerald-700 sticky right-0 z-10">Consolidated</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {loading ? (
                    <tr><td colSpan={activeCompanies.length + 2} className="px-8 py-20 text-center"><Activity className="w-8 h-8 animate-spin mx-auto text-slate-200" /></td></tr>
                  ) : paginatedCustomers.length === 0 ? (
                    <tr><td colSpan={activeCompanies.length + 2} className="px-8 py-10 text-center text-slate-400 italic font-bold">No customers with outstanding balances.</td></tr>
                  ) : paginatedCustomers.map((p) => (
                    <tr key={p.id} className="hover:bg-slate-50 transition-colors group">
                      <td className="px-8 py-4 sticky left-0 bg-white group-hover:bg-slate-50 z-10 font-bold text-slate-700 border-r border-slate-100 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)]">
                        {p.name}
                      </td>
                      {activeCompanies.map(c => (
                        <td key={c.id} className="px-6 py-4 text-right font-mono text-xs text-slate-500">
                          {p.branches[c.id] ? formatBDT(p.branches[c.id]) : <span className="text-slate-200">-</span>}
                        </td>
                      ))}
                      <td className="px-8 py-4 text-right font-black text-emerald-600 bg-emerald-50/10 group-hover:bg-emerald-50/30 sticky right-0 z-10 shadow-[-2px_0_5px_-2px_rgba(0,0,0,0.05)]">
                        {formatBDT(p.total)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="p-4 border-t bg-slate-50/30 mt-auto">
              <Pagination 
                currentPage={custPage}
                totalPages={Math.ceil(aggregatedCustomers.length / pageSize)}
                totalItems={aggregatedCustomers.length}
                itemsPerPage={pageSize}
                onPageChange={setCustPage}
                onItemsPerPageChange={setPageSize}
              />
            </div>
          </div>
        )}

        {/* Vendor Breakdown */}
        {showAP && (
          <div className="bg-white rounded-[2.5rem] shadow-sm border border-slate-100 overflow-hidden flex flex-col">
            <div className="px-8 py-6 bg-slate-50 border-b flex justify-between items-center">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-rose-100 rounded-lg">
                  <Users className="w-4 h-4 text-rose-600" />
                </div>
                <h4 className="font-black text-slate-800 uppercase text-xs tracking-widest">Vendor Obligations</h4>
              </div>
              <div className="flex items-center gap-4">
                <ExportButtons onExport={(format, scope) => handleExport(format, scope, 'AP')} />
                <span className="px-2 py-1 bg-rose-100 text-rose-700 text-[10px] font-black rounded uppercase">Aging Summary</span>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-slate-50/50 text-slate-400 font-bold text-[10px] uppercase border-b border-slate-100">
                  <tr>
                    <th className="px-8 py-4 sticky left-0 bg-slate-50/50 z-10 w-64">Vendor Name</th>
                    {activeCompanies.map(c => (
                      <th key={c.id} className="px-6 py-4 text-right truncate max-w-[120px]">{c.name}</th>
                    ))}
                    <th className="px-8 py-4 text-right bg-rose-50/30 font-black text-rose-700 sticky right-0 z-10">Consolidated</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {loading ? (
                    <tr><td colSpan={activeCompanies.length + 2} className="px-8 py-20 text-center"><Activity className="w-8 h-8 animate-spin mx-auto text-slate-200" /></td></tr>
                  ) : paginatedVendors.length === 0 ? (
                    <tr><td colSpan={activeCompanies.length + 2} className="px-8 py-10 text-center text-slate-400 italic font-bold">No vendor balances to report.</td></tr>
                  ) : paginatedVendors.map((p) => (
                    <tr key={p.id} className="hover:bg-slate-50 transition-colors group">
                      <td className="px-8 py-4 sticky left-0 bg-white group-hover:bg-slate-50 z-10 font-bold text-slate-700 border-r border-slate-100 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)]">
                        {p.name}
                      </td>
                      {activeCompanies.map(c => (
                        <td key={c.id} className="px-6 py-4 text-right font-mono text-xs text-slate-500">
                          {p.branches[c.id] ? formatBDT(-p.branches[c.id]) : <span className="text-slate-200">-</span>}
                        </td>
                      ))}
                      <td className="px-8 py-4 text-right font-black text-rose-600 bg-rose-50/10 group-hover:bg-rose-50/30 sticky right-0 z-10 shadow-[-2px_0_5px_-2px_rgba(0,0,0,0.05)]">
                        {formatBDT(-p.total)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="p-4 border-t bg-slate-50/30 mt-auto">
              <Pagination 
                currentPage={vendPage}
                totalPages={Math.ceil(aggregatedVendors.length / pageSize)}
                totalItems={aggregatedVendors.length}
                itemsPerPage={pageSize}
                onPageChange={setVendPage}
                onItemsPerPageChange={setPageSize}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ReceivablePayableSummary;
