"""
In-App Notifications REST API Endpoints

Provides endpoints for polling unread alerts, listing paginated notifications,
updating read statuses, and dismissing notification items.
"""

# pyrefly: ignore [missing-import]
from fastapi import APIRouter, Depends, Query, status
# pyrefly: ignore [missing-import]
from sqlalchemy.orm import Session

from app.api.deps import get_auth_context
from app.core.database import get_db
from app.core.errors import not_found
from app.repositories import NotificationRepository
from app.schemas import NotificationListResponse, NotificationPublic, UnreadCountResponse
from app.services.authz import AuthContext

router = APIRouter()


@router.get("", response_model=NotificationListResponse)
def list_notifications(
    unread_only: bool = Query(default=False),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    ctx: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_db),
) -> NotificationListResponse:
    """Retrieve paginated notifications for the current authenticated user."""
    repo = NotificationRepository(db)
    items, total, unread_count = repo.list_for_user(
        user_id=ctx.user.id,
        unread_only=unread_only,
        page=page,
        page_size=page_size,
    )
    return NotificationListResponse(
        items=items,
        total=total,
        unread_count=unread_count,
        page=page,
        page_size=page_size,
    )


@router.get("/unread-count", response_model=UnreadCountResponse)
def get_unread_count(
    ctx: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_db),
) -> UnreadCountResponse:
    """Lightweight endpoint polled by the UI bell badge (every 15s) to display unread count."""
    repo = NotificationRepository(db)
    count = repo.get_unread_count(user_id=ctx.user.id)
    return UnreadCountResponse(unread_count=count)


@router.patch("/{notification_id}/read", response_model=NotificationPublic)
def mark_read(
    notification_id: int,
    ctx: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_db),
) -> NotificationPublic:
    """Mark a specific notification as read."""
    repo = NotificationRepository(db)
    notif = repo.get(notification_id, ctx.user.id)
    if not notif:
        raise not_found("Notification not found")
    repo.mark_as_read(notif)
    db.commit()
    db.refresh(notif)
    return notif


@router.post("/mark-all-read")
def mark_all_read(
    ctx: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_db),
) -> dict:
    """Mark all unread notifications for the current user as read."""
    repo = NotificationRepository(db)
    count = repo.mark_all_as_read(ctx.user.id)
    db.commit()
    return {"ok": True, "count": count}


@router.delete("/{notification_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_notification(
    notification_id: int,
    ctx: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_db),
) -> None:
    """Dismiss and delete a single notification record."""
    repo = NotificationRepository(db)
    notif = repo.get(notification_id, ctx.user.id)
    if not notif:
        raise not_found("Notification not found")
    repo.delete(notif)
    db.commit()

