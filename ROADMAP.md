# Financial Tracker — Roadmap

Personal finance tracker with multi-account support, currency conversion, and internal transfers.

**Stack:** Python · FastAPI · SQLite · Vanilla JS  
**Started:** March 3, 2026

---

## ✅ Phase 1 — Backend (Completed March 5, 2026)

### Database & Schema
- [x] Designed relational schema: `bank_accounts`, `movements`, `categories`, `sub_categories`, `repetitive_movements`
- [x] Soft delete (`active` column) on all tables
- [x] Foreign key constraints with `ON DELETE RESTRICT` and `ON UPDATE CASCADE`
- [x] Composite FK: `(sub_category_id, category_id)` → `sub_categories` to enforce subcategory ownership
- [x] CHECK constraints on `type`, `invoice`, `active` columns
- [x] Indexes for query performance
- [x] Modular schema files: one file per table + separate triggers and indexes
- [x] SQLite triggers for internal transfer naming conventions and validation

### API — FastAPI
- [x] FastAPI app with lifespan management (startup / shutdown hooks)
- [x] Modular router structure: one file per domain
- [x] Pydantic models for all inputs (`CreateRequest`, `UpdateRequest`) and outputs (`Response`)
- [x] Full CRUD for all entities: bank accounts, categories, sub-categories, movements, repetitive movements
- [x] Soft delete endpoints (`PATCH /{id}/soft-delete`) for all entities
- [x] `GET /movements` with rich filtering: account, category, sub-category, type, invoice, date range, movement code, pagination
- [x] `POST /movements/bulk` — atomic bulk insert (all-or-nothing, up to 1000 rows)
- [x] `POST /money-transfers` — atomic paired movements (Expense + Income linked by `movement_code`)
- [x] Full CRUD for money transfers, identified by `movement_code`
- [x] HTTP error handling: 404 for missing records, 409 for FK conflicts on delete, 400 for constraint violations
- [x] `GET /fx-rates` — currency pair conversion with date resolution and fallback logic
- [x] `GET /fx-rates/latest`, `/fx-rates/currencies`, `/fx-rates/all/latest`

### Supporting Systems
- [x] Exchange rates updater script: fetches and stores USD-based rates as monthly JSON files
- [x] Exchange rates auto-update on app startup
- [x] Database backup script with timestamped `.db` copies
- [x] Smart backup on shutdown: skips if last backup is recent enough
- [x] `.gitignore` configured: database file, backups, `.env`, `__pycache__`
- [x] `docs/decisions/` folder for architecture decision records

---

## 🔲 Phase 2 — Frontend

### Project Setup
- [ ] Create `frontend/` directory structure
- [ ] `index.html` — single entry point
- [ ] `styles/global.css` — CSS variables, reset, typography
- [ ] `styles/layout.css` — grid, containers, spacing system
- [ ] `config.js` — API base URL (gitignored)
- [ ] `services/api.js` — base fetch wrapper (handles errors, base URL, JSON parsing)

### Services (API Communication Layer)
- [ ] `services/bankAccountsService.js`
- [ ] `services/movementsService.js`
- [ ] `services/categoriesService.js`
- [ ] `services/transfersService.js`
- [ ] `services/repetitiveMovementsService.js`
- [ ] `services/fxRatesService.js`

### Pages

#### Dashboard
- [ ] Account cards with current balance per account
- [ ] Total net worth summary (converted to a single currency)
- [ ] Quick glance: last 5 movements

#### Add Movements
- [ ] Grid-style bulk input (add multiple rows before committing)
- [ ] Auto-generate `movement_code` for the batch: `bulk_YYMMDDHHMMSS`
- [ ] Row validation before POST
- [ ] Commit / discard workflow
- [ ] Account selector

#### Movements History
- [ ] Table view with all movements
- [ ] Filters: account, category, date range, type
- [ ] Pagination
- [ ] Edit movement via modal
- [ ] Soft delete from table

#### Money Transfers
- [ ] List of all internal transfers
- [ ] Form to create new transfer (from / to account, amounts, date)
- [ ] Edit and soft delete

#### Categories
- [ ] List categories with movement count and subcategory count
- [ ] Create / edit / soft delete categories
- [ ] Manage subcategories within each category

#### Repetitive Movements
- [ ] List with filters (type, active subscription, tax report)
- [ ] Create / edit / soft delete

#### Reports *(later)*
- [ ] Last month summary: income vs expenses
- [ ] Top expense categories
- [ ] Balance by currency

### Components & Widgets
- [ ] `Navigation` — persistent sidebar/header shell
- [ ] `SummaryCard` — balance display card
- [ ] `SearchBar` — reusable filter input
- [ ] `MovementsTable` — smart widget, owns fetch + state
- [ ] `MovementRow` — dumb component
- [ ] `AccountSelector` — dropdown populated from API
- [ ] `CategorySelector` — cascading: category → subcategory
- [ ] `Modal` — reusable overlay for edit forms

---

## 🔲 Phase 3 — Polish & Reliability

- [ ] Frontend error states (API down, empty states, loading indicators)
- [ ] `movement_code` generation for single movements (not just bulk)
- [ ] Backup retention policy: auto-delete backups older than N days
- [ ] `GET /reports/*` endpoints if frontend needs aggregated data server-side
- [ ] Keyboard shortcuts for the Add Movements page (power-user flow)
- [ ] Export movements to CSV

---

## Architecture Decisions Log

| Date | Decision | File |
|------|----------|------|
| 2026-02-27 | Use Vanilla JS instead of a framework for the frontend | `docs/decisions/26-02-27 Use a JS Framework for Frontend.md` |