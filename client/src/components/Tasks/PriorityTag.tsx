import { TaskPriority } from '../../types';

const STYLES: Record<TaskPriority, string> = {
  CRITICAL: 'text-danger-500',
  HIGH: 'text-amber-500',
  MEDIUM: 'text-navy-600',
  LOW: 'text-slate2-500',
};

const DOT: Record<TaskPriority, string> = {
  CRITICAL: 'bg-danger-500',
  HIGH: 'bg-amber-500',
  MEDIUM: 'bg-navy-400',
  LOW: 'bg-slate2-500',
};

export function PriorityTag({ priority }: { priority: TaskPriority }) {
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${STYLES[priority]}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${DOT[priority]}`} />
      {priority.charAt(0) + priority.slice(1).toLowerCase()}
    </span>
  );
}
