import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { api } from '../api/client';
import { AuditLogItem } from '../types';

export function AuditLog() {
  const [logs, setLogs] = useState<AuditLogItem[]>([]);
  const [total, setTotal] = useState(0);
  const [action, setAction] = useState('');
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const res = await api.get('/audit-log', { params: { action: action || undefined, pageSize: 100 } });
    setLogs(res.data.logs);
    setTotal(res.data.pagination.total);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <input
          className="input w-64"
          placeholder="Filter by action (e.g. LOGIN, TASK_CREATED)…"
          value={action}
          onChange={(e) => setAction(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && load()}
        />
        <button className="btn-secondary" onClick={load}>Search</button>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border2 bg-navy-50/60 text-left text-xs uppercase tracking-wide text-slate2-500">
              <th className="px-4 py-2.5 font-medium">When</th>
              <th className="px-4 py-2.5 font-medium">User</th>
              <th className="px-4 py-2.5 font-medium">Action</th>
              <th className="px-4 py-2.5 font-medium">Entity</th>
              <th className="px-4 py-2.5 font-medium">Details</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={5} className="px-4 py-8 text-center text-slate2-500">Loading…</td></tr>}
            {!loading && logs.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-slate2-500">No matching audit entries.</td></tr>
            )}
            {logs.map((l) => (
              <tr key={l.id} className="border-b border-border2 last:border-0 hover:bg-navy-50/50">
                <td className="px-4 py-2.5 text-slate2-600">{format(new Date(l.createdAt), 'dd MMM yyyy, HH:mm')}</td>
                <td className="px-4 py-2.5 text-navy-900">{l.user?.name ?? 'System'}</td>
                <td className="px-4 py-2.5"><span className="file-stamp">{l.action}</span></td>
                <td className="px-4 py-2.5 text-slate2-600">{l.entityType ?? '—'}</td>
                <td className="px-4 py-2.5 text-slate2-600">{l.details ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate2-500">{total} entr{total === 1 ? 'y' : 'ies'} found.</p>
    </div>
  );
}
