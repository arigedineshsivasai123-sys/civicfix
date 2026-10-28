"""
CivicFix Database Layer
=======================
Supports two database backends controlled by the DATABASE_URL environment variable:

  • Local development  — DATABASE_URL unset → SQLite (backend/app/civicfix.db)
  • Production (Render) — DATABASE_URL=postgresql://... → PostgreSQL (Supabase)

SQL dialect differences handled here:
  - AUTO-INCREMENT: SQLite uses INTEGER PRIMARY KEY AUTOINCREMENT;
                    PostgreSQL uses SERIAL PRIMARY KEY.
  - Placeholders:   SQLite uses '?'; PostgreSQL uses '%s'.
  - PRAGMA:         SQLite-only; skipped on PostgreSQL.
  - TIMESTAMP:      Both support standard ISO timestamps.
"""

import os
import sqlite3
from contextlib import contextmanager

# ──────────────────────────────────────────────────────────────
# Database mode detection
# ──────────────────────────────────────────────────────────────
DATABASE_URL = os.environ.get("DATABASE_URL", "")

# Heroku/Render may return 'postgres://' which psycopg2 requires as 'postgresql://'
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

USE_POSTGRES = bool(DATABASE_URL)

# ──────────────────────────────────────────────────────────────
# SQLite helpers (local development)
# ──────────────────────────────────────────────────────────────
DB_DIR  = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(DB_DIR, "civicfix.db")


def _sqlite_connect():
    conn = sqlite3.connect(DB_PATH, timeout=30.0)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode = WAL")
    return conn


# ──────────────────────────────────────────────────────────────
# PostgreSQL helpers (production)
# ──────────────────────────────────────────────────────────────
class _PgRowWrapper:
    """Makes psycopg2 rows subscriptable by column name, mirroring sqlite3.Row."""
    __slots__ = ("_data",)

    def __init__(self, mapping):
        self._data = dict(mapping)

    def __getitem__(self, key):
        return self._data[key]

    def get(self, key, default=None):
        return self._data.get(key, default)

    def keys(self):
        return self._data.keys()

    def __iter__(self):
        return iter(self._data.values())

    def __repr__(self):
        return repr(self._data)


class _PgCursorWrapper:
    """Wraps a psycopg2 cursor:
       - translates SQLite '?' placeholders to '%s'
       - auto-appends RETURNING id to INSERT statements so .lastrowid works
       - returns _PgRowWrapper instances instead of raw tuples
    """

    def __init__(self, cursor):
        self._cur = cursor
        self._column_names = []
        self._last_insert_id = None

    def _translate(self, sql):
        return sql.replace("?", "%s")

    def execute(self, sql, params=None):
        translated = self._translate(sql)
        stripped = translated.strip().upper()

        # Auto-append RETURNING id for plain INSERT statements so lastrowid works
        if stripped.startswith("INSERT") and "RETURNING" not in stripped:
            translated = translated.rstrip().rstrip(";") + " RETURNING id"
            self._cur.execute(translated, params or ())
            row = self._cur.fetchone()
            self._last_insert_id = row[0] if row else None
            self._column_names = []
        else:
            self._cur.execute(translated, params or ())
            if self._cur.description:
                self._column_names = [d[0] for d in self._cur.description]
        return self

    def fetchone(self):
        row = self._cur.fetchone()
        if row is None:
            return None
        return _PgRowWrapper(dict(zip(self._column_names, row)))

    def fetchall(self):
        rows = self._cur.fetchall()
        return [_PgRowWrapper(dict(zip(self._column_names, r))) for r in rows]

    @property
    def lastrowid(self):
        return self._last_insert_id

    @property
    def rowcount(self):
        return self._cur.rowcount


class _PgConnectionWrapper:
    """Wraps a psycopg2 connection to provide a sqlite3-compatible interface."""

    def __init__(self, conn):
        self._conn = conn

    def cursor(self):
        return _PgCursorWrapper(self._conn.cursor())

    def execute(self, sql, params=None):
        cur = _PgCursorWrapper(self._conn.cursor())
        cur.execute(sql, params)
        return cur

    def commit(self):
        self._conn.commit()

    def rollback(self):
        self._conn.rollback()

    def close(self):
        self._conn.close()

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        if exc_type:
            self.rollback()
        else:
            self.commit()
        self.close()


def _pg_connect():
    import psycopg2
    conn = psycopg2.connect(DATABASE_URL, sslmode="require")
    conn.autocommit = False
    return _PgConnectionWrapper(conn)


# ──────────────────────────────────────────────────────────────
# Public API
# ──────────────────────────────────────────────────────────────
def get_db_connection():
    """Return a raw connection (caller must close it)."""
    if USE_POSTGRES:
        return _pg_connect()
    return _sqlite_connect()


@contextmanager
def get_db():
    """Context manager — commits on success, rolls back on exception."""
    conn = get_db_connection()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


# ──────────────────────────────────────────────────────────────
# Schema DDL helpers
# ──────────────────────────────────────────────────────────────
def _serial(sqlite_type: str) -> str:
    """Return appropriate auto-increment primary key syntax."""
    if USE_POSTGRES:
        return "SERIAL PRIMARY KEY"
    return f"{sqlite_type} PRIMARY KEY AUTOINCREMENT"


def _col_exists(conn, table: str, column: str) -> bool:
    """Check whether a column exists in a table (both dialects)."""
    if USE_POSTGRES:
        cur = conn.execute(
            "SELECT 1 FROM information_schema.columns "
            "WHERE table_name=%s AND column_name=%s",
            (table, column),
        )
        return cur.fetchone() is not None
    else:
        cur = conn.execute(f"PRAGMA table_info({table})")
        return any(row["name"] == column for row in cur.fetchall())


def _table_exists(conn, table: str) -> bool:
    """Check whether a table exists (both dialects)."""
    if USE_POSTGRES:
        cur = conn.execute(
            "SELECT 1 FROM information_schema.tables WHERE table_name=%s",
            (table,),
        )
        return cur.fetchone() is not None
    else:
        cur = conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
            (table,),
        )
        return cur.fetchone() is not None


# ──────────────────────────────────────────────────────────────
# Schema initialisation (safe — idempotent)
# ──────────────────────────────────────────────────────────────
def init_db():
    """Create all tables if they do not exist and apply safe column migrations."""
    pk = _serial("INTEGER")

    with get_db() as conn:
        cursor = conn.cursor()

        # ── 1. Departments ──────────────────────────────────────────
        cursor.execute(f"""
        CREATE TABLE IF NOT EXISTS departments (
            id {pk},
            name TEXT NOT NULL UNIQUE,
            code TEXT NOT NULL UNIQUE,
            description TEXT,
            default_sla_hours INTEGER DEFAULT 48,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )""")

        # ── 2. Users ────────────────────────────────────────────────
        cursor.execute(f"""
        CREATE TABLE IF NOT EXISTS users (
            id {pk},
            name TEXT NOT NULL,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            role TEXT NOT NULL CHECK(role IN ('citizen','officer','manager','admin')),
            department_id INTEGER,
            badge_number TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL
        )""")

        # ── 3. Categories ───────────────────────────────────────────
        cursor.execute(f"""
        CREATE TABLE IF NOT EXISTS categories (
            id {pk},
            name TEXT NOT NULL UNIQUE,
            department_id INTEGER NOT NULL,
            default_priority TEXT DEFAULT 'Medium'
                CHECK(default_priority IN ('Low','Medium','High','Urgent')),
            sla_hours INTEGER DEFAULT 48,
            FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE CASCADE
        )""")

        # ── 4. Grievances ───────────────────────────────────────────
        cursor.execute(f"""
        CREATE TABLE IF NOT EXISTS grievances (
            id {pk},
            case_id TEXT UNIQUE NOT NULL,
            title TEXT NOT NULL,
            description TEXT NOT NULL,
            category TEXT NOT NULL,
            department_id INTEGER NOT NULL,
            locality TEXT NOT NULL,
            citizen_id INTEGER NOT NULL,
            assigned_officer_id INTEGER,
            priority TEXT NOT NULL
                CHECK(priority IN ('Low','Medium','High','Urgent')),
            status TEXT NOT NULL
                CHECK(status IN ('Submitted','Acknowledged','In Progress',
                                 'Awaiting Information','Resolved','Closed','Reopened')),
            submission_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            target_deadline TIMESTAMP NOT NULL,
            resolved_at TIMESTAMP,
            resolution_note TEXT,
            resolution_evidence_url TEXT,
            reopen_reason TEXT,
            reopen_count INTEGER DEFAULT 0,
            reassignment_count INTEGER DEFAULT 0,
            parent_case_id TEXT,
            citizen_support_count INTEGER DEFAULT 1,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            -- Location fields (added via migration below for existing DBs)
            latitude REAL,
            longitude REAL,
            location_accuracy_m REAL,
            location_source TEXT,
            location_confirmed INTEGER DEFAULT 0,
            street_or_landmark TEXT,
            FOREIGN KEY (department_id) REFERENCES departments(id),
            FOREIGN KEY (citizen_id) REFERENCES users(id),
            FOREIGN KEY (assigned_officer_id) REFERENCES users(id) ON DELETE SET NULL
        )""")

        # ── 5. Case History (Audit Log) ─────────────────────────────
        cursor.execute(f"""
        CREATE TABLE IF NOT EXISTS case_history (
            id {pk},
            case_id TEXT NOT NULL,
            actor_id INTEGER,
            actor_name TEXT NOT NULL,
            actor_role TEXT NOT NULL,
            action TEXT NOT NULL,
            old_value TEXT,
            new_value TEXT,
            notes TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (actor_id) REFERENCES users(id) ON DELETE SET NULL
        )""")

        # ── 6. Notifications ────────────────────────────────────────
        cursor.execute(f"""
        CREATE TABLE IF NOT EXISTS notifications (
            id {pk},
            user_id INTEGER NOT NULL,
            case_id TEXT,
            related_grievance_id TEXT,
            title TEXT NOT NULL,
            message TEXT NOT NULL,
            type TEXT NOT NULL CHECK(type IN ('info','warning','success','urgent')),
            is_read INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            read_at TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )""")

        # ── 7. Issue Links (duplicates / supported cases) ───────────
        cursor.execute(f"""
        CREATE TABLE IF NOT EXISTS issue_links (
            id {pk},
            primary_case_id TEXT NOT NULL,
            linked_case_id TEXT,
            citizen_id INTEGER NOT NULL,
            similarity_score REAL,
            note TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (citizen_id) REFERENCES users(id)
        )""")

        # ── 8. Attachments ──────────────────────────────────────────
        cursor.execute(f"""
        CREATE TABLE IF NOT EXISTS attachments (
            id {pk},
            case_id TEXT NOT NULL,
            uploader_id INTEGER NOT NULL,
            file_name TEXT NOT NULL,
            file_path TEXT NOT NULL,
            file_size INTEGER NOT NULL,
            mime_type TEXT NOT NULL,
            file_purpose TEXT NOT NULL
                CHECK(file_purpose IN ('citizen_evidence','resolution_proof')),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (uploader_id) REFERENCES users(id)
        )""")

        # ── Safe column migrations (for existing databases) ─────────
        _apply_migrations(conn)

        # ── Indexes ──────────────────────────────────────────────────
        for idx_sql in [
            "CREATE INDEX IF NOT EXISTS idx_grievances_case_id ON grievances(case_id)",
            "CREATE INDEX IF NOT EXISTS idx_grievances_status  ON grievances(status)",
            "CREATE INDEX IF NOT EXISTS idx_grievances_dept    ON grievances(department_id)",
            "CREATE INDEX IF NOT EXISTS idx_grievances_officer ON grievances(assigned_officer_id)",
            "CREATE INDEX IF NOT EXISTS idx_grievances_citizen ON grievances(citizen_id)",
            "CREATE INDEX IF NOT EXISTS idx_case_history_case  ON case_history(case_id)",
            "CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, is_read)",
        ]:
            try:
                cursor.execute(idx_sql)
            except Exception:
                pass  # index already exists (PostgreSQL does not support IF NOT EXISTS on all versions)


def _apply_migrations(conn):
    """Add columns that were introduced after the initial schema."""
    # Notifications: read_at, related_grievance_id
    for col, ddl in [
        ("read_at",              "ALTER TABLE notifications ADD COLUMN read_at TIMESTAMP"),
        ("related_grievance_id", "ALTER TABLE notifications ADD COLUMN related_grievance_id TEXT"),
    ]:
        if not _col_exists(conn, "notifications", col):
            conn.execute(ddl)
            if col == "related_grievance_id":
                conn.execute(
                    "UPDATE notifications SET related_grievance_id = case_id "
                    "WHERE related_grievance_id IS NULL AND case_id IS NOT NULL"
                )

    # Grievances: location columns
    for col, ddl in [
        ("latitude",           "ALTER TABLE grievances ADD COLUMN latitude REAL"),
        ("longitude",          "ALTER TABLE grievances ADD COLUMN longitude REAL"),
        ("location_accuracy_m","ALTER TABLE grievances ADD COLUMN location_accuracy_m REAL"),
        ("location_source",    "ALTER TABLE grievances ADD COLUMN location_source TEXT"),
        ("location_confirmed", "ALTER TABLE grievances ADD COLUMN location_confirmed INTEGER DEFAULT 0"),
        ("street_or_landmark", "ALTER TABLE grievances ADD COLUMN street_or_landmark TEXT"),
    ]:
        if not _col_exists(conn, "grievances", col):
            conn.execute(ddl)


if __name__ == "__main__":
    init_db()
    mode = "PostgreSQL" if USE_POSTGRES else f"SQLite ({DB_PATH})"
    print(f"CivicFix database schema initialised successfully ({mode}).")
