from app.core.database import Base, engine
from app.models import ActivityLog, Comment, IdempotencyKey, Team, TeamMembership, User, WorkItem  # noqa: F401


def init_models() -> None:
    Base.metadata.create_all(bind=engine)
