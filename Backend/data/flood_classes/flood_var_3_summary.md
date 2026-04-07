# Flood Class Summary: Var 3

Source file: `Backend/data/flood_classes/flood_var_3.geojson`

## Basic Info

- `Var`: `3`
- Geometry type: `MultiPolygon`
- Top-level feature count: `1`

## Geometry Stats

- Multipolygon parts: `6,249`
- Total rings: `7,052`
- Total coordinate points: `215,397`

## Bounding Box

- Min latitude: `14.3539178806657`
- Min longitude: `120.934273282387`
- Max latitude: `14.785291728`
- Max longitude: `121.135036414`

## Ring Vertex Stats

- Min vertices in a ring: `4`
- Median vertices in a ring: `9`
- 90th percentile vertices in a ring: `35`
- Max vertices in a ring: `32,567`
- Average vertices in a ring: `30.54`

## First 5 Multipolygon Parts

- Part `0`: `1` ring, `41` points
- Part `1`: `1` ring, `21` points
- Part `2`: `1` ring, `22` points
- Part `3`: `1` ring, `6` points
- Part `4`: `1` ring, `8` points

## Notes

- This class is already isolated from the original `flood.json`.
- `Var 3` is the lightest of the three class files and should be the easiest one to inspect directly.
- For routing integration, this class should be treated as the highest flood severity layer and checked against OSM edge geometry using spatial intersection.
