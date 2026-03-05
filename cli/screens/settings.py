from __future__ import annotations

from dataclasses import dataclass
from typing import Callable
from typing import Literal

from config import CliConfig, save_config
from utils.inline_input import (
    prompt_inline_autocomplete_choice,
    prompt_inline_numbered_choice,
    prompt_inline_text,
)
from utils.navigation import read_key
from utils.render import flash_action, render_screen
from utils.rich_ui import render_selectable_list
from utils.selection import process_selection_key


@dataclass(frozen=True)
class InputSpec:
    label: str
    control: Literal["text", "numbered_choice", "autocomplete_choice"] = "text"
    options: list[str] | None = None
    max_length: int | None = None
    min_length: int = 0
    letters_only: bool = False
    normalize_to_lower: bool = False


@dataclass(frozen=True)
class ActionSpec:
    key: str
    label: str
    kind: Literal["input", "back"]
    input_spec: InputSpec | None = None
    config_field: str | None = None


ACTIONS_SPEC = [
    ActionSpec(
        key="1",
        label="Change API Base URL",
        kind="input",
        input_spec=InputSpec(label="API Base URL"),
        config_field="api_base_url",
    ),
    ActionSpec(
        key="2",
        label="Change Main Currency",
        kind="input",
        input_spec=InputSpec(
            label="Main Currency",
            max_length=3,
            min_length=3,
            letters_only=True,
            normalize_to_lower=True,
        ),
        config_field="main_currency",
    ),
    ActionSpec(key="9", label="Back", kind="back"),
]
ACTIONS_BY_KEY = {action.key: action for action in ACTIONS_SPEC}
ACTIONS = [(action.key, action.label) for action in ACTIONS_SPEC]
ACTION_KEYS = [key for key, _ in ACTIONS]
ACTION_LABELS = {key: label for key, label in ACTIONS}
RenderMode = Literal["preview", "content", "input"]


def _char_allowed_for(input_spec: InputSpec) -> Callable[[str], bool] | None:
    if input_spec.letters_only:
        return str.isalpha
    return None


def _normalize_value(value: str, input_spec: InputSpec) -> str:
    normalized = value.strip()
    if input_spec.normalize_to_lower:
        normalized = normalized.lower()
    return normalized


def _prompt_for_action_input(
    menu_items: list[tuple[str, str]],
    config: CliConfig,
    active_action: str,
    action: ActionSpec,
) -> str | None:
    input_spec = action.input_spec
    if input_spec is None or action.config_field is None:
        return None

    current_value = str(getattr(config, action.config_field))
    common_kwargs = {
        "menu_items": menu_items,
        "menu_active_key": "0",
        "label": input_spec.label,
        "body_builder": lambda: render_body(config, active_action, mode="input"),
        "render_screen": render_screen,
        "interaction_area": "content",
    }

    if input_spec.control == "numbered_choice":
        options = input_spec.options or []
        return prompt_inline_numbered_choice(options=options, **common_kwargs)

    if input_spec.control == "autocomplete_choice":
        options = input_spec.options or []
        return prompt_inline_autocomplete_choice(
            options=options,
            initial_value=current_value,
            **common_kwargs,
        )

    return prompt_inline_text(
        initial_value=current_value,
        max_length=input_spec.max_length,
        min_length=input_spec.min_length,
        char_allowed=_char_allowed_for(input_spec),
        **common_kwargs,
    )


def render_body(
    config: CliConfig,
    active_action: str = "9",
    mode: RenderMode = "preview",
) -> str:
    show_action_cursor = mode == "content"
    highlight_active = mode == "input"
    action_lines = render_selectable_list(
        ACTIONS,
        active_action,
        show_cursor=show_action_cursor,
        highlight_active=highlight_active,
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
            render_body(config, active_action, mode="content"),
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
                render_body(config, active_action, mode="content"),
                ACTION_LABELS.get(event.choice, "Action"),
                interaction_area="content",
            )

        action = ACTIONS_BY_KEY.get(event.choice)
        if action is None:
            continue

        if action.kind == "back":
            return

        if action.kind == "input" and action.input_spec is not None and action.config_field is not None:
            new_value = _prompt_for_action_input(menu_items, config, active_action, action)
            if new_value is not None:
                setattr(
                    config,
                    action.config_field,
                    _normalize_value(new_value, action.input_spec),
                )
                save_config(config)
