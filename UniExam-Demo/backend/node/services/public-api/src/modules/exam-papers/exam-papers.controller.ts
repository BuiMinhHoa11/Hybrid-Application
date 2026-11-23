import { Router } from 'express';
import { asyncHandler } from '@uniexam/observability';
import { uuidParam } from '../common';
import { autoBody, paperBody } from './exam-papers.dto';
import * as service from './exam-papers.service';

export const examPapersRouter = Router();

examPapersRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    res.json(await service.list(req.user!));
  })
);

examPapersRouter.post(
  '/auto-preview',
  asyncHandler(async (req, res) => {
    res.json(await service.autoPreview(req.user!, autoBody.parse(req.body)));
  })
);

examPapersRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    res.json(await service.get(req.user!, uuidParam.parse(req.params).id));
  })
);

examPapersRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    res.status(201).json(await service.create(req.user!, paperBody.parse(req.body)));
  })
);

examPapersRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    res.json(await service.remove(req.user!, uuidParam.parse(req.params).id));
  })
);
