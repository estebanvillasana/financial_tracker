from __future__ import annotations

import typer

from config import CliConfig, save_config
from utils.render import render_screen
from functions.screens import render_settings_body


def settings_loop(menu_items: list[tuple[str, str]], config: CliConfig) -> None:
    while True:
        render_screen(menu_items, "0", render_settings_body(config))
        choice = typer.prompt("Select action", default="9")
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
