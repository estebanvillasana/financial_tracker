from __future__ import annotations

from dataclasses import dataclass
from typing import Sequence


@dataclass(frozen=True)
class SelectionEvent:
    active_key: str
    choice: str | None = None
    enter_pressed: bool = False
    moved: bool = False


def process_selection_key(
    pressed_key: str,
    active_key: str,
    keys: Sequence[str],
) -> SelectionEvent:
    """Map keyboard input to common list-selection behavior."""
    if not keys:
        return SelectionEvent(active_key=active_key)

    if pressed_key == "UP":
        current_index = keys.index(active_key)
        new_active_key = keys[(current_index - 1) % len(keys)]
        return SelectionEvent(active_key=new_active_key, moved=True)

    if pressed_key == "DOWN":
        current_index = keys.index(active_key)
        new_active_key = keys[(current_index + 1) % len(keys)]
        return SelectionEvent(active_key=new_active_key, moved=True)

    if pressed_key == "ENTER":
        return SelectionEvent(
            active_key=active_key,
            choice=active_key,
            enter_pressed=True,
        )

    if pressed_key in keys:
        return SelectionEvent(
            active_key=pressed_key,
            choice=pressed_key,
            enter_pressed=False,
        )

    return SelectionEvent(active_key=active_key)
