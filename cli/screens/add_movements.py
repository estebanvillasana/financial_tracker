from __future__ import annotations

import json
import urllib.error
from dataclasses import dataclass
from datetime import date
from decimal import Decimal
from decimal import InvalidOperation
from typing import Literal

from config import CliConfig
from functions import api
from utils.currencies import code_plus_symbol
from utils.currencies import format_money
from utils.inline_input import prompt_inline_numbered_choice
from utils.inline_input import prompt_inline_text
from utils.navigation import read_key
from utils.render import flash_action
from utils.render import render_screen
from utils.rich_ui import render_selectable_list
from utils.selection import process_selection_key


RenderMode = Literal["preview", "content", "input"]
ACTIONS = [
    ("1", "Add New Movement"),
    ("2", "Commit"),
    ("3", "Edit Draft Movement"),
    ("4", "Exit"),
]
ACTION_KEYS = [key for key, _ in ACTIONS]
ACTION_LABELS = {key: label for key, label in ACTIONS}


@dataclass
class DraftMovement:
    movement: str
    description: str | None
    account_id: int
    value: int
    type: Literal["Income", "Expense"]
    date: str
    category_id: int | None
    category: str | None
    sub_category_id: int | None
    sub_category: str | None
    repetitive_movement_id: int | None
    repetitive_movement: str | None


def _api_error_message(exc: Exception) -> str:
    if isinstance(exc, urllib.error.HTTPError):
        try:
            body = exc.read().decode("utf-8")
            payload = json.loads(body) if body else {}
            detail = payload.get("detail")
            if detail:
                return f"{exc.code}: {detail}"
        except Exception:
            pass
        return f"{exc.code}: {exc.reason}"
    return str(exc)


def _fetch_active_accounts(config: CliConfig) -> list[dict]:
    return api.get(config.api_base_url, "/bank-accounts?active=1")


def _fetch_references(config: CliConfig) -> tuple[list[dict], list[dict], list[dict]]:
    categories = api.get(config.api_base_url, "/categories?active=1")
    sub_categories = api.get(config.api_base_url, "/sub-categories?active=1")
    repetitive = api.get(config.api_base_url, "/repetitive-movements?active=1&limit=500")
    return categories, sub_categories, repetitive


def _fetch_last_movement_date(config: CliConfig, account_id: int) -> str:
    rows = api.get(config.api_base_url, f"/movements?account_id={account_id}&active=1&limit=1")
    if not rows:
        return "—"
    return str(rows[0].get("date") or "—")


def _parse_major_to_cents(typed_value: str) -> int | None:
    value = typed_value.strip()
    if not value:
        return None
    try:
        major = Decimal(value)
    except InvalidOperation:
        return None
    if major <= 0:
        return None
    cents = int((major * Decimal("100")).quantize(Decimal("1")))
    if cents == 0:
        return None
    return cents


def _format_draft_value(cents: int, currency: str) -> str:
    return format_money(float(cents) / 100.0, currency)


def _projected_balance_cents(current_total_cents: int, drafts: list[DraftMovement]) -> int:
    delta = 0
    for row in drafts:
        delta += row.value if row.type == "Income" else -row.value
    return current_total_cents + delta


def _render_draft_rows(drafts: list[DraftMovement], currency: str) -> str:
    if not drafts:
        return "No draft movements yet."
    lines = []
    for index, row in enumerate(drafts, start=1):
        lines.append(
            f"{index:>2}. {row.date} | {row.type:<7} | {row.movement} | "
            f"{_format_draft_value(row.value, currency)} | "
            f"{row.category or '—'} / {row.sub_category or '—'}"
        )
    return "\n".join(lines)


def _build_body(
    account: dict,
    last_movement_date: str,
    drafts: list[DraftMovement],
    active_action: str,
    mode: RenderMode,
    message: str | None = None,
) -> str:
    show_action_cursor = mode == "content"
    highlight_active = mode == "input"
    action_lines = render_selectable_list(
        ACTIONS,
        active_action,
        show_cursor=show_action_cursor,
        highlight_active=highlight_active,
        indent=1,
    )

    current_total = int(account["total_balance"])
    projected_total = _projected_balance_cents(current_total, drafts)
    currency = str(account["currency"])
    summary = (
        "Add New Movements\n"
        "\n"
        f"Account: {account['account']} ({account['owner']})\n"
        f"Currency: {code_plus_symbol(currency)}\n"
        f"Current Balance: {format_money(current_total / 100.0, currency)}\n"
        f"Last Movement Date: {last_movement_date}\n"
        f"Draft Movements: {len(drafts)}\n"
        f"Projected Balance After Commit: {format_money(projected_total / 100.0, currency)}"
    )
    sections = [
        summary,
        "",
        "Draft Grid",
        _render_draft_rows(drafts, currency),
        "",
        "Actions",
        action_lines,
        "",
        "Flow: add draft rows -> commit all with POST /movements/bulk.",
    ]
    if message:
        sections.extend(["", f"Result: {message}"])
    return "\n".join(sections)


def render_body(config: CliConfig) -> str:
    try:
        accounts = _fetch_active_accounts(config)
    except Exception as exc:
        return f"Add New Movements\n\nCould not load active accounts: {_api_error_message(exc)}"
    return (
        "Add New Movements\n\n"
        f"Active accounts available: {len(accounts)}\n"
        "Open this screen to pick an account and build a draft grid."
    )


def _select_account(menu_items: list[tuple[str, str]], config: CliConfig) -> dict | None:
    try:
        accounts = _fetch_active_accounts(config)
    except Exception:
        return None
    if not accounts:
        return None
    sorted_accounts = sorted(accounts, key=lambda row: (str(row["owner"]).lower(), str(row["account"]).lower()))
    options = [
        f"{row['account']} ({row['owner']}) | "
        f"{format_money(float(row['total_balance']) / 100.0, str(row['currency']))}"
        for row in sorted_accounts
    ]
    selected = prompt_inline_numbered_choice(
        menu_items=menu_items,
        menu_active_key="3",
        label="Bank account",
        options=options,
        body_builder=lambda: "Add New Movements\n\nSelect an active bank account.",
        render_screen=render_screen,
        interaction_area="content",
    )
    if selected is None:
        return None
    return sorted_accounts[options.index(selected)]


def _prompt_movement_payload(
    menu_items: list[tuple[str, str]],
    config: CliConfig,
    account: dict,
    categories: list[dict],
    sub_categories: list[dict],
    repetitive: list[dict],
    body_builder,
    initial: DraftMovement | None = None,
) -> DraftMovement | None:
    initial_name = initial.movement if initial else ""
    name = prompt_inline_text(
        menu_items=menu_items,
        menu_active_key="3",
        label="Movement",
        initial_value=initial_name,
        body_builder=body_builder,
        render_screen=render_screen,
        interaction_area="content",
        min_length=1,
    )
    if name is None:
        return None

    initial_description = initial.description or "" if initial else ""
    description = prompt_inline_text(
        menu_items=menu_items,
        menu_active_key="3",
        label="Description (optional)",
        initial_value=initial_description,
        body_builder=body_builder,
        render_screen=render_screen,
        interaction_area="content",
        min_length=0,
    )
    if description is None:
        return None
    normalized_description = description.strip() or None

    type_options: list[str] = ["Income", "Expense"]
    if initial is not None and initial.type == "Expense":
        type_options = ["Expense", "Income"]
    picked_type = prompt_inline_numbered_choice(
        menu_items=menu_items,
        menu_active_key="3",
        label="Type",
        options=type_options,
        body_builder=body_builder,
        render_screen=render_screen,
        interaction_area="content",
    )
    if picked_type is None:
        return None
    movement_type = picked_type

    initial_major = f"{(initial.value / 100.0):.2f}" if initial else ""
    amount_cents: int | None = None
    while amount_cents is None:
        amount_text = prompt_inline_text(
            menu_items=menu_items,
            menu_active_key="3",
            label="Value (major units, e.g. 21.34)",
            initial_value=initial_major,
            body_builder=body_builder,
            render_screen=render_screen,
            interaction_area="content",
            min_length=1,
        )
        if amount_text is None:
            return None
        amount_cents = _parse_major_to_cents(amount_text)
        if amount_cents is None:
            initial_major = amount_text
            continue
        initial_major = amount_text

    type_categories = [row for row in categories if str(row["type"]) == movement_type]
    if not type_categories:
        return None
    sorted_categories = sorted(type_categories, key=lambda row: str(row["category"]).lower())
    category_options = [str(row["category"]) for row in sorted_categories]
    category_pick = prompt_inline_numbered_choice(
        menu_items=menu_items,
        menu_active_key="3",
        label="Category",
        options=category_options,
        body_builder=body_builder,
        render_screen=render_screen,
        interaction_area="content",
    )
    if category_pick is None:
        return None
    category_row = sorted_categories[category_options.index(category_pick)]
    category_id = int(category_row["id"])
    category_name = str(category_row["category"])

    valid_sub_categories = [row for row in sub_categories if int(row["category_id"]) == category_id]
    sorted_subs = sorted(valid_sub_categories, key=lambda row: str(row["sub_category"]).lower())
    sub_options = ["(None)"] + [str(row["sub_category"]) for row in sorted_subs]
    sub_pick = prompt_inline_numbered_choice(
        menu_items=menu_items,
        menu_active_key="3",
        label="Sub-category (optional)",
        options=sub_options,
        body_builder=body_builder,
        render_screen=render_screen,
        interaction_area="content",
    )
    if sub_pick is None:
        return None
    sub_id: int | None = None
    sub_name: str | None = None
    if sub_pick != "(None)":
        sub_row = sorted_subs[sub_options.index(sub_pick) - 1]
        sub_id = int(sub_row["id"])
        sub_name = str(sub_row["sub_category"])

    default_date = initial.date if initial else date.today().isoformat()
    movement_date = None
    while movement_date is None:
        date_input = prompt_inline_text(
            menu_items=menu_items,
            menu_active_key="3",
            label="Date (YYYY-MM-DD)",
            initial_value=default_date,
            body_builder=body_builder,
            render_screen=render_screen,
            interaction_area="content",
            min_length=10,
        )
        if date_input is None:
            return None
        try:
            date.fromisoformat(date_input.strip())
            movement_date = date_input.strip()
        except ValueError:
            default_date = date_input.strip()

    rep_candidates = [row for row in repetitive if str(row["type"]) == movement_type]
    sorted_rep = sorted(rep_candidates, key=lambda row: str(row["movement"]).lower())
    rep_options = ["(None)"] + [str(row["movement"]) for row in sorted_rep]
    rep_pick = prompt_inline_numbered_choice(
        menu_items=menu_items,
        menu_active_key="3",
        label="Repetitive movement (optional)",
        options=rep_options,
        body_builder=body_builder,
        render_screen=render_screen,
        interaction_area="content",
    )
    if rep_pick is None:
        return None
    rep_id: int | None = None
    rep_name: str | None = None
    if rep_pick != "(None)":
        rep_row = sorted_rep[rep_options.index(rep_pick) - 1]
        rep_id = int(rep_row["id"])
        rep_name = str(rep_row["movement"])

    confirm = prompt_inline_numbered_choice(
        menu_items=menu_items,
        menu_active_key="3",
        label="Confirm movement draft",
        options=["Yes, add/update draft", "No, cancel"],
        body_builder=body_builder,
        render_screen=render_screen,
        interaction_area="content",
    )
    if confirm != "Yes, add/update draft":
        return None

    return DraftMovement(
        movement=name.strip(),
        description=normalized_description,
        account_id=int(account["id"]),
        value=amount_cents,
        type=movement_type,
        date=movement_date,
        category_id=category_id,
        category=category_name,
        sub_category_id=sub_id,
        sub_category=sub_name,
        repetitive_movement_id=rep_id,
        repetitive_movement=rep_name,
    )


def _mark_account_updated(config: CliConfig, account_id: int) -> str:
    try:
        account = api.get(config.api_base_url, f"/bank-accounts/{account_id}")
        payload = {
            "account": account["account"],
            "description": account.get("description"),
            "type": account["type"],
            "owner": account["owner"],
            "currency": str(account["currency"]).lower(),
            "initial_balance": int(account["initial_balance"]),
            "updated": 1,
        }
        api.put(config.api_base_url, f"/bank-accounts/{account_id}", payload)  # type: ignore[attr-defined]
        return "Account marked as updated."
    except Exception as exc:
        return f"Could not mark account updated: {_api_error_message(exc)}"


def _commit_drafts(
    menu_items: list[tuple[str, str]],
    config: CliConfig,
    account: dict,
    drafts: list[DraftMovement],
    body_builder,
) -> str:
    if not drafts:
        return "Nothing to commit."
    projected = _projected_balance_cents(int(account["total_balance"]), drafts)
    confirm = prompt_inline_numbered_choice(
        menu_items=menu_items,
        menu_active_key="3",
        label="Commit drafts",
        options=[
            f"Yes, commit {len(drafts)} movements (projected balance: {format_money(projected / 100.0, str(account['currency']))})",
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
        return f"Commit failed: {_api_error_message(exc)}"

    mark_updated = prompt_inline_numbered_choice(
        menu_items=menu_items,
        menu_active_key="3",
        label="Mark account as updated?",
        options=["Yes", "No"],
        body_builder=body_builder,
        render_screen=render_screen,
        interaction_area="content",
    )
    if mark_updated == "Yes":
        return f"Committed {len(created)} movements. {_mark_account_updated(config, int(account['id']))}"
    return f"Committed {len(created)} movements."


def run(menu_items: list[tuple[str, str]], config: CliConfig) -> None:
    account = _select_account(menu_items, config)
    if account is None:
        body = "Add New Movements\n\nNo active bank account selected.\n\nB/ESC  Back"
        while True:
            render_screen(menu_items, "3", body, interaction_area="content")
            if read_key() in {"b", "B", "ESC"}:
                return

    try:
        categories, sub_categories, repetitive = _fetch_references(config)
    except Exception as exc:
        body = f"Add New Movements\n\nCould not load references: {_api_error_message(exc)}\n\nB/ESC  Back"
        while True:
            render_screen(menu_items, "3", body, interaction_area="content")
            if read_key() in {"b", "B", "ESC"}:
                return

    drafts: list[DraftMovement] = []
    active_action = "1"
    message: str | None = None

    while True:
        try:
            account = api.get(config.api_base_url, f"/bank-accounts/{account['id']}")
            last_date = _fetch_last_movement_date(config, int(account["id"]))
        except Exception as exc:
            body = f"Add New Movements\n\nCould not refresh account data: {_api_error_message(exc)}\n\nB/ESC  Back"
            render_screen(menu_items, "3", body, interaction_area="content")
            if read_key() in {"b", "B", "ESC"}:
                return
            continue

        body_builder = lambda: _build_body(account, last_date, drafts, active_action, "input", message=message)
        body = _build_body(account, last_date, drafts, active_action, "content", message=message)
        render_screen(menu_items, "3", body, interaction_area="content")
        pressed_key = read_key()

        if pressed_key in {"b", "B", "ESC"}:
            if drafts:
                first = prompt_inline_numbered_choice(
                    menu_items=menu_items,
                    menu_active_key="3",
                    label="Leave with uncommitted drafts?",
                    options=["No, keep editing", "Yes, continue"],
                    body_builder=body_builder,
                    render_screen=render_screen,
                    interaction_area="content",
                )
                if first != "Yes, continue":
                    continue
                second = prompt_inline_numbered_choice(
                    menu_items=menu_items,
                    menu_active_key="3",
                    label="Confirm discard drafts",
                    options=["Discard drafts and exit", "Cancel"],
                    body_builder=body_builder,
                    render_screen=render_screen,
                    interaction_area="content",
                )
                if second != "Discard drafts and exit":
                    continue
            return

        event = process_selection_key(pressed_key, active_action, ACTION_KEYS)
        active_action = event.active_key
        if event.moved or event.choice is None:
            continue

        if event.enter_pressed:
            flash_action(
                menu_items,
                "3",
                body,
                ACTION_LABELS.get(event.choice, "Action"),
                interaction_area="content",
            )

        if event.choice == "1":
            draft = _prompt_movement_payload(
                menu_items,
                config,
                account,
                categories,
                sub_categories,
                repetitive,
                body_builder,
            )
            message = "Draft canceled." if draft is None else "Draft movement added."
            if draft is not None:
                drafts.append(draft)
            continue

        if event.choice == "2":
            message = _commit_drafts(menu_items, config, account, drafts, body_builder)
            if message.startswith("Committed"):
                drafts.clear()
            continue

        if event.choice == "3":
            if not drafts:
                message = "No draft movements to edit."
                continue
            options = [
                f"{row.date} | {row.type} | {row.movement} | {_format_draft_value(row.value, str(account['currency']))}"
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
                message = "Edit canceled."
                continue
            edit_index = options.index(picked)
            edited = _prompt_movement_payload(
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
                message = "Edit canceled."
            else:
                drafts[edit_index] = edited
                message = "Draft movement updated."
            continue

        if event.choice == "4":
            if drafts:
                first = prompt_inline_numbered_choice(
                    menu_items=menu_items,
                    menu_active_key="3",
                    label="Exit with uncommitted drafts?",
                    options=["No, keep editing", "Yes, continue"],
                    body_builder=body_builder,
                    render_screen=render_screen,
                    interaction_area="content",
                )
                if first != "Yes, continue":
                    message = "Exit canceled."
                    continue
                second = prompt_inline_numbered_choice(
                    menu_items=menu_items,
                    menu_active_key="3",
                    label="Final confirmation",
                    options=["Discard drafts and exit", "Cancel"],
                    body_builder=body_builder,
                    render_screen=render_screen,
                    interaction_area="content",
                )
                if second != "Discard drafts and exit":
                    message = "Exit canceled."
                    continue
            return
