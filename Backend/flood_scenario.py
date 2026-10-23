
import base64
import math
from threading import RLock

import numpy as np
import shapely
from shapely.geometry import Point

from osm_routing import (
    get_barangay_boundary,
    load_flood_zones,
    normalize_barangay_name,
)

FLOOD_RETURN_PERIOD_YEARS = 25
FILL_GRID_CELL_METERS = 5.0
# Room around the barangay, so the water's edge at its outline is drawn whole.
FILL_GRID_PAD_METERS = 30.0
# Fill time 0..250 per cell; FILL_NEVER marks a cell water never reaches.
FILL_GRID_STEPS = 250
FILL_NEVER = 255
# Each flooded cell's level is also given to the dry cells this many cells
# past the water's edge: the browser draws the picture inside the flood map's
# own outline, and the margin keeps that edge from showing a gap.
FILL_EDGE_MARGIN_CELLS = 2
# How hard water spreads into each level (High, Medium, Low): it reaches
# shallow water last.
FILL_SPREAD_COST = {3: 1.0, 2: 1.35, 1: 1.9}
# A patch whose deepest water is shallower starts later, by this many metres
# of spreading per level.
FILL_LEVEL_DELAY_METERS = 140.0
# Where water first appears: the deepest points of each patch, at least this
# far apart (in cells).
FILL_SOURCE_SPACING_CELLS = 35
# A little noise so the edges of the spreading water are uneven, and fixed
# seeds so every visitor sees the same flood.
FILL_COST_NOISE = 0.9
FILL_EDGE_NOISE = 0.035
FILL_NOISE_SEED = 11
FILL_COST_SEED = 5

METERS_PER_DEGREE_LAT = 110574.0
METERS_PER_DEGREE_LNG = 111320.0

_SCENARIO_CACHE = {}
_SCENARIO_LOCK = RLock()


def _barangay_flood(boundary_geometry):
    """The flood map's levels inside the barangay: {flood var: geometry}."""
    clipped = {}
    for zone in load_flood_zones():
        geometry = zone["geometry"].intersection(boundary_geometry)
        if not geometry.is_empty:
            clipped[int(zone["var"])] = geometry
    return clipped


def _fill_grid(boundary_geometry, flood):
    """Each cell's fill time (uint8) and level (uint8), with the grid's
    placement."""
    from scipy import ndimage
    from scipy.sparse import coo_matrix
    from scipy.sparse.csgraph import dijkstra

    min_lng, min_lat, max_lng, max_lat = boundary_geometry.bounds
    mid_lat = (min_lat + max_lat) / 2
    kx = METERS_PER_DEGREE_LNG * math.cos(math.radians(mid_lat))
    ky = METERS_PER_DEGREE_LAT
    cell = FILL_GRID_CELL_METERS
    west = min_lng - FILL_GRID_PAD_METERS / kx
    north = max_lat + FILL_GRID_PAD_METERS / ky
    nx = int(math.ceil(((max_lng - min_lng) * kx + 2 * FILL_GRID_PAD_METERS) / cell))
    ny = int(math.ceil(((max_lat - min_lat) * ky + 2 * FILL_GRID_PAD_METERS) / cell))

    lngs = west + (np.arange(nx) + 0.5) * cell / kx
    lats = north - (np.arange(ny) + 0.5) * cell / ky
    grid_lng, grid_lat = np.meshgrid(lngs, lats)
    level = np.zeros((ny, nx), np.uint8)
    for var in (1, 2, 3):
        geometry = flood.get(var)
        if geometry is None:
            continue
        shapely.prepare(geometry)
        inside = shapely.contains_xy(geometry, grid_lng, grid_lat)
        level[inside] = np.maximum(level[inside], var)
    flooded = level > 0

    fill = np.full((ny, nx), FILL_NEVER, np.uint8)
    if flooded.any():
        # Sources: the deepest points of each patch's deepest level.
        patches, _ = ndimage.label(flooded, structure=np.ones((3, 3)))
        source_cells, source_delays = [], []
        for index, box in enumerate(ndimage.find_objects(patches), start=1):
            ys, xs = slice(max(0, box[0].start - 1), box[0].stop + 1), slice(max(0, box[1].start - 1), box[1].stop + 1)
            patch = patches[ys, xs] == index
            deepest = int(level[ys, xs][patch].max())
            core = patch & (level[ys, xs] == deepest)
            depth_in = ndimage.distance_transform_edt(core) * cell
            peaks = core & (depth_in == ndimage.maximum_filter(depth_in, size=FILL_SOURCE_SPACING_CELLS))
            deepest_in = depth_in[core].max()
            peaks &= depth_in >= max(min(deepest_in * 0.45, 3 * cell), cell)
            if not peaks.any():
                peaks = core & (depth_in == deepest_in)
            for y, x in zip(*np.nonzero(peaks)):
                source_cells.append((ys.start + y) * nx + xs.start + x)
                source_delays.append((3 - deepest) * FILL_LEVEL_DELAY_METERS + max(0.0, 60.0 - depth_in[y, x]) * 1.2)

        # Spreading: the cheapest way from any source through flooded cells.
        noise = ndimage.gaussian_filter(np.random.default_rng(FILL_COST_SEED).standard_normal((ny, nx)), 5.0)
        noise /= np.abs(noise).max() or 1
        spread_cost = np.zeros((ny, nx))
        for var, value in FILL_SPREAD_COST.items():
            spread_cost[level == var] = value
        cost = (spread_cost * np.exp(FILL_COST_NOISE * noise)).ravel()
        is_flooded = flooded.ravel()
        cells = np.arange(nx * ny).reshape(ny, nx)
        rows, cols, weights = [], [], []
        for dy, dx in ((0, 1), (1, 0), (1, 1), (1, -1)):
            ys = np.arange(0, ny - dy)
            xs = np.arange(max(0, -dx), nx - max(0, dx))
            a = cells[np.ix_(ys, xs)].ravel()
            b = cells[np.ix_(ys + dy, xs + dx)].ravel()
            keep = is_flooded[a] & is_flooded[b]
            a, b = a[keep], b[keep]
            w = cell * math.hypot(dx, dy) * (cost[a] + cost[b]) / 2
            rows += [a, b]
            cols += [b, a]
            weights += [w, w]
        origin = nx * ny
        rows.append(np.full(len(source_cells), origin))
        cols.append(np.array(source_cells, dtype=np.int64))
        weights.append(np.array(source_delays) + 1e-3)
        graph = coo_matrix(
            (np.concatenate(weights), (np.concatenate(rows), np.concatenate(cols))),
            shape=(origin + 1, origin + 1),
        ).tocsr()
        arrival = dijkstra(graph, directed=True, indices=origin)[:origin].reshape(ny, nx)
        reached = flooded & np.isfinite(arrival)

        # By rank, so the flooded area grows at an even pace.
        times = np.zeros((ny, nx))
        order = arrival[reached].argsort().argsort()
        times[reached] = order / max(1, order.max())
        edge_noise = ndimage.gaussian_filter(np.random.default_rng(FILL_NOISE_SEED).standard_normal((ny, nx)), 3.0)
        edge_noise /= np.abs(edge_noise).max() or 1
        times = np.where(reached, np.clip(times + FILL_EDGE_NOISE * edge_noise, 0, 1), 2.0)
        margin = 2 * FILL_EDGE_MARGIN_CELLS + 1
        grown = ndimage.grey_erosion(times, size=(margin, margin))
        edge = ~reached & (grown < 2.0)
        times[edge] = grown[edge]
        fill = np.where(times <= 1.0, np.round(times * FILL_GRID_STEPS), FILL_NEVER).astype(np.uint8)

        # The margin cells take the level of the nearest flooded cell.
        _, (near_y, near_x) = ndimage.distance_transform_edt(~flooded, return_indices=True)
        level = np.where(fill < FILL_NEVER, level[near_y, near_x], 0).astype(np.uint8)

    return {
        "west": round(west, 7),
        "north": round(north, 7),
        "cell_lat": cell / ky,
        "cell_lng": cell / kx,
        "nx": nx,
        "ny": ny,
        "fill": base64.b64encode(fill.tobytes()).decode("ascii"),
        "level": base64.b64encode(level.tobytes()).decode("ascii"),
    }


def _level_shares(boundary_geometry, flood):
    """Each level's share of the barangay's area."""
    lat = boundary_geometry.centroid.y
    kx = METERS_PER_DEGREE_LNG * math.cos(math.radians(lat))

    def area(geometry):
        return shapely.transform(geometry, lambda xy: xy * [kx, METERS_PER_DEGREE_LAT]).area

    total = area(boundary_geometry) or 1
    return {str(var): round(area(geometry) / total, 4) for var, geometry in sorted(flood.items())}


def get_flood_scenario_payload(barangay_name):
    """The barangay's flood scenario for the intro, or None for a barangay
    with no boundary. Built once per process (a few seconds), then cached."""
    canonical_name = normalize_barangay_name(barangay_name)
    cached = _SCENARIO_CACHE.get(canonical_name)
    if cached is not None:
        return cached
    with _SCENARIO_LOCK:
        cached = _SCENARIO_CACHE.get(canonical_name)
        if cached is not None:
            return cached
        boundary = get_barangay_boundary(canonical_name)
        if boundary is None:
            return None
        flood = _barangay_flood(boundary["geometry"])
        payload = {
            "barangay": boundary["display_name"],
            "return_period_years": FLOOD_RETURN_PERIOD_YEARS,
            "shares": _level_shares(boundary["geometry"], flood),
            "grid": _fill_grid(boundary["geometry"], flood),
        }
        _SCENARIO_CACHE[canonical_name] = payload
        return payload


def describe_flood_start(lat, lng):
    """What a run's result says about the flood at its start pin: the flood
    map's level there (0 dry, 1 Low, 2 Medium, 3 High)."""
    point = Point(float(lng), float(lat))
    level = max(
        (int(zone["var"]) for zone in load_flood_zones() if zone["prepared"].contains(point)),
        default=0,
    )
    return {
        "return_period_years": FLOOD_RETURN_PERIOD_YEARS,
        "start_level": level,
    }
