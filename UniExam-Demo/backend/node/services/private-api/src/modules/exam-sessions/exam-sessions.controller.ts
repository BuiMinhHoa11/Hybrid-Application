import { Router } from 'express';
import { asyncHandler } from '@uniexam/observability';
import { uuidParam } from '../common';
import { startSessionBody } from './exam-sessions.dto';
import * as service from './exam-sessions.service';

export const examSessionsRouter = Router();

examSessionsRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const { examId } = startSessionBody.parse(req.body);
    const result = await service.start(req.user!, examId);
    res.status(result.resumed ? 200 : 201).json(result);
  })
);

examSessionsRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    res.json(await service.get(req.user!, uuidParam.parse(req.params).id));
  })
);
