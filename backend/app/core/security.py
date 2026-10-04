"""
Security, Password Hashing, and JWT Token Services

Provides cryptographic password hashing using Passlib with bcrypt,
and stateless JSON Web Token (JWT) encoding and verification. Tokens embed
a `session_version` integer claim to support immediate session revocation across
devices upon user logout or password reset without maintaining an external Redis store.
"""

from datetime import datetime, timedelta, timezone

from jose import JWTError, jwt
# pyrefly: ignore [missing-import]
from passlib.context import CryptContext

from app.core.config import settings

# Cryptographic context for bcrypt hashing with automatic deprecation handling
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    """Hash a plaintext password using bcrypt with automatic salt generation.

    Args:
        password: Plaintext password string.

    Returns:
        str: Bcrypt salted password hash.
    """
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    """Verify a candidate plaintext password against an existing bcrypt hash.

    Args:
        plain: Candidate plaintext password string.
        hashed: Stored bcrypt password hash.

    Returns:
        bool: True if password matches the hash, False otherwise.
    """
    return pwd_context.verify(plain, hashed)


def create_access_token(subject: str, session_version: int = 1) -> str:
    """Generate a signed JWT access token for an authenticated user.

    The token payload includes:
      - `sub`: User ID as string.
      - `exp`: Expiration timestamp in UTC.
      - `session_version`: Current session version counter of the user,
        allowing global token revocation on logout.

    Args:
        subject: Subject identifier (typically user ID).
        session_version: Current session version counter from the user database record.

    Returns:
        str: Encoded and signed JWT string.
    """
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.jwt_expire_minutes)
    payload = {"sub": subject, "exp": expire, "session_version": session_version}
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def decode_access_token(token: str) -> dict | None:
    """Decode and verify the cryptographic signature and expiration of a JWT access token.

    Args:
        token: Raw JWT string from Authorization header or cookie.

    Returns:
        dict | None: Decoded claims payload if valid; None if expired, malformed, or signature invalid.
    """
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
        return payload
    except JWTError:
        return None

