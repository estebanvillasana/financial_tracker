import asyncio
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from database import (
    initialize_database, load_users, get_all_db_paths, _request_db_path,
)
from routes.bank_accounts import router as bank_accounts_router
from routes.categories import router as categories_router
from routes.movements import router as movements_router
from routes.money_transfers import router as money_transfers_router
from routes.repetitive_movements import router as repetitive_movements_router
from routes.sub_categories import router as sub_categories_router
from routes.fx_rates import router as fx_rates_router
from routes.app_config import router as app_config_router
from routes.me import router as me_router
from scripts.exchange_rates import main as update_exchange_rates
from scripts.backup_db import backup_all_databases


# ─────────────────────────────────────────────
# USERS
# ─────────────────────────────────────────────

# Load the API-key → DB-path mapping from users.json.
# This is read once at import time; restart the server to pick up changes.
USERS = load_users()


# ─────────────────────────────────────────────
# LIFESPAN
# ─────────────────────────────────────────────

async def _exchange_rate_scheduler():
    """Runs in the background, updating exchange rates every 24 hours."""
    while True:
        await asyncio.sleep(24 * 60 * 60)
        print("[APP] Scheduled exchange rate update starting...")
        try:
            update_exchange_rates()
            print("[APP] Scheduled exchange rate update finished.")
        except SystemExit:
            print("[APP] Scheduled exchange rate update failed.")
        except Exception as e:
            print(f"[APP] Scheduled exchange rate update error: {e}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # ── STARTUP ──
    # Everything here runs once when the app starts
    print("[APP] Starting up...")

    # Initialize every user’s database (creates schema if the file is missing).
    if USERS:
        for info in USERS.values():
            initialize_database(info["db"])
    else:
        # No users.json → single-user / local-dev mode.
        initialize_database()

    print("[APP] Updating USD exchange rates...")
    try:
        update_exchange_rates()
        print("[APP] Exchange rates update finished.")
    except SystemExit:
        print("[APP] Exchange rates update failed, continuing startup.")
    except Exception as e:
        print(f"[APP] Exchange rates update error: {e}")

    asyncio.create_task(_exchange_rate_scheduler())
    print("[APP] Exchange rate scheduler started (runs every 24 h).")
    print("[APP] Ready.")

    yield  # The app runs here, handling requests

    # ── SHUTDOWN ──
    # Everything here runs once when the app stops (Ctrl+C)
    print("[APP] Shutting down...")

    backup_all_databases(USERS)


# ─────────────────────────────────────────────
# APP
# ─────────────────────────────────────────────

# This is the FastAPI application instance.
# We pass the lifespan function so FastAPI knows what to run on startup/shutdown.
app = FastAPI(
    title="Financial Tracker API",
    description="Personal finance tracker — backend API",
    version="0.1.0",
    lifespan=lifespan
)


# ─────────────────────────────────────────────
# MIDDLEWARE
# ─────────────────────────────────────────────

# Enable CORS (Cross-Origin Resource Sharing)
# This allows our frontend (e.g., localhost:3000)
# to communicate with our backend (localhost:8000).
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # Since it's a local app, we allow all origins.
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ─────────────────────────────────────────────
# API-KEY MIDDLEWARE
# ─────────────────────────────────────────────

@app.middleware("http")
async def db_selector_middleware(request: Request, call_next):
    """
    Reads the X-API-Key header, looks it up in USERS,
    and sets the per-request DB path so get_connection()
    automatically opens the right database.

    If users.json is empty (local-dev), all requests are
    allowed and use the default DB_PATH from .env.
    """
    # CORS preflight requests (OPTIONS) don't carry the API key —
    # they only ask whether the browser is allowed to send it.
    # Let them pass through so the CORSMiddleware can respond correctly.
    if request.method == "OPTIONS":
        return await call_next(request)

    if USERS:
        api_key = request.headers.get("X-API-Key", "")
        user = USERS.get(api_key)
        if not user:
            return JSONResponse(
                {"message": "Invalid or missing API key"},
                status_code=401,
            )
        token = _request_db_path.set(user["db"])
        try:
            response = await call_next(request)
        finally:
            _request_db_path.reset(token)
        return response

    # No users configured → pass through (single-user / local dev).
    return await call_next(request)


# ─────────────────────────────────────────────
# ROUTERS
# ─────────────────────────────────────────────

# Each domain has its own router defined in routes/.
# Here we register them all with the app.
# As we add more routes (movements, categories, etc.),
# we just add more lines here.
app.include_router(bank_accounts_router)
app.include_router(categories_router)
app.include_router(movements_router)
app.include_router(money_transfers_router)
app.include_router(repetitive_movements_router)
app.include_router(sub_categories_router)
app.include_router(fx_rates_router)
app.include_router(app_config_router)
app.include_router(me_router)