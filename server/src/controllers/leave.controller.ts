import { Response } from 'express';
import { z } from 'zod';
import { LeaveStatus, LeaveType } from '@prisma/client';
import { prisma } from '../config/db';
import { AuthedRequest, isAdminOrAbove } from '../middleware/auth';
import { ApiError } from '../middleware/errorHandler';
import { notify } from '../services/notification.service';
import { audit } from '../services/audit.service';

function daysBetween(from: Date, to: Date): number {
  const ms = to.getTime() - from.getTime();
  return Math.floor(ms / 86400000) + 1; // inclusive of both ends
}

// ----------------------------------------------------------------------------
// Apply for leave
// ----------------------------------------------------------------------------

const applySchema = z.object({
  leaveType: z.nativeEnum(LeaveType),
  fromDate: z.string().datetime(),
  toDate: z.string().datetime(),
  reason: z.string().min(1, 'Reason is required.'),
});

export async function applyLeave(req: AuthedRequest, res: Response) {
  const data = applySchema.parse(req.body);
  const from = new Date(data.fromDate);
  const to = new Date(data.toDate);

  if (to < from) throw new ApiError(400, '"To" date cannot be before "From" date.');

  const days = daysBetween(from, to);
  const userId = req.user!.userId;

  const leave = await prisma.leaveRequest.create({
    data: {
      userId,
      leaveType: data.leaveType,
      fromDate: from,
      toDate: to,
      days,
      reason: data.reason,
      status: LeaveStatus.PENDING_APPROVAL,
    },
  });

  // Notify admins / office heads so approval isn't missed.
  const approvers = await prisma.user.findMany({
    where: { role: { in: ['ADMIN', 'SUPER_ADMIN'] }, status: 'ACTIVE' },
    select: { id: true },
  });
  const applicant = await prisma.user.findUnique({ where: { id: userId }, select: { name: true } });
  await Promise.all(
    approvers.map((a) =>
      notify({
        userId: a.id,
        type: 'LEAVE_APPLIED',
        title: 'New leave request',
        message: `${applicant?.name} applied for ${days} day(s) of ${data.leaveType.toLowerCase()} leave.`,
        leaveRequestId: leave.id,
      }),
    ),
  );

  await audit({ userId, action: 'LEAVE_APPLIED', entityType: 'LeaveRequest', entityId: leave.id, req });

  res.status(201).json({ leave });
}

// ----------------------------------------------------------------------------
// List — staff see their own, admins can see everyone's
// ----------------------------------------------------------------------------

const listSchema = z.object({
  scope: z.enum(['mine', 'all']).default('mine'),
  status: z.nativeEnum(LeaveStatus).optional(),
  userId: z.string().optional(),
});

export async function listLeaves(req: AuthedRequest, res: Response) {
  const q = listSchema.parse(req.query);
  const { userId, role } = req.user!;

  if (q.scope === 'all' && !isAdminOrAbove(role)) {
    throw new ApiError(403, 'Admins only.');
  }

  const where: any = {};
  if (q.scope === 'mine') where.userId = userId;
  if (q.userId && isAdminOrAbove(role)) where.userId = q.userId;
  if (q.status) where.status = q.status;

  const leaves = await prisma.leaveRequest.findMany({
    where,
    include: {
      user: { select: { id: true, name: true, designation: true } },
      reviewedBy: { select: { id: true, name: true } },
      attachments: true,
    },
    orderBy: { createdAt: 'desc' },
  });

  res.json({ leaves });
}

// Staff currently on leave — used by the dashboard widget.
export async function onLeaveToday(req: AuthedRequest, res: Response) {
  const now = new Date();
  const leaves = await prisma.leaveRequest.findMany({
    where: {
      status: 'APPROVED',
      fromDate: { lte: now },
      toDate: { gte: now },
    },
    include: { user: { select: { id: true, name: true, designation: true } } },
  });
  res.json({ leaves });
}

// ----------------------------------------------------------------------------
// Approve / Reject (admin) and Cancel (own request, if not yet reviewed)
// ----------------------------------------------------------------------------

const reviewSchema = z.object({ remarks: z.string().optional() });

async function reviewLeave(req: AuthedRequest, res: Response, newStatus: 'APPROVED' | 'REJECTED') {
  if (!isAdminOrAbove(req.user!.role)) throw new ApiError(403, 'Admins only.');
  const { remarks } = reviewSchema.parse(req.body);

  const leave = await prisma.leaveRequest.findUnique({ where: { id: req.params.id } });
  if (!leave) throw new ApiError(404, 'Leave request not found.');
  if (leave.status !== 'PENDING_APPROVAL' && leave.status !== 'APPLIED') {
    throw new ApiError(400, `This request has already been ${leave.status.toLowerCase()}.`);
  }

  const updated = await prisma.leaveRequest.update({
    where: { id: leave.id },
    data: {
      status: newStatus,
      reviewedById: req.user!.userId,
      reviewRemarks: remarks,
      reviewedAt: new Date(),
    },
  });

  await notify({
    userId: leave.userId,
    type: newStatus === 'APPROVED' ? 'LEAVE_APPROVED' : 'LEAVE_REJECTED',
    title: `Leave request ${newStatus.toLowerCase()}`,
    message: remarks || `Your leave request has been ${newStatus.toLowerCase()}.`,
    leaveRequestId: leave.id,
  });

  await audit({
    userId: req.user!.userId,
    action: `LEAVE_${newStatus}`,
    entityType: 'LeaveRequest',
    entityId: leave.id,
    req,
  });

  res.json({ leave: updated });
}

export const approveLeave = (req: AuthedRequest, res: Response) => reviewLeave(req, res, 'APPROVED');
export const rejectLeave = (req: AuthedRequest, res: Response) => reviewLeave(req, res, 'REJECTED');

export async function cancelLeave(req: AuthedRequest, res: Response) {
  const leave = await prisma.leaveRequest.findUnique({ where: { id: req.params.id } });
  if (!leave) throw new ApiError(404, 'Leave request not found.');

  const isOwner = leave.userId === req.user!.userId;
  if (!isOwner && !isAdminOrAbove(req.user!.role)) {
    throw new ApiError(403, 'You can only cancel your own leave request.');
  }
  if (leave.status === 'APPROVED' || leave.status === 'REJECTED') {
    throw new ApiError(400, `Cannot cancel a request that is already ${leave.status.toLowerCase()}.`);
  }

  const updated = await prisma.leaveRequest.update({
    where: { id: leave.id },
    data: { status: 'CANCELLED' },
  });

  res.json({ leave: updated });
}
