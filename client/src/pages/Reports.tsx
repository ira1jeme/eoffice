import { useState } from 'react';
import { api } from '../api/client';

const REPORTS = [
  { key: 'tasks', label: 'Task Report', desc: 'Every task with status, priority, assignee, and dates.' },
  { key: 'staff', label: 'Staff-wise Report', desc: 'Assigned / completed / pending / overdue counts per staff member.' },
  { key: 'time-based', label: 'Time-based Report', desc: 'Tasks created and completed per day within a date range.' },
  { key: 'leave', label: 'Leave Report', desc: 'All leave requests with type, dates, and approval status.' },
];

const FORMATS: { key: 'csv' | 'xlsx' | 'pdf'; label: string }[] = [
  { key: 'csv', label: 'CSV' },
  { key: 'xlsx', label: 'Excel' },
  { key: 'pdf', label: 'PDF' },
];

export function Reports() {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [downloading, setDownloading] = useState<string | null>(null);

  async function download(reportKey: string, format: string) {
    const id = `${reportKey}-${format}`;
    setDownloading(id);
    try {
      const res = await api.get(`/reports/${reportKey}`, {
        params: {
          format,
          from: from ? new Date(from).toISOString() : undefined,
          to: to ? new Date(to).toISOString() : undefined,
        },
        responseType: 'blob',
      });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${reportKey}-report.${format}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } finally {
      setDownloading(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="card flex flex-wrap items-end gap-3 p-4">
        <div>
          <label className="label">From</label>
          <input type="date" className="input" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div>
          <label className="label">To</label>
          <input type="date" className="input" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <p className="pb-2 text-xs text-slate2-500">Leave blank to include all records. Applies to Task, Time-based, and Leave reports.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {REPORTS.map((r) => (
          <div key={r.key} className="card p-5">
            <h3 className="font-display text-sm font-semibold text-navy-900">{r.label}</h3>
            <p className="mt-1 text-sm text-slate2-600">{r.desc}</p>
            <div className="mt-4 flex gap-2">
              {FORMATS.map((f) => {
                const id = `${r.key}-${f.key}`;
                return (
                  <button
                    key={f.key}
                    disabled={downloading === id}
                    onClick={() => download(r.key, f.key)}
                    className="btn-secondary"
                  >
                    {downloading === id ? 'Preparing…' : `Export ${f.label}`}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
