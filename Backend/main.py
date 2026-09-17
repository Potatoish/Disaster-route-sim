import sys

sys.dont_write_bytecode = True

from threading import RLock

from data import database
from osm_routing import (
    simulate_osm_routes,
    resolve_point_hazard,
)

_LOCATIONS_CACHE = None
_LOCATIONS_CACHE_LOCK = RLock()

def get_locations():
    global _LOCATIONS_CACHE

    with _LOCATIONS_CACHE_LOCK:
        if _LOCATIONS_CACHE is not None:
            return [location.copy() for location in _LOCATIONS_CACHE]

    nodes = database.get_nodes()
    if nodes is None:
        return None

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

    if locations:
        with _LOCATIONS_CACHE_LOCK:
            _LOCATIONS_CACHE = locations

    return [location.copy() for location in locations]

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
