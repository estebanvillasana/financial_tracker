"""Shared API error formatting for CLI screens."""

from __future__ import annotations

import json
import urllib.error


def api_error_message(exc: Exception) -> str:
    """Return a human-readable error string from any API exception.

    Handles ``urllib.error.HTTPError`` by extracting the FastAPI ``detail``
    field from the JSON body when present.  Falls back to the HTTP reason
    string, and for non-HTTP exceptions returns ``str(exc)``.
    """
    if isinstance(exc, urllib.error.HTTPError):
        try:
            body = exc.read().decode("utf-8")
            payload = json.loads(body) if body else {}
            detail = payload.get("detail")
            if detail:
                return f"{exc.code}: {detail}"
        except Exception:
            pass
        return f"{exc.code}: {exc.reason}"
    return str(exc)
