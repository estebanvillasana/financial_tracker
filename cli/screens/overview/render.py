"""Body construction for the Overview screen (full + preview modes).

The full view dynamically adapts to the terminal height:
* computes ``rows_per_page`` so the body always fits without being clipped
  by the Rich layout layer (no more ``...`` truncation);
* falls back to a compact one-line summary when the terminal is too short
  for the 2×2 card grid.

The preview is a lightweight text-only summary shown in the main-menu
sidebar while the user is navigating screens.
"""

from __future__ import annotations

import shutil
from typing import Any

from utils.currencies import code_plus_symbol, format_money
from utils.table import build_table

from screens.overview.cards import render_compact_summary, render_summary_cards
from screens.overview.data import compute_summaries


_NUMERIC_COLS = {3, 4}

# Layout budget constants. These values describe the number of explicit text
# lines produced outside of data rows, so the overview can reserve space for
# the table instead of letting Rich clip the entire body with "...".
_FULL_CARDS_LINES = 10
_TABLE_FRAME_LINES = 4


def _summary_mode(available_main_lines: int) -> str:
    """Choose the most informative layout that still leaves room for rows."""
    if available_main_lines >= 20:
        return "cards"
    if available_main_lines >= 11:
        return "compact"
    if available_main_lines >= 9:
        return "minimal"
    return "table-only"


def _available_main_lines() -> int:
    """Mirror the Rich content-height calculation used by the shared layout."""
    _, terminal_height = shutil.get_terminal_size(fallback=(120, 30))
    return max(4, max(6, terminal_height - 9))


# ── Layout budget ────────────────────────────────────────────


def _layout_budget() -> tuple[int, str]:
    """Return ``(rows_per_page, summary_mode)`` for the current terminal.

    The height calculation mirrors ``rich_ui.build_rich_layout`` so the body
    produced by :func:`build_body` never exceeds the available display area,
    eliminating the ``...`` clipping that previously hid table rows.

    The returned ``summary_mode`` intentionally drops non-essential summary
    chrome on short terminals so at least one table row is always visible.
    """
    available_main_lines = _available_main_lines()
    mode = _summary_mode(available_main_lines)

    # Base overhead always includes the table frame plus the navigation footer.
    overhead = _TABLE_FRAME_LINES + 1
    if mode == "cards":
        overhead += 1 + _FULL_CARDS_LINES + 1
    elif mode == "compact":
        overhead += 1 + 1 + 1
    elif mode == "minimal":
        overhead += 1 + 1
    else:
        overhead += 1

    # Reserve one extra line for row pagination whenever more than one row page
    # exists; leaving the margin here prevents the footer from getting clipped.
    rows_per_page = max(1, available_main_lines - overhead - 1)
    return rows_per_page, mode


def _build_sections(
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
    footer = "  |  ".join(footer_parts)

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
    sections.extend([currency_line, table_text, footer])
    return sections


# ── Table cell formatting ────────────────────────────────────


def _row_cells(
    row: dict[str, Any],
    rates: dict[str, float | None],
    main_currency: str,
) -> list[str]:
    """Format a single account row into table cell strings."""
    bal = row["total_balance"]
    rate = rates.get(str(row["currency"]).lower())
    in_main = bal * rate if rate is not None else None
    return [
        str(row["account"]),
        str(row["type"]),
        str(row["owner"]),
        format_money(bal, str(row["currency"])),
        format_money(in_main, main_currency),
    ]


# ── Table with pagination ────────────────────────────────────


def render_table(
    rows: list[dict[str, Any]],
    rates: dict[str, float | None],
    main_currency: str,
    *,
    row_page: int = 0,
    rows_per_page: int = 10,
) -> tuple[str, int, str]:
    """Render the account table with row pagination.

    *rows* are expected to be **pre-filtered** (active only, single currency
    group). Returns ``(table_string, total_row_pages, row_status)``.
    """
    headers = [
        "Account", "Type", "Owner", "Balance",
        f"In {code_plus_symbol(main_currency)}",
    ]
    all_cells = [_row_cells(r, rates, main_currency) for r in rows]
    if not all_cells:
        return "No active accounts.", 1, ""

    total_pages = max(1, -(-len(all_cells) // rows_per_page))  # ceil div
    page = max(0, min(row_page, total_pages - 1))
    start = page * rows_per_page
    page_cells = all_cells[start : start + rows_per_page]

    table = build_table(headers, page_cells, numeric_cols=_NUMERIC_COLS)
    row_status = ""
    if total_pages > 1:
        end = start + len(page_cells)
        row_status = f"Rows {start + 1}\u2013{end} of {len(all_cells)}"
    return table, total_pages, row_status


# ── Full interactive body ─────────────────────────────────────


def build_body(
    rows: list[dict[str, Any]],
    rates: dict[str, float | None],
    main_currency: str,
    *,
    page: int = 0,
    row_page: int = 0,
) -> tuple[str, int]:
    """Build the full overview body for the interactive screen.

    Returns ``(body_string, total_row_pages)`` so the caller can bound
    Up/Down navigation.  ``rows_per_page`` is computed automatically from the
    current terminal height.
    """
    if not rows:
        return "Overview\n\nNo accounts found.\n\nB/ESC  Back", 1

    summary = compute_summaries(rows, rates, main_currency)
    preferred_rows_pp, preferred_mode = _layout_budget()
    available_main_lines = _available_main_lines()

    title = (
        f"Overview \u2014 {summary.n_active}/{summary.n_total} active  |  "
        f"Main: {code_plus_symbol(main_currency)}"
    )

    if not summary.n_active:
        sections = [title]
        sections.extend(["No active accounts.", "B/ESC  Back"])
        return "\n".join(sections), 1

    # Currency-group pagination (1 group per page)
    currencies = summary.sorted_currencies
    total_pages = max(1, len(currencies))
    current_page = max(0, min(page, total_pages - 1))
    currency = currencies[current_page]
    currency_rows = summary.grouped[currency]

    currency_total = sum(float(r["total_balance"]) for r in currency_rows)
    currency_total_main = sum(
        float(r["total_balance"]) * float(rates.get(str(r["currency"]).lower()) or 0)
        for r in currency_rows
    )

    modes = ["cards", "compact", "minimal", "table-only"]
    start_idx = modes.index(preferred_mode)
    candidate_modes = modes[start_idx:]

    for mode in candidate_modes:
        start_rows_pp = min(len(currency_rows), preferred_rows_pp)
        for rows_pp in range(start_rows_pp, 0, -1):
            table_text, total_row_pages, row_status = render_table(
                currency_rows,
                rates,
                main_currency,
                row_page=row_page,
                rows_per_page=rows_pp,
            )
            sections = _build_sections(
                mode=mode,
                title=title,
                summary=summary,
                main_currency=main_currency,
                currency=currency,
                currency_total=currency_total,
                currency_total_main=currency_total_main,
                table_text=table_text,
                row_status=row_status,
                current_page=current_page,
                total_pages=total_pages,
            )
            body = "\n".join(sections)
            if len(body.splitlines()) <= available_main_lines:
                return body, total_row_pages

    table_text, total_row_pages, row_status = render_table(
        currency_rows,
        rates,
        main_currency,
        row_page=row_page,
        rows_per_page=1,
    )
    sections = _build_sections(
        mode="table-only",
        title=title,
        summary=summary,
        main_currency=main_currency,
        currency=currency,
        currency_total=currency_total,
        currency_total_main=currency_total_main,
        table_text=table_text,
        row_status=row_status,
        current_page=current_page,
        total_pages=total_pages,
    )
    return "\n".join(sections), total_row_pages


# ── Preview (main-menu sidebar) ──────────────────────────────


def build_preview_body(
    rows: list[dict[str, Any]],
    rates: dict[str, float | None],
    main_currency: str,
) -> str:
    """Compact text summary shown while navigating the main menu."""
    if not rows:
        return "Overview\n\nNo accounts found."

    summary = compute_summaries(rows, rates, main_currency)

    # Sort currency groups by absolute total in main currency (descending)
    currency_totals: list[tuple[str, list[dict], float]] = []
    for currency, group in summary.grouped.items():
        abs_total = abs(
            sum(
                float(r["total_balance"])
                * float(rates.get(str(r["currency"]).lower()) or 0)
                for r in group
            )
        )
        currency_totals.append((currency, group, abs_total))
    currency_totals.sort(key=lambda t: t[2], reverse=True)

    lines = [
        (
            f"Overview \u2014 {summary.n_active}/{summary.n_total} accounts active | "
            f"Main: {code_plus_symbol(main_currency)}"
        ),
        f"Balance (No Savings): {format_money(summary.non_savings_main, main_currency)}",
        f"Savings: {format_money(summary.savings_main, main_currency)}",
        f"Debts: {format_money(summary.debts_main, main_currency)}",
        f"Total (Including Savings): {format_money(summary.total_main, main_currency)}",
        "",
        "Currencies (by biggest absolute total in main currency):",
    ]

    for currency, group, _ in currency_totals:
        n_active = len(group)
        # Count all accounts (including inactive) for this currency
        n_total_cur = len(
            [r for r in rows if str(r["currency"]).lower() == currency]
        )
        total_main = sum(
            float(r["total_balance"])
            * float(rates.get(str(r["currency"]).lower()) or 0)
            for r in group
        )
        lines.append(
            f"- {code_plus_symbol(currency)}: {n_active}/{n_total_cur} active | "
            f"{format_money(total_main, main_currency)}"
        )

    lines.append("Enter to open full overview.")
    return "\n".join(lines)
