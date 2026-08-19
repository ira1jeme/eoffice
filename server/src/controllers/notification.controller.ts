import { Response } from 'express';
import { prisma } from '../config/db';
import { AuthedRequest } from '../middleware/auth';
import { ApiError } from '../middleware/errorHandler';

export async function listNotifications(req: AuthedRequest, res: Response) {
  const notifications = await prisma.notification.findMany({
    where: { userId: req.user!.userId },
    orderBy: { createdAt: 'desc' },
    take: 50,
    include: {
      task: { select: { id: true, fileId: true, subject: true } },
      leaveRequest: { select: { id: true, leaveType: true } },
    },
  });
  const unreadCount = await prisma.notification.count({
    where: { userId: req.user!.userId, read: false },
  });
  res.json({ notifications, unreadCount });
}

export async function markRead(req: AuthedRequest, res: Response) {
  const notification = await prisma.notification.findUnique({ where: { id: req.params.id } });
  if (!notification || notification.userId !== req.user!.userId) {
    throw new ApiError(404, 'Notification not found.');
  }
  await prisma.notification.update({ where: { id: notification.id }, data: { read: true } });
  res.json({ message: 'Marked as read.' });
}

export async function markAllRead(req: AuthedRequest, res: Response) {
  await prisma.notification.updateMany({
    where: { userId: req.user!.userId, read: false },
    data: { read: true },
  });
  res.json({ message: 'All notifications marked as read.' });
}
