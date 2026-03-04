from fastapi import APIRouter, HTTPException, status, Query
from pydantic import BaseModel
from models.bank_accounts import get_all, get_one

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
    initial_balance: int
    net_movements:   int
    total_balance:   int


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
    accounts = get_all(active=active)

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

    account = get_one(id=id)

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