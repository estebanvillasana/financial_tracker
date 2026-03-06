from __future__ import annotations

from config import CliConfig
from functions import api


def fetch_data(config: CliConfig) -> tuple[list[dict], list[dict]]:
    """Return ``(categories, sub_categories)`` from the API."""
    categories = api.get(config.api_base_url, "/categories")
    sub_categories = api.get(config.api_base_url, "/sub-categories")
    return categories, sub_categories
