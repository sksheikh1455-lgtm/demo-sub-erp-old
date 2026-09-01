
import React, { useState, useMemo } from 'react';
import { useAccountingStore } from '../store/useAccountingStore';
import { CreditNote, Contact, Product } from '../types';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  PieChart, Pie, Cell, LineChart, Line, Legend, AreaChart, Area
} from 'recharts';
import {ICONS, getOpDateBST} from '../constants';

const COLORS = ['#714B67', '#AD4D76', '#E25E6A', '#F28A5E', '#F9B75B', '#F9E076'];

interface CreditNoteAnalysisProps {
  store?: any;
}

const CreditNoteAnalysis: React.FC<CreditNoteAnalysisProps> = ({ store }) => {
  const [dateRange, setDateRange] = useState({
    start: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0],
    end: getOpDateBST()
  });

  const allCNs = (store.creditNotes || []).filter((cn: CreditNote) => 
    cn && cn.companyId && store.activeCompanyIds.includes(cn.companyId) &&
    cn.status !== 'VOID' &&
    cn.status !== 'DRAFT'
  );

  const filteredCNs = useMemo(() => {
    return allCNs.filter(cn => cn.date >= dateRange.start && cn.date <= dateRange.end);
  }, [allCNs, dateRange]);

  const stats = useMemo(() => {
    const totalAmount = filteredCNs.reduce((sum, cn) => sum + (cn.total || 0), 0);
    const count = filteredCNs.length;
    
    // Product Analysis
    const productMap: Record<string, { id: string; name: string; qty: number; amount: number }> = {};
    const customerMap: Record<string, { id: string; name: string; amount: number; count: number }> = {};
    const staffMap: Record<string, { id: string; name: string; amount: number; count: number }> = {};
    const trendMap: Record<string, number> = {};

    filteredCNs.forEach(cn => {
      // Trend
      trendMap[cn.date] = (trendMap[cn.date] || 0) + (cn.total || 0);

      // Customer
      const custId = cn.customerId;
      const cust = (store.contacts || []).find((c: Contact) => c.id === custId);
      const custName = cust?.name || 'Unknown Customer';
      if (!customerMap[custId]) customerMap[custId] = { id: custId, name: custName, amount: 0, count: 0 };
      customerMap[custId].amount += cn.total;
      customerMap[custId].count += 1;

      // Staff
      const staffId = cn.createdById || 'unknown';
      const staff = (store.users || []).find((u: any) => u.id === staffId);
      const staffName = staff?.name || 'System / Unknown';
      if (!staffMap[staffId]) staffMap[staffId] = { id: staffId, name: staffName, amount: 0, count: 0 };
      staffMap[staffId].amount += cn.total;
      staffMap[staffId].count += 1;

      // Items
      (cn.items || []).forEach(item => {
        if (item.productId) {
          const prod = (store.products || []).find((p: Product) => p.id === item.productId);
          const prodName = prod?.name || item.description || 'Unknown Product';
          if (!productMap[item.productId]) productMap[item.productId] = { id: item.productId, name: prodName, qty: 0, amount: 0 };
          productMap[item.productId].qty += item.quantity;
          productMap[item.productId].amount += (item.quantity * item.unitPrice) - (item.discountRate || 0);
        }
      });
    });

    const topProducts = Object.values(productMap).sort((a, b) => b.amount - a.amount).slice(0, 10);
    const topCustomers = Object.values(customerMap).sort((a, b) => b.amount - a.amount).slice(0, 10);
    const topStaff = Object.values(staffMap).sort((a, b) => b.count - a.count).slice(0, 10);
    const trendData = Object.keys(trendMap).sort().map(date => ({ date, amount: trendMap[date] }));

    return { totalAmount, count, topProducts, topCustomers, topStaff, trendData };
  }, [filteredCNs, store.contacts, store.products, store.users]);

  const formatBDT = (val: number) => {
    return new Intl.NumberFormat('en-BD', { style: 'currency', currency: 'BDT' }).format(val);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-10">
      {/* Header & Filters */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center bg-white p-6 rounded-3xl shadow-sm border border-slate-100 gap-4">
        <div>
          <h2 className="text-2xl font-black text-slate-800 uppercase tracking-tighter italic">Advance Credit Note Analysis</h2>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Deep dive into refunds, returns, and inventory impact</p>
        </div>
        <div className="flex items-center space-x-3 bg-slate-50 p-2 rounded-2xl border border-slate-100">
          <div className="flex flex-col">
            <span className="text-[9px] font-black text-slate-400 uppercase ml-2 mb-1">Start Date</span>
            <input 
              type="date" 
              value={dateRange.start} 
              onChange={e => setDateRange({...dateRange, start: e.target.value})}
              className="bg-transparent border-none text-sm font-bold text-slate-700 focus:ring-0"
            />
          </div>
          <div className="w-px h-8 bg-slate-200"></div>
          <div className="flex flex-col">
            <span className="text-[9px] font-black text-slate-400 uppercase ml-2 mb-1">End Date</span>
            <input 
              type="date" 
              value={dateRange.end} 
              onChange={e => setDateRange({...dateRange, end: e.target.value})}
              className="bg-transparent border-none text-sm font-bold text-slate-700 focus:ring-0"
            />
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-slate-100 relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:scale-110 transition-transform">
             <svg className="w-20 h-20 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
          </div>
          <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-1 italic">Total Refund Value</p>
          <p className="text-3xl font-black text-slate-800 tracking-tighter">{formatBDT(stats.totalAmount)}</p>
          <div className="mt-4 flex items-center text-xs font-bold text-slate-500">
             <span className="bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded-full mr-2">{stats.count}</span>
             Transactions processed
          </div>
        </div>

        <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-slate-100 relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:scale-110 transition-transform">
             <svg className="w-20 h-20 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/></svg>
          </div>
          <p className="text-[10px] font-black text-emerald-400 uppercase tracking-widest mb-1 italic">Items Returned</p>
          <p className="text-3xl font-black text-slate-800 tracking-tighter">
            {stats.topProducts.reduce((sum, p) => sum + p.qty, 0)} <span className="text-sm font-bold text-slate-400 uppercase tracking-widest ml-1">Units</span>
          </p>
          <div className="mt-4 flex items-center text-xs font-bold text-slate-500">
             Stock automatically re-entered
          </div>
        </div>

        <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-slate-100 relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:scale-110 transition-transform">
             <svg className="w-20 h-20 text-rose-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"/></svg>
          </div>
          <p className="text-[10px] font-black text-rose-400 uppercase tracking-widest mb-1 italic">Affected Partners</p>
          <p className="text-3xl font-black text-slate-800 tracking-tighter">
            {stats.topCustomers.length} <span className="text-sm font-bold text-slate-400 uppercase tracking-widest ml-1">Customers</span>
          </p>
          <div className="mt-4 flex items-center text-xs font-bold text-slate-500">
             {stats.topCustomers.length > 0 ? `Max refund from ${stats.topCustomers[0].name}` : 'No refunds recorded'}
          </div>
        </div>
      </div>

      {/* Main Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Trend Chart */}
        <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100 h-96">
          <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest mb-6 italic">Refund Trend Over Time</h3>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={stats.trendData}>
              <defs>
                <linearGradient id="colorAmt" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#714B67" stopOpacity={0.1}/>
                  <stop offset="95%" stopColor="#714B67" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis dataKey="date" stroke="#94a3b8" fontSize={10} fontWeight="bold" axisLine={false} tickLine={false} />
              <YAxis stroke="#94a3b8" fontSize={10} fontWeight="bold" axisLine={false} tickLine={false} tickFormatter={(value) => `৳${value/1000}k`} />
              <Tooltip 
                contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)', fontWeight: 'bold' }} 
                formatter={(value: any) => [formatBDT(value), 'Amount']}
              />
              <Area type="monotone" dataKey="amount" stroke="#714B67" strokeWidth={3} fillOpacity={1} fill="url(#colorAmt)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Top Refunded Products - Bar Chart */}
        <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100 h-96">
          <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest mb-6 italic">Top 10 Refunded Products</h3>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={stats.topProducts} layout="vertical" margin={{ left: 20 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
              <XAxis type="number" stroke="#94a3b8" fontSize={10} fontWeight="bold" axisLine={false} tickLine={false} />
              <YAxis dataKey="name" type="category" stroke="#94a3b8" fontSize={9} fontWeight="bold" width={100} axisLine={false} tickLine={false} />
              <Tooltip 
                contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)', fontWeight: 'bold' }}
                cursor={{ fill: '#f8fafc' }}
              />
              <Bar dataKey="amount" fill="#714B67" radius={[0, 4, 4, 0]} barSize={20} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Bottom Insights Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Customer Breakdown */}
        <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100 lg:col-span-2 overflow-hidden">
          <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest mb-6 italic">Customer Refund Breakdown</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-slate-50">
                  <th className="pb-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Customer</th>
                  <th className="pb-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Returns</th>
                  <th className="pb-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Refund Total</th>
                  <th className="pb-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Impact</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {stats.topCustomers.map((cust, i) => (
                  <tr key={cust.id} className="group hover:bg-slate-50/50 transition-colors">
                    <td className="py-4">
                      <div className="flex items-center space-x-3">
                        <div className={`w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center text-[10px] font-black text-slate-400 group-hover:bg-indigo-50 group-hover:text-indigo-600 transition-colors`}>
                          {(cust.name || 'U')[0]}
                        </div>
                        <span className="text-sm font-bold text-slate-700">{cust.name}</span>
                      </div>
                    </td>
                    <td className="py-4 font-black text-slate-400 text-xs">{cust.count} CNs</td>
                    <td className="py-4 text-right font-black text-slate-800">{formatBDT(cust.amount)}</td>
                    <td className="py-4 text-right">
                      <div className="flex items-center justify-end">
                        <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div className="h-full bg-rose-500" style={{ width: `${(cust.amount / stats.totalAmount) * 100}%` }}></div>
                        </div>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {stats.topCustomers.length === 0 && (
              <div className="py-10 text-center text-slate-400 font-bold uppercase tracking-widest text-xs">No data recorded for this period</div>
            )}
          </div>
        </div>

        {/* Staff / Staff Performance */}
        <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100 flex flex-col items-center">
          <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest mb-6 italic text-center">Staff CN Activity</h3>
          <div className="flex-1 w-full space-y-6 flex flex-col justify-center">
            {stats.topStaff.length > 0 ? stats.topStaff.map((staff, i) => (
              <div key={staff.id} className="flex items-center justify-between group">
                <div className="flex items-center space-x-4">
                  <div className="w-10 h-10 rounded-[1.2rem] bg-indigo-600 flex items-center justify-center text-xs font-black text-white shadow-lg shadow-indigo-100 group-hover:scale-110 transition-transform">
                    {(staff.name || 'U')[0]}
                  </div>
                  <div>
                    <h4 className="text-sm font-black text-slate-700">{staff.name}</h4>
                    <p className="text-[10px] font-black text-slate-400 uppercase">{staff.count} Credit Notes</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xs font-black text-slate-800">{formatBDT(staff.amount)}</p>
                  <p className="text-[10px] font-bold text-emerald-500 uppercase tracking-widest">Processed</p>
                </div>
              </div>
            )) : (
              <div className="text-center py-10 opacity-30 grayscale">
                <svg className="w-16 h-16 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"/></svg>
                <p className="text-[10px] font-black uppercase tracking-widest">No activity</p>
              </div>
            )}
          </div>
          <div className="w-full mt-8 p-4 bg-slate-50 rounded-2xl border border-slate-100">
             <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest text-center leading-relaxed">
               Showing data for recorded transactions processed by authenticated system users.
             </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CreditNoteAnalysis;
