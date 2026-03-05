from __future__ import annotations

import os
import shutil
from contextlib import contextmanager
from pathlib import Path
from typing import Iterable


ALT_SCREEN_ENTER = "\033[?1049h\033[3J\033[2J\033[H\033[?25l"
ALT_SCREEN_EXIT = "\033[?25h\033[?1049l"


def _read_env_file_value(key: str) -> str | None:
    env_path = Path(__file__).resolve().parents[1] / ".env"
    if not env_path.exists():
        return None

    for raw_line in env_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        current_key, value = line.split("=", 1)
        if current_key.strip() == key:
            return value.strip()

    return None



TOP_MARGIN_ROWS = 1


@contextmanager
def app_terminal_session():
    """Use terminal alternate screen so the CLI is the only visible content while running."""
    try:
        print(ALT_SCREEN_ENTER, end="", flush=True)
        yield
    finally:
        print(ALT_SCREEN_EXIT, end="", flush=True)


def clear_screen() -> None:
    try:
        from rich.console import Console

        print("\033[3J", end="", flush=True)
        Console().clear(home=True)
    except Exception:
        # ANSI clear avoids spawning shell commands and reduces visual jitter.
        print("\033[3J\033[2J\033[H", end="", flush=True)


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
    from rich.text import Text
    from rich import box

    console = Console()
    terminal_width, terminal_height = shutil.get_terminal_size(fallback=(120, 30))

    # Keep menu width proportional so content remains readable on small terminals.
    menu_width = max(22, min(34, int(terminal_width * 0.28)))
    available_body_lines = max(6, terminal_height - 8 - TOP_MARGIN_ROWS)

    body_lines = body.splitlines()
    if len(body_lines) > available_body_lines:
        body_lines = body_lines[: available_body_lines - 1] + ["..."]
    clipped_body = "\n".join(body_lines)

    layout = Layout()
    layout.split_column(
        Layout(name="top_spacer", size=TOP_MARGIN_ROWS),
        Layout(name="main"),
    )
    layout["main"].split_row(
        Layout(name="menu", size=menu_width),
        Layout(name="content"),
    )

    menu_panel = Panel(
        Text(menu_text, overflow="crop", no_wrap=True),
        title="Financial Tracker",
        border_style="cyan",
        box=box.ASCII,
        padding=(0, 1),
    )

    content_panel = Panel(
        clipped_body,
        title="Screen",
        border_style="green",
        box=box.ASCII,
        padding=(0, 1),
    )

    layout["menu"].update(menu_panel)
    layout["content"].update(content_panel)

    layout["top_spacer"].update("")
    console.print(layout)


def _render_plain_screen(menu_text: str, body: str) -> None:
    if TOP_MARGIN_ROWS > 0:
        print("\n" * TOP_MARGIN_ROWS, end="")
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
