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


def _normalize_date(value: date | str) -> str:
    """Converts a date/date-string to ISO YYYY-MM-DD and validates it."""

    if isinstance(value, date):
        return value.isoformat()

    # Raises ValueError if invalid, which the route maps to HTTP 400
    return date.fromisoformat(value).isoformat()


def _build_next_movement_code(
    *,
    send_account_id: int,
    receive_account_id: int,
    movement_date: str,
) -> str:
    """
    Generates the next movement_code using the trigger convention:
    MT_{sender_account_id}-{receiver_account_id}_{yymmdd}_{sequence}
    """

    yymmdd = movement_date[2:].replace("-", "")
    prefix = f"MT_{send_account_id}-{receive_account_id}_{yymmdd}_"

    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT COALESCE(MAX(CAST(SUBSTR(movement_code, LENGTH(?) + 1) AS INTEGER)), 0)
            FROM movements
            WHERE movement_code LIKE ?
            """,
            (prefix, f"{prefix}%"),
        )
        row = cursor.fetchone()

    max_sequence = int(row[0]) if row and row[0] is not None else 0
    next_sequence = max_sequence + 1
    return f"{prefix}{next_sequence}"


def _get_transfer_movement_rows(movement_code: str) -> tuple[dict, dict] | None:
    """
    Returns (expense_row, income_row) for one transfer movement_code.
    Returns None when not found.
    """

    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT id, type
            FROM movements
            WHERE movement_code = ?
              AND type IN ('Expense', 'Income')
            """,
            (movement_code,),
        )
        rows = [dict(row) for row in cursor.fetchall()]

    if not rows:
        return None

    expense_rows = [row for row in rows if row["type"] == "Expense"]
    income_rows = [row for row in rows if row["type"] == "Income"]

    if len(expense_rows) != 1 or len(income_rows) != 1:
        raise ValueError(
            "Transfer is not in a valid paired state (expected exactly 1 Expense and 1 Income row)"
        )

    return expense_rows[0], income_rows[0]


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


def create_money_transfer(
    *,
    movement: str,
    description: str | None,
    movement_date: date | str,
    send_account_id: int,
    sent_value: int,
    receive_account_id: int,
    received_value: int,
    active: int = 1,
) -> dict:
    """
    Creates a money transfer as two movement rows:
    - Expense row in sender account
    - Income row in receiver account
    """

    if send_account_id == receive_account_id:
        raise ValueError("Sender and receiver accounts must be different")

    if sent_value <= 0 or received_value <= 0:
        raise ValueError("Transfer values must be greater than zero")

    date_str = _normalize_date(movement_date)
    movement_code = _build_next_movement_code(
        send_account_id=send_account_id,
        receive_account_id=receive_account_id,
        movement_date=date_str,
    )

    insert_query = load_query("movements/money_transfers/insert.sql")

    with get_connection() as conn:
        cursor = conn.cursor()

        cursor.execute(
            insert_query,
            (
                movement,
                description,
                send_account_id,
                sent_value,
                "Expense",
                date_str,
                movement_code,
                active,
            ),
        )

        cursor.execute(
            insert_query,
            (
                movement,
                description,
                receive_account_id,
                received_value,
                "Income",
                date_str,
                movement_code,
                active,
            ),
        )

    created = get_money_transfer_by_movement_code(movement_code=movement_code)
    if created is None:
        raise RuntimeError("Money transfer was inserted but could not be retrieved")

    return created


def update_money_transfer(
    *,
    movement_code: str,
    movement: str,
    description: str | None,
    movement_date: date | str,
    send_account_id: int,
    sent_value: int,
    receive_account_id: int,
    received_value: int,
) -> dict | None:
    """
    Updates both rows of a transfer identified by movement_code.

    If date/accounts change, a new movement_code is generated to keep
    trigger-valid MT_{from}-{to}_{yymmdd}_{n} semantics.
    """

    existing = get_money_transfer_by_movement_code(movement_code=movement_code)
    if existing is None:
        return None

    if send_account_id == receive_account_id:
        raise ValueError("Sender and receiver accounts must be different")

    if sent_value <= 0 or received_value <= 0:
        raise ValueError("Transfer values must be greater than zero")

    date_str = _normalize_date(movement_date)

    should_regenerate_code = (
        send_account_id != existing["send_account_id"]
        or receive_account_id != existing["receive_account_id"]
        or date_str != existing["date"]
    )

    new_movement_code = movement_code
    if should_regenerate_code:
        new_movement_code = _build_next_movement_code(
            send_account_id=send_account_id,
            receive_account_id=receive_account_id,
            movement_date=date_str,
        )

    transfer_rows = _get_transfer_movement_rows(movement_code=movement_code)
    if transfer_rows is None:
        return None

    expense_row, income_row = transfer_rows

    update_query = load_query("movements/money_transfers/update.sql")

    with get_connection() as conn:
        cursor = conn.cursor()

        cursor.execute(
            update_query,
            (
                movement,
                description,
                send_account_id,
                sent_value,
                date_str,
                new_movement_code,
                expense_row["id"],
            ),
        )

        cursor.execute(
            update_query,
            (
                movement,
                description,
                receive_account_id,
                received_value,
                date_str,
                new_movement_code,
                income_row["id"],
            ),
        )

    updated = get_money_transfer_by_movement_code(movement_code=new_movement_code)
    if updated is None:
        raise RuntimeError("Money transfer was updated but could not be retrieved")

    return updated


def delete_money_transfer(*, movement_code: str) -> bool:
    """
    Permanently deletes both movement rows belonging to a transfer.
    """

    delete_query = load_query("movements/money_transfers/delete.sql")

    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(delete_query, (movement_code,))
        return cursor.rowcount > 0


def soft_delete_money_transfer(*, movement_code: str) -> dict | None:
    """
    Soft-deletes both transfer rows by setting active = 0.
    """

    soft_delete_query = load_query("movements/money_transfers/soft_delete.sql")

    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(soft_delete_query, (movement_code,))

        if cursor.rowcount == 0:
            return None

    deleted = get_money_transfer_by_movement_code(movement_code=movement_code)
    if deleted is None:
        raise RuntimeError("Money transfer was soft-deleted but could not be retrieved")

    return deleted
