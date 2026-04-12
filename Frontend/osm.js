// Render the exact route geometry produced by the backend.
// Do not re-route paths in the browser, or the map can diverge from the evaluated result.

function formatDistanceKm(distanceMeters) {
  const numericDistance = Number(distanceMeters);
  if (!Number.isFinite(numericDistance)) {
    return 'N/A';
  }

  return `${(numericDistance / 1000).toFixed(2)} km`;
}

function getRouteColor(category) {
  if (category === 'best') return '#22c55e';
  if (category === 'available') return '#f59e0b';
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

function normalizeRoutes(routes) {
  return routes.map(route => {
    const normalizedPath = Array.isArray(route.path) ? dedupePath(route.path) : [];
    const normalizedCoords = normalizePathCoordinates(route.path_coordinates);

    return {
      ...route,
      path: normalizedPath,
      path_coordinates: normalizedCoords,
      distance: route.distance ?? 'N/A',
      max_hazard: route.max_hazard ?? 0,
      segments: getSegmentCount(route, normalizedPath, normalizedCoords),
      path_label: route.path_label || '',
      color: route.color || getRouteColor(route.category),
      street_path: Array.isArray(route.street_path) ? route.street_path : []
    };
  });
}

function getRoutePoints(route, getLocationByName) {
  if (route.path_coordinates.length) {
    return route.path_coordinates;
  }

  return [];
}

function buildFallbackPath(route, getLocationByName) {
  const routePoints = getRoutePoints(route, getLocationByName);
  if (routePoints.length >= 2) {
    return routePoints;
  }

  return [];
}

function createRouteGroup(route, cfg) {
  return {
    routeNo: route.display_route_no ?? null,
    category: route.category || '',
    route,
    baseWeight: cfg.weight,
    baseOpacity: cfg.opacity,
    glowLayers: [],
    outlineLayer: null,
    mainLayer: null,
  };
}

function trackRouteLayer(layer, routeGroup, mapLayers, kind) {
  mapLayers.routes.push(layer);

  if (!routeGroup) {
    return layer;
  }

  if (kind === 'glow') {
    routeGroup.glowLayers.push(layer);
  } else if (kind === 'outline') {
    routeGroup.outlineLayer = layer;
  } else if (kind === 'main') {
    routeGroup.mainLayer = layer;
  }

  return layer;
}

function addRouteGlow(route, pathCoords, gMap, mapLayers, routeGroup) {
  if (route.category === 'best') {
    trackRouteLayer(new google.maps.Polyline({
      path: pathCoords,
      geodesic: false,
      strokeColor: '#22c55e',
      strokeOpacity: 0.06,
      strokeWeight: 12,
      map: gMap,
      zIndex: 0,
    }), routeGroup, mapLayers, 'glow');

    trackRouteLayer(new google.maps.Polyline({
      path: pathCoords,
      geodesic: false,
      strokeColor: '#86efac',
      strokeOpacity: 0.10,
      strokeWeight: 7,
      map: gMap,
      zIndex: 1,
    }), routeGroup, mapLayers, 'glow');
  }

  if (route.category === 'available') {
    trackRouteLayer(new google.maps.Polyline({
      path: pathCoords,
      geodesic: false,
      strokeColor: '#fcd34d',
      strokeOpacity: 0.04,
      strokeWeight: 4,
      map: gMap,
      zIndex: 2,
    }), routeGroup, mapLayers, 'glow');
  }
}

function addRouteOutline(pathCoords, cfg, gMap, mapLayers, routeGroup) {
  return trackRouteLayer(new google.maps.Polyline({
    path: pathCoords,
    geodesic: false,
    strokeColor: '#0f172a',
    strokeOpacity: 0,
    strokeWeight: cfg.weight + 4,
    map: gMap,
    zIndex: Math.max(1, cfg.zIndex - 1),
  }), routeGroup, mapLayers, 'outline');
}

function addRoutePolyline(pathCoords, cfg, gMap, mapLayers, routeGroup) {
  return trackRouteLayer(new google.maps.Polyline({
    path: pathCoords,
    geodesic: false,
    strokeColor: cfg.color,
    strokeOpacity: cfg.opacity,
    strokeWeight: cfg.weight,
    map: gMap,
    zIndex: cfg.zIndex,
  }), routeGroup, mapLayers, 'main');
}

function formatStreetPath(streetPath, maxItems = 6) {
  if (!Array.isArray(streetPath) || streetPath.length === 0) {
    return 'No named streets available';
  }

  const visible = streetPath.slice(0, maxItems);
  const suffix = streetPath.length > maxItems ? ' ...' : '';
  return visible.join(' -> ') + suffix;
}

function drawFallbackPolyline(route, cfg, gMap, mapLayers, getLocationByName, routeGroup) {
  const pathCoords = buildFallbackPath(route, getLocationByName);
  if (pathCoords.length === 0) return null;

  route.render_path = pathCoords;
  addRouteGlow(route, pathCoords, gMap, mapLayers, routeGroup);
  addRouteOutline(pathCoords, cfg, gMap, mapLayers, routeGroup);
  return addRoutePolyline(pathCoords, cfg, gMap, mapLayers, routeGroup);
}

function attachRouteInfo(poly, route, cfg, infoPopup, shortNodeLabel, activeInfoWindowRef, gMap) {
  const label = route.category === 'best'
    ? 'Best Route'
    : route.category === 'available'
    ? 'Available Route'
    : 'Eliminated Route';

  poly.addListener('mouseover', () => {
    if (typeof window.highlightRouteRow === 'function') {
      window.highlightRouteRow(route.display_route_no, route.category);
    }
  });

  poly.addListener('mouseout', () => {
    if (typeof window.clearRouteRowHighlight === 'function') {
      window.clearRouteRowHighlight();
    }
  });

  poly.addListener('click', ev => {
    if (typeof window.focusRouteSelection === 'function') {
      window.focusRouteSelection(route.display_route_no, route.category, true);
    }

    if (activeInfoWindowRef.current) activeInfoWindowRef.current.close();
    activeInfoWindowRef.current = new google.maps.InfoWindow({
      content: infoPopup(label, [
        ['Route No.', `#${route.display_route_no ?? 'N/A'}`],
        ['Distance', route.display_distance || formatDistanceKm(route.distance)],
        ['Max Hazard', route.max_hazard + '/5', cfg.color],
        ['Unsafe Dist.', route.display_unsafe_distance || '0 m'],
        ['Unsafe Segs', route.display_unsafe_segment_count ?? 0],
        ['Summary', route.display_route_summary || route.path_label || 'N/A'],
        ['Why', route.display_reason || 'No explanation available'],
        ['Flood Vars', route.display_flood_classes || 'None'],
        ['Streets', formatStreetPath(route.street_path)],
      ]),
      position: ev.latLng,
    });
    activeInfoWindowRef.current.open(gMap);
  });
}

async function renderRoutesOnRoads({
  routes,
  gMap,
  mapLayers,
  getLocationByName,
  drawSelectedPinsOnly,
  start,
  end,
  infoPopup,
  shortNodeLabel,
  activeInfoWindowRef
}) {
  if (typeof window.clearRouteAnimation === 'function') {
    window.clearRouteAnimation();
  }

  mapLayers.routes.forEach(l => l.setMap(null));
  mapLayers.routes = [];
  mapLayers.routeGroups = [];

  const CFG = {
    best: { color: '#22c55e', weight: 5, opacity: 0.95, zIndex: 8 },
    available: { color: '#f59e0b', weight: 4, opacity: 0.85, zIndex: 5 },
    eliminated: { color: '#ef4444', weight: 3, opacity: 0.65, zIndex: 4 },
  };
  const DRAW_ORDER = { eliminated: 0, available: 1, best: 2 };

  const orderedRoutes = [...routes].sort(
    (left, right) => (DRAW_ORDER[left.category] ?? 99) - (DRAW_ORDER[right.category] ?? 99)
  );

  for (const route of orderedRoutes) {
    const cfg = CFG[route.category] || CFG.eliminated;
    const routeGroup = createRouteGroup(route, cfg);

    const poly = drawFallbackPolyline(route, cfg, gMap, mapLayers, getLocationByName, routeGroup);

    if (poly) {
      mapLayers.routeGroups.push(routeGroup);
      attachRouteInfo(
        poly,
        route,
        cfg,
        infoPopup,
        shortNodeLabel,
        activeInfoWindowRef,
        gMap
      );
    }
  }

  const bestRoute = routes.find(route => route.category === 'best') || routes[0] || null;
  const defaultCoords = Array.isArray(bestRoute?.render_path) && bestRoute.render_path.length
    ? bestRoute.render_path
    : getRoutePoints(bestRoute || {}, getLocationByName);

  if (defaultCoords.length) {
    const bounds = new google.maps.LatLngBounds();
    defaultCoords.forEach(point => bounds.extend(point));
    gMap.fitBounds(bounds, 36);
  }

  drawSelectedPinsOnly(start, end, { showStartBadge: true });
  document.getElementById('mapLegend').style.display = 'block';
  if (typeof window.syncLegendVisibility === 'function') {
    window.syncLegendVisibility();
  }
}
