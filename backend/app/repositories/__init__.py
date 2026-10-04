"""
Data Access Layer (Repository Pattern)

Abstracts persistence and SQL query construction away from services and route handlers:
  - `UserRepository`: Querying and managing user accounts and team memberships.
  - `TeamRepository`: Querying teams and member rosters.
  - `WorkItemRepository`: Complex filtered and paginated queries, search, and sorting.
  - `CommentRepository`: Chronological retrieval and insertion of work item comments.
  - `ActivityRepository`: Immutable audit trail retrieval and logging.
  - `IdempotencyRepository`: Storage and retrieval of request SHA-256 digests and responses.
  - `NotificationRepository`: Paginated notification listing, unread counts, and status updates.
"""

from datetime import datetime, timezone

# pyrefly: ignore [missing-import]
from sqlalchemy import Select, func, or_, select, update
# pyrefly: ignore [missing-import]
from sqlalchemy.orm import Session, joinedload, selectinload

from app.models import ActivityLog, Comment, IdempotencyKey, Notification, Team, TeamMembership, User, WorkItem


class UserRepository:
    """Repository handling persistence operations for User accounts."""

    def __init__(self, db: Session) -> None:
        self.db = db

    def get_by_id(self, user_id: int) -> User | None:
        """Find user by primary key."""
        return self.db.get(User, user_id)

    def get_by_email(self, email: str) -> User | None:
        """Find user by case-insensitive email lookup."""
        return self.db.scalar(select(User).where(func.lower(User.email) == email.lower()))

    def list_all(self) -> list[User]:
        """List all users with their team memberships and team names eagerly loaded."""
        from app.models import TeamMembership
        return list(self.db.scalars(
            select(User)
            .options(selectinload(User.memberships).joinedload(TeamMembership.team))
            .order_by(User.id)
        ).all())

    def add(self, user: User) -> User:
        """Add a new user entity and flush to database."""
        self.db.add(user)
        self.db.flush()
        return user

    def delete(self, user: User) -> None:
        """Delete user account and cascade memberships."""
        self.db.delete(user)
        self.db.flush()

    def get_with_teams(self, user_id: int) -> User | None:
        """Fetch user by ID with memberships and associated teams eagerly joined."""
        from app.models import TeamMembership
        return self.db.scalar(
            select(User)
            .options(selectinload(User.memberships).joinedload(TeamMembership.team))
            .where(User.id == user_id)
        )

    def list_pending(self) -> list[User]:
        """Retrieve all newly registered users awaiting administrative approval."""
        from app.models import UserStatus
        return list(self.db.scalars(select(User).where(User.status == UserStatus.PENDING.value).order_by(User.created_at.desc())).all())

    def update_status(self, user: User, status: str) -> User:
        """Update approval status (PENDING, APPROVED, REJECTED)."""
        user.status = status
        self.db.add(user)
        self.db.flush()
        return user


class TeamRepository:
    """Repository handling query and persistence operations for organizational Teams."""

    def __init__(self, db: Session) -> None:
        self.db = db

    def get(self, team_id: int) -> Team | None:
        """Find team by primary key."""
        return self.db.get(Team, team_id)


    def get_with_members(self, team_id: int) -> Team | None:
        return self.db.scalar(
            select(Team)
            .options(selectinload(Team.memberships).joinedload(TeamMembership.user))
            .where(Team.id == team_id)
        )

    def list_all(self) -> list[Team]:
        return list(self.db.scalars(select(Team).order_by(Team.name)).all())

    def add(self, team: Team) -> Team:
        self.db.add(team)
        self.db.flush()
        return team

    def memberships_for_user(self, user_id: int) -> list[TeamMembership]:
        return list(
            self.db.scalars(select(TeamMembership).where(TeamMembership.user_id == user_id)).all()
        )

    def add_membership(self, membership: TeamMembership) -> TeamMembership:
        self.db.add(membership)
        self.db.flush()
        return membership


class WorkItemRepository:
    """Repository managing WorkItem retrieval, full-text search, and multi-field filtering."""

    def __init__(self, db: Session) -> None:
        self.db = db

    def get(self, work_item_id: int) -> WorkItem | None:
        """Find work item by primary key with joined team, assignee, and creator."""
        return self.db.scalar(
            select(WorkItem)
            .options(
                joinedload(WorkItem.team),
                joinedload(WorkItem.assignee),
                joinedload(WorkItem.created_by),
            )
            .where(WorkItem.id == work_item_id)
        )

    def add(self, item: WorkItem) -> WorkItem:
        """Add work item entity and flush to database."""
        self.db.add(item)
        self.db.flush()
        return item

    def delete(self, item: WorkItem) -> None:
        """Delete work item entity."""
        self.db.delete(item)

    def list_filtered(
        self,
        *,
        visible_team_ids: list[int] | None,
        search: str | None,
        status: str | None,
        priority: str | None,
        type_: str | None,
        team_id: int | None,
        assignee_id: int | None,
        unassigned: bool,
        due_before: datetime | None,
        due_after: datetime | None,
        sort: str,
        page: int,
        page_size: int,
    ) -> tuple[list[WorkItem], int]:
        """Execute a paginated query with dynamic search filters, team visibility scoping, and sorting.

        Args:
            visible_team_ids: Authorized team IDs (or None for unrestricted admin access).
            search: Substring query applied across title and description via ILIKE.
            status: Exact status match filter.
            priority: Exact priority match filter.
            type_: Exact work item type match filter.
            team_id: Specific team filter.
            assignee_id: Specific assignee filter.
            unassigned: If True, matches items with NULL assignee_id.
            due_before: Filter items with due_at <= timestamp.
            due_after: Filter items with due_at >= timestamp.
            sort: Sort key (e.g. '-updated_at', 'priority', 'due_at'). Leading '-' indicates descending.
            page: 1-indexed page number.
            page_size: Items per page.

        Returns:
            tuple[list[WorkItem], int]: Page of items and total count of matching records.
        """
        stmt: Select[tuple[WorkItem]] = select(WorkItem).options(
            joinedload(WorkItem.team),
            joinedload(WorkItem.assignee),
            joinedload(WorkItem.created_by),
        )
        count_stmt = select(func.count(WorkItem.id))

        def apply_filters(s):
            if visible_team_ids is not None:
                s = s.where(WorkItem.team_id.in_(visible_team_ids or [-1]))
            if search:
                pattern = f"%{search}%"
                s = s.where(or_(WorkItem.title.ilike(pattern), WorkItem.description.ilike(pattern)))
            if status:
                s = s.where(WorkItem.status == status)
            if priority:
                s = s.where(WorkItem.priority == priority)
            if type_:
                s = s.where(WorkItem.type == type_)
            if team_id:
                s = s.where(WorkItem.team_id == team_id)
            if unassigned:
                s = s.where(WorkItem.assignee_id.is_(None))
            elif assignee_id:
                s = s.where(WorkItem.assignee_id == assignee_id)
            if due_before:
                s = s.where(WorkItem.due_at.is_not(None), WorkItem.due_at <= due_before)
            if due_after:
                s = s.where(WorkItem.due_at.is_not(None), WorkItem.due_at >= due_after)
            return s

        stmt = apply_filters(stmt)
        count_stmt = apply_filters(count_stmt)

        sort_map = {
            "updated_at": WorkItem.updated_at,
            "created_at": WorkItem.created_at,
            "due_at": WorkItem.due_at,
            "priority": WorkItem.priority,
            "status": WorkItem.status,
            "id": WorkItem.id,
            "title": WorkItem.title,
        }
        descending = sort.startswith("-")
        key = sort.lstrip("-")
        column = sort_map.get(key, WorkItem.updated_at)
        stmt = stmt.order_by(column.desc() if descending else column.asc(), WorkItem.id.desc())
        total = int(self.db.scalar(count_stmt) or 0)
        items = list(self.db.scalars(stmt.offset((page - 1) * page_size).limit(page_size)).unique().all())
        return items, total


class CommentRepository:
    """Repository handling discussion comments on work items."""

    def __init__(self, db: Session) -> None:
        self.db = db

    def list_for_item(self, work_item_id: int) -> list[Comment]:
        """Fetch all comments for a work item in chronological order with authors joined."""
        return list(
            self.db.scalars(
                select(Comment)
                .options(joinedload(Comment.author))
                .where(Comment.work_item_id == work_item_id)
                .order_by(Comment.created_at.asc())
            ).unique().all()
        )

    def add(self, comment: Comment) -> Comment:
        """Persist a new comment entity."""
        self.db.add(comment)
        self.db.flush()
        return comment


class ActivityRepository:
    """Repository managing immutable audit log entries."""

    def __init__(self, db: Session) -> None:
        self.db = db

    def list_for_item(self, work_item_id: int) -> list[ActivityLog]:
        """Fetch audit trail for a work item ordered chronologically."""
        return list(
            self.db.scalars(
                select(ActivityLog)
                .options(joinedload(ActivityLog.actor))
                .where(ActivityLog.work_item_id == work_item_id)
                .order_by(ActivityLog.created_at.asc(), ActivityLog.id.asc())
            ).unique().all()
        )

    def add(self, activity: ActivityLog) -> ActivityLog:
        """Append an audit log record to the active transaction."""
        self.db.add(activity)
        self.db.flush()
        return activity


class IdempotencyRepository:
    """Repository storing request hashes and response bodies for idempotency guarantees."""

    def __init__(self, db: Session) -> None:
        self.db = db

    def get(self, user_id: int, key: str) -> IdempotencyKey | None:
        """Find an existing idempotency record scoped to a specific user and key."""
        return self.db.scalar(
            select(IdempotencyKey).where(IdempotencyKey.user_id == user_id, IdempotencyKey.key == key)
        )

    def add(self, record: IdempotencyKey) -> IdempotencyKey:
        """Insert a new idempotency key record."""
        self.db.add(record)
        self.db.flush()
        return record


class NotificationRepository:
    """Repository managing user notification records and unread statuses."""

    def __init__(self, db: Session) -> None:
        self.db = db

    def get(self, notification_id: int, user_id: int) -> Notification | None:
        """Retrieve a specific notification verifying ownership by the user."""
        return self.db.scalar(
            select(Notification).where(
                Notification.id == notification_id,
                Notification.user_id == user_id,
            )
        )

    def list_for_user(
        self,
        user_id: int,
        unread_only: bool = False,
        page: int = 1,
        page_size: int = 20,
    ) -> tuple[list[Notification], int, int]:
        """List notifications for a user with pagination and unread counts."""
        count_stmt = select(func.count(Notification.id)).where(Notification.user_id == user_id)
        unread_count_stmt = select(func.count(Notification.id)).where(
            Notification.user_id == user_id,
            Notification.is_read.is_(False),
        )

        stmt = select(Notification).where(Notification.user_id == user_id)
        if unread_only:
            stmt = stmt.where(Notification.is_read.is_(False))
            count_stmt = count_stmt.where(Notification.is_read.is_(False))

        stmt = stmt.order_by(Notification.created_at.desc(), Notification.id.desc())
        offset = max(0, (page - 1) * page_size)
        stmt = stmt.offset(offset).limit(page_size)

        items = list(self.db.scalars(stmt).all())
        total = int(self.db.scalar(count_stmt) or 0)
        unread_count = int(self.db.scalar(unread_count_stmt) or 0)
        return items, total, unread_count

    def get_unread_count(self, user_id: int) -> int:
        """Count total unread notifications for a user."""
        return int(
            self.db.scalar(
                select(func.count(Notification.id)).where(
                    Notification.user_id == user_id,
                    Notification.is_read.is_(False),
                )
            )
            or 0
        )

    def add(self, notification: Notification) -> Notification:
        """Add new notification record."""
        self.db.add(notification)
        self.db.flush()
        return notification

    def mark_as_read(self, notification: Notification) -> Notification:
        """Mark single notification as read with current timestamp."""
        if not notification.is_read:
            notification.is_read = True
            notification.read_at = datetime.now(timezone.utc)
            self.db.add(notification)
            self.db.flush()
        return notification

    def mark_all_as_read(self, user_id: int) -> int:
        """Mark all unread notifications for a user as read."""
        now = datetime.now(timezone.utc)
        stmt = (
            update(Notification)
            .where(Notification.user_id == user_id, Notification.is_read.is_(False))
            .values(is_read=True, read_at=now)
        )
        result = self.db.execute(stmt)
        self.db.flush()
        return result.rowcount

    def delete(self, notification: Notification) -> None:
        """Remove a notification record."""
        self.db.delete(notification)
        self.db.flush()

