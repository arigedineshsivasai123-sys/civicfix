from flask import Blueprint, request, jsonify, g
from app.database import get_db
from app.auth import hash_password, verify_password, create_session, revoke_session, get_session_token, login_required

auth_bp = Blueprint("auth", __name__, url_prefix="/api/auth")

@auth_bp.route("/register", methods=["POST"])
def register():
    data = request.get_json() or {}
    name = (data.get("name") or "").strip()
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""

    if not name or not email or not password:
        return jsonify({"error": "Name, email, and password are required."}), 400

    if len(password) < 6:
        return jsonify({"error": "Password must be at least 6 characters long."}), 400

    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT id FROM users WHERE email = ?", (email,))
        if cursor.fetchone():
            return jsonify({"error": "An account with this email already exists."}), 409

        hashed = hash_password(password)
        cursor.execute("""
            INSERT INTO users (name, email, password_hash, role)
            VALUES (?, ?, ?, 'citizen')
        """, (name, email, hashed))
        new_user_id = cursor.lastrowid

    token = create_session(new_user_id, "citizen")
    return jsonify({
        "message": "Citizen account successfully created.",
        "token": token,
        "user": {
            "id": new_user_id,
            "name": name,
            "email": email,
            "role": "citizen"
        }
    }), 201

@auth_bp.route("/login", methods=["POST"])
def login():
    data = request.get_json() or {}
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""

    if not email or not password:
        return jsonify({"error": "Email and password are required."}), 400

    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT u.id, u.name, u.email, u.password_hash, u.role, u.department_id, u.badge_number,
                   d.name as department_name, d.code as department_code
            FROM users u
            LEFT JOIN departments d ON u.department_id = d.id
            WHERE u.email = ?
        """, (email,))
        user_row = cursor.fetchone()

        if not user_row or not verify_password(password, user_row["password_hash"]):
            return jsonify({"error": "Invalid email or password credentials."}), 401

        user = dict(user_row)
        del user["password_hash"]

    token = create_session(user["id"], user["role"])
    return jsonify({
        "message": "Signed in successfully.",
        "token": token,
        "user": user
    }), 200

@auth_bp.route("/me", methods=["GET"])
@login_required
def get_profile():
    return jsonify({"user": g.current_user}), 200

@auth_bp.route("/logout", methods=["POST"])
def logout():
    token = get_session_token()
    if token:
        revoke_session(token)
    return jsonify({"message": "Successfully logged out."}), 200

@auth_bp.route("/demo-users", methods=["GET"])
def get_demo_users():
    """Returns public demo accounts list with designated roles for hackathon evaluation."""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT u.id, u.name, u.email, u.role, u.badge_number, d.name as department_name
            FROM users u
            LEFT JOIN departments d ON u.department_id = d.id
            ORDER BY u.role, u.id
        """)
        users = [dict(r) for r in cursor.fetchall()]
        return jsonify({"demo_users": users}), 200
