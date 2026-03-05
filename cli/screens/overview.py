from __future__ import annotations

from collections import defaultdict
from pathlib import Path
from typing import Any

from config import CliConfig
from db import query
from functions import api
from utils.currencies import code_plus_symbol
from utils.currencies import format_money
from utils.navigation import read_key
from utils.render import render_screen


_SQL = (Path(__file__).parent.parent / "queries" / "overview.sql").read_text(encoding="utf-8")

_NUMERIC_COLS = frozenset({3, 4})


# ─────────────────────────────────────────────
# Data fetching
# ─────────────────────────────────────────────

def _fetch_rows(config: CliConfig) -> list[dict[str, Any]]:
    return query(config.db_path, _SQL)


def _fx_rate(config: CliConfig, from_currency: str) -> float | None:
    """Return the rate to convert 1 unit of from_currency into main_currency."""
    if from_currency.lower() == config.main_currency.lower():
        return 1.0
    pair = f"{from_currency.upper()}{config.main_currency.upper()}"
    try:
        data = api.get(config.api_base_url, f"/fx-rates/latest/{pair}")
        return data["rate"]
    except Exception:
        return None


# ─────────────────────────────────────────────
# Rendering
# ─────────────────────────────────────────────

def _row_cells(
    row: dict[str, Any],
    rates: dict[str, float | None],
    main_currency: str,
) -> list[str]:
    bal = row["total_balance"]
    rate = rates.get(row["currency"].lower())
    in_main = bal * rate if rate is not None else None
    return [
        str(row["account"]),
        str(row["type"]),
        str(row["owner"]),
        format_money(bal, str(row["currency"])),
        format_money(in_main, main_currency),
    ]


def _render_table(
    rows: list[dict[str, Any]],
    rates: dict[str, float | None],
    main_currency: str,
    widths: list[int],
) -> str:
    headers = ["Account", "Type", "Owner", "Balance", f"In {code_plus_symbol(main_currency)}"]

    active_rows = [r for r in rows if r["active"]]
    all_cells = [_row_cells(r, rates, main_currency) for r in active_rows]
    if not all_cells:
        return "No active accounts."

    def fmt_row(cells: list[str]) -> str:
        parts = [
            cell.rjust(w) if i in _NUMERIC_COLS else cell.ljust(w)
            for i, (cell, w) in enumerate(zip(cells, widths))
        ]
        return "│ " + " │ ".join(parts) + " │"

    top = "┌" + "┬".join("─" * (w + 2) for w in widths) + "┐"
    header_sep = "├" + "┼".join("─" * (w + 2) for w in widths) + "┤"
    bottom = "└" + "┴".join("─" * (w + 2) for w in widths) + "┘"

    lines = [top, fmt_row(headers), header_sep]
    for cells in all_cells:
        lines.append(fmt_row(cells))
    lines.append(bottom)

    return "\n".join(lines)


def _column_widths(
    rows: list[dict[str, Any]],
    rates: dict[str, float | None],
    main_currency: str,
) -> list[int]:
    headers = ["Account", "Type", "Owner", "Balance", f"In {code_plus_symbol(main_currency)}"]
    active_rows = [r for r in rows if r["active"]]
    all_cells = [_row_cells(r, rates, main_currency) for r in active_rows]
    return [
        max(len(h), max((len(cells[i]) for cells in all_cells), default=0))
        for i, h in enumerate(headers)
    ]


def _card(title: str, value: str, width: int = 34) -> str:
    inner = max(22, width - 2)
    return "\n".join(
        [
            "┌" + "─" * inner + "┐",
            f"│ {title[: inner - 2].ljust(inner - 2)} │",
            "├" + "─" * inner + "┤",
            f"│ {value[: inner - 2].rjust(inner - 2)} │",
            "└" + "─" * inner + "┘",
        ]
    )


def _render_summary_cards(
    total_non_savings_main: float,
    savings_main: float,
    debts_main: float,
    total_main: float,
    main_currency: str,
) -> str:
    cards = [
        _card("Total Balance (No Savings)", format_money(total_non_savings_main, main_currency)),
        _card("Total Savings", format_money(savings_main, main_currency)),
        _card("Total Debts", format_money(debts_main, main_currency)),
        _card("Total Including Savings", format_money(total_main, main_currency)),
    ]
    return "\n\n".join(cards)


def _build_body(
    rows: list[dict[str, Any]],
    rates: dict[str, float | None],
    main_currency: str,
    include_back: bool,
    page: int = 0,
    groups_per_page: int = 1,
) -> str:
    if not rows:
        return "Overview\n\nNo accounts found.\n\nB/ESC  Back" if include_back else "Overview\n\nNo accounts found."

    active_rows = [r for r in rows if r["active"]]
    n_active = len(active_rows)
    n_total = len(rows)
    total_main = sum(float(r["total_balance"]) * float(rates.get(r["currency"].lower()) or 0) for r in active_rows)
    savings_rows = [r for r in active_rows if str(r["type"]).lower() == "savings"]
    savings_main = sum(float(r["total_balance"]) * float(rates.get(r["currency"].lower()) or 0) for r in savings_rows)
    non_savings_rows = [r for r in active_rows if str(r["type"]).lower() != "savings"]
    total_non_savings_main = sum(
        float(r["total_balance"]) * float(rates.get(r["currency"].lower()) or 0) for r in non_savings_rows
    )
    debts_main = sum(
        float(r["total_balance"]) * float(rates.get(r["currency"].lower()) or 0)
        for r in active_rows
        if float(r["total_balance"]) < 0
    )

    grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in active_rows:
        grouped[str(row["currency"]).lower()].append(row)
    sorted_currencies = sorted(grouped, key=lambda cur: (cur != main_currency.lower(), cur))
    total_pages = max(1, (len(sorted_currencies) + groups_per_page - 1) // groups_per_page)
    current_page = max(0, min(page, total_pages - 1))

    summary = (
        f"Overview — {n_active}/{n_total} accounts active\n"
        f"Main Currency: {code_plus_symbol(main_currency)}"
    )
    if not active_rows:
        cards = _render_summary_cards(total_non_savings_main, savings_main, debts_main, total_main, main_currency)
        body = f"{summary}\n\nNo active accounts.\n\n[[options_panel]]\n{cards}\n[[/options_panel]]"
        if include_back:
            body = f"{body}\n\nB/ESC  Back"
        return body

    widths = _column_widths(active_rows, rates, main_currency)
    start = current_page * groups_per_page
    end = start + groups_per_page
    page_currencies = sorted_currencies[start:end]
    sections = []
    for currency in page_currencies:
        currency_rows = grouped[currency]
        currency_total = sum(float(r["total_balance"]) for r in currency_rows)
        currency_total_main = sum(
            float(r["total_balance"]) * float(rates.get(r["currency"].lower()) or 0) for r in currency_rows
        )
        sections.append("═" * 28 + f" {currency.upper()} Active Accounts " + "═" * 28)
        sections.append(
            f"Total: {format_money(currency_total, currency)} | In {code_plus_symbol(main_currency)}: "
            f"{format_money(currency_total_main, main_currency)}"
        )
        sections.append(_render_table(currency_rows, rates, main_currency, widths))
        sections.append("─" * 80)

    cards = _render_summary_cards(total_non_savings_main, savings_main, debts_main, total_main, main_currency)
    footer = f"Page {current_page + 1}/{total_pages}  |  Left/Right or P/N to switch currencies"
    body = f"{summary}\n\n" + "\n\n".join(sections) + f"\n{footer}\n\n[[options_panel]]\n{cards}\n[[/options_panel]]"
    if include_back:
        body = f"{body}\n\nB/ESC  Back"
    return body


def _build_preview_body(
    rows: list[dict[str, Any]],
    rates: dict[str, float | None],
    main_currency: str,
) -> str:
    if not rows:
        return "Overview\n\nNo accounts found."

    active_rows = [r for r in rows if r["active"]]
    n_active = len(active_rows)
    n_total = len(rows)
    savings_rows = [r for r in active_rows if str(r["type"]).lower() == "savings"]
    non_savings_rows = [r for r in active_rows if str(r["type"]).lower() != "savings"]
    total_main = sum(float(r["total_balance"]) * float(rates.get(r["currency"].lower()) or 0) for r in active_rows)
    savings_main = sum(float(r["total_balance"]) * float(rates.get(r["currency"].lower()) or 0) for r in savings_rows)
    total_non_savings_main = sum(
        float(r["total_balance"]) * float(rates.get(r["currency"].lower()) or 0) for r in non_savings_rows
    )
    debts_main = sum(
        float(r["total_balance"]) * float(rates.get(r["currency"].lower()) or 0)
        for r in active_rows
        if float(r["total_balance"]) < 0
    )

    grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        grouped[str(row["currency"]).lower()].append(row)

    currency_rows_sorted = sorted(
        grouped.items(),
        key=lambda item: abs(
            sum(
                float(r["total_balance"]) * float(rates.get(str(r["currency"]).lower()) or 0)
                for r in item[1]
                if r["active"]
            )
        ),
        reverse=True,
    )

    lines = [
        f"Overview — {n_active}/{n_total} accounts active | Main: {code_plus_symbol(main_currency)}",
        f"Balance (No Savings): {format_money(total_non_savings_main, main_currency)}",
        f"Savings: {format_money(savings_main, main_currency)}",
        f"Debts: {format_money(debts_main, main_currency)}",
        f"Total (Including Savings): {format_money(total_main, main_currency)}",
        "",
        "Currencies (by biggest absolute total in main currency):",
    ]
    for currency, currency_rows in currency_rows_sorted:
        currency_active = [r for r in currency_rows if r["active"]]
        currency_total_main = sum(
            float(r["total_balance"]) * float(rates.get(str(r["currency"]).lower()) or 0) for r in currency_active
        )
        lines.append(
            f"- {code_plus_symbol(currency)}: {len(currency_active)}/{len(currency_rows)} active | "
            f"{format_money(currency_total_main, main_currency)}"
        )

    lines.append("Enter to open full overview.")
    return "\n".join(lines)


# ─────────────────────────────────────────────
# Public screen interface
# ─────────────────────────────────────────────

def render_body(config: CliConfig) -> str:
    """Preloaded overview shown while navigating the main menu."""
    try:
        rows = _fetch_rows(config)
    except Exception:
        return "Overview\n\nCould not load data."

    unique_currencies = {str(r["currency"]).lower() for r in rows}
    rates: dict[str, float | None] = {cur: _fx_rate(config, cur) for cur in unique_currencies}
    return _build_preview_body(rows, rates, config.main_currency)


def run(menu_items: list[tuple[str, str]], config: CliConfig) -> None:
    try:
        rows = _fetch_rows(config)
    except Exception as exc:
        _show_error(menu_items, f"Error loading accounts:\n{exc}")
        return

    # Fetch FX rates for every unique currency in one pass
    unique_currencies = {r["currency"].lower() for r in rows}
    rates: dict[str, float | None] = {cur: _fx_rate(config, cur) for cur in unique_currencies}

    active_currency_count = len({str(r["currency"]).lower() for r in rows if r["active"]})
    groups_per_page = 1
    total_pages = max(1, (active_currency_count + groups_per_page - 1) // groups_per_page)
    page = 0

    while True:
        body = _build_body(rows, rates, config.main_currency, include_back=True, page=page, groups_per_page=groups_per_page)
        render_screen(menu_items, "1", body, interaction_area="content")
        key = read_key()
        if key in {"b", "B", "ESC"}:
            return
        if key in {"RIGHT", "n", "N"}:
            page = min(total_pages - 1, page + 1)
            continue
        if key in {"LEFT", "p", "P"}:
            page = max(0, page - 1)
            continue


def _show_error(menu_items: list[tuple[str, str]], message: str) -> None:
    body = f"Overview\n\n{message}\n\nB/ESC  Back"
    while True:
        render_screen(menu_items, "1", body, interaction_area="content")
        if read_key() in {"b", "B", "ESC"}:
            return
