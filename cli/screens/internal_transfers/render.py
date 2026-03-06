"""Body builders and viewport-aware table renderer for Internal Transfers.

The table automatically selects the widest column profile that fits the
current terminal's content panel without horizontal overflow.

Actual minimum content-panel widths per profile
================================================
- **Full**    ≥ 140 chars  – 7 columns: Date, From, To, Sent, Received, Code, Description
- **Medium**  ≥  90 chars  – 5 columns: Date, From, To, Sent, Received
- **Compact** always fits  – 4 columns: Date, From, Sent, Received

Width formula:  1 + Σ(col_widths) + 3 × n_cols
  Full:    1 + (10+16+16+14+15+20+24) + 21 = 137  →  threshold 140
  Medium:  1 + (10+16+16+14+15)       + 15 =  87  →  threshold  90
  Compact: 1 + (10+14+13+14)          + 12 =  64  →  always fits
"""

from __future__ import annotations

from screens.internal_transfers.models import ACTIONS, RenderMode
from utils.currencies import code_plus_symbol, format_money
from utils.pagination import paginate
from utils.rich_ui import render_selectable_list
from utils.table import build_table, clip
from utils.viewport import available_main_lines, terminal_size

# ── Amount column clip width ───────────────────────────────────
_AMOUNT_MAX = 15   # "$-1,234.56 MXN" = 14 chars; one char buffer


# ── Content-width helper ───────────────────────────────────────


def _content_width() -> int:
    """Estimate the usable character width of the Rich content panel."""
    tw, _ = terminal_size()
    menu_width = max(22, min(34, int(tw * 0.28)))
    return tw - menu_width - 6


# ── Row builders per profile ───────────────────────────────────


def _build_row_full(row: dict) -> list[str]:
    """7 columns – only on very wide terminals (content ≥ 140)."""
    return [
        str(row["date"]),
        clip(str(row["send_account_name"]), 16),
        clip(str(row["receive_account_name"]), 16),
        clip(format_money(float(row["sent_value"]) / 100.0, str(row["send_currency"])), _AMOUNT_MAX),
        clip(format_money(float(row["received_value"]) / 100.0, str(row["receive_currency"])), _AMOUNT_MAX),
        clip(str(row.get("movement_code") or "—"), 20),
        clip(str(row.get("description") or "—"), 24),
    ]


def _build_row_medium(row: dict) -> list[str]:
    """5 columns – for terminals with content width 90 – 139."""
    return [
        str(row["date"]),
        clip(str(row["send_account_name"]), 16),
        clip(str(row["receive_account_name"]), 16),
        clip(format_money(float(row["sent_value"]) / 100.0, str(row["send_currency"])), _AMOUNT_MAX),
        clip(format_money(float(row["received_value"]) / 100.0, str(row["receive_currency"])), _AMOUNT_MAX),
    ]


def _build_row_compact(row: dict) -> list[str]:
    """4 essential columns – fits any terminal (content ≥ ~64 chars)."""
    return [
        str(row["date"]),
        clip(str(row["send_account_name"]), 14),
        clip(format_money(float(row["sent_value"]) / 100.0, str(row["send_currency"])), _AMOUNT_MAX - 2),
        clip(format_money(float(row["received_value"]) / 100.0, str(row["receive_currency"])), _AMOUNT_MAX - 1),
    ]


# ── Public table renderer ──────────────────────────────────────


def render_table(
    rows: list[dict],
    page: int,
    *,
    page_size: int | None = None,
) -> tuple[str, int]:
    """Render a viewport-aware transfers table.

    Returns ``(table_text, total_pages)``.  When *page_size* is ``None``
    it is auto-calculated from the available terminal height.
    """
    if not rows:
        return "No internal transfers found.", 1

    if page_size is None:
        # Overhead: title, blank, count, page-info, blank, "Actions",
        # 5 action lines, blank, section heading, table top/header/sep,
        # table bottom = ~17 fixed lines
        overhead = 17
        page_size = max(3, available_main_lines() - overhead)

    pw = paginate(rows, page, page_size)
    width = _content_width()

    if width >= 140:
        headers = ["Date", "From", "To", "Sent", "Received", "Code", "Description"]
        cells = [_build_row_full(r) for r in pw.items]
        numeric_cols = {3, 4}
    elif width >= 90:
        headers = ["Date", "From", "To", "Sent", "Received"]
        cells = [_build_row_medium(r) for r in pw.items]
        numeric_cols = {3, 4}
    else:
        headers = ["Date", "From", "Sent", "Received"]
        cells = [_build_row_compact(r) for r in pw.items]
        numeric_cols = {2, 3}

    table = build_table(headers, cells, numeric_cols=numeric_cols)
    return table, pw.total_pages


# ── Body assembler ─────────────────────────────────────────────


def build_body(
    active_action: str,
    mode: RenderMode,
    transfers: list[dict],
    page: int,
    total_pages: int,
    table_text: str,
    message: str | None = None,
) -> str:
    """Assemble the full Internal Transfers screen body text."""
    action_lines = render_selectable_list(
        ACTIONS,
        active_action,
        show_cursor=mode == "content",
        highlight_active=mode == "input",
        indent=1,
    )

    sections = [
        "Internal Transfers",
        "",
        f"Transfers found: {len(transfers)}",
        f"Page: {page + 1}/{total_pages}  |  Left/Right or P/N to browse",
        "",
        "Actions",
        action_lines,
        "",
        "Transfers (latest first)",
        table_text,
    ]
    if message:
        sections.extend(["", f"Result: {message}"])
    return "\n".join(sections)
