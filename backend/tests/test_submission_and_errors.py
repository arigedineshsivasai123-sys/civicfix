"""
tests/test_submission_and_errors.py
====================================
Comprehensive tests for grievance submission:
- Successful submission (JSON & multipart FormData)
- Missing required fields validation
- Location coordinate bounds and format validation
- Optional evidence upload & invalid attachment types
- SLA accelerator (demo_short_deadline) calculation
- Cross-database notification deduplication
"""

import io
import os
import sys
import pytest
from datetime import datetime, timezone, timedelta

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import create_app
from seed_data import seed_database
from app.database import get_db
from app.routes.grievance_routes import create_notification


@pytest.fixture(scope="module")
def app():
    application = create_app()
    application.config["TESTING"] = True
    seed_database(force_reset=True)
    return application


@pytest.fixture(scope="module")
def client(app):
    return app.test_client()


@pytest.fixture(scope="module")
def citizen_token(client):
    resp = client.post(
        "/api/auth/login",
        json={"email": "citizen@civicfix.gov", "password": "CivicFix2026!"},
        headers={"Content-Type": "application/json"},
    )
    assert resp.status_code == 200
    data = resp.get_json()
    return data["token"]


# ── 1. Successful Submission Tests ───────────────────────────────────────────

def test_successful_grievance_submission_json(client, citizen_token):
    payload = {
        "title": "Severe Water Main Rupture",
        "category": "Broken Water Main / Pipeline Leak",
        "locality": "Maple Street Block 4",
        "description": "Continuous high-pressure water leaking onto the sidewalk and roadway for over 6 hours.",
        "priority": "High"
    }
    resp = client.post(
        "/api/grievances",
        json=payload,
        headers={"Authorization": f"Bearer {citizen_token}", "Content-Type": "application/json"}
    )
    assert resp.status_code == 201
    data = resp.get_json()
    assert "case_id" in data
    assert "tracking_id" in data
    assert "id" in data
    assert data["case_id"].startswith("CF-")
    assert data["tracking_id"] == data["case_id"]
    assert isinstance(data["id"], int)
    assert data["status"] in ("Submitted", "Acknowledged")
    assert "target_deadline" in data

    # Verify database persistence
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM grievances WHERE case_id = ?", (data["case_id"],))
        row = cursor.fetchone()
        assert row is not None
        assert row["title"] == payload["title"]
        assert row["locality"] == payload["locality"]

        # Verify audit history
        cursor.execute("SELECT * FROM case_history WHERE case_id = ?", (data["case_id"],))
        history = cursor.fetchall()
        assert len(history) >= 1
        assert any(h["action"] == "CREATED" for h in history)

        # Verify notifications
        cursor.execute("SELECT * FROM notifications WHERE case_id = ?", (data["case_id"],))
        notifs = cursor.fetchall()
        assert len(notifs) >= 1


def test_successful_grievance_submission_form_data_with_location(client, citizen_token):
    form_data = {
        "title": "Damaged Stormwater Manhole Cover",
        "category": "Potholes & Asphalt Damage",
        "locality": "Central Avenue",
        "street_or_landmark": "Near Central Metro Gate 2",
        "location_source": "gps",
        "location_confirmed": "true",
        "latitude": "17.441234",
        "longitude": "78.381234",
        "location_accuracy_m": "8.5",
        "priority": "Medium",
        "description": "The heavy iron manhole cover is cracked and rocking dangerously under traffic wheels."
    }
    resp = client.post(
        "/api/grievances",
        data=form_data,
        headers={"Authorization": f"Bearer {citizen_token}"}
    )
    assert resp.status_code == 201
    data = resp.get_json()
    assert data["case_id"].startswith("CF-")

    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM grievances WHERE case_id = ?", (data["case_id"],))
        row = cursor.fetchone()
        assert row is not None
        assert abs(row["latitude"] - 17.441234) < 0.0001
        assert abs(row["longitude"] - 78.381234) < 0.0001
        assert row["location_source"] == "gps"
        assert row["location_confirmed"] == 1


def test_successful_submission_with_optional_evidence(client, citizen_token):
    img_data = b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15c4"
    form_data = {
        "title": "Overflowing Dumpster in Residential Lane",
        "category": "Overflowing Garbage Dumpster",
        "locality": "Sunset Heights Lane 3",
        "description": "Garbage has not been collected for three days and is spilling onto the street.",
        "priority": "Medium",
        "attachment": (io.BytesIO(img_data), "pothole_photo.png")
    }
    resp = client.post(
        "/api/grievances",
        data=form_data,
        headers={"Authorization": f"Bearer {citizen_token}"},
        content_type="multipart/form-data"
    )
    assert resp.status_code == 201
    data = resp.get_json()
    case_id = data["case_id"]

    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM attachments WHERE case_id = ?", (case_id,))
        att = cursor.fetchone()
        assert att is not None
        assert att["file_name"] == "pothole_photo.png"
        assert att["file_purpose"] == "citizen_evidence"


# ── 2. Validation Error Tests ────────────────────────────────────────────────

def test_missing_title_returns_400(client, citizen_token):
    resp = client.post(
        "/api/grievances",
        json={
            "title": "   ",
            "category": "Potholes & Asphalt Damage",
            "locality": "Sector 4",
            "description": "This is a detailed description of the road problem exceeding 15 chars."
        },
        headers={"Authorization": f"Bearer {citizen_token}"}
    )
    assert resp.status_code == 400
    data = resp.get_json()
    assert "error" in data
    assert "title" in data["error"].lower()


def test_short_description_returns_400(client, citizen_token):
    resp = client.post(
        "/api/grievances",
        json={
            "title": "Pothole on Main Road",
            "category": "Potholes & Asphalt Damage",
            "locality": "Sector 4",
            "description": "Too short"
        },
        headers={"Authorization": f"Bearer {citizen_token}"}
    )
    assert resp.status_code == 400
    data = resp.get_json()
    assert "error" in data
    assert "description" in data["error"].lower()


def test_missing_locality_returns_400(client, citizen_token):
    resp = client.post(
        "/api/grievances",
        json={
            "title": "Pothole on Main Road",
            "category": "Potholes & Asphalt Damage",
            "locality": "",
            "description": "This is a detailed description of the road problem exceeding 15 chars."
        },
        headers={"Authorization": f"Bearer {citizen_token}"}
    )
    assert resp.status_code == 400
    data = resp.get_json()
    assert "error" in data
    assert "locality" in data["error"].lower()


def test_missing_category_returns_400(client, citizen_token):
    resp = client.post(
        "/api/grievances",
        json={
            "title": "Pothole on Main Road",
            "category": "",
            "locality": "Sector 4",
            "description": "This is a detailed description of the road problem exceeding 15 chars."
        },
        headers={"Authorization": f"Bearer {citizen_token}"}
    )
    assert resp.status_code == 400
    data = resp.get_json()
    assert "error" in data
    assert "category" in data["error"].lower()


def test_invalid_location_coordinates(client, citizen_token):
    base_payload = {
        "title": "Pothole on Main Road",
        "category": "Potholes & Asphalt Damage",
        "locality": "Sector 4",
        "description": "This is a detailed description of the road problem exceeding 15 chars."
    }

    # Latitude out of bounds
    resp = client.post("/api/grievances", json={**base_payload, "latitude": "95.0", "longitude": "78.0"},
                       headers={"Authorization": f"Bearer {citizen_token}"})
    assert resp.status_code == 400
    assert "latitude" in resp.get_json()["error"].lower()

    # Longitude out of bounds
    resp = client.post("/api/grievances", json={**base_payload, "latitude": "17.0", "longitude": "-195.0"},
                       headers={"Authorization": f"Bearer {citizen_token}"})
    assert resp.status_code == 400
    assert "longitude" in resp.get_json()["error"].lower()

    # Non-numeric coordinate
    resp = client.post("/api/grievances", json={**base_payload, "latitude": "invalid", "longitude": "78.0"},
                       headers={"Authorization": f"Bearer {citizen_token}"})
    assert resp.status_code == 400
    assert "invalid" in resp.get_json()["error"].lower()

    # Latitude provided without longitude
    resp = client.post("/api/grievances", json={**base_payload, "latitude": "17.0"},
                       headers={"Authorization": f"Bearer {citizen_token}"})
    assert resp.status_code == 400
    assert "longitude" in resp.get_json()["error"].lower()


def test_invalid_attachment_extension_rejected(client, citizen_token):
    bad_file = (io.BytesIO(b"echo 'malicious'"), "script.sh")
    resp = client.post(
        "/api/grievances",
        data={
            "title": "Streetlight Not Working",
            "category": "Dark / Faulty Streetlights",
            "locality": "Pine Street",
            "description": "Entire block of streetlights is dead and dark at night.",
            "attachment": bad_file
        },
        headers={"Authorization": f"Bearer {citizen_token}"},
        content_type="multipart/form-data"
    )
    assert resp.status_code == 400
    data = resp.get_json()
    assert "invalid attachment" in data["error"].lower()


# ── 3. SLA Accelerator Calculation Test ──────────────────────────────────────

def test_demo_short_deadline_accelerator(client, citizen_token):
    resp = client.post(
        "/api/grievances",
        json={
            "title": "Urgent Water Pipeline Burst",
            "category": "Broken Water Main / Pipeline Leak",
            "locality": "Market Square",
            "description": "Massive pipeline burst flooding the market entrance immediately.",
            "priority": "Urgent",
            "demo_short_deadline": True
        },
        headers={"Authorization": f"Bearer {citizen_token}"}
    )
    assert resp.status_code == 201
    data = resp.get_json()
    deadline_str = data["target_deadline"]
    deadline_dt = datetime.strptime(deadline_str, "%Y-%m-%d %H:%M:%S").replace(tzinfo=timezone.utc)
    now_dt = datetime.now(timezone.utc)
    diff_minutes = (deadline_dt - now_dt).total_seconds() / 60
    # Should be approximately 15 minutes in the future
    assert 10 <= diff_minutes <= 20


# ── 4. Cross-DB Notification Deduplication Test ─────────────────────────────

def test_notification_deduplication_cross_db():
    with get_db() as conn:
        cursor = conn.cursor()
        # Seed test user
        cursor.execute("SELECT id FROM users LIMIT 1")
        user_row = cursor.fetchone()
        user_id = user_row["id"]
        test_case = "CF-TEST-NOTIF"

        # First call inserts notification
        create_notification(conn, user_id=user_id, case_id=test_case, title="Test Notification", message="Msg 1")
        cursor.execute("SELECT id FROM notifications WHERE case_id = ?", (test_case,))
        count1 = len(cursor.fetchall())
        assert count1 == 1

        # Immediate second identical call is deduplicated
        create_notification(conn, user_id=user_id, case_id=test_case, title="Test Notification", message="Msg 1")
        cursor.execute("SELECT id FROM notifications WHERE case_id = ?", (test_case,))
        count2 = len(cursor.fetchall())
        assert count2 == 1, "Duplicate notification should not have been created"
