# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

AGNAS (Ant Guided Navigation And Safety System) — a disaster-aware evacuation route simulator for Barangay Pinagbuhatan and Barangay Sta. Lucia, Pasig City. Routes are found with Ant Colony Optimization and ranked **lexicographically, safety before distance**.

Everything lives under `Backend/`. There is no build step and no test suite.

## Commands

```bash
pip install -r Backend/requirements.txt

py Backend/app.py            # dev server on http://127.0.0.1:5000 (debug, no reloader, threaded)
gunicorn app:app             # production entrypoint (run from Backend/)
```

Batch-test routing without the UI (a reporting tool, not a test runner — it exits 1 if any pair errors):

```bash
py Backend/tools/route_batch_test.py Backend/tools/route_pairs.example.json
py Backend/tools/route_batch_test.py pairs.json --output report.json --verbose   # --verbose keeps osm_routing debug output
```

Re-clip/simplify the flood GeoJSON layers against the barangay boundaries (regenerates files in `Backend/data/flood_classes/`):

```bash
py Backend/tools/reduce_flood_layers.py
```

Deployment is Docker (`Backend/Dockerfile`, python:3.11-slim, gunicorn bound to `$PORT`, 300s timeout) with `railway.json` at the repo root pointing at it and health-checking `/health`.

## Architecture

### Request flow

`app.py` is the only Flask surface — it serves the UI (`templates/index.html`) and every API route, and delegates immediately:

- `POST /simulate` → `main.simulate()` → `osm_routing.simulate_osm_routes()`
- `POST /earthquake/simulate` → `earthquake_service.simulate_earthquake()`
- `GET /locations` → `main.get_locations()` → `data/database.py`
- `GET /flood-hazard-layers`, `GET /barangay-boundary` → `osm_routing` payload builders

Handlers never raise to the client: errors come back as `{"error": true, "message": ...}` with a 4xx/5xx status. `main.py` does validation (missing/identical/unknown locations); `osm_routing` and `earthquake_service` do the work.

### The ACO core is shared, and earthquake mode wraps it

`osm_routing.py` (~1900 lines) owns the whole routing engine. `earthquake_service.py` imports ~25 symbols from it — including `run_aco`, `select_endpoint_node`, `select_display_routes`, `edge_traversal_cost` — and reuses them rather than reimplementing.

The bridge is `_clone_graph_for_view()`: for each earthquake "lens" (`overall`, `liquefaction`, `ground_shaking`) it copies the base graph and writes that lens's severity into the **generic** `hazard` / `route_cost` edge attributes that `run_aco` reads. The ACO never knows which hazard it is optimizing. Consequences worth remembering:

- Changing edge-cost or ACO semantics in `osm_routing` changes earthquake routing too.
- Earthquake mode runs `run_aco` once per (evacuation site × lens), so it is far more expensive than a single flood run.
- Flood routing is point-to-point; earthquake routing fans out to every road-reachable evacuation site (`_collect_road_reachable_evacuation_sites`, ranked by Dijkstra road distance) and returns three parallel `views` in one response.

### Safety-first ranking

Hazard is an integer 1–5 per edge. `HAZARD_THRESHOLD = 3`: any edge above it marks the whole route `eliminated`.

Ranking is a tuple comparison, not a weighted score — `safety_sort_key()` in `osm_routing.py` and `_view_sort_key()` in `earthquake_service.py`:

```
(has unsafe distance, unsafe_distance, risk_distance, -final_pheromone, distance)
```

`numeric_score()` / `aco_score` exists for display and pheromone reinforcement, with `UNSAFE_PENALTY = 1_000_000` keeping unsafe routes below safe ones; it is not what orders the results. Both modes then run `select_display_routes()`, which picks up to `FINAL_ROUTES_TO_SHOW` routes using progressively looser overlap thresholds (`DISPLAY_ROUTE_OVERLAP_THRESHOLDS`) so the map does not show five near-identical lines. Eliminated routes appear only up to `MAX_ELIMINATED_ROUTES_TO_SHOW`, and only when no safe route exists is an eliminated route labeled "Best".

### Hazard scales

- Flood: GeoJSON class `Var 1/2/3` → hazard `1/3/5` (`VAR_TO_HAZARD`). Only Var 3 exceeds the threshold.
- Earthquake: severity 1–5 per layer, parsed from inconsistent GeoJSON property names and text labels by `earthquake_data._extract_layer_severity()` / `_LEVEL_TO_SEVERITY` (note it tolerates the truncated shapefile key `shaking_leve`). `eq_overall = max(liquefaction, ground_shaking)`. A feature with no readable level is dropped, not defaulted.

### Missing hazard data is never "safe"

Both modes route only on roads inside the **hazard data coverage area** (`build_hazard_coverage_area()` + `restrict_graph_to_hazard_coverage()`), widened by `HAZARD_COVERAGE_TOLERANCE_METERS` so boundary-line roads aren't severed:

- Flood: the barangay polygon. The flood layers cover all of Pasig City and stop at the city limits, so inside the polygon an edge with no Var polygon is one the flood model shows as not flooding (hazard 1); outside it there is no flood data at all.
- Earthquake: the barangay polygon ∩ the liquefaction extent ∩ the ground-shaking extent. The traced layer polygons don't fill the barangay; roads in the gaps used to default to severity 1 and were the only "safe" roads.

Kept edges carry `hazard_coverage=True`. `edge_hazard_level()` scores any edge without it (or without a `hazard`) at `UNKNOWN_HAZARD_LEVEL = 5`, above the threshold, and routes report `hazard_data_coverage` (API/batch-tool only — deliberately not shown anywhere in the UI or PDF). Never add a `.get("hazard", 1)`-style default — that is exactly the hole this closes. Start/end points and evacuation sites outside the coverage area are rejected or skipped.

### Graph pipeline and caching

Per-barangay walk graphs are committed as GraphML (`data/graphs/*.graphml`, ~7–8 MB each) and loaded via `get_barangay_base_graph()`. Only if a file is missing does OSMnx hit the network and then save the result, so normal runs are offline. Both modes restrict the base graph to the hazard data coverage area (see above) — flood once per barangay in `build_graph`, earthquake in `_get_earthquake_graph`.

Hazard annotation is expensive and therefore idempotent and sticky: `assign_flood_hazards()` stamps `flood_hazard_annotation_version` on the graph and `_annotate_graph_with_earthquake_hazards()` stamps `earthquake_dataset`, and both skip re-annotating. **If you change how hazards are derived, bump `FLOOD_GRAPH_ANNOTATION_VERSION` or cached graphs will keep stale values for the life of the process.**

Every cache (`_GRAPH_CACHE`, `_BARANGAY_BASE_GRAPH_CACHE`, `_FLOOD_ZONES_CACHE`, `_EARTHQUAKE_GRAPH_CACHE`, `main._LOCATIONS_CACHE`) is a process-global dict guarded by an `RLock` with double-checked locking. None are ever invalidated — restart the server after touching data files.

The OSMnx download cache lives outside the repo, under `%LOCALAPPDATA%` / `$XDG_CACHE_HOME`; override with `DISASTER_ROUTE_SIM_RUNTIME_DIR`.

### One simulation at a time

`app.py` wraps both simulate endpoints in `_run_with_simulation_gate()` — a non-blocking `Lock`. A second concurrent simulation gets **HTTP 429** with `code: "simulation_busy"` rather than queueing. `simulation_progress.py` is a tiny global counter the ACO bumps per iteration; `GET /simulation-status` exposes busy state, elapsed time, and percent, which the frontend polls to drive the loading screen. Any new long-running endpoint should go through the same gate.

### Data layer

`data/database.py` reads `nodes.csv` (falling back to `node.csv`, the file actually present) **once at import time** into a module-level pandas DataFrame — there is no database. It holds ~11 landmark/road nodes and includes a malformed-row repair path for names containing commas. Start/end selections are matched by exact trimmed `name`.

### Frontend

Plain scripts loaded in order from `templates/index.html` — `osm.js`, `flood.js`, `earthquake.js`, then `script.js` — with no bundler or module system. Cross-file communication is via `window` globals:

- `script.js` (~4800 lines) is the orchestrator: all app state, the barangay → hazard → route → run workflow, map drawing, results panel, loader, theming. It assigns callbacks onto `window` at the bottom because `index.html` wires them through inline `onclick` attributes.
- `flood.js` / `earthquake.js` are IIFEs exposing `window.floodHazardUI` and `window.earthquakeUI` (hazard overlays, evacuation-site markers, legend).
- `osm.js` holds route-polyline rendering and endpoint-snapping geometry that mirrors the backend's (`ROUTE_ENDPOINT_SNAP_TOLERANCE_METERS` etc. — keep the two in sync if you change either). Each route is drawn as soft dark casing → white outline → colored line and is static by design (the user explicitly does not want moving route lines; only the selected route's marching dash, `route-flow--focus` in `style.css`, animates), widened with zoom by `getRouteZoomScale()` (re-applied on `zoomend`) so it doesn't thin out inside large hazard fills; hazard overlays go in the `hazardPane` (`ensureHazardPane(map)`, z-index 350) so routes in Leaflet's overlayPane (400) always paint above them — give any new hazard layer `pane: ensureHazardPane(map)`.
- `window.BACKEND_BASE` points at `127.0.0.1:5000` on localhost and `window.location.origin` otherwise.

The map renders with **Leaflet** (OpenStreetMap's standard tile server by default, Esri World Imagery as an optional satellite layer via a layer-switcher control) — no API key needed. Note: an earlier pass used CARTO Voyager tiles, which turned out to gate that basemap style behind an API key (a "API KEY REQUIRED" watermark instead of a map) — verify any third-party tile provider by actually fetching and viewing a tile, not just checking the HTTP status. `app.py` still passes an unused `google_maps_api_key` template variable from the environment; the template never reads it and nothing depends on it.

## Conventions and gotchas

- **Tuning constants** (`NUM_ANTS`, `NUM_ITERATIONS`, `ALPHA`, `BETA`, `EVAPORATION`, `SAFETY_WEIGHT`, `HAZARD_THRESHOLD`, endpoint-snapping limits) are all at the top of `osm_routing.py`. Change them there, not inline.
- **Debug output** is controlled by `osm_routing.DEBUG`, which is `True` in-repo; `debug_print` is imported and used by `earthquake_service` too. `route_batch_test.py` flips it off unless `--verbose`.
- **Barangay names** arrive free-form on the wire and must go through `normalize_barangay_name()` (lowercases, strips dots, maps `santa lucia` / `st lucia` → `sta lucia`). Canonical keys are `"pinagbuhatan"` and `"sta lucia"`.
- **Adding a barangay** means touching several places: a boundary GeoJSON plus `BARANGAY_BOUNDARY_FILES`, a GraphML plus `BARANGAY_BASE_GRAPH_FILES` (both in `osm_routing.py`), `SUPPORTED_BARANGAYS` / `DISPLAY_BARANGAY_NAMES` in `earthquake_data.py`, rows in `data/node.csv`, and the barangay cards plus `EARTHQUAKE_SUPPORTED_BARANGAY_*` constants in the frontend.
- Simulations legitimately take minutes; frontend request timeouts are 300 s, matching gunicorn's.
