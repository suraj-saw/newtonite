"""
Newtonite Operations Work Coordination System — API Application Entrypoint

This module initializes the FastAPI application, configures global CORS
middleware, registers unified JSON error handlers for standardized API error responses,
and mounts all domain-specific API routers under the `/api` prefix.
"""

# pyrefly: ignore [missing-import]
from fastapi import FastAPI, Request
# pyrefly: ignore [missing-import]
from fastapi.exceptions import RequestValidationError
# pyrefly: ignore [missing-import]
from fastapi.middleware.cors import CORSMiddleware
# pyrefly: ignore [missing-import]
from fastapi.responses import JSONResponse
# pyrefly: ignore [missing-import]
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.api.routes.auth import router as auth_router
from app.api.routes.dashboard import router as dashboard_router
from app.api.routes.notifications import router as notifications_router
from app.api.routes.users import teams_router, users_router
from app.api.routes.work_items import router as work_items_router
from app.core.config import settings

# Initialize FastAPI application instance with metadata
app = FastAPI(
    title="Newtonite",
    version="1.0.0",
    description="Operational work coordination and incident management platform for cross-functional teams.",
)

# Cross-Origin Resource Sharing (CORS) Middleware
# Allows browser SPA (React / Vite) running on local dev or Docker port to communicate with the API.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def error_body(code: str, message: str, details: dict | None = None) -> dict:
    """Format a consistent JSON error envelope for all API error responses.

    Args:
        code: Machine-readable uppercase error identifier (e.g. 'UNAUTHORIZED', 'STALE_VERSION').
        message: Human-readable description of what caused the failure.
        details: Optional dictionary containing additional contextual metadata or validation errors.

    Returns:
        dict: Standardized payload conforming to {"error": {"code": ..., "message": ..., "details": ...}}.
    """
    return {"error": {"code": code, "message": message, "details": details or {}}}


@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(_request: Request, exc: StarletteHTTPException):
    """Global exception handler for HTTP exceptions raised across routers and services.

    Extracts custom error codes when provided in the exception details or maps standard
    HTTP status codes to consistent error code strings.
    """
    if isinstance(exc.detail, dict) and "code" in exc.detail:
        return JSONResponse(
            status_code=exc.status_code,
            content={"error": exc.detail},
        )
    code = {
        400: "BAD_REQUEST",
        401: "UNAUTHORIZED",
        403: "FORBIDDEN",
        404: "NOT_FOUND",
        409: "CONFLICT",
    }.get(exc.status_code, "ERROR")
    message = exc.detail if isinstance(exc.detail, str) else "Request failed"
    return JSONResponse(status_code=exc.status_code, content=error_body(code, message))


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(_request: Request, exc: RequestValidationError):
    """Handle Pydantic request schema validation failures (HTTP 422 Unprocessable Entity).

    Converts raw Pydantic validation errors into our unified error envelope with the
    'VALIDATION_ERROR' code and detailed list of invalid fields.
    """
    return JSONResponse(
        status_code=422,
        content=error_body("VALIDATION_ERROR", "Request validation failed", {"errors": exc.errors()}),
    )


@app.exception_handler(Exception)
async def unhandled_exception_handler(_request: Request, _exc: Exception):
    """Catch-all safety handler for unexpected server errors (HTTP 500).

    Prevents leaking internal stack traces to clients while guaranteeing a structured JSON response.
    """
    return JSONResponse(
        status_code=500,
        content=error_body("INTERNAL_ERROR", "An unexpected error occurred"),
    )


@app.get("/api/health")
def health() -> dict:
    """Service health check endpoint used by Docker healthchecks and uptime monitors."""
    return {"status": "ok"}


# Mount domain routers under `/api` namespace
app.include_router(auth_router, prefix="/api/auth", tags=["auth"])
app.include_router(work_items_router, prefix="/api/work-items", tags=["work-items"])
app.include_router(teams_router, prefix="/api/teams", tags=["teams"])
app.include_router(users_router, prefix="/api/users", tags=["users"])
app.include_router(dashboard_router, prefix="/api/dashboard", tags=["dashboard"])
app.include_router(notifications_router, prefix="/api/notifications", tags=["notifications"])

