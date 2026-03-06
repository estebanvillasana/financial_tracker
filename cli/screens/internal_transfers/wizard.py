"""Multi-step wizard for creating or editing an internal transfer.

A transfer is a paired Expense + Income between two of the user's accounts.
The wizard collects: description, date, from-account, sent amount, to-account,
received amount, then a confirmation step.

Supports an optional *initial* dict (from an existing transfer) for edit mode.
"""

from __future__ import annotations

from datetime import date

from config import CliConfig
from screens.internal_transfers.models import MENU_KEY, TransferDraft
from utils.inline_input import BACK_TOKEN, prompt_inline_numbered_choice, prompt_inline_text
from utils.currencies import code_plus_symbol, format_money
from utils.money import parse_major_to_cents
from utils.render import render_screen

# ── Step index constants ───────────────────────────────────────
_STEP_DESC = 0
_STEP_DATE = 1
_STEP_FROM = 2
_STEP_SENT = 3
_STEP_TO   = 4
_STEP_RECV = 5
_STEP_CONFIRM = 6


def _choose_account(
    menu_items: list[tuple[str, str]],
    accounts: list[dict],
    label: str,
    body_builder,
    exclude_account_id: int | None = None,
):
    """Prompt the user to pick an account, optionally excluding one.

    Returns the selected account dict, ``BACK_TOKEN``, or ``None`` on cancel.
    """
    filtered = [
        row for row in accounts
        if int(row["id"]) != int(exclude_account_id or -1)
    ]
    if not filtered:
        return None
    sorted_accounts = sorted(
        filtered,
        key=lambda r: (str(r["owner"]).lower(), str(r["account"]).lower()),
    )
    options = [
        f"{r['account']} ({r['owner']}) | "
        f"{format_money(float(r['total_balance']) / 100.0, str(r['currency']))}"
        for r in sorted_accounts
    ]
    selected = prompt_inline_numbered_choice(
        menu_items=menu_items,
        menu_active_key=MENU_KEY,
        label=label,
        options=options,
        body_builder=body_builder,
        render_screen=render_screen,
        interaction_area="content",
        back_key="B",
    )
    if selected is None:
        return None
    if selected == BACK_TOKEN:
        return BACK_TOKEN
    return sorted_accounts[options.index(selected)]


def prompt_transfer(
    menu_items: list[tuple[str, str]],
    config: CliConfig,
    accounts: list[dict],
    body_builder,
    initial: dict | None = None,
) -> TransferDraft | None:
    """Run the 6-step transfer wizard and return the draft, or None on cancel.

    Args:
        menu_items:   Sidebar menu entries for ``render_screen``.
        config:       Application configuration (unused; kept for API symmetry).
        accounts:     Active bank accounts list from the API.
        body_builder: Callable returning the current body in input mode.
        initial:      Existing transfer dict to pre-fill fields (edit mode).

    Returns:
        A filled ``TransferDraft``, or ``None`` if the user cancels.
    """
    # ── Seed initial values ────────────────────────────────────
    description_text: str = str(initial.get("description") or "") if initial else ""
    movement_date: str = str(initial["date"]) if initial else date.today().isoformat()

    # In edit mode, try to find the original accounts by ID in the list
    send_account: dict | None = None
    receive_account: dict | None = None
    if initial:
        send_id = int(initial["send_account_id"])
        receive_id = int(initial["receive_account_id"])
        send_account = next(
            (a for a in accounts if int(a["id"]) == send_id), None
        )
        receive_account = next(
            (a for a in accounts if int(a["id"]) == receive_id), None
        )

    sent_text: str = (
        f"{float(initial['sent_value']) / 100.0:.2f}" if initial else ""
    )
    sent_value: int = int(initial["sent_value"]) if initial else 0
    received_text: str = (
        f"{float(initial['received_value']) / 100.0:.2f}" if initial else ""
    )
    received_value: int = int(initial["received_value"]) if initial else 0

    is_edit = initial is not None
    confirm_label = "Confirm update" if is_edit else "Confirm internal transfer"
    confirm_yes   = "Yes, update transfer" if is_edit else "Yes, create transfer"

    step = _STEP_DESC
    while True:
        # ── Step 0: Description (optional) ────────────────────
        if step == _STEP_DESC:
            typed = prompt_inline_text(
                menu_items=menu_items,
                menu_active_key=MENU_KEY,
                label="Description (optional)",
                initial_value=description_text,
                body_builder=body_builder,
                render_screen=render_screen,
                interaction_area="content",
            )
            if typed is None:
                return None
            description_text = typed
            step = _STEP_DATE
            continue

        # ── Step 1: Date ───────────────────────────────────────
        if step == _STEP_DATE:
            typed = prompt_inline_text(
                menu_items=menu_items,
                menu_active_key=MENU_KEY,
                label="Date (YYYY-MM-DD)",
                initial_value=movement_date,
                body_builder=body_builder,
                render_screen=render_screen,
                interaction_area="content",
                min_length=10,
                back_key="B",
            )
            if typed is None:
                return None
            if typed == BACK_TOKEN:
                step = _STEP_DESC
                continue
            try:
                date.fromisoformat(typed.strip())
                movement_date = typed.strip()
                step = _STEP_FROM
            except ValueError:
                movement_date = typed.strip()  # keep for correction
            continue

        # ── Step 2: From account ───────────────────────────────
        if step == _STEP_FROM:
            picked = _choose_account(
                menu_items, accounts, "From account", body_builder,
            )
            if picked is None:
                return None
            if picked == BACK_TOKEN:
                step = _STEP_DATE
                continue
            send_account = picked
            # Reset dependent fields when sender changes
            receive_account = None
            step = _STEP_SENT
            continue

        # ── Step 3: Amount to send ─────────────────────────────
        if step == _STEP_SENT:
            cur_label = code_plus_symbol(str(send_account["currency"]))
            typed = prompt_inline_text(
                menu_items=menu_items,
                menu_active_key=MENU_KEY,
                label=f"Amount to send ({cur_label})",
                initial_value=sent_text,
                body_builder=body_builder,
                render_screen=render_screen,
                interaction_area="content",
                min_length=1,
                back_key="B",
            )
            if typed is None:
                return None
            if typed == BACK_TOKEN:
                step = _STEP_FROM
                continue
            parsed = parse_major_to_cents(typed)
            if parsed is None:
                sent_text = typed  # keep invalid input for correction
                continue
            sent_text = typed
            sent_value = parsed
            step = _STEP_TO
            continue

        # ── Step 4: To account ─────────────────────────────────
        if step == _STEP_TO:
            picked = _choose_account(
                menu_items, accounts, "To account", body_builder,
                exclude_account_id=int(send_account["id"]),
            )
            if picked is None:
                return None
            if picked == BACK_TOKEN:
                step = _STEP_SENT
                continue
            receive_account = picked
            step = _STEP_RECV
            continue

        # ── Step 5: Amount to receive ──────────────────────────
        if step == _STEP_RECV:
            cur_label = code_plus_symbol(str(receive_account["currency"]))
            typed = prompt_inline_text(
                menu_items=menu_items,
                menu_active_key=MENU_KEY,
                label=f"Amount to receive ({cur_label})",
                initial_value=received_text,
                body_builder=body_builder,
                render_screen=render_screen,
                interaction_area="content",
                min_length=1,
                back_key="B",
            )
            if typed is None:
                return None
            if typed == BACK_TOKEN:
                step = _STEP_TO
                continue
            parsed = parse_major_to_cents(typed)
            if parsed is None:
                received_text = typed
                continue
            received_text = typed
            received_value = parsed
            step = _STEP_CONFIRM
            continue

        # ── Step 6: Confirmation ───────────────────────────────
        confirm = prompt_inline_numbered_choice(
            menu_items=menu_items,
            menu_active_key=MENU_KEY,
            label=confirm_label,
            options=[confirm_yes, "No, cancel"],
            body_builder=body_builder,
            render_screen=render_screen,
            interaction_area="content",
            back_key="B",
        )
        if confirm is None:
            return None
        if confirm == BACK_TOKEN:
            step = _STEP_RECV
            continue
        if confirm != confirm_yes:
            return None

        return TransferDraft(
            description=description_text.strip() or None,
            movement_date=movement_date,
            send_account_id=int(send_account["id"]),
            send_account_name=str(send_account["account"]),
            sent_value=sent_value,
            send_currency=str(send_account["currency"]),
            receive_account_id=int(receive_account["id"]),
            receive_account_name=str(receive_account["account"]),
            received_value=received_value,
            receive_currency=str(receive_account["currency"]),
        )
