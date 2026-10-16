import sys

sys.dont_write_bytecode = True

from flood_scenario import describe_flood_start
from osm_routing import parse_route_pin, simulate_flood_to_evacuation_sites, simulate_osm_routes


def with_flood_scenario(result, start_location):
    """A finished flood run also says how deep the scenario's water is at its
    start pin, for the flood intro (flood-intro.js)."""
    if isinstance(result, dict) and not result.get("error"):
        result["flood_scenario"] = describe_flood_start(start_location["lat"], start_location["lng"])
    return result

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

    start_location, start_error = parse_route_pin(start, "Start")
    if start_error:
        return {
            "error": True,
            "message": start_error
        }

    end_location, end_error = parse_route_pin(end, "End")
    if end_error:
        return {
            "error": True,
            "message": end_error
        }

    try:
        result = simulate_osm_routes(
            start_name=start_location["name"],
            start_lat=start_location["lat"],
            start_lng=start_location["lng"],
            end_name=end_location["name"],
            end_lat=end_location["lat"],
            end_lng=end_location["lng"],
            hazard_type=hazard_type,
            barangay_name=barangay,
        )
        return with_flood_scenario(result, start_location)

    except Exception as e:
        return {
            "error": True,
            "message": f"OSM routing failed: {str(e)}"
        }


def simulate_to_evacuation_site(start, hazard_type="Flood", barangay=None):
    """A flood run whose destination is the barangay's evacuation sites: the
    run picks the site (simulate_flood_to_evacuation_sites)."""
    if not start:
        return {
            "error": True,
            "message": "Start location is required"
        }

    start_location, start_error = parse_route_pin(start, "Start")
    if start_error:
        return {
            "error": True,
            "message": start_error
        }

    try:
        return with_flood_scenario(simulate_flood_to_evacuation_sites(
            start_name=start_location["name"],
            start_lat=start_location["lat"],
            start_lng=start_location["lng"],
            hazard_type=hazard_type,
            barangay_name=barangay,
        ), start_location)
    except Exception as e:
        return {
            "error": True,
            "message": f"OSM routing failed: {str(e)}"
        }
