from __future__ import annotations

from dataclasses import dataclass
from typing import Literal


RenderMode = Literal["preview", "content", "input"]

MENU_KEY = "2"


# ── Level: type selection (top) ───────────────────────────────

@dataclass(frozen=True)
class ActionSpec:
    key: str
    label: str
    kind: str


TYPE_ACTIONS = [
    ActionSpec(key="1", label="Expense Categories", kind="show_expense"),
    ActionSpec(key="2", label="Income Categories", kind="show_income"),
    ActionSpec(key="3", label="Create Category", kind="create_category"),
    ActionSpec(key="4", label="Refresh", kind="refresh"),
    ActionSpec(key="9", label="Back", kind="back"),
]

# ── Level: category list ──────────────────────────────────────

CAT_ACTIONS = [
    ActionSpec(key="1", label="Create Category", kind="create_category"),
    ActionSpec(key="2", label="Edit Category", kind="edit_category"),
    ActionSpec(key="3", label="Create Sub-category", kind="create_sub_category"),
    ActionSpec(key="4", label="Refresh", kind="refresh"),
    ActionSpec(key="9", label="Back", kind="back"),
]

# ── Level: sub-category list ─────────────────────────────────

SUB_ACTIONS = [
    ActionSpec(key="1", label="Create Sub-category", kind="create_sub_category"),
    ActionSpec(key="2", label="Edit Sub-category", kind="edit_sub_category"),
    ActionSpec(key="3", label="Refresh", kind="refresh"),
    ActionSpec(key="9", label="Back", kind="back"),
]


def action_tuples(specs: list[ActionSpec]) -> list[tuple[str, str]]:
    return [(a.key, a.label) for a in specs]


def action_keys(specs: list[ActionSpec]) -> list[str]:
    return [a.key for a in specs]


def action_labels(specs: list[ActionSpec]) -> dict[str, str]:
    return {a.key: a.label for a in specs}


def action_by_key(specs: list[ActionSpec]) -> dict[str, ActionSpec]:
    return {a.key: a for a in specs}


CATEGORY_GROUP_COLORS = {
    "INCOME (Active)": "green",
    "INCOME (Inactive)": "yellow",
    "EXPENSE (Active)": "red",
    "EXPENSE (Inactive)": "magenta",
}

SUBCATEGORY_GROUP_BASE_COLORS = {
    "EXPENSE": "red",
    "INCOME": "green",
}
