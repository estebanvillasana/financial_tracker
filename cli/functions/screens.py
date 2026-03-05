from __future__ import annotations

from config import CliConfig


def render_settings_body(config: CliConfig) -> str:
    return (
        "Settings\n"
        "\n"
        f"API Base URL: {config.api_base_url}\n"
        f"Main Currency: {config.main_currency}\n"
        "\n"
        "Actions\n"
        "  1. Change API Base URL\n"
        "  2. Change Main Currency\n"
        "  9. Back"
    )


def render_overview_body() -> str:
    return (
        "Overview\n"
        "\n"
        "This screen will show balances and totals.\n"
        "(Coming next: read explore queries + FX conversion.)"
    )


def render_add_movement_body() -> str:
    return (
        "Add Movement\n"
        "\n"
        "This screen will guide you through adding a movement.\n"
        "(Coming next: prompt fields + POST /movements.)"
    )
