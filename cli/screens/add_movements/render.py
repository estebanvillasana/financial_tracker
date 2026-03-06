"""Body-text assembly for the Add Movements screen.

Composes the account summary, draft grid, and action menu into a single
string that the Rich layout system can render.
"""

from __future__ import annotations

from screens.add_movements.drafts import (
    projected_balance_cents,
    render_draft_table,
)
from screens.add_movements.models import ACTIONS, DraftMovement, RenderMode
from utils.currencies import code_plus_symbol, format_money
from utils.rich_ui import render_selectable_list


def build_body(
    account: dict,
    last_movement_date: str,
    drafts: list[DraftMovement],
    active_action: str,
    mode: RenderMode,
    message: str | None = None,
) -> str:
    """Assemble the full content body for the Add Movements screen.

    Parameters
    ----------
    account:
        Bank-account dict with at least ``account``, ``owner``,
        ``currency``, and ``total_balance`` keys.
    last_movement_date:
        ISO date string shown as context.
    drafts:
        Current draft-movement list.
    active_action:
        Which action-menu key (``"1"``–``"5"``) is highlighted.
    mode:
        ``"content"`` shows the arrow cursor; ``"input"`` dims the
        cursor (used when an input prompt is open); ``"preview"`` is
        not used here but kept for consistency with other screens.
    message:
        Optional status/result line shown at the bottom.
    """
    show_cursor = mode == "content"
    highlight_active = mode == "input"

    action_lines = render_selectable_list(
        ACTIONS,
        active_action,
        show_cursor=show_cursor,
        highlight_active=highlight_active,
        indent=1,
    )

    currency = str(account["currency"])
    current_total = int(account["total_balance"])
    projected = projected_balance_cents(current_total, drafts)

    # ── Account summary card ──────────────────────────────────
    summary = (
        "Add New Movements\n"
        "\n"
        f"  Account:                          {account['account']} ({account['owner']})\n"
        f"  Currency:                         {code_plus_symbol(currency)}\n"
        f"  Current Balance:                  {format_money(current_total / 100.0, currency)}\n"
        f"  Last Movement Date:               {last_movement_date}\n"
        f"  Draft Movements:                  {len(drafts)}\n"
        f"  Projected Balance After Commit:   {format_money(projected / 100.0, currency)}"
    )

    # ── Assemble sections ─────────────────────────────────────
    sections: list[str] = [
        summary,
        "",
        "Draft Grid",
        render_draft_table(drafts, currency),
        "",
        "Actions",
        action_lines,
    ]

    if message:
        sections.extend(["", f"Result: {message}"])

    return "\n".join(sections)
