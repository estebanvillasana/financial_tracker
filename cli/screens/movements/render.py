"""Body builders and viewport-aware table renderer for the Movements screen.

The table automatically selects the widest column profile that fits the
current terminal's content panel without horizontal overflow.

Actual minimum content-panel widths per profile
================================================
- **Full**    ≥ 170 chars  – 10 columns (all fields)
- **Medium**  ≥ 105 chars  – 6 columns (movement, date, type, amount, converted, category)
- **Compact** always fits  – 4 columns (movement, date, type, amount)

Width calculation for ``build_table`` output:
    1 (left │) + sum(col_widths) + 3 × (n_cols − 1) + 2 (right " │")
    = 1 + Σw + 3n − 1
    Full: 1 + 136 + 30 = 167  →  threshold 170 (small safety buffer)
    Medium: 1 + 82 + 18 = 101 →  threshold 105
"""

from __future__ import annotations

from screens.movements.data import movement_display_value
from screens.movements.models import ACTIONS, RenderMode
from utils.currencies import code_plus_symbol, format_money
from utils.pagination import paginate
from utils.rich_ui import render_selectable_list
from utils.table import build_table, clip
from utils.viewport import available_main_lines, terminal_size

# ── Amount column clip widths ─────────────────────────────────
# format_money can produce variable-length strings. We clip to a
# known max so table width stays predictable across profiles.
_AMOUNT_MAX = 15   # "$-1,234.56 MXN" = 14 chars; 15 gives one char buffer
_CONVERTED_MAX = 16  # "₽-12,345.67 RUB" = 15 chars; 16 gives one char buffer


# ── Content-width helper ──────────────────────────────────────


def _content_width() -> int:
    """Estimate the usable character width of the Rich content panel.

    Mirrors the menu_width formula in ``rich_ui.build_rich_layout`` and
    subtracts panel borders (``│ … │``) and inner padding on both sides.
    """
    tw, _ = terminal_size()
    menu_width = max(22, min(34, int(tw * 0.28)))
    # 6 = left border (1) + left pad (1) + right pad (1) + right border (1)
    #     + menu right border (1) + content left border (1)
    return tw - menu_width - 6


# ── Row builders per profile ──────────────────────────────────


def _build_row_full(
    row: dict,
    rates: dict[str, float | None],
    main_currency: str,
) -> list[str]:
    """10 columns – only used on very wide terminals (content ≥ 170)."""
    cur = str(row["currency"]).lower()
    rate = rates.get(cur)
    converted = (
        movement_display_value(row) * float(rate) if rate is not None else None
    )
    return [
        clip(str(row["movement"]), 22),
        clip(str(row.get("description") or "—"), 16),
        str(row["date"]),
        str(row["type"]),
        clip(format_money(movement_display_value(row), str(row["currency"])), _AMOUNT_MAX),
        clip(format_money(converted, main_currency), _CONVERTED_MAX),
        clip(str(row.get("repetitive_movement") or "—"), 15),
        "Yes" if int(row.get("invoice") or 0) == 1 else "No",
        clip(str(row.get("category") or "—"), 15),
        clip(str(row.get("sub_category") or "—"), 15),
    ]


def _build_row_medium(
    row: dict,
    rates: dict[str, float | None],
    main_currency: str,
) -> list[str]:
    """6 columns – for terminals with content width 105 – 169."""
    cur = str(row["currency"]).lower()
    rate = rates.get(cur)
    converted = (
        movement_display_value(row) * float(rate) if rate is not None else None
    )
    return [
        clip(str(row["movement"]), 20),
        str(row["date"]),
        str(row["type"]),
        clip(format_money(movement_display_value(row), str(row["currency"])), _AMOUNT_MAX),
        clip(format_money(converted, main_currency), _CONVERTED_MAX),
        clip(str(row.get("category") or "—"), 16),
    ]


def _build_row_compact(row: dict) -> list[str]:
    """4 essential columns – fits any terminal (content ≥ ~63 chars)."""
    return [
        clip(str(row["movement"]), 18),
        str(row["date"]),
        str(row["type"]),
        clip(format_money(movement_display_value(row), str(row["currency"])), _AMOUNT_MAX),
    ]


# ── Cell styler ───────────────────────────────────────────────


def _type_cell_styler(type_col: int):
    """Return a cell_styler that colours the Type column green/red."""

    def _styler(row_idx: int, col: int, padded: str) -> str:
        if col == type_col:
            raw = padded.strip()
            if raw in {"Income", "Expense"}:
                color = "green" if raw == "Income" else "red"
                return f"[[group:{color}]]{padded}[[/group]]"
        return padded

    return _styler


# ── Public table renderer ─────────────────────────────────────


def render_table(
    rows: list[dict],
    page: int,
    rates: dict[str, float | None],
    main_currency: str,
    *,
    page_size: int | None = None,
) -> tuple[str, int]:
    """Render a viewport-aware movement table.

    Selects the widest column profile that fits the estimated content-panel
    width, so the table never forces horizontal scrolling or line-wrapping.

    Args:
        rows:          Full movement list (all pages).
        page:          Zero-based current page index.
        rates:         ``{currency_code: rate_or_None}`` FX map.
        main_currency: Code for the "converted" column header.
        page_size:     Rows per page; auto-sized from terminal height if None.

    Returns:
        ``(table_text, total_pages)``
    """
    if not rows:
        return "No movements found.", 1

    # Auto-size rows per page to fit the terminal vertically.
    # Overhead accounts for: title, blank, filter, count, page-info,
    # currency, blank, "Actions" heading, 4 action lines, blank,
    # "Movement List" heading, 3 table-frame lines (top+header+sep),
    # table bottom border = ~18 fixed lines.
    if page_size is None:
        overhead = 18
        page_size = max(3, available_main_lines() - overhead)

    pw = paginate(rows, page, page_size)
    width = _content_width()
    conv_header = f"In {code_plus_symbol(main_currency)}"

    # ── Profile selection ─────────────────────────────────────
    # Thresholds are derived from the calculated table widths above.
    if width >= 170:
        headers = [
            "Movement", "Description", "Date", "Type", "Amount",
            conv_header, "Repetitive", "Invoice", "Category", "Sub-category",
        ]
        cells = [_build_row_full(r, rates, main_currency) for r in pw.items]
        type_col = 3
    elif width >= 105:
        headers = ["Movement", "Date", "Type", "Amount", conv_header, "Category"]
        cells = [_build_row_medium(r, rates, main_currency) for r in pw.items]
        type_col = 2
    else:
        headers = ["Movement", "Date", "Type", "Amount"]
        cells = [_build_row_compact(r) for r in pw.items]
        type_col = 2

    numeric_cols: set[int] = {headers.index("Amount")}
    if conv_header in headers:
        numeric_cols.add(headers.index(conv_header))

    table = build_table(
        headers,
        cells,
        numeric_cols=numeric_cols,
        cell_styler=_type_cell_styler(type_col),
    )
    return table, pw.total_pages


# ── Body assembler ────────────────────────────────────────────


def build_body(
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
    """Assemble the full Movements screen body text.

    Combines the header info block, action menu, movement table, and an
    optional result message into a single string for ``render_screen()``.
    """
    action_lines = render_selectable_list(
        ACTIONS,
        active_action,
        show_cursor=mode == "content",
        highlight_active=mode == "input",
        indent=1,
    )

    if selected_account is not None:
        account_label = (
            f"{selected_account['account']} ({selected_account['owner']}) | "
            f"{code_plus_symbol(str(selected_account['currency']))}"
        )
    else:
        account_label = "All active accounts"

    sections = [
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
        sections.extend(["", f"Result: {message}"])
    return "\n".join(sections)
