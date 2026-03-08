from fastapi import APIRouter, Request
from pydantic import BaseModel
from database import load_users

router = APIRouter(prefix="/me", tags=["User"])

# Load the user map once at import time (same as main.py).
_USERS = load_users()


class UserResponse(BaseModel):
    name: str


@router.get("", response_model=UserResponse)
def get_current_user(request: Request):
    """
    Returns the name associated with the API key in the request.

    The API-key middleware in main.py already validates the key and
    rejects unknown ones with 401, so by the time this route runs the
    key is guaranteed to be valid (or users.json is empty / local-dev).
    """
    api_key = request.headers.get("X-API-Key", "")
    user = _USERS.get(api_key)

    # Local-dev / no users.json: return a generic name.
    if user is None:
        return {"name": "local"}

    return {"name": user["name"]}
