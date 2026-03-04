"""
USD Exchange Rates Updater
Updates daily USD rates vs supported currencies up to today.
Creates/updates one JSON file per month, grouped in year folders.

Output structure:
    backend/data/usd_exchange_rates/
        2026/
            2026-03.json
            ...

Requirements: none (uses built-in Python only)

Usage:
    python backend/scripts/exchange_rates.py
"""

import json
import sys
import urllib.request
from datetime import date, timedelta
from pathlib import Path

INITIAL_START_DATE = date(2023, 1, 1)
END_DATE = date.today()
SCRIPT_DIR = Path(__file__).resolve().parent
OUTPUT_DIR = SCRIPT_DIR.parent / "data" / "usd_exchange_rates"

URL = "https://{date}.currency-api.pages.dev/v1/currencies/usd.min.json"

VALID_CURRENCIES = {
    "usd", "eur", "gbp", "jpy", "aud", "cad", "chf", "cny", "sek", "nzd",
    "mxn", "sgd", "hkd", "nok", "myr", "zar", "php", "idr", "rub", "inr",
    "brl", "clp", "cop", "pen", "ars", "uyu", "gel", "aed", "sar", "qar",
    "bhd", "omr", "jod", "lbp", "egp", "ils", "pkr", "bgn", "czk", "huf",
    "pln", "ron", "rsd", "uah", "byn", "kzt", "uzs", "tjs", "kgs", "afn",
    "mdl", "azn", "try", "irr", "isk", "mkd", "all", "xaf", "xof", "xpf",
    "xcd", "bsd", "bbd", "bmd", "jmd", "ttd", "fkp", "gip", "shp", "srd",
    "ves", "vnd", "lak", "khr", "mmk", "lrd", "ghs", "mga", "mur", "scr",
    "mzn", "szl", "lsl", "bwp", "nad", "ang", "awg", "gyd", "pab", "hnl",
    "gtq", "svc", "dop", "hrk",
}


def fetch_date(target_date: date):
    date_str = target_date.strftime("%Y-%m-%d")
    url = URL.format(date=date_str)
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=10) as response:
            data = json.loads(response.read())
            return data.get("usd", {})
    except Exception:
        return None


def load_month_file(year: int, month: int):
    path = OUTPUT_DIR / str(year) / f"{year}-{month:02d}.json"
    if path.exists():
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    return {}


def save_month_file(year: int, month: int, data: dict):
    year_dir = OUTPUT_DIR / str(year)
    year_dir.mkdir(parents=True, exist_ok=True)
    path = year_dir / f"{year}-{month:02d}.json"
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)


def find_latest_recorded_date():
    if not OUTPUT_DIR.exists():
        return None

    latest = None

    for year_dir in OUTPUT_DIR.iterdir():
        if not year_dir.is_dir() or not year_dir.name.isdigit():
            continue

        for month_file in year_dir.glob("*.json"):
            try:
                with open(month_file, "r", encoding="utf-8") as f:
                    month_data = json.load(f)
            except Exception:
                continue

            for day_str in month_data.keys():
                try:
                    day = date.fromisoformat(day_str)
                except ValueError:
                    continue

                if latest is None or day > latest:
                    latest = day

    return latest


def resolve_start_date():
    latest = find_latest_recorded_date()
    if latest is None:
        return INITIAL_START_DATE, False
    return latest + timedelta(days=1), True


def main():
    start_date, has_existing_data = resolve_start_date()

    if start_date > END_DATE:
        print("No update required: stored data is already up to date.")
        return

    print("Testing connection...")
    sample = fetch_date(date(2025, 1, 1))
    if not sample:
        print("ERROR: Could not reach the API. Check your internet connection.")
        sys.exit(1)
    print(f"OK — found {len(sample)} currencies in sample.\n")

    total_days = (END_DATE - start_date).days + 1
    print(f"Downloading {total_days} days ({start_date} → {END_DATE})...")
    if has_existing_data:
        print("Mode: incremental update from day after latest stored day")
    else:
        print(f"Mode: first run from {INITIAL_START_DATE}")
    print(f"Output folder: {OUTPUT_DIR.resolve()}\n")

    current = start_date
    fetched = 0
    skipped = 0
    already_present = 0

    current_month_key = None
    current_month_data = {}

    while current <= END_DATE:
        month_key = (current.year, current.month)

        if month_key != current_month_key:
            if current_month_key is not None:
                save_month_file(*current_month_key, current_month_data)
                print(f"  Saved {current_month_key[0]}-{current_month_key[1]:02d}.json")
            current_month_key = month_key
            current_month_data = load_month_file(*month_key)

        date_str = current.strftime("%Y-%m-%d")

        if date_str in current_month_data:
            already_present += 1
            current += timedelta(days=1)
            continue

        data = fetch_date(current)
        if data:
            current_month_data[date_str] = {
                k: v for k, v in data.items() if k in VALID_CURRENCIES
            }
            fetched += 1
        else:
            skipped += 1

        days_done = (current - start_date).days + 1
        if days_done % 30 == 0:
            pct = (days_done / total_days) * 100
            print(f"  {date_str}  —  {fetched} new days fetched  ({pct:.0f}%)")

        current += timedelta(days=1)

    if current_month_key and current_month_data:
        save_month_file(*current_month_key, current_month_data)
        print(f"  Saved {current_month_key[0]}-{current_month_key[1]:02d}.json")

    print("\n✅ Done!")
    print(f"   Fetched:  {fetched} new days")
    print(f"   Existing: {already_present} days")
    print(f"   Skipped:  {skipped} days (no data)")
    print(f"   Output:   {OUTPUT_DIR.resolve()}/")


if __name__ == "__main__":
    main()
