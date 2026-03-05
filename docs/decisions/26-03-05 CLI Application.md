---
Title: CLI Application
Date: 2026-03-05
Status: Accepted
---

## Context

The Financial Tracker currently provides two interfaces:
1. **REST API** — programmatic access to all financial data
2. **Frontend GUI** — browser-based visual interface for most users

However, power users and developers often prefer direct terminal access for:
- Quick queries without opening a GUI
- Scripting and automation
- Direct database inspection
- Fast data entry workflows

We have already created a library of human-readable SQL queries in `backend/data/explore/` that provide valuable insights (total balances, currency breakdowns, recent movements, cash flow analysis, expense categories).

## Decision

We will build a **standalone CLI application** that provides:
- Direct database access through command-line commands
- Interactive transaction entry
- Query execution using existing SQL scripts
- Independent operation from the frontend GUI
- Human-friendly terminal output (tables, summaries)

## Rationale

1. **Reusable Queries** — The existing SQL files in `backend/data/explore/` are well-structured and human-readable; we can leverage them directly.
2. **Power User Workflow** — Terminal access complements the GUI without replacing it; users choose based on context.
3. **Low Coupling** — A standalone CLI is independent from frontend updates, API changes, or future infrastructure decisions.
4. **Developer Friendly** — Makes testing, debugging, and quick financial queries trivial during development.

## Consequences

### Positive
- Power users get fast, scriptable access to their financial data
- Same codebase can be used by both API and CLI (shared database models)
- Can execute predefined reports directly from terminal

### Negative
- Adds another interface to maintain and test
- Requires careful design to avoid duplicating query logic already in API

### Mitigation
- Share query functions and database models between CLI and API
- Keep CLI focused on common workflows (accounts, movements, reports)
- Use the existing SQL query library as the single source of queries
