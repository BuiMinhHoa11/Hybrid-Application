import { Router } from 'express';
import { asyncHandler, notFound } from '@uniexam/observability';
import { queryOne } from '@uniexam/db';
import { uuidParam } from '../common';
import { finalizeSession } from './submissions.service';

export const submissionsRouter = Router();

/** UC01C: sinh viên bấm "Xác nhận nộp bài". */
submissionsRouter.post(
  '/:id/submit',
  asyncHandler(async (req, res) => {
    const { id } = uuidParam.parse(req.params);
    const session = await queryOne<{ expired: boolean }>(
      `SELECT expires_at <= now() AS expired FROM exam_sessions WHERE id = $1 AND student_id = $2`,
      [id, req.user!.id]
    );
    if (!session) throw notFound('Không tìm thấy phiên làm bài');
    const result = await finalizeSession(id, session.expired ? 'timeout' : 'student');
    if (!result) throw notFound('Không tìm thấy phiên làm bài');
    res.json({ ...result, status: 'pending_grading' });
  })
);
