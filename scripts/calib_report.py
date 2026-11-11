#!/usr/bin/env python3
"""Calibration report against the ruleset 3.0 targets (design chapters 36 and 39).

    python3 scripts/calib_report.py CURVE.csv [--regions 60] [--techs N] [--practices N]

For a curve written by `bts run --matches M --curve CURVE.csv` it prints:
  - population of the median seat (seats alive and governing land) by date with the
    interquartile range over seats, the target of design table 36 §3.1 and the ratio;
    the world (median over matches) against the target scaled by regions / 48;
  - era milestones of design table 36 §2.7: median seat year with the interquartile
    range over seats that reached it, the window and whether the median falls in it;
  - when the curve has the columns (slice 6r and later): completion shares at AD 2300
    of technologies understood and practices established (leading seat and median seat
    per match; design chapter 39 tables 1.3 and 2.4), and population-weighted fertility
    diagnostics of the median seat (food factor, birth intensity, land pressure).
Standard library only. Years are signed (negative = BC).
"""
import csv
import statistics
import sys
from collections import defaultdict

POP_TARGET = [(-5000, 0.24e6, 0.97e6), (-3000, 0.8e6, 3e6), (-1000, 2.5e6, 10e6), (1, 5e6, 20e6), (1000, 8e6, 32e6), (1500, 11e6, 45e6),
              (1700, 15e6, 60e6), (1800, 20e6, 85e6), (1900, 60e6, 250e6), (1950, 110e6, 450e6), (2000, 230e6, 1.0e9), (2100, 400e6, 1.7e9),
              (2200, 480e6, 2.0e9), (2300, None, 2.0e9)]
ERA = [("T007", -4800, -4000), ("T008", -4800, -4000), ("T010", -4800, -4000), ("T011", -4500, -3500), ("T015", -4500, -3500),
       ("T025", -3500, -2500), ("T022", -3300, -2300), ("T023", -1500, -600), ("T024", -1500, 300), ("T027", -1500, 300),
       ("T028", -1500, 300), ("T029", -1500, 300), ("T030", 500, 1300), ("T036", 500, 1300), ("T048", 1350, 1550),
       ("SCI", 1550, 1700), ("T080", 1750, 1850), ("T060", 1750, 1850), ("T061", 1750, 1850), ("T100", 1850, 1920),
       ("T111", 1940, 2000), ("T142", 2000, 2080), ("T147", 2060, 2140), ("T162", 2150, 2220), ("T167", 2180, 2260)]


def yr(y):
    return f"{-y} BC" if y < 0 else f"AD {y}"


def pop(p):
    if p is None:
        return "-"
    if p >= 1e9:
        return f"{p / 1e9:.2f} B"
    if p >= 1e6:
        return f"{p / 1e6:.1f} M"
    return f"{p / 1e3:.0f} k"


def q(v, f):
    v = sorted(v)
    if not v:
        return None
    k = (len(v) - 1) * f
    lo, hi = int(k), min(int(k) + 1, len(v) - 1)
    return v[lo] + (v[hi] - v[lo]) * (k - lo)


def main():
    a = sys.argv[1:]
    path = a[0]
    regions = int(a[a.index("--regions") + 1]) if "--regions" in a else 60
    ntech = int(a[a.index("--techs") + 1]) if "--techs" in a else None
    nprac = int(a[a.index("--practices") + 1]) if "--practices" in a else None
    rows = list(csv.DictReader(open(path)))
    scale = regions / 48
    by_seed = defaultdict(list)
    for r in rows:
        by_seed[r["seed"]].append(r)
    years = sorted({int(r["year"]) for r in rows})
    near = lambda want: min(years, key=lambda s: (abs(s - want), s))
    print(f"curve {path}: {len(by_seed)} matches, {len(rows)} seat-decade rows; targets scaled by {regions}/48 for the world")
    print()
    print("Population of the median seat (IQR over seats with land) and the world (median over matches)")
    print(f"{'date':>8} {'median':>9} {'IQR':>19} {'target':>8} {'ratio':>6} | {'world':>9} {'target':>9} {'ratio':>6}")
    for want, tseat, tworld in POP_TARGET:
        y = near(want)
        seats = [int(r["population"]) for r in rows if int(r["year"]) == y and int(r["regions"]) > 0]
        world = [sum(int(r["population"]) for r in rs if int(r["year"]) == y) for rs in by_seed.values()]
        m = statistics.median(seats) if seats else 0
        wm = statistics.median(world) if world else 0
        ratio = f"{m / tseat:.2f}" if tseat else "-"
        tw = tworld * scale
        print(f"{yr(want):>8} {pop(m):>9} {pop(q(seats, .25)):>9}-{pop(q(seats, .75)):<9} {pop(tseat):>8} {ratio:>6} | {pop(wm):>9} {pop(tw):>9} {wm / tw:>6.2f}")
    peak = statistics.median([max(sum(int(r["population"]) for r in rs if int(r["year"]) == y) for y in years) for rs in by_seed.values()])
    print(f"world peak (median over matches): {pop(peak)}; target {pop(1.5e9 * scale)}-{pop(3e9 * scale)}")
    print()
    print("Era milestones: first sampled decade at which a seat had it (median seat; IQR over seats that reached it)")
    print(f"{'node':>5} {'median':>9} {'IQR':>21} {'reached':>8} {'window':>19} verdict")
    for node, lo, hi in ERA:
        col = f"m_{node}"
        if col not in rows[0]:
            continue
        first = {}
        for r in rows:
            if r[col] == "1":
                k = (r["seed"], r["seat"])
                first[k] = min(first.get(k, 10**9), int(r["year"]))
        seats = len({(r["seed"], r["seat"]) for r in rows})
        v = list(first.values())
        if not v:
            print(f"{node:>5} {'-':>9}")
            continue
        # seats that never reached it count as later than any reached date
        allv = v + [10**6] * (seats - len(v))
        m = statistics.median(allv)
        verdict = "in window" if lo <= m <= hi else (f"early by {lo - m:.0f}" if m < lo else (f"late by {m - hi:.0f}" if m < 10**6 else "median seat never"))
        ms = yr(int(m)) if m < 10**6 else "never"
        print(f"{node:>5} {ms:>9} {yr(int(q(v, .25))):>10}-{yr(int(q(v, .75))):<10} {len(v):>4}/{seats:<3} {yr(lo):>9}-{yr(hi):<9} {verdict}")
    if "established" in rows[0]:
        print()
        y = near(2300)
        for col, total, name in (("understood", ntech, "technologies understood"), ("established", nprac, "practices established")):
            leads, meds, tops = [], [], []
            for rs in by_seed.values():
                v = [int(r[col]) for r in rs if int(r["year"]) == y and int(r["regions"]) > 0]
                if not v:
                    continue
                leads.append(max(v))
                meds.append(statistics.median(v))
            allmax = max(int(r[col]) for r in rows)
            if total:
                print(f"{name} at {yr(y)}: leading seat median {statistics.median(leads) / total:.0%} (range {min(leads) / total:.0%}-{max(leads) / total:.0%}); "
                      f"median seat {statistics.median(meds) / total:.0%} (range {min(meds) / total:.0%}-{max(meds) / total:.0%}); highest ever {allmax}/{total}")
            else:
                print(f"{name} at {yr(y)}: leading seat median {statistics.median(leads)}, median seat {statistics.median(meds)}, highest ever {allmax}")
        print()
        print("Fertility diagnostics of the median seat (population-weighted, last month before the sample)")
        print(f"{'date':>8} {'food':>6} {'intens':>7} {'pop/cap':>8} {'land':>6}")
        for want, _, _ in POP_TARGET:
            y = near(want)
            s = sorted([r for r in rows if int(r["year"]) == y and int(r["regions"]) > 0], key=lambda r: int(r["population"]))
            if not s:
                continue
            r = s[len(s) // 2]
            print(f"{yr(want):>8} {int(r['fert_food_bp']):>6} {int(r['fert_intensity_bp']):>7} {int(r['cap_ratio_bp']):>8} {int(r['land_bp']):>6}")


if __name__ == "__main__":
    main()
