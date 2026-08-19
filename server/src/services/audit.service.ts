import { Request } from 'express';
import { prisma } from '../config/db';

export async function audit(params: {
  userId?: string | null;
  action: string;
  entityType?: string;
  entityId?: string;
  details?: string;
  req?: Request;
}) {
  try {
    await prisma.auditLog.create({
      data: {
        userId: params.userId ?? undefined,
        action: params.action,
        entityType: params.entityType,
        entityId: params.entityId,
        details: params.details,
        ipAddress: params.req?.ip,
      },
    });
  } catch (err) {
    // Audit logging must never break the primary request flow.
    console.error('Failed to write audit log:', err);
  }
}
