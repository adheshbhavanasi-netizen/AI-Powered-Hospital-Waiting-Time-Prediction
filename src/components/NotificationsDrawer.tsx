import { Bell, Check, X } from 'lucide-react';
import type { NotificationItem, User } from '../shared/types.ts';

interface NotificationsDrawerProps {
  open: boolean;
  onClose: () => void;
  notifications: NotificationItem[];
  user: User | null;
  onMarkAllRead: () => void;
}

export function NotificationsDrawer({
  open,
  onClose,
  notifications,
  user,
  onMarkAllRead,
}: NotificationsDrawerProps) {
  if (!open) return null;

  const visible = notifications.filter((n) => {
    if (!n.roleTarget || n.roleTarget === 'all') return true;
    if (n.userId && user && n.userId === user.id) return true;
    if (!n.userId && user && n.roleTarget === user.role) return true;
    return user?.role === 'admin' || user?.role === 'receptionist';
  });

  const severityLabel: Record<NotificationItem['severity'], { text: string; cls: string }> = {
    critical: { text: 'Emergency Alert', cls: 'text-red-700 font-semibold' },
    warning: { text: 'Delay Update', cls: 'text-amber-700 font-semibold' },
    success: { text: 'Queue Update', cls: 'text-emerald-700 font-medium' },
    info: { text: 'Notification', cls: 'text-slate-600 font-medium' },
  };

  const channelLabel: Record<NotificationItem['channel'], string> = {
    in_app: 'In-App',
    sms_alert: 'SMS Alert',
    email_alert: 'Email Alert',
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/30">
      <div className="w-full max-w-md bg-white h-full border-l border-slate-200 flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div className="flex items-center gap-2.5">
            <Bell className="w-4 h-4 text-slate-700" />
            <h2 className="text-base font-semibold text-slate-900">Notifications</h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onMarkAllRead}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-teal-700 hover:bg-teal-50 rounded-md transition-colors whitespace-nowrap"
            >
              <Check className="w-3.5 h-3.5" />
              Mark read
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close notifications"
              className="p-2 text-slate-500 hover:text-slate-900 rounded-lg hover:bg-slate-100"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
          {visible.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-sm font-medium text-slate-900">All caught up</p>
              <p className="text-xs text-slate-500 mt-1">
                Queue updates, approaching-turn alerts, and schedule changes will appear here.
              </p>
            </div>
          ) : (
            visible.map((item) => {
              const sev = severityLabel[item.severity];
              return (
                <div
                  key={item.id}
                  className={`px-6 py-4 ${item.read ? 'bg-white' : 'bg-teal-50/30'}`}
                >
                  <div className="flex items-center justify-between gap-2 text-xs mb-1">
                    <span className={sev.cls}>{sev.text}</span>
                    <span className="text-slate-400 tabular-nums">
                      {channelLabel[item.channel]} ·{' '}
                      {new Date(item.createdAt).toLocaleTimeString('en-US', {
                        hour: 'numeric',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                  <p className="text-sm font-semibold text-slate-900">{item.title}</p>
                  <p className="text-xs text-slate-600 mt-1 leading-relaxed">{item.message}</p>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
