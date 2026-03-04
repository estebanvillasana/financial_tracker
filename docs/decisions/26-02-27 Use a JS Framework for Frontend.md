---
Title: Use a JS Framework for Frontend
Date: 2026-02-27
Status: Accepted
---

## Context
Using FastAPI to handle both the backend and frontend has proven to be overly complex. While FastAPI is excellent for managing data and APIs, it is not ideal for building and maintaining a frontend.

## Decision
We will use FastAPI exclusively for handling data and APIs. For the frontend, we will adopt a JavaScript framework to simplify development and improve maintainability.

## Rationale
- **Separation of Concerns**: FastAPI excels at backend tasks, but frontend development is better suited to specialized JS frameworks.
- **Maintainability**: A dedicated JS framework will make the frontend easier to manage and extend.
- **Scalability**: Using a JS framework allows for better handling of dynamic and interactive UI components.

## Consequences
- The frontend will need to be rewritten using the chosen JS framework.
- FastAPI will remain focused on backend responsibilities, improving its performance and reliability.