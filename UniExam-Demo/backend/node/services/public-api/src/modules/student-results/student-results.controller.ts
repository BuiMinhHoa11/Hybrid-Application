import { Router } from 'express';
import { asyncHandler } from '@uniexam/observability';
import { z } from 'zod';
import * as service from './student-results.service';

export const studentResultsRouter = Router();

studentResultsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    res.json(await service.list(req.user!.id));
  })
);

studentResultsRouter.get(
  '/:examId',
  asyncHandler(async (req, res) => {
    const { examId } = z.object({ examId: z.string().uuid() }).parse(req.params);
    res.json(await service.detail(req.user!.id, examId));
  })
);
