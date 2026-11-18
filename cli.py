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
            raise ValueError(f"TÃ i khoáº£n {username} Ä‘Ã£ tá»“n táº¡i vá»›i vai trÃ² khÃ¡c; seed khÃ´ng tá»± Ä‘á»•i quyá»n")
        return existing["id"]
    return one(db, """INSERT INTO users(username,full_name,role,password_hash)
      VALUES (:u,:n,:r,:p) RETURNING id""", u=username, n=name, r=role, p=hash_password(password))["id"]


def seed_demo():
    if settings.environment == "production":
        raise ValueError("Demo seeding is disabled in production")
    with SessionLocal.begin() as db:
        add_user(db, "admin", "Quáº£n trá»‹ viÃªn", "admin", "admin")
        teacher = add_user(db, "gv01", "GiÃ¡o viÃªn demo", "teacher", "12345")
        students = [add_user(db, f"sv00{i}", f"Sinh viÃªn {i}", "student", "12345") for i in (1, 2)]
        existing = one(db, "SELECT id FROM exam_papers WHERE owner_id=:owner AND title='Äá» demo Python'", owner=teacher)
        if not existing:
            paper = one(db, "INSERT INTO exam_papers(owner_id,title,subject) VALUES (:owner,'Äá» demo Python','Tá»•ng há»£p') RETURNING id", owner=teacher)["id"]
            for position, kind, content, options, correct, accepted in [
                (1, "multiple_choice", "1 + 1 = ?", [{"id": "A", "text": "2"}, {"id": "B", "text": "3"}], ["A"], []),
                (2, "fill_blank", "Thá»§ Ä‘Ã´ Viá»‡t Nam lÃ  ___", [], [], ["HÃ  Ná»™i"]),
            ]:
                q = one(db, """INSERT INTO questions(owner_id,subject,difficulty,type,content,options,correct_option_ids,accepted_answers,points)
                  VALUES (:owner,'Tá»•ng há»£p','easy',:type,:content,CAST(:options AS jsonb),:correct,:accepted,1) RETURNING id""",
                  owner=teacher, type=kind, content=content, options=dump_json(options), correct=correct, accepted=accepted)["id"]
                run(db, """INSERT INTO exam_paper_questions(paper_id,question_id,position,type,content,options,correct_option_ids,accepted_answers,points,difficulty)
                  SELECT :paper,id,:position,type,content,options,correct_option_ids,accepted_answers,points,difficulty FROM questions WHERE id=:q""",
                  paper=paper, position=position, q=q)
            start = now_utc() + timedelta(minutes=10)
            exam = one(db, """INSERT INTO exams(owner_id,paper_id,title,subject,start_time,end_time,duration_minutes,question_count)
              VALUES (:owner,:paper,'Ká»³ thi demo Python','Tá»•ng há»£p',:start,:end,60,2) RETURNING id""",
              owner=teacher, paper=paper, start=start, end=start + timedelta(hours=1))["id"]
            for student in students:
                run(db, "INSERT INTO exam_audience(exam_id,student_id) VALUES (:exam,:student)", exam=exam, student=student)
    print("TÃ i khoáº£n demo: admin / admin; gv01 / 12345; sv001, sv002 / 12345")
    print("Máº­t kháº©u trÃªn chá»‰ Ã¡p dá»¥ng cho tÃ i khoáº£n má»›i táº¡o; seed khÃ´ng Ä‘áº·t láº¡i máº­t kháº©u Ä‘Ã£ cÃ³.")
    print("Äá» vÃ  ká»³ thi demo Ä‘Æ°á»£c lÆ°u nhÃ¡p; giÃ¡o viÃªn kiá»ƒm tra lá»‹ch rá»“i phÃ¡t hÃ nh.")


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
    admin.add_argument("--name", default="Quáº£n trá»‹ viÃªn")
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
        print("ÄÃ£ Ã¡p migration.")
    elif args.command == "seed-demo":
        seed_demo()
    elif args.command == "import-legacy":
        from sqlalchemy.exc import SQLAlchemyError
        from .db import engine
        from .legacy_import import LegacyImportError, import_legacy
        source_url = os.environ.get(args.source_env)
        if not source_url:
            parser.error(f"ChÆ°a Ä‘áº·t biáº¿n mÃ´i trÆ°á»ng {args.source_env} chá»©a URL database Node cÅ©")
        try:
            report = import_legacy(source_url, engine, dry_run=not args.apply, user_conflicts=args.user_conflicts)
        except LegacyImportError as exc:
            parser.exit(1, f"KhÃ´ng Ä‘á»“ng bá»™: {exc}\n")
        except (SQLAlchemyError, ValueError):
            parser.exit(1, "KhÃ´ng káº¿t ná»‘i/Ä‘á»c Ä‘Æ°á»£c database. Kiá»ƒm tra URL, quyá»n truy cáº­p vÃ  schema; khÃ´ng cÃ³ dá»¯ liá»‡u nÃ o Ä‘Æ°á»£c ghi.\n")
        print(json.dumps(report, ensure_ascii=False, indent=2))
        print("ÄÃ£ chuyá»ƒn dá»¯ liá»‡u." if args.apply else "Kiá»ƒm tra Ä‘áº¡t; chÆ°a ghi dá»¯ liá»‡u. ThÃªm --apply Ä‘á»ƒ thá»±c hiá»‡n.")
    elif args.command == "change-password":
        password = getpass.getpass("Máº­t kháº©u má»›i (Ã­t nháº¥t 8 kÃ½ tá»±): ")
        if not 8 <= len(password) <= 200:
            parser.error("Máº­t kháº©u cáº§n 8â€“200 kÃ½ tá»±")
        if password != getpass.getpass("Nháº­p láº¡i máº­t kháº©u má»›i: "):
            parser.error("Hai láº§n nháº­p máº­t kháº©u khÃ´ng khá»›p")
        with SessionLocal.begin() as db:
            target = one(db, "SELECT id FROM users WHERE lower(username)=lower(:u) FOR UPDATE", u=args.username)
            if not target:
                parser.error("KhÃ´ng tÃ¬m tháº¥y tÃ i khoáº£n")
            run(db, "UPDATE users SET password_hash=:password WHERE id=:id", id=target["id"], password=hash_password(password))
        print("ÄÃ£ Ä‘á»•i máº­t kháº©u. ÄÄƒng nháº­p báº±ng máº­t kháº©u má»›i; khÃ´ng cáº§n sá»­a seed hoáº·c build láº¡i web.")
    else:
        import re
        if not re.fullmatch(r"[a-zA-Z0-9._-]{3,50}", args.username):
            parser.error("TÃªn Ä‘Äƒng nháº­p khÃ´ng há»£p lá»‡")
        password = getpass.getpass("Máº­t kháº©u quáº£n trá»‹ (Ã­t nháº¥t 8 kÃ½ tá»±): ")
        if not 8 <= len(password) <= 200:
            parser.error("Máº­t kháº©u cáº§n 8â€“200 kÃ½ tá»±")
        with SessionLocal.begin() as db:
            if one(db, "SELECT id FROM users WHERE lower(username)=lower(:u)", u=args.username):
                parser.error("TÃªn Ä‘Äƒng nháº­p Ä‘Ã£ tá»“n táº¡i")
            add_user(db, args.username, args.name, "admin", password)
        print("ÄÃ£ táº¡o quáº£n trá»‹ viÃªn.")


if __name__ == "__main__":
    main()
