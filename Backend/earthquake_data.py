import json
from pathlib import Path

from shapely.geometry import shape
from shapely.prepared import prep

from osm_routing import normalize_barangay_name

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

    return 1


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
            "site_setup": site.get("site_setup") or "Open-area assembly point",
            "surroundings": site.get("surroundings") or "No tall buildings nearby",
        })
    return sites


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

    layer_payloads = {}
    layer_zones = {}
    for layer_key, path in _LAYER_FILES.items():
        raw_layer = _load_feature_collection(path)
        normalized_features = _normalize_layer_features(layer_key, raw_layer, canonical_name)
        if not normalized_features:
            raise FileNotFoundError(
                f"No {layer_key.replace('_', ' ')} features found for '{DISPLAY_BARANGAY_NAMES[canonical_name]}'"
            )
        layer_zones[layer_key] = normalized_features
        layer_payloads[layer_key] = {
            "type": "FeatureCollection",
            "features": [
                _build_layer_feature(
                    feature["feature_id"],
                    feature["properties"],
                    feature["display_geometry"],
                )
                for feature in normalized_features
            ],
        }

    dataset = {
        "canonical_barangay": canonical_name,
        "display_barangay": DISPLAY_BARANGAY_NAMES[canonical_name],
        "evacuation_sites": evacuation_sites,
        "layer_payloads": layer_payloads,
        "layer_zones": layer_zones,
    }
    _DATASET_CACHE[canonical_name] = dataset
    return dataset
