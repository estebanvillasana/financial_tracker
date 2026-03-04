from typing import Literal

from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel

from models.repetitive_movements import (
    get_all_repetitive_movements,
    get_repetitive_movement_by_id,
)


router = APIRouter(prefix="/repetitive-movements", tags=["Repetitive Movements"])


class RepetitiveMovementResponse(BaseModel):
    id:                  int
    movement:            str
    description:         str | None
    type:                str
    tax_report:          int
    active_subscription: int | None
    active:              int
    movements_count:     int


@router.get("", response_model=list[RepetitiveMovementResponse])
def route_get_all(
    active: int | None = Query(default=None, description="Filter by active status: 1 = active, 0 = inactive"),
    type: Literal["Income", "Expense"] | None = Query(default=None, description="Filter by repetitive movement type"),
    tax_report: int | None = Query(default=None, description="Filter by tax report flag: 1 = yes, 0 = no"),
    active_subscription: int | None = Query(default=None, description="Filter by active subscription flag: 1 = yes, 0 = no"),
    movement_contains: str | None = Query(default=None, description="Filter by movement name (contains text)"),
    limit: int = Query(default=100, ge=1, le=500, description="Max rows returned"),
    offset: int = Query(default=0, ge=0, description="Rows to skip for pagination"),
):
    """
    Returns repetitive movements with optional filters and pagination.
    """

    repetitive_movements = get_all_repetitive_movements(
        active=active,
        type=type,
        tax_report=tax_report,
        active_subscription=active_subscription,
        movement_contains=movement_contains,
        limit=limit,
        offset=offset,
    )

    return repetitive_movements


@router.get("/{id}", response_model=RepetitiveMovementResponse)
def route_get_one(id: int):
    """
    Returns one repetitive movement by ID.

    Returns 404 if not found.
    """

    repetitive_movement = get_repetitive_movement_by_id(id=id)

    if repetitive_movement is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Repetitive movement with id {id} not found",
        )

    return repetitive_movement
