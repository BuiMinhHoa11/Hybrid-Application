import cors from 'cors';
import express from 'express';
import { getConfig } from '@uniexam/config';
import { requestLogger } from '@uniexam/observability';
import { healthHandler } from './health';
import { logger } from './logger';
import { authenticate } from './middleware/authenticate';
import { requireInternal, requireStudent } from './middleware/authorize';
import { handleErrors, notFoundHandler } from './middleware/error';
import { answersRouter } from './modules/answers/answers.controller';
import { examSessionsRouter } from './modules/exam-sessions/exam-sessions.controller';
import { gradingRouter } from './modules/grading-gateway/grading-gateway.controller';
import { submissionsRouter } from './modules/submissions/submissions.controller';

export function createApp() {
  const cfg = getConfig();
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(
    cors({
      origin: cfg.corsOrigin === '*' ? true : cfg.corsOrigin.split(',').map((o) => o.trim()),
      allowedHeaders: ['Content-Type', 'Authorization']
    })
  );
  app.use(express.json({ limit: '256kb' }));
  app.use(requestLogger(logger));

  app.get('/health', healthHandler);

  // Phiên làm bài: chỉ sinh viên đã đăng nhập.
  app.use('/exam-sessions', authenticate, requireStudent, examSessionsRouter, answersRouter, submissionsRouter);

  // Cổng chấm bài: chỉ grading-worker có khóa nội bộ.
  app.use('/grading', requireInternal, gradingRouter);

  app.use(notFoundHandler);
  app.use(handleErrors);
  return app;
}
