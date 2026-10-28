import os
import sys
from datetime import datetime, timedelta, timezone

# Add backend directory to sys.path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.database import get_db, init_db
from app.auth import hash_password

def seed_database(force_reset: bool = False):
    """Seed demo data.

    Parameters
    ----------
    force_reset : bool
        When True, wipe existing data and re-seed (useful for local dev resets).
        When False (default), skip seeding if the database already contains users.
        NEVER pass force_reset=True automatically on startup.
    """
    print("Initializing database tables...")
    init_db()

    with get_db() as conn:
        cursor = conn.cursor()

        # Check if already seeded
        cursor.execute("SELECT COUNT(*) as count FROM users")
        existing_count = cursor.fetchone()["count"]

        if existing_count > 0 and not force_reset:
            print(f"Database already contains {existing_count} users. Skipping seed. "
                  "Run with force_reset=True to wipe and re-seed.")
            return

        if existing_count > 0 and force_reset:
            print("force_reset=True — clearing existing tables for a clean demo seed...")
            cursor.execute("DELETE FROM attachments")
            cursor.execute("DELETE FROM issue_links")
            cursor.execute("DELETE FROM notifications")
            cursor.execute("DELETE FROM case_history")
            cursor.execute("DELETE FROM grievances")
            cursor.execute("DELETE FROM categories")
            cursor.execute("DELETE FROM users")
            cursor.execute("DELETE FROM departments")

        print("Seeding Departments...")
        departments_data = [
            ("Roads & Infrastructure", "ROADS", "Maintenance of highways, bridges, asphalt repairs, and street signage.", 48),
            ("Water Supply & Sewage", "WATER", "Drinking water distribution, pipeline leakages, storm drains, and sewage.", 24),
            ("Waste Management & Sanitation", "SANITATION", "Municipal garbage collection, public bins, and illegal dumping.", 36),
            ("Electrical & Public Lighting", "POWER", "Streetlights, power fluctuations, hazardous exposed electrical cables.", 18),
            ("Parks & Public Spaces", "PARKS", "Recreational green zones, fallen branches, playground safety, and turf.", 72)
        ]
        dept_ids = {}
        for name, code, desc, sla in departments_data:
            cursor.execute("""
                INSERT INTO departments (name, code, description, default_sla_hours)
                VALUES (?, ?, ?, ?)
            """, (name, code, desc, sla))
            dept_ids[code] = cursor.lastrowid

        print("Seeding Categories...")
        categories_data = [
            ("Potholes & Asphalt Damage", dept_ids["ROADS"], "High", 36),
            ("Damaged Traffic Light / Signage", dept_ids["ROADS"], "Urgent", 12),
            ("Broken Water Main / Pipeline Leak", dept_ids["WATER"], "Urgent", 12),
            ("Low Water Pressure / Contamination", dept_ids["WATER"], "High", 24),
            ("Overflowing Garbage Dumpster", dept_ids["SANITATION"], "Medium", 36),
            ("Hazardous Illegal Waste Dumping", dept_ids["SANITATION"], "High", 24),
            ("Dark / Faulty Streetlights", dept_ids["POWER"], "Medium", 24),
            ("Exposed Live Electrical Cable", dept_ids["POWER"], "Urgent", 6),
            ("Dangerous Tree Branch Overhang", dept_ids["PARKS"], "Medium", 48),
            ("Broken Public Park Infrastructure", dept_ids["PARKS"], "Low", 72)
        ]
        for c_name, dept_id, priority, sla in categories_data:
            cursor.execute("""
                INSERT INTO categories (name, department_id, default_priority, sla_hours)
                VALUES (?, ?, ?, ?)
            """, (c_name, dept_id, priority, sla))

        print("Seeding Users across all 4 roles...")
        default_pwd = hash_password("CivicFix2026!")

        users_data = [
            # Admins
            ("Chief Admin Vance", "admin@civicfix.gov", default_pwd, "admin", None, "ADM-001"),
            # Managers
            ("Arthur Pendelton", "manager.roads@civicfix.gov", default_pwd, "manager", dept_ids["ROADS"], "MGR-101"),
            ("Nicole Taylor", "manager.water@civicfix.gov", default_pwd, "manager", dept_ids["WATER"], "MGR-102"),
            ("Carlos Mendez", "manager.power@civicfix.gov", default_pwd, "manager", dept_ids["POWER"], "MGR-103"),
            # Officers
            ("Inspector Sarah Vance", "officer.roads@civicfix.gov", default_pwd, "officer", dept_ids["ROADS"], "OFF-201"),
            ("Officer Thomas Kelly", "officer.roads2@civicfix.gov", default_pwd, "officer", dept_ids["ROADS"], "OFF-202"),
            ("Engineer David Miller", "officer.water@civicfix.gov", default_pwd, "officer", dept_ids["WATER"], "OFF-203"),
            ("Officer Priya Patel", "officer.power@civicfix.gov", default_pwd, "officer", dept_ids["POWER"], "OFF-204"),
            ("Officer James Wilson", "officer.sanitation@civicfix.gov", default_pwd, "officer", dept_ids["SANITATION"], "OFF-205"),
            ("Officer Maya Lin", "officer.parks@civicfix.gov", default_pwd, "officer", dept_ids["PARKS"], "OFF-206"),
            # Citizens
            ("Elena Rostova", "citizen@civicfix.gov", default_pwd, "citizen", None, None),
            ("Marcus Chen", "marcus@civicfix.gov", default_pwd, "citizen", None, None),
            ("Devon Harris", "devon@civicfix.gov", default_pwd, "citizen", None, None),
            ("Aisha Al-Mansoor", "aisha@civicfix.gov", default_pwd, "citizen", None, None)
        ]

        user_ids = {}
        for name, email, pwd, role, d_id, badge in users_data:
            cursor.execute("""
                INSERT INTO users (name, email, password_hash, role, department_id, badge_number)
                VALUES (?, ?, ?, ?, ?, ?)
            """, (name, email, pwd, role, d_id, badge))
            user_ids[email] = cursor.lastrowid

        print("Seeding 25 Grievances across all states and risk levels...")
        now = datetime.now(timezone.utc)

        grievances_data = [
            # 1. OVERDUE cases
            {
                "case_id": "CF-2026-1001",
                "title": "Massive 2-foot pothole on High Street intersection",
                "description": "Deep asphalt crater near 4th cross junction causing rim damage to vehicles and risking cyclist accidents.",
                "category": "Potholes & Asphalt Damage",
                "dept": dept_ids["ROADS"],
                "locality": "Downtown Sector 3",
                "citizen": user_ids["citizen@civicfix.gov"],
                "officer": user_ids["officer.roads@civicfix.gov"],
                "priority": "High",
                "status": "In Progress",
                "sub_offset": -72, # submitted 72 hours ago
                "dead_offset": -12, # deadline expired 12h ago
                "reassignments": 2,
                "reopens": 0,
                "support": 4
            },
            {
                "case_id": "CF-2026-1002",
                "title": "Exposed high voltage wire dangling near playground",
                "description": "Storm severed power insulation line. Live wiring is hanging 6 feet above child pedestrian pathway.",
                "category": "Exposed Live Electrical Cable",
                "dept": dept_ids["POWER"],
                "locality": "Riverside Park West",
                "citizen": user_ids["marcus@civicfix.gov"],
                "officer": user_ids["officer.power@civicfix.gov"],
                "priority": "Urgent",
                "status": "In Progress",
                "sub_offset": -18,
                "dead_offset": -6, # expired 6h ago
                "reassignments": 1,
                "reopens": 0,
                "support": 7
            },
            {
                "case_id": "CF-2026-1003",
                "title": "Severe sewage backflow entering residential basements",
                "description": "Clogged subterranean municipal sewer main pushing waste back onto driveways on 7th Avenue.",
                "category": "Broken Water Main / Pipeline Leak",
                "dept": dept_ids["WATER"],
                "locality": "Greenhill Suburb",
                "citizen": user_ids["devon@civicfix.gov"],
                "officer": user_ids["officer.water@civicfix.gov"],
                "priority": "Urgent",
                "status": "Acknowledged",
                "sub_offset": -36,
                "dead_offset": -4,
                "reassignments": 0,
                "reopens": 0,
                "support": 9
            },

            # 2. AT-RISK cases (approaching deadline)
            {
                "case_id": "CF-2026-1004",
                "title": "Broken water main flooding Pine Street sidewalk",
                "description": "Pressurized fresh water pipe burst, continuous gushing for past 10 hours creating standing water lake.",
                "category": "Broken Water Main / Pipeline Leak",
                "dept": dept_ids["WATER"],
                "locality": "Pine Valley Sector 4",
                "citizen": user_ids["citizen@civicfix.gov"],
                "officer": user_ids["officer.water@civicfix.gov"],
                "priority": "Urgent",
                "status": "In Progress",
                "sub_offset": -10,
                "dead_offset": 2, # only 2 hours left!
                "reassignments": 1,
                "reopens": 0,
                "support": 8
            },
            {
                "case_id": "CF-2026-1005",
                "title": "Traffic signals stuck on flashing red at Metro Plaza",
                "description": "Four-way gridlock during morning rush hour due to malfunctioning controller box.",
                "category": "Damaged Traffic Light / Signage",
                "dept": dept_ids["ROADS"],
                "locality": "Metro Plaza Central",
                "citizen": user_ids["aisha@civicfix.gov"],
                "officer": user_ids["officer.roads@civicfix.gov"],
                "priority": "High",
                "status": "In Progress",
                "sub_offset": -8,
                "dead_offset": 4, # 4 hours left
                "reassignments": 0,
                "reopens": 0,
                "support": 3
            },
            {
                "case_id": "CF-2026-1006",
                "title": "Commercial toxic chemical drums left behind alleyway",
                "description": "Several unmarked industrial containers discarded beside community library dumpster.",
                "category": "Hazardous Illegal Waste Dumping",
                "dept": dept_ids["SANITATION"],
                "locality": "Eastside Industrial Park",
                "citizen": user_ids["marcus@civicfix.gov"],
                "officer": user_ids["officer.sanitation@civicfix.gov"],
                "priority": "High",
                "status": "Acknowledged",
                "sub_offset": -20,
                "dead_offset": 3,
                "reassignments": 0,
                "reopens": 0,
                "support": 2
            },

            # 3. REOPENED case (Citizen flagged "Issue Not Fixed")
            {
                "case_id": "CF-2026-1007",
                "title": "Streetlight flickering and buzzing near Senior Center",
                "description": "Sodium vapor light ballast buzzes loudly and keeps cutting out completely at night.",
                "category": "Dark / Faulty Streetlights",
                "dept": dept_ids["POWER"],
                "locality": "Sunset Boulevard",
                "citizen": user_ids["citizen@civicfix.gov"],
                "officer": user_ids["officer.power@civicfix.gov"],
                "priority": "Medium",
                "status": "Reopened",
                "sub_offset": -60,
                "dead_offset": 12,
                "reassignments": 1,
                "reopens": 1,
                "reopen_reason": "Officer marked case resolved yesterday, but the lamp failed again within 2 hours. The capacitor was not replaced.",
                "support": 3
            },

            # 4. DUPLICATE pair for duplicate intelligence demonstration
            {
                "case_id": "CF-2026-1008",
                "title": "Oak Avenue water leak flooding pedestrian sidewalks",
                "description": "Continuous geyser of potable water leaking under concrete slabs outside 204 Oak Avenue.",
                "category": "Broken Water Main / Pipeline Leak",
                "dept": dept_ids["WATER"],
                "locality": "Oak Avenue North",
                "citizen": user_ids["devon@civicfix.gov"],
                "officer": user_ids["officer.water@civicfix.gov"],
                "priority": "High",
                "status": "In Progress",
                "sub_offset": -14,
                "dead_offset": 10,
                "reassignments": 0,
                "reopens": 0,
                "support": 6
            },

            # 5. ON-TRACK / Fresh cases
            {
                "case_id": "CF-2026-1009",
                "title": "Damaged guardrail on North Ridge Overpass",
                "description": "Vehicle impact bent 15 meters of protective highway railing along bridge curb.",
                "category": "Potholes & Asphalt Damage",
                "dept": dept_ids["ROADS"],
                "locality": "North Ridge Overpass",
                "citizen": user_ids["marcus@civicfix.gov"],
                "officer": user_ids["officer.roads2@civicfix.gov"],
                "priority": "Medium",
                "status": "In Progress",
                "sub_offset": -12,
                "dead_offset": 36,
                "reassignments": 0,
                "reopens": 0,
                "support": 1
            },
            {
                "case_id": "CF-2026-1010",
                "title": "Overflowing waste compactor at Market Square",
                "description": "Weekend market generated excess packaging waste; recycling bins are completely choked.",
                "category": "Overflowing Garbage Dumpster",
                "dept": dept_ids["SANITATION"],
                "locality": "Old Town Market Square",
                "citizen": user_ids["citizen@civicfix.gov"],
                "officer": user_ids["officer.sanitation@civicfix.gov"],
                "priority": "Medium",
                "status": "Acknowledged",
                "sub_offset": -6,
                "dead_offset": 30,
                "reassignments": 0,
                "reopens": 0,
                "support": 3
            },
            {
                "case_id": "CF-2026-1011",
                "title": "Large oak branch cracked over children's swing set",
                "description": "High winds cracked a 10-inch branch that is resting precariously on safety chains.",
                "category": "Dangerous Tree Branch Overhang",
                "dept": dept_ids["PARKS"],
                "locality": "Central Community Meadow",
                "citizen": user_ids["aisha@civicfix.gov"],
                "officer": user_ids["officer.parks@civicfix.gov"],
                "priority": "High",
                "status": "In Progress",
                "sub_offset": -15,
                "dead_offset": 33,
                "reassignments": 0,
                "reopens": 0,
                "support": 4
            },
            {
                "case_id": "CF-2026-1012",
                "title": "Awaiting soil test on sinkhole depression",
                "description": "Sub-surface depression noted on Maple Drive. Awaiting geological survey readings.",
                "category": "Potholes & Asphalt Damage",
                "dept": dept_ids["ROADS"],
                "locality": "Maple Drive",
                "citizen": user_ids["devon@civicfix.gov"],
                "officer": user_ids["officer.roads@civicfix.gov"],
                "priority": "Medium",
                "status": "Awaiting Information",
                "sub_offset": -22,
                "dead_offset": 26,
                "reassignments": 1,
                "reopens": 0,
                "support": 1
            },

            # 6. RESOLVED cases with verified notes
            {
                "case_id": "CF-2026-1013",
                "title": "Broken pedestrian crossing button at Elm & 5th",
                "description": "Audio signal and walk button non-functional for visually impaired citizens.",
                "category": "Damaged Traffic Light / Signage",
                "dept": dept_ids["ROADS"],
                "locality": "Elm Street & 5th Avenue",
                "citizen": user_ids["citizen@civicfix.gov"],
                "officer": user_ids["officer.roads@civicfix.gov"],
                "priority": "High",
                "status": "Resolved",
                "sub_offset": -48,
                "dead_offset": -12,
                "resolved_offset": -6,
                "resolution_note": "Replaced acoustic transducer and tactile actuator board. Push button calibrated and tested with 10 test cycles.",
                "reassignments": 0,
                "reopens": 0,
                "support": 2
            },
            {
                "case_id": "CF-2026-1014",
                "title": "Illegal construction debris dumped along riverbank",
                "description": "Two truckloads of dry concrete rubble dumped near kayak launch pier.",
                "category": "Hazardous Illegal Waste Dumping",
                "dept": dept_ids["SANITATION"],
                "locality": "Riverside Boat Landing",
                "citizen": user_ids["marcus@civicfix.gov"],
                "officer": user_ids["officer.sanitation@civicfix.gov"],
                "priority": "High",
                "status": "Resolved",
                "sub_offset": -50,
                "dead_offset": -14,
                "resolved_offset": -10,
                "resolution_note": "Sanitation crew cleared 4.8 tons of inert aggregate and transferred to licensed recycling facility. Site cordoned.",
                "reassignments": 0,
                "reopens": 0,
                "support": 5
            },
            {
                "case_id": "CF-2026-1015",
                "title": "Substation transformer humming loudly and overheating",
                "description": "Transformer unit 4B emitting excessive thermal radiation and high pitch tone.",
                "category": "Exposed Live Electrical Cable",
                "dept": dept_ids["POWER"],
                "locality": "West Industrial Grid",
                "citizen": user_ids["aisha@civicfix.gov"],
                "officer": user_ids["officer.power@civicfix.gov"],
                "priority": "Urgent",
                "status": "Resolved",
                "sub_offset": -30,
                "dead_offset": -12,
                "resolved_offset": -4,
                "resolution_note": "Emergency cooling coolant flush completed. Defective oil radiator fan replaced. Temperatures stabilized under 65C.",
                "reassignments": 0,
                "reopens": 0,
                "support": 1
            },

            # 7. CLOSED cases
            {
                "case_id": "CF-2026-1016",
                "title": "Repainting faded zebra stripes on school zone crossing",
                "description": "Crosswalk markings outside Washington Elementary have faded away completely.",
                "category": "Damaged Traffic Light / Signage",
                "dept": dept_ids["ROADS"],
                "locality": "South Avenue School District",
                "citizen": user_ids["citizen@civicfix.gov"],
                "officer": user_ids["officer.roads2@civicfix.gov"],
                "priority": "Medium",
                "status": "Closed",
                "sub_offset": -120,
                "dead_offset": -72,
                "resolved_offset": -80,
                "resolution_note": "High-durability thermoplastic reflective coating applied. School zone sign post replaced.",
                "reassignments": 0,
                "reopens": 0,
                "support": 6
            },

            # 8. Additional diverse cases to exceed 20 records
            {
                "case_id": "CF-2026-1017",
                "title": "Rusty playground slide with sharp exposed metal lip",
                "description": "Kids playground spiral slide has rusted through near bottom exit chute.",
                "category": "Broken Public Park Infrastructure",
                "dept": dept_ids["PARKS"],
                "locality": "Harbor View Park",
                "citizen": user_ids["devon@civicfix.gov"],
                "officer": user_ids["officer.parks@civicfix.gov"],
                "priority": "High",
                "status": "In Progress",
                "sub_offset": -24,
                "dead_offset": 48,
                "reassignments": 0,
                "reopens": 0,
                "support": 5
            },
            {
                "case_id": "CF-2026-1018",
                "title": "Brown discolored water from tap in Sector 9",
                "description": "Tap water running rust orange with metallic odor across 14 apartment units.",
                "category": "Low Water Pressure / Contamination",
                "dept": dept_ids["WATER"],
                "locality": "Sector 9 Block C",
                "citizen": user_ids["aisha@civicfix.gov"],
                "officer": user_ids["officer.water@civicfix.gov"],
                "priority": "High",
                "status": "In Progress",
                "sub_offset": -16,
                "dead_offset": 8,
                "reassignments": 0,
                "reopens": 0,
                "support": 14
            },
            {
                "case_id": "CF-2026-1019",
                "title": "Storm drain grate stolen on pedestrian pathway",
                "description": "Cast iron drain cover removed, leaving an open 4-foot deep drop hazard on walking path.",
                "category": "Broken Water Main / Pipeline Leak",
                "dept": dept_ids["WATER"],
                "locality": "Civic Center Pedestrian Walkway",
                "citizen": user_ids["marcus@civicfix.gov"],
                "officer": user_ids["officer.water@civicfix.gov"],
                "priority": "Urgent",
                "status": "In Progress",
                "sub_offset": -5,
                "dead_offset": 7,
                "reassignments": 1,
                "reopens": 0,
                "support": 7
            },
            {
                "case_id": "CF-2026-1020",
                "title": "Entire block of streetlights out on 12th Street",
                "description": "6 consecutive lighting poles unpowered, creating pitch black blindspot for commuters.",
                "category": "Dark / Faulty Streetlights",
                "dept": dept_ids["POWER"],
                "locality": "12th Street Corridor",
                "citizen": user_ids["citizen@civicfix.gov"],
                "officer": user_ids["officer.power@civicfix.gov"],
                "priority": "Medium",
                "status": "Acknowledged",
                "sub_offset": -10,
                "dead_offset": 14,
                "reassignments": 0,
                "reopens": 0,
                "support": 4
            },
            {
                "case_id": "CF-2026-1021",
                "title": "Damaged bus shelter glass shatter hazard",
                "description": "Vandalism shattered safety glass panel at bus stop 14B; glass shards on sidewalk.",
                "category": "Broken Public Park Infrastructure",
                "dept": dept_ids["PARKS"],
                "locality": "Grand Avenue Transit Station",
                "citizen": user_ids["devon@civicfix.gov"],
                "officer": user_ids["officer.parks@civicfix.gov"],
                "priority": "Medium",
                "status": "Submitted",
                "sub_offset": -2,
                "dead_offset": 70,
                "reassignments": 0,
                "reopens": 0,
                "support": 2
            },
            {
                "case_id": "CF-2026-1022",
                "title": "Asphalt subsidence near drainage culvert",
                "description": "Roadbed dipping by 8 inches over 20-meter span along rural access road.",
                "category": "Potholes & Asphalt Damage",
                "dept": dept_ids["ROADS"],
                "locality": "East Culvert Bypass",
                "citizen": user_ids["marcus@civicfix.gov"],
                "officer": user_ids["officer.roads@civicfix.gov"],
                "priority": "Medium",
                "status": "In Progress",
                "sub_offset": -28,
                "dead_offset": 8,
                "reassignments": 1,
                "reopens": 0,
                "support": 2
            }
        ]

        for g in grievances_data:
            sub_dt = now + timedelta(hours=g["sub_offset"])
            dead_dt = now + timedelta(hours=g["dead_offset"])
            sub_str = sub_dt.strftime("%Y-%m-%d %H:%M:%S")
            dead_str = dead_dt.strftime("%Y-%m-%d %H:%M:%S")
            
            res_str = None
            if "resolved_offset" in g:
                res_str = (now + timedelta(hours=g["resolved_offset"])).strftime("%Y-%m-%d %H:%M:%S")

            cursor.execute("""
                INSERT INTO grievances (
                    case_id, title, description, category, department_id, locality,
                    citizen_id, assigned_officer_id, priority, status,
                    submission_date, target_deadline, resolved_at, resolution_note,
                    reopen_reason, reopen_count, reassignment_count, citizen_support_count, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                g["case_id"], g["title"], g["description"], g["category"], g["dept"], g["locality"],
                g["citizen"], g["officer"], g["priority"], g["status"],
                sub_str, dead_str, res_str, g.get("resolution_note"),
                g.get("reopen_reason"), g["reopens"], g["reassignments"], g["support"], sub_str
            ))

            # Audit entries
            cursor.execute("""
                INSERT INTO case_history (case_id, actor_id, actor_name, actor_role, action, new_value, notes, created_at)
                VALUES (?, ?, 'Citizen Reporter', 'citizen', 'CREATED', ?, 'Complaint logged via CivicFix portal', ?)
            """, (g["case_id"], g["citizen"], f"Status: {g['status']}", sub_str))

            if g["reassignments"] > 0:
                reassign_time = (sub_dt + timedelta(hours=4)).strftime("%Y-%m-%d %H:%M:%S")
                cursor.execute("""
                    INSERT INTO case_history (case_id, actor_id, actor_name, actor_role, action, old_value, new_value, notes, created_at)
                    VALUES (?, ?, 'Manager Arthur Pendelton', 'manager', 'REASSIGNED', 'Initial Officer', 'Current Officer', 'Reallocated due to department capacity constraint', ?)
                """, (g["case_id"], user_ids["manager.roads@civicfix.gov"], reassign_time))

            if g["status"] in ("Resolved", "Closed") and res_str:
                cursor.execute("""
                    INSERT INTO case_history (case_id, actor_id, actor_name, actor_role, action, old_value, new_value, notes, created_at)
                    VALUES (?, ?, 'Field Inspection Officer', 'officer', 'RESOLVED', 'In Progress', 'Resolved', ?, ?)
                """, (g["case_id"], g["officer"], g.get("resolution_note"), res_str))

            if g["reopens"] > 0:
                reopen_time = (sub_dt + timedelta(hours=40)).strftime("%Y-%m-%d %H:%M:%S")
                cursor.execute("""
                    INSERT INTO case_history (case_id, actor_id, actor_name, actor_role, action, old_value, new_value, notes, created_at)
                    VALUES (?, ?, 'Elena Rostova', 'citizen', 'REOPENED', 'Resolved', 'Reopened', ?, ?)
                """, (g["case_id"], g["citizen"], g.get("reopen_reason"), reopen_time))

        print(f"Successfully seeded {len(grievances_data)} realistic grievances!")

        # Create demo notification for citizen
        cursor.execute("""
            INSERT INTO notifications (user_id, case_id, title, message, type)
            VALUES (?, 'CF-2026-1007', 'Case Escalation Alert', 'Your complaint CF-2026-1007 has been escalated to Manager Review following reopening.', 'urgent')
        """, (user_ids["citizen@civicfix.gov"],))

    print("Seed complete! Demo login accounts ready:")
    print("  Citizen:            citizen@civicfix.gov / CivicFix2026!")
    print("  Roads Officer:      officer.roads@civicfix.gov / CivicFix2026!")
    print("  Water Officer:      officer.water@civicfix.gov / CivicFix2026!")
    print("  Roads Manager:      manager.roads@civicfix.gov / CivicFix2026!")
    print("  Administrator:      admin@civicfix.gov / CivicFix2026!")

if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="CivicFix demo database seeder")
    parser.add_argument(
        "--reset", action="store_true",
        help="Wipe existing data and re-seed (local dev only — NEVER use on production)"
    )
    args = parser.parse_args()
    seed_database(force_reset=args.reset)
