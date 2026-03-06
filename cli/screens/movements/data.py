"""API helpers for the Movements screen.

All network I/O lives here so the rest of the package stays pure.
"""

from __future__ import annotations

from config import CliConfig
from functions import api


def fetch_movements(
    config: CliConfig,
    account_id: int | None,
    *,
    limit: int = 500,
) -> list[dict]:
    """Fetch movements from the API, optionally filtered by *account_id*.

    Returns a list of movement dicts ordered by the API's default sort.
    """
    path = f"/movements?limit={limit}"
    if account_id is not None:
        path += f"&account_id={account_id}"
    return api.get(config.api_base_url, path)


def movement_display_value(row: dict) -> float:
    """Convert the stored cents integer to a human-readable float."""
    return float(row["value"]) / 100.0
