import csv
from datetime import datetime

import networkx as nx
from data import database

HAZARD_THRESHOLD = 3


def create_graph():
    G = nx.Graph()
    nodes, edges = database.get_graph_data()
    hazards = database.get_hazard_data()  # ← dagdag

    for node in nodes:
        G.add_node(
        node[1],
        id=node[0],
        lat=float(node[2]),
        lng=float(node[3]),
        barangay=node[4]
    )
        
    for edge in edges:
        source = edge[0]
        target = edge[1]
        distance = float(edge[2])
        hazard = int(edge[3]) if edge[3] is not None else 1  # Default hazard level is 1 (Safe)

        G.add_edge(source, target, distance=distance, hazard=hazard)

    return G


def infer_barangay(name):
    lower = str(name).lower()
    if "sta. lucia" in lower or "sta lucia" in lower:
        return "Sta. Lucia"
    return "Pinagbuhatan"


def get_path_distance(G, path):
    return round(
        sum(G[path[i]][path[i + 1]]["distance"] for i in range(len(path) - 1)),
        2
    )


def get_path_total_hazard(G, path):
    return sum(G[path[i]][path[i + 1]]["hazard"] for i in range(len(path) - 1))


def get_max_hazard(G, path):
    if len(path) < 2:
        return 0
    return max(G[path[i]][path[i + 1]]["hazard"] for i in range(len(path) - 1))


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
    try:
        paths = list(nx.all_simple_paths(G, start, end, cutoff=cutoff))
    except nx.NetworkXNoPath:
        paths = []

    routes = []
    for path in paths:
        routes.append({
            "path": path,
            "distance": get_path_distance(G, path),
            "total_hazard": get_path_total_hazard(G, path),
            "max_hazard": get_max_hazard(G, path)
        })

    unique = {}
    for route in routes:
        key = tuple(route["path"])
        if key not in unique:
            unique[key] = route

    routes = list(unique.values())

    routes.sort(key=lambda x: (
        x["max_hazard"],
        x["total_hazard"],
        x["distance"]
    ))

    return routes[:5]

def classify_routes(routes):
    classified = []
    best_assigned = False

    for route in routes:
        r = route.copy()

        if r["max_hazard"] > HAZARD_THRESHOLD:
            r["category"] = "eliminated"
            r["color"] = "#ef4444"
        elif not best_assigned:
            r["category"] = "best"
            r["color"] = "#22c55e"
            best_assigned = True
        else:
            r["category"] = "available"
            r["color"] = "#f59e0b"

        classified.append(r)

    return classified[:10]


def get_locations():
    G = create_graph()
    hazards = database.get_hazard_data()
    print("Hazards loaded:", hazards)

    return [
        {
            "name": node,
            "lat": G.nodes[node]["lat"],
            "lng": G.nodes[node]["lng"],
            "barangay": G.nodes[node].get("barangay", ""),
            "haz": hazards.get(G.nodes[node].get("id"), None)
        }
        for node in G.nodes()
    ]

def simulate(start, end, hazard_type="Flood"):
    G = create_graph()

    if start not in G.nodes():
        return {
            "error": True,
            "message": f"Start location '{start}' not found",
            "valid_locations": list(G.nodes())
        }

    if end not in G.nodes():
        return {
            "error": True,
            "message": f"End location '{end}' not found",
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


def export_csv(routes, filename=None):
    if filename is None:
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"routes_{timestamp}.csv"

    with open(filename, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(["Route", "Category", "Distance (km)", "Max Hazard", "Total Hazard", "Path"])

        for i, route in enumerate(routes, 1):
            writer.writerow([
                i,
                route["category"],
                route["distance"],
                route["max_hazard"],
                route["total_hazard"],
                " -> ".join(route["path"])
            ])
    return filename