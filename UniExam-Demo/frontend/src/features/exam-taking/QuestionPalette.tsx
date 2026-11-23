import type { SavedAnswer, SessionQuestion } from '../../entities/submission/types';

/** Bảng câu hỏi: nhảy nhanh tới câu bất kỳ, thấy ngay câu đã làm và câu đánh dấu xem lại. */
export function QuestionPalette({
  questions,
  answerOf,
  current,
  onSelect
}: {
  questions: SessionQuestion[];
  answerOf: (questionId: string) => SavedAnswer;
  current: number;
  onSelect: (index: number) => void;
}) {
  return (
    <div>
      <div className="palette">
        {questions.map((q, i) => {
          const a = answerOf(q.id);
          const cls = [a.selectedOptionIds.some((value) => value.trim()) ? 'answered' : '', a.flagged ? 'flagged' : '', i === current ? 'current' : '']
            .filter(Boolean)
            .join(' ');
          return (
            <button key={q.id} type="button" className={cls} onClick={() => onSelect(i)} aria-label={`Câu ${i + 1}`} aria-current={i === current}>
              {i + 1}
            </button>
          );
        })}
      </div>
      <div className="legend">
        <span>🟩 Đã trả lời</span>
        <span>🟠 Xem lại</span>
        <span>⬜ Chưa làm</span>
      </div>
    </div>
  );
}
