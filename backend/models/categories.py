from database import get_connection
from functions.queries import load_query


def get_all_categories(active: int | None = None) -> list[dict]:
    """
    Returns all categories with their metadata.

    Parameters:
        active (int, optional): Filter by active status.
            - None  → return all categories (active and inactive)
            - 1     → return only active categories
            - 0     → return only inactive categories

    Returns:
        A list of dictionaries, one per category.
        Example: [{"id": 1, "category": "Housing", "type": "expense", "active": 1, ...}, ...]

    Each category includes:
        - movements_count: number of non-deleted movements in this category
        - subcategories_count: number of subcategories under this category
    """

    # Load the SQL query from file
    query = load_query("categories.sql")

    # Filter by active status in Python since the dataset is small
    # (typically fewer than 50 categories per user).
    # For large datasets, we would add a WHERE clause in SQL instead.

    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(query)

        # Convert rows to plain dicts for JSON serialization
        rows = [dict(row) for row in cursor.fetchall()]

    # Filter by active status if provided
    if active is not None:
        rows = [row for row in rows if row["active"] == active]

    return rows


def get_category_by_id(id: int) -> dict | None:
    """
    Returns a single category by its ID.

    Parameters:
        id (int): The primary key of the category.

    Returns:
        A dictionary with the category data, or None if not found.

    Why do we return None instead of raising an error here?
    This is the model — it only deals with data.
    The route is responsible for deciding what HTTP response to send
    when the category doesn't exist (a 404 error, for example).
    Keeping that decision in the route makes the model reusable.
    """

    query = load_query("categories.sql")

    # Load all categories and filter by id in Python
    # This is acceptable because we're loading all categories anyway
    # and the dataset is small.
    #
    # Alternative: write a separate SQL query with WHERE c.id = ?
    # That would be more efficient for large datasets, but unnecessary here.

    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(query)
        rows = [dict(row) for row in cursor.fetchall()]

    # Find the category with the matching id
    # next() returns the first match, or None if nothing is found
    category = next((row for row in rows if row["id"] == id), None)

    return category
