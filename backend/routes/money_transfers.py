from fastapi import APIRouter, HTTPException, status
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
def route_get_all():
    """
    Returns all internal money transfers.
    """

    transfers = get_all_money_transfers()
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
