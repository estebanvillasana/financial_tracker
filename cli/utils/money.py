"""Shared money-related helpers: parsing, account fetching, FX rates."""

from __future__ import annotations

from decimal import Decimal, InvalidOperation

from config import CliConfig
from functions import api


def parse_major_to_cents(typed_value: str) -> int | None:
    """Convert a string in major currency units (e.g. ``"21.34"``) to integer cents.

    Returns ``None`` if the value is empty, non-numeric, zero, or negative.
    Uses :class:`Decimal` arithmetic to avoid floating-point rounding errors.
    """
    value = typed_value.strip()
    if not value:
        return None
    try:
        major = Decimal(value)
    except InvalidOperation:
        return None
    if major <= 0:
        return None
    cents = int((major * Decimal("100")).quantize(Decimal("1")))
    return cents if cents > 0 else None


def fetch_active_accounts(config: CliConfig) -> list[dict]:
    """Return all active bank accounts from the API."""
    return api.get(config.api_base_url, "/bank-accounts?active=1")


def fetch_fx_rate(
    config: CliConfig, from_currency: str, to_currency: str
) -> float | None:
    """Return the exchange rate from *from_currency* to *to_currency*.

    Returns ``1.0`` when the currencies match (no conversion needed).
    Returns ``None`` when the rate is unavailable or the API call fails.
    """
    if from_currency.lower() == to_currency.lower():
        return 1.0
    pair = f"{from_currency.upper()}{to_currency.upper()}"
    try:
        data = api.get(config.api_base_url, f"/fx-rates/latest/{pair}")
        return float(data["rate"])
    except Exception:
        return None
