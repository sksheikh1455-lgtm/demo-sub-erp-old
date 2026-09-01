import React, { useState } from 'react';
import { Message, User } from '../types';
import { formatDateTime } from '../constants';

interface ChatterProps {
  messages: Message[];
  users: User[];
  onSendMessage: (body: string) => void;
  entityType: string;
}

const Chatter: React.FC<ChatterProps> = ({ messages, users, onSendMessage, entityType }) => {
  const [newMsg, setNewMsg] = useState('');

  const handleSend = () => {
    if (newMsg.trim()) {
      onSendMessage(newMsg.trim());
      setNewMsg('');
    }
  };

  return (
    <div className="mt-20 border-t pt-10 bg-slate-50 -mx-12 px-12 pb-20">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <h3 className="text-lg font-bold text-slate-800 flex items-center">
            <svg className="w-5 h-5 mr-2 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/></svg>
            {entityType} History & Communication
          </h3>
          <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">{messages.length} Messages</span>
        </div>

        <div className="space-y-6 mb-8">
          {(messages || []).slice().sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).map((msg) => {
            const author = users.find(u => u.id === msg.authorId);
            const isNotification = msg.type === 'notification';

            return (
              <div key={msg.id} className={`flex space-x-4 ${isNotification ? 'opacity-70' : ''}`}>
                <div className={`w-8 h-8 rounded-full shrink-0 flex items-center justify-center text-white text-xs font-bold ${isNotification ? 'bg-slate-300' : 'bg-indigo-500'}`}>
                  {author?.name?.[0] || 'U'}
                </div>
                <div className="flex-1">
                  <div className="flex items-baseline space-x-2 mb-1">
                    <span className="text-sm font-bold text-slate-800">{author?.name || 'System User'}</span>
                    <span className="text-[10px] font-bold text-slate-400 uppercase">{formatDateTime(msg.date)}</span>
                  </div>
                  <div className={`text-sm ${isNotification ? 'text-slate-500 italic' : 'text-slate-700 font-medium'}`}>
                    {msg.body}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        
        <div className="bg-white border rounded-lg shadow-sm overflow-hidden mt-8">
          <div className="p-4 bg-slate-50 flex items-center space-x-4">
            <div className="w-8 h-8 rounded-full bg-[#714B67] flex items-center justify-center text-white text-xs font-bold">U</div>
            <input 
              type="text" 
              placeholder="Send a message or log a note..." 
              className="flex-1 bg-transparent outline-none text-sm font-medium"
              value={newMsg}
              onChange={e => setNewMsg(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSend()}
            />
            <button onClick={handleSend} className="bg-[#714B67] text-white px-4 py-1 rounded text-xs font-bold hover:brightness-110 transition-all">Send</button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Chatter;
