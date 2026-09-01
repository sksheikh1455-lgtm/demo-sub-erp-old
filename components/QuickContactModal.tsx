
import React, { useState } from 'react';
import { Contact, ContactType } from '../types';

interface QuickContactModalProps {
  name: string;
  type: ContactType;
  store: any;
  onSave: (c: Contact) => void;
  onCancel: () => void;
  themeColor?: string;
  designation?: string;
}

const QuickContactModal: React.FC<QuickContactModalProps> = ({ name, type, store, onSave, onCancel, themeColor = '#714B67', designation }) => {
  const [data, setData] = useState({ name: name || '', email: '', type: type || ContactType.CUSTOMER, address: '', phone: '+88', designation: designation || '' });
  const [error, setError] = useState('');

  const handleSave = () => {
    if (!data.name.trim()) return setError('Name is required');
    if (!data.phone || data.phone.length < 14) return setError('Valid BD mobile number is required (+8801XXXXXXXXX)');
    if (!data.phone.startsWith('+88')) return setError('Mobile number must start with +88');
    
    onSave(store.addContact(data));
  };

  const getTitle = () => {
    if (type === ContactType.CUSTOMER) return 'Customer';
    if (type === ContactType.VENDOR) return 'Vendor';
    if (type === ContactType.EMPLOYEE) return 'Employee';
    return 'Contact';
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[200] p-4">
      <div className="bg-white rounded-xl w-full max-w-md shadow-2xl animate-in zoom-in duration-200 max-h-[95vh] flex flex-col">
        <div className="p-6 text-white rounded-t-xl flex justify-between items-center shrink-0" style={{ backgroundColor: themeColor }}>
          <h4 className="font-bold text-xs uppercase tracking-widest">New {getTitle()}</h4>
          <button onClick={onCancel} className="hover:rotate-90 transition-transform">✕</button>
        </div>
        <div className="p-8 space-y-6 overflow-y-auto shrink overflow-x-hidden">
          {error && (
            <div className="bg-rose-50 border border-rose-200 text-rose-600 px-4 py-2 rounded text-[10px] font-bold uppercase tracking-wider animate-bounce">
              {error}
            </div>
          )}
          <div className="space-y-1">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-tighter">Name <span className="text-rose-500">*</span></label>
            <input 
              className="w-full text-xl font-bold border-b border-slate-200 focus:border-indigo-500 outline-none py-2 transition-colors" 
              value={data.name} 
              onChange={e => { setData({...data, name: e.target.value}); setError(''); }} 
              autoFocus
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-tighter">Mobile Number (BD Standard) <span className="text-rose-500">*</span></label>
            <input 
              className="w-full text-lg font-bold border-b border-slate-200 focus:border-indigo-500 outline-none py-2 transition-colors" 
              placeholder="+8801XXXXXXXXX"
              value={data.phone} 
              onChange={e => { 
                let val = e.target.value;
                if (!val.startsWith('+88')) val = '+88' + val.replace(/^\+?8?8?/, '');
                setData({...data, phone: val}); 
                setError(''); 
              }} 
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-tighter">Email Address</label>
            <input 
              className="w-full border-b border-slate-200 focus:border-indigo-500 outline-none py-2 text-sm" 
              placeholder="email@example.com"
              value={data.email} 
              onChange={e => setData({...data, email: e.target.value})} 
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-tighter">Address</label>
            <textarea 
              className="w-full border-b border-slate-200 focus:border-indigo-500 outline-none py-2 text-sm resize-none" 
              placeholder="Street, City, Country"
              rows={2}
              value={data.address} 
              onChange={e => setData({...data, address: e.target.value})} 
            />
          </div>
        </div>
        <div className="p-6 bg-slate-50 flex justify-end space-x-3 rounded-b-xl shrink-0">
          <button onClick={onCancel} className="px-6 py-2 text-xs font-bold text-slate-400 hover:text-slate-600 transition-colors">Discard</button>
          <button 
            onClick={handleSave} 
            className="px-8 py-2 text-white font-bold rounded shadow-lg hover:brightness-110 active:scale-95 transition-all"
            style={{ backgroundColor: themeColor }}
          >
            Save & Select
          </button>
        </div>
      </div>
    </div>
  );
};

export default QuickContactModal;
