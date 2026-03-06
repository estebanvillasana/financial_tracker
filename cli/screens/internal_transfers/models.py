"""Data models and constants for the Internal Transfers screen.

An internal transfer is a paired Expense + Income movement sharing a
``movement_code``.  The backend creates and updates both rows atomically.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

# ── Types ──────────────────────────────────────────────────────

RenderMode = Literal["preview", "content", "input"]
"""Controls body-builder cursor / highlight rendering."""

# ── Menu key used by the app-level screen registry ─────────────

MENU_KEY = "4"
"""Sidebar menu key that activates the Internal Transfers screen."""

# ── Action menu ────────────────────────────────────────────────

ACTIONS: list[tuple[str, str]] = [
    ("1", "Add Internal Transfer"),
    ("2", "Edit Transfer"),
    ("3", "Delete Transfer"),
    ("5", "Refresh"),
    ("9", "Back"),
]
"""(key, label) pairs for the action menu shown inside the screen."""

ACTION_KEYS: list[str] = [key for key, _ in ACTIONS]
ACTION_LABELS: dict[str, str] = {key: label for key, label in ACTIONS}

# ── Transfer draft ─────────────────────────────────────────────


@dataclass
class TransferDraft:
    """All fields needed to create or update an internal transfer.

    Field names mirror the ``POST /money-transfers`` and
    ``PUT /money-transfers/{code}`` API payloads.
    """

    description: str | None
    movement_date: str          # YYYY-MM-DD
    send_account_id: int
    send_account_name: str
    sent_value: int             # cents
    send_currency: str
    receive_account_id: int
    receive_account_name: str
    received_value: int         # cents
    receive_currency: str
