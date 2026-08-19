import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { api } from '../api/client';
import { DashboardStats, TaskListItem, TaskMovement } from '../types';
import { StatCard } from '../components/Dashboard/StatCard';
import { StatusBadge } from '../components/Tasks/StatusBadge';
import { PriorityTag } from '../components/Tasks/PriorityTag';
import { useAuth } from '../context/AuthContext';

// ✅ FIX: Extend TaskMovement type to include task
type TaskMovementWithTask = TaskMovement & {
  task: {
    fileId: string;
    subject?: string;
  };
};

export function Dashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [myTasks, setMyTasks] = useState<TaskListItem[]>([]);
  const [movements, setMovements] = useState<TaskMovementWithTask[]>([]); // ✅ updated type
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      const [statsRes, tasksRes, movementsRes] = await Promise.all([
        api.get('/dashboard'),
        api.get('/tasks', { params: { scope: 'mine', pageSize: 8 } }),
        api.get('/dashboard/recent-movements'),
      ]);

      if (cancelled) return;

      setStats(statsRes.data.stats);
      setMyTasks(tasksRes.data.tasks);
      setMovements(movementsRes.data.movements);
      setLoading(false);
    }

    load();

    return () => {
      cancelled = true;
    };
  }, []);

  if (loading || !stats) {
    return <p className="text-sm text-slate2-500">Loading dashboard…</p>;
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard label="Total Tasks" value={stats.totalTasks} />
        <StatCard label="Pending" value={stats.pendingTasks} tone="amber" />
        <StatCard label="Completed" value={stats.completedTasks} tone="success" />
        <StatCard label="Overdue" value={stats.overdueTasks} tone="danger" />
        <StatCard label="Awaiting Approval" value={stats.awaitingApproval} tone="amber" />
        <StatCard label="Due Today" value={stats.dueToday} />
        <StatCard label="Due This Week" value={stats.dueThisWeek} />
        <StatCard label="Assigned to Me" value={stats.assignedToMe} />
        <StatCard label="Sub-assigned by Me" value={stats.subAssignedByMe} />
        <StatCard label="Active Staff" value={stats.totalStaff} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="card lg:col-span-2">
          <div className="flex items-center justify-between border-b border-border2 px-4 py-3">
            <h2 className="font-display text-sm font-semibold text-navy-900">My Tasks</h2>
            <Link to="/tasks?scope=mine" className="text-xs font-medium text-navy-600 hover:underline">
              View all
            </Link>
          </div>

          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border2 text-left text-xs uppercase tracking-wide text-slate2-500">
                <th className="px-4 py-2 font-medium">Task</th>
                <th className="px-4 py-2 font-medium">Priority</th>
                <th className="px-4 py-2 font-medium">Due</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">Pending</th>
              </tr>
            </thead>

            <tbody>
              {myTasks.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-slate2-500">
                    No tasks assigned to you right now.
                  </td>
                </tr>
              )}

              {myTasks.map((t) => (
                <tr key={t.id} className="border-b border-border2 last:border-0 hover:bg-navy-50/50">
                  <td className="px-4 py-2.5">
                    <Link to={`/tasks/${t.id}`} className="hover:underline">
                      <span className="file-stamp mr-2">{t.fileId}</span>
                      {t.subject}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5">
                    <PriorityTag priority={t.priority} />
                  </td>
                  <td className="px-4 py-2.5 text-slate2-600">
                    {t.dueDate ? format(new Date(t.dueDate), 'dd MMM yyyy') : '—'}
                  </td>
                  <td className="px-4 py-2.5">
                    <StatusBadge status={t.status} />
                  </td>
                  <td className="px-4 py-2.5 text-slate2-600">{t.pendingDays}d</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="card">
          <div className="border-b border-border2 px-4 py-3">
            <h2 className="font-display text-sm font-semibold text-navy-900">Recent Movement</h2>
          </div>

          <ul className="divide-y divide-border2">
            {movements.length === 0 && (
              <li className="px-4 py-6 text-center text-sm text-slate2-500">
                No activity yet.
              </li>
            )}

            {movements.map((m) => (
              <li key={m.id} className="px-4 py-3 text-sm">
                <p className="text-navy-900">
                  <span className="font-medium">{m.actor.name}</span> —{' '}
                  {m.action.replace(/_/g, ' ').toLowerCase()}
                </p>

                <p className="text-xs text-slate2-500">
                  <span className="file-stamp mr-1 py-0">
                    {m.task?.fileId}
                  </span>
                  {format(new Date(m.createdAt), 'dd MMM, HH:mm')}
                </p>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}