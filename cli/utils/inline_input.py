from __future__ import annotations

from typing import Callable
from typing import Literal

from utils.navigation import read_key


RenderScreenFn = Callable[..., None]
BodyBuilderFn = Callable[[], str]
InteractionArea = Literal["menu", "content"]


def prompt_inline_text(
    menu_items: list[tuple[str, str]],
    menu_active_key: str,
    label: str,
    initial_value: str,
    body_builder: BodyBuilderFn,
    render_screen: RenderScreenFn,
    interaction_area: InteractionArea = "menu",
    max_length: int | None = None,
    min_length: int = 0,
    char_allowed: Callable[[str], bool] | None = None,
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
        render_screen(
            menu_items,
            menu_active_key,
            body,
            interaction_area=interaction_area,
        )
        pressed_key = read_key()

        if pressed_key == "ENTER":
            if len(typed_value.strip()) < min_length:
                continue
            return typed_value
        if pressed_key == "ESC":
            return None
        if pressed_key in {"\x08", "\x7f"}:
            typed_value = typed_value[:-1]
            continue

        if len(pressed_key) == 1 and pressed_key.isprintable():
            if max_length is not None and len(typed_value) >= max_length:
                continue
            if char_allowed is not None and not char_allowed(pressed_key):
                continue
            typed_value += pressed_key
