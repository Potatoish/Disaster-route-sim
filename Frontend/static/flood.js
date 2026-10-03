(function initFloodHazardUI() {
  const state = {
    hazardCache: new Map(),
    dataLayer: null,
    highlightVar: null,
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

  function reset() {
    clearLayer();
  }

  window.floodHazardUI = {
    loadHazardLayers,
    renderHazardLayers,
    reset,
  };
})();
