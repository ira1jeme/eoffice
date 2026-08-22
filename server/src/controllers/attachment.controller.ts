import { Response } from 'express';
import crypto from 'crypto';

import { prisma } from '../config/db';
import { supabase, ATTACHMENT_BUCKET } from '../config/supabase';

import {
  AuthedRequest,
  isAdminOrAbove,
} from '../middleware/auth';

import { ApiError } from '../middleware/errorHandler';
import { audit } from '../services/audit.service';
import { recordMovement } from '../services/task.service';

// ----------------------------------------------------------------------------
// Helper — upload a file buffer to Supabase Storage
// ----------------------------------------------------------------------------

async function uploadToStorage(
  file: Express.Multer.File,
  folder: string
) {
  const originalName = file.originalname || 'file';

  const dotIndex = originalName.lastIndexOf('.');
  const extension =
    dotIndex >= 0 ? originalName.substring(dotIndex).toLowerCase() : '';

  const storagePath =
    `${folder}/${Date.now()}-${crypto.randomUUID()}${extension}`;

  const { error } = await supabase.storage
    .from(ATTACHMENT_BUCKET)
    .upload(storagePath, file.buffer, {
      contentType: file.mimetype,
      cacheControl: '3600',
      upsert: false,
    });

  if (error) {
    console.error('Supabase Storage upload error:', error);
    throw new ApiError(500, 'Unable to upload file.');
  }

  return storagePath;
}

// ----------------------------------------------------------------------------
// Helper — remove a file from Supabase Storage
// ----------------------------------------------------------------------------

async function removeFromStorage(storagePath: string) {
  const { error } = await supabase.storage
    .from(ATTACHMENT_BUCKET)
    .remove([storagePath]);

  if (error) {
    console.error('Supabase Storage cleanup error:', error);
  }
}

// ----------------------------------------------------------------------------
// Upload — attach a file to a task
// ----------------------------------------------------------------------------

export async function uploadTaskAttachment(
  req: AuthedRequest,
  res: Response
) {
  const file = req.file;

  if (!file) {
    throw new ApiError(400, 'No file uploaded.');
  }

  const task = await prisma.task.findUnique({
    where: {
      id: req.params.taskId,
    },
    include: {
      assignments: true,
    },
  });

  if (!task) {
    throw new ApiError(404, 'Task not found.');
  }

  const { userId, role } = req.user!;

  const isInvolved =
    task.createdById === userId ||
    task.assignments.some(
      (assignment) => assignment.assignedToId === userId
    );

  if (!isAdminOrAbove(role) && !isInvolved) {
    throw new ApiError(
      403,
      'You do not have access to this task.'
    );
  }

  // Upload actual file to Supabase Storage
  const storagePath = await uploadToStorage(
    file,
    `tasks/${task.id}`
  );

  let attachment;

  try {
    // Save attachment metadata in PostgreSQL
    attachment = await prisma.attachment.create({
      data: {
        taskId: task.id,
        uploadedById: userId,
        fileName: file.originalname,
        filePath: storagePath,
        fileType: file.mimetype,
        fileSize: file.size,
      },
      include: {
        uploadedBy: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });
  } catch (error) {
    // If DB creation fails, don't leave an orphan file in Storage
    await removeFromStorage(storagePath);
    throw error;
  }

  await recordMovement({
    taskId: task.id,
    actorId: userId,
    action: 'DOCUMENT_UPLOADED',
    remarks: file.originalname,
  });

  await audit({
    userId,
    action: 'FILE_UPLOADED',
    entityType: 'Task',
    entityId: task.id,
    details: file.originalname,
    req,
  });

  res.status(201).json({
    attachment,
  });
}

// ----------------------------------------------------------------------------
// Upload — attach a supporting document to a leave request
// ----------------------------------------------------------------------------

export async function uploadLeaveAttachment(
  req: AuthedRequest,
  res: Response
) {
  const file = req.file;

  if (!file) {
    throw new ApiError(400, 'No file uploaded.');
  }

  const leave = await prisma.leaveRequest.findUnique({
    where: {
      id: req.params.leaveId,
    },
  });

  if (!leave) {
    throw new ApiError(
      404,
      'Leave request not found.'
    );
  }

  const { userId, role } = req.user!;

  if (
    leave.userId !== userId &&
    !isAdminOrAbove(role)
  ) {
    throw new ApiError(
      403,
      'You do not have access to this leave request.'
    );
  }

  // Upload actual file to Supabase Storage
  const storagePath = await uploadToStorage(
    file,
    `leave/${leave.id}`
  );

  let attachment;

  try {
    // Save attachment metadata in PostgreSQL
    attachment = await prisma.attachment.create({
      data: {
        leaveRequestId: leave.id,
        uploadedById: userId,
        fileName: file.originalname,
        filePath: storagePath,
        fileType: file.mimetype,
        fileSize: file.size,
      },
    });
  } catch (error) {
    await removeFromStorage(storagePath);
    throw error;
  }

  await audit({
    userId,
    action: 'FILE_UPLOADED',
    entityType: 'LeaveRequest',
    entityId: leave.id,
    details: file.originalname,
    req,
  });

  res.status(201).json({
    attachment,
  });
}

// ----------------------------------------------------------------------------
// Download — authenticated, access-checked
// ----------------------------------------------------------------------------

export async function downloadAttachment(
  req: AuthedRequest,
  res: Response
) {
  const attachment = await prisma.attachment.findUnique({
    where: {
      id: req.params.id,
    },
    include: {
      task: {
        include: {
          assignments: true,
        },
      },
      leaveRequest: true,
    },
  });

  if (!attachment) {
    throw new ApiError(404, 'File not found.');
  }

  const { userId, role } = req.user!;

  let allowed = isAdminOrAbove(role);

  // Task attachment permissions
  if (!allowed && attachment.task) {
    allowed =
      attachment.task.createdById === userId ||
      attachment.task.assignments.some(
        (assignment) =>
          assignment.assignedToId === userId
      );
  }

  // Leave attachment permissions
  if (!allowed && attachment.leaveRequest) {
    allowed =
      attachment.leaveRequest.userId === userId;
  }

  if (!allowed) {
    throw new ApiError(
      403,
      'You do not have access to this file.'
    );
  }

  // Download from Supabase Storage
  const { data, error } = await supabase.storage
    .from(ATTACHMENT_BUCKET)
    .download(attachment.filePath);

  if (error || !data) {
    console.error(
      'Supabase Storage download error:',
      error
    );

    throw new ApiError(
      404,
      'The attachment file could not be found.'
    );
  }

  const arrayBuffer = await data.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  await audit({
    userId,
    action: 'FILE_DOWNLOADED',
    entityType: attachment.taskId
      ? 'Task'
      : 'LeaveRequest',
    entityId:
      attachment.taskId ??
      attachment.leaveRequestId ??
      undefined,
    details: attachment.fileName,
    req,
  });

  res.setHeader(
    'Content-Type',
    attachment.fileType ||
      'application/octet-stream'
  );

  res.setHeader(
    'Content-Length',
    buffer.length.toString()
  );

  res.setHeader(
    'Content-Disposition',
    `attachment; filename*=UTF-8''${encodeURIComponent(
      attachment.fileName
    )}`
  );

  res.send(buffer);
}