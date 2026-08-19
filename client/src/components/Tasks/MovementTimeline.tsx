import { format } from 'date-fns';
import { TaskMovement } from '../../types';

const ACTION_LABELS: Record<string, string> = {
  CREATED: 'Task created',
  ASSIGNED: 'Assigned',
  SUB_ASSIGNED: 'Sub-assigned',
  ACKNOWLEDGED: 'Acknowledged',
  STATUS_CHANGE: 'Status updated',
  SUBMITTED: 'Submitted for review',
  APPROVED: 'Approved',
  RETURNED: 'Returned for correction',
  CLOSED: 'Closed',
  COMMENT: 'Remark added',
};

export function MovementTimeline({ movements }: { movements: TaskMovement[] }) {
  if (movements.length === 0) {
    return <p className="text-sm text-slate2-500">No movement recorded yet.</p>;
  }

  return (
    <ol className="relative border-l border-border2 pl-5">
      {movements.map((m) => (
        <li key={m.id} className="mb-5 last:mb-0">
          <span className="absolute -left-[5px] mt-1.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-navy-600" />
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span className="text-sm font-medium text-navy-900">
              {ACTION_LABELS[m.action] ?? m.action}
            </span>
            <span className="text-xs text-slate2-500">by {m.actor.name}</span>
            <span className="text-xs text-slate2-500">
              &middot; {format(new Date(m.createdAt), 'dd MMM yyyy, HH:mm')}
            </span>
          </div>
          {m.previousStatus && m.newStatus && m.previousStatus !== m.newStatus && (
            <p className="mt-0.5 text-xs text-slate2-500">
              {m.previousStatus} &rarr; {m.newStatus}
            </p>
          )}
          {m.remarks && <p className="mt-1 text-sm text-navy-700">{m.remarks}</p>}
        </li>
      ))}
    </ol>
  );
}
