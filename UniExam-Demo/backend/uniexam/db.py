from sqlalchemy import create_engine, event, text
from sqlalchemy.orm import Session, sessionmaker
from .config import settings

url = settings.database_url
if url.startswith("postgres://"):
    url = "postgresql+psycopg://" + url[len("postgres://"):]
elif url.startswith("postgresql://"):
    url = "postgresql+psycopg://" + url[len("postgresql://"):]
engine = create_engine(url, pool_pre_ping=True, connect_args={"connect_timeout": 5})


@event.listens_for(engine, "connect")
def set_timezone(connection, _record):
    connection.execute("SET TIME ZONE 'UTC'")
    connection.commit()

SessionLocal = sessionmaker(bind=engine, expire_on_commit=False)


def get_db():
    with SessionLocal() as db:
        try:
            yield db
            db.commit()
        except Exception:
            db.rollback()
            raise


def run(db: Session, sql: str, **params):
    return db.execute(text(sql), params)


def one(db: Session, sql: str, **params):
    row = run(db, sql, **params).mappings().first()
    return dict(row) if row else None


def many(db: Session, sql: str, **params):
    return [dict(row) for row in run(db, sql, **params).mappings().all()]
