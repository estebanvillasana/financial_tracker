import sqlite3
import os

# ─────────────────────────────────────────────
# PATHS
# ─────────────────────────────────────────────

# Directory where this file lives (backend/)
BASE_DIR = os.path.dirname(os.path.abspath(__file__))


def _load_env() -> dict:
    """Load key=value pairs from backend/.env if present."""
    env: dict = {}
    env_path = os.path.join(BASE_DIR, ".env")
    if os.path.exists(env_path):
        with open(env_path, "r", encoding="utf-8") as f:
            for raw_line in f:
                line = raw_line.strip()
                if not line or line.startswith("#"):
                    continue
                if "=" not in line:
                    continue
                key, _, value = line.partition("=")
                env[key.strip()] = value.strip()
    return env


_env = _load_env()

# DB_PATH resolution order:
#   1. DB_PATH environment variable (highest priority)
#   2. DB_PATH key in backend/.env
#   3. Default: data/app.db (relative to backend/)
# Relative paths are resolved from BASE_DIR (backend/).
_raw_db_path = (
    os.environ.get("DB_PATH")
    or _env.get("DB_PATH")
    or os.path.join("data", "app.db")
)
DB_PATH = _raw_db_path if os.path.isabs(_raw_db_path) else os.path.join(BASE_DIR, _raw_db_path)

# Single schema entry file.
# It may include other files using sqlite-shell style `.read path/to/file.sql` lines.
SCHEMA_PATH = os.path.join(BASE_DIR, "data", "schema.sql")


def _load_schema_sql(file_path, visited=None):
    """
    Loads SQL from a schema file and recursively resolves `.read` includes.

    Why this exists:
    - sqlite3.Connection.executescript() does not understand sqlite-shell commands
      like `.read ...`.
    - We still want a single entrypoint (`schema.sql`) in Python code.
    """

    if visited is None:
        visited = set()

    normalized = os.path.normpath(os.path.abspath(file_path))
    if normalized in visited:
        return ""

    visited.add(normalized)

    statements = []
    current_dir = os.path.dirname(normalized)

    with open(normalized, "r", encoding="utf-8") as schema_file:
        for raw_line in schema_file:
            stripped = raw_line.strip()

            if stripped.startswith(".read "):
                include_rel_path = stripped[len(".read "):].strip()
                include_path = os.path.join(current_dir, include_rel_path)
                statements.append(_load_schema_sql(include_path, visited))
            else:
                statements.append(raw_line)

    return "".join(statements)


# ─────────────────────────────────────────────
# INITIALIZATION
# ─────────────────────────────────────────────

def initialize_database():
    """
    Called once when the app starts (from main.py).
    
    What it does:
    1. Checks if the database file already exists
    2. If not → creates it and runs schema files in data/schema to build the schema
    3. If yes → does nothing (safe to call every time the app starts)
    """

    # os.path.exists() returns True if the file is already there.
    # If the db already exists, we skip initialization entirely.
    if os.path.exists(DB_PATH):
        print(f"[DB] Database already exists at {DB_PATH}. Skipping initialization.")
        return

    print(f"[DB] No database found. Creating new database at {DB_PATH}...")

    # Connect to SQLite. Since the file doesn't exist yet, SQLite creates it automatically.
    # We execute the single schema entry file and resolve `.read` includes.
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute("PRAGMA foreign_keys = ON")
        schema_sql = _load_schema_sql(SCHEMA_PATH)
        conn.executescript(schema_sql)

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