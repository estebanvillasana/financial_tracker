"""Categories screen — drill-down browser for categories and sub-categories.

Public API consumed by ``app.py``:

* :func:`render_body` — lightweight preview for the main-menu sidebar.
* :func:`run`         — full interactive screen.

Navigation levels
-----------------
1. **Type selection** — pick Expense or Income.
2. **Category list**  — paginated list for the chosen type; pick one to drill in.
3. **Sub-category list** — paginated sub-categories of the selected category.

Package layout
--------------
models.py   Per-level action specs, colours, helpers.
data.py     API data fetching.
tree.py     List renderers for each level (pure).
actions.py  CRUD action handlers with inline prompts.
render.py   Body builders for each level (self-sizing).
"""

from __future__ import annotations

from config import CliConfig
from screens.categories.actions import (
    create_category,
    create_sub_category,
    edit_category,
    edit_sub_category,
)
from screens.categories.data import fetch_data
from screens.categories.models import (
    CAT_ACTIONS,
    MENU_KEY,
    SUB_ACTIONS,
    TYPE_ACTIONS,
    action_by_key,
    action_keys,
    action_labels,
)
from screens.categories.render import (
    build_category_list_body,
    build_sub_category_list_body,
    build_type_select_body,
)
from utils.api_errors import api_error_message
from utils.debug_shortcuts import handle_debug_restart
from utils.navigation import read_key
from utils.pagination import next_page, previous_page
from utils.render import flash_action, render_screen
from utils.selection import process_selection_key


# ── Preview (main-menu sidebar) ──────────────────────────────


def render_body(config: CliConfig) -> str:
    try:
        categories, sub_categories = fetch_data(config)
    except Exception as exc:
        return (
            "Categories & Sub-categories\n\n"
            f"Could not load data: {api_error_message(exc)}"
        )
    active_cats = sum(1 for c in categories if int(c["active"]) == 1)
    active_subs = sum(1 for s in sub_categories if int(s["active"]) == 1)
    return (
        "Categories & Sub-categories\n"
        "\n"
        f"  {active_cats}/{len(categories)} categories active\n"
        f"  {active_subs}/{len(sub_categories)} sub-categories active\n"
        "\n"
        "  Open to browse the full tree and manage entries."
    )


# ── Error helper ──────────────────────────────────────────────


def _show_error(menu_items: list[tuple[str, str]], message: str) -> None:
    body = f"Categories & Sub-categories\n\n{message}\n\nB/ESC  Back"
    while True:
        render_screen(menu_items, MENU_KEY, body, interaction_area="content")
        key = read_key()
        handle_debug_restart(key)
        if key in {"b", "B", "ESC"}:
            return


# ── Level 1: type selection ───────────────────────────────────


def _run_type_select(
    menu_items: list[tuple[str, str]],
    config: CliConfig,
    categories: list[dict],
    sub_categories: list[dict],
) -> str | None:
    """Top level — returns ``"expense"``/``"income"`` or ``None`` to exit."""
    active = "9"
    message: str | None = None
    keys = action_keys(TYPE_ACTIONS)
    labels = action_labels(TYPE_ACTIONS)
    by_key = action_by_key(TYPE_ACTIONS)

    while True:
        try:
            categories, sub_categories = fetch_data(config)
        except Exception as exc:
            _show_error(menu_items, f"Could not load data: {api_error_message(exc)}")
            return None

        body_builder = lambda: build_type_select_body(
            active, "input", categories, sub_categories, message=message,
        )[0]

        body, _, _ = build_type_select_body(
            active, "content", categories, sub_categories, message=message,
        )
        render_screen(menu_items, MENU_KEY, body, interaction_area="content")
        pressed = read_key()
        handle_debug_restart(pressed)

        if pressed in {"b", "B", "ESC"}:
            return None

        event = process_selection_key(pressed, active, keys)
        active = event.active_key
        if event.moved or event.choice is None:
            continue

        if event.enter_pressed:
            flash_action(menu_items, MENU_KEY, body, labels.get(event.choice, ""), interaction_area="content")

        action = by_key.get(event.choice)
        if action is None:
            continue
        if action.kind == "back":
            return None
        if action.kind == "refresh":
            message = "Data refreshed."
            continue
        if action.kind == "create_category":
            message = create_category(menu_items, config, body_builder)
            continue
        if action.kind == "show_expense":
            return "expense"
        if action.kind == "show_income":
            return "income"


# ── Level 2: category list ───────────────────────────────────


def _run_category_list(
    menu_items: list[tuple[str, str]],
    config: CliConfig,
    cat_type: str,
) -> dict | None:
    """Category list — returns the selected category dict or ``None`` to go back."""
    active = "9"
    focus_area = "list"
    active_row = 0
    message: str | None = None
    page = 0
    keys = action_keys(CAT_ACTIONS)
    labels = action_labels(CAT_ACTIONS)
    by_key = action_by_key(CAT_ACTIONS)

    while True:
        try:
            categories, sub_categories = fetch_data(config)
        except Exception as exc:
            _show_error(menu_items, f"Could not load data: {api_error_message(exc)}")
            return None

        type_cats = sorted(
            [c for c in categories if str(c["type"]).lower() == cat_type],
            key=lambda c: str(c["category"]).lower(),
        )

        body_builder = lambda: build_category_list_body(
            active, "input", categories, sub_categories,
            cat_type,
            active_row=active_row,
            focus_area=focus_area,
            page=page,
            message=message,
        )[0]

        body, current_page, total_pages, page_items = build_category_list_body(
            active, "content", categories, sub_categories,
            cat_type,
            active_row=active_row,
            focus_area=focus_area,
            page=page,
            message=message,
        )
        page = current_page
        if page_items:
            active_row = max(0, min(active_row, len(page_items) - 1))
        else:
            active_row = 0

        render_screen(menu_items, MENU_KEY, body, interaction_area="content")
        pressed = read_key()
        handle_debug_restart(pressed)

        if pressed in {"b", "B", "ESC"}:
            return None

        if pressed == "\t":
            focus_area = "actions" if focus_area == "list" else "list"
            continue

        # Pagination
        if pressed in {"RIGHT", "n", "N"}:
            page = next_page(page, total_pages)
            active_row = 0
            message = None
            continue
        if pressed in {"LEFT", "p", "P"}:
            page = previous_page(page)
            active_row = 0
            message = None
            continue

        if focus_area == "list":
            if pressed == "UP" and page_items:
                active_row = (active_row - 1) % len(page_items)
                continue
            if pressed == "DOWN" and page_items:
                active_row = (active_row + 1) % len(page_items)
                continue
            if pressed == "ENTER" and page_items:
                return page_items[active_row]

        if focus_area != "actions" and pressed not in keys:
            continue

        event = process_selection_key(pressed, active, keys)
        active = event.active_key
        if event.moved or event.choice is None:
            continue

        if event.enter_pressed:
            flash_action(menu_items, MENU_KEY, body, labels.get(event.choice, ""), interaction_area="content")

        action = by_key.get(event.choice)
        if action is None:
            continue
        if action.kind == "back":
            return None
        if action.kind == "refresh":
            message = "Data refreshed."
            continue
        if action.kind == "create_category":
            message = create_category(menu_items, config, body_builder)
            continue
        if action.kind == "edit_category":
            message = edit_category(menu_items, config, categories, body_builder)
            continue
        if action.kind == "create_sub_category":
            message = create_sub_category(menu_items, config, categories, body_builder)
            continue


# ── Level 3: sub-category list ────────────────────────────────


def _run_sub_category_list(
    menu_items: list[tuple[str, str]],
    config: CliConfig,
    selected_category: dict,
) -> None:
    """Sub-category list for a single category. Returns when user goes back."""
    active = "9"
    focus_area = "list"
    active_row = 0
    message: str | None = None
    page = 0
    keys = action_keys(SUB_ACTIONS)
    labels = action_labels(SUB_ACTIONS)
    by_key = action_by_key(SUB_ACTIONS)

    while True:
        try:
            categories, sub_categories = fetch_data(config)
        except Exception as exc:
            _show_error(menu_items, f"Could not load data: {api_error_message(exc)}")
            return

        body_builder = lambda: build_sub_category_list_body(
            active, "input", selected_category, sub_categories,
            active_row=active_row,
            focus_area=focus_area,
            page=page,
            message=message,
        )[0]

        body, current_page, total_pages, page_items = build_sub_category_list_body(
            active, "content", selected_category, sub_categories,
            active_row=active_row,
            focus_area=focus_area,
            page=page,
            message=message,
        )
        page = current_page
        if page_items:
            active_row = max(0, min(active_row, len(page_items) - 1))
        else:
            active_row = 0

        render_screen(menu_items, MENU_KEY, body, interaction_area="content")
        pressed = read_key()
        handle_debug_restart(pressed)

        if pressed in {"b", "B", "ESC"}:
            return

        if pressed == "\t":
            focus_area = "actions" if focus_area == "list" else "list"
            continue

        if pressed in {"RIGHT", "n", "N"}:
            page = next_page(page, total_pages)
            active_row = 0
            message = None
            continue
        if pressed in {"LEFT", "p", "P"}:
            page = previous_page(page)
            active_row = 0
            message = None
            continue

        if focus_area == "list":
            if pressed == "UP" and page_items:
                active_row = (active_row - 1) % len(page_items)
                continue
            if pressed == "DOWN" and page_items:
                active_row = (active_row + 1) % len(page_items)
                continue

        if focus_area != "actions" and pressed not in keys:
            continue

        event = process_selection_key(pressed, active, keys)
        active = event.active_key
        if event.moved or event.choice is None:
            continue

        if event.enter_pressed:
            flash_action(menu_items, MENU_KEY, body, labels.get(event.choice, ""), interaction_area="content")

        action = by_key.get(event.choice)
        if action is None:
            continue
        if action.kind == "back":
            return
        if action.kind == "refresh":
            message = "Data refreshed."
            continue
        if action.kind == "create_sub_category":
            message = create_sub_category(menu_items, config, categories, body_builder)
            continue
        if action.kind == "edit_sub_category":
            message = edit_sub_category(
                menu_items, config, categories, sub_categories, body_builder,
            )
            continue


# ── Interactive screen ────────────────────────────────────────


def run(menu_items: list[tuple[str, str]], config: CliConfig) -> None:
    """Drill-down categories browser: type → categories → sub-categories."""
    try:
        categories, sub_categories = fetch_data(config)
    except Exception as exc:
        _show_error(menu_items, f"Could not load data: {api_error_message(exc)}")
        return

    while True:
        # Level 1: pick type
        cat_type = _run_type_select(menu_items, config, categories, sub_categories)
        if cat_type is None:
            return

        # Level 2: browse categories of that type
        while True:
            selected = _run_category_list(menu_items, config, cat_type)
            if selected is None:
                break  # back to type selection

            # Level 3: browse sub-categories of selected category
            _run_sub_category_list(menu_items, config, selected)
