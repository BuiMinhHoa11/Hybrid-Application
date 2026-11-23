import { Router } from 'express';
import { asyncHandler } from '@uniexam/observability';
import { uuidParam } from '../common';
import { createUserBody, listUsersQuery, updateUserBody } from './admin-users.dto';
import * as service from './admin-users.service';

export const adminUsersRouter = Router();

adminUsersRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    res.json(await service.list(listUsersQuery.parse(req.query)));
  })
);

adminUsersRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    res.json(await service.get(uuidParam.parse(req.params).id));
  })
);

adminUsersRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    res.status(201).json(await service.create(createUserBody.parse(req.body)));
  })
);

adminUsersRouter.put(
  '/:id',
  asyncHandler(async (req, res) => {
    res.json(await service.update(req.user!, uuidParam.parse(req.params).id, updateUserBody.parse(req.body)));
  })
);

adminUsersRouter.post(
  '/:id/lock',
  asyncHandler(async (req, res) => {
    res.json(await service.setActive(req.user!, uuidParam.parse(req.params).id, false));
  })
);

adminUsersRouter.post(
  '/:id/unlock',
  asyncHandler(async (req, res) => {
    res.json(await service.setActive(req.user!, uuidParam.parse(req.params).id, true));
  })
);
