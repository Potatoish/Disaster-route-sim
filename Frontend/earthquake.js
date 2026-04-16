(function initEarthquakeTestUI() {
  const state = {
    evacuationSitesCache: new Map(),
    evacuationMarkers: [],
    hazardOverlays: {
      liquefaction: [],
      ground_shaking: [],
      fault_line: [],
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
    fault_line: {
      label: 'Fault Line',
      strokeColor: '#dc2626',
      fillColor: '#ef4444',
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
    const stroke = isHighlighted ? '#14532d' : '#7c2d12';
    const label = isHighlighted ? 'BEST' : 'EVAC';
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="104" height="48" viewBox="0 0 104 48">
        <path d="M52 4 L98 28 L78 28 L78 44 L26 44 L26 28 L6 28 Z" fill="${fill}" stroke="${stroke}" stroke-width="2"/>
        <text x="52" y="30" text-anchor="middle" font-family="DM Mono, monospace" font-size="12" font-weight="700" fill="#ffffff">${label}</text>
      </svg>
    `;

    return {
      url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
      scaledSize: new google.maps.Size(78, 36),
      anchor: new google.maps.Point(39, 32),
    };
  }

  function buildEvacInfoContent(site, isHighlighted) {
    return `
      <div class="popup-shell">
        <div class="popup-title">${escapeHtml(site.name)}</div>
        <div class="popup-row"><span>Role</span><span>${isHighlighted ? 'Best evacuation site' : 'Evacuation site'}</span></div>
        <div class="popup-row"><span>Address</span><span>${escapeHtml(site.address || 'Pinagbuhatan')}</span></div>
        <div class="popup-row"><span>Capacity</span><span>${escapeHtml(site.capacity_label || 'FOR TEST ONLY')}</span></div>
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
      `${getBackendBase()}/earthquake-test/evac-sites?barangay=${encodeURIComponent(barangay)}`
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
        strokeWeight: layerKey === 'fault_line' ? 3.2 : 1.8,
      };
    }

    const isActive = layerKey === activeView;
    return {
      fillOpacity: isActive ? 0.24 : 0.08,
      strokeOpacity: isActive ? 0.88 : 0.18,
      strokeWeight: layerKey === 'fault_line' ? (isActive ? 4.4 : 2.4) : (isActive ? 2.4 : 1.4),
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

    if (!map || !hazardLayers) {
      return;
    }

    Object.keys(LAYER_STYLES).forEach(layerKey => {
      const collection = hazardLayers[layerKey];
      const features = Array.isArray(collection?.features) ? collection.features : [];
      features.forEach(feature => {
        const overlays = renderFeature(map, layerKey, feature, activeView);
        state.hazardOverlays[layerKey].push(...overlays);
      });
    });
  }

  function syncLegend(activeView = 'overall', options = {}) {
    const {
      showRouteKeys = true,
      showHazardLayers = true,
    } = options;
    const body = document.getElementById('mapLegendBody');
    if (!body) return;

    const isOverall = activeView === 'overall';
    const routeLegend = showRouteKeys
      ? `
        <div class="legend-row"><div class="legend-line" style="background:var(--green);height:4px;"></div><span style="font-size:.63rem;">Best Route</span></div>
        <div class="legend-row"><div class="legend-line" style="background:var(--yellow);"></div><span style="font-size:.63rem;">Available Route</span></div>
        <div class="legend-row"><div class="legend-line" style="background:var(--red);opacity:.5;"></div><span style="font-size:.63rem;">Eliminated</span></div>
      `
      : '';
    const hazardLegend = showHazardLayers
      ? `
        <div class="legend-row"><div class="legend-line" style="background:rgba(245,158,11,${isOverall ? '0.7' : activeView === 'liquefaction' ? '1' : '0.35'});height:4px;"></div><span style="font-size:.63rem;">Liquefaction Layer</span></div>
        <div class="legend-row"><div class="legend-line" style="background:rgba(59,130,246,${isOverall ? '0.7' : activeView === 'ground_shaking' ? '1' : '0.35'});height:4px;"></div><span style="font-size:.63rem;">Ground Shaking Layer</span></div>
        <div class="legend-row"><div class="legend-line" style="background:rgba(239,68,68,${isOverall ? '0.7' : activeView === 'fault_line' ? '1' : '0.35'});height:4px;"></div><span style="font-size:.63rem;">Fault Line Layer</span></div>
      `
      : `<div style="margin-top:6px;font-family:'DM Mono',monospace;font-size:.58rem;color:var(--muted);line-height:1.5;">Hazard layers appear after the earthquake test run.</div>`;

    body.innerHTML = `
      ${routeLegend}
      <div style="margin-top:${showRouteKeys ? '5px' : '0'};">
        <div class="legend-row"><div class="legend-dot-sm" style="background:#a855f7;"></div><span style="font-size:.63rem;">Start Node</span></div>
        <div class="legend-row"><div class="legend-dot-sm" style="background:#f59e0b;"></div><span style="font-size:.63rem;">Evacuation Site</span></div>
        ${hazardLegend}
      </div>`;
  }

  window.earthquakeTestUI = {
    loadEvacuationSites,
    drawEvacuationSites,
    renderHazardLayers,
    syncLegend,
    reset,
  };
})();
