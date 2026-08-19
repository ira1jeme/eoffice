import { FormEvent, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, apiErrorMessage } from '../../api/client';
import { TaskPriority, UserSummary } from '../../types';

export function TaskCreate() {
  const navigate = useNavigate();
  const [staff, setStaff] = useState<UserSummary[]>([]);
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<TaskPriority>('MEDIUM');
  const [assignedToId, setAssignedToId] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [instructions, setInstructions] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api.get('/users/directory').then((res) => setStaff(res.data.users));
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!assignedToId) {
      setError('Please choose an assignee.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await api.post('/tasks', {
        subject,
        description: description || undefined,
        priority,
        assignedToId,
        instructions: instructions || undefined,
        dueDate: dueDate ? new Date(dueDate).toISOString() : undefined,
      });
      navigate(`/tasks/${res.data.task.id}`);
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not create task.'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <form onSubmit={handleSubmit} className="card space-y-4 p-6">
        {error && (
          <div className="rounded-md border-l-2 border-l-danger-500 bg-danger-50 px-3 py-2 text-sm text-danger-500">
            {error}
          </div>
        )}

        <div>
          <label className="label" htmlFor="subject">Subject</label>
          <input id="subject" required className="input" value={subject} onChange={(e) => setSubject(e.target.value)} />
        </div>

        <div>
          <label className="label" htmlFor="description">Description</label>
          <textarea id="description" rows={4} className="input" value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label" htmlFor="priority">Priority</label>
            <select id="priority" className="input" value={priority} onChange={(e) => setPriority(e.target.value as TaskPriority)}>
              <option value="CRITICAL">Critical</option>
              <option value="HIGH">High</option>
              <option value="MEDIUM">Medium</option>
              <option value="LOW">Low</option>
            </select>
          </div>
          <div>
            <label className="label" htmlFor="dueDate">Due Date</label>
            <input id="dueDate" type="date" className="input" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </div>
        </div>

        <div>
          <label className="label" htmlFor="assignee">Assign To</label>
          <select id="assignee" required className="input" value={assignedToId} onChange={(e) => setAssignedToId(e.target.value)}>
            <option value="">Select staff member…</option>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}{s.designation ? ` — ${s.designation}` : ''}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="label" htmlFor="instructions">Instructions</label>
          <textarea id="instructions" rows={2} className="input" value={instructions} onChange={(e) => setInstructions(e.target.value)} />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="btn-secondary" onClick={() => navigate(-1)}>Cancel</button>
          <button type="submit" disabled={submitting} className="btn-primary">
            {submitting ? 'Creating…' : 'Create Task'}
          </button>
        </div>
      </form>
    </div>
  );
}
