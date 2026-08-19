import { Response } from 'express';
import { z } from 'zod';
import { format as fmtDate } from 'date-fns';
import { prisma } from '../config/db';
import { AuthedRequest, isAdminOrAbove } from '../middleware/auth';
import { ApiError } from '../middleware/errorHandler';
import { sendAsCsv, sendAsXlsx, sendAsPdfTable, ReportColumn } from '../utils/export';

const formatSchema = z.enum(['json', 'csv', 'xlsx', 'pdf']).default('json');
const rangeSchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  format: formatSchema,
});

function dateFilter(from?: string, to?: string) {
  if (!from && !to) return undefined;
  return { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(to) } : {}) };
}

async function respond(
  req: AuthedRequest,
  res: Response,
  fileBase: string,
  title: string,
  columns: ReportColumn[],
  rows: Record<string, unknown>[],
) {
  const { format } = rangeSchema.parse(req.query);
  if (format === 'csv') return sendAsCsv(res, fileBase, rows, columns);
  if (format === 'xlsx') return sendAsXlsx(res, fileBase, rows, columns);
  if (format === 'pdf') return sendAsPdfTable(res, fileBase, title, rows, columns);
  res.json({ rows, generatedAt: new Date().toISOString() });
}

// ----------------------------------------------------------------------------
// Task Report — totals + full listing filtered by created date range
// ----------------------------------------------------------------------------

export async function taskReport(req: AuthedRequest, res: Response) {
  if (!isAdminOrAbove(req.user!.role)) throw new ApiError(403, 'Admins only.');
  const { from, to } = rangeSchema.parse(req.query);

  const tasks = await prisma.task.findMany({
    where: { createdAt: dateFilter(from, to) },
    include: {
      assignments: { where: { active: true }, include: { assignedTo: { select: { name: true } } } },
      createdBy: { select: { name: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  const rows = tasks.map((t) => ({
    fileId: t.fileId,
    subject: t.subject,
    priority: t.priority,
    status: t.status,
    createdBy: t.createdBy.name,
    assignedTo: t.assignments[0]?.assignedTo.name ?? '—',
    createdAt: fmtDate(t.createdAt, 'yyyy-MM-dd'),
    dueDate: t.dueDate ? fmtDate(t.dueDate, 'yyyy-MM-dd') : '',
    completionDate: t.completionDate ? fmtDate(t.completionDate, 'yyyy-MM-dd') : '',
  }));

  const columns: ReportColumn[] = [
    { key: 'fileId', header: 'Task ID' },
    { key: 'subject', header: 'Subject', width: 32 },
    { key: 'priority', header: 'Priority' },
    { key: 'status', header: 'Status' },
    { key: 'createdBy', header: 'Created By' },
    { key: 'assignedTo', header: 'Assigned To' },
    { key: 'createdAt', header: 'Created' },
    { key: 'dueDate', header: 'Due' },
    { key: 'completionDate', header: 'Completed' },
  ];

  await respond(req, res, 'task-report', 'Task Report', columns, rows);
}

// ----------------------------------------------------------------------------
// Staff-wise Report
// ----------------------------------------------------------------------------

export async function staffReport(req: AuthedRequest, res: Response) {
  if (!isAdminOrAbove(req.user!.role)) throw new ApiError(403, 'Admins only.');

  const staff = await prisma.user.findMany({
    where: { status: 'ACTIVE' },
    select: { id: true, name: true, designation: true },
  });

  const rows = await Promise.all(
    staff.map(async (s) => {
      const assignments = await prisma.taskAssignment.findMany({
        where: { assignedToId: s.id, active: true },
        include: { task: { select: { status: true, dueDate: true } } },
      });
      const assigned = assignments.length;
      const completed = assignments.filter((a) => ['COMPLETED', 'CLOSED'].includes(a.task.status)).length;
      const pending = assigned - completed;
      const overdue = assignments.filter(
        (a) => a.task.dueDate && a.task.dueDate < new Date() && !['COMPLETED', 'CLOSED'].includes(a.task.status),
      ).length;

      return {
        name: s.name,
        designation: s.designation ?? '',
        assigned,
        completed,
        pending,
        overdue,
      };
    }),
  );

  const columns: ReportColumn[] = [
    { key: 'name', header: 'Staff' },
    { key: 'designation', header: 'Designation' },
    { key: 'assigned', header: 'Assigned' },
    { key: 'completed', header: 'Completed' },
    { key: 'pending', header: 'Pending' },
    { key: 'overdue', header: 'Overdue' },
  ];

  await respond(req, res, 'staff-report', 'Staff-wise Report', columns, rows);
}

// ----------------------------------------------------------------------------
// Time-based Report — tasks created/completed per day within range
// ----------------------------------------------------------------------------

export async function timeBasedReport(req: AuthedRequest, res: Response) {
  if (!isAdminOrAbove(req.user!.role)) throw new ApiError(403, 'Admins only.');
  const { from, to } = rangeSchema.parse(req.query);

  const fromDate = from ? new Date(from) : new Date(Date.now() - 30 * 86400000);
  const toDate = to ? new Date(to) : new Date();

  const tasks = await prisma.task.findMany({
    where: { createdAt: { gte: fromDate, lte: toDate } },
    select: { createdAt: true, completionDate: true, status: true },
  });

  const byDay = new Map<string, { created: number; completed: number }>();
  for (const t of tasks) {
    const day = fmtDate(t.createdAt, 'yyyy-MM-dd');
    const entry = byDay.get(day) ?? { created: 0, completed: 0 };
    entry.created += 1;
    byDay.set(day, entry);
    if (t.completionDate) {
      const cDay = fmtDate(t.completionDate, 'yyyy-MM-dd');
      const cEntry = byDay.get(cDay) ?? { created: 0, completed: 0 };
      cEntry.completed += 1;
      byDay.set(cDay, cEntry);
    }
  }

  const rows = Array.from(byDay.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, v]) => ({ date, created: v.created, completed: v.completed }));

  const columns: ReportColumn[] = [
    { key: 'date', header: 'Date' },
    { key: 'created', header: 'Tasks Created' },
    { key: 'completed', header: 'Tasks Completed' },
  ];

  await respond(req, res, 'time-based-report', 'Time-based Report', columns, rows);
}

// ----------------------------------------------------------------------------
// Leave Report
// ----------------------------------------------------------------------------

export async function leaveReport(req: AuthedRequest, res: Response) {
  if (!isAdminOrAbove(req.user!.role)) throw new ApiError(403, 'Admins only.');
  const { from, to } = rangeSchema.parse(req.query);

  const leaves = await prisma.leaveRequest.findMany({
    where: { createdAt: dateFilter(from, to) },
    include: { user: { select: { name: true } }, reviewedBy: { select: { name: true } } },
    orderBy: { createdAt: 'desc' },
  });

  const rows = leaves.map((l) => ({
    staff: l.user.name,
    leaveType: l.leaveType,
    fromDate: fmtDate(l.fromDate, 'yyyy-MM-dd'),
    toDate: fmtDate(l.toDate, 'yyyy-MM-dd'),
    days: l.days,
    status: l.status,
    reviewedBy: l.reviewedBy?.name ?? '',
  }));

  const columns: ReportColumn[] = [
    { key: 'staff', header: 'Staff' },
    { key: 'leaveType', header: 'Type' },
    { key: 'fromDate', header: 'From' },
    { key: 'toDate', header: 'To' },
    { key: 'days', header: 'Days' },
    { key: 'status', header: 'Status' },
    { key: 'reviewedBy', header: 'Reviewed By' },
  ];

  await respond(req, res, 'leave-report', 'Leave Report', columns, rows);
}
