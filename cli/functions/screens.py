from __future__ import annotations

from config import CliConfig
from utils.rich_ui import render_selectable_list


def render_settings_body(
    config: CliConfig,
    active_action: str = "9",
    show_action_cursor: bool = True,
) -> str:
    actions = [
        ("1", "Change API Base URL"),
        ("2", "Change Main Currency"),
        ("9", "Back"),
    ]

    # The list helper keeps cursor rules consistent across all future content screens.
    action_lines = render_selectable_list(
        actions,
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


def render_overview_body() -> str:
    return (
        "Overview\n"
        "\n"
        "This screen will show balances and totals.\n"
        "(Coming next: read explore queries + FX conversion.)\n"
        "\n"
        "Use Up/Down + Enter to navigate."
    )


def render_add_movement_body() -> str:
    return (
        "Add Movement\n"
        "\n"
        "This screen will guide you through adding a movement.\n"
        "(Coming next: prompt fields + POST /movements.)\n"
        "\n"
        "Use Up/Down + Enter to navigate."
    )
