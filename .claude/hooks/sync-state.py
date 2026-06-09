#!/usr/bin/env python3
"""PostToolUse hook: regenerate .claude/state.json from PROGRESS.md.

Fires on Write/Edit/MultiEdit. Does nothing unless the edited file is
PROGRESS.md. Parses the "At a glance" table and writes the phase / done /
total / next that the status line (line 2) renders. Always exits 0 — it
must never block an edit.
"""
import json
import os
import re
import sys

STATUS = {"done": "✅", "wip": "🟡", "todo": "⬜", "deferred": "⏸️"}
ROW_RE = re.compile(r"^\|\s*(\d+)\s*\|\s*(.+?)\s*\|\s*(.+?)\s*\|\s*$")


def read_file_path():
    try:
        data = json.load(sys.stdin)
    except Exception:
        return None
    ti = data.get("tool_input") or {}
    return ti.get("file_path") or (data.get("tool_response") or {}).get("filePath")


def parse_rows(text):
    """Return [(num, area, status_emoji)] for numeric build-phase rows."""
    rows = []
    for line in text.splitlines():
        m = ROW_RE.match(line)
        if not m:
            continue
        num, area, status = m.group(1), m.group(2).strip(), m.group(3).strip()
        rows.append((int(num), area, status))
    return rows


def split_area(area):
    """'Name (detail, detail)' -> ('Name', 'detail, detail')."""
    m = re.match(r"^(.*?)\s*\((.*)\)\s*$", area)
    if m:
        return m.group(1).strip(), m.group(2).strip()
    return area, ""


def build_state(rows):
    build = [r for r in rows if r[2] in (STATUS["done"], STATUS["wip"], STATUS["todo"])]
    if not build:
        return None
    total = len(build)
    done = sum(1 for r in build if r[2] == STATUS["done"])

    current = next((r for r in build if r[2] == STATUS["wip"]), None)
    if current is None:
        current = next((r for r in build if r[2] == STATUS["todo"]), None)

    if current is None:  # every phase done
        return {"phase": "All phases complete 🎉", "done": done, "total": total}

    num, area, _ = current
    name, detail = split_area(area)
    state = {"phase": f"Phase {num} — {name}", "done": done, "total": total}
    if detail:
        state["next"] = detail
    return state


def main():
    fp = read_file_path()
    if not fp or os.path.basename(fp) != "PROGRESS.md":
        return
    try:
        with open(fp, "r", encoding="utf-8") as fh:
            text = fh.read()
    except OSError:
        return
    state = build_state(parse_rows(text))
    if not state:
        return
    out = os.path.join(os.path.dirname(os.path.abspath(fp)), ".claude", "state.json")
    try:
        with open(out, "w", encoding="utf-8") as fh:
            json.dump(state, fh, ensure_ascii=False, indent=2)
            fh.write("\n")
    except OSError:
        return


if __name__ == "__main__":
    try:
        main()
    except Exception:
        pass  # never block an edit
