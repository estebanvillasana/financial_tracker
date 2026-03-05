import sqlite3

from fastapi import APIRouter, HTTPException, Response, status, Query
from pydantic import BaseModel, Field
from models.sub_categories import (
    create_sub_category,
    get_all_sub_categories,
    get_sub_category_by_id,
    update_sub_category,
    update_sub_category_with_active,
    delete_sub_category,
    soft_delete_sub_category,
)


router = APIRouter(prefix="/sub-categories", tags=["Sub Categories"])


class SubCategoryResponse(BaseModel):
    id:              int
    sub_category:    str
    category_id:     int
    category:        str
    type:            str
    active:          int
    movements_count: int


class SubCategoryUpdateRequest(BaseModel):
    sub_category: str = Field(min_length=1)
    category_id: int


class SubCategoryCreateRequest(BaseModel):
    sub_category: str = Field(min_length=1)
    category_id: int
    active: int = Field(default=1, ge=0, le=1)


class SubCategoryEditorUpdateRequest(BaseModel):
    sub_category: str = Field(min_length=1)
    category_id: int
    active: int = Field(ge=0, le=1)


@router.get("", response_model=list[SubCategoryResponse])
def route_get_all(
    active: int | None = Query(default=None, description="Filter by active status: 1 = active, 0 = inactive"),
    category_id: int | None = Query(default=None, description="Filter by parent category ID")
):
    """
    Returns all sub-categories with their metadata.

    Optional query parameters:
    - active=1 → only active sub-categories
    - active=0 → only inactive sub-categories
    - category_id=3 → only sub-categories of that parent category
    - (nothing) → all sub-categories

    Each sub-category includes:
    - category/category_id/type of the parent category
    - movements_count: number of active movements in this sub-category
    """

    sub_categories = get_all_sub_categories(active=active, category_id=category_id)
    return sub_categories


@router.get("/{id}", response_model=SubCategoryResponse)
def route_get_one(id: int):
    """
    Returns a single sub-category by its ID.

    Returns 404 if the sub-category doesn't exist.
    """

    sub_category = get_sub_category_by_id(id=id)

    if sub_category is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Sub-category with id {id} not found"
        )

    return sub_category


@router.post("", response_model=SubCategoryResponse, status_code=status.HTTP_201_CREATED)
def route_create(payload: SubCategoryCreateRequest):
    """Creates a new sub-category."""

    data = payload.model_dump() if hasattr(payload, "model_dump") else payload.dict()

    try:
        created = create_sub_category(**data)
    except sqlite3.IntegrityError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc

    return created


@router.put("/{id}", response_model=SubCategoryResponse)
def route_update(id: int, payload: SubCategoryUpdateRequest):
    """Updates a sub-category by id."""

    data = payload.model_dump() if hasattr(payload, "model_dump") else payload.dict()

    try:
        updated = update_sub_category(id=id, **data)
    except sqlite3.IntegrityError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc

    if updated is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Sub-category with id {id} not found"
        )

    return updated


@router.post("/{id}/update", response_model=SubCategoryResponse)
def route_editor_update(id: int, payload: SubCategoryEditorUpdateRequest):
    """Editor-safe sub-category update with movement-aware field restrictions."""
    current = get_sub_category_by_id(id=id)
    if current is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Sub-category with id {id} not found",
        )

    data = payload.model_dump() if hasattr(payload, "model_dump") else payload.dict()

    if int(current["movements_count"]) > 0 and int(data["category_id"]) != int(current["category_id"]):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Cannot change parent category when the sub-category already has movements.",
        )

    try:
        updated = update_sub_category_with_active(id=id, **data)
    except sqlite3.IntegrityError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc

    if updated is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Sub-category with id {id} not found",
        )

    return updated


@router.patch("/{id}/soft-delete", response_model=SubCategoryResponse)
def route_soft_delete(id: int):
    """Soft-deletes a sub-category by setting active=0."""

    sub_category = soft_delete_sub_category(id=id)

    if sub_category is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Sub-category with id {id} not found"
        )

    return sub_category


@router.delete("/{id}", status_code=status.HTTP_204_NO_CONTENT)
def route_delete(id: int):
    """Permanently deletes a sub-category by id."""

    try:
        deleted = delete_sub_category(id=id)
    except sqlite3.IntegrityError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "Cannot delete sub-category because it is referenced by other records "
                "(for example, movements)."
            ),
        ) from exc

    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Sub-category with id {id} not found"
        )

    return Response(status_code=status.HTTP_204_NO_CONTENT)
