import { Router } from 'express';

import rateLimit from 'express-rate-limit';

import {
  login,
  logout,
  me,
  requestPasswordReset,
  resetPassword,
  changePasswordBeforeLogin,
} from '../controllers/auth.controller';

import { requireAuth } from '../middleware/auth';

const router = Router();

// ============================================================================
// LOGIN RATE LIMIT
// ============================================================================

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,

  limit: 10,

  standardHeaders: true,

  legacyHeaders: false,

  message: {
    error:
      'Too many login attempts. Please try again later.',
  },
});

// ============================================================================
// LOGIN
// ============================================================================

router.post(
  '/login',
  loginLimiter,
  login
);

// ============================================================================
// CURRENT USER
// ============================================================================

router.get(
  '/me',
  requireAuth,
  me
);

// ============================================================================
// LOGOUT
// ============================================================================

router.post(
  '/logout',
  requireAuth,
  logout
);

// ============================================================================
// FORGOT PASSWORD / REQUEST RESET
// ============================================================================

router.post(
  '/request-password-reset',
  loginLimiter,
  requestPasswordReset
);

// ============================================================================
// RESET PASSWORD USING TOKEN
// ============================================================================

router.post(
  '/reset-password',
  resetPassword
);

// ============================================================================
// CHANGE PASSWORD BEFORE LOGIN
// ============================================================================
//
// IMPORTANT:
// No requireAuth here.
//
// The user does NOT need to log in first.
//
// Email + Current Password are used to authenticate the
// password-change request.
//
// ============================================================================

router.post(
  '/change-password-before-login',
  loginLimiter,
  changePasswordBeforeLogin
);
router.post('/test-auth-route', (_req, res) => {
  res.json({
    message: 'Auth router is working',
  });
});

export default router;