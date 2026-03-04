import sqlite3
from typing import Literal

from fastapi import APIRouter, HTTPException, Response, status, Query
from pydantic import BaseModel, Field
from models.categories import (
    create_category,
    get_all_categories,
    get_category_by_id,
    update_category,
    delete_category,
    soft_delete_category,
)

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


class CategoryUpdateRequest(BaseModel):
    category: str = Field(min_length=1)
    type: Literal["Income", "Expense"]


class CategoryCreateRequest(BaseModel):
    category: str = Field(min_length=1)
    type: Literal["Income", "Expense"]
    active: int = Field(default=1, ge=0, le=1)


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


@router.post("", response_model=CategoryResponse, status_code=status.HTTP_201_CREATED)
def route_create(payload: CategoryCreateRequest):
    """Creates a new category."""

    data = payload.model_dump() if hasattr(payload, "model_dump") else payload.dict()

    try:
        created = create_category(**data)
    except sqlite3.IntegrityError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc

    return created


@router.put("/{id}", response_model=CategoryResponse)
def route_update(id: int, payload: CategoryUpdateRequest):
    """Updates a category by id."""

    data = payload.model_dump() if hasattr(payload, "model_dump") else payload.dict()

    try:
        updated = update_category(id=id, **data)
    except sqlite3.IntegrityError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc

    if updated is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Category with id {id} not found"
        )

    return updated


@router.patch("/{id}/soft-delete", response_model=CategoryResponse)
def route_soft_delete(id: int):
    """Soft-deletes a category by setting active=0."""

    category = soft_delete_category(id=id)

    if category is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Category with id {id} not found"
        )

    return category


@router.delete("/{id}", status_code=status.HTTP_204_NO_CONTENT)
def route_delete(id: int):
    """Permanently deletes a category by id."""

    try:
        deleted = delete_category(id=id)
    except sqlite3.IntegrityError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "Cannot delete category because it is referenced by other records "
                "(for example, sub-categories or movements)."
            ),
        ) from exc

    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Category with id {id} not found"
        )

    return Response(status_code=status.HTTP_204_NO_CONTENT)
