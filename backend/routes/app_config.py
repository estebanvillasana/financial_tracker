from fastapi import APIRouter
from pydantic import BaseModel

from database import get_connection

router = APIRouter(prefix="/app-config", tags=["App Settings"])


def _read_currency() -> str:
    with get_connection() as conn:
        row = conn.execute(
            "SELECT value FROM settings WHERE key = 'currency'"
        ).fetchone()
        return row[0] if row else "usd"


def _write_currency(currency: str) -> None:
    with get_connection() as conn:
        conn.execute(
            """
            INSERT INTO settings (key, value) VALUES ('currency', ?)
            ON CONFLICT(key) DO UPDATE SET value = excluded.value
            """,
            (currency,),
        )


class AppConfigResponse(BaseModel):
    currency: str


class AppConfigPatch(BaseModel):
    currency: str


@router.get("", response_model=AppConfigResponse)
def get_app_config():
    """Return the current per-database app settings."""
    return {"currency": _read_currency()}


@router.patch("", response_model=AppConfigResponse)
def patch_app_config(body: AppConfigPatch):
    """Update persisted per-database app settings."""
    _write_currency(body.currency.lower())
    return {"currency": _read_currency()}
