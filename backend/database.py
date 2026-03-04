import sqlite3
import os

# ─────────────────────────────────────────────
# PATHS
# ─────────────────────────────────────────────

# Path to the SQLite database file.
# This file is created automatically on first run.
DB_PATH = "data/app.db"

# Path to the schema file — this is the source of truth for our table definitions.
# Instead of writing SQL inside Python strings, we keep SQL in .sql files.
SCHEMA_PATH = "data/schema.sql"


# ─────────────────────────────────────────────
# INITIALIZATION
# ─────────────────────────────────────────────

def initialize_database():
    """
    Called once when the app starts (from main.py).
    
    What it does:
    1. Checks if the database file already exists
    2. If not → creates it and runs schema.sql to build all tables
    3. If yes → does nothing (safe to call every time the app starts)
    """

    # os.path.exists() returns True if the file is already there.
    # If the db already exists, we skip initialization entirely.
    if os.path.exists(DB_PATH):
        print(f"[DB] Database already exists at {DB_PATH}. Skipping initialization.")
        return

    print(f"[DB] No database found. Creating new database at {DB_PATH}...")

    # Read the schema file as a plain string.
    # We keep SQL in .sql files so it stays readable and testable independently.
    with open(SCHEMA_PATH, "r") as f:
        schema = f.read()

    # Connect to SQLite. Since the file doesn't exist yet, SQLite creates it automatically.
    # executescript() runs multiple SQL statements at once — perfect for a schema file.
    with sqlite3.connect(DB_PATH) as conn:
        conn.executescript(schema)

    print(f"[DB] Database initialized successfully.")


# ─────────────────────────────────────────────
# CONNECTION
# ─────────────────────────────────────────────

def get_connection():
    """
    Returns an open connection to the database.
    Called by model functions whenever they need to query the database.

    Two important settings we apply to every connection:

    1. row_factory = sqlite3.Row
       By default, SQLite returns rows as plain tuples: (1, "BBVA", "Bank Account", ...)
       With row_factory, rows behave like dictionaries: row["account"], row["type"]
       This makes the code much more readable and the data easier to convert to JSON.

    2. PRAGMA foreign_keys = ON
       SQLite does NOT enforce foreign keys by default — you have to enable it
       manually on every connection. Without this, you could insert a movement
       with an account_id that doesn't exist and SQLite wouldn't complain.
    """

    conn = sqlite3.connect(DB_PATH)

    # Enable dictionary-style row access
    conn.row_factory = sqlite3.Row

    # Enforce foreign key constraints (OFF by default in SQLite)
    conn.execute("PRAGMA foreign_keys = ON")

    return conn