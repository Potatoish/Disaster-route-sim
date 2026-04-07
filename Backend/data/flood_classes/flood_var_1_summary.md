# Flood Class Summary: Var 1

Source file: `Backend/data/flood_classes/flood_var_1.geojson`

## Basic Info

- `Var`: `1`
- Geometry type: `MultiPolygon`
- Top-level feature count: `1`

## Geometry Stats

- Multipolygon parts: `89,292`
- Total rings: `94,670`
- Total coordinate points: `1,275,608`

## Bounding Box

- Min latitude: `14.3538389977538`
- Min longitude: `120.906831627039`
- Max latitude: `14.7849179214641`
- Max longitude: `121.134485003189`

## Ring Vertex Stats

- Min vertices in a ring: `4`
- Median vertices in a ring: `7`
- 90th percentile vertices in a ring: `23`
- Max vertices in a ring: `4,271`
- Average vertices in a ring: `13.47`

## First 5 Multipolygon Parts

- Part `0`: `1` ring, `13` points
- Part `1`: `1` ring, `5` points
- Part `2`: `1` ring, `5` points
- Part `3`: `1` ring, `5` points
- Part `4`: `1` ring, `5` points

## Notes

- This class is already isolated from the original `flood.json`.
- The file is still large because `Var 1` is one very large `MultiPolygon`, not many separate small features.
- For routing integration, this class should eventually be treated as one flood zone layer and checked against OSM edge geometry using spatial intersection.
