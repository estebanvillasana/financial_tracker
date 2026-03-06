"""Coordinator for the Overview screen full-body rendering."""

from __future__ import annotations

from typing import Any

from utils.currencies import code_plus_symbol, format_money
from utils.viewport import available_main_lines, first_fitting, text_line_count

from screens.overview.data import compute_summaries
from screens.overview.layout import build_sections, layout_budget
from screens.overview.table import render_accounts_table


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
    preferred_rows_pp, preferred_mode = layout_budget()
    max_lines = available_main_lines()

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

    def _candidate_builders():
        for mode in candidate_modes:
            start_rows_pp = min(len(currency_rows), preferred_rows_pp)
            for rows_pp in range(start_rows_pp, 0, -1):
                def _build(mode: str = mode, rows_pp: int = rows_pp) -> tuple[str, int]:
                    table_text, total_row_pages, row_status = render_accounts_table(
                        currency_rows,
                        rates,
                        main_currency,
                        row_page=row_page,
                        rows_per_page=rows_pp,
                    )
                    sections = build_sections(
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
                    return "\n".join(sections), total_row_pages
                yield _build

    fitted = first_fitting(
        _candidate_builders(),
        max_lines=max_lines,
        line_counter=lambda item: text_line_count(item[0]),
    )
    if fitted is not None:
        return fitted

    table_text, total_row_pages, row_status = render_accounts_table(
        currency_rows,
        rates,
        main_currency,
        row_page=row_page,
        rows_per_page=1,
    )
    sections = build_sections(
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
