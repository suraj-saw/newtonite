"""
Work Item Domain Service and Business Logic

Encapsulates core business rules for Newtonite operational work items:
  - Role and team-level access control enforcement (isolation across teams).
  - Version-gated Optimistic Concurrency Control (OCC) preventing lost updates.
  - Finite State Machine workflow transition validation and approval gates.
  - Synchronous, co-transactional immutable audit logging (`activity_logs`).
  - Automated in-app notification triggers for assignments, comments, and status transitions.
"""

from datetime import datetime, timezone

# pyrefly: ignore [missing-import]
from sqlalchemy import update
# pyrefly: ignore [missing-import]
from sqlalchemy.orm import Session

from app.core.errors import conflict, forbidden, not_found
from app.models import (
    ALLOWED_TRANSITIONS,
    ActivityAction,
    ActivityLog,
    Comment,
    WorkItem,
    WorkItemStatus,
)
from app.repositories import (
    ActivityRepository,
    CommentRepository,
    TeamRepository,
    UserRepository,
    WorkItemRepository,
)
from app.schemas import WorkItemAssign, WorkItemCreate, WorkItemUpdate
from app.services.authz import AuthContext
from app.services.notifications import NotificationService


def _now() -> datetime:
    """Return current UTC timestamp with timezone information."""
    return datetime.now(timezone.utc)


def to_public(item: WorkItem) -> dict:
    """Serialize a WorkItem ORM entity and its joined relations into a public dictionary.

    Args:
        item: SQLAlchemy WorkItem model instance with eagerly loaded relations.

    Returns:
        dict: Public dictionary representation compatible with WorkItemPublic schema.
    """
    return {
        "id": item.id,
        "title": item.title,
        "description": item.description,
        "type": item.type,
        "status": item.status,
        "priority": item.priority,
        "team_id": item.team_id,
        "assignee_id": item.assignee_id,
        "created_by_id": item.created_by_id,
        "due_at": item.due_at,
        "version": item.version,
        "created_at": item.created_at,
        "updated_at": item.updated_at,
        "resolved_at": item.resolved_at,
        "team_name": item.team.name if item.team else None,
        "assignee_name": item.assignee.name if item.assignee else None,
        "created_by_name": item.created_by.name if item.created_by else None,
        "blocked_reason": item.blocked_reason,
    }


class WorkItemService:
    """Domain service managing work item lifecycle, concurrency, permissions, and audit logs."""

    def __init__(self, db: Session) -> None:
        self.db = db
        self.items = WorkItemRepository(db)
        self.teams = TeamRepository(db)

        self.users = UserRepository(db)
        self.comments = CommentRepository(db)
        self.activities = ActivityRepository(db)
        self.notifications = NotificationService(db)

    def _require_item(self, work_item_id: int) -> WorkItem:
        """Fetch work item by primary key or raise HTTP 404 Not Found."""
        item = self.items.get(work_item_id)
        if not item:
            raise not_found("Work item not found")
        return item

    def _require_view(self, actor: AuthContext, item: WorkItem) -> None:
        """Enforce resource-level team authorization isolation.

        Raises:
            AppError(403): If the user does not have permission to view the item's team.
        """
        if not actor.can_view_team(item.team_id):
            raise forbidden("You cannot access this work item")

    def _can_edit_content(self, actor: AuthContext, item: WorkItem) -> bool:
        """Verify whether actor is permitted to edit content fields (Team Lead or Assignee)."""
        return actor.is_lead_of(item.team_id) or item.assignee_id == actor.user.id

    def _audit(
        self,
        item: WorkItem,
        actor: AuthContext,
        action: str,
        field_name: str | None = None,
        old_value: str | None = None,
        new_value: str | None = None,
        metadata: dict | None = None,
    ) -> None:
        """Record an immutable audit log entry in the active database transaction."""
        self.activities.add(
            ActivityLog(
                work_item_id=item.id,
                actor_id=actor.user.id,
                action=action,
                field_name=field_name,
                old_value=old_value,
                new_value=new_value,
                extra_metadata=metadata,
            )
        )

    def create(self, actor: AuthContext, data: WorkItemCreate, commit: bool = True) -> WorkItem:
        """Create a new work item with validation, audit logging, and notifications.

        Args:
            actor: Current authorization context.
            data: Validated work item creation payload.
            commit: Whether to commit the transaction immediately (set False during idempotent wrapper).

        Returns:
            WorkItem: Fully persisted work item with relationships loaded.
        """
        team = self.teams.get(data.team_id)
        if not team:
            raise not_found("Team not found")
        if not actor.can_view_team(data.team_id):
            raise forbidden("You cannot create work items for this team")
        if data.assignee_id:
            assignee = self.users.get_by_id(data.assignee_id)
            if not assignee:
                raise not_found("Assignee not found")
        # Initialize item with version = 1 and status = OPEN
        item = WorkItem(
            title=data.title,
            description=data.description,
            type=data.type.value,
            status=WorkItemStatus.OPEN.value,
            priority=data.priority.value,
            team_id=data.team_id,
            assignee_id=data.assignee_id,
            created_by_id=actor.user.id,
            due_at=data.due_at,
            version=1,
        )
        self.items.add(item)
        self.db.flush()

        # Co-transactional creation audit entry
        self._audit(item, actor, ActivityAction.CREATED.value, metadata={"title": item.title})

        # Trigger notification if assigned to someone else on creation
        if item.assignee_id and item.assignee_id != actor.user.id:
            self.notifications.notify_work_item_assignment(
                item=item,
                actor_name=actor.user.name,
                actor_id=actor.user.id,
                new_assignee_id=item.assignee_id,
                old_assignee_id=None,
            )
        loaded = self._require_item(item.id)
        if commit:
            self.db.commit()
            return self._require_item(loaded.id)
        return loaded

    def get(self, actor: AuthContext, work_item_id: int) -> WorkItem:
        """Retrieve a single work item verifying team visibility permissions."""
        item = self._require_item(work_item_id)
        self._require_view(actor, item)
        return item

    def list_filtered(self, actor: AuthContext, **filters) -> tuple[list[WorkItem], int]:
        """Query work items filtered by search, status, priority, and scoped to user's visible teams."""
        visible = actor.visible_team_ids()
        return self.items.list_filtered(visible_team_ids=visible, **filters)

    def update(self, actor: AuthContext, work_item_id: int, data: WorkItemUpdate) -> WorkItem:
        """Update work item fields using Optimistic Concurrency Control (OCC).

        Validation & Rules:
          - Enforces team visibility (403 if unauthorized).
          - Field permissions: Only Team Leads / Admins can change priority or move teams.
          - Content editing: Assignee or Team Lead can edit title, description, due date.
          - Optimistic Concurrency: `UPDATE ... WHERE id = :id AND version = :version`
            If another transaction modified the item concurrently, rowcount == 0, raising
            HTTP 409 Conflict (`STALE_VERSION`).
          - Audit Trail: Writes individual field diffs to `activity_logs` in the same transaction.

        Returns:
            WorkItem: The freshly updated work item instance.
        """
        item = self._require_item(work_item_id)
        self._require_view(actor, item)
        team_name = item.team.name if item.team else "this team's"
        if not self._can_edit_content(actor, item):
            raise forbidden(f"You can only edit work items assigned to you or teams you lead ({team_name})")

        payload = data.model_dump(exclude_unset=True)
        payload.pop("version", None)

        # Privilege checks for privileged field alterations
        if "priority" in payload:
            new_priority = payload["priority"].value if hasattr(payload["priority"], "value") else payload["priority"]
            if new_priority != item.priority and not actor.is_lead_of(item.team_id):
                raise forbidden(f"Only {team_name} Team Leads can change priorities or reassign team members")
        if "team_id" in payload:
            new_team_id = payload["team_id"]
            if new_team_id != item.team_id:
                if not actor.is_lead_of(item.team_id):
                    raise forbidden(f"Only {team_name} Team Leads can move items to another team")
                new_team = self.teams.get(new_team_id)
                if not new_team:
                    raise not_found("Team not found")
                if not actor.is_admin and new_team_id not in actor.lead_team_ids:
                    raise forbidden(f"You can only move items to teams you lead ({new_team.name})")

        # Prepare update values and collect audit information
        update_values = {"version": item.version + 1, "updated_at": _now()}
        field_actions = {
            "title": ActivityAction.UPDATED,
            "description": ActivityAction.UPDATED,
            "type": ActivityAction.UPDATED,
            "priority": ActivityAction.PRIORITY_CHANGED,
            "team_id": ActivityAction.TEAM_CHANGED,
            "due_at": ActivityAction.DUE_DATE_CHANGED,
        }
        for field, value in payload.items():
            old = getattr(item, field)
            # Convert to string for comparison and database storage
            new_str = str(value)
            if str(old) == new_str:
                continue
            update_values[field] = new_str
            self._audit(
                item,
                actor,
                field_actions.get(field, ActivityAction.UPDATED).value,
                field_name=field,
                old_value=None if old is None else str(old),
                new_value=new_str,
            )

        # Atomic UPDATE with version check (OCC guard)
        stmt = (
            update(WorkItem)
            .where(WorkItem.id == item.id, WorkItem.version == data.version)
            .values(**update_values)
        )
        result = self.db.execute(stmt)
        if result.rowcount == 0:
            # No rows updated means version didn't match (concurrent modification)
            raise conflict(
                "This work item was modified by another user. Your changes were not applied. Refresh to see the latest version.",
                code="STALE_VERSION",
                details={"current_version": item.version, "supplied_version": data.version},
            )

        self.db.commit()
        return self._require_item(item.id)


    def transition(
        self,
        actor: AuthContext,
        work_item_id: int,
        version: int,
        status: WorkItemStatus,
        blocked_reason: str | None = None,
    ) -> WorkItem:
        """Execute a validated workflow transition on a work item.

        Workflow State Machine & Rules:
          - Validates transition against `ALLOWED_TRANSITIONS` state table.
          - Exiting `PENDING_APPROVAL`: Only Team Leads or Admins can approve or reject.
          - Requesting `PENDING_APPROVAL`: Assignee, team members, or team leads can submit.
          - General transitions: Restricted to assignee or team leads.
          - Blocking: Requires a non-empty `blocked_reason`.
          - Resolving: Sets `resolved_at` timestamp.
          - Optimistic Concurrency Control: Verifies `version == supplied_version`. Raises
            409 Conflict (`STALE_VERSION`) if concurrent modification detected.
          - Triggers co-transactional audit log and dispatches in-app notifications.

        Returns:
            WorkItem: The freshly transitioned work item instance.
        """
        item = self._require_item(work_item_id)
        self._require_view(actor, item)
        current = WorkItemStatus(item.status)
        team_name = item.team.name if item.team else "this team's"

        # Permission checks based on target state and current state
        if current == WorkItemStatus.PENDING_APPROVAL:
            # Transitioning out of PENDING_APPROVAL (Approve or Reject) is strictly restricted to Team Leads
            if not actor.is_lead_of(item.team_id):
                raise forbidden(f"Only {team_name} Team Leads or admins can approve or reject items pending approval")
        elif status == WorkItemStatus.PENDING_APPROVAL:
            # Requesting approval can be done by assignee, team lead, or members of the team
            if not (actor.is_lead_of(item.team_id) or actor.is_member_of(item.team_id) or item.assignee_id == actor.user.id):
                raise forbidden(f"Only {team_name} team members or leads can request approval for this item")
        else:
            if not (actor.is_lead_of(item.team_id) or item.assignee_id == actor.user.id):
                raise forbidden(f"Only the assignee or {team_name} Team Leads can change the status of this item")

        # Validate that transition is permitted by finite state machine
        if status not in ALLOWED_TRANSITIONS[current]:
            raise conflict(
                f"Cannot transition from {current.value} to {status.value}",
                code="INVALID_TRANSITION",
                details={"from": current.value, "to": status.value},
            )

        # Prepare update values
        update_values = {"version": item.version + 1, "updated_at": _now(), "status": status.value}
        old = item.status
        if status == WorkItemStatus.RESOLVED:
            update_values["resolved_at"] = _now()
            action = ActivityAction.APPROVED.value if current == WorkItemStatus.PENDING_APPROVAL else ActivityAction.RESOLVED.value
        elif status == WorkItemStatus.CLOSED:
            action = ActivityAction.CLOSED.value
        elif status == WorkItemStatus.BLOCKED:
            update_values["blocked_reason"] = blocked_reason
            action = ActivityAction.STATUS_CHANGED.value
        elif status == WorkItemStatus.PENDING_APPROVAL:
            action = ActivityAction.APPROVAL_REQUESTED.value
        else:
            if current == WorkItemStatus.RESOLVED:
                update_values["resolved_at"] = None
            if current == WorkItemStatus.BLOCKED:
                update_values["blocked_reason"] = None
            action = ActivityAction.APPROVED.value if current == WorkItemStatus.PENDING_APPROVAL else ActivityAction.STATUS_CHANGED.value

        # Write audit logs
        self._audit(item, actor, action, field_name="status", old_value=old, new_value=status.value)
        if status == WorkItemStatus.BLOCKED and blocked_reason:
            self._audit(
                item,
                actor,
                ActivityAction.STATUS_CHANGED.value,
                field_name="blocked_reason",
                old_value=item.blocked_reason,
                new_value=blocked_reason,
            )

        # Atomic UPDATE with version check (OCC guard)
        stmt = (
            update(WorkItem)
            .where(WorkItem.id == item.id, WorkItem.version == version)
            .values(**update_values)
        )
        result = self.db.execute(stmt)
        if result.rowcount == 0:
            raise conflict(
                "This work item was modified by another user. Your changes were not applied. Refresh to see the latest version.",
                code="STALE_VERSION",
                details={"current_version": item.version, "supplied_version": version},
            )

        # Dispatch transition notification to stakeholders
        self.notifications.notify_work_item_transition(
            item=item,
            actor_name=actor.user.name,
            actor_id=actor.user.id,
            from_status=old,
            to_status=status.value,
        )

        self.db.commit()
        return self._require_item(item.id)

    def assign(self, actor: AuthContext, work_item_id: int, data: WorkItemAssign) -> WorkItem:
        """Reassign work item or claim/release assignment.

        Permissions:
          - Team Leads and Admins can assign work to any valid user.
          - Team members can self-claim an unassigned work item.
          - Current assignee can release the item back to unassigned.
          - Reassigning other users requires Team Lead privileges.

        Concurrency & Notifications:
          - Gated by optimistic concurrency version.
          - Dispatches notification to newly assigned user (and former assignee).
        """
        item = self._require_item(work_item_id)
        self._require_view(actor, item)
        team_name = item.team.name if item.team else "this team's"
        is_self_claim = data.assignee_id == actor.user.id and actor.can_view_team(item.team_id)
        is_self_release = data.assignee_id is None and item.assignee_id == actor.user.id
        if not (actor.is_lead_of(item.team_id) or is_self_claim or is_self_release):
            raise forbidden(f"Only {team_name} Team Leads can change priorities or reassign team members")
        if data.assignee_id is not None:
            assignee = self.users.get_by_id(data.assignee_id)
            if not assignee:
                raise not_found("Assignee not found")

        old = None if item.assignee_id is None else str(item.assignee_id)
        self._audit(
            item,
            actor,
            ActivityAction.ASSIGNEE_CHANGED.value,
            field_name="assignee_id",
            old_value=old,
            new_value=None if data.assignee_id is None else str(data.assignee_id),
        )

        # Atomic UPDATE with version check (OCC guard)
        stmt = (
            update(WorkItem)
            .where(WorkItem.id == item.id, WorkItem.version == data.version)
            .values(assignee_id=data.assignee_id, version=item.version + 1, updated_at=_now())
        )
        result = self.db.execute(stmt)
        if result.rowcount == 0:
            raise conflict(
                "This work item was modified by another user. Your changes were not applied. Refresh to see the latest version.",
                code="STALE_VERSION",
                details={"current_version": item.version, "supplied_version": data.version},
            )

        # Send notification to new assignee
        self.notifications.notify_work_item_assignment(
            item=item,
            actor_name=actor.user.name,
            actor_id=actor.user.id,
            new_assignee_id=data.assignee_id,
            old_assignee_id=item.assignee_id,
        )

        self.db.commit()
        return self._require_item(item.id)

    def delete(self, actor: AuthContext, work_item_id: int) -> None:
        """Permanently hard-delete a work item (Admin privilege only).

        Associated activity logs and comments cascade with the deletion.
        """
        if not actor.is_admin:
            raise forbidden("Only admins can delete work items")
        item = self._require_item(work_item_id)
        self.items.delete(item)
        self.db.commit()

    def add_comment(self, actor: AuthContext, work_item_id: int, body: str) -> Comment:
        """Add a discussion comment to a work item, recording audit trail and sending notifications."""
        item = self._require_item(work_item_id)
        self._require_view(actor, item)
        comment = Comment(work_item_id=item.id, author_id=actor.user.id, body=body)
        self.comments.add(comment)
        self._audit(
            item,
            actor,
            ActivityAction.COMMENT_ADDED.value,
            field_name="comment",
            new_value=body[:200],
        )
        self.notifications.notify_comment(
            item=item,
            actor_name=actor.user.name,
            actor_id=actor.user.id,
            comment_text=body,
        )
        self.db.commit()
        self.db.refresh(comment)
        return comment

    def list_comments(self, actor: AuthContext, work_item_id: int) -> list[Comment]:
        """Fetch all discussion comments for a work item in chronological order."""
        item = self._require_item(work_item_id)
        self._require_view(actor, item)
        return self.comments.list_for_item(item.id)

    def list_activity(self, actor: AuthContext, work_item_id: int) -> list[ActivityLog]:
        """Fetch the immutable historical audit trail of actions taken on a work item."""
        item = self._require_item(work_item_id)
        self._require_view(actor, item)
        return self.activities.list_for_item(item.id)

