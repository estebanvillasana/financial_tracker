"""List renderers for the category browser levels.

Pure functions that turn data lists into display lines.
"""

from __future__ import annotations


def _status(active: int) -> str:
    return "●" if int(active) == 1 else "○"


# ── Type-selection level ──────────────────────────────────────


def build_type_summary(
    categories: list[dict],
    sub_categories: list[dict],
) -> list[str]:
    """Summary stats shown on the top-level type-selection view."""
    def _stats(cat_type: str) -> str:
        cats = [c for c in categories if str(c["type"]).lower() == cat_type]
        cat_ids = {int(c["id"]) for c in cats}
        subs = [s for s in sub_categories if int(s["category_id"]) in cat_ids]
        active_cats = sum(1 for c in cats if int(c["active"]) == 1)
        active_subs = sum(1 for s in subs if int(s["active"]) == 1)
        locked = sum(1 for x in (*cats, *subs) if int(x["movements_count"]) > 0)
        label = cat_type.capitalize()
        return (
            f"  {label}: {active_cats}/{len(cats)} categories"
            f"  ·  {active_subs}/{len(subs)} sub-categories"
            f"  ·  {locked} locked"
        )

    return [
        "Categories & Sub-categories",
        "",
        _stats("expense"),
        _stats("income"),
    ]


# ── Category list level ──────────────────────────────────────


def build_category_line(cat: dict, sub_count: int) -> str:
    """Single line for a category row in the list."""
    marker = _status(cat["active"])
    name = cat["category"]
    mv = int(cat["movements_count"])
    parts = [f"  {marker} {name}"]
    if sub_count > 0:
        label = "sub" if sub_count == 1 else "subs"
        parts.append(f"{sub_count} {label}")
    parts.append(f"{mv} mv")
    if int(cat["movements_count"]) > 0:
        parts.append("locked")
    return "  ·  ".join(parts)


def build_category_list(
    categories: list[dict],
    sub_categories: list[dict],
    cat_type: str,
    page_items: list[dict],
) -> list[str]:
    """Render lines for one page of categories of the given type."""
    from collections import defaultdict

    sub_counts: dict[int, int] = defaultdict(int)
    for s in sub_categories:
        sub_counts[int(s["category_id"])] += 1

    lines: list[str] = []
    for cat in page_items:
        lines.append(build_category_line(cat, sub_counts.get(int(cat["id"]), 0)))
    return lines or ["  (no categories)"]


# ── Sub-category list level ──────────────────────────────────


def build_sub_category_line(sub: dict) -> str:
    """Single line for a sub-category row."""
    marker = _status(sub["active"])
    name = sub["sub_category"]
    mv = int(sub["movements_count"])
    parts = [f"  {marker} {name}"]
    parts.append(f"{mv} mv")
    if int(sub["movements_count"]) > 0:
        parts.append("locked")
    return "  ·  ".join(parts)


def build_sub_category_list(page_items: list[dict]) -> list[str]:
    """Render lines for one page of sub-categories."""
    lines = [build_sub_category_line(s) for s in page_items]
    return lines or ["  (no sub-categories)"]
