// The earthquake scenario, played before an earthquake run's ant replay
// (script.js prepareSimulationReplay): the West Valley Fault breaks at the
// epicenter, the shaking spreads out from it in rings, and the barangay's
// ground shaking map is painted in behind the first wave, while a meter in
// the panel traces the ground moving at the start pin. Then the ants' search
// (aco-replay.js) takes over. The scenario and the shaking classes come from
// the result (earthquake_data.py _build_scenario, earthquake.js
// getShakingClasses); the waves are slowed down so they can be followed.
(function initQuakeIntro() {
  const INTENSITY_PANE = 'quakeIntensityPane';
  const FX_PANE = 'quakeFxPane';
  const FAULT_PANE = 'quakeFaultPane';
  // Over the hazard fills (350), under the ants' trails (380), the barangay
  // outline and its mask (overlayPane, 400) and the pins (markerPane, 600).
  const INTENSITY_PANE_Z = 352;
  const FX_PANE_Z = 360;
  const FAULT_PANE_Z = 365;
  // The canvases reach this far past each edge of the map.
  const VIEW_PAD = 40;
  const METERS_PER_DEGREE_LAT = 110574;
  const METERS_PER_DEGREE_LNG = 111320;
  const FAULT_COLOR = '#7f1d1d';
  // The rings: the app's ground-shaking orange near the epicenter, the
  // earthquake theme's light orange as they fade.
  const RING_NEAR = [194, 65, 12];
  const RING_FAR = [251, 146, 60];
  // The shaking map's opacity while the intro paints it (the results show
  // it lighter, under the routes).
  const INTENSITY_ALPHA = 0.72;
  const FADE_OUT_MS = 700;
  const FAULT_CREDIT = 'Fault trace: GEM (PHIVOLCS)';
  // The shaking map's paths are projected once, at this zoom.
  const REF_ZOOM = 18;
  // Phones with few cores or little memory start on the light setting (1x
  // canvases), and so does any device whose intro frames average slower
  // than SLOW_FRAME_MS. Kept for the session: a slow device stays slow.
  const SLOW_FRAME_MS = 26;
  const quality = {
    low: !!window.agnasUI?.constrained || (navigator.hardwareConcurrency || 8) <= 4 || (navigator.deviceMemory || 8) <= 4,
    frameAvg: 16.7,
    frames: 0,
  };

  // The timeline, in ms.
  const T = {
    faultIn: [0, 450],
    rupture: [400, 4000],
    ruptureSpeed: 2.6, // metres along the fault per ms
    ring0: 1050,
    ringGap: 520,
    rings: 7,
    speed: 1.35, // metres the waves travel per ms of the intro
    ringMax: 6400, // metres: the rings have faded out by here
    zoomIn: 4700,
    zoomInMs: 1300,
    hold: 8600, // the ants take over
  };

  const clamp01 = value => Math.max(0, Math.min(1, value));
  const ease = value => {
    const x = clamp01(value);
    return x * x * (3 - 2 * x);
  };
  const easeOut = value => 1 - Math.pow(1 - clamp01(value), 3);
  const lerp = (a, b, t) => a + (b - a) * t;
  const hash = index => {
    const x = Math.sin(index * 12.9898 + 78.233) * 43758.5453;
    return x - Math.floor(x);
  };
  const rgb = color => `rgb(${color.join(',')})`;
  const km = meters => `${(meters / 1000).toFixed(1)} km`;
  const CHECK = '<svg viewBox="0 0 24 24"><path d="m5 12 5 5 9-10"/></svg>';

  function ensurePane(map, name, zIndex) {
    const pane = map.getPane(name) || map.createPane(name);
    pane.style.zIndex = String(zIndex);
    pane.style.pointerEvents = 'none';
    return pane;
  }

  function starPath(cx, cy, outer, inner) {
    let d = '';
    for (let index = 0; index < 10; index += 1) {
      const radius = index % 2 ? inner : outer;
      const angle = -Math.PI / 2 + index * Math.PI / 5;
      d += `${index ? 'L' : 'M'}${(cx + radius * Math.cos(angle)).toFixed(2)} ${(cy + radius * Math.sin(angle)).toFixed(2)}`;
    }
    return `${d}Z`;
  }

  // GeoJSON polygons as rings of [lat, lng].
  function polygonRings(geometry) {
    const coordinates = geometry?.coordinates || [];
    const toLatLng = ring => ring.map(point => [Number(point[1]), Number(point[0])]);
    if (geometry?.type === 'Polygon') return [coordinates.map(toLatLng)];
    if (geometry?.type === 'MultiPolygon') return coordinates.map(polygon => polygon.map(toLatLng));
    return [];
  }

  function insideRing(point, ring) {
    const [y, x] = point;
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
      const [yi, xi] = ring[i];
      const [yj, xj] = ring[j];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }

  // options:
  //   map, scenario (result.earthquake_scenario), hazardLayers
  //   boundaryRings: the barangay's rings of {lat, lng}
  //   barangay: its name; start: { lat, lng, label }
  //   legendBody: the map legend's body; legendPins: its pin rows (HTML)
  //   getPadding(): fitBounds padding that keeps clear of the panels
  //   onPanelChange(): the panel's content changed size
  //   showCredit: name the fault's source in the map's attribution (phones
  //     leave it to the About page: a second line there runs under the
  //     legend chip)
  function create(options) {
    const { map, scenario } = options;
    const barangay = options.barangay || 'the barangay';
    const startLabel = options.start?.label || 'the start';
    const FAULT = (scenario.fault || []).map(point => [Number(point[0]), Number(point[1])]);
    const EPI = [Number(scenario.epicenter[0]), Number(scenario.epicenter[1])];
    const START = [Number(options.start.lat), Number(options.start.lng)];
    const magnitude = Number(scenario.magnitude) || 7.2;
    const faultName = scenario.fault_name || 'West Valley Fault';
    const BOUNDARY = (options.boundaryRings || [])
      .map(ring => ring.map(point => [Number(point.lat), Number(point.lng)]))
      .filter(ring => ring.length >= 3);

    // Flat-earth metres around the epicenter (a few km: well within a metre).
    const KX = METERS_PER_DEGREE_LNG * Math.cos(EPI[0] * Math.PI / 180);
    const toM = ([lat, lng]) => [lng * KX, lat * METERS_PER_DEGREE_LAT];
    const distM = (a, b) => {
      const [ax, ay] = toM(a);
      const [bx, by] = toM(b);
      return Math.hypot(ax - bx, ay - by);
    };
    function distToSegmentM(p, a, b) {
      const [px, py] = toM(p);
      const [ax, ay] = toM(a);
      const [bx, by] = toM(b);
      const dx = bx - ax;
      const dy = by - ay;
      const t = clamp01(((px - ax) * dx + (py - ay) * dy) / ((dx * dx + dy * dy) || 1));
      return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
    }
    const distToLineM = (point, line) => Math.min(...line.slice(1).map((p, index) => distToSegmentM(point, line[index], p)));

    const boundaryPoints = BOUNDARY.flat();
    const nearestBoundaryM = Number(scenario.fault_to_barangay_m)
      || Math.min(...BOUNDARY.map(ring => distToLineM(EPI, ring)));
    const farthestM = Math.max(...boundaryPoints.map(point => distM(EPI, point)), 1);
    const startToFaultM = FAULT.length > 1 ? distToLineM(START, FAULT) : distM(START, EPI);
    const arrivalAt = meters => T.ring0 + meters / T.speed;
    const ARRIVE_START = arrivalAt(distM(EPI, START));

    // Along-fault distances, for the rupture running out from the epicenter.
    const faultCum = [0];
    for (let index = 1; index < FAULT.length; index += 1) faultCum.push(faultCum[index - 1] + distM(FAULT[index - 1], FAULT[index]));
    const faultLen = faultCum[faultCum.length - 1] || 0;
    let epiAlong = 0;
    {
      let best = Infinity;
      for (let index = 1; index < FAULT.length; index += 1) {
        const d = distToSegmentM(EPI, FAULT[index - 1], FAULT[index]);
        if (d < best) {
          best = d;
          epiAlong = faultCum[index - 1] + distM(FAULT[index - 1], EPI);
        }
      }
    }
    function faultPointAt(s) {
      if (FAULT.length < 2) return EPI;
      const d = Math.max(0, Math.min(faultLen, s));
      let index = 1;
      while (index < faultCum.length - 1 && faultCum[index] < d) index += 1;
      const share = (d - faultCum[index - 1]) / ((faultCum[index] - faultCum[index - 1]) || 1);
      const a = FAULT[index - 1];
      const b = FAULT[index];
      return [lerp(a[0], b[0], share), lerp(a[1], b[1], share)];
    }
    function faultSlice(from, to) {
      const out = [faultPointAt(from)];
      faultCum.forEach((at, index) => { if (at > from && at < to) out.push(FAULT[index]); });
      out.push(faultPointAt(to));
      return out;
    }

    // ---- the shaking classes, and the one at the start pin ----
    const shaking = window.earthquakeUI.getShakingClasses(options.hazardLayers);
    const classes = shaking.classes.map(cls => ({ ...cls, rings: cls.geometries.flatMap(polygonRings) }));
    const isIntensity = shaking.kind === 'intensity';
    const startClass = classes.find(cls => cls.rings.some(polygon => (
      insideRing(START, polygon[0]) && !polygon.slice(1).some(hole => insideRing(START, hole))
    ))) || classes[0] || { color: RING_NEAR, numeral: '', word: '', level: 'High' };
    const startRank = Math.max(0, classes.indexOf(startClass));
    const numerals = [...new Set(classes.map(cls => cls.numeral).filter(Boolean))];
    const source = classes.find(cls => cls.source)?.source || 'the barangay';
    const startShakingText = isIntensity ? `Intensity ${startClass.numeral}` : `${startClass.level} shaking`;
    const startWord = isIntensity ? (startClass.word || 'Strong').toLowerCase() : '';

    function spreadText() {
      const intro = `Seismic waves travel out from the epicenter in every direction and cross ${barangay} in seconds.`;
      if (!isIntensity) {
        return `${intro} All of ${barangay} is in a ${String(startClass.level).toLowerCase()} ground shaking zone.`;
      }
      if (numerals.length !== 1) {
        return `${intro} ${barangay} gets intensity ${numerals.join(' to ')}.`;
      }
      const [stronger, strong] = classes;
      const where = stronger?.where && strong?.where
        ? ` It is stronger ${stronger.where} and strong ${strong.where}.`
        : '';
      return `${intro} All of ${barangay} gets intensity ${numerals[0]}, ${(stronger.word || '').toLowerCase()} shaking.${where}`;
    }

    function sourceText() {
      if (!isIntensity) {
        return `Ground shaking: ${barangay}'s hazard level (${startClass.level}). There is no intensity map for ${barangay} yet.`;
      }
      const zones = options.hazardLayers?.shaking_intensity?.features || [];
      const low = Math.min(...zones.map(zone => Number(zone.properties?.mmi_min)).filter(Number.isFinite));
      const high = Math.max(...zones.map(zone => Number(zone.properties?.mmi_max)).filter(Number.isFinite));
      const rounding = numerals.length === 1 && Number.isFinite(low) && Number.isFinite(high)
        ? `; its values here, ${low.toFixed(2)} to ${high.toFixed(2)}, all round to ${numerals[0]}`
        : '';
      return `Intensity: ${source} map of ${barangay} (Modified Mercalli scale)${rounding}.`;
    }

    const STEPS = [
      {
        title: 'The fault breaks',
        detail: `A magnitude ${magnitude.toFixed(1)} earthquake starts on the ${faultName}. Its epicenter is set on the fault where it passes closest to ${barangay}, ${km(nearestBoundaryM)} from the barangay.`,
      },
      { title: 'Shaking spreads out', detail: spreadText() },
      {
        title: `Shaking reaches ${startLabel}`,
        detail: `${isIntensity ? `Intensity ${startClass.numeral} here: ${startWord} shaking.` : `${startClass.level} ground shaking here.`} Drop, cover and hold on until it stops. Next, the ants look for a way to an open area for when the shaking is over.`,
      },
    ];

    const state = {
      t: 0,
      last: 0,
      raf: 0,
      running: false,
      done: false,
      resolve: null,
      hit: false,
      zoomed: false,
      chapter: -1,
      layersOn: false,
      fadeTimer: 0,
    };

    // ---- the panel ----
    const panel = document.createElement('section');
    panel.className = 'aco-replay quake-intro';
    panel.setAttribute('aria-label', 'Earthquake scenario');
    panel.innerHTML = `
      <div class="safety-section-label aco-replay-label">Earthquake scenario</div>
      <div class="safety-route-chip aco-replay-chip">${safetyIcon('quake')}<span>Magnitude ${magnitude.toFixed(1)} · ${escapeHtml(faultName)}</span></div>
      <ol class="aco-steps">
        ${STEPS.map(step => `
          <li class="aco-step">
            <span class="aco-step-icon" aria-hidden="true"><i></i>${CHECK}</span>
            <span class="aco-step-text"><span class="aco-step-title">${escapeHtml(step.title)}</span><span class="aco-step-detail">${escapeHtml(step.detail)}</span></span>
          </li>`).join('')}
      </ol>
      <button type="button" class="aco-replay-more" aria-expanded="false" aria-controls="msimSheetScroll">More</button>
      <div class="quake-meter" data-quake="meter">
        <div class="quake-meter-head">
          <span class="quake-meter-label">At ${escapeHtml(startLabel)}</span>
          <span class="quake-meter-value" data-quake="value">Not yet</span>
        </div>
        <canvas class="quake-trace" data-quake="trace" role="img" aria-label="Ground motion at ${escapeHtml(startLabel)}"></canvas>
        <div class="quake-meter-foot"><b>Magnitude ${magnitude.toFixed(1)}</b><span>${km(startToFaultM)} from the fault</span></div>
      </div>
      <div class="aco-replay-foot">
        <p class="aco-replay-meta"><span class="aco-meta-long"></span><span class="aco-meta-short"></span></p>
        <button type="button" class="aco-replay-skip">Skip to ant search</button>
      </div>
      <p class="sr-only" aria-live="polite" data-quake="caption"></p>`;
    panel.querySelector('.aco-meta-long').textContent = `The waves are slowed down so you can follow them. ${sourceText()}`;
    panel.querySelector('.aco-meta-short').textContent = isIntensity
      ? `Slowed down · ${source} map`
      : `Slowed down · ${startClass.level} shaking`;
    panel.querySelector('.aco-replay-skip').addEventListener('click', () => skip());
    // Looked up once: the meter is redrawn every frame.
    const fields = {};
    const field = name => {
      if (!fields[name]) fields[name] = panel.querySelector(`[data-quake="${name}"]`);
      return fields[name];
    };

    // One line for the replay's panel once the intro is over.
    function buildSummary() {
      const summary = document.createElement('div');
      summary.className = 'quake-summary';
      summary.innerHTML = `<span class="aco-step-icon" aria-hidden="true">${CHECK}</span>
        <span><b>Earthquake scenario</b>M${magnitude.toFixed(1)} ${escapeHtml(faultName)} · ${escapeHtml(isIntensity ? `intensity ${startClass.numeral}` : `${String(startClass.level).toLowerCase()} shaking`)} at ${escapeHtml(startLabel)}</span>`;
      return summary;
    }

    // ---- the legend ----
    function renderLegend() {
      if (!options.legendBody) return;
      const row = (swatch, label) => `<div class="legend-row">${swatch}<span>${escapeHtml(label)}</span></div>`;
      const legendShaking = window.earthquakeUI.buildShakingLegendHtml(options.hazardLayers, INTENSITY_ALPHA);
      // The scenario's own keys can go where room is short (style.css): the
      // map names the epicenter and the fault itself.
      options.legendBody.innerHTML = `<div class="aco-legend">
        ${legendShaking}
        <div class="quake-legend-keys">
          ${row(`<svg class="legend-sym" viewBox="0 0 22 16" aria-hidden="true"><path d="${starPath(11, 8.4, 7.4, 3.2)}" fill="#dc2626" stroke="#fff" stroke-width="1.2"/></svg>`, 'Epicenter')}
          ${row(`<span class="legend-line quake-legend-fault"></span>`, faultName)}
          ${row('<svg class="legend-sym" viewBox="0 0 22 16" aria-hidden="true"><path d="M4 14a9 9 0 0 1 14 0" fill="none" stroke="#fb923c" stroke-width="2" stroke-linecap="round"/><path d="M7.5 14a5 5 0 0 1 7 0" fill="none" stroke="#c2410c" stroke-width="2" stroke-linecap="round"/></svg>', 'Shaking wave')}
        </div>
        <div class="aco-legend-pins">${options.legendPins || ''}</div>
      </div>`;
    }

    // ---- map layers ----
    ensurePane(map, INTENSITY_PANE, INTENSITY_PANE_Z);
    ensurePane(map, FX_PANE, FX_PANE_Z);
    ensurePane(map, FAULT_PANE, FAULT_PANE_Z);
    const faultRenderer = L.svg({ pane: FAULT_PANE });
    const faultCasing = L.polyline(FAULT, { renderer: faultRenderer, color: '#ffffff', weight: 7, opacity: 0, lineCap: 'round', interactive: false });
    const faultLine = L.polyline(FAULT, { renderer: faultRenderer, color: FAULT_COLOR, weight: 3.4, opacity: 0, lineCap: 'round', interactive: false });
    const markers = [];

    function addLabel(latlng, html, className) {
      const marker = L.marker(latlng, {
        interactive: false,
        keyboard: false,
        icon: L.divIcon({ className: `quake-label ${className}`, html, iconSize: [0, 0] }),
        zIndexOffset: -100,
      });
      markers.push(marker);
      return marker;
    }
    const faultAngle = (() => {
      const a = map.project(faultPointAt(epiAlong - 1500), 16);
      const b = map.project(faultPointAt(epiAlong - 600), 16);
      let deg = Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI;
      if (deg > 90) deg -= 180;
      if (deg < -90) deg += 180;
      return deg;
    })();
    const faultLabel = addLabel(faultPointAt(epiAlong - 1050),
      `<span style="transform:translate(-50%,-50%) rotate(${faultAngle.toFixed(1)}deg) translateY(-13px)">${escapeHtml(faultName)}</span>`,
      'quake-label--fault is-hidden');
    // The barangay's name at the middle of its outline.
    const placeAt = (() => {
      const ring = BOUNDARY.reduce((best, item) => (item.length > (best?.length || 0) ? item : best), null) || [START];
      let area = 0;
      let cy = 0;
      let cx = 0;
      ring.forEach((point, index) => {
        const next = ring[(index + 1) % ring.length];
        const cross = point[1] * next[0] - next[1] * point[0];
        area += cross;
        cx += (point[1] + next[1]) * cross;
        cy += (point[0] + next[0]) * cross;
      });
      return Math.abs(area) > 1e-12 ? [cy / (3 * area), cx / (3 * area)] : ring[0];
    })();
    const placeLabel = addLabel(placeAt,
      `<span style="transform:translate(-50%,-50%)">${escapeHtml(barangay)}</span>`,
      'quake-label--place is-hidden');
    const epiMarker = L.marker(EPI, {
      interactive: false,
      keyboard: false,
      zIndexOffset: 2000,
      icon: L.divIcon({
        className: 'quake-epicenter',
        iconSize: [0, 0],
        html: `<div class="quake-epicenter-in"><svg width="30" height="30" viewBox="0 0 30 30" aria-hidden="true"><path d="${starPath(15, 15.5, 12.5, 5.4)}" fill="#dc2626" stroke="#ffffff" stroke-width="2.2" stroke-linejoin="round"/></svg><span class="quake-label"><span>Epicenter</span></span></div>`,
      }),
    });
    markers.push(epiMarker);
    let callout = null;

    function showCallout() {
      if (callout) return;
      callout = L.marker(START, {
        interactive: false,
        keyboard: false,
        zIndexOffset: 1500,
        icon: L.divIcon({
          className: 'quake-callout',
          iconSize: [0, 0],
          iconAnchor: [0, 60],
          html: `<div class="quake-callout-box"><div class="quake-callout-in"><span class="quake-callout-swatch" style="background:${rgb(startClass.color)}"></span><span><b>${escapeHtml(startShakingText)}</b><small>${escapeHtml(isIntensity ? `${startClass.word || 'Strong'} shaking` : 'Ground shaking level')}</small></span></div></div>`,
        }),
      }).addTo(map);
      markers.push(callout);
    }

    // ---- canvases over the map, redrawn each frame ----
    function makeView(paneName, className) {
      const canvas = L.DomUtil.create('canvas', `${className} leaflet-zoom-hide`, map.getPane(paneName));
      return { canvas, g: canvas.getContext('2d'), w: 0, h: 0, dpr: 1, key: '' };
    }
    const intensityView = makeView(INTENSITY_PANE, 'quake-intensity-canvas');
    const fxView = makeView(FX_PANE, 'quake-fx-canvas');
    const views = [intensityView, fxView];
    function sizeViews() {
      const size = map.getSize();
      // Soft fills and thin rings need no 2x canvas; a slow phone gets 1x.
      const dpr = Math.min(window.devicePixelRatio || 1, quality.low ? 1 : 1.5);
      views.forEach(view => {
        view.w = size.x + VIEW_PAD * 2;
        view.h = size.y + VIEW_PAD * 2;
        view.dpr = dpr;
        view.canvas.width = Math.round(view.w * dpr);
        view.canvas.height = Math.round(view.h * dpr);
        view.canvas.style.width = `${view.w}px`;
        view.canvas.style.height = `${view.h}px`;
        view.key = '';
      });
    }
    // Drops to the light setting if the intro runs slow on this device.
    function noteFrame(dt) {
      quality.frames += 1;
      quality.frameAvg += (dt - quality.frameAvg) * 0.1;
      if (!quality.low && quality.frames > 20 && quality.frameAvg > SLOW_FRAME_MS) {
        quality.low = true;
        sizeViews();
      }
    }

    // The barangay and the shaking zones as paths, projected once at
    // REF_ZOOM around the epicenter: any view is the same picture scaled and
    // moved (Web Mercator), so a frame reprojects nothing.
    const refPx = map.project(EPI, REF_ZOOM);
    function addRings(path, rings) {
      rings.forEach(ring => {
        ring.forEach((point, index) => {
          const p = map.project(point, REF_ZOOM);
          if (index) path.lineTo(p.x - refPx.x, p.y - refPx.y);
          else path.moveTo(p.x - refPx.x, p.y - refPx.y);
        });
        path.closePath();
      });
      return path;
    }
    const boundaryPath = addRings(new Path2D(), BOUNDARY);
    const classPaths = classes.map(cls => {
      const path = new Path2D();
      cls.rings.forEach(polygon => addRings(path, polygon));
      return path;
    });
    function worldTransform(g, view) {
      const s = Math.pow(2, map.getZoom() - REF_ZOOM);
      const ref = cp(EPI);
      g.setTransform(view.dpr * s, 0, 0, view.dpr * s, view.dpr * (VIEW_PAD + ref.x), view.dpr * (VIEW_PAD + ref.y));
    }
    function screenTransform(g, view) {
      g.setTransform(view.dpr, 0, 0, view.dpr, VIEW_PAD * view.dpr, VIEW_PAD * view.dpr);
    }
    function viewKey(view) {
      const ref = cp(EPI);
      return `${map.getZoom()}|${ref.x.toFixed(1)}|${ref.y.toFixed(1)}|${view.w}x${view.h}@${view.dpr}`;
    }
    function beginView(view) {
      L.DomUtil.setPosition(view.canvas, map.containerPointToLayerPoint([-VIEW_PAD, -VIEW_PAD]));
      const { g, dpr } = view;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, view.w, view.h);
      g.setTransform(dpr, 0, 0, dpr, VIEW_PAD * dpr, VIEW_PAD * dpr);
      return g;
    }
    const cp = latlng => map.latLngToContainerPoint(latlng);
    function pxPerMeter() {
      const a = cp(EPI);
      const b = cp([EPI[0], EPI[1] + 1000 / KX]);
      return (b.x - a.x) / 1000;
    }
    function tracePath(g, points) {
      g.beginPath();
      points.forEach((point, index) => {
        const p = cp(point);
        if (index) g.lineTo(p.x, p.y);
        else g.moveTo(p.x, p.y);
      });
    }

    // The shaking map, inside the barangay (a zone traced past its outline
    // stops there), revealed inside the wave front. Intensity zones tile
    // the barangay, so the weakest is laid over all of it and the others on
    // top: one set of edges, no seams between neighbouring zones. The
    // canvas's own opacity sets how strong the map looks. Redrawn only when
    // the front moves or the map does: once the wave has crossed the
    // barangay the picture holds still.
    function drawIntensity(front) {
      const revealing = front < farthestM + 60;
      const key = `${revealing ? Math.max(0, front).toFixed(1) : 'all'}|${viewKey(intensityView)}`;
      if (key === intensityView.key) return;
      intensityView.key = key;
      const g = beginView(intensityView);
      if (front <= 0) return;
      const ppm = pxPerMeter();
      const epi = cp(EPI);
      g.save();
      if (BOUNDARY.length) {
        worldTransform(g, intensityView);
        g.clip(boundaryPath, 'evenodd');
      }
      if (revealing) {
        screenTransform(g, intensityView);
        g.beginPath();
        g.arc(epi.x, epi.y, Math.max(0, front * ppm), 0, Math.PI * 2);
        g.clip();
      }
      worldTransform(g, intensityView);
      const layered = isIntensity && classes.length > 1 && BOUNDARY.length;
      if (layered) {
        g.fillStyle = rgb(classes[classes.length - 1].color);
        g.fill(boundaryPath, 'evenodd');
      }
      const drawn = layered ? classes.length - 1 : classes.length;
      for (let index = drawn - 1; index >= 0; index -= 1) {
        g.fillStyle = rgb(classes[index].color);
        g.fill(classPaths[index], 'evenodd');
      }
      screenTransform(g, intensityView);
      // Where the wave is crossing the barangay right now: a lit edge.
      if (revealing && BOUNDARY.length) {
        const radius = front * ppm;
        g.lineWidth = 14;
        g.strokeStyle = 'rgba(255,255,255,0.4)';
        g.beginPath();
        g.arc(epi.x, epi.y, Math.max(0, radius - 7), 0, Math.PI * 2);
        g.stroke();
        g.lineWidth = 2.5;
        g.strokeStyle = 'rgba(255,255,255,0.95)';
        g.beginPath();
        g.arc(epi.x, epi.y, Math.max(0, radius - 1.5), 0, Math.PI * 2);
        g.stroke();
      }
      g.restore();
    }

    function drawFx(t) {
      const g = beginView(fxView);
      const ppm = pxPerMeter();
      const epi = cp(EPI);
      g.save();
      g.lineCap = 'round';
      g.lineJoin = 'round';

      // The rupture: the fault lights up both ways from the epicenter.
      const [r0, r1] = T.rupture;
      if (t >= r0 && FAULT.length > 1) {
        const reach = Math.min((t - r0) * T.ruptureSpeed, Math.max(epiAlong, faultLen - epiAlong));
        const lit = faultSlice(Math.max(0, epiAlong - reach), Math.min(faultLen, epiAlong + reach));
        // Each new ring makes the fault flare a little.
        const sinceRing = t >= T.ring0 ? ((t - T.ring0) % T.ringGap) / T.ringGap : 1;
        const flare = t < T.ring0 + T.ringGap * T.rings ? 1 - easeOut(sinceRing) : 0;
        tracePath(g, lit);
        g.strokeStyle = `rgba(239,68,68,${(0.22 + 0.2 * flare).toFixed(3)})`;
        g.lineWidth = 14 + 6 * flare;
        g.stroke();
        g.strokeStyle = '#ef4444';
        g.lineWidth = 3.6;
        g.stroke();
        g.strokeStyle = 'rgba(254,226,226,0.95)';
        g.lineWidth = 1.3;
        g.stroke();
        if (t < r1) {
          [lit[0], lit[lit.length - 1]].forEach(point => {
            const p = cp(point);
            const glow = g.createRadialGradient(p.x, p.y, 0, p.x, p.y, 12);
            glow.addColorStop(0, 'rgba(255,255,255,0.95)');
            glow.addColorStop(0.35, 'rgba(254,202,202,0.8)');
            glow.addColorStop(1, 'rgba(239,68,68,0)');
            g.fillStyle = glow;
            g.beginPath();
            g.arc(p.x, p.y, 12, 0, Math.PI * 2);
            g.fill();
          });
        }
      }

      // The first jolt at the epicenter as the fault starts to break.
      const jolt = (t - r0) / 700;
      if (jolt >= 0 && jolt < 1) {
        const radius = 8 + 46 * easeOut(jolt);
        const glow = g.createRadialGradient(epi.x, epi.y, 0, epi.x, epi.y, radius);
        glow.addColorStop(0, `rgba(255,255,255,${(0.95 * (1 - jolt)).toFixed(3)})`);
        glow.addColorStop(0.3, `rgba(239,68,68,${(0.6 * (1 - jolt)).toFixed(3)})`);
        glow.addColorStop(1, 'rgba(239,68,68,0)');
        g.fillStyle = glow;
        g.beginPath();
        g.arc(epi.x, epi.y, radius, 0, Math.PI * 2);
        g.fill();
      }

      // The rings: one goes out every ringGap, like a radio signal, fading
      // as it travels.
      for (let k = 0; k < T.rings; k += 1) {
        const emitted = T.ring0 + k * T.ringGap;
        if (t < emitted) break;
        const meters = (t - emitted) * T.speed;
        if (meters > T.ringMax) continue;
        const f = meters / T.ringMax;
        const fade = Math.pow(1 - f, 1.25) * (k === 0 ? 1 : 0.78);
        const color = RING_NEAR.map((value, index) => Math.round(lerp(value, RING_FAR[index], f))).join(',');
        g.beginPath();
        g.arc(epi.x, epi.y, meters * ppm, 0, Math.PI * 2);
        g.strokeStyle = `rgba(${color},${(0.16 * fade).toFixed(3)})`;
        g.lineWidth = k === 0 ? 16 : 11;
        g.stroke();
        g.strokeStyle = `rgba(255,255,255,${(0.7 * fade).toFixed(3)})`;
        g.lineWidth = (k === 0 ? 3.2 : 2.4) + 2;
        g.stroke();
        g.strokeStyle = `rgba(${color},${(0.95 * fade).toFixed(3)})`;
        g.lineWidth = k === 0 ? 3.2 : 2.2;
        g.stroke();
        // The beacon at the epicenter as each ring leaves.
        const age = (t - emitted) / 480;
        if (age < 1) {
          const radius = 6 + 22 * easeOut(age);
          const glow = g.createRadialGradient(epi.x, epi.y, 0, epi.x, epi.y, radius);
          glow.addColorStop(0, `rgba(255,255,255,${(0.9 * (1 - age)).toFixed(3)})`);
          glow.addColorStop(0.4, `rgba(234,88,12,${(0.55 * (1 - age)).toFixed(3)})`);
          glow.addColorStop(1, 'rgba(234,88,12,0)');
          g.fillStyle = glow;
          g.beginPath();
          g.arc(epi.x, epi.y, radius, 0, Math.PI * 2);
          g.fill();
        }
      }
      g.restore();
    }

    // ---- the seismogram in the panel ----
    const startAmp = startRank === 0 ? 0.9 : 0.75;
    function motion(tau) {
      const noise = (hash(Math.floor(tau / 14)) - 0.5) * 0.06;
      const s = (tau - ARRIVE_START) / 1000;
      if (s < 0) return noise;
      const envelope = (1 - Math.exp(-s / 0.07)) * Math.exp(-s / 1.05);
      const wave = 0.62 * Math.sin(2 * Math.PI * 5.6 * s)
        + 0.3 * Math.sin(2 * Math.PI * 9.3 * s + 1.2)
        + 0.32 * (hash(Math.floor(tau / 11) + 5) - 0.5);
      return noise + startAmp * envelope * wave;
    }
    // The trace's size comes from a ResizeObserver and its colors are read
    // once per run (and on a resize or theme change), so a frame never makes
    // the browser lay out or restyle the page to draw it.
    const trace = { w: 0, h: 0, quiet: '#64748b', loud: '#c2410c', observer: null };
    function readTraceColors() {
      const styles = getComputedStyle(panel);
      trace.quiet = styles.getPropertyValue('--muted').trim() || '#64748b';
      trace.loud = styles.getPropertyValue('--shake-ink').trim() || '#c2410c';
    }
    function watchTrace() {
      const canvas = field('trace');
      if (!canvas || trace.observer || !window.ResizeObserver) return;
      trace.observer = new ResizeObserver(entries => {
        const box = entries[entries.length - 1].contentRect;
        trace.w = box.width;
        trace.h = box.height;
        readTraceColors();
        drawTrace(state.t);
      });
      trace.observer.observe(canvas);
    }
    function drawTrace(t) {
      const canvas = field('trace');
      const { w, h } = trace;
      if (!canvas || !w || !h) return;
      const dpr = Math.min(window.devicePixelRatio || 1, quality.low ? 1 : 1.5);
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
      }
      const g = canvas.getContext('2d');
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, w, h);
      const mid = h / 2;
      const amp = h * 0.46;
      const until = Math.min(t, T.hold);
      const penX = (until / T.hold) * w;
      const arriveX = (ARRIVE_START / T.hold) * w;
      const { quiet, loud } = trace;
      g.lineJoin = 'round';
      g.lineCap = 'round';
      const stroke = (fromX, toX, color, width) => {
        if (toX <= fromX) return;
        g.beginPath();
        for (let x = fromX; x <= toX; x += 1) {
          const y = mid - motion((x / w) * T.hold) * amp;
          if (x === fromX) g.moveTo(x, y);
          else g.lineTo(x, y);
        }
        g.strokeStyle = color;
        g.lineWidth = width;
        g.stroke();
      };
      stroke(0, Math.min(penX, arriveX), quiet, 1.3);
      stroke(arriveX, penX, loud, 1.5);
      if (t < T.hold) {
        g.fillStyle = penX >= arriveX ? loud : quiet;
        g.beginPath();
        g.arc(penX, mid - motion(until) * amp, 2.6, 0, Math.PI * 2);
        g.fill();
      }
    }

    function syncPanel(t) {
      const chapter = t < T.ring0 ? 0 : t < ARRIVE_START ? 1 : 2;
      const allDone = t >= T.hold;
      const key = allDone ? 3 : chapter;
      if (key !== state.chapter) {
        state.chapter = key;
        panel.querySelectorAll('.aco-step').forEach((item, index) => {
          item.classList.toggle('is-done', index < chapter || (allDone && index === chapter));
          item.classList.toggle('is-current', index === chapter && !allDone);
        });
        field('caption').textContent = `${STEPS[chapter].title}. ${STEPS[chapter].detail}`;
        options.onPanelChange?.();
      }
      const hit = t >= ARRIVE_START;
      if (hit !== state.meterHit) {
        state.meterHit = hit;
        field('meter').classList.toggle('is-hit', hit);
        field('value').textContent = hit ? startShakingText : 'Not yet';
      }
      drawTrace(t);
    }

    // ---- the camera and the shake ----
    function wideBounds() {
      const bounds = L.latLngBounds(boundaryPoints.length ? boundaryPoints : [START]);
      bounds.extend(EPI);
      bounds.extend(faultPointAt(epiAlong - 1400));
      bounds.extend(faultPointAt(epiAlong + 1400));
      return bounds;
    }
    const barangayBounds = () => L.latLngBounds(boundaryPoints.length ? boundaryPoints : [START, EPI]);

    // The map's picture jolts when the waves reach the start pin. It moves
    // by the CSS translate property, which adds to the transform Leaflet
    // pans the map with instead of replacing it; the map's own controls and
    // panels stay still.
    function shakeMap() {
      const mapPane = map.getPane('mapPane');
      if (!mapPane?.animate || prefersReducedMotion()) return;
      const frames = [];
      const steps = 26;
      const amplitude = startRank === 0 ? 6 : 5;
      for (let index = 0; index < steps; index += 1) {
        const a = amplitude * Math.pow(1 - index / steps, 1.6);
        frames.push({ translate: `${((hash(index * 3) * 2 - 1) * a).toFixed(2)}px ${((hash(index * 7 + 1) * 2 - 1) * a * 0.7).toFixed(2)}px` });
      }
      frames.push({ translate: '0px 0px' });
      state.shake = mapPane.animate(frames, { duration: 1400, easing: 'linear' });
    }

    // The mask outside the barangay is lighter while the fault and the
    // rings, outside it, are in view (style.css .quake-intro-wide).
    function setWideView(wide) {
      map.getContainer().classList.toggle('quake-intro-wide', wide);
    }

    // A class or a style written only when it changes: restyling the SVG
    // fault, or toggling a label, repaints part of the map.
    function setHidden(marker, hidden) {
      if (marker.hiddenNow === hidden) return;
      marker.hiddenNow = hidden;
      marker.getElement()?.classList.toggle('is-hidden', hidden);
    }

    function frame(t) {
      const fadeIn = ease((t - T.faultIn[0]) / (T.faultIn[1] - T.faultIn[0]));
      if (fadeIn !== state.faultFade) {
        state.faultFade = fadeIn;
        faultLine.setStyle({ opacity: fadeIn });
        faultCasing.setStyle({ opacity: 0.85 * fadeIn });
      }
      if (t >= T.rupture[0] && !map.hasLayer(epiMarker)) epiMarker.addTo(map);
      setHidden(faultLabel, t < T.faultIn[1] || state.zoomed);
      setHidden(placeLabel, t < 200 || state.hit || state.zoomed);

      drawIntensity((t - T.ring0) * T.speed);
      drawFx(t);

      if (!state.hit && t >= ARRIVE_START) {
        state.hit = true;
        shakeMap();
        showCallout();
      }
      if (!state.zoomed && t >= T.zoomIn) {
        state.zoomed = true;
        setWideView(false);
        map.flyToBounds(barangayBounds(), mapMoveOptions({ ...(options.getPadding?.() || {}), duration: T.zoomInMs / 1000 }));
      }
      syncPanel(t);
    }

    function loop(now) {
      if (!state.running) return;
      const dt = Math.min(64, now - state.last);
      noteFrame(dt);
      state.t += dt;
      state.last = now;
      frame(state.t);
      if (state.t >= T.hold) {
        end();
        return;
      }
      state.raf = requestAnimationFrame(loop);
    }

    function onVisibilityChange() {
      cancelAnimationFrame(state.raf);
      if (state.running && !document.hidden) {
        state.last = performance.now();
        state.raf = requestAnimationFrame(loop);
      }
    }

    function onKeyDown(event) {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      if (document.querySelector('[aria-modal="true"]:not([hidden])')) return;
      event.preventDefault();
      skip();
    }

    const mapHandlers = {
      resize: () => sizeViews(),
    };

    function addLayers() {
      if (state.layersOn) return;
      state.layersOn = true;
      [INTENSITY_PANE, FX_PANE, FAULT_PANE].forEach(name => {
        const pane = map.getPane(name);
        pane.style.transition = '';
        pane.style.opacity = '';
      });
      intensityView.canvas.style.opacity = String(INTENSITY_ALPHA);
      sizeViews();
      faultCasing.addTo(map);
      faultLine.addTo(map);
      faultLabel.addTo(map);
      placeLabel.addTo(map);
      if (options.showCredit) map.attributionControl?.addAttribution(FAULT_CREDIT);
      map.on(mapHandlers);
    }

    function removeLayers() {
      trace.observer?.disconnect();
      trace.observer = null;
      if (!state.layersOn) return;
      state.layersOn = false;
      map.off(mapHandlers);
      map.attributionControl?.removeAttribution(FAULT_CREDIT);
      if (state.redraw) map.off('move zoomend', state.redraw);
      state.shake?.cancel();
      setWideView(false);
      markers.forEach(marker => marker.remove());
      faultCasing.remove();
      faultLine.remove();
      faultRenderer.remove();
      views.forEach(view => {
        view.canvas.width = 0;
        view.canvas.height = 0;
        view.canvas.remove();
      });
      [INTENSITY_PANE, FX_PANE, FAULT_PANE].forEach(name => {
        const pane = map.getPane(name);
        pane.style.transition = '';
        pane.style.opacity = '';
      });
    }

    // The intro's own layers fade out while the replay's come in (the
    // labels and the callout go at once); then they are removed.
    function fadeOutLayers() {
      if (!state.layersOn) return;
      callout?.remove();
      faultLabel.remove();
      placeLabel.remove();
      epiMarker.remove();
      setWideView(false);
      const ms = prefersReducedMotion() ? 0 : FADE_OUT_MS;
      [INTENSITY_PANE, FX_PANE, FAULT_PANE].forEach(name => {
        const pane = map.getPane(name);
        pane.style.transition = `opacity ${ms}ms ease`;
        pane.style.opacity = '0';
      });
      state.fadeTimer = window.setTimeout(removeLayers, ms + 60);
    }

    // The intro's last frame stays up (redrawn as the camera moves on)
    // until the replay is ready to fade it out.
    function holdLastFrame() {
      state.redraw = () => {
        if (!state.layersOn) return;
        drawIntensity(Infinity);
        drawFx(T.hold + 2000);
      };
      map.on('move zoomend', state.redraw);
      state.redraw();
    }

    function end() {
      if (state.done) return;
      state.done = true;
      state.running = false;
      cancelAnimationFrame(state.raf);
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      if (state.layersOn) {
        state.t = Math.max(state.t, T.hold);
        if (!state.hit) {
          state.hit = true;
          showCallout();
        }
        syncPanel(T.hold);
        holdLastFrame();
      }
      state.resolve?.();
    }

    function skip() {
      end();
    }

    // Starts the intro; resolves once it has played or been skipped.
    function start() {
      return new Promise(resolve => {
        state.resolve = resolve;
        if (state.done) {
          resolve();
          return;
        }
        addLayers();
        renderLegend();
        readTraceColors();
        watchTrace();
        setWideView(true);
        document.addEventListener('keydown', onKeyDown);
        document.addEventListener('visibilitychange', onVisibilityChange);
        state.running = true;
        state.last = performance.now();
        frame(0);
        state.raf = requestAnimationFrame(loop);
      });
    }

    // Leaves the map: fades its layers out (fade) or removes them at once.
    function destroy({ fade = false } = {}) {
      end();
      window.clearTimeout(state.fadeTimer);
      if (fade) fadeOutLayers();
      else removeLayers();
    }

    syncPanel(0);

    return {
      kind: 'earthquake',
      panel,
      start,
      skip,
      destroy,
      buildSummary,
      getBounds: wideBounds,
      // What the camera shows now: the fault and the barangay, then the
      // barangay alone.
      getViewBounds: () => (state.zoomed ? barangayBounds() : wideBounds()),
      isDone: () => state.done,
    };
  }

  // Whether a result can play the intro: it needs its scenario.
  function canPlay(result) {
    const scenario = result?.earthquake_scenario;
    return !!(scenario && Array.isArray(scenario.epicenter) && Array.isArray(scenario.fault) && scenario.fault.length > 1);
  }

  window.quakeIntro = { create, canPlay };
})();
