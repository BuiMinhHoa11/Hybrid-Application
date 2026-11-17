import { Router } from 'express';
import { asyncHandler } from '@uniexam/observability';
import { authenticate } from '../../middleware/authenticate';
import { loginDto } from './auth.dto';
import * as service from './auth.service';

export const authRouter = Router();

authRouter.post(
  '/login',
  asyncHandler(async (req, res) => {
    res.json(await service.login(loginDto.parse(req.body)));
  })
);

authRouter.get(
  '/me',
  authenticate,
  asyncHandler(async (req, res) => {
    res.json(await service.me(req.user!.id));
  })
);
