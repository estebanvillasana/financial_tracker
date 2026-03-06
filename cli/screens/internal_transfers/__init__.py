"""Internal Transfers screen — browse, create, edit, and delete transfers.

An internal transfer is a paired Expense + Income movement between two of the
user's own bank accounts, created and updated atomically by the backend.

Public API
==========
- ``render_body(config)`` — lightweight sidebar preview.
- ``run(menu_items, config)`` — full interactive screen loop.
"""

from __future__ import annotations

from config import CliConfig
from screens.internal_transfers.actions import (
    create_transfer,
    delete_transfer,
    edit_transfer,
)
from screens.internal_transfers.data import fetch_transfers
from screens.internal_transfers.models import ACTION_KEYS, ACTION_LABELS, MENU_KEY
from screens.internal_transfers.render import build_body, render_table
from utils.api_errors import api_error_message
from utils.debug_shortcuts import handle_debug_restart
from utils.money import fetch_active_accounts
from utils.navigation import read_key
from utils.pagination import next_page, previous_page
from utils.render import flash_action, render_screen
from utils.selection import process_selection_key


# ── Sidebar preview ──────────────────────────────────────────


def render_body(config: CliConfig) -> str:
    """Return a short summary for the sidebar when this screen is inactive."""
    try:
        transfers = fetch_transfers(config)
    except Exception as exc:
        return (
            "Internal Transfers\n\n"
            f"Could not load transfers: {api_error_message(exc)}"
        )
    return (
        "Internal Transfers\n\n"
        f"Transfers found: {len(transfers)}\n"
        "Open this screen to add, edit, or delete transfers."
    )


# ── Main loop ────────────────────────────────────────────────


def run(menu_items: list[tuple[str, str]], config: CliConfig) -> None:
    """Interactive internal-transfers browser with full CRUD support."""
    active_action = "9"
    page = 0
    message: str | None = None

    while True:
        # ── Fetch data ────────────────────────────────────────
        try:
            accounts = fetch_active_accounts(config)
            transfers = fetch_transfers(config)
        except Exception as exc:
            body = (
                "Internal Transfers\n\n"
                f"Could not load data: {api_error_message(exc)}\n\n"
                "B/ESC  Back"
            )
            render_screen(menu_items, MENU_KEY, body, interaction_area="content")
            key = read_key()
            handle_debug_restart(key)
            if key in {"b", "B", "ESC"}:
                return
            continue

        # ── Build table and body ──────────────────────────────
        table_text, total_pages = render_table(transfers, page)

        # Clamp page if data shrank
        if page >= total_pages:
            page = max(0, total_pages - 1)
            table_text, total_pages = render_table(transfers, page)

        body = build_body(
            active_action, "content", transfers,
            page, total_pages, table_text, message=message,
        )
        body_builder = lambda: build_body(
            active_action, "input", transfers,
            page, total_pages, table_text, message=message,
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
            message = create_transfer(menu_items, config, accounts, body_builder)
            page = 0
            continue

        if event.choice == "2":
            message = edit_transfer(
                menu_items, config, transfers, accounts, body_builder,
            )
            continue

        if event.choice == "3":
            message = delete_transfer(
                menu_items, config, transfers, body_builder,
            )
            continue

        if event.choice == "5":
            message = "Data refreshed."
            continue

        if event.choice == "9":
            return
