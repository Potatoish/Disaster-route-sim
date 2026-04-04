import random
import osmnx as ox

HAZARD_THRESHOLD = 3
FINAL_ROUTES_TO_SHOW = 5

DIST_METERS = 3000

INITIAL_K = 10
K_STEP = 5
MAX_K = 30

NUM_ANTS = 40
NUM_ITERATIONS = 30
ALPHA = 1.0
BETA = 2.0
EVAPORATION = 0.30
Q = 100.0

def build_graph(start_lat, start_lng, end_lat, end_lng, dist_meters=DIST_METERS):
    center_lat = (start_lat + end_lat) / 2
    center_lng = (start_lng + end_lng) / 2

    G = ox.graph_from_point(
        (center_lat, center_lng),
        dist=dist_meters,
        network_type="drive",
        simplify=True
    )
    return G

def get_nearest_osm_nodes(G, start_lat, start_lng, end_lat, end_lng):
    start_node = ox.distance.nearest_nodes(G, X=start_lng, Y=start_lat)
    end_node = ox.distance.nearest_nodes(G, X=end_lng, Y=end_lat)
    return start_node, end_node


def assign_fake_hazards(G, seed=45):
    random.seed(seed)

    for u, v, key, data in G.edges(keys=True, data=True):
        r = random.random()
        if r < 0.70:
            data["hazard"] = 1
        elif r < 0.90:
            data["hazard"] = 2
        elif r < 0.98:
            data["hazard"] = 3
        else:
            data["hazard"] = 5


def get_best_edge(G, u, v):
    edge_data = G.get_edge_data(u, v)
    if not edge_data:
        return None
    return min(edge_data.values(), key=lambda x: x.get("length", float("inf")))


def path_to_coords(G, route):
    coords = []
    for node in route:
        node_data = G.nodes[node]
        coords.append({
            "lat": float(node_data["y"]),
            "lng": float(node_data["x"])
        })
    return coords


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
        hazard = int(edge.get("hazard", 0))

        total_distance += length
        total_hazard += hazard
        max_hazard = max(max_hazard, hazard)

        if hazard > HAZARD_THRESHOLD:
            eliminated = True

    return {
        "candidate_route_no": candidate_route_no,
        "path": list(route),  # raw OSM node IDs, keep for backend/debug
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


def find_candidate_routes(G, start_node, end_node):
    candidate_routes = []

    for current_k in range(INITIAL_K, MAX_K + 1, K_STEP):
        raw_routes = list(
            ox.routing.k_shortest_paths(
                G,
                start_node,
                end_node,
                k=current_k,
                weight="length"
            )
        )

        unique_seen = set()
        evaluated = []

        for idx, route in enumerate(raw_routes, start=1):
            route_key = tuple(route)
            if route_key in unique_seen:
                continue
            unique_seen.add(route_key)

            evaluated.append(evaluate_route(G, route, idx))

        if any(not r["eliminated"] for r in evaluated):
            candidate_routes = evaluated
            break

    if not candidate_routes:
        raw_routes = list(
            ox.routing.k_shortest_paths(
                G,
                start_node,
                end_node,
                k=MAX_K,
                weight="length"
            )
        )

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
    G = build_graph(start_lat, start_lng, end_lat, end_lng)
    assign_fake_hazards(G)

    start_node, end_node = get_nearest_osm_nodes(G, start_lat, start_lng, end_lat, end_lng)
    candidate_routes = find_candidate_routes(G, start_node, end_node)
    pheromone = run_aco(candidate_routes)
    final_routes = finalize_routes(candidate_routes, pheromone)

    for route in final_routes:
        route["path_label"] = f"{start_name} → {end_name}"
        route["segments"] = max(1, len(route.get("path_coordinates", [])) - 1)

    return {
        "error": False,
        "start": start_name,
        "end": end_name,
        "hazard_type": hazard_type,
        "safe_threshold": HAZARD_THRESHOLD,
        "total_candidate_routes": len(candidate_routes),
        "routes": final_routes
    }