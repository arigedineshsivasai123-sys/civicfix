import pytest
import re
from datetime import datetime, timezone
from app import create_app
from app.database import get_db

@pytest.fixture
def client():
    app = create_app()
    app.config["TESTING"] = True
    with app.test_client() as client:
        yield client

def login_as(client, email, password="CivicFix2026!"):
    res = client.post("/api/auth/login", json={"email": email, "password": password})
    assert res.status_code == 200, f"Login failed for {email}: {res.data}"
    data = res.get_json()
    token = data["token"]
    return {
        "Authorization": f"Bearer {token}",
        "X-Session-Token": token,
        "Content-Type": "application/json"
    }, data["user"]

def test_submission_and_tracking_id_uniqueness(client):
    """Phase 2 & 14: Unique database-backed tracking ID generation and validation."""
    headers, user = login_as(client, "citizen@civicfix.gov")

    # 1. Invalid submission (short title)
    res_bad_title = client.post("/api/grievances", headers=headers, json={
        "title": "Bad",
        "category": "Potholes & Road Damage",
        "locality": "Maple Street",
        "description": "This is a detailed description of the road problem."
    })
    assert res_bad_title.status_code == 400
    assert "title" in res_bad_title.get_json()["error"].lower()

    # 2. Invalid submission (short description)
    res_bad_desc = client.post("/api/grievances", headers=headers, json={
        "title": "Pothole Outside Gate",
        "category": "Potholes & Road Damage",
        "locality": "Maple Street",
        "description": "Too short"
    })
    assert res_bad_desc.status_code == 400
    assert "description" in res_bad_desc.get_json()["error"].lower()

    # 3. Valid submission
    res_ok = client.post("/api/grievances", headers=headers, json={
        "title": "Severe Pothole Outside School Gate",
        "category": "Potholes & Road Damage",
        "locality": "Elm Street North",
        "priority": "High",
        "description": "Deep asphalt crater measuring approximately two feet across posing vehicle risk."
    })
    assert res_ok.status_code == 201
    body = res_ok.get_json()
    case_id_1 = body["case_id"]
    assert re.match(r"^CF-\d{4}-\d{4}$", case_id_1), f"Unexpected case ID format: {case_id_1}"

    # Verify persisted in database
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM grievances WHERE case_id = ?", (case_id_1,))
        db_case = cursor.fetchone()
        assert db_case is not None
        assert db_case["title"] == "Severe Pothole Outside School Gate"
        assert db_case["priority"] == "High"

    # 4. Second submission generates a distinct unique case ID
    res_ok_2 = client.post("/api/grievances", headers=headers, json={
        "title": "Broken Streetlight Near Park",
        "category": "Streetlight Outages & Electrical",
        "locality": "Oak Lane",
        "priority": "Medium",
        "description": "Streetlight pole flickering incessantly throughout the night causing pedestrian safety concern."
    })
    assert res_ok_2.status_code == 201
    case_id_2 = res_ok_2.get_json()["case_id"]
    assert case_id_1 != case_id_2

def test_reassignment_synchronization_and_workloads(client):
    """Phase 3 & 14: Atomic reassignment, workload recalculation, and notifications."""
    mgr_headers, mgr_user = login_as(client, "manager.roads@civicfix.gov")
    dept_id = mgr_user["department_id"]

    # Pick an active roads case
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT case_id, assigned_officer_id FROM grievances
            WHERE department_id = ? AND status NOT IN ('Resolved', 'Closed') AND assigned_officer_id IS NOT NULL
            LIMIT 1
        """, (dept_id,))
        case_row = cursor.fetchone()
        assert case_row is not None
        case_id = case_row["case_id"]
        old_officer_id = case_row["assigned_officer_id"]

        # Find another active officer in Roads
        cursor.execute("""
            SELECT id, name FROM users
            WHERE department_id = ? AND role = 'officer' AND id != ?
            LIMIT 1
        """, (dept_id, old_officer_id))
        new_officer_row = cursor.fetchone()
        assert new_officer_row is not None
        new_officer_id = new_officer_row["id"]
        new_officer_name = new_officer_row["name"]

        # Measure baseline workloads
        cursor.execute("SELECT COUNT(*) as cnt FROM grievances WHERE assigned_officer_id = ? AND status NOT IN ('Resolved', 'Closed')", (old_officer_id,))
        old_baseline = cursor.fetchone()["cnt"]

        cursor.execute("SELECT COUNT(*) as cnt FROM grievances WHERE assigned_officer_id = ? AND status NOT IN ('Resolved', 'Closed')", (new_officer_id,))
        new_baseline = cursor.fetchone()["cnt"]

    # Execute reassignment through manager API
    reassign_res = client.post(f"/api/grievances/{case_id}/reassign", headers=mgr_headers, json={
        "officer_id": new_officer_id,
        "reason": "Comprehensive QA workload capacity rebalancing"
    })
    assert reassign_res.status_code == 200
    res_data = reassign_res.get_json()
    assert res_data["assigned_officer_id"] == new_officer_id
    assert res_data["assigned_officer_name"] == new_officer_name

    # Verify database state
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT assigned_officer_id, reassignment_count FROM grievances WHERE case_id = ?", (case_id,))
        updated = cursor.fetchone()
        assert updated["assigned_officer_id"] == new_officer_id

        # Verify workloads shifted accurately
        cursor.execute("SELECT COUNT(*) as cnt FROM grievances WHERE assigned_officer_id = ? AND status NOT IN ('Resolved', 'Closed')", (old_officer_id,))
        old_new_load = cursor.fetchone()["cnt"]
        assert old_new_load == old_baseline - 1

        cursor.execute("SELECT COUNT(*) as cnt FROM grievances WHERE assigned_officer_id = ? AND status NOT IN ('Resolved', 'Closed')", (new_officer_id,))
        new_new_load = cursor.fetchone()["cnt"]
        assert new_new_load == new_baseline + 1

        # Verify audit log entry contains both old and new officer
        cursor.execute("SELECT * FROM case_history WHERE case_id = ? AND action = 'REASSIGNED' ORDER BY id DESC LIMIT 1", (case_id,))
        audit = cursor.fetchone()
        assert audit is not None
        assert audit["new_value"] == new_officer_name

        # Verify notifications for both officers
        cursor.execute("SELECT * FROM notifications WHERE case_id = ? AND user_id = ? ORDER BY id DESC LIMIT 1", (case_id, new_officer_id))
        notif_new = cursor.fetchone()
        assert notif_new is not None
        assert any(kw in notif_new["title"] for kw in ("Transferred", "Assigned", "Reassigned"))

        cursor.execute("SELECT * FROM notifications WHERE case_id = ? AND user_id = ? ORDER BY id DESC LIMIT 1", (case_id, old_officer_id))
        notif_old = cursor.fetchone()
        assert notif_old is not None
        assert "Reassigned Away" in notif_old["title"]

def test_admin_analytics_and_telemetry_queries(client):
    """Phase 5 & 14: Analytics overview, department workload, and timeline trends."""
    admin_headers, _ = login_as(client, "admin@civicfix.gov")

    # 1. Overview
    res_ov = client.get("/api/analytics/overview", headers=admin_headers)
    assert res_ov.status_code == 200
    ov_data = res_ov.get_json()
    assert ov_data["total_grievances"] >= 20
    assert "resolution_rate" in ov_data
    assert "open_grievances" in ov_data
    assert "avg_resolution_hours" in ov_data

    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT COUNT(*) as cnt FROM grievances")
        real_total = cursor.fetchone()["cnt"]
        assert ov_data["total_grievances"] == real_total

    # 2. Department Workload
    res_wl = client.get("/api/analytics/department-workload", headers=admin_headers)
    assert res_wl.status_code == 200
    wl_data = res_wl.get_json()
    assert "departments" in wl_data
    assert len(wl_data["departments"]) >= 3
    for dept in wl_data["departments"]:
        assert "total_cases" in dept
        assert "active_cases" in dept
        assert "code" in dept

    # 3. Trends
    res_tr = client.get("/api/analytics/trends", headers=admin_headers)
    assert res_tr.status_code == 200
    tr_data = res_tr.get_json()
    assert "trends" in tr_data
    assert len(tr_data["trends"]) > 0
    first_trend = tr_data["trends"][0]
    assert "date_val" in first_trend
    assert "submitted_count" in first_trend
    assert "resolved_count" in first_trend

def test_category_sla_rules_and_admin_governance(client):
    """Phase 6, 7 & 14: Category SLA update validation, audit logging, and user governance."""
    admin_headers, _ = login_as(client, "admin@civicfix.gov")

    # 1. List categories
    res_cats = client.get("/api/admin/categories", headers=admin_headers)
    assert res_cats.status_code == 200
    cats = res_cats.get_json()["categories"]
    assert len(cats) >= 5
    cat_1 = cats[0]

    # 2. Invalid SLA value (negative or 0)
    res_invalid = client.patch(f"/api/admin/categories/{cat_1['id']}", headers=admin_headers, json={
        "sla_hours": -5
    })
    assert res_invalid.status_code == 400

    # 3. Valid SLA update
    res_update = client.patch(f"/api/admin/categories/{cat_1['id']}", headers=admin_headers, json={
        "sla_hours": 30
    })
    assert res_update.status_code == 200

    # Verify audit log recorded the admin config change
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM categories WHERE id = ?", (cat_1["id"],))
        updated_cat = cursor.fetchone()
        assert updated_cat["sla_hours"] == 30

        cursor.execute("SELECT * FROM case_history WHERE case_id = 'SYSTEM' AND action = 'CATEGORY_SLA_MODIFIED' ORDER BY id DESC LIMIT 1")
        audit_row = cursor.fetchone()
        assert audit_row is not None
        assert "modified SLA" in audit_row["notes"]

    # 4. User governance: users list
    res_users = client.get("/api/admin/users", headers=admin_headers)
    assert res_users.status_code == 200
    users_list = res_users.get_json()["users"]
    assert len(users_list) >= 4
    for u in users_list:
        assert "password_hash" not in u
        assert "role" in u
        assert "email" in u

def test_demo_accelerator_vs_standard_sla(client):
    """Phase 9, 11 & 14: Demonstration SLA accelerator gives 15-minute deadline."""
    headers, _ = login_as(client, "citizen@civicfix.gov")

    # Standard submission
    res_std = client.post("/api/grievances", headers=headers, json={
        "title": "Standard Street Sign Misalignment",
        "category": "Potholes & Road Damage",
        "locality": "Broadway Avenue",
        "description": "Street sign post tilted at 45 degrees near intersection."
    })
    assert res_std.status_code == 201
    std_case_id = res_std.get_json()["case_id"]

    # Accelerated submission
    res_acc = client.post("/api/grievances", headers=headers, json={
        "title": "Live Demonstration Immediate Risk Test",
        "category": "Potholes & Road Damage",
        "locality": "Tech Park Loop",
        "description": "Accelerated test grievance submitted to demonstrate countdown and SLA escalation.",
        "demo_short_deadline": True
    })
    assert res_acc.status_code == 201
    acc_case_id = res_acc.get_json()["case_id"]

    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT submission_date, target_deadline FROM grievances WHERE case_id = ?", (std_case_id,))
        std_row = cursor.fetchone()
        s_std = datetime.fromisoformat(std_row["submission_date"].replace("Z", ""))
        d_std = datetime.fromisoformat(std_row["target_deadline"].replace("Z", ""))
        std_diff = (d_std - s_std).total_seconds() / 3600.0

        cursor.execute("SELECT submission_date, target_deadline FROM grievances WHERE case_id = ?", (acc_case_id,))
        acc_row = cursor.fetchone()
        s_acc = datetime.fromisoformat(acc_row["submission_date"].replace("Z", ""))
        d_acc = datetime.fromisoformat(acc_row["target_deadline"].replace("Z", ""))
        acc_diff = (d_acc - s_acc).total_seconds() / 60.0

        assert std_diff >= 12.0  # Standard SLA hours
        assert 14.0 <= acc_diff <= 16.0  # 15 minutes for demo accelerator

def test_public_tracking_anonymization(client):
    """Phase 2, 12 & 14: Public case tracking protects private reporter data."""
    # Create grievance as citizen
    headers, citizen = login_as(client, "citizen@civicfix.gov")
    res = client.post("/api/grievances", headers=headers, json={
        "title": "Private Citizen Noise Complaint",
        "category": "Illegal Garbage Dumping",
        "locality": "Residential Court",
        "description": "Unauthorized refuse dumping behind alleyway requiring clearance."
    })
    case_id = res.get_json()["case_id"]

    # Query public unauthenticated tracking endpoint
    res_pub = client.get(f"/api/grievances/track/{case_id}")
    assert res_pub.status_code == 200
    pub_case = res_pub.get_json()["case"]
    assert pub_case["case_id"] == case_id
    assert pub_case["locality"] == "Residential Court"
    assert "citizen_email" not in pub_case
    assert pub_case.get("citizen_name") != citizen["name"]  # Anonymized to 'Verified Citizen'
