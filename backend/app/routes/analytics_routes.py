from datetime import datetime, timezone
from flask import Blueprint, request, jsonify, g
from app.database import get_db
from app.auth import login_required, roles_required
from app.engine import calculate_case_risk, parse_iso_datetime

analytics_bp = Blueprint("analytics", __name__, url_prefix="/api/analytics")

@analytics_bp.route("/overview", methods=["GET"])
def get_analytics_overview():
    """
    Returns high-level platform statistics calculated from the SQLite database.
    Filters: department_id, date_from, date_to
    """
    dept_id = request.args.get("department_id")

    with get_db() as conn:
        cursor = conn.cursor()

        query_base = "FROM grievances g WHERE 1=1"
        params = []
        if dept_id:
            query_base += " AND g.department_id = ?"
            params.append(int(dept_id))

        # 1. Total counts
        cursor.execute(f"SELECT COUNT(*) as total {query_base}", params)
        total = cursor.fetchone()["total"]

        cursor.execute(f"SELECT COUNT(*) as resolved {query_base} AND g.status IN ('Resolved', 'Closed')", params)
        resolved = cursor.fetchone()["resolved"]

        cursor.execute(f"SELECT COUNT(*) as open_cases {query_base} AND g.status NOT IN ('Resolved', 'Closed')", params)
        open_cases = cursor.fetchone()["open_cases"]

        cursor.execute(f"SELECT COUNT(*) as reopened {query_base} AND g.reopen_count > 0", params)
        reopened = cursor.fetchone()["reopened"]

        # 2. Risk breakdown across active cases
        cursor.execute(f"""
            SELECT g.id, g.case_id, g.title, g.submission_date, g.target_deadline,
                   g.priority, g.status, g.reassignment_count, g.reopen_count,
                   g.assigned_officer_id
            {query_base} AND g.status NOT IN ('Resolved', 'Closed')
        """, params)
        active_rows = cursor.fetchall()

        overdue_count = 0
        at_risk_count = 0
        on_track_count = 0

        # Pre-fetch officer workloads
        cursor.execute("""
            SELECT assigned_officer_id, COUNT(*) as cnt
            FROM grievances
            WHERE status NOT IN ('Resolved', 'Closed') AND assigned_officer_id IS NOT NULL
            GROUP BY assigned_officer_id
        """)
        workload_map = {r["assigned_officer_id"]: r["cnt"] for r in cursor.fetchall()}

        now_dt = datetime.now(timezone.utc)
        for r in active_rows:
            workload = workload_map.get(r["assigned_officer_id"], 0)
            risk = calculate_case_risk(dict(r), officer_active_case_count=workload, current_time=now_dt)
            if risk["risk_level"] == "OVERDUE":
                overdue_count += 1
            elif risk["risk_level"] == "AT_RISK":
                at_risk_count += 1
            else:
                on_track_count += 1

        # 3. Average Resolution Time (in hours)
        cursor.execute(f"""
            SELECT g.submission_date, g.resolved_at
            {query_base} AND g.status IN ('Resolved', 'Closed') AND g.resolved_at IS NOT NULL
        """, params)
        resolved_rows = cursor.fetchall()
        avg_resolution_hours = 0.0
        if resolved_rows:
            durations = []
            for r in resolved_rows:
                s_dt = parse_iso_datetime(r["submission_date"])
                r_dt = parse_iso_datetime(r["resolved_at"])
                dur = (r_dt - s_dt).total_seconds() / 3600.0
                if dur >= 0:
                    durations.append(dur)
            if durations:
                avg_resolution_hours = round(sum(durations) / len(durations), 1)

        resolution_rate = round((resolved / total * 100), 1) if total > 0 else 0.0

        return jsonify({
            "total_grievances": total,
            "open_grievances": open_cases,
            "resolved_grievances": resolved,
            "overdue_grievances": overdue_count,
            "at_risk_grievances": at_risk_count,
            "on_track_grievances": on_track_count,
            "reopened_grievances": reopened,
            "avg_resolution_hours": avg_resolution_hours,
            "resolution_rate": resolution_rate
        }), 200

@analytics_bp.route("/by-category", methods=["GET"])
def get_by_category():
    dept_id = request.args.get("department_id")
    with get_db() as conn:
        cursor = conn.cursor()
        query = """
            SELECT category,
                   COUNT(*) as total,
                   SUM(CASE WHEN status IN ('Resolved', 'Closed') THEN 1 ELSE 0 END) as resolved,
                   SUM(CASE WHEN status NOT IN ('Resolved', 'Closed') THEN 1 ELSE 0 END) as active
            FROM grievances
            WHERE 1=1
        """
        params = []
        if dept_id:
            query += " AND department_id = ?"
            params.append(int(dept_id))

        query += " GROUP BY category ORDER BY total DESC"
        cursor.execute(query, params)
        rows = [dict(r) for r in cursor.fetchall()]
        return jsonify({"categories": rows}), 200

@analytics_bp.route("/by-status", methods=["GET"])
def get_by_status():
    dept_id = request.args.get("department_id")
    with get_db() as conn:
        cursor = conn.cursor()
        query = "SELECT status, COUNT(*) as count FROM grievances WHERE 1=1"
        params = []
        if dept_id:
            query += " AND department_id = ?"
            params.append(int(dept_id))
        query += " GROUP BY status"
        cursor.execute(query, params)
        rows = [dict(r) for r in cursor.fetchall()]
        return jsonify({"statuses": rows}), 200

@analytics_bp.route("/department-workload", methods=["GET"])
@login_required
@roles_required("manager", "admin")
def get_department_workload():
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT d.id, d.name, d.code,
                   COUNT(g.id) as total_cases,
                   SUM(CASE WHEN g.status NOT IN ('Resolved', 'Closed') THEN 1 ELSE 0 END) as active_cases,
                   SUM(CASE WHEN g.status IN ('Resolved', 'Closed') THEN 1 ELSE 0 END) as resolved_cases,
                   COUNT(DISTINCT u.id) as officer_count
            FROM departments d
            LEFT JOIN grievances g ON d.id = g.department_id
            LEFT JOIN users u ON d.id = u.department_id AND u.role = 'officer'
            GROUP BY d.id, d.name, d.code
            ORDER BY active_cases DESC
        """)
        rows = [dict(r) for r in cursor.fetchall()]
        return jsonify({"departments": rows}), 200

@analytics_bp.route("/trends", methods=["GET"])
def get_trends():
    """Returns day-by-day submission and resolution trends for charts."""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT SUBSTR(submission_date, 1, 10) as date_val,
                   COUNT(*) as submitted_count,
                   SUM(CASE WHEN status IN ('Resolved', 'Closed') THEN 1 ELSE 0 END) as resolved_count
            FROM grievances
            WHERE submission_date IS NOT NULL
            GROUP BY SUBSTR(submission_date, 1, 10)
            ORDER BY date_val ASC
            LIMIT 30
        """)
        rows = [dict(r) for r in cursor.fetchall()]
        return jsonify({"trends": rows}), 200

@analytics_bp.route("/risk-queue", methods=["GET"])
@login_required
@roles_required("manager", "admin")
def get_risk_queue():
    """
    Returns grievances flagged as At Risk or Overdue, complete with
    assigned officer contact and intervention reasons.
    """
    user = g.current_user
    dept_id = request.args.get("department_id") or (user.get("department_id") if user["role"] == "manager" else None)

    with get_db() as conn:
        cursor = conn.cursor()

        query = """
            SELECT g.*, d.name as department_name, d.code as department_code,
                   u_off.name as assigned_officer_name, u_off.badge_number as officer_badge
            FROM grievances g
            JOIN departments d ON g.department_id = d.id
            LEFT JOIN users u_off ON g.assigned_officer_id = u_off.id
            WHERE g.status NOT IN ('Resolved', 'Closed')
        """
        params = []
        if dept_id:
            query += " AND g.department_id = ?"
            params.append(int(dept_id))

        cursor.execute(query, params)
        rows = cursor.fetchall()

        # Workload calculation
        cursor.execute("""
            SELECT assigned_officer_id, COUNT(*) as cnt
            FROM grievances
            WHERE status NOT IN ('Resolved', 'Closed') AND assigned_officer_id IS NOT NULL
            GROUP BY assigned_officer_id
        """)
        workload_map = {r["assigned_officer_id"]: r["cnt"] for r in cursor.fetchall()}

        risk_queue = []
        now_dt = datetime.now(timezone.utc)
        for r in rows:
            case = dict(r)
            workload = workload_map.get(case.get("assigned_officer_id"), 0)
            risk = calculate_case_risk(case, officer_active_case_count=workload, current_time=now_dt)
            case["risk_analysis"] = risk

            if risk["risk_level"] in ("AT_RISK", "OVERDUE") or risk["needs_manager_intervention"]:
                risk_queue.append(case)

        # Sort priority: Overdue first, then by risk score descending
        risk_queue.sort(key=lambda c: (1 if c["risk_analysis"]["risk_level"] == "OVERDUE" else 0, c["risk_analysis"]["risk_score"]), reverse=True)

        return jsonify({"queue": risk_queue, "count": len(risk_queue)}), 200
