from database import get_connection
from functions.queries import load_query


def get_all_sub_categories(active: int | None = None, category_id: int | None = None) -> list[dict]:
    """
    Returns all sub-categories with their metadata.

    Parameters:
        active (int, optional): Filter by active status.
            - None  → return all sub-categories (active and inactive)
            - 1     → return only active sub-categories
            - 0     → return only inactive sub-categories
        category_id (int, optional): Filter by parent category ID.

    Returns:
        A list of dictionaries, one per sub-category.
        Example: [{"id": 1, "sub_category": "Rent", "category_id": 3, ...}, ...]

    Each sub-category includes:
        - category/category_id/type: parent category metadata
        - movements_count: number of non-deleted movements in this sub-category
    """

    query = load_query("sub_categories/select.sql")

    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(query)
        rows = [dict(row) for row in cursor.fetchall()]

    if active is not None:
        rows = [row for row in rows if row["active"] == active]
    
    if category_id is not None:
        rows = [row for row in rows if row["category_id"] == category_id]

    return rows


def get_sub_category_by_id(id: int) -> dict | None:
    """
    Returns a single sub-category by its ID.

    Parameters:
        id (int): The primary key of the sub-category.

    Returns:
        A dictionary with the sub-category data, or None if not found.

    Why do we return None instead of raising an error here?
    This is the model — it only deals with data.
    The route is responsible for deciding what HTTP response to send
    when the sub-category doesn't exist (a 404 error, for example).
    Keeping that decision in the route makes the model reusable.
    """

    query = load_query("sub_categories/select.sql")

    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(query)
        rows = [dict(row) for row in cursor.fetchall()]

    sub_category = next((row for row in rows if row["id"] == id), None)

    return sub_category


def update_sub_category(*, id: int, sub_category: str, category_id: int) -> dict | None:
    """
    Updates an existing sub-category and returns it.

    Returns None if the sub-category id does not exist.
    """

    update_query = load_query("sub_categories/update.sql")

    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(update_query, (sub_category, category_id, id))

        if cursor.rowcount == 0:
            return None

    updated_sub_category = get_sub_category_by_id(id=id)
    if updated_sub_category is None:
        raise RuntimeError("Sub-category was updated but could not be retrieved")

    return updated_sub_category


def delete_sub_category(*, id: int) -> bool:
    """
    Permanently deletes a sub-category.

    Returns:
        True if a row was deleted, False if the id was not found.
    """

    delete_query = load_query("sub_categories/delete.sql")

    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(delete_query, (id,))
        return cursor.rowcount > 0


def soft_delete_sub_category(*, id: int) -> dict | None:
    """
    Soft-deletes a sub-category by setting active = 0.

    Returns None if the sub-category id does not exist.
    """

    soft_delete_query = load_query("sub_categories/soft_delete.sql")

    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(soft_delete_query, (id,))

        if cursor.rowcount == 0:
            return None

    deleted_sub_category = get_sub_category_by_id(id=id)
    if deleted_sub_category is None:
        raise RuntimeError("Sub-category was soft-deleted but could not be retrieved")

    return deleted_sub_category
