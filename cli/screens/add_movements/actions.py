"""High-level user actions: commit drafts, edit a draft, delete a draft, exit safely.

Each function handles its own confirmation prompts and returns a status
message string that the main loop can display.
"""

from __future__ import annotations

from config import CliConfig
from functions import api
from screens.add_movements.data import mark_account_updated
from screens.add_movements.drafts import format_draft_value
from screens.add_movements.models import DraftMovement
from screens.add_movements.wizard import prompt_movement
from utils.api_errors import api_error_message
from utils.currencies import format_money
from utils.inline_input import BodyBuilderFn, prompt_inline_numbered_choice
from utils.render import render_screen


# ── Type aliases ──────────────────────────────────────────────

MenuItems = list[tuple[str, str]]


# ── Commit ────────────────────────────────────────────────────


def commit_drafts(
    menu_items: MenuItems,
    config: CliConfig,
    account: dict,
    drafts: list[DraftMovement],
    body_builder: BodyBuilderFn,
) -> str:
    """POST all draft movements to ``/movements/bulk`` after user confirmation.

    Returns a human-readable status message.  On success the caller should
    clear the draft list.
    """
    if not drafts:
        return "Nothing to commit."

    from screens.add_movements.drafts import projected_balance_cents

    projected = projected_balance_cents(int(account["total_balance"]), drafts)
    currency = str(account["currency"])

    confirm = prompt_inline_numbered_choice(
        menu_items=menu_items,
        menu_active_key="3",
        label="Commit drafts",
        options=[
            (
                f"Yes, commit {len(drafts)} movement(s) "
                f"(projected balance: {format_money(projected / 100.0, currency)})"
            ),
            "No, cancel",
        ],
        body_builder=body_builder,
        render_screen=render_screen,
        interaction_area="content",
    )
    if confirm is None or confirm == "No, cancel":
        return "Commit canceled."

    payload = {
        "movements": [
            {
                "movement": row.movement,
                "description": row.description,
                "account_id": row.account_id,
                "value": row.value,
                "type": row.type,
                "date": row.date,
                "category_id": row.category_id,
                "sub_category_id": row.sub_category_id,
                "repetitive_movement_id": row.repetitive_movement_id,
                "invoice": 0,
                "active": 1,
            }
            for row in drafts
        ]
    }
    try:
        created = api.post(config.api_base_url, "/movements/bulk", payload)
    except Exception as exc:
        return f"Commit failed: {api_error_message(exc)}"

    # Offer to flag the account as "updated" (convenience for the user).
    mark_choice = prompt_inline_numbered_choice(
        menu_items=menu_items,
        menu_active_key="3",
        label="Mark account as updated?",
        options=["Yes", "No"],
        body_builder=body_builder,
        render_screen=render_screen,
        interaction_area="content",
    )
    if mark_choice == "Yes":
        mark_msg = mark_account_updated(config, int(account["id"]))
        return f"Committed {len(created)} movement(s). {mark_msg}"
    return f"Committed {len(created)} movement(s)."


# ── Edit draft ────────────────────────────────────────────────


def edit_draft(
    menu_items: MenuItems,
    config: CliConfig,
    account: dict,
    drafts: list[DraftMovement],
    categories: list[dict],
    sub_categories: list[dict],
    repetitive: list[dict],
    body_builder: BodyBuilderFn,
) -> str:
    """Let the user pick a draft from the list and re-enter its fields.

    Mutates *drafts* in place on success.
    """
    if not drafts:
        return "No draft movements to edit."

    currency = str(account["currency"])
    options = [
        (
            f"{row.date} | {row.type} | {row.movement} | "
            f"{format_draft_value(row.value, currency)}"
        )
        for row in drafts
    ]

    picked = prompt_inline_numbered_choice(
        menu_items=menu_items,
        menu_active_key="3",
        label="Choose draft to edit",
        options=options,
        body_builder=body_builder,
        render_screen=render_screen,
        interaction_area="content",
    )
    if picked is None:
        return "Edit canceled."

    edit_index = options.index(picked)
    edited = prompt_movement(
        menu_items,
        config,
        account,
        categories,
        sub_categories,
        repetitive,
        body_builder,
        initial=drafts[edit_index],
    )
    if edited is None:
        return "Edit canceled."

    drafts[edit_index] = edited
    return "Draft movement updated."


# ── Delete draft ──────────────────────────────────────────────


def delete_draft(
    menu_items: MenuItems,
    account: dict,
    drafts: list[DraftMovement],
    body_builder: BodyBuilderFn,
) -> str:
    """Let the user pick a draft to remove from the list.

    Mutates *drafts* in place on success.
    """
    if not drafts:
        return "No draft movements to delete."

    currency = str(account["currency"])
    options = [
        (
            f"{row.date} | {row.type} | {row.movement} | "
            f"{format_draft_value(row.value, currency)}"
        )
        for row in drafts
    ]

    picked = prompt_inline_numbered_choice(
        menu_items=menu_items,
        menu_active_key="3",
        label="Choose draft to delete",
        options=options,
        body_builder=body_builder,
        render_screen=render_screen,
        interaction_area="content",
    )
    if picked is None:
        return "Delete canceled."

    delete_index = options.index(picked)

    confirm = prompt_inline_numbered_choice(
        menu_items=menu_items,
        menu_active_key="3",
        label=f"Delete draft '{drafts[delete_index].movement}'?",
        options=["Yes, delete", "No, cancel"],
        body_builder=body_builder,
        render_screen=render_screen,
        interaction_area="content",
    )
    if confirm != "Yes, delete":
        return "Delete canceled."

    removed = drafts.pop(delete_index)
    return f"Deleted draft: {removed.movement}"


# ── Exit with confirmation ────────────────────────────────────


def confirm_exit(
    menu_items: MenuItems,
    drafts: list[DraftMovement],
    body_builder: BodyBuilderFn,
    label: str = "Leave with uncommitted drafts?",
) -> bool:
    """Two-step exit confirmation when there are uncommitted drafts.

    Returns ``True`` if the user confirms they want to leave, ``False``
    otherwise.  If there are no drafts, returns ``True`` immediately.
    """
    if not drafts:
        return True

    first = prompt_inline_numbered_choice(
        menu_items=menu_items,
        menu_active_key="3",
        label=label,
        options=["No, keep editing", "Yes, continue"],
        body_builder=body_builder,
        render_screen=render_screen,
        interaction_area="content",
    )
    if first != "Yes, continue":
        return False

    second = prompt_inline_numbered_choice(
        menu_items=menu_items,
        menu_active_key="3",
        label="Confirm discard drafts",
        options=["Discard drafts and exit", "Cancel"],
        body_builder=body_builder,
        render_screen=render_screen,
        interaction_area="content",
    )
    return second == "Discard drafts and exit"
