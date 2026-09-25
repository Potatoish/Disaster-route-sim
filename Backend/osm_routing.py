import json
import math
import os
import random
import time
from pathlib import Path
from threading import RLock

import networkx as nx
import osmnx as ox
from shapely.geometry import LineString, Point, mapping, shape
from shapely.prepared import prep
from shapely.ops import unary_union

from simulation_progress import bump_progress, reset_progress

HAZARD_THRESHOLD = 3
# Hazard level a road is scored at when it has no hazard reading. Deliberately
# above HAZARD_THRESHOLD: missing hazard data must never read as "safe".
UNKNOWN_HAZARD_LEVEL = 5
FINAL_ROUTES_TO_SHOW = 5
MAX_ELIMINATED_ROUTES_TO_SHOW = 3
DISPLAY_ROUTE_OVERLAP_THRESHOLDS = (0.6, 0.75, 0.9, 1.01)

DIST_METERS = 7000
# Routes may only use roads inside the hazard data coverage area (see
# build_hazard_coverage_area). This slack keeps roads drawn along a boundary
# line from being cut off by the few meters the traced polygons are off by;
# below ~10 m Sta. Lucia's network splits apart along Ortigas Ave. Extension.
HAZARD_COVERAGE_TOLERANCE_METERS = 20.0
ROUTE_STITCH_SNAP_TOLERANCE_METERS = 12.0
ROUTE_ENDPOINT_ATTACH_MAX_DISTANCE_METERS = 90.0
MAX_ENDPOINT_NODE_EXTRA_DISTANCE_METERS = 90.0
MAX_ENDPOINT_NODE_DISTANCE_RATIO = 6.0
MAX_ENDPOINT_NODE_DISTANCE_CAP_METERS = 160.0
ENDPOINT_NODE_CANDIDATE_LIMIT = 25
GRAPH_NETWORK_TYPE = "walk"

ACO_MAX_ROUTE_STEPS_MULTIPLIER = 2.5
ACO_MIN_ROUTE_STEPS = 25
ACO_STAGNATION_LIMIT = 8
MAX_NODE_VISITS = 2
DESTINATION_WEIGHT = 0.15
UNSAFE_EDGE_HEURISTIC_FACTOR = 0.05
EDGE_PHEROMONE_MIN = 0.01
EDGE_PHEROMONE_MAX = 25.0
SUPPLEMENTAL_ROUTE_LIMIT = 100
# Ants discount (never forbid) edges already used by routes already sitting
# in route_cache, scaled by how many routes already use that edge -- pushes
# later ants toward untried corridors instead of all funneling down the one
# corridor pheromone has reinforced, without overriding the hazard/distance
# heuristic itself (an unsafe edge is still deprioritized far more heavily).
ANT_ROUTE_DIVERSITY_PENALTY = 0.4
# Iterative-penalization search (see generate_diverse_supplemental_routes):
# after each shortest-path attempt, multiply that path's edges' cost so the
# next attempt is pushed toward a genuinely different corridor. Yen's
# k-shortest-paths alone tends to only return near-clones of the shortest
# path (single-block detours) on a uniform street grid.
DIVERSE_ROUTE_SEARCH_ATTEMPTS = 14
DIVERSE_ROUTE_EDGE_PENALTY = 1.8

NUM_ANTS = 40
NUM_ITERATIONS = 30
ALPHA = 1.0
BETA = 2.0
EVAPORATION = 0.30
Q = 100.0

SAFETY_WEIGHT = 0.80
DISTANCE_WEIGHT = 0.20
UNSAFE_PENALTY = 1_000_000.0
TOP_ACO_REINFORCERS = 3
DEBUG = True
FLOOD_GRAPH_ANNOTATION_VERSION = 2

DISCOURAGED_ENDPOINT_HIGHWAYS = {"track"}
DISCOURAGED_ENDPOINT_SERVICE_VALUES = {"driveway", "parking_aisle", "parking", "alley"}
BLOCKED_ENDPOINT_ACCESS_VALUES = {"private", "no"}

_GRAPH_CACHE = {}
_BARANGAY_BASE_GRAPH_CACHE = {}
_FLOOD_ZONES_CACHE = None
_FLOOD_LAYER_PAYLOAD_CACHE = {}
_BARANGAY_BOUNDARIES_CACHE = None
_STATIC_CACHE_LOCK = RLock()
_GRAPH_BUILD_LOCK = RLock()
_GRAPH_ANNOTATION_LOCK = RLock()
_BARANGAY_BASE_GRAPH_LOCK = RLock()


def get_runtime_cache_dir():
    override = os.environ.get("DISASTER_ROUTE_SIM_RUNTIME_DIR")
    if override:
        base_dir = Path(override).expanduser()
    elif os.name == "nt":
        base_dir = Path(
            os.environ.get(
                "LOCALAPPDATA",
                Path.home() / "AppData" / "Local",
            )
        )
    else:
        base_dir = Path(
            os.environ.get(
                "XDG_CACHE_HOME",
                Path.home() / ".cache",
            )
        )

    cache_dir = base_dir / "disaster-route-sim" / "osmnx-cache"
    cache_dir.mkdir(parents=True, exist_ok=True)
    return cache_dir


OSMNX_CACHE_DIR = get_runtime_cache_dir()
ox.settings.use_cache = True
ox.settings.cache_folder = str(OSMNX_CACHE_DIR)

FLOOD_CLASSES_DIR = Path(__file__).parent / "data" / "flood_classes"
BOUNDARIES_DIR = Path(__file__).parent / "data" / "boundaries"
GRAPHS_DIR = Path(__file__).parent / "data" / "graphs"
FLOOD_ZONE_FILES = [
    FLOOD_CLASSES_DIR / "flood_var_1.geojson",
    FLOOD_CLASSES_DIR / "flood_var_2.geojson",
    FLOOD_CLASSES_DIR / "flood_var_3.geojson",
]

BARANGAY_BOUNDARY_FILES = {
    "pinagbuhatan": BOUNDARIES_DIR / "pinagbuhatan boundary.geojson",
    "sta lucia": BOUNDARIES_DIR / "Sta lucia boundary.geojson",
}
BARANGAY_BASE_GRAPH_FILES = {
    "pinagbuhatan": GRAPHS_DIR / "pinagbuhatan_walk.graphml",
    "sta lucia": GRAPHS_DIR / "sta_lucia_walk.graphml",
}

VAR_TO_HAZARD = {
    1: 1,
    2: 3,
    3: 5,
}
FLOOD_VAR_RISK_LABELS = {
    1: "Low",
    2: "Moderate",
    3: "High",
}
METERS_PER_DEGREE = 111_320.0
FLOOD_LAYER_BUFFER_METERS = 800.0
FLOOD_LAYER_SIMPLIFY_TOLERANCE = 0.00003
FLOOD_LAYER_SIMPLIFY_TOLERANCE_BUFFER = 0.00008
FLOOD_LAYER_SIMPLIFY_TOLERANCE_CITY = 0.00018

def debug_print(*args):
    if DEBUG:
        print(*args)


def normalize_tag_values(raw_value):
    if raw_value is None:
        return []

    values = raw_value if isinstance(raw_value, list) else [raw_value]
    normalized = []

    for value in values:
        text = str(value).strip().lower()
        if text:
            normalized.append(text)

    return normalized


def coordinate_distance_meters(lat1, lng1, lat2, lng2):
    lat1_rad = math.radians(float(lat1))
    lat2_rad = math.radians(float(lat2))
    delta_lat = lat2_rad - lat1_rad
    delta_lng = math.radians(float(lng2) - float(lng1))

    a = (
        math.sin(delta_lat / 2) ** 2
        + math.cos(lat1_rad) * math.cos(lat2_rad) * math.sin(delta_lng / 2) ** 2
    )
    return 6371000.0 * 2 * math.atan2(math.sqrt(a), math.sqrt(max(0.0, 1 - a)))


def point_distance_meters(point_a, point_b):
    return coordinate_distance_meters(
        point_a["lat"],
        point_a["lng"],
        point_b["lat"],
        point_b["lng"],
    )


def build_route_point(lat, lng):
    if lat is None or lng is None:
        return None

    return {
        "lat": float(lat),
        "lng": float(lng),
    }


def normalize_barangay_name(name):
    if name is None:
        return ""

    normalized = str(name).strip().lower().replace(".", " ")
    normalized = " ".join(normalized.split())

    aliases = {
        "santa lucia": "sta lucia",
        "sta lucia": "sta lucia",
        "st lucia": "sta lucia",
    }
    return aliases.get(normalized, normalized)


def map_flood_var_to_hazard(var_value):
    return VAR_TO_HAZARD.get(int(var_value), 1)

def load_flood_zones():
    global _FLOOD_ZONES_CACHE

    if _FLOOD_ZONES_CACHE is not None:
        return _FLOOD_ZONES_CACHE

    with _STATIC_CACHE_LOCK:
        if _FLOOD_ZONES_CACHE is not None:
            return _FLOOD_ZONES_CACHE

        flood_zones = []

        for file_path in FLOOD_ZONE_FILES:
            if not file_path.exists():
                raise FileNotFoundError(f"Flood zone file not found: {file_path}")

            with file_path.open("r", encoding="utf-8-sig") as f:
                data = json.load(f)

            if data.get("type") != "FeatureCollection":
                raise ValueError(
                    f"Invalid GeoJSON type in {file_path.name}: expected FeatureCollection"
                )

            features = data.get("features", [])
            if len(features) != 1:
                raise ValueError(
                    f"Expected exactly 1 feature in {file_path.name}, found {len(features)}"
                )

            feature = features[0]
            properties = feature.get("properties") or {}
            geometry_data = feature.get("geometry")

            if geometry_data is None:
                raise ValueError(f"Missing geometry in {file_path.name}")

            if "Var" not in properties:
                raise ValueError(f"Missing 'Var' property in {file_path.name}")

            var_value = int(properties["Var"])
            hazard_value = map_flood_var_to_hazard(var_value)

            geom = shape(geometry_data)
            if geom.is_empty:
                raise ValueError(f"Empty geometry in {file_path.name}")

            flood_zones.append({
                "var": var_value,
                "hazard": hazard_value,
                "geometry": geom,
                "prepared": prep(geom),
                "source_file": file_path.name,
            })

        flood_zones.sort(key=lambda zone: zone["hazard"], reverse=True)
        _FLOOD_ZONES_CACHE = flood_zones

        debug_print(
            "[FLOOD] Loaded zones:",
            [
                {
                    "file": zone["source_file"],
                    "var": zone["var"],
                    "hazard": zone["hazard"],
                    "geom_type": zone["geometry"].geom_type,
                }
                for zone in _FLOOD_ZONES_CACHE
            ]
        )

        return _FLOOD_ZONES_CACHE


def load_barangay_boundaries():
    global _BARANGAY_BOUNDARIES_CACHE

    if _BARANGAY_BOUNDARIES_CACHE is not None:
        return _BARANGAY_BOUNDARIES_CACHE

    with _STATIC_CACHE_LOCK:
        if _BARANGAY_BOUNDARIES_CACHE is not None:
            return _BARANGAY_BOUNDARIES_CACHE

        boundaries = {}

        for canonical_name, file_path in BARANGAY_BOUNDARY_FILES.items():
            if not file_path.exists():
                debug_print(f"[BOUNDARY] File not found for {canonical_name}: {file_path}")
                continue

            with file_path.open("r", encoding="utf-8-sig") as f:
                data = json.load(f)

            features = data.get("features", [])
            if not features:
                debug_print(f"[BOUNDARY] No features found in {file_path.name}")
                continue

            polygon_geometries = []
            display_name = canonical_name.title()

            for feature in features:
                geometry_data = feature.get("geometry")
                if geometry_data is None:
                    continue

                geom = shape(geometry_data)
                if geom.is_empty or geom.geom_type not in {"Polygon", "MultiPolygon"}:
                    continue

                polygon_geometries.append(geom)

                feature_name = (feature.get("properties") or {}).get("name")
                if feature_name:
                    display_name = feature_name

            if not polygon_geometries:
                debug_print(f"[BOUNDARY] No polygon geometry found in {file_path.name}")
                continue

            geom = (
                polygon_geometries[0]
                if len(polygon_geometries) == 1
                else unary_union(polygon_geometries)
            )
            if geom.is_empty:
                debug_print(f"[BOUNDARY] Empty geometry in {file_path.name}")
                continue

            boundaries[canonical_name] = {
                "canonical_name": canonical_name,
                "display_name": display_name,
                "geometry": geom,
                "prepared": prep(geom),
                "source_file": file_path.name,
            }

        _BARANGAY_BOUNDARIES_CACHE = boundaries
        debug_print(
            "[BOUNDARY] Loaded:",
            {
                name: boundary["source_file"]
                for name, boundary in boundaries.items()
            }
        )
        return _BARANGAY_BOUNDARIES_CACHE


def get_barangay_boundary(name):
    boundaries = load_barangay_boundaries()
    canonical_name = normalize_barangay_name(name)
    return boundaries.get(canonical_name)


def geometry_exterior_paths(geometry):
    if geometry.is_empty:
        return []

    polygons = [geometry] if geometry.geom_type == "Polygon" else list(getattr(geometry, "geoms", []))
    paths = []

    for polygon in polygons:
        if polygon.is_empty:
            continue

        coords = []
        for lng, lat in polygon.exterior.coords:
            coords.append({"lat": float(lat), "lng": float(lng)})

        if coords:
            paths.append(coords)

    return paths


def get_barangay_boundary_payload(name):
    boundary = get_barangay_boundary(name)
    if boundary is None:
        return None

    return {
        "name": boundary["display_name"],
        "canonical_name": boundary["canonical_name"],
        "paths": geometry_exterior_paths(boundary["geometry"]),
    }


def get_flood_var_risk_label(var_value):
    return FLOOD_VAR_RISK_LABELS.get(int(var_value), "Low")


def get_polygonal_geometry(geometry):
    if geometry.is_empty:
        return geometry

    if geometry.geom_type in {"Polygon", "MultiPolygon"}:
        return geometry

    polygon_geometries = []
    for sub_geometry in getattr(geometry, "geoms", []):
        polygon_geometry = get_polygonal_geometry(sub_geometry)
        if polygon_geometry.is_empty:
            continue

        if polygon_geometry.geom_type == "Polygon":
            polygon_geometries.append(polygon_geometry)
        elif polygon_geometry.geom_type == "MultiPolygon":
            polygon_geometries.extend(list(polygon_geometry.geoms))

    return unary_union(polygon_geometries) if polygon_geometries else Point().buffer(0)


def build_flood_hazard_layer_payload(name=None, vars_filter=None, clip_scope="barangay"):
    canonical_name = normalize_barangay_name(name) if clip_scope != "city" else "pasig_city"
    normalized_vars = tuple(
        sorted({
            int(var_value)
            for var_value in (vars_filter or [])
            if str(var_value).strip()
        })
    )
    cache_key = (canonical_name, normalized_vars, clip_scope)
    cached_payload = _FLOOD_LAYER_PAYLOAD_CACHE.get(cache_key)
    if cached_payload is not None:
        return cached_payload

    boundary = get_barangay_boundary(canonical_name) if clip_scope != "city" else None
    if clip_scope != "city" and boundary is None:
        return None

    flood_zones = load_flood_zones()
    if clip_scope == "barangay_buffer" and boundary is not None:
        boundary_geometry = boundary["geometry"].buffer(FLOOD_LAYER_BUFFER_METERS / METERS_PER_DEGREE)
    else:
        boundary_geometry = boundary["geometry"] if boundary is not None else None
    features = []

    for zone in sorted(flood_zones, key=lambda item: int(item["var"])):
        zone_var = int(zone["var"])
        if normalized_vars and zone_var not in normalized_vars:
            continue

        clipped_geometry = get_polygonal_geometry(
            zone["geometry"].intersection(boundary_geometry)
        ) if boundary_geometry is not None else get_polygonal_geometry(zone["geometry"])
        if clipped_geometry.is_empty:
            continue

        simplified_geometry = clipped_geometry.simplify(
            FLOOD_LAYER_SIMPLIFY_TOLERANCE
            if clip_scope == "barangay"
            else FLOOD_LAYER_SIMPLIFY_TOLERANCE_BUFFER
            if clip_scope == "barangay_buffer"
            else FLOOD_LAYER_SIMPLIFY_TOLERANCE_CITY,
            preserve_topology=True,
        )
        if simplified_geometry.is_empty:
            simplified_geometry = clipped_geometry

        var_value = zone_var
        features.append({
            "type": "Feature",
            "properties": {
                "flood_var": var_value,
                "hazard_level": int(zone["hazard"]),
                "risk_label": get_flood_var_risk_label(var_value),
                "label": f"{get_flood_var_risk_label(var_value)} Water Risk",
            },
            "geometry": mapping(simplified_geometry),
        })

    payload = {
        "name": (
            f"{boundary['display_name']} + nearby area"
            if clip_scope == "barangay_buffer" and boundary is not None
            else boundary["display_name"] if boundary is not None
            else "Pasig City"
        ),
        "canonical_name": canonical_name,
        "hazard_layers": {
            "type": "FeatureCollection",
            "features": features,
        },
    }
    _FLOOD_LAYER_PAYLOAD_CACHE[cache_key] = payload
    return payload


def warm_static_caches():
    load_flood_zones()
    load_barangay_boundaries()

def get_edge_geometry(G, u, v, data):
    edge_geom = data.get("geometry")
    if edge_geom is not None:
        return edge_geom

    u_node = G.nodes[u]
    v_node = G.nodes[v]

    return LineString([
        (float(u_node["x"]), float(u_node["y"])),
        (float(v_node["x"]), float(v_node["y"])),
    ])


def resolve_edge_hazard(edge_geom, flood_zones):
    # Falling through to hazard 1 means "the flood model shows no flooding
    # here", which only holds inside the flood coverage area -- callers must
    # only pass edges from a restrict_graph_to_hazard_coverage() graph.
    if edge_geom is None or edge_geom.is_empty:
        return 1, None

    for zone in flood_zones:
        if zone["prepared"].intersects(edge_geom):
            return zone["hazard"], zone["var"]

    return 1, None


def resolve_point_hazard(lat, lng, flood_zones=None):
    if lat is None or lng is None:
        return {
            "haz": None,
            "flood_var": None,
            "hazard_source": None,
        }

    if flood_zones is None:
        flood_zones = load_flood_zones()

    point = Point(float(lng), float(lat))

    for zone in flood_zones:
        if zone["prepared"].intersects(point):
            return {
                "haz": int(zone["hazard"]),
                "flood_var": int(zone["var"]),
                "hazard_source": "flood_json",
            }

    return {
        "haz": 1,
        "flood_var": None,
        "hazard_source": "flood_json",
    }


def estimate_boundary_graph_radius(boundary_geometry):
    centroid = boundary_geometry.centroid
    max_distance = 0.0

    for path in geometry_exterior_paths(boundary_geometry):
        for point in path:
            max_distance = max(
                max_distance,
                coordinate_distance_meters(
                    float(centroid.y),
                    float(centroid.x),
                    point["lat"],
                    point["lng"],
                )
            )

    return max(DIST_METERS * 0.35, max_distance + 180.0)


def get_barangay_base_graph_path(name):
    canonical_name = normalize_barangay_name(name)
    return BARANGAY_BASE_GRAPH_FILES.get(canonical_name)


def get_barangay_base_graph(name):
    canonical_name = normalize_barangay_name(name)
    graph_path = get_barangay_base_graph_path(canonical_name)
    if not graph_path:
        return None

    cached_graph = _BARANGAY_BASE_GRAPH_CACHE.get(canonical_name)
    if cached_graph is not None:
        return cached_graph

    with _BARANGAY_BASE_GRAPH_LOCK:
        cached_graph = _BARANGAY_BASE_GRAPH_CACHE.get(canonical_name)
        if cached_graph is not None:
            return cached_graph

        boundary = get_barangay_boundary(canonical_name)
        if boundary is None:
            return None

        if graph_path.exists():
            graph = ox.load_graphml(graph_path)
            graph.graph["graph_cache_key"] = f"base::{GRAPH_NETWORK_TYPE}::{canonical_name}"
            _BARANGAY_BASE_GRAPH_CACHE[canonical_name] = graph
            debug_print(f"[OSM] Loaded local base graph for {boundary['display_name']}: {graph_path.name}")
            return graph

        graph_path.parent.mkdir(parents=True, exist_ok=True)
        boundary_geometry = boundary["geometry"]
        centroid = boundary_geometry.centroid
        radius_m = estimate_boundary_graph_radius(boundary_geometry)

        debug_print(
            f"[OSM] Building local base graph for {boundary['display_name']} "
            f"with radius {radius_m:.1f} meters"
        )
        try:
            graph = ox.graph_from_point(
                (float(centroid.y), float(centroid.x)),
                dist=radius_m,
                network_type=GRAPH_NETWORK_TYPE,
                simplify=True,
            )
            graph.graph["graph_cache_key"] = f"base::{GRAPH_NETWORK_TYPE}::{canonical_name}"
            ox.save_graphml(graph, graph_path)
            _BARANGAY_BASE_GRAPH_CACHE[canonical_name] = graph
            debug_print(f"[OSM] Saved local base graph for {boundary['display_name']}: {graph_path.name}")
            return graph
        except Exception:
            raise


def find_barangay_for_point(lat, lng):
    point = Point(float(lng), float(lat))
    for canonical_name, boundary in load_barangay_boundaries().items():
        if boundary["prepared"].covers(point):
            return canonical_name
    return None


def build_hazard_coverage_area(boundary_geometry, hazard_extents=()):
    """The area where a route can actually be checked for safety: inside the
    barangay polygon and inside every given hazard layer's extent, each
    widened by HAZARD_COVERAGE_TOLERANCE_METERS."""
    tolerance = HAZARD_COVERAGE_TOLERANCE_METERS / METERS_PER_DEGREE
    coverage_area = boundary_geometry.buffer(tolerance)
    for extent in hazard_extents:
        coverage_area = coverage_area.intersection(extent.buffer(tolerance))
    return coverage_area


def restrict_graph_to_hazard_coverage(G, coverage_area):
    """Keep only roads lying entirely inside coverage_area, so no route can
    cross ground the hazard data says nothing about. Kept edges are stamped
    hazard_coverage=True; edge_hazard_level() scores any other edge as unsafe."""
    prepared_area = prep(coverage_area)
    keep_edges = [
        (u, v, key)
        for u, v, key, data in G.edges(keys=True, data=True)
        if prepared_area.covers(get_edge_geometry(G, u, v, data))
    ]
    if not keep_edges:
        raise ValueError("No roads found inside the hazard data coverage area")

    restricted_graph = G.edge_subgraph(keep_edges).copy()
    for _, _, data in restricted_graph.edges(data=True):
        data["hazard_coverage"] = True
    restricted_graph.graph["hazard_coverage_area"] = coverage_area

    debug_print(
        f"[COVERAGE] Kept {len(restricted_graph.edges)} of {len(G.edges)} edges "
        f"({len(restricted_graph.nodes)} nodes) inside hazard data coverage"
    )
    return restricted_graph


def is_point_in_hazard_coverage(G, lat, lng):
    coverage_area = G.graph.get("hazard_coverage_area")
    if coverage_area is None:
        return False
    return coverage_area.covers(Point(float(lng), float(lat)))


def build_graph(scope_name):
    canonical_name = normalize_barangay_name(scope_name)
    cache_key = ("flood_coverage", GRAPH_NETWORK_TYPE, canonical_name)

    cached_graph = _GRAPH_CACHE.get(cache_key)
    if cached_graph is not None:
        debug_print(f"[OSM] Using cached graph for key={cache_key}")
        return cached_graph

    with _GRAPH_BUILD_LOCK:
        cached_graph = _GRAPH_CACHE.get(cache_key)
        if cached_graph is not None:
            debug_print(f"[OSM] Using cached graph for key={cache_key}")
            return cached_graph

        boundary = get_barangay_boundary(canonical_name)
        base_graph = get_barangay_base_graph(canonical_name) if boundary is not None else None
        if base_graph is None:
            raise ValueError(f"No hazard data coverage is configured for '{scope_name}'")

        # The flood layers span all of Pasig City and stop at the city limits,
        # so inside the barangay polygon a road with no Var 1/2/3 polygon is
        # one the flood model shows as not flooding -- real data. Past the
        # polygon (e.g. into Cainta/Taytay) there is no flood data at all, so
        # those roads are dropped rather than silently scored as hazard 1.
        debug_print(f"[OSM] Building flood coverage graph for {boundary['display_name']}")
        G = restrict_graph_to_hazard_coverage(
            base_graph,
            build_hazard_coverage_area(boundary["geometry"]),
        )
        G.graph["graph_cache_key"] = cache_key
        _GRAPH_CACHE[cache_key] = G
        debug_print(f"[OSM] Graph loaded: {len(G.nodes)} nodes, {len(G.edges)} edges")
        return G


def prepare_routing_graph(barangay_name):
    warm_static_caches()
    G = build_graph(barangay_name)
    assign_flood_hazards(G)
    return G


def is_blocked_endpoint_edge(edge):
    access_values = set(normalize_tag_values(edge.get("access")))
    return bool(access_values & BLOCKED_ENDPOINT_ACCESS_VALUES)


def is_preferred_endpoint_edge(edge):
    highways = set(normalize_tag_values(edge.get("highway")))
    services = set(normalize_tag_values(edge.get("service")))

    if is_blocked_endpoint_edge(edge):
        return False
    if highways & DISCOURAGED_ENDPOINT_HIGHWAYS:
        return False
    if services & DISCOURAGED_ENDPOINT_SERVICE_VALUES:
        return False

    return True


def get_endpoint_directional_edges(G, node_id, label):
    if label == "start":
        edges = list(G.out_edges(node_id, keys=True, data=True))
    elif label == "end":
        edges = list(G.in_edges(node_id, keys=True, data=True))
    else:
        edges = []

    if edges:
        return edges

    fallback_edges = {}
    for u, v, key, data in G.out_edges(node_id, keys=True, data=True):
        fallback_edges[(u, v, key)] = (u, v, key, data)
    for u, v, key, data in G.in_edges(node_id, keys=True, data=True):
        fallback_edges[(u, v, key)] = (u, v, key, data)

    return list(fallback_edges.values())


def build_endpoint_node_profile(G, node_id, label):
    edge_profiles = []

    for u, v, key, data in get_endpoint_directional_edges(G, node_id, label):
        hazard = edge_hazard_level(data)
        blocked = is_blocked_endpoint_edge(data)
        preferred = is_preferred_endpoint_edge(data)
        edge_profiles.append({
            "hazard": hazard,
            "blocked": blocked,
            "preferred": preferred,
            "cost": edge_traversal_cost(data),
        })

    if not edge_profiles:
        return None

    best_edge = min(
        edge_profiles,
        key=lambda edge: (
            edge["blocked"],
            not edge["preferred"],
            edge["hazard"] > HAZARD_THRESHOLD,
            edge["hazard"],
            edge["cost"],
        )
    )

    return {
        "edge_count": len(edge_profiles),
        "accessible_edge_count": sum(
            1 for edge in edge_profiles if not edge["blocked"]
        ),
        "safe_edge_count": sum(
            1 for edge in edge_profiles
            if not edge["blocked"] and edge["hazard"] <= HAZARD_THRESHOLD
        ),
        "preferred_edge_count": sum(
            1 for edge in edge_profiles if edge["preferred"]
        ),
        "best_blocked": best_edge["blocked"],
        "best_hazard": best_edge["hazard"],
        "best_cost": best_edge["cost"],
        "best_preferred": best_edge["preferred"],
    }


def build_endpoint_candidate_rank(candidate):
    profile = candidate["profile"]
    return (
        profile["best_blocked"],
        round(candidate["distance"], 3),
        not profile["best_preferred"],
        profile["best_hazard"] > HAZARD_THRESHOLD,
        profile["best_hazard"],
        round(profile["best_cost"], 3),
    )


def collect_endpoint_candidates(G, lat, lng, label, fallback_node, fallback_distance):
    raw_distance_cap = max(
        fallback_distance + MAX_ENDPOINT_NODE_EXTRA_DISTANCE_METERS,
        max(fallback_distance, 1.0) * MAX_ENDPOINT_NODE_DISTANCE_RATIO,
    )
    distance_cap = max(
        fallback_distance,
        min(MAX_ENDPOINT_NODE_DISTANCE_CAP_METERS, raw_distance_cap),
    )

    candidates = []
    for node_id, node_data in G.nodes(data=True):
        distance = coordinate_distance_meters(
            lat,
            lng,
            float(node_data["y"]),
            float(node_data["x"]),
        )
        if distance > distance_cap:
            continue

        profile = build_endpoint_node_profile(G, node_id, label)
        if profile is None:
            continue

        candidates.append({
            "node": node_id,
            "distance": distance,
            "profile": profile,
        })

    candidates.sort(key=lambda candidate: (candidate["distance"], candidate["node"]))
    candidates = candidates[:ENDPOINT_NODE_CANDIDATE_LIMIT]

    if not any(candidate["node"] == fallback_node for candidate in candidates):
        fallback_profile = build_endpoint_node_profile(G, fallback_node, label)
        if fallback_profile is not None:
            candidates.append({
                "node": fallback_node,
                "distance": fallback_distance,
                "profile": fallback_profile,
            })

    candidates.sort(key=lambda candidate: (build_endpoint_candidate_rank(candidate), candidate["node"]))
    return candidates, distance_cap


def debug_endpoint_candidates(label, fallback_node, fallback_distance, distance_cap, candidates, selected_node):
    debug_print(
        f"[OSM] Endpoint snap ({label}): fallback={fallback_node} ({fallback_distance:.1f}m), "
        f"cap={distance_cap:.1f}m, candidates={len(candidates)}"
    )

    for candidate in candidates[:5]:
        profile = candidate["profile"]
        marker = "*" if candidate["node"] == selected_node else " "
        debug_print(
            f"[OSM]   {marker}node={candidate['node']} dist={candidate['distance']:.1f}m "
            f"haz={profile['best_hazard']} preferred={profile['best_preferred']} "
            f"blocked={profile['best_blocked']} accessible_edges={profile['accessible_edge_count']}/{profile['edge_count']} "
            f"safe_edges={profile['safe_edge_count']}/{profile['edge_count']}"
        )


def select_endpoint_node(G, lat, lng, label):
    debug_print(f"[OSM] Endpoint snap ({label}): locating nearest node")
    fallback_node = ox.distance.nearest_nodes(G, X=lng, Y=lat)
    fallback_data = G.nodes[fallback_node]
    fallback_distance = coordinate_distance_meters(
        lat,
        lng,
        float(fallback_data["y"]),
        float(fallback_data["x"]),
    )

    fallback_profile = build_endpoint_node_profile(G, fallback_node, label)
    if fallback_profile is None:
        debug_print(
            f"[OSM] Endpoint snap ({label}): selected raw node {fallback_node} "
            f"at {fallback_distance:.1f}m (no directional candidate profile)"
        )
        return fallback_node

    debug_print(
        f"[OSM] Endpoint snap ({label}): evaluating nearby candidates "
        f"from {len(G.nodes)} graph nodes"
    )
    candidates, distance_cap = collect_endpoint_candidates(
        G,
        lat,
        lng,
        label,
        fallback_node,
        fallback_distance,
    )
    if not candidates:
        debug_print(
            f"[OSM] Endpoint snap ({label}): selected raw node {fallback_node} "
            f"at {fallback_distance:.1f}m (no candidates within cap)"
        )
        return fallback_node

    selected_node = candidates[0]["node"]
    debug_endpoint_candidates(
        label,
        fallback_node,
        fallback_distance,
        distance_cap,
        candidates,
        selected_node,
    )
    return selected_node


def get_nearest_osm_nodes(G, start_lat, start_lng, end_lat, end_lng):
    start_node = select_endpoint_node(G, start_lat, start_lng, "start")
    end_node = select_endpoint_node(G, end_lat, end_lng, "end")

    debug_print(f"[OSM] Start node: {start_node}")
    debug_print(f"[OSM] End node: {end_node}")

    return start_node, end_node


def assign_flood_hazards(G):
    if G.graph.get("flood_hazard_annotation_version") == FLOOD_GRAPH_ANNOTATION_VERSION:
        debug_print(
            f"[FLOOD] Reusing hazard annotations for graph key={G.graph.get('graph_cache_key', 'runtime')}"
        )
        return

    with _GRAPH_ANNOTATION_LOCK:
        if G.graph.get("flood_hazard_annotation_version") == FLOOD_GRAPH_ANNOTATION_VERSION:
            debug_print(
                f"[FLOOD] Reusing hazard annotations for graph key={G.graph.get('graph_cache_key', 'runtime')}"
            )
            return

        flood_zones = load_flood_zones()

        counts = {level: 0 for level in sorted(set(VAR_TO_HAZARD.values()) | {1})}
        var_counts = {1: 0, 2: 0, 3: 0, None: 0}

        for u, v, key, data in G.edges(keys=True, data=True):
            if data.get("hazard_source") == "flood_json" and "hazard" in data:
                hazard = int(data.get("hazard", 1))
                flood_var = data.get("flood_var")
            else:
                edge_geom = get_edge_geometry(G, u, v, data)
                hazard, flood_var = resolve_edge_hazard(edge_geom, flood_zones)

                data["hazard"] = int(hazard)
                data["flood_var"] = flood_var
                data["hazard_source"] = "flood_json"

            counts[hazard] = counts.get(hazard, 0) + 1
            var_counts[flood_var] = var_counts.get(flood_var, 0) + 1
            data["route_cost"] = edge_traversal_cost(data)

        debug_print(f"[FLOOD] Hazard distribution: {counts}")
        debug_print(
            "[FLOOD] Flood class matches:",
            {
                "Var 1": var_counts.get(1, 0),
                "Var 2": var_counts.get(2, 0),
                "Var 3": var_counts.get(3, 0),
            }
        )
        G.graph["flood_hazard_annotation_version"] = FLOOD_GRAPH_ANNOTATION_VERSION


def edge_has_hazard_data(edge):
    return bool(edge.get("hazard_coverage")) and edge.get("hazard") is not None


def edge_hazard_level(edge):
    if not edge_has_hazard_data(edge):
        return UNKNOWN_HAZARD_LEVEL
    return int(edge["hazard"])


def edge_metrics(edge):
    length = max(float(edge.get("length", 0)), 1.0)
    hazard = edge_hazard_level(edge)
    hazard_factor = max(0.0, (hazard - 1) / 4.0)
    return length, hazard, hazard_factor


def edge_traversal_cost(edge):
    length, hazard, hazard_factor = edge_metrics(edge)
    cost = length * (DISTANCE_WEIGHT + SAFETY_WEIGHT * (1.0 + hazard_factor * 4.0))

    if hazard > HAZARD_THRESHOLD:
        cost *= 1.5

    return cost


def get_best_edge_with_key(G, u, v):
    edge_data = G.get_edge_data(u, v)
    if not edge_data:
        return None, None

    key, edge = min(edge_data.items(), key=lambda item: edge_traversal_cost(item[1]))
    return key, edge


def get_best_edge(G, u, v):
    _, edge = get_best_edge_with_key(G, u, v)
    return edge


def resolve_route_edge_records(G, route):
    resolved_edges = []

    for u, v in route_edges(route):
        key, edge = get_best_edge_with_key(G, u, v)
        if edge is None:
            continue
        resolved_edges.append((u, v, key, edge))

    return resolved_edges


def hydrate_route_edge_records(G, path_edges):
    if not path_edges:
        return []

    resolved_edges = []
    for edge_ref in path_edges:
        u = edge_ref.get("u")
        v = edge_ref.get("v")
        key = edge_ref.get("key")
        edge = G.get_edge_data(u, v, key)
        if edge is None:
            return []
        resolved_edges.append((u, v, key, edge))

    return resolved_edges


def serialize_route_edge_records(resolved_edges):
    return [
        {"u": u, "v": v, "key": key}
        for u, v, key, edge in resolved_edges
    ]


def edge_geometry_to_coords(G, u, v, edge):
    edge_geom = get_edge_geometry(G, u, v, edge)
    edge_coords = [
        {"lat": float(lat), "lng": float(lng)}
        for lng, lat in edge_geom.coords
    ]

    if not edge_coords:
        return []

    u_node = G.nodes[u]
    start_lat = float(u_node["y"])
    start_lng = float(u_node["x"])

    first_dist = abs(edge_coords[0]["lat"] - start_lat) + abs(edge_coords[0]["lng"] - start_lng)
    last_dist = abs(edge_coords[-1]["lat"] - start_lat) + abs(edge_coords[-1]["lng"] - start_lng)

    if last_dist < first_dist:
        edge_coords.reverse()

    start_node = {
        "lat": float(G.nodes[u]["y"]),
        "lng": float(G.nodes[u]["x"]),
    }
    end_node = {
        "lat": float(G.nodes[v]["y"]),
        "lng": float(G.nodes[v]["x"]),
    }

    # Only snap when the geometry endpoint is already very close to the route
    # node. Unconditional snapping can create long diagonal connectors if the
    # source geometry is mismatched or simplified oddly.
    if point_distance_meters(edge_coords[0], start_node) <= ROUTE_STITCH_SNAP_TOLERANCE_METERS:
        edge_coords[0] = start_node
    if point_distance_meters(edge_coords[-1], end_node) <= ROUTE_STITCH_SNAP_TOLERANCE_METERS:
        edge_coords[-1] = end_node

    return edge_coords


def project_point_onto_coord_path(endpoint_point, coord_path):
    if endpoint_point is None or len(coord_path) < 2:
        return None

    line = LineString(
        (float(point["lng"]), float(point["lat"]))
        for point in coord_path
    )
    if line.is_empty:
        return None

    projected = line.interpolate(
        line.project(Point(float(endpoint_point["lng"]), float(endpoint_point["lat"])))
    )
    anchor_point = {
        "lat": float(projected.y),
        "lng": float(projected.x),
    }

    if point_distance_meters(endpoint_point, anchor_point) > ROUTE_ENDPOINT_ATTACH_MAX_DISTANCE_METERS:
        return None

    return anchor_point


def attach_endpoint_to_route_coords(coords, endpoint_point, mode):
    if endpoint_point is None or not coords:
        return coords

    endpoint_point = build_route_point(endpoint_point["lat"], endpoint_point["lng"])
    target_index = 0 if mode == "start" else -1
    edge_point = coords[target_index]
    gap_meters = point_distance_meters(edge_point, endpoint_point)
    anchor_path = coords[:2] if mode == "start" else coords[-2:]
    anchor_point = project_point_onto_coord_path(endpoint_point, anchor_path)

    if anchor_point is None and gap_meters > ROUTE_ENDPOINT_ATTACH_MAX_DISTANCE_METERS:
        return coords

    if anchor_point is not None:
        if point_distance_meters(coords[target_index], anchor_point) <= ROUTE_STITCH_SNAP_TOLERANCE_METERS:
            coords[target_index] = anchor_point
        elif mode == "start":
            coords.insert(0, anchor_point)
        else:
            coords.append(anchor_point)
    elif gap_meters <= ROUTE_STITCH_SNAP_TOLERANCE_METERS:
        coords[target_index] = endpoint_point
        return coords

    target_index = 0 if mode == "start" else -1
    if point_distance_meters(coords[target_index], endpoint_point) <= ROUTE_STITCH_SNAP_TOLERANCE_METERS:
        coords[target_index] = endpoint_point
    elif mode == "start":
        coords.insert(0, endpoint_point)
    else:
        coords.append(endpoint_point)

    return coords


def path_to_coords(G, route, resolved_edges=None, start_point=None, end_point=None):
    if not route:
        return []

    if len(route) == 1:
        node_data = G.nodes[route[0]]
        return [{
            "lat": float(node_data["y"]),
            "lng": float(node_data["x"])
        }]

    coords = []

    if resolved_edges is None:
        resolved_edges = resolve_route_edge_records(G, route)

    for u, v, key, edge in resolved_edges:
        edge_coords = edge_geometry_to_coords(G, u, v, edge)
        if not edge_coords:
            continue

        if (
            coords
            and point_distance_meters(coords[-1], edge_coords[0]) <= ROUTE_STITCH_SNAP_TOLERANCE_METERS
        ):
            edge_coords[0] = coords[-1]
            coords.extend(edge_coords[1:])
        else:
            coords.extend(edge_coords)

    if coords:
        attach_endpoint_to_route_coords(coords, start_point, "start")
        attach_endpoint_to_route_coords(coords, end_point, "end")
        return coords

    fallback_coords = []
    for node in route:
        node_data = G.nodes[node]
        fallback_coords.append({
            "lat": float(node_data["y"]),
            "lng": float(node_data["x"])
        })
    attach_endpoint_to_route_coords(fallback_coords, start_point, "start")
    attach_endpoint_to_route_coords(fallback_coords, end_point, "end")
    return fallback_coords


def extract_route_street_path(G, route, resolved_edges=None):
    street_names = []

    if resolved_edges is None:
        resolved_edges = resolve_route_edge_records(G, route)

    for u, v, key, edge in resolved_edges:
        edge_names = edge.get("name")
        if edge_names is None:
            continue

        if not isinstance(edge_names, list):
            edge_names = [edge_names]

        for edge_name in edge_names:
            name = str(edge_name).strip()
            if not name:
                continue
            if street_names and street_names[-1] == name:
                continue
            street_names.append(name)

    return street_names


TURN_ANGLE_STRAIGHT_DEGREES = 20
TURN_ANGLE_SLIGHT_DEGREES = 45
TURN_ANGLE_UTURN_DEGREES = 150


def compute_bearing_degrees(point_a, point_b):
    lat1 = math.radians(point_a["lat"])
    lat2 = math.radians(point_b["lat"])
    delta_lng = math.radians(point_b["lng"] - point_a["lng"])

    x = math.sin(delta_lng) * math.cos(lat2)
    y = (
        math.cos(lat1) * math.sin(lat2)
        - math.sin(lat1) * math.cos(lat2) * math.cos(delta_lng)
    )
    return math.degrees(math.atan2(x, y)) % 360


def classify_turn_angle(delta_degrees):
    if delta_degrees > TURN_ANGLE_UTURN_DEGREES or delta_degrees < -TURN_ANGLE_UTURN_DEGREES:
        return "u_turn"
    if delta_degrees >= TURN_ANGLE_SLIGHT_DEGREES:
        return "right"
    if delta_degrees >= TURN_ANGLE_STRAIGHT_DEGREES:
        return "slight_right"
    if delta_degrees <= -TURN_ANGLE_SLIGHT_DEGREES:
        return "left"
    if delta_degrees <= -TURN_ANGLE_STRAIGHT_DEGREES:
        return "slight_left"
    return "straight"


def _turn_step_entry_bearing(coords):
    if len(coords) < 2:
        return None
    return compute_bearing_degrees(coords[0], coords[min(3, len(coords) - 1)])


def _turn_step_exit_bearing(coords):
    if len(coords) < 2:
        return None
    return compute_bearing_degrees(coords[max(0, len(coords) - 4)], coords[-1])


def extract_route_turn_steps(G, route, resolved_edges=None):
    """Collapse the route into per-street walking-direction steps: a name,
    the distance walked on it, and the turn onto it from the previous step.
    There is no maneuver data in the source graph, so the turn is derived
    from the bearing change between consecutive streets' geometry."""
    if resolved_edges is None:
        resolved_edges = resolve_route_edge_records(G, route)

    if not resolved_edges:
        return []

    steps = []
    for u, v, key, edge in resolved_edges:
        edge_names = edge.get("name")
        if edge_names is None:
            name = ""
        elif isinstance(edge_names, list):
            name = next((str(n).strip() for n in edge_names if str(n).strip()), "")
        else:
            name = str(edge_names).strip()

        coords = edge_geometry_to_coords(G, u, v, edge)
        if len(coords) < 2:
            u_node, v_node = G.nodes[u], G.nodes[v]
            coords = [
                {"lat": float(u_node["y"]), "lng": float(u_node["x"])},
                {"lat": float(v_node["y"]), "lng": float(v_node["x"])},
            ]
        length = max(float(edge.get("length", 0)), 0.0)

        # Unnamed connectors (driveways, short links) fold into whichever
        # step precedes them, so a turn is measured where the pedestrian
        # actually changes heading rather than at an arbitrary unnamed edge.
        if steps and (not name or steps[-1]["name"] == name):
            steps[-1]["length"] += length
            steps[-1]["coords"].extend(coords[1:])
        else:
            steps.append({"name": name, "length": length, "coords": list(coords)})

    turn_steps = []
    prev_exit_bearing = None
    for index, step in enumerate(steps):
        turn = "start"
        if index > 0:
            entry_bearing = _turn_step_entry_bearing(step["coords"])
            if prev_exit_bearing is None or entry_bearing is None:
                turn = "straight"
            else:
                delta = ((entry_bearing - prev_exit_bearing + 540) % 360) - 180
                turn = classify_turn_angle(delta)

        turn_steps.append({
            "name": step["name"],
            "distance": round(step["length"], 1),
            "turn": turn,
        })
        prev_exit_bearing = _turn_step_exit_bearing(step["coords"]) or prev_exit_bearing

    return turn_steps


def route_edges(route):
    return list(zip(route[:-1], route[1:]))


def simplify_route_path(route):
    if not route:
        return []

    simplified = []
    node_positions = {}

    for node in route:
        if simplified and node == simplified[-1]:
            continue

        existing_index = node_positions.get(node)
        if existing_index is not None:
            for removed_node in simplified[existing_index + 1:]:
                node_positions.pop(removed_node, None)
            simplified = simplified[:existing_index + 1]
            continue

        simplified.append(node)
        node_positions[node] = len(simplified) - 1

    return simplified


def evaluate_route(G, route, candidate_route_no, include_coordinates=False):
    total_distance = 0.0
    total_hazard = 0
    max_hazard = 0
    eliminated = False
    hazard_breakdown = {}
    flood_vars_encountered = set()
    threshold_exceedance_count = 0
    threshold_exceedance_vars = set()
    risk_distance = 0.0
    unsafe_distance = 0.0
    covered_distance = 0.0
    uncovered_distance = 0.0
    uncovered_count = 0

    resolved_edges = resolve_route_edge_records(G, route)

    for u, v, key, edge in resolved_edges:
        if not edge:
            continue

        length, hazard, hazard_factor = edge_metrics(edge)
        flood_var = edge.get("flood_var")

        total_distance += length
        if edge_has_hazard_data(edge):
            covered_distance += length
        else:
            uncovered_distance += length
            uncovered_count += 1
        total_hazard += hazard
        max_hazard = max(max_hazard, hazard)
        hazard_breakdown[str(hazard)] = hazard_breakdown.get(str(hazard), 0) + 1
        risk_distance += length * hazard_factor

        if flood_var is not None:
            flood_var = int(flood_var)
            flood_vars_encountered.add(flood_var)

        if hazard > HAZARD_THRESHOLD:
            eliminated = True
            threshold_exceedance_count += 1
            unsafe_distance += length
            if flood_var is not None:
                threshold_exceedance_vars.add(flood_var)

    return {
        "candidate_route_no": candidate_route_no,
        "path": list(route),
        "path_edges": serialize_route_edge_records(resolved_edges),
        "path_coordinates": path_to_coords(G, route, resolved_edges=resolved_edges) if include_coordinates else [],
        "distance": round(total_distance, 2),
        "total_hazard": total_hazard,
        "risk_distance": round(risk_distance, 2),
        "unsafe_distance": round(unsafe_distance, 2),
        "max_hazard": max_hazard,
        "eliminated": eliminated,
        "hazard_breakdown": dict(sorted(hazard_breakdown.items(), key=lambda item: int(item[0]))),
        "flood_vars_encountered": sorted(flood_vars_encountered),
        "threshold_exceedance_count": threshold_exceedance_count,
        "threshold_exceedance_vars": sorted(threshold_exceedance_vars),
        "hazard_data_coverage": summarize_hazard_data_coverage(covered_distance, uncovered_distance),
        "elimination_reason": build_elimination_reason(
            threshold_exceedance_count,
            uncovered_count,
            f"above safe threshold {HAZARD_THRESHOLD}",
        ),
    }


def summarize_hazard_data_coverage(covered_distance, uncovered_distance):
    total_distance = covered_distance + uncovered_distance
    return {
        "covered_distance": round(covered_distance, 2),
        "uncovered_distance": round(uncovered_distance, 2),
        "covered_percent": (
            round(100.0 * covered_distance / total_distance, 1)
            if total_distance > 0
            else 100.0
        ),
    }


def build_elimination_reason(threshold_exceedance_count, uncovered_count, threshold_label):
    if not threshold_exceedance_count:
        return None

    reason = f"Contains {threshold_exceedance_count} edge(s) {threshold_label}"
    if uncovered_count:
        reason += f", {uncovered_count} of them with no hazard data"
    return reason


def safety_sort_key(route):
    return (
        route["unsafe_distance"] > 0,
        route["unsafe_distance"],
        route["risk_distance"],
        route["distance"]
    )


def numeric_score(route):
    if route["unsafe_distance"] > 0:
        return (
            UNSAFE_PENALTY
            + route["unsafe_distance"] * 1000
            + route["risk_distance"] * 10
            + route["distance"]
        )

    return (
        SAFETY_WEIGHT * route["risk_distance"]
        + DISTANCE_WEIGHT * route["distance"]
    )


def summarize_candidate_routes(routes):
    valid_count = len([r for r in routes if not r["eliminated"]])
    eliminated_count = len([r for r in routes if r["eliminated"]])

    debug_print(f"[OSM] Candidate routes evaluated: {len(routes)}")
    debug_print(f"[OSM] Valid candidate routes: {valid_count}")
    debug_print(f"[OSM] Eliminated candidate routes: {eliminated_count}")


def generate_seed_routes(G, start_node, end_node):
    seeded_routes = {}

    for weight in ("route_cost", "length"):
        try:
            path = nx.shortest_path(G, start_node, end_node, weight=weight)
        except (nx.NetworkXNoPath, nx.NodeNotFound):
            continue

        path = simplify_route_path(path)
        if len(path) < 2:
            continue

        route = evaluate_route(G, path, 0, include_coordinates=False)
        seeded_routes[tuple(route["path"])] = route

    if seeded_routes:
        debug_print(f"[OSM] Seed routes prepared: {len(seeded_routes)}")

    return list(seeded_routes.values())


def build_goal_distance_map(G, end_node):
    reverse_graph = G.reverse(copy=False)
    return nx.single_source_dijkstra_path_length(reverse_graph, end_node, weight="length")


def estimate_ant_step_limit(G, start_node, end_node):
    try:
        baseline_path = nx.shortest_path(G, start_node, end_node, weight="length")
        return max(
            ACO_MIN_ROUTE_STEPS,
            int(len(baseline_path) * ACO_MAX_ROUTE_STEPS_MULTIPLIER)
        )
    except (nx.NetworkXNoPath, nx.NodeNotFound):
        return ACO_MIN_ROUTE_STEPS


def initialize_edge_pheromone(G):
    pheromone = {}
    for u, v in G.edges():
        pheromone.setdefault((u, v), 1.0)
    return pheromone


def route_pheromone_score(route, edge_pheromone):
    path_edges = route_edges(route)
    if not path_edges:
        return 0.0

    return sum(
        edge_pheromone.get(edge_key, EDGE_PHEROMONE_MIN)
        for edge_key in path_edges
    ) / len(path_edges)


def route_edge_signature(route):
    path_edges = route.get("path_edges") or []
    if not path_edges:
        return ()

    return tuple(
        (edge.get("u"), edge.get("v"), edge.get("key"))
        for edge in path_edges
    )


def route_path_signature(route):
    edge_signature = route_edge_signature(route)
    if edge_signature:
        return edge_signature

    return tuple(route.get("path", []))


def route_edge_set(route):
    edge_signature = route_edge_signature(route)
    if edge_signature:
        return set(edge_signature)

    path = tuple(route.get("path", []))
    if len(path) < 2:
        return set()

    return set(zip(path[:-1], path[1:]))


def route_overlap_ratio(route_a, route_b):
    edges_a = route_edge_set(route_a)
    edges_b = route_edge_set(route_b)

    if not edges_a or not edges_b:
        return 0.0

    shared_edges = len(edges_a & edges_b)
    return shared_edges / min(len(edges_a), len(edges_b))


def generate_supplemental_routes(G, start_node, end_node, seed_routes):
    unique_routes = {
        route_path_signature(route): route
        for route in seed_routes
        if route.get("path")
    }

    try:
        supplemental_paths = list(
            ox.routing.k_shortest_paths(
                G,
                start_node,
                end_node,
                k=SUPPLEMENTAL_ROUTE_LIMIT,
                weight="route_cost",
            )
        )
    except Exception as exc:
        debug_print(f"[OSM] Supplemental path search failed: {exc}")
        supplemental_paths = []

    for path in supplemental_paths:
        path = simplify_route_path(path)
        if len(path) < 2:
            continue

        route = evaluate_route(G, path, 0, include_coordinates=False)
        path_key = route_path_signature(route)
        if path_key in unique_routes:
            continue

        unique_routes[path_key] = route

    generate_diverse_supplemental_routes(G, start_node, end_node, unique_routes)

    return list(unique_routes.values())


def generate_diverse_supplemental_routes(G, start_node, end_node, unique_routes):
    """Repeatedly re-plans the shortest path, penalizing each attempt's
    edges before the next one, so the search is pushed toward corridors it
    hasn't already used -- mutates `unique_routes` in place with whatever
    it finds.

    Yen's k-shortest-paths above generates its alternatives by perturbing
    a single edge of the shortest path at a time, so on a uniform street
    grid (most streets the same length) almost all of its "alternatives"
    are one-block detours around the same corridor with the same total
    length -- exactly what shows up as several routes on the map that all
    look identical. Penalizing whole paths instead of single edges forces
    each attempt away from every corridor already found, not just the one
    edge Yen's happened to swap out.
    """
    penalty_multipliers = {}

    def penalized_weight(u, v, parallel_edges):
        key, edge = min(parallel_edges.items(), key=lambda item: edge_traversal_cost(item[1]))
        return edge_traversal_cost(edge) * penalty_multipliers.get((u, v, key), 1.0)

    for _ in range(DIVERSE_ROUTE_SEARCH_ATTEMPTS):
        try:
            path = nx.shortest_path(G, start_node, end_node, weight=penalized_weight)
        except (nx.NetworkXNoPath, nx.NodeNotFound):
            break

        path = simplify_route_path(path)
        if len(path) < 2:
            break

        route = evaluate_route(G, path, 0, include_coordinates=False)
        unique_routes.setdefault(route_path_signature(route), route)

        # Penalize this attempt's edges regardless of whether the route was
        # already known, so a repeated search keeps getting pushed further
        # away rather than re-finding the same corridor every time.
        for u, v in route_edges(path):
            parallel_edges = G.get_edge_data(u, v)
            if not parallel_edges:
                continue
            key, _ = min(parallel_edges.items(), key=lambda item: edge_traversal_cost(item[1]))
            penalty_multipliers[(u, v, key)] = (
                penalty_multipliers.get((u, v, key), 1.0) * DIVERSE_ROUTE_EDGE_PENALTY
            )


def select_display_routes(sorted_routes, limit):
    if limit <= 0 or not sorted_routes:
        return []

    selected = []
    selected_paths = set()
    route_rank = {
        route_path_signature(route): index
        for index, route in enumerate(sorted_routes)
    }

    for overlap_threshold in DISPLAY_ROUTE_OVERLAP_THRESHOLDS:
        for route in sorted_routes:
            if len(selected) >= limit:
                break

            path_signature = route_path_signature(route)
            if path_signature in selected_paths:
                continue

            if any(
                route_overlap_ratio(route, existing_route) > overlap_threshold
                for existing_route in selected
            ):
                continue

            selected.append(route)
            selected_paths.add(path_signature)

        if len(selected) >= limit:
            break

    debug_print(
        f"[OSM] Display route selection: requested={limit}, "
        f"candidates={len(sorted_routes)}, selected={len(selected)}"
    )

    selected.sort(
        key=lambda route: route_rank.get(
            route_path_signature(route),
            len(sorted_routes),
        )
    )

    return selected[:limit]


def get_ant_choices(
    G,
    current_node,
    end_node,
    visit_counts,
    edge_pheromone,
    goal_distance_map,
    previous_node=None,
    allow_revisit=False,
    edge_route_usage=None,
):
    choices = []
    weights = []

    for neighbor in G.successors(current_node):
        goal_distance = goal_distance_map.get(neighbor)
        if goal_distance is None:
            continue

        visits = visit_counts.get(neighbor, 0)
        if visits > 0 and not allow_revisit:
            continue
        if visits >= MAX_NODE_VISITS:
            continue

        edge = get_best_edge(G, current_node, neighbor)
        if not edge:
            continue

        tau = edge_pheromone.get((current_node, neighbor), 1.0) ** ALPHA
        eta = (
            1.0 / (edge_traversal_cost(edge) + DESTINATION_WEIGHT * goal_distance + 1e-9)
        ) ** BETA

        if edge_hazard_level(edge) > HAZARD_THRESHOLD:
            eta *= UNSAFE_EDGE_HEURISTIC_FACTOR

        if visits > 0:
            eta *= 0.25 / visits

        if previous_node is not None and neighbor == previous_node:
            eta *= 0.10

        if neighbor == end_node:
            eta *= 3.0

        if edge_route_usage:
            usage = edge_route_usage.get((current_node, neighbor), 0)
            if usage:
                eta /= (1.0 + ANT_ROUTE_DIVERSITY_PENALTY * usage)

        choices.append(neighbor)
        weights.append(max(tau * eta, 1e-12))

    return choices, weights


def construct_ant_route(
    G,
    start_node,
    end_node,
    edge_pheromone,
    goal_distance_map,
    max_steps,
    edge_route_usage=None,
):
    if start_node == end_node:
        return [start_node]

    if start_node not in goal_distance_map:
        return None

    current_node = start_node
    route = [current_node]
    visit_counts = {current_node: 1}

    for _ in range(max_steps):
        if current_node == end_node:
            return route

        previous_node = route[-2] if len(route) > 1 else None
        choices, weights = get_ant_choices(
            G,
            current_node,
            end_node,
            visit_counts,
            edge_pheromone,
            goal_distance_map,
            previous_node=previous_node,
            allow_revisit=False,
            edge_route_usage=edge_route_usage,
        )

        if not choices:
            choices, weights = get_ant_choices(
                G,
                current_node,
                end_node,
                visit_counts,
                edge_pheromone,
                goal_distance_map,
                previous_node=previous_node,
                allow_revisit=True,
                edge_route_usage=edge_route_usage,
            )

        if not choices:
            return None

        next_node = random.choices(choices, weights=weights, k=1)[0]
        route.append(next_node)
        visit_counts[next_node] = visit_counts.get(next_node, 0) + 1
        current_node = next_node

    return route if route[-1] == end_node else None


def run_aco(G, start_node, end_node):
    edge_pheromone = initialize_edge_pheromone(G)

    if start_node == end_node:
        return [evaluate_route(G, [start_node], 1, include_coordinates=False)], edge_pheromone

    goal_distance_map = build_goal_distance_map(G, end_node)
    if start_node not in goal_distance_map:
        debug_print("[ACO] Start node cannot reach the destination in the directed graph")
        return [], edge_pheromone

    step_limit = estimate_ant_step_limit(G, start_node, end_node)
    route_cache = {
        tuple(route["path"]): route
        for route in generate_seed_routes(G, start_node, end_node)
    }
    best_score = float("inf")
    stagnant_iterations = 0

    # How many routes already sitting in route_cache use each edge --
    # get_ant_choices() uses this to gently steer later ants away from
    # corridors that already have several found routes running through
    # them, so the pool that comes out of the loop actually scatters across
    # the road network instead of every ant converging on one pheromone
    # trail (see ANT_ROUTE_DIVERSITY_PENALTY).
    edge_route_usage = {}

    def register_route_usage(route):
        for edge_key in route_edges(route["path"]):
            edge_route_usage[edge_key] = edge_route_usage.get(edge_key, 0) + 1

    for route in route_cache.values():
        register_route_usage(route)

    debug_print(f"[ACO] Reachable nodes to destination: {len(goal_distance_map)}")
    debug_print(f"[ACO] Ant step limit: {step_limit}")

    for iteration in range(NUM_ITERATIONS):
        completed_routes = []

        for _ in range(NUM_ANTS):
            ant_route = construct_ant_route(
                G,
                start_node,
                end_node,
                edge_pheromone,
                goal_distance_map,
                step_limit,
                edge_route_usage=edge_route_usage,
            )

            if not ant_route or ant_route[-1] != end_node:
                continue

            ant_route = simplify_route_path(ant_route)
            if len(ant_route) < 2 or ant_route[0] != start_node or ant_route[-1] != end_node:
                continue

            route_key = tuple(ant_route)
            route = route_cache.get(route_key)
            if route is None:
                route = evaluate_route(G, ant_route, 0, include_coordinates=False)
                route_cache[route_key] = route
                register_route_usage(route)

            completed_routes.append(route)

        unique_completed = list({
            tuple(route["path"]): route for route in completed_routes
        }.values())
        debug_print(
            f"[ACO] Iteration {iteration + 1}: "
            f"completed={len(completed_routes)}, unique={len(unique_completed)}"
        )
        bump_progress()

        for edge_key in edge_pheromone:
            edge_pheromone[edge_key] *= (1 - EVAPORATION)
            edge_pheromone[edge_key] = max(edge_pheromone[edge_key], EDGE_PHEROMONE_MIN)

        if not completed_routes:
            stagnant_iterations += 1
            if stagnant_iterations >= ACO_STAGNATION_LIMIT and route_cache:
                debug_print("[ACO] Early stop: route pool stopped improving")
                break
            continue

        reinforcement_pool = [
            route for route in completed_routes
            if not route["eliminated"]
        ] or completed_routes

        winners = []
        seen_winners = set()
        for route in sorted(reinforcement_pool, key=numeric_score):
            route_key = tuple(route["path"])
            if route_key in seen_winners:
                continue
            seen_winners.add(route_key)
            winners.append(route)
            if len(winners) >= TOP_ACO_REINFORCERS:
                break

        for route in winners:
            deposit = Q / (numeric_score(route) + 1e-9)
            for edge_key in route_edges(route["path"]):
                edge_pheromone[edge_key] = min(
                    edge_pheromone.get(edge_key, EDGE_PHEROMONE_MIN) + deposit,
                    EDGE_PHEROMONE_MAX,
                )

        current_best = min(route_cache.values(), key=numeric_score, default=None)
        if current_best is not None and numeric_score(current_best) + 1e-9 < best_score:
            best_score = numeric_score(current_best)
            stagnant_iterations = 0
        else:
            stagnant_iterations += 1

        if stagnant_iterations >= ACO_STAGNATION_LIMIT and len(route_cache) >= FINAL_ROUTES_TO_SHOW:
            debug_print("[ACO] Early stop: enough stable routes collected")
            break

    candidate_routes = sorted(route_cache.values(), key=safety_sort_key)
    candidate_routes = generate_supplemental_routes(G, start_node, end_node, candidate_routes)
    candidate_routes = sorted(candidate_routes, key=safety_sort_key)
    for idx, route in enumerate(candidate_routes, start=1):
        route["candidate_route_no"] = idx

    summarize_candidate_routes(candidate_routes)
    debug_print(f"[ACO] Unique routes generated: {len(candidate_routes)}")
    return candidate_routes, edge_pheromone


def finalize_routes(G, candidate_routes, edge_pheromone, start_point=None, end_point=None):
    scored_routes = []
    for route in candidate_routes:
        route_copy = route.copy()
        resolved_edges = hydrate_route_edge_records(G, route_copy.get("path_edges"))
        if not resolved_edges:
            resolved_edges = resolve_route_edge_records(G, route_copy["path"])
            route_copy["path_edges"] = serialize_route_edge_records(resolved_edges)

        route_copy["path_coordinates"] = path_to_coords(
            G,
            route_copy["path"],
            resolved_edges=resolved_edges,
            start_point=start_point,
            end_point=end_point,
        )
        route_copy["street_path"] = extract_route_street_path(
            G,
            route_copy["path"],
            resolved_edges=resolved_edges,
        )
        route_copy["turn_steps"] = extract_route_turn_steps(
            G,
            route_copy["path"],
            resolved_edges=resolved_edges,
        )
        route_copy["final_pheromone"] = round(
            route_pheromone_score(route_copy["path"], edge_pheromone),
            4,
        )
        route_copy["aco_score"] = round(numeric_score(route_copy), 2)
        scored_routes.append(route_copy)

    sorted_routes = sorted(
        scored_routes,
        key=lambda route: (
            route["unsafe_distance"] > 0,
            route["unsafe_distance"],
            route["risk_distance"],
            -route["final_pheromone"],
            route["distance"],
        )
    )

    valid_routes = [r.copy() for r in sorted_routes if not r["eliminated"]]
    eliminated_routes = [r.copy() for r in sorted_routes if r["eliminated"]]

    if valid_routes:
        eliminated_limit = min(
            MAX_ELIMINATED_ROUTES_TO_SHOW,
            len(eliminated_routes),
        )
        eliminated_routes = select_display_routes(eliminated_routes, eliminated_limit)
        valid_routes = select_display_routes(
            valid_routes,
            FINAL_ROUTES_TO_SHOW - len(eliminated_routes),
        )
    else:
        eliminated_routes = select_display_routes(eliminated_routes, FINAL_ROUTES_TO_SHOW)

    final_routes = []

    for idx, route in enumerate(valid_routes, start=1):
        route["display_route_no"] = idx
        route["category"] = "best" if idx == 1 else "available"
        route["status"] = "Best" if idx == 1 else "Available"
        route["color"] = "#22c55e" if idx == 1 else "#f59e0b"
        final_routes.append(route)

    next_index = len(final_routes) + 1
    for idx, route in enumerate(eliminated_routes, start=next_index):
        route["display_route_no"] = idx
        route["category"] = "eliminated"
        route["status"] = (
            "Best" if not valid_routes and idx == 1
            else "Eliminated"
        )
        route["color"] = "#ef4444"
        final_routes.append(route)

    debug_print(
        f"[OSM] Final route count: requested={FINAL_ROUTES_TO_SHOW}, returned={len(final_routes)}"
    )
    return final_routes

def simulate_osm_routes(start_name, start_lat, start_lng, end_name, end_lat, end_lng, hazard_type="Flood", barangay_name=None):
    debug_print("\n" + "=" * 60)
    debug_print("[OSM] SIMULATION START")
    debug_print(f"[OSM] From: {start_name} ({start_lat}, {start_lng})")
    debug_print(f"[OSM] To  : {end_name} ({end_lat}, {end_lng})")
    if barangay_name:
        debug_print(f"[OSM] Selection context: {barangay_name}")

    simulation_started = time.perf_counter()
    phase_started = simulation_started
    debug_print("[OSM] Phase 1/4: preparing routing graph")

    scope_name = barangay_name or find_barangay_for_point(start_lat, start_lng)
    if not scope_name:
        return {
            "error": True,
            "message": f"{start_name} is outside the barangays this system has hazard data for.",
        }

    G = prepare_routing_graph(scope_name)
    scope_display_name = get_barangay_boundary(scope_name)["display_name"]

    for location_name, lat, lng in (
        (start_name, start_lat, start_lng),
        (end_name, end_lat, end_lng),
    ):
        if not is_point_in_hazard_coverage(G, lat, lng):
            return {
                "error": True,
                "message": (
                    f"{location_name} is outside the {scope_display_name} hazard data "
                    "coverage, so a route to it cannot be checked for safety."
                ),
            }

    now = time.perf_counter()
    debug_print(f"[OSM] Phase 1/4 complete in {now - phase_started:.2f}s")
    phase_started = now
    debug_print("[OSM] Phase 2/4: snapping start/end nodes")

    start_node, end_node = get_nearest_osm_nodes(G, start_lat, start_lng, end_lat, end_lng)
    now = time.perf_counter()
    debug_print(f"[OSM] Phase 2/4 complete in {now - phase_started:.2f}s")
    phase_started = now
    debug_print("[OSM] Phase 3/4: searching candidate routes")
    reset_progress(NUM_ITERATIONS)
    candidate_routes, edge_pheromone = run_aco(G, start_node, end_node)
    now = time.perf_counter()
    debug_print(f"[OSM] Phase 3/4 complete in {now - phase_started:.2f}s")

    if not candidate_routes:
        return {
            "error": True,
            "message": (
                "No route was found between the selected locations that stays "
                "inside the area covered by hazard data."
            ),
        }

    phase_started = now
    debug_print("[OSM] Phase 4/4: finalizing route results")
    final_routes = finalize_routes(
        G,
        candidate_routes,
        edge_pheromone,
        start_point=build_route_point(start_lat, start_lng),
        end_point=build_route_point(end_lat, end_lng),
    )
    now = time.perf_counter()
    debug_print(f"[OSM] Phase 4/4 complete in {now - phase_started:.2f}s")

    for route in final_routes:
        route["path_label"] = f"{start_name} -> {end_name}"
        route["segments"] = max(1, len(route.get("path", [])) - 1)
        route["start_lat"] = float(start_lat)
        route["start_lng"] = float(start_lng)
        route["destination_lat"] = float(end_lat)
        route["destination_lng"] = float(end_lng)

    debug_print(f"[OSM] Total simulation time: {now - simulation_started:.2f}s")
    debug_print("[OSM] SIMULATION END")
    debug_print("=" * 60 + "\n")

    return {
        "error": False,
        "start": start_name,
        "end": end_name,
        "hazard_type": hazard_type,
        "safe_threshold": HAZARD_THRESHOLD,
        "total_candidate_routes": len(candidate_routes),
        "routes": final_routes
    }
