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
    ("1", "Select Bank Account"),
    ("2", "Edit Movement"),
    ("5", "Refresh"),
    ("9", "Back"),
]
ACTION_KEYS = [key for key, _ in ACTIONS]
ACTION_LABELS = {key: label for key, label in ACTIONS}


@dataclass
class MovementEditDraft:
    movement: str
    description: str | None
    account_id: int
    value: int
    type: Literal["Income", "Expense"]
    movement_date: str
    category_id: int | None
    sub_category_id: int | None
    repetitive_movement_id: int | None
    movement_code: str | None
    invoice: int


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
    return cents if cents > 0 else None


def _fetch_active_accounts(config: CliConfig) -> list[dict]:
    return api.get(config.api_base_url, "/bank-accounts?active=1")


def _fetch_references(config: CliConfig) -> tuple[list[dict], list[dict], list[dict]]:
    categories = api.get(config.api_base_url, "/categories?active=1")
    sub_categories = api.get(config.api_base_url, "/sub-categories?active=1")
    repetitive = api.get(config.api_base_url, "/repetitive-movements?active=1&limit=500")
    return categories, sub_categories, repetitive


def _fetch_movements(config: CliConfig, account_id: int | None) -> list[dict]:
    path = "/movements?limit=500"
    if account_id is not None:
        path += f"&account_id={account_id}"
    return api.get(config.api_base_url, path)


def _fx_rate(config: CliConfig, from_currency: str, main_currency: str) -> float | None:
    if from_currency.lower() == main_currency.lower():
        return 1.0
    pair = f"{from_currency.upper()}{main_currency.upper()}"
    try:
        data = api.get(config.api_base_url, f"/fx-rates/latest/{pair}")
        return float(data["rate"])
    except Exception:
        return None


def _build_fx_rates(config: CliConfig, rows: list[dict], main_currency: str) -> dict[str, float | None]:
    unique = {str(r["currency"]).lower() for r in rows}
    return {cur: _fx_rate(config, cur, main_currency) for cur in unique}


def _clip(value: str, max_len: int) -> str:
    return value if len(value) <= max_len else value[: max_len - 1] + "…"


def _movement_display_value(row: dict) -> float:
    raw = float(row["value"]) / 100.0
    return raw


def _render_table(
    rows: list[dict],
    page: int,
    rates: dict[str, float | None],
    main_currency: str,
    page_size: int = 8,
) -> tuple[str, int]:
    if not rows:
        return "No movements found.", 1
    total_pages = max(1, (len(rows) + page_size - 1) // page_size)
    current_page = max(0, min(page, total_pages - 1))
    page_rows = rows[current_page * page_size : current_page * page_size + page_size]
    headers = [
        "Movement",
        "Description",
        "Date",
        "Type",
        "Amount",
        f"In {code_plus_symbol(main_currency)}",
        "Repetitive",
        "Invoice",
        "Category",
        "Sub-category",
    ]
    cells = [
        [
            _clip(str(r["movement"]), 22),
            _clip(str(r.get("description") or "—"), 20),
            str(r["date"]),
            str(r["type"]),
            format_money(_movement_display_value(r), str(r["currency"])),
            format_money(
                (
                    _movement_display_value(r) * float(rates.get(str(r["currency"]).lower()) or 0)
                    if rates.get(str(r["currency"]).lower()) is not None
                    else None
                ),
                main_currency,
            ),
            _clip(str(r.get("repetitive_movement") or "—"), 18),
            "Yes" if int(r.get("invoice") or 0) == 1 else "No",
            _clip(str(r.get("category") or "—"), 18),
            _clip(str(r.get("sub_category") or "—"), 18),
        ]
        for r in page_rows
    ]
    widths = [max(len(h), max((len(c[i]) for c in cells), default=0)) for i, h in enumerate(headers)]

    def fmt_row(row_cells: list[str], numeric: set[int] | None = None) -> str:
        numeric_cols = numeric or set()
        parts = []
        for i, (cell, width) in enumerate(zip(row_cells, widths)):
            formatted = cell.rjust(width) if i in numeric_cols else cell.ljust(width)
            if i == 3 and cell.strip() in {"Income", "Expense"}:
                color = "green" if cell.strip() == "Income" else "red"
                formatted = f"[[group:{color}]]{formatted}[[/group]]"
            parts.append(formatted)
        return "│ " + " │ ".join(parts) + " │"

    top = "┌" + "┬".join("─" * (w + 2) for w in widths) + "┐"
    mid = "├" + "┼".join("─" * (w + 2) for w in widths) + "┤"
    bot = "└" + "┴".join("─" * (w + 2) for w in widths) + "┘"
    lines = [top, fmt_row(headers), mid]
    lines.extend(fmt_row(c, numeric={4, 5}) for c in cells)
    lines.append(bot)
    return "\n".join(lines), total_pages


def _build_body(
    active_action: str,
    mode: RenderMode,
    selected_account: dict | None,
    rows: list[dict],
    page: int,
    total_pages: int,
    table_text: str,
    main_currency: str,
    message: str | None = None,
) -> str:
    action_lines = render_selectable_list(
        ACTIONS,
        active_action,
        show_cursor=mode == "content",
        highlight_active=mode == "input",
        indent=1,
    )
    account_label = "All active accounts"
    if selected_account is not None:
        account_label = (
            f"{selected_account['account']} ({selected_account['owner']}) | "
            f"{code_plus_symbol(str(selected_account['currency']))}"
        )
    body = [
        "Movements",
        "",
        f"Account Filter: {account_label}",
        f"Movements loaded: {len(rows)}",
        f"Page: {page + 1}/{total_pages}  |  Left/Right or P/N to browse",
        f"Main currency totals: {code_plus_symbol(main_currency)}",
        "",
        "Actions",
        action_lines,
        "",
        "Movement List",
        table_text,
    ]
    if message:
        body.extend(["", f"Result: {message}"])
    return "\n".join(body)


def render_body(config: CliConfig) -> str:
    try:
        rows = _fetch_movements(config, account_id=None)
    except Exception as exc:
        return f"Movements\n\nCould not load movements: {_api_error_message(exc)}"
    return (
        "Movements\n\n"
        f"Loaded movements: {len(rows)}\n"
        "Open this screen to filter by account and edit movements."
    )


def _choose_account(menu_items: list[tuple[str, str]], accounts: list[dict], body_builder) -> dict | None:
    sorted_accounts = sorted(accounts, key=lambda row: (str(row["owner"]).lower(), str(row["account"]).lower()))
    options = ["All active accounts"] + [
        f"{row['account']} ({row['owner']}) | {format_money(float(row['total_balance']) / 100.0, str(row['currency']))}"
        for row in sorted_accounts
    ]
    selected = prompt_inline_numbered_choice(
        menu_items=menu_items,
        menu_active_key="5",
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


def _prompt_edit(
    menu_items: list[tuple[str, str]],
    config: CliConfig,
    row: dict,
    categories: list[dict],
    sub_categories: list[dict],
    repetitive: list[dict],
    body_builder,
) -> MovementEditDraft | None:
    movement = str(row["movement"])
    description = str(row.get("description") or "")
    movement_type: Literal["Income", "Expense"] = str(row["type"])  # type: ignore[assignment]
    value_text = f"{(float(row['value']) / 100.0):.2f}"
    value_cents = int(row["value"])
    movement_date = str(row["date"])
    category_id = int(row["category_id"]) if row.get("category_id") is not None else None
    sub_category_id = int(row["sub_category_id"]) if row.get("sub_category_id") is not None else None
    repetitive_movement_id = int(row["repetitive_movement_id"]) if row.get("repetitive_movement_id") is not None else None
    invoice = int(row.get("invoice") or 0)

    step = 0
    while True:
        if step == 0:
            typed = prompt_inline_text(
                menu_items=menu_items,
                menu_active_key="5",
                label="Movement",
                initial_value=movement,
                body_builder=body_builder,
                render_screen=render_screen,
                interaction_area="content",
                min_length=1,
            )
            if typed is None:
                return None
            movement = typed.strip()
            step = 1
            continue

        if step == 1:
            typed = prompt_inline_text(
                menu_items=menu_items,
                menu_active_key="5",
                label="Description (optional)",
                initial_value=description,
                body_builder=body_builder,
                render_screen=render_screen,
                interaction_area="content",
                back_key="B",
            )
            if typed is None:
                return None
            if typed == BACK_TOKEN:
                step = 0
                continue
            description = typed
            step = 2
            continue

        if step == 2:
            options = ["Expense", "Income"] if movement_type == "Expense" else ["Income", "Expense"]
            picked = prompt_inline_numbered_choice(
                menu_items=menu_items,
                menu_active_key="5",
                label="Type",
                options=options,
                body_builder=body_builder,
                render_screen=render_screen,
                interaction_area="content",
                back_key="B",
            )
            if picked is None:
                return None
            if picked == BACK_TOKEN:
                step = 1
                continue
            movement_type = picked  # type: ignore[assignment]
            category_id = None
            sub_category_id = None
            repetitive_movement_id = None
            step = 3
            continue

        if step == 3:
            typed = prompt_inline_text(
                menu_items=menu_items,
                menu_active_key="5",
                label="Value (major units)",
                initial_value=value_text,
                body_builder=body_builder,
                render_screen=render_screen,
                interaction_area="content",
                min_length=1,
                back_key="B",
            )
            if typed is None:
                return None
            if typed == BACK_TOKEN:
                step = 2
                continue
            parsed = _parse_major_to_cents(typed)
            if parsed is None:
                value_text = typed
                continue
            value_text = typed
            value_cents = parsed
            step = 4
            continue

        if step == 4:
            type_categories = [c for c in categories if str(c["type"]) == movement_type]
            if not type_categories:
                return None
            sorted_categories = sorted(type_categories, key=lambda c: str(c["category"]).lower())
            category_options = [str(c["category"]) for c in sorted_categories]
            picked = prompt_inline_numbered_choice(
                menu_items=menu_items,
                menu_active_key="5",
                label="Category",
                options=category_options,
                body_builder=body_builder,
                render_screen=render_screen,
                interaction_area="content",
                back_key="B",
            )
            if picked is None:
                return None
            if picked == BACK_TOKEN:
                step = 3
                continue
            category_id = int(sorted_categories[category_options.index(picked)]["id"])
            sub_category_id = None
            step = 5
            continue

        if step == 5:
            candidates = [s for s in sub_categories if int(s["category_id"]) == int(category_id or 0)]
            sorted_subs = sorted(candidates, key=lambda s: str(s["sub_category"]).lower())
            sub_options = ["(None)"] + [str(s["sub_category"]) for s in sorted_subs]
            picked = prompt_inline_numbered_choice(
                menu_items=menu_items,
                menu_active_key="5",
                label="Sub-category (optional)",
                options=sub_options,
                body_builder=body_builder,
                render_screen=render_screen,
                interaction_area="content",
                back_key="B",
            )
            if picked is None:
                return None
            if picked == BACK_TOKEN:
                step = 4
                continue
            sub_category_id = None if picked == "(None)" else int(sorted_subs[sub_options.index(picked) - 1]["id"])
            step = 6
            continue

        if step == 6:
            typed = prompt_inline_text(
                menu_items=menu_items,
                menu_active_key="5",
                label="Date (YYYY-MM-DD)",
                initial_value=movement_date,
                body_builder=body_builder,
                render_screen=render_screen,
                interaction_area="content",
                min_length=10,
                back_key="B",
            )
            if typed is None:
                return None
            if typed == BACK_TOKEN:
                step = 5
                continue
            try:
                date.fromisoformat(typed.strip())
                movement_date = typed.strip()
                step = 7
            except ValueError:
                movement_date = typed.strip()
            continue

        if step == 7:
            reps = [r for r in repetitive if str(r["type"]) == movement_type]
            sorted_rep = sorted(reps, key=lambda r: str(r["movement"]).lower())
            rep_options = ["(None)"] + [str(r["movement"]) for r in sorted_rep]
            picked = prompt_inline_numbered_choice(
                menu_items=menu_items,
                menu_active_key="5",
                label="Repetitive movement (optional)",
                options=rep_options,
                body_builder=body_builder,
                render_screen=render_screen,
                interaction_area="content",
                back_key="B",
            )
            if picked is None:
                return None
            if picked == BACK_TOKEN:
                step = 6
                continue
            repetitive_movement_id = None if picked == "(None)" else int(sorted_rep[rep_options.index(picked) - 1]["id"])
            step = 8
            continue

        confirm = prompt_inline_numbered_choice(
            menu_items=menu_items,
            menu_active_key="5",
            label="Confirm update",
            options=["Yes, update movement", "No, cancel"],
            body_builder=body_builder,
            render_screen=render_screen,
            interaction_area="content",
            back_key="B",
        )
        if confirm is None:
            return None
        if confirm == BACK_TOKEN:
            step = 7
            continue
        if confirm != "Yes, update movement":
            return None
        return MovementEditDraft(
            movement=movement,
            description=description.strip() or None,
            account_id=int(row["account_id"]),
            value=value_cents,
            type=movement_type,
            movement_date=movement_date,
            category_id=category_id,
            sub_category_id=sub_category_id,
            repetitive_movement_id=repetitive_movement_id,
            movement_code=row.get("movement_code"),
            invoice=invoice,
        )


def run(menu_items: list[tuple[str, str]], config: CliConfig) -> None:
    active_action = "9"
    selected_account: dict | None = None
    selected_account_id: int | None = None
    page = 0
    message: str | None = None

    while True:
        try:
            accounts = _fetch_active_accounts(config)
            categories, sub_categories, repetitive = _fetch_references(config)
            rows = _fetch_movements(config, selected_account_id)
        except Exception as exc:
            body = f"Movements\n\nCould not load data: {_api_error_message(exc)}\n\nB/ESC  Back"
            render_screen(menu_items, "5", body, interaction_area="content")
            key = read_key()
            handle_debug_restart(key)
            if key in {"b", "B", "ESC"}:
                return
            continue

        rates = _build_fx_rates(config, rows, config.main_currency)
        table_text, total_pages = _render_table(rows, page, rates, config.main_currency)
        if page >= total_pages:
            page = max(0, total_pages - 1)
            table_text, total_pages = _render_table(rows, page, rates, config.main_currency)
        body = _build_body(
            active_action,
            "content",
            selected_account,
            rows,
            page,
            total_pages,
            table_text,
            config.main_currency,
            message=message,
        )
        body_builder = lambda: _build_body(
            active_action,
            "input",
            selected_account,
            rows,
            page,
            total_pages,
            table_text,
            config.main_currency,
            message=message,
        )
        render_screen(menu_items, "5", body, interaction_area="content")
        key = read_key()
        handle_debug_restart(key)

        if key in {"b", "B", "ESC"}:
            return
        if key in {"RIGHT", "n", "N"}:
            page = min(total_pages - 1, page + 1)
            continue
        if key in {"LEFT", "p", "P"}:
            page = max(0, page - 1)
            continue

        event = process_selection_key(key, active_action, ACTION_KEYS)
        active_action = event.active_key
        if event.moved or event.choice is None:
            continue

        if event.enter_pressed:
            flash_action(menu_items, "5", body, ACTION_LABELS.get(event.choice, "Action"), interaction_area="content")

        if event.choice == "1":
            picked = _choose_account(menu_items, accounts, body_builder)
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
            if not rows:
                message = "No movements to edit."
                continue
            movement_options = [
                f"[[group:{'green' if str(r['type']) == 'Income' else 'red'}]]{_clip(' '.join(str(r['movement']).split()), 24)}[[/group]] | {format_money(_movement_display_value(r), str(r['currency']))} | {' '.join(str(r['date']).split())}"
                for r in rows
            ]
            selected = prompt_inline_numbered_choice(
                menu_items=menu_items,
                menu_active_key="5",
                label="Choose movement to edit",
                options=movement_options,
                body_builder=body_builder,
                render_screen=render_screen,
                interaction_area="content",
                option_text_width=40,
            )
            if selected is None:
                message = "Edit canceled."
                continue
            target_row = rows[movement_options.index(selected)]
            draft = _prompt_edit(
                menu_items,
                config,
                target_row,
                categories,
                sub_categories,
                repetitive,
                body_builder,
            )
            if draft is None:
                message = "Edit canceled."
                continue
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
                message = f"Movement {target_row['id']} updated."
            except Exception as exc:
                message = f"Update failed: {_api_error_message(exc)}"
            continue

        if event.choice == "5":
            message = "Data refreshed."
            continue
        if event.choice == "9":
            return
