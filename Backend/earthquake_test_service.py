from threading import RLock

import osmnx as ox

from data import database
from earthquake_test_data import (
    get_earthquake_test_dataset,
    is_supported_earthquake_barangay,
)
from osm_routing import (
    FINAL_ROUTES_TO_SHOW,
    HAZARD_THRESHOLD,
    MAX_ELIMINATED_ROUTES_TO_SHOW,
    clip_graph_to_boundary,
    edge_traversal_cost,
    estimate_boundary_graph_radius,
    extract_route_street_path,
    get_barangay_boundary,
    get_edge_geometry,
    hydrate_route_edge_records,
    normalize_barangay_name,
    path_to_coords,
    resolve_route_edge_records,
    route_path_signature,
    route_pheromone_score,
    run_aco,
    select_display_routes,
    select_endpoint_node,
    warm_static_caches,
)

_EARTHQUAKE_GRAPH_CACHE = {}
_EARTHQUAKE_GRAPH_LOCK = RLock()

SUPPORTED_EARTHQUAKE_BARANGAY = "pinagbuhatan"

EARTHQUAKE_VIEW_CONFIG = {
    "overall": {
        "label": "Overall",
        "hazard_attr": "eq_overall",
        "description": "Combined liquefaction, ground-shaking, and fault-line exposure before distance.",
    },
    "liquefaction": {
        "label": "Liquefaction",
        "hazard_attr": "eq_liquefaction",
        "description": "Liquefaction exposure before distance.",
    },
    "ground_shaking": {
        "label": "Ground Shaking",
        "hazard_attr": "eq_ground_shaking",
        "description": "Ground-shaking exposure before distance.",
    },
    "fault_line": {
        "label": "Fault Line",
        "hazard_attr": "eq_fault_line",
        "description": "Fault-line proximity exposure before distance.",
    },
}


def _lens_hazard_factor(hazard_value):
    return max(0.0, (int(hazard_value) - 1) / 4.0)


def _format_hazard_signature(maxima):
    return (
        f"L{int(maxima['liquefaction'])}"
        f" / G{int(maxima['ground_shaking'])}"
        f" / F{int(maxima['fault_line'])}"
    )


def _resolve_layer_hazard(edge_geom, layer_zones):
    severity = 1

    for zone in layer_zones:
        if zone["prepared"].intersects(edge_geom):
            severity = max(severity, int(zone["severity"]))

    return severity


def _get_earthquake_test_graph(barangay_name):
    canonical_name = normalize_barangay_name(barangay_name)
    boundary = get_barangay_boundary(canonical_name)
    if boundary is None:
        raise ValueError(f"No barangay boundary found for '{barangay_name}'")

    with _EARTHQUAKE_GRAPH_LOCK:
        cached_graph = _EARTHQUAKE_GRAPH_CACHE.get(canonical_name)
        if cached_graph is not None:
            return cached_graph

        warm_static_caches()
        boundary_geometry = boundary["geometry"]
        centroid = boundary_geometry.centroid
        radius_m = estimate_boundary_graph_radius(boundary_geometry)

        graph = ox.graph_from_point(
            (float(centroid.y), float(centroid.x)),
            dist=radius_m,
            network_type="drive",
            simplify=True,
        )
        graph = clip_graph_to_boundary(graph, boundary_geometry)

        _EARTHQUAKE_GRAPH_CACHE[canonical_name] = graph
        return graph


def _annotate_graph_with_earthquake_hazards(graph, dataset):
    if graph.graph.get("earthquake_dataset") == dataset["canonical_barangay"]:
        return graph

    for u, v, key, edge_data in graph.edges(keys=True, data=True):
        edge_geom = get_edge_geometry(graph, u, v, edge_data)
        liquefaction = _resolve_layer_hazard(
            edge_geom,
            dataset["layer_zones"]["liquefaction"],
        )
        ground_shaking = _resolve_layer_hazard(
            edge_geom,
            dataset["layer_zones"]["ground_shaking"],
        )
        fault_line = _resolve_layer_hazard(
            edge_geom,
            dataset["layer_zones"]["fault_line"],
        )

        edge_data["eq_liquefaction"] = liquefaction
        edge_data["eq_ground_shaking"] = ground_shaking
        edge_data["eq_fault_line"] = fault_line
        edge_data["eq_overall"] = max(liquefaction, ground_shaking, fault_line)

    graph.graph["earthquake_dataset"] = dataset["canonical_barangay"]
    return graph


def _clone_graph_for_view(base_graph, view_key):
    hazard_attr = EARTHQUAKE_VIEW_CONFIG[view_key]["hazard_attr"]
    graph = base_graph.copy()

    for _, _, _, edge_data in graph.edges(keys=True, data=True):
        edge_data["hazard"] = int(edge_data.get(hazard_attr, 1))
        edge_data["flood_var"] = None
        edge_data["hazard_source"] = "earthquake_test"
        edge_data["route_cost"] = edge_traversal_cost(edge_data)

    return graph


def _build_route_maxima(resolved_edges):
    maxima = {
        "liquefaction": 1,
        "ground_shaking": 1,
        "fault_line": 1,
    }

    for _, _, _, edge_data in resolved_edges:
        maxima["liquefaction"] = max(maxima["liquefaction"], int(edge_data.get("eq_liquefaction", 1)))
        maxima["ground_shaking"] = max(maxima["ground_shaking"], int(edge_data.get("eq_ground_shaking", 1)))
        maxima["fault_line"] = max(maxima["fault_line"], int(edge_data.get("eq_fault_line", 1)))

    return maxima


def _evaluate_earthquake_route(base_graph, route, evacuation_site, view_key):
    resolved_edges = hydrate_route_edge_records(base_graph, route.get("path_edges"))
    if not resolved_edges:
        resolved_edges = resolve_route_edge_records(base_graph, route.get("path", []))

    total_distance = 0.0
    risk_distance = 0.0
    unsafe_distance = 0.0
    max_hazard = 1
    eliminated = False
    threshold_exceedance_count = 0
    hazard_breakdown = {}

    lens_unsafe_distances = {
        "liquefaction": 0.0,
        "ground_shaking": 0.0,
        "fault_line": 0.0,
    }

    for _, _, _, edge_data in resolved_edges:
        length = max(float(edge_data.get("length", 0)), 1.0)
        liquefaction = int(edge_data.get("eq_liquefaction", 1))
        ground_shaking = int(edge_data.get("eq_ground_shaking", 1))
        fault_line = int(edge_data.get("eq_fault_line", 1))

        total_distance += length

        if liquefaction > HAZARD_THRESHOLD:
            lens_unsafe_distances["liquefaction"] += length
        if ground_shaking > HAZARD_THRESHOLD:
            lens_unsafe_distances["ground_shaking"] += length
        if fault_line > HAZARD_THRESHOLD:
            lens_unsafe_distances["fault_line"] += length

        if view_key == "overall":
            hazard_value = max(liquefaction, ground_shaking, fault_line)
            risk_distance += length * (
                _lens_hazard_factor(liquefaction)
                + _lens_hazard_factor(ground_shaking)
                + _lens_hazard_factor(fault_line)
            )
        else:
            hazard_attr = EARTHQUAKE_VIEW_CONFIG[view_key]["hazard_attr"]
            hazard_value = int(edge_data.get(hazard_attr, 1))
            risk_distance += length * _lens_hazard_factor(hazard_value)

        max_hazard = max(max_hazard, hazard_value)
        hazard_breakdown[str(hazard_value)] = hazard_breakdown.get(str(hazard_value), 0) + 1

        if hazard_value > HAZARD_THRESHOLD:
            eliminated = True
            threshold_exceedance_count += 1
            unsafe_distance += length

    maxima = _build_route_maxima(resolved_edges)
    hazard_signature = _format_hazard_signature(maxima)

    return {
        "path": list(route.get("path", [])),
        "path_edges": list(route.get("path_edges", [])),
        "path_coordinates": path_to_coords(
            base_graph,
            route.get("path", []),
            resolved_edges=resolved_edges,
        ),
        "street_path": extract_route_street_path(
            base_graph,
            route.get("path", []),
            resolved_edges=resolved_edges,
        ),
        "distance": round(total_distance, 2),
        "risk_distance": round(risk_distance, 2),
        "unsafe_distance": round(unsafe_distance, 2),
        "max_hazard": max_hazard,
        "threshold_exceedance_count": threshold_exceedance_count,
        "hazard_breakdown": dict(sorted(hazard_breakdown.items(), key=lambda item: int(item[0]))),
        "eliminated": eliminated,
        "destination_id": evacuation_site["id"],
        "destination_name": evacuation_site["name"],
        "destination_lat": float(evacuation_site["lat"]),
        "destination_lng": float(evacuation_site["lng"]),
        "lens_key": view_key,
        "lens_label": EARTHQUAKE_VIEW_CONFIG[view_key]["label"],
        "simulation_mode": "earthquake_test",
        "hazard_signature": hazard_signature,
        "hazard_maxima": maxima,
        "lens_unsafe_distances": {
            key: round(value, 2)
            for key, value in lens_unsafe_distances.items()
        },
        "final_pheromone": round(
            route.get("final_pheromone", 0.0),
            4,
        ),
        "evidence_chips": [
            {"label": "Evac", "value": evacuation_site["name"]},
            {"label": "Lens", "value": EARTHQUAKE_VIEW_CONFIG[view_key]["label"]},
            {"label": "Hazards", "value": hazard_signature},
        ],
        "info_rows": [
            ["Evacuation Site", evacuation_site["name"]],
            ["Lens", EARTHQUAKE_VIEW_CONFIG[view_key]["label"]],
            ["Hazards", hazard_signature],
        ],
        "reason": (
            f"Earthquake test route to {evacuation_site['name']} ranked by "
            f"{EARTHQUAKE_VIEW_CONFIG[view_key]['description'].lower()}"
        ),
        "elimination_reason": (
            f"Contains {threshold_exceedance_count} segment(s) above earthquake threshold {HAZARD_THRESHOLD}"
            if eliminated
            else None
        ),
    }


def _view_sort_key(route):
    return (
        route["unsafe_distance"] > 0,
        route["unsafe_distance"],
        route["risk_distance"],
        -route.get("final_pheromone", 0.0),
        route["distance"],
    )


def _build_view_summary(view_key, routes, evacuation_sites):
    best_route = next((route for route in routes if route["category"] != "eliminated"), None)
    active_destination = best_route or (routes[0] if routes else None)

    return {
        "view_key": view_key,
        "view_label": EARTHQUAKE_VIEW_CONFIG[view_key]["label"],
        "description": EARTHQUAKE_VIEW_CONFIG[view_key]["description"],
        "candidate_sites_considered": len(evacuation_sites),
        "safe_route_count": sum(1 for route in routes if route["category"] != "eliminated"),
        "eliminated_route_count": sum(1 for route in routes if route["category"] == "eliminated"),
        "selected_evacuation_site": (
            {
                "id": active_destination["destination_id"],
                "name": active_destination["destination_name"],
                "lat": active_destination["destination_lat"],
                "lng": active_destination["destination_lng"],
            }
            if active_destination
            else None
        ),
        "best_distance": best_route["distance"] if best_route else None,
        "for_test_only": True,
    }


def _finalize_earthquake_view_routes(start_name, routes, evacuation_sites, view_key):
    sorted_routes = sorted(routes, key=_view_sort_key)
    valid_routes = [route.copy() for route in sorted_routes if not route["eliminated"]]
    eliminated_routes = [route.copy() for route in sorted_routes if route["eliminated"]]

    if valid_routes:
        eliminated_limit = min(MAX_ELIMINATED_ROUTES_TO_SHOW, len(eliminated_routes))
        eliminated_routes = select_display_routes(eliminated_routes, eliminated_limit)
        valid_routes = select_display_routes(
            valid_routes,
            FINAL_ROUTES_TO_SHOW - len(eliminated_routes),
        )
    else:
        eliminated_routes = select_display_routes(eliminated_routes, FINAL_ROUTES_TO_SHOW)

    final_routes = []
    for index, route in enumerate(valid_routes, start=1):
        route["display_route_no"] = index
        route["category"] = "best" if index == 1 else "available"
        route["status"] = "Best" if index == 1 else "Available"
        route["color"] = "#22c55e" if index == 1 else "#f59e0b"
        route["path_label"] = f"{start_name} -> {route['destination_name']}"
        route["segments"] = max(1, len(route.get("path", [])) - 1)
        final_routes.append(route)

    next_index = len(final_routes) + 1
    for index, route in enumerate(eliminated_routes, start=next_index):
        route["display_route_no"] = index
        route["category"] = "eliminated"
        route["status"] = "Eliminated"
        route["color"] = "#ef4444"
        route["path_label"] = f"{start_name} -> {route['destination_name']}"
        route["segments"] = max(1, len(route.get("path", [])) - 1)
        final_routes.append(route)

    summary = _build_view_summary(view_key, final_routes, evacuation_sites)
    return {
        "view_key": view_key,
        "view_label": EARTHQUAKE_VIEW_CONFIG[view_key]["label"],
        "routes": final_routes,
        "summary": summary,
    }


def _collect_view_candidates(base_graph, start_location, evacuation_sites, view_key):
    view_graph = _clone_graph_for_view(base_graph, view_key)
    start_node = select_endpoint_node(
        view_graph,
        start_location["lat"],
        start_location["lng"],
        "start",
    )

    collected = {}
    for evacuation_site in evacuation_sites:
        end_node = select_endpoint_node(
            view_graph,
            evacuation_site["lat"],
            evacuation_site["lng"],
            "end",
        )
        candidate_routes, edge_pheromone = run_aco(view_graph, start_node, end_node)

        for route in candidate_routes:
            route_key = (evacuation_site["id"], route_path_signature(route))
            if route_key in collected:
                continue

            route_copy = route.copy()
            route_copy["final_pheromone"] = route_pheromone_score(
                route_copy.get("path", []),
                edge_pheromone,
            )
            collected[route_key] = _evaluate_earthquake_route(
                base_graph,
                route_copy,
                evacuation_site,
                view_key,
            )

    return list(collected.values())


def get_earthquake_test_evacuation_sites(barangay_name):
    if not is_supported_earthquake_barangay(barangay_name):
        return {
            "error": True,
            "message": "Earthquake test mode is currently available only for Pinagbuhatan.",
        }

    try:
        dataset = get_earthquake_test_dataset(barangay_name)
        return {
            "error": False,
            "for_test_only": True,
            "barangay": dataset["display_barangay"],
            "evacuation_sites": dataset["evacuation_sites"],
        }
    except Exception as exc:
        return {
            "error": True,
            "message": f"Failed to load earthquake evacuation sites: {exc}",
        }


def prewarm_earthquake_test(barangay_name):
    if not is_supported_earthquake_barangay(barangay_name):
        return {
            "error": True,
            "message": "Earthquake test mode is currently available only for Pinagbuhatan.",
        }

    try:
        dataset = get_earthquake_test_dataset(barangay_name)
        _annotate_graph_with_earthquake_hazards(
            _get_earthquake_test_graph(barangay_name),
            dataset,
        )
        return {
            "error": False,
            "for_test_only": True,
            "barangay": dataset["display_barangay"],
            "message": "Earthquake test context prepared",
        }
    except Exception as exc:
        return {
            "error": True,
            "message": f"Earthquake test warmup failed: {exc}",
        }


def simulate_earthquake_test(start, barangay_name):
    if not start:
        return {
            "error": True,
            "message": "Start location is required",
        }

    if not is_supported_earthquake_barangay(barangay_name):
        return {
            "error": True,
            "message": "Earthquake test mode is currently available only for Pinagbuhatan.",
        }

    start_location = database.get_location_by_name(start)
    if not start_location:
        return {
            "error": True,
            "message": f"Start location '{start}' not found",
        }

    if normalize_barangay_name(start_location.get("barangay")) != SUPPORTED_EARTHQUAKE_BARANGAY:
        return {
            "error": True,
            "message": "The selected start node is outside Pinagbuhatan earthquake test coverage.",
        }

    try:
        dataset = get_earthquake_test_dataset(barangay_name)
        base_graph = _annotate_graph_with_earthquake_hazards(
            _get_earthquake_test_graph(barangay_name),
            dataset,
        )

        views = {}
        for view_key in EARTHQUAKE_VIEW_CONFIG:
            candidates = _collect_view_candidates(
                base_graph,
                start_location,
                dataset["evacuation_sites"],
                view_key,
            )
            views[view_key] = _finalize_earthquake_view_routes(
                start_location["name"],
                candidates,
                dataset["evacuation_sites"],
                view_key,
            )

        return {
            "error": False,
            "for_test_only": True,
            "simulation_mode": "earthquake_test",
            "hazard_type": "Earthquake",
            "barangay": dataset["display_barangay"],
            "start": start_location["name"],
            "safe_threshold": HAZARD_THRESHOLD,
            "evacuation_sites": dataset["evacuation_sites"],
            "hazard_layers": dataset["layer_payloads"],
            "active_view": "overall",
            "views": views,
        }
    except Exception as exc:
        return {
            "error": True,
            "message": f"Earthquake test simulation failed: {exc}",
        }
