import sqlite3
from datetime import date
from typing import Literal

from fastapi import APIRouter, HTTPException, Response, Query, status
from pydantic import BaseModel, Field, field_validator

from models.movements import (
    get_all_movements,
    get_movement_by_id,
    create_movement,
    create_bulk_movements,
    update_movement,
    delete_movement,
    soft_delete_movement,
    restore_movement,
)


router = APIRouter(prefix="/movements", tags=["Movements"])


# ─────────────────────────────────────────────
# RESPONSE MODELS
# ─────────────────────────────────────────────

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
    initial_balance:        int | None = None
    category_id:            int | None
    category:               str | None
    sub_category_id:        int | None
    sub_category:           str | None
    repetitive_movement_id: int | None
    repetitive_movement:    str | None
    balance_at_date:        int | None = None


class MovementCreateRequest(BaseModel):
    movement: str = Field(min_length=1, description="Movement name/title")
    description: str | None = None
    account_id: int = Field(description="Bank account ID")
    value: int = Field(description="Amount in cents")
    type: Literal["Income", "Expense"]
    date: str = Field(description="Date in YYYY-MM-DD format")
    category_id: int | None = None
    sub_category_id: int | None = None
    repetitive_movement_id: int | None = None
    invoice: int = Field(default=0, ge=0, le=1)
    active: int = Field(default=1, ge=0, le=1)

    @field_validator("date")
    @classmethod
    def validate_date(cls, v: str) -> str:
        """Validate that date is in YYYY-MM-DD format."""
        try:
            date.fromisoformat(v)
        except ValueError:
            raise ValueError(
                f"'{v}' is not a valid date. Use YYYY-MM-DD format (e.g., 2026-03-04)"
            )
        return v

    @field_validator("value")
    @classmethod
    def validate_value(cls, v: int) -> int:
        """Ensure value is not zero."""
        if v == 0:
            raise ValueError("Movement value cannot be zero")
        return v


class MovementUpdateRequest(BaseModel):
    movement: str = Field(min_length=1, description="Movement name/title")
    description: str | None = None
    account_id: int = Field(description="Bank account ID")
    value: int = Field(description="Amount in cents")
    type: Literal["Income", "Expense"]
    date: str = Field(description="Date in YYYY-MM-DD format")
    category_id: int | None = None
    sub_category_id: int | None = None
    repetitive_movement_id: int | None = None
    movement_code: str | None = None
    invoice: int = Field(ge=0, le=1)

    @field_validator("date")
    @classmethod
    def validate_date(cls, v: str) -> str:
        """Validate that date is in YYYY-MM-DD format."""
        try:
            date.fromisoformat(v)
        except ValueError:
            raise ValueError(
                f"'{v}' is not a valid date. Use YYYY-MM-DD format (e.g., 2026-03-04)"
            )
        return v

    @field_validator("value")
    @classmethod
    def validate_value(cls, v: int) -> int:
        """Ensure value is not zero."""
        if v == 0:
            raise ValueError("Movement value cannot be zero")
        return v


class MovementBulkCreateRequest(BaseModel):
    movements: list[MovementCreateRequest] = Field(
        min_length=1,
        max_length=1000,
        description="List of movements to create in one request",
    )


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
    limit: int = Query(default=500, ge=1, le=500, description="Max rows returned"),
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


@router.post("", response_model=MovementResponse, status_code=status.HTTP_201_CREATED)
def route_create(payload: MovementCreateRequest):
    """Creates a new movement.

    Request body values are expected in cents for `value`.
    `movement_code` is generated automatically as `MOV_{timestamp}`.
    """

    data = payload.model_dump() if hasattr(payload, "model_dump") else payload.dict()
    data["movement_date"] = data.pop("date")

    try:
        created = create_movement(**data)
    except sqlite3.IntegrityError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc

    return created


@router.post("/bulk", response_model=list[MovementResponse], status_code=status.HTTP_201_CREATED)
def route_create_bulk(payload: MovementBulkCreateRequest):
    """
    Creates many movements in one request.

    Behavior:
    - Atomic transaction: all rows are inserted, or none if one fails.
    - Maximum batch size: 1000 movements per request.
    - All inserted rows share one auto-generated movement_code: `BMOV_{timestamp}`.
    """

    rows = payload.model_dump() if hasattr(payload, "model_dump") else payload.dict()
    items = rows["movements"]

    for item in items:
        item["movement_date"] = item.pop("date")

    try:
        created_rows = create_bulk_movements(movements=items)
    except sqlite3.IntegrityError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc

    return created_rows


@router.put("/{id}", response_model=MovementResponse)
def route_update(id: int, payload: MovementUpdateRequest):
    """Updates a movement by id."""

    data = payload.model_dump() if hasattr(payload, "model_dump") else payload.dict()
    data["movement_date"] = data.pop("date")

    try:
        updated = update_movement(id=id, **data)
    except sqlite3.IntegrityError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc

    if updated is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Movement with id {id} not found"
        )

    return updated


@router.patch("/{id}/soft-delete", response_model=MovementResponse)
def route_soft_delete(id: int):
    """Soft-deletes a movement by setting active=0."""

    movement = soft_delete_movement(id=id)

    if movement is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Movement with id {id} not found"
        )

    return movement


@router.patch("/{id}/restore", response_model=MovementResponse)
def route_restore(id: int):
    """Restores a soft-deleted movement by setting active=1."""

    movement = restore_movement(id=id)

    if movement is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Movement with id {id} not found"
        )

    return movement


@router.delete("/{id}", status_code=status.HTTP_204_NO_CONTENT)
def route_delete(id: int):
    """Permanently deletes a movement by id."""

    try:
        deleted = delete_movement(id=id)
    except sqlite3.IntegrityError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "Cannot delete movement because it is referenced by other records."
            ),
        ) from exc

    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Movement with id {id} not found"
        )

    return Response(status_code=status.HTTP_204_NO_CONTENT)
