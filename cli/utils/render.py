from __future__ import annotations

import os
from typing import Iterable


def clear_screen() -> None:
    os.system("cls" if os.name == "nt" else "clear")


def render_menu(menu_items: Iterable[tuple[str, str]], active_key: str) -> str:
    lines = ["Navigation", ""]
    for key, label in menu_items:
        prefix = ">" if key == active_key else " "
        lines.append(f"{prefix} {key}. {label}")
    return "\n".join(lines)


def _render_rich_screen(menu_text: str, body: str) -> None:
    from rich.console import Console
    from rich.layout import Layout
    from rich.panel import Panel
    from rich import box

    console = Console()

    layout = Layout()
    layout.split_row(
        Layout(name="menu", size=28),
        Layout(name="content"),
    )

    menu_panel = Panel(
        menu_text,
        title="Financial Tracker",
        border_style="cyan",
        box=box.ASCII,
        padding=(1, 2),
    )

    content_panel = Panel(
        body,
        title="Screen",
        border_style="green",
        box=box.ASCII,
        padding=(1, 2),
    )

    layout["menu"].update(menu_panel)
    layout["content"].update(content_panel)

    console.print(layout)


def _render_plain_screen(menu_text: str, body: str) -> None:
    print(menu_text)
    print("\n" + "-" * 50 + "\n")
    print(body)


def render_screen(menu_items: Iterable[tuple[str, str]], active_key: str, body: str) -> None:
    clear_screen()
    menu_text = render_menu(menu_items, active_key)
    try:
        _render_rich_screen(menu_text, body)
    except Exception:
        _render_plain_screen(menu_text, body)
