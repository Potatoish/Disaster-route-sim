(function initEarthquakeUI() {
  const state = {
    evacuationSitesCache: new Map(),
    evacuationMarkers: [],
    hazardOverlays: {
      liquefaction: [],
      ground_shaking: [],
    },
    activeInfoWindow: null,
  };

  const LAYER_STYLES = {
    liquefaction: {
      label: 'Liquefaction',
      strokeColor: '#b45309',
      fillColor: '#f59e0b',
    },
    ground_shaking: {
      label: 'Ground Shaking',
      strokeColor: '#1d4ed8',
      fillColor: '#3b82f6',
    },
  };

  function getBackendBase() {
    return window.BACKEND_BASE || 'http://127.0.0.1:5000';
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function clearInfoWindow() {
    if (state.activeInfoWindow) {
      state.activeInfoWindow.close();
      state.activeInfoWindow = null;
    }
  }

  function clearMapObjects(objects) {
    objects.forEach(object => object.setMap(null));
    objects.length = 0;
  }

  function reset(options = {}) {
    const { clearCache = false } = options;

    clearInfoWindow();
    clearMapObjects(state.evacuationMarkers);
    Object.values(state.hazardOverlays).forEach(overlays => clearMapObjects(overlays));

    if (clearCache) {
      state.evacuationSitesCache.clear();
    }
  }

  function buildEvacMarkerIcon(isHighlighted) {
    const fill = isHighlighted ? '#22c55e' : '#f59e0b';
    const stroke = isHighlighted ? '#14532d' : '#9a3412';
    const accent = isHighlighted ? '#166534' : '#b45309';
    const label = isHighlighted ? 'BEST' : 'EVAC';
    const halo = isHighlighted
      ? `<circle cx="46" cy="38" r="33" fill="rgba(34,197,94,0.18)" />`
      : '';
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="92" height="110" viewBox="0 0 92 110">
        <defs>
          <filter id="evacShadow" x="-20%" y="-20%" width="140%" height="160%">
            <feDropShadow dx="0" dy="6" stdDeviation="4" flood-color="rgba(15,23,42,0.26)"/>
          </filter>
        </defs>
        ${halo}
        <g filter="url(#evacShadow)">
          <path d="M46 8c-18.2 0-33 14.8-33 33 0 21.8 25.4 41.6 33 58 7.6-16.4 33-36.2 33-58 0-18.2-14.8-33-33-33z"
            fill="${fill}" stroke="${stroke}" stroke-width="3"/>
          <circle cx="46" cy="38" r="18" fill="#ffffff" opacity="0.98"/>
          <path d="M34 40l12-10 12 10" fill="none" stroke="${accent}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M38 40v11h16V40" fill="none" stroke="${accent}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M46 45v6" fill="none" stroke="${accent}" stroke-width="3.2" stroke-linecap="round"/>
          <rect x="18" y="63" width="56" height="18" rx="9" fill="#ffffff" opacity="0.98"/>
          <text x="46" y="75.5" text-anchor="middle" font-family="Plus Jakarta Sans, Nunito, sans-serif" font-size="11" font-weight="800" fill="${accent}">${label}</text>
        </g>
      </svg>
    `;

    return {
      url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
      scaledSize: new google.maps.Size(58, 70),
      anchor: new google.maps.Point(29, 62),
    };
  }

  function buildEvacInfoContent(site, isHighlighted) {
    return `
      <div class="popup-shell">
        <div class="popup-title">${escapeHtml(site.name)}</div>
        <div class="popup-row"><span>Role</span><span>${isHighlighted ? 'Target evacuation site' : 'Evacuation site'}</span></div>
        <div class="popup-row"><span>Address</span><span>${escapeHtml(site.address || 'Pasig City')}</span></div>
        <div class="popup-row"><span>Site Setup</span><span>${escapeHtml(site.site_setup || 'Open-area assembly point')}</span></div>
        <div class="popup-row"><span>Surroundings</span><span>${escapeHtml(site.surroundings || 'No tall buildings nearby')}</span></div>
      </div>`;
  }

  async function loadEvacuationSites(barangay) {
    if (!barangay) {
      throw new Error('Barangay is required to load evacuation sites.');
    }

    if (state.evacuationSitesCache.has(barangay)) {
      return state.evacuationSitesCache.get(barangay);
    }

    const response = await fetch(
      `${getBackendBase()}/earthquake/evac-sites?barangay=${encodeURIComponent(barangay)}`
    );
    const data = await response.json();

    if (!response.ok || data?.error) {
      throw new Error(data?.message || 'Failed to load evacuation sites.');
    }

    const sites = Array.isArray(data.evacuation_sites) ? data.evacuation_sites : [];
    state.evacuationSitesCache.set(barangay, sites);
    return sites;
  }

  function drawEvacuationSites({ map, sites, highlightedSiteId = null }) {
    clearInfoWindow();
    clearMapObjects(state.evacuationMarkers);

    if (!map || !Array.isArray(sites)) {
      return;
    }

    sites.forEach(site => {
      const isHighlighted = highlightedSiteId != null && site.id === highlightedSiteId;
      const marker = new google.maps.Marker({
        position: { lat: Number(site.lat), lng: Number(site.lng) },
        map,
        title: site.name,
        zIndex: isHighlighted ? 31 : 30,
        icon: buildEvacMarkerIcon(isHighlighted),
      });

      marker.addListener('click', () => {
        clearInfoWindow();
        state.activeInfoWindow = new google.maps.InfoWindow({
          content: buildEvacInfoContent(site, isHighlighted),
        });
        state.activeInfoWindow.open(map, marker);
      });

      state.evacuationMarkers.push(marker);
    });
  }

  function getLayerEmphasis(layerKey, activeView) {
    if (activeView === 'overall') {
      return {
        fillOpacity: 0.18,
        strokeOpacity: 0.45,
        strokeWeight: 1.8,
      };
    }

    const isActive = layerKey === activeView;
    return {
      fillOpacity: isActive ? 0.24 : 0.08,
      strokeOpacity: isActive ? 0.88 : 0.18,
      strokeWeight: isActive ? 2.4 : 1.4,
    };
  }

  function createPolygon(map, path, style, emphasis) {
    return new google.maps.Polygon({
      paths: path,
      map,
      strokeColor: style.strokeColor,
      strokeOpacity: emphasis.strokeOpacity,
      strokeWeight: emphasis.strokeWeight,
      fillColor: style.fillColor,
      fillOpacity: emphasis.fillOpacity,
      clickable: false,
      zIndex: 6,
    });
  }

  function createPolyline(map, path, style, emphasis) {
    return new google.maps.Polyline({
      path,
      map,
      geodesic: false,
      strokeColor: style.strokeColor,
      strokeOpacity: emphasis.strokeOpacity,
      strokeWeight: emphasis.strokeWeight,
      clickable: false,
      zIndex: 7,
    });
  }

  function normalizeCoordinate(point) {
    return {
      lat: Number(point[1]),
      lng: Number(point[0]),
    };
  }

  function renderFeature(map, layerKey, feature, activeView) {
    const style = LAYER_STYLES[layerKey];
    const emphasis = getLayerEmphasis(layerKey, activeView);
    const geometry = feature?.geometry || {};
    const type = geometry.type;
    const coordinates = geometry.coordinates || [];

    if (type === 'Polygon') {
      return [createPolygon(map, coordinates.map(ring => ring.map(normalizeCoordinate)), style, emphasis)];
    }

    if (type === 'MultiPolygon') {
      return coordinates.map(polygon =>
        createPolygon(map, polygon.map(ring => ring.map(normalizeCoordinate)), style, emphasis)
      );
    }

    if (type === 'LineString') {
      return [createPolyline(map, coordinates.map(normalizeCoordinate), style, emphasis)];
    }

    if (type === 'MultiLineString') {
      return coordinates.map(line =>
        createPolyline(map, line.map(normalizeCoordinate), style, emphasis)
      );
    }

    return [];
  }

  function renderHazardLayers({ map, hazardLayers, activeView = 'overall' }) {
    Object.values(state.hazardOverlays).forEach(overlays => clearMapObjects(overlays));

    if (!map || !hazardLayers || activeView === 'overall' || !LAYER_STYLES[activeView]) {
      return;
    }

    const collection = hazardLayers[activeView];
    const features = Array.isArray(collection?.features) ? collection.features : [];
    features.forEach(feature => {
      const overlays = renderFeature(map, activeView, feature, activeView);
      state.hazardOverlays[activeView].push(...overlays);
    });
  }

  function syncLegend(activeView = 'overall', options = {}) {
    const {
      showRouteKeys = true,
      showHazardLayers = true,
    } = options;
    const body = document.getElementById('mapLegendBody');
    if (!body) return;

    const routeLegend = showRouteKeys
      ? `
        <div class="legend-row"><div class="legend-line" style="background:var(--green);height:4px;"></div><span style="font-size:.63rem;">Best Route</span></div>
        <div class="legend-row"><div class="legend-line" style="background:var(--yellow);"></div><span style="font-size:.63rem;">Available Route</span></div>
        <div class="legend-row"><div class="legend-line" style="background:var(--red);opacity:.5;"></div><span style="font-size:.63rem;">Eliminated Route</span></div>
      `
      : '';
    const hazardLegend = showHazardLayers
      ? activeView === 'liquefaction'
        ? `<div class="legend-row"><div class="legend-line" style="background:rgba(245,158,11,1);height:4px;"></div><span style="font-size:.63rem;">Liquefaction Layer</span></div>`
        : `<div class="legend-row"><div class="legend-line" style="background:rgba(59,130,246,1);height:4px;"></div><span style="font-size:.63rem;">Ground Shaking Layer</span></div>`
      : `<div style="margin-top:6px;font-family:'DM Mono',monospace;font-size:.58rem;color:var(--muted);line-height:1.5;">Select <strong>Liquefaction</strong> or <strong>Ground Shaking</strong> to view the hazard layer.</div>`;

    body.innerHTML = `
      ${routeLegend}
      <div style="margin-top:${showRouteKeys ? '5px' : '0'};">
        <div class="legend-row"><div class="legend-dot-sm" style="background:#a855f7;"></div><span style="font-size:.63rem;">Start Node</span></div>
        <div class="legend-row"><div class="legend-dot-sm" style="background:#f59e0b;"></div><span style="font-size:.63rem;">Evacuation Site</span></div>
        ${hazardLegend}
      </div>`;
  }

  window.earthquakeUI = {
    loadEvacuationSites,
    drawEvacuationSites,
    renderHazardLayers,
    syncLegend,
    reset,
  };
})();
