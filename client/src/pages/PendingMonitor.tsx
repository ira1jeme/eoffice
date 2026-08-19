import { useEffect, useState } from 'react';
import { api } from '../api/client';

interface MonitorRow {
  staff: { id: string; name: string; designation?: string | null };
  total: number;
  pending: number;
  completed: number;
  overdue: number;
  oldestPendingDays: number;
  oldestPendingBucket: string | null;
}

const BUCKET_STYLES: Record<string, string> = {
  '0-3': 'text-slate2-600',
  '4-7': 'text-navy-600',
  '8-15': 'text-amber-500',
  '16-30': 'text-danger-500',
  '30+': 'font-semibold text-danger-500',
};

export function PendingMonitor() {
  const [rows, setRows] = useState<MonitorRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/tasks/pending-monitor').then((res) => {
      setRows(res.data.monitor);
      setLoading(false);
    });
  }, []);

  return (
    <div className="card overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border2 bg-navy-50/60 text-left text-xs uppercase tracking-wide text-slate2-500">
            <th className="px-4 py-2.5 font-medium">Staff</th>
            <th className="px-4 py-2.5 font-medium">Total</th>
            <th className="px-4 py-2.5 font-medium">Pending</th>
            <th className="px-4 py-2.5 font-medium">Completed</th>
            <th className="px-4 py-2.5 font-medium">Overdue</th>
            <th className="px-4 py-2.5 font-medium">Oldest Pending</th>
          </tr>
        </thead>
        <tbody>
          {loading && <tr><td colSpan={6} className="px-4 py-8 text-center text-slate2-500">Loading…</td></tr>}
          {!loading && rows.map((r) => (
            <tr key={r.staff.id} className="border-b border-border2 last:border-0 hover:bg-navy-50/50">
              <td className="px-4 py-2.5">
                <p className="font-medium text-navy-900">{r.staff.name}</p>
                <p className="text-xs text-slate2-500">{r.staff.designation}</p>
              </td>
              <td className="px-4 py-2.5">{r.total}</td>
              <td className="px-4 py-2.5">{r.pending}</td>
              <td className="px-4 py-2.5">{r.completed}</td>
              <td className={`px-4 py-2.5 ${r.overdue > 0 ? 'font-medium text-danger-500' : ''}`}>{r.overdue}</td>
              <td className={`px-4 py-2.5 ${r.oldestPendingBucket ? BUCKET_STYLES[r.oldestPendingBucket] : ''}`}>
                {r.pending > 0 ? `${r.oldestPendingDays}d (${r.oldestPendingBucket})` : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
