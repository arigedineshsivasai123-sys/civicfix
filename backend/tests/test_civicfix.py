import os
import sys
import pytest
from datetime import datetime, timedelta, timezone

# Ensure backend directory is in path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import create_app
from app.database import init_db, get_db
from app.engine import calculate_case_risk
from app.duplicate_detector import compute_similarity, check_duplicate_grievance
from seed_data import seed_database

@pytest.fixture(scope="module")
def client():
    app = create_app()
    app.config["TESTING"] = True
    seed_database(force_reset=True)  # always start from a known clean state in tests
    with app.test_client() as test_client:
        yield test_client

def test_health_check(client):
    res = client.get("/api/health")
    assert res.status_code == 200
    data = res.get_json()
    assert data["status"] == "healthy"
    assert "CivicFix" in data["service"]

def test_auth_login_and_role_access(client):
    # 1. Citizen login
    res = client.post("/api/auth/login", json={
        "email": "citizen@civicfix.gov",
        "password": "CivicFix2026!"
    })
    assert res.status_code == 200
    data = res.get_json()
    citizen_token = data["token"]
    assert data["user"]["role"] == "citizen"

    # 2. Check profile
    profile_res = client.get("/api/auth/me", headers={"Authorization": f"Bearer {citizen_token}"})
    assert profile_res.status_code == 200
    assert profile_res.get_json()["user"]["email"] == "citizen@civicfix.gov"

    # 3. Citizen trying to access admin route should receive 403 Forbidden
    admin_access_res = client.get("/api/admin/users", headers={"Authorization": f"Bearer {citizen_token}"})
    assert admin_access_res.status_code == 403

def test_admin_access(client):
    res = client.post("/api/auth/login", json={
        "email": "admin@civicfix.gov",
        "password": "CivicFix2026!"
    })
    assert res.status_code == 200
    admin_token = res.get_json()["token"]

    users_res = client.get("/api/admin/users", headers={"Authorization": f"Bearer {admin_token}"})
    assert users_res.status_code == 200
    assert len(users_res.get_json()["users"]) > 0

def test_early_warning_engine_risk_levels():
    now = datetime.now(timezone.utc)

    # 1. Overdue case
    overdue_case = {
        "status": "In Progress",
        "submission_date": (now - timedelta(hours=48)).strftime("%Y-%m-%d %H:%M:%S"),
        "target_deadline": (now - timedelta(hours=5)).strftime("%Y-%m-%d %H:%M:%S"),
        "priority": "High",
        "reassignment_count": 0,
        "reopen_count": 0
    }
    risk = calculate_case_risk(overdue_case, officer_active_case_count=2, current_time=now)
    assert risk["risk_level"] == "OVERDUE"
    assert risk["badge_color"] == "red"
    assert risk["needs_manager_intervention"] is True
    assert "exceeded deadline" in risk["explanation"]

    # 2. At-risk case (deadline in 2 hours with overloaded officer)
    at_risk_case = {
        "status": "In Progress",
        "submission_date": (now - timedelta(hours=22)).strftime("%Y-%m-%d %H:%M:%S"),
        "target_deadline": (now + timedelta(hours=2)).strftime("%Y-%m-%d %H:%M:%S"),
        "priority": "Urgent",
        "reassignment_count": 2,
        "reopen_count": 0
    }
    risk2 = calculate_case_risk(at_risk_case, officer_active_case_count=9, current_time=now)
    assert risk2["risk_level"] in ("AT_RISK", "OVERDUE")
    assert risk2["needs_manager_intervention"] is True
    assert len(risk2["risk_reasons"]) >= 3

    # 3. On-track case
    on_track_case = {
        "status": "In Progress",
        "submission_date": now.strftime("%Y-%m-%d %H:%M:%S"),
        "target_deadline": (now + timedelta(hours=40)).strftime("%Y-%m-%d %H:%M:%S"),
        "priority": "Low",
        "reassignment_count": 0,
        "reopen_count": 0
    }
    risk3 = calculate_case_risk(on_track_case, officer_active_case_count=1, current_time=now)
    assert risk3["risk_level"] == "ON_TRACK"
    assert risk3["badge_color"] == "green"
    assert risk3["needs_manager_intervention"] is False

def test_duplicate_intelligence():
    # Test semantic text comparison
    score1 = compute_similarity(
        "Broken water main on Oak Avenue flooding street",
        "Oak Avenue water leak flooding pedestrian sidewalks"
    )
    assert score1 >= 0.45

    # Test distinct complaints don't trigger high duplicate match
    score2 = compute_similarity(
        "Pothole on High Street",
        "Streetlight broken in West Park"
    )
    assert score2 < 0.25

    # Check detector query against seeded data
    matches = check_duplicate_grievance(
        category="Broken Water Main / Pipeline Leak",
        locality="Oak Avenue North",
        title="Water burst on Oak Ave",
        description="Water main broken outside Oak Avenue pavement"
    )
    assert len(matches) > 0
    assert any("Oak" in m["locality"] or "Oak" in m["title"] for m in matches)

def test_status_transitions_and_resolution_requirements(client):
    # Officer login
    res = client.post("/api/auth/login", json={
        "email": "officer.roads@civicfix.gov",
        "password": "CivicFix2026!"
    })
    token = res.get_json()["token"]

    # Try invalid status jump from In Progress straight to Closed on officer's assigned case
    res_invalid = client.patch(
        "/api/grievances/CF-2026-1001/status",
        headers={"Authorization": f"Bearer {token}"},
        json={"status": "Closed"}
    )
    assert res_invalid.status_code == 400
    assert "Invalid status transition" in res_invalid.get_json()["error"]

    # Resolution attempt without note should fail
    res_no_note = client.post(
        "/api/grievances/CF-2026-1001/resolve",
        headers={"Authorization": f"Bearer {token}"},
        json={"resolution_note": ""}
    )
    assert res_no_note.status_code == 400
    assert "mandatory" in res_no_note.get_json()["error"].lower()

def test_reopen_workflow(client):
    # Citizen login
    res = client.post("/api/auth/login", json={
        "email": "citizen@civicfix.gov",
        "password": "CivicFix2026!"
    })
    token = res.get_json()["token"]

    # CF-2026-1013 is a resolved case reported by this citizen
    res_reopen = client.post(
        "/api/grievances/CF-2026-1013/reopen",
        headers={"Authorization": f"Bearer {token}"},
        json={"reopen_reason": "The acoustic signal still fails to activate during rush hour periods."}
    )
    assert res_reopen.status_code == 200
    data = res_reopen.get_json()
    assert data["status"] == "Reopened"
    assert data["reopen_count"] >= 1
