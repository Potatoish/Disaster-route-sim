const USE_OSRM = true;
const OSRM_BASE_URL = 'https://router.project-osrm.org';

function getRouteColor(category) {
  if (category === 'best') return '#22c55e';
  if (category === 'available') return '#f59e0b';
  return '#ef4444';
}

function dedupePath(path) {
  return path.filter((node, index) => path.indexOf(node) === index);
}

function normalizeRoutes(routes) {
  return routes.map(route => {
    const normalizedPath = Array.isArray(route.path) ? dedupePath(route.path) : [];
    return {
      ...route,
      path: normalizedPath,
      path_coordinates: Array.isArray(route.path_coordinates) ? route.path_coordinates : [],
      distance: route.distance ?? '—',
      max_hazard: route.max_hazard ?? 0,
      segments: normalizedPath.length > 1 ? normalizedPath.length - 1 : 0,
      color: route.color || getRouteColor(route.category)
    };
  });
}

function getRoutePoints(route, getLocationByName) {
  if (Array.isArray(route.path_coordinates) && route.path_coordinates.length) {
    return route.path_coordinates
      .filter(p => p && p.lat != null && p.lng != null)
      .map(p => ({ lat: Number(p.lat), lng: Number(p.lng) }));
  }
  if (Array.isArray(route.path) && route.path.length) {
    return route.path
      .map(name => getLocationByName(name))
      .filter(Boolean)
      .map(loc => ({ lat: loc.lat, lng: loc.lng }));
  }
  return [];
}

function offsetPath(path, offsetMeters) {
  if (!offsetMeters) return path;
  const EARTH_RADIUS = 6378137;
  return path.map((point, i) => {
    const prev = path[i - 1] || point;
    const next = path[i + 1] || point;

    const dx = next.lng - prev.lng;
    const dy = next.lat - prev.lat;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;

    const perpLat = -dx / len;
    const perpLng = dy / len;

    const offsetDeg = offsetMeters / EARTH_RADIUS * (180 / Math.PI);

    return {
      lat: point.lat + perpLat * offsetDeg,
      lng: point.lng + perpLng * offsetDeg
    };
  });
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

function buildSmoothFallbackPath(route, getLocationByName) {
  const routeNodes = route.path
    .map(name => getLocationByName(name))
    .filter(Boolean)
    .map(node => ({ lat: node.lat, lng: node.lng }));
  if (routeNodes.length < 2) return [];
  const smoothPath = [];
  for (let i = 0; i < routeNodes.length - 1; i++) {
    const start = routeNodes[i];
    const end = routeNodes[i + 1];
    const dx = Math.abs(end.lng - start.lng);
    const dy = Math.abs(end.lat - start.lat);
    const distanceFactor = Math.max(dx, dy);
    const bend = Math.min(Math.max(distanceFactor * 0.18, 0.00008), 0.00028);
    const segmentPoints = interpolateSegment(start, end, 34, bend);
    if (i > 0) segmentPoints.shift();
    smoothPath.push(...segmentPoints);
  }
  return smoothPath;
}

function drawFallbackPolyline(route, cfg, gMap, mapLayers, getLocationByName, offsetMeters = 0) {
  let smoothCoords = buildSmoothFallbackPath(route, getLocationByName);
  if (smoothCoords.length === 0) return null;

  if (offsetMeters) smoothCoords = offsetPath(smoothCoords, offsetMeters);

  if (route.category === 'best') {
    mapLayers.routes.push(new google.maps.Polyline({
      path: smoothCoords,
      geodesic: true,
      strokeColor: '#22c55e',
      strokeOpacity: 0.10,
      strokeWeight: 26,
      map: gMap,
      zIndex: 0,
    }));
    mapLayers.routes.push(new google.maps.Polyline({
      path: smoothCoords,
      geodesic: true,
      strokeColor: '#86efac',
      strokeOpacity: 0.18,
      strokeWeight: 16,
      map: gMap,
      zIndex: 1,
    }));
  }

  if (route.category === 'available') {
    mapLayers.routes.push(new google.maps.Polyline({
      path: smoothCoords,
      geodesic: true,
      strokeColor: '#fcd34d',
      strokeOpacity: 0.10,
      strokeWeight: 10,
      map: gMap,
      zIndex: 1,
    }));
  }

  const poly = new google.maps.Polyline({
    path: smoothCoords,
    geodesic: true,
    strokeColor: cfg.color,
    strokeOpacity: cfg.opacity,
    strokeWeight: cfg.weight,
    map: gMap,
    zIndex: cfg.zIndex,
  });
  mapLayers.routes.push(poly);
  return poly;
}

async function drawRouteWithOSRM(route, cfg, gMap, mapLayers, getLocationByName, offsetMeters = 0) {
  try {
    const coords = getRoutePoints(route, getLocationByName);
    if (coords.length < 2) return null;

    let fullPath = [];

    for (let i = 0; i < coords.length - 1; i++) {
      const start = coords[i];
      const end = coords[i + 1];
      const url = `${OSRM_BASE_URL}/route/v1/driving/${start.lng},${start.lat};${end.lng},${end.lat}?overview=full&geometries=geojson&alternatives=false`;

      const response = await fetch(url);
      if (!response.ok) throw new Error(`OSRM HTTP error: ${response.status}`);

      const data = await response.json();
      if (data.code !== 'Ok' || !data.routes || !data.routes.length) return null;

      const segment = data.routes[0].geometry.coordinates.map(([lng, lat]) => ({ lat, lng }));
      if (i > 0 && segment.length > 0) segment.shift();
      fullPath.push(...segment);
    }

    if (!fullPath.length) return null;

    if (offsetMeters) fullPath = offsetPath(fullPath, offsetMeters);

    if (route.category === 'best') {
      mapLayers.routes.push(new google.maps.Polyline({
        path: fullPath,
        geodesic: true,
        strokeColor: '#22c55e',
        strokeOpacity: 0.08,
        strokeWeight: 24,
        map: gMap,
        zIndex: 0,
      }));
      mapLayers.routes.push(new google.maps.Polyline({
        path: fullPath,
        geodesic: true,
        strokeColor: '#86efac',
        strokeOpacity: 0.16,
        strokeWeight: 14,
        map: gMap,
        zIndex: 1,
      }));
    }

    const poly = new google.maps.Polyline({
      path: fullPath,
      geodesic: true,
      strokeColor: cfg.color,
      strokeOpacity: cfg.opacity,
      strokeWeight: cfg.weight,
      map: gMap,
      zIndex: cfg.zIndex,
    });
    mapLayers.routes.push(poly);
    return poly;

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
        ['Distance', route.distance + ' km'],
        ['Max Hazard', route.max_hazard + '/5', cfg.color],
        ['Segments', Array.isArray(route.path) ? route.path.length - 1 : 'N/A'],
        ['Path', Array.isArray(route.path) ? route.path.map(shortNodeLabel).join(' → ') : 'N/A'],
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
  redrawNodes,
  start,
  end,
  infoPopup,
  shortNodeLabel,
  activeInfoWindowRef
}) {
  mapLayers.routes.forEach(l => l.setMap(null));
  mapLayers.routes = [];

  const CFG = {
    best:      { color: '#22c55e', weight: 7, opacity: 1,    zIndex: 6 },
    available: { color: '#f59e0b', weight: 5, opacity: 0.9,  zIndex: 3 },
    eliminated:{ color: '#ef4444', weight: 3, opacity: 0.35, zIndex: 1 },
  };

  // offset per route index so they don't overlap on shared roads
  const OFFSETS = [0, 8, -8, 16, -16, 24, -24, 32, -32, 40];

  const bounds = new google.maps.LatLngBounds();
  let successCount = 0;
  let routeIndex = 0;

  for (const route of [...routes].reverse()) {
    const cfg = CFG[route.category] || CFG.eliminated;
    const offsetMeters = OFFSETS[routeIndex % OFFSETS.length];
    routeIndex++;

    let poly = null;

    if (USE_OSRM) {
      poly = await drawRouteWithOSRM(route, cfg, gMap, mapLayers, getLocationByName, offsetMeters);
    }

    if (!poly) {
      poly = drawFallbackPolyline(route, cfg, gMap, mapLayers, getLocationByName, offsetMeters);
    } else {
      successCount++;
    }

    if (poly) {
      attachRouteInfo(poly, route, cfg, infoPopup, shortNodeLabel, activeInfoWindowRef, gMap);
    }

    const usableCoords = getRoutePoints(route, getLocationByName);
    usableCoords.forEach(point => bounds.extend(point));
  }

  if (!bounds.isEmpty()) {
    gMap.fitBounds(bounds, 60);
  }

  redrawNodes(start, end);
  document.getElementById('mapLegend').style.display = 'block';

  if (USE_OSRM && successCount === 0) {
    console.warn('OSRM failed for all routes. Using fallback lines.');
  }
}