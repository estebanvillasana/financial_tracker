"""Data fetching and summary computation for the Overview screen.

Centralises the SQL query, FX-rate gathering, and aggregate calculations
so that both the preview (main-menu sidebar) and the full interactive view
share identically-computed numbers — no duplication.
"""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from config import CliConfig
from db import query
from utils.money import fetch_fx_rate


_SQL = (Path(__file__).parent.parent.parent / "queries" / "overview.sql").read_text(
    encoding="utf-8",
)


# ── Data fetching ────────────────────────────────────────────


def fetch_rows(config: CliConfig) -> list[dict[str, Any]]:
    """Load every bank account with its computed balance."""
    return query(config.db_path, _SQL)


def build_rates(
    config: CliConfig,
    rows: list[dict[str, Any]],
) -> dict[str, float | None]:
    """Fetch FX rates for each unique currency present in *rows*."""
    unique = {str(r["currency"]).lower() for r in rows}
    return {
        cur: fetch_fx_rate(config, cur, config.main_currency)
        for cur in unique
    }


# ── Aggregation ──────────────────────────────────────────────


@dataclass
class OverviewSummary:
    """Pre-computed totals consumed by cards and preview."""

    n_active: int
    n_total: int
    total_main: float
    savings_main: float
    non_savings_main: float
    debts_main: float
    grouped: dict[str, list[dict[str, Any]]] = field(repr=False)
    sorted_currencies: list[str] = field(repr=False)


def compute_summaries(
    rows: list[dict[str, Any]],
    rates: dict[str, float | None],
    main_currency: str,
) -> OverviewSummary:
    """Aggregate *rows* into totals and per-currency groups.

    Only **active** accounts are taken into account.  The currency groups are
    sorted so that *main_currency* comes first, then alphabetically.
    """
    active = [r for r in rows if r["active"]]

    def _to_main(row: dict) -> float:
        return float(row["total_balance"]) * float(
            rates.get(str(row["currency"]).lower()) or 0
        )

    savings = [r for r in active if str(r["type"]).lower() == "savings"]
    non_savings = [r for r in active if str(r["type"]).lower() != "savings"]

    grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in active:
        grouped[str(row["currency"]).lower()].append(row)

    sorted_currencies = sorted(
        grouped,
        key=lambda c: (c != main_currency.lower(), c),
    )

    return OverviewSummary(
        n_active=len(active),
        n_total=len(rows),
        total_main=sum(_to_main(r) for r in active),
        savings_main=sum(_to_main(r) for r in savings),
        non_savings_main=sum(_to_main(r) for r in non_savings),
        debts_main=sum(
            _to_main(r) for r in active if float(r["total_balance"]) < 0
        ),
        grouped=dict(grouped),
        sorted_currencies=sorted_currencies,
    )
