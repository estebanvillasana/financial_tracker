import os
import shutil
import datetime

# Paths
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB_PATH = os.path.join(BASE_DIR, "data", "app.db")
BACKUP_DIR = os.path.join(BASE_DIR, "data", "backups")

# Ensure backup directory exists
os.makedirs(BACKUP_DIR, exist_ok=True)

def backup_database():
    """
    Creates a timestamped backup of app.db in data/backups.
    """
    if not os.path.exists(DB_PATH):
        print(f"[ERROR] Database file not found: {DB_PATH}")
        return

    timestamp = datetime.datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
    backup_filename = f"app_backup_{timestamp}.db"
    backup_path = os.path.join(BACKUP_DIR, backup_filename)

    shutil.copy2(DB_PATH, backup_path)
    print(f"[BACKUP] Database backed up to {backup_path}")

if __name__ == "__main__":
    backup_database()
