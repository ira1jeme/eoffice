import {
  FormEvent,
  useEffect,
  useState,
} from 'react';

import {
  Link,
  useParams,
} from 'react-router-dom';

import { format } from 'date-fns';

import {
  api,
  apiErrorMessage,
} from '../../api/client';

import {
  TaskDetail as TaskDetailType,
  TaskStatus,
  UserSummary,
} from '../../types';

import { StatusBadge } from '../../components/Tasks/StatusBadge';
import { PriorityTag } from '../../components/Tasks/PriorityTag';
import { MovementTimeline } from '../../components/Tasks/MovementTimeline';
import { useAuth } from '../../context/AuthContext';

const NEXT_STEPS: Partial<
  Record<
    TaskStatus,
    {
      status: TaskStatus;
      label: string;
      adminOnly?: boolean;
    }[]
  >
> = {
  ASSIGNED: [
    {
      status: 'ACKNOWLEDGED',
      label: 'Acknowledge',
    },
  ],

  ACKNOWLEDGED: [
    {
      status: 'IN_PROGRESS',
      label: 'Start Progress',
    },
  ],

  IN_PROGRESS: [
    {
      status: 'PENDING',
      label: 'Mark Pending',
    },
    {
      status: 'SUBMITTED',
      label: 'Submit for Review',
    },
  ],

  PENDING: [
    {
      status: 'IN_PROGRESS',
      label: 'Resume Progress',
    },
    {
      status: 'SUBMITTED',
      label: 'Submit for Review',
    },
  ],

  SUBMITTED: [
    {
      status: 'UNDER_REVIEW',
      label: 'Move to Under Review',
    },
  ],

  UNDER_REVIEW: [
    {
      status: 'COMPLETED',
      label: 'Approve & Complete',
      adminOnly: true,
    },
    {
      status: 'RETURNED',
      label: 'Return for Correction',
      adminOnly: true,
    },
  ],

  RETURNED: [
    {
      status: 'IN_PROGRESS',
      label: 'Resume Progress',
    },
  ],

  COMPLETED: [
    {
      status: 'CLOSED',
      label: 'Close Task',
      adminOnly: true,
    },
  ],
};

type PreviewFile = {
  id: string;
  fileName: string;
  fileType: string;
  url: string;
};

export function TaskDetail() {
  const { id } = useParams();
  const { user } = useAuth();

  const [task, setTask] =
    useState<TaskDetailType | null>(null);

  const [staff, setStaff] =
    useState<UserSummary[]>([]);

  const [error, setError] =
    useState<string | null>(null);

  const [busy, setBusy] =
    useState(false);

  const [remarks, setRemarks] =
    useState('');

  const [comment, setComment] =
    useState('');

  const [subAssignTo, setSubAssignTo] =
    useState('');

  const [subAssignNote, setSubAssignNote] =
    useState('');

  const [showSubAssign, setShowSubAssign] =
    useState(false);

  const [uploading, setUploading] =
    useState(false);

  // =========================================================
  // DOCUMENT PREVIEW
  // =========================================================

  const [previewFile, setPreviewFile] =
    useState<PreviewFile | null>(null);

  const [previewLoading, setPreviewLoading] =
    useState(false);

  const isAdmin =
    user?.role === 'ADMIN' ||
    user?.role === 'SUPER_ADMIN';

  // =========================================================
  // LOAD TASK
  // =========================================================

  async function load() {
    if (!id) {
      return;
    }

    const res =
      await api.get(`/tasks/${id}`);

    setTask(res.data.task);
  }

  useEffect(() => {
    load();

    api
      .get('/users/directory')
      .then((res) =>
        setStaff(res.data.users)
      )
      .catch((err) => {
        console.error(
          'Could not load staff directory:',
          err
        );
      });

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Revoke blob URL when component is removed.
  useEffect(() => {
    return () => {
      if (previewFile?.url) {
        URL.revokeObjectURL(
          previewFile.url
        );
      }
    };
  }, [previewFile]);

  // =========================================================
  // STATUS CHANGE
  // =========================================================

  async function runStatusChange(
    status: TaskStatus
  ) {
    setBusy(true);
    setError(null);

    try {
      await api.post(
        `/tasks/${id}/status`,
        {
          status,
          remarks:
            remarks || undefined,
        }
      );

      setRemarks('');

      await load();
    } catch (err) {
      setError(
        apiErrorMessage(
          err,
          'Could not update status.'
        )
      );
    } finally {
      setBusy(false);
    }
  }

  // =========================================================
  // COMMENTS
  // =========================================================

  async function submitComment(
    e: FormEvent
  ) {
    e.preventDefault();

    if (!comment.trim()) {
      return;
    }

    setBusy(true);
    setError(null);

    try {
      await api.post(
        `/tasks/${id}/comments`,
        {
          message: comment,
        }
      );

      setComment('');

      await load();
    } catch (err) {
      setError(
        apiErrorMessage(
          err,
          'Could not add remark.'
        )
      );
    } finally {
      setBusy(false);
    }
  }

  // =========================================================
  // SUB ASSIGN
  // =========================================================

  async function submitSubAssign(
    e: FormEvent
  ) {
    e.preventDefault();

    if (!subAssignTo) {
      return;
    }

    setBusy(true);
    setError(null);

    try {
      await api.post(
        `/tasks/${id}/sub-assign`,
        {
          assignedToId:
            subAssignTo,

          instructions:
            subAssignNote ||
            undefined,
        }
      );

      setSubAssignTo('');
      setSubAssignNote('');
      setShowSubAssign(false);

      await load();
    } catch (err) {
      setError(
        apiErrorMessage(
          err,
          'Could not sub-assign task.'
        )
      );
    } finally {
      setBusy(false);
    }
  }

  // =========================================================
  // UPLOAD DOCUMENT
  // =========================================================

  async function handleFileUpload(
    e: React.ChangeEvent<HTMLInputElement>
  ) {
    const file =
      e.target.files?.[0];

    if (!file) {
      return;
    }

    setUploading(true);
    setError(null);

    try {
      const formData =
        new FormData();

      formData.append(
        'file',
        file
      );

      await api.post(
        `/attachments/tasks/${id}`,
        formData
      );

      await load();
    } catch (err) {
      setError(
        apiErrorMessage(
          err,
          'Could not upload file.'
        )
      );
    } finally {
      setUploading(false);

      e.target.value = '';
    }
  }

  // =========================================================
  // VIEW DOCUMENT
  // =========================================================

  async function viewAttachment(
    attachmentId: string,
    fileName: string,
    fileType: string
  ) {
    setPreviewLoading(true);
    setError(null);

    try {
      const res =
        await api.get(
          `/attachments/${attachmentId}/download`,
          {
            responseType: 'blob',
          }
        );

      if (previewFile?.url) {
        URL.revokeObjectURL(
          previewFile.url
        );
      }

      const detectedType =
        fileType ||
        res.data.type ||
        'application/octet-stream';

      const blob =
        new Blob(
          [res.data],
          {
            type: detectedType,
          }
        );

      const url =
        URL.createObjectURL(
          blob
        );

      setPreviewFile({
        id: attachmentId,
        fileName,
        fileType: detectedType,
        url,
      });
    } catch (err) {
      setError(
        apiErrorMessage(
          err,
          'Could not open attachment.'
        )
      );
    } finally {
      setPreviewLoading(false);
    }
  }

  // =========================================================
  // CLOSE PREVIEW
  // =========================================================

  function closePreview() {
    if (previewFile?.url) {
      URL.revokeObjectURL(
        previewFile.url
      );
    }

    setPreviewFile(null);
  }

  // =========================================================
  // DOWNLOAD DOCUMENT
  // =========================================================

  async function downloadAttachment(
    attachmentId: string,
    fileName: string
  ) {
    setError(null);

    try {
      const res =
        await api.get(
          `/attachments/${attachmentId}/download`,
          {
            responseType: 'blob',
          }
        );

      const url =
        URL.createObjectURL(
          res.data
        );

      const a =
        document.createElement(
          'a'
        );

      a.href = url;
      a.download = fileName;

      document.body.appendChild(
        a
      );

      a.click();
      a.remove();

      URL.revokeObjectURL(url);
    } catch (err) {
      setError(
        apiErrorMessage(
          err,
          'Could not download attachment.'
        )
      );
    }
  }

  // =========================================================
  // CHECK PREVIEWABLE FILE
  // =========================================================

  function canPreview(
    fileType: string
  ) {
    return (
      fileType ===
        'application/pdf' ||
      fileType ===
        'image/jpeg' ||
      fileType ===
        'image/png' ||
      fileType ===
        'video/mp4' ||
      fileType ===
        'video/quicktime'
    );
  }

  // =========================================================
  // LOADING
  // =========================================================

  if (!task) {
    return (
      <p className="text-sm text-slate2-500">
        Loading task…
      </p>
    );
  }

  // =========================================================
  // TASK PERMISSIONS
  // =========================================================

  const activeAssignments =
    task.assignments.filter(
      (a) => a.active
    );

  const isCurrentAssignee =
    activeAssignments.some(
      (a) =>
        a.assignedTo.id ===
        user?.id
    );

  const canSubAssign =
    isAdmin ||
    (
      isCurrentAssignee &&
      user?.canSubAssign
    );

  const nextSteps =
    (
      NEXT_STEPS[
        task.status
      ] ?? []
    ).filter(
      (s) =>
        isAdmin ||
        !s.adminOnly
    );

  // =========================================================
  // PAGE
  // =========================================================

  return (
    <div className="space-y-6">

      {/* ==================================================== */}
      {/* TASK INFORMATION                                    */}
      {/* ==================================================== */}

      <div className="card p-5">

        <div className="mb-3 flex flex-wrap items-center gap-2">

          <span className="file-stamp">
            {task.fileId}
          </span>

          <StatusBadge
            status={task.status}
          />

          <PriorityTag
            priority={task.priority}
          />

        </div>

        <h2 className="font-display text-xl font-semibold text-navy-900">
          {task.subject}
        </h2>

        {task.description && (
          <p className="mt-2 text-sm text-navy-700">
            {task.description}
          </p>
        )}

        <div className="mt-4 grid grid-cols-2 gap-4 border-t border-border2 pt-4 text-sm sm:grid-cols-4">

          <div>
            <p className="label mb-0.5">
              Created By
            </p>

            <p className="text-navy-900">
              {task.createdBy.name}
            </p>
          </div>

          <div>
            <p className="label mb-0.5">
              Due Date
            </p>

            <p className="text-navy-900">
              {task.dueDate
                ? format(
                    new Date(
                      task.dueDate
                    ),
                    'dd MMM yyyy'
                  )
                : '—'}
            </p>
          </div>

          <div>
            <p className="label mb-0.5">
              Pending Days
            </p>

            <p className="text-navy-900">
              {task.pendingDays}d
            </p>
          </div>

          <div>
            <p className="label mb-0.5">
              Completion Date
            </p>

            <p className="text-navy-900">
              {task.completionDate
                ? format(
                    new Date(
                      task.completionDate
                    ),
                    'dd MMM yyyy'
                  )
                : '—'}
            </p>
          </div>

        </div>

        {task.parentTask && (
          <p className="mt-3 text-sm text-slate2-600">

            Parent task:{' '}

            <Link
              to={`/tasks/${task.parentTask.id}`}
              className="file-stamp"
            >
              {
                task.parentTask
                  .fileId
              }
            </Link>

          </p>
        )}

        {task.subTasks.length >
          0 && (
          <div className="mt-3">

            <p className="label mb-1">
              Sub-tasks
            </p>

            <div className="flex flex-wrap gap-2">

              {task.subTasks.map(
                (st) => (
                  <Link
                    key={st.id}
                    to={`/tasks/${st.id}`}
                    className="file-stamp"
                  >
                    {st.fileId}
                    {' · '}
                    {st.status}
                  </Link>
                )
              )}

            </div>

          </div>
        )}

      </div>

      {/* ==================================================== */}
      {/* MAIN CONTENT                                        */}
      {/* ==================================================== */}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">

        {/* ================================================== */}
        {/* DOCUMENT / PREVIEW COLUMN                         */}
        {/* ================================================== */}

        <div className="space-y-6 lg:col-span-8">

          {/* DOCUMENT LIST */}

          <div className="card p-5">

            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">

              <div>
                <h3 className="font-display text-base font-semibold text-navy-900">
                  Documents / Attachments
                </h3>

                <p className="mt-1 text-xs text-slate2-500">
                  View attached documents directly without downloading.
                </p>
              </div>

              <label className="btn-secondary cursor-pointer text-center">

                {uploading
                  ? 'Uploading…'
                  : 'Upload Document'}

                <input
                  type="file"
                  className="hidden"
                  accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.mp4,.mov"
                  onChange={
                    handleFileUpload
                  }
                  disabled={
                    uploading
                  }
                />

              </label>

            </div>

            {task.attachments
              .length === 0 ? (
              <div className="rounded-md border border-dashed border-border2 p-6 text-center">

                <p className="text-sm text-slate2-500">
                  No documents attached to this task.
                </p>

              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">

                {task.attachments.map(
                  (a) => (
                    <div
                      key={a.id}
                      className="rounded-md border border-border2 bg-white p-3"
                    >

                      <p
                        className="truncate text-sm font-medium text-navy-900"
                        title={
                          a.fileName
                        }
                      >
                        {a.fileName}
                      </p>

                      <p className="mt-1 text-xs text-slate2-500">

                        {a.uploadedBy
                          ?.name ||
                          'Unknown'}

                        {' · '}

                        {(
                          a.fileSize /
                          1024
                        ).toFixed(
                          0
                        )}{' '}
                        KB

                      </p>

                      <div className="mt-3 flex gap-2">

                        {canPreview(
                          a.fileType
                        ) && (
                          <button
                            type="button"
                            disabled={
                              previewLoading
                            }
                            onClick={() =>
                              viewAttachment(
                                a.id,
                                a.fileName,
                                a.fileType
                              )
                            }
                            className="btn-primary flex-1"
                          >
                            {previewLoading
                              ? 'Opening…'
                              : 'View'}
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() =>
                            downloadAttachment(
                              a.id,
                              a.fileName
                            )
                          }
                          className="btn-secondary flex-1"
                        >
                          Download
                        </button>

                      </div>

                    </div>
                  )
                )}

              </div>
            )}

          </div>

          {/* ================================================= */}
          {/* DOCUMENT PREVIEW                                  */}
          {/* ================================================= */}

          {previewFile ? (
            <div className="card overflow-hidden">

              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border2 px-5 py-3">

                <div className="min-w-0">

                  <h3 className="truncate font-display text-sm font-semibold text-navy-900">
                    {
                      previewFile.fileName
                    }
                  </h3>

                  <p className="text-xs text-slate2-500">
                    Document Preview
                  </p>

                </div>

                <div className="flex gap-2">

                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() =>
                      downloadAttachment(
                        previewFile.id,
                        previewFile.fileName
                      )
                    }
                  >
                    Download
                  </button>

                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={
                      closePreview
                    }
                  >
                    Close
                  </button>

                </div>

              </div>

              <div className="bg-slate-100 p-2">

                {/* PDF */}

                {previewFile.fileType ===
                  'application/pdf' && (
                  <iframe
                    src={
                      previewFile.url
                    }
                    title={
                      previewFile.fileName
                    }
                    className="h-[75vh] min-h-[650px] w-full rounded-md bg-white"
                  />
                )}

                {/* JPG / PNG */}

                {(previewFile.fileType ===
                  'image/jpeg' ||
                  previewFile.fileType ===
                    'image/png') && (
                  <div className="flex min-h-[650px] items-center justify-center rounded-md bg-white p-4">

                    <img
                      src={
                        previewFile.url
                      }
                      alt={
                        previewFile.fileName
                      }
                      className="max-h-[75vh] max-w-full object-contain"
                    />

                  </div>
                )}

                {/* VIDEO */}

                {(previewFile.fileType ===
                  'video/mp4' ||
                  previewFile.fileType ===
                    'video/quicktime') && (
                  <div className="flex min-h-[500px] items-center justify-center rounded-md bg-black">

                    <video
                      src={
                        previewFile.url
                      }
                      controls
                      className="max-h-[75vh] max-w-full"
                    >
                      Your browser does
                      not support video
                      playback.
                    </video>

                  </div>
                )}

              </div>

            </div>
          ) : (
            <div className="card flex min-h-[500px] items-center justify-center p-8">

              <div className="text-center">

                <p className="font-display text-base font-semibold text-navy-900">
                  Document Preview
                </p>

                <p className="mt-2 text-sm text-slate2-500">
                  Click View on an attachment to display it here.
                </p>

              </div>

            </div>
          )}

        </div>

        {/* ================================================== */}
        {/* RIGHT COLUMN                                      */}
        {/* ================================================== */}

        <div className="space-y-6 lg:col-span-4">

          {/* ERROR */}

          {error && (
            <div className="rounded-md border-l-2 border-l-danger-500 bg-danger-50 px-3 py-2 text-sm text-danger-500">
              {error}
            </div>
          )}

          {/* ================================================ */}
          {/* TASK MOVEMENT                                    */}
          {/* ================================================ */}

          <div className="card p-5">

            <h3 className="mb-4 font-display text-sm font-semibold text-navy-900">
              Task Movement
            </h3>

            <div className="max-h-[420px] overflow-y-auto pr-1">

              <MovementTimeline
                movements={
                  task.movements
                }
              />

            </div>

          </div>

          {/* ================================================ */}
          {/* REMARKS                                         */}
          {/* ================================================ */}

          <div className="card p-5">

            <h3 className="mb-3 font-display text-sm font-semibold text-navy-900">
              Remarks &amp; Comments
            </h3>

            <div className="mb-4 max-h-64 space-y-3 overflow-y-auto">

              {task.comments.length ===
                0 && (
                <p className="text-sm text-slate2-500">
                  No remarks yet.
                </p>
              )}

              {task.comments.map(
                (c) => (
                  <div
                    key={c.id}
                    className="rounded-md bg-navy-50/60 p-3 text-sm"
                  >

                    <p className="mb-1 text-xs font-medium text-navy-700">

                      {c.user.name}

                      {' · '}

                      {format(
                        new Date(
                          c.createdAt
                        ),
                        'dd MMM yyyy, HH:mm'
                      )}

                    </p>

                    <p className="text-navy-900">
                      {c.message}
                    </p>

                  </div>
                )
              )}

            </div>

            <form
              onSubmit={
                submitComment
              }
              className="space-y-2"
            >

              <textarea
                className="input"
                rows={3}
                placeholder="Add a remark or instruction…"
                value={comment}
                onChange={(e) =>
                  setComment(
                    e.target.value
                  )
                }
              />

              <button
                type="submit"
                disabled={busy}
                className="btn-secondary w-full"
              >
                Add Remark
              </button>

            </form>

          </div>

          {/* ================================================ */}
          {/* CURRENT ASSIGNMENT                               */}
          {/* ================================================ */}

          <div className="card p-5">

            <h3 className="mb-3 font-display text-sm font-semibold text-navy-900">
              Current Assignment
            </h3>

            {activeAssignments.length ===
              0 && (
              <p className="text-sm text-slate2-500">
                Unassigned.
              </p>
            )}

            <ul className="space-y-3">

              {activeAssignments.map(
                (a) => (
                  <li
                    key={a.id}
                    className="text-sm"
                  >

                    <p className="font-medium text-navy-900">

                      {
                        a.assignedTo
                          .name
                      }

                      {a.isSubAssignment && (
                        <span className="text-xs text-amber-500">
                          {' '}
                          (sub-assigned)
                        </span>
                      )}

                    </p>

                    <p className="text-xs text-slate2-500">

                      by{' '}

                      {
                        a.assignedBy
                          .name
                      }

                      {' · '}

                      {format(
                        new Date(
                          a.createdAt
                        ),
                        'dd MMM yyyy'
                      )}

                    </p>

                    {a.instructions && (
                      <p className="mt-1 text-navy-700">
                        {
                          a.instructions
                        }
                      </p>
                    )}

                  </li>
                )
              )}

            </ul>

          </div>

          {/* ================================================ */}
          {/* ACTIONS                                         */}
          {/* ================================================ */}

          {nextSteps.length > 0 && (
            <div className="card p-5">

              <h3 className="mb-3 font-display text-sm font-semibold text-navy-900">
                Actions
              </h3>

              <textarea
                className="input mb-3"
                placeholder="Remarks (optional)"
                rows={2}
                value={remarks}
                onChange={(e) =>
                  setRemarks(
                    e.target.value
                  )
                }
              />

              <div className="flex flex-wrap gap-2">

                {nextSteps.map(
                  (s) => (
                    <button
                      type="button"
                      key={s.status}
                      disabled={busy}
                      onClick={() =>
                        runStatusChange(
                          s.status
                        )
                      }
                      className={
                        s.status ===
                        'RETURNED'
                          ? 'btn-danger'
                          : 'btn-primary'
                      }
                    >
                      {s.label}
                    </button>
                  )
                )}

              </div>

            </div>
          )}

          {/* ================================================ */}
          {/* SUB ASSIGN                                      */}
          {/* ================================================ */}

          {canSubAssign && (
            <div className="card p-5">

              <div className="mb-3 flex items-center justify-between">

                <h3 className="font-display text-sm font-semibold text-navy-900">
                  Sub-assign
                </h3>

                <button
                  type="button"
                  className="text-xs font-medium text-navy-600 hover:underline"
                  onClick={() =>
                    setShowSubAssign(
                      (v) => !v
                    )
                  }
                >
                  {showSubAssign
                    ? 'Cancel'
                    : 'Sub-assign task'}
                </button>

              </div>

              {showSubAssign && (
                <form
                  onSubmit={
                    submitSubAssign
                  }
                  className="space-y-2"
                >

                  <select
                    className="input"
                    required
                    value={
                      subAssignTo
                    }
                    onChange={(e) =>
                      setSubAssignTo(
                        e.target.value
                      )
                    }
                  >

                    <option value="">
                      Select staff…
                    </option>

                    {staff
                      .filter(
                        (s) =>
                          s.id !==
                          user?.id
                      )
                      .map(
                        (s) => (
                          <option
                            key={s.id}
                            value={s.id}
                          >
                            {s.name}
                          </option>
                        )
                      )}

                  </select>

                  <textarea
                    className="input"
                    placeholder="Instructions"
                    rows={2}
                    value={
                      subAssignNote
                    }
                    onChange={(e) =>
                      setSubAssignNote(
                        e.target.value
                      )
                    }
                  />

                  <button
                    type="submit"
                    disabled={busy}
                    className="btn-primary w-full"
                  >
                    Sub-assign
                  </button>

                </form>
              )}

            </div>
          )}

        </div>

      </div>

    </div>
  );
}
