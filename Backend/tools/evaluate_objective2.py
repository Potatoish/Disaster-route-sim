"""Objective 2 evaluation for Chapter 4.

Objective 2: apply ACO with a safety-first lexicographic evaluation that flags
routes crossing high-hazard roads and ranks routes by hazard exposure before
distance, point to point for floods and toward the best-ranked reachable
designated evacuation site for earthquakes.

Evaluation plan (the default run):
  - Flood, Pinagbuhatan and Sta. Lucia: random start/end pins.
  - Earthquake, Sta. Lucia only: random start pins. Its evacuation sites are the
    barangay's designated earthquake sites (Brgy. Sta. Lucia BDRRM, FOI
    USAP-2026-0186). Pinagbuhatan earthquake is left out until its sites are
    verified; add it back with --include-pinagbuhatan-earthquake.
    Earthquake pairs are evaluated in two views: Overall (the view the app opens
    on) and Liquefaction (the only earthquake layer that varies inside Sta. Lucia).

Every pair goes through the same simulation the web app runs. Its best route is
compared with two Dijkstra baselines on the same road graph (distance only, and
hazard-weighted on the ants' road cost), and every route the app shows is
checked against the rules the objective names:
  - flag rule:  a route is eliminated exactly when it crosses a road above the
                safe hazard threshold;
  - order rule: safe routes come before eliminated ones, safe routes in rising
                risk distance, eliminated routes in rising unsafe distance;
  - label rule: only the first route is "Best", and an eliminated route is
                "Best" only when no safe route exists;
  - repeatability: the first --repeat pairs of each group run twice and must
                give the same routes.

Flood Medium-water metres come from the route's risk and unsafe distance: a
flood road's hazard factor is 0 (Low or no flood), 0.5 (Medium) or 1 (High), so
Medium m = 2 x (risk distance - unsafe distance).

Verdicts use the app's wording: "Safe route found" (Low or no flood water only),
"Risky route" (Medium water, no High) and "No safe route" (High water).
When the app renames "Risky route", change MEDIUM_VERDICT below and re-run
--summarize; verdicts are recomputed from the metres, so no simulation re-run.

Run from the repository root:
    py Backend/tools/evaluate_objective2.py
    py Backend/tools/evaluate_objective2.py --flood-pairs 100 --earthquake-pairs 50
    py Backend/tools/evaluate_objective2.py --pairs-file <run>/objective2_pairs.json
    py Backend/tools/evaluate_objective2.py --summarize <run>/objective2_results.csv

Writes to a new folder in Backend/tools/evaluation_results/:
    objective2_pairs.json     the pins (feed back with --pairs-file)
    objective2_results.csv    one row per pair and view
    objective2_summary.csv    the Chapter 4 tables
    objective2_run_info.json  seed, settings, code version, evacuation sites used
"""

import argparse
import json
import sys
import time
from collections import Counter
from datetime import datetime
from pathlib import Path

import networkx as nx
import pandas as pd
from scipy.stats import wilcoxon

TOOLS_DIR = Path(__file__).resolve().parent
if str(TOOLS_DIR) not in sys.path:
    sys.path.insert(0, str(TOOLS_DIR))

import evaluate_routing as er  # pin sampling, graphs and baselines; adds Backend/ to sys.path
import earthquake_data
import osm_routing

DEFAULT_GROUPS = [("pinagbuhatan", "flood"), ("sta lucia", "flood"), ("sta lucia", "earthquake")]
EARTHQUAKE_VIEWS = ("overall", "liquefaction")
METHODS = (
    ("shortest", "Shortest route (distance only)"),
    ("hazard_dijkstra", "Dijkstra (hazard-weighted)"),
    ("agnas", "AGNAS (ACO)"),
)
ROUTE_FIELDS = ("destination", "distance_m", "high_m", "medium_m", "risk_distance", "max_hazard", "verdict")
COLUMNS = (
    ("pair_id", "barangay", "hazard", "view", "start_lat", "start_lng", "end_lat", "end_lng", "safe_route_exists", "low_route_exists")
    + tuple(f"{key}_{field}" for key, _ in METHODS for field in ROUTE_FIELDS)
    + (
        "agnas_found_by", "agnas_vs_hazard_dijkstra", "routes_shown", "safe_routes_shown",
        "ant_arrival_pct", "simulation_time_s", "sites_reachable",
        "flag_rule_routes_ok", "flag_rule_routes", "order_rule_ok", "label_rule_ok", "repeat_same", "error",
    )
)
TOL = 0.01  # metres; route figures are rounded to 2 decimals
SAFE_VERDICT = "Safe route found"
MEDIUM_VERDICT = "Risky route"  # the app's label; change here if the app renames it
UNSAFE_VERDICT = "No safe route"
FLOOD_VERDICTS = (SAFE_VERDICT, MEDIUM_VERDICT, UNSAFE_VERDICT)
EARTHQUAKE_VERDICTS = (SAFE_VERDICT, UNSAFE_VERDICT)


def parse_args():
    parser = argparse.ArgumentParser(description="Objective 2 evaluation: AGNAS routes vs Dijkstra, plus rule checks.")
    parser.add_argument("--flood-pairs", type=int, default=100, help="Pin pairs per barangay for flood (default 100).")
    parser.add_argument("--earthquake-pairs", type=int, default=50, help="Start pins per barangay for earthquake (default 50).")
    parser.add_argument("--include-pinagbuhatan-earthquake", action="store_true",
                        help="Also evaluate Pinagbuhatan earthquake (only once its evacuation sites are verified).")
    parser.add_argument("--repeat", type=int, default=5, help="Pairs per group run twice to check repeatability (default 5).")
    parser.add_argument("--seed", type=int, default=2026, help="Seed for the random pins (default 2026, as evaluate_routing.py).")
    parser.add_argument("--min-distance", type=float, default=300.0, help="Least distance between a flood pair's pins, m (default 300).")
    parser.add_argument("--pairs-file", type=Path, help="Re-run the pins of an earlier objective2_pairs.json.")
    parser.add_argument("--summarize", type=Path, help="Only rebuild the summary from an earlier objective2_results.csv.")
    parser.add_argument("--out", type=Path, help="Output folder (default: a new folder in tools/evaluation_results).")
    return parser.parse_args()


# ---------------------------------------------------------------------------
# Evacuation sites: which ones the run uses, and are they usable?
# ---------------------------------------------------------------------------

def check_sites(barangays):
    raw = json.loads(Path(earthquake_data._EVACUATION_SITES_FILE).read_text(encoding="utf-8-sig"))
    report = []
    for barangay in sorted(barangays):
        _, base_graph = er.earthquake_base_graph(barangay)
        raw_sites = raw.get(osm_routing.normalize_barangay_name(barangay), [])
        usable = 0
        print(f"{er.display_name(barangay)} evacuation sites in the data file:")
        for site in raw_sites:
            covered = bool(er.is_point_in_hazard_coverage(base_graph, float(site["lat"]), float(site["lng"])))
            usable += covered
            report.append({
                "barangay": er.display_name(barangay),
                "id": site.get("id"),
                "name": site.get("name"),
                "lat": site.get("lat"),
                "lng": site.get("lng"),
                "inside_hazard_data": covered,
                "source": site.get("source", ""),
            })
            print(f"  - {site.get('name')} ({site.get('lat')}, {site.get('lng')}): "
                  + ("inside the hazard data" if covered else "OUTSIDE the hazard data, so the simulation skips it"))
        if usable < 2:
            print(f"Warning: only {usable} {er.display_name(barangay)} site(s) are inside the hazard data, so "
                  "choosing among sites cannot be tested there.")
    return report


# ---------------------------------------------------------------------------
# One route, one pair
# ---------------------------------------------------------------------------

def medium_m(route):
    return max(0.0, 2 * (float(route["risk_distance"]) - float(route["unsafe_distance"])))


def verdict_from(high, medium, flood):
    if pd.isna(high):
        return ""
    if high > TOL:
        return UNSAFE_VERDICT
    if flood and not pd.isna(medium) and medium > TOL:
        return MEDIUM_VERDICT
    return SAFE_VERDICT


def verdict(route, hazard):
    return verdict_from(float(route["unsafe_distance"]), medium_m(route), hazard == "flood")


def route_columns(key, route, hazard):
    if route is None:
        return {f"{key}_{field}": "" for field in ROUTE_FIELDS}
    return {
        f"{key}_destination": route.get("destination_name", ""),
        f"{key}_distance_m": round(float(route["distance"]), 2),
        f"{key}_high_m": round(float(route["unsafe_distance"]), 2),
        f"{key}_medium_m": round(medium_m(route), 2) if hazard == "flood" else "",
        f"{key}_risk_distance": round(float(route["risk_distance"]), 2),
        f"{key}_max_hazard": route["max_hazard"],
        f"{key}_verdict": verdict(route, hazard),
    }


def rule_checks(routes):
    threshold = osm_routing.HAZARD_THRESHOLD
    flag_ok = 0
    for route in routes:
        eliminated = bool(route["eliminated"])
        if eliminated == (float(route["unsafe_distance"]) > 0) and eliminated == (int(route["max_hazard"]) > threshold):
            flag_ok += 1

    order_ok = True
    seen_eliminated = False
    last_risk = last_unsafe = float("-inf")
    for route in routes:
        if route["eliminated"]:
            seen_eliminated = True
            order_ok &= float(route["unsafe_distance"]) >= last_unsafe
            last_unsafe = float(route["unsafe_distance"])
        else:
            order_ok &= not seen_eliminated and float(route["risk_distance"]) >= last_risk
            last_risk = float(route["risk_distance"])

    any_safe = any(not route["eliminated"] for route in routes)
    label_ok = bool(routes) and routes[0].get("status") == "Best" and all(
        route.get("status") != "Best" for route in routes[1:]
    ) and not (any_safe and routes[0]["eliminated"])

    return {
        "flag_rule_routes_ok": flag_ok,
        "flag_rule_routes": len(routes),
        "order_rule_ok": "yes" if order_ok else "no",
        "label_rule_ok": "yes" if label_ok else "no",
    }


def same_routes(first, second):
    return [list(route["path"]) for route in first] == [list(route["path"]) for route in second]


def base_row(pair, view):
    end = pair.get("end") or {}
    row = {column: "" for column in COLUMNS}
    row.update({
        "pair_id": pair["id"],
        "barangay": er.display_name(pair["barangay"]),
        "hazard": pair["hazard"],
        "view": view,
        "start_lat": pair["start"]["lat"],
        "start_lng": pair["start"]["lng"],
        "end_lat": end.get("lat", ""),
        "end_lng": end.get("lng", ""),
    })
    return row


def fill_row(row, hazard, result, routes, aco_stats, baselines, safe_exists, elapsed, graph):
    row["simulation_time_s"] = round(elapsed, 2)
    row["safe_route_exists"] = "yes" if safe_exists else "no"
    for key, route in baselines.items():
        row.update(route_columns(key, route, hazard))
    if result.get("error") or not routes:
        row["error"] = result.get("message") or "The simulation returned no routes."
        return row

    best = routes[0]
    if not all(graph.has_edge(u, v) for u, v in zip(best["path"], best["path"][1:])):
        raise RuntimeError("the rebuilt road graph differs from the one the simulation used")

    stats = aco_stats or {}
    sent = stats.get("ants_sent_all_sites", stats.get("ants_sent"))
    arrived = stats.get("ants_arrived_all_sites", stats.get("ants_arrived"))
    row.update(route_columns("agnas", best, hazard))
    row.update({
        "agnas_found_by": best.get("found_by", "aco"),
        "agnas_vs_hazard_dijkstra": er.compare_with_hazard_dijkstra(best, baselines["hazard_dijkstra"]),
        "routes_shown": len(routes),
        "safe_routes_shown": sum(1 for route in routes if not route["eliminated"]),
        "ant_arrival_pct": round(100.0 * arrived / sent, 1) if sent else "",
    })
    row.update(rule_checks(routes))
    return row


def evaluate_flood(pair, repeat):
    barangay, start, end = pair["barangay"], pair["start"], pair["end"]

    def run():
        return er.simulate_osm_routes(
            "Start", start["lat"], start["lng"], "End", end["lat"], end["lng"],
            hazard_type="Flood", barangay_name=barangay,
        )

    started = time.perf_counter()
    result = run()
    elapsed = time.perf_counter() - started
    row = base_row(pair, "flood")

    graph, start_node, end_node = er.flood_routing_graph(barangay, start, end)
    if start_node is None or end_node is None:
        row["error"] = "A pin has no road to start or end on."
        return [row]
    baselines = {
        "shortest": er.length_shortest_path(graph, start_node, end_node),
        "hazard_dijkstra": er.shortest_path_baseline(graph, start_node, end_node),
    }
    safe_exists = nx.has_path(er.safe_roads(graph), start_node, end_node)
    low_roads = nx.subgraph_view(
        graph, filter_edge=lambda u, v, key: er.edge_hazard_level(graph.edges[u, v, key]) <= 1
    )
    routes = result.get("routes") or []
    fill_row(row, "flood", result, routes, result.get("aco"), baselines, safe_exists, elapsed, graph)
    row["low_route_exists"] = "yes" if nx.has_path(low_roads, start_node, end_node) else "no"
    if repeat and routes:
        row["repeat_same"] = "yes" if same_routes(routes, run().get("routes") or []) else "no"
    return [row]


def evaluate_earthquake(pair, repeat):
    barangay, start = pair["barangay"], pair["start"]

    def run():
        return er.simulate_earthquake({"lat": start["lat"], "lng": start["lng"], "label": "Start"}, barangay)

    started = time.perf_counter()
    result = run()
    elapsed = time.perf_counter() - started
    again = run() if repeat else None

    context = er.earthquake_routing_context(barangay, start)
    routing_graph, start_node, sites = context["routing_graph"], context["start_node"], context["sites"]
    rows = []
    for view in EARTHQUAKE_VIEWS:
        row = base_row(pair, view)
        if not sites:
            row["error"] = "No evacuation site can be reached by road."
            rows.append(row)
            continue
        view_graph = er._clone_graph_for_view(routing_graph, view)
        site_nodes = {site["id"]: context["site_nodes"][site["id"]] for site in sites}

        def site_route(route, site):
            return None if route is None else er._evaluate_earthquake_route(routing_graph, route, site, view)

        nearest = sites[0]  # sites come sorted by road distance
        hazard_routes = [
            site_route(er.shortest_path_baseline(view_graph, start_node, site_nodes[site["id"]]), site)
            for site in sites
        ]
        baselines = {
            "shortest": site_route(er.length_shortest_path(view_graph, start_node, site_nodes[nearest["id"]]), nearest),
            "hazard_dijkstra": min((r for r in hazard_routes if r is not None), key=er.display_sort_key, default=None),
        }
        safely_reachable = nx.descendants(er.safe_roads(view_graph), start_node)
        safe_exists = any(node in safely_reachable for node in site_nodes.values())
        view_result = (result.get("views") or {}).get(view) or {}
        routes = view_result.get("routes") or []
        fill_row(row, "earthquake", result, routes, view_result.get("aco"), baselines, safe_exists, elapsed, view_graph)
        row["sites_reachable"] = len(sites)
        if again is not None and routes:
            again_routes = ((again.get("views") or {}).get(view) or {}).get("routes") or []
            row["repeat_same"] = "yes" if same_routes(routes, again_routes) else "no"
        rows.append(row)
    return rows


def evaluate_pair(pair, repeat):
    views = ("flood",) if pair["hazard"] == "flood" else EARTHQUAKE_VIEWS
    try:
        if pair["hazard"] == "flood":
            return evaluate_flood(pair, repeat)
        return evaluate_earthquake(pair, repeat)
    except Exception as exc:
        rows = []
        for view in views:
            row = base_row(pair, view)
            row["error"] = f"Evaluation failed: {exc}"
            rows.append(row)
        return rows


# ---------------------------------------------------------------------------
# Summary: the Chapter 4 tables
# ---------------------------------------------------------------------------

def share(part, whole):
    return f"{part}/{whole} ({100 * part / whole:.1f}%)" if whole else "-"


def pct_change(before, after):
    return f"{100 * (after - before) / before:+.1f}%" if before else "-"


def better_same_worse(before, after):
    diff = before - after  # positive = AGNAS lower
    return f"better {(diff > TOL).sum()} / same {(diff.abs() <= TOL).sum()} / worse {(diff < -TOL).sum()}"


def wilcoxon_text(before, after):
    diff = before - after
    differing = int((diff.abs() > TOL).sum())
    if differing < 6:
        return f"not tested: only {differing} pairs differ (needs at least 6)"
    result = wilcoxon(diff, zero_method="wilcox", alternative="greater")
    return f"W = {result.statistic:.1f}, p = {result.pvalue:.4f} (n = {differing} differing pairs)"


def group_name(barangay, hazard, view):
    return f"{barangay} / Flood" if hazard == "flood" else f"{barangay} / Earthquake ({view.title()})"


def summarize(df):
    lines = []

    def add(section, group, metric, value):
        lines.append({"Section": section, "Group": group, "Metric": metric, "Value": value})

    df = df.copy()
    failed = df["error"].fillna("").astype(str).str.strip() != ""
    df["group"] = [group_name(b, h, v) for b, h, v in zip(df["barangay"], df["hazard"], df["view"])]
    for group, part in df.groupby("group", sort=False):
        add("0. Pairs", group, "Evaluated", len(part))
        add("0. Pairs", group, "Failed", int(failed[part.index].sum()))
    done = df[~failed]
    numeric = [c for c in done.columns if c.endswith(("_distance_m", "_high_m", "_medium_m", "_risk_distance"))]
    done = done.assign(**{c: pd.to_numeric(done[c], errors="coerce") for c in numeric})
    # Recompute verdicts from the metres, so a results file written with older
    # wording is summarized with the current labels.
    is_flood = done["hazard"] == "flood"
    for key, _ in METHODS:
        done[f"{key}_verdict"] = [
            verdict_from(high, medium, flood)
            for high, medium, flood in zip(done[f"{key}_high_m"], done[f"{key}_medium_m"], is_flood)
        ]

    groups = list(done.groupby("group", sort=False))
    all_flood = done[done["hazard"] == "flood"]
    if all_flood["barangay"].nunique() > 1:
        # Both barangays together: the figures for the abstract (pairs are tested
        # together, never by averaging the two groups' p-values).
        groups.append(("All flood pairs", all_flood))

    for group, part in groups:
        flood = part["hazard"].iloc[0] == "flood"
        n = len(part)
        verdicts = FLOOD_VERDICTS if flood else EARTHQUAKE_VERDICTS

        sec = "1. Verdicts"
        exists = part["safe_route_exists"] == "yes"
        add(sec, group, "A route avoiding high-hazard roads exists", share(int(exists.sum()), n))
        add(sec, group, "  AGNAS found one when it exists",
            share(int((part.loc[exists, "agnas_high_m"] <= TOL).sum()), int(exists.sum())))
        if flood:
            low = part["low_route_exists"] == "yes"
            add(sec, group, "An all-Low (or no flood) route exists", share(int(low.sum()), n))
            add(sec, group, "  AGNAS found one when it exists",
                share(int((part.loc[low, "agnas_verdict"] == SAFE_VERDICT).sum()), int(low.sum())))
        for key, label in METHODS:
            counts = part[f"{key}_verdict"].value_counts()
            add(sec, group, label, "; ".join(f"{v}: {share(int(counts.get(v, 0)), n)}" for v in verdicts))

        sec = "2. Exposure, all pairs (means)"
        measures = [("High-hazard distance (m)", "high_m")]
        measures += [("Medium water (m)", "medium_m")] if flood else [("Risk distance", "risk_distance")]
        measures += [("Route length (m)", "distance_m")]
        for name, col in measures:
            before, after = part[f"shortest_{col}"].mean(), part[f"agnas_{col}"].mean()
            add(sec, group, name, f"shortest {before:.1f} -> AGNAS {after:.1f} ({pct_change(before, after)})")

        sec = "3. Pairs where the shortest route crosses " + ("Medium or High water" if flood else "high-hazard roads")
        hit = part[(part["shortest_high_m"] > TOL) | ((part["shortest_medium_m"] > TOL) if flood else False)]
        add(sec, group, "Pairs", share(len(hit), n))
        if not hit.empty:
            for name, col in measures[:-1]:
                before, after = hit[f"shortest_{col}"], hit[f"agnas_{col}"]
                add(sec, group, f"{name}, mean",
                    f"shortest {before.mean():.1f} -> AGNAS {after.mean():.1f} ({pct_change(before.mean(), after.mean())})")
                add(sec, group, f"{name}, median", f"shortest {before.median():.1f} -> AGNAS {after.median():.1f}")
            add(sec, group, "AGNAS vs shortest, high-hazard distance", better_same_worse(hit["shortest_high_m"], hit["agnas_high_m"]))
            add(sec, group, "AGNAS vs shortest, risk distance", better_same_worse(hit["shortest_risk_distance"], hit["agnas_risk_distance"]))
            extra = 100 * (hit["agnas_distance_m"] - hit["shortest_distance_m"]) / hit["shortest_distance_m"]
            add(sec, group, "AGNAS extra length, mean", f"{extra.mean():+.1f}%")
            add(sec, group, "Wilcoxon signed-rank, high-hazard distance (AGNAS lower)",
                wilcoxon_text(hit["shortest_high_m"], hit["agnas_high_m"]))
            add(sec, group, "Wilcoxon signed-rank, risk distance (AGNAS lower)",
                wilcoxon_text(hit["shortest_risk_distance"], hit["agnas_risk_distance"]))

        sec = "4. Safety-first rules"
        flag_ok = pd.to_numeric(part["flag_rule_routes_ok"], errors="coerce").sum()
        flag_all = pd.to_numeric(part["flag_rule_routes"], errors="coerce").sum()
        add(sec, group, "Flag rule (eliminated exactly when a road is above the threshold)", share(int(flag_ok), int(flag_all)) + " routes")
        add(sec, group, "Order rule (safe first; safe by risk; eliminated by unsafe distance)",
            share(int((part["order_rule_ok"] == "yes").sum()), n) + " runs")
        add(sec, group, "Label rule (one Best; eliminated Best only when nothing is safe)",
            share(int((part["label_rule_ok"] == "yes").sum()), n) + " runs")
        repeated = part[part["repeat_same"].isin(["yes", "no"])]
        add(sec, group, "Same pins run twice give the same routes",
            share(int((repeated["repeat_same"] == "yes").sum()), len(repeated)))

        sec = "5. ACO search"
        found = part["agnas_found_by"].value_counts()
        add(sec, group, "Top route found by the ants", share(int(found.get("aco", 0)), n))
        add(sec, group, "Top route from the Dijkstra fallback", share(int(found.get("shortest_path", 0)), n))
        add(sec, group, "Top route from the backup search", share(int(found.get("backup_search", 0)), n))
        outcomes = part["agnas_vs_hazard_dijkstra"].value_counts()
        add(sec, group, "vs hazard-weighted Dijkstra (same / equally safe / ACO safer / Dijkstra safer)",
            " / ".join(str(int(outcomes.get(o, 0))) for o in er.OUTCOMES))
        add(sec, group, "Ants that reached the goal, mean",
            f"{pd.to_numeric(part['ant_arrival_pct'], errors='coerce').mean():.1f}%")
        times = pd.to_numeric(part["simulation_time_s"], errors="coerce")
        add(sec, group, "Simulation time, mean / longest", f"{times.mean():.2f} s / {times.max():.2f} s")

        if not flood:
            sec = "6. Earthquake evacuation site choice"
            nearest = part["agnas_destination"] == part["shortest_destination"]
            add(sec, group, "Evacuation sites reachable by road, mean",
                f"{pd.to_numeric(part['sites_reachable'], errors='coerce').mean():.1f}")
            add(sec, group, "AGNAS chose the nearest site by road", share(int(nearest.sum()), n))
            other = part[~nearest]
            if not other.empty:
                extra = (other["agnas_distance_m"] - other["shortest_distance_m"]).mean()
                add(sec, group, "When it chose another site: extra length, mean", f"{extra:+.1f} m")
                safer = (other["agnas_high_m"] < other["shortest_high_m"] - TOL).sum()
                add(sec, group, "When it chose another site: less high-hazard distance", share(int(safer), len(other)))

    return pd.DataFrame(lines).sort_values(["Section"], kind="stable")


def read_results(path):
    return pd.read_csv(path, encoding="utf-8-sig", dtype=str, keep_default_na=False)


def print_summary(summary):
    for section, part in summary.groupby("Section", sort=True):
        print(f"\n{section}")
        for _, row in part.iterrows():
            print(f"  [{row['Group']}] {row['Metric']}: {row['Value']}")


# ---------------------------------------------------------------------------
# Run
# ---------------------------------------------------------------------------

def sample(groups, args):
    pairs = []
    for barangay, hazard in groups:
        count = args.flood_pairs if hazard == "flood" else args.earthquake_pairs
        pairs += er.sample_pairs([barangay], [hazard], count, args.seed, args.min_distance)
    return pairs


def main():
    args = parse_args()

    if args.summarize:
        summary = summarize(read_results(args.summarize))
        out = args.summarize.with_name("objective2_summary.csv")
        summary.to_csv(out, index=False, encoding="utf-8-sig")
        print_summary(summary)
        print(f"\nSummary written to {out}")
        return

    osm_routing.DEBUG = False
    groups = list(DEFAULT_GROUPS)
    if args.include_pinagbuhatan_earthquake:
        groups.append(("pinagbuhatan", "earthquake"))

    if args.pairs_file:
        pairs = json.loads(args.pairs_file.read_text(encoding="utf-8"))
        print(f"Re-running {len(pairs)} pairs from {args.pairs_file}")
        groups = sorted({(pair["barangay"], pair["hazard"]) for pair in pairs})
    else:
        print(f"Picking random pins (seed {args.seed}) for: "
              + ", ".join(f"{er.display_name(b)} {h}" for b, h in groups))
        pairs = sample(groups, args)

    earthquake_barangays = {b for b, h in groups if h == "earthquake"}
    sites = check_sites(earthquake_barangays) if earthquake_barangays else []

    out_dir = args.out or er.DEFAULT_OUT_ROOT / f"objective2-{datetime.now():%Y%m%d-%H%M%S}"
    seen = Counter()
    rows = []
    started = time.perf_counter()
    for index, pair in enumerate(pairs, start=1):
        seen[(pair["barangay"], pair["hazard"])] += 1
        repeat = seen[(pair["barangay"], pair["hazard"])] <= args.repeat
        pair_rows = evaluate_pair(pair, repeat)
        rows += pair_rows
        first = pair_rows[0]
        status = f"error: {first['error']}" if first["error"] else f"{first['agnas_verdict']}, {first['agnas_distance_m']} m"
        left = (time.perf_counter() - started) / index * (len(pairs) - index)
        print(f"[{index}/{len(pairs)}] {pair['id']}: {status} (about {left / 60:.0f} min left)")

    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "objective2_pairs.json").write_text(json.dumps(pairs, indent=2), encoding="utf-8")
    results_path = out_dir / "objective2_results.csv"
    pd.DataFrame(rows, columns=list(COLUMNS)).to_csv(results_path, index=False, encoding="utf-8-sig")
    summary = summarize(read_results(results_path))
    summary.to_csv(out_dir / "objective2_summary.csv", index=False, encoding="utf-8-sig")
    run_info = {
        "date": datetime.now().isoformat(timespec="seconds"),
        "git_commit": er.git_commit(),
        "seed": None if args.pairs_file else args.seed,
        "pairs_file": str(args.pairs_file) if args.pairs_file else None,
        "groups": [f"{er.display_name(b)} / {h}" for b, h in groups],
        "flood_pairs_per_barangay": args.flood_pairs,
        "earthquake_pairs_per_barangay": args.earthquake_pairs,
        "earthquake_views": list(EARTHQUAKE_VIEWS),
        "repeat_pairs_per_group": args.repeat,
        "min_flood_pin_distance_m": args.min_distance,
        "evacuation_sites": sites,
        "settings": {
            name: getattr(osm_routing, name)
            for name in (
                "HAZARD_THRESHOLD", "NUM_ANTS", "NUM_ITERATIONS", "ACO_MIN_ITERATIONS",
                "ACO_STAGNATION_LIMIT", "ALPHA", "BETA", "EVAPORATION", "Q",
                "ALTERNATIVE_COLONY_ANTS", "ALTERNATIVE_COLONY_ITERATIONS",
                "ALTERNATIVE_ROUTE_EDGE_PENALTY", "SAFETY_WEIGHT", "DISTANCE_WEIGHT",
            )
            if hasattr(osm_routing, name)
        },
    }
    (out_dir / "objective2_run_info.json").write_text(json.dumps(run_info, indent=2, default=str), encoding="utf-8")
    print_summary(summary)
    print(f"\nTotal time: {(time.perf_counter() - started) / 60:.1f} min")
    print(f"Results written to {out_dir}")


if __name__ == "__main__":
    main()
