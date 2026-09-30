// The solid best route is a slim line with a thin edge in a darker shade of
// its own color, like a navigation app's route: it sits inside the road
// instead of covering it, and the edge keeps it readable over the hazard
// fills. It is still heavier than the dashed routes, so it is the line the
// eye finds first (px at zoom scale 1; the edge adds 1px per side).
const ROUTE_BEST_WEIGHT = 5;
const ROUTE_EDGE_EXTRA_WEIGHT = 2;
const ROUTE_EDGE_COLORS = { '#22c55e': '#15803d', '#ef4444': '#991b1b' };
const ROUTE_DASHED_WEIGHT = 3.5;
const HAZARD_PANE = 'hazardPane';
// Available and eliminated routes are drawn as capsule dashes, each ringed
// in a dark casing sharing its dash pattern, so the solid
// best route stands apart and the dashes still read over the flood fills.
// Pixel lengths at zoom scale 1; eliminated dashes sit closer together.
const ROUTE_DASHES = {
  available: { length: 10, gap: 14 },
  eliminated: { length: 12, gap: 10 },
};
const ROUTE_DASH_CASING_COLOR = '#1c1917';
const ROUTE_DASH_CASING_OPACITY = 0.75;
const ROUTE_DASH_CASING_EXTRA_WEIGHT = 2.5;
// The map shows only this many routes (best first); the others appear only
// while picked from the results panel (setRouteGroupShown).
const MAP_ROUTES_SHOWN = 3;
// Width of the invisible stroke over each route that takes hovers and taps,
// so a thin or dashed line (its gaps don't catch the pointer) is easy to hit.
const ROUTE_HIT_WEIGHT = 18;

// Leaflet line widths are fixed in screen pixels, so zooming in leaves a
// route as a thin line inside wide hazard fills. Grow routes gently from
// zoom ~15.5 (the default overview stays as is) up to 1.5x at street level.
function getRouteZoomScale(map) {
  const zoom = map ? map.getZoom() : 15;
  return Math.min(1.5, Math.max(1, 1 + (zoom - 15.5) * 0.2));
}

// null for the solid best route. Scales with getRouteZoomScale like the line
// widths, so dashes don't merge as the strokes widen. Route strokes are drawn
// with noClip: Leaflet otherwise trims a line to the visible area, so after
// every pan it starts at a new edge and the dash pattern jumps along it.
function getRouteDashArray(category, zoomScale = 1) {
  const dash = ROUTE_DASHES[category];
  return dash ? `${dash.length * zoomScale} ${dash.gap * zoomScale}` : null;
}

function getRouteEdgeColor(color) {
  return ROUTE_EDGE_COLORS[String(color || '').toLowerCase()] || ROUTE_DASH_CASING_COLOR;
}

// Width the casing adds around a route's line, both sides together.
function getRouteCasingExtraWeight(dashKey) {
  return ROUTE_DASHES[dashKey] ? ROUTE_DASH_CASING_EXTRA_WEIGHT : ROUTE_EDGE_EXTRA_WEIGHT;
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

function formatDistanceKm(distanceMeters) {
  const numericDistance = Number(distanceMeters);
  if (!Number.isFinite(numericDistance)) {
    return 'N/A';
  }

  return `${(numericDistance / 1000).toFixed(2)} km`;
}

function getRouteColor(category) {
  if (category === 'best') return '#22c55e';
  if (category === 'available') return '#8b5cf6';
  return '#ef4444';
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

// dashKey picks the route's ROUTE_DASHES pattern: none for the best route,
// drawn solid -- green, or red when no safe route exists and the least
// risky eliminated one is the best -- so it is easy to find among the dashes.
function createRouteGroup(route, isBest = false) {
  return {
    routeNo: route.display_route_no ?? null,
    category: route.category || '',
    isBest,
    dashKey: isBest ? null : route.category || '',
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

// Leaflet paths have no numeric z-index: layers painted later sit on top.
// Drawing casing -> main (below) and eliminated -> available -> best (in
// renderRoutesOnRoads) stacks each route's layers and the routes through
// insertion order alone. Only the interactive focus/highlight state needs an
// explicit re-stack, handled in script.js via bringToFront().
//
// The casing is a slightly wider stroke under the line: a darker shade of its
// own color for the solid best route, or a dark casing around each dash
// (ROUTE_DASHES) for the others.
function addRouteCasing(pathCoords, cfg, gMap, mapLayers, routeGroup) {
  const dashArray = getRouteDashArray(routeGroup.dashKey);
  return trackRouteLayer(L.polyline(pathCoords, {
    color: dashArray ? ROUTE_DASH_CASING_COLOR : getRouteEdgeColor(cfg.color),
    opacity: cfg.opacity * (dashArray ? ROUTE_DASH_CASING_OPACITY : 1),
    weight: cfg.weight + getRouteCasingExtraWeight(routeGroup.dashKey),
    dashArray,
    noClip: true,
    lineCap: 'round',
    lineJoin: 'round',
    interactive: false,
    className: 'route-line',
  }).addTo(gMap), routeGroup, mapLayers, 'casing');
}

function addRoutePolyline(pathCoords, cfg, gMap, mapLayers, routeGroup) {
  return trackRouteLayer(L.polyline(pathCoords, {
    color: cfg.color,
    opacity: cfg.opacity,
    weight: cfg.weight,
    dashArray: getRouteDashArray(routeGroup.dashKey),
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

function attachRouteInfo(poly, route, cfg, infoPopup, activeInfoWindowRef, gMap) {
  const statusLabel = String(route?.status || '').trim();
  const label = statusLabel
    ? `${statusLabel} Route`
    : route.category === 'best'
    ? 'Best Route'
    : route.category === 'available'
    ? 'Available Route'
    : 'Eliminated Route';

  poly.on('click', ev => {
    if (typeof window.focusRouteSelection === 'function') {
      window.focusRouteSelection(route.display_route_no, route.category);
    }

    const extraRows = Array.isArray(route.info_rows) ? route.info_rows : [];
    const isEarthquakeRoute = route.simulation_mode === 'earthquake';
    // One shared "how bad does this route get" row for both hazard types,
    // plus a hazard-specific breakdown below it -- no raw internal scores.
    const contextLabel = isEarthquakeRoute ? 'Hazards Crossed' : 'Flood Levels Crossed';
    const contextValue = isEarthquakeRoute
      ? (typeof window.formatEarthquakeHazardSummary === 'function' ? window.formatEarthquakeHazardSummary(route) : 'N/A')
      : (route.display_flood_classes || 'None');
    const peakRiskValue = typeof window.formatRoutePeakRiskLabel === 'function'
      ? window.formatRoutePeakRiskLabel(route)
      : null;
    if (activeInfoWindowRef.current) activeInfoWindowRef.current.remove();
    // Top padding keeps the popup clear of the flood filter / lens card and
    // zoom controls overlaid on the map's top edge.
    activeInfoWindowRef.current = L.popup({ autoPanPaddingTopLeft: [16, 130] })
      .setLatLng(ev.latlng)
      .setContent(infoPopup(label, [
        ['Route No.', `#${route.display_route_no ?? 'N/A'}`],
        ['Distance', route.display_distance || formatDistanceKm(route.distance)],
        // Phones have no hover to show a route's time label, so a tap shows it here.
        ...(route.display_duration ? [['Walking Time', route.display_duration]] : []),
        ...(peakRiskValue ? [['Peak Risk', peakRiskValue, cfg.color]] : []),
        ['Unsafe Distance', route.display_unsafe_distance || '0 m'],
        ['Unsafe Road Sections', route.display_unsafe_segment_count ?? 0],
        ['Roads Used', route.display_route_summary || route.path_label || 'N/A'],
        ['Why This Route', route.display_reason || 'No explanation available'],
        [contextLabel, contextValue],
        ...extraRows,
      ]))
      .openOn(gMap);
  });
}

// Draws every route (eliminated -> available -> best, so "best" paints on
// top) and fits the map to the best one. fitOptions are Leaflet fitBounds
// options -- script.js passes padding that keeps clear of its map overlays.
async function renderRoutesOnRoads({
  routes,
  gMap,
  mapLayers,
  drawPins,
  infoPopup,
  activeInfoWindowRef,
  fitOptions = { padding: [36, 36] },
  fitPoints = [],
  buildEtaLabel = null,
  afterDrawPins = null,
}) {
  if (typeof window.clearRouteAnimation === 'function') {
    window.clearRouteAnimation();
  }

  mapLayers.routes.forEach(l => l.remove());
  mapLayers.routes = [];
  mapLayers.routeGroups = [];

  const CFG = {
    best: { color: '#22c55e', weight: ROUTE_BEST_WEIGHT, opacity: 1 },
    available: { color: '#8b5cf6', weight: ROUTE_DASHED_WEIGHT, opacity: 1 },
    eliminated: { color: '#ef4444', weight: ROUTE_DASHED_WEIGHT, opacity: 0.9 },
  };
  const bestRoute = routes.find(route => route.category === 'best') || routes[0] || null;
  // The best route paints last, on top -- also when no route is safe and it
  // shares the "eliminated" category with the rest.
  const drawOrder = route => (route === bestRoute ? 3 : { eliminated: 0, available: 1, best: 2 }[route.category] ?? 0);
  const orderedRoutes = [...routes].sort((left, right) => drawOrder(left) - drawOrder(right));

  for (const route of orderedRoutes) {
    const baseCfg = CFG[route.category] || CFG.eliminated;
    const cfg = route === bestRoute ? { ...baseCfg, weight: ROUTE_BEST_WEIGHT, opacity: 1 } : baseCfg;
    const routeGroup = createRouteGroup(route, route === bestRoute);

    const poly = drawFallbackPolyline(
      route,
      cfg,
      gMap,
      mapLayers,
      routeGroup
    );

    if (poly) {
      mapLayers.routeGroups.push(routeGroup);
      attachRouteInfo(
        poly,
        route,
        cfg,
        infoPopup,
        activeInfoWindowRef,
        gMap
      );
    }
  }

  const defaultCoords = getRoutePoints(bestRoute);

  if (defaultCoords.length) {
    // A pin off the street stands apart from the line, so the fit takes in
    // the pins (fitPoints) and the destination as well as the route.
    const pinCoords = normalizePathCoordinates([
      ...fitPoints,
      { lat: bestRoute?.destination_lat, lng: bestRoute?.destination_lng },
    ]);
    gMap.fitBounds(L.latLngBounds([...defaultCoords, ...pinCoords]), mapMoveOptions(fitOptions));
  }

  // Only the first MAP_ROUTES_SHOWN routes (display order, best first) stay
  // on the map; script.js shows another only while it is picked.
  [...mapLayers.routeGroups]
    .sort((left, right) => (left.routeNo ?? 99) - (right.routeNo ?? 99))
    .forEach((group, index) => {
      group.hiddenByDefault = index >= MAP_ROUTES_SHOWN;
      if (group.hiddenByDefault) setRouteGroupShown(group, gMap, false);
    });

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
