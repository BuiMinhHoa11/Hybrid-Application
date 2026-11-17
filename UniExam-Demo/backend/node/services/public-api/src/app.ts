import cors from 'cors';
import express from 'express';
import { getConfig } from '@uniexam/config';
import { requestLogger } from '@uniexam/observability';
import { healthHandler } from './health';
import { logger } from './logger';
import { authenticate } from './middleware/authenticate';
import { requireAdmin, requireStudent, requireTeacher } from './middleware/authorize';
import { handleErrors, notFoundHandler } from './middleware/error';
import { adminUsersRouter } from './modules/admin-users/admin-users.controller';
import { authRouter } from './modules/auth/auth.controller';
import { examPapersRouter } from './modules/exam-papers/exam-papers.controller';
import { examResultsRouter } from './modules/exam-results/exam-results.controller';
import { examsRouter } from './modules/exams/exams.controller';
import { questionBankRouter } from './modules/question-bank/question-bank.controller';
import { studentExamsRouter } from './modules/student-exams/student-exams.controller';
import { studentResultsRouter } from './modules/student-results/student-results.controller';
import { systemStatusRouter } from './modules/system-status/system-status.controller';

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
  app.use(express.json({ limit: '1mb' }));
  app.use(requestLogger(logger));

  app.get('/health', healthHandler);

  app.use('/auth', authRouter);

  app.use('/student/exams', authenticate, requireStudent, studentExamsRouter);
  app.use('/student/results', authenticate, requireStudent, studentResultsRouter);
  app.use('/teacher/questions', authenticate, requireTeacher, questionBankRouter);
  app.use('/teacher/papers', authenticate, requireTeacher, examPapersRouter);
  app.use('/teacher/exams', authenticate, requireTeacher, examsRouter);
  app.use('/teacher/exam-results', authenticate, requireTeacher, examResultsRouter);
  app.use('/admin/users', authenticate, requireAdmin, adminUsersRouter);
  app.use('/admin/system-status', authenticate, requireAdmin, systemStatusRouter);

  app.use(notFoundHandler);
  app.use(handleErrors);
  return app;
}
