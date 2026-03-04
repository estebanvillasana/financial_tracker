from datetime import date

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


def get_all_money_transfers(
    date_from: date | None = None,
    date_to: date | None = None,
    send_account_id: int | None = None,
    receive_account_id: int | None = None,
    movement_code_contains: str | None = None,
) -> list[dict]:
    """
    Returns all internal money transfers with optional filters.

    A transfer is represented by two paired movements with the same movement_code:
    - Expense row on the sender account
    - Income row on the receiver account

    Parameters:
        date_from (date | None): Filter transfers from this date onwards (YYYY-MM-DD)
        date_to (date | None): Filter transfers up to and including this date (YYYY-MM-DD)
        send_account_id (int | None): Filter by sender account ID
        receive_account_id (int | None): Filter by receiver account ID
        movement_code_contains (str | None): Filter by movement_code substring
    """

    query = load_query("movements/money_transfers/select.sql")
    base_query, order_clause = _split_query_and_order(query)

    filters: list[str] = []
    params: list = []

    if date_from is not None:
        filters.append("m_expense.date >= ?")
        params.append(date_from.isoformat() if isinstance(date_from, date) else date_from)

    if date_to is not None:
        filters.append("m_expense.date <= ?")
        params.append(date_to.isoformat() if isinstance(date_to, date) else date_to)

    if send_account_id is not None:
        filters.append("m_expense.account_id = ?")
        params.append(send_account_id)

    if receive_account_id is not None:
        filters.append("m_income.account_id = ?")
        params.append(receive_account_id)

    if movement_code_contains is not None and movement_code_contains.strip():
        filters.append("m_expense.movement_code LIKE ?")
        params.append(f"%{movement_code_contains.strip()}%")

    # The original query already has WHERE clauses, so append additional filters with AND
    if filters:
        additional_filters = "\n  AND ".join(filters)
        filtered_query = f"{base_query}\n  AND {additional_filters}\n{order_clause};"
    else:
        filtered_query = f"{base_query}\n{order_clause};"

    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(filtered_query, params)
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
