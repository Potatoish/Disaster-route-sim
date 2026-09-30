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
- `GET /check-pin` → `osm_routing.check_flood_pin()` / `earthquake_service.check_earthquake_pin()`
- `GET /locations` → `main.get_locations()` → `data/database.py` (no longer used by the UI; kept for tools)
- `GET /flood-hazard-layers`, `GET /barangay-boundary` → `osm_routing` payload builders

Handlers never raise to the client: errors come back as `{"error": true, "message": ...}` with a 4xx/5xx status. `main.py` does validation (missing/identical/unknown locations); `osm_routing` and `earthquake_service` do the work.

### Start/end are points pinned on the map

The visitor taps the map for their start and (flood only) destination; earthquake mode pins only the start, since its destinations are the evacuation sites. Both simulate endpoints take `start`/`end` as `{"lat", "lng", "label"}` — or, for `tools/route_batch_test.py`, a node name from `node.csv`; `database.resolve_route_location()` handles both. The label is free text the frontend builds from the nearest street and is echoed back as `result.start`/`result.end` and in `path_label`, so escape it wherever it is rendered as HTML.

A pin is routable if `check_route_pin()` accepts it: inside the hazard data coverage area — anywhere there, however far from a road (the user explicitly wants pins placeable anywhere). The frontend calls `GET /check-pin` on every tap/drag for an instant verdict and nearest street name (`find_nearest_road()`, built on `find_road_access_point()` and the index cached on `G.graph["_edge_index"]`); the simulate endpoints re-run the same check.

Routes start and end **on the street**, never drawn to the pin (the user explicitly wants no line from a pin through buildings). `add_road_access_nodes()` copies the cached graph and splits the road nearest each pin (and each evacuation site) at the point closest to it, adding that point as a node (negative ids); each new road piece gets its own length and its hazard is re-derived from its own geometry (`annotate_flood_edge`, or the earthquake stamper). Nearest means the closest road not tagged `access=no`, in the graph's largest connected piece — private roads included. `keep_private_roads_near()` then drops every private enclave (a gated subdivision's `access=private` streets, plus public roads reachable only through them) except those a pin or evacuation site sits in: a pin inside one routes out through it, and no route cuts through anyone else's (the user chose this). `path_to_coords` and `osm.js` draw only the road geometry; the map fit and the PDF map add the pins separately. Flood routing rejects a start/end that meet the road at the same node.

### The ACO core is shared, and earthquake mode wraps it

`osm_routing.py` (~1900 lines) owns the whole routing engine. `earthquake_service.py` imports ~25 symbols from it — including `run_aco`, `add_road_access_nodes`, `select_display_routes`, `edge_traversal_cost` — and reuses them rather than reimplementing.

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

Per-barangay walk graphs are committed as GraphML (`data/graphs/*.graphml`, ~9–10 MB each) and loaded via `get_barangay_base_graph()`. Only if a file is missing does OSMnx hit the network (`download_walk_graph()`, which also keeps `access=private` roads via `GRAPH_ROAD_ACCESS_FILTER`) and then save the result, so normal runs are offline. To refresh the road data, delete the GraphML files and run once. Both modes restrict the base graph to the hazard data coverage area (see above) — flood once per barangay in `build_graph`, earthquake in `_get_earthquake_graph`.

Hazard annotation is expensive and therefore idempotent and sticky: `assign_flood_hazards()` stamps `flood_hazard_annotation_version` on the graph and `_annotate_graph_with_earthquake_hazards()` stamps `earthquake_dataset`, and both skip re-annotating. **If you change how hazards are derived, bump `FLOOD_GRAPH_ANNOTATION_VERSION` or cached graphs will keep stale values for the life of the process.**

Every cache (`_GRAPH_CACHE`, `_BARANGAY_BASE_GRAPH_CACHE`, `_FLOOD_ZONES_CACHE`, `_EARTHQUAKE_GRAPH_CACHE`, `main._LOCATIONS_CACHE`) is a process-global dict guarded by an `RLock` with double-checked locking. None are ever invalidated — restart the server after touching data files.

The OSMnx download cache lives outside the repo, under `%LOCALAPPDATA%` / `$XDG_CACHE_HOME`; override with `DISASTER_ROUTE_SIM_RUNTIME_DIR`.

### One simulation at a time

`app.py` wraps both simulate endpoints in `_run_with_simulation_gate()` — a non-blocking `Lock`. A second concurrent simulation gets **HTTP 429** with `code: "simulation_busy"` rather than queueing. `simulation_progress.py` is a tiny global counter the ACO bumps per iteration; `GET /simulation-status` exposes busy state, elapsed time, and percent, which the frontend polls to drive the loading screen. Any new long-running endpoint should go through the same gate.

### Data layer

`data/database.py` reads `nodes.csv` (falling back to `node.csv`, the file actually present) **once at import time** into a module-level pandas DataFrame — there is no database. It holds ~11 landmark/road nodes and includes a malformed-row repair path for names containing commas. The UI no longer picks from these nodes (see pinned points above); a named start/end sent to the API is matched by exact trimmed `name`.

### Frontend

Plain scripts loaded in order from `templates/index.html` — `osm.js`, `flood.js`, `earthquake.js`, `tutorial.js`, `script.js`, then `mobile-sim.js` — with no bundler or module system. Cross-file communication is via `window` globals:

- `script.js` (~5000 lines) is the orchestrator: all app state, the barangay → hazard → route → run workflow, map drawing, results panel, loader, theming. It assigns callbacks onto `window` at the bottom because `index.html` wires them through inline `onclick` attributes. Pins live in `routePins` (`status: 'checking' | 'ready'`; only `getReadyPin()` counts), are placed by `placeRoutePin()` (map tap while `pinPlacementRole` is armed, or a marker drag), and a rejected spot restores the previous pin. `onRoutePinsChange()` is the single re-sync after any pin change; results are dropped when `simData.pins_key` no longer matches the pins. On phones the setup panel sits above the map in the page, so that re-sync keeps the map where it was on screen (`keepMapInPlace`) and then scrolls the Run button into view only if the pins still fit (`revealRunButtonAbovePins`).
- `mobile-sim.js` is the phone and tablet simulator (< 1024px wide and ≥ 500px tall; markup `#msim` in `index.html`, the `msim`/`msheet`/`m*` rules at the end of `style.css`; from 640px up the sheets are a centered card capped at 560px), built from the user's phone wireframes and reused for tablets because the desktop's docked columns were unreadably narrow there: floating top bar, one bottom sheet with a setup mode and a results mode (peek/half/full, peek measured from its content, handle drag + tap/Enter cycling, `--sheet-h` on `#appShell`), a fixed center pin for choosing start/end (pan the map, then "Set start/end here"; the moving pin's marker is hidden meanwhile), zoom/locate buttons above the sheet, and a Map layers sheet (base map, flood severity, legend of what's on the map). It keeps no state: it reads `script.js` globals and calls its functions, and `script.js` calls in through `window.mobileSim` (`scheduleSync`, `renderResults`, `showResults`, `getCoveredInsets` for fit padding, `handleMapTap`, `isCenterPinRole`). The desktop panels, map boxes and Leaflet zoom/layers controls are hidden there. Short viewports (phone landscape) still use the older full-screen panels with a bottom bar (`MOBILE_PANEL_QUERY`, `(max-height: 499px)`).
- `flood.js` / `earthquake.js` are IIFEs exposing `window.floodHazardUI` and `window.earthquakeUI` (hazard overlays, evacuation-site markers, legend).
- `osm.js` holds route-polyline rendering; a route's line is exactly its backend `path_coordinates` (no joining to the pins). The best route is a slim solid line with a thin edge in a darker shade of its color (`ROUTE_EDGE_COLORS`; no white band or glow, so it sits inside the road like a navigation app's line, per the user — the PDF map draws it the same way); available routes are violet and eliminated routes red capsule dashes in a dark casing (`ROUTE_DASHES`, `getRouteDashArray()`, drawn with `noClip` so panning doesn't shift the dashes) — when no route is safe, the one labeled "Best" is drawn solid red drawn on top of the others, and the legend's "Best Route" swatch turns solid red (`buildRouteLegendRows`). The solid best route is heavier than the dashed ones (`ROUTE_BEST_WEIGHT` / `ROUTE_DASHED_WEIGHT`) so it stands out most. Only the first `MAP_ROUTES_SHOWN` (3) routes are on the map; the rest appear only while picked from the results panel (`hiddenByDefault`, `setRouteGroupShown`). Each route has an invisible wide hit line (`hitLayer`) for clicks and hovers. The best route carries a permanent walking-time + distance label that hides while another route is picked; other routes show theirs on hover (`bindRouteEtaLabel` / `buildRouteEtaLabel`), and the results panel has no time card (all per the user). Lines are static by design (the user explicitly does not want moving route lines; only the selected best route's marching dash, `route-flow--focus` in `style.css`, animates — dashed routes never get it), widened with zoom by `getRouteZoomScale()` (re-applied on `zoomend`) so it doesn't thin out inside large hazard fills; hazard overlays go in the `hazardPane` (`ensureHazardPane(map)`, z-index 350) so routes in Leaflet's overlayPane (400) always paint above them — give any new hazard layer `pane: ensureHazardPane(map)`.
- The homepage (`home.html`) has an illustrative hazard showcase (`#hazards`, the `hz-` rules in `home.css`, `static/hazard-showcase.js`, no API calls): a flood scene drawn to scale (1 m = 60 SVG units; 162 cm adult per DOST-FNRI, 130 cm child) and an earthquake cross-section whose tiles toggle ground shaking / liquefaction, defaulting to ground shaking. Keep its copy short and plain, keep the "How it works" diagram lines static, and leave the stats strip (ACO / Safety over distance / 2) without a background motif (all per the user). Below 640px the page follows the user's mobile wireframes (the "PHONE LAYOUT" block at the end of `home.css`): left-aligned hero with the barangay card before Coverage map, stacked barangay rows keeping the desktop pin icon (per the user, not the wireframe's check circle), compact hazard rows with the SVG scene labels hidden (too small at that width; captions and the `.hz-key` legend carry them), stacked readout, and "How it works" as a vertical stepper; the stats are centered there, while the footer is two side-by-side columns (left: "© 2026 AGNAS Project." over "All rights reserved."; right: Privacy Policy over Terms of Service) and the About page's research team stays left-aligned (the user found both ugly centered). The pill nav and the round feedback button stay (per the user), and at every width a short divider line (`.brand::after`) separates the logo from the links; below 640px the pill packs tight — logo, divider, the links, a single theme button (the active theme's button hides), no stretched gaps; its links and that button are 44px tap boxes drawn as moderate 36px pills (4px transparent border + `background-clip:padding-box` — the user found full 44px pills too big). The footer is compact at every width; instead of bottom padding, the feedback button rises above the footer as it scrolls in (`--fab-lift`, set by `home.js`). Tablet widths keep the stats in three columns and the barangay cards side by side; at ≤ 820px (phones and tablets) "Before you start" uses the compact icon+title cards and "How it works" the vertical stepper (150px diagrams, 112px on phones). The flood readout's last row is "Walking" (Walkable / Walk with caution / Not walkable, the `walk` field in `hazard-showcase.js`), replacing "Road: Passable" (per the user: AGNAS plans walking routes). The nav link is "About", not "About & Contact". The emergency numbers live once in `templates/_emergency_contacts.html`, included by the simulator's hotlines modal and the homepage's "Plan ahead" card dialog (`openHotlines`).
- `window.BACKEND_BASE` points at `127.0.0.1:5000` on localhost and `window.location.origin` otherwise.

The map renders with **Leaflet** (OpenStreetMap's standard tile server by default, Esri World Imagery as an optional satellite layer via a layer-switcher control) — no API key needed. Note: an earlier pass used CARTO Voyager tiles, which turned out to gate that basemap style behind an API key (a "API KEY REQUIRED" watermark instead of a map) — verify any third-party tile provider by actually fetching and viewing a tile, not just checking the HTTP status. `app.py` still passes an unused `google_maps_api_key` template variable from the environment; the template never reads it and nothing depends on it.

## Conventions and gotchas

- **Tuning constants** (`NUM_ANTS`, `NUM_ITERATIONS`, `ALPHA`, `BETA`, `EVAPORATION`, `SAFETY_WEIGHT`, `HAZARD_THRESHOLD`, `ROAD_ACCESS_NODE_SNAP_METERS`) are all at the top of `osm_routing.py`. Change them there, not inline.
- **Debug output** is controlled by `osm_routing.DEBUG`, which is `True` in-repo; `debug_print` is imported and used by `earthquake_service` too. `route_batch_test.py` flips it off unless `--verbose`.
- **Barangay names** arrive free-form on the wire and must go through `normalize_barangay_name()` (lowercases, strips dots, maps `santa lucia` / `st lucia` → `sta lucia`). Canonical keys are `"pinagbuhatan"` and `"sta lucia"`.
- **Adding a barangay** means touching several places: a boundary GeoJSON plus `BARANGAY_BOUNDARY_FILES`, a GraphML plus `BARANGAY_BASE_GRAPH_FILES` (both in `osm_routing.py`), `SUPPORTED_BARANGAYS` / `DISPLAY_BARANGAY_NAMES` in `earthquake_data.py`, rows in `data/node.csv`, and the barangay cards plus `EARTHQUAKE_SUPPORTED_BARANGAY_*` constants in the frontend.
- Simulations legitimately take minutes; frontend request timeouts are 300 s, matching gunicorn's.
- **Running-text paragraphs are justified** everywhere (per the user): the "JUSTIFIED TEXT" blocks at the end of `home.css` and `style.css` list the prose selectors — add new paragraph classes there. Paragraphs under a centered heading also get `text-align-last:center`.
- **Responsive work follows `AGNAS_RESPONSIVE_SPEC.md`** (phased; mobile wireframes < 640px win over the spec for layout). Rules already in force from its Phase 1:
  - Below 1024px every tappable control is at least 44×44px. Compact controls that should keep their look get an invisible `::after` band (`inset: calc((44px - 100%) / -2)`) rather than a bigger box.
  - Anything that moves a Leaflet map programmatically (`fitBounds`, `setView`, `panBy`) wraps its options in `mapMoveOptions()` (`osm.js`), and map creation reads `prefersReducedMotion()`; the landing-page coverage map has its own copy in `home.js`.
  - A hidden panel must leave the tab order too: fading or sliding it out is not enough, so the collapsed setup panel (and the interim mobile panels) also get `visibility: hidden`, delayed to the end of their exit transition.
  - Hazard cards are real `<button>`s with `aria-pressed`, driven by the same `selected` class as before.
