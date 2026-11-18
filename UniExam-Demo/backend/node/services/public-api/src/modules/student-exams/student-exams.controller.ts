import { Router } from 'express';
import { asyncHandler } from '@uniexam/observability';
import { uuidParam } from '../common';
import * as service from './student-exams.service';

export const studentExamsRouter = Router();

studentExamsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    res.json(await service.list(req.user!.id));
  })
);

studentExamsRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const { id } = uuidParam.parse(req.params);
    res.json(await service.detail(req.user!.id, id));
  })
);
