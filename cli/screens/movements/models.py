"""Data models and constants for the Movements screen.

Centralises the action menu definitions, render-mode type, and the
``MovementEditDraft`` dataclass used when editing an existing movement.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

# ── Types ─────────────────────────────────────────────────────

RenderMode = Literal["preview", "content", "input"]
"""Controls how the body builder renders cursor / highlight state."""

# ── Menu key used by the app-level screen registry ────────────

MENU_KEY = "5"
"""Sidebar menu key that activates the Movements screen."""

# ── Action menu ───────────────────────────────────────────────

ACTIONS: list[tuple[str, str]] = [
    ("1", "Select Bank Account"),
    ("2", "Edit Movement"),
    ("5", "Refresh"),
    ("9", "Back"),
]
"""(key, label) pairs for the action menu shown inside the screen."""

ACTION_KEYS: list[str] = [key for key, _ in ACTIONS]
"""Shortcut keys in menu order — used by the selection helper."""

ACTION_LABELS: dict[str, str] = {key: label for key, label in ACTIONS}
"""key → label lookup — used for flash-action feedback."""

# ── Edit draft ────────────────────────────────────────────────


@dataclass
class MovementEditDraft:
    """Mutable snapshot of a movement being edited by the wizard.

    Field names mirror the API payload expected by ``PUT /movements/{id}``.
    """

    movement: str
    description: str | None
    account_id: int
    value: int  # stored in cents
    type: Literal["Income", "Expense"]
    movement_date: str
    category_id: int | None
    sub_category_id: int | None
    repetitive_movement_id: int | None
    movement_code: str | None
    invoice: int
