from datetime import date, datetime

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


def _current_datetime_code() -> str:
    """Returns current date-time as human-readable string: yymmdd-hhmmss"""

    return datetime.now().strftime("%y%m%d-%H%M%S")


def _build_single_movement_code() -> str:
    """Builds movement_code for single creates: MOV_yymmdd-hhmmss"""

    return f"MOV_{_current_datetime_code()}"


def _build_bulk_movement_code() -> str:
    """Builds movement_code shared by one bulk insert operation: BMOV_yymmdd-hhmmss"""

    return f"BMOV_{_current_datetime_code()}"


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
        movement_code: Auto-generated as MOV_{timestamp}
        invoice (int): 0 or 1, default 0
        active (int): 0 or 1, default 1

    Returns:
        The created movement as a dictionary.
    """

    insert_query = load_query("movements/insert.sql")
    movement_code = _build_single_movement_code()

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


def create_bulk_movements(*, movements: list[dict]) -> list[dict]:
    """
    Creates multiple movements in a single transaction.

    If one insert fails, the entire batch is rolled back.
    Returns all created movements ordered by insertion order.
    """

    if not movements:
        return []

    insert_query = load_query("movements/insert.sql")
    bulk_movement_code = _build_bulk_movement_code()
    inserted_ids: list[int] = []

    with get_connection() as conn:
        cursor = conn.cursor()

        for item in movements:
            movement_date = item["movement_date"]
            date_str = movement_date.isoformat() if isinstance(movement_date, date) else movement_date

            cursor.execute(
                insert_query,
                (
                    item["movement"],
                    item.get("description"),
                    item["account_id"],
                    item["value"],
                    item["type"],
                    date_str,
                    item.get("category_id"),
                    item.get("sub_category_id"),
                    item.get("repetitive_movement_id"),
                    bulk_movement_code,
                    item.get("invoice", 0),
                    item.get("active", 1),
                ),
            )

            new_id = cursor.lastrowid
            if new_id is None:
                raise RuntimeError("Bulk insert succeeded but one row id was not returned")

            inserted_ids.append(new_id)

        placeholders = ",".join(["?"] * len(inserted_ids))
        cursor.execute(
            f"""
            SELECT
                m.id,
                m.movement,
                m.description,
                m.value,
                m.type,
                m.date,
                m.movement_code,
                m.invoice,
                m.active,
                m.account_id,
                ba.account,
                ba.currency,
                m.category_id,
                c.category,
                m.sub_category_id,
                sc.sub_category,
                m.repetitive_movement_id,
                rm.movement AS repetitive_movement
            FROM movements m
            JOIN bank_accounts ba
                ON ba.id = m.account_id
            LEFT JOIN categories c
                ON c.id = m.category_id
            LEFT JOIN sub_categories sc
                ON sc.id = m.sub_category_id
               AND sc.category_id = m.category_id
            LEFT JOIN repetitive_movements rm
                ON rm.id = m.repetitive_movement_id
            WHERE m.id IN ({placeholders})
            """,
            inserted_ids,
        )
        rows_by_id = {row["id"]: dict(row) for row in cursor.fetchall()}

    created: list[dict] = []
    for inserted_id in inserted_ids:
        row = rows_by_id.get(inserted_id)
        if row is None:
            raise RuntimeError(f"Movement with id {inserted_id} was inserted but could not be retrieved")
        created.append(row)

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

    existing = get_movement_by_id(id=id)
    if existing is None:
        return None

    # Keep existing movement_code when update payload does not include one.
    resolved_movement_code = existing["movement_code"] if movement_code is None else movement_code

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
                resolved_movement_code,
                invoice,
                id,
            ),
        )

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
