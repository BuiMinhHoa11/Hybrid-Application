import { Router } from 'express';
import { asyncHandler } from '@uniexam/observability';
import { uuidParam } from '../common';
import { listQuery, questionBody } from './question-bank.dto';
import * as service from './question-bank.service';

export const questionBankRouter = Router();

questionBankRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    res.json(await service.list(req.user!, listQuery.parse(req.query)));
  })
);

questionBankRouter.get(
  '/filters',
  asyncHandler(async (req, res) => {
    res.json(await service.filters(req.user!));
  })
);

questionBankRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    res.json(await service.get(req.user!, uuidParam.parse(req.params).id));
  })
);

questionBankRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    res.status(201).json(await service.create(req.user!, questionBody.parse(req.body)));
  })
);

questionBankRouter.put(
  '/:id',
  asyncHandler(async (req, res) => {
    res.json(await service.update(req.user!, uuidParam.parse(req.params).id, questionBody.parse(req.body)));
  })
);

questionBankRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    res.json(await service.remove(req.user!, uuidParam.parse(req.params).id));
  })
);
