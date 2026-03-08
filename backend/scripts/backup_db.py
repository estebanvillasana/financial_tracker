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


def _get_backup_prefix():
    db_stem = os.path.splitext(os.path.basename(DB_PATH))[0]
    return f"{db_stem}_backup_"


def get_latest_backup_time():
    """
    Returns the modification time of the most recent backup file,
    or None if no backups exist.
    """
    if not os.path.exists(BACKUP_DIR):
        return None

    backup_prefix = _get_backup_prefix()
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


def should_backup():
    """
    Returns True if no backup exists or if the last backup
    is older than BACKUP_INTERVAL_DAYS (default 7 days).
    Returns False if a recent backup exists.
    """
    latest_backup_time = get_latest_backup_time()

    if latest_backup_time is None:
        return True

    age_seconds = datetime.datetime.now().timestamp() - latest_backup_time
    age_days = age_seconds / (24 * 3600)

    return age_days >= BACKUP_INTERVAL_DAYS


def backup_database():
    """
    Creates a timestamped backup of app.db in data/backups.
    """
    if not os.path.exists(DB_PATH):
        print(f"[ERROR] Database file not found: {DB_PATH}")
        return

    backup_prefix = _get_backup_prefix()
    timestamp = datetime.datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
    backup_filename = f"{backup_prefix}{timestamp}.db"
    backup_path = os.path.join(BACKUP_DIR, backup_filename)

    shutil.copy2(DB_PATH, backup_path)
    print(f"[BACKUP] Database backed up to {backup_path}")


if __name__ == "__main__":
    backup_database()
