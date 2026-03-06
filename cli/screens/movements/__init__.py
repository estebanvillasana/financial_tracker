"""Movements screen — browse, filter, and edit existing movements.

Public API
==========
- ``render_body(config)`` — lightweight sidebar preview.
- ``run(menu_items, config)`` — full interactive screen loop.
"""

from __future__ import annotations

from config import CliConfig
from screens.movements.actions import choose_account, edit_movement
from screens.movements.data import fetch_movements
from screens.movements.models import ACTION_KEYS, ACTION_LABELS, MENU_KEY
from screens.movements.render import build_body, render_table
from utils.api_errors import api_error_message
from utils.debug_shortcuts import handle_debug_restart
from utils.money import fetch_active_accounts, fetch_fx_rate
from utils.navigation import read_key
from utils.pagination import next_page, previous_page
from utils.references import fetch_references
from utils.render import flash_action, render_screen
from utils.selection import process_selection_key


# ── Sidebar preview ──────────────────────────────────────────


def render_body(config: CliConfig) -> str:
    """Return a short summary for the sidebar when this screen is inactive."""
    try:
        rows = fetch_movements(config, account_id=None)
    except Exception as exc:
        return f"Movements\n\nCould not load movements: {api_error_message(exc)}"
    return (
        "Movements\n\n"
        f"Loaded movements: {len(rows)}\n"
        "Open this screen to filter by account and edit movements."
    )


# ── Main loop ────────────────────────────────────────────────


def run(menu_items: list[tuple[str, str]], config: CliConfig) -> None:
    """Interactive movements browser with pagination, filtering, and editing."""
    active_action = "9"
    selected_account: dict | None = None
    selected_account_id: int | None = None
    page = 0
    message: str | None = None

    while True:
        # ── Fetch data ────────────────────────────────────────
        try:
            accounts = fetch_active_accounts(config)
            categories, sub_categories, repetitive = fetch_references(config)
            rows = fetch_movements(config, selected_account_id)
        except Exception as exc:
            body = (
                "Movements\n\n"
                f"Could not load data: {api_error_message(exc)}\n\n"
                "B/ESC  Back"
            )
            render_screen(menu_items, MENU_KEY, body, interaction_area="content")
            key = read_key()
            handle_debug_restart(key)
            if key in {"b", "B", "ESC"}:
                return
            continue

        # ── Build FX rates and render table ───────────────────
        unique_currencies = {str(r["currency"]).lower() for r in rows}
        rates: dict[str, float | None] = {
            cur: fetch_fx_rate(config, cur, config.main_currency)
            for cur in unique_currencies
        }
        table_text, total_pages = render_table(
            rows, page, rates, config.main_currency,
        )

        # Clamp page if data shrank
        if page >= total_pages:
            page = max(0, total_pages - 1)
            table_text, total_pages = render_table(
                rows, page, rates, config.main_currency,
            )

        # ── Build body strings ────────────────────────────────
        body = build_body(
            active_action, "content", selected_account,
            rows, page, total_pages, table_text,
            config.main_currency, message=message,
        )
        body_builder = lambda: build_body(
            active_action, "input", selected_account,
            rows, page, total_pages, table_text,
            config.main_currency, message=message,
        )

        # ── Render and wait for input ─────────────────────────
        render_screen(menu_items, MENU_KEY, body, interaction_area="content")
        key = read_key()
        handle_debug_restart(key)

        # ── Navigation keys ───────────────────────────────────
        if key in {"b", "B", "ESC"}:
            return
        if key in {"RIGHT", "n", "N"}:
            page = next_page(page, total_pages)
            continue
        if key in {"LEFT", "p", "P"}:
            page = previous_page(page)
            continue

        # ── Action selection ──────────────────────────────────
        event = process_selection_key(key, active_action, ACTION_KEYS)
        active_action = event.active_key
        if event.moved or event.choice is None:
            continue

        if event.enter_pressed:
            flash_action(
                menu_items, MENU_KEY, body,
                ACTION_LABELS.get(event.choice, "Action"),
                interaction_area="content",
            )

        # ── Action dispatch ───────────────────────────────────
        if event.choice == "1":
            # Select bank account filter
            picked = choose_account(menu_items, accounts, body_builder)
            if picked is None:
                message = "Account selection canceled."
            elif picked == {}:
                selected_account = None
                selected_account_id = None
                page = 0
                message = "Showing all active accounts."
            else:
                selected_account = picked
                selected_account_id = int(picked["id"])
                page = 0
                message = f"Filtered by {picked['account']}."
            continue

        if event.choice == "2":
            # Edit a movement
            message = edit_movement(
                menu_items, config, rows,
                categories, sub_categories, repetitive,
                body_builder,
            )
            continue

        if event.choice == "5":
            message = "Data refreshed."
            continue

        if event.choice == "9":
            return
