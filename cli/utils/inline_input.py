from __future__ import annotations

from typing import Callable
from typing import Literal
from typing import Mapping

from utils.navigation import read_key


RenderScreenFn = Callable[..., None]
BodyBuilderFn = Callable[[], str]
InteractionArea = Literal["menu", "content"]
DIM_START = "[[dim]]"
DIM_END = "[[/dim]]"
OPTIONS_PANEL_START = "[[options_panel]]"
OPTIONS_PANEL_END = "[[/options_panel]]"
INPUT_PANEL_START = "[[input_panel]]"
INPUT_PANEL_END = "[[/input_panel]]"
HINT_PANEL_START = "[[hint_panel]]"
HINT_PANEL_END = "[[/hint_panel]]"


def _build_prompt_body(
    body_builder: BodyBuilderFn,
    label: str,
    prompt_value: str,
    help_text: str,
    options_above: list[str] | None = None,
    options_below: list[str] | None = None,
) -> str:
    options_lines: list[str] = []
    if options_above:
        options_lines.extend(options_above)
    if options_below:
        if options_lines:
            options_lines.append("")
        options_lines.extend(options_below)

    sections: list[str] = []

    sections.append(body_builder())

    if options_lines:
        sections.append(
            "\n".join(
                [OPTIONS_PANEL_START, *options_lines, OPTIONS_PANEL_END]
            )
        )

    input_lines = [
        INPUT_PANEL_START,
        f"{label}: {prompt_value}_",
        INPUT_PANEL_END,
    ]
    sections.append("\n".join(input_lines))

    hint_lines = [
        HINT_PANEL_START,
        help_text,
        HINT_PANEL_END,
    ]
    sections.append("\n".join(hint_lines))

    return "\n\n".join(sections)


def _normalize_for_match(value: str) -> str:
    return value.strip().lower()


def _prefix_matches(options: list[str], typed_value: str) -> list[str]:
    normalized = _normalize_for_match(typed_value)
    if not normalized:
        return options
    return [opt for opt in options if opt.lower().startswith(normalized)]


def _format_option_lines(
    title: str,
    options: list[str],
    selected_index: int | None,
    numbered: bool,
    group_labels: list[str] | None = None,
    group_colors: Mapping[str, str] | None = None,
    number_offset: int = 0,
) -> list[str]:
    lines = [title]
    if not options:
        lines.append("    (no options)")
        return lines

    last_group: str | None = None
    for index, option in enumerate(options):
        current_group = group_labels[index] if group_labels and index < len(group_labels) else None
        if current_group and current_group != last_group:
            if last_group is not None:
                lines.append("")
            heading = f"[{current_group}]"
            centered_heading = heading.center(38)
            color = (group_colors or {}).get(current_group)
            if color:
                lines.append(f"[[group:{color}]]{centered_heading}[[/group]]")
            else:
                lines.append(centered_heading)
            lines.append("")
            last_group = current_group
        marker = "->" if selected_index == index else "  "
        if numbered:
            lines.append(f"    {marker} {number_offset + index + 1}. {option}")
        else:
            lines.append(f"    {marker} {option}")
    return lines


def _move_index(current_index: int, length: int, direction: str) -> int:
    if length <= 0:
        return current_index
    if direction == "UP":
        return (current_index - 1) % length
    if direction == "DOWN":
        return (current_index + 1) % length
    return current_index


def prompt_inline_text(
    menu_items: list[tuple[str, str]],
    menu_active_key: str,
    label: str,
    initial_value: str,
    body_builder: BodyBuilderFn,
    render_screen: RenderScreenFn,
    interaction_area: InteractionArea = "menu",
    max_length: int | None = None,
    min_length: int = 0,
    char_allowed: Callable[[str], bool] | None = None,
) -> str | None:
    """Collect text input inside the app layout without leaving the live screen."""
    typed_value = initial_value

    while True:
        body = _build_prompt_body(
            body_builder,
            label,
            typed_value,
            "Enter to confirm, Esc to cancel, Backspace to edit.",
        )
        render_screen(
            menu_items,
            menu_active_key,
            body,
            interaction_area=interaction_area,
        )
        pressed_key = read_key()

        if pressed_key == "ENTER":
            if len(typed_value.strip()) < min_length:
                continue
            return typed_value
        if pressed_key == "ESC":
            return None
        if pressed_key in {"\x08", "\x7f"}:
            typed_value = typed_value[:-1]
            continue

        if len(pressed_key) == 1 and pressed_key.isprintable():
            if max_length is not None and len(typed_value) >= max_length:
                continue
            if char_allowed is not None and not char_allowed(pressed_key):
                continue
            typed_value += pressed_key


def prompt_inline_numbered_choice(
    menu_items: list[tuple[str, str]],
    menu_active_key: str,
    label: str,
    options: list[str],
    body_builder: BodyBuilderFn,
    render_screen: RenderScreenFn,
    interaction_area: InteractionArea = "menu",
    group_labels: list[str] | None = None,
    group_colors: Mapping[str, str] | None = None,
    max_visible_options: int = 10,
) -> str | None:
    """Select one option from a numbered list via arrows or numeric jump."""
    if not options:
        return None

    selected_index = 0
    typed_number = "1"
    window_start = 0

    while True:
        max_visible = max(5, max_visible_options)
        if group_labels:
            max_visible = min(max_visible, 8)
        if len(options) <= max_visible:
            visible_start = 0
            visible_end = len(options)
        else:
            if selected_index < window_start:
                window_start = selected_index
            elif selected_index >= window_start + max_visible:
                window_start = selected_index - max_visible + 1
            visible_start = max(0, min(window_start, len(options) - max_visible))
            visible_end = visible_start + max_visible

        visible_options = options[visible_start:visible_end]
        visible_groups = group_labels[visible_start:visible_end] if group_labels else None
        selected_visible_index = selected_index - visible_start

        options_lines = _format_option_lines(
            "Options",
            visible_options,
            selected_visible_index,
            numbered=True,
            group_labels=visible_groups,
            group_colors=group_colors,
            number_offset=visible_start,
        )
        if visible_start > 0 or visible_end < len(options):
            hints: list[str] = []
            if visible_start > 0:
                hints.append("↑ more options above")
            if visible_end < len(options):
                hints.append("↓ more options below")
            options_lines.insert(1, f"{DIM_START}    {' | '.join(hints)}{DIM_END}")

        body = _build_prompt_body(
            body_builder,
            label,
            str(selected_index + 1),
            ">       Up/Down to browse, Enter to choose, number to jump, Esc to cancel.",
            options_above=options_lines,
        )
        render_screen(
            menu_items,
            menu_active_key,
            body,
            interaction_area=interaction_area,
        )
        pressed_key = read_key()

        if pressed_key == "UP":
            selected_index = _move_index(selected_index, len(options), "UP")
            typed_number = str(selected_index + 1)
            continue

        if pressed_key == "DOWN":
            selected_index = _move_index(selected_index, len(options), "DOWN")
            typed_number = str(selected_index + 1)
            continue

        if pressed_key == "ENTER":
            return options[selected_index]

        if pressed_key == "ESC":
            return None

        if pressed_key in {"\x08", "\x7f"}:
            typed_number = typed_number[:-1]
            if typed_number.isdigit():
                target_index = int(typed_number) - 1
                if 0 <= target_index < len(options):
                    selected_index = target_index
            continue

        if len(pressed_key) == 1 and pressed_key.isdigit() and pressed_key != "0":
            typed_number = pressed_key
            target_index = int(typed_number) - 1
            if 0 <= target_index < len(options):
                selected_index = target_index


def prompt_inline_autocomplete_choice(
    menu_items: list[tuple[str, str]],
    menu_active_key: str,
    label: str,
    options: list[str],
    body_builder: BodyBuilderFn,
    render_screen: RenderScreenFn,
    interaction_area: InteractionArea = "menu",
    initial_value: str = "",
    max_visible_options: int = 5,
) -> str | None:
    """Collect a free text value with arrow-navigable suggestions and autocomplete."""
    if not options:
        return None

    typed_value = initial_value
    selected_index = 0

    while True:
        matches = _prefix_matches(options, typed_value)
        visible_matches = matches[:max_visible_options]

        if visible_matches:
            selected_index = max(0, min(selected_index, len(visible_matches) - 1))
        else:
            selected_index = 0

        selected_match = visible_matches[selected_index] if visible_matches else ""
        ghost_suffix = ""
        if selected_match and selected_match.lower().startswith(typed_value.lower()):
            ghost_suffix = selected_match[len(typed_value) :]
        prompt_value = typed_value + (f"{DIM_START}{ghost_suffix}{DIM_END}" if ghost_suffix else "")

        suggestions_lines = _format_option_lines(
            "Suggestions",
            visible_matches,
            selected_index if visible_matches else None,
            numbered=False,
        )

        body = _build_prompt_body(
            body_builder,
            label,
            prompt_value,
            ">       Type freely, Up/Down to explore, Tab/Right to autocomplete, Enter to confirm.",
            options_below=suggestions_lines,
        )
        render_screen(
            menu_items,
            menu_active_key,
            body,
            interaction_area=interaction_area,
        )
        pressed_key = read_key()

        if pressed_key == "UP":
            if visible_matches:
                selected_index = _move_index(selected_index, len(visible_matches), "UP")
            continue

        if pressed_key == "DOWN":
            if visible_matches:
                selected_index = _move_index(selected_index, len(visible_matches), "DOWN")
            continue

        if pressed_key == "ENTER":
            if not typed_value.strip():
                continue
            return typed_value.strip()

        if pressed_key == "ESC":
            return None

        if pressed_key in {"\x08", "\x7f"}:
            typed_value = typed_value[:-1]
            selected_index = 0
            continue

        if pressed_key in {"\t", "RIGHT"}:
            if not visible_matches:
                continue
            typed_value = visible_matches[selected_index]
            continue

        if len(pressed_key) == 1 and pressed_key.isprintable():
            typed_value += pressed_key
            selected_index = 0
