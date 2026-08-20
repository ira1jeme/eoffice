import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth';
import {
  createTask,
  listTasks,
  getTask,
  assignTask,
  subAssignTask,
  updateTaskStatus,
  addComment,
  pendingMonitor,
} from '../controllers/task.controller';

const router = Router();

router.use(requireAuth);

router.get('/', listTasks);
router.get('/pending-monitor', requireRole('SUPER_ADMIN', 'ADMIN'), pendingMonitor);
router.get('/:id', getTask);
router.post('/', createTask);
router.post('/:id/assign', requireRole('SUPER_ADMIN', 'ADMIN'), assignTask);
router.post('/:id/sub-assign', subAssignTask); // permission checked inside (canSubAssign)
router.post('/:id/status', updateTaskStatus);
router.post('/:id/comments', addComment);

export default router;
