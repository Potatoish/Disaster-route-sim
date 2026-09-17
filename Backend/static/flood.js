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
      fillOpacity: 0.22,
      strokeOpacity: 0.44,
      strokeWeight: 0.9,
      zIndex: 1,
    },
    2: {
      fillColor: '#fb923c',
      strokeColor: '#f97316',
      fillOpacity: 0.26,
      strokeOpacity: 0.54,
      strokeWeight: 0.95,
      zIndex: 2,
    },
    3: {
      fillColor: '#f43f5e',
      strokeColor: '#e11d48',
      fillOpacity: 0.32,
      strokeOpacity: 0.62,
      strokeWeight: 1,
      zIndex: 3,
    },
  };

  function getBackendBase() {
    return window.BACKEND_BASE || 'http://127.0.0.1:5000';
  }

  function ensureDataLayer(map) {
    if (!state.dataLayer) {
      state.dataLayer = new google.maps.Data();
      state.dataLayer.setStyle(feature => {
        const floodVar = Number(feature.getProperty('flood_var'));
        const style = FLOOD_LAYER_STYLES[floodVar] || FLOOD_LAYER_STYLES[1];
        const isDimmed = state.highlightVar && floodVar !== state.highlightVar;
        return {
          clickable: false,
          fillColor: style.fillColor,
          fillOpacity: isDimmed ? style.fillOpacity * 0.18 : style.fillOpacity,
          strokeColor: style.strokeColor,
          strokeOpacity: isDimmed ? style.strokeOpacity * 0.22 : style.strokeOpacity,
          strokeWeight: style.strokeWeight,
          zIndex: style.zIndex,
        };
      });
    }

    if (state.dataLayer.getMap() !== map) {
      state.dataLayer.setMap(map);
    }

    return state.dataLayer;
  }

  function clearLayer() {
    if (!state.dataLayer) return;

    const features = [];
    state.dataLayer.forEach(feature => features.push(feature));
    features.forEach(feature => state.dataLayer.remove(feature));
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
      if (state.dataLayer) {
        state.dataLayer.setMap(null);
      }
      return;
    }

    const layer = ensureDataLayer(map);
    const filteredHazardLayers = Array.isArray(visibleVars) && visibleVars.length
      ? {
          ...hazardLayers,
          features: (hazardLayers.features || []).filter(feature =>
            visibleVars.includes(Number(feature?.properties?.flood_var))
          ),
        }
      : hazardLayers;

    layer.addGeoJson(filteredHazardLayers);
  }

  function reset(options = {}) {
    const { clearCache = false } = options;
    clearLayer();

    if (state.dataLayer) {
      state.dataLayer.setMap(null);
    }

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
