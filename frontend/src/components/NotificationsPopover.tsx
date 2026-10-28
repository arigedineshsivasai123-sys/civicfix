import React, { useState, useEffect, useRef } from 'react';
import {
  Bell,
  CheckCheck,
  Clock,
  FileText,
  AlertTriangle,
  Info,
  CheckCircle2,
  ExternalLink,
  Filter
} from 'lucide-react';
import { NotificationItem } from '../types';
import { api } from '../api/client';

interface NotificationsPopoverProps {
  onSelectGrievance: (caseId: string) => void;
  onNotificationMessage?: (title: string, message: string) => void;
}

export const NotificationsPopover: React.FC<NotificationsPopoverProps> = ({
  onSelectGrievance,
  onNotificationMessage,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [filterMode, setFilterMode] = useState<'all' | 'unread'>('all');
  const [isLoading, setIsLoading] = useState(false);
  const [isMarkingAll, setIsMarkingAll] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);

  // Fetch notifications from server
  const fetchNotifications = async (mode: 'all' | 'unread' = filterMode) => {
    try {
      const res = await api.getNotifications(mode);
      setNotifications(res.notifications || []);
      setUnreadCount(res.unread_count || 0);
    } catch {
      // Ignored if unauthenticated
    }
  };

  // Poll for new notifications periodically
  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(() => {
      fetchNotifications();
    }, 15000);
    return () => clearInterval(interval);
  }, [filterMode]);

  // Handle clicking outside to close
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  // Mark all notifications as read
  const handleMarkAllRead = async () => {
    try {
      setIsMarkingAll(true);
      await api.markAllNotificationsRead();
      setUnreadCount(0);
      setNotifications(prev =>
        prev.map(n => ({ ...n, is_read: 1, read_at: new Date().toISOString() }))
      );
      if (filterMode === 'unread') {
        setNotifications([]);
      }
    } catch (err: any) {
      console.error('Failed to mark all notifications as read:', err);
    } finally {
      setIsMarkingAll(false);
    }
  };

  // Select individual notification
  const handleSelectNotification = async (item: NotificationItem) => {
    // 1. Mark as read on backend if unread
    if (!item.is_read) {
      try {
        await api.markSingleNotificationRead(item.id);
        setUnreadCount(prev => Math.max(0, prev - 1));
        setNotifications(prev =>
          prev.map(n => (n.id === item.id ? { ...n, is_read: 1, read_at: new Date().toISOString() } : n))
        );
      } catch (err) {
        console.error('Failed to mark notification read:', err);
      }
    }

    // 2. Close the dropdown immediately
    setIsOpen(false);

    // 3. Open target grievance or display message
    const targetCaseId = item.related_grievance_id || item.case_id;
    if (targetCaseId && targetCaseId.trim()) {
      onSelectGrievance(targetCaseId.trim());
    } else if (onNotificationMessage) {
      onNotificationMessage(item.title, item.message);
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'urgent':
        return <AlertTriangle className="w-3.5 h-3.5 text-rose-400 shrink-0" />;
      case 'success':
        return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />;
      case 'warning':
        return <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />;
      default:
        return <Info className="w-3.5 h-3.5 text-cyan-400 shrink-0" />;
    }
  };

  const displayedNotifications = filterMode === 'unread'
    ? notifications.filter(n => !n.is_read)
    : notifications;

  return (
    <div className="relative" ref={containerRef}>
      {/* Bell Trigger Button */}
      <button
        onClick={() => {
          const next = !isOpen;
          setIsOpen(next);
          if (next) {
            fetchNotifications();
          }
        }}
        aria-expanded={isOpen}
        aria-haspopup="true"
        aria-label="In-App Notifications"
        className={`relative p-2 rounded-xl border transition-all ${
          isOpen
            ? 'bg-slate-800 text-cyan-400 border-cyan-500/50 shadow-md shadow-cyan-950/50'
            : 'text-slate-400 hover:text-white bg-slate-900 border-slate-800 hover:border-slate-700'
        }`}
      >
        <Bell className="w-4 h-4" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center animate-pulse shadow-md shadow-rose-950">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Popover Dropdown */}
      {isOpen && (
        <div
          role="region"
          aria-label="Notifications Dropdown"
          className="fixed left-3 right-3 sm:left-auto sm:right-0 top-18 sm:top-auto sm:mt-2.5 sm:w-96 max-w-sm sm:max-w-none mx-auto sm:mx-0 glass-dropdown rounded-2xl p-3 z-50 text-left border border-white/10 shadow-2xl animate-in fade-in zoom-in-95 duration-150"
        >
          {/* Header */}
          <div className="flex items-center justify-between pb-2.5 mb-2 border-b border-white/10">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-100 flex items-center gap-1.5">
                Notifications
              </span>
              {unreadCount > 0 && (
                <span className="text-[10px] font-bold px-1.5 py-0.2 rounded-full bg-rose-950 text-rose-300 border border-rose-800/60 font-mono">
                  {unreadCount} unread
                </span>
              )}
            </div>

            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                disabled={isMarkingAll}
                className="text-[11px] font-semibold text-cyan-400 hover:text-cyan-300 transition-colors flex items-center gap-1 disabled:opacity-50"
                title="Mark all notifications as read"
              >
                <CheckCheck className="w-3.5 h-3.5" />
                <span>Mark all read</span>
              </button>
            )}
          </div>

          {/* Filter Tabs: All vs Unread */}
          <div className="flex items-center gap-1.5 mb-2.5 bg-slate-900/60 p-1 rounded-lg border border-white/5 text-[11px]">
            <button
              onClick={() => {
                setFilterMode('all');
                fetchNotifications('all');
              }}
              className={`flex-1 py-1 rounded font-semibold text-center transition-colors ${
                filterMode === 'all'
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              All ({notifications.length})
            </button>
            <button
              onClick={() => {
                setFilterMode('unread');
                fetchNotifications('unread');
              }}
              className={`flex-1 py-1 rounded font-semibold text-center transition-colors ${
                filterMode === 'unread'
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Unread ({unreadCount})
            </button>
          </div>

          {/* Notifications Scroll List */}
          <div className="max-h-80 overflow-y-auto space-y-1.5 pr-0.5">
            {displayedNotifications.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-500 space-y-1">
                <FileText className="w-6 h-6 text-slate-600 mx-auto" />
                <p className="font-medium text-slate-400">
                  {filterMode === 'unread' ? 'No unread notifications' : 'No notifications in registry'}
                </p>
                <p className="text-[10px] text-slate-500">
                  {filterMode === 'unread' ? 'You are completely caught up.' : 'Activity alerts will appear here.'}
                </p>
              </div>
            ) : (
              displayedNotifications.map(n => {
                const isUnread = !n.is_read;
                const hasTarget = !!(n.related_grievance_id || n.case_id);

                return (
                  <div
                    key={n.id}
                    onClick={() => handleSelectNotification(n)}
                    className={`relative p-3 rounded-xl text-xs transition-all cursor-pointer border select-none group ${
                      isUnread
                        ? 'bg-gradient-to-r from-slate-900/90 to-cyan-950/30 border-cyan-500/30 hover:border-cyan-400 hover:bg-slate-900 shadow-sm'
                        : 'bg-slate-900/40 border-white/5 text-slate-400 hover:bg-slate-900/70 hover:text-slate-200'
                    }`}
                  >
                    {/* Unread Accent Pill */}
                    {isUnread && (
                      <span className="absolute left-1.5 top-1/2 -translate-y-1/2 w-1.5 h-6 rounded-full bg-cyan-400 shadow-[0_0_8px_rgba(6,182,212,0.8)]" />
                    )}

                    <div className="pl-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 truncate">
                          {getTypeIcon(n.type)}
                          <span className={`font-semibold truncate ${isUnread ? 'text-slate-100 font-bold' : 'text-slate-300'}`}>
                            {n.title}
                          </span>
                        </div>

                        {/* Case ID badge if present */}
                        {(n.related_grievance_id || n.case_id) && (
                          <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-cyan-300 border border-slate-700 shrink-0">
                            {n.related_grievance_id || n.case_id}
                          </span>
                        )}
                      </div>

                      <p className={`text-[11px] mt-1 line-clamp-2 leading-relaxed ${isUnread ? 'text-slate-200' : 'text-slate-400'}`}>
                        {n.message}
                      </p>

                      <div className="flex items-center justify-between pt-1.5 mt-1 border-t border-white/5 text-[10px] text-slate-500 font-mono">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3 text-slate-600" />
                          {n.created_at}
                        </span>

                        {hasTarget && (
                          <span className="text-cyan-400 font-medium group-hover:underline flex items-center gap-1">
                            <span>Open Case</span>
                            <ExternalLink className="w-2.5 h-2.5" />
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};
