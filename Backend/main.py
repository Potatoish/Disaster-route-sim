import csv
from datetime import datetime

import networkx as nx
import database

HAZARD_THRESHOLD = 3


def create_graph():
    G = nx.Graph()

    # Fetch nodes and edges from database
    nodes, edges = database.get_graph_data()

    # Add nodes
    for node in nodes:
        # expected:
        # node[0] = id
        # node[1] = name
        # node[2] = lat
        # node[3] = lng
        # optional:
        # node[4] = barangay
        # node[5] = level
        G.add_node(
            node[1],
            id=node[0] if len(node) > 0 else None,
            lat=node[2],
            lng=node[3],
            barangay=node[4] if len(node) > 4 else "",
            level=node[5] if len(node) > 5 else "safe"
        )

    # Add edges
    for edge in edges:
        # expected minimum:
        # edge[0] = source
        # edge[1] = target
        # edge[2] = distance
        #
        # optional:
        # edge[3] = hazard
        # edge[4] = road_name
        # edge[5] = passable

        source = edge[0]
        target = edge[1]
        distance = float(edge[2])

        hazard = edge[3] if len(edge) > 3 and edge[3] is not None else 1
        road_name = edge[4] if len(edge) > 4 else ""
        passable = edge[5] if len(edge) > 5 else True

        if passable:
            G.add_edge(
                source,
                target,
                distance=distance,
                hazard=hazard,
                road_name=road_name
            )

    return G


def get_path_distance(G, path):
    total = 0
    for i in range(len(path) - 1):
        total += G[path[i]][path[i + 1]]["distance"]
    return round(total, 2)


def get_path_total_hazard(G, path):
    total = 0
    for i in range(len(path) - 1):
        total += G[path[i]][path[i + 1]]["hazard"]
    return total


def get_max_hazard(G, path):
    max_haz = 0
    for i in range(len(path) - 1):
        hazard = G[path[i]][path[i + 1]]["hazard"]
        if hazard > max_haz:
            max_haz = hazard
    return max_haz


def path_with_coordinates(G, path):
    return [
        {
            "name": node,
            "lat": G.nodes[node]["lat"],
            "lng": G.nodes[node]["lng"]
        }
        for node in path
    ]


def find_routes(G, start, end, cutoff=6, max_candidates=20):
    print(f"Searching for routes from {start} to {end}...")

    try:
        simple_paths = list(nx.all_simple_paths(G, source=start, target=end, cutoff=cutoff))
    except nx.NetworkXNoPath:
        simple_paths = []

    all_routes = []

    for path in simple_paths:
        all_routes.append({
            "path": path,
            "distance": get_path_distance(G, path),
            "total_hazard": get_path_total_hazard(G, path),
            "max_hazard": get_max_hazard(G, path)
        })

    # remove duplicate paths
    unique = {}
    for route in all_routes:
        key = tuple(route["path"])
        if key not in unique:
            unique[key] = route

    all_routes = list(unique.values())

    # lexicographic ranking: safety first, then total hazard, then distance
    all_routes.sort(
        key=lambda x: (
            x["max_hazard"],
            x["total_hazard"],
            x["distance"]
        )
    )

    print(f"Found {len(all_routes)} unique routes\n")
    return all_routes[:max_candidates]


def classify_routes(routes):
    if not routes:
        return []

    classified = []
    best_assigned = False

    for route in routes:
        route_copy = route.copy()

        if route_copy["max_hazard"] > HAZARD_THRESHOLD:
            route_copy["category"] = "eliminated"
            route_copy["color"] = "#ef4444"
        elif not best_assigned:
            route_copy["category"] = "best"
            route_copy["color"] = "#22c55e"
            best_assigned = True
        else:
            route_copy["category"] = "available"
            route_copy["color"] = "#facc15"

        classified.append(route_copy)

    return classified[:10]


def export_csv(routes, start, end, filename=None):
    if filename is None:
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"routes_{timestamp}.csv"

    with open(filename, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(["Route", "Distance (km)", "Max Hazard", "Total Hazard", "Category", "Path"])

        for i, route in enumerate(routes, 1):
            path_str = " -> ".join(route["path"])
            writer.writerow([
                i,
                route["distance"],
                route["max_hazard"],
                route["total_hazard"],
                route["category"],
                path_str
            ])

    return filename


def get_locations():
    G = create_graph()
    return [
        {
            "name": node,
            "lat": G.nodes[node]["lat"],
            "lng": G.nodes[node]["lng"],
            "barangay": G.nodes[node].get("barangay", ""),
            "level": G.nodes[node].get("level", "safe")
        }
        for node in G.nodes()
    ]


def simulate(start, end, hazard_type="Flood"):
    G = create_graph()

    if start not in G.nodes():
        return {
            "error": True,
            "message": f"Start location '{start}' not found in graph",
            "valid_locations": list(G.nodes())
        }

    if end not in G.nodes():
        return {
            "error": True,
            "message": f"End location '{end}' not found in graph",
            "valid_locations": list(G.nodes())
        }

    if start == end:
        return {
            "error": True,
            "message": "Start and end locations must be different"
        }

    if not nx.has_path(G, start, end):
        return {
            "error": True,
            "message": f"No path exists between '{start}' and '{end}'"
        }

    routes = find_routes(G, start, end)
    classified = classify_routes(routes)

    for route in classified:
        route["path_coordinates"] = path_with_coordinates(G, route["path"])

    return {
        "error": False,
        "start": start,
        "end": end,
        "hazard_type": hazard_type,
        "safe_threshold": HAZARD_THRESHOLD,
        "routes": classified
    }


if __name__ == "__main__":
    result = simulate("Novo Pinagbuhatan", "2 Centennial Street, Pinagbuhatan")

    if result.get("error"):
        print(f"Error: {result['message']}")
    else:
        print("\nEvacuation Route Simulation")
        print(f"From: {result['start']}")
        print(f"To: {result['end']}")
        print(f"Hazard: {result['hazard_type']}\n")

        if not result["routes"]:
            print("No routes found!")
        else:
            for i, route in enumerate(result["routes"], 1):
                print(
                    f"Route {i}: "
                    f"{route['distance']} km | "
                    f"Max Hazard: {route['max_hazard']} | "
                    f"Total Hazard: {route['total_hazard']} | "
                    f"{route['category'].upper()}"
                )

            csv_file = export_csv(result["routes"], result["start"], result["end"])
            print(f"\nExported to: {csv_file}")