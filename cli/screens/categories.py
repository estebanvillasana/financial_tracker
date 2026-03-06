from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

from config import CliConfig
from functions import api
from utils.api_errors import api_error_message
from utils.debug_shortcuts import handle_debug_restart
from utils.inline_input import prompt_inline_numbered_choice, prompt_inline_text
from utils.navigation import read_key
from utils.render import flash_action, render_screen
from utils.rich_ui import render_selectable_list
from utils.selection import process_selection_key


RenderMode = Literal["preview", "content", "input"]


@dataclass(frozen=True)
class ActionSpec:
    key: str
    label: str
    kind: Literal["create_category", "edit_category", "create_sub_category", "edit_sub_category", "refresh", "back"]


ACTIONS_SPEC = [
    ActionSpec(key="1", label="Create Category", kind="create_category"),
    ActionSpec(key="2", label="Edit Category", kind="edit_category"),
    ActionSpec(key="3", label="Create Sub-category", kind="create_sub_category"),
    ActionSpec(key="4", label="Edit Sub-category", kind="edit_sub_category"),
    ActionSpec(key="5", label="Refresh", kind="refresh"),
    ActionSpec(key="9", label="Back", kind="back"),
]
ACTIONS_BY_KEY = {action.key: action for action in ACTIONS_SPEC}
ACTIONS = [(action.key, action.label) for action in ACTIONS_SPEC]
ACTION_KEYS = [key for key, _ in ACTIONS]
ACTION_LABELS = {key: label for key, label in ACTIONS}
CATEGORY_GROUP_COLORS = {
    "INCOME (Active)": "green",
    "INCOME (Inactive)": "yellow",
    "EXPENSE (Active)": "red",
    "EXPENSE (Inactive)": "magenta",
}
SUBCATEGORY_GROUP_BASE_COLORS = {
    "EXPENSE": "red",
    "INCOME": "green",
}



def _fetch_editor_data(config: CliConfig) -> tuple[list[dict], list[dict]]:
    categories = api.get(config.api_base_url, "/categories")
    sub_categories = api.get(config.api_base_url, "/sub-categories")
    return categories, sub_categories


def _active_label(active: int) -> str:
    return "Yes" if int(active) == 1 else "No"


def _category_group_label(row: dict) -> str:
    category_type = str(row["type"]).upper()
    status = "Active" if int(row["active"]) == 1 else "Inactive"
    return f"{category_type} ({status})"


def _render_data_summary(categories: list[dict], sub_categories: list[dict]) -> str:
    active_categories = [c for c in categories if int(c["active"]) == 1]
    active_sub_categories = [s for s in sub_categories if int(s["active"]) == 1]
    blocked_categories = [c for c in categories if int(c["movements_count"]) > 0]
    blocked_sub_categories = [s for s in sub_categories if int(s["movements_count"]) > 0]
    return (
        "Categories & Sub-categories\n"
        "\n"
        f"Categories: {len(active_categories)}/{len(categories)} active\n"
        f"Sub-categories: {len(active_sub_categories)}/{len(sub_categories)} active\n"
        f"Locked category type changes: {len(blocked_categories)} (have movements)\n"
        f"Locked sub-category parent changes: {len(blocked_sub_categories)} (have movements)"
    )


def _build_body(
    active_action: str,
    mode: RenderMode,
    categories: list[dict],
    sub_categories: list[dict],
    message: str | None = None,
) -> str:
    show_action_cursor = mode == "content"
    highlight_active = mode == "input"
    action_lines = render_selectable_list(
        ACTIONS,
        active_action,
        show_cursor=show_action_cursor,
        highlight_active=highlight_active,
        indent=1,
    )

    top_categories = sorted(categories, key=lambda row: str(row["category"]).lower())[:8]
    top_sub_categories = sorted(sub_categories, key=lambda row: str(row["sub_category"]).lower())[:8]
    category_lines = [
        f"- {row['category']} | {row['type']} | active={_active_label(row['active'])} | mv={row['movements_count']}"
        for row in top_categories
    ] or ["- (none)"]
    sub_category_lines = [
        f"- {row['sub_category']} -> {row['category']} | active={_active_label(row['active'])} | mv={row['movements_count']}"
        for row in top_sub_categories
    ] or ["- (none)"]

    sections = [
        _render_data_summary(categories, sub_categories),
        "",
        "Actions",
        action_lines,
        "",
        "Category samples",
        *category_lines,
        "",
        "Sub-category samples",
        *sub_category_lines,
        "",
        "Rules",
        "- If movements > 0: only name and active can be edited.",
        "- If movements = 0: type (category) and parent category (sub-category) can also be edited.",
        "Use Up/Down + Enter, or press 1/2/3/4/5/9.",
    ]
    if message:
        sections.extend(["", f"Result: {message}"])
    return "\n".join(sections)


def render_body(config: CliConfig) -> str:
    try:
        categories, sub_categories = _fetch_editor_data(config)
    except Exception as exc:
        return f"Categories & Sub-categories\n\nCould not load data: {api_error_message(exc)}"
    return _build_body("9", "preview", categories, sub_categories)


def _pick_category(
    menu_items: list[tuple[str, str]],
    categories: list[dict],
    body_builder,
) -> dict | None:
    sorted_rows = sorted(categories, key=lambda item: (str(item["type"]).lower(), str(item["category"]).lower()))
    options = [str(row["category"]) for row in sorted_rows]
    group_labels = [_category_group_label(row) for row in sorted_rows]
    selected = prompt_inline_numbered_choice(
        menu_items=menu_items,
        menu_active_key="2",
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
    selected_index = options.index(selected)
    return sorted_rows[selected_index]


def _pick_sub_category(
    menu_items: list[tuple[str, str]],
    sub_categories: list[dict],
    body_builder,
) -> dict | None:
    type_order = {"expense": 0, "income": 1}
    sorted_rows = sorted(
        sub_categories,
        key=lambda item: (
            type_order.get(str(item["type"]).lower(), 2),
            str(item["category"]).lower(),
            str(item["sub_category"]).lower(),
        ),
    )
    options = [str(row["sub_category"]) for row in sorted_rows]
    group_labels = [f"{str(row['type']).upper()}: {row['category']}" for row in sorted_rows]
    group_colors = {
        label: SUBCATEGORY_GROUP_BASE_COLORS.get(label.split(":", 1)[0].strip().upper(), "cyan")
        for label in set(group_labels)
    }
    selected = prompt_inline_numbered_choice(
        menu_items=menu_items,
        menu_active_key="2",
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
    selected_index = options.index(selected)
    return sorted_rows[selected_index]


def _prompt_active_value(
    menu_items: list[tuple[str, str]],
    body_builder,
    current_active: int,
) -> int | None:
    selected = prompt_inline_numbered_choice(
        menu_items=menu_items,
        menu_active_key="2",
        label="Active",
        options=["Active", "Inactive"],
        body_builder=body_builder,
        render_screen=render_screen,
        interaction_area="content",
    )
    if selected is None:
        return None
    if selected == "Active":
        return 1
    return 0


def _create_category(menu_items: list[tuple[str, str]], config: CliConfig, body_builder) -> str:
    name = prompt_inline_text(
        menu_items=menu_items,
        menu_active_key="2",
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
        menu_active_key="2",
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


def _edit_category(
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
        menu_active_key="2",
        label="Category name",
        initial_value=str(selected["category"]),
        body_builder=body_builder,
        render_screen=render_screen,
        interaction_area="content",
        min_length=1,
    )
    if new_name is None:
        return "Canceled."

    current_type = str(selected["type"])
    new_type = current_type
    if int(selected["movements_count"]) == 0:
        picked_type = prompt_inline_numbered_choice(
            menu_items=menu_items,
            menu_active_key="2",
            label="Type",
            options=["Income", "Expense"],
            body_builder=body_builder,
            render_screen=render_screen,
            interaction_area="content",
        )
        if picked_type is None:
            return "Canceled."
        new_type = picked_type

    new_active = _prompt_active_value(menu_items, body_builder, int(selected["active"]))
    if new_active is None:
        return "Canceled."

    payload = {
        "category": new_name.strip(),
        "type": new_type,
        "active": new_active,
    }
    try:
        api.post(config.api_base_url, f"/categories/{selected['id']}/update", payload)
        return "Category updated."
    except Exception as exc:
        return f"Update failed: {api_error_message(exc)}"


def _create_sub_category(
    menu_items: list[tuple[str, str]],
    config: CliConfig,
    categories: list[dict],
    body_builder,
) -> str:
    if not categories:
        return "Create failed: no categories available."

    name = prompt_inline_text(
        menu_items=menu_items,
        menu_active_key="2",
        label="Sub-category name",
        initial_value="",
        body_builder=body_builder,
        render_screen=render_screen,
        interaction_area="content",
        min_length=1,
    )
    if name is None:
        return "Canceled."

    sorted_categories = sorted(categories, key=lambda item: (str(item["type"]).lower(), str(item["category"]).lower()))
    category_options = [str(row["category"]) for row in sorted_categories]
    group_labels = [_category_group_label(row) for row in sorted_categories]
    category_selection = prompt_inline_numbered_choice(
        menu_items=menu_items,
        menu_active_key="2",
        label="Parent category",
        options=category_options,
        group_labels=group_labels,
        group_colors=CATEGORY_GROUP_COLORS,
        body_builder=body_builder,
        render_screen=render_screen,
        interaction_area="content",
    )
    if category_selection is None:
        return "Canceled."
    category_id = int(sorted_categories[category_options.index(category_selection)]["id"])

    try:
        api.post(
            config.api_base_url,
            "/sub-categories",
            {"sub_category": name.strip(), "category_id": category_id, "active": 1},
        )
        return "Sub-category created."
    except Exception as exc:
        return f"Create failed: {api_error_message(exc)}"


def _edit_sub_category(
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
        menu_active_key="2",
        label="Sub-category name",
        initial_value=str(selected["sub_category"]),
        body_builder=body_builder,
        render_screen=render_screen,
        interaction_area="content",
        min_length=1,
    )
    if new_name is None:
        return "Canceled."

    new_category_id = int(selected["category_id"])
    if int(selected["movements_count"]) == 0:
        sorted_categories = sorted(
            categories,
            key=lambda item: (str(item["type"]).lower(), str(item["category"]).lower()),
        )
        category_options = [str(row["category"]) for row in sorted_categories]
        group_labels = [_category_group_label(row) for row in sorted_categories]
        category_selection = prompt_inline_numbered_choice(
            menu_items=menu_items,
            menu_active_key="2",
            label="Parent category",
            options=category_options,
            group_labels=group_labels,
            group_colors=CATEGORY_GROUP_COLORS,
            body_builder=body_builder,
            render_screen=render_screen,
            interaction_area="content",
        )
        if category_selection is None:
            return "Canceled."
        new_category_id = int(sorted_categories[category_options.index(category_selection)]["id"])

    new_active = _prompt_active_value(menu_items, body_builder, int(selected["active"]))
    if new_active is None:
        return "Canceled."

    payload = {
        "sub_category": new_name.strip(),
        "category_id": new_category_id,
        "active": new_active,
    }
    try:
        api.post(config.api_base_url, f"/sub-categories/{selected['id']}/update", payload)
        return "Sub-category updated."
    except Exception as exc:
        return f"Update failed: {api_error_message(exc)}"


def run(menu_items: list[tuple[str, str]], config: CliConfig) -> None:
    active_action = "9"
    message: str | None = None

    while True:
        try:
            categories, sub_categories = _fetch_editor_data(config)
        except Exception as exc:
            body = f"Categories & Sub-categories\n\nCould not load data: {api_error_message(exc)}\n\nB/ESC  Back"
            render_screen(menu_items, "2", body, interaction_area="content")
            key = read_key()
            handle_debug_restart(key)
            if key in {"b", "B", "ESC"}:
                return
            continue

        body_builder = lambda: _build_body(active_action, "input", categories, sub_categories, message=message)
        body = _build_body(active_action, "content", categories, sub_categories, message=message)
        render_screen(menu_items, "2", body, interaction_area="content")
        pressed_key = read_key()
        handle_debug_restart(pressed_key)

        if pressed_key in {"b", "B", "ESC"}:
            return

        event = process_selection_key(pressed_key, active_action, ACTION_KEYS)
        active_action = event.active_key
        if event.moved or event.choice is None:
            continue

        if event.enter_pressed:
            flash_action(
                menu_items,
                "2",
                body,
                ACTION_LABELS.get(event.choice, "Action"),
                interaction_area="content",
            )

        action = ACTIONS_BY_KEY.get(event.choice)
        if action is None:
            continue
        if action.kind == "back":
            return
        if action.kind == "refresh":
            message = "Data refreshed."
            continue
        if action.kind == "create_category":
            message = _create_category(menu_items, config, body_builder)
            continue
        if action.kind == "edit_category":
            message = _edit_category(menu_items, config, categories, body_builder)
            continue
        if action.kind == "create_sub_category":
            message = _create_sub_category(menu_items, config, categories, body_builder)
            continue
        if action.kind == "edit_sub_category":
            message = _edit_sub_category(menu_items, config, categories, sub_categories, body_builder)
            continue
