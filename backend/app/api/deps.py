"""
FastAPI Request Dependencies

Provides dependency injection helpers for route handlers:
  - `get_current_user`: Validates JWT token from header/cookie, checks user status and session version.
  - `get_auth_context`: Assembles an `AuthContext` containing user profile, team memberships, and lead roles.
  - `optional_idempotency_key`: Extracts the `Idempotency-Key` HTTP header for idempotent creation endpoints.
"""

# pyrefly: ignore [missing-import]
from fastapi import Depends, Header, Request
# pyrefly: ignore [missing-import]
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.errors import unauthorized
from app.core.security import decode_access_token
from app.models import User
from app.repositories import TeamRepository, UserRepository
from app.services.authz import AuthContext, build_auth_context


def get_current_user(
    request: Request,
    db: Session = Depends(get_db),
) -> User:
    """Authenticate the current user via JWT bearer token or secure HTTP-only cookie.

    Validation steps:
      1. Extract token from `Authorization: Bearer <token>` header or `newtonite_token` cookie.
      2. Decode and cryptographically verify the JWT signature and expiration.
      3. Verify the user exists in the database and is marked active (`is_active == True`).
      4. Compare the token's embedded `session_version` against `user.session_version`. If
         the user logged out or changed passwords, `user.session_version` was incremented,
         rendering previously issued tokens immediately invalid.

    Raises:
        AppError(401): If token is missing, invalid, expired, or session has been revoked.

    Returns:
        User: The authenticated SQLAlchemy User model instance.
    """
    token = None
    # 1. Check Authorization Bearer header
    auth = request.headers.get("Authorization")
    if auth and auth.startswith("Bearer "):
        token = auth[7:].strip()
    # 2. Fall back to HttpOnly cookie
    if not token:
        token = request.cookies.get("newtonite_token")
    if not token:
        raise unauthorized()

    # 3. Decode JWT payload
    payload = decode_access_token(token)
    if not payload or not payload.get("sub"):
        raise unauthorized("Invalid or expired token")

    try:
        user_id = int(payload["sub"])
    except ValueError:
        raise unauthorized("Invalid token subject")

    # 4. Verify user exists and is active
    user = UserRepository(db).get_by_id(user_id)
    if not user or not user.is_active:
        raise unauthorized("User is inactive or not found")

    # 5. Verify session version to invalidate older tokens on logout
    token_session_version = payload.get("session_version", 1)
    if user.session_version != token_session_version:
        raise unauthorized("Session expired because you logged in from another device.")

    return user


def get_auth_context(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> AuthContext:
    """Build the request authorization context for the authenticated user.

    Eagerly loads the user's team memberships and team lead roles once per request
    to facilitate high-performance in-memory permission and isolation checks.

    Returns:
        AuthContext: Context holding user details, visible team IDs, and lead roles.
    """
    return build_auth_context(user, TeamRepository(db))


def optional_idempotency_key(
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
) -> str | None:
    """Extract optional client-supplied `Idempotency-Key` header for mutation deduplication."""
    return idempotency_key

