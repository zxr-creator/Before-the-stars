#!/usr/bin/env python3
"""Ruleset 3.1: merge the trivial modern and future technologies.

One-off content transformation, kept for the record (run from the repository root;
it rewrites content/technologies.json, content/pacing.json and content/families.json).

- Late filler: nodes of graph tier 5 or later whose kind is side, alt, dead or sealed.
  They carried no rule (no works, method, course, practice or order asks for them).
- Solar-System filler of group L that nothing reads.
- The seven tradition (punk) branches: eight nodes each become four or five, the
  removed ones folded into a neighbour whose name and capability now cover both.

A removed node is spliced out of the graph: whatever asked for it now asks for what
it asked for. Victory-critical nodes are never touched.
"""
import json, re, sys

ROOT = "content/"
T = json.load(open(ROOT + "technologies.json"))
P = json.load(open(ROOT + "pacing.json"))
F = json.load(open(ROOT + "families.json"))
by_id = {t["id"]: t for t in T}
critical = set(F["critical_technologies"])

# ---- what goes ---------------------------------------------------------------------
remove = set()
for t in T:
    tier = P["nodes"].get(t["id"], {}).get("tier", 0)
    if tier >= 5 and t.get("kind") in ("side", "alt", "dead", "sealed"):
        remove.add(t["id"])
remove |= {"T174", "T175", "T176", "T179", "T180", "T181", "T182"}
# a node a practice asks for stays
PRACTICES = open(ROOT + "practices.json").read()
remove = {i for i in remove if not re.search(r"\b" + i + r"\b", PRACTICES)}

# (removed, into, new name of `into`)
MERGES = [
    # Steampunk
    ("T272", "T273", "Ironclads, armoured trains and road locomotives"),
    ("T275", "T271", "Difference engines and pneumatic networks"),
    ("T277", "T276", "Supercritical steam and steam-thermal rockets"),
    # Dieselpunk
    ("T281", "T280", "Armoured vehicles and long-range heavy aircraft"),
    ("T283", "T279", "Diesel-electric drive and snorkel submarines"),
    ("T285", "T282", "Petrochemical complexes and synthetic fuel"),
    # Electropunk
    ("T293", "T287", "Electric-arc furnaces and electrochemical metals"),
    ("T289", "T291", "Superconducting grids and wireless power"),
    ("T290", "T292", "Battery-electric vehicles and maglev launch sleds"),
    # Atompunk
    ("T296", "T295", "Compact modular reactors and nuclear process heat"),
    ("T297", "T299", "Atomic transport and nuclear excavation"),
    ("T298", "T294", "Radioisotope power, medicine and mutation breeding"),
    # Cyberpunk
    ("T304", "T307", "Smart cities and augmented workplaces"),
    ("T308", "T307", "Smart cities and augmented workplaces"),
    ("T305", "T302", "Network operations centres and data havens"),
    ("T306", "T303", "Implant clinics and cyber-augmented soldiers"),
    # Biopunk
    ("T313", "T311", "Biomining and living architecture"),
    ("T315", "T314", "Metabolic and radiation-tolerance enhancement"),
    ("T317", "T316", "Bio-ISRU and engineered ecosystems"),
    # AI-punk
    ("T321", "T319", "Lights-out factories and autonomous swarms"),
    ("T323", "T322", "Self-improving design and self-replicating probes"),
    ("T325", "T324", "Synthetic scientists under verified alignment"),
]
for x, into, name in MERGES:
    remove.add(x)
    by_id[into]["name"] = name
    by_id[into]["requirements"] = by_id[into]["requirements"].rstrip(".") + "; " + by_id[x]["requirements"][0].lower() + by_id[x]["requirements"][1:]
    by_id[into]["capability"] = by_id[into]["capability"].rstrip(".") + "; " + by_id[x]["capability"][0].lower() + by_id[x]["capability"][1:]

hit = remove & critical
assert not hit, f"victory-critical nodes would be removed: {sorted(hit)}"

# ---- splice them out of the prerequisite expressions ---------------------------------
def parse(s):
    toks = re.findall(r"T\d{3}|[()&|]", s)
    pos = 0
    def expr():
        nonlocal pos
        terms = [term()]
        while pos < len(toks) and toks[pos] == "|":
            pos += 1
            terms.append(term())
        return terms[0] if len(terms) == 1 else ("or", terms)
    def term():
        nonlocal pos
        fs = [factor()]
        while pos < len(toks) and toks[pos] == "&":
            pos += 1
            fs.append(factor())
        return fs[0] if len(fs) == 1 else ("and", fs)
    def factor():
        nonlocal pos
        tk = toks[pos]
        pos += 1
        if tk == "(":
            e = expr()
            pos += 1
            return e
        return tk
    if not toks:
        return None
    return expr()

def subst(e, depth=0):
    """Replace removed ids by their own (substituted) prerequisites; None = true."""
    if e is None:
        return None
    if isinstance(e, str):
        if e in remove:
            assert depth < 40
            return subst(parse(by_id[e]["prereq"]), depth + 1)
        return e
    op, kids = e
    kids = [subst(k, depth) for k in kids]
    if op == "and":
        flat = []
        for k in kids:
            if k is None:
                continue
            if isinstance(k, tuple) and k[0] == "and":
                flat += k[1]
            else:
                flat.append(k)
        out = []
        for k in flat:
            if k not in out:
                out.append(k)
        return None if not out else out[0] if len(out) == 1 else ("and", out)
    # an alternative that needs nothing makes the whole choice need nothing
    if any(k is None for k in kids):
        return None
    flat = []
    for k in kids:
        if isinstance(k, tuple) and k[0] == "or":
            flat += k[1]
        else:
            flat.append(k)
    out = []
    for k in flat:
        if k not in out:
            out.append(k)
    return out[0] if len(out) == 1 else ("or", out)

def show(e, top=True):
    if e is None:
        return ""
    if isinstance(e, str):
        return e
    op, kids = e
    s = (" & " if op == "and" else " | ").join(show(k, False) for k in kids)
    return s if top else f"({s})"

kept = []
for t in T:
    if t["id"] in remove:
        continue
    new = show(subst(parse(t["prereq"])))
    # a node never ends up asking for itself
    assert t["id"] not in re.findall(r"T\d{3}", new), t["id"]
    t["prereq"] = new
    kept.append(t)

# ---- the tables that name nodes ------------------------------------------------------
for i in list(P["nodes"]):
    if i in remove:
        del P["nodes"][i]
fams = []
for f in F["families"]:
    f["members"] = [m for m in f["members"] if m not in remove]
    f["refuted_by"] = [m for m in f["refuted_by"] if m not in remove]
    f["critical_members"] = [m for m in f["critical_members"] if m not in remove]
    if len(f["members"]) >= 2:
        fams.append(f)
dropped = [f["id"] for f in F["families"] if f not in fams]
F["families"] = fams
live_fams = {m for f in fams for m in f["members"]}
for t in kept:
    if "family" in t and t["id"] not in live_fams:
        del t["family"]
        if t.get("kind") == "alt":
            del t["kind"]

json.dump(kept, open(ROOT + "technologies.json", "w"), indent=2, ensure_ascii=False)
open(ROOT + "technologies.json", "a").write("\n")
json.dump(P, open(ROOT + "pacing.json", "w"), indent=1, ensure_ascii=False)
open(ROOT + "pacing.json", "a").write("\n")
json.dump(F, open(ROOT + "families.json", "w"), indent=1, ensure_ascii=False)
open(ROOT + "families.json", "a").write("\n")
print(f"removed {len(remove)} of {len(T)} technologies; {len(kept)} remain; families dropped: {dropped}")
print(" ".join(sorted(remove)))
