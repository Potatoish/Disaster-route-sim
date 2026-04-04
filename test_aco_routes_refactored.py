import random
import osmnx as ox

# =========================================================
# SETTINGS
# =========================================================
random.seed(45)

NOVO_LAT, NOVO_LNG = 14.558085411625907, 121.084921938467
KENNETH_LAT, KENNETH_LNG = 14.541715003658885, 121.10467959564755

DIST_METERS = 3000
HAZARD_THRESHOLD = 4
FINAL_ROUTES_TO_SHOW = 4

# Internal search settings
INITIAL_K = 10
K_STEP = 5
MAX_K = 30

# ACO settings
NUM_ANTS = 40
NUM_ITERATIONS = 30
ALPHA = 1.0
BETA = 2.0
EVAPORATION = 0.30
Q = 100.0

DEBUG = False


# =========================================================
# GRAPH FUNCTIONS
# =========================================================
def build_graph(start_lat, start_lng, end_lat, end_lng, dist_meters):
    print("Downloading road network...")

    center_lat = (start_lat + end_lat) / 2
    center_lng = (start_lng + end_lng) / 2

    G = ox.graph_from_point(
        (center_lat, center_lng),
        dist=dist_meters,
        network_type="drive",
        simplify=True
    )

    print("Graph loaded.")
    return G


def get_nearest_nodes(G, start_lat, start_lng, end_lat, end_lng):
    start_node = ox.distance.nearest_nodes(G, X=start_lng, Y=start_lat)
    end_node = ox.distance.nearest_nodes(G, X=end_lng, Y=end_lat)

    print("Start node:", start_node)
    print("End node:", end_node)

    return start_node, end_node


def assign_fake_hazards(G):
    """
    Biased hazard distribution:
    70% = 1
    20% = 2
    8%  = 3
    2%  = 5
    """
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


# =========================================================
# ROUTE HELPERS
# =========================================================
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


def evaluate_route(G, route, candidate_route_no, hazard_threshold):
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

        if hazard > hazard_threshold:
            eliminated = True

    return {
        "candidate_route_no": candidate_route_no,
        "path": list(route),
        "path_coords": path_to_coords(G, route),
        "nodes_count": len(route),
        "distance": round(total_distance, 2),
        "total_hazard": total_hazard,
        "max_hazard": max_hazard,
        "eliminated": eliminated
    }


def find_candidate_routes(
    G,
    start_node,
    end_node,
    initial_k,
    k_step,
    max_k,
    hazard_threshold
):
    candidate_routes = []

    for current_k in range(initial_k, max_k + 1, k_step):
        raw_routes = list(
            ox.routing.k_shortest_paths(G, start_node, end_node, k=current_k, weight="length")
        )

        unique_seen = set()
        evaluated = []

        for idx, route in enumerate(raw_routes, start=1):
            route_key = tuple(route)
            if route_key in unique_seen:
                continue
            unique_seen.add(route_key)

            evaluated.append(
                evaluate_route(G, route, idx, hazard_threshold)
            )

        if any(not r["eliminated"] for r in evaluated):
            candidate_routes = evaluated
            print(f"Valid routes found after searching {current_k} candidate paths.")
            break

    if not candidate_routes:
        raw_routes = list(
            ox.routing.k_shortest_paths(G, start_node, end_node, k=max_k, weight="length")
        )

        unique_seen = set()
        for idx, route in enumerate(raw_routes, start=1):
            route_key = tuple(route)
            if route_key in unique_seen:
                continue
            unique_seen.add(route_key)

            candidate_routes.append(
                evaluate_route(G, route, idx, hazard_threshold)
            )

    return candidate_routes


# =========================================================
# ACO FUNCTIONS
# =========================================================
def thesis_sort_key(route):
    return (route["max_hazard"], route["total_hazard"], route["distance"])


def numeric_score(route):
    return route["max_hazard"] * 1000 + route["total_hazard"] * 10 + route["distance"]


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


# =========================================================
# FINAL RESULT PROCESSING
# =========================================================
def finalize_routes(candidate_routes, pheromone, final_routes_to_show):
    sorted_routes = sorted(candidate_routes, key=thesis_sort_key)

    valid_routes = [r.copy() for r in sorted_routes if not r["eliminated"]]
    eliminated_routes = [r.copy() for r in sorted_routes if r["eliminated"]]

    valid_routes = valid_routes[:final_routes_to_show]

    remaining_slots = final_routes_to_show - len(valid_routes)
    if remaining_slots > 0:
        eliminated_routes = eliminated_routes[:remaining_slots]
    else:
        eliminated_routes = []

    for idx, route in enumerate(valid_routes, start=1):
        route["display_route_no"] = idx
        route["status"] = "Best" if idx == 1 else "Available"
        route["final_pheromone"] = round(pheromone.get(route["candidate_route_no"], 0), 4)

    for idx, route in enumerate(eliminated_routes, start=len(valid_routes) + 1):
        route["display_route_no"] = idx
        route["status"] = "Eliminated"
        route["final_pheromone"] = round(pheromone.get(route["candidate_route_no"], 0), 4)

    return valid_routes, eliminated_routes


def build_result_payload(valid_routes, eliminated_routes, candidate_routes):
    return {
        "summary": {
            "total_evaluated_candidate_routes": len(candidate_routes),
            "valid_routes_count": len(valid_routes),
            "eliminated_routes_count": len(eliminated_routes)
        },
        "valid_routes": valid_routes,
        "eliminated_routes": eliminated_routes
    }


# =========================================================
# OUTPUT FUNCTIONS
# =========================================================
def print_route(route, debug=False):
    print(f"Route {route['display_route_no']}")
    print(f"Distance: {route['distance']:.2f} m")
    print(f"Hazard Level: {route['max_hazard']}")
    print(f"Status: {route['status']}")
    if debug:
        print(f"Candidate Route No: {route['candidate_route_no']}")
        print(f"Final Pheromone: {route['final_pheromone']:.4f}")
    print()


def print_results(result, debug=False):
    print("\n====================================")
    print("ACO TEST RESULTS (UP TO 4 ROUTES)")
    print("====================================")
    print(f"Total evaluated candidate routes: {result['summary']['total_evaluated_candidate_routes']}")

    print("\n=== VALID ROUTES ===\n")
    if not result["valid_routes"]:
        print("No valid routes found.\n")
    else:
        for route in result["valid_routes"]:
            print_route(route, debug=debug)

    if result["eliminated_routes"]:
        print("=== ELIMINATED ROUTES ===\n")
        for route in result["eliminated_routes"]:
            print_route(route, debug=debug)


# =========================================================
# MAIN SIMULATION FUNCTION
# =========================================================
def simulate_routes(
    start_lat,
    start_lng,
    end_lat,
    end_lng,
    dist_meters=DIST_METERS,
    hazard_threshold=HAZARD_THRESHOLD,
    final_routes_to_show=FINAL_ROUTES_TO_SHOW,
    debug=DEBUG
):
    G = build_graph(start_lat, start_lng, end_lat, end_lng, dist_meters)
    start_node, end_node = get_nearest_nodes(G, start_lat, start_lng, end_lat, end_lng)

    assign_fake_hazards(G)

    candidate_routes = find_candidate_routes(
        G=G,
        start_node=start_node,
        end_node=end_node,
        initial_k=INITIAL_K,
        k_step=K_STEP,
        max_k=MAX_K,
        hazard_threshold=hazard_threshold
    )

    pheromone = run_aco(candidate_routes)

    valid_routes, eliminated_routes = finalize_routes(
        candidate_routes=candidate_routes,
        pheromone=pheromone,
        final_routes_to_show=final_routes_to_show
    )

    result = build_result_payload(valid_routes, eliminated_routes, candidate_routes)

    print_results(result, debug=debug)
    return result


# =========================================================
# RUN TEST
# =========================================================
if __name__ == "__main__":
    simulate_routes(
        start_lat=NOVO_LAT,
        start_lng=NOVO_LNG,
        end_lat=KENNETH_LAT,
        end_lng=KENNETH_LNG,
        debug=False
    )