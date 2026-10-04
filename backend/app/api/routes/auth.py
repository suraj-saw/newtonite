"""
Authentication and Session Lifecycle API Endpoints

Handles user registration, authentication, token issuance, session version revocation,
and profile retrieval.
"""

# pyrefly: ignore [missing-import]
from fastapi import APIRouter, Depends, Response
# pyrefly: ignore [missing-import]
from sqlalchemy import select
# pyrefly: ignore [missing-import]
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.errors import conflict, not_found, unauthorized
from app.core.security import create_access_token, hash_password, verify_password
from app.models import MembershipRole, Team, TeamMembership, User, UserStatus
from app.repositories import TeamRepository, UserRepository
from app.schemas import LoginRequest, MeResponse, TeamPublic, TokenResponse, UserCreate, UserPublic, UserUpdate
from app.services.authz import AuthContext
from app.services.notifications import NotificationService
from app.api.deps import get_auth_context, get_current_user

router = APIRouter()


@router.get("/teams", response_model=list[TeamPublic])
def list_registration_teams(db: Session = Depends(get_db)) -> list[Team]:
    """Public endpoint providing team listings for the user registration dropdown."""
    return TeamRepository(db).list_all()


@router.post("/login")
def login(body: LoginRequest, response: Response, db: Session = Depends(get_db)) -> dict:
    """Authenticate an operator and issue a signed JWT access token.

    Authentication steps:
      1. Case-insensitive lookup of user by email.
      2. Verify password with Passlib bcrypt.
      3. Verify user is APPROVED by an administrator.
      4. Increment `session_version` to revoke any concurrent sessions from other devices.
      5. Issue JWT token containing `session_version` claim.
      6. Set HttpOnly `newtonite_token` cookie and return token JSON.
    """
    user = UserRepository(db).get_by_email(body.email)
    if not user:
        raise not_found("No account found with this email. Please sign up first.")
    if not user.is_active or not verify_password(body.password, user.password_hash):
        raise unauthorized("Invalid password.")
    if user.status != UserStatus.APPROVED.value:
        raise unauthorized("Your account is pending admin approval or has been rejected.")

    user.session_version += 1
    db.commit()

    access_token = create_access_token(str(user.id), user.session_version)
    response.set_cookie(
        key="newtonite_token",
        value=access_token,
        httponly=True,
        samesite="lax",
    )
    return {"ok": True, "access_token": access_token}



@router.post("/signup", response_model=UserPublic, status_code=201)
def signup(body: UserCreate, db: Session = Depends(get_db)) -> User:
    """Register a new employee account in PENDING status.

    Upon registration:
      - Validates uniqueness of email.
      - Hashes password with bcrypt.
      - Sets initial status to PENDING awaiting administrator review.
      - Optionally associates user with selected team in MEMBER role.
      - Dispatches system notification to all administrators.
    """
    users = UserRepository(db)
    if users.get_by_email(body.email):
        raise conflict("A user with this email already exists", code="EMAIL_TAKEN")
    user = User(
        name=body.name,
        email=str(body.email).lower(),
        password_hash=hash_password(body.password),
        is_admin=False,
        is_active=True,
        status=UserStatus.PENDING.value,
    )
    users.add(user)
    db.flush()

    if body.team_id:
        membership = TeamMembership(
            user_id=user.id,
            team_id=body.team_id,
            role=MembershipRole.MEMBER.value,
        )
        db.add(membership)

    NotificationService(db).notify_admins_new_user_registration(user)

    db.commit()
    db.refresh(user)
    return user


@router.post("/logout")
def logout(response: Response, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> dict:
    """Revoke user session and clear authentication cookie.

    Increments the user's `session_version` counter in the database, immediately
    invalidating all JWT tokens previously issued for this user across all browser tabs and devices.
    """
    user.session_version += 1
    db.commit()
    response.delete_cookie("newtonite_token")
    return {"ok": True}


@router.get("/me", response_model=MeResponse)
def me(ctx: AuthContext = Depends(get_auth_context), db: Session = Depends(get_db)) -> MeResponse:
    """Fetch the authenticated user's profile, memberships, and team permissions."""
    user = UserRepository(db).get_with_teams(ctx.user.id) or ctx.user
    return MeResponse(
        id=user.id,
        name=user.name,
        email=user.email,
        is_active=user.is_active,
        is_admin=user.is_admin,
        status=user.status,
        created_at=user.created_at,
        team_ids=ctx.team_ids,
        lead_team_ids=ctx.lead_team_ids,
        memberships=user.memberships,
    )


@router.put("/me", response_model=MeResponse)
def update_me(body: UserUpdate, ctx: AuthContext = Depends(get_auth_context), db: Session = Depends(get_db)) -> MeResponse:
    """Update user personal details (name, email) and team associations."""
    if body.name is not None:
        ctx.user.name = body.name.strip()
    if body.email is not None:
        email = str(body.email).strip().lower()
        if email != ctx.user.email:
            existing = UserRepository(db).get_by_email(email)
            if existing:
                raise conflict("A user with this email already exists")
            ctx.user.email = email

    if body.team_ids is not None:
        existing_memberships = list(db.scalars(
            select(TeamMembership).where(TeamMembership.user_id == ctx.user.id)
        ).all())
        existing_by_team = {m.team_id: m for m in existing_memberships}

        # Remove memberships not in body.team_ids
        for team_id, m in existing_by_team.items():
            if team_id not in body.team_ids:
                db.delete(m)

        # Add new memberships
        for team_id in body.team_ids:
            if team_id not in existing_by_team:
                db.add(TeamMembership(
                    user_id=ctx.user.id,
                    team_id=team_id,
                    role=MembershipRole.MEMBER.value
                ))

    db.add(ctx.user)
    db.commit()
    user = UserRepository(db).get_with_teams(ctx.user.id) or ctx.user

    team_ids = [m.team_id for m in user.memberships]
    lead_team_ids = [m.team_id for m in user.memberships if m.role == "TEAM_LEAD"]

    return MeResponse(
        id=user.id,
        name=user.name,
        email=user.email,
        is_active=user.is_active,
        is_admin=user.is_admin,
        status=user.status,
        created_at=user.created_at,
        team_ids=team_ids,
        lead_team_ids=lead_team_ids,
        memberships=user.memberships,
    )

