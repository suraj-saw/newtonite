"""
Operational Dashboard and Analytics Service

Computes high-performance server-side analytical aggregations directly in PostgreSQL.
All aggregations strictly enforce team authorization boundaries by applying the
actor's visible team scope to every underlying SQL query.
"""

from datetime import datetime, timedelta, timezone

# pyrefly: ignore [missing-import]
from sqlalchemy import Select, func, select
# pyrefly: ignore [missing-import]
from sqlalchemy.orm import Session, joinedload

from app.models import Team, WorkItem, WorkItemPriority, WorkItemStatus
from app.services.authz import AuthContext
from app.services.work_items import to_public


class DashboardService:
    """Service providing aggregated operational health metrics and workload distributions."""

    def __init__(self, db: Session) -> None:
        self.db = db

    def _scope(self, stmt: Select, actor: AuthContext) -> Select:
        """Scope an existing SQLAlchemy query to the teams visible to the acting user.

        If the user is an admin, `visible_team_ids()` returns None, leaving the query
        unconstrained across the organization. Otherwise, appends `WHERE team_id IN (...)`.
        """
        visible = actor.visible_team_ids()
        if visible is not None:
            return stmt.where(WorkItem.team_id.in_(visible or [-1]))
        return stmt

    def summary(self, actor: AuthContext) -> dict:
        """Compute comprehensive dashboard summary for the operator.

        Calculates in SQL:
          - Key operational counters (active, high/critical priority, assigned to actor,
            overdue, blocked, updated in last 24h, unassigned, total).
          - Status breakdown distribution.
          - Priority breakdown distribution.
          - Type breakdown distribution (engineering, incident, compliance, etc.).
          - Team workload distribution (total items, active count, resolved count per team).
          - 8 most recently updated work items with joined relations.

        Args:
            actor: Current authorization context.

        Returns:
            dict: Aggregated dashboard summary payload.
        """
        now = datetime.now(timezone.utc)
        recent_cutoff = now - timedelta(hours=24)
        active_statuses = [
            WorkItemStatus.OPEN.value,
            WorkItemStatus.IN_PROGRESS.value,
            WorkItemStatus.PENDING_APPROVAL.value,
            WorkItemStatus.BLOCKED.value,
        ]
        high_pri = [WorkItemPriority.HIGH.value, WorkItemPriority.CRITICAL.value]
        closedish = [WorkItemStatus.RESOLVED.value, WorkItemStatus.CLOSED.value]

        # 1. Consolidated KPI Metrics Query (calculated in a single database round-trip)
        counts_stmt = self._scope(
            select(
                func.count().filter(WorkItem.status.in_(active_statuses)).label("active"),
                func.count()
                .filter(WorkItem.priority.in_(high_pri), WorkItem.status.notin_(closedish))
                .label("high_or_critical"),
                func.count()
                .filter(WorkItem.assignee_id == actor.user.id, WorkItem.status.notin_(closedish))
                .label("assigned_to_me"),
                func.count()
                .filter(
                    WorkItem.due_at.is_not(None),
                    WorkItem.due_at < now,
                    WorkItem.status.notin_(closedish),
                )
                .label("overdue"),
                func.count().filter(WorkItem.status == WorkItemStatus.BLOCKED.value).label("blocked"),
                func.count().filter(WorkItem.updated_at >= recent_cutoff).label("recently_updated"),
                func.count()
                .filter(WorkItem.assignee_id.is_(None), WorkItem.status.notin_(closedish))
                .label("unassigned"),
                func.count().label("total_items"),
            ),
            actor,
        )
        counts = self.db.execute(counts_stmt).one()

        # 2. Status distribution
        status_stmt = self._scope(
            select(WorkItem.status, func.count(WorkItem.id).label("count"))
            .group_by(WorkItem.status),
            actor,
        )
        status_rows = self.db.execute(status_stmt).all()
        status_distribution = [{"status": r.status, "count": r.count} for r in status_rows]

        # 3. Priority distribution
        priority_stmt = self._scope(
            select(WorkItem.priority, func.count(WorkItem.id).label("count"))
            .group_by(WorkItem.priority),
            actor,
        )
        priority_rows = self.db.execute(priority_stmt).all()
        priority_distribution = [{"priority": r.priority, "count": r.count} for r in priority_rows]

        # 4. Type distribution
        type_stmt = self._scope(
            select(WorkItem.type, func.count(WorkItem.id).label("count"))
            .group_by(WorkItem.type),
            actor,
        )
        type_rows = self.db.execute(type_stmt).all()
        type_distribution = [{"type": r.type, "count": r.count} for r in type_rows]

        # 5. Team workload distribution
        team_stmt = self._scope(
            select(
                WorkItem.team_id,
                Team.name.label("team_name"),
                func.count(WorkItem.id).label("total"),
                func.count().filter(WorkItem.status.in_(active_statuses)).label("active"),
                func.count().filter(WorkItem.status.in_(closedish)).label("resolved"),
            )
            .join(Team, WorkItem.team_id == Team.id)
            .group_by(WorkItem.team_id, Team.name),
            actor,
        )
        team_rows = self.db.execute(team_stmt).all()
        team_distribution = [
            {
                "team_id": r.team_id,
                "team_name": r.team_name,
                "total": r.total,
                "active": r.active,
                "resolved": r.resolved,
            }
            for r in team_rows
        ]

        # 6. Eight most recently updated work items
        recent_q = self._scope(
            select(WorkItem)
            .options(
                joinedload(WorkItem.team),
                joinedload(WorkItem.assignee),
                joinedload(WorkItem.created_by),
            )
            .order_by(WorkItem.updated_at.desc())
            .limit(8),
            actor,
        )
        recent = list(self.db.scalars(recent_q).unique().all())

        return {
            "active": counts.active,
            "high_or_critical": counts.high_or_critical,
            "assigned_to_me": counts.assigned_to_me,
            "overdue": counts.overdue,
            "blocked": counts.blocked,
            "recently_updated": counts.recently_updated,
            "unassigned": counts.unassigned,
            "total_items": counts.total_items,
            "status_distribution": status_distribution,
            "priority_distribution": priority_distribution,
            "type_distribution": type_distribution,
            "team_distribution": team_distribution,
            "recently_updated_items": [to_public(i) for i in recent],
        }

