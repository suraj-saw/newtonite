"""
Standardized Application Error Hierarchy

Defines the `AppError` exception class and typed helper factories for
raising consistent HTTP exceptions that serialize into the Newtonite error JSON schema:
    {"error": {"code": ..., "message": ..., "details": {...}}}
"""

# pyrefly: ignore [missing-import]
from fastapi import HTTPException, status


class AppError(HTTPException):
    """Base application exception encapsulating HTTP status, code string, and details."""

    def __init__(
        self,
        status_code: int,
        code: str,
        message: str,
        details: dict | None = None,
    ) -> None:
        super().__init__(
            status_code=status_code,
            detail={"code": code, "message": message, "details": details or {}},
        )


def bad_request(message: str, code: str = "BAD_REQUEST", details: dict | None = None) -> AppError:
    """Construct an HTTP 400 Bad Request error (e.g., illegal state transitions, invalid input)."""
    return AppError(status.HTTP_400_BAD_REQUEST, code, message, details)


def unauthorized(message: str = "Authentication required") -> AppError:
    """Construct an HTTP 401 Unauthorized error (e.g., missing, invalid, or revoked session token)."""
    return AppError(status.HTTP_401_UNAUTHORIZED, "UNAUTHORIZED", message)


def forbidden(message: str = "You are not allowed to perform this action") -> AppError:
    """Construct an HTTP 403 Forbidden error (e.g., cross-team isolation or missing role privileges)."""
    return AppError(status.HTTP_403_FORBIDDEN, "FORBIDDEN", message)


def not_found(message: str = "Resource not found") -> AppError:
    """Construct an HTTP 404 Not Found error (e.g., non-existent work item, team, or user)."""
    return AppError(status.HTTP_404_NOT_FOUND, "NOT_FOUND", message)


def conflict(message: str, code: str = "CONFLICT", details: dict | None = None) -> AppError:
    """Construct an HTTP 409 Conflict error (e.g., STALE_VERSION concurrency conflict or email duplication)."""
    return AppError(status.HTTP_409_CONFLICT, code, message, details)

