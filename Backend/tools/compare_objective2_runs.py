"""Checks that a re-run of evaluate_objective2.py gives the same routes as an earlier run.

Run from the Backend folder, after re-running the OLD pins at the new commit:
    python tools/evaluate_objective2.py --pairs-file OLD_RUN/objective2_pairs.json --out tools/evaluation_results/regression
    python tools/compare_objective2_runs.py OLD_RUN/objective2_results.csv tools/evaluation_results/regression/objective2_results.csv

It first checks that both runs used the same pins (pairs with different pins are
skipped and reported). It then compares every pin pair (and earthquake view) on the route figures only:
destination, distance, high-hazard metres, risk distance, highest hazard,
which method found Route 1, and the two Dijkstra baselines. Verdict labels and
timings are ignored (labels were renamed; timings always vary).
Exit code 0 = identical, 1 = differences found.
"""
import csv
import sys
from collections import defaultdict

FIELDS = [
    "agnas_destination", "agnas_distance_m", "agnas_high_m", "agnas_medium_m", "agnas_risk_distance",
    "agnas_max_hazard", "agnas_found_by", "routes_shown", "safe_routes_shown",
    "shortest_destination", "shortest_distance_m", "shortest_high_m",
    "hazard_dijkstra_destination", "hazard_dijkstra_distance_m", "hazard_dijkstra_high_m",
    "error",
]
TOL = 0.01  # metres; figures are rounded to 2 decimals


def load(path):
    with open(path, newline="", encoding="utf-8-sig") as handle:
        return {(row["pair_id"], row["view"]): row for row in csv.DictReader(handle)}


def same(a, b):
    a, b = (a or "").strip(), (b or "").strip()
    if a == b:
        return True
    try:
        return abs(float(a) - float(b)) <= TOL
    except ValueError:
        return False


def same_pin(a, b):
    a, b = (a or "").strip(), (b or "").strip()
    if a == b:
        return True
    try:
        return abs(float(a) - float(b)) <= 1e-6  # degrees
    except ValueError:
        return False


def main(old_path, new_path):
    old, new = load(old_path), load(new_path)
    groups = defaultdict(lambda: {"compared": 0, "identical": 0})
    differences = []
    pin_mismatch = []
    for key in sorted(old.keys() & new.keys()):
        o, n = old[key], new[key]
        if not all(same_pin(o.get(f, ""), n.get(f, "")) for f in ("start_lat", "start_lng", "end_lat", "end_lng")):
            pin_mismatch.append(key)
            continue
        group = (o["barangay"], o["hazard"], o["view"])
        groups[group]["compared"] += 1
        changed = [(f, o.get(f, ""), n.get(f, "")) for f in FIELDS if f in o and f in n and not same(o[f], n[f])]
        if changed:
            differences.append((key, changed))
        else:
            groups[group]["identical"] += 1

    print(f"Old run: {old_path}\nNew run: {new_path}\n")
    print(f"{'Group':45s} {'compared':>9s} {'identical':>10s}")
    for group, c in sorted(groups.items()):
        print(f"{' / '.join(group):45s} {c['compared']:9d} {c['identical']:10d}")
    only_old, only_new = sorted(old.keys() - new.keys()), sorted(new.keys() - old.keys())
    if only_old:
        print(f"\nIn the old run only ({len(only_old)}): {', '.join(k[0] + '/' + k[1] for k in only_old[:10])}")
    if only_new:
        print(f"In the new run only ({len(only_new)}; groups the earlier run did not include): "
              f"{', '.join(k[0] + '/' + k[1] for k in only_new[:10])}")
    if pin_mismatch:
        print(f"\n{len(pin_mismatch)} pair(s) have DIFFERENT PINS in the two runs, so they were not compared "
              f"(e.g. {pin_mismatch[0][0]}). Re-run the new code with --pairs-file pointing to the old "
              "objective2_pairs.json so both runs use the same pins.")
    if differences:
        print(f"\n{len(differences)} pair(s) differ. First 15:")
        for (pair, view), changed in differences[:15]:
            print(f"  {pair} [{view}]: " + "; ".join(f"{f}: {a} -> {b}" for f, a, b in changed))
        return 1
    if pin_mismatch:
        return 1
    print("\nAll compared pairs give identical routes.")
    return 0


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    sys.exit(main(sys.argv[1], sys.argv[2]))
