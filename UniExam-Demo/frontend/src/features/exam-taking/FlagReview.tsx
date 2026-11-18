import { Button } from '../../shared/ui';

export function FlagReview({ flagged, onToggle }: { flagged: boolean; onToggle: () => void }) {
  return (
    <Button onClick={onToggle} aria-pressed={flagged}>
      {flagged ? '🚩 Bỏ đánh dấu xem lại' : '⚑ Đánh dấu xem lại'}
    </Button>
  );
}
