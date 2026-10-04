"""
SQLAlchemy 2.0 ORM Models and Finite State Machine Definitions

Defines relational database tables, constraints, indexes, relationships, and
the workflow finite state machine transitions for the Newtonite monolith:
  - `User`: Employee accounts with authentication credentials and session version counter.
  - `Team`: Cross-functional team containers (e.g. Engineering, Payments, Operations).
  - `TeamMembership`: Many-to-many relationship with role assignment (MEMBER or TEAM_LEAD).
  - `WorkItem`: Operational task tracking with Optimistic Concurrency Control (version counter).
  - `Comment`: Collaborative discussion logs per work item.
  - `ActivityLog`: Append-only, co-transactional audit trail.
  - `IdempotencyKey`: Scoped request cache preventing duplicate mutations on network retries.
  - `Notification`: Targeted in-app alerts and notifications.
"""

from datetime import datetime
from enum import Enum

# pyrefly: ignore [missing-import]
from sqlalchemy import (
    JSON,
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    false,
    func,
)
# pyrefly: ignore [missing-import]
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class WorkItemType(str, Enum):
    """Categorical classification of operational work items."""
    CUSTOMER_ISSUE = "CUSTOMER_ISSUE"
    ENGINEERING = "ENGINEERING"
    PAYMENT = "PAYMENT"
    INCIDENT = "INCIDENT"
    COMPLIANCE = "COMPLIANCE"
    OPERATIONAL = "OPERATIONAL"


class WorkItemStatus(str, Enum):
    """Lifecycle states for operational work items."""
    OPEN = "OPEN"
    IN_PROGRESS = "IN_PROGRESS"
    PENDING_APPROVAL = "PENDING_APPROVAL"
    BLOCKED = "BLOCKED"
    RESOLVED = "RESOLVED"
    CLOSED = "CLOSED"


class UserStatus(str, Enum):
    """Account verification status for employee registrations."""
    PENDING = "PENDING"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"


class WorkItemPriority(str, Enum):
    """Triage priority levels determining escalation urgency."""
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"
    CRITICAL = "CRITICAL"


class MembershipRole(str, Enum):
    """Role held by an employee within a specific operational team."""
    TEAM_LEAD = "TEAM_LEAD"
    MEMBER = "MEMBER"


class ActivityAction(str, Enum):
    """Action categories recorded in the immutable audit trail."""
    CREATED = "CREATED"
    UPDATED = "UPDATED"
    STATUS_CHANGED = "STATUS_CHANGED"
    PRIORITY_CHANGED = "PRIORITY_CHANGED"
    ASSIGNEE_CHANGED = "ASSIGNEE_CHANGED"
    TEAM_CHANGED = "TEAM_CHANGED"
    DUE_DATE_CHANGED = "DUE_DATE_CHANGED"
    COMMENT_ADDED = "COMMENT_ADDED"
    APPROVAL_REQUESTED = "APPROVAL_REQUESTED"
    APPROVED = "APPROVED"
    RESOLVED = "RESOLVED"
    CLOSED = "CLOSED"
    DELETED = "DELETED"


class NotificationType(str, Enum):
    """Categories of in-app notifications sent to users."""
    ASSIGNMENT = "ASSIGNMENT"
    STATUS_CHANGE = "STATUS_CHANGE"
    APPROVAL_REQUESTED = "APPROVAL_REQUESTED"
    APPROVAL_DECISION = "APPROVAL_DECISION"
    COMMENT = "COMMENT"
    USER_APPROVAL = "USER_APPROVAL"
    SYSTEM = "SYSTEM"


# Strict Finite State Machine: maps current status to the set of allowable next statuses
ALLOWED_TRANSITIONS: dict[WorkItemStatus, set[WorkItemStatus]] = {
    WorkItemStatus.OPEN: {WorkItemStatus.IN_PROGRESS, WorkItemStatus.CLOSED, WorkItemStatus.PENDING_APPROVAL},
    WorkItemStatus.IN_PROGRESS: {WorkItemStatus.BLOCKED, WorkItemStatus.RESOLVED, WorkItemStatus.PENDING_APPROVAL},
    WorkItemStatus.PENDING_APPROVAL: {WorkItemStatus.IN_PROGRESS, WorkItemStatus.RESOLVED, WorkItemStatus.OPEN, WorkItemStatus.BLOCKED},
    WorkItemStatus.BLOCKED: {WorkItemStatus.IN_PROGRESS, WorkItemStatus.PENDING_APPROVAL},
    WorkItemStatus.RESOLVED: {WorkItemStatus.CLOSED, WorkItemStatus.IN_PROGRESS},
    WorkItemStatus.CLOSED: set(),
}



class User(Base):
    """User account entity storing credentials, administrative flags, and session version counter."""
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    is_admin: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default=UserStatus.PENDING.value, server_default=UserStatus.PENDING.value)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
    # Incremented upon logout or password change to invalidate previously signed JWT tokens
    session_version: Mapped[int] = mapped_column(Integer, nullable=False, default=1, server_default="1")

    memberships: Mapped[list["TeamMembership"]] = relationship(back_populates="user")
    notifications: Mapped[list["Notification"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )


class Team(Base):
    """Organizational team entity partitioning work items and access boundaries."""
    __tablename__ = "teams"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(120), unique=True, nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    memberships: Mapped[list["TeamMembership"]] = relationship(back_populates="team")
    work_items: Mapped[list["WorkItem"]] = relationship(back_populates="team")


class TeamMembership(Base):
    """Join entity associating a User with a Team, defining their role (MEMBER or TEAM_LEAD)."""
    __tablename__ = "team_memberships"
    __table_args__ = (
        UniqueConstraint("user_id", "team_id", name="uq_membership_user_team"),
        CheckConstraint("role IN ('TEAM_LEAD', 'MEMBER')", name="ck_membership_role"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    team_id: Mapped[int] = mapped_column(ForeignKey("teams.id", ondelete="CASCADE"), nullable=False)
    role: Mapped[str] = mapped_column(String(20), nullable=False)

    user: Mapped[User] = relationship(back_populates="memberships")
    team: Mapped[Team] = relationship(back_populates="memberships")


class WorkItem(Base):
    """Operational unit of work tracking customer issues, incidents, and cross-team tasks.

    Includes an integer `version` field for version-gated Optimistic Concurrency Control (OCC).
    """
    __tablename__ = "work_items"
    __table_args__ = (
        CheckConstraint(
            "type IN ('CUSTOMER_ISSUE','ENGINEERING','PAYMENT','INCIDENT','COMPLIANCE','OPERATIONAL')",
            name="ck_work_item_type",
        ),
        CheckConstraint(
            "status IN ('OPEN','IN_PROGRESS','PENDING_APPROVAL','BLOCKED','RESOLVED','CLOSED')",
            name="ck_work_item_status",
        ),
        CheckConstraint(
            "priority IN ('LOW','MEDIUM','HIGH','CRITICAL')",
            name="ck_work_item_priority",
        ),
        Index("ix_work_items_status", "status"),
        Index("ix_work_items_priority", "priority"),
        Index("ix_work_items_team_id", "team_id"),
        Index("ix_work_items_assignee_id", "assignee_id"),
        Index("ix_work_items_updated_at", "updated_at"),
        Index("ix_work_items_due_at", "due_at"),
        Index("ix_work_items_team_status", "team_id", "status"),
        Index("ix_work_items_type", "type"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    title: Mapped[str] = mapped_column(String(240), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    type: Mapped[str] = mapped_column(String(40), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default=WorkItemStatus.OPEN.value)
    priority: Mapped[str] = mapped_column(String(20), nullable=False, default=WorkItemPriority.MEDIUM.value)
    team_id: Mapped[int] = mapped_column(ForeignKey("teams.id"), nullable=False)
    assignee_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    created_by_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    due_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    blocked_reason: Mapped[str | None] = mapped_column(Text, nullable=True)

    team: Mapped[Team] = relationship(back_populates="work_items")
    assignee: Mapped[User | None] = relationship(foreign_keys=[assignee_id])
    created_by: Mapped[User] = relationship(foreign_keys=[created_by_id])
    comments: Mapped[list["Comment"]] = relationship(back_populates="work_item")
    activities: Mapped[list["ActivityLog"]] = relationship(back_populates="work_item")


class Comment(Base):
    """Discussion note posted to a work item by a collaborating user."""
    __tablename__ = "comments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    work_item_id: Mapped[int] = mapped_column(
        ForeignKey("work_items.id", ondelete="CASCADE"), nullable=False, index=True
    )
    author_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    work_item: Mapped[WorkItem] = relationship(back_populates="comments")
    author: Mapped[User] = relationship()


class ActivityLog(Base):
    """Immutable, append-only audit trail logging all lifecycle modifications on a work item."""
    __tablename__ = "activity_logs"
    __table_args__ = (Index("ix_activity_work_item_created", "work_item_id", "created_at"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    work_item_id: Mapped[int] = mapped_column(
        ForeignKey("work_items.id", ondelete="CASCADE"), nullable=False
    )
    actor_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    action: Mapped[str] = mapped_column(String(40), nullable=False)
    field_name: Mapped[str | None] = mapped_column(String(80))
    old_value: Mapped[str | None] = mapped_column(Text)
    new_value: Mapped[str | None] = mapped_column(Text)
    extra_metadata: Mapped[dict | None] = mapped_column("metadata", JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    work_item: Mapped[WorkItem] = relationship(back_populates="activities")
    actor: Mapped[User] = relationship()


class IdempotencyKey(Base):
    """Database record caching mutation request hashes and responses to deduplicate network retries."""
    __tablename__ = "idempotency_keys"
    __table_args__ = (UniqueConstraint("user_id", "key", name="uq_idempotency_user_key"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    key: Mapped[str] = mapped_column(String(128), nullable=False)
    method: Mapped[str] = mapped_column(String(10), nullable=False)
    path: Mapped[str] = mapped_column(String(255), nullable=False)
    request_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    response_status: Mapped[int] = mapped_column(Integer, nullable=False)
    response_body: Mapped[dict] = mapped_column(JSON, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Notification(Base):
    """In-app alert informing a user of assignments, review requests, or workflow transitions."""
    __tablename__ = "notifications"
    __table_args__ = (
        Index("ix_notifications_user_is_read_created", "user_id", "is_read", "created_at"),
        Index("ix_notifications_user_created", "user_id", "created_at"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    type: Mapped[str] = mapped_column(String(50), nullable=False, default=NotificationType.SYSTEM.value)
    link: Mapped[str | None] = mapped_column(String(255), nullable=True)
    work_item_id: Mapped[int | None] = mapped_column(ForeignKey("work_items.id", ondelete="CASCADE"), nullable=True, index=True)
    is_read: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default=false(), index=True)
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    user: Mapped[User] = relationship(back_populates="notifications")
    work_item: Mapped[WorkItem | None] = relationship()

