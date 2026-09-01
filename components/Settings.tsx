import { getOpDateBST } from '../constants';

import React, { useState } from 'react';
import { Company } from '../types';
import { MapPin, Navigation, ShieldCheck } from 'lucide-react';

const Settings: React.FC<{ store: any }> = ({ store }) => {
  const [showAddModal, setShowAddModal] = useState(false);
  const [newCompany, setNewCompany] = useState({
    name: '',
    code: '',
    industry: 'Technology',
    currency: 'BDT',
    logoColor: 'bg-indigo-600'
  });

  const colors = [
    'bg-indigo-600', 'bg-emerald-600', 'bg-rose-600', 'bg-amber-600', 
    'bg-sky-600', 'bg-purple-600', 'bg-slate-700', 'bg-orange-600'
  ];

  const handleAddCompany = (e: React.FormEvent) => {
    e.preventDefault();
    store.addCompany(newCompany);
    setShowAddModal(false);
    setNewCompany({
      name: '',
      code: '',
      industry: 'Technology',
      currency: 'BDT',
      logoColor: 'bg-indigo-600'
    });
  };

  
  return (
    <div className="space-y-8 max-w-5xl mx-auto p-4 lg:p-10">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-3xl font-black text-slate-800 uppercase tracking-tighter">System Settings</h3>
          <p className="text-slate-500 font-medium">Manage your multi-company workspace and organizational hierarchy.</p>
        </div>
        <button 
          onClick={() => setShowAddModal(true)}
          className="px-6 py-2.5 bg-indigo-600 text-white font-black text-xs uppercase tracking-widest rounded-xl shadow-xl shadow-indigo-200 hover:bg-indigo-700 transition-all active:scale-95"
        >
          Add New Company
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {(store.companies || []).map((company: Company) => (
          <div key={company.id} className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6 flex items-center justify-between group hover:shadow-md transition-shadow">
            <div className="flex items-center space-x-4">
              <div className={`w-14 h-14 rounded-2xl ${company.logoColor} flex items-center justify-center text-xl text-white font-black shadow-lg`}>
                {String(company.name || '').substring(0, 1)}
              </div>
              <div>
                <h4 className="font-black text-slate-800 uppercase tracking-tight">{company.name}</h4>
                <p className="text-xs font-medium text-slate-400">{company.industry} • {company.currency}</p>
              </div>
            </div>
            <div className="flex flex-col items-end space-y-3">
              <div className="flex space-x-2">
                <button 
                  onClick={() => store.switchCompany(company.id)}
                  className={`px-4 py-2 rounded-lg text-xs font-black uppercase tracking-widest transition-all ${
                    store.currentCompany.id === company.id 
                    ? 'bg-emerald-50 text-emerald-600 cursor-default' 
                    : 'bg-slate-50 text-slate-400 hover:bg-indigo-50 hover:text-indigo-600'
                  }`}
                >
                  {store.currentCompany.id === company.id ? 'Active' : 'Switch'}
                </button>
                <button className="p-2 text-slate-300 hover:text-slate-600 transition-colors">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z"/></svg>
                </button>
              </div>
              <div className="flex items-center space-x-2">
                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Cashier System</span>
                <button 
                  onClick={() => store.updateCompany(company.id, { isCashierEnabled: !company.isCashierEnabled })}
                  className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none ${
                    company.isCashierEnabled ? 'bg-indigo-600' : 'bg-slate-200'
                  }`}
                >
                  <span className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${
                    company.isCashierEnabled ? 'translate-x-5' : 'translate-x-1'
                  }`} />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-8 flex items-center space-x-6">
        <div className="w-16 h-16 bg-indigo-600 rounded-full flex items-center justify-center text-white">
          <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
        </div>
        <div>
          <h4 className="font-black text-indigo-900 uppercase text-sm tracking-widest">Multi-Company Scoping</h4>
          <p className="text-sm text-indigo-700 mt-1 max-w-xl">Every transaction, account, and product is automatically scoped to the active company. Your data remains perfectly isolated between entities for audit purposes.</p>
        </div>
      </div>

      <div className="bg-white rounded-[2.5rem] border-2 border-slate-100 shadow-xl p-10">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center space-x-4">
            <div className="w-12 h-12 bg-slate-900 text-white rounded-2xl flex items-center justify-center shadow-lg">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z"/></svg>
            </div>
            <div>
              <h4 className="text-xl font-black text-slate-800 uppercase tracking-tighter">Cloud Persistence & Sync</h4>
              <p className="text-xs font-bold text-slate-400">Database Engine: Supabase Real-time Sync</p>
            </div>
          </div>
          <div className="flex items-center space-x-3">
             {store.isStoreSyncing && (
               <div className="flex items-center space-x-2 text-indigo-600 animate-pulse">
                 <div className="w-2 h-2 bg-indigo-600 rounded-full animate-bounce"></div>
                 <span className="text-[10px] font-black uppercase tracking-widest">Syncing...</span>
               </div>
             )}
             <button 
               onClick={() => store.triggerCloudSync()}
               disabled={store.isStoreSyncing || !store.storeInitialized}
               className="px-6 py-3 bg-slate-900 text-white font-black text-[10px] uppercase tracking-widest rounded-xl hover:bg-slate-800 transition-all active:scale-95 disabled:opacity-50"
             >
               Sync Now
             </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="p-6 bg-slate-50 rounded-2xl border border-slate-100">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Sync Status</p>
            <div className="flex items-center space-x-2">
              <div className={`w-2 h-2 rounded-full ${store.loadError ? 'bg-rose-500' : (store.storeInitialized ? 'bg-emerald-500' : 'bg-amber-500')}`}></div>
              <span className="text-xs font-black uppercase">{store.loadError ? 'Critical Error' : (store.storeInitialized ? 'Online / Initialized' : 'Connecting...')}</span>
            </div>
          </div>
          <div className="p-6 bg-slate-50 rounded-2xl border border-slate-100">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Cloud Connectivity</p>
            <span className="text-xs font-black uppercase text-slate-600">{store.loadError ? 'Disconnected' : 'Stable'}</span>
          </div>
          <div className="p-6 bg-slate-50 rounded-2xl border border-slate-100">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Storage Provider</p>
            <span className="text-xs font-black uppercase text-slate-600">Supabase SQL (JSONB)</span>
          </div>
        </div>
        {store.loadError && (
          <div className="mt-6 p-4 bg-rose-50 border border-rose-100 rounded-xl">
             <p className="text-xs font-black text-rose-700 uppercase mb-1">System Blocked</p>
             <p className="text-[10px] font-bold text-rose-600">{store.loadError}</p>
          </div>
        )}
      </div>

      <div className="bg-white rounded-[2.5rem] shadow-xl border border-slate-100 p-10 space-y-8">
        <div>
          <h3 className="text-2xl font-black text-slate-800 uppercase tracking-tighter">Document Numbering (SAP Style)</h3>
          <p className="text-slate-500 font-medium">Advanced, company-wise sequential numbering for all financial documents.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[
            { label: 'Invoices', prefix: 'INV', type: 'INVOICE' },
            { label: 'Bills', prefix: 'BIL', type: 'BILL' },
            { label: 'Credit Notes', prefix: 'CRN', type: 'CREDIT_NOTE' },
            { label: 'Payments', prefix: 'PAY', type: 'PAYMENT' },
            { label: 'Journal Entries', prefix: 'JE', type: 'JOURNAL' },
            { label: 'Inventory Adj.', prefix: 'ADJ', type: 'ADJUSTMENT' },
          ].map((item) => (
            <div key={item.type} className="p-6 bg-slate-50 rounded-2xl border border-slate-100">
              <div className="flex justify-between items-start mb-4">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{item.label}</span>
                <span className="px-2 py-1 bg-indigo-100 text-indigo-600 text-[9px] font-black rounded uppercase tracking-tighter">Sequential</span>
              </div>
              <div className="space-y-1">
                <p className="text-xs font-medium text-slate-500">Next Number:</p>
                <p className="text-lg font-black text-slate-800 font-mono">
                  {store.generateNextNumber(item.type as any, getOpDateBST())}
                </p>
              </div>
              <div className="mt-4 pt-4 border-t border-slate-200">
                <p className="text-[9px] text-slate-400 font-medium italic">Format: [CODE]-{item.prefix}-YYYY-XXXXXX</p>
              </div>
            </div>
          ))}
        </div>

        <div className="p-6 bg-amber-50 border border-amber-100 rounded-2xl flex items-start space-x-4">
          <div className="text-amber-600 mt-1">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
          </div>
          <p className="text-xs text-amber-800 font-medium leading-relaxed">
            <strong>SAP ERP Alignment:</strong> Numbers are generated sequentially per company and fiscal year. This ensures audit compliance and prevents gaps in document sequences, even in multi-user environments.
          </p>
        </div>
      </div>

      <div className="bg-white rounded-[2.5rem] shadow-xl border border-slate-100 p-10 space-y-8">
        <div className="flex justify-between items-start">
          <div>
            <h3 className="text-2xl font-black text-slate-800 uppercase tracking-tighter">Geo-Fencing & Smart Attendance</h3>
            <p className="text-slate-500 font-medium">Define the physical boundaries for biometric clock-ins.</p>
          </div>
          <div className="bg-emerald-50 text-emerald-600 px-4 py-2 rounded-2xl flex items-center space-x-2">
            <ShieldCheck size={18} />
            <span className="text-[10px] font-black uppercase tracking-widest">Biometric Security Active</span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="space-y-2">
            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Office Latitude</label>
            <div className="relative">
              <input 
                type="number" 
                step="any"
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold outline-none focus:ring-2 ring-indigo-500/20"
                value={store.currentCompany.latitude || ''}
                onChange={e => store.updateCompany(store.currentCompany.id, { latitude: parseFloat(e.target.value) || 0 })}
                placeholder="e.g. 23.8103"
              />
              <MapPin size={14} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-300" />
            </div>
          </div>
          <div className="space-y-2">
            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Office Longitude</label>
            <div className="relative">
              <input 
                type="number" 
                step="any"
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold outline-none focus:ring-2 ring-indigo-500/20"
                value={store.currentCompany.longitude || ''}
                onChange={e => store.updateCompany(store.currentCompany.id, { longitude: parseFloat(e.target.value) || 0 })}
                placeholder="e.g. 90.4125"
              />
              <MapPin size={14} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-300" />
            </div>
          </div>
          <div className="space-y-2">
            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Fence Radius (Meters)</label>
            <input 
              type="number" 
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold outline-none focus:ring-2 ring-indigo-500/20"
              value={store.currentCompany.geoFenceRadius || 500}
              onChange={e => store.updateCompany(store.currentCompany.id, { geoFenceRadius: parseInt(e.target.value) || 0 })}
            />
          </div>
        </div>

        <div className="flex space-x-4">
          <button 
            onClick={() => {
              navigator.geolocation.getCurrentPosition((pos) => {
                store.updateCompany(store.currentCompany.id, {
                  latitude: pos.coords.latitude,
                  longitude: pos.coords.longitude
                });
              });
            }}
            className="flex-1 py-4 bg-slate-900 text-white rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-slate-800 transition-all flex items-center justify-center space-x-2"
          >
            <Navigation size={14} />
            <span>Set Current Location as Office</span>
          </button>
          <div className="flex-1 p-4 bg-indigo-50 rounded-2xl flex items-center space-x-3">
            <div className="w-8 h-8 bg-indigo-100 text-indigo-600 rounded-lg flex items-center justify-center">
              <MapPin size={16} />
            </div>
            <p className="text-[10px] text-indigo-700 font-bold leading-tight">
              Facial recognition will only be permitted within {store.currentCompany.geoFenceRadius || 500}m of this location.
            </p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-[2.5rem] shadow-xl border border-slate-100 p-10 space-y-8">
        <div className="flex justify-between items-start">
          <div>
            <h3 className="text-2xl font-black text-slate-800 uppercase tracking-tighter">Payroll & Working Hours</h3>
            <p className="text-slate-500 font-medium">Configure standard operating hours and attendance rules.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="space-y-2">
            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Standard Start Time</label>
            <input 
              type="time" 
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold outline-none focus:ring-2 ring-indigo-500/20"
              value={store.currentCompany.standardWorkingHours?.start || '09:00'}
              onChange={e => store.updateCompany(store.currentCompany.id, { 
                standardWorkingHours: { 
                  ...(store.currentCompany.standardWorkingHours || { start: '09:00', end: '18:00' }), 
                  start: e.target.value 
                } 
              })}
            />
          </div>
          <div className="space-y-2">
            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Standard End Time</label>
            <input 
              type="time" 
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold outline-none focus:ring-2 ring-indigo-500/20"
              value={store.currentCompany.standardWorkingHours?.end || '18:00'}
              onChange={e => store.updateCompany(store.currentCompany.id, { 
                standardWorkingHours: { 
                  ...(store.currentCompany.standardWorkingHours || { start: '09:00', end: '18:00' }), 
                  end: e.target.value 
                } 
              })}
            />
          </div>
          <div className="space-y-2">
            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Grace Period (Minutes)</label>
            <input 
              type="number" 
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold outline-none focus:ring-2 ring-indigo-500/20"
              value={store.currentCompany.gracePeriodMinutes || 15}
              onChange={e => store.updateCompany(store.currentCompany.id, { gracePeriodMinutes: parseInt(e.target.value) || 0 })}
            />
          </div>
        </div>

        <div className="p-6 bg-slate-50 rounded-2xl border border-slate-100">
          <label className="block text-[10px] font-black text-slate-400 mb-4 uppercase tracking-widest">Weekly Holidays</label>
          <div className="flex flex-wrap gap-3">
            {['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map((day, idx) => (
              <button
                key={day}
                onClick={() => {
                  const current = store.currentCompany.weeklyHolidays || [6];
                  const next = current.includes(idx) 
                    ? current.filter(d => d !== idx) 
                    : [...current, idx];
                  store.updateCompany(store.currentCompany.id, { weeklyHolidays: next });
                }}
                className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all ${
                  (store.currentCompany.weeklyHolidays || [6]).includes(idx)
                  ? 'bg-rose-600 text-white border-rose-600 shadow-lg shadow-rose-100'
                  : 'bg-white text-slate-400 border-slate-200 hover:border-rose-200'
                }`}
              >
                {day}
              </button>
            ))}
          </div>
          <p className="text-[9px] text-slate-400 font-bold mt-4 uppercase tracking-widest">Default: Saturday is set as the weekly holiday.</p>
        </div>
      </div>

      <div className="bg-white rounded-[2.5rem] shadow-xl border border-slate-100 p-10 space-y-8">
        <div>
          <h3 className="text-2xl font-black text-slate-800 uppercase tracking-tighter">Email & SMTP Configuration</h3>
          <p className="text-slate-500 font-medium">Configure your outgoing mail server for invitations and notifications.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="space-y-6">
            <div>
              <label className="block text-[10px] font-black text-slate-400 mb-2 uppercase tracking-widest">SMTP Host</label>
              <input 
                className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-4 focus:ring-indigo-500/10 outline-none text-sm font-bold transition-all" 
                placeholder="smtp.gmail.com"
                value={store.emailSettings.smtpHost}
                onChange={(e) => store.updateEmailSettings({...store.emailSettings, smtpHost: e.target.value})}
              />
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="col-span-1">
                <label className="block text-[10px] font-black text-slate-400 mb-2 uppercase tracking-widest">Port</label>
                <input 
                  className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-4 focus:ring-indigo-500/10 outline-none text-sm font-bold transition-all" 
                  placeholder="587"
                  value={store.emailSettings.smtpPort}
                  onChange={(e) => store.updateEmailSettings({...store.emailSettings, smtpPort: e.target.value})}
                />
              </div>
              <div className="col-span-2">
                <label className="block text-[10px] font-black text-slate-400 mb-2 uppercase tracking-widest">Sender Email (From)</label>
                <input 
                  className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-4 focus:ring-indigo-500/10 outline-none text-sm font-bold transition-all" 
                  placeholder="noreply@yourcompany.com"
                  value={store.emailSettings.smtpFrom}
                  onChange={(e) => store.updateEmailSettings({...store.emailSettings, smtpFrom: e.target.value})}
                />
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div>
              <label className="block text-[10px] font-black text-slate-400 mb-2 uppercase tracking-widest">SMTP Username</label>
              <input 
                className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-4 focus:ring-indigo-500/10 outline-none text-sm font-bold transition-all" 
                placeholder="user@example.com"
                value={store.emailSettings.smtpUser}
                onChange={(e) => store.updateEmailSettings({...store.emailSettings, smtpUser: e.target.value})}
              />
            </div>
            <div>
              <label className="block text-[10px] font-black text-slate-400 mb-2 uppercase tracking-widest">SMTP Password</label>
              <input 
                type="password"
                className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-4 focus:ring-indigo-500/10 outline-none text-sm font-bold transition-all" 
                placeholder="••••••••••••"
                value={store.emailSettings.smtpPass}
                onChange={(e) => store.updateEmailSettings({...store.emailSettings, smtpPass: e.target.value})}
              />
            </div>
          </div>
        </div>

        <div className="pt-6 border-t border-slate-50 flex justify-between items-center">
          <div className="flex items-center space-x-2">
            <div className={`w-3 h-3 rounded-full ${store.emailSettings.configured ? 'bg-emerald-500' : 'bg-slate-300'}`}></div>
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
              {store.emailSettings.configured ? 'SMTP Connected' : 'SMTP Not Configured'}
            </span>
          </div>
          <button 
            className="px-8 py-3 bg-slate-900 text-white font-black text-xs uppercase tracking-widest rounded-2xl shadow-xl hover:bg-slate-800 transition-all active:scale-95"
          >
            Test Connection
          </button>
        </div>
      </div>

      {showAddModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl w-full max-w-md overflow-hidden shadow-2xl animate-in zoom-in duration-300">
            <form onSubmit={handleAddCompany}>
              <div className="p-8 border-b bg-slate-50">
                <h4 className="text-2xl font-black text-slate-800 tracking-tighter uppercase">Register Entity</h4>
                <p className="text-sm text-slate-500 font-medium">Create a new isolated accounting environment.</p>
              </div>
              <div className="p-8 space-y-5">
                <div className="grid grid-cols-3 gap-4">
                  <div className="col-span-2">
                    <label className="block text-[10px] font-black text-slate-400 mb-1 uppercase tracking-widest">Company Name</label>
                    <input 
                      required
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-sm font-bold" 
                      placeholder="e.g. Acme Holdings"
                      value={newCompany.name || ''}
                      onChange={(e) => setNewCompany({...newCompany, name: e.target.value})}
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 mb-1 uppercase tracking-widest">Code</label>
                    <input 
                      required
                      maxLength={5}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-sm font-bold" 
                      placeholder="e.g. ACM"
                      value={newCompany.code || ''}
                      onChange={(e) => setNewCompany({...newCompany, code: String(e.target.value || '').toUpperCase()})}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 mb-1 uppercase tracking-widest">Industry</label>
                    <input 
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-sm font-bold" 
                      value={newCompany.industry || ''}
                      onChange={(e) => setNewCompany({...newCompany, industry: e.target.value})}
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 mb-1 uppercase tracking-widest">Currency</label>
                    <select 
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-sm font-bold"
                      value={newCompany.currency || ''}
                      onChange={(e) => setNewCompany({...newCompany, currency: e.target.value})}
                    >
                      <option value="BDT">BDT (৳)</option>
                      <option value="USD">USD ($)</option>
                      <option value="EUR">EUR (€)</option>
                      <option value="GBP">GBP (£)</option>
                      <option value="AUD">AUD ($)</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-400 mb-2 uppercase tracking-widest">Brand Color</label>
                  <div className="flex flex-wrap gap-2">
                    {colors.map(color => (
                      <button
                        key={color}
                        type="button"
                        onClick={() => setNewCompany({...newCompany, logoColor: color})}
                        className={`w-8 h-8 rounded-lg ${color} transition-all ${newCompany.logoColor === color ? 'ring-4 ring-offset-2 ring-indigo-500 scale-110' : 'opacity-60 hover:opacity-100'}`}
                      ></button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="p-8 bg-slate-50 border-t flex justify-end space-x-3">
                <button type="button" onClick={() => setShowAddModal(false)} className="px-6 py-2.5 text-slate-500 font-black text-xs uppercase tracking-widest hover:text-slate-800 transition-colors">Cancel</button>
                <button 
                  type="submit"
                  className="px-8 py-2.5 bg-indigo-600 text-white font-black text-xs uppercase tracking-widest rounded-xl shadow-lg hover:bg-indigo-700 transition-all active:scale-95"
                >
                  Create Entity
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Settings;
