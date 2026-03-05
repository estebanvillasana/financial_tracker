from __future__ import annotations

import shutil
from typing import Iterable
from typing import Literal


InteractionArea = Literal["menu", "content"]


def render_selectable_list(
    items: Iterable[tuple[str, str]],
    active_key: str,
    show_cursor: bool = True,
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
        lines.append(f"{pad}{prefix} {key}. {label}")
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
        style = "bold yellow" if line.lstrip().startswith(">") else None
        rich_text.append(line, style=style)
        if index < len(lines) - 1:
            rich_text.append("\n")

    return rich_text


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

    body_lines = body.splitlines()
    if len(body_lines) > available_body_lines:
        body_lines = body_lines[: available_body_lines - 1] + ["..."]
    clipped_body = "\n".join(body_lines)

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
    layout["content"].update(content_panel)
    layout["top_spacer"].update("")
    return layout


def render_plain_screen(
    menu_text: str,
    body: str,
    flash_message: str | None = None,
    top_margin_rows: int = 1,
) -> None:
    if top_margin_rows > 0:
        print("\n" * top_margin_rows, end="")
    print(menu_text)
    print("\n" + "-" * 50 + "\n")
    if flash_message:
        print(f"Executed: {flash_message}\n")
    print(body)
