from typing import Literal

from database import get_connection
from functions.queries import load_query


def _split_query_and_order(query: str) -> tuple[str, str]:
    """
    Splits a SELECT query into:
    - base_query (everything before ORDER BY)
    - order_clause (the ORDER BY block)
    """

    normalized = query.strip().rstrip(";")
    upper_normalized = normalized.upper()
    order_index = upper_normalized.rfind("ORDER BY")

    if order_index == -1:
        return normalized, ""

    base_query = normalized[:order_index].strip()
    order_clause = normalized[order_index:].strip()
    return base_query, order_clause


def get_all_repetitive_movements(
    active: int | None = None,
    type: Literal["Income", "Expense"] | None = None,
    tax_report: int | None = None,
    active_subscription: int | None = None,
    movement_contains: str | None = None,
    limit: int = 100,
    offset: int = 0,
) -> list[dict]:
    """
    Returns repetitive movements with optional SQL filters and pagination.
    """

    query = load_query("repetitive_movements/select.sql")
    base_query, order_clause = _split_query_and_order(query)

    filters: list[str] = []
    params: list[int | str] = []

    if active is not None:
        filters.append("rm.active = ?")
        params.append(active)

    if type is not None:
        filters.append("rm.type = ?")
        params.append(type)

    if tax_report is not None:
        filters.append("rm.tax_report = ?")
        params.append(tax_report)

    if active_subscription is not None:
        filters.append("rm.active_subscription = ?")
        params.append(active_subscription)

    if movement_contains is not None and movement_contains.strip() != "":
        filters.append("rm.movement LIKE ?")
        params.append(f"%{movement_contains.strip()}%")

    where_clause = ""
    if filters:
        where_clause = "\nWHERE " + "\n  AND ".join(filters)

    paginated_query = f"{base_query}{where_clause}\n{order_clause}\nLIMIT ?\nOFFSET ?;"
    params.extend([limit, offset])

    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(paginated_query, params)
        rows = [dict(row) for row in cursor.fetchall()]

    return rows


def get_repetitive_movement_by_id(id: int) -> dict | None:
    """
    Returns one repetitive movement by id or None when not found.
    """

    query = load_query("repetitive_movements/select.sql")
    base_query, order_clause = _split_query_and_order(query)

    by_id_query = f"""
{base_query}
WHERE rm.id = ?
{order_clause}
LIMIT 1;
"""

    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(by_id_query, (id,))
        row = cursor.fetchone()

    return dict(row) if row else None
