from datetime import datetime, timezone

"""
CivicFix Early-Warning and Accountability Engine
Problem Statement ID: HACK-P423

This engine evaluates public grievance SLA compliance, officer capacity constraints,
and structural friction points (reassignments, bottlenecks) to compute explainable
risk scores, urgency statuses, and managerial escalation flags.

Formula & Rules:
1. Deadlines & Elapsed Time:
   - If current_time > target_deadline and status not in ('Resolved', 'Closed'):
     Status: 'Overdue' (RED)
   - If time_remaining <= 0.25 * total_duration (or <= 6 hours in standard mode):
     Status: 'At Risk' (AMBER)
   - If time_remaining > 0.25 * total_duration:
     Status: 'On Track' (GREEN)

2. Multipliers / Risk Amplifiers:
   - Priority level (Urgent: +40, High: +25, Medium: +10, Low: +0)
   - Officer Workload: if officer has > 5 active cases (+20), > 8 cases (+35)
   - Reassignment Count: >= 2 reassignments indicates bouncing/friction (+25)
   - Reopen Count: reopened complaint demands immediate oversight (+30)

3. Managerial Intervention Required (Flag = True):
   - Overdue cases
   - Any case with risk_score >= 65
   - Reassigned 2 or more times
   - Reopened case pending resolution
   - High/Urgent priority at risk with overloaded officer
"""

def parse_iso_datetime(dt_str: str) -> datetime:
    if not dt_str:
        return datetime.now(timezone.utc)
    try:
        # Handle formats like "2026-10-27 15:30:00", "2026-10-27T15:30:00Z", etc.
        cleaned = dt_str.replace("Z", "+00:00")
        if " " in cleaned and "+" not in cleaned:
            return datetime.fromisoformat(cleaned).replace(tzinfo=timezone.utc)
        return datetime.fromisoformat(cleaned)
    except Exception:
        try:
            return datetime.strptime(dt_str[:19], "%Y-%m-%d %H:%M:%S").replace(tzinfo=timezone.utc)
        except Exception:
            return datetime.now(timezone.utc)

def calculate_case_risk(case_data: dict, officer_active_case_count: int = 0, current_time: datetime = None) -> dict:
    """
    Evaluates an individual grievance record and returns:
    - risk_level: 'ON_TRACK' | 'AT_RISK' | 'OVERDUE' | 'RESOLVED'
    - risk_score: 0 to 100
    - badge_color: 'green' | 'amber' | 'red' | 'blue'
    - time_remaining_seconds: float
    - time_remaining_formatted: str
    - needs_manager_intervention: bool
    - risk_reasons: list of str (explainable rationale)
    - explanation: str
    """
    if current_time is None:
        current_time = datetime.now(timezone.utc)

    status = case_data.get("status", "Submitted")
    if status in ("Resolved", "Closed"):
        return {
            "risk_level": "RESOLVED",
            "risk_score": 0,
            "badge_color": "green",
            "time_remaining_seconds": 0,
            "time_remaining_formatted": "Completed",
            "needs_manager_intervention": False,
            "risk_reasons": ["Case successfully resolved/closed."],
            "explanation": f"Case has concluded with status: {status}."
        }

    submission_dt = parse_iso_datetime(case_data.get("submission_date"))
    deadline_dt = parse_iso_datetime(case_data.get("target_deadline"))
    priority = case_data.get("priority", "Medium")
    reassignments = case_data.get("reassignment_count", 0) or 0
    reopen_count = case_data.get("reopen_count", 0) or 0

    total_window_seconds = max((deadline_dt - submission_dt).total_seconds(), 3600.0)
    remaining_seconds = (deadline_dt - current_time).total_seconds()

    risk_reasons = []
    risk_score = 0
    needs_manager_intervention = False

    # 1. Time / Deadline Check
    if remaining_seconds <= 0:
        overdue_hours = abs(remaining_seconds) / 3600.0
        risk_level = "OVERDUE"
        badge_color = "red"
        risk_score += 60
        needs_manager_intervention = True
        risk_reasons.append(f"Case exceeded deadline by {overdue_hours:.1f} hours.")
    elif remaining_seconds <= 0.30 * total_window_seconds or remaining_seconds < (6 * 3600):
        risk_level = "AT_RISK"
        badge_color = "amber"
        risk_score += 35
        remaining_hrs = remaining_seconds / 3600.0
        risk_reasons.append(f"Only {remaining_hrs:.1f} hours remain before the SLA deadline.")
    else:
        risk_level = "ON_TRACK"
        badge_color = "green"
        risk_score += 10

    # 2. Priority Multiplier
    if priority == "Urgent":
        risk_score += 30
        risk_reasons.append("Priority is Urgent; citizen impact is severe.")
    elif priority == "High":
        risk_score += 20
        risk_reasons.append("Priority is High requiring expedited inspection.")
    elif priority == "Medium":
        risk_score += 10

    # 3. Officer Capacity Friction
    if officer_active_case_count >= 8:
        risk_score += 25
        risk_reasons.append(f"Assigned officer is overburdened with {officer_active_case_count} active grievances.")
        if risk_level == "AT_RISK":
            needs_manager_intervention = True
    elif officer_active_case_count >= 5:
        risk_score += 15
        risk_reasons.append(f"Assigned officer has high workload ({officer_active_case_count} active cases).")

    # 4. Reassignment Friction
    if reassignments >= 2:
        risk_score += 25
        needs_manager_intervention = True
        risk_reasons.append(f"Case has been reassigned {reassignments} times across officers.")
    elif reassignments == 1:
        risk_score += 10
        risk_reasons.append("Case has experienced 1 previous reassignment.")

    # 5. Reopened Case Escalation
    if reopen_count > 0:
        risk_score += 30
        needs_manager_intervention = True
        risk_reasons.append(f"Citizen flagged resolution as inadequate (Reopened {reopen_count}x).")

    # Clamp score to 100
    risk_score = min(risk_score, 100)

    # Elevate risk_level if score warrants it
    if risk_score >= 70 and risk_level != "OVERDUE":
        risk_level = "AT_RISK"
        badge_color = "amber"
        needs_manager_intervention = True

    # Formatting time remaining
    if remaining_seconds <= 0:
        overdue_hrs = abs(remaining_seconds) / 3600.0
        time_remaining_formatted = f"-{overdue_hrs:.1f}h Overdue"
    else:
        hrs = int(remaining_seconds // 3600)
        mins = int((remaining_seconds % 3600) // 60)
        if hrs >= 24:
            days = hrs // 24
            rem_h = hrs % 24
            time_remaining_formatted = f"{days}d {rem_h}h left"
        else:
            time_remaining_formatted = f"{hrs}h {mins}m left"

    explanation = "; ".join(risk_reasons)

    return {
        "risk_level": risk_level,
        "risk_score": risk_score,
        "badge_color": badge_color,
        "time_remaining_seconds": remaining_seconds,
        "time_remaining_formatted": time_remaining_formatted,
        "needs_manager_intervention": needs_manager_intervention,
        "risk_reasons": risk_reasons,
        "explanation": explanation
    }
