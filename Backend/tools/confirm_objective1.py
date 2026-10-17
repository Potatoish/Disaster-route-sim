"""Confirms the Objective 1 figures with AGNAS's own code (final run).

Run from the Backend folder:
    python tools/confirm_objective1.py --noah path/to/MetroManila_Flood_25year.shp
    python tools/confirm_objective1.py            (skips the NOAH comparison)

It builds the same routing graphs the app uses and reports what they contain,
so the manuscript quotes numbers that come from the system itself:
  1. Road network per barangay: road pieces, km, nodes, private roads.
  2. Flood: km of road per hazard level (Low 1 / Medium 3 / High 5), how much of
     that is "whole piece counted" vs "actually inside the zone" (the
     worst-class-wins rule), and, with --noah, agreement between the original
     NOAH shapefile and the simplified layers the app uses.
  3. Earthquake: km of road per liquefaction, ground-shaking and overall level.
  4. Evacuation sites (flood and earthquake): inside the hazard data or not,
     the road a route ends on (distance, name, private or public, its hazard
     level) and the hazard level at the site itself.

Writes to a new folder in tools/evaluation_results/:
    objective1_confirm.txt    everything printed below
    objective1_confirm.json   the same figures, machine-readable
"""
import argparse
import json
import platform
import subprocess
import sys
from datetime import datetime
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

import osm_routing
from earthquake_data import get_earthquake_dataset
from earthquake_service import _annotate_graph_with_earthquake_hazards, _get_earthquake_graph

BARANGAYS = ("pinagbuhatan", "sta lucia")
FLOOD_LEVEL_NAMES = {1: "Low or no flood", 3: "Medium", 5: "High"}


# ---------------------------------------------------------------------------
# Output: print and keep a copy for objective1_confirm.txt
# ---------------------------------------------------------------------------

LINES = []


def say(text=""):
    print(text)
    LINES.append(text)


def record(store, barangay, key, value, label, unit):
    """Keep a figure and print it."""
    store[key] = value
    shown = f"{value:,}" if isinstance(value, int) else f"{value:,.2f}"
    say(f"  {label}: {shown}{unit}")


# ---------------------------------------------------------------------------
# Road helpers (unchanged from the first version)
# ---------------------------------------------------------------------------

def unique_edges(G):
    """One (u, v, data) per road piece (the walking graph stores both directions)."""
    seen = {}
    for u, v, _, data in G.edges(keys=True, data=True):
        key = (min(str(u), str(v)), max(str(u), str(v)), round(float(data.get("length", 0)), 1))
        seen.setdefault(key, (u, v, data))
    return list(seen.values())


def unique_roads(G):
    return [data for _, _, data in unique_edges(G)]


def km(roads):
    return sum(float(d.get("length", 0)) for d in roads) / 1000


def road_name(data):
    name = data.get("name")
    if isinstance(name, list):
        return " / ".join(str(n) for n in name if n)
    return str(name or "")


def inside_km(G, edges, zone_geom):
    """Road length (km) actually lying inside zone_geom."""
    total = 0.0
    for u, v, data in edges:
        geom = osm_routing.get_edge_geometry(G, u, v, data)
        if geom is None or geom.length == 0:
            continue
        try:
            share = geom.intersection(zone_geom).length / geom.length
        except Exception:  # noqa: BLE001
            share = 0.0
        total += float(data.get("length", 0)) * share
    return total / 1000


def bounds_box(G, margin=0.002):
    from shapely.geometry import box
    xs = [float(d["x"]) for _, d in G.nodes(data=True)]
    ys = [float(d["y"]) for _, d in G.nodes(data=True)]
    return box(min(xs) - margin, min(ys) - margin, max(xs) + margin, max(ys) + margin)


def optional(label, func, *args):
    """Run an extra check; report a failure instead of stopping the script."""
    try:
        return func(*args)
    except Exception as exc:  # noqa: BLE001
        say(f"  [{label} could not be computed: {type(exc).__name__}: {exc}]")
        return None


# ---------------------------------------------------------------------------
# Flood checks
# ---------------------------------------------------------------------------

def flood_worst_class(G, barangay, store):
    """Road counted as High/Medium (whole piece) vs road actually inside those zones."""
    area = bounds_box(G)
    edges = unique_edges(G)
    for zone in osm_routing.load_flood_zones():
        level = int(zone["hazard"])
        if level not in (3, 5):
            continue
        counted = km([d for _, _, d in edges if int(d.get("hazard", 1)) == level])
        actual = inside_km(G, edges, zone["geometry"].intersection(area))
        say(f"  flood level {level} ({FLOOD_LEVEL_NAMES[level]}): counted {counted:.2f} km (whole pieces)")
        record(store, barangay, f"flood_level_{level}_inside_km", round(actual, 2),
               f"    actually inside the level {level} zone", " km")


def noah_agreement(G, shp_path, barangay, store):
    """Share of road length whose flood level is the same from the original
    NOAH shapefile and from the simplified layers the app uses."""
    import geopandas as gpd
    from shapely.prepared import prep
    from shapely.validation import make_valid

    area = bounds_box(G, margin=0.005)
    zones = []
    for _, row in gpd.read_file(shp_path).iterrows():
        var = int(row["Var"])
        try:
            geom = row.geometry.intersection(area)
        except Exception:  # noqa: BLE001
            geom = make_valid(row.geometry).intersection(area)
        if not geom.is_empty:
            zones.append({"var": var, "hazard": osm_routing.VAR_TO_HAZARD[var], "prepared": prep(geom)})
    zones.sort(key=lambda zone: zone["hazard"], reverse=True)  # same order as load_flood_zones()
    same = lower = higher = 0.0
    for u, v, data in unique_edges(G):
        original, _ = osm_routing.resolve_edge_hazard(osm_routing.get_edge_geometry(G, u, v, data), zones)
        used = int(data.get("hazard", 1))
        length = float(data.get("length", 0))
        if used == original:
            same += length
        elif used < original:
            lower += length
        else:
            higher += length
    total = same + lower + higher
    say("  NOAH original shapefile vs the simplified layers the app uses:")
    record(store, barangay, "noah_same_pct", round(100 * same / total, 2), "    same level on", "% of road length")
    record(store, barangay, "noah_lower_km", round(lower / 1000, 2), "    simplified level lower on", " km")
    record(store, barangay, "noah_higher_km", round(higher / 1000, 2), "    simplified level higher on", " km")


# ---------------------------------------------------------------------------
# Earthquake checks
# ---------------------------------------------------------------------------

def liquefaction_worst_class(E, dataset, barangay, store):
    edges = unique_edges(E)
    zones = [z for z in dataset["layer_zones"]["liquefaction"] if int(z["severity"]) == 5]
    if not zones:
        say("  no liquefaction level 5 zone in this barangay")
        return
    from shapely.ops import unary_union
    counted = km([d for _, _, d in edges if d.get("eq_liquefaction") == 5])
    actual = inside_km(E, edges, unary_union([z["evaluation_geometry"] for z in zones]))
    say(f"  liquefaction level 5: counted {counted:.2f} km (whole pieces)")
    record(store, barangay, "liquefaction_5_inside_km", round(actual, 2), "    actually inside the level 5 zone", " km")


# ---------------------------------------------------------------------------
# Evacuation sites
# ---------------------------------------------------------------------------

def flood_level_at(lat, lng):
    from shapely.geometry import Point
    point = Point(float(lng), float(lat))
    for zone in osm_routing.load_flood_zones():  # highest level first
        if zone["prepared"].covers(point):
            return int(zone["hazard"])
    return 1


def layer_level_at(dataset, layer, lat, lng):
    from shapely.geometry import Point
    point = Point(float(lng), float(lat))
    levels = [int(z["severity"]) for z in dataset["layer_zones"][layer] if z["evaluation_geometry"].covers(point)]
    return max(levels) if levels else None


def access_road(graph, lat, lng):
    access = osm_routing.find_road_access_point(graph, lat, lng)
    if access is None:
        return None, None
    u, v, key = access["edge"]
    return access, graph.edges[u, v, key]


def site_table(barangay, G, E, dataset, store):
    rows = []
    threshold = osm_routing.HAZARD_THRESHOLD

    say("  Flood evacuation sites (the default flood destination):")
    for site in osm_routing.get_flood_evacuation_sites(barangay):
        lat, lng = site["lat"], site["lng"]
        covered = bool(osm_routing.is_point_in_hazard_coverage(G, lat, lng))
        access, data = access_road(G, lat, lng)
        site_level = flood_level_at(lat, lng)
        road_level = int(data.get("hazard", 1)) if data is not None else None
        row = {
            "hazard": "flood", "id": site["id"], "name": site["name"], "lat": lat, "lng": lng,
            "inside_hazard_data": covered,
            "road_distance_m": round(access["distance"], 1) if access else None,
            "road_name": road_name(data) if data is not None else None,
            "road_private": bool(osm_routing.is_private_edge(data)) if data is not None else None,
            "road_flood_level": road_level,
            "site_flood_level": site_level,
        }
        rows.append(row)
        say(f"    - {site['name']}: "
            + ("inside the hazard data" if covered else "OUTSIDE the hazard data (the app skips it)")
            + (f"; NOAH level at the site {site_level} ({FLOOD_LEVEL_NAMES.get(site_level, '?')})")
            + (f"; route ends on {row['road_name'] or 'an unnamed road'} {row['road_distance_m']} m away"
               f" ({'PRIVATE' if row['road_private'] else 'public'}), flood level {road_level}" if access else "; NO ROAD FOUND")
            + (" -> the road at this site is above the safe threshold, so routes here end in High water"
               if road_level is not None and road_level > threshold else ""))

    say("  Earthquake evacuation sites (the earthquake destination):")
    for site in dataset["evacuation_sites"]:
        lat, lng = site["lat"], site["lng"]
        covered = bool(osm_routing.is_point_in_hazard_coverage(E, lat, lng))
        access, data = access_road(E, lat, lng)
        liq = layer_level_at(dataset, "liquefaction", lat, lng)
        gs = layer_level_at(dataset, "ground_shaking", lat, lng)
        row = {
            "hazard": "earthquake", "id": site["id"], "name": site["name"], "lat": lat, "lng": lng,
            "inside_hazard_data": covered,
            "road_distance_m": round(access["distance"], 1) if access else None,
            "road_name": road_name(data) if data is not None else None,
            "road_private": bool(osm_routing.is_private_edge(data)) if data is not None else None,
            "road_liquefaction": data.get("eq_liquefaction") if data is not None else None,
            "road_overall": data.get("eq_overall") if data is not None else None,
            "site_liquefaction": liq,
            "site_ground_shaking": gs,
        }
        rows.append(row)
        say(f"    - {site['name']}: "
            + ("inside the hazard data" if covered else "OUTSIDE the hazard data (the app skips it)")
            + f"; at the site liquefaction {liq}, ground shaking {gs}"
            + (f"; route ends on {row['road_name'] or 'an unnamed road'} {row['road_distance_m']} m away"
               f" ({'PRIVATE' if row['road_private'] else 'public'}), road liquefaction {row['road_liquefaction']}"
               if access else "; NO ROAD FOUND"))
    store["evacuation_sites"] = rows


# ---------------------------------------------------------------------------
# Run
# ---------------------------------------------------------------------------

def git(*args):
    try:
        return subprocess.run(["git", *args], capture_output=True, text=True, cwd=BACKEND_DIR).stdout.strip()
    except Exception:  # noqa: BLE001
        return ""


def versions():
    found = {"python": platform.python_version()}
    for module in ("networkx", "osmnx", "shapely", "geopandas", "numpy"):
        try:
            found[module] = __import__(module).__version__
        except Exception:  # noqa: BLE001
            found[module] = None
    return found


def check_barangay(barangay, noah_path):
    store = {}
    base = osm_routing.get_barangay_base_graph(barangay)
    G = osm_routing.prepare_routing_graph(barangay)
    roads = unique_roads(G)
    display = osm_routing.get_barangay_boundary(barangay)["display_name"]
    say(f"\n== {display}")
    say(f"  road file built: {base.graph.get('created_date')} ({base.graph.get('created_with')})")
    say("  -- Road network (flood routing graph) --")
    record(store, barangay, "road_pieces", len(roads), "road pieces", "")
    record(store, barangay, "road_km", round(km(roads), 2), "road length", " km")
    store["nodes"] = G.number_of_nodes()
    say(f"  intersections and road ends (nodes): {G.number_of_nodes():,}")
    record(store, barangay, "private_km", round(km([d for d in roads if osm_routing.is_private_edge(d)]), 2),
           "private roads (used only by pins inside their enclave)", " km")

    say("  -- Flood hazard on the roads (NOAH 25-year) --")
    for level in (1, 3, 5):
        record(store, barangay, f"flood_level_{level}_km",
               round(km([d for d in roads if int(d.get("hazard", 1)) == level]), 2),
               f"flood level {level} ({FLOOD_LEVEL_NAMES[level]})", " km")
    above = km([d for d in roads if int(d.get("hazard", 1)) > osm_routing.HAZARD_THRESHOLD])
    store["flood_above_threshold_pct"] = round(100 * above / km(roads), 1) if roads else None
    say(f"  share of road above the safe threshold ({osm_routing.HAZARD_THRESHOLD}): {store['flood_above_threshold_pct']}%")
    ortigas = [d for d in roads if "Ortigas" in road_name(d)]
    if ortigas:
        record(store, barangay, "ortigas_m", int(round(km(ortigas) * 1000)),
               f"Ortigas Avenue Extension pieces the ants can use ({len(ortigas)} pieces)", " m")
    optional("worst-class check", flood_worst_class, G, barangay, store)
    if noah_path:
        optional("NOAH comparison", noah_agreement, G, noah_path, barangay, store)

    say("  -- Earthquake hazard on the roads (PHIVOLCS) --")
    dataset = get_earthquake_dataset(barangay)
    E = _annotate_graph_with_earthquake_hazards(_get_earthquake_graph(dataset), dataset)
    eroads = unique_roads(E)
    record(store, barangay, "eq_road_km", round(km(eroads), 2), f"earthquake graph ({len(eroads):,} road pieces)", " km")
    for attr in ("eq_liquefaction", "eq_ground_shaking", "eq_overall"):
        levels = sorted({d.get(attr) for d in eroads}, key=lambda lv: (lv is None, lv or 0))
        for lv in levels:
            record(store, barangay, f"{attr}_{lv}_km", round(km([d for d in eroads if d.get(attr) == lv]), 2),
                   f"{attr.replace('eq_', '')} level {lv}", " km")
    above = km([d for d in eroads if (d.get("eq_overall") or 0) > osm_routing.HAZARD_THRESHOLD])
    store["eq_overall_above_threshold_pct"] = round(100 * above / km(eroads), 1) if eroads else None
    say(f"  share of road above the safe threshold in the Overall view: {store['eq_overall_above_threshold_pct']}%")
    above = km([d for d in eroads if (d.get("eq_liquefaction") or 0) > osm_routing.HAZARD_THRESHOLD])
    store["eq_liquefaction_above_threshold_pct"] = round(100 * above / km(eroads), 1) if eroads else None
    say(f"  share of road above the safe threshold in the Liquefaction view: {store['eq_liquefaction_above_threshold_pct']}%")
    optional("liquefaction worst-class check", liquefaction_worst_class, E, dataset, barangay, store)

    say("  -- Evacuation sites --")
    optional("evacuation site table", site_table, barangay, G, E, dataset, store)
    return store


def main():
    parser = argparse.ArgumentParser(description="Confirm the Objective 1 figures with AGNAS's own code.")
    parser.add_argument("--noah", help="path to the original NOAH MetroManila_Flood_25year.shp")
    parser.add_argument("--out", type=Path, help="output folder (default: a new folder in tools/evaluation_results)")
    args = parser.parse_args()

    osm_routing.DEBUG = False
    commit = git("rev-parse", "--short", "HEAD")
    changed = [line for line in git("status", "--porcelain", "--untracked-files=no").splitlines() if line.strip()]
    say(f"Objective 1 confirmation, {datetime.now():%Y-%m-%d %H:%M}")
    say(f"Code version (git commit): {commit or 'unknown'}"
        + (f"  WARNING: {len(changed)} file(s) changed since this commit: "
           + ", ".join(line[3:] for line in changed[:5]) if changed else ("  (no uncommitted changes)" if commit else "")))
    say(f"Safe threshold: hazard level {osm_routing.HAZARD_THRESHOLD}; "
        f"boundary tolerance: {getattr(osm_routing, 'BARANGAY_BOUNDARY_TOLERANCE_METERS', '?')} m")
    if not args.noah:
        say("(No --noah path given: the NOAH original-vs-simplified comparison is skipped.)")

    results = {}
    for barangay in BARANGAYS:
        results[barangay] = check_barangay(barangay, args.noah)

    out_dir = args.out or BACKEND_DIR / "tools" / "evaluation_results" / f"objective1-{datetime.now():%Y%m%d-%H%M%S}"
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "objective1_confirm.txt").write_text("\n".join(LINES) + "\n", encoding="utf-8")
    payload = {
        "date": datetime.now().isoformat(timespec="seconds"),
        "git_commit": commit or None,
        "uncommitted_changes": [line[3:] for line in changed],
        "noah_shapefile": args.noah,
        "settings": {
            name: getattr(osm_routing, name)
            for name in ("HAZARD_THRESHOLD", "BARANGAY_BOUNDARY_TOLERANCE_METERS", "VAR_TO_HAZARD")
            if hasattr(osm_routing, name)
        },
        "software": versions(),
        "barangays": results,
    }
    (out_dir / "objective1_confirm.json").write_text(json.dumps(payload, indent=2, default=str), encoding="utf-8")
    print(f"\nWritten to {out_dir}")


if __name__ == "__main__":
    main()
