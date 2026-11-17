import { Router } from 'express';
import { asyncHandler } from '@uniexam/observability';
import { getSystemStatus } from './system-status.service';

export const systemStatusRouter = Router();

systemStatusRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    res.json(await getSystemStatus());
  })
);
