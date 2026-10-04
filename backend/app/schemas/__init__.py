"""
Pydantic Request & Response Data Contracts (Schemas)

Defines data validation schemas, serialization models, and OpenAPI specifications:
  - User & Authentication: Registration, login credentials, token payloads, and profile details.
  - Team Management: Team creation, member listings, and role associations.
  - Work Item Operations: Creation, mutation with version gating (OCC), transitions, and assignments.
  - Discussion & Audit: Comment posting and immutable activity log representations.
  - Analytics & Dashboards: Aggregated KPI metrics and distribution summaries.
  - Notifications: Alerts, paginated lists, and unread count badges.
"""

from datetime import datetime

# pyrefly: ignore [missing-import]
from pydantic import BaseModel, ConfigDict, EmailStr, Field

from app.models import MembershipRole, WorkItemPriority, WorkItemStatus, WorkItemType, UserStatus


class ORMModel(BaseModel):
    """Base Pydantic schema configured to read attributes directly from SQLAlchemy ORM entities."""
    model_config = ConfigDict(from_attributes=True)


class UserPublic(ORMModel):
    """Public representation of an employee account."""
    id: int
    name: str
    email: str
    is_active: bool
    is_admin: bool
    status: UserStatus
    created_at: datetime


class UserCreate(BaseModel):
    """Payload for registering a new employee account."""
    name: str = Field(min_length=1, max_length=120)
    email: str
    password: str = Field(min_length=8, max_length=72)
    is_admin: bool = False
    team_id: int | None = None


class UserUpdate(BaseModel):
    """Payload for updating user profile information or administrative team assignments."""
    name: str | None = Field(default=None, min_length=1, max_length=120)
    email: str | None = None
    team_ids: list[int] | None = None


class LoginRequest(BaseModel):
    """Credentials payload for operator login."""
    email: str
    password: str


class TokenResponse(BaseModel):
    """JWT bearer authentication token response."""
    access_token: str
    token_type: str = "bearer"


class MembershipPublic(ORMModel):
    """Public representation of a team membership."""
    id: int
    user_id: int
    team_id: int
    role: MembershipRole
    user: UserPublic | None = None
    team: "TeamPublic | None" = None

class UserDetail(UserPublic):
    """Extended user representation including their team memberships."""
    memberships: list[MembershipPublic] = []


class TeamCreate(BaseModel):
    """Payload for creating a new operational team."""
    name: str = Field(min_length=1, max_length=120)

    description: str | None = None
    lead_id: int | None = None


class TeamPublic(ORMModel):
    """Public representation of an operational team."""
    id: int
    name: str
    description: str | None
    created_at: datetime


class TeamDetail(TeamPublic):
    """Detailed team representation including roster memberships."""
    memberships: list[MembershipPublic] = []


class MeResponse(UserDetail):
    """User profile response with computed team access lists."""
    team_ids: list[int] = []
    lead_team_ids: list[int] = []


class WorkItemCreate(BaseModel):
    """Creation payload for new work items."""
    title: str = Field(min_length=1, max_length=240)
    description: str | None = None
    type: WorkItemType
    priority: WorkItemPriority = WorkItemPriority.MEDIUM
    team_id: int
    assignee_id: int | None = None
    due_at: datetime | None = None


class WorkItemUpdate(BaseModel):
    """Mutation payload for work item fields. Requires client's observed `version` for OCC."""
    version: int = Field(ge=1, description="Current version observed by client for concurrency validation")
    title: str | None = Field(default=None, min_length=1, max_length=240)
    description: str | None = None
    type: WorkItemType | None = None
    priority: WorkItemPriority | None = None
    team_id: int | None = None
    due_at: datetime | None = None
    blocked_reason: str | None = None


class WorkItemTransition(BaseModel):
    """Workflow status change payload with OCC version gate."""
    version: int = Field(ge=1, description="Current version observed by client")
    status: WorkItemStatus
    blocked_reason: str | None = None


class WorkItemAssign(BaseModel):
    """Reassignment payload with OCC version gate."""
    version: int = Field(ge=1, description="Current version observed by client")
    assignee_id: int | None = None


class WorkItemPublic(ORMModel):
    """Public serialized view of a work item with joined relations."""
    id: int
    title: str
    description: str | None
    type: WorkItemType
    status: WorkItemStatus
    priority: WorkItemPriority
    team_id: int
    assignee_id: int | None
    created_by_id: int
    due_at: datetime | None
    version: int
    created_at: datetime
    updated_at: datetime
    resolved_at: datetime | None
    blocked_reason: str | None = None
    team_name: str | None = None
    assignee_name: str | None = None
    created_by_name: str | None = None


class PaginatedWorkItems(BaseModel):
    """Paginated work items response payload."""
    items: list[WorkItemPublic]
    total: int
    page: int
    page_size: int


class CommentCreate(BaseModel):
    """Payload for creating a new comment."""
    body: str = Field(min_length=1, max_length=4000)


class CommentPublic(ORMModel):
    """Public serialized comment representation."""
    id: int
    work_item_id: int
    author_id: int
    body: str
    created_at: datetime
    author_name: str | None = None


class ActivityPublic(ORMModel):
    """Public serialized immutable audit log entry."""
    id: int
    work_item_id: int
    actor_id: int
    action: str
    field_name: str | None
    old_value: str | None
    new_value: str | None
    metadata: dict | None = None
    created_at: datetime
    actor_name: str | None = None


class StatusDistributionItem(BaseModel):
    """Count of work items grouped by status."""
    status: str
    count: int


class PriorityDistributionItem(BaseModel):
    """Count of work items grouped by priority."""
    priority: str
    count: int


class TypeDistributionItem(BaseModel):
    """Count of work items grouped by work item type."""
    type: str
    count: int


class TeamDistributionItem(BaseModel):
    """Workload distribution metrics per team."""
    team_id: int
    team_name: str
    total: int
    active: int
    resolved: int


class DashboardSummary(BaseModel):
    """Aggregated operational dashboard metrics and distribution charts."""
    active: int
    high_or_critical: int
    assigned_to_me: int
    overdue: int
    blocked: int
    recently_updated: int
    unassigned: int
    total_items: int = 0
    status_distribution: list[StatusDistributionItem] = []
    priority_distribution: list[PriorityDistributionItem] = []
    type_distribution: list[TypeDistributionItem] = []
    team_distribution: list[TeamDistributionItem] = []
    recently_updated_items: list[WorkItemPublic] = []


class NotificationPublic(ORMModel):
    """Public serialized in-app notification representation."""
    id: int
    user_id: int
    title: str
    message: str
    type: str
    link: str | None = None
    work_item_id: int | None = None
    is_read: bool
    read_at: datetime | None = None
    created_at: datetime


class NotificationListResponse(BaseModel):
    """Paginated list of user notifications."""
    items: list[NotificationPublic]
    total: int
    unread_count: int
    page: int
    page_size: int


class UnreadCountResponse(BaseModel):
    """Total unread notification counter badge response."""
    unread_count: int

