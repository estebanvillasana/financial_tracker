"""Summary card rendering for the Overview screen.

Provides two display modes:
* **Full cards** — a 2×2 horizontal grid of box-drawing cards (10 lines).
* **Compact summary** — a single line with pipe-separated values for small
  terminals where cards would not leave enough room for the data table.
"""

from __future__ import annotations

from utils.currencies import format_money


# ── Single card ──────────────────────────────────────────────


def _card(title: str, value: str, width: int = 34) -> str:
    """Render one box-drawing summary card (5 lines tall)."""
    inner = max(22, width - 2)
    return "\n".join(
        [
            "┌" + "─" * inner + "┐",
            f"│ {title[: inner - 2].ljust(inner - 2)} │",
            "├" + "─" * inner + "┤",
            f"│ {value[: inner - 2].rjust(inner - 2)} │",
            "└" + "─" * inner + "┘",
        ]
    )


# ── Horizontal merge ─────────────────────────────────────────


def _side_by_side(left: str, right: str, gap: int = 2) -> str:
    """Place two multi-line strings next to each other with *gap* spaces."""
    lines_l = left.splitlines()
    lines_r = right.splitlines()
    w = max(len(ln) for ln in lines_l)
    spacer = " " * gap
    n = max(len(lines_l), len(lines_r))
    out: list[str] = []
    for i in range(n):
        l_part = lines_l[i].ljust(w) if i < len(lines_l) else " " * w
        r_part = lines_r[i] if i < len(lines_r) else ""
        out.append(l_part + spacer + r_part)
    return "\n".join(out)


# ── Public helpers ───────────────────────────────────────────


def render_summary_cards(
    non_savings: float,
    savings: float,
    debts: float,
    total: float,
    main_currency: str,
) -> str:
    """Render four summary cards in a 2×2 horizontal grid (10 lines total)."""
    c1 = _card("Balance (No Savings)", format_money(non_savings, main_currency))
    c2 = _card("Total Savings", format_money(savings, main_currency))
    c3 = _card("Total Debts", format_money(debts, main_currency))
    c4 = _card("Total (with Savings)", format_money(total, main_currency))
    return _side_by_side(c1, c2) + "\n" + _side_by_side(c3, c4)


def render_compact_summary(
    non_savings: float,
    savings: float,
    debts: float,
    total: float,
    main_currency: str,
) -> str:
    """One-line fallback for terminals too short for the card grid."""
    parts = [
        f"Balance: {format_money(non_savings, main_currency)}",
        f"Savings: {format_money(savings, main_currency)}",
        f"Debts: {format_money(debts, main_currency)}",
        f"Total: {format_money(total, main_currency)}",
    ]
    return "  │  ".join(parts)
