/**
 * Thời điểm khóa bài: bắt đầu + thời lượng, nhưng không vượt quá thời gian kết thúc kỳ thi.
 * Nhờ vậy job vòng đời có thể đóng kỳ thi ngay sau giờ kết thúc mà không còn bài làm dở.
 */
export function computeExpiry(now: Date, durationMinutes: number, examEnd: Date): Date {
  return new Date(Math.min(now.getTime() + durationMinutes * 60_000, examEnd.getTime()));
}

/** Được phép bắt đầu khi đã phát hành, nằm trong khung giờ [start, end). Không phụ thuộc job đã chạy chưa. */
export function canStartNow(exam: { status: string; startTime: Date; endTime: Date }, now: Date): boolean {
  return (exam.status === 'published' || exam.status === 'open') && now >= exam.startTime && now < exam.endTime;
}
