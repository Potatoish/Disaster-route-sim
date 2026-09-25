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
      strokeColor: '#7c2d12',
      fillColor: '#c2410c',
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
      state.activeInfoWindow.remove();
      state.activeInfoWindow = null;
    }
  }

  function clearMapObjects(objects) {
    objects.forEach(object => object.remove());
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

    return L.icon({
      iconUrl: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
      iconSize: [58, 70],
      iconAnchor: [29, 63],
    });
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
      const marker = L.marker({ lat: Number(site.lat), lng: Number(site.lng) }, {
        title: site.name,
        zIndexOffset: isHighlighted ? 3100 : 3000,
        icon: buildEvacMarkerIcon(isHighlighted),
      }).addTo(map);

      marker.on('click', () => {
        clearInfoWindow();
        state.activeInfoWindow = L.popup()
          .setLatLng(marker.getLatLng())
          .setContent(buildEvacInfoContent(site, isHighlighted))
          .openOn(map);
      });

      state.evacuationMarkers.push(marker);
    });
  }


  function getLayerEmphasis(layerKey, activeView, isLine = false) {
    if (activeView === 'overall') {
      // Both layers overlap here, so each fill stays lighter than a single
      // active layer to keep the combined tint from going muddy.
      return isLine
        ? { fillOpacity: 0, strokeOpacity: 0.65, strokeWeight: 2.2 }
        : { fillOpacity: 0.2, strokeOpacity: 0.55, strokeWeight: 1.6 };
    }

    const isActive = layerKey === activeView;
    return {
      fillOpacity: isActive ? 0.3 : 0.06,
      strokeOpacity: isActive ? 0.75 : 0.15,
      strokeWeight: isActive ? 2 : 1.2,
    };
  }

  function createPolygon(map, path, style, emphasis) {
    return L.polygon(path, {
      color: style.strokeColor,
      opacity: emphasis.strokeOpacity,
      weight: emphasis.strokeWeight,
      fillColor: style.fillColor,
      fillOpacity: emphasis.fillOpacity,
      interactive: false,
      pane: ensureHazardPane(map),
    }).addTo(map);
  }

  function createPolyline(map, path, style, emphasis) {
    const layer = L.polyline(path, {
      color: style.strokeColor,
      opacity: emphasis.strokeOpacity,
      weight: emphasis.strokeWeight,
      interactive: false,
      pane: ensureHazardPane(map),
    }).addTo(map);
    // Leaflet paths stack by insertion order, not zIndex; flag lines so
    // renderHazardLayers can lift them above any fills added after them.
    layer._isHazardLine = true;
    return layer;
  }

  function normalizeCoordinate(point) {
    return {
      lat: Number(point[1]),
      lng: Number(point[0]),
    };
  }

  function renderFeature(map, layerKey, feature, activeView) {
    const style = LAYER_STYLES[layerKey];
    const geometry = feature?.geometry || {};
    const type = geometry.type;
    const coordinates = geometry.coordinates || [];
    const isLine = type === 'LineString' || type === 'MultiLineString';
    const emphasis = getLayerEmphasis(layerKey, activeView, isLine);

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

    if (!map || !hazardLayers) {
      return;
    }

    // "Overall" has no geometry of its own, so render both real layers together.
    const layerKeys = activeView === 'overall'
      ? Object.keys(LAYER_STYLES)
      : (LAYER_STYLES[activeView] ? [activeView] : []);

    layerKeys.forEach(layerKey => {
      const collection = hazardLayers[layerKey];
      const features = Array.isArray(collection?.features) ? collection.features : [];
      features.forEach(feature => {
        const overlays = renderFeature(map, layerKey, feature, activeView);
        state.hazardOverlays[layerKey].push(...overlays);
      });
    });

    Object.values(state.hazardOverlays).flat().forEach(layer => {
      if (layer._isHazardLine) layer.bringToFront();
    });
  }

  function syncLegend(activeView = 'overall', options = {}) {
    const {
      showRouteKeys = true,
      showHazardLayers = true,
      showHazardSection = true,
    } = options;
    const body = document.getElementById('mapLegendBody');
    if (!body) return;

    const routeLegend = showRouteKeys
      ? `
        <div class="legend-row"><div class="legend-line" style="background:#22c55e;height:4px;"></div><span style="font-size:.78rem;">Best Route</span></div>
        <div class="legend-row"><div class="legend-line" style="background:#f59e0b;"></div><span style="font-size:.78rem;">Available Route</span></div>
        <div class="legend-row"><div class="legend-line" style="background:#ef4444;opacity:.8;"></div><span style="font-size:.78rem;">Eliminated Route</span></div>
      `
      : '';
    const liquefactionRow = `<div class="legend-row"><div class="legend-line" style="background:rgba(245,158,11,1);height:4px;"></div><span style="font-size:.78rem;">Liquefaction Layer</span></div>`;
    const groundShakingRow = `<div class="legend-row"><div class="legend-line" style="background:rgba(194,65,12,1);height:4px;"></div><span style="font-size:.78rem;">Ground Shaking Layer</span></div>`;
    const hazardLegend = !showHazardSection
      ? ''
      : !showHazardLayers
        ? `<div style="margin-top:6px;font-family:'DM Mono',monospace;font-size:.76rem;color:var(--muted);line-height:1.5;">Select <strong>Liquefaction</strong> or <strong>Ground Shaking</strong> to view the hazard layer.</div>`
        : activeView === 'liquefaction'
          ? liquefactionRow
          : activeView === 'ground_shaking'
            ? groundShakingRow
            : liquefactionRow + groundShakingRow;

    body.innerHTML = `
      ${routeLegend}
      <div style="margin-top:${showRouteKeys ? '5px' : '0'};">
        <div class="legend-row"><div class="legend-dot-sm" style="background:#06b6d4;"></div><span style="font-size:.78rem;">Start Node</span></div>
        <div class="legend-row"><div class="legend-dot-sm" style="background:#f59e0b;"></div><span style="font-size:.78rem;">Evacuation Site</span></div>
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
