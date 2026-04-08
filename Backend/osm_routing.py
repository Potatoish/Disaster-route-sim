import json
import random
from pathlib import Path

import osmnx as ox
from shapely.geometry import LineString, shape
from shapely.prepared import prep

HAZARD_THRESHOLD = 3
FINAL_ROUTES_TO_SHOW = 5

DIST_METERS = 5000

INITIAL_K = 10
K_STEP = 10
MAX_K = 50

NUM_ANTS = 40
NUM_ITERATIONS = 30
ALPHA = 1.0
BETA = 2.0
EVAPORATION = 0.30
Q = 100.0

DEBUG = True

# simple in-memory cache
_GRAPH_CACHE = {}
_FLOOD_ZONES_CACHE = None

FLOOD_CLASSES_DIR = Path(__file__).parent / "data" / "flood_classes"
FLOOD_ZONE_FILES = [
    FLOOD_CLASSES_DIR / "flood_var_1.geojson",
    FLOOD_CLASSES_DIR / "flood_var_2.geojson",
    FLOOD_CLASSES_DIR / "flood_var_3.geojson",
]

VAR_TO_HAZARD = {
    1: 1,
    2: 3,
    3: 5,
}


def debug_print(*args):
    if DEBUG:
        print(*args)


def map_flood_var_to_hazard(var_value):
    return VAR_TO_HAZARD.get(int(var_value), 1)


def load_flood_zones():
    global _FLOOD_ZONES_CACHE

    if _FLOOD_ZONES_CACHE is not None:
        return _FLOOD_ZONES_CACHE

    flood_zones = []

    for file_path in FLOOD_ZONE_FILES:
        if not file_path.exists():
            raise FileNotFoundError(f"Flood zone file not found: {file_path}")

        with file_path.open("r", encoding="utf-8-sig") as f:
            data = json.load(f)

        if data.get("type") != "FeatureCollection":
            raise ValueError(
                f"Invalid GeoJSON type in {file_path.name}: expected FeatureCollection"
            )

        features = data.get("features", [])
        if len(features) != 1:
            raise ValueError(
                f"Expected exactly 1 feature in {file_path.name}, found {len(features)}"
            )

        feature = features[0]
        properties = feature.get("properties") or {}
        geometry_data = feature.get("geometry")

        if geometry_data is None:
            raise ValueError(f"Missing geometry in {file_path.name}")

        if "Var" not in properties:
            raise ValueError(f"Missing 'Var' property in {file_path.name}")

        var_value = int(properties["Var"])
        hazard_value = map_flood_var_to_hazard(var_value)

        geom = shape(geometry_data)
        if geom.is_empty:
            raise ValueError(f"Empty geometry in {file_path.name}")

        flood_zones.append({
            "var": var_value,
            "hazard": hazard_value,
            "geometry": geom,
            "prepared": prep(geom),
            "source_file": file_path.name,
        })

    flood_zones.sort(key=lambda zone: zone["hazard"], reverse=True)
    _FLOOD_ZONES_CACHE = flood_zones

    debug_print(
        "[FLOOD] Loaded zones:",
        [
            {
                "file": zone["source_file"],
                "var": zone["var"],
                "hazard": zone["hazard"],
                "geom_type": zone["geometry"].geom_type,
            }
            for zone in _FLOOD_ZONES_CACHE
        ]
    )

    return _FLOOD_ZONES_CACHE


def get_edge_geometry(G, u, v, data):
    edge_geom = data.get("geometry")
    if edge_geom is not None:
        return edge_geom

    u_node = G.nodes[u]
    v_node = G.nodes[v]

    return LineString([
        (float(u_node["x"]), float(u_node["y"])),
        (float(v_node["x"]), float(v_node["y"])),
    ])


def resolve_edge_hazard(edge_geom, flood_zones):
    if edge_geom is None or edge_geom.is_empty:
        return 1, None

    for zone in flood_zones:
        if zone["prepared"].intersects(edge_geom):
            return zone["hazard"], zone["var"]

    return 1, None


def make_graph_cache_key(start_lat, start_lng, end_lat, end_lng, dist_meters):
    center_lat = round((start_lat + end_lat) / 2, 3)
    center_lng = round((start_lng + end_lng) / 2, 3)
    return (center_lat, center_lng, dist_meters)


def build_graph(start_lat, start_lng, end_lat, end_lng, dist_meters=DIST_METERS):
    center_lat = (start_lat + end_lat) / 2
    center_lng = (start_lng + end_lng) / 2
    cache_key = make_graph_cache_key(start_lat, start_lng, end_lat, end_lng, dist_meters)

    if cache_key in _GRAPH_CACHE:
        debug_print(f"[OSM] Using cached graph for key={cache_key}")
        return _GRAPH_CACHE[cache_key]

    debug_print(f"[OSM] Building graph with radius {dist_meters} meters")
    debug_print(f"[OSM] Center: ({center_lat}, {center_lng})")

    G = ox.graph_from_point(
        (center_lat, center_lng),
        dist=dist_meters,
        network_type="drive",
        simplify=True
    )

    _GRAPH_CACHE[cache_key] = G
    debug_print(f"[OSM] Graph loaded: {len(G.nodes)} nodes, {len(G.edges)} edges")
    return G


def get_nearest_osm_nodes(G, start_lat, start_lng, end_lat, end_lng):
    start_node = ox.distance.nearest_nodes(G, X=start_lng, Y=start_lat)
    end_node = ox.distance.nearest_nodes(G, X=end_lng, Y=end_lat)

    debug_print(f"[OSM] Start node: {start_node}")
    debug_print(f"[OSM] End node: {end_node}")

    return start_node, end_node


def assign_flood_hazards(G):
    flood_zones = load_flood_zones()

    counts = {level: 0 for level in sorted(set(VAR_TO_HAZARD.values()) | {1})}
    var_counts = {1: 0, 2: 0, 3: 0, None: 0}

    for u, v, key, data in G.edges(keys=True, data=True):
        if data.get("hazard_source") == "flood_json" and "hazard" in data:
            hazard = int(data.get("hazard", 1))
            flood_var = data.get("flood_var")
        else:
            edge_geom = get_edge_geometry(G, u, v, data)
            hazard, flood_var = resolve_edge_hazard(edge_geom, flood_zones)

            data["hazard"] = int(hazard)
            data["flood_var"] = flood_var
            data["hazard_source"] = "flood_json"

        counts[hazard] = counts.get(hazard, 0) + 1
        var_counts[flood_var] = var_counts.get(flood_var, 0) + 1

    debug_print(f"[FLOOD] Hazard distribution: {counts}")
    debug_print(
        "[FLOOD] Flood class matches:",
        {
            "Var 1": var_counts.get(1, 0),
            "Var 2": var_counts.get(2, 0),
            "Var 3": var_counts.get(3, 0),
            "No zone": var_counts.get(None, 0),
        }
    )


def get_best_edge(G, u, v):
    edge_data = G.get_edge_data(u, v)
    if not edge_data:
        return None
    return min(edge_data.values(), key=lambda x: x.get("length", float("inf")))


def edge_geometry_to_coords(G, u, v, edge):
    edge_geom = get_edge_geometry(G, u, v, edge)
    edge_coords = [
        {"lat": float(lat), "lng": float(lng)}
        for lng, lat in edge_geom.coords
    ]

    if not edge_coords:
        return []

    u_node = G.nodes[u]
    start_lat = float(u_node["y"])
    start_lng = float(u_node["x"])

    first_dist = abs(edge_coords[0]["lat"] - start_lat) + abs(edge_coords[0]["lng"] - start_lng)
    last_dist = abs(edge_coords[-1]["lat"] - start_lat) + abs(edge_coords[-1]["lng"] - start_lng)

    if last_dist < first_dist:
        edge_coords.reverse()

    return edge_coords


def path_to_coords(G, route):
    if not route:
        return []

    if len(route) == 1:
        node_data = G.nodes[route[0]]
        return [{
            "lat": float(node_data["y"]),
            "lng": float(node_data["x"])
        }]

    coords = []

    for u, v in zip(route[:-1], route[1:]):
        edge = get_best_edge(G, u, v)
        if not edge:
            continue

        edge_coords = edge_geometry_to_coords(G, u, v, edge)
        if not edge_coords:
            continue

        if coords and coords[-1] == edge_coords[0]:
            coords.extend(edge_coords[1:])
        else:
            coords.extend(edge_coords)

    if coords:
        return coords

    fallback_coords = []
    for node in route:
        node_data = G.nodes[node]
        fallback_coords.append({
            "lat": float(node_data["y"]),
            "lng": float(node_data["x"])
        })
    return fallback_coords

def evaluate_route(G, route, candidate_route_no):
    total_distance = 0.0
    total_hazard = 0
    max_hazard = 0
    eliminated = False

    for u, v in zip(route[:-1], route[1:]):
        edge = get_best_edge(G, u, v)
        if not edge:
            continue

        length = float(edge.get("length", 0))
        hazard = int(edge.get("hazard", 1))

        total_distance += length
        total_hazard += hazard
        max_hazard = max(max_hazard, hazard)

        if hazard > HAZARD_THRESHOLD:
            eliminated = True

    return {
        "candidate_route_no": candidate_route_no,
        "path": list(route),
        "path_coordinates": path_to_coords(G, route),
        "distance": round(total_distance, 2),
        "total_hazard": total_hazard,
        "max_hazard": max_hazard,
        "eliminated": eliminated
    }


def thesis_sort_key(route):
    return (
        route["max_hazard"],
        route["total_hazard"],
        route["distance"]
    )


def numeric_score(route):
    return route["max_hazard"] * 1000 + route["total_hazard"] * 10 + route["distance"]


def summarize_candidate_routes(routes):
    valid_count = len([r for r in routes if not r["eliminated"]])
    eliminated_count = len([r for r in routes if r["eliminated"]])

    debug_print(f"[OSM] Candidate routes evaluated: {len(routes)}")
    debug_print(f"[OSM] Valid candidate routes: {valid_count}")
    debug_print(f"[OSM] Eliminated candidate routes: {eliminated_count}")


def find_candidate_routes(G, start_node, end_node):
    candidate_routes = []

    for current_k in range(INITIAL_K, MAX_K + 1, K_STEP):
        debug_print(f"[OSM] Searching candidate routes with k={current_k}")

        try:
            raw_routes = list(
                ox.routing.k_shortest_paths(
                    G,
                    start_node,
                    end_node,
                    k=current_k,
                    weight="length"
                )
            )
        except Exception as e:
            debug_print(f"[OSM] k_shortest_paths failed at k={current_k}: {e}")
            raw_routes = []

        debug_print(f"[OSM] Raw routes found: {len(raw_routes)}")

        unique_seen = set()
        evaluated = []

        for idx, route in enumerate(raw_routes, start=1):
            route_key = tuple(route)
            if route_key in unique_seen:
                continue
            unique_seen.add(route_key)
            evaluated.append(evaluate_route(G, route, idx))

        summarize_candidate_routes(evaluated)

        if any(not r["eliminated"] for r in evaluated):
            candidate_routes = evaluated
            debug_print(f"[OSM] Found at least one valid route at k={current_k}")
            break

    if not candidate_routes:
        debug_print("[OSM] No valid routes found in progressive search, using MAX_K fallback")
        try:
            raw_routes = list(
                ox.routing.k_shortest_paths(
                    G,
                    start_node,
                    end_node,
                    k=MAX_K,
                    weight="length"
                )
            )
        except Exception as e:
            debug_print(f"[OSM] MAX_K fallback failed: {e}")
            raw_routes = []

        unique_seen = set()
        for idx, route in enumerate(raw_routes, start=1):
            route_key = tuple(route)
            if route_key in unique_seen:
                continue
            unique_seen.add(route_key)
            candidate_routes.append(evaluate_route(G, route, idx))

    return candidate_routes


def run_aco(candidate_routes):
    pheromone = {route["candidate_route_no"]: 1.0 for route in candidate_routes}

    for _ in range(NUM_ITERATIONS):
        chosen_routes = []

        for _ in range(NUM_ANTS):
            choices = []
            weights = []

            for route in candidate_routes:
                tau = pheromone[route["candidate_route_no"]] ** ALPHA
                eta = (1.0 / (numeric_score(route) + 1e-9)) ** BETA
                choices.append(route)
                weights.append(tau * eta)

            chosen_routes.append(random.choices(choices, weights=weights, k=1)[0])

        for route_no in pheromone:
            pheromone[route_no] *= (1 - EVAPORATION)
            pheromone[route_no] = max(pheromone[route_no], 0.01)

        for route in chosen_routes:
            pheromone[route["candidate_route_no"]] += Q / (numeric_score(route) + 1e-9)

    return pheromone


def finalize_routes(candidate_routes, pheromone):
    sorted_routes = sorted(candidate_routes, key=thesis_sort_key)

    valid_routes = [r.copy() for r in sorted_routes if not r["eliminated"]]
    eliminated_routes = [r.copy() for r in sorted_routes if r["eliminated"]]

    valid_routes = valid_routes[:FINAL_ROUTES_TO_SHOW]

    remaining_slots = FINAL_ROUTES_TO_SHOW - len(valid_routes)
    if remaining_slots > 0:
        eliminated_routes = eliminated_routes[:remaining_slots]
    else:
        eliminated_routes = []

    final_routes = []

    for idx, route in enumerate(valid_routes, start=1):
        route["display_route_no"] = idx
        route["category"] = "best" if idx == 1 else "available"
        route["status"] = "Best" if idx == 1 else "Available"
        route["color"] = "#22c55e" if idx == 1 else "#f59e0b"
        route["final_pheromone"] = round(pheromone.get(route["candidate_route_no"], 0), 4)
        final_routes.append(route)

    next_index = len(final_routes) + 1
    for idx, route in enumerate(eliminated_routes, start=next_index):
        route["display_route_no"] = idx
        route["category"] = "eliminated"
        route["status"] = "Eliminated"
        route["color"] = "#ef4444"
        route["final_pheromone"] = round(pheromone.get(route["candidate_route_no"], 0), 4)
        final_routes.append(route)

    return final_routes


def simulate_osm_routes(start_name, start_lat, start_lng, end_name, end_lat, end_lng, hazard_type="Flood"):
    debug_print("\n" + "=" * 60)
    debug_print("[OSM] SIMULATION START")
    debug_print(f"[OSM] From: {start_name} ({start_lat}, {start_lng})")
    debug_print(f"[OSM] To  : {end_name} ({end_lat}, {end_lng})")

    G = build_graph(start_lat, start_lng, end_lat, end_lng)
    assign_flood_hazards(G)

    start_node, end_node = get_nearest_osm_nodes(G, start_lat, start_lng, end_lat, end_lng)
    candidate_routes = find_candidate_routes(G, start_node, end_node)

    if not candidate_routes:
        return {
            "error": True,
            "message": "No candidate routes found for the selected locations."
        }

    pheromone = run_aco(candidate_routes)
    final_routes = finalize_routes(candidate_routes, pheromone)

    for route in final_routes:
        route["path_label"] = f"{start_name} → {end_name}"
        route["segments"] = max(1, len(route.get("path", [])) - 1)

    debug_print("[OSM] SIMULATION END")
    debug_print("=" * 60 + "\n")

    return {
        "error": False,
        "start": start_name,
        "end": end_name,
        "hazard_type": hazard_type,
        "safe_threshold": HAZARD_THRESHOLD,
        "total_candidate_routes": len(candidate_routes),
        "routes": final_routes
    }
