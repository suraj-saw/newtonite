"""
User Administration and Team Management API Endpoints

Provides administrative controls for:
  - Approving or rejecting newly registered employee accounts.
  - Creating and deleting employee user accounts.
  - Creating organizational teams and assigning team leads.
  - Querying team member rosters with role visibility.
"""

# pyrefly: ignore [missing-import]
from fastapi import APIRouter, Depends, status
# pyrefly: ignore [missing-import]
from sqlalchemy.orm import Session

from app.api.deps import get_auth_context
from app.core.database import get_db
from app.core.errors import conflict, forbidden, not_found
from app.core.security import hash_password
from app.models import MembershipRole, Team, TeamMembership, User, UserStatus
from app.repositories import TeamRepository, UserRepository
from app.schemas import TeamCreate, TeamDetail, TeamPublic, UserCreate, UserDetail, UserPublic
from app.services.authz import AuthContext
from app.services.notifications import NotificationService

users_router = APIRouter()
teams_router = APIRouter()


@users_router.get("", response_model=list[UserDetail])
def list_users(ctx: AuthContext = Depends(get_auth_context), db: Session = Depends(get_db)) -> list[User]:
    """List all registered employee accounts with their team memberships (System Admin only)."""
    if not ctx.is_admin:
        raise forbidden("Only admins can list all users")
    return UserRepository(db).list_all()


@users_router.post("", response_model=UserPublic, status_code=status.HTTP_201_CREATED)
def create_user(
    body: UserCreate,
    ctx: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_db),
) -> User:
    """Directly create and auto-approve a new employee user account (System Admin only)."""
    if not ctx.is_admin:
        raise forbidden("Only admins can create users")
    users = UserRepository(db)
    if users.get_by_email(body.email):
        raise conflict("A user with this email already exists", code="EMAIL_TAKEN")
    user = User(
        name=body.name,
        email=str(body.email).lower(),
        password_hash=hash_password(body.password),
        is_admin=body.is_admin,
        is_active=True,
        status=UserStatus.APPROVED.value,
    )
    users.add(user)
    db.commit()
    db.refresh(user)
    return user


@users_router.get("/pending", response_model=list[UserPublic])
def list_pending_users(
    ctx: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_db),
) -> list[User]:
    """Retrieve list of employee accounts awaiting administrative approval (System Admin only)."""
    if not ctx.is_admin:
        raise forbidden("Only admins can view pending users")
    return UserRepository(db).list_pending()


@users_router.post("/{user_id}/approve", response_model=UserPublic)
def approve_user(
    user_id: int,
    ctx: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_db),
) -> User:
    """Approve a pending employee account, granting login access and sending notification."""
    if not ctx.is_admin:
        raise forbidden("Only admins can approve users")
    users = UserRepository(db)
    user = users.get_by_id(user_id)
    if not user:
        raise not_found("User not found")
    user = users.update_status(user, UserStatus.APPROVED.value)
    NotificationService(db).notify_user_status_changed(user, UserStatus.APPROVED.value, ctx.user.name)
    db.commit()
    db.refresh(user)
    return user


@users_router.post("/{user_id}/reject", response_model=UserPublic)
def reject_user(
    user_id: int,
    ctx: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_db),
) -> User:
    """Reject a pending employee account, barring authentication access."""
    if not ctx.is_admin:
        raise forbidden("Only admins can reject users")
    users = UserRepository(db)
    user = users.get_by_id(user_id)
    if not user:
        raise not_found("User not found")
    user = users.update_status(user, UserStatus.REJECTED.value)
    NotificationService(db).notify_user_status_changed(user, UserStatus.REJECTED.value, ctx.user.name)
    db.commit()
    db.refresh(user)
    return user


@users_router.get("/{user_id}", response_model=UserDetail)
def get_user(
    user_id: int,
    ctx: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_db),
) -> User:
    """View detailed user record and team assignments (System Admin only)."""
    if not ctx.is_admin:
        raise forbidden("Only admins can view user details")
    user = UserRepository(db).get_with_teams(user_id)
    if not user:
        raise not_found("User not found")
    return user


@users_router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user(
    user_id: int,
    ctx: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_db),
):
    """Delete an employee account and cascade memberships (System Admin only)."""
    if not ctx.is_admin:
        raise forbidden("Only admins can delete users")
    users = UserRepository(db)
    user = users.get_by_id(user_id)
    if not user:
        raise not_found("User not found")
    users.delete(user)
    db.commit()


@teams_router.get("", response_model=list[TeamPublic])
def list_teams(_ctx: AuthContext = Depends(get_auth_context), db: Session = Depends(get_db)) -> list[Team]:
    """Retrieve all operational teams in the organization."""
    return TeamRepository(db).list_all()


@teams_router.post("", response_model=TeamPublic, status_code=status.HTTP_201_CREATED)
def create_team(
    body: TeamCreate,
    ctx: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_db),
) -> Team:
    """Create a new organizational team and optionally designate its initial Team Lead (System Admin only)."""
    if not ctx.is_admin:
        raise forbidden("Only admins can create teams")
    teams = TeamRepository(db)
    team = Team(name=body.name, description=body.description)
    teams.add(team)
    if body.lead_id:
        teams.add_membership(
            TeamMembership(user_id=body.lead_id, team_id=team.id, role=MembershipRole.TEAM_LEAD.value)
        )
    db.commit()
    db.refresh(team)
    return team


@teams_router.get("/{team_id}", response_model=TeamDetail)
def get_team(
    team_id: int,
    ctx: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_db),
) -> Team:
    """Retrieve team details and roster of members, verifying team access permissions."""
    team = TeamRepository(db).get_with_members(team_id)
    if not team:
        raise not_found("Team not found")
    if not ctx.can_view_team(team.id):
        raise forbidden("You cannot view this team")
    return team

