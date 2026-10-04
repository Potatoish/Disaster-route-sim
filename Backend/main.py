import sys

sys.dont_write_bytecode = True

from osm_routing import parse_route_pin, simulate_osm_routes

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
        return result

    except Exception as e:
        return {
            "error": True,
            "message": f"OSM routing failed: {str(e)}"
        }
