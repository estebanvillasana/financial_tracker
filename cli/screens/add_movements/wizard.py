"""Multi-step movement-drafting wizard.

Each step collects one piece of data (movement name, description, type,
amount, category, sub-category, date, repetitive movement) and supports
forward/backward navigation via the shared ``BACK_TOKEN``.

The public entry point is :func:`prompt_movement` which orchestrates the
full step sequence and returns a :class:`DraftMovement` or ``None``.
"""

from __future__ import annotations

from datetime import date
from typing import Literal

from config import CliConfig
from screens.add_movements.models import DraftMovement
from utils.inline_input import (
    BACK_TOKEN,
    BodyBuilderFn,
    prompt_inline_numbered_choice,
    prompt_inline_text,
)
from utils.money import parse_major_to_cents
from utils.render import render_screen


# ── Shared types ──────────────────────────────────────────────

MenuItems = list[tuple[str, str]]

# Step indices — gives readable names to the wizard positions.
_STEP_NAME = 0
_STEP_DESCRIPTION = 1
_STEP_TYPE = 2
_STEP_AMOUNT = 3
_STEP_CATEGORY = 4
_STEP_SUB_CATEGORY = 5
_STEP_DATE = 6
_STEP_REPETITIVE = 7
_STEP_CONFIRM = 8


# ── Individual step functions ─────────────────────────────────
#
# Each step returns ``None`` to signal ESC (cancel the whole wizard),
# ``BACK_TOKEN`` to go back one step, or a value to proceed.


def _ask_name(
    menu_items: MenuItems,
    body_builder: BodyBuilderFn,
    current: str,
) -> str | None:
    """Step 0 — movement name (required)."""
    return prompt_inline_text(
        menu_items=menu_items,
        menu_active_key="3",
        label="Movement",
        initial_value=current,
        body_builder=body_builder,
        render_screen=render_screen,
        interaction_area="content",
        min_length=1,
    )


def _ask_description(
    menu_items: MenuItems,
    body_builder: BodyBuilderFn,
    current: str,
) -> str | None:
    """Step 1 — optional description."""
    return prompt_inline_text(
        menu_items=menu_items,
        menu_active_key="3",
        label="Description (optional)",
        initial_value=current,
        body_builder=body_builder,
        render_screen=render_screen,
        interaction_area="content",
        min_length=0,
        back_key="B",
    )


def _ask_type(
    menu_items: MenuItems,
    body_builder: BodyBuilderFn,
    current: Literal["Income", "Expense"],
) -> str | None:
    """Step 2 — Income or Expense."""
    # Put the current choice first so arrow-press selection is intuitive.
    if current == "Income":
        options = ["Income", "Expense"]
    else:
        options = ["Expense", "Income"]

    return prompt_inline_numbered_choice(
        menu_items=menu_items,
        menu_active_key="3",
        label="Type",
        options=options,
        body_builder=body_builder,
        render_screen=render_screen,
        interaction_area="content",
        back_key="B",
    )


def _ask_amount(
    menu_items: MenuItems,
    body_builder: BodyBuilderFn,
    current_text: str,
) -> tuple[str, int] | str | None:
    """Step 3 — monetary value in major units.

    Returns ``(text, cents)`` on success, ``BACK_TOKEN`` to go back, or
    ``None`` to cancel.  Re-prompts on invalid input.
    """
    while True:
        result = prompt_inline_text(
            menu_items=menu_items,
            menu_active_key="3",
            label="Value (major units, e.g. 21.34)",
            initial_value=current_text,
            body_builder=body_builder,
            render_screen=render_screen,
            interaction_area="content",
            min_length=1,
            back_key="B",
        )
        if result is None:
            return None
        if result == BACK_TOKEN:
            return BACK_TOKEN

        parsed = parse_major_to_cents(result)
        if parsed is not None:
            return result, parsed
        # Invalid — keep the text so the user can correct it.
        current_text = result


def _ask_category(
    menu_items: MenuItems,
    body_builder: BodyBuilderFn,
    categories: list[dict],
    movement_type: str,
) -> dict | str | None:
    """Step 4 — select a category matching the movement type.

    Returns the selected category dict, ``BACK_TOKEN``, or ``None``.
    """
    type_categories = [
        row for row in categories if str(row["type"]) == movement_type
    ]
    if not type_categories:
        return None

    sorted_cats = sorted(
        type_categories, key=lambda r: str(r["category"]).lower()
    )
    options = [str(r["category"]) for r in sorted_cats]

    pick = prompt_inline_numbered_choice(
        menu_items=menu_items,
        menu_active_key="3",
        label="Category",
        options=options,
        body_builder=body_builder,
        render_screen=render_screen,
        interaction_area="content",
        back_key="B",
    )
    if pick is None:
        return None
    if pick == BACK_TOKEN:
        return BACK_TOKEN
    return sorted_cats[options.index(pick)]


def _ask_sub_category(
    menu_items: MenuItems,
    body_builder: BodyBuilderFn,
    sub_categories: list[dict],
    category_id: int,
) -> dict | str | None:
    """Step 5 — optional sub-category scoped to the chosen category.

    Returns the selected sub-category dict, ``None`` (for '(None)' choice),
    ``BACK_TOKEN``, or ``None`` on ESC.
    """
    valid = [
        row for row in sub_categories
        if int(row["category_id"]) == category_id
    ]
    sorted_subs = sorted(valid, key=lambda r: str(r["sub_category"]).lower())
    options = ["(None)"] + [str(r["sub_category"]) for r in sorted_subs]

    pick = prompt_inline_numbered_choice(
        menu_items=menu_items,
        menu_active_key="3",
        label="Sub-category (optional)",
        options=options,
        body_builder=body_builder,
        render_screen=render_screen,
        interaction_area="content",
        back_key="B",
    )
    if pick is None:
        return None
    if pick == BACK_TOKEN:
        return BACK_TOKEN
    if pick == "(None)":
        return {"id": None, "sub_category": None}  # sentinel for "no sub-category"
    return sorted_subs[options.index(pick) - 1]  # offset by the "(None)" entry


def _ask_date(
    menu_items: MenuItems,
    body_builder: BodyBuilderFn,
    current: str,
) -> str | None:
    """Step 6 — movement date (YYYY-MM-DD).

    Re-prompts if the entered value is not a valid ISO date.
    """
    value = current
    while True:
        result = prompt_inline_text(
            menu_items=menu_items,
            menu_active_key="3",
            label="Date (YYYY-MM-DD)",
            initial_value=value,
            body_builder=body_builder,
            render_screen=render_screen,
            interaction_area="content",
            min_length=10,
            back_key="B",
        )
        if result is None:
            return None
        if result == BACK_TOKEN:
            return BACK_TOKEN
        try:
            date.fromisoformat(result.strip())
            return result.strip()
        except ValueError:
            value = result.strip()  # keep text, re-prompt


def _ask_repetitive(
    menu_items: MenuItems,
    body_builder: BodyBuilderFn,
    repetitive: list[dict],
    movement_type: str,
) -> dict | str | None:
    """Step 7 — optional repetitive-movement link.

    Returns the selected repetitive-movement dict, ``BACK_TOKEN``,
    ``None`` on ESC, or a sentinel dict for '(None)'.
    """
    candidates = [
        row for row in repetitive if str(row["type"]) == movement_type
    ]
    sorted_rep = sorted(candidates, key=lambda r: str(r["movement"]).lower())
    options = ["(None)"] + [str(r["movement"]) for r in sorted_rep]

    pick = prompt_inline_numbered_choice(
        menu_items=menu_items,
        menu_active_key="3",
        label="Repetitive movement (optional)",
        options=options,
        body_builder=body_builder,
        render_screen=render_screen,
        interaction_area="content",
        back_key="B",
    )
    if pick is None:
        return None
    if pick == BACK_TOKEN:
        return BACK_TOKEN
    if pick == "(None)":
        return {"id": None, "movement": None}
    return sorted_rep[options.index(pick) - 1]


def _ask_confirm(
    menu_items: MenuItems,
    body_builder: BodyBuilderFn,
) -> str | None:
    """Step 8 — final confirmation before adding/updating a draft."""
    return prompt_inline_numbered_choice(
        menu_items=menu_items,
        menu_active_key="3",
        label="Confirm movement draft",
        options=["Yes, add/update draft", "No, cancel"],
        body_builder=body_builder,
        render_screen=render_screen,
        interaction_area="content",
        back_key="B",
    )


# ── Public orchestrator ───────────────────────────────────────


def prompt_movement(
    menu_items: MenuItems,
    config: CliConfig,
    account: dict,
    categories: list[dict],
    sub_categories: list[dict],
    repetitive: list[dict],
    body_builder: BodyBuilderFn,
    initial: DraftMovement | None = None,
) -> DraftMovement | None:
    """Walk the user through a full movement-drafting wizard.

    If *initial* is provided the fields are pre-populated (edit mode).
    Returns a :class:`DraftMovement` on success, or ``None`` on cancel.
    Navigation: ESC cancels entirely, B goes back one step.
    """

    # ── mutable state seeded from initial values ──────────────
    movement_name = initial.movement if initial else ""
    description_text = initial.description or "" if initial else ""
    movement_type: Literal["Income", "Expense"] = initial.type if initial else "Expense"
    amount_text = f"{(initial.value / 100.0):.2f}" if initial else ""
    amount_cents = initial.value if initial else 0
    category_id = initial.category_id if initial else None
    category_name = initial.category if initial else None
    sub_id = initial.sub_category_id if initial else None
    sub_name = initial.sub_category if initial else None
    movement_date = initial.date if initial else date.today().isoformat()
    rep_id = initial.repetitive_movement_id if initial else None
    rep_name = initial.repetitive_movement if initial else None

    step = _STEP_NAME

    while True:
        # ── Step 0: Movement name ─────────────────────────────
        if step == _STEP_NAME:
            result = _ask_name(menu_items, body_builder, movement_name)
            if result is None:
                return None
            movement_name = result.strip()
            step = _STEP_DESCRIPTION
            continue

        # ── Step 1: Description ───────────────────────────────
        if step == _STEP_DESCRIPTION:
            result = _ask_description(menu_items, body_builder, description_text)
            if result is None:
                return None
            if result == BACK_TOKEN:
                step = _STEP_NAME
                continue
            description_text = result
            step = _STEP_TYPE
            continue

        # ── Step 2: Income / Expense ──────────────────────────
        if step == _STEP_TYPE:
            result = _ask_type(menu_items, body_builder, movement_type)
            if result is None:
                return None
            if result == BACK_TOKEN:
                step = _STEP_DESCRIPTION
                continue
            movement_type = result  # type: ignore[assignment]
            # Changing type invalidates category/sub/repetitive selections.
            category_id = None
            category_name = None
            sub_id = None
            sub_name = None
            rep_id = None
            rep_name = None
            step = _STEP_AMOUNT
            continue

        # ── Step 3: Amount ────────────────────────────────────
        if step == _STEP_AMOUNT:
            result = _ask_amount(menu_items, body_builder, amount_text)
            if result is None:
                return None
            if result == BACK_TOKEN:
                step = _STEP_TYPE
                continue
            amount_text, amount_cents = result  # type: ignore[unpacking]
            step = _STEP_CATEGORY
            continue

        # ── Step 4: Category ──────────────────────────────────
        if step == _STEP_CATEGORY:
            result = _ask_category(
                menu_items, body_builder, categories, movement_type,
            )
            if result is None:
                return None
            if result == BACK_TOKEN:
                step = _STEP_AMOUNT
                continue
            category_id = int(result["id"])  # type: ignore[index]
            category_name = str(result["category"])  # type: ignore[index]
            sub_id = None
            sub_name = None
            step = _STEP_SUB_CATEGORY
            continue

        # ── Step 5: Sub-category ──────────────────────────────
        if step == _STEP_SUB_CATEGORY:
            result = _ask_sub_category(
                menu_items, body_builder, sub_categories,
                int(category_id or 0),
            )
            if result is None:
                return None
            if result == BACK_TOKEN:
                step = _STEP_CATEGORY
                continue
            sub_id = result.get("id")  # type: ignore[union-attr]
            sub_id = int(sub_id) if sub_id is not None else None
            sub_name = result.get("sub_category")  # type: ignore[union-attr]
            sub_name = str(sub_name) if sub_name is not None else None
            step = _STEP_DATE
            continue

        # ── Step 6: Date ──────────────────────────────────────
        if step == _STEP_DATE:
            result = _ask_date(menu_items, body_builder, movement_date)
            if result is None:
                return None
            if result == BACK_TOKEN:
                step = _STEP_SUB_CATEGORY
                continue
            movement_date = result
            step = _STEP_REPETITIVE
            continue

        # ── Step 7: Repetitive movement ───────────────────────
        if step == _STEP_REPETITIVE:
            result = _ask_repetitive(
                menu_items, body_builder, repetitive, movement_type,
            )
            if result is None:
                return None
            if result == BACK_TOKEN:
                step = _STEP_DATE
                continue
            rep_id = result.get("id")  # type: ignore[union-attr]
            rep_id = int(rep_id) if rep_id is not None else None
            rep_name = result.get("movement")  # type: ignore[union-attr]
            rep_name = str(rep_name) if rep_name is not None else None
            step = _STEP_CONFIRM
            continue

        # ── Step 8: Confirm ───────────────────────────────────
        result = _ask_confirm(menu_items, body_builder)
        if result is None:
            return None
        if result == BACK_TOKEN:
            step = _STEP_REPETITIVE
            continue
        if result != "Yes, add/update draft":
            return None

        return DraftMovement(
            movement=movement_name,
            description=description_text.strip() or None,
            account_id=int(account["id"]),
            value=amount_cents,
            type=movement_type,
            date=movement_date,
            category_id=category_id,
            category=category_name,
            sub_category_id=sub_id,
            sub_category=sub_name,
            repetitive_movement_id=rep_id,
            repetitive_movement=rep_name,
        )
