from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from .config import settings
from .db import get_db, one
from .errors import install_handlers


def create_app(service: str, lifespan=None):
    app = FastAPI(title=f"UniExam {service}", version="0.1.0", lifespan=lifespan)
    app.add_middleware(CORSMiddleware, allow_origins=[s.strip() for s in settings.cors_origins.split(",")],
                       allow_methods=["GET", "POST", "PUT", "DELETE"], allow_headers=["Authorization", "Content-Type"])
    install_handlers(app)

    @app.get("/health", tags=["health"])
    def health(db: Session = Depends(get_db, scope="function")):
        try:
            one(db, "SELECT 1 AS ok")
            return {"status": "ok", "service": service, "checks": {"database": "ok"}}
        except Exception:
            db.rollback()
            return JSONResponse(status_code=503, content={"status": "down", "service": service})
    return app
