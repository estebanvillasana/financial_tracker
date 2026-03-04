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
    movement_code: str | None = None,
    limit: int = 100,
    offset: int = 0,
) -> list[dict]:
    """
    Returns internal money transfers with optional movement_code filter and pagination.
    """

    query = load_query("movements/money_transfers/select.sql")
    base_query, order_clause = _split_query_and_order(query)

    filters: list[str] = []
    params: list[str | int] = []

    if movement_code is not None and movement_code.strip() != "":
        filters.append("m_expense.movement_code = ?")
        params.append(movement_code.strip())

    where_clause = ""
    if filters:
        where_clause = "\nAND " + "\n  AND ".join(filters)

    paginated_query = (
        f"{base_query}{where_clause}\n{order_clause}\nLIMIT ?\nOFFSET ?;"
    )

    params.extend([limit, offset])

    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(paginated_query, params)
        rows = [dict(row) for row in cursor.fetchall()]

    return rows


def get_money_transfer_by_movement_code(movement_code: str) -> dict | None:
    """
    Returns one internal money transfer by movement_code or None when not found.
    """

    rows = get_all_money_transfers(movement_code=movement_code, limit=1, offset=0)
    return rows[0] if rows else None
