"""User-facing action handlers for the Movements screen.

Each function encapsulates one action flow (account selection, movement
editing) and returns a result that the main loop can act on.
"""

from __future__ import annotations

from config import CliConfig
from functions import api
from screens.movements.data import movement_display_value
from screens.movements.models import MENU_KEY, MovementEditDraft
from screens.movements.wizard import prompt_edit
from utils.api_errors import api_error_message
from utils.currencies import format_money
from utils.inline_input import prompt_inline_numbered_choice
from utils.render import render_screen
from utils.table import clip


def choose_account(
    menu_items: list[tuple[str, str]],
    accounts: list[dict],
    body_builder,
) -> dict | None:
    """Prompt the user to pick a bank-account filter.

    Returns:
        - A full account dict when the user picks an account.
        - An empty dict ``{}`` when the user picks "All active accounts".
        - ``None`` when the user cancels.
    """
    sorted_accounts = sorted(
        accounts,
        key=lambda row: (
            str(row["owner"]).lower(),
            str(row["account"]).lower(),
        ),
    )
    options = ["All active accounts"] + [
        f"{row['account']} ({row['owner']}) | "
        f"{format_money(float(row['total_balance']) / 100.0, str(row['currency']))}"
        for row in sorted_accounts
    ]

    selected = prompt_inline_numbered_choice(
        menu_items=menu_items,
        menu_active_key=MENU_KEY,
        label="Bank account filter",
        options=options,
        body_builder=body_builder,
        render_screen=render_screen,
        interaction_area="content",
    )
    if selected is None:
        return None
    if selected == "All active accounts":
        return {}
    return sorted_accounts[options.index(selected) - 1]


def edit_movement(
    menu_items: list[tuple[str, str]],
    config: CliConfig,
    rows: list[dict],
    categories: list[dict],
    sub_categories: list[dict],
    repetitive: list[dict],
    body_builder,
) -> str:
    """Run the full edit-movement flow: pick → wizard → API call.

    Returns a user-facing result message string.
    """
    if not rows:
        return "No movements to edit."

    # Build the movement picker options
    movement_options = [
        f"[[group:{'green' if str(r['type']) == 'Income' else 'red'}]]"
        f"{clip(' '.join(str(r['movement']).split()), 24)}"
        f"[[/group]] | "
        f"{format_money(movement_display_value(r), str(r['currency']))} | "
        f"{' '.join(str(r['date']).split())}"
        for r in rows
    ]

    selected = prompt_inline_numbered_choice(
        menu_items=menu_items,
        menu_active_key=MENU_KEY,
        label="Choose movement to edit",
        options=movement_options,
        body_builder=body_builder,
        render_screen=render_screen,
        interaction_area="content",
        option_text_width=40,
    )
    if selected is None:
        return "Edit canceled."

    target_row = rows[movement_options.index(selected)]

    # Run the multi-step wizard
    draft = prompt_edit(
        menu_items, config, target_row,
        categories, sub_categories, repetitive,
        body_builder,
    )
    if draft is None:
        return "Edit canceled."

    # Submit the update
    payload = {
        "movement": draft.movement,
        "description": draft.description,
        "account_id": draft.account_id,
        "value": draft.value,
        "type": draft.type,
        "date": draft.movement_date,
        "category_id": draft.category_id,
        "sub_category_id": draft.sub_category_id,
        "repetitive_movement_id": draft.repetitive_movement_id,
        "movement_code": draft.movement_code,
        "invoice": draft.invoice,
    }
    try:
        api.put(config.api_base_url, f"/movements/{target_row['id']}", payload)
        return f"Movement {target_row['id']} updated."
    except Exception as exc:
        return f"Update failed: {api_error_message(exc)}"
