"""Multi-step wizard for editing an existing movement.

The wizard walks through 8 fields plus a confirmation step.  Each step
supports ``BACK_TOKEN`` to revisit the previous field.  Returns a
``MovementEditDraft`` on confirmation, or ``None`` if the user cancels.
"""

from __future__ import annotations

from datetime import date
from typing import Literal

from config import CliConfig
from screens.movements.models import MENU_KEY, MovementEditDraft
from utils.inline_input import BACK_TOKEN, prompt_inline_numbered_choice, prompt_inline_text
from utils.money import parse_major_to_cents
from utils.render import render_screen


def prompt_edit(
    menu_items: list[tuple[str, str]],
    config: CliConfig,
    row: dict,
    categories: list[dict],
    sub_categories: list[dict],
    repetitive: list[dict],
    body_builder,
) -> MovementEditDraft | None:
    """Run the 8-step edit wizard and return the draft, or *None* on cancel.

    Args:
        menu_items:      Sidebar menu entries for ``render_screen``.
        config:          Application configuration.
        row:             The movement dict being edited.
        categories:      All categories from the API.
        sub_categories:  All sub-categories from the API.
        repetitive:      All repetitive movements from the API.
        body_builder:    Callable returning the current body in input mode.
    """
    # ── Seed initial values from the existing movement ────────
    movement = str(row["movement"])
    description = str(row.get("description") or "")
    movement_type: Literal["Income", "Expense"] = str(row["type"])  # type: ignore[assignment]
    value_text = f"{(float(row['value']) / 100.0):.2f}"
    value_cents = int(row["value"])
    movement_date = str(row["date"])
    category_id = (
        int(row["category_id"]) if row.get("category_id") is not None else None
    )
    sub_category_id = (
        int(row["sub_category_id"]) if row.get("sub_category_id") is not None else None
    )
    repetitive_movement_id = (
        int(row["repetitive_movement_id"])
        if row.get("repetitive_movement_id") is not None
        else None
    )
    invoice = int(row.get("invoice") or 0)

    step = 0
    while True:
        # ── Step 0: Movement name ─────────────────────────────
        if step == 0:
            typed = prompt_inline_text(
                menu_items=menu_items,
                menu_active_key=MENU_KEY,
                label="Movement",
                initial_value=movement,
                body_builder=body_builder,
                render_screen=render_screen,
                interaction_area="content",
                min_length=1,
            )
            if typed is None:
                return None
            movement = typed.strip()
            step = 1
            continue

        # ── Step 1: Description (optional) ────────────────────
        if step == 1:
            typed = prompt_inline_text(
                menu_items=menu_items,
                menu_active_key=MENU_KEY,
                label="Description (optional)",
                initial_value=description,
                body_builder=body_builder,
                render_screen=render_screen,
                interaction_area="content",
                back_key="B",
            )
            if typed is None:
                return None
            if typed == BACK_TOKEN:
                step = 0
                continue
            description = typed
            step = 2
            continue

        # ── Step 2: Type (Expense / Income) ───────────────────
        if step == 2:
            options = (
                ["Expense", "Income"]
                if movement_type == "Expense"
                else ["Income", "Expense"]
            )
            picked = prompt_inline_numbered_choice(
                menu_items=menu_items,
                menu_active_key=MENU_KEY,
                label="Type",
                options=options,
                body_builder=body_builder,
                render_screen=render_screen,
                interaction_area="content",
                back_key="B",
            )
            if picked is None:
                return None
            if picked == BACK_TOKEN:
                step = 1
                continue
            movement_type = picked  # type: ignore[assignment]
            # Reset dependent fields when type changes
            category_id = None
            sub_category_id = None
            repetitive_movement_id = None
            step = 3
            continue

        # ── Step 3: Value (major units) ───────────────────────
        if step == 3:
            typed = prompt_inline_text(
                menu_items=menu_items,
                menu_active_key=MENU_KEY,
                label="Value (major units)",
                initial_value=value_text,
                body_builder=body_builder,
                render_screen=render_screen,
                interaction_area="content",
                min_length=1,
                back_key="B",
            )
            if typed is None:
                return None
            if typed == BACK_TOKEN:
                step = 2
                continue
            parsed = parse_major_to_cents(typed)
            if parsed is None:
                value_text = typed  # keep invalid input for correction
                continue
            value_text = typed
            value_cents = parsed
            step = 4
            continue

        # ── Step 4: Category ──────────────────────────────────
        if step == 4:
            type_cats = [
                c for c in categories if str(c["type"]) == movement_type
            ]
            if not type_cats:
                return None
            sorted_cats = sorted(
                type_cats, key=lambda c: str(c["category"]).lower()
            )
            cat_options = [str(c["category"]) for c in sorted_cats]
            picked = prompt_inline_numbered_choice(
                menu_items=menu_items,
                menu_active_key=MENU_KEY,
                label="Category",
                options=cat_options,
                body_builder=body_builder,
                render_screen=render_screen,
                interaction_area="content",
                back_key="B",
            )
            if picked is None:
                return None
            if picked == BACK_TOKEN:
                step = 3
                continue
            category_id = int(
                sorted_cats[cat_options.index(picked)]["id"]
            )
            sub_category_id = None
            step = 5
            continue

        # ── Step 5: Sub-category (optional) ───────────────────
        if step == 5:
            candidates = [
                s
                for s in sub_categories
                if int(s["category_id"]) == int(category_id or 0)
            ]
            sorted_subs = sorted(
                candidates, key=lambda s: str(s["sub_category"]).lower()
            )
            sub_options = ["(None)"] + [
                str(s["sub_category"]) for s in sorted_subs
            ]
            picked = prompt_inline_numbered_choice(
                menu_items=menu_items,
                menu_active_key=MENU_KEY,
                label="Sub-category (optional)",
                options=sub_options,
                body_builder=body_builder,
                render_screen=render_screen,
                interaction_area="content",
                back_key="B",
            )
            if picked is None:
                return None
            if picked == BACK_TOKEN:
                step = 4
                continue
            sub_category_id = (
                None
                if picked == "(None)"
                else int(sorted_subs[sub_options.index(picked) - 1]["id"])
            )
            step = 6
            continue

        # ── Step 6: Date ──────────────────────────────────────
        if step == 6:
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
                step = 5
                continue
            try:
                date.fromisoformat(typed.strip())
                movement_date = typed.strip()
                step = 7
            except ValueError:
                movement_date = typed.strip()  # keep for correction
            continue

        # ── Step 7: Repetitive movement (optional) ────────────
        if step == 7:
            reps = [
                r for r in repetitive if str(r["type"]) == movement_type
            ]
            sorted_rep = sorted(
                reps, key=lambda r: str(r["movement"]).lower()
            )
            rep_options = ["(None)"] + [
                str(r["movement"]) for r in sorted_rep
            ]
            picked = prompt_inline_numbered_choice(
                menu_items=menu_items,
                menu_active_key=MENU_KEY,
                label="Repetitive movement (optional)",
                options=rep_options,
                body_builder=body_builder,
                render_screen=render_screen,
                interaction_area="content",
                back_key="B",
            )
            if picked is None:
                return None
            if picked == BACK_TOKEN:
                step = 6
                continue
            repetitive_movement_id = (
                None
                if picked == "(None)"
                else int(sorted_rep[rep_options.index(picked) - 1]["id"])
            )
            step = 8
            continue

        # ── Step 8: Confirmation ──────────────────────────────
        confirm = prompt_inline_numbered_choice(
            menu_items=menu_items,
            menu_active_key=MENU_KEY,
            label="Confirm update",
            options=["Yes, update movement", "No, cancel"],
            body_builder=body_builder,
            render_screen=render_screen,
            interaction_area="content",
            back_key="B",
        )
        if confirm is None:
            return None
        if confirm == BACK_TOKEN:
            step = 7
            continue
        if confirm != "Yes, update movement":
            return None

        return MovementEditDraft(
            movement=movement,
            description=description.strip() or None,
            account_id=int(row["account_id"]),
            value=value_cents,
            type=movement_type,
            movement_date=movement_date,
            category_id=category_id,
            sub_category_id=sub_category_id,
            repetitive_movement_id=repetitive_movement_id,
            movement_code=row.get("movement_code"),
            invoice=invoice,
        )
