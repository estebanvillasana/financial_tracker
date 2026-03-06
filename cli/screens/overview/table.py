"""Table rendering for the Overview screen."""

from __future__ import annotations

from typing import Any

from utils.currencies import code_plus_symbol, format_money
from utils.pagination import paginate
from utils.table import build_table


_NUMERIC_COLS = {3, 4}


def row_cells(
    row: dict[str, Any],
    rates: dict[str, float | None],
    main_currency: str,
) -> list[str]:
    """Format a single account row into table cell strings."""
    balance = row["total_balance"]
    rate = rates.get(str(row["currency"]).lower())
    in_main = balance * rate if rate is not None else None
    return [
        str(row["account"]),
        str(row["type"]),
        str(row["owner"]),
        format_money(balance, str(row["currency"])),
        format_money(in_main, main_currency),
    ]


def render_accounts_table(
    rows: list[dict[str, Any]],
    rates: dict[str, float | None],
    main_currency: str,
    *,
    row_page: int = 0,
    rows_per_page: int = 10,
) -> tuple[str, int, str]:
    """Render the paginated account table and its row-page status."""
    headers = [
        "Account",
        "Type",
        "Owner",
        "Balance",
        f"In {code_plus_symbol(main_currency)}",
    ]
    all_cells = [row_cells(row, rates, main_currency) for row in rows]
    if not all_cells:
        return "No active accounts.", 1, ""

    page_window = paginate(all_cells, row_page, rows_per_page)
    table = build_table(headers, page_window.items, numeric_cols=_NUMERIC_COLS)
    row_status = ""
    if page_window.total_pages > 1:
        row_status = (
            f"Rows {page_window.start_index + 1}\u2013{page_window.end_index} "
            f"of {page_window.total_items}"
        )
    return table, page_window.total_pages, row_status
