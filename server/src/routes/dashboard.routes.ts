import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { getDashboard, recentMovements } from '../controllers/dashboard.controller';

const router = Router();

router.use(requireAuth);
router.get('/', getDashboard);
router.get('/recent-movements', recentMovements);

export default router;
