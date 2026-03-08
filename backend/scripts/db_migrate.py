"""
Database migration utility for development.

Safely migrate data when schema changes during development.

Usage:
    python db_migrate.py export    → Export current data to JSON backup
    python db_migrate.py import    → Reinitialize DB and import latest JSON backup
    python db_migrate.py migrate   → Export, reinit DB, then import (one-shot)

Examples:
    # Before schema change: create backup
    python db_migrate.py export

    # Modify schema files as needed
    # Delete app.db

    # After schema change: restore data
    python db_migrate.py import
    
    OR do it in one command:
    python db_migrate.py migrate
"""

import sqlite3
import json
import os
import sys
from datetime import datetime
from pathlib import Path


# ─────────────────────────────────────────────
# PATHS
# ─────────────────────────────────────────────

BACKEND_DIR = Path(__file__).parent.parent
sys.path.insert(0, str(BACKEND_DIR))
from database import DB_PATH as _DB_PATH_STR
DB_PATH = Path(_DB_PATH_STR)
SCHEMA_PATH = BACKEND_DIR / "data" / "schema.sql"
BACKUPS_DIR = BACKEND_DIR / "data" / "backups"
INTERNAL_TRANSFERS_TRIGGER_PATH = (
    BACKEND_DIR / "data" / "schema" / "triggers" / "internal_transfers.sql"
)

# Create backups directory if it doesn't exist
BACKUPS_DIR.mkdir(exist_ok=True)


# ─────────────────────────────────────────────
# CORE FUNCTIONS
# ─────────────────────────────────────────────

def _load_schema_sql(file_path, visited=None):
    """Load SQL from schema file and resolve .read includes recursively."""
    if visited is None:
        visited = set()

    normalized = os.path.normpath(os.path.abspath(file_path))
    if normalized in visited:
        return ""

    visited.add(normalized)

    statements = []
    current_dir = os.path.dirname(normalized)

    with open(normalized, "r", encoding="utf-8") as f:
        for raw_line in f:
            stripped = raw_line.strip()
            if stripped.startswith(".read "):
                include_rel_path = stripped[len(".read "):].strip()
                include_path = os.path.join(current_dir, include_rel_path)
                statements.append(_load_schema_sql(include_path, visited))
            else:
                statements.append(raw_line)

    return "".join(statements)


def _get_all_tables() -> list[str]:
    """Get list of all user tables (excluding internal sqlite tables)."""
    if not DB_PATH.exists():
        return []

    with sqlite3.connect(DB_PATH) as conn:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
        )
        return [row[0] for row in cursor.fetchall()]


def _export_data(backup_dir: Path) -> None:
    """Export all data to JSON files in backup_dir."""
    if not DB_PATH.exists():
        print(f"❌ Database not found at {DB_PATH}")
        return

    tables = _get_all_tables()
    if not tables:
        print("⚠️  No tables found in database")
        return

    print(f"📦 Exporting data to {backup_dir}/...")

    with sqlite3.connect(DB_PATH) as conn:
        conn.row_factory = sqlite3.Row

        for table in tables:
            cursor = conn.cursor()
            cursor.execute(f"SELECT * FROM {table}")
            rows = [dict(row) for row in cursor.fetchall()]

            backup_file = backup_dir / f"{table}.json"
            with open(backup_file, "w", encoding="utf-8") as f:
                json.dump(rows, f, indent=2)

            print(f"  ✓ {table}: {len(rows)} row(s)")

    print(f"✅ Export complete: {backup_dir}")


def _reinit_database() -> None:
    """Delete old database and create a fresh one with schema."""
    if DB_PATH.exists():
        DB_PATH.unlink()
        print(f"🗑️  Deleted old database")

    print(f"🔨 Initializing fresh database...")

    with sqlite3.connect(DB_PATH) as conn:
        conn.execute("PRAGMA foreign_keys = ON")
        schema_sql = _load_schema_sql(str(SCHEMA_PATH))
        conn.executescript(schema_sql)

    print(f"✅ Database initialized: {DB_PATH}")


def _drop_internal_transfer_triggers(conn: sqlite3.Connection) -> None:
    """Drops internal transfer triggers to allow legacy movement imports."""

    conn.executescript(
        """
        DROP TRIGGER IF EXISTS validate_internal_transfer_insert;
        DROP TRIGGER IF EXISTS validate_internal_transfer_update;
        """
    )


def _restore_internal_transfer_triggers(conn: sqlite3.Connection) -> None:
    """Recreates internal transfer triggers after legacy movement imports."""

    trigger_sql = _load_schema_sql(str(INTERNAL_TRANSFERS_TRIGGER_PATH))
    conn.executescript(trigger_sql)


def _import_data(backup_dir: Path) -> None:
    """Import data from JSON files in backup_dir into database."""
    if not DB_PATH.exists():
        print(f"❌ Database not found at {DB_PATH}. Run reinit first.")
        return

    # Import order respects foreign key dependencies
    # Tables with no dependencies come first
    import_order = [
        "bank_accounts",
        "categories",
        "repetitive_movements",
        "sub_categories",
        "movements",
    ]

    print(f"📥 Importing data from {backup_dir}/...")

    with sqlite3.connect(DB_PATH) as conn:
        conn.execute("PRAGMA foreign_keys = ON")

        transfer_triggers_disabled = False

        for table in import_order:
            json_file = backup_dir / f"{table}.json"

            if not json_file.exists():
                print(f"  ⊘ {table}: skipped (no backup file)")
                continue

            with open(json_file, "r", encoding="utf-8") as f:
                rows = json.load(f)

            if not rows:
                print(f"  ⊘ {table}: skipped (empty)")
                continue

            # Get column names from first row
            columns = list(rows[0].keys())
            placeholders = ",".join(["?"] * len(columns))
            col_list = ",".join(columns)
            sql = f"INSERT INTO {table} ({col_list}) VALUES ({placeholders})"

            cursor = conn.cursor()
            imported_count = 0

            if table == "movements":
                _drop_internal_transfer_triggers(conn)
                transfer_triggers_disabled = True

            for row in rows:
                values = [row[col] for col in columns]
                try:
                    cursor.execute(sql, values)
                    imported_count += 1
                except sqlite3.IntegrityError as e:
                    print(f"  ⚠️  {table}: row insert failed: {e}")
                    continue

            conn.commit()
            print(f"  ✓ {table}: {imported_count}/{len(rows)} row(s) imported")

    if transfer_triggers_disabled:
        _restore_internal_transfer_triggers(conn)
        conn.commit()
        print("  ✓ internal transfer triggers restored")

    print(f"✅ Import complete")


def _get_latest_backup() -> Path | None:
    """Get the most recent backup directory."""
    backup_dirs = sorted([d for d in BACKUPS_DIR.iterdir() if d.is_dir()])
    return backup_dirs[-1] if backup_dirs else None


# ─────────────────────────────────────────────
# COMMANDS
# ─────────────────────────────────────────────

def cmd_export() -> None:
    """Export current data to timestamped backup."""
    timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    backup_dir = BACKUPS_DIR / timestamp
    backup_dir.mkdir(exist_ok=True)
    _export_data(backup_dir)


def cmd_import() -> None:
    """Import from latest backup into a freshly reinitialized database."""
    latest = _get_latest_backup()
    if not latest:
        print(f"❌ No backups found in {BACKUPS_DIR}")
        return

    print(f"Using backup: {latest.name}")

    # Always reinitialize first to avoid duplicate primary keys and
    # repeated MT_ movement_code pairs from previous imports.
    _reinit_database()
    _import_data(latest)


def cmd_migrate() -> None:
    """One-shot: export → reinit → import."""
    print("🔄 Starting migration...\n")

    # Step 1: Export
    timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    backup_dir = BACKUPS_DIR / timestamp
    backup_dir.mkdir(exist_ok=True)
    _export_data(backup_dir)

    print()

    # Step 2: Reinit
    _reinit_database()

    print()

    # Step 3: Import
    _import_data(backup_dir)

    print("\n✅ Migration complete!")


# ─────────────────────────────────────────────
# MAIN
# ─────────────────────────────────────────────

def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)

    command = sys.argv[1].lower()

    if command == "export":
        cmd_export()
    elif command == "import":
        cmd_import()
    elif command == "migrate":
        cmd_migrate()
    else:
        print(f"❌ Unknown command: {command}")
        print(__doc__)
        sys.exit(1)


if __name__ == "__main__":
    main()
