from __future__ import annotations

import json
import urllib.error
import urllib.request
from typing import Any


def _request(
	method: str,
	base_url: str,
	path: str,
	body: dict[str, Any] | None = None,
) -> Any:
	url = base_url.rstrip("/") + "/" + path.lstrip("/")
	data = json.dumps(body).encode() if body is not None else None
	headers: dict[str, str] = {"Accept": "application/json"}
	if data is not None:
		headers["Content-Type"] = "application/json"
	req = urllib.request.Request(url, data=data, headers=headers, method=method)
	with urllib.request.urlopen(req, timeout=10) as resp:
		return json.loads(resp.read().decode())


def get(base_url: str, path: str) -> Any:
	return _request("GET", base_url, path)


def post(base_url: str, path: str, body: dict[str, Any]) -> Any:
	return _request("POST", base_url, path, body)


def patch(base_url: str, path: str, body: dict[str, Any]) -> Any:
	return _request("PATCH", base_url, path, body)


def delete(base_url: str, path: str) -> Any:
	return _request("DELETE", base_url, path)


def check_backend(base_url: str) -> bool:
	"""Return True if the backend is reachable (lightweight ping)."""
	try:
		get(base_url, "/fx-rates/latest")
		return True
	except Exception:
		return False
