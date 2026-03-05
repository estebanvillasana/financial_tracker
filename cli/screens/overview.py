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

_NUMERIC_COLS = frozenset({4, 5})


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
        code_plus_symbol(str(row["currency"])),
        str(row["owner"]),
        format_money(bal, str(row["currency"])),
        format_money(in_main, main_currency),
    ]


def _render_table(
    rows: list[dict[str, Any]],
    rates: dict[str, float | None],
    main_currency: str,
) -> str:
    headers = ["Account", "Type", "Currency", "Owner", "Balance", f"In {code_plus_symbol(main_currency)}"]

    active_rows = [r for r in rows if r["active"]]
    all_cells = [_row_cells(r, rates, main_currency) for r in active_rows]
    if not all_cells:
        return "No active accounts."

    widths = [
        max(len(h), max((len(cells[i]) for cells in all_cells), default=0))
        for i, h in enumerate(headers)
    ]

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


def _build_body(
    rows: list[dict[str, Any]],
    rates: dict[str, float | None],
    main_currency: str,
    include_back: bool,
) -> str:
    if not rows:
        return "Overview\n\nNo accounts found.\n\nB/ESC  Back" if include_back else "Overview\n\nNo accounts found."

    active_rows = [r for r in rows if r["active"]]
    n_active = len(active_rows)
    n_total = len(rows)
    total_main = sum(float(r["total_balance"]) * float(rates.get(r["currency"].lower()) or 0) for r in active_rows)
    savings_rows = [r for r in active_rows if str(r["type"]).lower() == "savings"]
    savings_main = sum(float(r["total_balance"]) * float(rates.get(r["currency"].lower()) or 0) for r in savings_rows)

    grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in active_rows:
        grouped[str(row["currency"]).lower()].append(row)

    summary = (
        f"Overview — {n_active}/{n_total} accounts active\n"
        f"Total Balance ({code_plus_symbol(main_currency)}): {format_money(total_main, main_currency)}\n"
        f"Total Savings ({code_plus_symbol(main_currency)}): {format_money(savings_main, main_currency)}"
    )
    if not active_rows:
        body = f"{summary}\n\nNo active accounts."
        if include_back:
            body = f"{body}\n\nB/ESC  Back"
        return body

    sections = []
    sorted_currencies = sorted(grouped, key=lambda cur: (cur != main_currency.lower(), cur))
    for currency in sorted_currencies:
        currency_rows = grouped[currency]
        sections.append(f"{currency.upper()} Active Accounts")
        sections.append(_render_table(currency_rows, rates, main_currency))

    body = (
        f"{summary}\n\n" + "\n\n".join(sections)
    )
    if include_back:
        body = f"{body}\n\nB/ESC  Back"
    return body


def _build_preview_body(rows: list[dict[str, Any]]) -> str:
    if not rows:
        return "Overview\n\nNo accounts found."

    active_rows = [r for r in rows if r["active"]]
    n_active = len(active_rows)
    n_total = len(rows)
    savings_rows = [r for r in active_rows if str(r["type"]).lower() == "savings"]

    grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        grouped[str(row["currency"]).lower()].append(row)

    lines = [
        f"Overview — {n_active}/{n_total} accounts active",
        f"Savings accounts: {len(savings_rows)}",
        "Currencies:",
    ]
    for currency in sorted(grouped):
        currency_rows = grouped[currency]
        currency_active = [r for r in currency_rows if r["active"]]
        lines.append(f"- {code_plus_symbol(currency)}: {len(currency_active)}/{len(currency_rows)} active")

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

    return _build_preview_body(rows)


def run(menu_items: list[tuple[str, str]], config: CliConfig) -> None:
    try:
        rows = _fetch_rows(config)
    except Exception as exc:
        _show_error(menu_items, f"Error loading accounts:\n{exc}")
        return

    # Fetch FX rates for every unique currency in one pass
    unique_currencies = {r["currency"].lower() for r in rows}
    rates: dict[str, float | None] = {cur: _fx_rate(config, cur) for cur in unique_currencies}

    body = _build_body(rows, rates, config.main_currency, include_back=True)

    while True:
        render_screen(menu_items, "1", body, interaction_area="content")
        if read_key() in {"b", "B", "ESC"}:
            return


def _show_error(menu_items: list[tuple[str, str]], message: str) -> None:
    body = f"Overview\n\n{message}\n\nB/ESC  Back"
    while True:
        render_screen(menu_items, "1", body, interaction_area="content")
        if read_key() in {"b", "B", "ESC"}:
            return
