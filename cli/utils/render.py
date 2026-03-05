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

_LIVE = None
_CONSOLE = None


def _start_live() -> None:
    global _LIVE
    global _CONSOLE

    if _LIVE is not None:
        return

    try:
        from rich.console import Console
        from rich.live import Live

        _CONSOLE = Console()
        _LIVE = Live(
            console=_CONSOLE,
            auto_refresh=False,
            refresh_per_second=30,
            screen=True,
        )
        _LIVE.start()
    except Exception:
        _LIVE = None
        _CONSOLE = None


def _stop_live() -> None:
    global _LIVE
    global _CONSOLE

    if _LIVE is None:
        return

    try:
        _LIVE.stop()
    finally:
        _LIVE = None
        _CONSOLE = None


@contextmanager
def app_terminal_session():
    """Use terminal alternate screen so the CLI is the only visible content while running."""
    try:
        _start_live()
        yield
    finally:
        _stop_live()


def clear_screen(hard: bool = False) -> None:
    try:
        from rich.console import Console

        if hard:
            # Full clear including scrollback is useful only when leaving the app.
            print("\033[3J", end="", flush=True)
        Console().clear(home=True)
    except Exception:
        # Soft clear reduces visible flicker while navigating between screens.
        if hard:
            print("\033[3J\033[2J\033[H", end="", flush=True)
        else:
            print("\033[2J\033[H", end="", flush=True)


def render_menu(menu_items: Iterable[tuple[str, str]], active_key: str) -> str:
    lines = ["Navigation", ""]
    for key, label in menu_items:
        prefix = ">" if key == active_key else " "
        lines.append(f"{prefix} {key}. {label}")
    return "\n".join(lines)


def _build_rich_layout(menu_text: str, body: str):
    from rich.layout import Layout
    from rich.panel import Panel
    from rich.text import Text
    from rich import box

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
    return layout


def _render_plain_screen(menu_text: str, body: str) -> None:
    if TOP_MARGIN_ROWS > 0:
        print("\n" * TOP_MARGIN_ROWS, end="")
    print(menu_text)
    print("\n" + "-" * 50 + "\n")
    print(body)


def render_screen(menu_items: Iterable[tuple[str, str]], active_key: str, body: str) -> None:
    menu_text = render_menu(menu_items, active_key)
    try:
        layout = _build_rich_layout(menu_text, body)
        if _LIVE is not None:
            _LIVE.update(layout, refresh=True)
        else:
            _render_plain_screen(menu_text, body)
    except Exception:
        _render_plain_screen(menu_text, body)
