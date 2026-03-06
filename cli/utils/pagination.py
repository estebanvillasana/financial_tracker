"""Shared pagination helpers for CLI list screens."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Generic, Sequence, TypeVar


T = TypeVar("T")


@dataclass(frozen=True)
class PageWindow(Generic[T]):
    """A clamped view over one page of a sequence."""

    items: list[T]
    current_page: int
    total_pages: int
    total_items: int
    start_index: int
    end_index: int


def paginate(items: Sequence[T], page: int, page_size: int) -> PageWindow[T]:
    """Return a clamped window over ``items`` for the requested page."""
    total_items = len(items)
    total_pages = max(1, (total_items + page_size - 1) // page_size)
    current_page = max(0, min(page, total_pages - 1))
    start_index = current_page * page_size
    page_items = list(items[start_index : start_index + page_size])
    end_index = start_index + len(page_items)
    return PageWindow(
        items=page_items,
        current_page=current_page,
        total_pages=total_pages,
        total_items=total_items,
        start_index=start_index,
        end_index=end_index,
    )


def next_page(page: int, total_pages: int) -> int:
    """Advance one page without exceeding the last page."""
    return min(max(1, total_pages) - 1, page + 1)


def previous_page(page: int) -> int:
    """Go back one page without going negative."""
    return max(0, page - 1)
