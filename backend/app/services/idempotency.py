"""
Idempotent Request Handling and Deduplication

Provides cryptographic request hashing and database-backed idempotency protection.
Ensures that network retries or duplicate client submissions using the `Idempotency-Key`
HTTP header safely replay the original response without duplicating work items or side effects.
"""

import hashlib
import json

# pyrefly: ignore [missing-import]
from fastapi import Request
# pyrefly: ignore [missing-import]
from sqlalchemy.exc import IntegrityError
# pyrefly: ignore [missing-import]
from sqlalchemy.orm import Session

from app.core.errors import conflict
from app.models import IdempotencyKey
from app.repositories import IdempotencyRepository
from app.schemas import WorkItemPublic
from app.services.authz import AuthContext
from app.services.work_items import WorkItemService, to_public


def request_hash(method: str, path: str, body: dict) -> str:
    """Compute a deterministic SHA-256 hash of an HTTP request.

    Serializes the request method, path, and JSON body with sorted keys to ensure
    identical payloads always produce the exact same hex digest regardless of key ordering.

    Args:
        method: HTTP verb (e.g. 'POST').
        path: Normalized URL path (e.g. '/api/work-items').
        body: Request body dictionary.

    Returns:
        str: 64-character hexadecimal SHA-256 digest string.
    """
    payload = json.dumps({"method": method, "path": path, "body": body}, sort_keys=True, default=str)
    return hashlib.sha256(payload.encode()).hexdigest()


class IdempotencyService:
    """Orchestrates idempotent work item creation and response caching per user."""

    def __init__(self, db: Session) -> None:
        self.db = db
        self.repo = IdempotencyRepository(db)

    def create_work_item(self, actor: AuthContext, request: Request, data, service: WorkItemService):
        """Create a work item idempotently if the `Idempotency-Key` header is present.

        Workflow:
          1. If no `Idempotency-Key` header is provided, execute standard creation.
          2. Calculate SHA-256 payload digest.
          3. Check for existing key scoped to this user (`user_id`, `key`).
             - If found with same digest: replay stored response body and status code (safe retry).
             - If found with different digest: raise HTTP 409 Conflict (`IDEMPOTENCY_KEY_REUSED`).
          4. Execute creation within an uncommitted transaction, insert IdempotencyKey record,
             and commit atomically.
          5. Handle race conditions: if concurrent requests with the identical key race,
             PostgreSQL unique constraint violation triggers a rollback and replay check.

        Args:
            actor: Current authorization context.
            request: Active FastAPI request object.
            data: WorkItemCreate schema instance.
            service: WorkItemService instance for domain logic.

        Returns:
            tuple[dict, int]: Response payload dictionary and HTTP status code (201).
        """
        key = request.headers.get("Idempotency-Key")
        if not key:
            item = service.create(actor, data)
            return to_public(item), 201

        # Calculate canonical payload digest
        digest = request_hash("POST", "/api/work-items", data.model_dump(mode="json"))
        existing = self.repo.get(actor.user.id, key)

        # Existing key found: verify payload matches
        if existing:
            if existing.request_hash != digest:
                raise conflict(
                    "Idempotency-Key was reused with a different request body",
                    code="IDEMPOTENCY_KEY_REUSED",
                )
            # Safe replay
            return existing.response_body, existing.response_status

        # Create item without committing so both the item and key persist atomically
        item = service.create(actor, data, commit=False)
        body = WorkItemPublic.model_validate(to_public(item)).model_dump(mode="json")
        self.repo.add(
            IdempotencyKey(
                user_id=actor.user.id,
                key=key,
                method="POST",
                path="/api/work-items",
                request_hash=digest,
                response_status=201,
                response_body=body,
            )
        )
        try:
            self.db.commit()
        except IntegrityError:
            # Concurrent race condition: another worker committed this key first
            self.db.rollback()
            stored = self.repo.get(actor.user.id, key)
            if stored and stored.request_hash == digest:
                return stored.response_body, stored.response_status
            raise conflict(
                "Idempotency-Key was reused with a different request body",
                code="IDEMPOTENCY_KEY_REUSED",
            )

        # Re-fetch fully loaded item with relationships
        item = service.get(actor, item.id)
        return to_public(item), 201

