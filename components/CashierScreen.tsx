
import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  CheckCircle, 
  XCircle, 
  Clock, 
  DollarSign, 
  User, 
  ArrowUpRight, 
  ArrowDownLeft,
  Bell,
  Search,
  Filter,
  Monitor,
  Zap
} from 'lucide-react';
import { formatBDT, formatDateTime } from '../constants';
import { Payment } from '../types';

interface CashierScreenProps {
  store: any;
}

const CashierScreen: React.FC<CashierScreenProps> = ({ store }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'ALL' | 'RECEIPT' | 'PAYMENT'>('ALL');
  const [lastPaymentCount, setLastPaymentCount] = useState(0);
  const [showAlert, setShowAlert] = useState(false);

  const pendingPayments = useMemo(() => {
    return (store.payments || [])
      .filter((p: Payment) => p.clearingStatus === 'PENDING')
      .sort((a: Payment, b: Payment) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [store.payments]);

  const filteredPayments = useMemo(() => {
    return pendingPayments.filter((p: Payment) => {
      const matchesSearch = String(p.number || '').toLowerCase().includes(searchQuery.toLowerCase()) || 
                           String(p.reference || '').toLowerCase().includes(searchQuery.toLowerCase());
      const matchesType = filterType === 'ALL' || p.type === filterType;
      return matchesSearch && matchesType;
    });
  }, [pendingPayments, searchQuery, filterType]);

  useEffect(() => {
    if (pendingPayments.length > lastPaymentCount) {
      setShowAlert(true);
      const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
      audio.play().catch(() => {}); // Ignore if browser blocks autoplay
      setTimeout(() => setShowAlert(false), 5000);
    }
    setLastPaymentCount(pendingPayments.length);
  }, [pendingPayments.length, lastPaymentCount]);

  const stats = useMemo(() => {
    const receipts = pendingPayments.filter((p: Payment) => p.type === 'RECEIPT');
    const payments = pendingPayments.filter((p: Payment) => p.type === 'PAYMENT');
    return {
      receiptCount: receipts.length,
      receiptTotal: receipts.reduce((sum: number, p: Payment) => sum + p.amount, 0),
      paymentCount: payments.length,
      paymentTotal: payments.reduce((sum: number, p: Payment) => sum + p.amount, 0)
    };
  }, [pendingPayments]);

  return (
    <div className="min-h-full bg-slate-950 text-slate-100 p-6 font-sans selection:bg-indigo-500/30">
      {/* HEADER */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between mb-8 gap-4">
        <div className="flex items-center space-x-4">
          <div className="w-12 h-12 rounded-2xl bg-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <Monitor className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-black tracking-tighter uppercase italic">Smart Cashier Terminal</h1>
            <div className="flex items-center space-x-2">
              <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Live Clearing Active • {store.currentCompany.name}</p>
            </div>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input 
              type="text"
              placeholder="Search payments..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-slate-900 border border-slate-800 rounded-xl py-2 pl-10 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 w-64 transition-all"
            />
          </div>
          <div className="flex bg-slate-900 p-1 rounded-xl border border-slate-800">
            {(['ALL', 'RECEIPT', 'PAYMENT'] as const).map((type) => (
              <button
                key={type}
                onClick={() => setFilterType(type)}
                className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
                  filterType === type ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20' : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                {type}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* STATS GRID */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-slate-900/50 border border-slate-800 p-6 rounded-3xl backdrop-blur-sm"
        >
          <div className="flex justify-between items-start mb-4">
            <div className="p-3 bg-emerald-500/10 rounded-2xl">
              <ArrowDownLeft className="w-6 h-6 text-emerald-500" />
            </div>
            <span className="text-[10px] font-black text-emerald-500 bg-emerald-500/10 px-2 py-1 rounded-full uppercase tracking-widest">Incoming</span>
          </div>
          <p className="text-3xl font-black tracking-tighter mb-1">{formatBDT(stats.receiptTotal)}</p>
          <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">{stats.receiptCount} Pending Receipts</p>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-slate-900/50 border border-slate-800 p-6 rounded-3xl backdrop-blur-sm"
        >
          <div className="flex justify-between items-start mb-4">
            <div className="p-3 bg-rose-500/10 rounded-2xl">
              <ArrowUpRight className="w-6 h-6 text-rose-500" />
            </div>
            <span className="text-[10px] font-black text-rose-500 bg-rose-500/10 px-2 py-1 rounded-full uppercase tracking-widest">Outgoing</span>
          </div>
          <p className="text-3xl font-black tracking-tighter mb-1">{formatBDT(stats.paymentTotal)}</p>
          <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">{stats.paymentCount} Pending Payments</p>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-slate-900/50 border border-slate-800 p-6 rounded-3xl backdrop-blur-sm"
        >
          <div className="flex justify-between items-start mb-4">
            <div className="p-3 bg-indigo-500/10 rounded-2xl">
              <Zap className="w-6 h-6 text-indigo-500" />
            </div>
            <span className="text-[10px] font-black text-indigo-500 bg-indigo-500/10 px-2 py-1 rounded-full uppercase tracking-widest">Efficiency</span>
          </div>
          <p className="text-3xl font-black tracking-tighter mb-1">98.4%</p>
          <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Avg. Clearing Time: 2m</p>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-slate-900/50 border border-slate-800 p-6 rounded-3xl backdrop-blur-sm"
        >
          <div className="flex justify-between items-start mb-4">
            <div className="p-3 bg-amber-500/10 rounded-2xl">
              <Clock className="w-6 h-6 text-amber-500" />
            </div>
            <span className="text-[10px] font-black text-amber-500 bg-amber-500/10 px-2 py-1 rounded-full uppercase tracking-widest">Queue</span>
          </div>
          <p className="text-3xl font-black tracking-tighter mb-1">{pendingPayments.length}</p>
          <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Total Pending Actions</p>
        </motion.div>
      </div>

      {/* MAIN CONTENT */}
      <div className="bg-slate-900/30 border border-slate-800 rounded-[2rem] overflow-hidden backdrop-blur-md">
        <div className="p-8 border-b border-slate-800 flex justify-between items-center">
          <h3 className="text-lg font-black uppercase tracking-tighter italic flex items-center space-x-2">
            <span className="w-2 h-6 bg-indigo-600 rounded-full"></span>
            <span>Clearing Queue</span>
          </h3>
          <div className="flex items-center space-x-2 text-[10px] font-black text-slate-500 uppercase tracking-widest">
            <Bell className="w-3 h-3" />
            <span>Auto-refreshing every 5s</span>
          </div>
        </div>

        <div className="p-4 overflow-x-auto">
          <table className="w-full text-left border-separate border-spacing-y-3">
            <thead>
              <tr className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4">Reference</th>
                <th className="px-6 py-4">Contact</th>
                <th className="px-6 py-4">Method</th>
                <th className="px-6 py-4 text-right">Amount</th>
                <th className="px-6 py-4 text-center">Actions</th>
              </tr>
            </thead>
            <tbody>
              <AnimatePresence mode="popLayout">
                {filteredPayments.length > 0 ? (
                  filteredPayments.map((p: Payment, index: number) => (
                    <motion.tr 
                      key={p.id}
                      layout
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      transition={{ duration: 0.3, delay: index * 0.05 }}
                      className="group bg-slate-900/40 hover:bg-slate-800/60 transition-all border border-slate-800 rounded-2xl"
                    >
                      <td className="px-6 py-5 first:rounded-l-2xl">
                        <div className="flex items-center space-x-2">
                          <div className={`w-2 h-2 rounded-full ${p.type === 'RECEIPT' ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.5)]'}`}></div>
                          <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">{p.type}</span>
                        </div>
                      </td>
                      <td className="px-6 py-5">
                        <p className="text-sm font-black text-slate-200 tracking-tight">{p.number}</p>
                        <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mt-0.5">{p.reference || 'No Ref'}</p>
                      </td>
                      <td className="px-6 py-5">
                        <div className="flex items-center space-x-2">
                          <div className="w-7 h-7 rounded-lg bg-slate-800 flex items-center justify-center">
                            <User className="w-3.5 h-3.5 text-slate-400" />
                          </div>
                          <span className="text-xs font-bold text-slate-300">{(store.contacts || []).find((c: any) => c.id === p.contactId)?.name || 'Unknown'}</span>
                        </div>
                      </td>
                      <td className="px-6 py-5">
                        <span className="px-2.5 py-1 rounded-lg bg-slate-800 text-[9px] font-black uppercase tracking-widest text-slate-400 border border-slate-700">{p.method}</span>
                      </td>
                      <td className="px-6 py-5 text-right">
                        <p className={`text-base font-black tracking-tighter ${p.type === 'RECEIPT' ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {p.type === 'RECEIPT' ? '+' : '-'}{formatBDT(p.amount)}
                        </p>
                      </td>
                      <td className="px-6 py-5 last:rounded-r-2xl text-center">
                        <div className="flex items-center justify-center space-x-2">
                          <button 
                            onClick={() => store.clearPayment(p.id, 'CLEARED')}
                            className="p-2.5 bg-emerald-500/10 text-emerald-500 rounded-xl hover:bg-emerald-500 hover:text-white transition-all shadow-lg shadow-emerald-500/5 group/btn"
                            title="Clear Payment"
                          >
                            <CheckCircle className="w-5 h-5 group-hover/btn:scale-110 transition-transform" />
                          </button>
                          <button 
                            onClick={() => store.clearPayment(p.id, 'REJECTED')}
                            className="p-2.5 bg-rose-500/10 text-rose-500 rounded-xl hover:bg-rose-500 hover:text-white transition-all shadow-lg shadow-rose-500/5 group/btn"
                            title="Reject Payment"
                          >
                            <XCircle className="w-5 h-5 group-hover/btn:scale-110 transition-transform" />
                          </button>
                        </div>
                      </td>
                    </motion.tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} className="px-6 py-20 text-center">
                      <div className="flex flex-col items-center justify-center space-y-4 opacity-20">
                        <div className="w-20 h-20 rounded-full border-4 border-dashed border-slate-500 flex items-center justify-center">
                          <DollarSign className="w-10 h-10" />
                        </div>
                        <p className="text-sm font-black uppercase tracking-[0.3em]">Queue is Empty</p>
                      </div>
                    </td>
                  </tr>
                )}
              </AnimatePresence>
            </tbody>
          </table>
        </div>
      </div>

      {/* NEW PAYMENT ALERT */}
      <AnimatePresence>
        {showAlert && (
          <motion.div 
            initial={{ opacity: 0, y: 50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
            className="fixed bottom-10 right-10 z-[100] bg-indigo-600 text-white p-6 rounded-[2rem] shadow-2xl shadow-indigo-500/40 flex items-center space-x-4 border-2 border-indigo-400/30"
          >
            <div className="w-12 h-12 rounded-2xl bg-white/20 flex items-center justify-center animate-bounce">
              <Bell className="w-6 h-6 text-white" />
            </div>
            <div>
              <p className="text-xs font-black uppercase tracking-widest opacity-80">New Transaction</p>
              <p className="text-lg font-bold tracking-tight">Payment Clearing Required</p>
            </div>
            <button onClick={() => setShowAlert(false)} className="p-2 hover:bg-white/10 rounded-full transition-colors">
              <XCircle className="w-5 h-5" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* FOOTER INFO */}
      <div className="mt-12 pt-8 border-t border-slate-900 flex flex-col sm:flex-row justify-between items-center gap-4 opacity-40">
        <div className="text-[9px] font-black uppercase tracking-[0.4em] text-slate-500">
          <p>Sub ERP Smart Cashier Terminal v4.0</p>
          <p>End-to-End Encrypted Clearing Protocol Active</p>
        </div>
        <div className="text-right">
          <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">Terminal ID: {store.currentCompany.code}-CASH-01</p>
          <p className="text-[9px] font-bold text-indigo-400">OPERATOR: {String(store.currentUser?.name || '').toUpperCase()}</p>
        </div>
      </div>
    </div>
  );
};

export default CashierScreen;
