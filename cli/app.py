
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
from utils.render import clear_screen, render_screen


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

	if active_key == "1":
		render_screen(MENU_ITEMS, active_key, render_overview_body())
		typer.pause("\nPress any key to return to menu")
		return

	if active_key == "2":
		render_screen(MENU_ITEMS, active_key, render_add_movement_body())
		typer.pause("\nPress any key to return to menu")
		return


@app.command()
def run() -> None:
	"""Run the interactive Financial Tracker CLI."""

	config = load_config()
	active_key = "1"

	while True:
		body = render_overview_body() if active_key == "1" else ""
		if active_key == "0":
			body = render_settings_body(config)
		elif active_key == "2":
			body = render_add_movement_body()

		render_screen(MENU_ITEMS, active_key, body)

		choice = typer.prompt("Select option", default=active_key)
		if choice == "9":
			clear_screen()
			raise typer.Exit()
		if choice in {"0", "1", "2"}:
			active_key = choice
			_route_screen(active_key, config)
		else:
			typer.pause("Invalid option. Press any key to continue.")


def main() -> None:
	if len(sys.argv) == 1:
		run()
	else:
		app()


if __name__ == "__main__":
	main()