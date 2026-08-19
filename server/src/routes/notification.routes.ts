import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { listNotifications, markRead, markAllRead } from '../controllers/notification.controller';

const router = Router();

router.use(requireAuth);

router.get('/', listNotifications);
router.post('/:id/read', markRead);
router.post('/read-all', markAllRead);

export default router;
