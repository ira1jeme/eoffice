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

  // NEW: selected attachments
  const [files, setFiles] = useState<File[]>([]);

  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api
      .get('/users/directory')
      .then((res) => setStaff(res.data.users))
      .catch((err) => {
        console.error('Failed to load staff directory:', err);
      });
  }, []);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selectedFiles = Array.from(e.target.files || []);

    const maxFileSize = 25 * 1024 * 1024; // 25 MB

    const allowedTypes = [
      'application/pdf',

      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',

      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',

      'image/jpeg',
      'image/png',
    ];

    for (const file of selectedFiles) {
      if (file.size > maxFileSize) {
        setError(`${file.name} exceeds the 25 MB file size limit.`);
        return;
      }

      if (!allowedTypes.includes(file.type)) {
        setError(`${file.name} is not a supported file type.`);
        return;
      }
    }

    setError(null);

    // Add files instead of replacing previously selected ones
    setFiles((prev) => [...prev, ...selectedFiles]);

    // Allows selecting the same file again after removing it
    e.target.value = '';
  }

  function removeFile(index: number) {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!assignedToId) {
      setError('Please choose an assignee.');
      return;
    }

    setSubmitting(true);

    try {
      // ---------------------------------------------------------
      // STEP 1: Create the task
      // ---------------------------------------------------------
      const res = await api.post('/tasks', {
        subject,
        description: description || undefined,
        priority,
        assignedToId,
        instructions: instructions || undefined,
        dueDate: dueDate
          ? new Date(dueDate).toISOString()
          : undefined,
      });

      const task = res.data.task;

      if (!task?.id) {
        throw new Error('Task was created but no task ID was returned.');
      }

      // ---------------------------------------------------------
      // STEP 2: Upload selected attachments
      // ---------------------------------------------------------
      for (const file of files) {
        const formData = new FormData();

        formData.append('file', file);
        formData.append('taskId', task.id);

        await api.post('/attachments', formData);
      }

      // ---------------------------------------------------------
      // STEP 3: Open the newly created task
      // ---------------------------------------------------------
      navigate(`/tasks/${task.id}`);
    } catch (err) {
      console.error(err);

      setError(
        apiErrorMessage(
          err,
          'Could not create task or upload attachment.'
        )
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <form
        onSubmit={handleSubmit}
        className="card space-y-4 p-6"
      >
        {error && (
          <div className="rounded-md border-l-2 border-l-danger-500 bg-danger-50 px-3 py-2 text-sm text-danger-500">
            {error}
          </div>
        )}

        {/* Subject */}
        <div>
          <label
            className="label"
            htmlFor="subject"
          >
            Subject
          </label>

          <input
            id="subject"
            required
            className="input"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
          />
        </div>

        {/* Description */}
        <div>
          <label
            className="label"
            htmlFor="description"
          >
            Description
          </label>

          <textarea
            id="description"
            rows={4}
            className="input"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        {/* Priority + Due Date */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label
              className="label"
              htmlFor="priority"
            >
              Priority
            </label>

            <select
              id="priority"
              className="input"
              value={priority}
              onChange={(e) =>
                setPriority(e.target.value as TaskPriority)
              }
            >
              <option value="CRITICAL">Critical</option>
              <option value="HIGH">High</option>
              <option value="MEDIUM">Medium</option>
              <option value="LOW">Low</option>
            </select>
          </div>

          <div>
            <label
              className="label"
              htmlFor="dueDate"
            >
              Due Date
            </label>

            <input
              id="dueDate"
              type="date"
              className="input"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
          </div>
        </div>

        {/* Assignee */}
        <div>
          <label
            className="label"
            htmlFor="assignee"
          >
            Assign To
          </label>

          <select
            id="assignee"
            required
            className="input"
            value={assignedToId}
            onChange={(e) =>
              setAssignedToId(e.target.value)
            }
          >
            <option value="">
              Select staff member…
            </option>

            {staff.map((s) => (
              <option
                key={s.id}
                value={s.id}
              >
                {s.name}
                {s.designation
                  ? ` — ${s.designation}`
                  : ''}
              </option>
            ))}
          </select>
        </div>

        {/* Instructions */}
        <div>
          <label
            className="label"
            htmlFor="instructions"
          >
            Instructions
          </label>

          <textarea
            id="instructions"
            rows={2}
            className="input"
            value={instructions}
            onChange={(e) =>
              setInstructions(e.target.value)
            }
          />
        </div>

        {/* Attachments */}
        <div>
          <label
            className="label"
            htmlFor="attachments"
          >
            Documents / Attachments
          </label>

          <input
            id="attachments"
            type="file"
            multiple
            accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png"
            onChange={handleFileChange}
            className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
          />

          <p className="mt-1 text-xs text-gray-500">
            PDF, Word, Excel, JPG and PNG. Maximum 25 MB per file.
          </p>
        </div>

        {/* Selected files preview */}
        {files.length > 0 && (
          <div className="space-y-2 rounded-md border bg-gray-50 p-3">
            <div className="text-sm font-medium">
              Selected documents ({files.length})
            </div>

            {files.map((file, index) => (
              <div
                key={`${file.name}-${index}`}
                className="flex items-center justify-between gap-3 rounded-md bg-white px-3 py-2 text-sm"
              >
                <div className="min-w-0">
                  <div className="truncate font-medium">
                    {file.name}
                  </div>

                  <div className="text-xs text-gray-500">
                    {(file.size / 1024 / 1024).toFixed(2)} MB
                  </div>
                </div>

                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => removeFile(index)}
                  className="text-sm text-danger-500 hover:underline"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Buttons */}
        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            className="btn-secondary"
            disabled={submitting}
            onClick={() => navigate(-1)}
          >
            Cancel
          </button>

          <button
            type="submit"
            disabled={submitting}
            className="btn-primary"
          >
            {submitting
              ? files.length > 0
                ? 'Creating & uploading…'
                : 'Creating…'
              : 'Create Task'}
          </button>
        </div>
      </form>
    </div>
  );
}
