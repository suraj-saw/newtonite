from tests.conftest import auth_header, login


def test_optimistic_concurrency_conflict(client, seed_users):
    """User A wins; User B with stale version gets 409 and original change remains."""
    lead_token = login(client, "lead@test.com", "Lead123!")
    member_token = login(client, "member@test.com", "Member123!")
    item_id = seed_users["item"].id

    read_a = client.get(f"/api/work-items/{item_id}", headers=auth_header(lead_token))
    read_b = client.get(f"/api/work-items/{item_id}", headers=auth_header(member_token))
    assert read_a.json()["version"] == 1
    assert read_b.json()["version"] == 1

    update_a = client.patch(
        f"/api/work-items/{item_id}",
        headers=auth_header(lead_token),
        json={"version": 1, "title": "Updated by lead"},
    )
    assert update_a.status_code == 200
    assert update_a.json()["version"] == 2
    assert update_a.json()["title"] == "Updated by lead"

    update_b = client.patch(
        f"/api/work-items/{item_id}",
        headers=auth_header(member_token),
        json={"version": 1, "title": "Stale member edit"},
    )
    assert update_b.status_code == 409
    assert update_b.json()["error"]["code"] == "STALE_VERSION"

    latest = client.get(f"/api/work-items/{item_id}", headers=auth_header(lead_token))
    assert latest.json()["title"] == "Updated by lead"
    assert latest.json()["version"] == 2


def test_assignment_conflict(client, seed_users):
    admin_token = login(client, "admin@test.com", "Admin123!")
    lead_token = login(client, "lead@test.com", "Lead123!")
    item_id = seed_users["item"].id
    outsider_id = seed_users["admin"].id

    first = client.post(
        f"/api/work-items/{item_id}/assign",
        headers=auth_header(lead_token),
        json={"version": 1, "assignee_id": outsider_id},
    )
    assert first.status_code == 200
    assert first.json()["version"] == 2

    second = client.post(
        f"/api/work-items/{item_id}/assign",
        headers=auth_header(admin_token),
        json={"version": 1, "assignee_id": seed_users["member"].id},
    )
    assert second.status_code == 409

    latest = client.get(f"/api/work-items/{item_id}", headers=auth_header(admin_token))
    assert latest.json()["assignee_id"] == outsider_id
