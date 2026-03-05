from __future__ import annotations

import typer

from config import CliConfig, save_config
from utils.navigation import read_key
from utils.render import render_screen
from functions.screens import render_settings_body


def settings_loop(menu_items: list[tuple[str, str]], config: CliConfig) -> None:
    action_keys = ["1", "2", "9"]
    active_action = "9"

    while True:
        render_screen(menu_items, "0", render_settings_body(config, active_action))
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
            choice = active_action
        elif pressed_key in action_keys:
            choice = pressed_key
            active_action = choice
        elif pressed_key in {"b", "B", "ESC"}:
            return
        else:
            continue

        if choice == "1":
            new_url = typer.prompt("API Base URL", default=config.api_base_url)
            config.api_base_url = new_url.strip()
            save_config(config)
        elif choice == "2":
            new_currency = typer.prompt("Main Currency", default=config.main_currency)
            config.main_currency = new_currency.strip().lower()
            save_config(config)
        elif choice in {"9", "b", "B"}:
            return
