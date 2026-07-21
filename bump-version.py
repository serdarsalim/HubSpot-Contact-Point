#!/usr/bin/env python3
"""Bump manifest.json to the next release version.

Versions are date-based: YYYY.M.D, with a fourth segment for same-day
re-releases. Running this on 21 July 2026 gives:

    2026.7.20   -> 2026.7.21
    2026.7.21   -> 2026.7.21.1
    2026.7.21.1 -> 2026.7.21.2

Usage:
    python3 bump-version.py           # bump and write manifest.json
    python3 bump-version.py --print   # show the next version, change nothing
"""

import json
import sys
from datetime import date
from pathlib import Path

MANIFEST = Path(__file__).resolve().parent / "manifest.json"


def next_version(current, today):
    base = f"{today.year}.{today.month}.{today.day}"
    parts = current.split(".")

    # A different day resets to today's plain date.
    if parts[:3] != base.split("."):
        return base

    # Same day: add or increment the fourth segment.
    if len(parts) == 3:
        return f"{base}.1"
    try:
        return f"{base}.{int(parts[3]) + 1}"
    except (IndexError, ValueError):
        return f"{base}.1"


def main():
    manifest = json.loads(MANIFEST.read_text())
    current = manifest.get("version", "")
    if not current:
        sys.exit("manifest.json has no version field.")

    bumped = next_version(current, date.today())

    if "--print" in sys.argv:
        print(bumped)
        return

    # Rewrite only the version line, so formatting and key order survive.
    text = MANIFEST.read_text()
    old = f'"version": "{current}"'
    new = f'"version": "{bumped}"'
    if old not in text:
        sys.exit(f"Could not find {old} in manifest.json.")
    MANIFEST.write_text(text.replace(old, new, 1))

    print(f"{current} -> {bumped}")


if __name__ == "__main__":
    main()
