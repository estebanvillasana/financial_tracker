"""Shared box-drawing table renderer for CLI screens."""

from __future__ import annotations

from typing import Callable


def build_table(
    headers: list[str],
    rows: list[list[str]],
    *,
    numeric_cols: set[int] | None = None,
    cell_styler: Callable[[int, int, str], str] | None = None,
) -> str:
    """Render a Unicode box-drawing table from headers and pre-formatted cells.

    Args:
        headers: Column header strings.
        rows: Each inner list must have the same length as *headers*.
        numeric_cols: Column indices to right-justify (default: left-justify all).
        cell_styler: Optional callback ``(row_index, col_index, padded_text) -> str``
            invoked on each data cell *after* padding.  Use this to inject markup
            (e.g. ``[[group:green]]``) around specific cells.

    Returns the complete table as a single string.  Returns ``"No data."`` when
    *rows* is empty.
    """
    if not rows:
        return "No data."

    numeric = numeric_cols or set()
    n_cols = len(headers)

    widths = [
        max(len(headers[i]), max((len(r[i]) for r in rows), default=0))
        for i in range(n_cols)
    ]

    def _pad(col: int, text: str) -> str:
        w = widths[col]
        return text.rjust(w) if col in numeric else text.ljust(w)

    def _header_row() -> str:
        return "│ " + " │ ".join(_pad(i, h) for i, h in enumerate(headers)) + " │"

    def _data_row(row_idx: int, cells: list[str]) -> str:
        parts = []
        for col, cell in enumerate(cells):
            padded = _pad(col, cell)
            if cell_styler is not None:
                padded = cell_styler(row_idx, col, padded)
            parts.append(padded)
        return "│ " + " │ ".join(parts) + " │"

    top = "┌" + "┬".join("─" * (w + 2) for w in widths) + "┐"
    sep = "├" + "┼".join("─" * (w + 2) for w in widths) + "┤"
    bot = "└" + "┴".join("─" * (w + 2) for w in widths) + "┘"

    lines = [top, _header_row(), sep]
    for i, row in enumerate(rows):
        lines.append(_data_row(i, row))
    lines.append(bot)
    return "\n".join(lines)


def clip(value: str, max_len: int) -> str:
    """Truncate *value* to *max_len* characters, appending ``'…'`` if clipped."""
    return value if len(value) <= max_len else value[: max_len - 1] + "…"
