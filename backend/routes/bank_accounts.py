import sqlite3
from typing import Literal

from fastapi import APIRouter, HTTPException, Response, status, Query
from pydantic import BaseModel, Field, field_validator

from models.bank_accounts import (
    get_all_bank_accounts,
    get_bank_account_by_id,
    create_bank_account,
    update_bank_account,
    delete_bank_account,
    soft_delete_bank_account,
)

# ─────────────────────────────────────────────
# VALID ISO 4217 CURRENCY CODES
# ─────────────────────────────────────────────
VALID_CURRENCIES = {
    "usd", "eur", "gbp", "jpy", "aud", "cad", "chf", "cny", "sek", "nzd",
    "mxn", "sgd", "hkd", "nok", "kwh", "thy", "myr", "zar", "php", "idr",
    "rub", "inr", "brl", "clp", "cop", "pen", "ars", "uyu", "gel", "aed",
    "sar", "qar", "bhd", "omr", "jod", "lbp", "egp", "ils", "pkr", "bgn",
    "hrk", "czk", "huf", "pln", "ron", "rsd", "uah", "byn", "kzk", "uzs",
    "tjs", "kgs", "afn", "mdl", "azn", "try", "irr", "isk", "mkd", "all",
    "lek", "kgs", "xaf", "xof", "xpf", "xcd", "bsd", "bbd", "bmd", "jmd",
    "ttd", "fkp", "gip", "shp", "srd", "ves", "vnd", "lak", "khr", "mmk",
    "lrd", "ghs", "mga", "mur", "scr", "mzn", "swz", "lsl", "bwp", "nad",
    "ang", "awg", "bz", "gyd", "pab", "hnl", "gtq", "hnl", "svc", "dop",
}

# ─────────────────────────────────────────────
# ROUTER
# ─────────────────────────────────────────────

# APIRouter is FastAPI's way of grouping related routes.
# Instead of registering everything in main.py, each domain
# gets its own router that main.py will import and include.
#
# prefix="/bank-accounts" means every route in this file
# automatically starts with /bank-accounts — we don't repeat it.
#
# tags=["Bank Accounts"] groups these routes in the auto-generated
# API documentation at /docs.
router = APIRouter(prefix="/bank-accounts", tags=["Bank Accounts"])


# ─────────────────────────────────────────────
# RESPONSE MODEL
# ─────────────────────────────────────────────

# A Pydantic model defines the shape of our response.
# Think of it as a contract: "I promise every bank account
# returned by this API will have exactly these fields and types."
#
# FastAPI uses this to:
# 1. Validate the data before sending it (catches bugs early)
# 2. Convert Python types to JSON automatically
# 3. Generate API documentation at /docs
#
# The field types mirror what the database and query actually return.
# We looked at the schema to determine which fields can be None:
# only `description` is missing NOT NULL in the schema.
class BankAccountResponse(BaseModel):
    id:              int
    account:         str
    description:     str | None  # nullable — TEXT without NOT NULL in schema
    type:            str
    currency:        str
    owner:           str
    active:          int
    updated:         int
    initial_balance: int
    net_movements:   int
    total_balance:   int


class BankAccountCreateRequest(BaseModel):
    account: str = Field(min_length=1)
    description: str | None = None
    type: Literal[
        "Bank Account",
        "Credit Card",
        "Savings",
        "Crypto Wallet",
        "Money Bag",
    ]
    owner: str = Field(min_length=1)
    currency: str = Field(min_length=3, max_length=3, description="ISO 4217 currency code (3 letters)")
    initial_balance: int
    updated: int = Field(default=0, ge=0, le=1)
    active: int = Field(default=1, ge=0, le=1)

    @field_validator("currency")
    @classmethod
    def validate_currency(cls, v: str) -> str:
        """Validate that currency is a valid ISO 4217 code."""
        v_lower = v.lower()
        if v_lower not in VALID_CURRENCIES:
            raise ValueError(
                f"'{v}' is not a valid ISO 4217 currency code. "
                f"Valid codes include: USD, EUR, GBP, JPY, MXN, RUB, BRL, INR, etc."
            )
        return v_lower


class BankAccountUpdateRequest(BaseModel):
    account: str = Field(min_length=1)
    description: str | None = None
    type: Literal[
        "Bank Account",
        "Credit Card",
        "Savings",
        "Crypto Wallet",
        "Money Bag",
    ]
    owner: str = Field(min_length=1)
    currency: str = Field(min_length=3, max_length=3, description="ISO 4217 currency code (3 letters)")
    initial_balance: int
    updated: int = Field(default=1, ge=0, le=1)

    @field_validator("currency")
    @classmethod
    def validate_currency(cls, v: str) -> str:
        """Validate that currency is a valid ISO 4217 code."""
        v_lower = v.lower()
        if v_lower not in VALID_CURRENCIES:
            raise ValueError(
                f"'{v}' is not a valid ISO 4217 currency code. "
                f"Valid codes include: USD, EUR, GBP, JPY, MXN, RUB, BRL, INR, etc."
            )
        return v_lower


# ─────────────────────────────────────────────
# ROUTES
# ─────────────────────────────────────────────

# GET /bank-accounts
# GET /bank-accounts?active=1
# GET /bank-accounts?active=0
@router.get("", response_model=list[BankAccountResponse])
def route_get_all(
    active: int | None = Query(default=None, description="Filter by active status: 1 = active, 0 = inactive")
):
    """
    Returns all bank accounts with their current balance.

    Optional query parameter:
    - active=1 → only active accounts
    - active=0 → only inactive accounts
    - (nothing) → all accounts

    Values are returned in cents. Divide by 100 for display.
    """

    # Call the model function — the route doesn't touch the database directly.
    # The model handles all data access, the route just orchestrates.
    accounts = get_all_bank_accounts(active=active)

    # FastAPI automatically converts the list of dicts to JSON.
    # Pydantic validates each dict against BankAccountResponse before sending.
    return accounts


# GET /bank-accounts/5
@router.get("/{id}", response_model=BankAccountResponse)
def route_get_one(id: int):
    """
    Returns a single bank account by its ID.

    Returns 404 if the account doesn't exist.
    """

    account = get_bank_account_by_id(id=id)

    # The model returns None when nothing is found.
    # The route decides what that means for the HTTP response: a 404.
    # This is why we kept that decision out of the model —
    # the model just answers "found it or not", the route handles the consequence.
    if account is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Bank account with id {id} not found"
        )

    return account


@router.post("", response_model=BankAccountResponse, status_code=status.HTTP_201_CREATED)
def route_create(payload: BankAccountCreateRequest):
    """Creates a new bank account.

    Request body values are expected in cents for `initial_balance`.
    """

    # Pydantic v1/v2 compatibility: dict() vs model_dump()
    data = payload.model_dump() if hasattr(payload, "model_dump") else payload.dict()
    data["currency"] = data["currency"].lower()

    try:
        created = create_bank_account(**data)
    except sqlite3.IntegrityError as exc:
        # Covers CHECK constraints and NOT NULL violations.
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc

    return created


@router.put("/{id}", response_model=BankAccountResponse)
def route_update(id: int, payload: BankAccountUpdateRequest):
    """Updates a bank account by id."""

    data = payload.model_dump() if hasattr(payload, "model_dump") else payload.dict()
    data["currency"] = data["currency"].lower()

    try:
        updated = update_bank_account(id=id, **data)
    except sqlite3.IntegrityError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc

    if updated is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Bank account with id {id} not found"
        )

    return updated


@router.patch("/{id}/soft-delete", response_model=BankAccountResponse)
def route_soft_delete(id: int):
    """Soft-deletes a bank account by setting active=0."""

    account = soft_delete_bank_account(id=id)

    if account is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Bank account with id {id} not found"
        )

    return account


@router.delete("/{id}", status_code=status.HTTP_204_NO_CONTENT)
def route_delete(id: int):
    """Permanently deletes a bank account by id."""

    try:
        deleted = delete_bank_account(id=id)
    except sqlite3.IntegrityError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "Cannot delete bank account because it is referenced by other records "
                "(for example, movements)."
            ),
        ) from exc

    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Bank account with id {id} not found"
        )

    return Response(status_code=status.HTTP_204_NO_CONTENT)