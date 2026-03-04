from fastapi import APIRouter, HTTPException, status, Query
from pydantic import BaseModel
from models.categories import get_all_categories, get_category_by_id

# ─────────────────────────────────────────────
# ROUTER
# ─────────────────────────────────────────────

# APIRouter is FastAPI's way of grouping related routes.
# Instead of registering everything in main.py, each domain
# gets its own router that main.py will import and include.
#
# prefix="/categories" means every route in this file
# automatically starts with /categories — we don't repeat it.
#
# tags=["Categories"] groups these routes in the auto-generated
# API documentation at /docs.
router = APIRouter(prefix="/categories", tags=["Categories"])


# ─────────────────────────────────────────────
# RESPONSE MODEL
# ─────────────────────────────────────────────

# A Pydantic model defines the shape of our response.
# Think of it as a contract: "I promise every category
# returned by this API will have exactly these fields and types."
#
# FastAPI uses this to:
# 1. Validate the data before sending it (catches bugs early)
# 2. Convert Python types to JSON automatically
# 3. Generate API documentation at /docs
#
# The field types mirror what the database and query actually return.
class CategoryResponse(BaseModel):
    id:                   int
    category:             str
    type:                 str
    active:               int
    movements_count:      int
    subcategories_count:  int


# ─────────────────────────────────────────────
# ROUTES
# ─────────────────────────────────────────────

# GET /categories
# GET /categories?active=1
# GET /categories?active=0
@router.get("", response_model=list[CategoryResponse])
def route_get_all(
    active: int | None = Query(default=None, description="Filter by active status: 1 = active, 0 = inactive")
):
    """
    Returns all categories with their metadata.

    Optional query parameter:
    - active=1 → only active categories
    - active=0 → only inactive categories
    - (nothing) → all categories

    Each category includes:
    - movements_count: number of active movements in this category
    - subcategories_count: number of subcategories under this category
    """

    # Call the model function — the route doesn't touch the database directly.
    # The model handles all data access, the route just orchestrates.
    categories = get_all_categories(active=active)

    # FastAPI automatically converts the list of dicts to JSON.
    # Pydantic validates each dict against CategoryResponse before sending.
    return categories


# GET /categories/5
@router.get("/{id}", response_model=CategoryResponse)
def route_get_one(id: int):
    """
    Returns a single category by its ID.

    Returns 404 if the category doesn't exist.
    """

    category = get_category_by_id(id=id)

    # The model returns None when nothing is found.
    # The route decides what that means for the HTTP response: a 404.
    # This is why we kept that decision out of the model —
    # the model just answers "found it or not", the route handles the consequence.
    if category is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Category with id {id} not found"
        )

    return category
