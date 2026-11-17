# Chuyển dữ liệu từ backend Node.js sang Python

`uniexam/legacy_import.py` chuyển đủ 10 bảng nghiệp vụ: tài khoản, câu hỏi, đề thi và câu hỏi chụp trong đề, kỳ thi, đối tượng dự thi, phiên làm bài, câu trả lời, bài nộp và kết quả chấm.

Nguồn được mở bằng transaction **read-only, repeatable-read**. Công cụ không sửa nguồn. Đích dùng một transaction duy nhất; lỗi ở bất kỳ bảng nào sẽ hủy toàn bộ lần nhập. Công cụ không xóa hoặc ghi đè bản ghi đã có ở đích.

## Trước khi nhập

1. Sao lưu cả hai database.
2. Ngừng các API và worker cũ để dữ liệu nguồn không tiếp tục thay đổi. Ngừng API/worker mới trong khoảng nhập để tránh thay đổi trạng thái thi đồng thời.
3. Khởi tạo schema Python bằng `init-db` trong database đích riêng; không chạy schema Python lên database Node cũ.
4. Chạy dry-run trước. Dry-run thực hiện đầy đủ thao tác kiểm tra và insert, sau đó rollback; vì vậy kiểm tra được cả CHECK, UNIQUE và khóa ngoại PostgreSQL.

## Tài khoản trùng tên

- Mặc định `user_conflicts="error"`: từ chối tên đăng nhập trùng nhưng UUID khác. Nhập vào database Python mới, trống để giữ toàn bộ tài khoản và mật khẩu cũ. Hash bcrypt được sao chép nguyên vẹn và backend Python xác thực được.
- `user_conflicts="reuse-target"`: chỉ cho phép ghép cùng tên đăng nhập và cùng vai trò. Giữ UUID, thông tin và **mật khẩu hiện tại ở đích**; ánh xạ mọi quan hệ của tài khoản cũ sang tài khoản này. Không thay mật khẩu đích bằng mật khẩu nguồn. Report `mappedUsers` liệt kê những tài khoản được ghép.
- Nếu email đụng tài khoản khác, UUID đụng bản ghi khác hoặc bản ghi cùng UUID đã bị sửa ở đích, công cụ từ chối và rollback. Không có chế độ ép ghi đè.

Sau khi nhập thành công, chạy lại với nguồn và đích không đổi sẽ bỏ qua các bản ghi giống nhau, không tạo bản sao. Nếu tiếp tục sửa dữ liệu sau lần nhập, đây không phải công cụ đồng bộ hai chiều: lần nhập sau có thể báo xung đột để bảo vệ dữ liệu mới.

## Các phép chuyển đổi được báo cáo

- Điền khuyết: chuyển đáp án cũ trong `correct_option_ids` sang `accepted_answers`; câu trả lời trong mảng lựa chọn cũ sang `text_answer`. Bản chụp bài nộp và chi tiết chấm được giữ.
- Bổ sung `paper_id` cho phiên/câu trả lời để kiểm tra chúng thuộc cùng đề.
- Đối tượng dự thi cũ không lưu thời điểm phân công: lấy thời điểm tạo kỳ thi. Nếu có phiên thi nhưng thiếu đối tượng dự thi, khôi phục quan hệ lịch sử từ phiên và ghi report.
- Kết quả cũ đã công bố không lưu người công bố: suy ra chủ kỳ thi, ghi `historicalPublisherInferredFromOwner` và đặt trạng thái kỳ thi thành `closed`. Công cụ từ chối kỳ thi đã công bố nhưng còn phiên đang làm hoặc không có thời điểm công bố.
- Bài đang được worker Node nhận chấm: đưa về hàng đợi Python, xóa lease cũ và đặt lại số lần nhận chấm. Kết quả đã chấm được giữ.
- Trường nhãn `format` cũ được thay bởi nhãn chung hiện tại của giao diện; report ghi `legacyDisplayFormatReplacedByUnifiedLabel`.
- Dữ liệu cũ không đạt giới hạn hoặc ràng buộc mới sẽ báo bảng, UUID và tên constraint. Công cụ không cắt nội dung, xóa đáp án hoặc tự điều chỉnh điểm để vượt kiểm tra.

## Chạy CLI

CLI đọc URL nguồn từ biến môi trường `LEGACY_DATABASE_URL`. Đặt biến trước khi chạy rồi mở terminal tại `backend`:

```powershell
uv run python -m uniexam.cli import-legacy --user-conflicts reuse-target
uv run python -m uniexam.cli import-legacy --user-conflicts reuse-target --apply
```

Lệnh đầu kiểm tra rồi rollback. Chỉ chạy lệnh có `--apply` sau khi đọc báo cáo. Muốn giữ mật khẩu nguồn cho các tên trùng, chọn database Python trống và dùng chế độ mặc định `error`.

## Gọi bằng Python

URL nguồn nên lấy từ biến môi trường, tránh đưa thông tin kết nối vào lịch sử lệnh. Ví dụ dùng các biến môi trường đã được thiết lập:

```python
import os
from uniexam.db import engine
from uniexam.legacy_import import import_legacy

report = import_legacy(
    os.environ["LEGACY_DATABASE_URL"],
    engine,
    dry_run=True,
    user_conflicts="reuse-target",
)
print(report)
```

Sau khi kiểm tra report, gọi lại với `dry_run=False` để nhập thật. Report không chứa mật khẩu, hash, token hoặc nội dung đáp án.
