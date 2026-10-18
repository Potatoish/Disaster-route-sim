import json
import math
from pathlib import Path

import shapely
from shapely.affinity import affine_transform
from shapely.geometry import mapping, shape
from shapely.ops import nearest_points, substring, unary_union
from shapely.prepared import prep
from shapely.validation import make_valid

from osm_routing import (
    HAZARD_COVERAGE_TOLERANCE_METERS,
    debug_print,
    get_barangay_boundary,
    normalize_barangay_name,
)

EARTHQUAKE_DATA_ROOT = Path(__file__).parent / "data" / "earthquake"
SUPPORTED_BARANGAYS = ("pinagbuhatan", "sta lucia")
DISPLAY_BARANGAY_NAMES = {
    "pinagbuhatan": "Pinagbuhatan",
    "sta lucia": "Sta. Lucia",
}
METERS_PER_DEGREE = 111_320.0

_LAYER_FILES = {
    "liquefaction": EARTHQUAKE_DATA_ROOT / "liquefaction.geojson",
    "ground_shaking": EARTHQUAKE_DATA_ROOT / "ground_shaking.geojson",
}
_EVACUATION_SITES_FILE = EARTHQUAKE_DATA_ROOT / "evacuation_sites.json"
# Display only: the intensity zones a barangay's map and the earthquake intro
# show (PHIVOLCS via HazardHunterPH). Routing reads _LAYER_FILES alone.
_INTENSITY_FILE = EARTHQUAKE_DATA_ROOT / "ground_shaking_intensity.geojson"
_FAULT_FILE = EARTHQUAKE_DATA_ROOT / "west_valley_fault.geojson"
# The scenario the hazard maps are drawn for.
SCENARIO_MAGNITUDE = 7.2
SCENARIO_FAULT_NAME = "West Valley Fault"
# The intro draws the fault this far (metres along it) each way from the
# epicenter; the rest is off screen.
SCENARIO_FAULT_REACH_METERS = 12_000
_DATASET_CACHE = {}
_LEVEL_TO_SEVERITY = {
    "very low": 1,
    "low": 2,
    "moderate": 3,
    "medium": 3,
    "high": 4,
    "very high": 5,
    "severe": 5,
}

def is_supported_earthquake_barangay(barangay_name):
    return normalize_barangay_name(barangay_name) in SUPPORTED_BARANGAYS


def get_supported_earthquake_barangay_names():
    return [DISPLAY_BARANGAY_NAMES[name] for name in SUPPORTED_BARANGAYS]


def _read_json(path):
    with path.open("r", encoding="utf-8-sig") as handle:
        return json.load(handle)


def _load_feature_collection(path):
    data = _read_json(path)
    if data.get("type") != "FeatureCollection":
        raise ValueError(f"Invalid GeoJSON in {path.name}: expected FeatureCollection")
    return data


def _build_layer_feature(feature_id, properties, geometry):
    feature_properties = dict(properties)
    feature_properties["id"] = feature_id
    return {
        "type": "Feature",
        "properties": feature_properties,
        "geometry": geometry,
    }


def _coerce_severity(value):
    if value is None:
        return None

    if isinstance(value, str):
        normalized_value = " ".join(value.strip().lower().split())
        if not normalized_value:
            return None
        if normalized_value in _LEVEL_TO_SEVERITY:
            return _LEVEL_TO_SEVERITY[normalized_value]
        value = normalized_value

    try:
        return int(float(value))
    except (TypeError, ValueError):
        return None


def _extract_layer_severity(layer_key, properties):
    numeric_candidates = [properties.get("severity")]
    label_candidates = []

    if layer_key == "ground_shaking":
        numeric_candidates.extend([
            properties.get("hazard_value"),
            properties.get("hazard_level"),
            properties.get("ground_shaking_value"),
            properties.get("ground_shaking_level"),
            properties.get("shaking_value"),
            properties.get("shaking_level"),
            properties.get("shaking_leve"),
        ])
        label_candidates.extend([
            properties.get("ground_shaking_level"),
            properties.get("shaking_level"),
            properties.get("shaking_leve"),
        ])
    else:
        numeric_candidates.extend([
            properties.get("hazard_level"),
            properties.get("hazard_value"),
            properties.get("liquefaction_value"),
        ])
        label_candidates.append(properties.get("liquefaction_level"))

    for candidate in numeric_candidates:
        severity = _coerce_severity(candidate)
        if severity is not None:
            return max(1, min(5, severity))

    for candidate in label_candidates:
        severity = _coerce_severity(candidate)
        if severity is not None:
            return max(1, min(5, severity))

    return None


def _normalize_layer_features(layer_key, feature_collection, canonical_barangay):
    normalized = []
    display_barangay = DISPLAY_BARANGAY_NAMES[canonical_barangay]

    for index, feature in enumerate(feature_collection.get("features", []), start=1):
        geometry_data = feature.get("geometry")
        if geometry_data is None:
            continue

        properties = dict(feature.get("properties") or {})
        feature_barangay = normalize_barangay_name(properties.get("barangay"))
        if feature_barangay != canonical_barangay:
            continue

        geometry = shape(geometry_data)
        if geometry.is_empty:
            continue

        severity = _extract_layer_severity(layer_key, properties)
        if severity is None:
            # A zone with no readable level is not hazard data; dropping it
            # keeps its area out of the routing coverage instead of letting it
            # count as the lowest (safest) level.
            debug_print(
                f"[EQ] Skipping {layer_key} feature {index} for {display_barangay}: no readable hazard level"
            )
            continue

        feature_id = str(
            properties.get("id")
            or feature.get("id")
            or f"{layer_key}-{canonical_barangay}-{index}"
        )
        feature_name = (
            properties.get("name")
            or properties.get("label")
            or f"{display_barangay} {layer_key.replace('_', ' ').title()} Zone {index}"
        )

        evaluation_geometry = geometry
        buffer_m = float(properties.get("buffer_m", 0) or 0)
        if geometry.geom_type in {"LineString", "MultiLineString"}:
            buffer_m = buffer_m or 65.0
            evaluation_geometry = geometry.buffer(buffer_m / METERS_PER_DEGREE)

        properties["barangay"] = display_barangay
        properties["name"] = feature_name
        properties["severity"] = severity
        if buffer_m:
            properties["buffer_m"] = buffer_m

        normalized.append({
            "feature_id": feature_id,
            "name": feature_name,
            "severity": severity,
            "display_geometry": geometry_data,
            "evaluation_geometry": evaluation_geometry,
            "prepared": prep(evaluation_geometry),
            # Roads kept by the coverage tolerance can sit just outside every
            # traced zone; they take their reading from the zone they are
            # within tolerance of instead of defaulting to a "safe" level.
            "tolerance_prepared": prep(
                evaluation_geometry.buffer(HAZARD_COVERAGE_TOLERANCE_METERS / METERS_PER_DEGREE)
            ),
            "properties": properties,
        })

    return normalized


def _normalize_evacuation_sites(raw_sites, canonical_barangay):
    sites = []
    fallback_address = f"{DISPLAY_BARANGAY_NAMES[canonical_barangay]}, Pasig City"

    for index, site in enumerate(raw_sites, start=1):
        site_id = str(site.get("id") or f"evac-{index}")
        sites.append({
            "id": site_id,
            "name": site.get("name") or f"Evacuation Site {index}",
            "lat": float(site["lat"]),
            "lng": float(site["lng"]),
            "address": site.get("address") or fallback_address,
            # No defaults: "No tall buildings nearby" is a safety claim, so it
            # is shown only for a site someone has described.
            "site_setup": site.get("site_setup"),
            "surroundings": site.get("surroundings"),
        })
    return sites


def _clip_to_barangay(geometry_data, area):
    """The part of a zone the map shows: the piece inside the barangay. The
    traced hazard polygons run past the barangay line (Pinagbuhatan's reaches
    well into Taytay), which reads as hazard data for the neighbours. Routing
    keeps the full shapes; it only uses roads inside the barangay anyway."""
    if area is None:
        return geometry_data
    geometry = make_valid(shape(geometry_data))
    clipped = geometry.intersection(area)
    if clipped.geom_type == "GeometryCollection":
        # Edges the zone shares with the barangay line come back as lines or
        # points; keep only the pieces of the zone's own kind.
        dimension = shapely.get_dimensions(geometry)
        clipped = unary_union([part for part in clipped.geoms if shapely.get_dimensions(part) == dimension])
    return None if clipped.is_empty else mapping(clipped)


def _load_intensity_zones(canonical_barangay, area):
    """The barangay's ground shaking intensity zones, strongest first; none
    for a barangay without an intensity map (its map shows the routing
    layer's level instead)."""
    if not _INTENSITY_FILE.exists():
        return []
    features = []
    for feature in _load_feature_collection(_INTENSITY_FILE).get("features", []):
        properties = dict(feature.get("properties") or {})
        if normalize_barangay_name(properties.get("barangay")) != canonical_barangay:
            continue
        geometry = feature.get("geometry") and _clip_to_barangay(feature["geometry"], area)
        if not geometry:
            continue
        properties["barangay"] = DISPLAY_BARANGAY_NAMES[canonical_barangay]
        features.append({"type": "Feature", "properties": properties, "geometry": geometry})
    features.sort(key=lambda feature: -float(feature["properties"].get("mmi_max") or 0))
    return features


def _build_scenario(canonical_barangay):
    """The earthquake the hazard maps are drawn for, as the intro shows it:
    the fault near the barangay and an epicenter on it, set where the fault
    passes closest to the barangay's center."""
    boundary = get_barangay_boundary(canonical_barangay)
    if boundary is None or not _FAULT_FILE.exists():
        return None
    fault_feature = next(
        (
            feature for feature in _load_feature_collection(_FAULT_FILE).get("features", [])
            if (feature.get("properties") or {}).get("name") == SCENARIO_FAULT_NAME
        ),
        None,
    )
    if fault_feature is None:
        return None

    area = boundary["geometry"]
    # Flat-earth metres around the barangay (a few km: well within a metre).
    kx = METERS_PER_DEGREE * math.cos(math.radians(area.centroid.y))
    ky = 110_574.0
    fault_m = affine_transform(shape(fault_feature["geometry"]), [kx, 0, 0, ky, 0, 0])
    area_m = affine_transform(area, [kx, 0, 0, ky, 0, 0])
    epicenter_m = nearest_points(fault_m, area_m.centroid)[0]
    along = fault_m.project(epicenter_m)
    shown = substring(
        fault_m,
        max(0.0, along - SCENARIO_FAULT_REACH_METERS),
        min(fault_m.length, along + SCENARIO_FAULT_REACH_METERS),
    )
    return {
        "magnitude": SCENARIO_MAGNITUDE,
        "fault_name": SCENARIO_FAULT_NAME,
        "fault": [[round(y / ky, 6), round(x / kx, 6)] for x, y in shown.coords],
        "epicenter": [round(epicenter_m.y / ky, 6), round(epicenter_m.x / kx, 6)],
        "fault_to_barangay_m": round(area_m.distance(fault_m)),
    }


def get_earthquake_dataset(barangay_name):
    canonical_name = normalize_barangay_name(barangay_name)
    if canonical_name not in SUPPORTED_BARANGAYS:
        supported = ", ".join(get_supported_earthquake_barangay_names())
        raise ValueError(f"Earthquake routing is currently available only for {supported}.")

    cached = _DATASET_CACHE.get(canonical_name)
    if cached is not None:
        return cached

    raw_sites_map = _read_json(_EVACUATION_SITES_FILE)
    evacuation_sites = _normalize_evacuation_sites(
        raw_sites_map.get(canonical_name, []),
        canonical_name,
    )
    if not evacuation_sites:
        raise FileNotFoundError(
            f"No earthquake evacuation sites configured for '{DISPLAY_BARANGAY_NAMES[canonical_name]}'"
        )

    boundary = get_barangay_boundary(canonical_name)
    barangay_area = boundary["geometry"] if boundary else None
    layer_payloads = {}
    layer_zones = {}
    layer_extents = {}
    for layer_key, path in _LAYER_FILES.items():
        raw_layer = _load_feature_collection(path)
        normalized_features = _normalize_layer_features(layer_key, raw_layer, canonical_name)
        if not normalized_features:
            raise FileNotFoundError(
                f"No {layer_key.replace('_', ' ')} features found for '{DISPLAY_BARANGAY_NAMES[canonical_name]}'"
            )
        layer_zones[layer_key] = normalized_features
        layer_extents[layer_key] = unary_union([
            feature["evaluation_geometry"] for feature in normalized_features
        ])
        shown_features = []
        for feature in normalized_features:
            shown_geometry = _clip_to_barangay(feature["display_geometry"], barangay_area)
            if shown_geometry:
                shown_features.append(
                    _build_layer_feature(feature["feature_id"], feature["properties"], shown_geometry)
                )
        layer_payloads[layer_key] = {"type": "FeatureCollection", "features": shown_features}

    dataset = {
        "canonical_barangay": canonical_name,
        "display_barangay": DISPLAY_BARANGAY_NAMES[canonical_name],
        "evacuation_sites": evacuation_sites,
        "layer_payloads": layer_payloads,
        "layer_zones": layer_zones,
        "layer_extents": layer_extents,
        "shaking_intensity": {
            "type": "FeatureCollection",
            "features": _load_intensity_zones(canonical_name, barangay_area),
        },
        "scenario": _build_scenario(canonical_name),
    }
    _DATASET_CACHE[canonical_name] = dataset
    return dataset
