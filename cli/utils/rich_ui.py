from __future__ import annotations

import re
from typing import Iterable
from typing import Literal

from utils.viewport import available_body_lines, available_main_lines, terminal_size


InteractionArea = Literal["menu", "content"]
ACTIVE_LINE_MARKER = "[[active]]"
DIM_START = "[[dim]]"
DIM_END = "[[/dim]]"
OPTIONS_PANEL_START = "[[options_panel]]"
OPTIONS_PANEL_END = "[[/options_panel]]"
INPUT_PANEL_START = "[[input_panel]]"
INPUT_PANEL_END = "[[/input_panel]]"
HINT_PANEL_START = "[[hint_panel]]"
HINT_PANEL_END = "[[/hint_panel]]"
GROUP_STYLE_START = "[[group:"
GROUP_STYLE_END = "[[/group]]"
NUM_STYLE_START = "[[num]]"
NUM_STYLE_END = "[[/num]]"


def render_selectable_list(
    items: Iterable[tuple[str, str]],
    active_key: str,
    show_cursor: bool = True,
    highlight_active: bool = False,
    indent: int = 1,
) -> str:
    """Render a selectable list where cursor ownership can be toggled per interaction area.

    When `show_cursor` is False, no `>` marker is emitted. This keeps the cursor marker
    exclusive to whichever area currently owns input focus (menu/content/input).
    """
    pad = " " * max(0, indent)
    lines = []
    for key, label in items:
        prefix = ">" if show_cursor and key == active_key else " "
        marker = ACTIVE_LINE_MARKER if highlight_active and key == active_key else ""
        lines.append(f"{marker}{pad}{prefix} {key}. {label}")
    return "\n".join(lines)


def render_menu_text(
    menu_items: Iterable[tuple[str, str]],
    active_key: str,
    interaction_area: InteractionArea = "menu",
) -> str:
    lines = ["Navigation", ""]
    show_menu_cursor = interaction_area == "menu"
    lines.append(
        render_selectable_list(
            menu_items,
            active_key,
            show_cursor=show_menu_cursor,
            indent=0,
        )
    )
    return "\n".join(lines)


def _build_rich_menu_text(
    menu_items: Iterable[tuple[str, str]],
    active_key: str,
    interaction_area: InteractionArea,
):
    from rich.text import Text

    rich_text = Text("Navigation\n\n")
    show_menu_cursor = interaction_area == "menu"
    menu_list = list(menu_items)
    for index, (key, label) in enumerate(menu_list):
        prefix = ">" if show_menu_cursor and key == active_key else " "
        style = "bold yellow" if key == active_key else None
        rich_text.append(f"{prefix} {key}. {label}", style=style)
        if index < len(menu_list) - 1:
            rich_text.append("\n")

    return rich_text


def _build_rich_body_text(body: str):
    from rich.text import Text

    def _append_with_markers(rich_text: Text, value: str, base_style: str | None) -> None:
        remaining = value
        while remaining:
            marker_positions: list[tuple[int, str]] = []
            for marker, end_marker in (
                (NUM_STYLE_START, NUM_STYLE_END),
                (GROUP_STYLE_START, GROUP_STYLE_END),
                (DIM_START, DIM_END),
            ):
                start = remaining.find(marker)
                if start != -1:
                    marker_positions.append((start, marker))
            if not marker_positions:
                rich_text.append(remaining, style=base_style)
                return

            start, marker = min(marker_positions, key=lambda item: item[0])
            if start > 0:
                rich_text.append(remaining[:start], style=base_style)
            chunk = remaining[start:]

            if marker == NUM_STYLE_START:
                end = chunk.find(NUM_STYLE_END)
                if end == -1:
                    rich_text.append(chunk, style=base_style)
                    return
                token = chunk[len(NUM_STYLE_START) : end]
                rich_text.append(token, style="bold cyan")
                remaining = chunk[end + len(NUM_STYLE_END) :]
                continue

            if marker == GROUP_STYLE_START:
                marker_end = chunk.find("]]")
                end = chunk.find(GROUP_STYLE_END)
                if marker_end == -1 or end == -1:
                    rich_text.append(chunk, style=base_style)
                    return
                color = chunk[len(GROUP_STYLE_START) : marker_end]
                token = chunk[marker_end + 2 : end]
                rich_text.append(token, style=f"bold {color.strip()}")
                remaining = chunk[end + len(GROUP_STYLE_END) :]
                continue

            end = chunk.find(DIM_END)
            if end == -1:
                rich_text.append(chunk, style=base_style)
                return
            token = chunk[len(DIM_START) : end]
            rich_text.append(token, style="dim")
            remaining = chunk[end + len(DIM_END) :]

    rich_text = Text()
    lines = body.splitlines()
    for index, line in enumerate(lines):
        is_marked_active = ACTIVE_LINE_MARKER in line
        display_line = line.replace(ACTIVE_LINE_MARKER, "")
        line_style = "bold yellow" if is_marked_active or display_line.lstrip().startswith(">") else None
        _append_with_markers(rich_text, display_line, line_style)

        if index < len(lines) - 1:
            rich_text.append("\n")

    return rich_text


def _extract_marked_block(body: str, start_marker: str, end_marker: str) -> tuple[str, str | None]:
    body_lines: list[str] = []
    block_lines: list[str] = []
    in_block = False

    for line in body.splitlines():
        stripped = line.strip()
        if stripped == start_marker:
            in_block = True
            continue
        if stripped == end_marker:
            in_block = False
            continue

        if in_block:
            block_lines.append(line)
        else:
            body_lines.append(line)

    block_text = "\n".join(block_lines).strip() if block_lines else None
    return "\n".join(body_lines), block_text


def build_rich_layout(
    menu_items: Iterable[tuple[str, str]],
    active_key: str,
    body: str,
    flash_message: str | None = None,
    top_margin_rows: int = 1,
    interaction_area: InteractionArea = "menu",
):
    from rich import box
    from rich.layout import Layout
    from rich.panel import Panel

    terminal_width, terminal_height = terminal_size()

    menu_width = max(22, min(34, int(terminal_width * 0.28)))
    body_line_budget = available_body_lines(top_margin_rows=top_margin_rows)

    display_body, options_text = _extract_marked_block(
        body,
        OPTIONS_PANEL_START,
        OPTIONS_PANEL_END,
    )
    display_body, input_text = _extract_marked_block(
        display_body,
        INPUT_PANEL_START,
        INPUT_PANEL_END,
    )
    display_body, hint_text = _extract_marked_block(
        display_body,
        HINT_PANEL_START,
        HINT_PANEL_END,
    )

    input_height = 0
    if input_text:
        input_height = max(4, min(8, len(input_text.splitlines()) + 2))

    hint_height = 0
    if hint_text:
        hint_height = max(1, min(2, len(hint_text.splitlines())))

    main_line_budget = available_main_lines(
        top_margin_rows=top_margin_rows,
        input_height=input_height,
        hint_height=hint_height,
    )

    body_lines = display_body.splitlines()
    if len(body_lines) > main_line_budget:
        body_lines = body_lines[: main_line_budget - 1] + ["..."]
    clipped_body = "\n".join(body_lines)

    clipped_options = None
    if options_text:
        options_lines = options_text.splitlines()
        options_available_lines = max(8, terminal_height - 4 - top_margin_rows)
        if len(options_lines) > options_available_lines:
            options_lines = options_lines[: options_available_lines - 1] + ["..."]
        clipped_options = "\n".join(options_lines)

    layout = Layout()
    layout.split_column(
        Layout(name="top_spacer", size=top_margin_rows),
        Layout(name="main"),
    )
    layout["main"].split_row(
        Layout(name="menu", size=menu_width),
        Layout(name="content"),
    )

    menu_border_style = "yellow" if flash_message else "cyan"
    content_border_style = "yellow" if flash_message else "green"
    content_title = "Screen" if not flash_message else f"Screen | Executed: {flash_message}"

    menu_panel = Panel(
        _build_rich_menu_text(menu_items, active_key, interaction_area),
        title="Financial Tracker",
        border_style=menu_border_style,
        box=box.ASCII,
        padding=(0, 1),
    )

    content_panel = Panel(
        _build_rich_body_text(clipped_body),
        title=content_title,
        border_style=content_border_style,
        box=box.ASCII,
        padding=(0, 1),
    )

    layout["menu"].update(menu_panel)
    content_host = layout["content"]
    if clipped_options:
        options_width = max(40, min(62, int(terminal_width * 0.34)))
        content_host.split_row(
            Layout(name="content_main"),
            Layout(name="content_options", size=options_width),
        )

        options_panel = Panel(
            _build_rich_body_text(clipped_options),
            title="Options",
            border_style="blue",
            box=box.ASCII,
            padding=(0, 1),
        )
        layout["content_options"].update(options_panel)
        content_host = layout["content_main"]

    if input_text:
        content_host.split_column(
            Layout(name="content_body"),
            Layout(name="content_input", size=input_height),
            Layout(name="content_hint", size=hint_height) if hint_text else Layout(name="content_hint", size=0),
        )

        input_panel = Panel(
            _build_rich_body_text(input_text),
            title="Input",
            border_style="magenta",
            style="on rgb(20,20,20)",
            box=box.ASCII,
            padding=(0, 1),
        )

        layout["content_body"].update(content_panel)
        layout["content_input"].update(input_panel)
        if hint_text:
            layout["content_hint"].update(_build_rich_body_text(f"{DIM_START}{hint_text}{DIM_END}"))
    else:
        content_host.update(content_panel)

    layout["top_spacer"].update("")
    return layout


def render_plain_screen(
    menu_text: str,
    body: str,
    flash_message: str | None = None,
    top_margin_rows: int = 1,
) -> None:
    def _strip_group_markers(value: str) -> str:
        value = re.sub(r"\[\[group:[^\]]+\]\]", "", value)
        value = value.replace(GROUP_STYLE_END, "")
        value = value.replace(NUM_STYLE_START, "")
        value = value.replace(NUM_STYLE_END, "")
        return value

    body, options_text = _extract_marked_block(
        body,
        OPTIONS_PANEL_START,
        OPTIONS_PANEL_END,
    )
    body, input_text = _extract_marked_block(
        body,
        INPUT_PANEL_START,
        INPUT_PANEL_END,
    )
    body, hint_text = _extract_marked_block(
        body,
        HINT_PANEL_START,
        HINT_PANEL_END,
    )
    body = body.replace(ACTIVE_LINE_MARKER, "")
    body = body.replace(DIM_START, "")
    body = body.replace(DIM_END, "")
    body = _strip_group_markers(body)
    if options_text:
        options_text = options_text.replace(ACTIVE_LINE_MARKER, "")
        options_text = options_text.replace(DIM_START, "")
        options_text = options_text.replace(DIM_END, "")
        options_text = _strip_group_markers(options_text)
    if input_text:
        input_text = input_text.replace(ACTIVE_LINE_MARKER, "")
        input_text = input_text.replace(DIM_START, "")
        input_text = input_text.replace(DIM_END, "")
        input_text = _strip_group_markers(input_text)
    if hint_text:
        hint_text = hint_text.replace(ACTIVE_LINE_MARKER, "")
        hint_text = hint_text.replace(DIM_START, "")
        hint_text = hint_text.replace(DIM_END, "")
        hint_text = _strip_group_markers(hint_text)
    if top_margin_rows > 0:
        print("\n" * top_margin_rows, end="")
    print(menu_text)
    print("\n" + "-" * 50 + "\n")
    if flash_message:
        print(f"Executed: {flash_message}\n")
    print(body)
    if options_text:
        print("\n" + "Options" + "\n")
        print(options_text)
    if input_text:
        print("\n" + "Input" + "\n")
        print(input_text)
    if hint_text:
        print("\n" + hint_text)
