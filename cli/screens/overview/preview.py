"""Preview-body rendering for the Overview screen."""

from __future__ import annotations

from utils.currencies import code_plus_symbol, format_money

from screens.overview.data import compute_summaries


def build_preview_body(
    rows: list[dict[str, object]],
    rates: dict[str, float | None],
    main_currency: str,
) -> str:
    """Compact text summary shown while navigating the main menu."""
    if not rows:
        return "Overview\n\nNo accounts found."

    summary = compute_summaries(rows, rates, main_currency)
    currency_totals: list[tuple[str, list[dict], float]] = []
    for currency, group in summary.grouped.items():
        abs_total = abs(
            sum(
                float(row["total_balance"])
                * float(rates.get(str(row["currency"]).lower()) or 0)
                for row in group
            )
        )
        currency_totals.append((currency, group, abs_total))
    currency_totals.sort(key=lambda item: item[2], reverse=True)

    lines = [
        (
            f"Overview — {summary.n_active}/{summary.n_total} accounts active | "
            f"Main: {code_plus_symbol(main_currency)}"
        ),
        f"Balance (No Savings): {format_money(summary.non_savings_main, main_currency)}",
        f"Savings: {format_money(summary.savings_main, main_currency)}",
        f"Debts: {format_money(summary.debts_main, main_currency)}",
        f"Total (Including Savings): {format_money(summary.total_main, main_currency)}",
        "",
        "Currencies (by biggest absolute total in main currency):",
    ]

    for currency, group, _ in currency_totals:
        n_active = len(group)
        n_total_cur = len([
            row for row in rows if str(row["currency"]).lower() == currency
        ])
        total_main = sum(
            float(row["total_balance"])
            * float(rates.get(str(row["currency"]).lower()) or 0)
            for row in group
        )
        lines.append(
            f"- {code_plus_symbol(currency)}: {n_active}/{n_total_cur} active | "
            f"{format_money(total_main, main_currency)}"
        )

    lines.append("Enter to open full overview.")
    return "\n".join(lines)
