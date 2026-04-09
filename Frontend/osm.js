const USE_OSRM = true;
const OSRM_BASE_URL = 'https://router.project-osrm.org';
const MAX_OSRM_WAYPOINTS = 40;

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
      distance: route.distance ?? '—',
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

function samplePathForOSRM(points, maxPoints = MAX_OSRM_WAYPOINTS) {
  if (!Array.isArray(points) || points.length <= maxPoints) {
    return points;
  }

  const sampled = [points[0]];
  const interiorCount = maxPoints - 2;
  const lastIndex = points.length - 1;

  for (let i = 1; i <= interiorCount; i++) {
    const index = Math.round((i * lastIndex) / (interiorCount + 1));
    const point = points[index];
    const previous = sampled[sampled.length - 1];

    if (!previous || previous.lat !== point.lat || previous.lng !== point.lng) {
      sampled.push(point);
    }
  }

  const lastPoint = points[lastIndex];
  const previous = sampled[sampled.length - 1];
  if (!previous || previous.lat !== lastPoint.lat || previous.lng !== lastPoint.lng) {
    sampled.push(lastPoint);
  }

  return sampled;
}

function interpolateSegment(start, end, steps = 32, bend = 0.00018) {
  const points = [];

  const midLat = (start.lat + end.lat) / 2;
  const midLng = (start.lng + end.lng) / 2;

  const dx = end.lng - start.lng;
  const dy = end.lat - start.lat;
  const length = Math.sqrt(dx * dx + dy * dy) || 1;

  const perpX = -dy / length;
  const perpY = dx / length;

  const control = {
    lat: midLat + perpY * bend,
    lng: midLng + perpX * bend
  };

  for (let i = 0; i <= steps; i++) {
    const t = i / steps;

    const lat =
      (1 - t) * (1 - t) * start.lat +
      2 * (1 - t) * t * control.lat +
      t * t * end.lat;

    const lng =
      (1 - t) * (1 - t) * start.lng +
      2 * (1 - t) * t * control.lng +
      t * t * end.lng;

    points.push({ lat, lng });
  }

  return points;
}

function buildFallbackPath(route, getLocationByName) {
  const routePoints = getRoutePoints(route, getLocationByName);
  if (routePoints.length >= 2) {
    return routePoints;
  }

  return [];
}

function addRouteGlow(route, pathCoords, gMap, mapLayers) {
  if (route.category === 'best') {
    mapLayers.routes.push(new google.maps.Polyline({
      path: pathCoords,
      geodesic: false,
      strokeColor: '#22c55e',
      strokeOpacity: 0.10,
      strokeWeight: 26,
      map: gMap,
      zIndex: 0,
    }));

    mapLayers.routes.push(new google.maps.Polyline({
      path: pathCoords,
      geodesic: false,
      strokeColor: '#86efac',
      strokeOpacity: 0.18,
      strokeWeight: 16,
      map: gMap,
      zIndex: 1,
    }));
  }

  if (route.category === 'available') {
    mapLayers.routes.push(new google.maps.Polyline({
      path: pathCoords,
      geodesic: false,
      strokeColor: '#fcd34d',
      strokeOpacity: 0.08,
      strokeWeight: 8,
      map: gMap,
      zIndex: 2,
    }));
  }
}

function addRoutePolyline(pathCoords, cfg, gMap, mapLayers) {
  const poly = new google.maps.Polyline({
    path: pathCoords,
    geodesic: false,
    strokeColor: cfg.color,
    strokeOpacity: cfg.opacity,
    strokeWeight: cfg.weight,
    map: gMap,
    zIndex: cfg.zIndex,
  });

  mapLayers.routes.push(poly);
  return poly;
}

function extractStreetPath(osrmRoute) {
  const streetNames = [];

  osrmRoute.legs.forEach(leg => {
    leg.steps.forEach(step => {
      if (step.name && step.name.trim() !== '') {
        streetNames.push(step.name);
      }
    });
  });

  return streetNames.filter((street, index) => street !== streetNames[index - 1]);
}

function drawFallbackPolyline(route, cfg, gMap, mapLayers, getLocationByName) {
  const pathCoords = buildFallbackPath(route, getLocationByName);
  if (pathCoords.length === 0) return null;

  route.render_path = pathCoords;
  addRouteGlow(route, pathCoords, gMap, mapLayers);
  return addRoutePolyline(pathCoords, cfg, gMap, mapLayers);
}

async function drawRouteWithOSRM(route, cfg, gMap, mapLayers, getLocationByName) {
  try {
    if (route.category !== 'best') return null;

    const coords = getRoutePoints(route, getLocationByName);
    if (coords.length < 2) return null;

    const waypointCoords = samplePathForOSRM(coords);
    if (waypointCoords.length < 2) return null;

    const waypointString = waypointCoords
      .map(({ lat, lng }) => `${lng},${lat}`)
      .join(';');

    const url =
      `${OSRM_BASE_URL}/route/v1/driving/${waypointString}` +
      `?overview=full&geometries=geojson&steps=true&continue_straight=true`;

    const response = await fetch(url);
    if (!response.ok) throw new Error(`OSRM HTTP error: ${response.status}`);

    const data = await response.json();
    if (data.code !== 'Ok' || !data.routes?.length) return null;

    const osrmRoute = data.routes[0];
    const fullPath = osrmRoute.geometry.coordinates.map(([lng, lat]) => ({ lat, lng }));
    route.street_path = extractStreetPath(osrmRoute);
    route.osrm_waypoints = waypointCoords.length;

    if (!fullPath.length) return null;

    route.render_path = fullPath;
    addRouteGlow(route, fullPath, gMap, mapLayers);
    return addRoutePolyline(fullPath, cfg, gMap, mapLayers);

  } catch (error) {
    console.error('OSRM segment route error:', error, route.path);
    return null;
  }
}

function attachRouteInfo(poly, route, cfg, infoPopup, shortNodeLabel, activeInfoWindowRef, gMap) {
  const label = route.category === 'best'
    ? '🏆 Best Route'
    : route.category === 'available'
    ? '✅ Available Route'
    : '❌ Eliminated';

  poly.addListener('click', ev => {
    if (activeInfoWindowRef.current) activeInfoWindowRef.current.close();
    activeInfoWindowRef.current = new google.maps.InfoWindow({
      content: infoPopup(label, [
        ['Distance', route.distance + ' m'],
        ['Max Hazard', route.max_hazard + '/5', cfg.color],
        ['Segments', typeof route.segments === 'number' ? route.segments : 'N/A'],
        ['Path', route.path_label || 'N/A'],
        ['Streets', route.street_path?.length ? route.street_path.join(' → ') : 'N/A'],
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
  mapLayers.routes.forEach(l => l.setMap(null));
  mapLayers.routes = [];

  const CFG = {
    best: { color: '#22c55e', weight: 7, opacity: 1, zIndex: 8 },
    available: { color: '#f59e0b', weight: 5, opacity: 0.9, zIndex: 5 },
    eliminated: { color: '#ef4444', weight: 4, opacity: 0.7, zIndex: 4 },
  };
  const DRAW_ORDER = { eliminated: 0, available: 1, best: 2 };

  const bounds = new google.maps.LatLngBounds();
  let successCount = 0;

  const orderedRoutes = [...routes].sort(
    (left, right) => (DRAW_ORDER[left.category] ?? 99) - (DRAW_ORDER[right.category] ?? 99)
  );

  for (const route of orderedRoutes) {
    const cfg = CFG[route.category] || CFG.eliminated;

    let poly = null;

    if (USE_OSRM) {
      poly = await drawRouteWithOSRM(route, cfg, gMap, mapLayers, getLocationByName);
    }

    if (!poly) {
      poly = drawFallbackPolyline(route, cfg, gMap, mapLayers, getLocationByName);
    } else {
      successCount++;
    }

    if (poly) {
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

    const usableCoords = Array.isArray(route.render_path) && route.render_path.length
      ? route.render_path
      : getRoutePoints(route, getLocationByName);
    usableCoords.forEach(point => bounds.extend(point));
  }

  if (!bounds.isEmpty()) {
    gMap.fitBounds(bounds, 60);
  }

  drawSelectedPinsOnly(start, end);
  document.getElementById('mapLegend').style.display = 'block';

  if (USE_OSRM && successCount === 0) {
    console.warn('OSRM failed for all routes. Using fallback lines.');
  }
}
