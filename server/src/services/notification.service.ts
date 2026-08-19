import { prisma } from '../config/db';
import { NotificationType } from '@prisma/client';

export async function notify(params: {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  taskId?: string;
  leaveRequestId?: string;
}) {
  return prisma.notification.create({
    data: {
      userId: params.userId,
      type: params.type,
      title: params.title,
      message: params.message,
      taskId: params.taskId,
      leaveRequestId: params.leaveRequestId,
    },
  });
}

/** Notify several users at once (e.g. all admins) without failing the whole
 *  batch if one insert has a problem. */
export async function notifyMany(
  userIds: string[],
  params: Omit<Parameters<typeof notify>[0], 'userId'>,
) {
  await Promise.all(userIds.map((userId) => notify({ ...params, userId })));
}
