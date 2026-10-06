// The best and eliminated routes are slim solid lines with a thin edge in a
// darker shade of their color, so they sit inside the road and stay readable
// over hazard fills. The best route is the heaviest (px at zoom scale 1; the
// edge adds 1px per side).
const ROUTE_BEST_WEIGHT = 5;
const ROUTE_OTHER_WEIGHT = 3.5;
const ROUTE_EDGE_EXTRA_WEIGHT = 2;
// Available routes are dotted: opaque gray dots, each ringed in a darker edge
// (the edge stroke, dotted the same way). A picked one firms up into a solid
// edged line (getFocusedRouteVisual in script.js). Dot + gap in px at zoom
// scale 1; a near-zero dash with round caps draws a dot as wide as the line.
const ROUTE_TRAIL_WEIGHT = 4;
const ROUTE_TRAIL_OPACITY = 1;
const ROUTE_TRAIL_DOT = 0.1;
const ROUTE_TRAIL_GAP = 7;
// Also used by the legend and the PDF map.
const ROUTE_BEST_COLOR = '#22c55e';
// Slate gray, so the green best route is the one that stands out.
const ROUTE_AVAILABLE_COLOR = '#64748b';
// A best route through Medium flood water ("Risky route") is amber.
const ROUTE_BEST_CAUTION_COLOR = '#f59e0b';
// When no route is safe, the "Best" one is bright red and the other
// eliminated routes a darker brick red, so the two read apart.
const ROUTE_BEST_UNSAFE_COLOR = '#ef4444';
const ROUTE_ELIMINATED_COLOR = '#991b1b';
const ROUTE_EDGE_COLORS = {
  [ROUTE_BEST_COLOR]: '#15803d',
  [ROUTE_AVAILABLE_COLOR]: '#334155',
  [ROUTE_BEST_CAUTION_COLOR]: '#92400e',
  [ROUTE_BEST_UNSAFE_COLOR]: '#991b1b',
  [ROUTE_ELIMINATED_COLOR]: '#450a0a',
};
// On the satellite base map the dark imagery swallows the slate-gray and
// brick-red lines, so those two switch to light shades there, keeping a dark
// edge; the picked route's marching dash (white elsewhere) turns dark on
// them so it still shows.
const ROUTE_SATELLITE_COLORS = {
  [ROUTE_AVAILABLE_COLOR]: { line: '#e2e8f0', edge: '#334155', dash: '#334155' },
  [ROUTE_ELIMINATED_COLOR]: { line: '#fca5a5', edge: '#7f1d1d', dash: '#7f1d1d' },
};
// Whether the satellite base map is on; set by script.js (onBaseMapChange).
let isSatelliteBaseMap = false;
const HAZARD_PANE = 'hazardPane';
// The map shows only this many routes (best first); the others appear only
// while picked from the results panel (setRouteGroupShown).
const MAP_ROUTES_SHOWN = 3;
// Width of the invisible stroke over each route that takes hovers and taps,
// so a thin line is easy to hit.
const ROUTE_HIT_WEIGHT = 18;

// Leaflet line widths are fixed in screen pixels, so zooming in leaves a
// route as a thin line inside wide hazard fills. Grow routes gently from
// zoom ~15.5 (the default overview stays as is) up to 1.5x at street level.
function getRouteZoomScale(map) {
  const zoom = map ? map.getZoom() : 15;
  return Math.min(1.5, Math.max(1, 1 + (zoom - 15.5) * 0.2));
}

function getRouteEdgeColor(color) {
  const key = String(color || '').toLowerCase();
  return ROUTE_EDGE_COLORS[key] || key;
}

// Dot pattern of a trail line, spaced out as the line widens with zoom.
function getRouteTrailDashArray(zoomScale = 1) {
  return `${ROUTE_TRAIL_DOT} ${ROUTE_TRAIL_GAP * zoomScale}`;
}

// ---- one line per shared road ----
// Routes often share streets. Drawn whole they stack into a tangle, so each
// route on the map draws only the stretches no higher-priority route already
// draws (best, then safe alternatives, then eliminated, each by route
// number): a shared road shows one line. A picked route shows its whole path
// again (showRouteGroupFullPath). Routes run along the same graph edges, so a
// shared stretch has the same coordinates in every route.

function routeSegmentKey(a, b) {
  const first = `${a.lat.toFixed(6)},${a.lng.toFixed(6)}`;
  const second = `${b.lat.toFixed(6)},${b.lng.toFixed(6)}`;
  return first < second ? `${first}|${second}` : `${second}|${first}`;
}

function assignSharedRouteRuns(groups) {
  const rank = group => (group.isBest ? 0 : group.category === 'available' ? 1 : 2);
  const drawn = new Set();
  [...groups]
    .sort((left, right) => rank(left) - rank(right) || (left.routeNo ?? 99) - (right.routeNo ?? 99))
    .forEach((group, order) => {
      group.drawPriority = order;
      const path = group.fullPath || [];
      const keys = [];
      const runs = [];
      let run = null;
      for (let index = 1; index < path.length; index += 1) {
        const key = routeSegmentKey(path[index - 1], path[index]);
        keys.push(key);
        if (drawn.has(key)) {
          run = null;
          continue;
        }
        if (!run) {
          run = [path[index - 1]];
          runs.push(run);
        }
        run.push(path[index]);
      }
      keys.forEach(key => drawn.add(key));
      group.ownRuns = runs;
    });
}

// Stacks the routes so the one drawing a shared road also gets its clicks
// and hovers there: lowest priority at the bottom, the best route on top.
function stackRouteGroups(groups) {
  [...groups]
    .sort((left, right) => (right.drawPriority ?? 99) - (left.drawPriority ?? 99))
    .forEach(group => {
      group.casingLayer?.bringToFront();
      group.mainLayer?.bringToFront();
      group.hitLayer?.bringToFront();
    });
}

// The whole path (a picked route) or only its own stretches (the default).
function showRouteGroupFullPath(group, full) {
  if (!group?.ownRuns || group.showingFullPath === full) return;
  group.showingFullPath = full;
  const latlngs = full ? group.fullPath : group.ownRuns;
  group.casingLayer?.setLatLngs(latlngs);
  group.mainLayer?.setLatLngs(latlngs);
}

// A route's line, edge and marching-dash colors on the current base map.
function getRouteLineColors(color) {
  const key = String(color || '').toLowerCase();
  const satellite = isSatelliteBaseMap ? ROUTE_SATELLITE_COLORS[key] : null;
  return satellite || { line: key, edge: getRouteEdgeColor(key), dash: '#ffffff' };
}

function syncRouteColorsToBaseMap(mapLayers) {
  (mapLayers.routeGroups || []).forEach(group => {
    const colors = getRouteLineColors(group.color);
    group.casingLayer?.setStyle({ color: colors.edge });
    group.mainLayer?.setStyle({ color: colors.line });
    group.previewDotsLayer?.setStyle({ color: colors.dash });
  });
}

// Hazard overlays get their own pane under Leaflet's overlayPane (z-index
// 400), so route lines always paint above them no matter how often either
// is redrawn -- e.g. toggling a flood severity filter after a simulation.
function ensureHazardPane(map) {
  if (!map.getPane(HAZARD_PANE)) {
    const pane = map.createPane(HAZARD_PANE);
    pane.style.zIndex = 350;
    pane.style.pointerEvents = 'none';
  }
  return HAZARD_PANE;
}

const MAP_LAYER_FADE_MS = 360;

// Re-runs a one-shot CSS animation on `el` by toggling `className` (the
// class only ever lives for one run, so re-adding a layer later -- picking a
// route, say -- never replays it).
function replayClassAnimation(el, className) {
  if (!el || prefersReducedMotion()) return;
  el.classList.remove(className);
  void el.offsetWidth;
  el.classList.add(className);
  window.clearTimeout(el[`_${className}Timer`]);
  el[`_${className}Timer`] = window.setTimeout(() => el.classList.remove(className), MAP_LAYER_FADE_MS + 60);
}

// Hazard fills ease in whenever they are drawn (a result, a severity filter,
// an earthquake lens) instead of popping in.
function fadeInHazardPane(map) {
  replayClassAnimation(map?.getPane(HAZARD_PANE), 'is-entering');
}

// Leaflet's motion is a few per-map options (zoom, fade, marker zoom) plus an
// `animate` flag on each programmatic move (fitBounds/setView/panBy); both
// read this, so "reduce motion" is honored in one place. Checked at call
// time because the OS setting can change while the page is open.
function prefersReducedMotion() {
  return !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

// Wrap the options of any fitBounds/setView/panBy call.
function mapMoveOptions(options = {}) {
  return prefersReducedMotion() ? { ...options, animate: false } : options;
}

// The best route's color is its verdict (getRouteSafetyTier in script.js).
function getBestRouteColor(route) {
  return {
    safe: ROUTE_BEST_COLOR,
    caution: ROUTE_BEST_CAUTION_COLOR,
    unsafe: ROUTE_BEST_UNSAFE_COLOR,
  }[getRouteSafetyTier(route)];
}

function getRouteColor(category) {
  if (category === 'best') return ROUTE_BEST_COLOR;
  if (category === 'available') return ROUTE_AVAILABLE_COLOR;
  return ROUTE_ELIMINATED_COLOR;
}

function dedupePath(path) {
  if (!Array.isArray(path)) return [];

  return path.filter((node, index) => index === 0 || node !== path[index - 1]);
}

function normalizePathCoordinates(points) {
  if (!Array.isArray(points)) return [];

  return points
    .filter(point => point && point.lat != null && point.lng != null)
    .map(point => ({ lat: Number(point.lat), lng: Number(point.lng) }))
    .filter((point, index, array) => {
      if (index === 0) return true;
      const previous = array[index - 1];
      return previous.lat !== point.lat || previous.lng !== point.lng;
    });
}

function getSegmentCount(route, normalizedPath, normalizedCoords) {
  if (typeof route.segments === 'number') {
    return route.segments;
  }

  if (normalizedCoords.length > 1) {
    return normalizedCoords.length - 1;
  }

  if (normalizedPath.length > 1) {
    return normalizedPath.length - 1;
  }

  return 0;
}

// A route's line is exactly its path_coordinates: the backend starts and
// ends it where each pin meets the street, and nothing joins it to the pins.
function normalizeRoutes(routes) {
  return routes.map(route => {
    const normalizedPath = Array.isArray(route.path) ? dedupePath(route.path) : [];
    const normalizedCoords = normalizePathCoordinates(route.path_coordinates);

    return {
      ...route,
      path: normalizedPath,
      path_coordinates: normalizedCoords,
      render_path: [...normalizedCoords],
      distance: route.distance ?? 'N/A',
      max_hazard: route.max_hazard ?? 0,
      segments: getSegmentCount(route, normalizedPath, normalizedCoords),
      path_label: route.path_label || '',
      color: route.color || getRouteColor(route.category),
      street_path: Array.isArray(route.street_path) ? route.street_path : []
    };
  });
}

function getRoutePoints(route) {
  if (Array.isArray(route?.render_path) && route.render_path.length) {
    return route.render_path;
  }

  if (Array.isArray(route?.path_coordinates) && route.path_coordinates.length) {
    return route.path_coordinates;
  }

  return [];
}

function buildFallbackPath(route) {
  const routePoints = [...getRoutePoints(route)];
  return routePoints.length >= 2 ? routePoints : [];
}

// isBest marks the heavier best route -- green, or red when no safe route
// exists and the least risky eliminated one is the best. color is the
// route's own color (getRouteLineColors adjusts it per base map).
function createRouteGroup(route, isBest = false, color = '') {
  return {
    routeNo: route.display_route_no ?? null,
    category: route.category || '',
    isBest,
    color,
    route,
    casingLayer: null,
    mainLayer: null,
  };
}

function trackRouteLayer(layer, routeGroup, mapLayers, kind) {
  mapLayers.routes.push(layer);

  if (!routeGroup) {
    return layer;
  }

  if (kind === 'casing') {
    routeGroup.casingLayer = layer;
  } else if (kind === 'main') {
    routeGroup.mainLayer = layer;
  } else if (kind === 'hit') {
    routeGroup.hitLayer = layer;
  }

  return layer;
}

// Leaflet paths have no z-index: later layers paint on top. Drawing casing ->
// line, and eliminated -> available -> best (renderRoutesOnRoads), stacks
// everything by insertion order; only focus/highlight re-stacks, through
// bringToFront() in script.js. The casing is a slightly wider stroke under
// the line in a darker shade of the route's color: the thin edge.
function addRouteCasing(pathCoords, cfg, gMap, mapLayers, routeGroup) {
  return trackRouteLayer(L.polyline(pathCoords, {
    color: getRouteLineColors(cfg.color).edge,
    opacity: cfg.opacity,
    weight: cfg.weight + ROUTE_EDGE_EXTRA_WEIGHT,
    dashArray: cfg.trail ? getRouteTrailDashArray() : null,
    noClip: true,
    lineCap: 'round',
    lineJoin: 'round',
    interactive: false,
    className: 'route-line',
  }).addTo(gMap), routeGroup, mapLayers, 'casing');
}

function addRoutePolyline(pathCoords, cfg, gMap, mapLayers, routeGroup) {
  return trackRouteLayer(L.polyline(pathCoords, {
    color: getRouteLineColors(cfg.color).line,
    opacity: cfg.opacity,
    weight: cfg.weight,
    dashArray: cfg.trail ? getRouteTrailDashArray() : null,
    // Leaflet otherwise trims a line to the visible area, so after every pan
    // it starts at a new edge and a trail's dots jump along it.
    noClip: true,
    lineCap: 'round',
    lineJoin: 'round',
    interactive: false,
    className: 'route-line',
  }).addTo(gMap), routeGroup, mapLayers, 'main');
}

function addRouteHitArea(pathCoords, gMap, mapLayers, routeGroup) {
  return trackRouteLayer(L.polyline(pathCoords, {
    color: '#000000',
    opacity: 0,
    weight: ROUTE_HIT_WEIGHT,
    lineCap: 'round',
    lineJoin: 'round',
  }).addTo(gMap), routeGroup, mapLayers, 'hit');
}

// Returns the route's hit area, the layer that takes its clicks and hovers.
function drawFallbackPolyline(route, cfg, gMap, mapLayers, routeGroup) {
  const pathCoords = buildFallbackPath(route);
  if (pathCoords.length === 0) return null;

  route.render_path = pathCoords;
  routeGroup.fullPath = pathCoords;
  addRouteCasing(pathCoords, cfg, gMap, mapLayers, routeGroup);
  addRoutePolyline(pathCoords, cfg, gMap, mapLayers, routeGroup);
  return addRouteHitArea(pathCoords, gMap, mapLayers, routeGroup);
}

function getRouteGroupLayers(group) {
  return [
    group.casingLayer,
    group.mainLayer,
    group.hitLayer,
  ].filter(Boolean);
}

// Puts a route's lines on the map or takes them off (keeping them for later).
function setRouteGroupShown(group, gMap, shown) {
  getRouteGroupLayers(group).forEach(layer => {
    if (shown && !gMap.hasLayer(layer)) layer.addTo(gMap);
    else if (!shown && gMap.hasLayer(layer)) layer.remove();
  });
}

// A map-app style time + distance label on the route line: always shown on
// the best route (at the line's middle), and for every other one while the
// pointer is on it (following the pointer, so it never lands on the best
// route's label) or where it was tapped.
function bindRouteEtaLabel(hitLayer, content, permanent) {
  if (!content) return;
  hitLayer.bindTooltip(content, {
    permanent,
    sticky: !permanent,
    direction: 'top',
    offset: [0, -6],
    opacity: 1,
    className: 'route-eta-tooltip',
  });
}

// Clicking a route line picks it, like picking it in the results panel: the
// other routes dim and it gets the marching dash (createRoutePreview in
// script.js). Clicking it again lets go.
function attachRouteClick(hitLayer, route) {
  hitLayer.on('click', ev => {
    // Not also a tap on the map underneath (which can drop a pin).
    L.DomEvent.stopPropagation(ev);
    window.toggleRouteFocus?.(route.display_route_no, route.category);
  });
}

// The routes past the first MAP_ROUTES_SHOWN (by route number, best first):
// off the map until picked, and the only ones the results panel's "See N
// more routes" list holds, since the rest can be picked on the map.
function getRoutesOffMap(routes) {
  return [...(routes || [])]
    .sort((left, right) => (left.display_route_no ?? 99) - (right.display_route_no ?? 99))
    .slice(MAP_ROUTES_SHOWN);
}

// Draws every route (eliminated -> available -> best, so "best" paints on
// top) and fits the map to the best one. fitOptions are Leaflet fitBounds
// options -- script.js passes padding that keeps clear of its map overlays.
async function renderRoutesOnRoads({
  routes,
  gMap,
  mapLayers,
  drawPins,
  fitOptions = { padding: [36, 36] },
  fitPoints = [],
  // false: the caller fits the map itself (earthquake mode fits once, to
  // the route, the pin and the hazard extent together).
  fit = true,
  buildEtaLabel = null,
  afterDrawPins = null,
}) {
  if (typeof window.clearRouteAnimation === 'function') {
    window.clearRouteAnimation();
  }

  mapLayers.routes.forEach(l => l.remove());
  mapLayers.routes = [];
  mapLayers.routeGroups = [];
  // The new lines (and their labels) fade in together; they stay still.
  replayClassAnimation(gMap.getContainer(), 'routes-entering');

  const CFG = {
    best: { color: ROUTE_BEST_COLOR, weight: ROUTE_BEST_WEIGHT, opacity: 1 },
    available: { color: ROUTE_AVAILABLE_COLOR, weight: ROUTE_TRAIL_WEIGHT, opacity: ROUTE_TRAIL_OPACITY, trail: true },
    eliminated: { color: ROUTE_ELIMINATED_COLOR, weight: ROUTE_OTHER_WEIGHT, opacity: 0.9 },
  };
  const bestRoute = routes.find(route => route.category === 'best') || routes[0] || null;
  // The best route paints last, on top -- also when no route is safe and it
  // shares the "eliminated" category with the rest.
  const drawOrder = route => (route === bestRoute ? 3 : { eliminated: 0, available: 1, best: 2 }[route.category] ?? 0);
  const orderedRoutes = [...routes].sort((left, right) => drawOrder(left) - drawOrder(right));

  for (const route of orderedRoutes) {
    const baseCfg = CFG[route.category] || CFG.eliminated;
    const cfg = route !== bestRoute
      ? baseCfg
      : {
          ...baseCfg,
          color: getBestRouteColor(route),
          weight: ROUTE_BEST_WEIGHT,
          opacity: 1,
          trail: false,
        };
    const routeGroup = createRouteGroup(route, route === bestRoute, cfg.color);

    const poly = drawFallbackPolyline(
      route,
      cfg,
      gMap,
      mapLayers,
      routeGroup
    );

    if (poly) {
      mapLayers.routeGroups.push(routeGroup);
      attachRouteClick(poly, route);
    }
  }

  const defaultCoords = getRoutePoints(bestRoute);

  if (fit && defaultCoords.length) {
    // A pin off the street stands apart from the line, so the fit takes in
    // the pins (fitPoints) and the destination as well as the route.
    const pinCoords = normalizePathCoordinates([
      ...fitPoints,
      { lat: bestRoute?.destination_lat, lng: bestRoute?.destination_lng },
    ]);
    gMap.fitBounds(L.latLngBounds([...defaultCoords, ...pinCoords]), mapMoveOptions(fitOptions));
  }

  // Only the first MAP_ROUTES_SHOWN routes stay on the map; script.js shows
  // another only while it is picked.
  const offMapRoutes = new Set(getRoutesOffMap(routes));
  mapLayers.routeGroups.forEach(group => {
    group.hiddenByDefault = offMapRoutes.has(group.route);
    if (group.hiddenByDefault) setRouteGroupShown(group, gMap, false);
  });

  // Routes on the map draw one line per shared road (assignSharedRouteRuns);
  // the ones off it appear whole when picked.
  const shownGroups = mapLayers.routeGroups.filter(group => !group.hiddenByDefault);
  assignSharedRouteRuns(shownGroups);
  shownGroups.forEach(group => {
    group.showingFullPath = true;
    showRouteGroupFullPath(group, false);
  });
  stackRouteGroups(shownGroups);

  // After the fit: a permanent label opens where the line's middle is then.
  if (typeof buildEtaLabel === 'function') {
    mapLayers.routeGroups.forEach(group => {
      bindRouteEtaLabel(group.hitLayer, buildEtaLabel(group.route), group.route === bestRoute);
    });
  }

  drawPins();
  if (typeof afterDrawPins === 'function') {
    afterDrawPins();
  }
  if (typeof window.setMapLegendVisible === 'function') {
    window.setMapLegendVisible(true);
  }
}
