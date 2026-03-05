from __future__ import annotations

from typing import TypedDict


class CurrencyMeta(TypedDict):
    uppercaseCode: str
    symbol: str


_CURRENCIES: dict[str, CurrencyMeta] = {
    "usd": {"uppercaseCode": "USD", "symbol": "$"},
    "eur": {"uppercaseCode": "EUR", "symbol": "€"},
    "gbp": {"uppercaseCode": "GBP", "symbol": "£"},
    "jpy": {"uppercaseCode": "JPY", "symbol": "¥"},
    "mxn": {"uppercaseCode": "MXN", "symbol": "$"},
    "cny": {"uppercaseCode": "CNY", "symbol": "¥"},
    "inr": {"uppercaseCode": "INR", "symbol": "₹"},
    "rub": {"uppercaseCode": "RUB", "symbol": "₽"},
    "aud": {"uppercaseCode": "AUD", "symbol": "$"},
    "cad": {"uppercaseCode": "CAD", "symbol": "$"},
    "gel": {"uppercaseCode": "GEL", "symbol": "₾"},
    "amd": {"uppercaseCode": "AMD", "symbol": "֏"},
    "pln": {"uppercaseCode": "PLN", "symbol": "zł"},
    "sek": {"uppercaseCode": "SEK", "symbol": "kr"},
    "chf": {"uppercaseCode": "CHF", "symbol": "CHF"},
    "nok": {"uppercaseCode": "NOK", "symbol": "kr"},
    "czk": {"uppercaseCode": "CZK", "symbol": "Kč"},
    "huf": {"uppercaseCode": "HUF", "symbol": "Ft"},
}


def code_plus_symbol(currency_code: str) -> str:
    code = currency_code.lower()
    meta = _CURRENCIES.get(code)
    if meta is None:
        return currency_code.upper()
    return f"{meta['symbol']} {meta['uppercaseCode']}"


def format_money(amount: float | None, currency_code: str) -> str:
    if amount is None:
        return "—"
    code = currency_code.lower()
    meta = _CURRENCIES.get(code)
    upper = currency_code.upper()
    if meta is None:
        return f"{amount:,.2f} {upper}"
    return f"{meta['symbol']}{amount:,.2f} {meta['uppercaseCode']}"
