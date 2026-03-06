"""API data-fetching helpers for the Add Movements screen.

All network calls are isolated here so the rest of the package stays
pure and testable.
"""

from __future__ import annotations

from config import CliConfig
from functions import api
from utils.api_errors import api_error_message
from utils.currencies import format_money
from utils.inline_input import prompt_inline_numbered_choice
from utils.money import fetch_active_accounts
from utils.references import fetch_references
from utils.render import render_screen


# ── Account selection ─────────────────────────────────────────


def select_account(
    menu_items: list[tuple[str, str]],
    config: CliConfig,
) -> dict | None:
    """Prompt the user to pick an active bank account.

    Returns the selected account dict, or ``None`` if the user cancels
    or no accounts are available.
    """
    try:
        accounts = fetch_active_accounts(config)
    except Exception:
        return None
    if not accounts:
        return None

    sorted_accounts = sorted(
        accounts,
        key=lambda row: (str(row["owner"]).lower(), str(row["account"]).lower()),
    )
    options = [
        f"{row['account']} ({row['owner']}) | "
        f"{format_money(float(row['total_balance']) / 100.0, str(row['currency']))}"
        for row in sorted_accounts
    ]

    selected = prompt_inline_numbered_choice(
        menu_items=menu_items,
        menu_active_key="3",
        label="Bank account",
        options=options,
        body_builder=lambda: "Add New Movements\n\nSelect an active bank account.",
        render_screen=render_screen,
        interaction_area="content",
    )
    if selected is None:
        return None
    return sorted_accounts[options.index(selected)]


# ── Single-record helpers ─────────────────────────────────────


def fetch_last_movement_date(config: CliConfig, account_id: int) -> str:
    """Return the date of the most recent movement for *account_id*, or ``'—'``."""
    rows = api.get(
        config.api_base_url,
        f"/movements?account_id={account_id}&active=1&limit=1",
    )
    if not rows:
        return "—"
    return str(rows[0].get("date") or "—")


def refresh_account(config: CliConfig, account_id: int) -> dict:
    """Re-fetch a single bank-account record from the API."""
    return api.get(config.api_base_url, f"/bank-accounts/{account_id}")


def load_references(
    config: CliConfig,
) -> tuple[list[dict], list[dict], list[dict]]:
    """Fetch categories, sub-categories, and repetitive movements.

    Raises on network errors so callers can show a user-friendly message.
    """
    return fetch_references(config)


def mark_account_updated(config: CliConfig, account_id: int) -> str:
    """Flag the account as 'updated' after a successful commit.

    Returns a human-readable status string.
    """
    try:
        account = api.get(config.api_base_url, f"/bank-accounts/{account_id}")
        payload = {
            "account": account["account"],
            "description": account.get("description"),
            "type": account["type"],
            "owner": account["owner"],
            "currency": str(account["currency"]).lower(),
            "initial_balance": int(account["initial_balance"]),
            "updated": 1,
        }
        api.put(config.api_base_url, f"/bank-accounts/{account_id}", payload)  # type: ignore[attr-defined]
        return "Account marked as updated."
    except Exception as exc:
        return f"Could not mark account updated: {api_error_message(exc)}"
