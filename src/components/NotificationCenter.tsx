import React, { useState } from 'react';
import {
  Bell,
  CheckCheck,
  X,
  Info,
  CheckCircle,
  AlertTriangle,
  ExternalLink,
  Trash2,
  Filter,
  Check,
  Shield,
  Radio,
  Clock,
} from 'lucide-react';
import { AppNotification, NotificationCategory } from '../types';
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
  const [selectedCategory, setSelectedCategory] = useState<'ALL' | 'UNREAD' | NotificationCategory>('ALL');

  if (!isOpen) return null;

  const currentUser = db.getState().currentUser;

  const handleMarkAllRead = () => {
    if (currentUser) db.markAllNotificationsAsRead(currentUser.id);
  };

  const handleToggleRead = (notif: AppNotification) => {
    if (!notif.read && currentUser) {
      db.markNotificationAsRead(notif.id, currentUser.id);
    }
  };

  const handleClearNotif = (notifId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (currentUser) db.clearNotification(notifId, currentUser.id);
  };

  const handleItemClick = (notif: AppNotification) => {
    handleToggleRead(notif);
    if (notif.link) {
      onClose();
      onNavigate(notif.link);
    }
  };

  // Filter notifications based on tab
  const filteredNotifications = notifications.filter((n) => {
    if (selectedCategory === 'ALL') return true;
    if (selectedCategory === 'UNREAD') return !n.read;
    return n.category === selectedCategory;
  });

  const unreadCount = notifications.filter((n) => !n.read).length;

  const typeIcons = {
    INFO: <Info className="w-4 h-4 text-sky-400" />,
    SUCCESS: <CheckCircle className="w-4 h-4 text-emerald-400" />,
    WARNING: <AlertTriangle className="w-4 h-4 text-amber-400" />,
    ALERT: <AlertTriangle className="w-4 h-4 text-red-400" />,
  };

  const getRelativeTime = (isoString: string) => {
    const diffMs = Date.now() - new Date(isoString).getTime();
    const diffSec = Math.floor(diffMs / 1000);
    if (diffSec < 60) return 'Just now';
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    return new Date(isoString).toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-slate-950/70 backdrop-blur-sm animate-in fade-in"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-md bg-slate-900 border-l border-slate-800 shadow-2xl h-full flex flex-col text-slate-100">
        {/* Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-sky-500/10 text-sky-400 flex items-center justify-center">
              <Bell className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <span>Notification Center</span>
                {unreadCount > 0 && (
                  <span className="text-[10px] bg-sky-500 text-white font-bold px-1.5 py-0.2 rounded-full">
                    {unreadCount}
                  </span>
                )}
              </h3>
              <p className="text-[10px] text-slate-400">In-App Events Feed for {currentUser?.fullName || 'Guest'}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                className="text-xs text-sky-400 hover:text-sky-300 font-medium flex items-center gap-1 px-2 py-1 rounded hover:bg-slate-800 transition"
                title="Mark all as read"
              >
                <CheckCheck className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Mark all read</span>
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Category Filters Bar */}
        <div className="px-4 py-2 bg-slate-950/60 border-b border-slate-800/80 flex items-center gap-1 overflow-x-auto text-xs no-scrollbar">
          {(['ALL', 'UNREAD', 'TRIP', 'DISPATCH', 'SETTLEMENT', 'FLIGHT'] as const).map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-2.5 py-1 rounded-lg font-medium transition whitespace-nowrap text-[11px] ${
                selectedCategory === cat
                  ? 'bg-sky-500 text-white font-bold shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              {cat === 'ALL'
                ? 'All'
                : cat === 'UNREAD'
                ? `Unread (${unreadCount})`
                : cat === 'TRIP'
                ? 'Trips'
                : cat === 'DISPATCH'
                ? 'Dispatch'
                : cat === 'SETTLEMENT'
                ? 'Settlements'
                : 'Flight'}
            </button>
          ))}
        </div>

        {/* Notifications List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
          {filteredNotifications.length === 0 ? (
            <div className="text-center py-16 space-y-2">
              <Bell className="w-8 h-8 text-slate-600 mx-auto opacity-50" />
              <div className="text-xs font-semibold text-slate-400">No notifications found</div>
              <p className="text-[11px] text-slate-500 max-w-xs mx-auto">
                {selectedCategory === 'UNREAD'
                  ? "You're all caught up! No unread notifications at this time."
                  : 'Operational events and dispatch updates will appear here in real time.'}
              </p>
            </div>
          ) : (
            filteredNotifications.map((notif) => (
              <div
                key={notif.id}
                onClick={() => handleItemClick(notif)}
                className={`p-3.5 rounded-xl border transition cursor-pointer relative group ${
                  notif.read
                    ? 'bg-slate-950/40 border-slate-800/80 text-slate-300 hover:border-slate-700'
                    : 'bg-slate-950 border-sky-500/40 text-white shadow-sm shadow-sky-950/50 hover:border-sky-500'
                }`}
              >
                {!notif.read && (
                  <span className="absolute top-3.5 right-3.5 w-2 h-2 rounded-full bg-sky-400 animate-pulse" />
                )}

                <div className="flex items-start gap-3">
                  <div className="mt-0.5 shrink-0">
                    {typeIcons[notif.type] || <Info className="w-4 h-4 text-sky-400" />}
                  </div>

                  <div className="flex-1 pr-4">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold leading-tight">{notif.title}</span>
                      {notif.category && (
                        <span className="text-[9px] font-mono uppercase px-1.5 py-0.2 rounded bg-slate-800 text-slate-400 border border-slate-700">
                          {notif.category}
                        </span>
                      )}
                    </div>

                    <p className="text-xs text-slate-300 mt-1 leading-relaxed">{notif.message}</p>

                    <div className="flex items-center justify-between mt-2 pt-1 border-t border-slate-900 text-[10px] text-slate-500 font-mono">
                      <span>{getRelativeTime(notif.createdAt)}</span>

                      <div className="flex items-center gap-2 opacity-80 group-hover:opacity-100">
                        {notif.link && (
                          <span className="text-sky-400 flex items-center gap-0.5 hover:underline font-sans">
                            <span>Open</span>
                            <ExternalLink className="w-3 h-3" />
                          </span>
                        )}
                        <button
                          onClick={(e) => handleClearNotif(notif.id, e)}
                          className="hover:text-red-400 p-0.5 rounded transition"
                          title="Dismiss notification"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Push Notification Service Disclaimer Footer */}
        <div className="p-3 bg-slate-950 border-t border-slate-800 text-[11px] text-slate-400 flex items-center gap-2">
          <Radio className="w-4 h-4 text-sky-400 shrink-0" />
          <span>
            <strong>In-App Feed Active:</strong> Browser service-worker push notifications require Web Push API permission and remain simulated.
          </span>
        </div>
      </div>
    </div>
  );
};
