import os
import sys
import pytest
from datetime import datetime, timedelta, timezone

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import create_app
from app.database import get_db, init_db
from seed_data import seed_database

@pytest.fixture(scope="module")
def app_client():
    app = create_app()
    app.config["TESTING"] = True
    seed_database(force_reset=True)  # always clean slate for test isolation
    with app.test_client() as test_client:
        yield test_client

def login_user(client, email, password="CivicFix2026!"):
    res = client.post("/api/auth/login", json={"email": email, "password": password})
    assert res.status_code == 200, f"Login failed for {email}: {res.get_json()}"
    data = res.get_json()
    return data["token"], data["user"]

# Scenario A: Citizen logs in, reads a notification, and sees unread badge decrement immediately. Read status persists after refresh.
def test_scenario_a_notification_lifecycle_and_persistence(app_client):
    citizen_token, citizen_user = login_user(app_client, "citizen@civicfix.gov")
    headers = {"Authorization": f"Bearer {citizen_token}"}

    # 1. Fetch initial notifications
    res = app_client.get("/api/notifications", headers=headers)
    assert res.status_code == 200
    data = res.get_json()
    initial_unread = data["unread_count"]
    assert initial_unread > 0, "Expected at least 1 seeded notification for citizen"

    # Find an unread notification
    unread_notifs = [n for n in data["notifications"] if not n["is_read"]]
    target_notif = unread_notifs[0]
    notif_id = target_notif["id"]

    # 2. Mark individual notification as read
    read_res = app_client.post(f"/api/notifications/{notif_id}/read", headers=headers)
    assert read_res.status_code == 200
    read_data = read_res.get_json()
    assert read_data["notification"]["is_read"] == 1
    assert read_data["notification"]["read_at"] is not None
    assert read_data["unread_count"] == initial_unread - 1

    # 3. Verify persistence on refresh (re-fetching notifications)
    refresh_res = app_client.get("/api/notifications", headers=headers)
    assert refresh_res.status_code == 200
    refreshed_data = refresh_res.get_json()
    assert refreshed_data["unread_count"] == initial_unread - 1
    refreshed_notif = next(n for n in refreshed_data["notifications"] if n["id"] == notif_id)
    assert refreshed_notif["is_read"] == 1
    assert refreshed_notif["read_at"] is not None

# Scenario B: Citizen clicks "Mark all read". All their notifications become read, but another user's notification records remain unchanged.
def test_scenario_b_mark_all_read_isolation(app_client):
    # Ensure officer has an unread notification
    officer_token, officer_user = login_user(app_client, "officer.roads@civicfix.gov")
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO notifications (user_id, case_id, related_grievance_id, title, message, type, is_read)
            VALUES (?, 'CF-TEST-001', 'CF-TEST-001', 'Officer Task', 'Inspect guardrail', 'urgent', 0)
        """, (officer_user["id"],))

    # Check officer's unread count
    off_res = app_client.get("/api/notifications", headers={"Authorization": f"Bearer {officer_token}"})
    off_initial_unread = off_res.get_json()["unread_count"]
    assert off_initial_unread > 0

    # Citizen logs in and marks all read
    citizen_token, citizen_user = login_user(app_client, "citizen@civicfix.gov")
    cit_headers = {"Authorization": f"Bearer {citizen_token}"}
    mark_all_res = app_client.post("/api/notifications/mark-all-read", headers=cit_headers)
    assert mark_all_res.status_code == 200
    assert mark_all_res.get_json()["unread_count"] == 0

    # Verify citizen has 0 unread now
    cit_check = app_client.get("/api/notifications?filter=unread", headers=cit_headers)
    assert cit_check.get_json()["unread_count"] == 0
    assert len(cit_check.get_json()["notifications"]) == 0

    # Verify Officer's unread notifications were NOT touched
    off_check = app_client.get("/api/notifications", headers={"Authorization": f"Bearer {officer_token}"})
    assert off_check.get_json()["unread_count"] == off_initial_unread

    # Verify cross-user modification rejection: Citizen cannot mark Officer's notification as read
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT id FROM notifications WHERE user_id = ? LIMIT 1", (officer_user["id"],))
        officer_notif_id = cursor.fetchone()["id"]

    unauthorized_res = app_client.post(f"/api/notifications/{officer_notif_id}/read", headers=cit_headers)
    assert unauthorized_res.status_code == 403, "Citizen must receive 403 Forbidden when modifying another user's notification"

# Scenario C: Citizen attempts to access a manager-only endpoint directly. The backend rejects the request with 403.
def test_scenario_c_citizen_forbidden_manager_endpoints(app_client):
    citizen_token, _ = login_user(app_client, "citizen@civicfix.gov")
    headers = {"Authorization": f"Bearer {citizen_token}"}

    # 1. Citizen attempts to access managerial risk queue
    res_risk_queue = app_client.get("/api/analytics/risk-queue", headers=headers)
    assert res_risk_queue.status_code == 403

    # 2. Citizen attempts to access department workload
    res_workload = app_client.get("/api/analytics/department-workload", headers=headers)
    assert res_workload.status_code == 403

    # 3. Citizen attempts to reassign an officer
    res_reassign = app_client.post("/api/grievances/CF-2026-1001/reassign", headers=headers, json={
        "officer_id": 5,
        "reason": "Unauthorized attempt"
    })
    assert res_reassign.status_code == 403

    # 4. Citizen attempts admin user list
    res_admin_users = app_client.get("/api/admin/users", headers=headers)
    assert res_admin_users.status_code == 403

# Scenario D: Citizen changes a browser value or manually sends role="manager" in a request. The backend still treats the request as a Citizen request and rejects unauthorized actions.
def test_scenario_d_client_role_tampering_ignored(app_client):
    citizen_token, citizen_user = login_user(app_client, "citizen@civicfix.gov")
    headers = {
        "Authorization": f"Bearer {citizen_token}",
        "X-User-Role": "manager",
        "Role": "manager"
    }

    # Attempt managerial reassign with injected role in JSON body and headers
    res = app_client.post(
        "/api/grievances/CF-2026-1001/reassign",
        headers=headers,
        json={
            "role": "manager",
            "user_role": "admin",
            "officer_id": 5,
            "reason": "Attempting role injection"
        }
    )
    # The server determines role ONLY from trusted server database, so it must reject with 403
    assert res.status_code == 403
    assert "Access denied" in res.get_json()["error"]

# Scenario E: Manager logs in using a separate manager account and can access permitted departmental escalation actions.
def test_scenario_e_manager_access_and_reassignment(app_client):
    manager_token, manager_user = login_user(app_client, "manager.roads@civicfix.gov")
    headers = {"Authorization": f"Bearer {manager_token}"}

    # Manager can access risk queue
    res_queue = app_client.get("/api/analytics/risk-queue", headers=headers)
    assert res_queue.status_code == 200

    # Manager can access department workload
    res_workload = app_client.get("/api/analytics/department-workload", headers=headers)
    assert res_workload.status_code == 200

    # Manager can reassign a Roads case to another officer in the department
    # Find an officer in roads
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT id FROM users WHERE role = 'officer' AND department_id = ?", (manager_user["department_id"],))
        target_officer_id = cursor.fetchone()["id"]

    res_reassign = app_client.post("/api/grievances/CF-2026-1001/reassign", headers=headers, json={
        "officer_id": target_officer_id,
        "reason": "Authorized manager load balancing"
    })
    assert res_reassign.status_code == 200
    assert "successfully reassigned" in res_reassign.get_json()["message"]

# Scenario F: Logging out invalidates the session. Protected API calls fail until a new authenticated session is established.
def test_scenario_f_logout_session_invalidation(app_client):
    token, user = login_user(app_client, "marcus@civicfix.gov")
    headers = {"Authorization": f"Bearer {token}"}

    # Verify session works
    res_me = app_client.get("/api/auth/me", headers=headers)
    assert res_me.status_code == 200

    # Logout
    res_logout = app_client.post("/api/auth/logout", headers=headers)
    assert res_logout.status_code == 200

    # Attempt protected API call with revoked token
    res_after = app_client.get("/api/auth/me", headers=headers)
    assert res_after.status_code == 401

    res_notif = app_client.get("/api/notifications", headers=headers)
    assert res_notif.status_code == 401

# Scenario G: Demo persona switching authenticates a separate seeded account and does not carry over the previous account's permissions or notifications.
def test_scenario_g_persona_switching_account_isolation(app_client):
    # Step 1: Login as Citizen Elena
    token1, user1 = login_user(app_client, "citizen@civicfix.gov")
    headers1 = {"Authorization": f"Bearer {token1}"}
    assert user1["role"] == "citizen"

    # Step 2: Invalidate session 1 on logout
    app_client.post("/api/auth/logout", headers=headers1)

    # Step 3: Login as Manager Arthur
    token2, user2 = login_user(app_client, "manager.roads@civicfix.gov")
    headers2 = {"Authorization": f"Bearer {token2}"}
    assert user2["role"] == "manager"
    assert user2["id"] != user1["id"]

    # Manager has access to risk queue
    assert app_client.get("/api/analytics/risk-queue", headers=headers2).status_code == 200

    # Old token1 is completely dead (401)
    assert app_client.get("/api/auth/me", headers=headers1).status_code == 401
    assert app_client.get("/api/analytics/risk-queue", headers=headers1).status_code == 401

# Scenario H: Notifications linked to grievances open the correct grievance details and are checked against the user's permissions.
def test_scenario_h_notification_grievance_permission_enforcement(app_client):
    citizen_token, citizen_user = login_user(app_client, "citizen@civicfix.gov")
    headers_citizen = {"Authorization": f"Bearer {citizen_token}"}

    # CF-2026-1002 was reported by Marcus Chen (citizen_id != Elena Rostova)
    # Citizen Elena attempts to view private details of Marcus's case
    res = app_client.get("/api/grievances/CF-2026-1002", headers=headers_citizen)
    assert res.status_code == 403, "Citizen Elena must be forbidden from accessing Marcus's private grievance details"

    # But Public Tracking of CF-2026-1002 is permitted without personal contact info
    res_public = app_client.get("/api/grievances/track/CF-2026-1002")
    assert res_public.status_code == 200
    assert "citizen_email" not in res_public.get_json()["case"]
