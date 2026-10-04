"""
Operational Dashboard Analytics API Endpoint

Exposes server-side consolidated metrics and workload distribution aggregations.
"""

# pyrefly: ignore [missing-import]
from fastapi import APIRouter, Depends
# pyrefly: ignore [missing-import]
from sqlalchemy.orm import Session

from app.api.deps import get_auth_context
from app.core.database import get_db
from app.schemas import DashboardSummary
from app.services.authz import AuthContext
from app.services.dashboard import DashboardService

router = APIRouter()


@router.get("/summary", response_model=DashboardSummary)
def dashboard_summary(
    ctx: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_db),
) -> dict:
    """Retrieve real-time operational health metrics, KPIs, and workload distributions.

    Scoper calculates counts and distributions strictly within the user's visible teams.
    """
    return DashboardService(db).summary(ctx)

