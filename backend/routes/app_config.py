import re
from pathlib import Path

from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter(prefix="/app-config", tags=["App Config"])

# frontend/config.js sits two levels above backend/routes/
_CONFIG_JS = Path(__file__).parent.parent.parent / "frontend" / "config.js"

_TEMPLATE = (
    'export const appConfig = {{\n'
    '  apiBaseUrl: "http://127.0.0.1:8000",\n'
    '  currency: \'{currency}\',\n'
    '}}\n'
)


def _read_currency() -> str:
    if not _CONFIG_JS.exists():
        return "usd"
    match = re.search(r"currency\s*:\s*['\"]([^'\"]+)['\"]", _CONFIG_JS.read_text(encoding="utf-8"))
    return match.group(1) if match else "usd"


def _write_currency(currency: str) -> None:
    if _CONFIG_JS.exists():
        updated = re.sub(
            r"(currency\s*:\s*)['\"][^'\"]+['\"]",
            f"\\1'{currency}'",
            _CONFIG_JS.read_text(encoding="utf-8"),
        )
        _CONFIG_JS.write_text(updated, encoding="utf-8")
    else:
        _CONFIG_JS.write_text(_TEMPLATE.format(currency=currency), encoding="utf-8")


# ── Models ────────────────────────────────────────────────────

class AppConfigResponse(BaseModel):
    currency: str


class AppConfigPatch(BaseModel):
    currency: str


# ── Routes ───────────────────────────────────────────────────

@router.get("", response_model=AppConfigResponse)
def get_app_config():
    """Return the current app configuration (currency)."""
    return {"currency": _read_currency()}


@router.patch("", response_model=AppConfigResponse)
def patch_app_config(body: AppConfigPatch):
    """Update the currency in frontend/config.js."""
    _write_currency(body.currency.lower())
    return {"currency": _read_currency()}
