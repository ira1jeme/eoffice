import { Response } from 'express';
import { prisma } from '../config/db';
import { AuthedRequest, isAdminOrAbove } from '../middleware/auth';

export async function getDashboard(req: AuthedRequest, res: Response) {
  const { userId, role } = req.user!;
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfToday = new Date(startOfToday.getTime() + 86400000);
  const endOfWeek = new Date(startOfToday.getTime() + 7 * 86400000);

  const openStatuses = [
    'NEW',
    'ASSIGNED',
    'ACKNOWLEDGED',
    'IN_PROGRESS',
    'PENDING',
    'SUBMITTED',
    'UNDER_REVIEW',
    'RETURNED',
  ] as const;

  const closedStatuses = ['COMPLETED', 'CLOSED'] as const;

  const scopeWhere = isAdminOrAbove(role)
    ? {}
    : { assignments: { some: { assignedToId: userId } } };

  const [
    totalTasks,
    pendingTasks,
    completedTasks,
    overdueTasks,
    dueToday,
    dueThisWeek,
    assignedToMe,
    subAssignedByMe,
    awaitingApproval,
    totalStaff,
    staffOnLeaveToday,
  ] = await Promise.all([
    prisma.task.count({ where: scopeWhere }),
    prisma.task.count({ where: { ...scopeWhere, status: { in: [...openStatuses] } } }),
    prisma.task.count({ where: { ...scopeWhere, status: { in: [...closedStatuses] } } }),
    prisma.task.count({
      where: { ...scopeWhere, dueDate: { lt: now }, status: { notIn: [...closedStatuses] } },
    }),
    prisma.task.count({
      where: {
        ...scopeWhere,
        dueDate: { gte: startOfToday, lt: endOfToday },
        status: { notIn: [...closedStatuses] },
      },
    }),
    prisma.task.count({
      where: {
        ...scopeWhere,
        dueDate: { gte: startOfToday, lt: endOfWeek },
        status: { notIn: [...closedStatuses] },
      },
    }),
    prisma.task.count({
      where: { assignments: { some: { assignedToId: userId, active: true } } },
    }),
    prisma.task.count({
      where: { assignments: { some: { assignedById: userId, isSubAssignment: true } } },
    }),
    prisma.task.count({ where: { ...scopeWhere, status: 'UNDER_REVIEW' } }),
    prisma.user.count({ where: { status: 'ACTIVE' } }),
    prisma.leaveRequest.count({
      where: { status: 'APPROVED', fromDate: { lte: now }, toDate: { gte: now } },
    }),
  ]);

  res.json({
    stats: {
      totalTasks,
      pendingTasks,
      completedTasks,
      overdueTasks,
      dueToday,
      dueThisWeek,
      assignedToMe,
      subAssignedByMe,
      awaitingApproval,
      totalStaff,
      staffOnLeaveToday,
    },
  });
}

export async function recentMovements(req: AuthedRequest, res: Response) {
  const { userId, role } = req.user!;

  const scopeWhere = isAdminOrAbove(role)
    ? {}
    : { task: { assignments: { some: { assignedToId: userId } } } };

  const movements = await prisma.taskMovement.findMany({
    where: scopeWhere,
    orderBy: { createdAt: 'desc' },
    take: 15,
    include: {
      actor: { select: { id: true, name: true } },
      task: { select: { id: true, fileId: true, subject: true } },
    },
  });

  res.json({ movements });
}
