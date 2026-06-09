#!/usr/bin/env python3
import json, sys, os, datetime, re, shutil

_ANSI = re.compile(r"\033\[[0-9;]*m")

def vlen(s):
    """Visible length, ignoring ANSI color escapes."""
    return len(_ANSI.sub("", s))

def term_width():
    try:
        cols = int(os.environ.get("COLUMNS") or 0)
    except ValueError:
        cols = 0
    if cols > 0:
        return cols
    return shutil.get_terminal_size((80, 24)).columns

def wrap_segments(segments, sep, width, indent="  "):
    """Greedily pack segments onto lines no wider than `width`,
    breaking at `sep`. Continuation lines get `indent`."""
    lines, cur = [], ""
    for seg in segments:
        if cur == "":
            cur = seg
        elif vlen(cur + sep + seg) <= width:
            cur = cur + sep + seg
        else:
            lines.append(cur)
            cur = indent + seg
    if cur:
        lines.append(cur)
    return lines

def bar(pct, color_code):
    if pct is None:
        return ""
    filled = round(pct / 10)
    empty = 10 - filled
    return f"\033[{color_code}m{'▓' * filled}{'░' * empty}\033[0m"

def threshold_color(pct):
    if pct is None:
        return "32"
    if pct >= 80:
        return "31"
    if pct >= 50:
        return "33"
    return "32"

def fmt_tokens(n):
    if n is None:
        return "0"
    if n >= 1_000_000:
        return f"{n/1_000_000:.1f}M"
    if n >= 1000:
        return f"{round(n/1000)}k"
    return str(n)

def fmt_cost(usd):
    if usd is None:
        return ""
    if usd >= 1:
        return f"${usd:.2f}"
    return f"${usd:.3f}"

def weekday_from_ts(ts):
    try:
        return datetime.datetime.fromtimestamp(ts, tz=datetime.timezone.utc).strftime("%a")
    except Exception:
        return "?"

def clock_from_ts(ts):
    # Local time-of-day; for a same-day (5h) reset this is more useful than a weekday.
    try:
        return datetime.datetime.fromtimestamp(ts).strftime("%H:%M")
    except Exception:
        return "?"

data = json.load(sys.stdin)

model = (data.get("model") or {}).get("display_name") or (data.get("model") or {}).get("id") or "Claude"

cw = data.get("context_window") or {}
ctx_pct = cw.get("used_percentage")
ctx_color = threshold_color(ctx_pct)
ctx_label = f"ctx {bar(ctx_pct, ctx_color)}" if ctx_pct is not None else "ctx —"

total_tokens = (cw.get("total_input_tokens") or 0) + (cw.get("total_output_tokens") or 0)
cost_usd = ((data.get("cost") or {}).get("total_cost_usd") or
            (data.get("session") or {}).get("cost") or None)
tokens_str = fmt_tokens(total_tokens)
cost_str = fmt_cost(cost_usd)
suffix = f" {tokens_str}"
if cost_str:
    suffix += f" {cost_str}"

rl = data.get("rate_limits") or {}
five = rl.get("five_hour") or {}
five_pct = five.get("used_percentage")
five_resets = five.get("resets_at")
reset_suffix = f" resets {clock_from_ts(five_resets)}" if five_resets else ""
if five_pct is not None:
    sess_color = threshold_color(five_pct)
    sess_label = f"sess {bar(five_pct, sess_color)}{suffix}{reset_suffix}"
else:
    sess_label = f"sess{suffix}{reset_suffix}"

seven = rl.get("seven_day") or {}
seven_pct = seven.get("used_percentage")
seven_resets = seven.get("resets_at")
if seven_pct is not None:
    week_color = threshold_color(seven_pct)
    week_bar = bar(seven_pct, week_color)
    week_label = f"week {week_bar}"
    if seven_resets:
        week_label += f" resets {weekday_from_ts(seven_resets)}"
else:
    week_label = "week —"

width = term_width()
for ln in wrap_segments([f"{model}  {ctx_label}", sess_label, week_label], " │ ", width):
    print(ln)

ws = data.get("workspace") or {}
project_dir = ws.get("project_dir") or ws.get("current_dir") or data.get("cwd") or ""
state_path = os.path.join(project_dir, ".claude", "state.json") if project_dir else ""

if state_path and os.path.isfile(state_path):
    try:
        with open(state_path) as f:
            state = json.load(f)
        phase = state.get("phase") or state.get("current_phase") or state.get("name") or ""
        if phase:
            done = state.get("done")
            total = state.get("total")
            progress_pct = state.get("progress")
            if done is not None and total and total > 0:
                blue_bar = bar(round(done / total * 100), "34")
                next_str = state.get("next") or state.get("next_phase") or ""
                line2 = f"{phase} {blue_bar}"
                if next_str:
                    line2 += f" → next: {next_str}"
            elif progress_pct is not None:
                blue_bar = bar(progress_pct, "34")
                next_str = state.get("next") or state.get("next_phase") or ""
                line2 = f"{phase} {blue_bar}"
                if next_str:
                    line2 += f" → next: {next_str}"
            else:
                next_str = state.get("next") or state.get("next_phase") or ""
                line2 = phase
                if next_str:
                    line2 += f" → next: {next_str}"
            for ln in wrap_segments(line2.split(" → "), " → ", width):
                print(ln)
    except Exception:
        pass
