import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth';
import { searchAuditLog } from '../controllers/audit.controller';

const router = Router();

router.use(requireAuth, requireRole('SUPER_ADMIN', 'ADMIN'));
router.get('/', searchAuditLog);

export default router;
