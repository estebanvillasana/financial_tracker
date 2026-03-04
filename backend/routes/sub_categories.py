from fastapi import APIRouter, HTTPException, status, Query
from pydantic import BaseModel
from models.sub_categories import get_all_sub_categories, get_sub_category_by_id


router = APIRouter(prefix="/sub-categories", tags=["Sub Categories"])


class SubCategoryResponse(BaseModel):
    id:              int
    sub_category:    str
    category_id:     int
    category:        str
    type:            str
    active:          int
    movements_count: int


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
