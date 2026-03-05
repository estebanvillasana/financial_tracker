from __future__ import annotations

from pathlib import Path
from typing import Any

from config import CliConfig
from db import query
from functions import api
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

def _fmt(n: float | None) -> str:
    if n is None:
        return "—"
    return f"{n:,.2f}"


def _row_cells(row: dict[str, Any], rates: dict[str, float | None]) -> list[str]:
    bal = row["total_balance"]
    rate = rates.get(row["currency"].lower())
    in_main = bal * rate if rate is not None else None
    return [
        str(row["account"]),
        str(row["type"]),
        str(row["currency"]).upper(),
        str(row["owner"]),
        _fmt(bal),
        _fmt(in_main),
    ]


def _render_table(
    rows: list[dict[str, Any]],
    rates: dict[str, float | None],
    main_currency: str,
) -> str:
    headers = ["Account", "Type", "Currency", "Owner", "Balance", f"In {main_currency.upper()}"]

    all_cells = [_row_cells(r, rates) for r in rows]
    widths = [
        max(len(h), max((len(cells[i]) for cells in all_cells), default=0))
        for i, h in enumerate(headers)
    ]

    def fmt_row(cells: list[str]) -> str:
        parts = [
            cell.rjust(w) if i in _NUMERIC_COLS else cell.ljust(w)
            for i, (cell, w) in enumerate(zip(cells, widths))
        ]
        return "  ".join(parts)

    sep = "  ".join("─" * w for w in widths)

    active_pairs = [(r, c) for r, c in zip(rows, all_cells) if r["active"]]
    inactive_pairs = [(r, c) for r, c in zip(rows, all_cells) if not r["active"]]

    lines = [fmt_row(headers), sep]
    for _, cells in active_pairs:
        lines.append(fmt_row(cells))

    if inactive_pairs:
        lines.append("")
        lines.append("  — inactive " + "─" * (sum(widths) + 2 * (len(widths) - 1) - 13))
        for _, cells in inactive_pairs:
            lines.append(fmt_row(cells))

    return "\n".join(lines)


# ─────────────────────────────────────────────
# Public screen interface
# ─────────────────────────────────────────────

def render_body(config: CliConfig) -> str:
    """Lightweight DB-only preview shown in the main menu sidebar."""
    try:
        rows = _fetch_rows(config)
    except Exception:
        return "Overview\n\nCould not load data."

    n_active = sum(1 for r in rows if r["active"])
    n_total = len(rows)
    return f"Overview\n\n{n_active}/{n_total} accounts active.\nEnter to open."


def run(menu_items: list[tuple[str, str]], config: CliConfig) -> None:
    try:
        rows = _fetch_rows(config)
    except Exception as exc:
        _show_error(menu_items, f"Error loading accounts:\n{exc}")
        return

    # Fetch FX rates for every unique currency in one pass
    unique_currencies = {r["currency"].lower() for r in rows}
    rates: dict[str, float | None] = {cur: _fx_rate(config, cur) for cur in unique_currencies}

    n_active = sum(1 for r in rows if r["active"])
    main_upper = config.main_currency.upper()

    if rows:
        table = _render_table(rows, rates, config.main_currency)
        body = (
            f"Overview — {n_active}/{len(rows)} accounts  "
            f"(balances converted to {main_upper})\n"
            "\n"
            f"{table}\n"
            "\n"
            "B/ESC  Back"
        )
    else:
        body = "Overview\n\nNo accounts found.\n\nB/ESC  Back"

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
