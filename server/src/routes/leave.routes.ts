import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import {
  applyLeave,
  listLeaves,
  onLeaveToday,
  approveLeave,
  rejectLeave,
  cancelLeave,
} from '../controllers/leave.controller';

const router = Router();

router.use(requireAuth);

router.get('/', listLeaves);
router.get('/on-leave-today', onLeaveToday);
router.post('/', applyLeave);
router.post('/:id/approve', approveLeave);
router.post('/:id/reject', rejectLeave);
router.post('/:id/cancel', cancelLeave);

export default router;
