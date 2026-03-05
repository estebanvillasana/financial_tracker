from __future__ import annotations

import sqlite3
from pathlib import Path
from typing import Any


def db_exists(db_path: str | Path) -> bool:
	return Path(db_path).is_file()


def query(db_path: str | Path, sql: str, params: tuple = ()) -> list[dict[str, Any]]:
	"""Run a read-only SQL query and return results as a list of dicts."""
	uri = Path(db_path).as_uri() + "?mode=ro"
	conn = sqlite3.connect(uri, uri=True)
	conn.row_factory = sqlite3.Row
	try:
		cursor = conn.execute(sql, params)
		columns = [col[0] for col in cursor.description]
		return [dict(zip(columns, row)) for row in cursor.fetchall()]
	finally:
		conn.close()
