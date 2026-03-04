from database import get_connection
from functions.queries import load_query

def get_all_bank_accounts(active: int | None = None) -> list[dict]:
    """
    Returns all bank accounts with their current balance.

    Parameters:
        active (int, optional): Filter by active status.
            - None  → return all accounts (active and inactive)
            - 1     → return only active accounts
            - 0     → return only inactive accounts

    Returns:
        A list of dictionaries, one per account.
        Example: [{"id": 1, "account": "BBVA", "total_balance": 1330533, ...}, ...]

    Values are returned in cents (smallest currency unit).
    The frontend is responsible for dividing by 100 for display.
    """

    # Load the SQL query from file instead of writing it inline
    query = load_query("bank_accounts/select.sql")

    # We need to filter by active status if the caller passed it.
    # We do this in Python (not SQL) because the dataset is small —
    # a typical user will have fewer than 30 accounts.
    # For large datasets like movements, we would filter in SQL instead.

    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(query)

        # cursor.fetchall() returns all rows.
        # Because we set row_factory = sqlite3.Row in get_connection(),
        # each row behaves like a dictionary: row["account"], row["active"], etc.
        # We convert each row to a plain dict so FastAPI can serialize it to JSON.
        rows = [dict(row) for row in cursor.fetchall()]

    # If active parameter was passed, filter here in Python
    if active is not None:
        rows = [row for row in rows if row["active"] == active]

    return rows


def get_bank_account_by_id(id: int) -> dict | None:
    """
    Returns a single bank account by its ID.

    Parameters:
        id (int): The primary key of the bank account.

    Returns:
        A dictionary with the account data, or None if not found.

    Why do we return None instead of raising an error here?
    This is the model — it only deals with data.
    The route is responsible for deciding what HTTP response to send
    when the account doesn't exist (a 404 error, for example).
    Keeping that decision in the route makes the model reusable.
    """

    query = load_query("bank_accounts/select.sql")

    # We need to filter the results by id.
    # Our base query returns all accounts, so we filter in Python.
    # This is acceptable because we're loading all accounts anyway
    # and the dataset is small.
    #
    # Alternative: write a separate SQL query with WHERE ba.id = ?
    # That would be more efficient for large datasets, but unnecessary here.

    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(query)
        rows = [dict(row) for row in cursor.fetchall()]

    # Find the account with the matching id
    # next() returns the first match, or None if nothing is found
    account = next((row for row in rows if row["id"] == id), None)

    return account


def create_bank_account(
    *,
    account: str,
    description: str | None,
    type: str,
    owner: str,
    currency: str,
    initial_balance: int,
    updated: int = 0,
    active: int = 1,
) -> dict:
    """
    Creates a new bank account and returns it.

    Notes:
    - Values are stored in cents (INTEGER).
    - `updated` and `active` are stored as 0/1 integers.
    """

    insert_query = load_query("bank_accounts/insert.sql")

    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            insert_query,
            (
                account,
                description,
                type,
                owner,
                currency,
                initial_balance,
                updated,
                active,
            ),
        )
        new_id = cursor.lastrowid

        if new_id is None:
            raise RuntimeError("Bank account insert succeeded but no id was returned")

    created = get_bank_account_by_id(id=new_id)
    if created is None:
        raise RuntimeError("Bank account was inserted but could not be retrieved")

    return created