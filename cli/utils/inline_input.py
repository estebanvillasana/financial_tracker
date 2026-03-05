from __future__ import annotations

from typing import Callable

from utils.navigation import read_key


RenderScreenFn = Callable[[list[tuple[str, str]], str, str], None]
BodyBuilderFn = Callable[[], str]


def prompt_inline_text(
    menu_items: list[tuple[str, str]],
    menu_active_key: str,
    label: str,
    initial_value: str,
    body_builder: BodyBuilderFn,
    render_screen: RenderScreenFn,
) -> str | None:
    """Collect text input inside the app layout without leaving the live screen."""
    typed_value = initial_value

    while True:
        body = (
            body_builder()
            + "\n\n"
            + "Input\n"
            + f"> {label}: {typed_value}_\n"
            + "Enter to confirm, Esc to cancel, Backspace to edit."
        )
        render_screen(menu_items, menu_active_key, body)
        pressed_key = read_key()

        if pressed_key == "ENTER":
            return typed_value
        if pressed_key == "ESC":
            return None
        if pressed_key in {"\x08", "\x7f"}:
            typed_value = typed_value[:-1]
            continue

        if len(pressed_key) == 1 and pressed_key.isprintable():
            typed_value += pressed_key
