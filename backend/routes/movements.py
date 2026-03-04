from datetime import date
from typing import Literal

from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel

from models.movements import get_all_movements, get_movement_by_id


router = APIRouter(prefix="/movements", tags=["Movements"])


class MovementResponse(BaseModel):
    id:                     int
    movement:               str
    description:            str | None
    value:                  int
    type:                   str
    date:                   str
    movement_code:          str | None
    invoice:                int
    active:                 int
    account_id:             int
    account:                str
    currency:               str
    category_id:            int | None
    category:               str | None
    sub_category_id:        int | None
    sub_category:           str | None
    repetitive_movement_id: int | None
    repetitive_movement:    str | None


@router.get("", response_model=list[MovementResponse])
def route_get_all(
    active: int | None = Query(default=None, description="Filter by active status: 1 = active, 0 = inactive"),
    account_id: int | None = Query(default=None, description="Filter by bank account ID"),
    category_id: int | None = Query(default=None, description="Filter by category ID"),
    sub_category_id: int | None = Query(default=None, description="Filter by sub-category ID"),
    repetitive_movement_id: int | None = Query(default=None, description="Filter by repetitive movement ID"),
    type: Literal["Income", "Expense"] | None = Query(default=None, description="Filter by movement type"),
    invoice: int | None = Query(default=None, description="Filter by invoice flag: 1 = yes, 0 = no"),
    movement_code: str | None = Query(default=None, description="Filter by exact movement code"),
    date_from: date | None = Query(default=None, description="Filter by date >= YYYY-MM-DD"),
    date_to: date | None = Query(default=None, description="Filter by date <= YYYY-MM-DD"),
    limit: int = Query(default=100, ge=1, le=500, description="Max rows returned"),
    offset: int = Query(default=0, ge=0, description="Rows to skip for pagination"),
):
    """
    Returns movements with optional filters and pagination.

    Recommended for large datasets:
    - Use `limit` + `offset`
    - Combine with date/account/category filters
    """

    movements = get_all_movements(
        active=active,
        account_id=account_id,
        category_id=category_id,
        sub_category_id=sub_category_id,
        repetitive_movement_id=repetitive_movement_id,
        type=type,
        invoice=invoice,
        movement_code=movement_code,
        date_from=date_from,
        date_to=date_to,
        limit=limit,
        offset=offset,
    )

    return movements


@router.get("/{id}", response_model=MovementResponse)
def route_get_one(id: int):
    """
    Returns one movement by ID.

    Returns 404 if not found.
    """

    movement = get_movement_by_id(id=id)

    if movement is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Movement with id {id} not found",
        )

    return movement
