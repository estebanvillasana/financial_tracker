"""Data models and constants for the Add Movements screen."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal


# ── Draft movement ────────────────────────────────────────────


@dataclass
class DraftMovement:
    """A single movement staged locally before being committed to the API.

    All monetary values are stored in **cents** (integer) to avoid
    floating-point rounding.  The ``type`` field determines whether the
    value is added or subtracted in projected-balance calculations.
    """

    movement: str
    description: str | None
    account_id: int
    value: int                                   # cents
    type: Literal["Income", "Expense"]
    date: str                                    # YYYY-MM-DD
    category_id: int | None
    category: str | None
    sub_category_id: int | None
    sub_category: str | None
    repetitive_movement_id: int | None
    repetitive_movement: str | None


# ── Action menu ───────────────────────────────────────────────

RenderMode = Literal["preview", "content", "input"]

ACTIONS: list[tuple[str, str]] = [
    ("1", "Add New Movement"),
    ("2", "Commit"),
    ("3", "Edit Draft Movement"),
    ("4", "Delete Draft Movement"),
    ("5", "Exit"),
]

ACTION_KEYS = [key for key, _ in ACTIONS]
ACTION_LABELS = {key: label for key, label in ACTIONS}
