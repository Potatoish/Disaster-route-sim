"""Evaluates the route search on random pins, for the paper's results.

Each pin pair goes through the real simulation (the function the web app
calls), and its best route is compared with two Dijkstra baselines on the
same road graph:

- distance only: the shortest walk, hazards ignored (what an ordinary map
  app gives);
- hazard-weighted: Dijkstra on the same route_cost the ants weigh roads by.

Each pair also records whether any safe route exists at all (every road at
or below HAZARD_THRESHOLD), so "no safe route found" can be told apart from
"no safe route possible".

Risk distance is the route's metres weighted by hazard: a level-1 road counts
0, level 3 half, level 5 in full (the earthquake Overall view adds both
layers' weights, so it is not comparable with flood figures).

Earthquake pairs have only a start pin and end at an evacuation site: the
distance-only baseline walks to the nearest site by road, the hazard-weighted
one to whichever site its route ranks best (the rule the ants' routes are
ranked by). Only the Overall view, the one the app opens on, is evaluated,
but the simulation time covers the whole request as the app runs it (for an
earthquake, all three views).

Pins are random points along public roads inside the hazard coverage area,
roads picked in proportion to their length. The same --seed gives the same
pins and, the colony being seeded from the pins, the same results.

Writes to the output folder: pairs.json (feed it back with --pairs-file to
re-run the same pins), results.csv (one row per pair), summary.csv and
run_info.json (seed and ACO settings used).
"""

import argparse
import csv
import itertools
import json
import random
import statistics
import subprocess
import sys
import time
from collections import Counter
from datetime import datetime
from pathlib import Path


BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

import networkx as nx

import osm_routing
from earthquake_data import get_earthquake_dataset
from earthquake_service import (
    _add_earthquake_road_access_nodes,
    _annotate_graph_with_earthquake_hazards,
    _clone_graph_for_view,
    _collect_road_reachable_evacuation_sites,
    _evaluate_earthquake_route,
    _get_earthquake_graph,
    simulate_earthquake,
)
from osm_routing import (
    HAZARD_THRESHOLD,
    add_road_access_nodes,
    annotate_flood_edge,
    check_route_pin,
    coordinate_distance_meters,
    display_sort_key,
    edge_hazard_level,
    evaluate_route,
    get_barangay_boundary,
    get_edge_geometry,
    is_point_in_hazard_coverage,
    is_private_edge,
    normalize_barangay_name,
    prepare_routing_graph,
    shortest_path_baseline,
    simplify_route_path,
    simulate_osm_routes,
)


BARANGAYS = ("pinagbuhatan", "sta lucia")
HAZARDS = ("flood", "earthquake")
EARTHQUAKE_VIEW = "overall"
DEFAULT_OUT_ROOT = Path(__file__).resolve().parent / "evaluation_results"
MAX_PIN_ATTEMPTS = 500

METHODS = (
    ("length_dijkstra", "Dijkstra (distance only)"),
    ("hazard_dijkstra", "Dijkstra (hazard-weighted)"),
    ("aco", "AGNAS (ACO)"),
)
ROUTE_FIELDS = ("destination", "distance_m", "unsafe_distance_m", "risk_distance", "max_hazard", "safe")
ACO_FIELDS = (
    "aco_vs_hazard_dijkstra",
    "aco_found_by",
    "aco_routes_shown",
    "aco_safe_routes_shown",
    "aco_distinct_routes_found",
    "aco_rounds",
    "aco_ant_arrival_pct",
    "simulation_time_s",
)
CSV_FIELDS = (
    ("pair_id", "barangay", "hazard", "start_lat", "start_lng", "end_lat", "end_lng", "safe_route_exists")
    + tuple(f"{key}_{field}" for key, _ in METHODS for field in ROUTE_FIELDS)
    + ACO_FIELDS
    + ("error",)
)
# The ACO-vs-hazard-weighted-Dijkstra outcomes, in the order they are reported.
OUTCOMES = ("same route", "equally safe", "ACO safer", "Dijkstra safer")


def parse_args():
    parser = argparse.ArgumentParser(
        description="Compare AGNAS's ACO routes with Dijkstra baselines on random pins."
    )
    parser.add_argument("--pairs", type=int, default=25, help="Pin pairs per barangay and hazard (default 25).")
    parser.add_argument(
        "--barangay",
        action="append",
        help="Barangay to test (repeatable): pinagbuhatan or \"sta lucia\". Default: both.",
    )
    parser.add_argument(
        "--hazard",
        action="append",
        choices=HAZARDS,
        help="Hazard to test (repeatable). Default: both.",
    )
    parser.add_argument("--seed", type=int, default=2026, help="Seed for the random pins (default 2026).")
    parser.add_argument(
        "--min-distance",
        type=float,
        default=300.0,
        help="Least straight-line distance between a flood pair's pins, in metres (default 300).",
    )
    parser.add_argument("--pairs-file", type=Path, help="Re-run the pins of an earlier run's pairs.json.")
    parser.add_argument("--out", type=Path, help="Output folder (default: a new folder in tools/evaluation_results).")
    return parser.parse_args()


def display_name(barangay):
    return get_barangay_boundary(barangay)["display_name"]


def group_label(barangay, hazard):
    return f"{display_name(barangay)} / {hazard.title()}"


# ---------------------------------------------------------------------------
# Road graphs, rebuilt the way each simulation builds them
# ---------------------------------------------------------------------------

def flood_routing_graph(barangay, start, end):
    """The graph simulate_osm_routes routes these pins on, and their nodes."""
    G, (start_node, end_node) = add_road_access_nodes(
        prepare_routing_graph(barangay),
        [(start["lat"], start["lng"]), (end["lat"], end["lng"])],
        annotate_flood_edge,
    )
    return G, start_node, end_node


def earthquake_base_graph(barangay):
    dataset = get_earthquake_dataset(barangay)
    return dataset, _annotate_graph_with_earthquake_hazards(_get_earthquake_graph(dataset), dataset)


def earthquake_routing_context(barangay, start):
    """What simulate_earthquake routes on for this start pin: the graph with
    the pin and every covered evacuation site joined to the road, the
    Overall view of it, and the sites reachable by road, nearest first."""
    dataset, base_graph = earthquake_base_graph(barangay)
    covered_sites = [
        site for site in dataset["evacuation_sites"]
        if is_point_in_hazard_coverage(base_graph, site["lat"], site["lng"])
    ]
    routing_graph, access_nodes = _add_earthquake_road_access_nodes(
        base_graph,
        [(start["lat"], start["lng"])] + [(site["lat"], site["lng"]) for site in covered_sites],
        dataset,
    )
    start_node = access_nodes[0]
    site_nodes = {site["id"]: node for site, node in zip(covered_sites, access_nodes[1:])}
    sites = (
        _collect_road_reachable_evacuation_sites(routing_graph, start_node, covered_sites, site_nodes)
        if start_node is not None
        else []
    )
    return {
        "routing_graph": routing_graph,
        "view_graph": _clone_graph_for_view(routing_graph, EARTHQUAKE_VIEW),
        "start_node": start_node,
        "site_nodes": site_nodes,
        "sites": sites,
    }


def safe_roads(G):
    return nx.subgraph_view(
        G,
        filter_edge=lambda u, v, key: edge_hazard_level(G.edges[u, v, key]) <= HAZARD_THRESHOLD,
    )


# ---------------------------------------------------------------------------
# Random pins
# ---------------------------------------------------------------------------

def road_point_sampler(G, rng):
    """Random points along G's public roads, each road picked in proportion
    to its length, so every metre of street is equally likely."""
    edges = [(u, v, data) for u, v, data in G.edges(data=True) if not is_private_edge(data)]
    cumulative = list(itertools.accumulate(max(float(data.get("length", 0)), 1.0) for _, _, data in edges))

    def sample():
        u, v, data = rng.choices(edges, cum_weights=cumulative)[0]
        point = get_edge_geometry(G, u, v, data).interpolate(rng.random(), normalized=True)
        return {"lat": round(point.y, 6), "lng": round(point.x, 6)}

    return sample


def sample_flood_pairs(barangay, count, rng, min_distance):
    G = prepare_routing_graph(barangay)
    sample = road_point_sampler(G, rng)
    pairs = []
    for _ in range(MAX_PIN_ATTEMPTS * count):
        if len(pairs) == count:
            break
        start, end = sample(), sample()
        if coordinate_distance_meters(start["lat"], start["lng"], end["lat"], end["lng"]) < min_distance:
            continue
        if not all(check_route_pin(G, pin["lat"], pin["lng"], "flood data")["valid"] for pin in (start, end)):
            continue
        # Pins the road network doesn't connect would test coverage, not the search.
        routing_graph, start_node, end_node = flood_routing_graph(barangay, start, end)
        if start_node is None or end_node is None or start_node == end_node:
            continue
        if not nx.has_path(routing_graph, start_node, end_node):
            continue
        pairs.append({"start": start, "end": end})
    return pairs


def sample_earthquake_starts(barangay, count, rng):
    _, base_graph = earthquake_base_graph(barangay)
    sample = road_point_sampler(base_graph, rng)
    pairs = []
    for _ in range(MAX_PIN_ATTEMPTS * count):
        if len(pairs) == count:
            break
        start = sample()
        if not check_route_pin(base_graph, start["lat"], start["lng"], "earthquake data")["valid"]:
            continue
        if not earthquake_routing_context(barangay, start)["sites"]:
            continue
        pairs.append({"start": start})
    return pairs


def sample_pairs(barangays, hazards, count, seed, min_distance):
    pairs = []
    for barangay in barangays:
        for hazard in hazards:
            # One stream per group: testing one group alone gives it the same
            # pins as a full run.
            rng = random.Random(f"{seed}|{barangay}|{hazard}")
            if hazard == "flood":
                group = sample_flood_pairs(barangay, count, rng, min_distance)
            else:
                group = sample_earthquake_starts(barangay, count, rng)
            if len(group) < count:
                print(f"Warning: only {len(group)} usable pins found for {group_label(barangay, hazard)}.")
            for index, pins in enumerate(group, start=1):
                pairs.append({
                    "id": f"{barangay.replace(' ', '-')}-{hazard}-{index:02d}",
                    "barangay": barangay,
                    "hazard": hazard,
                    **pins,
                })
    return pairs


# ---------------------------------------------------------------------------
# Evaluating one pair
# ---------------------------------------------------------------------------

def length_shortest_path(G, start_node, end_node):
    try:
        path = nx.shortest_path(G, start_node, end_node, weight="length")
    except (nx.NetworkXNoPath, nx.NodeNotFound):
        return None
    path = simplify_route_path(path)
    return evaluate_route(G, path, 0) if len(path) >= 2 else None


def safety_rank(route):
    """The safety part of the ranking (display_sort_key without pheromone and
    distance): any unsafe road, unsafe distance, risk distance."""
    return route["unsafe_distance"] > 0, route["unsafe_distance"], route["risk_distance"]


def compare_with_hazard_dijkstra(aco, dijkstra):
    if aco is None or dijkstra is None:
        return ""
    if list(aco["path"]) == list(dijkstra["path"]):
        return "same route"
    if safety_rank(aco) < safety_rank(dijkstra):
        return "ACO safer"
    if safety_rank(aco) == safety_rank(dijkstra):
        return "equally safe"
    return "Dijkstra safer"


def record_simulation(row, result, routes, aco_stats, elapsed, graph):
    row["simulation_time_s"] = round(elapsed, 2)
    if result.get("error") or not routes:
        row["error"] = result.get("message") or "The simulation returned no routes."
        return row

    best = routes[0]
    if not all(graph.has_edge(u, v) for u, v in zip(best["path"], best["path"][1:])):
        raise RuntimeError("the rebuilt road graph differs from the one the simulation used")

    stats = aco_stats or {}
    ants_sent = stats.get("ants_sent_all_sites", stats.get("ants_sent"))
    ants_arrived = stats.get("ants_arrived_all_sites", stats.get("ants_arrived"))
    row.update({
        "aco": best,
        "aco_vs_hazard_dijkstra": compare_with_hazard_dijkstra(best, row["hazard_dijkstra"]),
        "aco_found_by": best.get("found_by", "aco"),
        "aco_routes_shown": len(routes),
        "aco_safe_routes_shown": sum(1 for route in routes if not route["eliminated"]),
        "aco_distinct_routes_found": stats.get("routes_found"),
        "aco_rounds": stats.get("rounds"),
        "aco_ant_arrival_pct": round(100.0 * ants_arrived / ants_sent, 1) if ants_sent else None,
    })
    return row


def evaluate_flood_pair(pair):
    barangay, start, end = pair["barangay"], pair["start"], pair["end"]
    started = time.perf_counter()
    result = simulate_osm_routes(
        "Start", start["lat"], start["lng"],
        "End", end["lat"], end["lng"],
        hazard_type="Flood",
        barangay_name=barangay,
    )
    elapsed = time.perf_counter() - started

    G, start_node, end_node = flood_routing_graph(barangay, start, end)
    if start_node is None or end_node is None:
        return {"error": "A pin has no road to start or end on."}
    row = {
        "safe_route_exists": nx.has_path(safe_roads(G), start_node, end_node),
        "length_dijkstra": length_shortest_path(G, start_node, end_node),
        "hazard_dijkstra": shortest_path_baseline(G, start_node, end_node),
    }
    return record_simulation(row, result, result.get("routes"), result.get("aco"), elapsed, G)


def evaluate_earthquake_pair(pair):
    barangay, start = pair["barangay"], pair["start"]
    started = time.perf_counter()
    result = simulate_earthquake({"lat": start["lat"], "lng": start["lng"], "label": "Start"}, barangay)
    elapsed = time.perf_counter() - started

    context = earthquake_routing_context(barangay, start)
    view_graph, start_node, sites = context["view_graph"], context["start_node"], context["sites"]
    if not sites:
        return {"error": "No evacuation site can be reached by road."}

    def site_route(route, site):
        if route is None:
            return None
        return _evaluate_earthquake_route(context["routing_graph"], route, site, EARTHQUAKE_VIEW)

    site_nodes = {site["id"]: context["site_nodes"][site["id"]] for site in sites}
    safely_reachable = nx.descendants(safe_roads(view_graph), start_node)
    hazard_routes = [
        site_route(shortest_path_baseline(view_graph, start_node, site_nodes[site["id"]]), site)
        for site in sites
    ]
    nearest = sites[0]
    row = {
        "safe_route_exists": any(node in safely_reachable for node in site_nodes.values()),
        "length_dijkstra": site_route(
            length_shortest_path(view_graph, start_node, site_nodes[nearest["id"]]),
            nearest,
        ),
        "hazard_dijkstra": min(
            (route for route in hazard_routes if route is not None),
            key=display_sort_key,
            default=None,
        ),
    }
    view = (result.get("views") or {}).get(EARTHQUAKE_VIEW) or {}
    return record_simulation(row, result, view.get("routes"), view.get("aco"), elapsed, view_graph)


def evaluate_pair(pair):
    evaluate = evaluate_flood_pair if pair["hazard"] == "flood" else evaluate_earthquake_pair
    try:
        row = evaluate(pair)
    except Exception as exc:
        row = {"error": f"Evaluation failed: {exc}"}
    row["pair"] = pair
    return row


# ---------------------------------------------------------------------------
# Output
# ---------------------------------------------------------------------------

def route_columns(prefix, route):
    if route is None:
        return {f"{prefix}_{field}": "" for field in ROUTE_FIELDS}
    return {
        f"{prefix}_destination": route.get("destination_name", ""),
        f"{prefix}_distance_m": route["distance"],
        f"{prefix}_unsafe_distance_m": route["unsafe_distance"],
        f"{prefix}_risk_distance": route["risk_distance"],
        f"{prefix}_max_hazard": route["max_hazard"],
        f"{prefix}_safe": "yes" if not route["eliminated"] else "no",
    }


def csv_row(row):
    pair = row["pair"]
    end = pair.get("end") or {}
    flat = {
        "pair_id": pair["id"],
        "barangay": display_name(pair["barangay"]),
        "hazard": pair["hazard"],
        "start_lat": pair["start"]["lat"],
        "start_lng": pair["start"]["lng"],
        "end_lat": end.get("lat", ""),
        "end_lng": end.get("lng", ""),
        "safe_route_exists": {True: "yes", False: "no"}.get(row.get("safe_route_exists"), ""),
        "error": row.get("error", ""),
    }
    for key, _ in METHODS:
        flat.update(route_columns(key, row.get(key)))
    for field in ACO_FIELDS:
        value = row.get(field)
        flat[field] = "" if value is None else value
    return flat


def fraction(part, whole):
    if not whole:
        return "-"
    return f"{part}/{whole} ({100.0 * part / whole:.1f}%)"


def mean(values, digits=1):
    values = [value for value in values if value is not None]
    return f"{statistics.mean(values):.{digits}f}" if values else "-"


def summarize(rows):
    """(metric, value) lines for one group of pairs."""
    done = [row for row in rows if not row.get("error")]
    possible = [row for row in done if row["safe_route_exists"]]
    shortest_unsafe = [row for row in done if row["length_dijkstra"] and row["length_dijkstra"]["eliminated"]]
    outcomes = Counter(row["aco_vs_hazard_dijkstra"] for row in done)
    found_by = Counter(row["aco_found_by"] for row in done)

    def is_safe(route):
        return route is not None and not route["eliminated"]

    lines = [
        ("Pairs evaluated", len(rows)),
        ("Pairs the simulation failed on", len(rows) - len(done)),
        ("A safe route exists", fraction(len(possible), len(done))),
    ]
    lines += [
        (f"Safe route found: {label}", fraction(sum(is_safe(row[key]) for row in done), len(done)))
        for key, label in METHODS
    ]
    lines += [
        ("ACO found a safe route when one exists", fraction(sum(is_safe(row["aco"]) for row in possible), len(possible))),
        ("Shortest route crosses unsafe roads", fraction(len(shortest_unsafe), len(done))),
        ("  of those, ACO found a safe route", fraction(sum(is_safe(row["aco"]) for row in shortest_unsafe), len(shortest_unsafe))),
    ]
    lines += [
        (f"Mean unsafe distance (m): {label}", mean(row[key]["unsafe_distance"] for row in done if row[key]))
        for key, label in METHODS
    ]
    # Flood and earthquake risk distances are on different scales.
    one_hazard = len({row["pair"]["hazard"] for row in rows}) == 1
    lines += [
        (
            f"Mean risk distance: {label}",
            mean(row[key]["risk_distance"] for row in done if row[key]) if one_hazard else "-",
        )
        for key, label in METHODS
    ]
    lines += [
        (f"Mean route length (m): {label}", mean(row[key]["distance"] for row in done if row[key]))
        for key, label in METHODS
    ]
    extra = [
        (row["aco"]["distance"], row["length_dijkstra"]["distance"])
        for row in done
        if row["length_dijkstra"] and row["length_dijkstra"]["distance"] > 0
    ]
    lines += [
        ("ACO extra length vs shortest route (m)", mean(aco - shortest for aco, shortest in extra)),
        ("ACO extra length vs shortest route (%)", mean(100.0 * (aco - shortest) / shortest for aco, shortest in extra)),
    ]
    lines += [
        (f"ACO vs hazard-weighted Dijkstra: {outcome}", fraction(outcomes[outcome], len(done)))
        for outcome in OUTCOMES
    ]
    lines += [
        ("Best route found by the ants", fraction(found_by["aco"], len(done))),
        ("Best route from the Dijkstra fallback", fraction(found_by["shortest_path"], len(done))),
        ("Best route from the backup search", fraction(found_by["backup_search"], len(done))),
        ("Mean routes shown", mean(row["aco_routes_shown"] for row in done)),
        ("Mean safe routes shown", mean(row["aco_safe_routes_shown"] for row in done)),
        ("Mean ants that reached the goal (%)", mean(row["aco_ant_arrival_pct"] for row in done)),
        ("Mean simulation time (s)", mean((row["simulation_time_s"] for row in done), 2)),
        ("Longest simulation time (s)", max((row["simulation_time_s"] for row in done), default="-")),
    ]
    return lines


def git_commit():
    try:
        return subprocess.run(
            ["git", "rev-parse", "--short", "HEAD"],
            cwd=BACKEND_DIR,
            capture_output=True,
            text=True,
            check=True,
        ).stdout.strip()
    except (OSError, subprocess.CalledProcessError):
        return None


def write_outputs(out_dir, pairs, rows, groups, run_info):
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "pairs.json").write_text(json.dumps(pairs, indent=2), encoding="utf-8")
    (out_dir / "run_info.json").write_text(json.dumps(run_info, indent=2), encoding="utf-8")

    # utf-8-sig so Excel opens the files with the right encoding.
    with (out_dir / "results.csv").open("w", newline="", encoding="utf-8-sig") as file_obj:
        writer = csv.DictWriter(file_obj, fieldnames=CSV_FIELDS)
        writer.writeheader()
        writer.writerows(csv_row(row) for row in rows)

    summaries = {label: summarize(group_rows) for label, group_rows in groups.items()}
    with (out_dir / "summary.csv").open("w", newline="", encoding="utf-8-sig") as file_obj:
        writer = csv.writer(file_obj)
        writer.writerow(["Metric"] + list(summaries))
        metrics = [metric for metric, _ in next(iter(summaries.values()))]
        for index, metric in enumerate(metrics):
            writer.writerow([metric] + [lines[index][1] for lines in summaries.values()])
    return summaries


def print_summaries(summaries):
    for label, lines in summaries.items():
        print()
        print(label)
        print("-" * len(label))
        for metric, value in lines:
            print(f"  {metric:<52} {value}")


def main():
    args = parse_args()
    osm_routing.DEBUG = False

    barangays = [normalize_barangay_name(name) for name in (args.barangay or BARANGAYS)]
    unknown = [name for name in barangays if name not in BARANGAYS]
    if unknown:
        raise SystemExit(f"Unknown barangay: {', '.join(unknown)}. Use pinagbuhatan or \"sta lucia\".")
    hazards = args.hazard or list(HAZARDS)

    if args.pairs_file:
        pairs = json.loads(args.pairs_file.read_text(encoding="utf-8"))
        print(f"Re-running {len(pairs)} pairs from {args.pairs_file}")
    else:
        print(f"Picking {args.pairs} random pin pairs per barangay and hazard (seed {args.seed})...")
        pairs = sample_pairs(barangays, hazards, args.pairs, args.seed, args.min_distance)

    out_dir = args.out or DEFAULT_OUT_ROOT / datetime.now().strftime("%Y%m%d-%H%M%S")
    run_started = time.perf_counter()
    rows = []
    for index, pair in enumerate(pairs, start=1):
        row = evaluate_pair(pair)
        rows.append(row)
        aco = row.get("aco")
        outcome = (
            f"error: {row['error']}" if row.get("error")
            else f"ACO {'safe' if not aco['eliminated'] else 'UNSAFE'}, {aco['distance']:.0f} m, "
                 f"{row['aco_vs_hazard_dijkstra']}"
        )
        remaining = (time.perf_counter() - run_started) / index * (len(pairs) - index)
        print(f"[{index}/{len(pairs)}] {pair['id']}: {outcome} (about {remaining / 60:.0f} min left)")

    groups = {}
    for row in rows:
        pair = row["pair"]
        groups.setdefault(group_label(pair["barangay"], pair["hazard"]), []).append(row)
    if len(groups) > 1:
        groups["All pairs"] = rows

    run_info = {
        "date": datetime.now().isoformat(timespec="seconds"),
        "git_commit": git_commit(),
        "seed": None if args.pairs_file else args.seed,
        "pairs_file": str(args.pairs_file) if args.pairs_file else None,
        "pairs_per_group": None if args.pairs_file else args.pairs,
        "min_flood_pin_distance_m": args.min_distance,
        "earthquake_view": EARTHQUAKE_VIEW,
        "settings": {
            name: getattr(osm_routing, name)
            for name in (
                "HAZARD_THRESHOLD", "NUM_ANTS", "NUM_ITERATIONS", "ACO_MIN_ITERATIONS",
                "ACO_STAGNATION_LIMIT", "ALPHA", "BETA", "EVAPORATION", "Q",
                "ALTERNATIVE_COLONY_ANTS", "ALTERNATIVE_COLONY_ITERATIONS",
                "ALTERNATIVE_ROUTE_EDGE_PENALTY", "SAFETY_WEIGHT", "DISTANCE_WEIGHT",
            )
        },
    }
    summaries = write_outputs(out_dir, pairs, rows, groups, run_info)
    print_summaries(summaries)
    print(f"\nTotal time: {(time.perf_counter() - run_started) / 60:.1f} min")
    print(f"Results written to {out_dir}")


if __name__ == "__main__":
    main()
