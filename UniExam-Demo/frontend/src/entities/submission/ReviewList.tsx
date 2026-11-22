import { formatScore, optionLetter } from '../../shared/lib';
import type { SubmissionReview } from './types';
import { QuestionImage } from '../../shared/ui';

/** Danh sách câu hỏi kèm đáp án đã chọn, đáp án đúng và điểm từng câu (nhỏ, dùng chung cho sinh viên và giáo viên). */
export function ReviewList({ review }: { review: SubmissionReview }) {
  return (
    <div>
      {review.questions.map((q) => (
        <div key={q.id} className="review-q">
          <div className="row between">
            <strong>
              Câu {q.position}. {q.content}
            </strong>
            <span className="muted small" style={{ whiteSpace: 'nowrap' }}>
              {q.earned !== null && q.earned !== undefined ? `${formatScore(q.earned)}/` : ''}
              {formatScore(q.points)} điểm
            </span>
          </div>
          <QuestionImage src={q.imageDataUrl} alt={`Hình minh họa câu ${q.position}`} />
          {q.type === 'fill_blank' ? (
            <div>
              {q.selectedOptionIds.length > 0 && (
                <div className={`review-opt ${q.correct === true ? 'correct' : q.correct === false ? 'wrong' : ''}`}>
                  Câu trả lời: {q.selectedOptionIds[0]}
                </div>
              )}
              {q.correctOptionIds && <div className="review-opt correct">Đáp án được chấp nhận: {q.correctOptionIds.join(' / ')}</div>}
            </div>
          ) : q.options.map((o, i) => {
            const picked = q.selectedOptionIds.includes(o.id);
            const isCorrect = q.correctOptionIds?.includes(o.id) ?? false;
            const cls = isCorrect ? 'correct' : picked ? 'wrong' : '';
            return (
              <div key={o.id} className={`review-opt ${cls}`}>
                {picked ? '● ' : '○ '}
                <strong>{optionLetter(i)}.</strong> {o.text}
                {isCorrect && <span className="muted small"> — đáp án đúng</span>}
                {picked && !isCorrect && <span className="muted small"> — bạn chọn</span>}
              </div>
            );
          })}
          {q.selectedOptionIds.length === 0 && <div className="muted small">Không trả lời</div>}
        </div>
      ))}
    </div>
  );
}
