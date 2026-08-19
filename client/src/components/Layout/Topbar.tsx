import { useAuth } from '../../context/AuthContext';
import { NotificationBell } from './NotificationBell';

export function Topbar({ title }: { title: string }) {
  const { user, logout } = useAuth();

  return (
    <header className="flex h-16 flex-shrink-0 items-center justify-between border-b border-border2 bg-white px-6">
      <h1 className="font-display text-lg font-semibold text-navy-900">{title}</h1>

      <div className="flex items-center gap-4">
        <NotificationBell />
        <div className="text-right">
          <p className="text-sm font-medium text-navy-900">{user?.name}</p>
          <p className="text-xs text-slate2-500">{user?.designation || user?.role}</p>
        </div>
        <button
          onClick={logout}
          className="btn-secondary"
          aria-label="Log out"
        >
          Log out
        </button>
      </div>
    </header>
  );
}
