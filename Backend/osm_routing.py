import json
import random
from pathlib import Path

import networkx as nx
import osmnx as ox
from shapely.geometry import LineString, Point, shape
from shapely.prepared import prep

HAZARD_THRESHOLD = 3
FINAL_ROUTES_TO_SHOW = 5

DIST_METERS = 5000

ACO_MAX_ROUTE_STEPS_MULTIPLIER = 2.5
ACO_MIN_ROUTE_STEPS = 25
ACO_STAGNATION_LIMIT = 8
MAX_NODE_VISITS = 2
DESTINATION_WEIGHT = 0.15
UNSAFE_EDGE_HEURISTIC_FACTOR = 0.05
EDGE_PHEROMONE_MIN = 0.01
EDGE_PHEROMONE_MAX = 25.0
ROUTE_DIVERSITY_THRESHOLD = 0.80
SUPPLEMENTAL_ROUTE_LIMIT = 20

NUM_ANTS = 40
NUM_ITERATIONS = 30
ALPHA = 1.0
BETA = 2.0
EVAPORATION = 0.30
Q = 100.0

SAFETY_WEIGHT = 0.80
DISTANCE_WEIGHT = 0.20
UNSAFE_PENALTY = 1_000_000.0
TOP_ACO_REINFORCERS = 3
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


def resolve_point_hazard(lat, lng, flood_zones=None):
    if lat is None or lng is None:
        return {
            "haz": None,
            "flood_var": None,
            "hazard_source": None,
        }

    if flood_zones is None:
        flood_zones = load_flood_zones()

    point = Point(float(lng), float(lat))

    for zone in flood_zones:
        if zone["prepared"].intersects(point):
            return {
                "haz": int(zone["hazard"]),
                "flood_var": int(zone["var"]),
                "hazard_source": "flood_json",
            }

    return {
        "haz": 1,
        "flood_var": None,
        "hazard_source": "flood_json",
    }


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
        data["route_cost"] = edge_traversal_cost(data)

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


def edge_metrics(edge):
    length = max(float(edge.get("length", 0)), 1.0)
    hazard = int(edge.get("hazard", 1))
    hazard_factor = max(0.0, (hazard - 1) / 4.0)
    return length, hazard, hazard_factor


def edge_traversal_cost(edge):
    length, hazard, hazard_factor = edge_metrics(edge)
    cost = length * (DISTANCE_WEIGHT + SAFETY_WEIGHT * (1.0 + hazard_factor * 4.0))

    if hazard > HAZARD_THRESHOLD:
        cost *= 1.5

    return cost


def get_best_edge(G, u, v):
    edge_data = G.get_edge_data(u, v)
    if not edge_data:
        return None
    return min(edge_data.values(), key=edge_traversal_cost)


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


def extract_route_street_path(G, route):
    street_names = []

    for u, v in route_edges(route):
        edge = get_best_edge(G, u, v)
        if not edge:
            continue

        edge_names = edge.get("name")
        if edge_names is None:
            continue

        if not isinstance(edge_names, list):
            edge_names = [edge_names]

        for edge_name in edge_names:
            name = str(edge_name).strip()
            if not name:
                continue
            if street_names and street_names[-1] == name:
                continue
            street_names.append(name)

    return street_names


def route_edges(route):
    return list(zip(route[:-1], route[1:]))


def simplify_route_path(route):
    if not route:
        return []

    simplified = []
    node_positions = {}

    for node in route:
        if simplified and node == simplified[-1]:
            continue

        existing_index = node_positions.get(node)
        if existing_index is not None:
            for removed_node in simplified[existing_index + 1:]:
                node_positions.pop(removed_node, None)
            simplified = simplified[:existing_index + 1]
            continue

        simplified.append(node)
        node_positions[node] = len(simplified) - 1

    return simplified


def evaluate_route(G, route, candidate_route_no, include_coordinates=False):
    total_distance = 0.0
    total_hazard = 0
    max_hazard = 0
    eliminated = False
    hazard_breakdown = {}
    flood_vars_encountered = set()
    threshold_exceedance_count = 0
    threshold_exceedance_vars = set()
    risk_distance = 0.0
    unsafe_distance = 0.0

    for u, v in route_edges(route):
        edge = get_best_edge(G, u, v)
        if not edge:
            continue

        length, hazard, hazard_factor = edge_metrics(edge)
        flood_var = edge.get("flood_var")

        total_distance += length
        total_hazard += hazard
        max_hazard = max(max_hazard, hazard)
        hazard_breakdown[str(hazard)] = hazard_breakdown.get(str(hazard), 0) + 1
        risk_distance += length * hazard_factor

        if flood_var is not None:
            flood_var = int(flood_var)
            flood_vars_encountered.add(flood_var)

        if hazard > HAZARD_THRESHOLD:
            eliminated = True
            threshold_exceedance_count += 1
            unsafe_distance += length
            if flood_var is not None:
                threshold_exceedance_vars.add(flood_var)

    return {
        "candidate_route_no": candidate_route_no,
        "path": list(route),
        "path_coordinates": path_to_coords(G, route) if include_coordinates else [],
        "distance": round(total_distance, 2),
        "total_hazard": total_hazard,
        "risk_distance": round(risk_distance, 2),
        "unsafe_distance": round(unsafe_distance, 2),
        "max_hazard": max_hazard,
        "eliminated": eliminated,
        "hazard_breakdown": dict(sorted(hazard_breakdown.items(), key=lambda item: int(item[0]))),
        "flood_vars_encountered": sorted(flood_vars_encountered),
        "threshold_exceedance_count": threshold_exceedance_count,
        "threshold_exceedance_vars": sorted(threshold_exceedance_vars),
        "elimination_reason": (
            f"Contains {threshold_exceedance_count} edge(s) above safe threshold {HAZARD_THRESHOLD}"
            if eliminated
            else None
        ),
    }


def thesis_sort_key(route):
    return (
        route["unsafe_distance"] > 0,
        route["unsafe_distance"],
        route["risk_distance"],
        route["distance"]
    )


def numeric_score(route):
    if route["unsafe_distance"] > 0:
        return (
            UNSAFE_PENALTY
            + route["unsafe_distance"] * 1000
            + route["risk_distance"] * 10
            + route["distance"]
        )

    return (
        SAFETY_WEIGHT * route["risk_distance"]
        + DISTANCE_WEIGHT * route["distance"]
    )


def summarize_candidate_routes(routes):
    valid_count = len([r for r in routes if not r["eliminated"]])
    eliminated_count = len([r for r in routes if r["eliminated"]])

    debug_print(f"[OSM] Candidate routes evaluated: {len(routes)}")
    debug_print(f"[OSM] Valid candidate routes: {valid_count}")
    debug_print(f"[OSM] Eliminated candidate routes: {eliminated_count}")


def build_goal_distance_map(G, end_node):
    reverse_graph = G.reverse(copy=False)
    return nx.single_source_dijkstra_path_length(reverse_graph, end_node, weight="length")


def estimate_ant_step_limit(G, start_node, end_node):
    try:
        baseline_path = nx.shortest_path(G, start_node, end_node, weight="length")
        return max(
            ACO_MIN_ROUTE_STEPS,
            int(len(baseline_path) * ACO_MAX_ROUTE_STEPS_MULTIPLIER)
        )
    except (nx.NetworkXNoPath, nx.NodeNotFound):
        return ACO_MIN_ROUTE_STEPS


def initialize_edge_pheromone(G):
    pheromone = {}
    for u, v in G.edges():
        pheromone.setdefault((u, v), 1.0)
    return pheromone


def route_pheromone_score(route, edge_pheromone):
    path_edges = route_edges(route)
    if not path_edges:
        return 0.0

    return sum(
        edge_pheromone.get(edge_key, EDGE_PHEROMONE_MIN)
        for edge_key in path_edges
    ) / len(path_edges)


def route_edge_signature(route):
    return frozenset(route_edges(route.get("path", [])))


def route_overlap_ratio(route_a, route_b):
    edges_a = route_a.get("_edge_signature")
    if edges_a is None:
        edges_a = route_edge_signature(route_a)

    edges_b = route_b.get("_edge_signature")
    if edges_b is None:
        edges_b = route_edge_signature(route_b)

    if not edges_a or not edges_b:
        return 0.0

    return len(edges_a & edges_b) / max(1, min(len(edges_a), len(edges_b)))


def generate_supplemental_routes(G, start_node, end_node, seed_routes):
    unique_routes = {
        tuple(route["path"]): route
        for route in seed_routes
        if route.get("path")
    }

    try:
        supplemental_paths = list(
            ox.routing.k_shortest_paths(
                G,
                start_node,
                end_node,
                k=SUPPLEMENTAL_ROUTE_LIMIT,
                weight="route_cost",
            )
        )
    except Exception as exc:
        debug_print(f"[OSM] Supplemental path search failed: {exc}")
        supplemental_paths = []

    for path in supplemental_paths:
        path = simplify_route_path(path)
        if len(path) < 2:
            continue

        path_key = tuple(path)
        if path_key in unique_routes:
            continue

        unique_routes[path_key] = evaluate_route(G, path, 0, include_coordinates=False)

    return list(unique_routes.values())


def select_display_routes(sorted_routes, limit):
    selected = []
    deferred = []

    for route in sorted_routes:
        route["_edge_signature"] = route_edge_signature(route)

    for route in sorted_routes:
        if len(selected) >= limit:
            break

        if any(
            route_overlap_ratio(route, existing) >= ROUTE_DIVERSITY_THRESHOLD
            for existing in selected
        ):
            deferred.append(route)
            continue

        selected.append(route)

    if len(selected) < limit:
        for route in deferred:
            if len(selected) >= limit:
                break
            selected.append(route)

    for route in sorted_routes:
        route.pop("_edge_signature", None)

    return selected[:limit]


def get_ant_choices(
    G,
    current_node,
    end_node,
    visit_counts,
    edge_pheromone,
    goal_distance_map,
    previous_node=None,
    allow_revisit=False,
):
    choices = []
    weights = []

    for neighbor in G.successors(current_node):
        goal_distance = goal_distance_map.get(neighbor)
        if goal_distance is None:
            continue

        visits = visit_counts.get(neighbor, 0)
        if visits > 0 and not allow_revisit:
            continue
        if visits >= MAX_NODE_VISITS:
            continue

        edge = get_best_edge(G, current_node, neighbor)
        if not edge:
            continue

        tau = edge_pheromone.get((current_node, neighbor), 1.0) ** ALPHA
        eta = (
            1.0 / (edge_traversal_cost(edge) + DESTINATION_WEIGHT * goal_distance + 1e-9)
        ) ** BETA

        if int(edge.get("hazard", 1)) > HAZARD_THRESHOLD:
            eta *= UNSAFE_EDGE_HEURISTIC_FACTOR

        if visits > 0:
            eta *= 0.25 / visits

        if previous_node is not None and neighbor == previous_node:
            eta *= 0.10

        if neighbor == end_node:
            eta *= 3.0

        choices.append(neighbor)
        weights.append(max(tau * eta, 1e-12))

    return choices, weights


def construct_ant_route(G, start_node, end_node, edge_pheromone, goal_distance_map, max_steps):
    if start_node == end_node:
        return [start_node]

    if start_node not in goal_distance_map:
        return None

    current_node = start_node
    route = [current_node]
    visit_counts = {current_node: 1}

    for _ in range(max_steps):
        if current_node == end_node:
            return route

        previous_node = route[-2] if len(route) > 1 else None
        choices, weights = get_ant_choices(
            G,
            current_node,
            end_node,
            visit_counts,
            edge_pheromone,
            goal_distance_map,
            previous_node=previous_node,
            allow_revisit=False,
        )

        if not choices:
            choices, weights = get_ant_choices(
                G,
                current_node,
                end_node,
                visit_counts,
                edge_pheromone,
                goal_distance_map,
                previous_node=previous_node,
                allow_revisit=True,
            )

        if not choices:
            return None

        next_node = random.choices(choices, weights=weights, k=1)[0]
        route.append(next_node)
        visit_counts[next_node] = visit_counts.get(next_node, 0) + 1
        current_node = next_node

    return route if route[-1] == end_node else None


def run_aco(G, start_node, end_node):
    edge_pheromone = initialize_edge_pheromone(G)

    if start_node == end_node:
        return [evaluate_route(G, [start_node], 1, include_coordinates=False)], edge_pheromone

    goal_distance_map = build_goal_distance_map(G, end_node)
    if start_node not in goal_distance_map:
        debug_print("[ACO] Start node cannot reach the destination in the directed graph")
        return [], edge_pheromone

    step_limit = estimate_ant_step_limit(G, start_node, end_node)
    route_cache = {}
    best_score = float("inf")
    stagnant_iterations = 0

    debug_print(f"[ACO] Reachable nodes to destination: {len(goal_distance_map)}")
    debug_print(f"[ACO] Ant step limit: {step_limit}")

    for iteration in range(NUM_ITERATIONS):
        completed_routes = []

        for _ in range(NUM_ANTS):
            ant_route = construct_ant_route(
                G,
                start_node,
                end_node,
                edge_pheromone,
                goal_distance_map,
                step_limit,
            )

            if not ant_route or ant_route[-1] != end_node:
                continue

            ant_route = simplify_route_path(ant_route)
            if len(ant_route) < 2 or ant_route[0] != start_node or ant_route[-1] != end_node:
                continue

            route_key = tuple(ant_route)
            route = route_cache.get(route_key)
            if route is None:
                route = evaluate_route(G, ant_route, 0, include_coordinates=False)
                route_cache[route_key] = route

            completed_routes.append(route)

        unique_completed = list({
            tuple(route["path"]): route for route in completed_routes
        }.values())
        debug_print(
            f"[ACO] Iteration {iteration + 1}: "
            f"completed={len(completed_routes)}, unique={len(unique_completed)}"
        )

        for edge_key in edge_pheromone:
            edge_pheromone[edge_key] *= (1 - EVAPORATION)
            edge_pheromone[edge_key] = max(edge_pheromone[edge_key], EDGE_PHEROMONE_MIN)

        if not completed_routes:
            stagnant_iterations += 1
            if stagnant_iterations >= ACO_STAGNATION_LIMIT and route_cache:
                debug_print("[ACO] Early stop: route pool stopped improving")
                break
            continue

        reinforcement_pool = [
            route for route in completed_routes
            if not route["eliminated"]
        ] or completed_routes

        winners = []
        seen_winners = set()
        for route in sorted(reinforcement_pool, key=numeric_score):
            route_key = tuple(route["path"])
            if route_key in seen_winners:
                continue
            seen_winners.add(route_key)
            winners.append(route)
            if len(winners) >= TOP_ACO_REINFORCERS:
                break

        for route in winners:
            deposit = Q / (numeric_score(route) + 1e-9)
            for edge_key in route_edges(route["path"]):
                edge_pheromone[edge_key] = min(
                    edge_pheromone.get(edge_key, EDGE_PHEROMONE_MIN) + deposit,
                    EDGE_PHEROMONE_MAX,
                )

        current_best = min(route_cache.values(), key=numeric_score, default=None)
        if current_best is not None and numeric_score(current_best) + 1e-9 < best_score:
            best_score = numeric_score(current_best)
            stagnant_iterations = 0
        else:
            stagnant_iterations += 1

        if stagnant_iterations >= ACO_STAGNATION_LIMIT and len(route_cache) >= FINAL_ROUTES_TO_SHOW:
            debug_print("[ACO] Early stop: enough stable routes collected")
            break

    candidate_routes = sorted(route_cache.values(), key=thesis_sort_key)
    candidate_routes = generate_supplemental_routes(G, start_node, end_node, candidate_routes)
    candidate_routes = sorted(candidate_routes, key=thesis_sort_key)
    for idx, route in enumerate(candidate_routes, start=1):
        route["candidate_route_no"] = idx

    summarize_candidate_routes(candidate_routes)
    debug_print(f"[ACO] Unique routes generated: {len(candidate_routes)}")
    return candidate_routes, edge_pheromone


def finalize_routes(G, candidate_routes, edge_pheromone):
    scored_routes = []
    for route in candidate_routes:
        route_copy = route.copy()
        route_copy["path_coordinates"] = path_to_coords(G, route_copy["path"])
        route_copy["street_path"] = extract_route_street_path(G, route_copy["path"])
        route_copy["final_pheromone"] = round(
            route_pheromone_score(route_copy["path"], edge_pheromone),
            4,
        )
        route_copy["aco_score"] = round(numeric_score(route_copy), 2)
        scored_routes.append(route_copy)

    sorted_routes = sorted(
        scored_routes,
        key=lambda route: (
            route["unsafe_distance"] > 0,
            route["unsafe_distance"],
            route["risk_distance"],
            -route["final_pheromone"],
            route["distance"],
        )
    )

    valid_routes = [r.copy() for r in sorted_routes if not r["eliminated"]]
    eliminated_routes = [r.copy() for r in sorted_routes if r["eliminated"]]

    valid_routes = select_display_routes(valid_routes, FINAL_ROUTES_TO_SHOW)

    remaining_slots = FINAL_ROUTES_TO_SHOW - len(valid_routes)
    if remaining_slots > 0:
        eliminated_routes = select_display_routes(eliminated_routes, remaining_slots)
    else:
        eliminated_routes = []

    final_routes = []

    for idx, route in enumerate(valid_routes, start=1):
        route["display_route_no"] = idx
        route["category"] = "best" if idx == 1 else "available"
        route["status"] = "Best" if idx == 1 else "Available"
        route["color"] = "#22c55e" if idx == 1 else "#f59e0b"
        final_routes.append(route)

    next_index = len(final_routes) + 1
    for idx, route in enumerate(eliminated_routes, start=next_index):
        route["display_route_no"] = idx
        route["category"] = "eliminated"
        route["status"] = "Eliminated"
        route["color"] = "#ef4444"
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
    candidate_routes, edge_pheromone = run_aco(G, start_node, end_node)

    if not candidate_routes:
        return {
            "error": True,
            "message": "No candidate routes found for the selected locations."
        }

    final_routes = finalize_routes(G, candidate_routes, edge_pheromone)

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
