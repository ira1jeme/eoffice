import { TaskStatus } from '../../types';

const STYLES: Record<TaskStatus, string> = {
  NEW: 'border-l-slate2-500 bg-slate-50 text-slate2-600',
  ASSIGNED: 'border-l-navy-400 bg-navy-50 text-navy-700',
  ACKNOWLEDGED: 'border-l-navy-400 bg-navy-50 text-navy-700',
  IN_PROGRESS: 'border-l-amber-500 bg-amber-50 text-amber-500',
  PENDING: 'border-l-amber-500 bg-amber-50 text-amber-500',
  SUBMITTED: 'border-l-navy-600 bg-navy-50 text-navy-700',
  UNDER_REVIEW: 'border-l-amber-500 bg-amber-50 text-amber-500',
  RETURNED: 'border-l-danger-500 bg-danger-50 text-danger-500',
  COMPLETED: 'border-l-success-500 bg-success-50 text-success-500',
  CLOSED: 'border-l-success-500 bg-success-50 text-success-500',
};

const LABELS: Record<TaskStatus, string> = {
  NEW: 'New',
  ASSIGNED: 'Assigned',
  ACKNOWLEDGED: 'Acknowledged',
  IN_PROGRESS: 'In Progress',
  PENDING: 'Pending',
  SUBMITTED: 'Submitted',
  UNDER_REVIEW: 'Under Review',
  RETURNED: 'Returned',
  COMPLETED: 'Completed',
  CLOSED: 'Closed',
};

// Status is shown as a left-bordered "file marker" chip rather than a pill —
// evokes a status stamp on a physical file folder.
export function StatusBadge({ status }: { status: TaskStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-sm border-l-2 px-2 py-0.5 text-xs font-medium ${STYLES[status]}`}
    >
      {LABELS[status]}
    </span>
  );
}
