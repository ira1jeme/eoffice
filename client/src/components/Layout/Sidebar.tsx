import { NavLink } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

const linkBase =
  'flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors';

function Item({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <NavLink
      to={to}
      end
      className={({ isActive }) =>
        `${linkBase} ${isActive ? 'bg-navy-600 text-white' : 'text-navy-100/85 hover:bg-navy-600/60 hover:text-white'}`
      }
    >
      {children}
    </NavLink>
  );
}

export function Sidebar() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN';

  return (
    <aside className="flex h-screen w-60 flex-shrink-0 flex-col bg-navy-700 text-white">
      <div className="flex items-center gap-2 border-b border-white/10 px-5 py-5">
        <div className="flex h-8 w-8 items-center justify-center rounded-[4px] border border-amber-500/60 font-mono text-xs font-semibold text-amber-500">
          eO
        </div>
        <div>
          <p className="font-display text-sm font-semibold leading-tight">e-Office</p>
          <p className="text-[11px] leading-tight text-navy-100/60">Task &amp; File Registry</p>
        </div>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
        <Item to="/">Dashboard</Item>

        <p className="mt-4 px-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-navy-100/50">
          Tasks
        </p>
        <Item to="/tasks?scope=mine">My Tasks</Item>
        <Item to="/tasks?scope=createdByMe">Assigned by Me</Item>
        <Item to="/tasks?scope=subAssignedByMe">Sub-assigned</Item>
        <Item to="/tasks">All / Filter</Item>
        <Item to="/leave">Leave</Item>

        {isAdmin && (
          <>
            <p className="mt-4 px-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-navy-100/50">
              Administration
            </p>
            <Item to="/pending-monitor">Pending Monitor</Item>
            <Item to="/staff">Staff</Item>
            <Item to="/reports">Reports</Item>
            <Item to="/audit-log">Audit Log</Item>
          </>
        )}
      </nav>

      <div className="border-t border-white/10 px-4 py-3 text-[11px] text-navy-100/50">
        Phase 1 &middot; Core Task Workflow
      </div>
    </aside>
  );
}
