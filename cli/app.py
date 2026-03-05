
from __future__ import annotations

import sys
import time
from dataclasses import dataclass
from typing import Callable

import typer

from config import CliConfig, load_config
from db import db_exists
from functions import api as api_client
from screens import overview as overview_screen
from screens import settings as settings_screen
from utils.navigation import read_key
from utils.render import app_terminal_session, flash_action, render_screen
from utils.selection import process_selection_key


app = typer.Typer(add_completion=False, no_args_is_help=False)


@dataclass(frozen=True)
class ScreenDefinition:
	key: str
	label: str
	render_body: Callable[[CliConfig], str]
	run: Callable[[list[tuple[str, str]], CliConfig], None]


SCREEN_DEFINITIONS = [
	ScreenDefinition(
		key="1",
		label="Overview",
		render_body=overview_screen.render_body,
		run=overview_screen.run,
	),
	ScreenDefinition(
		key="0",
		label="Settings",
		render_body=settings_screen.render_body,
		run=settings_screen.run,
	),
]
SCREENS_BY_KEY = {screen.key: screen for screen in SCREEN_DEFINITIONS}

MENU_ITEMS = [(screen.key, screen.label) for screen in SCREEN_DEFINITIONS] + [("9", "Exit")]
MENU_LABELS = {key: label for key, label in MENU_ITEMS}


def _route_screen(active_key: str, config: CliConfig) -> None:
	screen = SCREENS_BY_KEY.get(active_key)
	if screen is not None:
		screen.run(MENU_ITEMS, config)


def _startup_checks(config: CliConfig) -> None:
	"""Validate DB exists and warn if the backend is unreachable. Exits on fatal errors."""
	if not db_exists(config.db_path):
		typer.echo(f"Error: database not found at {config.db_path}", err=True)
		typer.echo(
			"Set DB_PATH in cli/.env or start the backend at least once so it creates the database.",
			err=True,
		)
		raise typer.Exit(code=1)

	if not api_client.check_backend(config.api_base_url):
		typer.echo(
			f"Warning: backend unreachable at {config.api_base_url}. "
			"Read operations will work; writes will fail until the backend is running."
		)
		time.sleep(1.5)


@app.command()
def run() -> None:
	"""Run the interactive Financial Tracker CLI."""

	config = load_config()
	_startup_checks(config)
	active_key = SCREEN_DEFINITIONS[0].key if SCREEN_DEFINITIONS else "9"
	menu_keys = [key for key, _ in MENU_ITEMS]

	with app_terminal_session():
		while True:
			screen = SCREENS_BY_KEY.get(active_key)
			body = screen.render_body(config) if screen is not None else ""

			render_screen(MENU_ITEMS, active_key, body)
			pressed_key = read_key()

			if pressed_key == "ESC":
				choice = "9"
				enter_pressed = False
			else:
				event = process_selection_key(pressed_key, active_key, menu_keys)
				active_key = event.active_key

				if event.moved or event.choice is None:
					continue

				choice = event.choice
				enter_pressed = event.enter_pressed

			if enter_pressed:
				flash_action(MENU_ITEMS, active_key, body, MENU_LABELS.get(choice, "Action"))

			if choice == "9":
				return
			if choice in SCREENS_BY_KEY:
				active_key = choice
				_route_screen(active_key, config)


def main() -> None:
	if len(sys.argv) == 1:
		run()
	else:
		app()


if __name__ == "__main__":
	main()