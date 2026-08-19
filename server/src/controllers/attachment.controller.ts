import { Response } from 'express';
import path from 'path';
import { prisma } from '../config/db';
import { AuthedRequest, isAdminOrAbove } from '../middleware/auth';
import { ApiError } from '../middleware/errorHandler';
import { UPLOAD_DIR } from '../middleware/upload';
import { audit } from '../services/audit.service';
import { recordMovement } from '../services/task.service';

// ----------------------------------------------------------------------------
// Upload — attach a file to a task
// ----------------------------------------------------------------------------

export async function uploadTaskAttachment(req: AuthedRequest, res: Response) {
  const file = req.file;
  if (!file) throw new ApiError(400, 'No file uploaded.');

  const task = await prisma.task.findUnique({
    where: { id: req.params.taskId },
    include: { assignments: true },
  });
  if (!task) throw new ApiError(404, 'Task not found.');

  const { userId, role } = req.user!;
  const isInvolved =
    task.createdById === userId || task.assignments.some((a) => a.assignedToId === userId);
  if (!isAdminOrAbove(role) && !isInvolved) {
    throw new ApiError(403, 'You do not have access to this task.');
  }

  const attachment = await prisma.attachment.create({
    data: {
      taskId: task.id,
      uploadedById: userId,
      fileName: file.originalname,
      filePath: file.filename,
      fileType: file.mimetype,
      fileSize: file.size,
    },
    include: { uploadedBy: { select: { id: true, name: true } } },
  });

  await recordMovement({
    taskId: task.id,
    actorId: userId,
    action: 'DOCUMENT_UPLOADED',
    remarks: file.originalname,
  });
  await audit({ userId, action: 'FILE_UPLOADED', entityType: 'Task', entityId: task.id, details: file.originalname, req });

  res.status(201).json({ attachment });
}

// ----------------------------------------------------------------------------
// Upload — attach a supporting document to a leave request
// ----------------------------------------------------------------------------

export async function uploadLeaveAttachment(req: AuthedRequest, res: Response) {
  const file = req.file;
  if (!file) throw new ApiError(400, 'No file uploaded.');

  const leave = await prisma.leaveRequest.findUnique({ where: { id: req.params.leaveId } });
  if (!leave) throw new ApiError(404, 'Leave request not found.');

  const { userId, role } = req.user!;
  if (leave.userId !== userId && !isAdminOrAbove(role)) {
    throw new ApiError(403, 'You do not have access to this leave request.');
  }

  const attachment = await prisma.attachment.create({
    data: {
      leaveRequestId: leave.id,
      uploadedById: userId,
      fileName: file.originalname,
      filePath: file.filename,
      fileType: file.mimetype,
      fileSize: file.size,
    },
  });

  await audit({ userId, action: 'FILE_UPLOADED', entityType: 'LeaveRequest', entityId: leave.id, details: file.originalname, req });

  res.status(201).json({ attachment });
}

// ----------------------------------------------------------------------------
// Download — authenticated, access-checked
// ----------------------------------------------------------------------------

export async function downloadAttachment(req: AuthedRequest, res: Response) {
  const attachment = await prisma.attachment.findUnique({
    where: { id: req.params.id },
    include: {
      task: { include: { assignments: true } },
      leaveRequest: true,
    },
  });
  if (!attachment) throw new ApiError(404, 'File not found.');

  const { userId, role } = req.user!;
  let allowed = isAdminOrAbove(role);

  if (!allowed && attachment.task) {
    allowed =
      attachment.task.createdById === userId ||
      attachment.task.assignments.some((a) => a.assignedToId === userId);
  }
  if (!allowed && attachment.leaveRequest) {
    allowed = attachment.leaveRequest.userId === userId;
  }
  if (!allowed) throw new ApiError(403, 'You do not have access to this file.');

  await audit({
    userId,
    action: 'FILE_DOWNLOADED',
    entityType: attachment.taskId ? 'Task' : 'LeaveRequest',
    entityId: attachment.taskId ?? attachment.leaveRequestId ?? undefined,
    details: attachment.fileName,
    req,
  });

  const absolutePath = path.join(UPLOAD_DIR, attachment.filePath);
  res.download(absolutePath, attachment.fileName);
}
