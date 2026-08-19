import { FormEvent, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { format } from 'date-fns';
import { api, apiErrorMessage } from '../../api/client';
import { TaskDetail as TaskDetailType, TaskStatus, UserSummary } from '../../types';
import { StatusBadge } from '../../components/Tasks/StatusBadge';
import { PriorityTag } from '../../components/Tasks/PriorityTag';
import { MovementTimeline } from '../../components/Tasks/MovementTimeline';
import { useAuth } from '../../context/AuthContext';

const NEXT_STEPS: Partial<Record<TaskStatus, { status: TaskStatus; label: string; adminOnly?: boolean }[]>> = {
  ASSIGNED: [{ status: 'ACKNOWLEDGED', label: 'Acknowledge' }],
  ACKNOWLEDGED: [{ status: 'IN_PROGRESS', label: 'Start Progress' }],
  IN_PROGRESS: [
    { status: 'PENDING', label: 'Mark Pending' },
    { status: 'SUBMITTED', label: 'Submit for Review' },
  ],
  PENDING: [
    { status: 'IN_PROGRESS', label: 'Resume Progress' },
    { status: 'SUBMITTED', label: 'Submit for Review' },
  ],
  SUBMITTED: [{ status: 'UNDER_REVIEW', label: 'Move to Under Review' }],
  UNDER_REVIEW: [
    { status: 'COMPLETED', label: 'Approve & Complete', adminOnly: true },
    { status: 'RETURNED', label: 'Return for Correction', adminOnly: true },
  ],
  RETURNED: [{ status: 'IN_PROGRESS', label: 'Resume Progress' }],
  COMPLETED: [{ status: 'CLOSED', label: 'Close Task', adminOnly: true }],
};

export function TaskDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const [task, setTask] = useState<TaskDetailType | null>(null);
  const [staff, setStaff] = useState<UserSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [remarks, setRemarks] = useState('');
  const [comment, setComment] = useState('');
  const [subAssignTo, setSubAssignTo] = useState('');
  const [subAssignNote, setSubAssignNote] = useState('');
  const [showSubAssign, setShowSubAssign] = useState(false);
  const [uploading, setUploading] = useState(false);

  const isAdmin = user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN';

  async function load() {
    if (!id) return;
    const res = await api.get(`/tasks/${id}`);
    setTask(res.data.task);
  }

  useEffect(() => {
    load();
    api.get('/users/directory').then((res) => setStaff(res.data.users));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (!task) return <p className="text-sm text-slate2-500">Loading task…</p>;

  const activeAssignments = task.assignments.filter((a) => a.active);
  const isCurrentAssignee = activeAssignments.some((a) => a.assignedTo.id === user?.id);
  const canSubAssign = isAdmin || (isCurrentAssignee && user?.canSubAssign);
  const nextSteps = (NEXT_STEPS[task.status] ?? []).filter((s) => isAdmin || !s.adminOnly);

  async function runStatusChange(status: TaskStatus) {
    setBusy(true);
    setError(null);
    try {
      await api.post(`/tasks/${id}/status`, { status, remarks: remarks || undefined });
      setRemarks('');
      await load();
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not update status.'));
    } finally {
      setBusy(false);
    }
  }

  async function submitComment(e: FormEvent) {
    e.preventDefault();
    if (!comment.trim()) return;
    setBusy(true);
    try {
      await api.post(`/tasks/${id}/comments`, { message: comment });
      setComment('');
      await load();
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not add remark.'));
    } finally {
      setBusy(false);
    }
  }

  async function submitSubAssign(e: FormEvent) {
    e.preventDefault();
    if (!subAssignTo) return;
    setBusy(true);
    setError(null);
    try {
      await api.post(`/tasks/${id}/sub-assign`, {
        assignedToId: subAssignTo,
        instructions: subAssignNote || undefined,
      });
      setSubAssignTo('');
      setSubAssignNote('');
      setShowSubAssign(false);
      await load();
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not sub-assign task.'));
    } finally {
      setBusy(false);
    }
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      await api.post(`/attachments/tasks/${id}`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      await load();
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not upload file.'));
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  }

  async function downloadAttachment(attachmentId: string, fileName: string) {
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
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <div className="space-y-6 lg:col-span-2">
        <div className="card p-5">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className="file-stamp">{task.fileId}</span>
            <StatusBadge status={task.status} />
            <PriorityTag priority={task.priority} />
          </div>
          <h2 className="font-display text-xl font-semibold text-navy-900">{task.subject}</h2>
          {task.description && <p className="mt-2 text-sm text-navy-700">{task.description}</p>}

          <div className="mt-4 grid grid-cols-2 gap-4 border-t border-border2 pt-4 text-sm sm:grid-cols-4">
            <div>
              <p className="label mb-0.5">Created By</p>
              <p className="text-navy-900">{task.createdBy.name}</p>
            </div>
            <div>
              <p className="label mb-0.5">Due Date</p>
              <p className="text-navy-900">{task.dueDate ? format(new Date(task.dueDate), 'dd MMM yyyy') : '—'}</p>
            </div>
            <div>
              <p className="label mb-0.5">Pending Days</p>
              <p className="text-navy-900">{task.pendingDays}d</p>
            </div>
            <div>
              <p className="label mb-0.5">Completion Date</p>
              <p className="text-navy-900">{task.completionDate ? format(new Date(task.completionDate), 'dd MMM yyyy') : '—'}</p>
            </div>
          </div>

          {task.parentTask && (
            <p className="mt-3 text-sm text-slate2-600">
              Parent task: <Link to={`/tasks/${task.parentTask.id}`} className="file-stamp">{task.parentTask.fileId}</Link>
            </p>
          )}
          {task.subTasks.length > 0 && (
            <div className="mt-3">
              <p className="label mb-1">Sub-tasks</p>
              <div className="flex flex-wrap gap-2">
                {task.subTasks.map((st) => (
                  <Link key={st.id} to={`/tasks/${st.id}`} className="file-stamp">
                    {st.fileId} · {st.status}
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="card p-5">
          <h3 className="mb-3 font-display text-sm font-semibold text-navy-900">Task Movement</h3>
          <MovementTimeline movements={task.movements} />
        </div>

        <div className="card p-5">
          <h3 className="mb-3 font-display text-sm font-semibold text-navy-900">Remarks &amp; Comments</h3>
          <ul className="mb-4 space-y-3">
            {task.comments.length === 0 && <p className="text-sm text-slate2-500">No remarks yet.</p>}
            {task.comments.map((c) => (
              <li key={c.id} className="rounded-md bg-navy-50/60 p-3 text-sm">
                <p className="mb-0.5 text-xs font-medium text-navy-700">
                  {c.user.name} &middot; {format(new Date(c.createdAt), 'dd MMM yyyy, HH:mm')}
                </p>
                <p className="text-navy-900">{c.message}</p>
              </li>
            ))}
          </ul>
          <form onSubmit={submitComment} className="flex gap-2">
            <input
              className="input"
              placeholder="Add a remark or instruction…"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
            />
            <button type="submit" disabled={busy} className="btn-secondary">Add</button>
          </form>
        </div>
      </div>

      <div className="space-y-6">
        {error && (
          <div className="rounded-md border-l-2 border-l-danger-500 bg-danger-50 px-3 py-2 text-sm text-danger-500">
            {error}
          </div>
        )}

        <div className="card p-5">
          <h3 className="mb-3 font-display text-sm font-semibold text-navy-900">Current Assignment</h3>
          {activeAssignments.length === 0 && <p className="text-sm text-slate2-500">Unassigned.</p>}
          <ul className="space-y-3">
            {activeAssignments.map((a) => (
              <li key={a.id} className="text-sm">
                <p className="font-medium text-navy-900">
                  {a.assignedTo.name} {a.isSubAssignment && <span className="text-xs text-amber-500">(sub-assigned)</span>}
                </p>
                <p className="text-xs text-slate2-500">by {a.assignedBy.name} &middot; {format(new Date(a.createdAt), 'dd MMM yyyy')}</p>
                {a.instructions && <p className="mt-1 text-navy-700">{a.instructions}</p>}
              </li>
            ))}
          </ul>
        </div>

        <div className="card p-5">
          <h3 className="mb-3 font-display text-sm font-semibold text-navy-900">Documents</h3>
          <ul className="mb-3 space-y-2">
            {task.attachments.length === 0 && <p className="text-sm text-slate2-500">No attachments yet.</p>}
            {task.attachments.map((a) => (
              <li key={a.id} className="flex items-center justify-between text-sm">
                <div className="min-w-0">
                  <button
                    onClick={() => downloadAttachment(a.id, a.fileName)}
                    className="truncate text-navy-700 hover:underline"
                    title={a.fileName}
                  >
                    {a.fileName}
                  </button>
                  <p className="text-xs text-slate2-500">
                    {a.uploadedBy?.name} &middot; {(a.fileSize / 1024).toFixed(0)} KB
                  </p>
                </div>
              </li>
            ))}
          </ul>
          <label className="btn-secondary w-full cursor-pointer text-center">
            {uploading ? 'Uploading…' : 'Upload Document'}
            <input type="file" className="hidden" onChange={handleFileUpload} disabled={uploading} />
          </label>
        </div>

        {nextSteps.length > 0 && (
          <div className="card p-5">
            <h3 className="mb-3 font-display text-sm font-semibold text-navy-900">Actions</h3>
            <textarea
              className="input mb-2"
              placeholder="Remarks (optional)"
              rows={2}
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
            />
            <div className="flex flex-wrap gap-2">
              {nextSteps.map((s) => (
                <button
                  key={s.status}
                  disabled={busy}
                  onClick={() => runStatusChange(s.status)}
                  className={s.status === 'RETURNED' ? 'btn-danger' : 'btn-primary'}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {canSubAssign && (
          <div className="card p-5">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-display text-sm font-semibold text-navy-900">Sub-assign</h3>
              <button className="text-xs font-medium text-navy-600 hover:underline" onClick={() => setShowSubAssign((v) => !v)}>
                {showSubAssign ? 'Cancel' : 'Sub-assign task'}
              </button>
            </div>
            {showSubAssign && (
              <form onSubmit={submitSubAssign} className="space-y-2">
                <select className="input" required value={subAssignTo} onChange={(e) => setSubAssignTo(e.target.value)}>
                  <option value="">Select staff…</option>
                  {staff.filter((s) => s.id !== user?.id).map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
                <textarea
                  className="input"
                  placeholder="Instructions"
                  rows={2}
                  value={subAssignNote}
                  onChange={(e) => setSubAssignNote(e.target.value)}
                />
                <button type="submit" disabled={busy} className="btn-primary w-full">Sub-assign</button>
              </form>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
