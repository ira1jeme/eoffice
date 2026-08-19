import { Response } from 'express';
import { z } from 'zod';
import { Prisma, TaskStatus, TaskPriority } from '@prisma/client';
import { prisma } from '../config/db';
import { AuthedRequest, isAdminOrAbove } from '../middleware/auth';
import { ApiError } from '../middleware/errorHandler';
import { nextFileId, recordMovement, pendingDays, pendingBucket } from '../services/task.service';
import { notify } from '../services/notification.service';
import { audit } from '../services/audit.service';

// ----------------------------------------------------------------------------
// Create task (Admin / Super Admin only) — always creates the initial
// assignment in the same transaction so a task is never left unassigned.
// ----------------------------------------------------------------------------

const createTaskSchema = z.object({
  subject: z.string().min(1, 'Subject is required.'),
  description: z.string().optional(),
  priority: z.nativeEnum(TaskPriority).default('MEDIUM'),
  dueDate: z.string().datetime().optional(),
  assignedToId: z.string().min(1, 'Assignee is required.'),
  instructions: z.string().optional(),
  parentTaskId: z.string().optional(),
});

export async function createTask(req: AuthedRequest, res: Response) {
  const data = createTaskSchema.parse(req.body);
  const actorId = req.user!.userId;

  const assignee = await prisma.user.findUnique({ where: { id: data.assignedToId } });
  if (!assignee || assignee.status !== 'ACTIVE') {
    throw new ApiError(400, 'Selected assignee does not exist or is disabled.');
  }

  const fileId = await nextFileId();
  const dueDate = data.dueDate ? new Date(data.dueDate) : null;

  const task = await prisma.$transaction(async (tx) => {
    const created = await tx.task.create({
      data: {
        fileId,
        subject: data.subject,
        description: data.description,
        priority: data.priority,
        status: TaskStatus.ASSIGNED,
        createdById: actorId,
        dueDate,
        parentTaskId: data.parentTaskId,
      },
    });

    await tx.taskAssignment.create({
      data: {
        taskId: created.id,
        assignedToId: data.assignedToId,
        assignedById: actorId,
        instructions: data.instructions,
        dueDate,
      },
    });

    await tx.taskMovement.create({
      data: { taskId: created.id, actorId, action: 'CREATED', newStatus: TaskStatus.NEW },
    });
    await tx.taskMovement.create({
      data: {
        taskId: created.id,
        actorId,
        action: 'ASSIGNED',
        previousStatus: TaskStatus.NEW,
        newStatus: TaskStatus.ASSIGNED,
        remarks: `Assigned to ${assignee.name}`,
      },
    });

    return created;
  });

  await notify({
    userId: data.assignedToId,
    type: 'TASK_ASSIGNED',
    title: 'New task assigned',
    message: `"${data.subject}" (${fileId}) has been assigned to you.`,
    taskId: task.id,
  });
  await audit({ userId: actorId, action: 'TASK_CREATED', entityType: 'Task', entityId: task.id, details: fileId, req });

  res.status(201).json({ task });
}

// ----------------------------------------------------------------------------
// List tasks with filters
// ----------------------------------------------------------------------------

const listQuerySchema = z.object({
  status: z.nativeEnum(TaskStatus).optional(),
  priority: z.nativeEnum(TaskPriority).optional(),
  assignedToId: z.string().optional(),
  departmentId: z.string().optional(),
  search: z.string().optional(),
  dueFrom: z.string().datetime().optional(),
  dueTo: z.string().datetime().optional(),
  // scope: mine (assigned to me) | createdByMe | subAssignedByMe | all
  scope: z.enum(['mine', 'createdByMe', 'subAssignedByMe', 'all']).optional(),
  page: z.coerce.number().min(1).default(1),
  pageSize: z.coerce.number().min(1).max(100).default(20),
});

export async function listTasks(req: AuthedRequest, res: Response) {
  const q = listQuerySchema.parse(req.query);
  const { userId, role, departmentId: myDeptId } = req.user!;

  const where: Prisma.TaskWhereInput = {};

  if (q.status) where.status = q.status;
  if (q.priority) where.priority = q.priority;
  if (q.dueFrom || q.dueTo) {
    where.dueDate = {
      ...(q.dueFrom ? { gte: new Date(q.dueFrom) } : {}),
      ...(q.dueTo ? { lte: new Date(q.dueTo) } : {}),
    };
  }
  if (q.search) {
    where.OR = [
      { subject: { contains: q.search, mode: 'insensitive' } },
      { fileId: { contains: q.search, mode: 'insensitive' } },
      { description: { contains: q.search, mode: 'insensitive' } },
    ];
  }

  if (q.assignedToId) {
    where.assignments = { some: { assignedToId: q.assignedToId, active: true } };
  }

  if (q.scope === 'mine') {
    where.assignments = { some: { assignedToId: userId, active: true } };
  } else if (q.scope === 'createdByMe') {
    where.createdById = userId;
  } else if (q.scope === 'subAssignedByMe') {
    where.assignments = { some: { assignedById: userId, isSubAssignment: true } };
  } else if (!isAdminOrAbove(role) && q.scope !== 'all') {
    // Staff without an explicit scope only see tasks touching them.
    where.OR = [
      ...(where.OR ?? []),
      { assignments: { some: { assignedToId: userId } } },
      { createdById: userId },
    ];
  }

  // Non-admins are restricted to their own department's data when browsing "all".
  if (!isAdminOrAbove(role) && q.departmentId === undefined && q.scope === 'all') {
    where.assignments = {
      some: { assignedTo: { departmentId: myDeptId ?? undefined } },
    };
  }
  if (q.departmentId) {
    where.assignments = { some: { assignedTo: { departmentId: q.departmentId } } };
  }

  const [tasks, total] = await Promise.all([
    prisma.task.findMany({
      where,
      include: {
        assignments: {
          where: { active: true },
          include: { assignedTo: { select: { id: true, name: true } } },
        },
        createdBy: { select: { id: true, name: true } },
      },
      orderBy: [{ priority: 'asc' }, { dueDate: 'asc' }],
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
    }),
    prisma.task.count({ where }),
  ]);

  res.json({
    tasks: tasks.map((t) => ({
      ...t,
      pendingDays: pendingDays(t.assignments[0]?.createdAt ?? t.createdAt),
    })),
    pagination: { page: q.page, pageSize: q.pageSize, total },
  });
}

// ----------------------------------------------------------------------------
// Task detail — includes full movement timeline, comments, attachments
// ----------------------------------------------------------------------------

export async function getTask(req: AuthedRequest, res: Response) {
  const task = await prisma.task.findUnique({
    where: { id: req.params.id },
    include: {
      createdBy: { select: { id: true, name: true, designation: true } },
      assignments: {
        orderBy: { createdAt: 'asc' },
        include: {
          assignedTo: { select: { id: true, name: true, designation: true } },
          assignedBy: { select: { id: true, name: true, designation: true } },
        },
      },
      movements: {
        orderBy: { createdAt: 'asc' },
        include: { actor: { select: { id: true, name: true } } },
      },
      comments: {
        orderBy: { createdAt: 'asc' },
        include: { user: { select: { id: true, name: true } } },
      },
      attachments: {
        include: { uploadedBy: { select: { id: true, name: true } } },
      },
      subTasks: {
        select: { id: true, fileId: true, subject: true, status: true, priority: true },
      },
      parentTask: { select: { id: true, fileId: true, subject: true } },
    },
  });

  if (!task) throw new ApiError(404, 'Task not found.');
  res.json({ task });
}

// ----------------------------------------------------------------------------
// Assign / reassign (Admin) and Sub-assign (assignee with permission)
// ----------------------------------------------------------------------------

const assignSchema = z.object({
  assignedToId: z.string().min(1),
  instructions: z.string().optional(),
  dueDate: z.string().datetime().optional(),
});

export async function assignTask(req: AuthedRequest, res: Response) {
  const { role, userId } = req.user!;
  if (!isAdminOrAbove(role)) throw new ApiError(403, 'Only admins can (re)assign tasks directly.');

  const data = assignSchema.parse(req.body);
  const task = await prisma.task.findUnique({ where: { id: req.params.id } });
  if (!task) throw new ApiError(404, 'Task not found.');

  const assignee = await prisma.user.findUnique({ where: { id: data.assignedToId } });
  if (!assignee || assignee.status !== 'ACTIVE') throw new ApiError(400, 'Assignee not found or disabled.');

  await prisma.$transaction(async (tx) => {
    await tx.taskAssignment.updateMany({ where: { taskId: task.id, active: true }, data: { active: false } });
    await tx.taskAssignment.create({
      data: {
        taskId: task.id,
        assignedToId: data.assignedToId,
        assignedById: userId,
        instructions: data.instructions,
        dueDate: data.dueDate ? new Date(data.dueDate) : task.dueDate,
      },
    });
    await tx.task.update({ where: { id: task.id }, data: { status: TaskStatus.ASSIGNED } });
    await recordMovementTx(tx, {
      taskId: task.id,
      actorId: userId,
      action: 'ASSIGNED',
      previousStatus: task.status,
      newStatus: TaskStatus.ASSIGNED,
      remarks: `Reassigned to ${assignee.name}`,
    });
  });

  await notify({
    userId: data.assignedToId,
    type: 'TASK_ASSIGNED',
    title: 'Task assigned to you',
    message: `"${task.subject}" (${task.fileId}) has been assigned to you.`,
    taskId: task.id,
  });
  await audit({ userId, action: 'TASK_ASSIGNED', entityType: 'Task', entityId: task.id, req });

  res.json({ message: 'Task assigned.' });
}

export async function subAssignTask(req: AuthedRequest, res: Response) {
  const { role, userId, canSubAssign } = req.user!;
  const data = assignSchema.parse(req.body);

  const task = await prisma.task.findUnique({
    where: { id: req.params.id },
    include: { assignments: { where: { active: true } } },
  });
  if (!task) throw new ApiError(404, 'Task not found.');

  const isCurrentAssignee = task.assignments.some((a) => a.assignedToId === userId);
  if (!isAdminOrAbove(role) && !(isCurrentAssignee && canSubAssign)) {
    throw new ApiError(403, 'You do not have permission to sub-assign this task.');
  }

  const assignee = await prisma.user.findUnique({ where: { id: data.assignedToId } });
  if (!assignee || assignee.status !== 'ACTIVE') throw new ApiError(400, 'Assignee not found or disabled.');

  await prisma.$transaction(async (tx) => {
    await tx.taskAssignment.create({
      data: {
        taskId: task.id,
        assignedToId: data.assignedToId,
        assignedById: userId,
        instructions: data.instructions,
        dueDate: data.dueDate ? new Date(data.dueDate) : task.dueDate,
        isSubAssignment: true,
      },
    });
    await recordMovementTx(tx, {
      taskId: task.id,
      actorId: userId,
      action: 'SUB_ASSIGNED',
      remarks: `Sub-assigned to ${assignee.name}`,
    });
  });

  await notify({
    userId: data.assignedToId,
    type: 'TASK_SUB_ASSIGNED',
    title: 'Task sub-assigned to you',
    message: `"${task.subject}" (${task.fileId}) has been sub-assigned to you.`,
    taskId: task.id,
  });
  await audit({ userId, action: 'TASK_SUB_ASSIGNED', entityType: 'Task', entityId: task.id, req });

  res.json({ message: 'Task sub-assigned.' });
}

// ----------------------------------------------------------------------------
// Status transitions: acknowledge, start progress, submit, approve/return, close
// ----------------------------------------------------------------------------

const VALID_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  NEW: ['ASSIGNED'],
  ASSIGNED: ['ACKNOWLEDGED'],
  ACKNOWLEDGED: ['IN_PROGRESS'],
  IN_PROGRESS: ['PENDING', 'SUBMITTED'],
  PENDING: ['IN_PROGRESS', 'SUBMITTED'],
  SUBMITTED: ['UNDER_REVIEW'],
  UNDER_REVIEW: ['COMPLETED', 'RETURNED'],
  RETURNED: ['IN_PROGRESS'],
  COMPLETED: ['CLOSED'],
  CLOSED: [],
};

const statusSchema = z.object({
  status: z.nativeEnum(TaskStatus),
  remarks: z.string().optional(),
});

export async function updateTaskStatus(req: AuthedRequest, res: Response) {
  const { userId, role } = req.user!;
  const { status: newStatus, remarks } = statusSchema.parse(req.body);

  const task = await prisma.task.findUnique({
    where: { id: req.params.id },
    include: { assignments: { where: { active: true } } },
  });
  if (!task) throw new ApiError(404, 'Task not found.');

  const isAssignee = task.assignments.some((a) => a.assignedToId === userId);
  const reviewTransitions: TaskStatus[] = ['COMPLETED', 'RETURNED', 'CLOSED'];
  const requiresAdmin = reviewTransitions.includes(newStatus);

  if (requiresAdmin && !isAdminOrAbove(role)) {
    throw new ApiError(403, 'Only an admin/reviewer can approve, return, or close a task.');
  }
  if (!requiresAdmin && !isAssignee && !isAdminOrAbove(role)) {
    throw new ApiError(403, 'Only the assignee can update this task\'s progress.');
  }

  const allowed = VALID_TRANSITIONS[task.status] ?? [];
  if (!allowed.includes(newStatus)) {
    throw new ApiError(
      400,
      `Cannot move task from ${task.status} to ${newStatus}. Valid next steps: ${allowed.join(', ') || 'none'}.`,
    );
  }

  const actionMap: Partial<Record<TaskStatus, string>> = {
    ACKNOWLEDGED: 'ACKNOWLEDGED',
    IN_PROGRESS: 'STATUS_CHANGE',
    SUBMITTED: 'SUBMITTED',
    UNDER_REVIEW: 'STATUS_CHANGE',
    COMPLETED: 'APPROVED',
    RETURNED: 'RETURNED',
    CLOSED: 'CLOSED',
    PENDING: 'STATUS_CHANGE',
  };

  await prisma.$transaction(async (tx) => {
    await tx.task.update({
      where: { id: task.id },
      data: {
        status: newStatus,
        completionDate: newStatus === 'COMPLETED' ? new Date() : task.completionDate,
      },
    });
    await recordMovementTx(tx, {
      taskId: task.id,
      actorId: userId,
      action: actionMap[newStatus] ?? 'STATUS_CHANGE',
      previousStatus: task.status,
      newStatus,
      remarks,
    });
  });

  if (newStatus === 'RETURNED') {
    await Promise.all(
      task.assignments.map((a) =>
        notify({
          userId: a.assignedToId,
          type: 'TASK_RETURNED',
          title: 'Task returned for correction',
          message: remarks || `"${task.subject}" (${task.fileId}) was returned for correction.`,
          taskId: task.id,
        }),
      ),
    );
  } else if (newStatus === 'COMPLETED') {
    await notify({
      userId: task.createdById,
      type: 'TASK_APPROVED',
      title: 'Task approved',
      message: `"${task.subject}" (${task.fileId}) has been approved and marked complete.`,
      taskId: task.id,
    });
  }
  await audit({ userId, action: 'TASK_STATUS_CHANGE', entityType: 'Task', entityId: task.id, details: `${task.status} -> ${newStatus}`, req });

  res.json({ message: `Task moved to ${newStatus}.` });
}

// ----------------------------------------------------------------------------
// Comments
// ----------------------------------------------------------------------------

const commentSchema = z.object({ message: z.string().min(1) });

export async function addComment(req: AuthedRequest, res: Response) {
  const { message } = commentSchema.parse(req.body);
  const task = await prisma.task.findUnique({ where: { id: req.params.id } });
  if (!task) throw new ApiError(404, 'Task not found.');

  const comment = await prisma.taskComment.create({
    data: { taskId: task.id, userId: req.user!.userId, message },
    include: { user: { select: { id: true, name: true } } },
  });

  await recordMovement({
    taskId: task.id,
    actorId: req.user!.userId,
    action: 'COMMENT',
    remarks: message.slice(0, 140),
  });

  res.status(201).json({ comment });
}

// ----------------------------------------------------------------------------
// Pending task monitoring (admin)
// ----------------------------------------------------------------------------

export async function pendingMonitor(req: AuthedRequest, res: Response) {
  if (!isAdminOrAbove(req.user!.role)) throw new ApiError(403, 'Admins only.');

  const staffList = await prisma.user.findMany({
    where: { status: 'ACTIVE' },
    select: { id: true, name: true, designation: true },
  });

  const results = await Promise.all(
    staffList.map(async (s) => {
      const assignments = await prisma.taskAssignment.findMany({
        where: { assignedToId: s.id, active: true },
        include: { task: { select: { status: true, dueDate: true } } },
      });

      const total = assignments.length;
      const completed = assignments.filter((a) => a.task.status === 'COMPLETED' || a.task.status === 'CLOSED').length;
      const pending = assignments.filter(
        (a) => !['COMPLETED', 'CLOSED'].includes(a.task.status),
      ).length;
      const overdue = assignments.filter(
        (a) => a.task.dueDate && a.task.dueDate < new Date() && !['COMPLETED', 'CLOSED'].includes(a.task.status),
      ).length;

      const oldestPendingDays = assignments
        .filter((a) => !['COMPLETED', 'CLOSED'].includes(a.task.status))
        .map((a) => pendingDays(a.createdAt))
        .sort((a, b) => b - a)[0];

      return {
        staff: s,
        total,
        pending,
        completed,
        overdue,
        oldestPendingDays: oldestPendingDays ?? 0,
        oldestPendingBucket: oldestPendingDays !== undefined ? pendingBucket(oldestPendingDays) : null,
      };
    }),
  );

  res.json({ monitor: results });
}

// small helper so we can reuse recordMovement's shape inside a $transaction
async function recordMovementTx(
  tx: Prisma.TransactionClient,
  params: {
    taskId: string;
    actorId: string;
    action: string;
    previousStatus?: TaskStatus | null;
    newStatus?: TaskStatus | null;
    remarks?: string | null;
  },
) {
  return tx.taskMovement.create({
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
