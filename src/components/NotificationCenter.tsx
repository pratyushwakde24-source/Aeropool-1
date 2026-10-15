import React from 'react';
import { Bell, CheckCheck, X, Info, CheckCircle, AlertTriangle, ExternalLink } from 'lucide-react';
import { AppNotification } from '../types';
import { db } from '../services/db';

interface NotificationCenterProps {
  isOpen: boolean;
  notifications: AppNotification[];
  onClose: () => void;
  onNavigate: (route: string) => void;
}

export const NotificationCenter: React.FC<NotificationCenterProps> = ({
  isOpen,
  notifications,
  onClose,
  onNavigate,
}) => {
  if (!isOpen) return null;

  const markAllAsRead = () => {
    notifications.forEach((n) => (n.read = true));
    db.getState().notifications.forEach((n) => (n.read = true));
    onClose();
  };

  const typeIcons = {
    INFO: <Info className="w-4 h-4 text-sky-400" />,
    SUCCESS: <CheckCircle className="w-4 h-4 text-emerald-400" />,
    WARNING: <AlertTriangle className="w-4 h-4 text-amber-400" />,
    ALERT: <AlertTriangle className="w-4 h-4 text-red-400" />,
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/60 backdrop-blur-sm animate-in fade-in">
      <div className="w-full max-w-md bg-slate-900 border-l border-slate-800 shadow-2xl h-full flex flex-col text-slate-100">
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bell className="w-5 h-5 text-sky-400" />
            <h3 className="text-sm font-bold text-white">Notifications & Alerts</h3>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={markAllAsRead}
              className="text-xs text-sky-400 hover:text-sky-300 font-medium flex items-center gap-1"
            >
              <CheckCheck className="w-3.5 h-3.5" />
              <span>Mark all read</span>
            </button>
            <button onClick={onClose} className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 transition">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {notifications.length === 0 ? (
            <div className="text-center py-12 text-slate-500 text-xs">No notifications yet.</div>
          ) : (
            notifications.map((notif) => (
              <div
                key={notif.id}
                className={`p-3 rounded-xl border transition ${
                  notif.read ? 'bg-slate-950/40 border-slate-800/80 text-slate-400' : 'bg-slate-950 border-sky-500/30 text-white'
                }`}
              >
                <div className="flex items-start gap-2.5">
                  <div className="mt-0.5 shrink-0">{typeIcons[notif.type] || <Info className="w-4 h-4" />}</div>
                  <div className="flex-1">
                    <div className="text-xs font-semibold">{notif.title}</div>
                    <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">{notif.message}</p>
                    <div className="text-[10px] text-slate-500 mt-2 font-mono">
                      {new Date(notif.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
