---
description:
---

#study

> [!HELP] Sources
> - [AG Grid frameworks vs vanilla JavaScript - Claude](https://claude.ai/chat/be7beaa0-48cd-4e9e-9d7a-26a7f58170c0)
# Technologies to use
I want to build this app using Python for the data management, business logic, etc. But I really want to use JavaScript for the frontend simply because of the library of AG Grids.

> [!SUMMARY] All technologies
> - Python
> 	- Flask
> - SQLite
> - JavaScript
> 	- AG Grid
> 	- Fetch API
> - HTML
> 	- Jinja
> - CSS

## Backend
**Purpose:** Handles all data operations, business logic, and database communication. Processes information, performs calculations, validates data, and enforces business rules.

**Responsibilities:**
- Execute SQL queries to read/write data in SQLite
- Validate user input (e.g., check if amount is numeric, date is valid)
- Perform financial calculations (totals, averages, balances)
- Enforce business rules (e.g., expense categories must exist before use)
- Format and prepare data before sending to frontend
- Handle CRUD operations (Create, Read, Update, Delete)

**Technologies:**
- **Python:** Primary backend programming language. Write all business logic, data processing, and database operations
- **SQLite:** Embedded file-based relational database. Persistent data storage for expenses, income, categories, etc.
## Web Framework (Bridge Layer)
**Purpose:** Acts as the bridge between backend (Python) and frontend (browser). Handles HTTP requests, routes URLs to Python functions, renders HTML templates, and serves static files.

**Responsibilities:**
- Define URL routes (e.g., `/expenses`, `/add-expense`)
- Handle HTTP methods (GET for viewing, POST for submitting)
- Pass data from Python to HTML templates
- Serve static files (CSS, JavaScript, images)
- Process form submissions
- Return JSON responses for AJAX requests

**Technologies:**
- **Flask:** Lightweight Python web framework. Creates routes, handle requests, render templates.
	- **Jinja2:** Included with Flask, it's a template engine for Python (Similar to PHP templating). It injects data into HTML files using `{{ variable }}` and `{% for %}`. It helps us to create dynamic HTMLs without mixing Python and HTML.
## Frontend
**Purpose:** What the user sees and interacts with in the browser. Displays data, captures user input, provides interactive interfaces.

**Responsibilities:**
- Render the user interface
- Display data in tables/grids
- Capture form inputs and user interactions
- Make data interactive (sort, filter, edit)
- Send user actions back to backend
- Update display without full page reload (when needed)

**Technologies:**
- **HTML**
- **CSS**
- **Javascript:** We will use it to initialize AG Grid, handle user interactions, make async requests to Flask.
	- **AG Grid:** It's a feature-rich Javascript data grid library. It displays tabular data with sorting, filtering, editing, grouping.

Also, for the data exchange (Communication layer) we'll be using:
- **JSON**
- **Fetch API:** Modern JavaScript API for HTTP requests. Send/receive data to/from Flask without page reload



---

