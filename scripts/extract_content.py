#!/usr/bin/env python3
"""Extract the fixed content graphs from the design documents into machine-readable JSON.

The design atlases (docs/design/17, 18, 19) are the authoring source for the 138
technology nodes, 64 cultural practices and 24 course templates. This script turns
their Markdown tables into content/*.json, which the Rust engine embeds at build
time. Gameplay metadata (costs, effects, facilities) lives in the engine's content
module and is keyed by these stable IDs.

Usage: python3 scripts/extract_content.py
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DESIGN = ROOT / "docs" / "design"
OUT = ROOT / "content"


def cells(line: str):
    parts = re.split(r"(?<!\\)\|", line.strip())[1:-1]
    return [p.strip().replace("\\|", "|") for p in parts]


def technologies():
    out = []
    group = None
    for line in (DESIGN / "17-technology-atlas-v0.6.md").read_text().splitlines():
        m = re.match(r"## ([A-K])\. (.*?): \d+ nodes", line)
        if m:
            group = {"key": m.group(1), "title": m.group(2)}
            continue
        if re.match(r"\| T\d{3} \|", line):
            c = cells(line)
            lm = re.match(r"\[(\w+)\] (.*)", c[1])
            out.append({
                "id": c[0],
                "name": lm.group(2),
                "label": lm.group(1).lower(),
                "group": group["key"],
                "group_title": group["title"],
                "prereq": "" if c[2] == "—" else c[2],
                "requirements": c[3],
                "capability": c[4],
            })
    return out


def practices():
    out = []
    group = None
    for line in (DESIGN / "18-cultural-atlas-v0.6.md").read_text().splitlines():
        m = re.match(r"### (.*?): C(\d{3})–C(\d{3})", line)
        if m:
            group = m.group(1)
            continue
        if re.match(r"\| C\d{3} \|", line):
            c = cells(line)
            out.append({
                "id": c[0],
                "name": c[1],
                "group": group,
                "prereq": "" if c[2] == "—" else c[2],
                "requirements": c[3],
                "behavior": c[4],
            })
    return out


def courses():
    out = []
    for line in (DESIGN / "19-education-and-transmission-v0.6.md").read_text().splitlines():
        m = re.match(r"\| (E\d{3}) (.*?) \|", line)
        if m:
            c = cells(line)
            n, h, s, months = [x.strip() for x in c[3].split(";")]
            out.append({
                "id": m.group(1),
                "name": m.group(2).strip(),
                "prerequisites": c[1],
                "instructors": c[2],
                "class_size": int(n),
                "teacher_hours": int(h.rstrip("h")),
                "student_hours": int(s.rstrip("h")),
                "months": int(months),
                "output": c[4],
            })
    return out


def check_expr(expr, ids, own):
    for ref in re.findall(r"[TC]\d{3}", expr):
        if ref not in ids:
            sys.exit(f"{own}: unknown reference {ref}")


def main():
    OUT.mkdir(exist_ok=True)
    tech, prac, crs = technologies(), practices(), courses()
    assert len(tech) == 138, len(tech)
    assert len(prac) == 64, len(prac)
    assert len(crs) == 24, len(crs)
    tids = {t["id"] for t in tech}
    pids = {p["id"] for p in prac}
    assert len(tids) == 138 and len(pids) == 64
    for t in tech:
        check_expr(t["prereq"], tids, t["id"])
    for p in prac:
        check_expr(p["prereq"], pids, p["id"])
    (OUT / "technologies.json").write_text(json.dumps(tech, indent=1, ensure_ascii=False) + "\n")
    (OUT / "practices.json").write_text(json.dumps(prac, indent=1, ensure_ascii=False) + "\n")
    (OUT / "courses.json").write_text(json.dumps(crs, indent=1, ensure_ascii=False) + "\n")
    print(f"technologies={len(tech)} practices={len(prac)} courses={len(crs)}")


if __name__ == "__main__":
    main()
