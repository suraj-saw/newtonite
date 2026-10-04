from tests.conftest import auth_header, login


def test_login_success(client, seed_users):
    res = client.post("/api/auth/login", json={"email": "admin@test.com", "password": "Admin123!"})
    assert res.status_code == 200
    assert "access_token" in res.json()


def test_login_rejects_bad_password(client, seed_users):
    res = client.post("/api/auth/login", json={"email": "admin@test.com", "password": "wrong"})
    assert res.status_code == 401


def test_me_requires_auth(client, seed_users):
    res = client.get("/api/auth/me")
    assert res.status_code == 401


def test_me_returns_current_user(client, seed_users):
    token = login(client, "lead@test.com", "Lead123!")
    res = client.get("/api/auth/me", headers=auth_header(token))
    assert res.status_code == 200
    body = res.json()
    assert body["email"] == "lead@test.com"
    assert seed_users["eng"].id in body["lead_team_ids"]


def test_unauthenticated_work_items(client, seed_users):
    res = client.get("/api/work-items")
    assert res.status_code == 401
