// The flood scenario, played before a flood run's ant replay (script.js
// prepareSimulationReplay): a 25-year rain falls on the barangay, rainwater
// gathers on the lowest ground first and spreads and deepens (Low, then
// Medium, then High) until the barangay's Project NOAH flood map is
// complete, while a gauge in the panel shows the water rising on an adult at
// the start pin. Then the ants' search (aco-replay.js) takes over.
//
// How the water spreads is an illustration, not a flood model: each 5 m cell
// of the map has a fill time built from the flood map alone
// (flood_scenario.py, GET /flood/scenario). Where the water ends and how deep
// it gets is the map itself; the panel says so.
(function initFloodIntro() {
  const WATER_PANE = 'floodIntroPane';
  const FX_PANE = 'floodIntroFxPane';
  // Over the hazard fills (350), under the ants' trails (380), the barangay
  // outline and its mask (overlayPane, 400) and the pins (markerPane, 600).
  const WATER_PANE_Z = 352;
  const FX_PANE_Z = 360;
  // The canvases reach this far past each edge of the map.
  const VIEW_PAD = 40;
  // The flood map's paths are projected once, at this zoom.
  const REF_ZOOM = 18;
  const FADE_OUT_MS = 700;
  const NOAH = 'Project NOAH';
  // Phones with few cores or little memory start on the light setting (1x
  // canvases, half the rain, the water repainted every other frame), and so
  // does any device whose intro frames average slower than SLOW_FRAME_MS.
  // Kept for the session: a slow device stays slow.
  const SLOW_FRAME_MS = 26;
  const quality = {
    low: (navigator.hardwareConcurrency || 8) <= 4 || (navigator.deviceMemory || 8) <= 3,
    frameAvg: 16.7,
    frames: 0,
  };

  // The timeline, in ms.
  const T = {
    rainIn: 800,
    riseStart: 1900,
    riseEnd: 8200,
    rainFade: [6200, 8800],
    minRise: 2000, // "Water rises" stays up at least this long
    dryAt: 6600, // a dry start: when the panel says the water stayed away
    hold: 10200, // the ants take over
  };
  // The water level W rises from 0 to W_MAX. A cell is wet once W passes its
  // fill time (0..1), Medium-deep MEDIUM_AFTER later and High-deep
  // HIGH_AFTER later, each only where the flood map has that level. SOFT
  // eases each change in; EDGE is the bright line where the water spreads.
  const MEDIUM_AFTER = 0.1;
  const HIGH_AFTER = 0.22;
  const SOFT = 0.035;
  const EDGE = 0.03;
  const W_MAX = 1 + HIGH_AFTER + SOFT + 0.01;
  const FILL_STEPS = 250;
  const FILL_NEVER = 255;

  // Project NOAH's classes, in the homepage's words: the depth range, how
  // high it reaches on an adult (script.js FLOOD_DEPTH_ON_ADULT_BY_VAR) and
  // whether it can be walked.
  const LEVELS = {
    1: { name: 'Low', range: 'Up to 0.5 m', deep: 'up to 0.5 m deep', lower: 0, upper: 0.5, walk: 'Walkable' },
    2: { name: 'Medium', range: '0.5–1.5 m', deep: '0.5 to 1.5 m deep', lower: 0.5, upper: 1.5, walk: 'Risky' },
    3: { name: 'High', range: 'Over 1.5 m', deep: 'over 1.5 m deep', lower: 1.5, upper: 2.15, walk: 'Not walkable' },
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
  const hexRgb = hex => [1, 3, 5].map(at => parseInt(String(hex).slice(at, at + 2), 16));
  const lowerFirst = text => text.charAt(0).toLowerCase() + text.slice(1);
  const pct = share => `${Math.round(share * 100)}%`;
  const CHECK = '<svg viewBox="0 0 24 24"><path d="m5 12 5 5 9-10"/></svg>';

  function ensurePane(map, name, zIndex) {
    const pane = map.getPane(name) || map.createPane(name);
    pane.style.zIndex = String(zIndex);
    pane.style.pointerEvents = 'none';
    return pane;
  }

  // Web Mercator at REF_ZOOM as Leaflet projects it (EPSG:3857), written
  // out: the flood map's thousands of points go through it while the loader
  // shows, and Leaflet's own projection allocates an object per point.
  const MERCATOR_SCALE = 256 * Math.pow(2, REF_ZOOM);
  const MAX_LATITUDE = 85.0511287798;
  const mercX = lng => (lng / 360 + 0.5) * MERCATOR_SCALE;
  const mercY = lat => {
    const s = Math.sin((Math.max(-MAX_LATITUDE, Math.min(MAX_LATITUDE, lat)) * Math.PI) / 180);
    return (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * MERCATOR_SCALE;
  };

  // ---- the scenario's download ----
  // One per barangay, kept for the session (the server answers 304 to a
  // repeat). The grid arrives as base64 and is unpacked once.
  const scenarios = new Map();
  function load(barangay) {
    if (!barangay) return Promise.reject(new Error('Barangay is required for the flood scenario.'));
    if (scenarios.has(barangay)) return scenarios.get(barangay);
    const request = (async () => {
      const base = window.BACKEND_BASE || window.location.origin;
      const response = await fetch(`${base}/flood/scenario?barangay=${encodeURIComponent(barangay)}`);
      const data = await response.json();
      if (!response.ok || data?.error || !data?.grid) {
        throw new Error(data?.message || 'Failed to load the flood scenario.');
      }
      const unpack = text => {
        const binary = atob(text);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
        return bytes;
      };
      return {
        ...data,
        grid: { ...data.grid, fill: unpack(data.grid.fill), level: unpack(data.grid.level) },
      };
    })();
    scenarios.set(barangay, request);
    request.catch(() => scenarios.delete(barangay));
    return request;
  }

  // options:
  //   map, scenario (load()), floodLayers: the flood map (flood.js
  //     loadHazardLayers, every level), boundaryRings: the barangay's rings
  //     of {lat, lng}, barangay: its name
  //   start: { lat, lng, label }, startLevel: the flood map's level there
  //     (result.flood_scenario.start_level: 0 dry, 1 Low, 2 Medium, 3 High)
  //   toEvacuationSite: the run goes to an evacuation site
  //   legendBody: the map legend's body; legendPins: its pin rows (HTML)
  //   getPadding(): fitBounds padding that keeps clear of the panels
  //   onPanelChange(): the panel's content changed size
  //   showCredit: name the flood map's source in the map's attribution
  function create(options) {
    const { map, scenario } = options;
    const G = scenario.grid;
    const barangay = options.barangay || scenario.barangay || 'the barangay';
    const startLabel = options.start?.label || 'the start';
    const START = [Number(options.start.lat), Number(options.start.lng)];
    const START_LEVEL = Math.max(0, Math.min(3, Number(options.startLevel) || 0));
    const BOUNDARY = (options.boundaryRings || [])
      .map(ring => ring.map(point => [Number(point.lat), Number(point.lng)]))
      .filter(ring => ring.length >= 3);
    const styles = window.floodHazardUI?.layerStyles || {};
    const COLORS = {
      1: hexRgb(styles[1]?.fillColor || '#facc15'),
      2: hexRgb(styles[2]?.fillColor || '#f97316'),
      3: hexRgb(styles[3]?.fillColor || '#e11d48'),
    };
    const ALPHAS = {
      1: styles[1]?.fillOpacity ?? 0.32,
      2: styles[2]?.fillOpacity ?? 0.36,
      3: styles[3]?.fillOpacity ?? 0.42,
    };
    const credit = `Flood depths: ${NOAH}`;

    // ---- timing at the start pin ----
    function waterLevel(t) {
      const x = clamp01((t - T.riseStart) / (T.riseEnd - T.riseStart));
      return W_MAX * lerp(x, ease(x), 0.35);
    }
    function timeAtLevel(W) {
      if (W <= 0) return T.riseStart;
      for (let t = T.riseStart; t <= T.riseEnd; t += 10) {
        if (waterLevel(t) >= W) return t;
      }
      return T.riseEnd;
    }
    // The fill time where the start is (or of the nearest wet cell within
    // about 60 m: the pin can sit just past a zone's edge).
    const startFill = (() => {
      const ci = Math.round((START[1] - G.west) / G.cell_lng - 0.5);
      const cj = Math.round((G.north - START[0]) / G.cell_lat - 0.5);
      for (let r = 0; r <= 12; r += 1) {
        let best = FILL_NEVER;
        for (let j = cj - r; j <= cj + r; j += 1) {
          for (let i = ci - r; i <= ci + r; i += 1) {
            if (i < 0 || j < 0 || i >= G.nx || j >= G.ny) continue;
            best = Math.min(best, G.fill[j * G.nx + i]);
          }
        }
        if (best < FILL_NEVER) return best / FILL_STEPS;
      }
      return 0.5;
    })();
    const ARRIVE = START_LEVEL ? timeAtLevel(startFill) : Infinity;
    // "Water reaches" opens once the water at the start is as deep as it
    // gets, so its text and the gauge say the same.
    const settledAt = START_LEVEL
      ? timeAtLevel(startFill + { 1: 0.02, 2: MEDIUM_AFTER + 0.02, 3: HIGH_AFTER + 0.06 }[START_LEVEL])
      : T.dryAt;
    const CHAPTER2_AT = Math.max(settledAt, T.riseStart + T.minRise);

    // ---- the steps ----
    const shares = scenario.shares || {};
    const flooded = [1, 2, 3].reduce((sum, k) => sum + (Number(shares[k]) || 0), 0);
    const highShare = Number(shares[3]) || 0;
    function riseText() {
      const intro = 'Rainwater gathers on the lowest ground first, then spreads and gets deeper.';
      if (flooded < 0.005) return `${intro} In this scenario ${barangay} stays almost dry.`;
      const highPart = highShare < 0.05 ? 'a small part of the barangay'
        : Math.abs(highShare - 0.5) < 0.03 ? 'half of the barangay'
        : `${pct(highShare)} of the barangay`;
      const high = highShare < 0.001 ? '' : `, and ${highPart} ends up more than 1.5 m deep`;
      return `${intro} In this scenario ${pct(flooded)} of ${barangay} floods${high}.`;
    }
    const next = `Next, the ants look for the least flooded way to ${options.toEvacuationSite ? 'an evacuation site' : 'your destination'}.`;
    const startText = (() => {
      if (!START_LEVEL) {
        return { title: `Water stays away from ${startLabel}`, detail: `${startLabel} stays dry in this scenario. ${next}` };
      }
      const level = LEVELS[START_LEVEL];
      const advice = { 1: 'Walk with care.', 2: 'Walking through it is risky.', 3: "Don't walk through water this deep." }[START_LEVEL];
      return {
        title: `Water reaches ${startLabel}`,
        detail: `${level.name} flood here: ${level.deep}, ${lowerFirst(FLOOD_DEPTH_ON_ADULT_BY_VAR[START_LEVEL])}. ${advice} ${next}`,
      };
    })();
    const STEPS = [
      {
        title: 'Heavy rain falls',
        detail: `A ${scenario.return_period_years || 25}-year rain falls on ${barangay}: rain this heavy has about a 1 in ${scenario.return_period_years || 25} chance of falling in any year.`,
      },
      { title: 'Water rises', detail: riseText() },
      startText,
    ];

    const state = {
      t: 0,
      last: 0,
      raf: 0,
      running: false,
      done: false,
      resolve: null,
      chapter: -1,
      layersOn: false,
      fadeTimer: 0,
      gaugeKey: '',
      labelHidden: null,
      calloutLevel: -1,
      frame: 0,
    };

    // The depth gauge's scale: 32 units a metre, the street at y 78 (0.5 m
    // at 62, 1.5 m at 30). The adult is the homepage's 163 cm figure; the
    // bar beside it, the depth classes.
    const GAUGE = { ground: 78, perM: 32, left: 16, right: 92 };
    const gy = meters => GAUGE.ground - meters * GAUGE.perM;

    // ---- the panel ----
    const source = `<span class="src-name">${NOAH}</span>`;
    const panel = document.createElement('section');
    panel.className = 'aco-replay flood-intro';
    panel.setAttribute('aria-label', 'Flood scenario');
    panel.innerHTML = `
      <div class="safety-section-label aco-replay-label">Flood scenario</div>
      <div class="safety-route-chip aco-replay-chip">${safetyIcon('droplet')}<span>${scenario.return_period_years || 25}-year flood · Heavy rain</span></div>
      <ol class="aco-steps">
        ${STEPS.map(step => `
          <li class="aco-step">
            <span class="aco-step-icon" aria-hidden="true"><i></i>${CHECK}</span>
            <span class="aco-step-text"><span class="aco-step-title">${escapeHtml(step.title)}</span><span class="aco-step-detail">${escapeHtml(step.detail)}</span></span>
          </li>`).join('')}
      </ol>
      <button type="button" class="aco-replay-more" aria-expanded="false" aria-controls="msimSheetScroll">More</button>
      <div class="flood-meter" data-flood="meter">
        <div class="flood-meter-main">
          ${sceneSvg()}
          <div class="flood-meter-text">
            <div class="flood-meter-label">At ${escapeHtml(startLabel)}</div>
            <div class="flood-meter-value" data-flood="value">Dry so far</div>
            <div class="flood-meter-sub" data-flood="sub">No water here yet</div>
          </div>
        </div>
        <div class="flood-meter-foot"><b>${scenario.return_period_years || 25}-year flood</b><span>Walking: <span class="flood-meter-walk" data-flood="walk">—</span></span></div>
      </div>
      <div class="aco-replay-foot">
        <p class="aco-replay-meta"><span class="aco-meta-long">How the water spreads is drawn for illustration and sped up. Where it ends and how deep it gets come from the ${source} ${scenario.return_period_years || 25}-year flood map of ${escapeHtml(barangay)}.</span><span class="aco-meta-short">Sped up · ${source} map</span></p>
        <button type="button" class="aco-replay-skip">Skip to ant search</button>
      </div>
      <p class="sr-only" aria-live="polite" data-flood="caption"></p>`;
    panel.querySelector('.aco-replay-skip').addEventListener('click', () => skip());
    // Looked up once: the gauge is redrawn every frame.
    const fields = {};
    const field = name => {
      if (!fields[name]) fields[name] = panel.querySelector(`[data-flood="${name}"]`);
      return fields[name];
    };
    const bars = [...panel.querySelectorAll('.fs-bar')];

    // One line for the replay's panel once the intro is over.
    function buildSummary() {
      const summary = document.createElement('div');
      summary.className = 'quake-summary';
      const at = START_LEVEL ? `${LEVELS[START_LEVEL].name} water at` : 'no flooding at';
      summary.innerHTML = `<span class="aco-step-icon" aria-hidden="true">${CHECK}</span>
        <span><b>Flood scenario</b>${scenario.return_period_years || 25}-year flood · ${escapeHtml(at)} ${escapeHtml(startLabel)}</span>`;
      return summary;
    }

    // ---- the depth gauge ----
    function sceneSvg() {
      const s = GAUGE.perM / 96.93;
      const tx = 52 - 170 * s;
      const ty = GAUGE.ground - 198 * s;
      const bar = (k, from, to) => `<rect class="fs-bar" data-level="${k}" x="6" y="${gy(to).toFixed(1)}" width="5" height="${(gy(from) - gy(to)).toFixed(1)}" fill="${rgb(COLORS[k])}"/>`;
      return `<svg class="flood-scene" viewBox="0 0 92 84" aria-hidden="true">
        <rect class="fs-sky" width="92" height="84"/>
        <g transform="translate(${tx.toFixed(2)} ${ty.toFixed(2)}) scale(${s.toFixed(4)})">
          <circle class="fs-figure" cx="170" cy="52" r="12"/>
          <path class="fs-figure" d="M156 69 Q170 63 184 69 L186 113 Q170 118 154 113 Z"/>
          <path class="fs-limb" d="M157 72 L149 111 M183 72 L191 111" stroke-width="7"/>
          <path class="fs-limb" d="M163 113 L162 198 M177 113 L178 198" stroke-width="9.5"/>
        </g>
        <path class="fs-band" data-flood="band" d=""/>
        <rect class="fs-solid" data-flood="solid" x="${GAUGE.left}" y="${GAUGE.ground}" width="${GAUGE.right - GAUGE.left}" height="0"/>
        <path class="fs-line" data-flood="line" d=""/>
        <rect class="fs-street" y="${GAUGE.ground}" width="92" height="6"/>
        ${bar(1, 0, 0.5)}${bar(2, 0.5, 1.5)}${bar(3, 1.5, 2.25)}
      </svg>`;
    }
    // How deep the water at the start is, in metres, x past its fill time:
    // it passes 0.5 m as the map turns Medium there and 1.5 m as it turns
    // High, and stops at the top of the start's level.
    function depthAt(x) {
      if (x <= 0 || !START_LEVEL) return 0;
      let meters;
      if (x < MEDIUM_AFTER) meters = (0.5 * x) / MEDIUM_AFTER;
      else if (x < HIGH_AFTER) meters = 0.5 + (x - MEDIUM_AFTER) / (HIGH_AFTER - MEDIUM_AFTER);
      else meters = 1.5 + 0.65 * clamp01((x - HIGH_AFTER) / 0.12);
      return Math.min(meters, LEVELS[START_LEVEL].upper);
    }
    const levelOfDepth = meters => (meters <= 0 ? 0 : meters > 1.5 ? 3 : meters > 0.5 ? 2 : 1);
    function drawGauge(t) {
      const depth = depthAt(waterLevel(t) - startFill);
      const level = levelOfDepth(depth);
      const solid = field('solid');
      const line = field('line');
      const band = field('band');
      if (depth <= 0) {
        if (state.gaugeDepth !== 0) {
          solid.setAttribute('y', GAUGE.ground);
          solid.setAttribute('height', 0);
          line.setAttribute('d', '');
          band.setAttribute('d', '');
        }
      } else {
        // Solid up to the bottom of the start's level, lighter above it to
        // the top of that level: the depth is somewhere in that range.
        const solidM = Math.min(depth, LEVELS[START_LEVEL].lower);
        const solidY = gy(solidM);
        solid.setAttribute('y', solidY.toFixed(2));
        solid.setAttribute('height', (GAUGE.ground - solidY).toFixed(2));
        const top = gy(depth);
        const phase = t / 380;
        let wave = '';
        for (let x = GAUGE.left; x <= GAUGE.right; x += 4) {
          wave += `${x === GAUGE.left ? 'M' : 'L'}${x} ${(top + Math.sin(x / 6.5 + phase) * 1.1).toFixed(2)}`;
        }
        line.setAttribute('d', wave);
        band.setAttribute('d', depth > solidM ? `${wave}L${GAUGE.right} ${solidY.toFixed(2)}L${GAUGE.left} ${solidY.toFixed(2)}Z` : '');
      }
      state.gaugeDepth = depth;
      // The level's colors and words change only a few times a run.
      const hit = START_LEVEL ? level > 0 : t >= CHAPTER2_AT;
      const key = `${level}|${hit}`;
      if (key === state.gaugeKey) return level;
      state.gaugeKey = key;
      bars.forEach(item => {
        item.style.opacity = level && Number(item.dataset.level) !== level ? '0.3' : '1';
      });
      const meter = field('meter');
      meter.classList.toggle('is-hit', hit);
      meter.dataset.level = String(START_LEVEL ? level : 0);
      let texts;
      if (!START_LEVEL) {
        texts = hit ? ['No flooding', 'Dry in this scenario', 'Walkable'] : ['Dry so far', 'No water here yet', 'Walkable'];
      } else if (!level) {
        texts = ['Dry so far', 'No water here yet', '—'];
      } else {
        texts = [`${LEVELS[level].name} flood`, `${LEVELS[level].range} · ${lowerFirst(FLOOD_DEPTH_ON_ADULT_BY_VAR[level])}`, LEVELS[level].walk];
      }
      field('value').textContent = texts[0];
      field('sub').textContent = texts[1];
      field('walk').textContent = texts[2];
      return level;
    }

    function chapterAt(t) {
      if (t < T.riseStart) return 0;
      return t < CHAPTER2_AT ? 1 : 2;
    }
    function syncPanel(t) {
      const chapter = chapterAt(t);
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
      return drawGauge(t);
    }

    // ---- the legend ----
    const LAND = [238, 241, 244];
    const onMap = (color, alpha) => color.map((value, index) => Math.round(lerp(LAND[index], value, alpha)));
    function renderLegend() {
      if (!options.legendBody) return;
      const row = (swatch, label) => `<div class="legend-row">${swatch}<span>${escapeHtml(label)}</span></div>`;
      const levels = [1, 2, 3].map(k => (
        `<span><i style="background:${rgb(onMap(COLORS[k], Math.min(1, ALPHAS[k] * 1.6)))}"></i><span class="flood-depth-name">${LEVELS[k].name}</span>${escapeHtml(LEVELS[k].range)}</span>`
      )).join('');
      // The scenario's own key can go where room is short (style.css).
      options.legendBody.innerHTML = `<div class="aco-legend">
        <div class="quake-levels"><b>Flood depth</b><div class="flood-depth-legend">${levels}</div></div>
        <div class="quake-legend-keys">
          ${row('<svg class="legend-sym" viewBox="0 0 22 16" aria-hidden="true"><path d="M8 2 5 11M14 2l-3 9M19 4l-2 6" stroke="#1e4078" stroke-width="1.6" stroke-linecap="round"/><ellipse cx="11" cy="13.5" rx="4" ry="1.8" fill="none" stroke="#1e4078" stroke-width="1.1"/></svg>', 'Heavy rain')}
        </div>
        <div class="aco-legend-pins">${options.legendPins || ''}</div>
      </div>`;
    }

    // ---- map layers ----
    ensurePane(map, WATER_PANE, WATER_PANE_Z);
    ensurePane(map, FX_PANE, FX_PANE_Z);
    const markers = [];
    // The barangay's name at the middle of its outline, while the rain falls.
    const placeAt = (() => {
      const ring = BOUNDARY.reduce((best, item) => (item.length > (best?.length || 0) ? item : best), null) || [START];
      let area = 0;
      let cy = 0;
      let cx = 0;
      ring.forEach((point, index) => {
        const nextPoint = ring[(index + 1) % ring.length];
        const cross = point[1] * nextPoint[0] - nextPoint[1] * point[0];
        area += cross;
        cx += (point[1] + nextPoint[1]) * cross;
        cy += (point[0] + nextPoint[0]) * cross;
      });
      return Math.abs(area) > 1e-12 ? [cy / (3 * area), cx / (3 * area)] : ring[0];
    })();
    const placeLabel = L.marker(placeAt, {
      interactive: false,
      keyboard: false,
      zIndexOffset: -100,
      icon: L.divIcon({
        className: 'quake-label quake-label--place is-hidden',
        html: `<span style="transform:translate(-50%,-50%)">${escapeHtml(barangay)}</span>`,
        iconSize: [0, 0],
      }),
    });
    markers.push(placeLabel);
    let callout = null;

    // The label over the start pin: made once, then only its swatch and
    // words change as the water deepens.
    function showCallout(level) {
      if (callout && state.calloutLevel === level) return;
      state.calloutLevel = level;
      const swatch = level ? `background:${rgb(COLORS[level])}` : 'background:#ffffff;box-shadow:inset 0 0 0 2px #16a34a';
      const title = level ? `${LEVELS[level].name} flood` : 'No flooding';
      const small = level ? `${LEVELS[level].range} deep` : 'Dry in this scenario';
      const element = callout?.getElement();
      if (element) {
        element.querySelector('.quake-callout-swatch').style.cssText = swatch;
        element.querySelector('b').textContent = title;
        element.querySelector('small').textContent = small;
        return;
      }
      callout = L.marker(START, {
        interactive: false,
        keyboard: false,
        zIndexOffset: 1500,
        icon: L.divIcon({
          className: 'quake-callout',
          iconSize: [0, 0],
          iconAnchor: [0, 60],
          html: `<div class="quake-callout-box"><div class="quake-callout-in"><span class="quake-callout-swatch" style="${swatch}"></span><span><b>${escapeHtml(title)}</b><small>${escapeHtml(small)}</small></span></div></div>`,
        }),
      }).addTo(map);
      markers.push(callout);
    }

    // ---- canvases over the map ----
    function makeView(paneName, className) {
      const canvas = L.DomUtil.create('canvas', `${className} leaflet-zoom-hide`, map.getPane(paneName));
      return { canvas, g: canvas.getContext('2d'), w: 0, h: 0, dpr: 1, key: '', empty: true };
    }
    const waterView = makeView(WATER_PANE, 'flood-water-canvas');
    const fxView = makeView(FX_PANE, 'flood-fx-canvas');
    const views = [waterView, fxView];
    function sizeViews() {
      const size = map.getSize();
      // Soft fills and thin rain need no 2x canvas; a slow phone gets 1x.
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
        view.empty = true;
      });
    }
    function noteFrame(dt) {
      quality.frames += 1;
      quality.frameAvg += (dt - quality.frameAvg) * 0.1;
      if (!quality.low && quality.frames > 20 && quality.frameAvg > SLOW_FRAME_MS) {
        quality.low = true;
        sizeViews();
      }
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

    // The barangay and the flood map's outline as paths, projected once at
    // REF_ZOOM around the start: any view is the same picture scaled and
    // moved (Web Mercator), so a frame reprojects nothing. The water is drawn
    // inside both, so its edges are the map's own.
    const refX = mercX(START[1]);
    const refY = mercY(START[0]);
    // A ring of [lat, lng] (the barangay's), or of GeoJSON [lng, lat].
    function addRing(path, ring, lngFirst) {
      ring.forEach((point, index) => {
        const x = mercX(Number(lngFirst ? point[0] : point[1])) - refX;
        const y = mercY(Number(lngFirst ? point[1] : point[0])) - refY;
        if (index) path.lineTo(x, y);
        else path.moveTo(x, y);
      });
      path.closePath();
    }
    const boundaryPath = new Path2D();
    BOUNDARY.forEach(ring => addRing(boundaryPath, ring, false));
    // Only the flood areas that reach into the barangay: the map's flood
    // layer runs well past it, and every point here costs time behind the
    // loader.
    const box = BOUNDARY.length ? BOUNDARY.flat().reduce((b, [lat, lng]) => ({
      south: Math.min(b.south, lat - 0.0005),
      north: Math.max(b.north, lat + 0.0005),
      west: Math.min(b.west, lng - 0.0005),
      east: Math.max(b.east, lng + 0.0005),
    }), { south: Infinity, north: -Infinity, west: Infinity, east: -Infinity }) : null;
    function reachesBarangay(ring) {
      if (!box) return true;
      let south = Infinity;
      let north = -Infinity;
      let west = Infinity;
      let east = -Infinity;
      ring.forEach(([lng, lat]) => {
        if (lat < south) south = lat;
        if (lat > north) north = lat;
        if (lng < west) west = lng;
        if (lng > east) east = lng;
      });
      return south <= box.north && north >= box.south && west <= box.east && east >= box.west;
    }
    const floodPath = new Path2D();
    (options.floodLayers?.features || []).forEach(feature => {
      const geometry = feature.geometry;
      const polygons = geometry?.type === 'Polygon' ? [geometry.coordinates]
        : geometry?.type === 'MultiPolygon' ? geometry.coordinates : [];
      polygons.forEach(polygon => {
        if (!polygon.length || !reachesBarangay(polygon[0])) return;
        polygon.forEach(ring => addRing(floodPath, ring, true));
      });
    });
    function worldTransform(g, view) {
      const s = Math.pow(2, map.getZoom() - REF_ZOOM);
      const ref = cp(START);
      g.setTransform(view.dpr * s, 0, 0, view.dpr * s, view.dpr * (VIEW_PAD + ref.x), view.dpr * (VIEW_PAD + ref.y));
    }
    function viewKey(view) {
      const ref = cp(START);
      return `${map.getZoom()}|${ref.x.toFixed(1)}|${ref.y.toFixed(1)}|${view.w}x${view.h}@${view.dpr}`;
    }

    // ---- the water picture ----
    // One pixel per grid cell. A cell turns Low as the water reaches it,
    // then Medium and High as it deepens (only up to its own level), with a
    // bright line on the spreading edge. The cells are sorted by fill time,
    // so a frame repaints only those whose look can change at the current
    // level (about a quarter of them); the picture is then stretched over
    // the map inside the flood map's outline.
    const water = document.createElement('canvas');
    water.width = G.nx;
    water.height = G.ny;
    const waterG = water.getContext('2d');
    const waterImg = waterG.createImageData(G.nx, G.ny);
    const waterPx = new Uint32Array(waterImg.data.buffer);
    const LITTLE_ENDIAN = new Uint8Array(new Uint32Array([1]).buffer)[0] === 1;
    const pack = (r, g, b, a) => (LITTLE_ENDIAN
      ? ((a << 24) | (b << 16) | (g << 8) | r)
      : ((r << 24) | (g << 16) | (b << 8) | a)) >>> 0;
    const bucketStart = new Uint32Array(FILL_STEPS + 2);
    let bucketCells = new Uint32Array(0);
    {
      const counts = new Uint32Array(FILL_STEPS + 1);
      for (let i = 0; i < G.fill.length; i += 1) if (G.fill[i] <= FILL_STEPS && G.level[i]) counts[G.fill[i]] += 1;
      let sum = 0;
      for (let v = 0; v <= FILL_STEPS; v += 1) {
        bucketStart[v] = sum;
        sum += counts[v];
      }
      bucketStart[FILL_STEPS + 1] = sum;
      bucketCells = new Uint32Array(sum);
      const nextSlot = bucketStart.slice(0, FILL_STEPS + 1);
      for (let i = 0; i < G.fill.length; i += 1) {
        if (G.fill[i] <= FILL_STEPS && G.level[i]) {
          bucketCells[nextSlot[G.fill[i]]] = i;
          nextSlot[G.fill[i]] += 1;
        }
      }
    }
    // A cell of level k, x past its fill time.
    function cellColor(x, k) {
      if (x <= 0) return 0;
      const m = k >= 2 ? clamp01((x - MEDIUM_AFTER) / SOFT) : 0;
      const h = k >= 3 ? clamp01((x - HIGH_AFTER) / SOFT) : 0;
      const channel = c => lerp(lerp(COLORS[1][c], COLORS[2][c], m), COLORS[3][c], h);
      let r = channel(0);
      let g = channel(1);
      let b = channel(2);
      let a = lerp(lerp(ALPHAS[1], ALPHAS[2], m), ALPHAS[3], h) * clamp01(x / SOFT);
      const edge = x < EDGE ? 1 - Math.abs(x - EDGE / 2) / (EDGE / 2) : 0;
      if (edge > 0) {
        r = lerp(r, 255, edge * 0.85);
        g = lerp(g, 255, edge * 0.85);
        b = lerp(b, 255, edge * 0.85);
        a = Math.max(a, 0.9 * edge);
      }
      return pack(Math.round(r), Math.round(g), Math.round(b), Math.round(a * 255));
    }
    let paintedW = -1;
    function paintWater(W) {
      if (W === paintedW) return false;
      let lo = 0;
      let hi = FILL_STEPS;
      if (paintedW < 0 || W < paintedW) {
        waterPx.fill(0);
      } else {
        lo = Math.max(0, Math.floor((paintedW - HIGH_AFTER - SOFT) * FILL_STEPS) - 1);
        hi = Math.min(FILL_STEPS, Math.ceil(W * FILL_STEPS));
      }
      for (let v = lo; v <= hi; v += 1) {
        const from = bucketStart[v];
        const to = bucketStart[v + 1];
        if (from === to) continue;
        const x = W - v / FILL_STEPS;
        const colors = [0, cellColor(x, 1), cellColor(x, 2), cellColor(x, 3)];
        for (let n = from; n < to; n += 1) {
          const i = bucketCells[n];
          waterPx[i] = colors[G.level[i]];
        }
      }
      paintedW = W;
      waterG.putImageData(waterImg, 0, 0);
      return true;
    }
    // Redrawn only when the water rose or the map moved.
    function drawWater(W) {
      const changed = paintWater(W);
      const key = viewKey(waterView);
      if (!changed && key === waterView.key) return;
      waterView.key = key;
      const g = beginView(waterView);
      if (W <= 0) return;
      g.save();
      worldTransform(g, waterView);
      if (BOUNDARY.length) g.clip(boundaryPath, 'evenodd');
      g.clip(floodPath);
      const tl = cp([G.north, G.west]);
      const br = cp([G.north - G.ny * G.cell_lat, G.west + G.nx * G.cell_lng]);
      g.setTransform(waterView.dpr, 0, 0, waterView.dpr, VIEW_PAD * waterView.dpr, VIEW_PAD * waterView.dpr);
      g.imageSmoothingEnabled = true;
      g.drawImage(water, tl.x, tl.y, br.x - tl.x, br.y - tl.y);
      g.restore();
    }

    // ---- rain ----
    const DROPS = Array.from({ length: 280 }, (_, i) => ({
      x: hash(i * 3 + 1),
      y: hash(i * 7 + 2),
      v: 0.8 + 0.5 * hash(i * 11 + 3),
      len: 11 + 12 * hash(i * 13 + 4),
    }));
    const WIND = 0.24;
    function rainAmount(t) {
      return ease(t / T.rainIn) * (1 - ease((t - T.rainFade[0]) / (T.rainFade[1] - T.rainFade[0])));
    }
    // The streaks and splashes go in a few batched paths (three strengths,
    // three ages), so a frame is a dozen strokes however hard it rains.
    function drawFx(t) {
      const k = rainAmount(t);
      const rings = Number.isFinite(ARRIVE) && t >= ARRIVE && t < ARRIVE + 1400;
      if (k <= 0.001 && !rings) {
        if (!fxView.empty) {
          beginView(fxView);
          fxView.empty = true;
        }
        return;
      }
      fxView.empty = false;
      const g = beginView(fxView);
      const w = fxView.w;
      const h = fxView.h;
      const share = (quality.low ? 0.5 : 1) * Math.min(1, (w * h) / 1100000);
      g.save();
      g.translate(-VIEW_PAD, -VIEW_PAD);
      if (k > 0.001) {
        // Overcast.
        g.fillStyle = `rgba(15,23,42,${(0.13 * k).toFixed(3)})`;
        g.fillRect(0, 0, w, h);
        const count = Math.round(DROPS.length * share * k);
        g.lineCap = 'round';
        for (let group = 0; group < 3; group += 1) {
          g.beginPath();
          for (let i = group; i < count; i += 3) {
            const drop = DROPS[i];
            const fall = t * drop.v * 0.95;
            const y = ((drop.y * (h + 80) + fall) % (h + 80)) - 40;
            const x = ((drop.x * (w + 120) + fall * WIND) % (w + 120)) - 60;
            g.moveTo(x, y);
            g.lineTo(x - drop.len * WIND, y - drop.len);
          }
          const strength = 0.6 + 0.2 * group;
          g.strokeStyle = `rgba(255,255,255,${(0.42 * strength).toFixed(3)})`;
          g.lineWidth = 2.4;
          g.stroke();
          g.strokeStyle = `rgba(30,64,120,${(0.5 * strength).toFixed(3)})`;
          g.lineWidth = 1.1;
          g.stroke();
        }
        // Drops landing: small rings that open and fade.
        const ages = [[], [], []];
        const splashes = Math.round(46 * share);
        for (let i = 0; i < splashes; i += 1) {
          const period = 520 + 260 * hash(i * 5 + 9);
          const local = t + hash(i * 19 + 2) * period;
          const cycle = Math.floor(local / period);
          const f = ((local % period) / period) / 0.55;
          if (f >= 1) continue;
          ages[Math.min(2, Math.floor(f * 3))].push([
            hash(i * 31 + cycle * 7.13) * w,
            hash(i * 37 + cycle * 3.71) * h,
            1.5 + 6 * easeOut(f),
          ]);
        }
        ages.forEach((list, age) => {
          if (!list.length) return;
          g.beginPath();
          list.forEach(([x, y, r]) => {
            g.moveTo(x + r, y);
            g.ellipse(x, y, r, r * 0.55, 0, 0, Math.PI * 2);
          });
          const fade = (1 - (age + 0.5) / 3) * k;
          g.strokeStyle = `rgba(255,255,255,${(0.85 * fade).toFixed(3)})`;
          g.lineWidth = 1.6;
          g.stroke();
          g.strokeStyle = `rgba(30,64,175,${(0.45 * fade).toFixed(3)})`;
          g.lineWidth = 0.8;
          g.stroke();
        });
      }
      // The water reaching the start pin: two rings out from it.
      if (rings) {
        const p = cp(START);
        [0, 260].forEach(delay => {
          const age = (t - ARRIVE - delay) / 1100;
          if (age < 0 || age >= 1) return;
          const r = 10 + 34 * easeOut(age);
          g.beginPath();
          g.ellipse(p.x + VIEW_PAD, p.y + VIEW_PAD, r, r * 0.6, 0, 0, Math.PI * 2);
          g.strokeStyle = `rgba(255,255,255,${(0.9 * (1 - age)).toFixed(3)})`;
          g.lineWidth = 4;
          g.stroke();
          g.strokeStyle = `rgba(29,78,216,${(0.85 * (1 - age)).toFixed(3)})`;
          g.lineWidth = 2;
          g.stroke();
        });
      }
      g.restore();
    }

    // ---- the camera ----
    const barangayBounds = () => L.latLngBounds(BOUNDARY.length ? BOUNDARY.flat() : [START]);

    function frame(t) {
      const labelHidden = t < 200 || chapterAt(t) >= 2;
      if (labelHidden !== state.labelHidden) {
        state.labelHidden = labelHidden;
        placeLabel.getElement()?.classList.toggle('is-hidden', labelHidden);
      }
      // A slow device repaints the water every other frame.
      state.frame += 1;
      if (!quality.low || state.frame % 2 === 0 || t >= T.riseEnd) drawWater(waterLevel(t));
      drawFx(t);
      const level = syncPanel(t);
      if (START_LEVEL && level > 0) showCallout(level);
      if (!START_LEVEL && t >= CHAPTER2_AT) showCallout(0);
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
      [WATER_PANE, FX_PANE].forEach(name => {
        const pane = map.getPane(name);
        pane.style.transition = '';
        pane.style.opacity = '';
      });
      sizeViews();
      placeLabel.addTo(map);
      if (options.showCredit) map.attributionControl?.addAttribution(credit);
      map.on(mapHandlers);
    }

    function removeLayers() {
      if (!state.layersOn) return;
      state.layersOn = false;
      map.off(mapHandlers);
      map.attributionControl?.removeAttribution(credit);
      if (state.redraw) map.off('move zoomend', state.redraw);
      markers.forEach(marker => marker.remove());
      views.forEach(view => {
        view.canvas.width = 0;
        view.canvas.height = 0;
        view.canvas.remove();
      });
      water.width = 0;
      water.height = 0;
      [WATER_PANE, FX_PANE].forEach(name => {
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
      placeLabel.remove();
      const ms = prefersReducedMotion() ? 0 : FADE_OUT_MS;
      [WATER_PANE, FX_PANE].forEach(name => {
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
        drawWater(W_MAX);
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
      if (state.layersOn) {
        state.t = Math.max(state.t, T.hold);
        syncPanel(T.hold);
        showCallout(START_LEVEL);
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
        document.addEventListener('keydown', onKeyDown);
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
      kind: 'flood',
      panel,
      start,
      skip,
      destroy,
      buildSummary,
      getBounds: barangayBounds,
      getViewBounds: barangayBounds,
      isDone: () => state.done,
    };
  }

  // Whether a result can play the intro: a flood run that says the
  // scenario's level at its start, and the barangay's scenario grid.
  function canPlay(result, scenario) {
    const level = result?.flood_scenario?.start_level;
    return Number.isFinite(Number(level)) && !!(scenario?.grid?.fill?.length && scenario.grid.nx > 0);
  }

  window.floodIntro = { load, create, canPlay };
})();
