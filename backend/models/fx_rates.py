import json
from datetime import date
from pathlib import Path


BASE_DIR = Path(__file__).resolve().parent.parent
RATES_DIR = BASE_DIR / "data" / "usd_exchange_rates"


def parse_currency_pair(currency_pair: str) -> tuple[str, str]:
    """
    Parses currency pairs like MXNEUR, MXN-EUR, MXN/EUR, MXN_EUR.
    Returns tuple (base, quote) in lowercase.
    """

    raw = currency_pair.strip().upper().replace("-", "").replace("/", "").replace("_", "")

    if len(raw) != 6 or not raw.isalpha():
        raise ValueError(
            "currency-pair must use two 3-letter codes, e.g. MXNEUR, MXN-EUR, or MXN/EUR"
        )

    return raw[:3].lower(), raw[3:].lower()


def _load_month_file(year: int, month: int) -> dict | None:
    month_path = RATES_DIR / str(year) / f"{year}-{month:02d}.json"
    if not month_path.exists():
        return None

    try:
        with open(month_path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return None


def get_rates_for_date(target_date: date) -> dict | None:
    month_data = _load_month_file(target_date.year, target_date.month)
    if not month_data:
        return None

    return month_data.get(target_date.isoformat())


def _iter_available_dates_and_rates(on_or_before: date | None = None):
    if not RATES_DIR.exists():
        return

    for year_dir in RATES_DIR.iterdir():
        if not year_dir.is_dir() or not year_dir.name.isdigit():
            continue

        for month_file in year_dir.glob("*.json"):
            try:
                with open(month_file, "r", encoding="utf-8") as f:
                    month_data = json.load(f)
            except Exception:
                continue

            for day_str, rates in month_data.items():
                try:
                    day = date.fromisoformat(day_str)
                except ValueError:
                    continue

                if on_or_before is not None and day > on_or_before:
                    continue

                yield day, rates


def get_latest_available_rates(on_or_before: date | None = None) -> tuple[date, dict] | None:
    latest_day = None
    latest_rates = None

    for day, rates in _iter_available_dates_and_rates(on_or_before=on_or_before):
        if latest_day is None or day > latest_day:
            latest_day = day
            latest_rates = rates

    if latest_day is None or latest_rates is None:
        return None

    return latest_day, latest_rates


def resolve_rates_for_date_with_today_fallback(requested_date: date) -> tuple[date, dict, bool] | None:
    """
    Returns (resolved_date, rates, used_fallback).

    Rules:
    - If requested date exists, return it.
    - If requested date is today and missing, fallback to latest available <= today.
    - If requested date is in the past and missing, return None.
    """

    direct = get_rates_for_date(requested_date)
    if direct is not None:
        return requested_date, direct, False

    if requested_date != date.today():
        return None

    latest = get_latest_available_rates(on_or_before=date.today())
    if latest is None:
        return None

    latest_day, latest_rates = latest
    if latest_day == requested_date:
        return requested_date, latest_rates, False

    return latest_day, latest_rates, True


def convert_amount(*, amount: float, base_currency: str, quote_currency: str, rates: dict) -> float:
    if base_currency not in rates:
        raise ValueError(f"Base currency '{base_currency.upper()}' not found for selected date")

    if quote_currency not in rates:
        raise ValueError(f"Quote currency '{quote_currency.upper()}' not found for selected date")

    base_rate = rates[base_currency]
    quote_rate = rates[quote_currency]

    return amount * (quote_rate / base_rate)


def compute_pair_rate(*, base_currency: str, quote_currency: str, rates: dict) -> float:
    return convert_amount(
        amount=1.0,
        base_currency=base_currency,
        quote_currency=quote_currency,
        rates=rates,
    )
