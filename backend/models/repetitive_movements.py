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


def create_repetitive_movement(
    *,
    movement: str,
    description: str | None,
    type: Literal["Income", "Expense"],
    tax_report: int = 0,
    active_subscription: int | None = None,
    active: int = 1,
) -> dict:
    """
    Creates a new repetitive movement and returns it.
    """

    insert_query = load_query("repetitive_movements/insert.sql")

    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            insert_query,
            (
                movement,
                description,
                type,
                tax_report,
                active_subscription,
                active,
            ),
        )
        new_id = cursor.lastrowid

        if new_id is None:
            raise RuntimeError(
                "Repetitive movement insert succeeded but no id was returned"
            )

    created = get_repetitive_movement_by_id(id=new_id)
    if created is None:
        raise RuntimeError(
            "Repetitive movement was inserted but could not be retrieved"
        )

    return created


def update_repetitive_movement(
    *,
    id: int,
    movement: str,
    description: str | None,
    type: Literal["Income", "Expense"],
    tax_report: int,
    active_subscription: int | None,
) -> dict | None:
    """
    Updates an existing repetitive movement and returns it.

    Returns None if the repetitive movement id does not exist.
    """

    update_query = load_query("repetitive_movements/update.sql")

    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            update_query,
            (
                movement,
                description,
                type,
                tax_report,
                active_subscription,
                id,
            ),
        )

        if cursor.rowcount == 0:
            return None

    updated = get_repetitive_movement_by_id(id=id)
    if updated is None:
        raise RuntimeError(
            "Repetitive movement was updated but could not be retrieved"
        )

    return updated


def delete_repetitive_movement(*, id: int) -> bool:
    """
    Permanently deletes a repetitive movement.

    Returns:
        True if a row was deleted, False if the id was not found.
    """

    delete_query = load_query("repetitive_movements/delete.sql")

    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(delete_query, (id,))
        return cursor.rowcount > 0


def soft_delete_repetitive_movement(*, id: int) -> dict | None:
    """
    Soft-deletes a repetitive movement by setting active = 0.

    Returns None if the repetitive movement id does not exist.
    """

    soft_delete_query = load_query("repetitive_movements/soft_delete.sql")

    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(soft_delete_query, (id,))

        if cursor.rowcount == 0:
            return None

    deleted = get_repetitive_movement_by_id(id=id)
    if deleted is None:
        raise RuntimeError(
            "Repetitive movement was soft-deleted but could not be retrieved"
        )

    return deleted
