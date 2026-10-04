from tests.conftest import auth_header, login


def test_search_filter_pagination(client, seed_users, db):
    token = login(client, "admin@test.com", "Admin123!")
    headers = auth_header(token)
    team_id = seed_users["eng"].id
    for i in range(15):
        res = client.post(
            "/api/work-items",
            headers=headers,
            json={
                "title": f"Pager duty {i}",
                "description": "noise",
                "type": "INCIDENT",
                "priority": "CRITICAL" if i % 2 == 0 else "LOW",
                "team_id": team_id,
            },
        )
        assert res.status_code == 201

    page1 = client.get(
        "/api/work-items",
        headers=headers,
        params={"search": "Pager", "page": 1, "page_size": 10, "sort": "id"},
    )
    assert page1.status_code == 200
    body = page1.json()
    assert body["total"] == 15
    assert len(body["items"]) == 10
    assert body["page"] == 1

    page2 = client.get(
        "/api/work-items",
        headers=headers,
        params={"search": "Pager", "page": 2, "page_size": 10, "sort": "id"},
    )
    assert len(page2.json()["items"]) == 5

    critical = client.get(
        "/api/work-items",
        headers=headers,
        params={"search": "Pager", "priority": "CRITICAL", "page_size": 50},
    )
    assert all(item["priority"] == "CRITICAL" for item in critical.json()["items"])
    assert critical.json()["total"] == 8


def test_dashboard_is_server_aggregated(client, seed_users):
    token = login(client, "admin@test.com", "Admin123!")
    res = client.get("/api/dashboard/summary", headers=auth_header(token))
    assert res.status_code == 200
    body = res.json()
    assert "active" in body
    assert "overdue" in body
    assert "blocked" in body
    assert body["active"] >= 1
