#!/usr/bin/env python3
"""Summarize calibration curves written by `bts run --curve` (design chapter 36, slice 0).

    python3 scripts/curve_summary.py CURVE.csv [--years -5000,-3000,...]

Prints, for the sampled years nearest each requested year:
  - population: median seat (seats alive and governing land), median of the largest
    seat per match, median world total per match;
  - regions held by the median seat;
  - era milestones (design table 2.7): median year over all seats that reached it,
    the share of seats that did, and the median over matches of the leader's year;
  - the highest seat-decade growth rate and the pre-1700 500-year growth band.
Years are historical and signed (negative = BC, no year zero). Standard library only.
"""
import csv
import statistics
import sys
from collections import defaultdict


def fmt_year(y):
    return f"{-y} BC" if y < 0 else f"AD {y}"


def fmt_pop(p):
    if p >= 1e9:
        return f"{p / 1e9:.2f} B"
    if p >= 1e6:
        return f"{p / 1e6:.2f} M"
    return f"{p / 1e3:.0f} k"


def median(v):
    return statistics.median(v) if v else None


def main():
    args = sys.argv[1:]
    path = args[0]
    years = None
    if "--years" in args:
        years = [int(x) for x in args[args.index("--years") + 1].split(",")]
    rows = list(csv.DictReader(open(path)))
    by_match = defaultdict(list)
    for r in rows:
        by_match[r["seed"]].append(r)
    sampled = sorted({int(r["year"]) for r in rows})
    if years is None:
        step = max(1, len(sampled) // 16)
        years = sampled[::step]
    print(f"curve: {path}; {len(by_match)} matches, {len(rows)} seat-decade rows")
    print()
    print("Population (median seat excludes seats without land; largest and world are medians over matches)")
    print(f"{'date':>10} {'median seat':>12} {'largest':>10} {'world':>10} {'regions (median)':>17}")
    for want in years:
        y = min(sampled, key=lambda s: (abs(s - want), s))
        seats, largest, world, regions = [], [], [], []
        for seed, rs in by_match.items():
            at = [r for r in rs if int(r["year"]) == y]
            if not at:
                continue
            alive = [r for r in at if int(r["regions"]) > 0]
            seats += [int(r["population"]) for r in alive]
            regions += [int(r["regions"]) for r in alive]
            largest.append(max(int(r["population"]) for r in at))
            world.append(sum(int(r["population"]) for r in at))
        if not world:
            continue
        print(f"{fmt_year(y):>10} {fmt_pop(median(seats)):>12} {fmt_pop(median(largest)):>10} {fmt_pop(median(world)):>10} {median(regions):>17}")
    print()
    milestones = [k[2:] for k in rows[0].keys() if k.startswith("m_")]
    print("Era milestones: first sampled decade at which a seat had it")
    print(f"{'node':>6} {'median seat':>12} {'reached':>8} {'leader (median)':>16} {'leader (earliest)':>18}")
    for m in milestones + ["ALL138"]:
        firsts, leaders = [], []
        total = 0
        for seed, rs in by_match.items():
            per_seat = defaultdict(list)
            for r in rs:
                per_seat[r["seat"]].append(r)
            best = None
            for seat, srs in per_seat.items():
                total += 1
                srs.sort(key=lambda r: int(r["month"]))
                hit = None
                for r in srs:
                    ok = int(r["understood"]) >= 138 if m == "ALL138" else r["m_" + m] == "1"
                    if ok:
                        hit = int(r["year"])
                        break
                if hit is not None:
                    firsts.append(hit)
                    best = hit if best is None else min(best, hit)
            if best is not None:
                leaders.append(best)
        med = median(firsts)
        lead = median(leaders)
        print(f"{m:>6} {fmt_year(int(med)) if med is not None else '-':>12} {len(firsts):>4}/{total:<3} {fmt_year(int(lead)) if lead is not None else '-':>16} {fmt_year(min(leaders)) if leaders else '-':>18}")
    print()
    worst = (0.0, None)
    band = []
    for seed, rs in by_match.items():
        per_seat = defaultdict(list)
        for r in rs:
            per_seat[r["seat"]].append(r)
        for seat, srs in per_seat.items():
            srs.sort(key=lambda r: int(r["month"]))
            for a, b in zip(srs, srs[1:]):
                pa, pb = int(a["population"]), int(b["population"])
                yrs = (int(b["month"]) - int(a["month"])) / 12
                if pa > 50_000 and pb > 0 and yrs > 0 and int(a["regions"]) > 0 and int(b["regions"]) > 0:
                    g = (pb / pa) ** (1 / yrs) - 1
                    if g > worst[0]:
                        worst = (g, (seed, seat, a["year"], b["year"]))
            # 500-year growth windows before AD 1700
            pts = [(int(r["year"]), int(r["population"])) for r in srs if int(r["year"]) <= 1700 and int(r["regions"]) > 0]
            for i, (ya, pa) in enumerate(pts):
                for yb, pb in pts[i:]:
                    if yb - ya >= 500:
                        if pa > 0 and pb > 0:
                            band.append((pb / pa) ** (1 / (yb - ya)) - 1)
                        break
    print(f"highest seat-decade growth: {worst[0] * 100:.2f}%/yr at {worst[1]}")
    if band:
        band.sort()
        print(f"pre-1700 500-year seat growth: min {band[0] * 100:.3f}%/yr, median {median(band) * 100:.3f}%/yr, max {band[-1] * 100:.3f}%/yr ({len(band)} windows)")


if __name__ == "__main__":
    main()
