from __future__ import annotations

from config import CliConfig, save_config
from functions.screens import render_settings_body
from utils.inline_input import prompt_inline_text
from utils.navigation import read_key
from utils.render import flash_action, render_screen


def settings_loop(menu_items: list[tuple[str, str]], config: CliConfig) -> None:
    action_keys = ["1", "2", "9"]
    active_action = "9"
    action_labels = {
        "1": "Change API Base URL",
        "2": "Change Main Currency",
        "9": "Back",
    }

    while True:
        render_screen(
            menu_items,
            "0",
            render_settings_body(config, active_action),
            interaction_area="content",
        )
        pressed_key = read_key()

        if pressed_key == "UP":
            current_index = action_keys.index(active_action)
            active_action = action_keys[(current_index - 1) % len(action_keys)]
            continue

        if pressed_key == "DOWN":
            current_index = action_keys.index(active_action)
            active_action = action_keys[(current_index + 1) % len(action_keys)]
            continue

        if pressed_key == "ENTER":
            enter_pressed = True
            choice = active_action
        elif pressed_key in action_keys:
            enter_pressed = False
            choice = pressed_key
            active_action = choice
        elif pressed_key in {"b", "B", "ESC"}:
            return
        else:
            continue

        if enter_pressed:
            flash_action(
                menu_items,
                "0",
                render_settings_body(config, active_action),
                action_labels.get(choice, "Action"),
                interaction_area="content",
            )

        if choice == "1":
            new_url = prompt_inline_text(
                menu_items,
                "0",
                "API Base URL",
                config.api_base_url,
                body_builder=lambda: render_settings_body(
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
        elif choice == "2":
            new_currency = prompt_inline_text(
                menu_items,
                "0",
                "Main Currency",
                config.main_currency,
                body_builder=lambda: render_settings_body(
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
        elif choice in {"9", "b", "B"}:
            return
