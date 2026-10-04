from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.database import Base, get_db
from app.core.security import hash_password
from app.main import app
from app.models import MembershipRole, Team, TeamMembership, User, WorkItem, WorkItemType, WorkItemPriority, WorkItemStatus


@pytest.fixture()
def db_engine(tmp_path):
    engine = create_engine(
        "sqlite:///" + str(tmp_path / "test.db"),
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    with engine.begin() as conn:
        conn.execute(text("PRAGMA foreign_keys=ON"))
    Base.metadata.create_all(engine)
    yield engine
    engine.dispose()


@pytest.fixture()
def db(db_engine):
    Session = sessionmaker(bind=db_engine, autoflush=False, autocommit=False)
    session = Session()
    yield session
    session.close()


@pytest.fixture()
def client(db, db_engine):
    Session = sessionmaker(bind=db_engine, autoflush=False, autocommit=False)

    def override_get_db():
        session = Session()
        try:
            yield session
        finally:
            session.close()

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


@pytest.fixture()
def seed_users(db):
    admin = User(name="Admin", email="admin@test.com", password_hash=hash_password("Admin123!"), is_admin=True, status="APPROVED")
    lead = User(name="Lead", email="lead@test.com", password_hash=hash_password("Lead123!"), status="APPROVED")
    member = User(name="Member", email="member@test.com", password_hash=hash_password("Member123!"), status="APPROVED")
    outsider = User(name="Outsider", email="outsider@test.com", password_hash=hash_password("Out123!"), status="APPROVED")
    db.add_all([admin, lead, member, outsider])
    db.flush()
    eng = Team(name="Engineering", description="Eng")
    ops = Team(name="Ops", description="Ops")
    db.add_all([eng, ops])
    db.flush()
    db.add_all(
        [
            TeamMembership(user_id=lead.id, team_id=eng.id, role=MembershipRole.TEAM_LEAD.value),
            TeamMembership(user_id=member.id, team_id=eng.id, role=MembershipRole.MEMBER.value),
            TeamMembership(user_id=outsider.id, team_id=ops.id, role=MembershipRole.MEMBER.value),
        ]
    )
    item = WorkItem(
        title="Original bug",
        description="Broken login",
        type=WorkItemType.ENGINEERING.value,
        status=WorkItemStatus.OPEN.value,
        priority=WorkItemPriority.HIGH.value,
        team_id=eng.id,
        assignee_id=member.id,
        created_by_id=lead.id,
        due_at=datetime.now(timezone.utc) + timedelta(days=2),
        version=1,
    )
    db.add(item)
    db.commit()
    db.refresh(admin)
    db.refresh(lead)
    db.refresh(member)
    db.refresh(outsider)
    db.refresh(eng)
    db.refresh(ops)
    db.refresh(item)
    return {
        "admin": admin,
        "lead": lead,
        "member": member,
        "outsider": outsider,
        "eng": eng,
        "ops": ops,
        "item": item,
    }


def login(client: TestClient, email: str, password: str) -> str:
    res = client.post("/api/auth/login", json={"email": email, "password": password})
    assert res.status_code == 200, res.text
    return res.json()["access_token"]


def auth_header(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}
