from __future__ import annotations

import time
from contextlib import contextmanager
from typing import Any
from typing import Iterable

from utils.rich_ui import build_rich_layout, render_menu_text, render_plain_screen



TOP_MARGIN_ROWS = 1

_LIVE: Any | None = None
_CONSOLE: Any | None = None


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


def render_screen(
    menu_items: Iterable[tuple[str, str]],
    active_key: str,
    body: str,
    flash_message: str | None = None,
) -> None:
    menu_text = render_menu_text(menu_items, active_key)
    try:
        layout = build_rich_layout(
            menu_items,
            active_key,
            body,
            flash_message,
            top_margin_rows=TOP_MARGIN_ROWS,
        )
        if _LIVE is not None:
            _LIVE.update(layout, refresh=True)
        else:
            render_plain_screen(
                menu_text,
                body,
                flash_message,
                top_margin_rows=TOP_MARGIN_ROWS,
            )
    except Exception:
        render_plain_screen(
            menu_text,
            body,
            flash_message,
            top_margin_rows=TOP_MARGIN_ROWS,
        )


def flash_action(
    menu_items: Iterable[tuple[str, str]],
    active_key: str,
    body: str,
    action_label: str,
    duration_seconds: float = 0.09,
) -> None:
    """Show a short execution flash so users get immediate feedback after Enter."""
    render_screen(menu_items, active_key, body, flash_message=action_label)
    time.sleep(duration_seconds)
