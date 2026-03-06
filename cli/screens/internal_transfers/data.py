"""API helpers for the Internal Transfers screen.

All network I/O lives here so the rest of the package stays pure.
"""

from __future__ import annotations

from config import CliConfig
from functions import api


def fetch_transfers(config: CliConfig) -> list[dict]:
    """Return all internal transfers ordered by the API's default sort (latest first)."""
    return api.get(config.api_base_url, "/money-transfers")
