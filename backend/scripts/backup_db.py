import os
import sys
import shutil
import datetime

# Allow importing from the backend root when run as a standalone script
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from database import DB_PATH, BASE_DIR

BACKUP_DIR = os.path.join(BASE_DIR, "data", "backups")

# Ensure backup directory exists
os.makedirs(BACKUP_DIR, exist_ok=True)

BACKUP_INTERVAL_DAYS = 7


def _get_backup_prefix(db_path: str = DB_PATH):
    db_stem = os.path.splitext(os.path.basename(db_path))[0]
    return f"{db_stem}_backup_"


def get_latest_backup_time(db_path: str = DB_PATH):
    """
    Returns the modification time of the most recent backup file,
    or None if no backups exist.
    """
    if not os.path.exists(BACKUP_DIR):
        return None

    backup_prefix = _get_backup_prefix(db_path)
    backup_files = [
        f for f in os.listdir(BACKUP_DIR)
        if f.startswith(backup_prefix) and f.endswith(".db")
    ]

    if not backup_files:
        return None

    latest_backup = max(
        backup_files,
        key=lambda f: os.path.getmtime(os.path.join(BACKUP_DIR, f))
    )
    latest_path = os.path.join(BACKUP_DIR, latest_backup)
    return os.path.getmtime(latest_path)


def should_backup_db(db_path: str = DB_PATH):
    """
    Returns True if no backup exists or if the last backup
    is older than BACKUP_INTERVAL_DAYS (default 7 days).
    Returns False if a recent backup exists.
    """
    latest_backup_time = get_latest_backup_time(db_path)

    if latest_backup_time is None:
        return True

    age_seconds = datetime.datetime.now().timestamp() - latest_backup_time
    age_days = age_seconds / (24 * 3600)

    return age_days >= BACKUP_INTERVAL_DAYS


def backup_database(db_path: str = DB_PATH):
    """
    Creates a timestamped backup of the given database in data/backups.
    """
    if not os.path.exists(db_path):
        print(f"[ERROR] Database file not found: {db_path}")
        return

    backup_prefix = _get_backup_prefix(db_path)
    timestamp = datetime.datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
    backup_filename = f"{backup_prefix}{timestamp}.db"
    backup_path = os.path.join(BACKUP_DIR, backup_filename)

    shutil.copy2(db_path, backup_path)
    print(f"[BACKUP] Database backed up to {backup_path}")


def backup_all_databases(users: dict[str, dict]):
    """
    Back up every user database that is due for a backup.
    Called from main.py lifespan shutdown.

    If users is empty (single-user / local-dev) it falls back
    to backing up the default DB_PATH.
    """
    if not users:
        if should_backup_db():
            try:
                backup_database()
            except Exception as e:
                print(f"[APP] Backup error: {e}")
        else:
            print("[APP] Backup skipped: last backup is recent enough.")
        return

    # Deduplicate paths (two keys could map to the same db).
    seen: set[str] = set()
    for info in users.values():
        db = info["db"]
        if db in seen:
            continue
        seen.add(db)
        if should_backup_db(db):
            try:
                backup_database(db)
            except Exception as e:
                print(f"[APP] Backup error for {db}: {e}")
        else:
            print(f"[APP] Backup skipped for {db}: last backup is recent enough.")
