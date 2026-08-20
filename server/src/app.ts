import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';

import authRoutes from './routes/auth.routes';
import taskRoutes from './routes/task.routes';
import userRoutes from './routes/user.routes';
import dashboardRoutes from './routes/dashboard.routes';
import leaveRoutes from './routes/leave.routes';
import attachmentRoutes from './routes/attachment.routes';
import notificationRoutes from './routes/notification.routes';
import reportsRoutes from './routes/reports.routes';
import auditRoutes from './routes/audit.routes';
import { errorHandler, notFound } from './middleware/errorHandler';

export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(
    cors({
      origin: process.env.CLIENT_ORIGIN || 'https://playful-lokum-769a43.netlify.app',
      credentials: true,
    }),
  );
  app.use(express.json({ limit: '2mb' }));

  // General API rate limit (in addition to the stricter one on /auth/login).
  app.use(
    '/api',
    rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: 300,
      standardHeaders: true,
      legacyHeaders: false,
    }),
  );

  app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));

app.use('/api/auth', authRoutes);
  app.use('/api/tasks', taskRoutes);
  app.use('/api/users', userRoutes);
  app.use('/api/dashboard', dashboardRoutes);
  app.use('/api/leaves', leaveRoutes);
  app.use('/api/attachments', attachmentRoutes);
  app.use('/api/notifications', notificationRoutes);
  app.use('/api/reports', reportsRoutes);
  app.use('/api/audit-log', auditRoutes);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
