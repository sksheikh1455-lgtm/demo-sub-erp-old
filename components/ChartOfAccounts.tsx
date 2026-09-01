
import React, { useState, useMemo, useEffect } from 'react';
import { AccountType, Account } from '../types';
import {formatBDT, exportToXLSX, exportToPDF, getOpDateBST} from '../constants';
import ExportButtons from './ExportButtons';
import Pagination from './Pagination';
import ColumnSelector, { useColumns, ColumnDef } from './ColumnSelector';
import { reportingService } from '../services/reportingService';
import { Activity, Search, RefreshCw } from 'lucide-react';

const ChartOfAccounts: React.FC<{ store: any }> = ({ store }) => {
  const [showModal, setShowModal] = useState(false);
  const [search, setSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(80);
  const [loadingBalances, setLoadingBalances] = useState(false);
  const [accountBalances, setAccountBalances] = useState<Record<string, number>>({});

  const [columns, setColumns] = useColumns('coa_list', [
    { id: 'code', label: 'Code', visible: true },
    { id: 'name', label: 'Name', visible: true },
    { id: 'type', label: 'Type', visible: true },
    { id: 'balance', label: 'Balance', visible: true },
  ]);

  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    code: '',
    type: AccountType.ASSET,
    description: '',
    parentId: ''
  });

  const fetchBalances = async () => {
    setLoadingBalances(true);
    try {
      const activeIds = store.activeCompanyIds?.length > 0 ? store.activeCompanyIds : null;
      const today = getOpDateBST();
      const balances = await reportingService.getAllAccountBalances(activeIds, today);
      setAccountBalances(balances);
    } catch (err) {
      console.error('Failed to fetch account balances:', err);
    } finally {
      setLoadingBalances(false);
    }
  };

  useEffect(() => {
    fetchBalances();
  }, [store.activeCompanyIds]);

  const handleEdit = (account: Account) => {
    setEditingAccount(account);
    setFormData({
      name: account.name,
      code: account.code,
      type: account.type,
      description: account.description || '',
      parentId: account.parentId || ''
    });
    setShowModal(true);
  };

  const filteredAccounts = useMemo(() => {
    const query = search.toLowerCase();
    
    // Group by code to merge accounts across selected companies
    const grouped = (store.accounts || []).reduce((acc: any, account: Account) => {
      if (!acc[account.code]) {
        acc[account.code] = {
           ...account, // takes name, type, code from the first one we see
           _mergedIds: [account.id],
           _mergedBalance: accountBalances[account.id] || 0
        };
      } else {
        acc[account.code]._mergedIds.push(account.id);
        acc[account.code]._mergedBalance += (accountBalances[account.id] || 0);
      }
      return acc;
    }, {});
    
    const mergedList = Object.values(grouped);

    return mergedList.filter((a: any) => 
      String(a.name || '').toLowerCase().includes(query) || 
      (a.code || '').includes(query) || 
      String(a.type || '').toLowerCase().includes(query)
    );
  }, [store.accounts, search, accountBalances]);

  const totalPages = Math.ceil(filteredAccounts.length / pageSize);
  const paginatedAccounts = filteredAccounts.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const handleExport = (format: 'excel' | 'pdf', scope: 'page' | 'all') => {
    const dataToExport = scope === 'page' ? paginatedAccounts : filteredAccounts;
    const headers = ['Account Code', 'Name', 'Description', 'Category Type', 'Ledger Balance'];
    const rows = [
      headers,
      ...dataToExport.map((a: any) => [
        a.code,
        a.name,
        a.description || '',
        a.type,
        a._mergedBalance
      ])
    ];

    if (format === 'excel') {
      exportToXLSX('Chart_of_Accounts', rows);
    } else {
      exportToPDF('Chart_of_Accounts', rows);
    }
  };

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingAccount) {
        store.updateAccount(editingAccount.id, formData);
      } else {
        store.addAccount(formData);
      }
      setShowModal(false);
      setEditingAccount(null);
      setFormData({ name: '', code: '', type: AccountType.ASSET, description: '', parentId: '' });
    } catch (err: any) {
      alert(err.message);
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto p-4 lg:p-8 animate-in fade-in duration-500">
      {/* HEADER SECTION */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center bg-white p-8 rounded-2xl border border-slate-200 shadow-sm gap-4">
        <div>
          <h3 className="text-3xl font-black text-slate-800 uppercase tracking-tighter">Chart of Accounts</h3>
          <p className="text-slate-500 font-medium mt-1">Manage your financial structure and double-entry categories.</p>
        </div>
        <button 
          onClick={() => {
            setEditingAccount(null);
            setFormData({ name: '', code: '', type: AccountType.ASSET, description: '', parentId: '' });
            setShowModal(true);
          }}
          className="px-8 py-3 bg-[#00A09D] text-white font-black text-xs uppercase tracking-widest rounded-lg shadow-lg shadow-emerald-100 hover:bg-[#008c89] transition-all active:scale-95 flex items-center"
        >
          <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M12 4v16m8-8H4"/></svg>
          New Account
        </button>
      </div>

      {/* FILTER BAR */}
      <div className="bg-white border p-4 rounded-xl shadow-sm flex items-center justify-between gap-4">
        <div className="relative flex-1 max-w-md flex items-center gap-2">
          <div className="relative flex-1">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
              <Search className="w-4 h-4" />
            </span>
            <input 
              type="text" 
              placeholder="Filter by name, code or type..." 
              className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#00A09D]/20 focus:border-[#00A09D] transition-all"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }}
            />
          </div>
          <button 
            onClick={fetchBalances}
            disabled={loadingBalances}
            className="p-2 hover:bg-slate-100 rounded-lg transition-all text-slate-400 hover:text-indigo-600 disabled:opacity-50"
            title="Refresh Balances"
          >
            <RefreshCw className={`w-5 h-5 ${loadingBalances ? 'animate-spin' : ''}`} />
          </button>
        </div>
        <ExportButtons onExport={handleExport} />
      </div>

      {/* ACCOUNTS TABLE */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead className="bg-slate-50 border-b text-[10px] font-black text-slate-400 uppercase tracking-[0.15em]">
            <tr>
              {columns.find(c => c.id === 'code')?.visible && <th className="px-6 py-4 w-32">Account Code</th>}
              {columns.find(c => c.id === 'name')?.visible && <th className="px-6 py-4">Name / Description</th>}
              {columns.find(c => c.id === 'type')?.visible && <th className="px-6 py-4">Category Type</th>}
              {columns.find(c => c.id === 'balance')?.visible && <th className="px-6 py-4 text-right">Ledger Balance</th>}
              <th className="px-6 py-4 text-right w-10">
                <ColumnSelector columns={columns} onChange={setColumns} />
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {paginatedAccounts.length === 0 ? (
              <tr><td colSpan={columns.filter(c => c.visible).length + 1} className="px-6 py-20 text-center text-slate-400 italic">No accounts match your search.</td></tr>
            ) : paginatedAccounts.map((account: any) => {
              const balance = account._mergedBalance;
              return (
                <tr key={account.id} className="hover:bg-slate-50/50 transition-colors group">
                  {columns.find(c => c.id === 'code')?.visible && <td className="px-6 py-5">
                    <span className="font-black text-indigo-600 bg-indigo-50 px-2 py-1 rounded text-xs uppercase">{account.code}</span>
                  </td>}
                  {columns.find(c => c.id === 'name')?.visible && <td className="px-6 py-5">
                    <div className="flex flex-col">
                      <span className="font-bold text-slate-800 text-sm tracking-tight uppercase group-hover:text-[#00A09D] transition-colors">{account.name}</span>
                      {account.description && <span className="text-[10px] text-slate-400 italic mt-0.5">{account.description}</span>}
                    </div>
                  </td>}
                  {columns.find(c => c.id === 'type')?.visible && <td className="px-6 py-5">
                    <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-tighter border ${
                      account.type === AccountType.ASSET ? 'bg-emerald-50 text-emerald-700 border-emerald-100' :
                      account.type === AccountType.LIABILITY ? 'bg-rose-50 text-rose-700 border-rose-100' :
                      account.type === AccountType.REVENUE ? 'bg-indigo-50 text-indigo-700 border-indigo-100' :
                      account.type === AccountType.EXPENSE ? 'bg-amber-50 text-amber-700 border-amber-100' :
                      'bg-slate-50 text-slate-700 border-slate-100'
                    }`}>
                      {account.type}
                    </span>
                  </td>}
                  {columns.find(c => c.id === 'balance')?.visible && <td className={`px-6 py-5 text-right font-black tabular-nums text-sm ${Math.abs(balance) > 0 ? 'text-slate-900' : 'text-slate-300'}`}>
                    {formatBDT(balance)}
                  </td>}
                  <td className="px-6 py-5 text-right flex items-center justify-end space-x-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" title="Active"></span>
                    <button 
                      onClick={() => handleEdit(account)}
                      className="p-1 text-slate-400 hover:text-indigo-600 transition-colors"
                      title="Edit Account"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <Pagination 
          currentPage={currentPage} 
          totalPages={totalPages} 
          totalItems={filteredAccounts.length} 
          itemsPerPage={pageSize} 
          onPageChange={setCurrentPage} 
          onItemsPerPageChange={setPageSize}
        />
      </div>

      {/* CREATE ACCOUNT MODAL */}
      {showModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl animate-in zoom-in duration-300">
            <form onSubmit={handleCreate}>
              <div className="p-8 border-b bg-slate-50 flex justify-between items-center">
                <div>
                  <h4 className="text-2xl font-black text-slate-800 tracking-tighter uppercase">{editingAccount ? 'Edit Account' : 'Define New Account'}</h4>
                  <p className="text-sm text-slate-500 font-medium">{editingAccount ? 'Update account details.' : 'Add a new record category to your ledger.'}</p>
                </div>
                <button type="button" onClick={() => { setShowModal(false); setEditingAccount(null); }} className="text-slate-400 hover:text-slate-600">✕</button>
              </div>
              
              <div className="p-8 space-y-5">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 mb-1 uppercase tracking-widest">Account Code</label>
                    <input 
                      disabled
                      className="w-full px-4 py-2.5 bg-slate-100 border border-slate-200 rounded-lg outline-none text-sm font-bold text-slate-500 cursor-not-allowed" 
                      placeholder="Auto-generated"
                      value={formData.code}
                    />
                    <p className="text-[9px] text-slate-400 mt-1 italic">Generated based on Category Type</p>
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 mb-1 uppercase tracking-widest">Category Type</label>
                    <select 
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-[#00A09D]/20 focus:border-[#00A09D] outline-none text-sm font-bold"
                      value={formData.type || ""}
                      onChange={(e) => setFormData({...formData, type: e.target.value as AccountType})}
                    >
                      {Object.values(AccountType).map(type => (
                        <option key={type} value={type}>{type}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-black text-slate-400 mb-1 uppercase tracking-widest">Account Name</label>
                  <input 
                    required
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-[#00A09D]/20 focus:border-[#00A09D] outline-none text-sm font-bold" 
                    placeholder="e.g. Petty Cash"
                    value={formData.name}
                    onChange={(e) => setFormData({...formData, name: e.target.value})}
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-black text-slate-400 mb-1 uppercase tracking-widest">Description (Optional)</label>
                  <textarea 
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-[#00A09D]/20 focus:border-[#00A09D] outline-none text-sm font-medium h-24 resize-none" 
                    placeholder="Add notes about this account's purpose..."
                    value={formData.description || ''}
                    onChange={(e) => setFormData({...formData, description: e.target.value})}
                  />
                </div>
              </div>

              <div className="p-8 bg-slate-50 border-t flex justify-end space-x-3">
                <button 
                  type="button" 
                  onClick={() => setShowModal(false)} 
                  className="px-6 py-2.5 text-slate-500 font-black text-xs uppercase tracking-widest hover:text-slate-800 transition-colors"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  className="px-8 py-2.5 bg-[#00A09D] text-white font-black text-xs uppercase tracking-widest rounded-lg shadow-lg hover:bg-[#008c89] transition-all active:scale-95"
                >
                  Save Account
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default ChartOfAccounts;
