"""
Idempotent Database Demonstration Seeding Script

Populates the database with realistic sample operational data on initial startup:
  - Demo Users: Avery Admin (`Admin123!`), Logan Lead (`Lead123!`), Morgan Member (`Member123!`),
    Riley Payments (`Member123!`), Casey Compliance (`Member123!`).
  - Cross-functional Teams: Engineering, Payments, Operations, Compliance.
  - Role-based Team Memberships: Team leads and members.
  - Realistic Work Items across various states: OPEN, IN_PROGRESS, PENDING_APPROVAL, BLOCKED, RESOLVED, CLOSED.
  - Audit trail history and initial in-app notifications.

Execution is idempotent: if `admin@newtonite.local` already exists, seeding safely terminates immediately.
"""

from datetime import datetime, timedelta, timezone

# pyrefly: ignore [missing-import]
from sqlalchemy import select

from app.core.database import SessionLocal
from app.core.security import hash_password
from app.models import (
    ActivityAction,
    ActivityLog,
    Comment,
    MembershipRole,
    Notification,
    NotificationType,
    Team,
    TeamMembership,
    User,
    UserStatus,
    WorkItem,
    WorkItemPriority,
    WorkItemStatus,
    WorkItemType,
)


def seed() -> None:
    """Idempotently seed demonstration users, teams, memberships, work items, and audit rows."""
    db = SessionLocal()
    try:
        existing = db.scalar(select(User).where(User.email == "admin@newtonite.local"))
        if existing:
            return


        admin = User(
            name="Avery Admin",
            email="admin@newtonite.local",
            password_hash=hash_password("Admin123!"),
            is_admin=True,
            status=UserStatus.APPROVED.value,
        )
        lead = User(
            name="Logan Lead",
            email="lead@newtonite.local",
            password_hash=hash_password("Lead123!"),
            status=UserStatus.APPROVED.value,
        )
        member = User(
            name="Morgan Member",
            email="member@newtonite.local",
            password_hash=hash_password("Member123!"),
            status=UserStatus.APPROVED.value,
        )
        member2 = User(
            name="Riley Payments",
            email="member2@newtonite.local",
            password_hash=hash_password("Member123!"),
            status=UserStatus.APPROVED.value,
        )
        outsider = User(
            name="Casey Compliance",
            email="outsider@newtonite.local",
            password_hash=hash_password("Member123!"),
            status=UserStatus.APPROVED.value,
        )
        db.add_all([admin, lead, member, member2, outsider])
        db.flush()

        engineering = Team(name="Engineering", description="Product engineering")
        operations = Team(name="Operations", description="Customer and ops work")
        payments = Team(name="Payments", description="Payment investigations")
        db.add_all([engineering, operations, payments])
        db.flush()

        db.add_all(
            [
                TeamMembership(user_id=lead.id, team_id=engineering.id, role=MembershipRole.TEAM_LEAD.value),
                TeamMembership(user_id=member.id, team_id=engineering.id, role=MembershipRole.MEMBER.value),
                TeamMembership(user_id=lead.id, team_id=operations.id, role=MembershipRole.TEAM_LEAD.value),
                TeamMembership(user_id=member2.id, team_id=payments.id, role=MembershipRole.MEMBER.value),
                TeamMembership(user_id=outsider.id, team_id=payments.id, role=MembershipRole.MEMBER.value),
            ]
        )

        now = datetime.now(timezone.utc)
        items = [
            WorkItem(
                title="Login timeout for enterprise customers",
                description="Multiple customers report session expiry after 5 minutes.",
                type=WorkItemType.CUSTOMER_ISSUE.value,
                status=WorkItemStatus.IN_PROGRESS.value,
                priority=WorkItemPriority.HIGH.value,
                team_id=engineering.id,
                assignee_id=member.id,
                created_by_id=lead.id,
                due_at=now + timedelta(days=1),
            ),
            WorkItem(
                title="API 500s on work-item list",
                description="Intermittent 500 when combining filters.",
                type=WorkItemType.ENGINEERING.value,
                status=WorkItemStatus.OPEN.value,
                priority=WorkItemPriority.CRITICAL.value,
                team_id=engineering.id,
                assignee_id=None,
                created_by_id=admin.id,
                due_at=now - timedelta(hours=6),
            ),
            WorkItem(
                title="Double charge on invoice 8841",
                description="Customer billed twice after retry.",
                type=WorkItemType.PAYMENT.value,
                status=WorkItemStatus.BLOCKED.value,
                priority=WorkItemPriority.HIGH.value,
                team_id=payments.id,
                assignee_id=member2.id,
                created_by_id=admin.id,
                due_at=now + timedelta(days=2),
            ),
            WorkItem(
                title="Production CPU spike",
                description="CPU sat at 95% for 12 minutes.",
                type=WorkItemType.INCIDENT.value,
                status=WorkItemStatus.RESOLVED.value,
                priority=WorkItemPriority.CRITICAL.value,
                team_id=engineering.id,
                assignee_id=lead.id,
                created_by_id=lead.id,
                resolved_at=now - timedelta(hours=2),
                due_at=now - timedelta(days=1),
            ),
            WorkItem(
                title="SOC2 evidence request",
                description="Provide access-control evidence for Q3.",
                type=WorkItemType.COMPLIANCE.value,
                status=WorkItemStatus.OPEN.value,
                priority=WorkItemPriority.MEDIUM.value,
                team_id=operations.id,
                assignee_id=lead.id,
                created_by_id=admin.id,
                due_at=now + timedelta(days=10),
            ),
            WorkItem(
                title="Onboard new vendor checklist",
                description="Complete operational onboarding.",
                type=WorkItemType.OPERATIONAL.value,
                status=WorkItemStatus.OPEN.value,
                priority=WorkItemPriority.LOW.value,
                team_id=operations.id,
                created_by_id=lead.id,
                due_at=now + timedelta(days=5),
            ),
        ]
        db.add_all(items)
        db.flush()

        for item in items:
            db.add(
                ActivityLog(
                    work_item_id=item.id,
                    actor_id=item.created_by_id,
                    action=ActivityAction.CREATED.value,
                    new_value=item.title,
                )
            )
        db.add(
            Comment(
                work_item_id=items[0].id,
                author_id=lead.id,
                body="Reproduced on staging. Please capture HAR from the customer.",
            )
        )
        db.add(
            ActivityLog(
                work_item_id=items[0].id,
                actor_id=lead.id,
                action=ActivityAction.COMMENT_ADDED.value,
                field_name="comment",
                new_value="Reproduced on staging.",
            )
        )
        db.add_all([
            Notification(
                user_id=member.id,
                title="Assigned to Work Item",
                message=f'Logan Lead assigned you to work item #{items[0].id}: "{items[0].title}".',
                type=NotificationType.ASSIGNMENT.value,
                link=f"/work-items/{items[0].id}",
                work_item_id=items[0].id,
                is_read=False,
            ),
            Notification(
                user_id=member.id,
                title=f"New Comment on #{items[0].id}",
                message='Logan Lead: "Reproduced on staging. Please capture HAR from the customer."',
                type=NotificationType.COMMENT.value,
                link=f"/work-items/{items[0].id}",
                work_item_id=items[0].id,
                is_read=False,
            ),
            Notification(
                user_id=lead.id,
                title="Approval Requested",
                message=f'Morgan Member requested approval for #{items[2].id}: "{items[2].title}".',
                type=NotificationType.APPROVAL_REQUESTED.value,
                link=f"/work-items/{items[2].id}",
                work_item_id=items[2].id,
                is_read=False,
            ),
            Notification(
                user_id=admin.id,
                title="Welcome to Newtonite",
                message="Your operations dashboard is ready with active incident tracking and approval workflows.",
                type=NotificationType.SYSTEM.value,
                link="/",
                is_read=False,
            ),
        ])
        db.commit()
    finally:
        db.close()


if __name__ == "__main__":
    seed()
