import { FormEvent, useEffect, useState } from 'react';
import { format } from 'date-fns';
import { api, apiErrorMessage } from '../api/client';
import { LeaveRequestItem, LeaveType } from '../types';
import { useAuth } from '../context/AuthContext';

const STATUS_STYLES: Record<string, string> = {
  APPLIED: 'text-slate2-600',
  PENDING_APPROVAL: 'text-amber-500',
  APPROVED: 'text-success-500',
  REJECTED: 'text-danger-500',
  CANCELLED: 'text-slate2-500',
};

export function Leave() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN';
  const [scope, setScope] = useState<'mine' | 'all'>('mine');
  const [leaves, setLeaves] = useState<LeaveRequestItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [leaveType, setLeaveType] = useState<LeaveType>('CASUAL');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [reason, setReason] = useState('');

  async function load() {
    setLoading(true);
    const res = await api.get('/leaves', { params: { scope } });
    setLeaves(res.data.leaves);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope]);

  async function handleApply(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await api.post('/leaves', {
        leaveType,
        fromDate: new Date(fromDate).toISOString(),
        toDate: new Date(toDate).toISOString(),
        reason,
      });
      setLeaveType('CASUAL'); setFromDate(''); setToDate(''); setReason('');
      setShowForm(false);
      await load();
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not submit leave request.'));
    } finally {
      setBusy(false);
    }
  }

  async function review(id: string, action: 'approve' | 'reject') {
    const remarks = window.prompt(`Remarks for this ${action === 'approve' ? 'approval' : 'rejection'} (optional):`) ?? undefined;
    setBusy(true);
    try {
      await api.post(`/leaves/${id}/${action}`, { remarks });
      await load();
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not update leave request.'));
    } finally {
      setBusy(false);
    }
  }

  async function cancel(id: string) {
    setBusy(true);
    try {
      await api.post(`/leaves/${id}/cancel`);
      await load();
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not cancel leave request.'));
    } finally {
      setBusy(false);
    }
  }

  async function uploadDoc(leaveId: string, file: File) {
    setBusy(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      await api.post(`/attachments/leaves/${leaveId}`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      await load();
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not upload document.'));
    } finally {
      setBusy(false);
    }
  }

  async function downloadDoc(attachmentId: string, fileName: string) {
    const res = await api.get(`/attachments/${attachmentId}/download`, { responseType: 'blob' });
    const url = URL.createObjectURL(res.data);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">
          <button className={scope === 'mine' ? 'btn-primary' : 'btn-secondary'} onClick={() => setScope('mine')}>
            My Requests
          </button>
          {isAdmin && (
            <button className={scope === 'all' ? 'btn-primary' : 'btn-secondary'} onClick={() => setScope('all')}>
              All Staff
            </button>
          )}
        </div>
        <button className="btn-primary" onClick={() => setShowForm((v) => !v)}>
          {showForm ? 'Cancel' : '+ Apply for Leave'}
        </button>
      </div>

      {error && (
        <div className="rounded-md border-l-2 border-l-danger-500 bg-danger-50 px-3 py-2 text-sm text-danger-500">
          {error}
        </div>
      )}

      {showForm && (
        <form onSubmit={handleApply} className="card grid grid-cols-1 gap-3 p-5 sm:grid-cols-2">
          <div>
            <label className="label">Leave Type</label>
            <select className="input" value={leaveType} onChange={(e) => setLeaveType(e.target.value as LeaveType)}>
              <option value="CASUAL">Casual</option>
              <option value="SICK">Sick</option>
              <option value="EARNED">Earned</option>
              <option value="UNPAID">Unpaid</option>
              <option value="OTHER">Other</option>
            </select>
          </div>
          <div />
          <div>
            <label className="label">From Date</label>
            <input required type="date" className="input" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
          </div>
          <div>
            <label className="label">To Date</label>
            <input required type="date" className="input" value={toDate} onChange={(e) => setToDate(e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <label className="label">Reason</label>
            <textarea required rows={3} className="input" value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
          <div className="sm:col-span-2 flex justify-end">
            <button type="submit" disabled={busy} className="btn-primary">
              {busy ? 'Submitting…' : 'Submit Request'}
            </button>
          </div>
        </form>
      )}

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border2 bg-navy-50/60 text-left text-xs uppercase tracking-wide text-slate2-500">
              {scope === 'all' && <th className="px-4 py-2.5 font-medium">Staff</th>}
              <th className="px-4 py-2.5 font-medium">Type</th>
              <th className="px-4 py-2.5 font-medium">From</th>
              <th className="px-4 py-2.5 font-medium">To</th>
              <th className="px-4 py-2.5 font-medium">Days</th>
              <th className="px-4 py-2.5 font-medium">Status</th>
              <th className="px-4 py-2.5 font-medium">Reason</th>
              <th className="px-4 py-2.5 font-medium">Docs</th>
              <th className="px-4 py-2.5 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={9} className="px-4 py-8 text-center text-slate2-500">Loading…</td></tr>
            )}
            {!loading && leaves.length === 0 && (
              <tr><td colSpan={9} className="px-4 py-8 text-center text-slate2-500">No leave requests.</td></tr>
            )}
            {leaves.map((l) => (
              <tr key={l.id} className="border-b border-border2 last:border-0 hover:bg-navy-50/50">
                {scope === 'all' && <td className="px-4 py-2.5 font-medium text-navy-900">{l.user.name}</td>}
                <td className="px-4 py-2.5">{l.leaveType}</td>
                <td className="px-4 py-2.5 text-slate2-600">{format(new Date(l.fromDate), 'dd MMM yyyy')}</td>
                <td className="px-4 py-2.5 text-slate2-600">{format(new Date(l.toDate), 'dd MMM yyyy')}</td>
                <td className="px-4 py-2.5">{l.days}</td>
                <td className={`px-4 py-2.5 font-medium ${STATUS_STYLES[l.status]}`}>{l.status.replace('_', ' ')}</td>
                <td className="px-4 py-2.5 max-w-xs truncate text-slate2-600" title={l.reason}>{l.reason}</td>
                <td className="px-4 py-2.5">
                  <div className="flex flex-col gap-1">
                    {l.attachments.map((a) => (
                      <button key={a.id} onClick={() => downloadDoc(a.id, a.fileName)} className="max-w-[100px] truncate text-left text-xs text-navy-600 hover:underline" title={a.fileName}>
                        {a.fileName}
                      </button>
                    ))}
                    {l.user.id === user?.id && (
                      <label className="cursor-pointer text-xs text-slate2-500 hover:underline">
                        + Attach
                        <input
                          type="file"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) uploadDoc(l.id, file);
                            e.target.value = '';
                          }}
                        />
                      </label>
                    )}
                  </div>
                </td>
                <td className="px-4 py-2.5 whitespace-nowrap">
                  {isAdmin && l.status === 'PENDING_APPROVAL' && (
                    <div className="flex gap-2">
                      <button disabled={busy} className="text-xs font-medium text-success-500 hover:underline" onClick={() => review(l.id, 'approve')}>Approve</button>
                      <button disabled={busy} className="text-xs font-medium text-danger-500 hover:underline" onClick={() => review(l.id, 'reject')}>Reject</button>
                    </div>
                  )}
                  {!isAdmin && l.status === 'PENDING_APPROVAL' && (
                    <button disabled={busy} className="text-xs font-medium text-slate2-600 hover:underline" onClick={() => cancel(l.id)}>Cancel</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
