"""CRUD action handlers for the categories screen.

Each public function drives an inline-prompt workflow and returns a
short result message string.
"""

from __future__ import annotations

from config import CliConfig
from functions import api
from screens.categories.models import (
    CATEGORY_GROUP_COLORS,
    MENU_KEY,
    SUBCATEGORY_GROUP_BASE_COLORS,
)
from utils.api_errors import api_error_message
from utils.inline_input import prompt_inline_numbered_choice, prompt_inline_text
from utils.render import render_screen


# ── Selection helpers ─────────────────────────────────────────


def _category_group_label(row: dict) -> str:
    cat_type = str(row["type"]).upper()
    status = "Active" if int(row["active"]) == 1 else "Inactive"
    return f"{cat_type} ({status})"


def _pick_category(
    menu_items: list[tuple[str, str]],
    categories: list[dict],
    body_builder,
) -> dict | None:
    sorted_rows = sorted(
        categories,
        key=lambda r: (str(r["type"]).lower(), str(r["category"]).lower()),
    )
    options = [str(r["category"]) for r in sorted_rows]
    group_labels = [_category_group_label(r) for r in sorted_rows]
    selected = prompt_inline_numbered_choice(
        menu_items=menu_items,
        menu_active_key=MENU_KEY,
        label="Category",
        options=options,
        group_labels=group_labels,
        group_colors=CATEGORY_GROUP_COLORS,
        body_builder=body_builder,
        render_screen=render_screen,
        interaction_area="content",
    )
    if selected is None:
        return None
    return sorted_rows[options.index(selected)]


def _pick_sub_category(
    menu_items: list[tuple[str, str]],
    sub_categories: list[dict],
    body_builder,
) -> dict | None:
    type_order = {"expense": 0, "income": 1}
    sorted_rows = sorted(
        sub_categories,
        key=lambda r: (
            type_order.get(str(r["type"]).lower(), 2),
            str(r["category"]).lower(),
            str(r["sub_category"]).lower(),
        ),
    )
    options = [str(r["sub_category"]) for r in sorted_rows]
    group_labels = [
        f"{str(r['type']).upper()}: {r['category']}" for r in sorted_rows
    ]
    group_colors = {
        label: SUBCATEGORY_GROUP_BASE_COLORS.get(
            label.split(":", 1)[0].strip().upper(), "cyan"
        )
        for label in set(group_labels)
    }
    selected = prompt_inline_numbered_choice(
        menu_items=menu_items,
        menu_active_key=MENU_KEY,
        label="Sub-category",
        options=options,
        group_labels=group_labels,
        group_colors=group_colors,
        body_builder=body_builder,
        render_screen=render_screen,
        interaction_area="content",
    )
    if selected is None:
        return None
    return sorted_rows[options.index(selected)]


def _prompt_active(
    menu_items: list[tuple[str, str]],
    body_builder,
) -> int | None:
    selected = prompt_inline_numbered_choice(
        menu_items=menu_items,
        menu_active_key=MENU_KEY,
        label="Active",
        options=["Active", "Inactive"],
        body_builder=body_builder,
        render_screen=render_screen,
        interaction_area="content",
    )
    if selected is None:
        return None
    return 1 if selected == "Active" else 0


# ── CRUD operations ───────────────────────────────────────────


def create_category(
    menu_items: list[tuple[str, str]],
    config: CliConfig,
    body_builder,
) -> str:
    name = prompt_inline_text(
        menu_items=menu_items,
        menu_active_key=MENU_KEY,
        label="Category name",
        initial_value="",
        body_builder=body_builder,
        render_screen=render_screen,
        interaction_area="content",
        min_length=1,
    )
    if name is None:
        return "Canceled."

    category_type = prompt_inline_numbered_choice(
        menu_items=menu_items,
        menu_active_key=MENU_KEY,
        label="Type",
        options=["Income", "Expense"],
        body_builder=body_builder,
        render_screen=render_screen,
        interaction_area="content",
    )
    if category_type is None:
        return "Canceled."

    try:
        api.post(
            config.api_base_url,
            "/categories",
            {"category": name.strip(), "type": category_type, "active": 1},
        )
        return "Category created."
    except Exception as exc:
        return f"Create failed: {api_error_message(exc)}"


def edit_category(
    menu_items: list[tuple[str, str]],
    config: CliConfig,
    categories: list[dict],
    body_builder,
) -> str:
    selected = _pick_category(menu_items, categories, body_builder)
    if selected is None:
        return "Canceled."

    new_name = prompt_inline_text(
        menu_items=menu_items,
        menu_active_key=MENU_KEY,
        label="Category name",
        initial_value=str(selected["category"]),
        body_builder=body_builder,
        render_screen=render_screen,
        interaction_area="content",
        min_length=1,
    )
    if new_name is None:
        return "Canceled."

    new_type = str(selected["type"])
    if int(selected["movements_count"]) == 0:
        picked = prompt_inline_numbered_choice(
            menu_items=menu_items,
            menu_active_key=MENU_KEY,
            label="Type",
            options=["Income", "Expense"],
            body_builder=body_builder,
            render_screen=render_screen,
            interaction_area="content",
        )
        if picked is None:
            return "Canceled."
        new_type = picked

    new_active = _prompt_active(menu_items, body_builder)
    if new_active is None:
        return "Canceled."

    try:
        api.post(
            config.api_base_url,
            f"/categories/{selected['id']}/update",
            {"category": new_name.strip(), "type": new_type, "active": new_active},
        )
        return "Category updated."
    except Exception as exc:
        return f"Update failed: {api_error_message(exc)}"


def create_sub_category(
    menu_items: list[tuple[str, str]],
    config: CliConfig,
    categories: list[dict],
    body_builder,
) -> str:
    if not categories:
        return "Create failed: no categories available."

    name = prompt_inline_text(
        menu_items=menu_items,
        menu_active_key=MENU_KEY,
        label="Sub-category name",
        initial_value="",
        body_builder=body_builder,
        render_screen=render_screen,
        interaction_area="content",
        min_length=1,
    )
    if name is None:
        return "Canceled."

    sorted_cats = sorted(
        categories,
        key=lambda r: (str(r["type"]).lower(), str(r["category"]).lower()),
    )
    cat_options = [str(r["category"]) for r in sorted_cats]
    group_labels = [_category_group_label(r) for r in sorted_cats]
    selection = prompt_inline_numbered_choice(
        menu_items=menu_items,
        menu_active_key=MENU_KEY,
        label="Parent category",
        options=cat_options,
        group_labels=group_labels,
        group_colors=CATEGORY_GROUP_COLORS,
        body_builder=body_builder,
        render_screen=render_screen,
        interaction_area="content",
    )
    if selection is None:
        return "Canceled."

    cat_id = int(sorted_cats[cat_options.index(selection)]["id"])
    try:
        api.post(
            config.api_base_url,
            "/sub-categories",
            {"sub_category": name.strip(), "category_id": cat_id, "active": 1},
        )
        return "Sub-category created."
    except Exception as exc:
        return f"Create failed: {api_error_message(exc)}"


def edit_sub_category(
    menu_items: list[tuple[str, str]],
    config: CliConfig,
    categories: list[dict],
    sub_categories: list[dict],
    body_builder,
) -> str:
    selected = _pick_sub_category(menu_items, sub_categories, body_builder)
    if selected is None:
        return "Canceled."

    new_name = prompt_inline_text(
        menu_items=menu_items,
        menu_active_key=MENU_KEY,
        label="Sub-category name",
        initial_value=str(selected["sub_category"]),
        body_builder=body_builder,
        render_screen=render_screen,
        interaction_area="content",
        min_length=1,
    )
    if new_name is None:
        return "Canceled."

    new_cat_id = int(selected["category_id"])
    if int(selected["movements_count"]) == 0:
        sorted_cats = sorted(
            categories,
            key=lambda r: (str(r["type"]).lower(), str(r["category"]).lower()),
        )
        cat_options = [str(r["category"]) for r in sorted_cats]
        group_labels = [_category_group_label(r) for r in sorted_cats]
        selection = prompt_inline_numbered_choice(
            menu_items=menu_items,
            menu_active_key=MENU_KEY,
            label="Parent category",
            options=cat_options,
            group_labels=group_labels,
            group_colors=CATEGORY_GROUP_COLORS,
            body_builder=body_builder,
            render_screen=render_screen,
            interaction_area="content",
        )
        if selection is None:
            return "Canceled."
        new_cat_id = int(sorted_cats[cat_options.index(selection)]["id"])

    new_active = _prompt_active(menu_items, body_builder)
    if new_active is None:
        return "Canceled."

    try:
        api.post(
            config.api_base_url,
            f"/sub-categories/{selected['id']}/update",
            {
                "sub_category": new_name.strip(),
                "category_id": new_cat_id,
                "active": new_active,
            },
        )
        return "Sub-category updated."
    except Exception as exc:
        return f"Update failed: {api_error_message(exc)}"
