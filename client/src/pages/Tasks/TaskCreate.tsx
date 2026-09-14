import {
  ChangeEvent,
  FormEvent,
  useEffect,
  useState,
} from 'react';

import { useNavigate } from 'react-router-dom';

import {
  api,
  apiErrorMessage,
} from '../../api/client';

import {
  TaskPriority,
  UserSummary,
} from '../../types';

export function TaskCreate() {
  const navigate = useNavigate();

  const [staff, setStaff] = useState<UserSummary[]>([]);
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] =
    useState<TaskPriority>('MEDIUM');

  const [assignedToId, setAssignedToId] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [instructions, setInstructions] = useState('');

  // Attachments
  const [files, setFiles] = useState<File[]>([]);

  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api
      .get('/users/directory')
      .then((res) => {
        setStaff(res.data.users);
      })
      .catch((err) => {
        console.error(
          'Could not load staff directory:',
          err
        );
      });
  }, []);

  function handleFileChange(
    e: ChangeEvent<HTMLInputElement>
  ) {
    const selectedFiles = Array.from(
      e.target.files || []
    );

    if (selectedFiles.length === 0) {
      return;
    }

    const maxFileSize =
      25 * 1024 * 1024;

    const allowedTypes = new Set([
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'image/jpeg',
      'image/png',
      'video/mp4',
      'video/quicktime',
    ]);

    for (const file of selectedFiles) {
      if (file.size > maxFileSize) {
        setError(
          `${file.name} exceeds the maximum file size of 25 MB.`
        );

        e.target.value = '';
        return;
      }

      if (!allowedTypes.has(file.type)) {
        setError(
          `${file.name} is not a supported file type.`
        );

        e.target.value = '';
        return;
      }
    }

    setError(null);

    setFiles((previousFiles) => {
      const newFiles = [...previousFiles];

      for (const file of selectedFiles) {
        const alreadyAdded = newFiles.some(
          (existingFile) =>
            existingFile.name === file.name &&
            existingFile.size === file.size &&
            existingFile.lastModified ===
              file.lastModified
        );

        if (!alreadyAdded) {
          newFiles.push(file);
        }
      }

      return newFiles;
    });

    // Allows user to choose the same file again
    // after removing it.
    e.target.value = '';
  }

  function removeFile(index: number) {
    setFiles((previousFiles) =>
      previousFiles.filter(
        (_, fileIndex) =>
          fileIndex !== index
      )
    );
  }

  function formatFileSize(bytes: number) {
    if (bytes < 1024) {
      return `${bytes} B`;
    }

    if (bytes < 1024 * 1024) {
      return `${(
        bytes / 1024
      ).toFixed(1)} KB`;
    }

    return `${(
      bytes /
      1024 /
      1024
    ).toFixed(2)} MB`;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();

    setError(null);

    if (!assignedToId) {
      setError(
        'Please choose an assignee.'
      );
      return;
    }

    setSubmitting(true);

    let createdTaskId:
      | string
      | null = null;

    try {
      // -------------------------------------------------------
      // STEP 1: Create the task
      // -------------------------------------------------------

      const res =
        await api.post('/tasks', {
          subject,
          description:
            description ||
            undefined,
          priority,
          assignedToId,
          instructions:
            instructions ||
            undefined,
          dueDate: dueDate
            ? new Date(
                dueDate
              ).toISOString()
            : undefined,
        });

      const task = res.data.task;

      if (!task?.id) {
        throw new Error(
          'Task ID was not returned by the server.'
        );
      }

      createdTaskId = task.id;

      // -------------------------------------------------------
      // STEP 2: Upload selected files
      // -------------------------------------------------------

      for (const file of files) {
        const formData =
          new FormData();

        formData.append(
          'file',
          file
        );

        await api.post(
          `/attachments/tasks/${task.id}`,
          formData
        );
      }

      // -------------------------------------------------------
      // STEP 3: Open the newly created task
      // -------------------------------------------------------

      navigate(
        `/tasks/${task.id}`
      );
    } catch (err) {
      console.error(
        'Create task error:',
        err
      );

      if (createdTaskId) {
        setError(
          'The task was created successfully, but one or more attachments could not be uploaded. Please open the task and upload the missing document again.'
        );
      } else {
        setError(
          apiErrorMessage(
            err,
            'Could not create task.'
          )
        );
      }
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
        {/* Error message */}

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
            onChange={(e) =>
              setSubject(
                e.target.value
              )
            }
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
            onChange={(e) =>
              setDescription(
                e.target.value
              )
            }
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
                setPriority(
                  e.target
                    .value as TaskPriority
                )
              }
            >
              <option value="CRITICAL">
                Critical
              </option>

              <option value="HIGH">
                High
              </option>

              <option value="MEDIUM">
                Medium
              </option>

              <option value="LOW">
                Low
              </option>
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
              onChange={(e) =>
                setDueDate(
                  e.target.value
                )
              }
            />
          </div>
        </div>

        {/* Assign To */}

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
              setAssignedToId(
                e.target.value
              )
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
              setInstructions(
                e.target.value
              )
            }
          />
        </div>

        {/* Documents / Attachments */}

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
            accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.mp4,.mov"
            disabled={submitting}
            onChange={
              handleFileChange
            }
            className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
          />

          <p className="mt-1 text-xs text-gray-500">
            PDF, Word, Excel,
            JPG, PNG, MP4 and MOV.
            Maximum 25 MB per
            file.
          </p>
        </div>

        {/* Selected attachments */}

        {files.length > 0 && (
          <div className="rounded-md border border-gray-200 bg-gray-50 p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-medium">
                Selected
                Attachments
              </span>

              <span className="text-xs text-gray-500">
                {files.length}{' '}
                {files.length ===
                1
                  ? 'file'
                  : 'files'}
              </span>
            </div>

            <div className="space-y-2">
              {files.map(
                (
                  file,
                  index
                ) => (
                  <div
                    key={`${file.name}-${file.lastModified}-${index}`}
                    className="flex items-center justify-between gap-3 rounded-md border bg-white px-3 py-2"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">
                        {
                          file.name
                        }
                      </div>

                      <div className="text-xs text-gray-500">
                        {formatFileSize(
                          file.size
                        )}
                      </div>
                    </div>

                    <button
                      type="button"
                      disabled={
                        submitting
                      }
                      onClick={() =>
                        removeFile(
                          index
                        )
                      }
                      className="shrink-0 text-sm text-danger-500 hover:underline disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Remove
                    </button>
                  </div>
                )
              )}
            </div>
          </div>
        )}

        {/* Buttons */}

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            className="btn-secondary"
            disabled={submitting}
            onClick={() =>
              navigate(-1)
            }
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
                ? 'Creating & Uploading…'
                : 'Creating…'
              : 'Create Task'}
          </button>
        </div>
      </form>
    </div>
  );
}
