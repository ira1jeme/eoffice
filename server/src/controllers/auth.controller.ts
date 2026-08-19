import { Request, Response } from 'express';
import crypto from 'crypto';
import { z } from 'zod';

import { prisma } from '../config/db';
import { comparePassword, hashPassword } from '../utils/password';
import { signToken } from '../utils/jwt';
import { AuthedRequest } from '../middleware/auth';
import { audit } from '../services/audit.service';

// ============================================================================
// LOGIN
// ============================================================================

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function login(req: Request, res: Response) {
  const { email, password } = loginSchema.parse(req.body);

  const user = await prisma.user.findUnique({
    where: { email },
  });

  // Do not reveal whether the email exists.
  if (!user || user.status !== 'ACTIVE') {
    return res.status(401).json({
      error: 'Invalid email or password.',
    });
  }

  const valid = await comparePassword(
    password,
    user.passwordHash
  );

  if (!valid) {
    return res.status(401).json({
      error: 'Invalid email or password.',
    });
  }

  const token = signToken({
    userId: user.id,
    role: user.role,
  });

  await audit({
    userId: user.id,
    action: 'LOGIN',
    entityType: 'User',
    entityId: user.id,
    req,
  });

  return res.json({
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      designation: user.designation,
      departmentId: user.departmentId,
      canSubAssign: user.canSubAssign,
    },
  });
}

// ============================================================================
// LOGOUT
// ============================================================================

export async function logout(
  req: AuthedRequest,
  res: Response
) {
  await audit({
    userId: req.user!.userId,
    action: 'LOGOUT',
    entityType: 'User',
    entityId: req.user!.userId,
    req,
  });

  return res.json({
    message: 'Logged out.',
  });
}

// ============================================================================
// CURRENT USER
// ============================================================================

export async function me(
  req: AuthedRequest,
  res: Response
) {
  const user = await prisma.user.findUnique({
    where: {
      id: req.user!.userId,
    },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      designation: true,
      departmentId: true,
      canSubAssign: true,
      department: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });

  return res.json({
    user,
  });
}

// ============================================================================
// REQUEST PASSWORD RESET
// ============================================================================

const requestResetSchema = z.object({
  email: z.string().email(),
});

export async function requestPasswordReset(
  req: Request,
  res: Response
) {
  const { email } = requestResetSchema.parse(req.body);

  const user = await prisma.user.findUnique({
    where: { email },
  });

  // Always return the same response.
  if (!user) {
    return res.json({
      message:
        'If that email is registered, a reset link has been generated.',
    });
  }

  const token = crypto.randomBytes(32).toString('hex');

  const expires = new Date(
    Date.now() + 60 * 60 * 1000
  );

  await prisma.user.update({
    where: {
      id: user.id,
    },
    data: {
      passwordResetToken: token,
      passwordResetExpires: expires,
    },
  });

  return res.json({
    message:
      'If that email is registered, a reset link has been generated.',

    // Development only.
    devResetToken:
      process.env.NODE_ENV !== 'production'
        ? token
        : undefined,
  });
}

// ============================================================================
// RESET PASSWORD USING RESET TOKEN
// ============================================================================

const resetPasswordSchema = z.object({
  token: z.string().min(1),

  newPassword: z
    .string()
    .min(
      8,
      'Password must be at least 8 characters.'
    ),
});

export async function resetPassword(
  req: Request,
  res: Response
) {
  const {
    token,
    newPassword,
  } = resetPasswordSchema.parse(req.body);

  const user = await prisma.user.findFirst({
    where: {
      passwordResetToken: token,

      passwordResetExpires: {
        gt: new Date(),
      },
    },
  });

  if (!user) {
    return res.status(400).json({
      error:
        'Reset token is invalid or has expired.',
    });
  }

  const passwordHash =
    await hashPassword(newPassword);

  await prisma.user.update({
    where: {
      id: user.id,
    },

    data: {
      passwordHash,

      passwordResetToken: null,

      passwordResetExpires: null,
    },
  });

  await audit({
    userId: user.id,
    action: 'PASSWORD_RESET',
    entityType: 'User',
    entityId: user.id,
    req,
  });

  return res.json({
    message:
      'Password has been reset. You can now log in.',
  });
}

// ============================================================================
// CHANGE PASSWORD BEFORE LOGIN
// ============================================================================
//
// This endpoint DOES NOT require JWT authentication.
//
// User provides:
//
// Email
// Current Password
// New Password
// Retype New Password
//
// The current password is verified directly against the stored passwordHash.
// ============================================================================

const changePasswordBeforeLoginSchema = z.object({
  email: z.string().email(
    'Please enter a valid email address.'
  ),

  currentPassword: z
    .string()
    .min(
      1,
      'Current password is required.'
    ),

  newPassword: z
    .string()
    .min(
      8,
      'Password must be at least 8 characters.'
    ),

  confirmPassword: z
    .string()
    .min(
      1,
      'Please retype the new password.'
    ),
});

export async function changePasswordBeforeLogin(
  req: Request,
  res: Response
) {
  const {
    email,
    currentPassword,
    newPassword,
    confirmPassword,
  } =
    changePasswordBeforeLoginSchema.parse(
      req.body
    );

  // --------------------------------------------------------------------------
  // Check that new passwords match
  // --------------------------------------------------------------------------

  if (newPassword !== confirmPassword) {
    return res.status(400).json({
      error:
        'New password and retyped password do not match.',
    });
  }

  // --------------------------------------------------------------------------
  // Find user
  // --------------------------------------------------------------------------

  const user = await prisma.user.findUnique({
    where: {
      email,
    },
  });

  // Keep this generic so we don't reveal whether
  // an email is registered.
  if (!user || user.status !== 'ACTIVE') {
    return res.status(401).json({
      error:
        'Current password is incorrect.',
    });
  }

  // --------------------------------------------------------------------------
  // Verify current password
  // --------------------------------------------------------------------------

  const validCurrentPassword =
    await comparePassword(
      currentPassword,
      user.passwordHash
    );

  if (!validCurrentPassword) {
    return res.status(401).json({
      error:
        'Current password is incorrect.',
    });
  }

  // --------------------------------------------------------------------------
  // Prevent using the same password
  // --------------------------------------------------------------------------

  const samePassword =
    await comparePassword(
      newPassword,
      user.passwordHash
    );

  if (samePassword) {
    return res.status(400).json({
      error:
        'New password must be different from your current password.',
    });
  }

  // --------------------------------------------------------------------------
  // Hash new password
  // --------------------------------------------------------------------------

  const newPasswordHash =
    await hashPassword(newPassword);

  // --------------------------------------------------------------------------
  // Update database
  // --------------------------------------------------------------------------

  await prisma.user.update({
    where: {
      id: user.id,
    },

    data: {
      passwordHash: newPasswordHash,

      // Invalidate any existing reset token.
      passwordResetToken: null,
      passwordResetExpires: null,
    },
  });

  // --------------------------------------------------------------------------
  // Audit log
  // --------------------------------------------------------------------------

  await audit({
    userId: user.id,
    action: 'PASSWORD_CHANGED_BEFORE_LOGIN',
    entityType: 'User',
    entityId: user.id,
    req,
  });

  return res.json({
    message:
      'Password changed successfully. You can now log in with your new password.',
  });
}