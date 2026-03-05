from __future__ import annotations

from config import CliConfig, save_config
from utils.inline_input import prompt_inline_text
from utils.navigation import read_key
from utils.render import flash_action, render_screen
from utils.rich_ui import render_selectable_list
from utils.selection import process_selection_key


ACTIONS = [
    ("1", "Change API Base URL"),
    ("2", "Change Main Currency"),
    ("9", "Back"),
]
ACTION_KEYS = [key for key, _ in ACTIONS]
ACTION_LABELS = {key: label for key, label in ACTIONS}


def render_body(
    config: CliConfig,
    active_action: str = "9",
    show_action_cursor: bool = True,
) -> str:
    action_lines = render_selectable_list(
        ACTIONS,
        active_action,
        show_cursor=show_action_cursor,
        indent=1,
    )

    return (
        "Settings\n"
        "\n"
        f"API Base URL: {config.api_base_url}\n"
        f"Main Currency: {config.main_currency}\n"
        "\n"
        "Actions\n"
        f"{action_lines}\n"
        "\n"
        "Use Up/Down + Enter, or press 1/2/9."
    )


def run(menu_items: list[tuple[str, str]], config: CliConfig) -> None:
    active_action = "9"

    while True:
        render_screen(
            menu_items,
            "0",
            render_body(config, active_action),
            interaction_area="content",
        )
        pressed_key = read_key()

        if pressed_key in {"b", "B", "ESC"}:
            return

        event = process_selection_key(pressed_key, active_action, ACTION_KEYS)
        active_action = event.active_key

        if event.moved or event.choice is None:
            continue

        if event.enter_pressed:
            flash_action(
                menu_items,
                "0",
                render_body(config, active_action),
                ACTION_LABELS.get(event.choice, "Action"),
                interaction_area="content",
            )

        if event.choice == "1":
            new_url = prompt_inline_text(
                menu_items,
                "0",
                "API Base URL",
                config.api_base_url,
                body_builder=lambda: render_body(
                    config,
                    active_action,
                    show_action_cursor=False,
                ),
                render_screen=render_screen,
                interaction_area="content",
            )
            if new_url is not None:
                config.api_base_url = new_url.strip()
                save_config(config)
        elif event.choice == "2":
            new_currency = prompt_inline_text(
                menu_items,
                "0",
                "Main Currency",
                config.main_currency,
                body_builder=lambda: render_body(
                    config,
                    active_action,
                    show_action_cursor=False,
                ),
                render_screen=render_screen,
                interaction_area="content",
            )
            if new_currency is not None:
                config.main_currency = new_currency.strip().lower()
                save_config(config)
        elif event.choice == "9":
            return
