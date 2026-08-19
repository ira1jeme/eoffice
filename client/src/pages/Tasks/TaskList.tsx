import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { format } from 'date-fns';
import { api } from '../../api/client';
import { TaskListItem, TaskPriority, TaskStatus } from '../../types';
import { StatusBadge } from '../../components/Tasks/StatusBadge';
import { PriorityTag } from '../../components/Tasks/PriorityTag';
import { useAuth } from '../../context/AuthContext';

const STATUSES: TaskStatus[] = [
  'NEW', 'ASSIGNED', 'ACKNOWLEDGED', 'IN_PROGRESS', 'PENDING',
  'SUBMITTED', 'UNDER_REVIEW', 'RETURNED', 'COMPLETED', 'CLOSED',
];
const PRIORITIES: TaskPriority[] = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];

export function TaskList() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const [tasks, setTasks] = useState<TaskListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState(params.get('search') ?? '');

  const scope = params.get('scope') ?? '';
  const status = params.get('status') ?? '';
  const priority = params.get('priority') ?? '';
  const isAdmin = user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN';

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const res = await api.get('/tasks', {
        params: {
          scope: scope || undefined,
          status: status || undefined,
          priority: priority || undefined,
          search: params.get('search') || undefined,
          pageSize: 50,
        },
      });
      if (cancelled) return;
      setTasks(res.data.tasks);
      setTotal(res.data.pagination.total);
      setLoading(false);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [scope, status, priority, params]);

  function updateParam(key: string, value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <input
            className="input w-56"
            placeholder="Search Task ID, subject…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && updateParam('search', search)}
          />
          <select className="input w-auto" value={status} onChange={(e) => updateParam('status', e.target.value)}>
            <option value="">All statuses</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
            ))}
          </select>
          <select className="input w-auto" value={priority} onChange={(e) => updateParam('priority', e.target.value)}>
            <option value="">All priorities</option>
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
          {scope && (
            <button className="btn-secondary" onClick={() => updateParam('scope', '')}>
              Clear scope
            </button>
          )}
        </div>
        {isAdmin && (
          <Link to="/tasks/new" className="btn-primary">
            + New Task
          </Link>
        )}
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border2 bg-navy-50/60 text-left text-xs uppercase tracking-wide text-slate2-500">
              <th className="px-4 py-2.5 font-medium">Task</th>
              <th className="px-4 py-2.5 font-medium">Assigned To</th>
              <th className="px-4 py-2.5 font-medium">Priority</th>
              <th className="px-4 py-2.5 font-medium">Due Date</th>
              <th className="px-4 py-2.5 font-medium">Status</th>
              <th className="px-4 py-2.5 font-medium">Pending</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-slate2-500">Loading…</td></tr>
            )}
            {!loading && tasks.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-slate2-500">No tasks match these filters.</td></tr>
            )}
            {tasks.map((t) => {
              const overdue = t.dueDate && new Date(t.dueDate) < new Date() && !['COMPLETED', 'CLOSED'].includes(t.status);
              return (
                <tr key={t.id} className="border-b border-border2 last:border-0 hover:bg-navy-50/50">
                  <td className="px-4 py-2.5">
                    <Link to={`/tasks/${t.id}`} className="hover:underline">
                      <span className="file-stamp mr-2">{t.fileId}</span>
                      {t.subject}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5 text-slate2-600">
                    {t.assignments[0]?.assignedTo.name ?? '—'}
                  </td>
                  <td className="px-4 py-2.5"><PriorityTag priority={t.priority} /></td>
                  <td className={`px-4 py-2.5 ${overdue ? 'font-medium text-danger-500' : 'text-slate2-600'}`}>
                    {t.dueDate ? format(new Date(t.dueDate), 'dd MMM yyyy') : '—'}
                    {overdue ? ' (overdue)' : ''}
                  </td>
                  <td className="px-4 py-2.5"><StatusBadge status={t.status} /></td>
                  <td className="px-4 py-2.5 text-slate2-600">{t.pendingDays}d</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate2-500">{total} task(s) found.</p>
    </div>
  );
}
