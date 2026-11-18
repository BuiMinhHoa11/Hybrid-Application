import { Router } from 'express';
import { asyncHandler } from '@uniexam/observability';
import { uuidParam } from '../common';
import { audienceBody, createExamBody, listExamsQuery, updateExamBody } from './exams.dto';
import * as service from './exams.service';

export const examsRouter = Router();

examsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    res.json(await service.list(req.user!, listExamsQuery.parse(req.query)));
  })
);

examsRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    res.json(await service.get(req.user!, uuidParam.parse(req.params).id));
  })
);

examsRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    res.status(201).json(await service.create(req.user!, createExamBody.parse(req.body)));
  })
);

examsRouter.put(
  '/:id',
  asyncHandler(async (req, res) => {
    res.json(await service.update(req.user!, uuidParam.parse(req.params).id, updateExamBody.parse(req.body)));
  })
);

examsRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    res.json(await service.remove(req.user!, uuidParam.parse(req.params).id));
  })
);

examsRouter.put(
  '/:id/audience',
  asyncHandler(async (req, res) => {
    res.json(await service.setAudience(req.user!, uuidParam.parse(req.params).id, audienceBody.parse(req.body)));
  })
);

examsRouter.post(
  '/:id/validate',
  asyncHandler(async (req, res) => {
    res.json(await service.validate(req.user!, uuidParam.parse(req.params).id));
  })
);

examsRouter.post(
  '/:id/publish',
  asyncHandler(async (req, res) => {
    res.json(await service.publish(req.user!, uuidParam.parse(req.params).id));
  })
);
