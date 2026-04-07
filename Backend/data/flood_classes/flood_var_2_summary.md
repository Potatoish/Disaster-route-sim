# Flood Class Summary: Var 2

Source file: `Backend/data/flood_classes/flood_var_2.geojson`

## Basic Info

- `Var`: `2`
- Geometry type: `MultiPolygon`
- Top-level feature count: `1`

## Geometry Stats

- Multipolygon parts: `31,402`
- Total rings: `37,421`
- Total coordinate points: `739,656`

## Bounding Box

- Min latitude: `14.3539785593574`
- Min longitude: `120.907844113745`
- Max latitude: `14.7850074925291`
- Max longitude: `121.135029726606`

## Ring Vertex Stats

- Min vertices in a ring: `4`
- Median vertices in a ring: `7`
- 90th percentile vertices in a ring: `29`
- Max vertices in a ring: `11,579`
- Average vertices in a ring: `19.77`

## First 5 Multipolygon Parts

- Part `0`: `1` ring, `5` points
- Part `1`: `1` ring, `5` points
- Part `2`: `1` ring, `5` points
- Part `3`: `1` ring, `5` points
- Part `4`: `1` ring, `5` points

## Notes

- This class is already isolated from the original `flood.json`.
- `Var 2` is smaller than `Var 1` but still large enough to lag when opened directly in some editors.
- For routing integration, this class should be treated as one flood severity layer and checked against OSM edge geometry using spatial intersection.
