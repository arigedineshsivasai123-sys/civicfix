from flask import Blueprint, request, jsonify, g
from app.database import get_db
from app.auth import login_required

notification_bp = Blueprint("notifications", __name__, url_prefix="/api/notifications")

@notification_bp.route("", methods=["GET"])
@login_required
def get_notifications():
    """
    List notifications belonging strictly to the authenticated user.
    Supports query parameter: filter = 'all' | 'unread' (default 'all')
    """
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

        query += " ORDER BY created_at DESC LIMIT 100"

        cursor.execute(query, params)
        notifications = [dict(r) for r in cursor.fetchall()]

        # Query total unread count for authenticated user
        cursor.execute("SELECT COUNT(*) as unread FROM notifications WHERE user_id = ? AND is_read = 0", (user["id"],))
        unread_count = cursor.fetchone()["unread"]

        # Total notifications count
        cursor.execute("SELECT COUNT(*) as total FROM notifications WHERE user_id = ?", (user["id"],))
        total_count = cursor.fetchone()["total"]

        return jsonify({
            "notifications": notifications,
            "unread_count": unread_count,
            "total_count": total_count,
            "filter": filter_mode
        }), 200

@notification_bp.route("/<int:notification_id>/read", methods=["PATCH", "POST"])
@login_required
def mark_single_notification_read(notification_id):
    """
    Marks a single notification as read.
    Enforces strict ownership: users can only modify their own notifications.
    """
    user = g.current_user

    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM notifications WHERE id = ?", (notification_id,))
        notif = cursor.fetchone()

        if not notif:
            return jsonify({"error": f"Notification #{notification_id} was not found."}), 404

        # Strict security ownership check
        if notif["user_id"] != user["id"]:
            return jsonify({
                "error": "Forbidden. You cannot modify notifications belonging to another user."
            }), 403

        # Mark as read with persistent timestamp
        cursor.execute("""
            UPDATE notifications
            SET is_read = 1, read_at = CURRENT_TIMESTAMP
            WHERE id = ?
        """, (notification_id,))

        # Query updated notification record
        cursor.execute("""
            SELECT id, user_id, case_id, COALESCE(related_grievance_id, case_id) as related_grievance_id,
                   title, message, type, is_read, created_at, read_at
            FROM notifications
            WHERE id = ?
        """, (notification_id,))
        updated_notif = dict(cursor.fetchone())

        # Recalculate remaining unread count
        cursor.execute("SELECT COUNT(*) as unread FROM notifications WHERE user_id = ? AND is_read = 0", (user["id"],))
        unread_count = cursor.fetchone()["unread"]

        return jsonify({
            "message": "Notification marked as read.",
            "notification": updated_notif,
            "unread_count": unread_count
        }), 200

@notification_bp.route("/mark-all-read", methods=["POST"])
@login_required
def mark_all_notifications_read():
    """
    Marks all unread notifications belonging strictly to the authenticated user as read.
    Other users' notifications remain completely untouched.
    """
    user = g.current_user

    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            UPDATE notifications
            SET is_read = 1, read_at = CURRENT_TIMESTAMP
            WHERE user_id = ? AND is_read = 0
        """, (user["id"],))
        marked_count = cursor.rowcount

        return jsonify({
            "message": "All notifications marked as read.",
            "marked_count": marked_count,
            "unread_count": 0
        }), 200
