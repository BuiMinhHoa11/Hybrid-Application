import { Router } from 'express';
import { asyncHandler } from '@uniexam/observability';
import { failBody, resultBody, submissionIdParam } from './grading-gateway.dto';
import * as service from './grading-gateway.service';

export const gradingRouter = Router();

/** 200 kèm bài cần chấm, hoặc 204 khi hàng đợi trống. */
gradingRouter.post(
  '/claim',
  asyncHandler(async (_req, res) => {
    const claimed = await service.claim();
    if (!claimed) return res.status(204).end();
    res.json(claimed);
  })
);

gradingRouter.post(
  '/:submissionId/result',
  asyncHandler(async (req, res) => {
    const { submissionId } = submissionIdParam.parse(req.params);
    res.json(await service.submitResult(submissionId, resultBody.parse(req.body)));
  })
);

gradingRouter.post(
  '/:submissionId/fail',
  asyncHandler(async (req, res) => {
    const { submissionId } = submissionIdParam.parse(req.params);
    res.json(await service.reportFailure(submissionId, failBody.parse(req.body).reason));
  })
);
