"""Overview layout helpers.

Keeps body-assembly and density selection separate from data aggregation and
row formatting so the screen can be extended without growing one large module.
"""

from __future__ import annotations

from typing import Any

from utils.currencies import code_plus_symbol, format_money
from utils.viewport import available_main_lines

from screens.overview.cards import render_compact_summary, render_summary_cards


_TABLE_FRAME_LINES = 4


def summary_mode(available_lines: int) -> str:
    """Choose the richest summary layout that still leaves space for rows."""
    if available_lines >= 20:
        return "cards"
    if available_lines >= 11:
        return "compact"
    if available_lines >= 9:
        return "minimal"
    return "table-only"


def layout_budget() -> tuple[int, str]:
    """Return a good first guess for ``(rows_per_page, summary_mode)``."""
    main_lines = available_main_lines()
    mode = summary_mode(main_lines)
    overhead_by_mode = {
        "cards": 17,
        "compact": 8,
        "minimal": 7,
        "table-only": _TABLE_FRAME_LINES + 2,
    }
    rows_per_page = max(1, main_lines - overhead_by_mode[mode])
    return rows_per_page, mode


def build_sections(
    *,
    mode: str,
    title: str,
    summary: Any,
    main_currency: str,
    currency: str,
    currency_total: float,
    currency_total_main: float,
    table_text: str,
    row_status: str,
    current_page: int,
    total_pages: int,
) -> list[str]:
    """Assemble overview sections for one specific density mode."""
    summary_block = ""
    if mode == "cards":
        summary_block = render_summary_cards(
            summary.non_savings_main,
            summary.savings_main,
            summary.debts_main,
            summary.total_main,
            main_currency,
        )
    elif mode == "compact":
        summary_block = render_compact_summary(
            summary.non_savings_main,
            summary.savings_main,
            summary.debts_main,
            summary.total_main,
            main_currency,
        )

    currency_line = (
        f"{currency.upper()}  |  Total: {format_money(currency_total, currency)}  |  "
        f"In {code_plus_symbol(main_currency)}: {format_money(currency_total_main, main_currency)}"
    )
    footer_parts = [f"Currency {current_page + 1}/{total_pages}"]
    if row_status:
        footer_parts.append(row_status)
        footer_parts.append("Up/Down rows")
    footer_parts.extend(["Left/Right switch", "B/ESC back"])

    sections: list[str] = []
    if mode != "table-only":
        sections.append(title)
    if summary_block:
        sections.append(summary_block)
    if mode == "minimal":
        sections.append(
            f"Balance: {format_money(summary.non_savings_main, main_currency)}  |  "
            f"Savings: {format_money(summary.savings_main, main_currency)}"
        )
    sections.extend([currency_line, table_text, "  |  ".join(footer_parts)])
    return sections
