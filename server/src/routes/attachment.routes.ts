import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { upload } from '../middleware/upload';
import {
  uploadTaskAttachment,
  uploadLeaveAttachment,
  downloadAttachment,
} from '../controllers/attachment.controller';

const router = Router();

router.use(requireAuth);

router.post('/tasks/:taskId', upload.single('file'), uploadTaskAttachment);
router.post('/leaves/:leaveId', upload.single('file'), uploadLeaveAttachment);
router.get('/:id/download', downloadAttachment);

export default router;
