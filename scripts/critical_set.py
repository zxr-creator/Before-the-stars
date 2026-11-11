#!/usr/bin/env python3
"""The victory-critical closure of the knowledge graphs (design chapter 39, section 0.2).

    python3 scripts/critical_set.py [--check]

Computes the minimal set of technologies and practices needed for the victory
conditions and every jump-base check: T167 and its prerequisites, the requirements of
the launch complex, orbital station and yard, high-energy laboratory, jump testbed, jump
yard and deployment base, T140-T146 and C037 for formations, choosing at every OR the
first alternative listed for technologies (the atlas lists the established route
first) and the alternative that adds the fewest nodes for practices (ties: the first
listed last; this is the unified-command route of section 3.3). Prints the sets and their
prerequisite depths; with --check, exits 1 unless they equal the committed lists in
content/families.json (`critical_technologies`, `critical_practices`). The engine's
content test asserts the same.
"""
import json
import re
import sys
from pathlib import Path

repo = Path(__file__).resolve().parent.parent
techs = {t["id"]: t["prereq"] for t in json.load(open(repo / "content/technologies.json"))}
pracs = {p["id"]: p["prereq"] for p in json.load(open(repo / "content/practices.json"))}
graph = {**techs, **pracs}

ROOT_TECH = ["T167", "T140", "T141", "T142", "T144", "T145", "T146", "T163", "T166"]
ROOT_PRAC = ["C064", "C037", "C045", "C056", "C057", "C058"]


def parse(s):
    toks = re.findall(r"[TC]\d{3}|[&|()]", s or "")
    pos = [0]

    def orx():
        a = [andx()]
        while pos[0] < len(toks) and toks[pos[0]] == "|":
            pos[0] += 1
            a.append(andx())
        return ("or", a) if len(a) > 1 else a[0]

    def andx():
        a = [atom()]
        while pos[0] < len(toks) and toks[pos[0]] == "&":
            pos[0] += 1
            a.append(atom())
        return ("and", a) if len(a) > 1 else a[0]

    def atom():
        t = toks[pos[0]]
        pos[0] += 1
        if t == "(":
            e = orx()
            pos[0] += 1
            return e
        return ("id", t)

    return orx() if toks else ("and", [])


def first_id(e):
    return e[1] if e[0] == "id" else first_id(e[1][0])


def closure(roots, choice):
    """Nodes needed for `roots` when each practice OR takes the alternative `choice`
    names (by the node that owns the OR); technology ORs take the first alternative."""
    have = set()

    def need(e, acc, owner):
        k = e[0]
        if k == "id":
            add(e[1], acc)
        elif k == "and":
            for x in e[1]:
                need(x, acc, owner)
        elif first_id(e).startswith("T"):
            need(e[1][0], acc, owner)
        else:
            need(e[1][choice.get(owner, 0)], acc, owner)

    def add(i, acc):
        if i in acc:
            return
        acc.add(i)
        need(parse(graph[i]), acc, i)

    for r in roots:
        add(r, have)
    return have


def best_closure(roots):
    """The smallest closure over every combination of practice alternatives (ties:
    the last combination enumerated, which matches design chapter 39's list)."""
    import itertools
    ors = []
    for i, src in pracs.items():
        e = parse(src)
        stack = [e]
        while stack:
            x = stack.pop()
            if x[0] == "or":
                ors.append((i, len(x[1])))
            elif x[0] == "and":
                stack.extend(x[1])
    best = None
    for combo in itertools.product(*[range(n) for _, n in ors]):
        c = {i: k for (i, _), k in zip(ors, combo)}
        s = closure(roots, c)
        if best is None or len(s) <= len(best):
            best = s
    return best


def depth(i, memo={}):
    if i not in memo:
        ids = re.findall(r"[TC]\d{3}", graph[i] or "")
        memo[i] = 1 + max((depth(x) for x in ids), default=0)
    return memo[i]


def main():
    s = best_closure(ROOT_PRAC + ROOT_TECH)
    t = sorted(x for x in s if x[0] == "T")
    p = sorted(x for x in s if x[0] == "C")
    print(f"critical technologies ({len(t)} of {len(techs)}): {' '.join(t)}")
    print(f"critical practices ({len(p)} of {len(pracs)}): {' '.join(p)}")
    print(f"prerequisite depth: T167 {depth('T167')}, C064 {depth('C064')}")
    if "--check" in sys.argv:
        fam = json.load(open(repo / "content/families.json"))
        ok = t == sorted(fam.get("critical_technologies", [])) and p == sorted(fam.get("critical_practices", []))
        print("matches content/families.json" if ok else "DIFFERS from content/families.json")
        sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
