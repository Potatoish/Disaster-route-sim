from threading import RLock
import time

import networkx as nx
import osmnx as ox

from data import database
from earthquake_data import (
    get_earthquake_dataset,
    get_supported_earthquake_barangay_names,
    is_supported_earthquake_barangay,
)
from osm_routing import (
    FINAL_ROUTES_TO_SHOW,
    GRAPH_NETWORK_TYPE,
    HAZARD_THRESHOLD,
    MAX_ELIMINATED_ROUTES_TO_SHOW,
    NUM_ITERATIONS,
    build_route_point,
    clip_graph_to_boundary,
    debug_print,
    edge_traversal_cost,
    estimate_boundary_graph_radius,
    get_barangay_base_graph,
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
from simulation_progress import reset_progress

_EARTHQUAKE_GRAPH_CACHE = {}
_EARTHQUAKE_GRAPH_LOCK = RLock()
_EARTHQUAKE_ANNOTATION_LOCK = RLock()

EARTHQUAKE_VIEW_CONFIG = {
    "overall": {
        "label": "Overall",
        "hazard_attr": "eq_overall",
        "description": "Combined liquefaction and ground-shaking exposure first, ACO pheromone second, distance third.",
    },
    "liquefaction": {
        "label": "Liquefaction",
        "hazard_attr": "eq_liquefaction",
        "description": "Liquefaction exposure first, ACO pheromone second, distance third.",
    },
    "ground_shaking": {
        "label": "Ground Shaking",
        "hazard_attr": "eq_ground_shaking",
        "description": "Ground-shaking exposure first, ACO pheromone second, distance third.",
    },
}


def _format_supported_barangay_list():
    names = get_supported_earthquake_barangay_names()
    if not names:
        return "configured barangays"
    if len(names) == 1:
        return names[0]
    if len(names) == 2:
        return f"{names[0]} and {names[1]}"
    return f"{', '.join(names[:-1])}, and {names[-1]}"


def _unsupported_earthquake_scope_message():
    return f"Earthquake routing is currently available only for {_format_supported_barangay_list()}."


def _lens_hazard_factor(hazard_value):
    return max(0.0, (int(hazard_value) - 1) / 4.0)


def _format_hazard_signature(maxima):
    return (
        f"L{int(maxima['liquefaction'])}"
        f" / G{int(maxima['ground_shaking'])}"
    )


def _resolve_layer_hazard(edge_geom, layer_zones):
    severity = 1

    for zone in layer_zones:
        if zone["prepared"].intersects(edge_geom):
            severity = max(severity, int(zone["severity"]))

    return severity


def _get_earthquake_graph(barangay_name):
    canonical_name = normalize_barangay_name(barangay_name)
    boundary = get_barangay_boundary(canonical_name)
    if boundary is None:
        raise ValueError(f"No barangay boundary found for '{barangay_name}'")

    cached_graph = _EARTHQUAKE_GRAPH_CACHE.get(canonical_name)
    if cached_graph is not None:
        debug_print(f"[EQ] Using cached graph for {boundary['display_name']}")
        return cached_graph

    with _EARTHQUAKE_GRAPH_LOCK:
        cached_graph = _EARTHQUAKE_GRAPH_CACHE.get(canonical_name)
        if cached_graph is not None:
            debug_print(f"[EQ] Using cached graph for {boundary['display_name']}")
            return cached_graph

        warm_static_caches()
        boundary_geometry = boundary["geometry"]
        graph = get_barangay_base_graph(canonical_name)
        if graph is None:
            centroid = boundary_geometry.centroid
            radius_m = estimate_boundary_graph_radius(boundary_geometry)
            debug_print(f"[EQ] Building graph for {boundary['display_name']} with radius {radius_m:.1f} meters")
            debug_print(f"[EQ] Graph center: ({float(centroid.y)}, {float(centroid.x)})")
            graph = ox.graph_from_point(
                (float(centroid.y), float(centroid.x)),
                dist=radius_m,
                network_type=GRAPH_NETWORK_TYPE,
                simplify=True,
            )
        graph = clip_graph_to_boundary(graph, boundary_geometry)
        debug_print(f"[EQ] Graph loaded: {len(graph.nodes)} nodes, {len(graph.edges)} edges")

        _EARTHQUAKE_GRAPH_CACHE[canonical_name] = graph
        return graph


def _annotate_graph_with_earthquake_hazards(graph, dataset):
    if graph.graph.get("earthquake_dataset") == dataset["canonical_barangay"]:
        debug_print(f"[EQ] Reusing hazard annotations for {dataset['display_barangay']}")
        return graph

    with _EARTHQUAKE_ANNOTATION_LOCK:
        if graph.graph.get("earthquake_dataset") == dataset["canonical_barangay"]:
            debug_print(f"[EQ] Reusing hazard annotations for {dataset['display_barangay']}")
            return graph

        annotation_started = time.perf_counter()
        debug_print(f"[EQ] Annotating earthquake hazards on {len(graph.edges)} edges")

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

            edge_data["eq_liquefaction"] = liquefaction
            edge_data["eq_ground_shaking"] = ground_shaking
            edge_data["eq_overall"] = max(liquefaction, ground_shaking)

        graph.graph["earthquake_dataset"] = dataset["canonical_barangay"]
        debug_print(f"[EQ] Hazard annotation complete in {time.perf_counter() - annotation_started:.2f}s")
    return graph


def _clone_graph_for_view(base_graph, view_key):
    hazard_attr = EARTHQUAKE_VIEW_CONFIG[view_key]["hazard_attr"]
    graph = base_graph.copy()

    for _, _, _, edge_data in graph.edges(keys=True, data=True):
        edge_data["hazard"] = int(edge_data.get(hazard_attr, 1))
        edge_data["flood_var"] = None
        edge_data["hazard_source"] = "earthquake"
        edge_data["route_cost"] = edge_traversal_cost(edge_data)

    return graph


def _build_route_maxima(resolved_edges):
    maxima = {
        "liquefaction": 1,
        "ground_shaking": 1,
    }

    for _, _, _, edge_data in resolved_edges:
        maxima["liquefaction"] = max(maxima["liquefaction"], int(edge_data.get("eq_liquefaction", 1)))
        maxima["ground_shaking"] = max(maxima["ground_shaking"], int(edge_data.get("eq_ground_shaking", 1)))

    return maxima


def _evaluate_earthquake_route(base_graph, route, start_location, evacuation_site, view_key):
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
    }

    for _, _, _, edge_data in resolved_edges:
        length = max(float(edge_data.get("length", 0)), 1.0)
        liquefaction = int(edge_data.get("eq_liquefaction", 1))
        ground_shaking = int(edge_data.get("eq_ground_shaking", 1))

        total_distance += length

        if liquefaction > HAZARD_THRESHOLD:
            lens_unsafe_distances["liquefaction"] += length
        if ground_shaking > HAZARD_THRESHOLD:
            lens_unsafe_distances["ground_shaking"] += length

        if view_key == "overall":
            hazard_value = max(liquefaction, ground_shaking)
            risk_distance += length * (
                _lens_hazard_factor(liquefaction)
                + _lens_hazard_factor(ground_shaking)
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
            start_point=build_route_point(start_location["lat"], start_location["lng"]),
            end_point=build_route_point(evacuation_site["lat"], evacuation_site["lng"]),
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
        "simulation_mode": "earthquake",
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
            f"Earthquake route to {evacuation_site['name']} ranked by "
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
    selected_route = next((route for route in routes if route["category"] != "eliminated"), None)
    if selected_route is None and routes:
        selected_route = routes[0]

    return {
        "view_key": view_key,
        "view_label": EARTHQUAKE_VIEW_CONFIG[view_key]["label"],
        "description": EARTHQUAKE_VIEW_CONFIG[view_key]["description"],
        "candidate_sites_considered": len(evacuation_sites),
        "safe_route_count": sum(1 for route in routes if route["category"] != "eliminated"),
        "eliminated_route_count": sum(1 for route in routes if route["category"] == "eliminated"),
        "selected_evacuation_site": (
            {
                "id": selected_route["destination_id"],
                "name": selected_route["destination_name"],
                "lat": selected_route["destination_lat"],
                "lng": selected_route["destination_lng"],
            }
            if selected_route
            else None
        ),
        "best_distance": selected_route["distance"] if selected_route else None,
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
        route["status"] = (
            "Best" if not valid_routes and index == 1
            else "Eliminated"
        )
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
                start_location,
                evacuation_site,
                view_key,
            )

    return list(collected.values())


def _collect_road_reachable_evacuation_sites(base_graph, start_location, evacuation_sites):
    if not evacuation_sites:
        return []

    start_node = select_endpoint_node(
        base_graph,
        start_location["lat"],
        start_location["lng"],
        "start",
    )

    try:
        distance_map = nx.single_source_dijkstra_path_length(
            base_graph,
            start_node,
            weight="length",
        )
    except (nx.NetworkXNoPath, nx.NodeNotFound):
        return []

    ranked_sites = []
    for site in evacuation_sites:
        end_node = select_endpoint_node(
            base_graph,
            site["lat"],
            site["lng"],
            "end",
        )

        road_distance = distance_map.get(end_node)
        if road_distance is None:
            continue

        site_copy = dict(site)
        site_copy["road_distance"] = round(float(road_distance), 2)
        ranked_sites.append(site_copy)

    ranked_sites.sort(
        key=lambda site: (
            site["road_distance"],
            str(site.get("name", "")).lower(),
            site.get("id", 0),
        )
    )
    return ranked_sites


def get_earthquake_evacuation_sites(barangay_name):
    if not is_supported_earthquake_barangay(barangay_name):
        return {
            "error": True,
            "message": _unsupported_earthquake_scope_message(),
        }

    try:
        dataset = get_earthquake_dataset(barangay_name)
        return {
            "error": False,
            "barangay": dataset["display_barangay"],
            "evacuation_sites": dataset["evacuation_sites"],
        }
    except Exception as exc:
        return {
            "error": True,
            "message": f"Failed to load earthquake evacuation sites: {exc}",
        }


def simulate_earthquake(start, barangay_name):
    if not start:
        return {
            "error": True,
            "message": "Start location is required",
        }

    if not is_supported_earthquake_barangay(barangay_name):
        return {
            "error": True,
            "message": _unsupported_earthquake_scope_message(),
        }

    start_location = database.get_location_by_name(start)
    if not start_location:
        return {
            "error": True,
            "message": f"Start location '{start}' not found",
        }

    try:
        dataset = get_earthquake_dataset(barangay_name)
        if normalize_barangay_name(start_location.get("barangay")) != dataset["canonical_barangay"]:
            return {
                "error": True,
                "message": (
                    f"The selected start node is outside {dataset['display_barangay']} "
                    "earthquake routing coverage."
                ),
            }

        base_graph = _get_earthquake_graph(barangay_name)
        evaluated_sites = _collect_road_reachable_evacuation_sites(
            base_graph,
            start_location,
            dataset["evacuation_sites"],
        )
        if not evaluated_sites:
            return {
                "error": True,
                "message": "No road-reachable evacuation site is available for this start node.",
            }

        debug_print("\n" + "=" * 60)
        debug_print("[EQ] SIMULATION START")
        debug_print(f"[EQ] From: {start_location['name']} ({start_location['lat']}, {start_location['lng']})")
        debug_print(f"[EQ] Selection context: {barangay_name}")
        debug_print(f"[EQ] Road-reachable evacuation sites: {len(evaluated_sites)}")
        for site in evaluated_sites:
            debug_print(
                f"[EQ]   Candidate site: {site['name']} "
                f"({site['lat']}, {site['lng']}) | "
                f"road distance={site['road_distance']:.1f}m"
            )
        simulation_started = time.perf_counter()
        phase_started = simulation_started
        debug_print("[EQ] Phase 1/3: preparing routing context")
        base_graph = _annotate_graph_with_earthquake_hazards(
            base_graph,
            dataset,
        )
        now = time.perf_counter()
        debug_print(f"[EQ] Phase 1/3 complete in {now - phase_started:.2f}s")

        views = {}
        phase_started = now
        debug_print("[EQ] Phase 2/3: evaluating earthquake views")
        reset_progress(len(evaluated_sites) * len(EARTHQUAKE_VIEW_CONFIG) * NUM_ITERATIONS)
        for view_key in EARTHQUAKE_VIEW_CONFIG:
            view_started = time.perf_counter()
            view_label = EARTHQUAKE_VIEW_CONFIG[view_key]["label"]
            debug_print(f"[EQ]   View start: {view_label}")
            candidates = _collect_view_candidates(
                base_graph,
                start_location,
                evaluated_sites,
                view_key,
            )
            views[view_key] = _finalize_earthquake_view_routes(
                start_location["name"],
                candidates,
                evaluated_sites,
                view_key,
            )
            debug_print(
                f"[EQ]   View complete: {view_label} in {time.perf_counter() - view_started:.2f}s "
                f"(routes={len(views[view_key]['routes'])})"
            )

        now = time.perf_counter()
        debug_print(f"[EQ] Phase 2/3 complete in {now - phase_started:.2f}s")
        phase_started = now
        debug_print("[EQ] Phase 3/3: packaging simulation response")

        response = {
            "error": False,
            "simulation_mode": "earthquake",
            "hazard_type": "Earthquake",
            "barangay": dataset["display_barangay"],
            "start": start_location["name"],
            "safe_threshold": HAZARD_THRESHOLD,
            "evacuation_sites": dataset["evacuation_sites"],
            "reachable_evacuation_sites": evaluated_sites,
            "hazard_layers": dataset["layer_payloads"],
            "active_view": "overall",
            "views": views,
        }
        now = time.perf_counter()
        debug_print(f"[EQ] Phase 3/3 complete in {now - phase_started:.2f}s")
        debug_print(f"[EQ] Total simulation time: {now - simulation_started:.2f}s")
        debug_print("[EQ] SIMULATION END")
        debug_print("=" * 60 + "\n")
        return response
    except Exception as exc:
        debug_print(f"[EQ] SIMULATION ERROR: {exc}")
        return {
            "error": True,
            "message": f"Earthquake simulation failed: {exc}",
        }
