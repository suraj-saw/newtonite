from tests.conftest import auth_header, login


def test_idempotent_create_does_not_duplicate(client, seed_users):
    token = login(client, "lead@test.com", "Lead123!")
    payload = {
        "title": "Idempotent item",
        "description": "Created once",
        "type": "ENGINEERING",
        "priority": "MEDIUM",
        "team_id": seed_users["eng"].id,
    }
    headers = {**auth_header(token), "Idempotency-Key": "abc123"}
    first = client.post("/api/work-items", headers=headers, json=payload)
    second = client.post("/api/work-items", headers=headers, json=payload)
    assert first.status_code == 201
    assert second.status_code == 201
    assert first.json()["id"] == second.json()["id"]

    listed = client.get("/api/work-items", headers=auth_header(token), params={"search": "Idempotent item"})
    titles = [row["title"] for row in listed.json()["items"]]
    assert titles.count("Idempotent item") == 1


def test_idempotency_key_scoped_to_user(client, seed_users):
    """Different users can safely use the same idempotency key."""
    lead_token = login(client, "lead@test.com", "Lead123!")
    member_token = login(client, "member@test.com", "Member123!")
    team_id = seed_users["eng"].id

    lead_payload = {
        "title": "Lead's item",
        "description": "Created by lead",
        "type": "ENGINEERING",
        "priority": "MEDIUM",
        "team_id": team_id,
    }
    member_payload = {
        "title": "Member's item",
        "description": "Created by member",
        "type": "ENGINEERING",
        "priority": "MEDIUM",
        "team_id": team_id,
    }

    # Both users use the same idempotency key
    lead_headers = {**auth_header(lead_token), "Idempotency-Key": "shared-key"}
    member_headers = {**auth_header(member_token), "Idempotency-Key": "shared-key"}

    lead_res = client.post("/api/work-items", headers=lead_headers, json=lead_payload)
    member_res = client.post("/api/work-items", headers=member_headers, json=member_payload)

    assert lead_res.status_code == 201
    assert member_res.status_code == 201
    assert lead_res.json()["id"] != member_res.json()["id"]
    assert lead_res.json()["title"] == "Lead's item"
    assert member_res.json()["title"] == "Member's item"
