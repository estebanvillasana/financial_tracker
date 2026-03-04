from contextlib import asynccontextmanager
from fastapi import FastAPI
from database import initialize_database
from routes.bank_accounts import router as bank_accounts_router
from routes.categories import router as categories_router
from routes.movements import router as movements_router
from routes.sub_categories import router as sub_categories_router


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
    print("[APP] Ready.")

    yield  # The app runs here, handling requests

    # ── SHUTDOWN ──
    # Everything here runs once when the app stops (Ctrl+C)
    # For now we don't need to do anything on shutdown,
    # but this is where you'd close persistent connections,
    # flush logs, etc.
    print("[APP] Shutting down...")


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
# ROUTERS
# ─────────────────────────────────────────────

# Each domain has its own router defined in routes/.
# Here we register them all with the app.
# As we add more routes (movements, categories, etc.),
# we just add more lines here.
app.include_router(bank_accounts_router)
app.include_router(categories_router)
app.include_router(movements_router)
app.include_router(sub_categories_router)