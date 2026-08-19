import { Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';

const TITLES: Record<string, string> = {
  '/': 'Dashboard',
  '/tasks': 'Tasks',
  '/tasks/new': 'Create Task',
  '/pending-monitor': 'Pending Task Monitor',
  '/staff': 'Staff Management',
  '/leave': 'Leave Management',
  '/reports': 'Reports',
  '/audit-log': 'Audit Log',
};

function titleFor(pathname: string) {
  if (pathname.startsWith('/tasks/') && pathname !== '/tasks/new') return 'Task Detail';
  return TITLES[pathname] ?? 'e-Office';
}

export function AppLayout() {
  const location = useLocation();

  return (
    <div className="flex h-screen overflow-hidden bg-bg">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar title={titleFor(location.pathname)} />
        <main className="flex-1 overflow-y-auto px-6 py-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
