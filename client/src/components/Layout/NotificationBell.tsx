import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { api } from '../../api/client';
import { NotificationItem } from '../../types';

export function NotificationBell() {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  async function load() {
    const res = await api.get('/notifications');
    setItems(res.data.notifications);
    setUnreadCount(res.data.unreadCount);
  }

  useEffect(() => {
    load();
    const interval = setInterval(load, 60000); // poll every minute
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  async function handleOpen(n: NotificationItem) {
    if (!n.read) {
      await api.post(`/notifications/${n.id}/read`);
      await load();
    }
    setOpen(false);
    if (n.task) navigate(`/tasks/${n.task.id}`);
    else if (n.leaveRequest) navigate('/leave');
  }

  async function markAllRead() {
    await api.post('/notifications/read-all');
    await load();
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative flex h-9 w-9 items-center justify-center rounded-md border border-border2 bg-white hover:bg-navy-50"
        aria-label="Notifications"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4.5 w-4.5 text-navy-700">
          <path d="M15 17h5l-1.4-1.4A2 2 0 0 1 18 14.2V11a6 6 0 1 0-12 0v3.2a2 2 0 0 1-.6 1.4L4 17h5" />
          <path d="M9 17a3 3 0 0 0 6 0" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-danger-500 px-1 text-[10px] font-semibold text-white">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-20 mt-2 w-80 rounded-md border border-border2 bg-white shadow-lg">
          <div className="flex items-center justify-between border-b border-border2 px-3 py-2">
            <p className="text-sm font-semibold text-navy-900">Notifications</p>
            {unreadCount > 0 && (
              <button className="text-xs font-medium text-navy-600 hover:underline" onClick={markAllRead}>
                Mark all read
              </button>
            )}
          </div>
          <ul className="max-h-96 overflow-y-auto">
            {items.length === 0 && <li className="px-3 py-6 text-center text-sm text-slate2-500">No notifications.</li>}
            {items.map((n) => (
              <li key={n.id}>
                <button
                  onClick={() => handleOpen(n)}
                  className={`w-full border-b border-border2 px-3 py-2.5 text-left last:border-0 hover:bg-navy-50/60 ${!n.read ? 'bg-navy-50/40' : ''}`}
                >
                  <p className="text-sm font-medium text-navy-900">{n.title}</p>
                  <p className="mt-0.5 text-xs text-slate2-600">{n.message}</p>
                  <p className="mt-1 text-[11px] text-slate2-500">{format(new Date(n.createdAt), 'dd MMM, HH:mm')}</p>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
