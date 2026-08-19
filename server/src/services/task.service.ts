import { prisma } from '../config/db';
import { TaskStatus } from '@prisma/client';

/** Generates the next sequential human-readable Task/File ID for the
 *  current year, e.g. TASK-2026-0001, TASK-2026-0002, ... */
export async function nextFileId(): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `TASK-${year}-`;

  const last = await prisma.task.findFirst({
    where: { fileId: { startsWith: prefix } },
    orderBy: { fileId: 'desc' },
    select: { fileId: true },
  });

  const lastSeq = last ? parseInt(last.fileId.slice(prefix.length), 10) : 0;
  const next = (Number.isNaN(lastSeq) ? 0 : lastSeq) + 1;
  return `${prefix}${String(next).padStart(4, '0')}`;
}

/** Appends an immutable movement record. This is the single write path
 *  for task history — callers should never write to TaskMovement directly
 *  so the audit trail stays consistent. */
export async function recordMovement(params: {
  taskId: string;
  actorId: string;
  action: string;
  previousStatus?: TaskStatus | null;
  newStatus?: TaskStatus | null;
  remarks?: string | null;
}) {
  return prisma.taskMovement.create({
    data: {
      taskId: params.taskId,
      actorId: params.actorId,
      action: params.action,
      previousStatus: params.previousStatus ?? undefined,
      newStatus: params.newStatus ?? undefined,
      remarks: params.remarks ?? undefined,
    },
  });
}

/** Days a task's *current* assignment has been outstanding, for pending-task
 *  monitoring. Uses the most recent active assignment's createdAt. */
export function pendingDays(assignedAt: Date): number {
  const ms = Date.now() - assignedAt.getTime();
  return Math.max(0, Math.floor(ms / 86400000));
}

export function pendingBucket(days: number): '0-3' | '4-7' | '8-15' | '16-30' | '30+' {
  if (days <= 3) return '0-3';
  if (days <= 7) return '4-7';
  if (days <= 15) return '8-15';
  if (days <= 30) return '16-30';
  return '30+';
}
