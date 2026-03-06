"""Body builders for the three category-browser levels.

Each ``build_*`` function returns ``(body_text, normalised_page, total_pages)``
and self-sizes to fit the terminal so the Rich layout never clips to ``"..."``.
"""

from __future__ import annotations

from screens.categories.models import (
    CAT_ACTIONS,
    RenderMode,
    SUB_ACTIONS,
    TYPE_ACTIONS,
    action_tuples,
)
from screens.categories.tree import (
    build_category_list,
    build_sub_category_list,
    build_type_summary,
)
from utils.pagination import paginate
from utils.rich_ui import ACTIVE_LINE_MARKER, render_selectable_list
from utils.viewport import available_main_lines, first_fitting, text_line_count


# ── helpers ───────────────────────────────────────────────────


def _action_block(
    specs: list,
    active_action: str,
    mode: RenderMode,
    *,
    focused: bool = True,
) -> str:
    show_cursor = mode == "content" and focused
    highlight = mode == "input" and focused
    return render_selectable_list(
        action_tuples(specs),
        active_action,
        show_cursor=show_cursor,
        highlight_active=highlight,
        indent=1,
    )


def _page_indicator(current: int, total: int) -> str:
    if total <= 1:
        return ""
    return f"  Page {current + 1}/{total}  ·  ←/→ navigate"


def _footer(message: str | None) -> list[str]:
    parts: list[str] = []
    if message:
        parts.extend(["", f"  {message}"])
    return parts


def _content_rows_block(
    rows: list[str],
    active_index: int,
    mode: RenderMode,
    *,
    focused: bool,
) -> str:
    if not rows:
        return "  (none)"

    current_index = max(0, min(active_index, len(rows) - 1))
    show_cursor = mode == "content" and focused
    highlight = mode == "input" and focused

    rendered: list[str] = []
    for index, row in enumerate(rows):
        prefix = ">" if show_cursor and index == current_index else " "
        marker = ACTIVE_LINE_MARKER if highlight and index == current_index else ""
        rendered.append(f"{marker} {prefix} {row}")
    return "\n".join(rendered)


# ── Level 1: type selection ───────────────────────────────────


def build_type_select_body(
    active_action: str,
    mode: RenderMode,
    categories: list[dict],
    sub_categories: list[dict],
    message: str | None = None,
) -> tuple[str, int, int]:
    summary_lines = build_type_summary(categories, sub_categories)
    actions = _action_block(TYPE_ACTIONS, active_action, mode)

    sections = [
        *summary_lines,
        "",
        actions,
        "",
        "  Choose a type to browse its categories, or create a new one.",
        *_footer(message),
    ]
    body = "\n".join(sections)
    return body, 0, 1


# ── Level 2: category list ───────────────────────────────────


def build_category_list_body(
    active_action: str,
    mode: RenderMode,
    categories: list[dict],
    sub_categories: list[dict],
    cat_type: str,
    active_row: int = 0,
    focus_area: str = "list",
    page: int = 0,
    message: str | None = None,
) -> tuple[str, int, int, list[dict]]:
    type_cats = sorted(
        [c for c in categories if str(c["type"]).lower() == cat_type],
        key=lambda c: str(c["category"]).lower(),
    )
    actions = _action_block(
        CAT_ACTIONS,
        active_action,
        mode,
        focused=focus_area == "actions",
    )

    label = cat_type.capitalize()
    active_count = sum(1 for c in type_cats if int(c["active"]) == 1)
    header = f"{label} Categories ({active_count}/{len(type_cats)} active)"

    # Overhead: header 1, blank 1, actions ~6, blank 1, list-header 1,
    # blank 1, page-indicator 1, hint 1, footer ~2 = ~15
    overhead = 15
    max_lines = available_main_lines()

    def _candidates():
        for size in range(max(1, max_lines - overhead), 0, -1):
            def _build(ps=size):
                pw = paginate(type_cats, page, ps)
                cat_lines = build_category_list(
                    categories, sub_categories, cat_type, pw.items,
                )
                list_block = _content_rows_block(
                    cat_lines,
                    active_row,
                    mode,
                    focused=focus_area == "list" and bool(pw.items),
                )
                sections = [
                    header,
                    "",
                    actions,
                    "",
                    f"  ─── {label} ───",
                    list_block,
                    _page_indicator(pw.current_page, pw.total_pages),
                    "",
                    "  Tab switches focus  ·  Up/Down moves  ·  Enter opens category.",
                    *_footer(message),
                ]
                return "\n".join(sections), pw.current_page, pw.total_pages, pw.items
            yield _build

    result = first_fitting(
        _candidates(),
        max_lines=max_lines,
        line_counter=lambda r: text_line_count(r[0]),
    )
    if result is not None:
        return result

    # Absolute fallback: 1 item per page
    pw = paginate(type_cats, page, 1)
    cat_lines = build_category_list(categories, sub_categories, cat_type, pw.items)
    list_block = _content_rows_block(
        cat_lines,
        active_row,
        mode,
        focused=focus_area == "list" and bool(pw.items),
    )
    body = "\n".join([
        header, "", actions, "",
        f"  ─── {label} ───",
        list_block,
        _page_indicator(pw.current_page, pw.total_pages),
        *_footer(message),
    ])
    return body, pw.current_page, pw.total_pages, pw.items


# ── Level 3: sub-category list ────────────────────────────────


def build_sub_category_list_body(
    active_action: str,
    mode: RenderMode,
    selected_category: dict,
    sub_categories: list[dict],
    active_row: int = 0,
    focus_area: str = "list",
    page: int = 0,
    message: str | None = None,
) -> tuple[str, int, int, list[dict]]:
    cat_subs = sorted(
        [s for s in sub_categories if int(s["category_id"]) == int(selected_category["id"])],
        key=lambda s: str(s["sub_category"]).lower(),
    )
    actions = _action_block(
        SUB_ACTIONS,
        active_action,
        mode,
        focused=focus_area == "actions",
    )

    cat_name = selected_category["category"]
    cat_type_label = str(selected_category["type"]).capitalize()
    header = f"{cat_type_label} > {cat_name} ({len(cat_subs)} sub-categories)"

    overhead = 14
    max_lines = available_main_lines()

    def _candidates():
        for size in range(max(1, max_lines - overhead), 0, -1):
            def _build(ps=size):
                pw = paginate(cat_subs, page, ps)
                sub_lines = build_sub_category_list(pw.items)
                list_block = _content_rows_block(
                    sub_lines,
                    active_row,
                    mode,
                    focused=focus_area == "list" and bool(pw.items),
                )
                sections = [
                    header,
                    "",
                    actions,
                    "",
                    f"  ─── Sub-categories of {cat_name} ───",
                    list_block,
                    _page_indicator(pw.current_page, pw.total_pages),
                    "",
                    "  Tab switches focus  ·  Up/Down browses  ·  9/ESC goes back.",
                    *_footer(message),
                ]
                return "\n".join(sections), pw.current_page, pw.total_pages, pw.items
            yield _build

    result = first_fitting(
        _candidates(),
        max_lines=max_lines,
        line_counter=lambda r: text_line_count(r[0]),
    )
    if result is not None:
        return result

    pw = paginate(cat_subs, page, 1)
    sub_lines = build_sub_category_list(pw.items)
    list_block = _content_rows_block(
        sub_lines,
        active_row,
        mode,
        focused=focus_area == "list" and bool(pw.items),
    )
    body = "\n".join([
        header, "", actions, "",
        f"  ─── Sub-categories of {cat_name} ───",
        list_block,
        _page_indicator(pw.current_page, pw.total_pages),
        *_footer(message),
    ])
    return body, pw.current_page, pw.total_pages, pw.items
