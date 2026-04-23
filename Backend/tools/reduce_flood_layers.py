import json
from pathlib import Path

from shapely.geometry import Polygon, shape, mapping
from shapely.ops import unary_union


METERS_PER_DEGREE = 111_320.0
SCOPE_BUFFER_METERS = 1_200.0
SOURCE_SIMPLIFY_TOLERANCE = 0.00008

DATA_ROOT = Path(__file__).resolve().parents[1] / "data"
BOUNDARY_FILES = [
    DATA_ROOT / "boundaries" / "pinagbuhatan boundary.geojson",
    DATA_ROOT / "boundaries" / "Sta lucia boundary.geojson",
]
FLOOD_CLASS_FILES = [
    DATA_ROOT / "flood_classes" / "flood_var_1.geojson",
    DATA_ROOT / "flood_classes" / "flood_var_2.geojson",
    DATA_ROOT / "flood_classes" / "flood_var_3.geojson",
]


def _polygonal_geometry(geometry):
    if geometry.is_empty:
        return Polygon()

    if geometry.geom_type in {"Polygon", "MultiPolygon"}:
        return geometry

    polygon_geometries = []
    for sub_geometry in getattr(geometry, "geoms", []):
        polygon_geometry = _polygonal_geometry(sub_geometry)
        if polygon_geometry.is_empty:
            continue

        if polygon_geometry.geom_type == "Polygon":
            polygon_geometries.append(polygon_geometry)
        elif polygon_geometry.geom_type == "MultiPolygon":
            polygon_geometries.extend(list(polygon_geometry.geoms))

    return unary_union(polygon_geometries) if polygon_geometries else Polygon()


def _load_scope_geometry():
    boundary_geometries = []

    for boundary_path in BOUNDARY_FILES:
        with boundary_path.open("r", encoding="utf-8-sig") as file_obj:
            data = json.load(file_obj)

        for feature in data.get("features", []):
            geometry_data = feature.get("geometry")
            if geometry_data is None:
                continue

            boundary_geometry = _polygonal_geometry(shape(geometry_data))
            if not boundary_geometry.is_empty:
                boundary_geometries.append(boundary_geometry)

    if not boundary_geometries:
        raise ValueError("No boundary geometries found for flood layer reduction.")

    scope_geometry = unary_union(boundary_geometries)
    buffer_degrees = SCOPE_BUFFER_METERS / METERS_PER_DEGREE
    return scope_geometry.buffer(buffer_degrees)


def _reduce_flood_file(file_path, scope_geometry):
    with file_path.open("r", encoding="utf-8-sig") as file_obj:
        data = json.load(file_obj)

    features = data.get("features") or []
    if len(features) != 1:
        raise ValueError(f"Expected exactly one feature in {file_path.name}.")

    feature = features[0]
    geometry_data = feature.get("geometry")
    if geometry_data is None:
        raise ValueError(f"Missing geometry in {file_path.name}.")

    original_geometry = _polygonal_geometry(shape(geometry_data))
    clipped_geometry = _polygonal_geometry(original_geometry.intersection(scope_geometry))
    if clipped_geometry.is_empty:
        raise ValueError(f"Clipped geometry became empty for {file_path.name}.")

    simplified_geometry = _polygonal_geometry(
        clipped_geometry.simplify(SOURCE_SIMPLIFY_TOLERANCE, preserve_topology=True)
    )
    if simplified_geometry.is_empty:
        simplified_geometry = clipped_geometry

    feature["geometry"] = mapping(simplified_geometry)

    with file_path.open("w", encoding="utf-8", newline="") as file_obj:
        json.dump(data, file_obj, ensure_ascii=False, separators=(",", ":"))

    return file_path.stat().st_size


def main():
    scope_geometry = _load_scope_geometry()

    for flood_file in FLOOD_CLASS_FILES:
        reduced_size = _reduce_flood_file(flood_file, scope_geometry)
        print(f"{flood_file.name}: {round(reduced_size / (1024 * 1024), 2)} MB")


if __name__ == "__main__":
    main()
