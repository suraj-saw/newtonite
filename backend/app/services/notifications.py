"""
In-App Notification Dispatch Service

Manages the creation and distribution of targeted notification records for events
including:
  - Work item assignment and unassignment.
  - State transitions, review requests (to Team Leads), and approval decisions.
  - Discussion comments on assigned/created work items.
  - Employee account approval/rejection and new registration alerts for admins.
"""

# pyrefly: ignore [missing-import]
from sqlalchemy.orm import Session
# pyrefly: ignore [missing-import]
from sqlalchemy import select

from app.models import (
    MembershipRole,
    Notification,
    NotificationType,
    TeamMembership,
    User,
    WorkItem,
    WorkItemStatus,
)
from app.repositories import NotificationRepository


class NotificationService:
    """Service handling creation and dispatch of in-app operational notifications."""

    def __init__(self, db: Session) -> None:
        self.db = db
        self.repo = NotificationRepository(db)

    def create_notification(
        self,
        user_id: int,
        title: str,
        message: str,
        type: str = NotificationType.SYSTEM.value,
        link: str | None = None,
        work_item_id: int | None = None,
    ) -> Notification:
        """Persist a single in-app notification record for a recipient user."""
        notif = Notification(
            user_id=user_id,
            title=title,
            message=message,
            type=type,
            link=link,
            work_item_id=work_item_id,
        )
        self.repo.add(notif)
        return notif

    def notify_work_item_assignment(
        self,
        item: WorkItem,
        actor_name: str,
        actor_id: int,
        new_assignee_id: int | None,
        old_assignee_id: int | None = None,
    ) -> None:
        """Notify users when work item assignment changes.

        Sends an assignment notification to the new assignee (if not the actor),
        and an unassignment notification to the previous assignee.
        """
        if new_assignee_id and new_assignee_id != actor_id:
            self.create_notification(
                user_id=new_assignee_id,
                title="Assigned to Work Item",
                message=f'{actor_name} assigned you to work item #{item.id}: "{item.title}".',
                type=NotificationType.ASSIGNMENT.value,
                link=f"/work-items/{item.id}",
                work_item_id=item.id,
            )
        if old_assignee_id and old_assignee_id != new_assignee_id and old_assignee_id != actor_id:
            self.create_notification(

                user_id=old_assignee_id,
                title="Unassigned from Work Item",
                message=f'You were unassigned from work item #{item.id}: "{item.title}".',
                type=NotificationType.ASSIGNMENT.value,
                link=f"/work-items/{item.id}",
                work_item_id=item.id,
            )

    def notify_work_item_transition(
        self,
        item: WorkItem,
        actor_name: str,
        actor_id: int,
        from_status: str,
        to_status: str,
    ) -> None:
        """Notify relevant users of status changes and approval requests."""
        if to_status == WorkItemStatus.PENDING_APPROVAL.value:
            # Notify Team Leads of the team
            lead_memberships = list(
                self.db.scalars(
                    select(TeamMembership).where(
                        TeamMembership.team_id == item.team_id,
                        TeamMembership.role == MembershipRole.TEAM_LEAD.value,
                    )
                ).all()
            )
            for m in lead_memberships:
                if m.user_id != actor_id:
                    self.create_notification(
                        user_id=m.user_id,
                        title="Approval Requested",
                        message=f'{actor_name} requested approval for #{item.id}: "{item.title}".',
                        type=NotificationType.APPROVAL_REQUESTED.value,
                        link=f"/work-items/{item.id}",
                        work_item_id=item.id,
                    )
            return

        # If coming from PENDING_APPROVAL, this is an approval or rejection
        is_approval_decision = from_status == WorkItemStatus.PENDING_APPROVAL.value
        if is_approval_decision:
            if to_status == WorkItemStatus.RESOLVED.value:
                title = "Work Item Approved"
                msg = f'Work item #{item.id}: "{item.title}" was approved by {actor_name}.'
            else:
                title = "Work Item Returned"
                msg = f'Work item #{item.id}: "{item.title}" was moved back to {to_status} by {actor_name}.'
            notif_type = NotificationType.APPROVAL_DECISION.value
        else:
            title = "Work Item Status Updated"
            msg = f'Work item #{item.id}: "{item.title}" status changed from {from_status} to {to_status} by {actor_name}.'
            notif_type = NotificationType.STATUS_CHANGE.value

        # Target users: assignee and creator (if not the actor)
        recipients = set()
        if item.assignee_id and item.assignee_id != actor_id:
            recipients.add(item.assignee_id)
        if item.created_by_id and item.created_by_id != actor_id:
            recipients.add(item.created_by_id)

        for uid in recipients:
            self.create_notification(
                user_id=uid,
                title=title,
                message=msg,
                type=notif_type,
                link=f"/work-items/{item.id}",
                work_item_id=item.id,
            )

    def notify_comment(
        self,
        item: WorkItem,
        actor_name: str,
        actor_id: int,
        comment_text: str,
    ) -> None:
        """Notify assignee and creator about a new comment."""
        snippet = (comment_text[:80] + "...") if len(comment_text) > 80 else comment_text
        recipients = set()
        if item.assignee_id and item.assignee_id != actor_id:
            recipients.add(item.assignee_id)
        if item.created_by_id and item.created_by_id != actor_id:
            recipients.add(item.created_by_id)

        for uid in recipients:
            self.create_notification(
                user_id=uid,
                title=f"New Comment on #{item.id}",
                message=f'{actor_name}: "{snippet}"',
                type=NotificationType.COMMENT.value,
                link=f"/work-items/{item.id}",
                work_item_id=item.id,
            )

    def notify_user_status_changed(self, user: User, new_status: str, admin_name: str) -> None:
        """Notify user when an admin approves or rejects their registration."""
        if new_status == "APPROVED":
            title = "Account Approved"
            msg = f"Your Newtonite account has been approved by {admin_name}. You now have full access."
        else:
            title = "Account Status Updated"
            msg = f"Your Newtonite account status was updated to {new_status} by {admin_name}."

        self.create_notification(
            user_id=user.id,
            title=title,
            message=msg,
            type=NotificationType.USER_APPROVAL.value,
            link="/profile",
        )

    def notify_admins_new_user_registration(self, new_user: User) -> None:
        """Notify all admins when a new user registers with PENDING status."""
        admins = list(self.db.scalars(select(User).where(User.is_admin == True, User.is_active == True)).all())  # noqa: E712
        for admin in admins:
            self.create_notification(
                user_id=admin.id,
                title="New User Registration",
                message=f'New user {new_user.name} ({new_user.email}) registered and is awaiting approval.',
                type=NotificationType.SYSTEM.value,
                link="/admin/users",
            )
