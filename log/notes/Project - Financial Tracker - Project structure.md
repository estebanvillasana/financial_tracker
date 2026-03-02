---
description:
---

#study

> [!HELP] Sources
> - 
# Project structure
We have to define not only the "folders and files" structure, but also key things such as the HTTP Requests, the pages of the actual app, the functions of each file, etc.

I asked AI for a suggestion so we can have a starting point.
```txt fold title:"structure suggestion"
financial-tracker/
│
├── app.py                          # Main Flask application entry point
│
├── config.py                       # Configuration (database path, settings)
│
├── requirements.txt                # Python dependencies (Flask, etc.)
│
├── database/
│   ├── __init__.py
│   ├── schema.sql                  # Database schema definition
│   ├── db.py                       # Database connection & helper functions
│   └── expenses.db                 # SQLite database file (gitignored)
│
├── routes/                         # Flask routes (URL endpoints)
│   ├── __init__.py
│   ├── dashboard.py                # Dashboard routes
│   ├── transactions.py             # Transaction CRUD routes
│   ├── transfers.py                # Internal transfer routes
│   ├── reports.py                  # Report generation routes
│   └── api.py                      # JSON API endpoints (for AJAX)
│
├── models/                         # Business logic & data models
│   ├── __init__.py
│   ├── bank_account.py             # BankAccount class & operations
│   ├── transaction.py              # Transaction class & operations
│   ├── category.py                 # Category class & operations
│   └── transfer.py                 # Transfer logic (creates 2 transactions)
│
├── utils/                          # Utility functions
│   ├── __init__.py
│   ├── validation.py               # Input validation functions
│   ├── formatters.py               # Date/currency formatting
│   └── helpers.py                  # General helper functions
│
├── static/                         # Frontend assets (served by Flask)
│   ├── css/
│   │   ├── main.css                # Global styles
│   │   ├── dashboard.css           # Dashboard-specific styles
│   │   └── grid.css                # AG Grid customizations
│   │
│   ├── js/
│   │   ├── main.js                 # Global JavaScript
│   │   ├── ag-grid-setup.js        # AG Grid initialization
│   │   ├── transactions.js         # Transaction page logic
│   │   ├── transfers.js            # Transfer page logic
│   │   ├── api-client.js           # Fetch API wrapper functions
│   │   └── validation.js           # Frontend validation
│   │
│   └── images/
│       └── (icons, logos, etc.)
│
├── templates/                      # Jinja2 HTML templates
│   ├── base.html                   # Base template (navigation, header, footer)
│   ├── dashboard.html              # Dashboard view
│   ├── transactions.html           # Transactions grid view
│   ├── transfers.html              # Internal transfers view
│   ├── reports.html                # Reports view
│   │
│   └── components/                 # Reusable template components
│       ├── account_selector.html   # Bank account dropdown
│       ├── date_filter.html        # Date range filter
│       └── transaction_modal.html  # Edit transaction modal
│
├── tests/                          # Unit tests (for future)
│   ├── __init__.py
│   ├── test_models.py
│   ├── test_routes.py
│   └── test_validation.py
│
├── backups/                        # Database backups (gitignored)
│   └── expenses_YYYY-MM-DD.db
│
├── .env                            # Environment variables (gitignored)
├── .gitignore                      # Git ignore file
└── README.md                       # Project documentation


EXPLANATION OF KEY DIRECTORIES:
================================

/database/
----------
- schema.sql: CREATE TABLE statements with foreign keys
- db.py: Connection management, PRAGMA foreign_keys = ON
- expenses.db: The actual SQLite database file

/routes/
--------
Each file handles a group of related endpoints:
- dashboard.py: GET /dashboard
- transactions.py: GET/POST /transactions, PUT /transactions/<id>
- api.py: JSON endpoints like POST /api/add-expenses-bulk

/models/
--------
Business logic lives here, NOT in routes
- Each model represents a database table + operations
- Example: transaction.py has add(), edit(), delete(), get_by_account()

/static/
--------
All frontend assets Flask serves directly
- CSS: Styling for each view
- JS: Client-side logic, AG Grid setup, AJAX calls
- Images: Icons, logos

/templates/
-----------
Jinja2 HTML files
- base.html: Shared layout (nav bar, imports)
- Other files extend base.html
- components/: Reusable pieces included with {% include %}

/utils/
-------
Helper functions used across the app
- validation.py: validate_date(), validate_amount(), etc.
- formatters.py: format_currency(), parse_date(), etc.


ALTERNATIVE: SIMPLER STRUCTURE (if you prefer)
===============================================

financial-tracker/
│
├── app.py                          # All routes in one file (simpler start)
├── models.py                       # All models in one file
├── database.py                     # Database setup
├── schema.sql                      # Schema definition
├── expenses.db                     # SQLite file
│
├── static/
│   ├── css/
│   │   └── main.css
│   └── js/
│       ├── main.js
│       └── transactions.js
│
└── templates/
    ├── base.html
    ├── dashboard.html
    ├── transactions.html
    └── transfers.html


RECOMMENDATION FOR YOU:
=======================
Start with the SIMPLER structure, then refactor to the full structure
as your app grows. This lets you:
1. Get working code faster
2. Understand the patterns before splitting files
3. Refactor when you FEEL the pain of large files

The architecture stays the same either way - it's just file organization.
```

## Folder Structure - `FINANCIAL TRACKER/`
- `app.py`
- `data/`
	- `expenses.db`
	- `schema.sql`
	- `database.py`
	- `backups/`
- `config/`
	- `config.py`
	- `config.json`
	- 

---

#writing/in-progress 
