(function initEarthquakeUI() {
  const state = {
    evacuationSitesCache: new Map(),
    evacuationMarkers: [],
    hazardOverlays: {
      liquefaction: [],
      ground_shaking: [],
    },
    // The hazard layers last drawn, for a legend synced without them.
    hazardLayers: null,
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

  // Ground shaking is a solid fill in the earthquake oranges, strongest
  // darkest, and liquefaction is never a solid fill: High as amber stripes
  // inside a solid edge (the shaking shows between the stripes), Moderate as
  // a dashed edge, so where the two overlap neither color mixes into the
  // other. The strongest class is the app's ground-shaking orange.
  const SHAKING_CLASS_COLORS = [[194, 65, 12], [250, 160, 120], [254, 226, 213]];
  const SHAKING_FILL_OPACITY = { overall: 0.34, ground_shaking: 0.5, intro: 0.72 };
  const LIQUEFACTION_HATCH_ID = 'agnasLiqHatch';
  // Modified Mercalli words for the Roman numerals the maps reach.
  const INTENSITY_WORDS = { VII: 'Very strong', VIII: 'Severe', IX: 'Violent', X: 'Extreme' };
  // The light street map the fills sit on, for legend swatches in the shade
  // a fill has on the map.
  const LAND = [238, 241, 244];

  function getBackendBase() {
    return window.BACKEND_BASE || window.location.origin;
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  const rgb = color => `rgb(${color.join(',')})`;
  const onMap = (color, alpha) => color.map((value, index) => Math.round(LAND[index] + (value - LAND[index]) * alpha));
  const capitalize = text => (text ? text.charAt(0).toUpperCase() + text.slice(1) : '');

  // The stripes High liquefaction is filled with: an SVG pattern the map's
  // polygons point at (fillColor: url(#...)), defined once on the page.
  function ensureLiquefactionHatch() {
    if (document.getElementById(LIQUEFACTION_HATCH_ID)) return;
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('width', '0');
    svg.setAttribute('height', '0');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    svg.style.position = 'absolute';
    svg.innerHTML = `<defs><pattern id="${LIQUEFACTION_HATCH_ID}" patternUnits="userSpaceOnUse" width="7" height="7" patternTransform="rotate(45)"><rect width="2.2" height="7" fill="#f59e0b" fill-opacity="0.7"/></pattern></defs>`;
    document.body.appendChild(svg);
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

  function reset() {
    clearInfoWindow();
    clearMapObjects(state.evacuationMarkers);
    Object.values(state.hazardOverlays).forEach(overlays => clearMapObjects(overlays));
    state.hazardLayers = null;
  }

  // "OPEN AREA" is wider than "CHOSEN", so its text is a point smaller.
  function buildEvacMarkerIcon(isHighlighted) {
    return buildEvacSiteMarkerIcon(isHighlighted
      ? { fill: '#22c55e', stroke: '#14532d', accent: '#166534', label: 'CHOSEN', badgeWidth: 56, labelSize: 11, halo: true }
      : { fill: '#f59e0b', stroke: '#9a3412', accent: '#b45309', label: 'OPEN AREA', badgeWidth: 80, labelSize: 10 });
  }

  // Setup and surroundings are safety claims, so a site without them in the
  // data shows no row rather than a reassuring default.
  function buildEvacDetailRow(label, value) {
    return value
      ? `<div class="popup-row"><span>${label}</span><span>${escapeHtml(value)}</span></div>`
      : '';
  }

  function buildEvacInfoContent(site, isHighlighted) {
    return `
      <div class="popup-shell">
        ${buildLocationPhoto({ ...site, label: site.name })}
        <div class="popup-title">${escapeHtml(site.name)}</div>
        <div class="popup-row"><span>Role</span><span>${isHighlighted ? 'Target evacuation site' : 'Evacuation site'}</span></div>
        <div class="popup-row"><span>Address</span><span>${escapeHtml(site.address || 'Pasig City')}</span></div>
        ${buildEvacDetailRow('Site Setup', site.site_setup)}
        ${buildEvacDetailRow('Surroundings', site.surroundings)}
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
        state.activeInfoWindow = L.popup(getEvacSitePopupPanOptions())
          .setLatLng(marker.getLatLng())
          .setContent(buildEvacInfoContent(site, isHighlighted))
          .openOn(map);
      });

      state.evacuationMarkers.push(marker);
    });
  }

  // ---- what the ground shaking and liquefaction layers show ----

  // The ground shaking classes a result's map shows, strongest first. A
  // barangay with an intensity map (hazard_layers.shaking_intensity, display
  // only) shows its zones in Roman numerals; one without shows the routing
  // layer's own level ("High"). polygons: GeoJSON geometries.
  function getShakingClasses(hazardLayers) {
    const zones = hazardLayers?.shaking_intensity?.features || [];
    if (zones.length) {
      return {
        kind: 'intensity',
        title: 'Ground shaking intensity',
        classes: zones.map((zone, rank) => {
          const props = zone.properties || {};
          const numeral = String(props.intensity || '').toUpperCase();
          return {
            color: SHAKING_CLASS_COLORS[Math.min(rank, SHAKING_CLASS_COLORS.length - 1)],
            numeral,
            word: INTENSITY_WORDS[numeral] || '',
            part: zones.length < 2 ? '' : rank === 0 ? 'stronger' : 'strong',
            where: props.where || '',
            source: 'PHIVOLCS via HazardHunterPH',
            range: props.mmi_min != null && props.mmi_max != null
              ? `${Number(props.mmi_min).toFixed(2)}–${Number(props.mmi_max).toFixed(2)}`
              : '',
            geometries: [zone.geometry],
          };
        }),
      };
    }
    const byLevel = new Map();
    (hazardLayers?.ground_shaking?.features || []).forEach(feature => {
      const props = feature.properties || {};
      const severity = Number(props.severity) || 0;
      if (!byLevel.has(severity)) {
        byLevel.set(severity, {
          severity,
          level: capitalize(String(props.shaking_level || props.shaking_leve || props.ground_shaking_level || '').trim().toLowerCase())
            || (severity >= 4 ? 'High' : severity >= 3 ? 'Moderate' : 'Low'),
          geometries: [],
        });
      }
      byLevel.get(severity).geometries.push(feature.geometry);
    });
    const levels = [...byLevel.values()].sort((a, b) => b.severity - a.severity);
    return {
      kind: 'level',
      title: 'Ground shaking',
      classes: levels.map((level, rank) => ({
        ...level,
        color: SHAKING_CLASS_COLORS[Math.min(rank, SHAKING_CLASS_COLORS.length - 1)],
      })),
    };
  }

  // The liquefaction levels present, highest first: { high, label, features }.
  function getLiquefactionLevels(hazardLayers) {
    const byLevel = new Map();
    (hazardLayers?.liquefaction?.features || []).forEach(feature => {
      const props = feature.properties || {};
      const severity = Number(props.severity) || 0;
      if (!byLevel.has(severity)) {
        const name = capitalize(String(props.liquefaction_level || '').trim().toLowerCase())
          || (severity >= 4 ? 'High' : severity >= 3 ? 'Moderate' : 'Low');
        byLevel.set(severity, { severity, high: severity >= 4, label: `${name} liquefaction`, features: [] });
      }
      byLevel.get(severity).features.push(feature);
    });
    return [...byLevel.values()].sort((a, b) => b.severity - a.severity);
  }

  function shakingOpacity(activeView) {
    return SHAKING_FILL_OPACITY[activeView] ?? SHAKING_FILL_OPACITY.overall;
  }

  // The legend's shaking classes, swatched in the shade they have on the
  // map at this fill opacity: the Roman numeral, then which part of it.
  function buildShakingLegendHtml(hazardLayers, alpha) {
    const shaking = getShakingClasses(hazardLayers);
    const rows = shaking.classes.map(cls => {
      const swatch = `<i style="background:${rgb(onMap(cls.color, alpha))}"></i>`;
      if (shaking.kind === 'intensity') {
        const text = [cls.word, cls.part].filter(Boolean).join(' · ');
        return `<span>${swatch}<span class="mmi-roman">${escapeHtml(cls.numeral)}</span>${escapeHtml(text)}</span>`;
      }
      return `<span>${swatch}${escapeHtml(cls.level)}</span>`;
    }).join('');
    return rows ? `<div class="quake-levels"><b>${escapeHtml(shaking.title)}</b><div class="mmi-legend">${rows}</div></div>` : '';
  }

  // The legend's earthquake rows for a lens: the shaking classes, then the
  // liquefaction swatches.
  function buildHazardLegendHtml(hazardLayers = state.hazardLayers, activeView = 'overall') {
    const keys = getViewLayerKeys(activeView);
    let html = '';
    if (keys.includes('ground_shaking')) html += buildShakingLegendHtml(hazardLayers, shakingOpacity(activeView));
    if (keys.includes('liquefaction')) {
      html += getLiquefactionLevels(hazardLayers).map(level => (
        `<div class="legend-row"><i class="liq-swatch liq-swatch--${level.high ? 'high' : 'moderate'}"></i><span>${escapeHtml(level.label)}</span></div>`
      )).join('');
    }
    return html ? `<div class="quake-legend">${html}</div>` : '';
  }

  // ---- drawing them on the map ----

  function normalizeCoordinate(point) {
    return {
      lat: Number(point[1]),
      lng: Number(point[0]),
    };
  }

  // A GeoJSON geometry's polygons as Leaflet rings, or its lines.
  function geometryPaths(geometry) {
    const coordinates = geometry?.coordinates || [];
    switch (geometry?.type) {
      case 'Polygon':
        return { polygons: [coordinates.map(ring => ring.map(normalizeCoordinate))], lines: [] };
      case 'MultiPolygon':
        return { polygons: coordinates.map(polygon => polygon.map(ring => ring.map(normalizeCoordinate))), lines: [] };
      case 'LineString':
        return { polygons: [], lines: [coordinates.map(normalizeCoordinate)] };
      case 'MultiLineString':
        return { polygons: [], lines: coordinates.map(line => line.map(normalizeCoordinate)) };
      default:
        return { polygons: [], lines: [] };
    }
  }

  function addPath(map, path, options, isLine) {
    const layer = (isLine ? L.polyline : L.polygon)(path, {
      interactive: false,
      pane: ensureHazardPane(map),
      ...options,
    }).addTo(map);
    // Leaflet paths stack by insertion order, not zIndex; flag lines so
    // renderHazardLayers can lift them above any fills added after them.
    if (isLine) layer._isHazardLine = true;
    return layer;
  }

  function renderShaking(map, hazardLayers, activeView) {
    const fillOpacity = shakingOpacity(activeView);
    getShakingClasses(hazardLayers).classes.forEach(cls => {
      cls.geometries.forEach(geometry => {
        const { polygons, lines } = geometryPaths(geometry);
        polygons.forEach(rings => state.hazardOverlays.ground_shaking.push(addPath(map, rings, {
          stroke: false,
          fillColor: rgb(cls.color),
          fillOpacity,
        }, false)));
        lines.forEach(line => state.hazardOverlays.ground_shaking.push(addPath(map, line, {
          color: LAYER_STYLES.ground_shaking.strokeColor,
          opacity: 0.65,
          weight: 2.2,
        }, true)));
      });
    });
  }

  function renderLiquefaction(map, hazardLayers) {
    ensureLiquefactionHatch();
    getLiquefactionLevels(hazardLayers).forEach(level => {
      level.features.forEach(feature => {
        const { polygons, lines } = geometryPaths(feature.geometry);
        const edge = {
          color: LAYER_STYLES.liquefaction.strokeColor,
          opacity: 0.9,
          weight: level.high ? 2.4 : 1.8,
          dashArray: level.high ? null : '6 5',
        };
        polygons.forEach(rings => state.hazardOverlays.liquefaction.push(addPath(map, rings, {
          ...edge,
          fill: level.high,
          fillColor: `url(#${LIQUEFACTION_HATCH_ID})`,
          fillOpacity: 1,
        }, false)));
        lines.forEach(line => state.hazardOverlays.liquefaction.push(addPath(map, line, edge, true)));
      });
    });
  }

  function renderHazardLayers({ map, hazardLayers, activeView = 'overall' }) {
    Object.values(state.hazardOverlays).forEach(overlays => clearMapObjects(overlays));
    state.hazardLayers = hazardLayers || null;

    if (!map || !hazardLayers) {
      return;
    }

    // "Overall" has no geometry of its own, so render both real layers
    // together: shaking under liquefaction's stripes and edges.
    const layerKeys = getViewLayerKeys(activeView);
    if (layerKeys.includes('ground_shaking')) renderShaking(map, hazardLayers, activeView);
    if (layerKeys.includes('liquefaction')) renderLiquefaction(map, hazardLayers);

    Object.values(state.hazardOverlays).flat().forEach(layer => {
      if (layer._isHazardLine) layer.bringToFront();
    });
    fadeInHazardPane(map);
  }

  // The layers renderHazardLayers shows for a lens ("Overall": both).
  function getViewLayerKeys(activeView) {
    return activeView === 'overall'
      ? Object.keys(LAYER_STYLES)
      : (LAYER_STYLES[activeView] ? [activeView] : []);
  }

  // Liquefaction's stripes on a canvas, the same as the map's pattern.
  function canvasHatch(ctx) {
    const tile = document.createElement('canvas');
    tile.width = 10;
    tile.height = 10;
    const t = tile.getContext('2d');
    t.strokeStyle = 'rgba(245, 158, 11, 0.7)';
    t.lineWidth = 2.2;
    [-10, 0, 10].forEach(offset => {
      t.beginPath();
      t.moveTo(offset, 10);
      t.lineTo(offset + 10, 0);
      t.stroke();
    });
    return ctx.createPattern(tile, 'repeat');
  }

  // The lens's layers on a canvas (the PDF report's map), as the map draws
  // them; line features go over the fills, as on the map.
  function paintHazardLayers(ctx, hazardLayers, activeView, project) {
    const keys = getViewLayerKeys(activeView);
    const lines = [];
    if (keys.includes('ground_shaking')) {
      ctx.globalAlpha = shakingOpacity(activeView);
      getShakingClasses(hazardLayers).classes.forEach(cls => {
        cls.geometries.forEach(geometry => {
          const kind = traceGeoJsonGeometry(ctx, geometry, project);
          if (kind === 'line') lines.push(geometry);
          if (kind !== 'area') return;
          ctx.fillStyle = rgb(cls.color);
          ctx.fill('evenodd');
        });
      });
    }
    if (keys.includes('liquefaction')) {
      const hatch = canvasHatch(ctx);
      getLiquefactionLevels(hazardLayers).forEach(level => {
        level.features.forEach(feature => {
          const kind = traceGeoJsonGeometry(ctx, feature.geometry, project);
          if (!kind) return;
          if (kind === 'area' && level.high && hatch) {
            ctx.globalAlpha = 1;
            ctx.fillStyle = hatch;
            ctx.fill('evenodd');
          }
          ctx.globalAlpha = 0.9;
          ctx.strokeStyle = LAYER_STYLES.liquefaction.strokeColor;
          ctx.lineWidth = level.high ? 2.4 : 1.8;
          ctx.setLineDash(level.high ? [] : [6, 5]);
          ctx.stroke();
          ctx.setLineDash([]);
        });
      });
    }
    lines.forEach(geometry => {
      traceGeoJsonGeometry(ctx, geometry, project);
      ctx.globalAlpha = 0.65;
      ctx.strokeStyle = LAYER_STYLES.ground_shaking.strokeColor;
      ctx.lineWidth = 2.2;
      ctx.stroke();
    });
    ctx.globalAlpha = 1;
  }

  // The PDF legend's rows for the lens, in the map legend's words.
  function getLegendItems(activeView = 'overall', hazardLayers = state.hazardLayers) {
    const keys = getViewLayerKeys(activeView);
    const items = [];
    if (keys.includes('ground_shaking')) {
      const shaking = getShakingClasses(hazardLayers);
      const alpha = shakingOpacity(activeView);
      shaking.classes.forEach(cls => {
        const color = onMap(cls.color, alpha);
        const hex = `#${color.map(value => value.toString(16).padStart(2, '0')).join('')}`;
        items.push({
          kind: 'area',
          color: hex,
          edge: hex,
          label: shaking.kind === 'intensity'
            ? `Intensity ${cls.numeral}${cls.part ? `, ${cls.part}` : ''}`
            : `${cls.level} ground shaking`,
        });
      });
    }
    if (keys.includes('liquefaction')) {
      getLiquefactionLevels(hazardLayers).forEach(level => {
        items.push({
          kind: level.high ? 'hatch' : 'dashed',
          color: LAYER_STYLES.liquefaction.fillColor,
          edge: LAYER_STYLES.liquefaction.strokeColor,
          label: level.label,
        });
      });
    }
    return items;
  }

  // showRouteKeys / showHazardLayers: whether a result's routes and hazard
  // layers are on the map (before a run, only the pin and shelters are).
  function syncLegend(activeView = 'overall', options = {}) {
    if (window.isHazardOnlyView?.()) {
      window.renderHazardOnlyLegend();
      return;
    }
    const {
      showRouteKeys = true,
      showHazardLayers = true,
      hazardLayers = state.hazardLayers,
    } = options;
    const body = document.getElementById('mapLegendBody');
    if (!body) return;

    // script.js builds the route rows (they change when no route is safe).
    const routeLegend = showRouteKeys && typeof window.buildRouteLegendRows === 'function'
      ? window.buildRouteLegendRows()
      : '';
    const hazardLegend = showHazardLayers ? buildHazardLegendHtml(hazardLayers, activeView) : '';

    // Pin icons match the markers (buildEvacMarkerIcon): after a run the
    // chosen site is the green "CHOSEN" one.
    const pinRow = (fill, stroke, glyph, label) => (
      `<div class="legend-row">${window.buildLegendPinSvg(fill, stroke, glyph)}<span style="font-size:.78rem;">${label}</span></div>`
    );

    body.innerHTML = `
      ${routeLegend}
      <div style="margin-top:${showRouteKeys ? '5px' : '0'};">
        ${window.buildPinLegendRow('start')}
        ${!window.isToEvacuationSite?.() ? window.buildPinLegendRow('end')
          : showRouteKeys ? pinRow('#22c55e', '#14532d', 'house', 'Chosen evacuation site') : ''}
        ${state.evacuationMarkers.length ? pinRow('#f59e0b', '#9a3412', 'house', 'Open area') : ''}
        ${typeof window.buildBoundaryLegendRow === 'function' ? window.buildBoundaryLegendRow() : ''}
        ${hazardLegend}
      </div>`;
  }

  window.earthquakeUI = {
    loadEvacuationSites,
    drawEvacuationSites,
    renderHazardLayers,
    paintHazardLayers,
    getLegendItems,
    getShakingClasses,
    buildShakingLegendHtml,
    buildHazardLegendHtml,
    syncLegend,
    reset,
  };
})();
