# Database UniExam

Thư mục này chứa toàn bộ schema, migration, seed và thiết kế database. Dữ liệu PostgreSQL thực tế nằm trong volume Docker, không nằm trong mã nguồn và không được đẩy lên GitHub.

- `uniexam_database/schema.sql`: schema PostgreSQL của backend Python.
- `uniexam_database/migrations/`: lịch sử migration Alembic; giữ nguyên mã phiên bản để dùng lại database hiện tại.
- `node/`: thư viện truy vấn, schema TypeScript, migration SQL và seed của backend Node.js cũ.
- `design/`: ERD, từ điển dữ liệu và SQL thiết kế tham khảo.

Package Python `uniexam-database` chỉ đóng gói tài nguyên database. `uv sync --project backend` từ thư mục gốc tự cài package này từ máy local; Docker cũng cài nó trước backend.

Áp migration trên hệ thống đang chạy:

```powershell
npm run migrate
```

Public API tự chạy migration trước khi khởi động. Việc sắp xếp thư mục không tạo lại database, không đổi tên volume và không thay mật khẩu tài khoản đang có. Không chạy schema Python trực tiếp lên database Node cũ; dùng công cụ chuyển dữ liệu trong `backend/IMPORT-LEGACY.md`.
