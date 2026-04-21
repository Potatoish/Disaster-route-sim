const ROUTE_ENDPOINT_SNAP_TOLERANCE_METERS = 12;
const ROUTE_ENDPOINT_ATTACH_MAX_DISTANCE_METERS = 90;

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

function estimatePointGapMeters(pointA, pointB) {
  if (!pointA || !pointB) return Number.POSITIVE_INFINITY;

  const lat1 = Number(pointA.lat) * (Math.PI / 180);
  const lat2 = Number(pointB.lat) * (Math.PI / 180);
  const lng1 = Number(pointA.lng) * (Math.PI / 180);
  const lng2 = Number(pointB.lng) * (Math.PI / 180);
  const dLat = lat2 - lat1;
  const dLng = lng2 - lng1;
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const a = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLng * sinLng;
  return 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function normalizePointCandidate(point) {
  if (!point || point.lat == null || point.lng == null) {
    return null;
  }

  const normalized = {
    lat: Number(point.lat),
    lng: Number(point.lng),
  };

  return Number.isFinite(normalized.lat) && Number.isFinite(normalized.lng)
    ? normalized
    : null;
}

function replaceOrInsertPathPoint(pathPoints, point, mode) {
  if (!Array.isArray(pathPoints) || !pathPoints.length || !point) {
    return pathPoints;
  }

  if (mode === 'start') {
    if (estimatePointGapMeters(pathPoints[0], point) <= 1.5) {
      pathPoints[0] = point;
    } else {
      pathPoints.unshift(point);
    }
    return pathPoints;
  }

  if (estimatePointGapMeters(pathPoints[pathPoints.length - 1], point) <= 1.5) {
    pathPoints[pathPoints.length - 1] = point;
  } else {
    pathPoints.push(point);
  }

  return pathPoints;
}

function projectPointToSegment(endpoint, segmentStart, segmentEnd) {
  const start = normalizePointCandidate(segmentStart);
  const end = normalizePointCandidate(segmentEnd);
  const target = normalizePointCandidate(endpoint);
  if (!start || !end || !target) {
    return null;
  }

  const avgLat = ((start.lat + end.lat + target.lat) / 3) * (Math.PI / 180);
  const lngScale = Math.cos(avgLat) * 111320;
  const latScale = 111320;

  const ax = start.lng * lngScale;
  const ay = start.lat * latScale;
  const bx = end.lng * lngScale;
  const by = end.lat * latScale;
  const px = target.lng * lngScale;
  const py = target.lat * latScale;

  const abx = bx - ax;
  const aby = by - ay;
  const segmentLengthSquared = abx * abx + aby * aby;
  if (segmentLengthSquared <= 1e-6) {
    return start;
  }

  const t = Math.max(0, Math.min(1, ((px - ax) * abx + (py - ay) * aby) / segmentLengthSquared));
  return {
    lat: (ay + aby * t) / latScale,
    lng: (ax + abx * t) / lngScale,
  };
}

function buildEndpointAnchor(pathPoints, endpoint, mode) {
  if (!Array.isArray(pathPoints) || pathPoints.length < 2) {
    return null;
  }

  const anchor = mode === 'start'
    ? projectPointToSegment(endpoint, pathPoints[0], pathPoints[1])
    : projectPointToSegment(endpoint, pathPoints[pathPoints.length - 2], pathPoints[pathPoints.length - 1]);

  if (!anchor) {
    return null;
  }

  return estimatePointGapMeters(endpoint, anchor) <= ROUTE_ENDPOINT_ATTACH_MAX_DISTANCE_METERS
    ? anchor
    : null;
}

function attachEndpointToPath(pathPoints, endpoint, mode) {
  const normalizedEndpoint = normalizePointCandidate(endpoint);
  if (!normalizedEndpoint || !Array.isArray(pathPoints) || !pathPoints.length) {
    return pathPoints;
  }

  const targetIndex = mode === 'start' ? 0 : pathPoints.length - 1;
  const edgePoint = pathPoints[targetIndex];
  const gapMeters = estimatePointGapMeters(edgePoint, normalizedEndpoint);
  const anchorPoint = buildEndpointAnchor(pathPoints, normalizedEndpoint, mode);

  if (!anchorPoint && gapMeters > ROUTE_ENDPOINT_ATTACH_MAX_DISTANCE_METERS) {
    return pathPoints;
  }

  if (anchorPoint) {
    if (estimatePointGapMeters(pathPoints[targetIndex], anchorPoint) <= ROUTE_ENDPOINT_SNAP_TOLERANCE_METERS) {
      pathPoints[targetIndex] = anchorPoint;
    } else {
      replaceOrInsertPathPoint(pathPoints, anchorPoint, mode);
    }
  } else if (gapMeters <= ROUTE_ENDPOINT_SNAP_TOLERANCE_METERS) {
    pathPoints[targetIndex] = normalizedEndpoint;
    return pathPoints;
  }

  replaceOrInsertPathPoint(pathPoints, normalizedEndpoint, mode);
  return pathPoints;
}

function buildRenderablePath(route, normalizedCoords) {
  const renderPath = [...normalizedCoords];
  const destinationPoint = normalizePointCandidate({
    lat: Number(route?.destination_lat),
    lng: Number(route?.destination_lng),
  });

  if (!destinationPoint) {
    return renderPath;
  }

  if (!renderPath.length) {
    return [destinationPoint];
  }

  return attachEndpointToPath(renderPath, destinationPoint, 'end');
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
    const renderPath = buildRenderablePath(route, normalizedCoords);

    return {
      ...route,
      path: normalizedPath,
      path_coordinates: normalizedCoords,
      render_path: renderPath,
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
  if (Array.isArray(route.render_path) && route.render_path.length) {
    return route.render_path;
  }

  if (route.path_coordinates.length) {
    return route.path_coordinates;
  }

  return [];
}

function resolveNamedLocationPoint(getLocationByName, locationName) {
  if (typeof getLocationByName !== 'function' || !locationName) {
    return null;
  }

  return normalizePointCandidate(getLocationByName(locationName));
}

function buildFallbackPath(route, getLocationByName, startName, endName) {
  const routePoints = [...getRoutePoints(route, getLocationByName)];
  if (routePoints.length >= 2) {
    const destinationPoint = normalizePointCandidate({
      lat: route?.destination_lat,
      lng: route?.destination_lng,
    }) || resolveNamedLocationPoint(getLocationByName, endName);
    const startPoint = resolveNamedLocationPoint(getLocationByName, startName);

    attachEndpointToPath(routePoints, startPoint, 'start');
    attachEndpointToPath(routePoints, destinationPoint, 'end');
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

function drawFallbackPolyline(route, cfg, gMap, mapLayers, getLocationByName, routeGroup, startName, endName) {
  const pathCoords = buildFallbackPath(route, getLocationByName, startName, endName);
  if (pathCoords.length === 0) return null;

  route.render_path = pathCoords;
  addRouteGlow(route, pathCoords, gMap, mapLayers, routeGroup);
  addRouteOutline(pathCoords, cfg, gMap, mapLayers, routeGroup);
  return addRoutePolyline(pathCoords, cfg, gMap, mapLayers, routeGroup);
}

function attachRouteInfo(poly, route, cfg, infoPopup, shortNodeLabel, activeInfoWindowRef, gMap) {
  const statusLabel = String(route?.status || '').trim();
  const label = statusLabel
    ? `${statusLabel} Route`
    : route.category === 'best'
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

    const extraRows = Array.isArray(route.info_rows) ? route.info_rows : [];
    const isEarthquakeRoute = route.simulation_mode === 'earthquake';
    const contextLabel = isEarthquakeRoute ? 'Hazards' : 'Flood Zones';
    const contextValue = isEarthquakeRoute
      ? (route.hazard_signature || 'N/A')
      : (route.display_flood_classes || 'None');
    const peakRiskLabel = !isEarthquakeRoute && typeof window.formatFloodPeakRisk === 'function'
      ? `${window.formatFloodPeakRisk(route)} (${route.max_hazard ?? 'N/A'}/5)`
      : null;
    if (activeInfoWindowRef.current) activeInfoWindowRef.current.close();
    activeInfoWindowRef.current = new google.maps.InfoWindow({
      content: infoPopup(label, [
        ['Route No.', `#${route.display_route_no ?? 'N/A'}`],
        ['Distance', route.display_distance || formatDistanceKm(route.distance)],
        ['Max Hazard', route.max_hazard + '/5', cfg.color],
        ...(peakRiskLabel ? [['Water Risk', peakRiskLabel]] : []),
        ['Unsafe Dist.', route.display_unsafe_distance || '0 m'],
        ['Unsafe Segs', route.display_unsafe_segment_count ?? 0],
        ['Summary', route.display_route_summary || route.path_label || 'N/A'],
        ['Why', route.display_reason || 'No explanation available'],
        [contextLabel, contextValue],
        ['Streets', formatStreetPath(route.street_path)],
        ...extraRows,
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
  activeInfoWindowRef,
  afterDrawPins = null,
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

    const poly = drawFallbackPolyline(
      route,
      cfg,
      gMap,
      mapLayers,
      getLocationByName,
      routeGroup,
      start,
      end
    );

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

  drawSelectedPinsOnly(start, end);
  if (typeof afterDrawPins === 'function') {
    afterDrawPins();
  }
  document.getElementById('mapLegend').style.display = 'block';
  if (typeof window.syncLegendVisibility === 'function') {
    window.syncLegendVisibility();
  }
}
