from __future__ import annotations

import os


_ENV_FLAG = "FT_CLI_DEBUG_MODE"
_RESTART_KEYS = {"\x04"}


class DebugRestartRequested(RuntimeError):
    pass


def prime_debug_mode(enabled: bool) -> None:
    os.environ[_ENV_FLAG] = "1" if enabled else "0"


def handle_debug_restart(pressed_key: str) -> bool:
    debug_enabled = os.environ.get(_ENV_FLAG, "0") == "1"
    normalized = pressed_key.upper() if len(pressed_key) == 1 and pressed_key.isalpha() else pressed_key
    if not debug_enabled or normalized not in _RESTART_KEYS:
        return False
    raise DebugRestartRequested("Debug restart requested")
