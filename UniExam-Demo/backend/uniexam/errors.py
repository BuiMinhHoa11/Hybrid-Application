import logging
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from starlette.exceptions import HTTPException

log = logging.getLogger("uniexam")


class AppError(Exception):
    def __init__(self, status: int, message: str, code="ERROR", details=None):
        self.status, self.message, self.code, self.details = status, message, code, details


def error_response(status, message, code, details=None):
    value = {"code": code, "message": message}
    if details is not None:
        value["details"] = details
    return JSONResponse(status_code=status, content={"error": value})


def install_handlers(app: FastAPI):
    @app.exception_handler(AppError)
    async def app_error(_request: Request, exc: AppError):
        return error_response(exc.status, exc.message, exc.code, exc.details)

    @app.exception_handler(RequestValidationError)
    async def validation(_request: Request, exc: RequestValidationError):
        details = [{"field": ".".join(map(str, e["loc"][1:])), "message": e["msg"]} for e in exc.errors()]
        return error_response(422, "Dữ liệu gửi lên không hợp lệ", "VALIDATION_ERROR", details)

    @app.exception_handler(IntegrityError)
    async def integrity(_request: Request, exc: IntegrityError):
        code = getattr(exc.orig, "sqlstate", None)
        if code == "23505":
            return error_response(409, "Dữ liệu đã tồn tại", "DUPLICATE")
        if code == "23503":
            return error_response(409, "Dữ liệu đang được sử dụng hoặc liên kết không hợp lệ", "IN_USE")
        return error_response(422, "Dữ liệu không thỏa ràng buộc", "CONSTRAINT_ERROR")

    @app.exception_handler(HTTPException)
    async def http_error(_request: Request, exc: HTTPException):
        return error_response(exc.status_code, str(exc.detail), "HTTP_ERROR")

    @app.exception_handler(SQLAlchemyError)
    async def database_error(_request: Request, exc: SQLAlchemyError):
        log.error("Database request failed: %s", type(exc).__name__)
        return error_response(503, "Không kết nối được cơ sở dữ liệu", "DATABASE_UNAVAILABLE")
