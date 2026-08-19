import { Request, Response, NextFunction } from 'express';
import { verifyToken, JwtPayload } from '../utils/jwt';
import { prisma } from '../config/db';

export interface AuthedRequest extends Request {
  user?: JwtPayload & { canSubAssign: boolean; departmentId: string | null };
}

/** Verifies the Bearer JWT, loads a fresh user record (to catch disabled
 *  accounts / role changes immediately), and attaches it to req.user. */
export async function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing or invalid Authorization header.' });
    }
    const token = header.slice('Bearer '.length);
    const payload = verifyToken(token);

    const user = await prisma.user.findUnique({ where: { id: payload.userId } });
    if (!user || user.status !== 'ACTIVE') {
      return res.status(401).json({ error: 'Account not found or disabled.' });
    }

    req.user = {
      userId: user.id,
      role: user.role,
      canSubAssign: user.canSubAssign,
      departmentId: user.departmentId,
    };
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token.' });
  }
}

/** Restricts a route to one or more roles. Use after requireAuth. */
export function requireRole(...roles: Array<'SUPER_ADMIN' | 'ADMIN' | 'STAFF'>) {
  return (req: AuthedRequest, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'You do not have permission to perform this action.' });
    }
    next();
  };
}

export function isAdminOrAbove(role: string) {
  return role === 'SUPER_ADMIN' || role === 'ADMIN';
}
