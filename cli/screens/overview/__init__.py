"""Overview screen — account balances, FX-adjusted summaries, and currency navigation.

Public API consumed by ``app.py``:
* :func:`render_body` — lightweight preview for the main-menu sidebar.
* :func:`run` — full interactive view with currency-group and row pagination.
"""

from __future__ import annotations

from config import CliConfig
from utils.debug_shortcuts import handle_debug_restart
from utils.navigation import read_key
from utils.render import render_screen

from screens.overview.data import build_rates, compute_summaries, fetch_rows
from screens.overview.render import build_body, build_preview_body


# ── Preview (main-menu sidebar) ──────────────────────────────


def render_body(config: CliConfig) -> str:
    """Return the preview text shown while the user is on the main menu."""
    try:
        rows = fetch_rows(config)
    except Exception:
        return "Overview\n\nCould not load data."

    rates = build_rates(config, rows)
    return build_preview_body(rows, rates, config.main_currency)


# ── Interactive screen ────────────────────────────────────────


def run(menu_items: list[tuple[str, str]], config: CliConfig) -> None:
    """Full overview with horizontal (currency) and vertical (row) pagination."""
    try:
        rows = fetch_rows(config)
    except Exception as exc:
        _show_error(menu_items, f"Error loading accounts:\n{exc}")
        return

    rates = build_rates(config, rows)
    active_currencies = {
        str(r["currency"]).lower() for r in rows if r["active"]
    }
    total_pages = max(1, len(active_currencies))
    page = 0
    row_page = 0

    while True:
        body, total_row_pages = build_body(
            rows, rates, config.main_currency,
            page=page, row_page=row_page,
        )
        render_screen(menu_items, "1", body, interaction_area="content")

        key = read_key()
        handle_debug_restart(key)

        if key in {"b", "B", "ESC"}:
            return
        elif key in {"RIGHT", "n", "N"}:
            page = min(total_pages - 1, page + 1)
            row_page = 0
        elif key in {"LEFT", "p", "P"}:
            page = max(0, page - 1)
            row_page = 0
        elif key in {"DOWN", "j", "J"}:
            row_page = min(total_row_pages - 1, row_page + 1)
        elif key in {"UP", "k", "K"}:
            row_page = max(0, row_page - 1)


# ── Error display ─────────────────────────────────────────────


def _show_error(menu_items: list[tuple[str, str]], message: str) -> None:
    """Display an error with back-navigation."""
    body = f"Overview\n\n{message}\n\nB/ESC  Back"
    while True:
        render_screen(menu_items, "1", body, interaction_area="content")
        key = read_key()
        handle_debug_restart(key)
        if key in {"b", "B", "ESC"}:
            return
