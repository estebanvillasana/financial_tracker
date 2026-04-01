import sqlite3
import json
import os
from contextvars import ContextVar

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

# ─────────────────────────────────────────────
# MULTI-USER SUPPORT
# ─────────────────────────────────────────────

# Per-request database path, set by the API-key middleware in main.py.
# When set, get_connection() uses this instead of the global DB_PATH.
_request_db_path: ContextVar[str | None] = ContextVar("request_db_path", default=None)

USERS_PATH = os.path.join(BASE_DIR, "users.json")


def load_users() -> dict[str, dict]:
    """Load the api-key → user mapping from users.json.

    Returns a dict like:
        { "abc123": { "name": "you", "db": "<absolute path>" }, ... }

    If users.json is missing the app still works with the global DB_PATH
    (single-user / local-dev mode).
    """
    if not os.path.exists(USERS_PATH):
        return {}

    with open(USERS_PATH, "r", encoding="utf-8") as f:
        raw: dict = json.load(f)

    users: dict[str, dict] = {}
    for api_key, info in raw.items():
        db_raw = info["db"]
        db_abs = db_raw if os.path.isabs(db_raw) else os.path.join(BASE_DIR, db_raw)
        users[api_key] = {"name": info["name"], "db": db_abs}
    return users


def get_all_db_paths(users: dict[str, dict]) -> list[str]:
    """Return a deduplicated list of absolute DB paths from users map."""
    seen: set[str] = set()
    paths: list[str] = []
    for info in users.values():
        p = info["db"]
        if p not in seen:
            seen.add(p)
            paths.append(p)
    return paths


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

def initialize_database(db_path: str | None = None):
    """
    Called once when the app starts (from main.py).
    
    What it does:
    1. Checks if the database file already exists
    2. If not → creates it and runs schema files in data/schema to build the schema
    3. If yes → does nothing (safe to call every time the app starts)

    Args:
        db_path: Optional explicit path. Falls back to the global DB_PATH.
    """
    path = db_path or DB_PATH

    # Ensure the parent directory exists (e.g. data/database/)
    os.makedirs(os.path.dirname(path), exist_ok=True)

    # os.path.exists() returns True if the file is already there.
    # If the db already exists, we skip initialization entirely.
    if os.path.exists(path):
        print(f"[DB] Database already exists at {path}. Skipping initialization.")
    else:
        print(f"[DB] No database found. Creating new database at {path}...")

        # Connect to SQLite. Since the file doesn't exist yet, SQLite creates it automatically.
        # We execute the single schema entry file and resolve `.read` includes.
        with sqlite3.connect(path) as conn:
            conn.execute("PRAGMA foreign_keys = ON")
            schema_sql = _load_schema_sql(SCHEMA_PATH)
            conn.executescript(schema_sql)

        print(f"[DB] Database initialized successfully.")

    # Always run migrations -- safe on both new and existing databases.
    _run_migrations(path)


def _run_migrations(path: str) -> None:
    """Apply incremental schema changes that are safe to re-run (IF NOT EXISTS)."""
    with sqlite3.connect(path) as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS settings (
                key   TEXT PRIMARY KEY,
                value TEXT NOT NULL
            )
        """)


# ─────────────────────────────────────────────
# CONNECTION
# ─────────────────────────────────────────────

def get_connection():
    """
    Returns an open connection to the database.
    Called by model functions whenever they need to query the database.

    The database path is determined by:
    1. The per-request ContextVar (_request_db_path), set by the API-key
       middleware — so each user hits their own database.
    2. Falls back to the global DB_PATH (from .env / env var) for
       local development or CLI scripts.

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

    path = _request_db_path.get() or DB_PATH
    conn = sqlite3.connect(path)

    # Enable dictionary-style row access
    conn.row_factory = sqlite3.Row

    # Enforce foreign key constraints (OFF by default in SQLite)
    conn.execute("PRAGMA foreign_keys = ON")

    return conn


def get_current_db_path() -> str:
    """Return the active database path for the current request/context."""
    return _request_db_path.get() or DB_PATH
