import json
import os
from typing import Any
from fastapi import APIRouter
from database import get_current_db_path

router = APIRouter(prefix="/custom-links", tags=["Custom Links"])

_EMPTY: dict[str, Any] = {"groups": [], "ungrouped": []}


def _links_path() -> str:
    db = get_current_db_path()
    stem, _ = os.path.splitext(db)
    return stem + "_custom_links.json"


def _read() -> dict[str, Any]:
    try:
        with open(_links_path(), "r", encoding="utf-8") as fh:
            return json.load(fh)
    except (FileNotFoundError, json.JSONDecodeError):
        return {"groups": [], "ungrouped": []}


def _write(data: dict[str, Any]) -> None:
    path = _links_path()
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(data, fh, indent=2, ensure_ascii=False)


@router.get("")
def get_custom_links() -> dict[str, Any]:
    """Return the current custom links data."""
    return _read()


@router.put("")
def put_custom_links(body: dict[str, Any]) -> dict[str, Any]:
    """Replace the custom links data."""
    _write(body)
    return _read()
