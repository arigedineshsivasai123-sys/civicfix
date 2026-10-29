from flask import Blueprint, request, jsonify, g
from app.database import get_db
from app.auth import login_required, roles_required, hash_password

admin_bp = Blueprint("admin", __name__, url_prefix="/api/admin")

@admin_bp.route("/users", methods=["GET"])
@login_required
@roles_required("admin", "manager")
def list_users():
    role_filter = request.args.get("role")
    dept_id = request.args.get("department_id")

    with get_db() as conn:
        cursor = conn.cursor()
        query = """
            SELECT u.id, u.name, u.email, u.role, u.department_id, u.badge_number, u.created_at,
                   d.name as department_name, d.code as department_code,
                   COUNT(CASE WHEN g.status NOT IN ('Resolved', 'Closed') THEN g.id END) as active_cases_count
            FROM users u
            LEFT JOIN departments d ON u.department_id = d.id
            LEFT JOIN grievances g ON u.id = g.assigned_officer_id
            WHERE 1=1
        """
        params = []
        if role_filter:
            query += " AND u.role = ?"
            params.append(role_filter)
        if dept_id:
            query += " AND u.department_id = ?"
            params.append(int(dept_id))

        query += " GROUP BY u.id, u.name, u.email, u.role, u.department_id, u.badge_number, u.created_at, d.name, d.code ORDER BY u.role, u.name"
        cursor.execute(query, params)
        users = [dict(r) for r in cursor.fetchall()]
        return jsonify({"users": users}), 200

@admin_bp.route("/users", methods=["POST"])
@login_required
@roles_required("admin")
def create_staff_user():
    data = request.get_json() or {}
    name = (data.get("name") or "").strip()
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or "CivicFix2026!"
    role = data.get("role") or "officer"
    department_id = data.get("department_id")
    badge_number = (data.get("badge_number") or "").strip()

    if not name or not email or role not in ("officer", "manager", "admin"):
        return jsonify({"error": "Valid name, email, and staff role required."}), 400

    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT id FROM users WHERE email = ?", (email,))
        if cursor.fetchone():
            return jsonify({"error": "Email already registered."}), 409

        hashed = hash_password(password)
        cursor.execute("""
            INSERT INTO users (name, email, password_hash, role, department_id, badge_number)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (name, email, hashed, role, department_id, badge_number))
        new_id = cursor.lastrowid

        return jsonify({"message": f"User {name} created successfully.", "user_id": new_id}), 201

@admin_bp.route("/departments", methods=["GET"])
def get_departments():
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT d.*, COUNT(u.id) as staff_count
            FROM departments d
            LEFT JOIN users u ON d.id = u.department_id
            GROUP BY d.id
            ORDER BY d.name
        """)
        departments = [dict(r) for r in cursor.fetchall()]
        return jsonify({"departments": departments}), 200

@admin_bp.route("/categories", methods=["GET"])
def get_categories():
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT c.*, d.name as department_name, d.code as department_code
            FROM categories c
            JOIN departments d ON c.department_id = d.id
            ORDER BY c.name
        """)
        categories = [dict(r) for r in cursor.fetchall()]
        return jsonify({"categories": categories}), 200

@admin_bp.route("/categories", methods=["POST"])
@login_required
@roles_required("admin")
def create_category():
    data = request.get_json() or {}
    name = (data.get("name") or "").strip()
    department_id = data.get("department_id")
    default_priority = data.get("default_priority") or "Medium"
    try:
        sla_hours = int(data.get("sla_hours") or 48)
    except (ValueError, TypeError):
        return jsonify({"error": "SLA hours must be a valid integer."}), 400

    if not name or not department_id:
        return jsonify({"error": "Category name and department_id are required."}), 400

    if sla_hours <= 0 or sla_hours > 720:
        return jsonify({"error": "SLA window must be between 1 and 720 hours."}), 400

    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT id FROM categories WHERE name = ?", (name,))
        if cursor.fetchone():
            return jsonify({"error": f"Category '{name}' already exists."}), 409

        cursor.execute("""
            INSERT INTO categories (name, department_id, default_priority, sla_hours)
            VALUES (?, ?, ?, ?)
        """, (name, department_id, default_priority, sla_hours))
        new_id = cursor.lastrowid

        cursor.execute("""
            INSERT INTO case_history (case_id, actor_id, actor_name, actor_role, action, new_value, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, ("SYSTEM", g.current_user["id"], g.current_user["name"], g.current_user["role"], "CATEGORY_CREATED", name, f"Created category '{name}' with {sla_hours}h SLA"))

        return jsonify({"message": f"Category '{name}' created successfully.", "id": new_id}), 201

@admin_bp.route("/categories/<int:cat_id>", methods=["PATCH"])
@login_required
@roles_required("admin")
def update_category_sla(cat_id):
    data = request.get_json() or {}
    sla_hours = data.get("sla_hours")
    default_priority = data.get("default_priority")

    if sla_hours is None and not default_priority:
        return jsonify({"error": "No update fields provided."}), 400

    if sla_hours is not None:
        try:
            sla_val = int(sla_hours)
            if sla_val <= 0 or sla_val > 720:
                return jsonify({"error": "SLA window must be between 1 and 720 hours (30 days)."}), 400
        except (ValueError, TypeError):
            return jsonify({"error": "SLA hours must be a valid integer."}), 400

    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM categories WHERE id = ?", (cat_id,))
        cat = cursor.fetchone()
        if not cat:
            return jsonify({"error": f"Category ID {cat_id} not found."}), 404

        fields = []
        vals = []
        if sla_hours is not None:
            fields.append("sla_hours = ?")
            vals.append(int(sla_hours))
        if default_priority:
            fields.append("default_priority = ?")
            vals.append(default_priority)

        vals.append(cat_id)
        cursor.execute(f"UPDATE categories SET {', '.join(fields)} WHERE id = ?", vals)

        # Record admin configuration change in audit trail
        cursor.execute("""
            INSERT INTO case_history (case_id, actor_id, actor_name, actor_role, action, old_value, new_value, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            "SYSTEM",
            g.current_user["id"],
            g.current_user["name"],
            g.current_user["role"],
            "CATEGORY_SLA_MODIFIED",
            f"{cat['sla_hours']}h",
            f"{sla_hours}h" if sla_hours else str(cat['sla_hours']),
            f"Admin {g.current_user['name']} modified SLA for category '{cat['name']}'"
        ))

        return jsonify({"message": "Category SLA configuration updated successfully."}), 200

@admin_bp.route("/audit-logs", methods=["GET"])
@login_required
@roles_required("admin", "manager")
def get_system_audit_logs():
    limit = min(int(request.args.get("limit", 100)), 500)
    action_filter = request.args.get("action")
    case_id_filter = request.args.get("case_id")
    actor_filter = request.args.get("actor")
    role_filter = request.args.get("role")
    q = request.args.get("q")

    with get_db() as conn:
        cursor = conn.cursor()
        query = "SELECT * FROM case_history WHERE 1=1"
        params = []
        if action_filter:
            query += " AND action = ?"
            params.append(action_filter)
        if case_id_filter:
            query += " AND case_id LIKE ?"
            params.append(f"%{case_id_filter}%")
        if actor_filter:
            query += " AND actor_name LIKE ?"
            params.append(f"%{actor_filter}%")
        if role_filter:
            query += " AND actor_role = ?"
            params.append(role_filter)
        if q:
            query += " AND (case_id LIKE ? OR actor_name LIKE ? OR action LIKE ? OR notes LIKE ?)"
            q_param = f"%{q}%"
            params.extend([q_param, q_param, q_param, q_param])

        query += " ORDER BY created_at DESC LIMIT ?"
        params.append(limit)

        cursor.execute(query, params)
        logs = [dict(r) for r in cursor.fetchall()]
        return jsonify({"audit_logs": logs, "count": len(logs)}), 200

@admin_bp.route("/notifications", methods=["GET"])
@login_required
def get_user_notifications():
    user = g.current_user
    filter_mode = request.args.get("filter", "all").lower()
    with get_db() as conn:
        cursor = conn.cursor()
        query = """
            SELECT id, user_id, case_id, COALESCE(related_grievance_id, case_id) as related_grievance_id,
                   title, message, type, is_read, created_at, read_at
            FROM notifications
            WHERE user_id = ?
        """
        params = [user["id"]]
        if filter_mode == "unread":
            query += " AND is_read = 0"
        query += " ORDER BY created_at DESC LIMIT 50"
        cursor.execute(query, params)
        rows = [dict(r) for r in cursor.fetchall()]

        cursor.execute("SELECT COUNT(*) as unread FROM notifications WHERE user_id = ? AND is_read = 0", (user["id"],))
        unread_count = cursor.fetchone()["unread"]

        return jsonify({"notifications": rows, "unread_count": unread_count}), 200

@admin_bp.route("/notifications/mark-read", methods=["POST"])
@login_required
def mark_notifications_read():
    user = g.current_user
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            UPDATE notifications
            SET is_read = 1, read_at = CURRENT_TIMESTAMP
            WHERE user_id = ? AND is_read = 0
        """, (user["id"],))
        marked_count = cursor.rowcount
        return jsonify({"message": "All notifications marked as read.", "marked_count": marked_count, "unread_count": 0}), 200

@admin_bp.route("/seed-demo", methods=["POST"])
def trigger_seed_demo():
    """Trigger safe demo seeding if database is empty (idempotent, never resets)."""
    try:
        from seed_data import seed_database
        seed_database(force_reset=False)
        return jsonify({"status": "ok", "message": "Demo data checked/seeded safely."}), 200
    except Exception as exc:
        return jsonify({"status": "error", "error": str(exc)}), 500
