"""
CivicFix Authentication & Session Management
============================================
Uses token-based authentication (X-Session-Token / Bearer).

Session storage:
  • Local dev  — in-memory dict (fast, resets on restart — acceptable for dev)
  • Production — sessions table in the database so tokens survive restarts

The production sessions table is created lazily on first use.
"""
import uuid
import functools
import os
import logging
from datetime import datetime, timedelta, timezone
from flask import request, jsonify, g
from werkzeug.security import generate_password_hash, check_password_hash
from app.database import get_db, USE_POSTGRES

logger = logging.getLogger("civicfix.auth")

# ──────────────────────────────────────────────────────────────
# Password helpers
# ──────────────────────────────────────────────────────────────
def hash_password(password: str) -> str:
    return generate_password_hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return check_password_hash(hashed_password, plain_password)


# ──────────────────────────────────────────────────────────────
# Session storage
# ──────────────────────────────────────────────────────────────
# In-memory fallback (local dev / single-worker deployments)
_MEMORY_SESSIONS: dict = {}

SESSION_TTL_HOURS = 24


def _ensure_sessions_table():
    """Create the sessions table in the DB if it doesn't exist (called once)."""
    try:
        with get_db() as conn:
            if USE_POSTGRES:
                conn.execute("""
                    CREATE TABLE IF NOT EXISTS sessions (
                        token TEXT PRIMARY KEY,
                        user_id INTEGER NOT NULL,
                        role TEXT NOT NULL,
                        expires_at TIMESTAMP NOT NULL
                    )
                """)
            else:
                conn.execute("""
                    CREATE TABLE IF NOT EXISTS sessions (
                        token TEXT PRIMARY KEY,
                        user_id INTEGER NOT NULL,
                        role TEXT NOT NULL,
                        expires_at TIMESTAMP NOT NULL
                    )
                """)
    except Exception as e:
        logger.warning(f"Could not create sessions table: {e}. Falling back to in-memory sessions.")


_sessions_table_ready = False


def _ensure_once():
    global _sessions_table_ready
    if not _sessions_table_ready:
        _ensure_sessions_table()
        _sessions_table_ready = True


def create_session(user_id: int, role: str) -> str:
    token = f"cf_sess_{uuid.uuid4().hex}"
    expires_at = datetime.now(timezone.utc) + timedelta(hours=SESSION_TTL_HOURS)

    _ensure_once()
    try:
        with get_db() as conn:
            conn.execute(
                "INSERT INTO sessions (token, user_id, role, expires_at) VALUES (?, ?, ?, ?)",
                (token, user_id, role, expires_at.strftime("%Y-%m-%d %H:%M:%S")),
            )
    except Exception as e:
        logger.warning(f"DB session insert failed ({e}), using in-memory fallback.")
        _MEMORY_SESSIONS[token] = {"user_id": user_id, "role": role, "expires_at": expires_at}

    # Also keep in memory for this process (fast path)
    _MEMORY_SESSIONS[token] = {"user_id": user_id, "role": role, "expires_at": expires_at}
    return token


def revoke_session(token: str):
    _MEMORY_SESSIONS.pop(token, None)
    try:
        with get_db() as conn:
            conn.execute("DELETE FROM sessions WHERE token = ?", (token,))
    except Exception as e:
        logger.warning(f"DB session revoke failed: {e}")


def _lookup_session(token: str):
    """Return (user_id, role) or None if token is invalid/expired."""
    # Fast path: in-memory
    if token in _MEMORY_SESSIONS:
        sess = _MEMORY_SESSIONS[token]
        exp = sess["expires_at"]
        if isinstance(exp, str):
            exp = datetime.fromisoformat(exp)
        if exp.tzinfo is None:
            exp = exp.replace(tzinfo=timezone.utc)
        if datetime.now(timezone.utc) < exp:
            return sess["user_id"], sess["role"]
        else:
            _MEMORY_SESSIONS.pop(token, None)
            return None

    # Slow path: DB (multi-process / after restart)
    _ensure_once()
    try:
        with get_db() as conn:
            cur = conn.execute(
                "SELECT user_id, role, expires_at FROM sessions WHERE token = ?", (token,)
            )
            row = cur.fetchone()
            if not row:
                return None
            exp_val = row["expires_at"]
            if isinstance(exp_val, datetime):
                exp = exp_val
            elif exp_val:
                try:
                    exp = datetime.fromisoformat(str(exp_val))
                except Exception:
                    exp = None
            else:
                exp = None

            if exp:
                if exp.tzinfo is None:
                    exp = exp.replace(tzinfo=timezone.utc)
                if datetime.now(timezone.utc) >= exp:
                    return None
            # Warm the memory cache
            _MEMORY_SESSIONS[token] = {
                "user_id": row["user_id"],
                "role": row["role"],
                "expires_at": exp,
            }
            return row["user_id"], row["role"]
    except Exception as e:
        logger.warning(f"DB session lookup failed: {e}")
        return None


# ──────────────────────────────────────────────────────────────
# Request helpers
# ──────────────────────────────────────────────────────────────
def get_session_token() -> str:
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        return auth_header[7:].strip()
    token = request.headers.get("X-Session-Token")
    if token:
        return token.strip()
    return request.args.get("token", "").strip()


def get_current_user():
    token = get_session_token()
    if not token:
        return None

    result = _lookup_session(token)
    if not result:
        return None

    user_id, _ = result
    try:
        with get_db() as conn:
            cur = conn.execute("""
                SELECT u.id, u.name, u.email, u.role, u.department_id, u.badge_number, u.created_at,
                       d.name as department_name, d.code as department_code
                FROM users u
                LEFT JOIN departments d ON u.department_id = d.id
                WHERE u.id = ?
            """, (user_id,))
            row = cur.fetchone()
            if not row:
                return None
            return dict(row)
    except Exception as e:
        logger.error(f"get_current_user DB error: {e}")
        return None


# ──────────────────────────────────────────────────────────────
# Decorators
# ──────────────────────────────────────────────────────────────
def login_required(f):
    @functools.wraps(f)
    def decorated_function(*args, **kwargs):
        user = get_current_user()
        if not user:
            return jsonify({"error": "Authentication required. Please sign in."}), 401
        g.current_user = user
        return f(*args, **kwargs)
    return decorated_function


def roles_required(*allowed_roles):
    def decorator(f):
        @functools.wraps(f)
        def decorated_function(*args, **kwargs):
            user = get_current_user()
            if not user:
                return jsonify({"error": "Authentication required. Please sign in."}), 401
            if user["role"] not in allowed_roles:
                return jsonify({
                    "error": f"Access denied. Required: {', '.join(allowed_roles)}. Your role: {user['role']}"
                }), 403
            g.current_user = user
            return f(*args, **kwargs)
        return decorated_function
    return decorator
