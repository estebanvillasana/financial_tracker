import sqlite3
from typing import Literal

from fastapi import APIRouter, HTTPException, Query, Response, status
from pydantic import BaseModel, Field

from models.repetitive_movements import (
    create_repetitive_movement,
    delete_repetitive_movement,
    get_all_repetitive_movements,
    get_repetitive_movement_by_id,
    soft_delete_repetitive_movement,
    update_repetitive_movement,
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


class RepetitiveMovementCreateRequest(BaseModel):
    movement: str = Field(min_length=1)
    description: str | None = None
    type: Literal["Income", "Expense"]
    tax_report: int = Field(default=0, ge=0, le=1)
    active_subscription: int | None = Field(default=None, ge=0, le=1)
    active: int = Field(default=1, ge=0, le=1)


class RepetitiveMovementUpdateRequest(BaseModel):
    movement: str = Field(min_length=1)
    description: str | None = None
    type: Literal["Income", "Expense"]
    tax_report: int = Field(ge=0, le=1)
    active_subscription: int | None = Field(default=None, ge=0, le=1)


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


@router.post("", response_model=RepetitiveMovementResponse, status_code=status.HTTP_201_CREATED)
def route_create(payload: RepetitiveMovementCreateRequest):
    """Creates a new repetitive movement."""

    data = payload.model_dump() if hasattr(payload, "model_dump") else payload.dict()

    try:
        created = create_repetitive_movement(**data)
    except sqlite3.IntegrityError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc

    return created


@router.put("/{id}", response_model=RepetitiveMovementResponse)
def route_update(id: int, payload: RepetitiveMovementUpdateRequest):
    """Updates a repetitive movement by id."""

    data = payload.model_dump() if hasattr(payload, "model_dump") else payload.dict()

    try:
        updated = update_repetitive_movement(id=id, **data)
    except sqlite3.IntegrityError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc

    if updated is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Repetitive movement with id {id} not found"
        )

    return updated


@router.patch("/{id}/soft-delete", response_model=RepetitiveMovementResponse)
def route_soft_delete(id: int):
    """Soft-deletes a repetitive movement by setting active=0."""

    repetitive_movement = soft_delete_repetitive_movement(id=id)

    if repetitive_movement is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Repetitive movement with id {id} not found"
        )

    return repetitive_movement


@router.delete("/{id}", status_code=status.HTTP_204_NO_CONTENT)
def route_delete(id: int):
    """Permanently deletes a repetitive movement by id."""

    try:
        deleted = delete_repetitive_movement(id=id)
    except sqlite3.IntegrityError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "Cannot delete repetitive movement because it is referenced by movements."
            ),
        ) from exc

    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Repetitive movement with id {id} not found"
        )

    return Response(status_code=status.HTTP_204_NO_CONTENT)
