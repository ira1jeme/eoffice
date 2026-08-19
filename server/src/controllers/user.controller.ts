import { Response } from 'express';
import { z } from 'zod';
import { Role } from '@prisma/client';
import { prisma } from '../config/db';
import { hashPassword } from '../utils/password';
import { AuthedRequest, isAdminOrAbove } from '../middleware/auth';
import { ApiError } from '../middleware/errorHandler';
import { audit } from '../services/audit.service';

// Lightweight list for populating "assign to" dropdowns — any authenticated
// user can call this, but it only exposes non-sensitive fields.
export async function listStaffDirectory(req: AuthedRequest, res: Response) {
  const users = await prisma.user.findMany({
    where: { status: 'ACTIVE' },
    select: { id: true, name: true, designation: true, role: true, departmentId: true },
    orderBy: { name: 'asc' },
  });
  res.json({ users });
}

export async function listUsers(req: AuthedRequest, res: Response) {
  if (!isAdminOrAbove(req.user!.role)) throw new ApiError(403, 'Admins only.');
  const users = await prisma.user.findMany({
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      status: true,
      designation: true,
      phone: true,
      canSubAssign: true,
      department: { select: { id: true, name: true } },
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
  });
  res.json({ users });
}

const createUserSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8),
  role: z.nativeEnum(Role).default('STAFF'),
  designation: z.string().optional(),
  phone: z.string().optional(),
  departmentId: z.string().optional(),
  canSubAssign: z.boolean().default(false),
});

export async function createUser(req: AuthedRequest, res: Response) {
  if (!isAdminOrAbove(req.user!.role)) throw new ApiError(403, 'Admins only.');
  const data = createUserSchema.parse(req.body);

  const existing = await prisma.user.findUnique({ where: { email: data.email } });
  if (existing) throw new ApiError(409, 'A user with this email already exists.');

  // Only a Super Admin can create another Super Admin or Admin.
  if ((data.role === 'ADMIN' || data.role === 'SUPER_ADMIN') && req.user!.role !== 'SUPER_ADMIN') {
    throw new ApiError(403, 'Only a Super Admin can create Admin accounts.');
  }

  const { password, ...rest } = data;
  const user = await prisma.user.create({
    data: { ...rest, passwordHash: await hashPassword(password) },
  });

  await audit({ userId: req.user!.userId, action: 'USER_CREATED', entityType: 'User', entityId: user.id, details: user.email, req });

  res.status(201).json({
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
  });
}

const updateUserSchema = z.object({
  name: z.string().min(1).optional(),
  designation: z.string().optional(),
  phone: z.string().optional(),
  role: z.nativeEnum(Role).optional(),
  departmentId: z.string().optional(),
  canSubAssign: z.boolean().optional(),
  status: z.enum(['ACTIVE', 'DISABLED']).optional(),
});

export async function updateUser(req: AuthedRequest, res: Response) {
  if (!isAdminOrAbove(req.user!.role)) throw new ApiError(403, 'Admins only.');
  const data = updateUserSchema.parse(req.body);

  if (data.role && req.user!.role !== 'SUPER_ADMIN') {
    throw new ApiError(403, 'Only a Super Admin can change roles.');
  }

  const user = await prisma.user.update({ where: { id: req.params.id }, data });
  await audit({ userId: req.user!.userId, action: 'USER_UPDATED', entityType: 'User', entityId: user.id, req });
  res.json({ user: { id: user.id, name: user.name, role: user.role, status: user.status } });
}

const resetSchema = z.object({ newPassword: z.string().min(8) });

export async function adminResetPassword(req: AuthedRequest, res: Response) {
  if (!isAdminOrAbove(req.user!.role)) throw new ApiError(403, 'Admins only.');
  const { newPassword } = resetSchema.parse(req.body);
  await prisma.user.update({
    where: { id: req.params.id },
    data: { passwordHash: await hashPassword(newPassword) },
  });
  await audit({ userId: req.user!.userId, action: 'PASSWORD_RESET', entityType: 'User', entityId: req.params.id, req });
  res.json({ message: 'Password reset.' });
}
