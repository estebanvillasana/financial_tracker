"""Add Movements screen — build a draft grid, then bulk-commit to the API.

Public API consumed by ``app.py``:

* :func:`render_body` — lightweight preview for the main-menu sidebar.
* :func:`run`         — full interactive workflow.

Package layout
--------------
models.py   Data model (``DraftMovement``) and action-menu constants.
data.py     API calls: account selection, reference loading, helpers.
drafts.py   Draft-table rendering and projected-balance math (pure).
wizard.py   Multi-step form for creating / editing a single draft.
actions.py  High-level actions: commit, edit, delete, exit confirmation.
render.py   Body-text assembly (summary + grid + action panel).
"""

from __future__ import annotations

from config import CliConfig
from screens.add_movements.actions import (
    commit_drafts,
    confirm_exit,
    delete_draft,
    edit_draft,
)
from screens.add_movements.data import (
    fetch_last_movement_date,
    load_references,
    refresh_account,
    select_account,
)
from screens.add_movements.models import (
    ACTION_KEYS,
    ACTION_LABELS,
    DraftMovement,
)
from screens.add_movements.render import build_body
from screens.add_movements.wizard import prompt_movement
from utils.api_errors import api_error_message
from utils.debug_shortcuts import handle_debug_restart
from utils.money import fetch_active_accounts
from utils.navigation import read_key
from utils.render import flash_action, render_screen
from utils.selection import process_selection_key


# ── Preview (main-menu sidebar) ──────────────────────────────


def render_body(config: CliConfig) -> str:
    """Return the preview text shown while the user is on the main menu."""
    try:
        accounts = fetch_active_accounts(config)
    except Exception as exc:
        return (
            "Add New Movements\n\n"
            f"Could not load active accounts: {api_error_message(exc)}"
        )
    return (
        "Add New Movements\n\n"
        f"Active accounts available: {len(accounts)}\n"
        "Open this screen to pick an account and build a draft grid."
    )


# ── Error helper ──────────────────────────────────────────────


def _show_error_and_wait(
    menu_items: list[tuple[str, str]],
    body: str,
) -> None:
    """Render an error body and block until the user presses B/ESC."""
    while True:
        render_screen(menu_items, "3", body, interaction_area="content")
        key = read_key()
        handle_debug_restart(key)
        if key in {"b", "B", "ESC"}:
            return


# ── Interactive screen ────────────────────────────────────────


def run(menu_items: list[tuple[str, str]], config: CliConfig) -> None:
    """Full Add-Movements workflow: select account → build drafts → commit."""

    # ── 1. Account selection ──────────────────────────────────
    account = select_account(menu_items, config)
    if account is None:
        _show_error_and_wait(
            menu_items,
            "Add New Movements\n\nNo active bank account selected.\n\nB/ESC  Back",
        )
        return

    # ── 2. Load reference data ────────────────────────────────
    try:
        categories, sub_categories, repetitive = load_references(config)
    except Exception as exc:
        _show_error_and_wait(
            menu_items,
            f"Add New Movements\n\nCould not load references: {api_error_message(exc)}\n\nB/ESC  Back",
        )
        return

    # ── 3. Main loop ──────────────────────────────────────────
    drafts: list[DraftMovement] = []
    active_action = "1"
    message: str | None = None

    while True:
        # Refresh account balance each iteration so projected balance stays
        # accurate after commits.
        try:
            account = refresh_account(config, int(account["id"]))
            last_date = fetch_last_movement_date(config, int(account["id"]))
        except Exception as exc:
            _show_error_and_wait(
                menu_items,
                (
                    "Add New Movements\n\n"
                    f"Could not refresh account data: {api_error_message(exc)}\n\n"
                    "B/ESC  Back"
                ),
            )
            return

        # Build the body text for content mode and a lambda for input mode.
        body_builder = lambda: build_body(
            account, last_date, drafts, active_action, "input", message=message,
        )
        body = build_body(
            account, last_date, drafts, active_action, "content", message=message,
        )

        render_screen(menu_items, "3", body, interaction_area="content")
        pressed_key = read_key()
        handle_debug_restart(pressed_key)

        # ── Back / ESC ────────────────────────────────────────
        if pressed_key in {"b", "B", "ESC"}:
            if confirm_exit(menu_items, drafts, body_builder):
                return
            continue

        # ── Arrow / number selection ──────────────────────────
        event = process_selection_key(pressed_key, active_action, ACTION_KEYS)
        active_action = event.active_key
        if event.moved or event.choice is None:
            continue

        if event.enter_pressed:
            flash_action(
                menu_items, "3", body,
                ACTION_LABELS.get(event.choice, "Action"),
                interaction_area="content",
            )

        # ── Action 1: Add new draft ──────────────────────────
        if event.choice == "1":
            draft = prompt_movement(
                menu_items, config, account,
                categories, sub_categories, repetitive,
                body_builder,
            )
            if draft is None:
                message = "Draft canceled."
            else:
                drafts.append(draft)
                message = "Draft movement added."
            continue

        # ── Action 2: Commit all drafts ──────────────────────
        if event.choice == "2":
            message = commit_drafts(
                menu_items, config, account, drafts, body_builder,
            )
            if message.startswith("Committed"):
                drafts.clear()
            continue

        # ── Action 3: Edit a draft ───────────────────────────
        if event.choice == "3":
            message = edit_draft(
                menu_items, config, account, drafts,
                categories, sub_categories, repetitive,
                body_builder,
            )
            continue

        # ── Action 4: Delete a draft ─────────────────────────
        if event.choice == "4":
            message = delete_draft(
                menu_items, account, drafts, body_builder,
            )
            continue

        # ── Action 5: Exit ───────────────────────────────────
        if event.choice == "5":
            if confirm_exit(
                menu_items, drafts, body_builder,
                label="Exit with uncommitted drafts?",
            ):
                return
            message = "Exit canceled."
            continue
