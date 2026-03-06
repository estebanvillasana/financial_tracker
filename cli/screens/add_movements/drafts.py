"""Draft-grid rendering and projected-balance calculations.

Pure functions that operate on lists of :class:`DraftMovement` — no API
calls, no side-effects.
"""

from __future__ import annotations

from screens.add_movements.models import DraftMovement
from utils.currencies import format_money
from utils.table import build_table, clip


# ── Formatting helpers ────────────────────────────────────────


def format_draft_value(cents: int, currency: str) -> str:
    """Format an integer cents value as a human-readable currency string."""
    return format_money(float(cents) / 100.0, currency)


# ── Balance projection ────────────────────────────────────────


def projected_balance_cents(
    current_total_cents: int,
    drafts: list[DraftMovement],
) -> int:
    """Compute the projected account balance after all drafts are applied.

    Income drafts are added; expense drafts are subtracted.
    """
    delta = sum(
        d.value if d.type == "Income" else -d.value
        for d in drafts
    )
    return current_total_cents + delta


# ── Draft table ───────────────────────────────────────────────


def render_draft_table(drafts: list[DraftMovement], currency: str) -> str:
    """Return a box-drawing table of the current draft movements.

    Shows a friendly placeholder when the list is empty.
    """
    if not drafts:
        return "No draft movements yet."

    headers = [
        "#", "Date", "Type", "Movement", "Amount", "Category", "Sub-category",
    ]
    body_rows = [
        [
            str(index),
            row.date,
            row.type,
            clip(row.movement, 24),
            format_draft_value(row.value, currency),
            clip(row.category or "—", 18),
            clip(row.sub_category or "—", 18),
        ]
        for index, row in enumerate(drafts, start=1)
    ]
    return build_table(headers, body_rows, numeric_cols={0, 4})
