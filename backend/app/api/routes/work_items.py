"""
Work Item Management REST API Endpoints

Provides endpoints for creating, querying, updating, transitioning, assigning,
commenting on, and inspecting audit histories for operational work items.
Enforces resource-level team authorization, Optimistic Concurrency Control (OCC),
and deduplication via idempotency keys.
"""

from datetime import datetime
# pyrefly: ignore [missing-import]
from fastapi import APIRouter, Depends, Query, Request, Response, status
# pyrefly: ignore [missing-import]
from sqlalchemy.orm import Session

from app.api.deps import get_auth_context
from app.core.database import get_db
from app.schemas import (
    ActivityPublic,
    CommentCreate,
    CommentPublic,
    PaginatedWorkItems,
    WorkItemAssign,
    WorkItemCreate,
    WorkItemPublic,
    WorkItemTransition,
    WorkItemUpdate,
)
from app.services.authz import AuthContext
from app.services.idempotency import IdempotencyService
from app.services.work_items import WorkItemService, to_public

router = APIRouter()


def item_response(item) -> WorkItemPublic:
    """Format a WorkItem ORM entity into a validated WorkItemPublic schema."""
    return WorkItemPublic.model_validate(to_public(item))


@router.get("", response_model=PaginatedWorkItems)
def list_work_items(
    ctx: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_db),
    search: str | None = None,
    status_filter: str | None = Query(default=None, alias="status"),
    priority: str | None = None,
    type_: str | None = Query(default=None, alias="type"),
    team_id: int | None = None,
    assignee_id: int | None = None,
    unassigned: bool = False,
    due_before: datetime | None = None,
    due_after: datetime | None = None,
    sort: str = "-updated_at",
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
) -> PaginatedWorkItems:
    """Search, filter, and paginate work items scoped to user's authorized teams.

    Features:
      - Full-text search across titles and descriptions using SQL ILIKE.
      - Exact match filtering by status, priority, type, team, or assignee.
      - Dynamic sorting (e.g., `-updated_at`, `due_at`, `priority`).
    """
    items, total = WorkItemService(db).list_filtered(
        ctx,
        search=search,
        status=status_filter,
        priority=priority,
        type_=type_,
        team_id=team_id,
        assignee_id=assignee_id,
        unassigned=unassigned,
        due_before=due_before,
        due_after=due_after,
        sort=sort,
        page=page,
        page_size=page_size,
    )
    return PaginatedWorkItems(
        items=[item_response(i) for i in items],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.post("", response_model=WorkItemPublic, status_code=status.HTTP_201_CREATED)
def create_work_item(
    body: WorkItemCreate,
    request: Request,
    response: Response,
    ctx: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_db),
):
    """Create a new operational work item with optional idempotency protection.

    If client supplies an `Idempotency-Key` header:
      - Hashes request method, path, and payload with SHA-256.
      - Replays identical cached responses on network retries without inserting duplicates.
      - Rejects conflicting bodies with HTTP 409 Conflict (`IDEMPOTENCY_KEY_REUSED`).
    """
    payload, code = IdempotencyService(db).create_work_item(ctx, request, body, WorkItemService(db))
    response.status_code = code
    return payload


@router.get("/{work_item_id}", response_model=WorkItemPublic)
def get_work_item(
    work_item_id: int,
    ctx: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_db),
) -> WorkItemPublic:
    """Retrieve full details of a work item, verifying resource-level team authorization."""
    return item_response(WorkItemService(db).get(ctx, work_item_id))


@router.patch("/{work_item_id}", response_model=WorkItemPublic)
def update_work_item(
    work_item_id: int,
    body: WorkItemUpdate,
    ctx: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_db),
) -> WorkItemPublic:
    """Update work item fields using Optimistic Concurrency Control (OCC).

    Requires client's observed `version` integer. Returns HTTP 409 Conflict (`STALE_VERSION`)
    if another user updated the item in the meantime. Logs field-by-field audit entries.
    """
    return item_response(WorkItemService(db).update(ctx, work_item_id, body))


@router.delete("/{work_item_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_work_item(
    work_item_id: int,
    ctx: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_db),
) -> None:
    """Hard-delete a work item and cascade audit logs/comments (System Admin only)."""
    WorkItemService(db).delete(ctx, work_item_id)


@router.post("/{work_item_id}/transition", response_model=WorkItemPublic)
def transition_work_item(
    work_item_id: int,
    body: WorkItemTransition,
    ctx: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_db),
) -> WorkItemPublic:
    """Execute a workflow state transition validated by the finite state machine.

    Enforces approval restrictions (Team Lead required for resolving pending items),
    validates OCC version, logs status change audit entries, and fires notifications.
    """
    return item_response(
        WorkItemService(db).transition(
            ctx, work_item_id, body.version, body.status, blocked_reason=body.blocked_reason
        )
    )


@router.post("/{work_item_id}/assign", response_model=WorkItemPublic)
def assign_work_item(
    work_item_id: int,
    body: WorkItemAssign,
    ctx: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_db),
) -> WorkItemPublic:
    """Reassign work item or claim/release assignment, gated by OCC version."""
    return item_response(WorkItemService(db).assign(ctx, work_item_id, body))


@router.get("/{work_item_id}/comments", response_model=list[CommentPublic])
def list_comments(
    work_item_id: int,
    ctx: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_db),
) -> list[CommentPublic]:
    """Retrieve all discussion comments for a work item in chronological order."""
    comments = WorkItemService(db).list_comments(ctx, work_item_id)
    return [
        CommentPublic(
            id=c.id,
            work_item_id=c.work_item_id,
            author_id=c.author_id,
            body=c.body,
            created_at=c.created_at,
            author_name=c.author.name if c.author else None,
        )
        for c in comments
    ]


@router.post("/{work_item_id}/comments", response_model=CommentPublic, status_code=status.HTTP_201_CREATED)
def add_comment(
    work_item_id: int,
    body: CommentCreate,
    ctx: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_db),
) -> CommentPublic:
    """Post a new discussion comment, appending an audit record and notifying assignee/creator."""
    comment = WorkItemService(db).add_comment(ctx, work_item_id, body.body)
    return CommentPublic(
        id=comment.id,
        work_item_id=comment.work_item_id,
        author_id=comment.author_id,
        body=comment.body,
        created_at=comment.created_at,
        author_name=ctx.user.name,
    )


@router.get("/{work_item_id}/activity", response_model=list[ActivityPublic])
def list_activity(
    work_item_id: int,
    ctx: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_db),
) -> list[ActivityPublic]:
    """Fetch the immutable historical audit trail of all changes to this work item."""
    rows = WorkItemService(db).list_activity(ctx, work_item_id)
    return [
        ActivityPublic(
            id=r.id,
            work_item_id=r.work_item_id,
            actor_id=r.actor_id,
            action=r.action,
            field_name=r.field_name,
            old_value=r.old_value,
            new_value=r.new_value,
            metadata=r.extra_metadata,
            created_at=r.created_at,
            actor_name=r.actor.name if r.actor else None,
        )
        for r in rows
    ]

