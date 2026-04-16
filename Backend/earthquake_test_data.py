import json
from pathlib import Path

from shapely.geometry import shape
from shapely.prepared import prep

from osm_routing import normalize_barangay_name

MOCK_DATA_ROOT = Path(__file__).parent / "mock_data" / "earthquake"
SUPPORTED_BARANGAYS = {"pinagbuhatan"}
METERS_PER_DEGREE = 111_320.0

_LAYER_FILES = {
    "liquefaction": "liquefaction.geojson",
    "ground_shaking": "ground_shaking.geojson",
}
_DATASET_CACHE = {}


def is_supported_earthquake_barangay(barangay_name):
    return normalize_barangay_name(barangay_name) in SUPPORTED_BARANGAYS


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


def _normalize_layer_features(layer_key, feature_collection):
    normalized = []

    for index, feature in enumerate(feature_collection.get("features", []), start=1):
        geometry_data = feature.get("geometry")
        if geometry_data is None:
            continue

        geometry = shape(geometry_data)
        if geometry.is_empty:
            continue

        properties = dict(feature.get("properties") or {})
        severity = int(properties.get("severity", properties.get("hazard_level", 1)))
        feature_id = str(properties.get("id") or f"{layer_key}-{index}")
        feature_name = (
            properties.get("name")
            or properties.get("label")
            or f"{layer_key.replace('_', ' ').title()} Zone {index}"
        )

        evaluation_geometry = geometry
        buffer_m = float(properties.get("buffer_m", 0) or 0)
        if geometry.geom_type in {"LineString", "MultiLineString"}:
            buffer_m = buffer_m or 65.0
            evaluation_geometry = geometry.buffer(buffer_m / METERS_PER_DEGREE)

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


def _normalize_evacuation_sites(raw_sites):
    sites = []
    for index, site in enumerate(raw_sites, start=1):
        site_id = str(site.get("id") or f"evac-{index}")
        sites.append({
            "id": site_id,
            "name": site.get("name") or f"Evacuation Site {index}",
            "lat": float(site["lat"]),
            "lng": float(site["lng"]),
            "address": site.get("address") or "Pinagbuhatan, Pasig City",
            "capacity_label": site.get("capacity_label") or "Available",
        })
    return sites


def get_earthquake_test_dataset(barangay_name):
    canonical_name = normalize_barangay_name(barangay_name)
    if canonical_name not in SUPPORTED_BARANGAYS:
        raise ValueError("Earthquake routing is currently available only for Pinagbuhatan.")

    cached = _DATASET_CACHE.get(canonical_name)
    if cached is not None:
        return cached

    dataset_dir = MOCK_DATA_ROOT / canonical_name
    if not dataset_dir.exists():
        raise FileNotFoundError(f"Mock earthquake dataset not found for '{canonical_name}'")

    raw_sites = _read_json(dataset_dir / "evacuation_sites.json")
    evacuation_sites = _normalize_evacuation_sites(raw_sites.get("sites", []))

    layer_payloads = {}
    layer_zones = {}
    for layer_key, filename in _LAYER_FILES.items():
        raw_layer = _load_feature_collection(dataset_dir / filename)
        normalized_features = _normalize_layer_features(layer_key, raw_layer)
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
        "display_barangay": "Pinagbuhatan",
        "evacuation_sites": evacuation_sites,
        "layer_payloads": layer_payloads,
        "layer_zones": layer_zones,
    }
    _DATASET_CACHE[canonical_name] = dataset
    return dataset


def get_earthquake_test_evacuation_sites_payload(barangay_name):
    dataset = get_earthquake_test_dataset(barangay_name)
    return {
        "error": False,
        "barangay": dataset["display_barangay"],
        "evacuation_sites": dataset["evacuation_sites"],
    }
