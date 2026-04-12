const BACKEND = 'http://127.0.0.1:5000';

let gMap = null;
let selectedBarangay = null;
let selectedHazard = null;
let simData = null;
let resultsCollapsed = false;
let isBackendLive = false;
let isLegendCollapsed = true;
let mapLayers = { edges: [], nodes: [], routes: [], scopes: [], routeGroups: [], scopePoints: [] };
let activeInfoWindow = null;
let selectedRouteFocus = null;
let workflowFocusSection = null;
const activeInfoWindowRef = { current: null };
const THEME_STORAGE_KEY = 'disaster-route-sim-theme';
let mapThemeTransitionTimer = null;

let ALL_LOCATIONS = [];
let LOCATIONS_BY_BARANGAY = {};

const MAP_STYLES_DARK = [
  { elementType: 'geometry', stylers: [{ color: '#0f1724' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#cbd5e1' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#0b1220' }] },
  { featureType: 'administrative', elementType: 'geometry.stroke', stylers: [{ color: '#243447' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#1f2d3d' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#31465c' }] },
  { featureType: 'road.arterial', elementType: 'geometry', stylers: [{ color: '#27384a' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0a2f4d' }] },
  { featureType: 'landscape', elementType: 'geometry', stylers: [{ color: '#101b2b' }] },
];

function getMapThemeStyles() {
  // Keep Google's default roadmap styling in light mode so local roads remain visible.
  return document.body.classList.contains('dark') ? MAP_STYLES_DARK : null;
}

function animateMapThemeTransition() {
  const mapWrap = document.querySelector('.map-wrap');
  if (!mapWrap) return;

  mapWrap.classList.remove('theme-transitioning');
  void mapWrap.offsetWidth;
  mapWrap.classList.add('theme-transitioning');

  if (mapThemeTransitionTimer) {
    window.clearTimeout(mapThemeTransitionTimer);
  }

  mapThemeTransitionTimer = window.setTimeout(() => {
    mapWrap.classList.remove('theme-transitioning');
    mapThemeTransitionTimer = null;
  }, 360);
}

function syncMapTheme(animated = false) {
  if (!gMap) return;

  gMap.setOptions({
    styles: getMapThemeStyles(),
    backgroundColor: document.body.classList.contains('dark') ? '#08121d' : '#f8fafc',
  });

  if (animated) {
    animateMapThemeTransition();
  }
}

function syncSiteThemeButton() {
  const btn = document.getElementById('themeToggleBtn');
  const icon = document.getElementById('themeToggleIcon');
  const label = document.getElementById('themeToggleLabel');
  const isDark = document.body.classList.contains('dark');
  const nextTheme = isDark ? 'light' : 'dark';

  if (btn) {
    btn.onclick = toggleTheme;
    btn.setAttribute('aria-label', `Switch to ${nextTheme} mode`);
    btn.setAttribute('aria-pressed', String(isDark));
  }

  if (icon) {
    icon.textContent = isDark ? '\u2600' : '\u263E';
  }

  if (label) {
    label.textContent = isDark ? 'Dark mode' : 'Light mode';
  }
}

function getStoredTheme() {
  try {
    return localStorage.getItem(THEME_STORAGE_KEY) === 'dark' ? 'dark' : 'light';
  } catch (err) {
    return 'light';
  }
}

function applyTheme(theme) {
  document.body.classList.toggle('dark', theme === 'dark');
  syncSiteThemeButton();
  syncMapTheme(true);

  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch (err) {
    // Ignore storage failures and keep the theme in-memory only.
  }
}

function initTheme() {
  applyTheme(getStoredTheme());
}

function toggleTheme() {
  applyTheme(document.body.classList.contains('dark') ? 'light' : 'dark');
}

function syncMapOverlayLayout() {
  const legend = document.getElementById('mapLegend');
  const infoBadge = document.getElementById('mapInfoBadge');

  if (!legend) return;

  const defaultLegendTop = 132;
  let nextLegendTop = defaultLegendTop;

  if (infoBadge && infoBadge.style.display !== 'none' && infoBadge.offsetParent !== null) {
    nextLegendTop = Math.max(defaultLegendTop, infoBadge.offsetTop + infoBadge.offsetHeight + 12);
  }

  legend.style.top = `${nextLegendTop}px`;
}

function syncLegendVisibility() {
  const legend = document.getElementById('mapLegend');
  const toggleBtn = document.getElementById('legendToggleBtn');

  if (!legend) return;

  syncMapOverlayLayout();
  legend.classList.toggle('legend-collapsed', isLegendCollapsed);

  if (toggleBtn) {
    toggleBtn.textContent = isLegendCollapsed ? 'Show' : 'Hide';
    toggleBtn.setAttribute('aria-expanded', String(!isLegendCollapsed));
  }
}

function toggleLegendVisibility() {
  isLegendCollapsed = !isLegendCollapsed;
  syncLegendVisibility();
}

function initMap() {
  gMap = new google.maps.Map(document.getElementById('map'), {
    center: { lat: 14.5590, lng: 121.0955 },
    zoom: 15,
    tilt: 0,
    heading: 0,
    mapTypeId: google.maps.MapTypeId.ROADMAP,
    styles: getMapThemeStyles(),
    backgroundColor: document.body.classList.contains('dark') ? '#08121d' : '#f8fafc',
    mapTypeControl: true,
    mapTypeControlOptions: {
      style: google.maps.MapTypeControlStyle.DROPDOWN_MENU,
      position: google.maps.ControlPosition.TOP_RIGHT,
    },
    streetViewControl: false,
    fullscreenControl: true,
    zoomControl: true,
    tiltControl: false,
    rotationControl: false,
  });

  window.addEventListener('resize', syncMapOverlayLayout);
  startApp();
}

async function startApp() {
  await checkBackend();

  if (!isBackendLive) {
    document.getElementById('statusTxt').textContent = 'Backend Offline';
    alert('Backend is not connected. Run the Flask backend first.');
    return;
  }

  await loadLocationsFromBackend();
}

function clearRoutePreview(group) {
  if (!group) return;

  if (group.previewTimer) {
    window.clearInterval(group.previewTimer);
    group.previewTimer = null;
  }

  if (group.previewDotsHaloLayer) {
    group.previewDotsHaloLayer.setMap(null);
    group.previewDotsHaloLayer = null;
  }

  if (group.previewDotsLayer) {
    group.previewDotsLayer.setMap(null);
    group.previewDotsLayer = null;
  }

  if (group.previewArrowHaloLayer) {
    group.previewArrowHaloLayer.setMap(null);
    group.previewArrowHaloLayer = null;
  }

  if (group.previewArrowLayer) {
    group.previewArrowLayer.setMap(null);
    group.previewArrowLayer = null;
  }
}

function clearRouteAnimation() {
  const groups = Array.isArray(mapLayers.routeGroups) ? mapLayers.routeGroups : [];
  groups.forEach(clearRoutePreview);
}

function clearLayers() {
  clearRouteAnimation();
  [...mapLayers.edges, ...mapLayers.nodes, ...mapLayers.routes, ...mapLayers.scopes].forEach(o => o.setMap(null));
  mapLayers = { edges: [], nodes: [], routes: [], scopes: [], routeGroups: [], scopePoints: [] };
  selectedRouteFocus = null;

  if (activeInfoWindow) {
    activeInfoWindow.close();
    activeInfoWindow = null;
  }

  if (activeInfoWindowRef.current) {
    activeInfoWindowRef.current.close();
    activeInfoWindowRef.current = null;
  }

  if (typeof window.clearSelectedRouteRow === 'function') {
    window.clearSelectedRouteRow();
  }
  if (typeof window.clearRouteRowHighlight === 'function') {
    window.clearRouteRowHighlight();
  }
}

function normalizeLocation(loc) {
  return {
    name: loc.name || '',
    lat: Number(loc.lat),
    lng: Number(loc.lng),
    barangay: loc.barangay || 'Unknown',
    haz: typeof loc.haz === 'number' ? loc.haz : null,
    flood_var: typeof loc.flood_var === 'number' ? loc.flood_var : null,
    hazard_source: loc.hazard_source || null,
    level: loc.level || 'safe'
  };
}

function groupLocationsByBarangay(locations) {
  const grouped = {};

  locations.forEach(loc => {
    const bgy = loc.barangay || 'Unknown';
    if (!grouped[bgy]) grouped[bgy] = [];
    grouped[bgy].push(loc);
  });

  return grouped;
}

function setBarangayCardStates() {
  document.querySelectorAll('.bgy-card[data-barangay]').forEach(card => {
    const barangay = card.dataset.barangay || '';
    const hasLocations = getBarangayLocations(barangay).length > 0;

    card.classList.toggle('disabled', !hasLocations);
    card.title = hasLocations ? '' : 'No locations available for this barangay in the current database';
  });
}

async function loadLocationsFromBackend() {
  try {
    const res = await fetch(BACKEND + '/locations');
    const data = await res.json();

    if (data.error) {
      throw new Error(data.message || 'Failed to load locations');
    }

    ALL_LOCATIONS = (data.locations || []).map(normalizeLocation);
    LOCATIONS_BY_BARANGAY = groupLocationsByBarangay(ALL_LOCATIONS);
    setBarangayCardStates();

    document.getElementById('statusTxt').textContent = 'Locations Loaded';
  } catch (err) {
    console.error(err);
    document.getElementById('statusTxt').textContent = 'Error Loading Locations';
    alert('Failed to load locations from backend: ' + err.message);
  }
}

function getBarangayLocations(barangay) {
  return LOCATIONS_BY_BARANGAY[barangay] || [];
}

function getLocationByName(name) {
  return ALL_LOCATIONS.find(loc => loc.name === name) || null;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDistanceCompact(distanceMeters, fallback = 'N/A') {
  const numericDistance = Number(distanceMeters);
  if (!Number.isFinite(numericDistance)) {
    return fallback;
  }

  if (Math.abs(numericDistance) < 1000) {
    return `${Math.round(numericDistance)} m`;
  }

  return `${(numericDistance / 1000).toFixed(2)} km`;
}

function formatFloodClasses(route) {
  const vars = Array.isArray(route?.flood_vars_encountered) ? route.flood_vars_encountered : [];
  return vars.length ? vars.map(value => `Var ${value}`).join(', ') : 'None';
}

function formatHazardBreakdown(route) {
  const entries = Object.entries(route?.hazard_breakdown || {});
  return entries.length
    ? entries.map(([level, count]) => `H${level}:${count}`).join(' · ')
    : 'No hazard data';
}

function buildRouteStreetSummary(route) {
  const streetNames = Array.isArray(route?.street_path)
    ? route.street_path.map(name => String(name).trim()).filter(Boolean)
    : [];

  if (!streetNames.length) {
    return route?.path_label || 'Route summary unavailable';
  }

  const visible = streetNames.slice(0, 3);
  const suffix = streetNames.length > 3 ? ` +${streetNames.length - 3} more` : '';
  return `Via ${visible.join(' -> ')}${suffix}`;
}

function buildRouteReason(route) {
  if (route?.category === 'best') {
    return 'Safest displayed route, ranked first by unsafe exposure, risk distance, and then total distance.';
  }

  if (route?.category === 'available') {
    return 'Safe route, but ranked below the best route because it carries more exposure, longer distance, or both.';
  }

  const unsafeSegments = Number(route?.threshold_exceedance_count || 0);
  return route?.elimination_reason
    || `Eliminated because it passes through ${unsafeSegments} high-risk segment${unsafeSegments === 1 ? '' : 's'}.`;
}

function decorateRouteForDisplay(route) {
  const segmentCount = typeof route?.segments === 'number'
    ? route.segments
    : Array.isArray(route?.path)
    ? Math.max(0, route.path.length - 1)
    : 0;
  const unsafeSegmentCount = Number(route?.threshold_exceedance_count || 0);
  const streetPreview = Array.isArray(route?.street_path) && route.street_path.length
    ? route.street_path.join(' -> ')
    : 'No named streets available';

  return {
    ...route,
    display_distance: formatDistanceCompact(route?.distance),
    display_unsafe_distance: formatDistanceCompact(route?.unsafe_distance, '0 m'),
    display_flood_classes: formatFloodClasses(route),
    display_hazard_breakdown: formatHazardBreakdown(route),
    display_route_summary: buildRouteStreetSummary(route),
    display_street_preview: streetPreview,
    display_reason: buildRouteReason(route),
    display_segment_count: segmentCount,
    display_unsafe_segment_count: unsafeSegmentCount,
  };
}

function decorateRoutesForDisplay(routes) {
  return routes.map(route => decorateRouteForDisplay(route));
}

function getCurrentSelections() {
  return {
    barangay: selectedBarangay,
    hazard: selectedHazard,
    start: document.getElementById('startSel')?.value || '',
    end: document.getElementById('endSel')?.value || '',
  };
}

function setRouteSelectorsEnabled(enabled) {
  ['startSel', 'endSel'].forEach(id => {
    document.getElementById(id).disabled = !enabled;
  });
}

function populateBarangayNodeSelectors(name) {
  const nodes = getBarangayLocations(name);
  const locs = nodes.map(n => n.name);

  const startSel = document.getElementById('startSel');
  const endSel = document.getElementById('endSel');

  function populate(sel, exclude) {
    const kept = sel.value !== exclude ? sel.value : '';
    sel.innerHTML = '<option value="">— Select node —</option>';

    locs.forEach(l => {
      if (l === exclude) return;
      sel.innerHTML += `<option value="${l}" ${l === kept ? 'selected' : ''}>${l}</option>`;
    });

    sel.value = kept;
  }

  populate(startSel, null);
  populate(endSel, null);

  startSel.disabled = !selectedHazard;
  endSel.disabled = !selectedHazard;

  startSel.onchange = () => {
    populate(endSel, startSel.value);
    onNodeChange();
  };

  endSel.onchange = () => {
    populate(startSel, endSel.value);
    onNodeChange();
  };
}

function clearBarangaySelections(options = {}) {
  const { keepResults = false, keepInfoText = false } = options;

  simData = null;
  selectedRouteFocus = null;
  clearLayers();

  ['startSel', 'endSel'].forEach(id => {
    const select = document.getElementById(id);
    const placeholder = selectedHazard
      ? '— Select node —'
      : '— Select disaster type first —';

    select.innerHTML = `<option value="">${placeholder}</option>`;
    select.value = '';
    select.disabled = !selectedHazard;
  });

  document.getElementById('runBtn').disabled = true;
  document.getElementById('mapInfoBadge').style.display = 'none';
  document.getElementById('mapLegend').style.display = 'none';
  syncLegendVisibility();

  if (!keepResults) {
    document.getElementById('resultsPanel').classList.remove('show');
    document.getElementById('resultsActions').classList.remove('show');
    document.getElementById('resetBtn').classList.remove('show');
    document.getElementById('resultsSummaryTxt').textContent = '';
    document.getElementById('resultsToggleFab').classList.remove('show');
    resultsCollapsed = false;
  }

  if (!keepInfoText) {
    document.getElementById('infoBox').innerHTML = selectedBarangay
      ? `<strong>Brgy. ${selectedBarangay}</strong> loaded. ${selectedHazard ? 'Choose your <strong>start</strong> and <strong>end</strong> nodes below.' : 'Choose a <strong>disaster type</strong> first.'}`
      : `Select a <strong>barangay</strong> and then choose a <strong>disaster type</strong> to begin. The ACO algorithm will find the <strong>safest route</strong> using the <strong>lexicographic safety-first rule</strong>.`;
  }

  updateMapContextBadge();
}

function syncResultsVisibility(expanded) {
  const hasResults = !!(simData && Array.isArray(simData.routes) && simData.routes.length);
  const resultsPanel = document.getElementById('resultsPanel');
  const resultsActions = document.getElementById('resultsActions');
  const resultsToggleFab = document.getElementById('resultsToggleFab');
  const routeCount = hasResults ? simData.routes.length : 0;

  resultsPanel.classList.toggle('show', hasResults && expanded);
  resultsActions.classList.toggle('show', hasResults && expanded);
  resultsToggleFab.classList.toggle('show', hasResults && !expanded);
  resultsToggleFab.textContent = routeCount ? `Show Results (${routeCount})` : 'Show Results';

  resultsCollapsed = hasResults && !expanded;
}

function hideResultsPanel() {
  if (!simData) return;
  syncResultsVisibility(false);
}

function showResultsPanelDrawer() {
  if (!simData) return;
  syncResultsVisibility(true);
}

function nodeColor(haz, id, start, end) {
  if (id === start) return '#a855f7';
  if (id === end) return '#06b6d4';
  if (haz == null) return '#94a3b8';
  if (haz <= 2) return '#22c55e';
  if (haz === 3) return '#eab308';
  return '#ef4444';
}

function describeNodeFloodClass(node) {
  if (typeof node.flood_var === 'number') {
    return `Var ${node.flood_var}`;
  }

  if (node.hazard_source === 'flood_json') {
    return 'No direct polygon match';
  }

  return 'Unavailable';
}

function describeHazardSource(node) {
  if (node.hazard_source === 'flood_json') {
    return 'Flood GeoJSON';
  }

  return 'Unavailable';
}

function shortNodeLabel(name) {
  if (name == null) return 'N/A';
  return String(name).split(',')[0].split(' ').slice(0, 2).join(' ');
}

function infoPopup(title, rows) {
  return `<div class="popup-shell">
    <div class="popup-title">${escapeHtml(title)}</div>
    ${rows.map(([k, v, c]) => `<div class="popup-row"><span>${escapeHtml(k)}</span><span style="${c ? 'color:' + c : ''}">${escapeHtml(v)}</span></div>`).join('')}
  </div>`;
}

function updateMapContextBadge() {
  const badge = document.getElementById('mapInfoBadge');
  const content = document.getElementById('mapInfoContent');
  if (!badge || !content) return;

  const { barangay, hazard, start, end } = getCurrentSelections();
  const hasSelection = Boolean(barangay || hazard || start || end || simData);

  if (!hasSelection) {
    badge.style.display = 'none';
    content.innerHTML = '';
    window.requestAnimationFrame(syncMapOverlayLayout);
    return;
  }

  const routes = Array.isArray(simData?.routes) ? simData.routes : [];
  const bestRoute = routes.find(route => route.category === 'best') || null;
  const safeCount = routes.filter(route => route.category !== 'eliminated').length;
  const eliminatedCount = routes.filter(route => route.category === 'eliminated').length;
  const selectionRoute = start && end
    ? `${shortNodeLabel(start)} -> ${shortNodeLabel(end)}`
    : start
    ? `${shortNodeLabel(start)} -> Choose destination`
    : 'Select start and end nodes';
  const stats = [
    `${routes.length || 0} shown`,
    `${safeCount || 0} safe`,
  ];

  if (eliminatedCount > 0) {
    stats.push(`${eliminatedCount} eliminated`);
  }

  content.innerHTML = `
    <div class="map-context compact">
      <div class="map-context-head">
        <div class="map-context-kicker">${escapeHtml((hazard || 'Route').toUpperCase())} CONTEXT</div>
        <div class="map-context-status">${routes.length ? 'Results Ready' : 'Selection In Progress'}</div>
      </div>
      <div class="map-context-grid">
        <div class="map-context-row">
          <span>Barangay</span>
          <strong>${escapeHtml(barangay || 'Not selected')}</strong>
        </div>
        <div class="map-context-row">
          <span>Route</span>
          <strong>${escapeHtml(selectionRoute)}</strong>
        </div>
        <div class="map-context-row">
          <span>Best</span>
          <strong>${escapeHtml(bestRoute ? bestRoute.display_distance : 'Run simulation')}</strong>
        </div>
      </div>
      <div class="map-context-chips">
        ${stats.map(value => `<span class="map-context-chip">${escapeHtml(value)}</span>`).join('')}
      </div>
    </div>`;

  badge.style.display = 'block';
  window.requestAnimationFrame(syncMapOverlayLayout);
}

function fitMapToLocations(locations, padding = 60) {
  if (!locations.length) return;

  const bounds = new google.maps.LatLngBounds();
  locations.forEach(loc => bounds.extend({ lat: loc.lat, lng: loc.lng }));
  gMap.fitBounds(bounds, padding);
}

function buildScopeBounds(points) {
  const bounds = new google.maps.LatLngBounds();
  points.forEach(point => bounds.extend(point));
  return bounds;
}

function getBarangayScopePoints(locations) {
  const points = (locations || [])
    .filter(loc => loc && Number.isFinite(Number(loc.lat)) && Number.isFinite(Number(loc.lng)))
    .map(loc => ({ lat: Number(loc.lat), lng: Number(loc.lng) }));

  if (points.length === 0) return [];

  if (points.length < 3) {
    const bounds = buildScopeBounds(points);
    const ne = bounds.getNorthEast();
    const sw = bounds.getSouthWest();
    const latPad = Math.max((ne.lat() - sw.lat()) * 0.18, 0.0012);
    const lngPad = Math.max((ne.lng() - sw.lng()) * 0.18, 0.0012);

    return [
      { lat: ne.lat() + latPad, lng: sw.lng() - lngPad },
      { lat: ne.lat() + latPad, lng: ne.lng() + lngPad },
      { lat: sw.lat() - latPad, lng: ne.lng() + lngPad },
      { lat: sw.lat() - latPad, lng: sw.lng() - lngPad },
    ];
  }

  const sorted = [...points].sort((left, right) => (
    left.lng === right.lng ? left.lat - right.lat : left.lng - right.lng
  ));

  const cross = (origin, a, b) => (
    (a.lng - origin.lng) * (b.lat - origin.lat) -
    (a.lat - origin.lat) * (b.lng - origin.lng)
  );

  const buildHalf = input => {
    const hull = [];
    input.forEach(point => {
      while (hull.length >= 2 && cross(hull[hull.length - 2], hull[hull.length - 1], point) <= 0) {
        hull.pop();
      }
      hull.push(point);
    });
    return hull;
  };

  const lower = buildHalf(sorted);
  const upper = buildHalf([...sorted].reverse());
  const hull = lower.slice(0, -1).concat(upper.slice(0, -1));

  if (hull.length < 3) {
    return getBarangayScopePoints(points.slice(0, 2));
  }

  const center = hull.reduce(
    (accumulator, point) => ({
      lat: accumulator.lat + point.lat / hull.length,
      lng: accumulator.lng + point.lng / hull.length,
    }),
    { lat: 0, lng: 0 }
  );

  return hull.map(point => ({
    lat: center.lat + (point.lat - center.lat) * 1.08,
    lng: center.lng + (point.lng - center.lng) * 1.08,
  }));
}

function drawBarangayScope(barangayName) {
  const locations = getBarangayLocations(barangayName);
  const scopePoints = getBarangayScopePoints(locations);

  if (!scopePoints.length) return [];
  mapLayers.scopePoints = scopePoints;
  return scopePoints;
}

function fitMapToScope(scopePoints, padding = 70) {
  if (!scopePoints.length) return;
  const bounds = buildScopeBounds(scopePoints);
  gMap.fitBounds(bounds, padding);
}

function fitMapToRoute(route, padding = 34) {
  const routePoints = Array.isArray(route?.render_path) && route.render_path.length
    ? route.render_path
    : Array.isArray(route?.path_coordinates)
    ? route.path_coordinates
    : [];

  if (!routePoints.length) return false;

  const bounds = buildScopeBounds(routePoints);
  gMap.fitBounds(bounds, padding);

  google.maps.event.addListenerOnce(gMap, 'idle', () => {
    const currentZoom = gMap.getZoom();
    if (!Number.isFinite(currentZoom)) return;

    const ne = bounds.getNorthEast();
    const sw = bounds.getSouthWest();
    const maxSpan = Math.max(
      Math.abs(ne.lat() - sw.lat()),
      Math.abs(ne.lng() - sw.lng())
    );

    let minZoom = null;
    if (maxSpan <= 0.012) minZoom = 15;
    if (maxSpan <= 0.007) minZoom = 16;
    if (maxSpan <= 0.0035) minZoom = 17;

    const targetZoom = minZoom == null ? currentZoom : Math.max(minZoom, currentZoom);

    if (currentZoom < targetZoom) {
      gMap.setZoom(targetZoom);
    }
  });

  return true;
}

function loadBarangayMapOnly(bgyName) {
  clearLayers();

  const nodes = getBarangayLocations(bgyName);

  document.getElementById('mapLegend').style.display = 'none';
  syncLegendVisibility();
  document.getElementById('mapInfoBadge').style.display = 'none';

  if (!nodes.length) return;

  const scopePoints = drawBarangayScope(bgyName);
  if (scopePoints.length) {
    fitMapToScope(scopePoints, 70);
    return;
  }

  fitMapToLocations(nodes, 70);
}

function drawNode(n, start, end) {
  const col = nodeColor(n.haz, n.name, start, end);
  const special = n.name === start || n.name === end;

  const marker = new google.maps.Marker({
    position: { lat: n.lat, lng: n.lng },
    map: gMap,
    title: n.name,
    zIndex: 10,
    icon: {
      path: google.maps.SymbolPath.CIRCLE,
      scale: special ? 13 : 10,
      fillColor: col,
      fillOpacity: 0.95,
      strokeColor: '#ffffff',
      strokeWeight: 2.5,
    },
    label: {
      text: shortNodeLabel(n.name),
      color: '#ffffff',
      fontSize: '10px',
      fontFamily: 'DM Mono, monospace',
      fontWeight: 'bold'
    }
  });

  const hazardText = n.haz == null ? 'Unavailable' : `${n.haz} / 5`;
  const floodClassText = describeNodeFloodClass(n);
  const hazardSourceText = describeHazardSource(n);

  const iw = new google.maps.InfoWindow({
    content: infoPopup(n.name, [
      ['Role', n.name === start ? 'Start point' : n.name === end ? 'End point' : 'Node'],
      ['Node Flood Hazard', hazardText, col],
      ['Flood Class', floodClassText],
      ['Hazard Source', hazardSourceText],
      ['Barangay', n.barangay || selectedBarangay || 'N/A'],
    ])
  });

  marker.addListener('click', () => {
    if (activeInfoWindow) activeInfoWindow.close();
    iw.open(gMap, marker);
    activeInfoWindow = iw;
  });

  mapLayers.nodes.push(marker);
}

function makeNodeBadgeIcon(text) {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="184" height="56" viewBox="0 0 184 56">
      <defs>
        <filter id="bubbleShadow" x="-20%" y="-20%" width="140%" height="160%">
          <feDropShadow dx="0" dy="4" stdDeviation="6" flood-color="rgba(15,23,42,0.20)"/>
        </filter>
      </defs>
      <g filter="url(#bubbleShadow)">
        <rect x="8" y="6" rx="15" ry="15" width="168" height="36" fill="#ffffff" stroke="#d7deea" stroke-width="1.5"/>
        <path d="M85 42 L99 42 L92 51 Z" fill="#ffffff" stroke="#d7deea" stroke-width="1.5" stroke-linejoin="round"/>
      </g>
      <text x="92" y="28" text-anchor="middle" font-family="Nunito, Arial, sans-serif" font-size="12" font-weight="700" fill="#1f2937">${text}</text>
    </svg>
  `;

  return {
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
    scaledSize: new google.maps.Size(184, 56),
    anchor: new google.maps.Point(92, 51),
  };
}

function drawSelectedPinsOnly(start, end, options = {}) {
  const { showStartBadge = false } = options;
  mapLayers.nodes.forEach(m => m.setMap(null));
  mapLayers.nodes = [];

  if (!selectedBarangay) return;

  const nodes = getBarangayLocations(selectedBarangay);

  nodes.forEach(n => {
    if (n.name !== start && n.name !== end) return;

    const col = nodeColor(n.haz, n.name, start, end);
    const hazardText = n.haz == null ? 'Unavailable' : `${n.haz} / 5`;
    const floodClassText = describeNodeFloodClass(n);
    const hazardSourceText = describeHazardSource(n);

    const marker = new google.maps.Marker({
      position: { lat: n.lat, lng: n.lng },
      map: gMap,
      title: n.name,
      zIndex: 20,
      icon: {
        path: google.maps.SymbolPath.CIRCLE,
        scale: 11,
        fillColor: col,
        fillOpacity: 0.95,
        strokeColor: '#ffffff',
        strokeWeight: 2,
      },
      label: {
        text: n.name === start ? 'S' : 'E',
        color: '#ffffff',
        fontSize: '10px',
        fontFamily: 'DM Mono, monospace',
        fontWeight: 'bold'
      }
    });

    const iw = new google.maps.InfoWindow({
      content: infoPopup(n.name, [
        ['Role', n.name === start ? 'Start point' : 'End point'],
        ['Node Flood Hazard', hazardText, col],
        ['Flood Class', floodClassText],
        ['Hazard Source', hazardSourceText],
        ['Barangay', n.barangay || selectedBarangay || 'N/A'],
      ])
    });

    marker.addListener('click', () => {
      if (activeInfoWindow) activeInfoWindow.close();
      iw.open(gMap, marker);
      activeInfoWindow = iw;
    });

    mapLayers.nodes.push(marker);

    if (showStartBadge && n.name === start) {
      const badgeMarker = new google.maps.Marker({
        position: { lat: n.lat, lng: n.lng },
        map: gMap,
        clickable: false,
        zIndex: 24,
        icon: makeNodeBadgeIcon('You are here'),
      });

      mapLayers.nodes.push(badgeMarker);
    }

  });
}

function redrawNodes(start, end) {
  if (!selectedBarangay) return;

  mapLayers.nodes.forEach(m => m.setMap(null));
  mapLayers.nodes = [];

  getBarangayLocations(selectedBarangay).forEach(n => drawNode(n, start, end));
}

function selectBarangay(name) {
  const nodes = getBarangayLocations(name);
  workflowFocusSection = null;

  if (!nodes.length) {
    document.getElementById('infoBox').innerHTML =
      `<strong>Brgy. ${name}</strong> has no available nodes in the current database.`;
    updateMapContextBadge();
    return;
  }

  if (selectedBarangay === name) {
    clearBarangaySelections({ keepResults: false, keepInfoText: true });
    loadBarangayMapOnly(name);
    document.getElementById('emptyMap').style.display = 'none';
    advanceStep(selectedHazard ? 3 : 2);
    document.getElementById('infoBox').innerHTML = selectedHazard
      ? `<strong>Brgy. ${name}</strong> reset. Choose your <strong>start</strong> and <strong>end</strong> nodes again.`
      : `<strong>Brgy. ${name}</strong> loaded. Choose a <strong>disaster type</strong> to continue.`;
    updateMapContextBadge();
    return;
  }

  selectedBarangay = name;

  document.querySelectorAll('.bgy-card[data-barangay]').forEach(card => {
    const isSelected = card.dataset.barangay === name;
    card.classList.toggle('selected', isSelected);
  });

  clearBarangaySelections({ keepResults: false, keepInfoText: true });

  const locs = nodes.map(n => n.name);

  const startSel = document.getElementById('startSel');
  const endSel = document.getElementById('endSel');

  function populate(sel, exclude) {
    const kept = sel.value !== exclude ? sel.value : '';
    sel.innerHTML = '<option value="">— Select node —</option>';

    locs.forEach(l => {
      if (l === exclude) return;
      sel.innerHTML += `<option value="${l}" ${l === kept ? 'selected' : ''}>${l}</option>`;
    });

    sel.value = kept;
  }

  populate(startSel, null);
  populate(endSel, null);

  startSel.disabled = !selectedHazard;
  endSel.disabled = !selectedHazard;

  startSel.onchange = () => {
    populate(endSel, startSel.value);
    onNodeChange();
  };

  endSel.onchange = () => {
    populate(startSel, endSel.value);
    onNodeChange();
  };

  document.getElementById('emptyMap').style.display = 'none';

  loadBarangayMapOnly(name);
  advanceStep(selectedHazard ? 3 : 2);

  document.getElementById('infoBox').innerHTML =
    `<strong>Brgy. ${name}</strong> selected — map loaded. Choose your <strong>start</strong> and <strong>end</strong> nodes below.`;
  if (!selectedHazard) {
    document.getElementById('infoBox').innerHTML =
      `<strong>Brgy. ${name}</strong> selected — map loaded. Choose a <strong>disaster type</strong> first.`;
  } else {
    document.getElementById('infoBox').innerHTML =
      `<strong>Brgy. ${name}</strong> selected — map loaded. Choose your <strong>start</strong> and <strong>end</strong> nodes below.`;
  }

  updateMapContextBadge();
}

function onNodeChange() {
  const start = document.getElementById('startSel').value;
  const end = document.getElementById('endSel').value;
  const canRun = !!(selectedHazard && start && end && start !== end);
  workflowFocusSection = null;

  if (canRun) advanceStep(5);
  else if (!selectedHazard) advanceStep(2);
  else if (start || end) advanceStep(4);
  else advanceStep(3);

  document.getElementById('runBtn').disabled = !canRun;

  if (start || end) drawSelectedPinsOnly(start, end);

  if (canRun) {
    document.getElementById('infoBox').innerHTML =
      `Ready! <strong>${start}</strong> ? <strong>${end}</strong>. Click <strong>Run Simulation</strong>.`;
  } else if (!selectedHazard) {
    document.getElementById('infoBox').innerHTML =
      `Choose a <strong>disaster type</strong> to enable route testing.`;
  } else if (start && !end) {
    document.getElementById('infoBox').innerHTML =
      `Start selected. Now choose an <strong>end node</strong>.`;
  } else if (!start && end) {
    document.getElementById('infoBox').innerHTML =
      `End selected. Now choose a <strong>start node</strong>.`;
  } else {
    document.getElementById('infoBox').innerHTML =
      `Choose a <strong>start node</strong> from the dropdown.`;
  }

  updateMapContextBadge();
}

function selectHazard(name, el) {
  document.querySelectorAll('.hazard-card:not(.disabled)').forEach(c => c.classList.remove('selected', 'flood'));
  el.classList.add('selected', name.toLowerCase());
  selectedHazard = name;
  workflowFocusSection = null;

  if (!selectedBarangay) {
    document.getElementById('infoBox').innerHTML =
      `Disaster type <strong>${name}</strong> selected. Now choose a <strong>barangay</strong>.`;
    advanceStep(1);
    updateMapContextBadge();
    return;
  }

  populateBarangayNodeSelectors(selectedBarangay);
  setRouteSelectorsEnabled(true);
  advanceStep(3);
  onNodeChange();

  if (!document.getElementById('startSel').value && !document.getElementById('endSel').value) {
    document.getElementById('infoBox').innerHTML =
      `<strong>${name}</strong> selected for <strong>Brgy. ${selectedBarangay}</strong>. Choose your <strong>start</strong> and <strong>end</strong> nodes.`;
  }

  updateMapContextBadge();
}

function getCompletedSteps() {
  const start = document.getElementById('startSel')?.value || '';
  const end = document.getElementById('endSel')?.value || '';

  return {
    1: !!selectedBarangay,
    2: !!selectedHazard,
    3: !!start,
    4: !!end && start !== end,
    5: !!(selectedHazard && start && end && start !== end),
  };
}

function getMaxReachableStep() {
  if (!selectedBarangay) return 1;
  if (!selectedHazard) return 2;

  const start = document.getElementById('startSel')?.value || '';
  const end = document.getElementById('endSel')?.value || '';

  if (!start) return 3;
  if (!end || start === end) return 4;
  return 5;
}

function stepToSectionKey(step) {
  if (step <= 1) return 'barangay';
  if (step === 2) return 'hazard';
  if (step === 3 || step === 4) return 'route';
  return 'run';
}

function isWorkflowSectionAvailable(sectionKey) {
  if (sectionKey === 'barangay') return true;
  if (sectionKey === 'hazard') return !!selectedBarangay;
  if (sectionKey === 'route') return !!(selectedBarangay && selectedHazard);
  if (sectionKey === 'run') return !!(selectedBarangay && selectedHazard);
  return false;
}

function getActiveWorkflowSection(activeStep) {
  if (workflowFocusSection && isWorkflowSectionAvailable(workflowFocusSection)) {
    return workflowFocusSection;
  }

  return stepToSectionKey(activeStep);
}

function getWorkflowCard(sectionKey) {
  const map = {
    barangay: document.getElementById('cardBarangay'),
    hazard: document.getElementById('cardHazard'),
    route: document.getElementById('cardRoute'),
    run: document.getElementById('cardRun'),
  };

  return map[sectionKey] || null;
}

function getStepValue(step) {
  const start = document.getElementById('startSel')?.value || '';
  const end = document.getElementById('endSel')?.value || '';

  if (step === 1) return selectedBarangay || 'Choose a barangay';
  if (step === 2) return selectedHazard || (selectedBarangay ? 'Choose disaster type' : 'Waiting for barangay');
  if (step === 3) return start || (selectedHazard ? 'Choose start node' : 'Waiting for disaster type');
  if (step === 4) return end || (start ? 'Choose end node' : 'Waiting for start node');
  if (step === 5) return selectedHazard && start && end && start !== end ? 'Ready to simulate' : 'Complete selections first';
  return '';
}

function syncWorkflowStatus(activeStep, completed, maxReachableStep) {
  for (let i = 1; i <= 5; i++) {
    const stepEl = document.getElementById('sd' + i);
    if (!stepEl) continue;

    const badge = stepEl.querySelector('.workflow-step-badge');
    const value = document.getElementById('stepValue' + i);

    stepEl.className = 'workflow-step';
    stepEl.classList.toggle('done', !!completed[i] && i !== activeStep);
    stepEl.classList.toggle('active', i === activeStep);
    stepEl.classList.toggle('ready', i <= maxReachableStep && !completed[i] && i !== activeStep);
    stepEl.classList.toggle('locked', i > maxReachableStep);

    if (badge) {
      badge.textContent = completed[i] && i !== activeStep ? '✓' : String(i);
    }

    if (value) {
      value.textContent = getStepValue(i);
    }
  }
}

function syncWorkflowSummaries() {
  const start = document.getElementById('startSel')?.value || '';
  const end = document.getElementById('endSel')?.value || '';
  const canRun = !!(selectedHazard && start && end && start !== end);

  const summaryBarangay = document.getElementById('summaryBarangay');
  const summaryHazard = document.getElementById('summaryHazard');
  const summaryRoute = document.getElementById('summaryRoute');
  const summaryRun = document.getElementById('summaryRun');

  if (summaryBarangay) {
    summaryBarangay.textContent = selectedBarangay
      ? `${selectedBarangay} is selected as the active simulation scope.`
      : 'Select the scope you want to simulate.';
  }

  if (summaryHazard) {
    summaryHazard.textContent = selectedHazard
      ? `${selectedHazard} is the active hazard scenario.`
      : selectedBarangay
      ? 'Choose which hazard scenario to test.'
      : 'Choose a barangay first to unlock hazard testing.';
  }

  if (summaryRoute) {
    summaryRoute.textContent = start && end
      ? `${shortNodeLabel(start)} → ${shortNodeLabel(end)}`
      : start
      ? `Start node: ${shortNodeLabel(start)}. Choose an end node next.`
      : selectedHazard
      ? 'Pick the origin and destination nodes inside the selected barangay.'
      : 'Choose a barangay and disaster type before selecting nodes.';
  }

  if (summaryRun) {
    summaryRun.textContent = canRun
      ? 'Everything is ready. Launch the simulation when you are set.'
      : 'Review the setup, then launch the simulation.';
  }

  const changeBarangayBtn = document.getElementById('changeBarangayBtn');
  const changeHazardBtn = document.getElementById('changeHazardBtn');
  const changeRouteBtn = document.getElementById('changeRouteBtn');
  const resetRouteBtn = document.getElementById('resetRouteBtn');

  if (changeBarangayBtn) {
    changeBarangayBtn.textContent = selectedBarangay ? 'Change' : 'Select';
  }

  if (changeHazardBtn) {
    changeHazardBtn.textContent = selectedHazard ? 'Change' : 'Select';
    changeHazardBtn.disabled = !selectedBarangay;
  }

  if (changeRouteBtn) {
    changeRouteBtn.disabled = !(selectedBarangay && selectedHazard);
  }

  if (resetRouteBtn) {
    resetRouteBtn.disabled = !(start || end);
  }
}

function syncWorkflowCards(activeStep, completed) {
  const activeSection = getActiveWorkflowSection(activeStep);
  const sectionCompletion = {
    barangay: !!completed[1],
    hazard: !!completed[2],
    route: !!completed[4],
    run: !!completed[5],
  };

  ['barangay', 'hazard', 'route', 'run'].forEach(sectionKey => {
    const card = getWorkflowCard(sectionKey);
    if (!card) return;

    const isActive = sectionKey === activeSection;
    const isCompleted = sectionCompletion[sectionKey];
    const isEnabled = isWorkflowSectionAvailable(sectionKey);

    card.classList.toggle('active', isActive);
    card.classList.toggle('completed', isCompleted);
    card.classList.toggle('collapsed', !isActive);
    card.classList.toggle('disabled', !isEnabled);
  });
}

function focusWorkflowSection(sectionKey) {
  if (!isWorkflowSectionAvailable(sectionKey)) return;

  workflowFocusSection = sectionKey;
  advanceStep(getMaxReachableStep());

  const target = getWorkflowCard(sectionKey);
  if (target && typeof target.scrollIntoView === 'function') {
    target.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

function resetRouteSelection() {
  if (!selectedBarangay) return;

  workflowFocusSection = 'route';
  clearBarangaySelections({ keepResults: false, keepInfoText: true });

  if (selectedHazard) {
    populateBarangayNodeSelectors(selectedBarangay);
    setRouteSelectorsEnabled(true);
    document.getElementById('infoBox').innerHTML =
      `<strong>Brgy. ${selectedBarangay}</strong> kept. Choose your <strong>start</strong> and <strong>end</strong> nodes again.`;
    advanceStep(3);
  } else {
    document.getElementById('infoBox').innerHTML =
      `<strong>Brgy. ${selectedBarangay}</strong> kept. Choose a <strong>disaster type</strong> first.`;
    advanceStep(2);
  }

  document.getElementById('emptyMap').style.display = 'none';
  loadBarangayMapOnly(selectedBarangay);
}

function initStepNavigation() {}

function goToStep() {}

function advanceStep(n) {
  const completed = getCompletedSteps();
  const maxReachableStep = getMaxReachableStep();
  const activeStep = Math.max(1, Math.min(n, maxReachableStep));
  const displayStep = workflowFocusSection
    ? ({
        barangay: 1,
        hazard: 2,
        route: completed[3] ? 4 : 3,
        run: 5,
      }[workflowFocusSection] || activeStep)
    : activeStep;

  syncWorkflowStatus(displayStep, completed, maxReachableStep);
  syncWorkflowSummaries();
  syncWorkflowCards(activeStep, completed);
}

async function runSimulation() {
  const start = document.getElementById('startSel').value;
  const end = document.getElementById('endSel').value;
  workflowFocusSection = null;

  if (!start || !end || start === end) return;
  if (!isBackendLive) {
    alert('Backend is not connected.');
    return;
  }

  const loader = document.getElementById('loader');
  const loaderSub = document.getElementById('loaderSub');
  const loaderBar = document.getElementById('loaderBar');
  const runBtn = document.getElementById('runBtn');
  const statusTxt = document.getElementById('statusTxt');

  loader.classList.add('show');
  runBtn.disabled = true;
  statusTxt.textContent = 'Simulating…';

  const msgs = [
    'Loading the road graph…',
    'Evaluating route options…',
    'Applying lexicographic safety-first rule…',
    'Rendering evaluated routes…',
    'Classifying route evidence…'
  ];

  let mi = 0;
  const msgTimer = setInterval(() => {
    if (loaderSub) {
      loaderSub.textContent = msgs[Math.min(mi++, msgs.length - 1)];
    }
  }, 420);

  if (loaderBar) {
    loaderBar.style.animation = 'none';
    void loaderBar.offsetWidth;
    loaderBar.style.animation = 'load 2.5s ease-in-out forwards';
  }

  try {
    const res = await fetch(BACKEND + '/simulate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ start, end, hazard: selectedHazard })
    });

    const result = await res.json();

    if (!res.ok || result.error === true) {
      throw new Error(result.message || result.error || 'Simulation failed');
    }

    const routes = decorateRoutesForDisplay(
      normalizeRoutes(result.routes || [])
    );
    result.routes = routes;
    simData = result;

    await renderRoutesOnRoads({
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
    });

    showResultsPanel(result);
    selectedRouteFocus = null;
    clearSelectedRouteRow();
    window.clearRouteRowHighlight();
    applyRouteFocusState(null);
    document.getElementById('resetBtn').classList.add('show');
    updateMapContextBadge();

    statusTxt.textContent = 'Simulation Complete';
  } catch (err) {
    console.error(err);
    statusTxt.textContent = 'Error';
    alert('Simulation failed: ' + err.message);
  } finally {
    clearInterval(msgTimer);
    loader.classList.remove('show');
    runBtn.disabled = false;
  }
}

function showResultsPanel(result) {
  syncResultsVisibility(true);
  document.getElementById('resultsPanel').classList.add('fade-in');

  const routes = result.routes || [];
  const safe = routes.filter(r => r.category !== 'eliminated');
  const elim = routes.filter(r => r.category === 'eliminated');
  const best = routes.find(r => r.category === 'best');

  document.getElementById('tab-safe').innerHTML = safe.length
    ? buildTable(safe)
    : `<div class="tab-section-empty">No safe routes found for this simulation.</div>`;
  document.getElementById('tab-elim').innerHTML = elim.length
    ? buildTable(elim)
    : `<div class="tab-section-empty">No eliminated routes for this run.</div>`;

  document.getElementById('tab-summary').innerHTML = `
    <div class="results-stats-grid">
      ${statBox('Displayed', routes.length, 'var(--ink-strong)')}
      ${statBox('Safe Routes', safe.length, 'var(--green)')}
      ${statBox('Eliminated', elim.length, 'var(--red)')}
      ${statBox('Best Dist.', best ? best.display_distance : 'No safe route', best ? 'var(--accent)' : 'var(--red)')}
    </div>
    <div class="summary-callout">
    </div>
    <div style="margin-top:10px;font-family:'DM Mono',monospace;font-size:.62rem;color:var(--muted);line-height:1.6;">
      Algorithm: ACO + supplemental route-cost search &nbsp;|&nbsp; Rule: Safety-first ranking &nbsp;|&nbsp; Disaster: ${result.hazard_type || selectedHazard}
    </div>`;

  document.getElementById('resultsSummaryTxt').textContent = routes.length
    ? `Showing ${routes.length} routes · ${elim.length} eliminated`
    : 'No route results to display';

  setActiveTab('safe');
}

function getDefaultRouteVisual(group) {
  if (group?.category === 'best') {
    return {
      mainWeight: 5,
      mainOpacity: 0.95,
      outlineWeight: 9,
      outlineOpacity: 0.92,
      glowOpacities: [0.06, 0.10],
      zIndex: 8,
    };
  }

  if (group?.category === 'available') {
    return {
      mainWeight: 4,
      mainOpacity: 0.85,
      outlineWeight: 8,
      outlineOpacity: 0.88,
      glowOpacities: [0.04],
      zIndex: 5,
    };
  }

  return {
    mainWeight: 3,
    mainOpacity: 0.65,
    outlineWeight: 7,
    outlineOpacity: 0.82,
    glowOpacities: [],
    zIndex: 4,
  };
}

function getFocusedRouteVisual(group) {
  const base = getDefaultRouteVisual(group);
  return {
    ...base,
    mainWeight: base.mainWeight,
    mainOpacity: 0,
    outlineWeight: base.outlineWeight + 2,
    outlineOpacity: 0,
    glowOpacities: base.glowOpacities.map(() => 0),
    zIndex: 12,
  };
}

function getDimmedRouteVisual(group) {
  const base = getDefaultRouteVisual(group);
  return {
    ...base,
    mainWeight: Math.max(2, base.mainWeight - 1),
    mainOpacity: group?.category === 'eliminated' ? 0.08 : 0.12,
    outlineOpacity: 0,
    glowOpacities: base.glowOpacities.map(() => 0),
    zIndex: 2,
  };
}

function getRoutePreviewPath(group) {
  if (!group?.route) return [];

  const renderPath = Array.isArray(group.route.render_path) ? group.route.render_path : [];
  if (renderPath.length > 1) return renderPath;

  const coords = Array.isArray(group.route.path_coordinates) ? group.route.path_coordinates : [];
  if (coords.length > 1) return coords;

  return [];
}

function getRoutePreviewColor(group) {
  if (group?.category === 'best') return '#22c55e';
  if (group?.category === 'available') return '#f59e0b';
  if (group?.category === 'eliminated') return '#ef4444';
  return '#3b82f6';
}

function createRoutePreview(group) {
  if (!gMap || !group) return;

  const path = getRoutePreviewPath(group);
  if (path.length < 2) return;

  clearRoutePreview(group);
  const previewColor = getRoutePreviewColor(group);

  const haloDotSymbol = {
    path: google.maps.SymbolPath.CIRCLE,
    scale: 7.6,
    fillColor: '#ffffff',
    fillOpacity: 0.98,
    strokeColor: '#ffffff',
    strokeWeight: 2.8,
  };

  const dotSymbol = {
    path: google.maps.SymbolPath.CIRCLE,
    scale: 5.8,
    fillColor: previewColor,
    fillOpacity: 1,
    strokeColor: '#0f172a',
    strokeWeight: 1.8,
  };

  const haloArrowSymbol = {
    path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
    scale: 7.8,
    fillColor: '#ffffff',
    fillOpacity: 0.98,
    strokeColor: '#ffffff',
    strokeWeight: 3,
  };

  const arrowSymbol = {
    path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
    scale: 6.2,
    fillColor: previewColor,
    fillOpacity: 1,
    strokeColor: '#0f172a',
    strokeWeight: 1.8,
  };

  group.previewDotsHaloLayer = new google.maps.Polyline({
    path,
    geodesic: false,
    strokeOpacity: 0,
    clickable: false,
    icons: [{
      icon: haloDotSymbol,
      offset: '0px',
      repeat: '24px',
    }],
    map: gMap,
    zIndex: 18,
  });

  group.previewDotsLayer = new google.maps.Polyline({
    path,
    geodesic: false,
    strokeOpacity: 0,
    clickable: false,
    icons: [{
      icon: dotSymbol,
      offset: '0px',
      repeat: '24px',
    }],
    map: gMap,
    zIndex: 19,
  });

  group.previewArrowHaloLayer = new google.maps.Polyline({
    path,
    geodesic: false,
    strokeOpacity: 0,
    clickable: false,
    icons: [{
      icon: haloArrowSymbol,
      offset: '0%',
    }],
    map: gMap,
    zIndex: 20,
    });

  group.previewArrowLayer = new google.maps.Polyline({
    path,
    geodesic: false,
    strokeOpacity: 0,
    clickable: false,
      icons: [{
        icon: arrowSymbol,
        offset: '0%',
      }],
      map: gMap,
      zIndex: 21,
    });

  let dotOffset = 0;
  let arrowOffset = 0;
  group.previewTimer = window.setInterval(() => {
    if (!group.previewDotsHaloLayer || !group.previewDotsLayer || !group.previewArrowHaloLayer || !group.previewArrowLayer) return;

    dotOffset = (dotOffset + 1) % 24;
    arrowOffset = (arrowOffset + 1.35) % 100;

    group.previewDotsHaloLayer.set('icons', [{
      icon: haloDotSymbol,
      offset: `${dotOffset}px`,
      repeat: '24px',
    }]);

    group.previewDotsLayer.set('icons', [{
      icon: dotSymbol,
      offset: `${dotOffset}px`,
      repeat: '24px',
    }]);

    group.previewArrowHaloLayer.set('icons', [{
      icon: haloArrowSymbol,
      offset: `${arrowOffset}%`,
    }]);

    group.previewArrowLayer.set('icons', [{
      icon: arrowSymbol,
      offset: `${arrowOffset}%`,
    }]);
  }, 100);
}

function syncRoutePreview(group, enabled) {
  if (!group) return;

  if (!enabled) {
    clearRoutePreview(group);
    return;
  }

  createRoutePreview(group);
}

function applyRouteGroupVisual(group, visual) {
  if (!group) return;

  if (group.outlineLayer) {
    group.outlineLayer.setVisible((visual.outlineOpacity ?? 0) > 0.001);
    group.outlineLayer.setOptions({
      strokeOpacity: visual.outlineOpacity,
      strokeWeight: visual.outlineWeight,
      zIndex: Math.max(1, visual.zIndex - 1),
    });
  }

  if (group.mainLayer) {
    group.mainLayer.setVisible((visual.mainOpacity ?? 0) > 0.001);
    group.mainLayer.setOptions({
      strokeOpacity: visual.mainOpacity,
      strokeWeight: visual.mainWeight,
      zIndex: visual.zIndex,
    });
  }

  (group.glowLayers || []).forEach((layer, index) => {
    const glowOpacity = visual.glowOpacities[index] ?? 0;
    layer.setVisible(glowOpacity > 0.001);
    layer.setOptions({
      strokeOpacity: glowOpacity,
      zIndex: Math.max(1, visual.zIndex - 2 - index),
    });
  });
}

function applyRouteFocusState(routeNo) {
  const groups = Array.isArray(mapLayers.routeGroups) ? mapLayers.routeGroups : [];
  const hasFocus = routeNo != null;

  groups.forEach(group => {
    const visual = !hasFocus
      ? getDefaultRouteVisual(group)
      : group.routeNo === routeNo
      ? getFocusedRouteVisual(group)
        : getDimmedRouteVisual(group);

      applyRouteGroupVisual(group, visual);
      syncRoutePreview(group, hasFocus && group.routeNo === routeNo);
    });
}

function clearSelectedRouteRow() {
  document.querySelectorAll('.route-row.route-row-selected').forEach(row => {
    row.classList.remove('route-row-selected');
  });
}

function setSelectedRouteRow(routeNo, category, switchTab = false) {
  clearSelectedRouteRow();

  if (routeNo == null) return;

  if (switchTab) {
    setActiveTab(category === 'eliminated' ? 'elim' : 'safe');
  }

  const row = document.querySelector(`.route-row[data-route-no="${routeNo}"]`);
  if (!row) return;

  row.classList.add('route-row-selected');
  row.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

function handleRouteRowKey(event, routeNo, category) {
  if (event.key !== 'Enter' && event.key !== ' ') {
    return;
  }

  event.preventDefault();
  window.toggleRouteFocus(routeNo, category, true);
}

function statBox(label, value, color) {
  return `<div class="results-stat-box">
    <div class="results-stat-value" style="color:${color};">${escapeHtml(value)}</div>
    <div class="results-stat-label">${escapeHtml(label)}</div>
  </div>`;
}

function buildTable(routes) {
  if (!routes.length) {
    return `<div style="font-family:'DM Mono',monospace;font-size:.7rem;color:var(--muted);padding:10px;">No routes in this category.</div>`;
  }

  const rows = routes.map((r, i) => {
    const pips = [1, 2, 3, 4, 5]
      .map(p => `<div class="hlevel-pip ${p <= r.max_hazard ? 'on-' + p : ''}"></div>`)
      .join('');

    const rowTitle = `${r.display_route_summary}. ${r.display_reason}`;

    return `<tr class="route-row" tabindex="0" role="button" aria-label="${escapeHtml(rowTitle)}" data-route-no="${r.display_route_no ?? i + 1}" data-route-category="${r.category || ''}" onclick="toggleRouteFocus(${r.display_route_no ?? i + 1}, '${r.category || ''}', true)" onkeydown="handleRouteRowKey(event, ${r.display_route_no ?? i + 1}, '${r.category || ''}')">
      <td>${escapeHtml(r.display_route_no ?? i + 1)}</td>
      <td>
        <div class="table-status-stack">
          <span class="badge badge-${r.category}">${escapeHtml(r.status || r.category)}</span>
        </div>
      </td>
      <td>
        <div class="metric-strong">${escapeHtml(r.display_distance)}</div>
        <div class="metric-sub">Unsafe ${escapeHtml(r.display_unsafe_distance)}</div>
      </td>
      <td>
        <div class="hlevel">${pips}</div>
        <div class="metric-sub">Max ${escapeHtml(r.max_hazard)}/5 · ${escapeHtml(r.display_unsafe_segment_count)} unsafe segs</div>
      </td>
      <td>
        <div class="path-txt route-summary" title="${escapeHtml(r.display_route_summary)}">${escapeHtml(r.display_route_summary)}</div>
        <div class="route-reason-text">${escapeHtml(r.display_reason)}</div>
        <div class="route-evidence-row">
          <span class="evidence-chip">Segments ${escapeHtml(r.display_segment_count)}</span>
          <span class="evidence-chip">Flood ${escapeHtml(r.display_flood_classes)}</span>
          <span class="evidence-chip">Breakdown ${escapeHtml(r.display_hazard_breakdown)}</span>
        </div>
        <div class="path-txt path-street" title="${escapeHtml(r.display_street_preview)}">${escapeHtml(r.display_street_preview)}</div>
      </td>
    </tr>`;
  }).join('');

  return `<div class="results-table-wrap"><table class="data-table">
    <thead><tr><th>#</th><th>Status</th><th>Distance</th><th>Risk</th><th>Details</th></tr></thead>
    <tbody>${rows}</tbody>
  </table></div>`;
}

function switchTab(name, el) {
  document.querySelectorAll('.rtab').forEach(t => {
    t.classList.remove('active');
    t.setAttribute('aria-selected', 'false');
  });
  document.querySelectorAll('.rtab-content').forEach(c => c.classList.remove('active'));
  el.classList.add('active');
  el.setAttribute('aria-selected', 'true');
  document.getElementById('tab-' + name).classList.add('active');
}

function downloadCSV() {
  if (!simData) return;

  const rows = [[
    'Route',
    'Category',
    'Status',
    'Distance',
    'Unsafe Distance',
    'Max Hazard',
    'Unsafe Segments',
    'Segments',
    'Flood Classes',
    'Hazard Breakdown',
    'Route Summary',
    'Reason',
    'Streets',
  ]];
  (simData.routes || []).forEach((r, i) => {
    rows.push([
      r.display_route_no ?? i + 1,
      r.category || '',
      r.status || '',
      r.display_distance || '',
      r.display_unsafe_distance || '',
      r.max_hazard ?? '',
      r.display_unsafe_segment_count ?? '',
      r.display_segment_count ?? '',
      r.display_flood_classes || '',
      r.display_hazard_breakdown || '',
      r.display_route_summary || '',
      r.display_reason || '',
      Array.isArray(r.street_path) ? r.street_path.join(' -> ') : ''
    ]);
  });

  const csv = rows.map(r => r.map(v => `"${v}"`).join(',')).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  a.download = `safe_routes_${selectedBarangay || 'barangay'}_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
}

function resetAll() {
  simData = null;
  selectedBarangay = null;
  selectedHazard = null;
  selectedRouteFocus = null;
  workflowFocusSection = null;
  clearLayers();

  ['startSel', 'endSel'].forEach(id => {
    document.getElementById(id).innerHTML = '<option value="">— Select barangay first —</option>';
    document.getElementById(id).disabled = true;
    document.getElementById(id).value = '';
  });

  document.getElementById('runBtn').disabled = true;
  document.getElementById('resetBtn').classList.remove('show');
  syncResultsVisibility(false);
  document.getElementById('mapInfoBadge').style.display = 'none';
  document.getElementById('mapLegend').style.display = 'none';
  syncLegendVisibility();
  document.getElementById('emptyMap').style.display = 'flex';
  document.getElementById('statusTxt').textContent = 'Ready';

  document.getElementById('infoBox').innerHTML =
    `Select a <strong>barangay</strong> and then choose a <strong>disaster type</strong> to begin. The ACO algorithm will find the <strong>safest route</strong> using the <strong>lexicographic safety-first rule</strong>.`;

  document.querySelectorAll('.bgy-card').forEach(c => c.classList.remove('selected'));
  document.querySelectorAll('.hazard-card:not(.disabled)').forEach(c => c.classList.remove('selected', 'flood'));
  advanceStep(1);

  if (gMap) {
    gMap.panTo({ lat: 14.5590, lng: 121.0955 });
    gMap.setZoom(15);
  }

  updateMapContextBadge();
}

async function checkBackend() {
  try {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), 2000);
    const r = await fetch(BACKEND + '/', { signal: c.signal });
    clearTimeout(t);

    if (r.ok) {
      isBackendLive = true;
      document.getElementById('statusTxt').textContent = 'Backend Connected';
    }
  } catch (err) {
    isBackendLive = false;
  }
}

function setActiveTab(tabName) {
  document.querySelectorAll('.rtab').forEach(t => {
    t.classList.remove('active');
    t.setAttribute('aria-selected', 'false');
  });
  document.querySelectorAll('.rtab-content').forEach(c => c.classList.remove('active'));

  const tabMap = {
    safe: document.querySelector('.rtab[onclick*="safe"]'),
    elim: document.querySelector('.rtab[onclick*="elim"]'),
    summary: document.querySelector('.rtab[onclick*="summary"]'),
  };

  const tab = tabMap[tabName];
  if (tab) {
    tab.classList.add('active');
    tab.setAttribute('aria-selected', 'true');
  }

  const content = document.getElementById('tab-' + tabName);
  if (content) content.classList.add('active');
}

window.clearRouteRowHighlight = function clearRouteRowHighlight() {
  document.querySelectorAll('.route-row.route-row-active').forEach(row => row.classList.remove('route-row-active'));
};

window.highlightRouteRow = function highlightRouteRow(routeNo, category, switchTab = false) {
  if (routeNo == null) return;

  if (resultsCollapsed) {
    showResultsPanelDrawer();
  }

  if (switchTab) {
    setActiveTab(category === 'eliminated' ? 'elim' : 'safe');
  }

  window.clearRouteRowHighlight();

  const row = document.querySelector(`.route-row[data-route-no="${routeNo}"]`);
  if (!row) return;

  row.classList.add('route-row-active');
  row.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
};

window.clearSelectedRouteRow = clearSelectedRouteRow;
window.focusWorkflowSection = focusWorkflowSection;
window.resetRouteSelection = resetRouteSelection;
window.toggleLegendVisibility = toggleLegendVisibility;
window.syncLegendVisibility = syncLegendVisibility;

window.toggleRouteFocus = function toggleRouteFocus(routeNo, category, switchTab = false) {
  const shouldClear = selectedRouteFocus && selectedRouteFocus.routeNo === routeNo;

  if (shouldClear) {
    selectedRouteFocus = null;
    clearSelectedRouteRow();
    applyRouteFocusState(null);
    window.clearRouteRowHighlight();
    return;
  }

  selectedRouteFocus = { routeNo, category };
  setSelectedRouteRow(routeNo, category, switchTab);
  applyRouteFocusState(routeNo);
  window.highlightRouteRow(routeNo, category, switchTab);
};

window.focusRouteSelection = function focusRouteSelection(routeNo, category, switchTab = false) {
  if (routeNo == null) return;
  selectedRouteFocus = { routeNo, category };
  setSelectedRouteRow(routeNo, category, switchTab);
  applyRouteFocusState(routeNo);
};

window.clearRouteAnimation = clearRouteAnimation;
window.goToStep = goToStep;
window.initMap = initMap;
window.handleRouteRowKey = handleRouteRowKey;

initStepNavigation();
advanceStep(1);
