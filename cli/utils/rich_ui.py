from __future__ import annotations

import shutil
from typing import Iterable
from typing import Literal


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

    rich_text = Text()
    lines = body.splitlines()
    for index, line in enumerate(lines):
        is_marked_active = ACTIVE_LINE_MARKER in line
        display_line = line.replace(ACTIVE_LINE_MARKER, "")
        line_style = "bold yellow" if is_marked_active or display_line.lstrip().startswith(">") else None

        if DIM_START in display_line and DIM_END in display_line:
            start = display_line.find(DIM_START)
            end = display_line.find(DIM_END)
            before = display_line[:start]
            dim_text = display_line[start + len(DIM_START) : end]
            after = display_line[end + len(DIM_END) :]
            rich_text.append(before, style=line_style)
            rich_text.append(dim_text, style="dim")
            rich_text.append(after, style=line_style)
        else:
            rich_text.append(display_line, style=line_style)

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

    terminal_width, terminal_height = shutil.get_terminal_size(fallback=(120, 30))

    menu_width = max(22, min(34, int(terminal_width * 0.28)))
    available_body_lines = max(6, terminal_height - 8 - top_margin_rows)

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

    available_main_lines = max(4, available_body_lines - input_height - hint_height)

    body_lines = display_body.splitlines()
    if len(body_lines) > available_main_lines:
        body_lines = body_lines[: available_main_lines - 1] + ["..."]
    clipped_body = "\n".join(body_lines)

    clipped_options = None
    if options_text:
        options_lines = options_text.splitlines()
        if len(options_lines) > available_main_lines:
            options_lines = options_lines[: available_main_lines - 1] + ["..."]
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
        options_width = max(28, min(42, int(terminal_width * 0.24)))
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
    if options_text:
        options_text = options_text.replace(ACTIVE_LINE_MARKER, "")
        options_text = options_text.replace(DIM_START, "")
        options_text = options_text.replace(DIM_END, "")
    if input_text:
        input_text = input_text.replace(ACTIVE_LINE_MARKER, "")
        input_text = input_text.replace(DIM_START, "")
        input_text = input_text.replace(DIM_END, "")
    if hint_text:
        hint_text = hint_text.replace(ACTIVE_LINE_MARKER, "")
        hint_text = hint_text.replace(DIM_START, "")
        hint_text = hint_text.replace(DIM_END, "")
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
