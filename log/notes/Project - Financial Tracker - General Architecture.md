---
description:
---

#study

> [!HELP] Sources
> - [Financial app architecture - Claude](https://claude.ai/chat/44787e93-7cbc-4a46-9cab-593f46b026d5)

# General Architecture

## Overview
Personal financial tracker - local application for tracking expenses, income, and internal transfers across multiple bank accounts.

**Core principle:** 3-tier architecture separating presentation, business logic, and data persistence.
## Architecture Layers
```
┌─────────────────────────────────────────┐
│         PRESENTATION LAYER              │
│  (HTML + CSS + JavaScript + AG Grid)    │
│                                         │
│  • Display data in interactive grids    │
│  • Capture user input                   │
│  • Client-side validation (UX)          │
│  • Update UI without page reloads       │
└─────────────────────────────────────────┘
                   ↓
            [HTTP / Fetch API]
                   ↓
┌─────────────────────────────────────────┐
│        APPLICATION LAYER (Flask)        │
│                                         │
│  • Route handling (@app.route)          │
│  • Business logic & calculations        │
│  • Server-side validation (Security)    │
│  • Data formatting (JSON responses)     │
│  • SQL query execution                  │
└─────────────────────────────────────────┘
                   ↓
         [Parameterized SQL Queries]
                   ↓
┌─────────────────────────────────────────┐
│          DATA LAYER (SQLite)            │
│                                         │
│  • Data persistence (expenses.db)       │
│  • Foreign key enforcement              │
│  • Data integrity constraints           │
└─────────────────────────────────────────┘
```

## Application Views
### 1. Dashboard
- Overview of all bank accounts
- Current balances (calculated: `initial_balance + SUM(transactions)`)
- Summary statistics (total savings, debts, net worth)
- Recent transactions preview
### 2. Transactions (Primary View - 80% usage)
- AG Grid showing transactions for selected bank account
- Default: Load most recent account (by last transaction date)
- Bulk transaction entry with grey dots (uncommitted)
- Validation + commit with success/error feedback
- Edit transactions via modal
- Soft delete (rows marked as deleted, not removed)
### 3. Internal Transfers
- Table showing all transfers between accounts
- Form to create new transfers
- Each transfer = 2 rows in transactions table (send + receive)
- Linked by `data_note` field with transfer code
### 4. Reports
- Monthly summaries
- Category breakdowns
- Date range filtering

## Key Architectural Decisions
### Data Flow (Adding Transactions)
1. User adds rows to grid (frontend only, grey dot indicator)
2. User clicks "Commit" button
3. JavaScript validates data
4. POST `/add-expenses-bulk` with JSON payload
5. Flask validates again (backend security)
6. SQL INSERT with parameterized queries
7. Tag transactions with bulk ID: `bulkTransactions_YYYY-MM-DD-HHMMSS`
8. Return success/error results
9. Update grid (remove grey dots for successful, red dots for errors)
### Filtering Strategy
- **Server-side filtering:** Flask builds SQL queries with URL parameters
- Send only needed data (e.g., 50 transactions for selected account)
- Use parameterized queries to prevent SQL injection
- Example: `/transactions?bank_account_id=3&date_from=2025-01-01&date_to=2025-01-31`
### State Management
- **UI preferences:** Browser localStorage (selected account, filters)
- **Application settings:** SQLite user_preferences table (if needed)
- Preferences persist across sessions but reset on new device (acceptable for local app)
### Category Management
- Dynamic creation with user confirmation
- If category doesn't exist → modal: "Create category 'X'? [Yes/No]"
- Pre-load all categories on page load (small dataset ~10 categories)
### Internal Transfers
- Stored as TWO rows in transactions table
- Row 1: Expense (negative) from source account
- Row 2: Income (positive) to destination account
- Linked by identical `data_note` value (transfer code)
- Categories: "TRANSFER (SEND)" and "TRANSFER (RECEIVE)"
## Database Design Principles
### Tables
- `bank_accounts`: Account details + initial_balance
- `transactions`: All financial activity (income/expense/transfers)
- `categories`: Transaction categorization
- `subcategories`
### Foreign Keys (Enforced)

```sql
FOREIGN KEY (bank_account_id) REFERENCES bank_accounts(id) ON DELETE RESTRICT
FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE RESTRICT
```

**Purpose:** Prevent data corruption (can't delete account/category with transactions)

**Critical:** Enable in SQLite connections:
```python
conn.execute("PRAGMA foreign_keys = ON")
```
### Soft Deletes
- Transactions have `deleted` column (0 = active, 1 = deleted)
- All queries filter: `WHERE deleted = 0`
- Preserves audit trail and data integrity
### Date Handling
- Store as TEXT in `YYYY-MM-DD` format (ISO 8601)
- Date only, no time component
- Sorts correctly as text
## Security Principles
### Always Use Parameterized Queries
**Wrong (Vulnerable to SQL injection):**
```python
query = f"SELECT * FROM transactions WHERE bank_account_id = {bank_id}"
```
**Correct (Safe):**
```python
query = "SELECT * FROM transactions WHERE bank_account_id = ?"
cursor.execute(query, (bank_id,))
```
### Double Validation
- **Frontend validation:** User experience (instant feedback)
- **Backend validation:** Security (never trust client input)
## Balance Calculation
```python
# Account balance = starting point + all transactions
balance = initial_balance + SUM(amount WHERE deleted = 0)
```
**Example:**

- Initial balance: $1,000
- Transactions: +$500, -$200, +$100
- Current balance: $1,000 + $400 = $1,400
## Transaction Types
**Type column values:**
- `Income`: Money coming in
- `Expense`: Money going out

**Amount sign convention:**
- Income: Positive values
- Expense: Can be positive (type determines meaning)
- Transfers: Negative for sender, positive for receiver
## Tech Stack Summary

|Layer|Technology|Purpose|
|---|---|---|
|Frontend|HTML/CSS/JS + AG Grid|User interface & data display|
|Backend|Python + Flask|Business logic & API|
|Database|SQLite|Local data persistence|
|Communication|JSON + Fetch API|Frontend ↔ Backend|
|Templates|Jinja2|Dynamic HTML rendering|
## Design Philosophy
1. **Simplicity over perfection** - Use technologies I'm comfortable with
2. **Local-first** - Single user, single device, no authentication needed now
3. **Portable** - Copy .db file = full backup
4. **Future-proof** - Architecture allows migration to PostgreSQL/multi-user later
5. **Data integrity** - Foreign keys and constraints prevent corruption
6. **Security by default** - Parameterized queries always, even for local app
## Future Scalability Considerations
**Current:** Local app, single user, SQLite **Future path (if needed):**
- Add authentication → Multi-user support
- Migrate to PostgreSQL → Better concurrency
- API-ify backend → Add mobile app
- Add React frontend → Better state management

---