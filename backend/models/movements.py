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


def get_all_movements(
    active: int | None = None,
    account_id: int | None = None,
    category_id: int | None = None,
    sub_category_id: int | None = None,
    repetitive_movement_id: int | None = None,
    type: str | None = None,
    invoice: int | None = None,
    movement_code: str | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    limit: int = 100,
    offset: int = 0,
) -> list[dict]:
    """
    Returns movements with optional SQL filters and pagination.
    """

    query = load_query("movements/select.sql")
    base_query, order_clause = _split_query_and_order(query)

    filters: list[str] = []
    params: list[int | str] = []

    if active is not None:
        filters.append("m.active = ?")
        params.append(active)

    if account_id is not None:
        filters.append("m.account_id = ?")
        params.append(account_id)

    if category_id is not None:
        filters.append("m.category_id = ?")
        params.append(category_id)

    if sub_category_id is not None:
        filters.append("m.sub_category_id = ?")
        params.append(sub_category_id)

    if repetitive_movement_id is not None:
        filters.append("m.repetitive_movement_id = ?")
        params.append(repetitive_movement_id)

    if type is not None:
        filters.append("m.type = ?")
        params.append(type)

    if invoice is not None:
        filters.append("m.invoice = ?")
        params.append(invoice)

    if movement_code is not None:
        filters.append("m.movement_code = ?")
        params.append(movement_code)

    if date_from is not None:
        filters.append("m.date >= ?")
        params.append(date_from.isoformat())

    if date_to is not None:
        filters.append("m.date <= ?")
        params.append(date_to.isoformat())

    where_clause = ""
    if filters:
        where_clause = "\nWHERE " + "\n  AND ".join(filters)

    paginated_query = (
        f"{base_query}{where_clause}\n{order_clause}\nLIMIT ?\nOFFSET ?;"
    )

    params.extend([limit, offset])

    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(paginated_query, params)
        rows = [dict(row) for row in cursor.fetchall()]

    return rows


def get_movement_by_id(id: int) -> dict | None:
    """
    Returns one movement by id or None when not found.
    """

    query = load_query("movements/select.sql")
    base_query, order_clause = _split_query_and_order(query)

    by_id_query = f"""
{base_query}
WHERE m.id = ?
{order_clause}
LIMIT 1;
"""

    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(by_id_query, (id,))
        row = cursor.fetchone()

    return dict(row) if row else None


def create_movement(
    *,
    movement: str,
    description: str | None,
    account_id: int,
    value: int,
    type: str,
    movement_date: date | str,
    category_id: int | None = None,
    sub_category_id: int | None = None,
    repetitive_movement_id: int | None = None,
    movement_code: str | None = None,
    invoice: int = 0,
    active: int = 1,
) -> dict:
    """
    Creates a new movement and returns it.

    Parameters:
        movement (str): Movement name/description
        description (str | None): Additional details
        account_id (int): The bank account id
        value (int): Amount in cents
        type (str): 'Income' or 'Expense'
        movement_date (date | str): Movement date (YYYY-MM-DD)
        category_id (int | None): Optional category id
        sub_category_id (int | None): Optional sub_category id
        repetitive_movement_id (int | None): Optional repetitive movement id
        movement_code (str | None): Optional movement code
        invoice (int): 0 or 1, default 0
        active (int): 0 or 1, default 1

    Returns:
        The created movement as a dictionary.
    """

    insert_query = load_query("movements/insert.sql")

    # Convert date object to string if needed
    date_str = movement_date.isoformat() if isinstance(movement_date, date) else movement_date

    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            insert_query,
            (
                movement,
                description,
                account_id,
                value,
                type,
                date_str,
                category_id,
                sub_category_id,
                repetitive_movement_id,
                movement_code,
                invoice,
                active,
            ),
        )
        new_id = cursor.lastrowid

        if new_id is None:
            raise RuntimeError("Movement insert succeeded but no id was returned")

    created = get_movement_by_id(id=new_id)
    if created is None:
        raise RuntimeError("Movement was inserted but could not be retrieved")

    return created


def update_movement(
    *,
    id: int,
    movement: str,
    description: str | None,
    account_id: int,
    value: int,
    type: str,
    movement_date: date | str,
    category_id: int | None = None,
    sub_category_id: int | None = None,
    repetitive_movement_id: int | None = None,
    movement_code: str | None = None,
    invoice: int,
) -> dict | None:
    """
    Updates an existing movement and returns it.

    Returns None if the movement id does not exist.
    """

    update_query = load_query("movements/update.sql")

    # Convert date object to string if needed
    date_str = movement_date.isoformat() if isinstance(movement_date, date) else movement_date

    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            update_query,
            (
                movement,
                description,
                account_id,
                value,
                type,
                date_str,
                category_id,
                sub_category_id,
                repetitive_movement_id,
                movement_code,
                invoice,
                id,
            ),
        )

        if cursor.rowcount == 0:
            return None

    updated = get_movement_by_id(id=id)
    if updated is None:
        raise RuntimeError("Movement was updated but could not be retrieved")

    return updated


def delete_movement(*, id: int) -> bool:
    """
    Permanently deletes a movement.

    Returns:
        True if a row was deleted, False if the id was not found.
    """

    delete_query = load_query("movements/delete.sql")

    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(delete_query, (id,))
        return cursor.rowcount > 0


def soft_delete_movement(*, id: int) -> dict | None:
    """
    Soft-deletes a movement by setting active = 0.

    Returns None if the movement id does not exist.
    """

    soft_delete_query = load_query("movements/soft_delete.sql")

    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(soft_delete_query, (id,))

        if cursor.rowcount == 0:
            return None

    deleted = get_movement_by_id(id=id)
    if deleted is None:
        raise RuntimeError("Movement was soft-deleted but could not be retrieved")

    return deleted
