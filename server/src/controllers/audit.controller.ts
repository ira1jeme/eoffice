import { Response } from 'express';
import { z } from 'zod';
import { prisma } from '../config/db';
import { AuthedRequest, isAdminOrAbove } from '../middleware/auth';
import { ApiError } from '../middleware/errorHandler';

const querySchema = z.object({
  userId: z.string().optional(),
  action: z.string().optional(),
  entityType: z.string().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  page: z.coerce.number().min(1).default(1),
  pageSize: z.coerce.number().min(1).max(200).default(50),
});

export async function searchAuditLog(req: AuthedRequest, res: Response) {
  if (!isAdminOrAbove(req.user!.role)) throw new ApiError(403, 'Admins only.');
  const q = querySchema.parse(req.query);

  const where: any = {};
  if (q.userId) where.userId = q.userId;
  if (q.action) where.action = { contains: q.action, mode: 'insensitive' };
  if (q.entityType) where.entityType = q.entityType;
  if (q.from || q.to) {
    where.createdAt = {
      ...(q.from ? { gte: new Date(q.from) } : {}),
      ...(q.to ? { lte: new Date(q.to) } : {}),
    };
  }

  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      include: { user: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: 'desc' },
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
    }),
    prisma.auditLog.count({ where }),
  ]);

  res.json({ logs, pagination: { page: q.page, pageSize: q.pageSize, total } });
}
