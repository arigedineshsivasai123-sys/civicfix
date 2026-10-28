import os
import random
import uuid
from datetime import datetime, timedelta, timezone
from flask import Blueprint, request, jsonify, g, current_app
from werkzeug.utils import secure_filename

from app.database import get_db
from app.auth import login_required, roles_required, get_current_user
from app.engine import calculate_case_risk, parse_iso_datetime
from app.duplicate_detector import check_duplicate_grievance

grievances_bp = Blueprint("grievances", __name__, url_prefix="/api/grievances")

VALID_TRANSITIONS = {
    "Submitted": ["Acknowledged", "In Progress"],
    "Acknowledged": ["In Progress", "Awaiting Information"],
    "In Progress": ["Awaiting Information", "Resolved"],
    "Awaiting Information": ["In Progress", "Resolved"],
    "Resolved": ["Closed", "Reopened"],
    "Reopened": ["In Progress", "Acknowledged", "Resolved"],
    "Closed": ["Reopened"] # Under administrative or exceptional citizen review
}

ALLOWED_EXTENSIONS = {"png", "jpg", "jpeg", "pdf", "webp", "doc", "docx"}

def allowed_file(filename):
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS

def generate_case_id():
    year = datetime.now(timezone.utc).year
    rand_num = random.randint(1000, 9999)
    return f"CF-{year}-{rand_num}"

def record_audit(conn, case_id: str, actor_id: int, actor_name: str, actor_role: str, action: str, old_value=None, new_value=None, notes=None):
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO case_history (case_id, actor_id, actor_name, actor_role, action, old_value, new_value, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    """, (case_id, actor_id, actor_name, actor_role, action, old_value, new_value, notes))

def create_notification(conn, user_id: int, case_id: str, title: str, message: str, notif_type: str = "info"):
    cursor = conn.cursor()
    # Deduplication check: prevent identical notification creation within 5 minutes or unread state
    cursor.execute("""
        SELECT id FROM notifications
        WHERE user_id = ? AND case_id = ? AND title = ? AND message = ?
        AND (is_read = 0 OR created_at >= datetime('now', '-5 minutes'))
        LIMIT 1
    """, (user_id, case_id, title, message))
    if cursor.fetchone():
        return  # Prevent duplicate notification creation

    cursor.execute("""
        INSERT INTO notifications (user_id, case_id, related_grievance_id, title, message, type, is_read)
        VALUES (?, ?, ?, ?, ?, ?, 0)
    """, (user_id, case_id, case_id, title, message, notif_type))

def get_officer_active_workload(conn, officer_id: int) -> int:
    if not officer_id:
        return 0
    cursor = conn.cursor()
    cursor.execute("""
        SELECT COUNT(*) as count FROM grievances
        WHERE assigned_officer_id = ? AND status NOT IN ('Resolved', 'Closed')
    """, (officer_id,))
    row = cursor.fetchone()
    return row["count"] if row else 0

# --- 1. Public Case Tracking (No personal details exposed) ---
@grievances_bp.route("/track/<case_id>", methods=["GET"])
def track_case(case_id):
    case_id = case_id.strip().upper()
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT g.id, g.case_id, g.title, g.description, g.category, g.locality,
                   g.priority, g.status, g.submission_date, g.target_deadline,
                   g.resolved_at, g.resolution_note, g.reopen_count, g.reassignment_count,
                   g.citizen_support_count,
                   d.name as department_name, d.code as department_code,
                   u_off.name as assigned_officer_name, u_off.badge_number as officer_badge
            FROM grievances g
            JOIN departments d ON g.department_id = d.id
            LEFT JOIN users u_off ON g.assigned_officer_id = u_off.id
            WHERE g.case_id = ?
        """, (case_id,))
        row = cursor.fetchone()
        if not row:
            return jsonify({"error": f"Case ID '{case_id}' was not found in the public registry."}), 404

        case = dict(row)
        workload = get_officer_active_workload(conn, case.get("assigned_officer_id"))
        risk = calculate_case_risk(case, officer_active_case_count=workload)
        case["risk_analysis"] = risk

        # Get timeline history (sanitized, no internal sensitive user info)
        cursor.execute("""
            SELECT action, actor_role, old_value, new_value, notes, created_at
            FROM case_history
            WHERE case_id = ?
            ORDER BY created_at ASC
        """, (case_id,))
        history = [dict(h) for h in cursor.fetchall()]
        case["history"] = history

        # Get attachments that are public/proof
        cursor.execute("""
            SELECT id, file_name, file_path, file_purpose, created_at
            FROM attachments
            WHERE case_id = ?
        """, (case_id,))
        case["attachments"] = [dict(a) for a in cursor.fetchall()]

        return jsonify({"case": case}), 200

# --- 2. Check Duplicates Before Submission ---
@grievances_bp.route("/check-duplicates", methods=["POST"])
def check_duplicates():
    data = request.get_json() or {}
    category = data.get("category", "")
    locality = data.get("locality", "")
    title = data.get("title", "")
    description = data.get("description", "")

    # Optional coordinates for geo-proximity enhanced matching
    latitude = None
    longitude = None
    try:
        if data.get("latitude") not in (None, ""):
            latitude = float(data["latitude"])
        if data.get("longitude") not in (None, ""):
            longitude = float(data["longitude"])
    except (ValueError, TypeError):
        pass

    if not category or not description:
        return jsonify({"duplicates": []}), 200

    matches = check_duplicate_grievance(
        category=category,
        locality=locality,
        title=title,
        description=description,
        latitude=latitude,
        longitude=longitude
    )
    return jsonify({"duplicates": matches, "count": len(matches)}), 200

# --- 3. Submit New Grievance (Citizen or logged in user) ---
@grievances_bp.route("", methods=["POST"])
@login_required
def create_grievance():
    user = g.current_user
    data = request.form.to_dict() if request.form else (request.get_json() or {})

    title = (data.get("title") or "").strip()
    description = (data.get("description") or "").strip()
    category = (data.get("category") or "").strip()
    locality = (data.get("locality") or "").strip()
    priority = data.get("priority", "Medium")
    raw_demo = data.get("demo_short_deadline", False)
    demo_short_deadline = raw_demo in (True, "true", "True", 1, "1")

    # --- Location fields (all optional except locality) ---
    street_or_landmark = (data.get("street_or_landmark") or "").strip()
    location_source = (data.get("location_source") or "manual").strip()
    if location_source not in ("gps", "map_pin", "manual"):
        location_source = "manual"
    raw_confirmed = data.get("location_confirmed", False)
    location_confirmed = 1 if raw_confirmed in (True, "true", "True", 1, "1") else 0

    latitude = None
    longitude = None
    location_accuracy_m = None

    raw_lat = data.get("latitude")
    raw_lon = data.get("longitude")
    raw_acc = data.get("location_accuracy_m")

    if raw_lat not in (None, "", "null") and raw_lon not in (None, "", "null"):
        try:
            latitude = float(raw_lat)
            longitude = float(raw_lon)
            if not (-90 <= latitude <= 90):
                return jsonify({"error": "Latitude must be between -90 and 90."}), 400
            if not (-180 <= longitude <= 180):
                return jsonify({"error": "Longitude must be between -180 and 180."}), 400
        except (ValueError, TypeError):
            return jsonify({"error": "Invalid latitude or longitude value."}), 400

    if raw_acc not in (None, "", "null"):
        try:
            location_accuracy_m = float(raw_acc)
        except (ValueError, TypeError):
            location_accuracy_m = None

    if not title or len(title) < 5:
        return jsonify({"error": "A descriptive title (at least 5 characters) is required."}), 400

    if not description or len(description) < 15:
        return jsonify({"error": "A detailed description (at least 15 characters) is required to process the grievance."}), 400

    if not category:
        return jsonify({"error": "A valid grievance category must be selected."}), 400

    if not locality or len(locality) < 2:
        return jsonify({"error": "A valid locality or neighborhood landmark is required."}), 400

    with get_db() as conn:
        cursor = conn.cursor()
        
        # Look up category and department
        cursor.execute("""
            SELECT c.department_id, c.sla_hours, c.default_priority, d.default_sla_hours
            FROM categories c
            JOIN departments d ON c.department_id = d.id
            WHERE c.name = ?
        """, (category,))
        cat_row = cursor.fetchone()

        if cat_row:
            dept_id = cat_row["department_id"]
            sla_hours = cat_row["sla_hours"] or cat_row["default_sla_hours"] or 48
            if not priority or priority not in ("Low", "Medium", "High", "Urgent"):
                priority = cat_row["default_priority"] or "Medium"
        else:
            # Fallback to first department
            cursor.execute("SELECT id, default_sla_hours FROM departments LIMIT 1")
            d_row = cursor.fetchone()
            dept_id = d_row["id"] if d_row else 1
            sla_hours = 48

        # Calculate deadline (demo mode allows 30-minute deadline for instant live testing)
        now_dt = datetime.now(timezone.utc)
        if demo_short_deadline:
            deadline_dt = now_dt + timedelta(minutes=15)
        else:
            # Priority adjustment
            if priority == "Urgent":
                sla_hours = max(sla_hours // 3, 12)
            elif priority == "High":
                sla_hours = max(int(sla_hours * 0.6), 24)
            deadline_dt = now_dt + timedelta(hours=sla_hours)

        case_id = generate_case_id()
        # Verify unique case ID
        while True:
            cursor.execute("SELECT id FROM grievances WHERE case_id = ?", (case_id,))
            if not cursor.fetchone():
                break
            case_id = generate_case_id()

        # Auto-assignment to officer in department with lowest workload
        cursor.execute("""
            SELECT u.id, COUNT(g.id) as active_cases
            FROM users u
            LEFT JOIN grievances g ON u.id = g.assigned_officer_id AND g.status NOT IN ('Resolved', 'Closed')
            WHERE u.role = 'officer' AND u.department_id = ?
            GROUP BY u.id
            ORDER BY active_cases ASC
            LIMIT 1
        """, (dept_id,))
        officer_match = cursor.fetchone()
        assigned_officer_id = officer_match["id"] if officer_match else None
        initial_status = "Acknowledged" if assigned_officer_id else "Submitted"

        submission_str = now_dt.strftime("%Y-%m-%d %H:%M:%S")
        deadline_str = deadline_dt.strftime("%Y-%m-%d %H:%M:%S")

        cursor.execute("""
            INSERT INTO grievances (
                case_id, title, description, category, department_id, locality,
                citizen_id, assigned_officer_id, priority, status,
                submission_date, target_deadline, updated_at,
                latitude, longitude, location_accuracy_m,
                location_source, location_confirmed, street_or_landmark
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            case_id, title, description, category, dept_id, locality,
            user["id"], assigned_officer_id, priority, initial_status,
            submission_str, deadline_str, submission_str,
            latitude, longitude, location_accuracy_m,
            location_source, location_confirmed, street_or_landmark
        ))

        # Record Audit Trail
        loc_note = f"Grievance reported in {locality}."
        if latitude and longitude:
            loc_note += f" GPS/Map coordinates: ({latitude:.6f}, {longitude:.6f}), source: {location_source}."
        loc_note += f" SLA Target: {sla_hours} hours."

        record_audit(
            conn,
            case_id=case_id,
            actor_id=user["id"],
            actor_name=user["name"],
            actor_role=user["role"],
            action="CREATED",
            new_value=f"Status: {initial_status}, Priority: {priority}",
            notes=loc_note
        )

        if assigned_officer_id:
            record_audit(
                conn,
                case_id=case_id,
                actor_id=None,
                actor_name="CivicFix Auto-Router",
                actor_role="system",
                action="ASSIGNED",
                new_value=f"Officer ID {assigned_officer_id}",
                notes="Automatically assigned to departmental officer based on workload balancing."
            )
            # Notify officer
            create_notification(
                conn,
                user_id=assigned_officer_id,
                case_id=case_id,
                title="New Case Assignment",
                message=f"You have been assigned case {case_id}: '{title}' in {locality}.",
                notif_type="info"
            )

        # Notify citizen
        create_notification(
            conn,
            user_id=user["id"],
            case_id=case_id,
            title="Grievance Registered",
            message=f"Your complaint has been logged under ID {case_id}. Tracking is now active.",
            notif_type="success"
        )

        # Handle attachment if uploaded
        if "attachment" in request.files:
            file = request.files["attachment"]
            if file and file.filename and allowed_file(file.filename):
                safe_name = secure_filename(file.filename)
                unique_name = f"{case_id}_{uuid.uuid4().hex[:6]}_{safe_name}"
                upload_folder = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "uploads")
                os.makedirs(upload_folder, exist_ok=True)
                file_dest = os.path.join(upload_folder, unique_name)
                file.save(file_dest)

                file_size = os.path.getsize(file_dest)
                file_url = f"/uploads/{unique_name}"
                cursor.execute("""
                    INSERT INTO attachments (case_id, uploader_id, file_name, file_path, file_size, mime_type, file_purpose)
                    VALUES (?, ?, ?, ?, ?, ?, 'citizen_evidence')
                """, (case_id, user["id"], safe_name, file_url, file_size, file.content_type or "application/octet-stream"))

    return jsonify({
        "message": "Grievance successfully filed.",
        "case_id": case_id,
        "status": initial_status,
        "target_deadline": deadline_str
    }), 201

# --- 4. Support Existing Grievance (Duplicate linking) ---
@grievances_bp.route("/<case_id>/support", methods=["POST"])
@login_required
def support_grievance(case_id):
    user = g.current_user
    case_id = case_id.strip().upper()

    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT id, citizen_support_count, title FROM grievances WHERE case_id = ?", (case_id,))
        case = cursor.fetchone()
        if not case:
            return jsonify({"error": f"Case '{case_id}' not found."}), 404

        # Check if citizen already supported or submitted
        cursor.execute("SELECT id FROM issue_links WHERE primary_case_id = ? AND citizen_id = ?", (case_id, user["id"]))
        if cursor.fetchone():
            return jsonify({"error": "You have already joined and supported this grievance."}), 400

        # Increment support count
        cursor.execute("""
            UPDATE grievances
            SET citizen_support_count = citizen_support_count + 1, updated_at = CURRENT_TIMESTAMP
            WHERE case_id = ?
        """, (case_id,))

        cursor.execute("""
            INSERT INTO issue_links (primary_case_id, citizen_id, note)
            VALUES (?, ?, 'Citizen added co-signature / verification support to existing issue')
        """, (case_id, user["id"]))

        record_audit(
            conn,
            case_id=case_id,
            actor_id=user["id"],
            actor_name=user["name"],
            actor_role="citizen",
            action="LINKED_DUPLICATE",
            new_value=f"Support count: {case['citizen_support_count'] + 1}",
            notes=f"Citizen {user['name']} corroborated this issue as directly affecting them."
        )

        create_notification(
            conn,
            user_id=user["id"],
            case_id=case_id,
            title="Joined Active Grievance",
            message=f"You are now tracking {case_id}: '{case['title']}'. You will receive resolution updates.",
            notif_type="info"
        )

        return jsonify({
            "message": f"Successfully joined case {case_id}. The public support count has been increased.",
            "citizen_support_count": case["citizen_support_count"] + 1
        }), 200

# --- 5. List Grievances with Role Enforcement & Rich Filtering ---
@grievances_bp.route("", methods=["GET"])
@login_required
def list_grievances():
    user = g.current_user
    status_filter = request.args.get("status")
    priority_filter = request.args.get("priority")
    category_filter = request.args.get("category")
    department_id_filter = request.args.get("department_id")
    risk_filter = request.args.get("risk_level")
    search_query = request.args.get("q", "").strip()

    with get_db() as conn:
        cursor = conn.cursor()

        query = """
            SELECT g.*, d.name as department_name, d.code as department_code,
                   u_cit.name as citizen_name, u_cit.email as citizen_email,
                   u_off.name as assigned_officer_name, u_off.badge_number as officer_badge
            FROM grievances g
            JOIN departments d ON g.department_id = d.id
            JOIN users u_cit ON g.citizen_id = u_cit.id
            LEFT JOIN users u_off ON g.assigned_officer_id = u_off.id
            WHERE 1=1
        """
        params = []

        # Role-based restriction
        if user["role"] == "citizen":
            query += " AND (g.citizen_id = ? OR g.case_id IN (SELECT primary_case_id FROM issue_links WHERE citizen_id = ?))"
            params.extend([user["id"], user["id"]])
        elif user["role"] == "officer":
            # Officers see cases assigned to them or unassigned in their department
            query += " AND (g.assigned_officer_id = ? OR (g.department_id = ? AND g.assigned_officer_id IS NULL))"
            params.extend([user["id"], user["department_id"] or 0])
        elif user["role"] == "manager":
            # Managers see all cases in their department
            if user.get("department_id"):
                query += " AND g.department_id = ?"
                params.append(user["department_id"])
        # Admins see all cases

        # Applied filters
        if status_filter:
            query += " AND g.status = ?"
            params.append(status_filter)
        if priority_filter:
            query += " AND g.priority = ?"
            params.append(priority_filter)
        if category_filter:
            query += " AND g.category = ?"
            params.append(category_filter)
        if department_id_filter:
            query += " AND g.department_id = ?"
            params.append(int(department_id_filter))
        if search_query:
            query += " AND (g.case_id LIKE ? OR g.title LIKE ? OR g.locality LIKE ? OR g.description LIKE ?)"
            s_param = f"%{search_query}%"
            params.extend([s_param, s_param, s_param, s_param])

        query += " ORDER BY g.submission_date DESC"

        cursor.execute(query, params)
        rows = cursor.fetchall()

        cases = []
        for r in rows:
            case = dict(r)
            # Remove private citizen email if viewing user is not admin/manager
            if user["role"] == "citizen" and case["citizen_id"] != user["id"]:
                case["citizen_name"] = "Fellow Citizen"
                case["citizen_email"] = ""

            workload = get_officer_active_workload(conn, case.get("assigned_officer_id"))
            risk = calculate_case_risk(case, officer_active_case_count=workload)
            case["risk_analysis"] = risk

            if not risk_filter or risk["risk_level"].lower() == risk_filter.lower():
                cases.append(case)

        return jsonify({"grievances": cases, "total": len(cases)}), 200

# --- 6. Single Case Details with History & Attachments ---
@grievances_bp.route("/<case_id>", methods=["GET"])
@login_required
def get_grievance_detail(case_id):
    user = g.current_user
    case_id = case_id.strip().upper()

    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT g.*, d.name as department_name, d.code as department_code,
                   u_cit.name as citizen_name, u_cit.email as citizen_email,
                   u_off.name as assigned_officer_name, u_off.badge_number as officer_badge
            FROM grievances g
            JOIN departments d ON g.department_id = d.id
            JOIN users u_cit ON g.citizen_id = u_cit.id
            LEFT JOIN users u_off ON g.assigned_officer_id = u_off.id
            WHERE g.case_id = ?
        """, (case_id,))
        row = cursor.fetchone()
        if not row:
            return jsonify({"error": f"Case '{case_id}' not found."}), 404

        case = dict(row)

        # Verify permissions
        if user["role"] == "citizen" and case["citizen_id"] != user["id"]:
            # Check if linked as supporter
            cursor.execute("SELECT id FROM issue_links WHERE primary_case_id = ? AND citizen_id = ?", (case_id, user["id"]))
            if not cursor.fetchone():
                return jsonify({"error": "You do not have permission to view private details of this case."}), 403

        if user["role"] == "officer":
            # Officers can only view cases assigned to them or unassigned in their department
            if case["assigned_officer_id"] != user["id"] and (case["department_id"] != user.get("department_id") or case["assigned_officer_id"] is not None):
                return jsonify({"error": "Access denied. You do not have permission to view this case."}), 403

        if user["role"] == "manager":
            # Department managers can only access cases in their department
            if user.get("department_id") and case["department_id"] != user["department_id"]:
                return jsonify({"error": "Access denied. Case belongs to another department."}), 403

        workload = get_officer_active_workload(conn, case.get("assigned_officer_id"))
        risk = calculate_case_risk(case, officer_active_case_count=workload)
        case["risk_analysis"] = risk

        # Audit History
        cursor.execute("""
            SELECT id, case_id, actor_name, actor_role, action, old_value, new_value, notes, created_at
            FROM case_history
            WHERE case_id = ?
            ORDER BY created_at ASC
        """, (case_id,))
        case["history"] = [dict(h) for h in cursor.fetchall()]

        # Attachments
        cursor.execute("""
            SELECT a.id, a.case_id, a.file_name, a.file_path, a.file_size, a.mime_type, a.file_purpose, a.created_at,
                   u.name as uploader_name
            FROM attachments a
            JOIN users u ON a.uploader_id = u.id
            WHERE a.case_id = ?
            ORDER BY a.created_at DESC
        """, (case_id,))
        case["attachments"] = [dict(a) for a in cursor.fetchall()]

        return jsonify({"case": case}), 200

# --- 7. Status Update / Transition Enforcement ---
@grievances_bp.route("/<case_id>/status", methods=["PATCH"])
@login_required
def update_status(case_id):
    user = g.current_user
    case_id = case_id.strip().upper()
    data = request.get_json() or {}
    new_status = data.get("status")
    note = data.get("note", "").strip()

    if not new_status:
        return jsonify({"error": "New status must be provided."}), 400

    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM grievances WHERE case_id = ?", (case_id,))
        case = cursor.fetchone()
        if not case:
            return jsonify({"error": f"Case '{case_id}' not found."}), 404

        current_status = case["status"]

        # Permission check
        if user["role"] == "citizen":
            return jsonify({"error": "Citizens cannot arbitrarily advance officer workflow status."}), 403

        if user["role"] == "officer" and case["assigned_officer_id"] != user["id"]:
            return jsonify({"error": "You are not the assigned officer for this case."}), 403

        if user["role"] == "manager" and user.get("department_id") and case["department_id"] != user["department_id"]:
            return jsonify({"error": "Case belongs to another department."}), 403

        # Validate allowed transition
        allowed = VALID_TRANSITIONS.get(current_status, [])
        if new_status not in allowed and user["role"] != "admin":
            return jsonify({
                "error": f"Invalid status transition from '{current_status}' to '{new_status}'. Allowed next states: {', '.join(allowed) if allowed else 'None'}."
            }), 400

        # Enforce resolution note requirement
        if new_status == "Resolved" and not note:
            return jsonify({
                "error": "A mandatory resolution note detailing action taken is required to mark a grievance as Resolved."
            }), 400

        # Update grievance
        update_fields = ["status = ?", "updated_at = CURRENT_TIMESTAMP"]
        update_vals = [new_status]

        if new_status == "Resolved":
            update_fields.extend(["resolved_at = CURRENT_TIMESTAMP", "resolution_note = ?"])
            update_vals.append(note)

        update_vals.append(case_id)
        cursor.execute(f"UPDATE grievances SET {', '.join(update_fields)} WHERE case_id = ?", update_vals)

        # Record Audit
        record_audit(
            conn,
            case_id=case_id,
            actor_id=user["id"],
            actor_name=user["name"],
            actor_role=user["role"],
            action="STATUS_CHANGE",
            old_value=current_status,
            new_value=new_status,
            notes=note or f"Status shifted to {new_status}"
        )

        # Notify citizen
        create_notification(
            conn,
            user_id=case["citizen_id"],
            case_id=case_id,
            title=f"Status Update: {new_status}",
            message=f"Case {case_id} has moved to '{new_status}'. {note}",
            notif_type="success" if new_status == "Resolved" else "info"
        )

        return jsonify({
            "message": f"Case {case_id} status updated to {new_status}.",
            "status": new_status
        }), 200

# --- 8. Resolve Grievance with Proof of Resolution (Officer / Manager) ---
@grievances_bp.route("/<case_id>/resolve", methods=["POST"])
@login_required
@roles_required("officer", "manager", "admin")
def resolve_grievance(case_id):
    user = g.current_user
    case_id = case_id.strip().upper()
    data = request.form.to_dict() if request.form else (request.get_json() or {})
    resolution_note = (data.get("resolution_note") or "").strip()

    if not resolution_note or len(resolution_note) < 10:
        return jsonify({"error": "A comprehensive resolution note (at least 10 characters) is mandatory to resolve a case."}), 400

    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM grievances WHERE case_id = ?", (case_id,))
        case = cursor.fetchone()
        if not case:
            return jsonify({"error": f"Case '{case_id}' not found."}), 404

        current_status = case["status"]
        if current_status in ("Resolved", "Closed"):
            return jsonify({"error": f"Case is already in '{current_status}' status."}), 400

        # Permission check: officer must be assigned, manager must be from same department
        if user["role"] == "officer" and case["assigned_officer_id"] != user["id"]:
            return jsonify({"error": "You are not the assigned officer for this case."}), 403

        if user["role"] == "manager" and user.get("department_id") and case["department_id"] != user["department_id"]:
            return jsonify({"error": "Case belongs to another department."}), 403

        # Handle resolution proof upload if provided
        evidence_url = None
        if "evidence" in request.files:
            file = request.files["evidence"]
            if file and file.filename and allowed_file(file.filename):
                safe_name = secure_filename(file.filename)
                unique_name = f"proof_{case_id}_{uuid.uuid4().hex[:6]}_{safe_name}"
                upload_folder = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "uploads")
                os.makedirs(upload_folder, exist_ok=True)
                file_dest = os.path.join(upload_folder, unique_name)
                file.save(file_dest)

                file_size = os.path.getsize(file_dest)
                evidence_url = f"/uploads/{unique_name}"
                cursor.execute("""
                    INSERT INTO attachments (case_id, uploader_id, file_name, file_path, file_size, mime_type, file_purpose)
                    VALUES (?, ?, ?, ?, ?, ?, 'resolution_proof')
                """, (case_id, user["id"], safe_name, evidence_url, file_size, file.content_type or "application/octet-stream"))

        now_str = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
        cursor.execute("""
            UPDATE grievances
            SET status = 'Resolved',
                resolved_at = ?,
                resolution_note = ?,
                resolution_evidence_url = COALESCE(?, resolution_evidence_url),
                updated_at = ?
            WHERE case_id = ?
        """, (now_str, resolution_note, evidence_url, now_str, case_id))

        record_audit(
            conn,
            case_id=case_id,
            actor_id=user["id"],
            actor_name=user["name"],
            actor_role=user["role"],
            action="RESOLVED",
            old_value=current_status,
            new_value="Resolved",
            notes=f"Resolution note: {resolution_note}" + (f" (Proof uploaded: {evidence_url})" if evidence_url else "")
        )

        create_notification(
            conn,
            user_id=case["citizen_id"],
            case_id=case_id,
            title="Grievance Resolved",
            message=f"Case {case_id} has been marked resolved: '{resolution_note}'. Please review and verify the outcome.",
            notif_type="success"
        )

        return jsonify({
            "message": f"Case {case_id} marked as Resolved.",
            "status": "Resolved",
            "resolution_evidence_url": evidence_url
        }), 200

# --- 9. Reopen / Issue Not Fixed Workflow (Citizen) ---
@grievances_bp.route("/<case_id>/reopen", methods=["POST"])
@login_required
def reopen_grievance(case_id):
    user = g.current_user
    case_id = case_id.strip().upper()
    data = request.get_json() or {}
    reopen_reason = (data.get("reopen_reason") or "").strip()

    if not reopen_reason or len(reopen_reason) < 10:
        return jsonify({"error": "A detailed justification (at least 10 characters) is required to report an issue as not fixed."}), 400

    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM grievances WHERE case_id = ?", (case_id,))
        case = cursor.fetchone()
        if not case:
            return jsonify({"error": f"Case '{case_id}' not found."}), 404

        # Enforce that only the reporter or linked supporter (or admin/manager) can reopen
        if user["role"] == "citizen" and case["citizen_id"] != user["id"]:
            cursor.execute("SELECT id FROM issue_links WHERE primary_case_id = ? AND citizen_id = ?", (case_id, user["id"]))
            if not cursor.fetchone():
                return jsonify({"error": "Only the reporting citizen or co-signers can request reopening."}), 403

        if case["status"] not in ("Resolved", "Closed"):
            return jsonify({"error": f"Only Resolved or Closed cases can be reopened. Current status: '{case['status']}'."}), 400

        now_str = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
        new_reopen_count = (case["reopen_count"] or 0) + 1

        cursor.execute("""
            UPDATE grievances
            SET status = 'Reopened',
                reopen_reason = ?,
                reopen_count = ?,
                updated_at = ?
            WHERE case_id = ?
        """, (reopen_reason, new_reopen_count, now_str, case_id))

        record_audit(
            conn,
            case_id=case_id,
            actor_id=user["id"],
            actor_name=user["name"],
            actor_role=user["role"],
            action="REOPENED",
            old_value=case["status"],
            new_value="Reopened",
            notes=f"Citizen flagged issue as not resolved: '{reopen_reason}'. Reopen incident #{new_reopen_count}."
        )

        # Notify manager and assigned officer
        if case["assigned_officer_id"]:
            create_notification(
                conn,
                user_id=case["assigned_officer_id"],
                case_id=case_id,
                title="Action Required: Case Reopened",
                message=f"Citizen has contested resolution for {case_id}: '{reopen_reason}'. Case reopened for immediate remediation.",
                notif_type="urgent"
            )

        return jsonify({
            "message": f"Case {case_id} has been reopened and queued for managerial review.",
            "status": "Reopened",
            "reopen_count": new_reopen_count
        }), 200

# --- 10. Reassign Officer (Manager & Admin) ---
@grievances_bp.route("/<case_id>/reassign", methods=["POST"])
@login_required
@roles_required("manager", "admin")
def reassign_grievance(case_id):
    user = g.current_user
    case_id = case_id.strip().upper()
    data = request.get_json() or {}
    new_officer_id = data.get("officer_id")
    reason = (data.get("reason") or "Workload rebalancing").strip()

    if not new_officer_id:
        return jsonify({"error": "Target officer_id must be provided."}), 400

    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM grievances WHERE case_id = ?", (case_id,))
        case = cursor.fetchone()
        if not case:
            return jsonify({"error": f"Case '{case_id}' not found."}), 404

        if user["role"] == "manager" and user.get("department_id") and case["department_id"] != user["department_id"]:
            return jsonify({"error": "Access denied. Case belongs to another department."}), 403

        # Verify officer exists
        cursor.execute("SELECT id, name, role, department_id FROM users WHERE id = ?", (new_officer_id,))
        officer = cursor.fetchone()
        if not officer or officer["role"] != "officer":
            return jsonify({"error": "Selected user is not an active case worker / officer."}), 400

        if user["role"] == "manager" and user.get("department_id") and officer["department_id"] != user["department_id"]:
            return jsonify({"error": "Cannot reassign to an officer from another department."}), 403

        old_officer_id = case["assigned_officer_id"]
        old_officer_name = "Unassigned"
        if old_officer_id:
            cursor.execute("SELECT name FROM users WHERE id = ?", (old_officer_id,))
            o_row = cursor.fetchone()
            if o_row:
                old_officer_name = o_row["name"]

        new_reassignment_count = (case["reassignment_count"] or 0) + 1
        now_str = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")

        cursor.execute("""
            UPDATE grievances
            SET assigned_officer_id = ?,
                reassignment_count = ?,
                status = CASE WHEN status = 'Submitted' THEN 'Acknowledged' ELSE status END,
                updated_at = ?
            WHERE case_id = ?
        """, (new_officer_id, new_reassignment_count, now_str, case_id))

        record_audit(
            conn,
            case_id=case_id,
            actor_id=user["id"],
            actor_name=user["name"],
            actor_role=user["role"],
            action="REASSIGNED",
            old_value=old_officer_name,
            new_value=officer["name"],
            notes=f"Reassigned by {user['name']}. Reason: {reason}. (Reassignment #{new_reassignment_count})"
        )

        # Notify new officer
        create_notification(
            conn,
            user_id=new_officer_id,
            case_id=case_id,
            title="Case Transferred to You",
            message=f"Case {case_id} was reassigned to you by Manager {user['name']}. Priority: {case['priority']}.",
            notif_type="info"
        )

        # Notify previous officer if exists and different
        if old_officer_id and old_officer_id != new_officer_id:
            create_notification(
                conn,
                user_id=old_officer_id,
                case_id=case_id,
                title="Case Reassigned Away",
                message=f"Case {case_id} was transferred from your queue to {officer['name']} by Manager {user['name']}. Reason: {reason}.",
                notif_type="info"
            )

        # Recalculate active caseloads for both officers
        old_workload = get_officer_active_workload(conn, old_officer_id) if old_officer_id else 0
        new_workload = get_officer_active_workload(conn, new_officer_id)

        return jsonify({
            "message": f"Case {case_id} successfully reassigned to {officer['name']}.",
            "case_id": case_id,
            "assigned_officer_id": new_officer_id,
            "assigned_officer_name": officer["name"],
            "previous_officer_id": old_officer_id,
            "previous_officer_name": old_officer_name,
            "reassignment_count": new_reassignment_count,
            "old_officer_active_cases": old_workload,
            "new_officer_active_cases": new_workload
        }), 200

# --- 11. Add Progress Note / Request Information ---
@grievances_bp.route("/<case_id>/notes", methods=["POST"])
@login_required
@roles_required("officer", "manager", "admin")
def add_case_note(case_id):
    user = g.current_user
    case_id = case_id.strip().upper()
    data = request.get_json() or {}
    note = (data.get("note") or "").strip()
    is_info_request = data.get("is_info_request", False)

    if not note:
        return jsonify({"error": "Note text cannot be empty."}), 400

    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM grievances WHERE case_id = ?", (case_id,))
        case = cursor.fetchone()
        if not case:
            return jsonify({"error": f"Case '{case_id}' not found."}), 404

        if user["role"] == "officer" and case["assigned_officer_id"] != user["id"]:
            return jsonify({"error": "You are not the assigned officer for this case."}), 403

        if user["role"] == "manager" and user.get("department_id") and case["department_id"] != user["department_id"]:
            return jsonify({"error": "Case belongs to another department."}), 403

        action = "INFO_REQUESTED" if is_info_request else "NOTE_ADDED"
        if is_info_request:
            cursor.execute("""
                UPDATE grievances
                SET status = 'Awaiting Information', updated_at = CURRENT_TIMESTAMP
                WHERE case_id = ?
            """, (case_id,))

        record_audit(
            conn,
            case_id=case_id,
            actor_id=user["id"],
            actor_name=user["name"],
            actor_role=user["role"],
            action=action,
            notes=note
        )

        if is_info_request:
            create_notification(
                conn,
                user_id=case["citizen_id"],
                case_id=case_id,
                title="Action Required: Information Requested",
                message=f"The assigned department has requested clarification on case {case_id}: '{note}'",
                notif_type="warning"
            )

        return jsonify({"message": "Case record updated successfully."}), 200

# --- 12. Poll for recent updates (Manager / Admin auto-refresh) ---
@grievances_bp.route("/since", methods=["GET"])
@login_required
@roles_required("manager", "admin", "officer")
def list_grievances_since():
    """
    Returns case IDs and updated_at timestamps for cases updated since a given ISO timestamp.
    Used by the Manager dashboard to detect new cases without full re-fetch.
    Example: GET /api/grievances/since?since=2026-10-28T04:00:00
    """
    user = g.current_user
    since_ts = request.args.get("since", "")

    with get_db() as conn:
        cursor = conn.cursor()
        query = """
            SELECT g.case_id, g.updated_at, g.status, g.assigned_officer_id
            FROM grievances g
            WHERE 1=1
        """
        params = []

        if user["role"] == "manager" and user.get("department_id"):
            query += " AND g.department_id = ?"
            params.append(user["department_id"])
        elif user["role"] == "officer":
            query += " AND (g.assigned_officer_id = ? OR (g.department_id = ? AND g.assigned_officer_id IS NULL))"
            params.extend([user["id"], user.get("department_id") or 0])

        if since_ts:
            query += " AND g.updated_at > ?"
            params.append(since_ts)

        query += " ORDER BY g.updated_at DESC LIMIT 50"
        cursor.execute(query, params)
        rows = [dict(r) for r in cursor.fetchall()]

        return jsonify({
            "updated_cases": rows,
            "count": len(rows),
            "checked_at": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
        }), 200
