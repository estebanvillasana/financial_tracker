from __future__ import annotations

import os
import sys


def read_key() -> str:
    """Read a single keypress and return a normalized key token."""
    if os.name == "nt":
        return _read_key_windows()
    return _read_key_posix()


def _read_key_windows() -> str:
    import msvcrt

    char = msvcrt.getwch()

    if char in ("\x00", "\xe0"):
        special = msvcrt.getwch()
        return {
            "H": "UP",
            "P": "DOWN",
            "K": "LEFT",
            "M": "RIGHT",
        }.get(special, "")

    if char == "\r":
        return "ENTER"
    if char == "\x1b":
        return "ESC"
    return char


def _read_key_posix() -> str:
    import select
    import termios
    import tty

    stdin = sys.stdin
    fd = stdin.fileno()
    tcgetattr = getattr(termios, "tcgetattr")
    tcsetattr = getattr(termios, "tcsetattr")
    tcsadrain = getattr(termios, "TCSADRAIN")
    setraw = getattr(tty, "setraw")

    old_settings = tcgetattr(fd)

    try:
        setraw(fd)
        char = stdin.read(1)

        if char in ("\r", "\n"):
            return "ENTER"

        if char == "\x1b":
            if select.select([stdin], [], [], 0.02)[0]:
                next_char = stdin.read(1)
                if next_char == "[" and select.select([stdin], [], [], 0.02)[0]:
                    final_char = stdin.read(1)
                    return {
                        "A": "UP",
                        "B": "DOWN",
                        "C": "RIGHT",
                        "D": "LEFT",
                    }.get(final_char, "ESC")
            return "ESC"

        return char
    finally:
        tcsetattr(fd, tcsadrain, old_settings)
