"""
Exchange Rate Converter Test Script
Converts a value from one currency to another using stored USD exchange rates.

Usage:
    python test_exchange_rates.py

Example:
    Input value: 100
    Input currency: mxn
    Date (YYYY-MM-DD): 2025-06-04
    Output currency: eur
"""

import json
import sys
from pathlib import Path
from datetime import date
from typing import Optional


RATES_DIR = Path(__file__).resolve().parent.parent / "backend" / "data" / "usd_exchange_rates"


def load_rates_for_date(target_date: date) -> Optional[dict]:
    """Load exchange rates for a specific date."""
    year_dir = RATES_DIR / str(target_date.year)
    month_file = year_dir / f"{target_date.year}-{target_date.month:02d}.json"

    if not month_file.exists():
        print(f"❌ No data found for {target_date.year}-{target_date.month:02d}")
        return None

    try:
        with open(month_file, "r", encoding="utf-8") as f:
            month_data = json.load(f)
    except Exception as e:
        print(f"❌ Error loading file: {e}")
        return None

    day_str = target_date.strftime("%Y-%m-%d")
    if day_str not in month_data:
        print(f"❌ No exchange rates available for {day_str}")
        return None

    return month_data[day_str]


def convert_currency(value: float, input_currency: str, output_currency: str, rates: dict) -> Optional[float]:
    """Convert value from one currency to another using USD as pivot."""
    input_curr_lower = input_currency.lower()
    output_curr_lower = output_currency.lower()

    if input_curr_lower not in rates:
        print(f"❌ Currency '{input_currency}' not found in rates")
        return None

    if output_curr_lower not in rates:
        print(f"❌ Currency '{output_currency}' not found in rates")
        return None

    input_rate = rates[input_curr_lower]
    output_rate = rates[output_curr_lower]

    # Conversion: value * (output_rate / input_rate)
    # This converts through USD as the intermediate currency
    converted_value = value * (output_rate / input_rate)

    return converted_value


def main():
    print("=" * 60)
    print("  EXCHANGE RATE CONVERTER")
    print("=" * 60)

    try:
        # Get input value
        while True:
            try:
                value = float(input("\n📊 Input value: "))
                if value < 0:
                    print("   ❌ Value must be positive")
                    continue
                break
            except ValueError:
                print("   ❌ Invalid number")

        # Get input currency
        while True:
            input_currency = input("💱 Input currency (e.g., mxn): ").strip().upper()
            if not input_currency:
                print("   ❌ Currency code required")
                continue
            break

        # Get date
        while True:
            try:
                date_str = input("📅 Date (YYYY-MM-DD): ").strip()
                target_date = date.fromisoformat(date_str)
                break
            except ValueError:
                print("   ❌ Invalid date format. Use YYYY-MM-DD")

        # Get output currency
        while True:
            output_currency = input("💱 Output currency (e.g., eur): ").strip().upper()
            if not output_currency:
                print("   ❌ Currency code required")
                continue
            break

        # Load rates
        print("\n⏳ Loading exchange rates...")
        rates = load_rates_for_date(target_date)
        if rates is None:
            sys.exit(1)

        # Convert
        result = convert_currency(value, input_currency, output_currency, rates)
        if result is None:
            sys.exit(1)

        # Display result
        print("\n" + "=" * 60)
        print(f"  {value:,.2f} {input_currency} on {target_date}")
        print(f"  = {result:,.2f} {output_currency}")
        print("=" * 60 + "\n")

    except KeyboardInterrupt:
        print("\n\n❌ Cancelled.")
        sys.exit(1)


if __name__ == "__main__":
    main()
