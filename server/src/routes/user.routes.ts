import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth';
import {
  listStaffDirectory,
  listUsers,
  createUser,
  updateUser,
  adminResetPassword,
} from '../controllers/user.controller';

const router = Router();

router.use(requireAuth);

router.get('/directory', listStaffDirectory);
router.get('/', requireRole('SUPER_ADMIN', 'ADMIN'), listUsers);
router.post('/', requireRole('SUPER_ADMIN', 'ADMIN'), createUser);
router.patch('/:id', requireRole('SUPER_ADMIN', 'ADMIN'), updateUser);
router.post('/:id/reset-password', requireRole('SUPER_ADMIN', 'ADMIN'), adminResetPassword);

export default router;
