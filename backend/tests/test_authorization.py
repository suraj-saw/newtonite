from tests.conftest import auth_header, login


def test_member_cannot_see_other_team_item(client, seed_users):
    token = login(client, "outsider@test.com", "Out123!")
    item_id = seed_users["item"].id
    res = client.get(f"/api/work-items/{item_id}", headers=auth_header(token))
    assert res.status_code == 403


def test_member_can_see_own_team_item(client, seed_users):
    token = login(client, "member@test.com", "Member123!")
    item_id = seed_users["item"].id
    res = client.get(f"/api/work-items/{item_id}", headers=auth_header(token))
    assert res.status_code == 200


def test_member_cannot_assign(client, seed_users):
    token = login(client, "member@test.com", "Member123!")
    item = seed_users["item"]
    res = client.post(
        f"/api/work-items/{item.id}/assign",
        headers=auth_header(token),
        json={"version": item.version, "assignee_id": seed_users["lead"].id},
    )
    assert res.status_code == 403
    assert res.json()["error"]["message"] == f"Only {seed_users['eng'].name} Team Leads can change priorities or reassign team members"


def test_member_cannot_change_priority(client, seed_users):
    token = login(client, "member@test.com", "Member123!")
    item = seed_users["item"]
    res = client.patch(
        f"/api/work-items/{item.id}",
        headers=auth_header(token),
        json={"version": item.version, "priority": "LOW"},
    )
    assert res.status_code == 403
    assert res.json()["error"]["message"] == f"Only {seed_users['eng'].name} Team Leads can change priorities or reassign team members"


def test_non_admin_cannot_create_team(client, seed_users):
    token = login(client, "lead@test.com", "Lead123!")
    res = client.post("/api/teams", headers=auth_header(token), json={"name": "Secret"})
    assert res.status_code == 403


def test_admin_can_create_team(client, seed_users):
    token = login(client, "admin@test.com", "Admin123!")
    res = client.post("/api/teams", headers=auth_header(token), json={"name": "Finance"})
    assert res.status_code == 201


def test_list_teams_requires_auth(client, seed_users):
    # Unauthenticated request to /api/teams returns 401
    res = client.get("/api/teams")
    assert res.status_code == 401

    # Authenticated request to /api/teams returns 200
    token = login(client, "member@test.com", "Member123!")
    res = client.get("/api/teams", headers=auth_header(token))
    assert res.status_code == 200
    assert len(res.json()) >= 1


def test_public_registration_teams_unauthenticated(client, seed_users):
    # Public endpoint /api/auth/teams does not require auth
    res = client.get("/api/auth/teams")
    assert res.status_code == 200
    assert isinstance(res.json(), list)
    assert len(res.json()) >= 1


def test_list_users_admin_only(client, seed_users):
    # Non-admin user gets 403 Forbidden
    member_token = login(client, "member@test.com", "Member123!")
    res = client.get("/api/users", headers=auth_header(member_token))
    assert res.status_code == 403

    # Admin user gets 200 OK
    admin_token = login(client, "admin@test.com", "Admin123!")
    res = client.get("/api/users", headers=auth_header(admin_token))
    assert res.status_code == 200
    assert len(res.json()) >= 1
