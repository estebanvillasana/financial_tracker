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


def get_all_money_transfers() -> list[dict]:
    """
    Returns all internal money transfers.

    A transfer is represented by two paired movements with the same movement_code:
    - Expense row on the sender account
    - Income row on the receiver account
    """

    query = load_query("movements/money_transfers/select.sql")

    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(query)
        rows = [dict(row) for row in cursor.fetchall()]

    return rows


def get_money_transfer_by_movement_code(movement_code: str) -> dict | None:
    """
    Returns one internal money transfer by movement_code, or None if not found.
    """

    query = load_query("movements/money_transfers/select.sql")
    base_query, order_clause = _split_query_and_order(query)

    by_code_query = f"""
{base_query}
  AND m_expense.movement_code = ?
{order_clause}
LIMIT 1;
"""

    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(by_code_query, (movement_code,))
        row = cursor.fetchone()

    return dict(row) if row else None
