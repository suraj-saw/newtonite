from tests.conftest import auth_header, login


def test_notification_on_assignment(client, seed_users):
    lead_token = login(client, "lead@test.com", "Lead123!")
    member_token = login(client, "member@test.com", "Member123!")
    item = seed_users["item"]

    # First unassign member
    client.post(
        f"/api/work-items/{item.id}/assign",
        headers=auth_header(lead_token),
        json={"version": item.version, "assignee_id": None},
    )

    # Lead assigns member
    res = client.post(
        f"/api/work-items/{item.id}/assign",
        headers=auth_header(lead_token),
        json={"version": item.version + 1, "assignee_id": seed_users["member"].id},
    )
    assert res.status_code == 200

    # Member should have an assignment notification
    notifs_res = client.get("/api/notifications", headers=auth_header(member_token))
    assert notifs_res.status_code == 200
    data = notifs_res.json()
    assert any(n["type"] == "ASSIGNMENT" and n["work_item_id"] == item.id for n in data["items"])

    # Check unread count
    count_res = client.get("/api/notifications/unread-count", headers=auth_header(member_token))
    assert count_res.status_code == 200
    assert count_res.json()["unread_count"] >= 1


def test_notification_on_comment(client, seed_users):
    lead_token = login(client, "lead@test.com", "Lead123!")
    member_token = login(client, "member@test.com", "Member123!")
    item = seed_users["item"]

    # Lead adds a comment
    res = client.post(
        f"/api/work-items/{item.id}/comments",
        headers=auth_header(lead_token),
        json={"body": "Please look at the attached logs."},
    )
    assert res.status_code == 201

    # Member (assignee) should have a comment notification
    notifs_res = client.get("/api/notifications", headers=auth_header(member_token))
    assert notifs_res.status_code == 200
    data = notifs_res.json()
    assert any(n["type"] == "COMMENT" and "Please look at the attached logs" in n["message"] for n in data["items"])


def test_notification_on_approval_request(client, seed_users):
    lead_token = login(client, "lead@test.com", "Lead123!")
    member_token = login(client, "member@test.com", "Member123!")
    item = seed_users["item"]

    # Member requests approval
    res = client.post(
        f"/api/work-items/{item.id}/transition",
        headers=auth_header(member_token),
        json={"version": item.version, "status": "PENDING_APPROVAL"},
    )
    assert res.status_code == 200

    # Lead should have received an APPROVAL_REQUESTED notification
    notifs_res = client.get("/api/notifications", headers=auth_header(lead_token))
    assert notifs_res.status_code == 200
    data = notifs_res.json()
    assert any(n["type"] == "APPROVAL_REQUESTED" and n["work_item_id"] == item.id for n in data["items"])


def test_mark_notification_read_and_delete(client, seed_users):
    lead_token = login(client, "lead@test.com", "Lead123!")
    member_token = login(client, "member@test.com", "Member123!")
    item = seed_users["item"]

    # Lead comments to generate a notification for member
    client.post(
        f"/api/work-items/{item.id}/comments",
        headers=auth_header(lead_token),
        json={"body": "Testing notification mark read and delete."},
    )

    notifs_res = client.get("/api/notifications?unread_only=true", headers=auth_header(member_token))
    assert notifs_res.status_code == 200
    items = notifs_res.json()["items"]
    assert len(items) > 0
    target_id = items[0]["id"]

    # Mark as read
    read_res = client.patch(f"/api/notifications/{target_id}/read", headers=auth_header(member_token))
    assert read_res.status_code == 200
    assert read_res.json()["is_read"] is True

    # Mark all read
    mark_all_res = client.post("/api/notifications/mark-all-read", headers=auth_header(member_token))
    assert mark_all_res.status_code == 200

    unread_res = client.get("/api/notifications/unread-count", headers=auth_header(member_token))
    assert unread_res.json()["unread_count"] == 0

    # Delete notification
    del_res = client.delete(f"/api/notifications/{target_id}", headers=auth_header(member_token))
    assert del_res.status_code == 204

    # Verify not found after delete
    read_again = client.patch(f"/api/notifications/{target_id}/read", headers=auth_header(member_token))
    assert read_again.status_code == 404
