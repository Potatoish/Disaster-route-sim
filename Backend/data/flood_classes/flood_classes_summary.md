# Flood Classes Combined Summary

Sources:

- `Backend/data/flood_classes/flood_var_1.geojson`
- `Backend/data/flood_classes/flood_var_2.geojson`
- `Backend/data/flood_classes/flood_var_3.geojson`

## Overview

All three classes come from the original `Backend/data/flood.json`.
Each class is stored as a single top-level `FeatureCollection` containing one `MultiPolygon` feature.

## Side-by-Side Comparison

| Class | GeoJSON Size | Geometry | Top-Level Features | Multipolygon Parts | Rings | Points |
| --- | ---: | --- | ---: | ---: | ---: | ---: |
| `Var 1` | `50,938,653` bytes | `MultiPolygon` | `1` | `89,292` | `94,670` | `1,275,608` |
| `Var 2` | `29,461,748` bytes | `MultiPolygon` | `1` | `31,402` | `37,421` | `739,656` |
| `Var 3` | `8,565,470` bytes | `MultiPolygon` | `1` | `6,249` | `7,052` | `215,397` |

## Bounding Boxes

| Class | Min Lat | Min Lng | Max Lat | Max Lng |
| --- | ---: | ---: | ---: | ---: |
| `Var 1` | `14.3538389977538` | `120.906831627039` | `14.7849179214641` | `121.134485003189` |
| `Var 2` | `14.3539785593574` | `120.907844113745` | `14.7850074925291` | `121.135029726606` |
| `Var 3` | `14.3539178806657` | `120.934273282387` | `14.785291728` | `121.135036414` |

## Ring Vertex Statistics

| Class | Min | Median | P90 | Max | Average |
| --- | ---: | ---: | ---: | ---: | ---: |
| `Var 1` | `4` | `7` | `23` | `4,271` | `13.47` |
| `Var 2` | `4` | `7` | `29` | `11,579` | `19.77` |
| `Var 3` | `4` | `9` | `35` | `32,567` | `30.54` |

## First 5 Multipolygon Parts

| Class | Part 0 | Part 1 | Part 2 | Part 3 | Part 4 |
| --- | --- | --- | --- | --- | --- |
| `Var 1` | `1 ring, 13 points` | `1 ring, 5 points` | `1 ring, 5 points` | `1 ring, 5 points` | `1 ring, 5 points` |
| `Var 2` | `1 ring, 5 points` | `1 ring, 5 points` | `1 ring, 5 points` | `1 ring, 5 points` | `1 ring, 5 points` |
| `Var 3` | `1 ring, 41 points` | `1 ring, 21 points` | `1 ring, 22 points` | `1 ring, 6 points` | `1 ring, 8 points` |

## Quick Reading

- `Var 1` is the heaviest class by area detail and file size.
- `Var 2` is smaller than `Var 1` but still large enough to lag in some editors.
- `Var 3` is the lightest file, but its rings are more complex on average.
- All three classes cover roughly the same overall study region, but `Var 3` starts farther east on the minimum longitude side.

## Routing Integration Reminder

- These are flood area layers, not road hazards yet.
- For routing, each OSM edge should be checked against these polygons using spatial intersection.
- The resulting matched class should then be converted into the app's edge hazard value.
