
from __future__ import annotations

import sys

import typer

from config import load_config
from functions.screens import (
	render_add_movement_body,
	render_overview_body,
	render_settings_body,
)
from functions.settings import settings_loop
from utils.navigation import read_key
from utils.render import app_terminal_session, render_screen


app = typer.Typer(add_completion=False, no_args_is_help=False)


MENU_ITEMS = [
	("0", "Settings"),
	("1", "Overview"),
	("2", "Add Movement"),
	("9", "Exit"),
]


def _route_screen(active_key: str, config) -> None:
	if active_key == "0":
		settings_loop(MENU_ITEMS, config)
		return


@app.command()
def run() -> None:
	"""Run the interactive Financial Tracker CLI."""

	config = load_config()
	active_key = "1"
	menu_keys = [key for key, _ in MENU_ITEMS]

	with app_terminal_session():
		while True:
			body = render_overview_body() if active_key == "1" else ""
			if active_key == "0":
				body = render_settings_body(config)
			elif active_key == "2":
				body = render_add_movement_body()

			render_screen(MENU_ITEMS, active_key, body)
			pressed_key = read_key()

			if pressed_key == "UP":
				current_index = menu_keys.index(active_key)
				active_key = menu_keys[(current_index - 1) % len(menu_keys)]
				continue

			if pressed_key == "DOWN":
				current_index = menu_keys.index(active_key)
				active_key = menu_keys[(current_index + 1) % len(menu_keys)]
				continue

			if pressed_key == "ENTER":
				choice = active_key
			elif pressed_key in menu_keys:
				choice = pressed_key
				active_key = choice
			elif pressed_key == "ESC":
				choice = "9"
			else:
				continue

			if choice == "9":
				return
			if choice in {"0", "1", "2"}:
				active_key = choice
				_route_screen(active_key, config)


def main() -> None:
	if len(sys.argv) == 1:
		run()
	else:
		app()


if __name__ == "__main__":
	main()