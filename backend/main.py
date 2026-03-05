from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from database import initialize_database
from routes.bank_accounts import router as bank_accounts_router
from routes.categories import router as categories_router
from routes.movements import router as movements_router
from routes.money_transfers import router as money_transfers_router
from routes.repetitive_movements import router as repetitive_movements_router
from routes.sub_categories import router as sub_categories_router
from routes.fx_rates import router as fx_rates_router
from scripts.exchange_rates import main as update_exchange_rates
from scripts.backup_db import backup_database, should_backup


# ─────────────────────────────────────────────
# LIFESPAN
# ─────────────────────────────────────────────

# FastAPI has a specific way to run code on startup and shutdown.
# It's called "lifespan" and it uses a special kind of function
# called an async context manager.
#
# Think of it like the `with` statement you already know —
# the code BEFORE `yield` runs on startup,
# the code AFTER `yield` runs on shutdown.
#
# Why not just call initialize_database() at the top of the file?
# Because FastAPI needs to control WHEN startup code runs,
# not just when the file is imported. This is the correct, official way.
@asynccontextmanager
async def lifespan(app: FastAPI):
    # ── STARTUP ──
    # Everything here runs once when the app starts
    print("[APP] Starting up...")
    initialize_database()

    print("[APP] Updating USD exchange rates...")
    try:
        update_exchange_rates()
        print("[APP] Exchange rates update finished.")
    except SystemExit:
        print("[APP] Exchange rates update failed, continuing startup.")
    except Exception as e:
        print(f"[APP] Exchange rates update error: {e}")

    print("[APP] Ready.")

    yield  # The app runs here, handling requests

    # ── SHUTDOWN ──
    # Everything here runs once when the app stops (Ctrl+C)
    print("[APP] Shutting down...")

    if should_backup():
        try:
            backup_database()
        except Exception as e:
            print(f"[APP] Backup error: {e}")
    else:
        print("[APP] Backup skipped: last backup is recent enough.")


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