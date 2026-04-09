import argparse
import json
import sys
from pathlib import Path


BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

import osm_routing
from data import database
from osm_routing import HAZARD_THRESHOLD, simulate_osm_routes


def parse_args():
    parser = argparse.ArgumentParser(
        description=(
            "Run multiple route simulations from a JSON file and print a hazard-focused summary."
        )
    )
    parser.add_argument(
        "pairs_file",
        type=Path,
        help="Path to a JSON file containing the start/end pairs to test.",
    )
    parser.add_argument(
        "--output",
        type=Path,
        help="Optional path to write the full JSON report.",
    )
    parser.add_argument(
        "--verbose",
        action="store_true",
        help="Keep low-level routing debug output enabled.",
    )
    return parser.parse_args()


def load_pairs(pairs_file):
    with pairs_file.open("r", encoding="utf-8") as file_obj:
        pairs = json.load(file_obj)

    if not isinstance(pairs, list):
        raise ValueError("Pairs file must contain a top-level JSON array.")

    return pairs


def resolve_named_location(name):
    location = database.get_location_by_name(name)
    if not location:
        raise ValueError(f"Location not found in database: {name}")

    return {
        "name": location["name"],
        "lat": float(location["lat"]),
        "lng": float(location["lng"]),
    }


def resolve_endpoint(endpoint, role):
    if isinstance(endpoint, str):
        return resolve_named_location(endpoint)

    if not isinstance(endpoint, dict):
        raise ValueError(f"{role} endpoint must be a string or object.")

    has_coords = endpoint.get("lat") is not None and endpoint.get("lng") is not None
    if has_coords:
        lat = float(endpoint["lat"])
        lng = float(endpoint["lng"])
        return {
            "name": endpoint.get("name") or f"{role.title()} ({lat:.6f}, {lng:.6f})",
            "lat": lat,
            "lng": lng,
        }

    if endpoint.get("name"):
        return resolve_named_location(endpoint["name"])

    raise ValueError(
        f"{role} endpoint must provide either a location name or explicit lat/lng coordinates."
    )


def build_pair_label(pair, pair_index, start, end):
    explicit_label = pair.get("label")
    if explicit_label:
        return explicit_label

    return f"Pair {pair_index}: {start['name']} -> {end['name']}"


def summarize_routes(routes):
    safe_routes = [route for route in routes if not route.get("eliminated")]
    eliminated_routes = [route for route in routes if route.get("eliminated")]
    var_3_routes = [
        route for route in routes if 3 in route.get("flood_vars_encountered", [])
    ]

    return {
        "safe_routes": len(safe_routes),
        "eliminated_routes": len(eliminated_routes),
        "var_3_routes": len(var_3_routes),
    }


def run_pair(pair, pair_index):
    start = resolve_endpoint(pair.get("start"), "start")
    end = resolve_endpoint(pair.get("end"), "end")
    label = build_pair_label(pair, pair_index, start, end)
    try:
        result = simulate_osm_routes(
            start_name=start["name"],
            start_lat=start["lat"],
            start_lng=start["lng"],
            end_name=end["name"],
            end_lat=end["lat"],
            end_lng=end["lng"],
            hazard_type=pair.get("hazard_type", "Flood"),
        )
    except Exception as exc:
        return {
            "label": label,
            "start": start,
            "end": end,
            "safe_threshold": HAZARD_THRESHOLD,
            "error": True,
            "message": str(exc),
            "total_candidate_routes": 0,
            "routes": [],
            "summary": {
                "safe_routes": 0,
                "eliminated_routes": 0,
                "var_3_routes": 0,
            },
        }

    report = {
        "label": label,
        "start": start,
        "end": end,
        "safe_threshold": HAZARD_THRESHOLD,
        "error": bool(result.get("error")),
        "message": result.get("message"),
        "total_candidate_routes": result.get("total_candidate_routes", 0),
        "routes": result.get("routes", []),
    }

    if not report["error"]:
        report["summary"] = summarize_routes(report["routes"])
    else:
        report["summary"] = {
            "safe_routes": 0,
            "eliminated_routes": 0,
            "var_3_routes": 0,
        }

    return report


def print_route_summary(route):
    encountered_vars = route.get("flood_vars_encountered", [])
    vars_text = ", ".join(f"Var {var_value}" for var_value in encountered_vars) or "None"
    threshold_vars = route.get("threshold_exceedance_vars", [])
    threshold_text = ", ".join(
        f"Var {var_value}" for var_value in threshold_vars
    ) or "None"

    print(
        "  "
        f"R{route.get('display_route_no', '?')}: "
        f"{route.get('status', 'Unknown'):10} "
        f"distance={route.get('distance', 0)}m "
        f"max_hazard={route.get('max_hazard', 0)} "
        f"vars=[{vars_text}] "
        f"threshold_vars=[{threshold_text}] "
        f"threshold_edges={route.get('threshold_exceedance_count', 0)}"
    )


def print_report(report):
    print("=" * 72)
    print(report["label"])
    print(
        f"Start: {report['start']['name']} ({report['start']['lat']}, {report['start']['lng']})"
    )
    print(f"End  : {report['end']['name']} ({report['end']['lat']}, {report['end']['lng']})")

    if report["error"]:
        print(f"ERROR: {report['message']}")
        print()
        return

    summary = report["summary"]
    print(
        "Summary: "
        f"candidates={report['total_candidate_routes']} "
        f"safe={summary['safe_routes']} "
        f"eliminated={summary['eliminated_routes']} "
        f"routes_touching_var_3={summary['var_3_routes']} "
        f"threshold={report['safe_threshold']}"
    )

    for route in report["routes"]:
        print_route_summary(route)

    print()


def main():
    args = parse_args()
    osm_routing.DEBUG = bool(args.verbose)
    pairs = load_pairs(args.pairs_file)

    reports = []
    had_error = False

    for pair_index, pair in enumerate(pairs, start=1):
        try:
            report = run_pair(pair, pair_index)
        except Exception as exc:
            had_error = True
            report = {
                "label": f"Pair {pair_index}",
                "start": pair.get("start"),
                "end": pair.get("end"),
                "safe_threshold": HAZARD_THRESHOLD,
                "error": True,
                "message": str(exc),
                "total_candidate_routes": 0,
                "routes": [],
                "summary": {
                    "safe_routes": 0,
                    "eliminated_routes": 0,
                    "var_3_routes": 0,
                },
            }

        if report["error"]:
            had_error = True

        reports.append(report)
        print_report(report)

    if args.output:
        args.output.write_text(json.dumps(reports, indent=2), encoding="utf-8")

    raise SystemExit(1 if had_error else 0)


if __name__ == "__main__":
    main()
