(function initFloodHazardUI() {
  const state = {
    hazardCache: new Map(),
    dataLayer: null,
    highlightVar: null,
    evacuationSitesCache: new Map(),
    evacuationMarkers: [],
    evacuationDrawn: null,
    evacuationPopup: null,
  };

  // Blue, not the earthquake open areas' amber: amber and orange are the
  // Low/Medium flood fills these pins sit on after a run. The site a run
  // picks is the earthquake mode's green "CHOSEN" pin.
  const EVAC_MARKER_STYLES = {
    site: {
      fill: '#2563eb',
      stroke: '#1e3a8a',
      accent: '#1d4ed8',
      label: 'EVAC SITE',
      badgeWidth: 76,
      labelSize: 10,
    },
    chosen: {
      fill: '#22c55e',
      stroke: '#14532d',
      accent: '#166534',
      label: 'CHOSEN',
      badgeWidth: 56,
      labelSize: 11,
      halo: true,
    },
  };

  // Strong enough to read against the OSM basemap's own beige/tan fills;
  // route lines stay on top anyway (hazard pane + dark route casing in osm.js).
  const FLOOD_LAYER_STYLES = {
    1: {
      fillColor: '#facc15',
      strokeColor: '#ca8a04',
      fillOpacity: 0.32,
      strokeOpacity: 0.5,
      strokeWeight: 0.8,
    },
    2: {
      fillColor: '#f97316',
      strokeColor: '#ea580c',
      fillOpacity: 0.36,
      strokeOpacity: 0.55,
      strokeWeight: 0.9,
    },
    3: {
      fillColor: '#e11d48',
      strokeColor: '#be123c',
      fillOpacity: 0.42,
      strokeOpacity: 0.65,
      strokeWeight: 1,
    },
  };

  function getBackendBase() {
    return window.BACKEND_BASE || window.location.origin;
  }

  function styleForFeature(feature) {
    const floodVar = Number(feature?.properties?.flood_var);
    const style = FLOOD_LAYER_STYLES[floodVar] || FLOOD_LAYER_STYLES[1];
    const isDimmed = state.highlightVar && floodVar !== state.highlightVar;
    return {
      interactive: false,
      fillColor: style.fillColor,
      fillOpacity: isDimmed ? style.fillOpacity * 0.18 : style.fillOpacity,
      color: style.strokeColor,
      opacity: isDimmed ? style.strokeOpacity * 0.22 : style.strokeOpacity,
      weight: style.strokeWeight,
    };
  }

  function clearLayer() {
    if (state.dataLayer) {
      state.dataLayer.remove();
      state.dataLayer = null;
    }
  }

  async function loadHazardLayers(options = {}) {
    const {
      scope = 'city',
      barangay = '',
      vars = [],
    } = options;
    const varsKey = Array.isArray(vars) ? vars.join(',') : '';
    const cacheKey = `${scope}::${barangay || ''}::${varsKey}`;

    // The promise is what's cached, so a prefetch started during a run (see
    // runSimulation) and the draw after it share one download.
    if (state.hazardCache.has(cacheKey)) {
      return state.hazardCache.get(cacheKey);
    }

    const query = new URLSearchParams();
    query.set('scope', scope);
    if (barangay) query.set('barangay', barangay);
    if (varsKey) query.set('vars', varsKey);

    const request = (async () => {
      const response = await fetch(
        `${getBackendBase()}/flood-hazard-layers?${query.toString()}`
      );
      const data = await response.json();

      if (!response.ok || data?.error) {
        throw new Error(data?.message || 'Failed to load flood hazard layers.');
      }

      return data?.hazard_layers || { type: 'FeatureCollection', features: [] };
    })();
    state.hazardCache.set(cacheKey, request);
    // A failed download can be tried again next time.
    request.catch(() => state.hazardCache.delete(cacheKey));
    return request;
  }

  function renderHazardLayers({ map, hazardLayers, visibleVars = null, highlightVar = null }) {
    clearLayer();
    state.highlightVar = highlightVar ? Number(highlightVar) : null;

    if (!map || !hazardLayers) {
      return;
    }

    const filteredFeatures = Array.isArray(visibleVars) && visibleVars.length
      ? (hazardLayers.features || []).filter(feature =>
          visibleVars.includes(Number(feature?.properties?.flood_var))
        )
      : (hazardLayers.features || []);

    const sortedFeatures = [...filteredFeatures].sort(
      (a, b) => Number(a?.properties?.flood_var) - Number(b?.properties?.flood_var)
    );

    state.dataLayer = L.geoJSON(
      { ...hazardLayers, features: sortedFeatures },
      { style: styleForFeature, pane: ensureHazardPane(map) }
    ).addTo(map);
    fadeInHazardPane(map);
  }

  async function loadEvacuationSites(barangay) {
    if (!barangay) {
      throw new Error('Barangay is required to load evacuation sites.');
    }
    if (state.evacuationSitesCache.has(barangay)) {
      return state.evacuationSitesCache.get(barangay);
    }

    const response = await fetch(
      `${getBackendBase()}/flood/evac-sites?barangay=${encodeURIComponent(barangay)}`
    );
    const data = await response.json();
    if (!response.ok || data?.error) {
      throw new Error(data?.message || 'Failed to load evacuation sites.');
    }

    const sites = Array.isArray(data.evacuation_sites) ? data.evacuation_sites : [];
    state.evacuationSitesCache.set(barangay, sites);
    return sites;
  }

  function clearEvacuationSites() {
    state.evacuationPopup?.remove();
    state.evacuationPopup = null;
    state.evacuationMarkers.forEach(marker => marker.remove());
    state.evacuationMarkers = [];
    state.evacuationDrawn = null;
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // The sites while they are the destination; highlightedSiteId is the one
  // a run picked. Redrawn only when either changes, so the pins don't
  // flicker on every pin or panel sync.
  function drawEvacuationSites({ map, sites, highlightedSiteId = null }) {
    if (!map || !Array.isArray(sites) || !sites.length) {
      clearEvacuationSites();
      return;
    }
    if (state.evacuationDrawn?.sites === sites
      && state.evacuationDrawn.highlightedSiteId === highlightedSiteId
      && state.evacuationMarkers.every(marker => map.hasLayer(marker))) {
      return;
    }

    clearEvacuationSites();
    state.evacuationDrawn = { sites, highlightedSiteId };
    state.evacuationMarkers = sites.map(site => {
      const isChosen = site.id === highlightedSiteId;
      const marker = L.marker({ lat: Number(site.lat), lng: Number(site.lng) }, {
        title: site.name,
        alt: `${isChosen ? 'Chosen evacuation site' : 'Evacuation site'}: ${site.name}`,
        zIndexOffset: isChosen ? 3100 : 3000,
        icon: buildEvacSiteMarkerIcon(isChosen ? EVAC_MARKER_STYLES.chosen : EVAC_MARKER_STYLES.site),
      }).addTo(map);
      marker.on('click', () => {
        state.evacuationPopup?.remove();
        state.evacuationPopup = L.popup({ offset: [0, -52] })
          .setLatLng(marker.getLatLng())
          .setContent(`
            <div class="popup-shell">
              <div class="popup-title">${escapeHtml(site.name)}</div>
              <div class="popup-row"><span>Role</span><span>${isChosen ? 'Chosen evacuation site' : 'Evacuation site'}</span></div>
            </div>`)
          .openOn(map);
      });
      return marker;
    });
  }

  function reset() {
    clearLayer();
    clearEvacuationSites();
  }

  window.floodHazardUI = {
    loadHazardLayers,
    renderHazardLayers,
    loadEvacuationSites,
    drawEvacuationSites,
    clearEvacuationSites,
    evacMarkerStyles: EVAC_MARKER_STYLES,
    reset,
  };
})();
