from typing import Any

from fastapi import Request
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException


class ApiError(Exception):
    def __init__(self, status_code: int, message: str, code: str | None = None, details: Any = None):
        self.status_code = status_code
        self.message = message
        self.code = code or {
            400: "BAD_REQUEST", 401: "UNAUTHORIZED", 403: "FORBIDDEN",
            404: "NOT_FOUND", 409: "CONFLICT", 429: "TOO_MANY_REQUESTS",
        }.get(status_code, "INTERNAL_SERVER_ERROR")
        self.details = details


async def api_error_handler(request: Request, error: ApiError) -> JSONResponse:
    body: dict[str, Any] = {"code": error.code, "message": error.message}
    body["requestId"] = getattr(request.state, "request_id", "unknown")
    if error.details is not None:
        body["details"] = error.details
    return JSONResponse(status_code=error.status_code, content={"error": body})


async def http_error_handler(request: Request, error: StarletteHTTPException) -> JSONResponse:
    return JSONResponse(status_code=error.status_code, content={"error": {"code": "NOT_FOUND", "message": str(error.detail), "requestId": getattr(request.state, "request_id", "unknown")}})


async def unexpected_error_handler(request: Request, _error: Exception) -> JSONResponse:
    return JSONResponse(status_code=500, content={"error": {"code": "INTERNAL_SERVER_ERROR", "message": "Unexpected server error", "requestId": getattr(request.state, "request_id", "unknown")}})
