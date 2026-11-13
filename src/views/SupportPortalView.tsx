import React, { useState } from 'react';
import {
  LifeBuoy,
  MessageSquare,
  CheckCircle2,
  Clock,
  Send,
  AlertTriangle,
  User,
  ShieldAlert,
  Inbox
} from 'lucide-react';
import { db } from '../services/db';
import { SupportTicket } from '../types';

interface SupportPortalViewProps {
  onNavigate: (route: string) => void;
}

export const SupportPortalView: React.FC<SupportPortalViewProps> = ({ onNavigate }) => {
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');

  const currentUser = db.getState().currentUser;

  if (!currentUser) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 text-center space-y-4 shadow-2xl">
          <LifeBuoy className="w-12 h-12 text-slate-500 mx-auto" />
          <h2 className="text-lg font-bold text-white">Authentication Required</h2>
          <p className="text-xs text-slate-400">Please sign in with authorized support credentials to access the Ops Desk.</p>
          <button
            onClick={() => onNavigate('/')}
            className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-xl transition"
          >
            Return Home
          </button>
        </div>
      </div>
    );
  }

  const tickets = db.getState().supportTickets;
  const currentTicket = tickets.find((t) => t.id === selectedTicketId) || (tickets.length > 0 ? tickets[0] : null);

  const handleSendReply = (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyText.trim() || !currentTicket) return;

    currentTicket.messages.push({
      senderId: currentUser.id,
      senderName: `${currentUser.fullName} (AeroPool Ops)`,
      message: replyText.trim(),
      timestamp: new Date().toISOString(),
    });

    currentTicket.status = 'IN_PROGRESS';
    currentTicket.updatedAt = new Date().toISOString();

    db.getState().supportTickets.forEach((t) => {
      if (t.id === currentTicket.id) {
        t.messages = currentTicket.messages;
        t.status = 'IN_PROGRESS';
      }
    });

    setReplyText('');
  };

  const handleResolveTicket = () => {
    if (!currentTicket) return;
    currentTicket.status = 'RESOLVED';
    currentTicket.updatedAt = new Date().toISOString();
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Support Header */}
        <div className="bg-slate-900 border border-amber-500/30 rounded-2xl p-6 flex items-center justify-between shadow-xl">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20 flex items-center justify-center font-bold">
              <LifeBuoy className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold text-white">Customer Support & Dispute Desk</h1>
                <span className="text-[10px] font-mono bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded border border-amber-500/30 font-bold uppercase">
                  OPS SUPPORT
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Operator: <span className="text-white font-medium">{currentUser.fullName}</span> ({currentUser.email})
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-mono text-slate-400 bg-slate-950 px-3 py-1.5 rounded-xl border border-slate-800">
              Active Inquiries: <strong className="text-amber-400">{tickets.filter((t) => t.status !== 'RESOLVED').length}</strong>
            </span>
          </div>
        </div>

        {/* Ticket Split Layout */}
        {tickets.length === 0 ? (
          <div className="p-16 text-center bg-slate-900 border border-slate-800 rounded-3xl space-y-3">
            <Inbox className="w-12 h-12 text-slate-600 mx-auto" />
            <h3 className="text-sm font-bold text-white">No Support Inquiries</h3>
            <p className="text-xs text-slate-400 max-w-sm mx-auto">
              All passenger and driver inquiries are currently resolved. Inbound tickets will appear here in real time.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left: Tickets List */}
            <div className="lg:col-span-5 space-y-3">
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400">Inbound Tickets</h2>
              {tickets.map((t) => {
                const isSelected = currentTicket?.id === t.id;
                return (
                  <div
                    key={t.id}
                    onClick={() => setSelectedTicketId(t.id)}
                    className={`p-4 rounded-xl border cursor-pointer transition ${
                      isSelected
                        ? 'bg-amber-500/10 border-amber-500 text-white shadow-md'
                        : 'bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs font-bold text-white truncate">{t.subject}</span>
                      <span
                        className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold uppercase ${
                          t.status === 'RESOLVED'
                            ? 'bg-emerald-500/10 text-emerald-400'
                            : 'bg-amber-500/10 text-amber-400'
                        }`}
                      >
                        {t.status}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-400 flex items-center justify-between">
                      <span>{t.userName} ({t.userRole})</span>
                      <span>{new Date(t.createdAt).toLocaleDateString()}</span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Right: Selected Ticket Discussion */}
            <div className="lg:col-span-7 bg-slate-900 border border-slate-800 rounded-2xl p-6 flex flex-col justify-between space-y-4">
              {currentTicket ? (
                <>
                  <div className="border-b border-slate-800 pb-4 flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-bold text-white">{currentTicket.subject}</h3>
                      <div className="text-xs text-slate-400 mt-0.5">
                        User: <strong className="text-slate-200">{currentTicket.userName}</strong> • Category: {currentTicket.category}
                      </div>
                    </div>
                    {currentTicket.status !== 'RESOLVED' && (
                      <button
                        onClick={handleResolveTicket}
                        className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs rounded-xl shadow transition"
                      >
                        Mark Resolved
                      </button>
                    )}
                  </div>

                  {/* Messages Feed */}
                  <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
                    {currentTicket.messages.map((m, i) => (
                      <div
                        key={i}
                        className={`p-3.5 rounded-xl text-xs space-y-1 ${
                          m.senderName.includes('AeroPool')
                            ? 'bg-sky-950/60 border border-sky-800/80 ml-6 text-sky-100'
                            : 'bg-slate-950 border border-slate-800 mr-6 text-slate-200'
                        }`}
                      >
                        <div className="flex items-center justify-between text-[10px] font-semibold text-slate-400">
                          <span>{m.senderName}</span>
                          <span>{new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                        <p className="leading-relaxed">{m.message}</p>
                      </div>
                    ))}
                  </div>

                  {/* Reply Box */}
                  <form onSubmit={handleSendReply} className="pt-3 border-t border-slate-800 flex gap-2">
                    <input
                      type="text"
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      placeholder="Type official reply to passenger..."
                      className="flex-1 bg-slate-950 border border-slate-700 rounded-xl px-4 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
                    />
                    <button
                      type="submit"
                      className="px-4 py-2.5 bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs rounded-xl transition flex items-center gap-1.5"
                    >
                      <Send className="w-4 h-4" />
                      <span>Send</span>
                    </button>
                  </form>
                </>
              ) : (
                <div className="text-center py-12 text-slate-500 text-xs">Select a ticket to view conversation.</div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
