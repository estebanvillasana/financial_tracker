from datetime import date
import sqlite3

from fastapi import APIRouter, HTTPException, Response, status, Query
from pydantic import BaseModel, Field, field_validator

from models.money_transfers import (
    create_money_transfer,
    delete_money_transfer,
    get_all_money_transfers,
    get_money_transfer_by_movement_code,
    soft_delete_money_transfer,
    update_money_transfer,
)


router = APIRouter(prefix="/money-transfers", tags=["Money Transfers"])


class MoneyTransferResponse(BaseModel):
    movement_code: str
    description: str | None
    date: str
    send_account_id: int
    send_account_name: str
    send_currency: str
    sent_value: int
    receive_account_id: int
    receive_account_name: str
    receive_currency: str
    received_value: int


class MoneyTransferCreateRequest(BaseModel):
    description: str | None = None
    date: str = Field(description="Date in YYYY-MM-DD format")
    send_account_id: int = Field(description="Sender account ID")
    sent_value: int = Field(ge=1, description="Sent amount in cents")
    receive_account_id: int = Field(description="Receiver account ID")
    received_value: int = Field(ge=1, description="Received amount in cents")
    active: int = Field(default=1, ge=0, le=1)

    @field_validator("date")
    @classmethod
    def validate_date(cls, v: str) -> str:
        try:
            date.fromisoformat(v)
        except ValueError:
            raise ValueError(
                f"'{v}' is not a valid date. Use YYYY-MM-DD format (e.g., 2026-03-04)"
            )
        return v

    @field_validator("receive_account_id")
    @classmethod
    def validate_accounts_are_different(cls, receive_account_id: int, info):
        send_account_id = info.data.get("send_account_id")
        if send_account_id is not None and send_account_id == receive_account_id:
            raise ValueError("Sender and receiver accounts must be different")
        return receive_account_id


class MoneyTransferUpdateRequest(BaseModel):
    description: str | None = None
    date: str = Field(description="Date in YYYY-MM-DD format")
    send_account_id: int = Field(description="Sender account ID")
    sent_value: int = Field(ge=1, description="Sent amount in cents")
    receive_account_id: int = Field(description="Receiver account ID")
    received_value: int = Field(ge=1, description="Received amount in cents")

    @field_validator("date")
    @classmethod
    def validate_date(cls, v: str) -> str:
        try:
            date.fromisoformat(v)
        except ValueError:
            raise ValueError(
                f"'{v}' is not a valid date. Use YYYY-MM-DD format (e.g., 2026-03-04)"
            )
        return v

    @field_validator("receive_account_id")
    @classmethod
    def validate_accounts_are_different(cls, receive_account_id: int, info):
        send_account_id = info.data.get("send_account_id")
        if send_account_id is not None and send_account_id == receive_account_id:
            raise ValueError("Sender and receiver accounts must be different")
        return receive_account_id


@router.get("", response_model=list[MoneyTransferResponse])
def route_get_all(
    date_from: date | None = Query(default=None, description="Filter transfers from date (YYYY-MM-DD)"),
    date_to: date | None = Query(default=None, description="Filter transfers up to date (YYYY-MM-DD)"),
    send_account_id: int | None = Query(default=None, description="Filter by sender account ID"),
    receive_account_id: int | None = Query(default=None, description="Filter by receiver account ID"),
    movement_code_contains: str | None = Query(default=None, description="Filter by movement_code substring"),
):
    """
    Returns all internal money transfers with optional filters.

    Optional query parameters:
    - date_from, date_to: Filter by date range
    - send_account_id: Filter by sender account
    - receive_account_id: Filter by receiver account
    - movement_code_contains: Filter by movement code (substring search)
    """

    transfers = get_all_money_transfers(
        date_from=date_from,
        date_to=date_to,
        send_account_id=send_account_id,
        receive_account_id=receive_account_id,
        movement_code_contains=movement_code_contains,
    )
    return transfers


@router.get("/{movement_code}", response_model=MoneyTransferResponse)
def route_get_one(movement_code: str):
    """
    Returns one internal money transfer by movement_code.

    Returns 404 if not found.
    """

    transfer = get_money_transfer_by_movement_code(movement_code=movement_code)

    if transfer is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Money transfer with movement_code '{movement_code}' not found",
        )

    return transfer


@router.post("", response_model=MoneyTransferResponse, status_code=status.HTTP_201_CREATED)
def route_create(payload: MoneyTransferCreateRequest):
    """Creates a money transfer as two paired movements (Expense + Income)."""

    data = payload.model_dump() if hasattr(payload, "model_dump") else payload.dict()
    data["movement_date"] = data.pop("date")

    try:
        created = create_money_transfer(**data)
    except (sqlite3.IntegrityError, ValueError) as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc

    return created


@router.put("/{movement_code}", response_model=MoneyTransferResponse)
def route_update(movement_code: str, payload: MoneyTransferUpdateRequest):
    """Updates both movements belonging to one transfer."""

    data = payload.model_dump() if hasattr(payload, "model_dump") else payload.dict()
    data["movement_date"] = data.pop("date")

    try:
        updated = update_money_transfer(movement_code=movement_code, **data)
    except (sqlite3.IntegrityError, ValueError) as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc

    if updated is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Money transfer with movement_code '{movement_code}' not found",
        )

    return updated


@router.patch("/{movement_code}/soft-delete", response_model=MoneyTransferResponse)
def route_soft_delete(movement_code: str):
    """Soft-deletes a transfer by setting active = 0 on both rows."""

    transfer = soft_delete_money_transfer(movement_code=movement_code)

    if transfer is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Money transfer with movement_code '{movement_code}' not found",
        )

    return transfer


@router.delete("/{movement_code}", status_code=status.HTTP_204_NO_CONTENT)
def route_delete(movement_code: str):
    """Permanently deletes both rows of a transfer."""

    deleted = delete_money_transfer(movement_code=movement_code)

    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Money transfer with movement_code '{movement_code}' not found",
        )

    return Response(status_code=status.HTTP_204_NO_CONTENT)
