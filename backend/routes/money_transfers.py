from datetime import date

from fastapi import APIRouter, HTTPException, status, Query
from pydantic import BaseModel

from models.money_transfers import (
    get_all_money_transfers,
    get_money_transfer_by_movement_code,
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
