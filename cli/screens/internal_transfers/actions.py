"""User-facing action handlers for the Internal Transfers screen.

Each function encapsulates one action flow (create, edit, delete) and
returns a user-facing result message string for the main loop to display.
"""

from __future__ import annotations

from config import CliConfig
from functions import api
from screens.internal_transfers.models import MENU_KEY
from screens.internal_transfers.wizard import prompt_transfer
from utils.api_errors import api_error_message
from utils.currencies import format_money
from utils.inline_input import prompt_inline_numbered_choice
from utils.render import render_screen
from utils.table import clip


# ── Transfer picker helper ─────────────────────────────────────


def _pick_transfer(
    menu_items: list[tuple[str, str]],
    transfers: list[dict],
    label: str,
    body_builder,
) -> dict | None:
    """Show a numbered list of transfers and return the chosen one, or None."""
    if not transfers:
        return None
    options = [
        f"{r['date']} | "
        f"{clip(str(r['send_account_name']), 14)} → {clip(str(r['receive_account_name']), 14)} | "
        f"{format_money(float(r['sent_value']) / 100.0, str(r['send_currency']))} → "
        f"{format_money(float(r['received_value']) / 100.0, str(r['receive_currency']))}"
        for r in transfers
    ]
    selected = prompt_inline_numbered_choice(
        menu_items=menu_items,
        menu_active_key=MENU_KEY,
        label=label,
        options=options,
        body_builder=body_builder,
        render_screen=render_screen,
        interaction_area="content",
        option_text_width=60,
    )
    if selected is None:
        return None
    return transfers[options.index(selected)]


# ── Create ─────────────────────────────────────────────────────


def create_transfer(
    menu_items: list[tuple[str, str]],
    config: CliConfig,
    accounts: list[dict],
    body_builder,
) -> str:
    """Run the create-transfer wizard and POST to the API.

    Returns a user-facing result message.
    """
    draft = prompt_transfer(menu_items, config, accounts, body_builder)
    if draft is None:
        return "Transfer canceled."
    payload = {
        "description": draft.description,
        "date": draft.movement_date,
        "send_account_id": draft.send_account_id,
        "sent_value": draft.sent_value,
        "receive_account_id": draft.receive_account_id,
        "received_value": draft.received_value,
        "active": 1,
    }
    try:
        created = api.post(config.api_base_url, "/money-transfers", payload)
    except Exception as exc:
        return f"Create failed: {api_error_message(exc)}"
    sent_fmt = format_money(draft.sent_value / 100.0, draft.send_currency)
    recv_fmt = format_money(draft.received_value / 100.0, draft.receive_currency)
    return (
        f"Transfer created ({created['movement_code']}): "
        f"{draft.send_account_name} {sent_fmt} → {draft.receive_account_name} {recv_fmt}"
    )


# ── Edit ───────────────────────────────────────────────────────


def edit_transfer(
    menu_items: list[tuple[str, str]],
    config: CliConfig,
    transfers: list[dict],
    accounts: list[dict],
    body_builder,
) -> str:
    """Pick a transfer, run the wizard pre-filled, then PUT to the API.

    Returns a user-facing result message.
    """
    target = _pick_transfer(
        menu_items, transfers, "Choose transfer to edit", body_builder,
    )
    if target is None:
        return "Edit canceled."

    draft = prompt_transfer(
        menu_items, config, accounts, body_builder, initial=target,
    )
    if draft is None:
        return "Edit canceled."

    payload = {
        "description": draft.description,
        "date": draft.movement_date,
        "send_account_id": draft.send_account_id,
        "sent_value": draft.sent_value,
        "receive_account_id": draft.receive_account_id,
        "received_value": draft.received_value,
    }
    movement_code = str(target["movement_code"])
    try:
        api.put(config.api_base_url, f"/money-transfers/{movement_code}", payload)
    except Exception as exc:
        return f"Update failed: {api_error_message(exc)}"
    sent_fmt = format_money(draft.sent_value / 100.0, draft.send_currency)
    recv_fmt = format_money(draft.received_value / 100.0, draft.receive_currency)
    return (
        f"Transfer {movement_code} updated: "
        f"{draft.send_account_name} {sent_fmt} → {draft.receive_account_name} {recv_fmt}"
    )


# ── Delete ─────────────────────────────────────────────────────


def delete_transfer(
    menu_items: list[tuple[str, str]],
    config: CliConfig,
    transfers: list[dict],
    body_builder,
) -> str:
    """Pick a transfer, confirm, then DELETE from the API.

    Returns a user-facing result message.
    """
    target = _pick_transfer(
        menu_items, transfers, "Choose transfer to delete", body_builder,
    )
    if target is None:
        return "Delete canceled."

    movement_code = str(target["movement_code"])
    sent_fmt = format_money(
        float(target["sent_value"]) / 100.0, str(target["send_currency"])
    )
    recv_fmt = format_money(
        float(target["received_value"]) / 100.0, str(target["receive_currency"])
    )
    summary = (
        f"{target['date']} | "
        f"{target['send_account_name']} {sent_fmt} → "
        f"{target['receive_account_name']} {recv_fmt}"
    )

    # Two-step confirmation to prevent accidental deletes
    confirm = prompt_inline_numbered_choice(
        menu_items=menu_items,
        menu_active_key=MENU_KEY,
        label=f"Delete: {clip(summary, 55)}",
        options=["Yes, delete this transfer", "No, cancel"],
        body_builder=body_builder,
        render_screen=render_screen,
        interaction_area="content",
    )
    if confirm != "Yes, delete this transfer":
        return "Delete canceled."

    try:
        api.delete(config.api_base_url, f"/money-transfers/{movement_code}")
    except Exception as exc:
        return f"Delete failed: {api_error_message(exc)}"
    return f"Transfer {movement_code} deleted."
