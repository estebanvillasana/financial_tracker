"""Terminal viewport helpers for CLI screens.

These functions centralise the same height budget used by the shared Rich
layout so feature screens can make their own content fit decisions without
copying layout math.
"""

from __future__ import annotations

import shutil
from collections.abc import Callable, Iterable
from typing import TypeVar


T = TypeVar("T")


def terminal_size(*, fallback: tuple[int, int] = (120, 30)) -> tuple[int, int]:
    """Return the current terminal ``(width, height)``."""
    return shutil.get_terminal_size(fallback=fallback)


def available_body_lines(*, top_margin_rows: int = 1) -> int:
    """Return the body height budget used by the shared Rich layout."""
    _, terminal_height = terminal_size()
    return max(6, terminal_height - 8 - top_margin_rows)


def available_main_lines(
    *,
    top_margin_rows: int = 1,
    input_height: int = 0,
    hint_height: int = 0,
) -> int:
    """Return the visible main-content line budget after input/hint panels."""
    return max(4, available_body_lines(top_margin_rows=top_margin_rows) - input_height - hint_height)


def text_line_count(text: str) -> int:
    """Count display lines for a plain text body."""
    return len(text.splitlines())


def first_fitting(
    builders: Iterable[Callable[[], T]],
    *,
    max_lines: int,
    line_counter: Callable[[T], int],
) -> T | None:
    """Return the first builder result whose rendered size fits ``max_lines``."""
    for builder in builders:
        candidate = builder()
        if line_counter(candidate) <= max_lines:
            return candidate
    return None
