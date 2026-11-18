import argparse
import getpass
import json
import os
import sys
from datetime import timedelta
from alembic import command
from alembic.config import Config
from uniexam_database import migration_path
from .common import now_utc, dump_json
from .config import settings
from .db import SessionLocal, one, run
from .security import hash_password


def migrate():
    config = Config()
    config.set_main_option("script_location", migration_path())
    command.upgrade(config, "head")


def add_user(db, username, name, role, password):
    existing = one(db, "SELECT id, role FROM users WHERE lower(username)=lower(:u)", u=username)
    if existing:
        if existing["role"] != role:
            raise ValueError(f"Tài khoản {username} đã tồn tại với vai trò khác; seed không tự đổi quyền")
        return existing["id"]
    return one(db, """INSERT INTO users(username,full_name,role,password_hash)
      VALUES (:u,:n,:r,:p) RETURNING id""", u=username, n=name, r=role, p=hash_password(password))["id"]


def seed_demo():
    if settings.environment == "production":
        raise ValueError("Demo seeding is disabled in production")
    with SessionLocal.begin() as db:
        add_user(db, "admin", "Quản trị viên", "admin", "admin")
        teacher = add_user(db, "gv01", "Giáo viên demo", "teacher", "12345")
        students = [add_user(db, f"sv00{i}", f"Sinh viên {i}", "student", "12345") for i in (1, 2)]
        existing = one(db, "SELECT id FROM exam_papers WHERE owner_id=:owner AND title='Đề demo Python'", owner=teacher)
        if not existing:
            paper = one(db, "INSERT INTO exam_papers(owner_id,title,subject) VALUES (:owner,'Đề demo Python','Tổng hợp') RETURNING id", owner=teacher)["id"]
            for position, kind, content, options, correct, accepted in [
                (1, "multiple_choice", "1 + 1 = ?", [{"id": "A", "text": "2"}, {"id": "B", "text": "3"}], ["A"], []),
                (2, "fill_blank", "Thủ đô Việt Nam là ___", [], [], ["Hà Nội"]),
            ]:
                q = one(db, """INSERT INTO questions(owner_id,subject,difficulty,type,content,options,correct_option_ids,accepted_answers,points)
                  VALUES (:owner,'Tổng hợp','easy',:type,:content,CAST(:options AS jsonb),:correct,:accepted,1) RETURNING id""",
                  owner=teacher, type=kind, content=content, options=dump_json(options), correct=correct, accepted=accepted)["id"]
                run(db, """INSERT INTO exam_paper_questions(paper_id,question_id,position,type,content,options,correct_option_ids,accepted_answers,points,difficulty)
                  SELECT :paper,id,:position,type,content,options,correct_option_ids,accepted_answers,points,difficulty FROM questions WHERE id=:q""",
                  paper=paper, position=position, q=q)
            start = now_utc() + timedelta(minutes=10)
            exam = one(db, """INSERT INTO exams(owner_id,paper_id,title,subject,start_time,end_time,duration_minutes,question_count)
              VALUES (:owner,:paper,'Kỳ thi demo Python','Tổng hợp',:start,:end,60,2) RETURNING id""",
              owner=teacher, paper=paper, start=start, end=start + timedelta(hours=1))["id"]
            for student in students:
                run(db, "INSERT INTO exam_audience(exam_id,student_id) VALUES (:exam,:student)", exam=exam, student=student)
    print("Tài khoản demo: admin / admin; gv01 / 12345; sv001, sv002 / 12345")
    print("Mật khẩu trên chỉ áp dụng cho tài khoản mới tạo; seed không đặt lại mật khẩu đã có.")
    print("Đề và kỳ thi demo được lưu nháp; giáo viên kiểm tra lịch rồi phát hành.")


def main():
    # PowerShell pipes can default to cp1258; all Vietnamese CLI output is UTF-8.
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser(description="UniExam Python administration")
    commands = parser.add_subparsers(dest="command", required=True)
    commands.add_parser("init-db", help="Apply Alembic migrations to a NEW Python database")
    admin = commands.add_parser("create-admin")
    admin.add_argument("username")
    admin.add_argument("--name", default="Quản trị viên")
    password_command = commands.add_parser("change-password", help="Change an existing account password using a hidden prompt")
    password_command.add_argument("username")
    legacy = commands.add_parser("import-legacy", help="Import Node data; defaults to a dry-run with no persistent writes")
    legacy.add_argument("--source-env", default="LEGACY_DATABASE_URL", help="Environment variable containing the read-only source connection URL")
    legacy.add_argument("--user-conflicts", choices=["error", "reuse-target"], default="error")
    legacy.add_argument("--apply", action="store_true", help="Commit the import after reviewing a successful dry-run")
    commands.add_parser("seed-demo")
    args = parser.parse_args()
    if args.command == "init-db":
        migrate()
        print("Đã áp migration.")
    elif args.command == "seed-demo":
        seed_demo()
    elif args.command == "import-legacy":
        from sqlalchemy.exc import SQLAlchemyError
        from .db import engine
        from .legacy_import import LegacyImportError, import_legacy
        source_url = os.environ.get(args.source_env)
        if not source_url:
            parser.error(f"Chưa đặt biến môi trường {args.source_env} chứa URL database Node cũ")
        try:
            report = import_legacy(source_url, engine, dry_run=not args.apply, user_conflicts=args.user_conflicts)
        except LegacyImportError as exc:
            parser.exit(1, f"Không đồng bộ: {exc}\n")
        except (SQLAlchemyError, ValueError):
            parser.exit(1, "Không kết nối/đọc được database. Kiểm tra URL, quyền truy cập và schema; không có dữ liệu nào được ghi.\n")
        print(json.dumps(report, ensure_ascii=False, indent=2))
        print("Đã chuyển dữ liệu." if args.apply else "Kiểm tra đạt; chưa ghi dữ liệu. Thêm --apply để thực hiện.")
    elif args.command == "change-password":
        password = getpass.getpass("Mật khẩu mới (ít nhất 8 ký tự): ")
        if not 8 <= len(password) <= 200:
            parser.error("Mật khẩu cần 8–200 ký tự")
        if password != getpass.getpass("Nhập lại mật khẩu mới: "):
            parser.error("Hai lần nhập mật khẩu không khớp")
        with SessionLocal.begin() as db:
            target = one(db, "SELECT id FROM users WHERE lower(username)=lower(:u) FOR UPDATE", u=args.username)
            if not target:
                parser.error("Không tìm thấy tài khoản")
            run(db, "UPDATE users SET password_hash=:password WHERE id=:id", id=target["id"], password=hash_password(password))
        print("Đã đổi mật khẩu. Đăng nhập bằng mật khẩu mới; không cần sửa seed hoặc build lại web.")
    else:
        import re
        if not re.fullmatch(r"[a-zA-Z0-9._-]{3,50}", args.username):
            parser.error("Tên đăng nhập không hợp lệ")
        password = getpass.getpass("Mật khẩu quản trị (ít nhất 8 ký tự): ")
        if not 8 <= len(password) <= 200:
            parser.error("Mật khẩu cần 8–200 ký tự")
        with SessionLocal.begin() as db:
            if one(db, "SELECT id FROM users WHERE lower(username)=lower(:u)", u=args.username):
                parser.error("Tên đăng nhập đã tồn tại")
            add_user(db, args.username, args.name, "admin", password)
        print("Đã tạo quản trị viên.")


if __name__ == "__main__":
    main()
