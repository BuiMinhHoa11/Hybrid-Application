import { Router } from 'express';
import { asyncHandler } from '@uniexam/observability';
import { answerParams, saveAnswerBody } from './answers.dto';
import * as service from './answers.service';

export const answersRouter = Router();

answersRouter.put(
  '/:id/answers/:questionId',
  asyncHandler(async (req, res) => {
    const { id, questionId } = answerParams.parse(req.params);
    res.json(await service.save(req.user!, id, questionId, saveAnswerBody.parse(req.body)));
  })
);
