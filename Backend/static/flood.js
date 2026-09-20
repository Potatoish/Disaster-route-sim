(function initFloodHazardUI() {
  const state = {
    hazardCache: new Map(),
    dataLayer: null,
    highlightVar: null,
  };

  const FLOOD_LAYER_STYLES = {
    1: {
      fillColor: '#fde047',
      strokeColor: '#eab308',
      fillOpacity: 0.12,
      strokeOpacity: 0.26,
      strokeWeight: 0.9,
    },
    2: {
      fillColor: '#fb923c',
      strokeColor: '#f97316',
      fillOpacity: 0.14,
      strokeOpacity: 0.32,
      strokeWeight: 0.95,
    },
    3: {
      fillColor: '#f43f5e',
      strokeColor: '#e11d48',
      fillOpacity: 0.18,
      strokeOpacity: 0.4,
      strokeWeight: 1,
    },
  };

  function getBackendBase() {
    return window.BACKEND_BASE || 'http://127.0.0.1:5000';
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

    if (state.hazardCache.has(cacheKey)) {
      return state.hazardCache.get(cacheKey);
    }

    const query = new URLSearchParams();
    query.set('scope', scope);
    if (barangay) query.set('barangay', barangay);
    if (varsKey) query.set('vars', varsKey);

    const response = await fetch(
      `${getBackendBase()}/flood-hazard-layers?${query.toString()}`
    );
    const data = await response.json();

    if (!response.ok || data?.error) {
      throw new Error(data?.message || 'Failed to load flood hazard layers.');
    }

    const payload = data?.hazard_layers || { type: 'FeatureCollection', features: [] };
    state.hazardCache.set(cacheKey, payload);
    return payload;
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
      { style: styleForFeature }
    ).addTo(map);
  }

  function reset(options = {}) {
    const { clearCache = false } = options;
    clearLayer();

    if (clearCache) {
      state.hazardCache.clear();
    }
  }

  window.floodHazardUI = {
    loadHazardLayers,
    renderHazardLayers,
    reset,
  };
})();
