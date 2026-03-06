"""Shared reference-data fetching for CLI screens."""

from __future__ import annotations

from config import CliConfig
from functions import api


def fetch_references(config: CliConfig) -> tuple[list[dict], list[dict], list[dict]]:
    """Fetch active categories, sub-categories, and repetitive movements.

    Returns a 3-tuple: ``(categories, sub_categories, repetitive_movements)``.
    All three are filtered to ``active=1`` at the API level.
    """
    categories = api.get(config.api_base_url, "/categories?active=1")
    sub_categories = api.get(config.api_base_url, "/sub-categories?active=1")
    repetitive = api.get(config.api_base_url, "/repetitive-movements?active=1&limit=500")
    return categories, sub_categories, repetitive
