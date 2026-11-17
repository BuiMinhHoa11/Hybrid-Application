import { Router } from 'express';
import { asyncHandler } from '@uniexam/observability';
import { examIdParam, publishResultsDto, submissionParam } from './exam-results.dto';
import * as service from './exam-results.service';

export const examResultsRouter = Router();

examResultsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    res.json(await service.listExams(req.user!));
  })
);

examResultsRouter.get(
  '/:examId',
  asyncHandler(async (req, res) => {
    const { examId } = examIdParam.parse(req.params);
    res.json(await service.examResults(req.user!, examId));
  })
);

examResultsRouter.get(
  '/:examId/submissions/:submissionId',
  asyncHandler(async (req, res) => {
    const { examId, submissionId } = submissionParam.parse(req.params);
    res.json(await service.submissionDetail(req.user!, examId, submissionId));
  })
);

examResultsRouter.post(
  '/:examId/publish',
  asyncHandler(async (req, res) => {
    const { examId } = examIdParam.parse(req.params);
    publishResultsDto.parse(req.body);
    res.json(await service.publishResults(req.user!, examId));
  })
);
