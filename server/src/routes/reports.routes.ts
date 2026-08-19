import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { taskReport, staffReport, timeBasedReport, leaveReport } from '../controllers/reports.controller';

const router = Router();

router.use(requireAuth);

router.get('/tasks', taskReport);
router.get('/staff', staffReport);
router.get('/time-based', timeBasedReport);
router.get('/leave', leaveReport);

export default router;
