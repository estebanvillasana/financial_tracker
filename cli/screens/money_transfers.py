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
from utils.debug_shortcuts import handle_debug_restart
from utils.inline_input import BACK_TOKEN
from utils.inline_input import prompt_inline_numbered_choice
from utils.inline_input import prompt_inline_text
from utils.navigation import read_key
from utils.render import flash_action
from utils.render import render_screen
from utils.rich_ui import render_selectable_list
from utils.selection import process_selection_key


RenderMode = Literal["preview", "content", "input"]
ACTIONS = [
    ("1", "Add Internal Transfer"),
    ("5", "Refresh"),
    ("9", "Back"),
]
ACTION_KEYS = [key for key, _ in ACTIONS]
ACTION_LABELS = {key: label for key, label in ACTIONS}


@dataclass
class TransferDraft:
    description: str | None
    movement_date: str
    send_account_id: int
    send_account_name: str
    sent_value: int
    send_currency: str
    receive_account_id: int
    receive_account_name: str
    received_value: int
    receive_currency: str


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
    if cents <= 0:
        return None
    return cents


def _fetch_active_accounts(config: CliConfig) -> list[dict]:
    return api.get(config.api_base_url, "/bank-accounts?active=1")


def _fetch_transfers(config: CliConfig) -> list[dict]:
    return api.get(config.api_base_url, "/money-transfers")


def _render_transfers_table(rows: list[dict]) -> str:
    headers = ["Date", "From", "To", "Sent", "Received", "Description"]
    if not rows:
        return "No internal transfers found."
    recent = rows[:10]
    cells = [
        [
            str(r["date"]),
            str(r["send_account_name"])[:20],
            str(r["receive_account_name"])[:20],
            format_money(float(r["sent_value"]) / 100.0, str(r["send_currency"])),
            format_money(float(r["received_value"]) / 100.0, str(r["receive_currency"])),
            str(r.get("description") or "—")[:28],
        ]
        for r in recent
    ]
    widths = [max(len(h), max((len(c[i]) for c in cells), default=0)) for i, h in enumerate(headers)]

    def fmt_row(row_cells: list[str], numeric: set[int] | None = None) -> str:
        numeric_cols = numeric or set()
        parts = []
        for i, (cell, width) in enumerate(zip(row_cells, widths)):
            parts.append(cell.rjust(width) if i in numeric_cols else cell.ljust(width))
        return "│ " + " │ ".join(parts) + " │"

    top = "┌" + "┬".join("─" * (w + 2) for w in widths) + "┐"
    mid = "├" + "┼".join("─" * (w + 2) for w in widths) + "┤"
    bot = "└" + "┴".join("─" * (w + 2) for w in widths) + "┘"
    lines = [top, fmt_row(headers), mid]
    lines.extend(fmt_row(c, numeric={3, 4}) for c in cells)
    lines.append(bot)
    if len(rows) > len(recent):
        lines.append(f"Showing last {len(recent)} of {len(rows)} transfers.")
    return "\n".join(lines)


def _build_body(
    active_action: str,
    mode: RenderMode,
    transfers: list[dict],
    message: str | None = None,
) -> str:
    show_cursor = mode == "content"
    highlight = mode == "input"
    action_lines = render_selectable_list(
        ACTIONS,
        active_action,
        show_cursor=show_cursor,
        highlight_active=highlight,
        indent=1,
    )
    body = [
        "Internal Money Transfers",
        "",
        f"Transfers found: {len(transfers)}",
        "",
        "Actions",
        action_lines,
        "",
        "Use Up/Down + Enter, or press 1/5/9.",
        "",
        "Transfers (latest first)",
        _render_transfers_table(transfers),
        "",
        "Backend transfer endpoint creates paired Expense + Income rows.",
    ]
    if message:
        body.extend(["", f"Result: {message}"])
    return "\n".join(body)


def render_body(config: CliConfig) -> str:
    try:
        transfers = _fetch_transfers(config)
    except Exception as exc:
        return f"Internal Money Transfers\n\nCould not load transfers: {_api_error_message(exc)}"
    return _build_body("9", "preview", transfers)


def _choose_account(
    menu_items: list[tuple[str, str]],
    accounts: list[dict],
    label: str,
    body_builder,
    exclude_account_id: int | None = None,
) -> dict | None:
    filtered = [row for row in accounts if int(row["id"]) != int(exclude_account_id or -1)]
    if not filtered:
        return None
    sorted_accounts = sorted(filtered, key=lambda row: (str(row["owner"]).lower(), str(row["account"]).lower()))
    options = [
        f"{row['account']} ({row['owner']}) | {format_money(float(row['total_balance']) / 100.0, str(row['currency']))}"
        for row in sorted_accounts
    ]
    selected = prompt_inline_numbered_choice(
        menu_items=menu_items,
        menu_active_key="4",
        label=label,
        options=options,
        body_builder=body_builder,
        render_screen=render_screen,
        interaction_area="content",
        back_key="B",
    )
    if selected is None:
        return None
    if selected == BACK_TOKEN:
        return {"__back__": True}
    return sorted_accounts[options.index(selected)]


def _prompt_transfer(
    menu_items: list[tuple[str, str]],
    config: CliConfig,
    accounts: list[dict],
    body_builder,
) -> TransferDraft | None:
    description_text = ""
    movement_date = date.today().isoformat()
    send_account: dict | None = None
    sent_text = ""
    sent_value = 0
    receive_account: dict | None = None
    received_text = ""
    received_value = 0

    step = 0
    while True:
        if step == 0:
            description = prompt_inline_text(
                menu_items=menu_items,
                menu_active_key="4",
                label="Description (optional)",
                initial_value=description_text,
                body_builder=body_builder,
                render_screen=render_screen,
                interaction_area="content",
            )
            if description is None:
                return None
            description_text = description
            step = 1
            continue

        if step == 1:
            date_value = prompt_inline_text(
                menu_items=menu_items,
                menu_active_key="4",
                label="Date (YYYY-MM-DD)",
                initial_value=movement_date,
                body_builder=body_builder,
                render_screen=render_screen,
                interaction_area="content",
                min_length=10,
                back_key="B",
            )
            if date_value is None:
                return None
            if date_value == BACK_TOKEN:
                step = 0
                continue
            try:
                date.fromisoformat(date_value.strip())
                movement_date = date_value.strip()
                step = 2
            except ValueError:
                movement_date = date_value.strip()
            continue

        if step == 2:
            picked_send = _choose_account(
                menu_items,
                accounts,
                "From account",
                body_builder,
            )
            if picked_send is None:
                return None
            if picked_send.get("__back__"):
                step = 1
                continue
            send_account = picked_send
            receive_account = None
            step = 3
            continue

        if step == 3:
            sent_input = prompt_inline_text(
                menu_items=menu_items,
                menu_active_key="4",
                label=f"How much to send ({code_plus_symbol(str(send_account['currency']))})",
                initial_value=sent_text,
                body_builder=body_builder,
                render_screen=render_screen,
                interaction_area="content",
                min_length=1,
                back_key="B",
            )
            if sent_input is None:
                return None
            if sent_input == BACK_TOKEN:
                step = 2
                continue
            parsed = _parse_major_to_cents(sent_input)
            if parsed is None:
                sent_text = sent_input
                continue
            sent_text = sent_input
            sent_value = parsed
            step = 4
            continue

        if step == 4:
            picked_receive = _choose_account(
                menu_items,
                accounts,
                "To account",
                body_builder,
                exclude_account_id=int(send_account["id"]),
            )
            if picked_receive is None:
                return None
            if picked_receive.get("__back__"):
                step = 3
                continue
            receive_account = picked_receive
            step = 5
            continue

        if step == 5:
            received_input = prompt_inline_text(
                menu_items=menu_items,
                menu_active_key="4",
                label=f"How much to receive ({code_plus_symbol(str(receive_account['currency']))})",
                initial_value=received_text,
                body_builder=body_builder,
                render_screen=render_screen,
                interaction_area="content",
                min_length=1,
                back_key="B",
            )
            if received_input is None:
                return None
            if received_input == BACK_TOKEN:
                step = 4
                continue
            parsed = _parse_major_to_cents(received_input)
            if parsed is None:
                received_text = received_input
                continue
            received_text = received_input
            received_value = parsed
            step = 6
            continue

        confirm = prompt_inline_numbered_choice(
            menu_items=menu_items,
            menu_active_key="4",
            label="Confirm internal transfer",
            options=[
                "Yes, create transfer",
                "No, cancel",
            ],
            body_builder=body_builder,
            render_screen=render_screen,
            interaction_area="content",
            back_key="B",
        )
        if confirm is None:
            return None
        if confirm == BACK_TOKEN:
            step = 5
            continue
        if confirm != "Yes, create transfer":
            return None
        return TransferDraft(
            description=description_text.strip() or None,
            movement_date=movement_date,
            send_account_id=int(send_account["id"]),
            send_account_name=str(send_account["account"]),
            sent_value=sent_value,
            send_currency=str(send_account["currency"]),
            receive_account_id=int(receive_account["id"]),
            receive_account_name=str(receive_account["account"]),
            received_value=received_value,
            receive_currency=str(receive_account["currency"]),
        )


def _create_transfer(
    menu_items: list[tuple[str, str]],
    config: CliConfig,
    accounts: list[dict],
    body_builder,
) -> str:
    draft = _prompt_transfer(menu_items, config, accounts, body_builder)
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
        return f"Create failed: {_api_error_message(exc)}"
    return (
        f"Transfer created ({created['movement_code']}): "
        f"{draft.send_account_name} {format_money(draft.sent_value / 100.0, draft.send_currency)} -> "
        f"{draft.receive_account_name} {format_money(draft.received_value / 100.0, draft.receive_currency)}"
    )


def run(menu_items: list[tuple[str, str]], config: CliConfig) -> None:
    active_action = "9"
    message: str | None = None
    while True:
        try:
            accounts = _fetch_active_accounts(config)
            transfers = _fetch_transfers(config)
        except Exception as exc:
            body = f"Internal Money Transfers\n\nCould not load data: {_api_error_message(exc)}\n\nB/ESC  Back"
            render_screen(menu_items, "4", body, interaction_area="content")
            key = read_key()
            handle_debug_restart(key)
            if key in {"b", "B", "ESC"}:
                return
            continue

        body_builder = lambda: _build_body(active_action, "input", transfers, message=message)
        body = _build_body(active_action, "content", transfers, message=message)
        render_screen(menu_items, "4", body, interaction_area="content")
        pressed_key = read_key()
        handle_debug_restart(pressed_key)

        if pressed_key in {"b", "B", "ESC"}:
            return

        event = process_selection_key(pressed_key, active_action, ACTION_KEYS)
        active_action = event.active_key
        if event.moved or event.choice is None:
            continue

        if event.enter_pressed:
            flash_action(
                menu_items,
                "4",
                body,
                ACTION_LABELS.get(event.choice, "Action"),
                interaction_area="content",
            )

        if event.choice == "1":
            message = _create_transfer(menu_items, config, accounts, body_builder)
            continue
        if event.choice == "5":
            message = "Data refreshed."
            continue
        if event.choice == "9":
            return
