import sys

sys.dont_write_bytecode = True

import csv
from datetime import datetime

from data import database
from osm_routing import (
    debug_print,
    simulate_osm_routes,
    resolve_point_hazard,
    prepare_routing_graph,
    warm_static_caches,
)


def get_locations():
    nodes, _ = database.get_graph_data()

    locations = []

    for node in nodes:
        lat = float(node[2])
        lng = float(node[3])

        try:
            node_hazard = resolve_point_hazard(lat, lng)
        except Exception:
            node_hazard = {
                "haz": None,
                "flood_var": None,
                "hazard_source": None,
            }
        locations.append({
            "name": node[1],
            "lat": lat,
            "lng": lng,
            "barangay": node[4],
            "haz": node_hazard["haz"],
            "flood_var": node_hazard["flood_var"],
            "hazard_source": node_hazard["hazard_source"],
        })

    return locations

def simulate(start, end, hazard_type="Flood", barangay=None):
    if not start:
        return {
            "error": True,
            "message": "Start location is required"
        }

    if not end:
        return {
            "error": True,
            "message": "End location is required"
        }

    if start == end:
        return {
            "error": True,
            "message": "Start and end locations must be different"
        }

    start_location = database.get_location_by_name(start)
    end_location = database.get_location_by_name(end)

    if not start_location:
        return {
            "error": True,
            "message": f"Start location '{start}' not found"
        }

    if not end_location:
        return {
            "error": True,
            "message": f"End location '{end}' not found"
        }

    try:
        scope_barangay = barangay or start_location.get("barangay") or end_location.get("barangay")
        result = simulate_osm_routes(
            start_name=start_location["name"],
            start_lat=start_location["lat"],
            start_lng=start_location["lng"],
            end_name=end_location["name"],
            end_lat=end_location["lat"],
            end_lng=end_location["lng"],
            hazard_type=hazard_type,
            barangay_name=scope_barangay,
        )
        return result

    except Exception as e:
        return {
            "error": True,
            "message": f"OSM routing failed: {str(e)}"
        }


def prewarm_simulation(start, end, barangay=None):
    if not start:
        return {
            "error": True,
            "message": "Start location is required"
        }

    if not end:
        return {
            "error": True,
            "message": "End location is required"
        }

    if start == end:
        return {
            "error": True,
            "message": "Start and end locations must be different"
        }

    start_location = database.get_location_by_name(start)
    end_location = database.get_location_by_name(end)

    if not start_location or not end_location:
        return {
            "error": True,
            "message": "Start or end location not found"
        }

    try:
        scope_barangay = barangay or start_location.get("barangay") or end_location.get("barangay")
        debug_print("\n" + "-" * 60)
        debug_print("[OSM] PREWARM START")
        debug_print(f"[OSM] From: {start_location['name']} ({start_location['lat']}, {start_location['lng']})")
        debug_print(f"[OSM] To  : {end_location['name']} ({end_location['lat']}, {end_location['lng']})")
        if scope_barangay:
            debug_print(f"[OSM] Selection context: {scope_barangay}")
        prepare_routing_graph(
            start_location["lat"],
            start_location["lng"],
            end_location["lat"],
            end_location["lng"],
            barangay_name=scope_barangay,
        )
        debug_print("[OSM] PREWARM END")
        debug_print("-" * 60 + "\n")
        return {
            "error": False,
            "message": "Simulation context prepared"
        }
    except Exception as e:
        return {
            "error": True,
            "message": f"Warmup failed: {str(e)}"
        }


def warm_startup_data():
    warm_static_caches()


def export_csv(routes, filename=None):
    if filename is None:
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"routes_{timestamp}.csv"

    with open(filename, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow([
            "Route",
            "Category",
            "Status",
            "Distance (m)",
            "Max Hazard",
            "Total Hazard",
            "Eliminated",
            "Path Coordinates Count"
        ])

        for route in routes:
            writer.writerow([
                route.get("display_route_no", ""),
                route.get("category", ""),
                route.get("status", ""),
                route.get("distance", ""),
                route.get("max_hazard", ""),
                route.get("total_hazard", ""),
                route.get("eliminated", ""),
                len(route.get("path_coordinates", []))
            ])

    return filename
