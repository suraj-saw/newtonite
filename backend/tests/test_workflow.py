from tests.conftest import auth_header, login


def test_invalid_transition_rejected(client, seed_users):
    token = login(client, "lead@test.com", "Lead123!")
    item = seed_users["item"]
    res = client.post(
        f"/api/work-items/{item.id}/transition",
        headers=auth_header(token),
        json={"version": item.version, "status": "RESOLVED"},
    )
    assert res.status_code == 409
    assert res.json()["error"]["code"] == "INVALID_TRANSITION"


def test_valid_transition_and_audit(client, seed_users):
    token = login(client, "lead@test.com", "Lead123!")
    item = seed_users["item"]
    res = client.post(
        f"/api/work-items/{item.id}/transition",
        headers=auth_header(token),
        json={"version": item.version, "status": "IN_PROGRESS"},
    )
    assert res.status_code == 200
    assert res.json()["status"] == "IN_PROGRESS"
    assert res.json()["version"] == item.version + 1

    activity = client.get(f"/api/work-items/{item.id}/activity", headers=auth_header(token))
    assert activity.status_code == 200
    actions = [row["action"] for row in activity.json()]
    assert "STATUS_CHANGED" in actions


def test_comment_creates_audit(client, seed_users):
    token = login(client, "member@test.com", "Member123!")
    item = seed_users["item"]
    res = client.post(
        f"/api/work-items/{item.id}/comments",
        headers=auth_header(token),
        json={"body": "Looking into this now"},
    )
    assert res.status_code == 201
    activity = client.get(f"/api/work-items/{item.id}/activity", headers=auth_header(token))
    assert any(row["action"] == "COMMENT_ADDED" for row in activity.json())


def test_complete_workflow_cycle(client, seed_users):
    """Test the full workflow from OPEN to CLOSED."""
    token = login(client, "lead@test.com", "Lead123!")
    headers = auth_header(token)

    # Create a new work item
    create_res = client.post(
        "/api/work-items",
        headers=headers,
        json={
            "title": "Workflow test item",
            "description": "Testing full workflow",
            "type": "ENGINEERING",
            "priority": "MEDIUM",
            "team_id": seed_users["eng"].id,
        },
    )
    assert create_res.status_code == 201
    item_id = create_res.json()["id"]
    version = create_res.json()["version"]

    # OPEN -> IN_PROGRESS (valid)
    res = client.post(
        f"/api/work-items/{item_id}/transition",
        headers=headers,
        json={"version": version, "status": "IN_PROGRESS"},
    )
    assert res.status_code == 200
    version += 1

    # IN_PROGRESS -> BLOCKED (valid)
    res = client.post(
        f"/api/work-items/{item_id}/transition",
        headers=headers,
        json={"version": version, "status": "BLOCKED"},
    )
    assert res.status_code == 200
    version += 1

    # BLOCKED -> IN_PROGRESS (valid)
    res = client.post(
        f"/api/work-items/{item_id}/transition",
        headers=headers,
        json={"version": version, "status": "IN_PROGRESS"},
    )
    assert res.status_code == 200
    version += 1

    # IN_PROGRESS -> RESOLVED (valid)
    res = client.post(
        f"/api/work-items/{item_id}/transition",
        headers=headers,
        json={"version": version, "status": "RESOLVED"},
    )
    assert res.status_code == 200
    assert res.json()["resolved_at"] is not None
    version += 1

    # RESOLVED -> CLOSED (valid)
    res = client.post(
        f"/api/work-items/{item_id}/transition",
        headers=headers,
        json={"version": version, "status": "CLOSED"},
    )
    assert res.status_code == 200
    version += 1

    # Fetch the final state
    final = client.get(f"/api/work-items/{item_id}", headers=headers)
    assert final.json()["status"] == "CLOSED"

    # CLOSED -> any transition should fail
    res = client.post(
        f"/api/work-items/{item_id}/transition",
        headers=headers,
        json={"version": version, "status": "OPEN"},
    )
    assert res.status_code == 409
    assert res.json()["error"]["code"] == "INVALID_TRANSITION"


def test_approval_workflow_operational_item(client, seed_users):
    """Test approval workflow: member requests approval, member cannot approve, lead approves."""
    lead_token = login(client, "lead@test.com", "Lead123!")
    member_token = login(client, "member@test.com", "Member123!")
    outsider_token = login(client, "outsider@test.com", "Out123!")
    lead_headers = auth_header(lead_token)
    member_headers = auth_header(member_token)
    outsider_headers = auth_header(outsider_token)

    # 1. Create a COMPLIANCE work item
    create_res = client.post(
        "/api/work-items",
        headers=lead_headers,
        json={
            "title": "Annual SOC2 Security Audit",
            "description": "Requires lead approval before review",
            "type": "COMPLIANCE",
            "priority": "HIGH",
            "team_id": seed_users["eng"].id,
        },
    )
    assert create_res.status_code == 201
    item = create_res.json()
    item_id = item["id"]
    version = item["version"]

    # 2. Outsider cannot request approval
    bad_req = client.post(
        f"/api/work-items/{item_id}/transition",
        headers=outsider_headers,
        json={"version": version, "status": "PENDING_APPROVAL"},
    )
    assert bad_req.status_code in (403, 404)

    # 3. Team member requests approval
    req_res = client.post(
        f"/api/work-items/{item_id}/transition",
        headers=member_headers,
        json={"version": version, "status": "PENDING_APPROVAL"},
    )
    assert req_res.status_code == 200
    assert req_res.json()["status"] == "PENDING_APPROVAL"
    version = req_res.json()["version"]

    # 4. Team member CANNOT approve or move out of PENDING_APPROVAL
    approve_by_member = client.post(
        f"/api/work-items/{item_id}/transition",
        headers=member_headers,
        json={"version": version, "status": "IN_PROGRESS"},
    )
    assert approve_by_member.status_code == 403

    # 5. Team Lead CAN approve item -> moves to IN_PROGRESS
    approve_by_lead = client.post(
        f"/api/work-items/{item_id}/transition",
        headers=lead_headers,
        json={"version": version, "status": "IN_PROGRESS"},
    )
    assert approve_by_lead.status_code == 200
    assert approve_by_lead.json()["status"] == "IN_PROGRESS"
    version = approve_by_lead.json()["version"]

    # 6. Verify audit logs reflect APPROVAL_REQUESTED and APPROVED
    activity = client.get(f"/api/work-items/{item_id}/activity", headers=lead_headers)
    assert activity.status_code == 200
    actions = [row["action"] for row in activity.json()]
    assert "APPROVAL_REQUESTED" in actions
    assert "APPROVED" in actions

