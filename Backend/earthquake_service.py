import random
from threading import RLock
import time

import networkx as nx

from earthquake_data import (
    get_earthquake_dataset,
    get_supported_earthquake_barangay_names,
    is_supported_earthquake_barangay,
)
from osm_routing import (
    FINAL_ROUTES_TO_SHOW,
    HAZARD_THRESHOLD,
    NUM_ITERATIONS,
    UNKNOWN_HAZARD_LEVEL,
    add_alternative_routes,
    add_road_access_nodes,
    build_elimination_reason,
    build_hazard_coverage_area,
    check_route_pin,
    debug_print,
    display_sort_key,
    download_walk_graph,
    edge_traversal_cost,
    estimate_boundary_graph_radius,
    get_barangay_base_graph,
    extract_route_street_path,
    extract_route_turn_steps,
    get_barangay_boundary,
    get_edge_geometry,
    hydrate_route_edge_records,
    is_point_in_hazard_coverage,
    label_display_routes,
    parse_route_pin,
    path_to_coords,
    resolve_route_edge_records,
    restrict_graph_to_hazard_coverage,
    route_pheromone_score,
    route_search_seed,
    safety_sort_key,
    finish_candidate_pool,
    start_aco,
    summarize_hazard_data_coverage,
    warm_static_caches,
)
from simulation_progress import bump_progress, reset_progress

# Each site's main colony is compared on its few safest routes, evaluated the
# earthquake way, to pick the site; only that site gets alternative colonies.
SITE_PICK_ROUTES_PER_SITE = 5

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
    severities = [
        int(zone["severity"])
        for zone in layer_zones
        if zone["prepared"].intersects(edge_geom)
    ]
    if not severities:
        severities = [
            int(zone["severity"])
            for zone in layer_zones
            if zone["tolerance_prepared"].intersects(edge_geom)
        ]

    # None, never a default level: a road no zone describes has no reading.
    return max(severities) if severities else None


def _edge_layer_level(edge_data, layer_attr):
    value = edge_data.get(layer_attr)
    if value is None or not edge_data.get("hazard_coverage"):
        return UNKNOWN_HAZARD_LEVEL
    return int(value)


def _get_earthquake_graph(dataset):
    canonical_name = dataset["canonical_barangay"]
    boundary = get_barangay_boundary(canonical_name)
    if boundary is None:
        raise ValueError(f"No barangay boundary found for '{dataset['display_barangay']}'")

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
            graph = download_walk_graph(centroid, radius_m)
        # Only roads inside the barangay AND inside both earthquake layers can be
        # routed on: the traced layer polygons leave strips of the barangay
        # (riverbanks, edges) that no layer describes.
        coverage_area = build_hazard_coverage_area(
            boundary_geometry,
            [dataset["layer_extents"][layer_key] for layer_key in ("liquefaction", "ground_shaking")],
        )
        graph = restrict_graph_to_hazard_coverage(graph, coverage_area)
        debug_print(f"[EQ] Graph loaded: {len(graph.nodes)} nodes, {len(graph.edges)} edges")

        _EARTHQUAKE_GRAPH_CACHE[canonical_name] = graph
        return graph


def _stamp_earthquake_hazards(edge_data, edge_geom, dataset):
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
    if liquefaction is None or ground_shaking is None:
        edge_data["eq_overall"] = None
        edge_data["hazard_coverage"] = False
    else:
        edge_data["eq_overall"] = max(liquefaction, ground_shaking)


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
            _stamp_earthquake_hazards(edge_data, get_edge_geometry(graph, u, v, edge_data), dataset)

        graph.graph["earthquake_dataset"] = dataset["canonical_barangay"]
        debug_print(f"[EQ] Hazard annotation complete in {time.perf_counter() - annotation_started:.2f}s")
    return graph


def _add_earthquake_road_access_nodes(base_graph, points, dataset):
    def annotate_edge(edge_data):
        # A piece of a road kept inside the coverage area is inside it too;
        # only a missing layer reading takes that back.
        edge_data["hazard_coverage"] = True
        _stamp_earthquake_hazards(edge_data, edge_data["geometry"], dataset)

    return add_road_access_nodes(base_graph, points, annotate_edge)


def _clone_graph_for_view(base_graph, view_key):
    hazard_attr = EARTHQUAKE_VIEW_CONFIG[view_key]["hazard_attr"]
    graph = base_graph.copy()

    for _, _, _, edge_data in graph.edges(keys=True, data=True):
        edge_data["hazard"] = edge_data.get(hazard_attr)
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
        maxima["liquefaction"] = max(maxima["liquefaction"], _edge_layer_level(edge_data, "eq_liquefaction"))
        maxima["ground_shaking"] = max(maxima["ground_shaking"], _edge_layer_level(edge_data, "eq_ground_shaking"))

    return maxima


def _resolve_route_edges(base_graph, route):
    resolved_edges = hydrate_route_edge_records(base_graph, route.get("path_edges"))
    if not resolved_edges:
        resolved_edges = resolve_route_edge_records(base_graph, route.get("path", []))
    return resolved_edges


def _add_route_geometry(base_graph, route):
    """The line, street list and turn steps -- only for routes that will be
    shown, since a colony's candidate pool can hold over a hundred routes."""
    resolved_edges = _resolve_route_edges(base_graph, route)
    path = route.get("path", [])
    route["path_coordinates"] = path_to_coords(base_graph, path, resolved_edges=resolved_edges)
    route["street_path"] = extract_route_street_path(base_graph, path, resolved_edges=resolved_edges)
    route["turn_steps"] = extract_route_turn_steps(base_graph, path, resolved_edges=resolved_edges)
    return route


def _evaluate_earthquake_route(base_graph, route, evacuation_site, view_key):
    resolved_edges = _resolve_route_edges(base_graph, route)

    total_distance = 0.0
    risk_distance = 0.0
    unsafe_distance = 0.0
    max_hazard = 1
    eliminated = False
    threshold_exceedance_count = 0
    hazard_breakdown = {}
    covered_distance = 0.0
    uncovered_distance = 0.0
    uncovered_count = 0

    lens_unsafe_distances = {
        "liquefaction": 0.0,
        "ground_shaking": 0.0,
    }

    for _, _, _, edge_data in resolved_edges:
        length = max(float(edge_data.get("length", 0)), 1.0)
        liquefaction = _edge_layer_level(edge_data, "eq_liquefaction")
        ground_shaking = _edge_layer_level(edge_data, "eq_ground_shaking")

        total_distance += length
        if edge_data.get("hazard_coverage"):
            covered_distance += length
        else:
            uncovered_distance += length
            uncovered_count += 1

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
            hazard_value = _edge_layer_level(edge_data, hazard_attr)
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
        "path_coordinates": [],
        "street_path": [],
        "turn_steps": [],
        "found_by": route.get("found_by", "aco"),
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
        "hazard_data_coverage": summarize_hazard_data_coverage(covered_distance, uncovered_distance),
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
        ],
        "reason": (
            f"Earthquake route to {evacuation_site['name']} ranked by "
            f"{EARTHQUAKE_VIEW_CONFIG[view_key]['description'].lower()}"
        ),
        "elimination_reason": build_elimination_reason(
            threshold_exceedance_count,
            uncovered_count,
            f"above earthquake threshold {HAZARD_THRESHOLD}",
        ),
    }


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


def _finalize_earthquake_view_routes(base_graph, start_name, routes, evacuation_sites, view_key, aco_stats):
    final_routes = label_display_routes(sorted(routes, key=display_sort_key))
    for route in final_routes:
        _add_route_geometry(base_graph, route)
        route["path_label"] = f"{start_name} -> {route['destination_name']}"
        route["segments"] = max(1, len(route.get("path", [])) - 1)

    summary = _build_view_summary(view_key, final_routes, evacuation_sites)
    return {
        "view_key": view_key,
        "view_label": EARTHQUAKE_VIEW_CONFIG[view_key]["label"],
        "routes": final_routes,
        "summary": summary,
        "aco": aco_stats,
    }


def _evaluate_colony_routes(base_graph, routes, evacuation_site, view_key, edge_pheromone):
    evaluated = []
    for route in routes:
        route_copy = route.copy()
        route_copy["final_pheromone"] = route_pheromone_score(route_copy.get("path", []), edge_pheromone)
        evaluated.append(_evaluate_earthquake_route(base_graph, route_copy, evacuation_site, view_key))
    return evaluated


def _collect_view_candidates(base_graph, start_node, evacuation_sites, site_nodes, view_key, seed_parts):
    """A main ant colony to every reachable site (NUM_ITERATIONS progress
    steps each). The site whose best route ranks first is the result; only
    its colony goes on to alternative colonies (one step each) and the full
    candidate pool. Returns (that site's evaluated candidates, ACO stats)."""
    view_graph = _clone_graph_for_view(base_graph, view_key)

    best_pick = None
    ants_sent = ants_arrived = 0
    for evacuation_site in evacuation_sites:
        rng = random.Random(route_search_seed(*seed_parts, view_key, evacuation_site["id"]))
        colony = start_aco(view_graph, start_node, site_nodes[evacuation_site["id"]], rng)
        ants_sent += colony["stats"]["ants_sent"]
        ants_arrived += colony["stats"]["ants_arrived"]
        if not colony["routes"] and colony["baseline"] is None:
            continue

        # Rank this site by its few safest routes (or its shortest path when
        # no ant got there), evaluated the earthquake way.
        shortlist = sorted(colony["routes"].values(), key=safety_sort_key)[:SITE_PICK_ROUTES_PER_SITE]
        if not shortlist:
            shortlist = [colony["baseline"]]
        site_best = min(
            _evaluate_colony_routes(base_graph, shortlist, evacuation_site, view_key, colony["pheromone"]),
            key=display_sort_key,
        )
        if best_pick is None or display_sort_key(site_best) < display_sort_key(best_pick[2]):
            best_pick = (evacuation_site, colony, site_best)

    alternatives = FINAL_ROUTES_TO_SHOW - 1
    if best_pick is None:
        bump_progress(alternatives)
        return [], None

    evacuation_site, colony, _ = best_pick
    main_sent, main_arrived = colony["stats"]["ants_sent"], colony["stats"]["ants_arrived"]
    add_alternative_routes(colony, alternatives)
    candidates = finish_candidate_pool(colony)
    stats = dict(colony["stats"])
    stats["sites_searched"] = len(evacuation_sites)
    stats["ants_sent_all_sites"] = ants_sent + colony["stats"]["ants_sent"] - main_sent
    stats["ants_arrived_all_sites"] = ants_arrived + colony["stats"]["ants_arrived"] - main_arrived
    return _evaluate_colony_routes(base_graph, candidates, evacuation_site, view_key, colony["pheromone"]), stats


def _collect_road_reachable_evacuation_sites(base_graph, start_node, evacuation_sites, site_nodes):
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
        road_distance = distance_map.get(site_nodes.get(site["id"]))
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


def _earthquake_coverage_label(dataset):
    return f"{dataset['display_barangay']}'s earthquake hazard data"


def check_earthquake_pin(barangay_name, lat, lng):
    if not is_supported_earthquake_barangay(barangay_name):
        raise ValueError(_unsupported_earthquake_scope_message())

    dataset = get_earthquake_dataset(barangay_name)
    return check_route_pin(
        _get_earthquake_graph(dataset),
        lat,
        lng,
        _earthquake_coverage_label(dataset),
    )


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

    start_location, start_error = parse_route_pin(start, "Start")
    if start_error:
        return {
            "error": True,
            "message": start_error,
        }

    try:
        dataset = get_earthquake_dataset(barangay_name)
        base_graph = _get_earthquake_graph(dataset)
        pin_check = check_route_pin(
            base_graph,
            start_location["lat"],
            start_location["lng"],
            _earthquake_coverage_label(dataset),
            "The start point",
        )
        if not pin_check["valid"]:
            return {
                "error": True,
                "message": pin_check["message"],
            }

        debug_print("\n" + "=" * 60)
        debug_print("[EQ] SIMULATION START")
        debug_print(f"[EQ] From: {start_location['name']} ({start_location['lat']}, {start_location['lng']})")
        debug_print(f"[EQ] Selection context: {barangay_name}")
        simulation_started = time.perf_counter()
        phase_started = simulation_started
        debug_print("[EQ] Phase 1/3: preparing routing context")
        # Hazards go on first, so the road pieces cut below at the pin and at
        # each site are annotated the same way as every other road.
        base_graph = _annotate_graph_with_earthquake_hazards(
            base_graph,
            dataset,
        )
        covered_sites = [
            site for site in dataset["evacuation_sites"]
            if is_point_in_hazard_coverage(base_graph, site["lat"], site["lng"])
        ]
        routing_graph, access_nodes = _add_earthquake_road_access_nodes(
            base_graph,
            [(start_location["lat"], start_location["lng"])]
            + [(site["lat"], site["lng"]) for site in covered_sites],
            dataset,
        )
        start_node = access_nodes[0]
        site_nodes = {
            site["id"]: node
            for site, node in zip(covered_sites, access_nodes[1:])
        }
        evaluated_sites = (
            _collect_road_reachable_evacuation_sites(routing_graph, start_node, covered_sites, site_nodes)
            if start_node is not None
            else []
        )
        if not evaluated_sites:
            return {
                "error": True,
                "message": (
                    "No evacuation site can be reached from this start point without "
                    "leaving the area covered by earthquake hazard data."
                ),
            }

        debug_print(f"[EQ] Road-reachable evacuation sites: {len(evaluated_sites)}")
        for site in evaluated_sites:
            debug_print(
                f"[EQ]   Candidate site: {site['name']} "
                f"({site['lat']}, {site['lng']}) | "
                f"road distance={site['road_distance']:.1f}m"
            )
        now = time.perf_counter()
        debug_print(f"[EQ] Phase 1/3 complete in {now - phase_started:.2f}s")

        views = {}
        phase_started = now
        debug_print("[EQ] Phase 2/3: evaluating earthquake views")
        # Progress: per lens, a main colony per site (one step per round) and
        # the chosen site's alternative colonies; one step to package.
        reset_progress(
            len(EARTHQUAKE_VIEW_CONFIG) * (len(evaluated_sites) * NUM_ITERATIONS + FINAL_ROUTES_TO_SHOW - 1) + 1
        )
        # Same start (and barangay) -> same ant walks -> same routes.
        seed_parts = (
            "earthquake",
            dataset["canonical_barangay"],
            float(start_location["lat"]),
            float(start_location["lng"]),
        )
        for view_key in EARTHQUAKE_VIEW_CONFIG:
            view_started = time.perf_counter()
            view_label = EARTHQUAKE_VIEW_CONFIG[view_key]["label"]
            debug_print(f"[EQ]   View start: {view_label}")
            candidates, aco_stats = _collect_view_candidates(
                routing_graph,
                start_node,
                evaluated_sites,
                site_nodes,
                view_key,
                seed_parts,
            )
            views[view_key] = _finalize_earthquake_view_routes(
                routing_graph,
                start_location["name"],
                candidates,
                evaluated_sites,
                view_key,
                aco_stats,
            )
            debug_print(
                f"[EQ]   View complete: {view_label} in {time.perf_counter() - view_started:.2f}s "
                f"(routes={len(views[view_key]['routes'])})"
            )

        bump_progress()
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
