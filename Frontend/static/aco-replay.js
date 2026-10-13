// The ant colony's search, replayed on the map between the loader and the
// results: the colony's ants leave the start round by round, their trails
// grow on the streets it comes to prefer, then Route 1 is drawn along the
// strongest trail and walked to its end with the camera following (slower
// through flood water). It is drawn from what the backend recorded of this
// very run (build_colony_replay in osm_routing.py), sped up.
//
// script.js decides when it plays (playSimulationReplay) and where its panel
// goes: the results column on a desktop, the phone sheet (mobile-sim.js), or
// a card over the map on short screens.
(function initAcoReplay() {
  const TRAIL_PANE = 'acoTrailPane';
  const ANT_PANE = 'acoAntPane';
  // Above the hazard fills (350), under the route lines (overlayPane, 400)
  // and the pins (markerPane, 600); the ants walk above the trails.
  const TRAIL_PANE_Z = 380;
  const ANT_PANE_Z = 450;
  const TRAIL_COLOR = '#2563eb';
  const SCENT = '37, 99, 235';
  const ANT_INK = '#111827';
  const STUCK_RING = '#475569';
  const ARRIVED_RING = '#16a34a';
  // Metres of fresh scent drawn behind each walking ant.
  const SCENT_TAIL_METERS = 75;
  // How strong a road's trail looks: how many times more pheromone it holds
  // than a road no ant reinforced, on a log scale, full at this ratio. A
  // fixed scale, so a search whose routes all cross high-risk roads (whose
  // deposits are tiny, numeric_score in osm_routing.py) shows faint trails
  // rather than looking as decided as any other.
  const TRAIL_FULL_RATIO = 300;
  const WEAK_TRAIL = 0.3;
  const METERS_PER_DEGREE_LAT = 110574;
  const METERS_PER_DEGREE_LNG = 111320;

  // The timeline, in ms. Round 1 walks slowly so the spreading out can be
  // followed; later walked rounds go faster, and the rounds after them only
  // grow the trails.
  const NEST_MS = 800;
  const FIRST_WALK_MS = 3400;
  const FIRST_TRAIL_MS = 700;
  const WALK_MS = 1000;
  const TRAIL_MS = 320;
  const QUICK_ROUNDS_MS = 3000;
  const QUICK_ROUND_MS = [120, 250];
  const DRAW_ROUTE_MS = 1000;
  // The walk along Route 1: the camera flies in, the ant walks it at about
  // this pace (dry roads; slower in water), then the camera flies out.
  const NAV_ZOOM = 17.25;
  const NAV_FLY_SECONDS = 1.1;
  const NAV_MS = 6500;
  const ARRIVE_MS = 700;
  const ZOOM_OUT_SECONDS = 1.2;
  // Leaflet's renderers and tiles catch up on 'moveend'; while the camera
  // follows the ant, one goes out every this many pixels of panning.
  const NAV_REFRESH_PX = 160;

  // Flood: the water the ant walks through, in the map's own fill colors.
  const WATER_RIPPLE = { 1: '#ca8a04', 2: '#ea580c', 3: '#be123c' };
  const WATER_POOL = { 1: '250, 204, 21', 2: '249, 115, 22', 3: '225, 29, 72' };
  // Earthquake: rings under the ant on Moderate (3) and High (4+) roads.
  const QUAKE_RING = { 3: '#d97706', 4: '#c2410c' };

  const STEP_TITLES = ['Ants spread out', 'Trails grow on safer streets', 'Ants agree on one route', 'Route ready'];

  const clamp01 = value => Math.max(0, Math.min(1, value));
  const ease = value => {
    const x = clamp01(value);
    return x * x * (3 - 2 * x);
  };
  const hash = index => {
    const x = Math.sin(index * 12.9898 + 78.233) * 43758.5453;
    return x - Math.floor(x);
  };
  const formatKm = meters => (meters >= 1000 ? `${(meters / 1000).toFixed(2)} km` : `${Math.round(meters)} m`);
  const formatCountText = value => Number(value || 0).toLocaleString('en-US');

  function decodeEdges(replay) {
    const [lat0, lng0] = replay.origin;
    return replay.edges.map(flat => {
      const points = [];
      for (let index = 0; index + 1 < flat.length; index += 2) {
        points.push([(lat0 + flat[index]) / 1e5, (lng0 + flat[index + 1]) / 1e5]);
      }
      return points;
    });
  }

  // Distances along a line of [lat, lng] points, in metres (flat-earth over
  // a barangay is well within a metre).
  function measure(points) {
    const cos = Math.cos((points[0]?.[0] || 14.5) * Math.PI / 180);
    const cum = [0];
    for (let index = 1; index < points.length; index += 1) {
      const dy = (points[index][0] - points[index - 1][0]) * METERS_PER_DEGREE_LAT;
      const dx = (points[index][1] - points[index - 1][1]) * METERS_PER_DEGREE_LNG * cos;
      cum.push(cum[index - 1] + Math.hypot(dx, dy));
    }
    return { points, cum, len: cum[cum.length - 1] || 0 };
  }

  function pointAlong(line, distance) {
    const { points, cum } = line;
    const d = Math.max(0, Math.min(line.len, distance));
    let index = 1;
    while (index < cum.length - 1 && cum[index] < d) index += 1;
    const share = (d - cum[index - 1]) / ((cum[index] - cum[index - 1]) || 1);
    const a = points[index - 1];
    const b = points[index] || a;
    return L.latLng(a[0] + (b[0] - a[0]) * share, a[1] + (b[1] - a[1]) * share);
  }

  function cutLine(line, distance) {
    if (distance >= line.len) return line.points;
    let index = 1;
    while (index < line.cum.length && line.cum[index] < distance) index += 1;
    const share = (distance - line.cum[index - 1]) / ((line.cum[index] - line.cum[index - 1]) || 1);
    const a = line.points[index - 1];
    const b = line.points[index] || a;
    return [...line.points.slice(0, index), [a[0] + (b[0] - a[0]) * share, a[1] + (b[1] - a[1]) * share]];
  }

  function ensurePane(map, name, zIndex) {
    const pane = map.getPane(name) || map.createPane(name);
    pane.style.zIndex = String(zIndex);
    pane.style.pointerEvents = 'none';
    return pane;
  }

  function iconCard(icon, label, valueId, subId, extraClass = '') {
    return `<div class="safety-result-card${extraClass ? ` ${extraClass}` : ''}">
      <div class="safety-icon-box">${safetyIcon(icon)}</div>
      <div class="aco-card-text">
        <div class="safety-card-label">${escapeHtml(label)}</div>
        <div class="safety-card-value" data-aco="${valueId}"></div>
        <div class="safety-card-sub" data-aco="${subId}"></div>
      </div>
    </div>`;
  }

  // options:
  //   map, replay (the result's replay), mode ('flood' | 'earthquake')
  //   route1: { points: [{lat, lng}], name, distance, durationText, tier,
  //     color, edgeColor, walk (false: Route 1 is not walked), wading }
  //   startName, endName, antsTotal
  //   legendBody: the map legend's body element (rewritten while it plays)
  //   getPadding(): fitBounds padding that keeps clear of the panels
  //   onPanelChange(): the panel's content changed size
  function create(options) {
    const { map, replay, mode, route1: route1Info } = options;
    const isFlood = mode !== 'earthquake';
    const edges = decodeEdges(replay);
    const rounds = replay.rounds.map(round => ({
      ...round,
      levels: new Map(round.trail.map(([road, level]) => [road, trailStrength(level, round.untouched)])),
      walks: Array.isArray(round.walks) ? planWalks(round.walks.map(decodeWalk).filter(Boolean)) : null,
    }));
    const roundCount = rounds.length;
    const walkedRounds = Math.max(1, Math.min(replay.walked_rounds || 1, roundCount));
    const strongestTrail = Math.max(0, ...rounds[rounds.length - 1]?.levels.values() || []);
    const trailRoads = [...new Set(rounds.flatMap(round => round.trail.map(entry => entry[0])))];
    const mainAnts = rounds.reduce((sum, round) => sum + (Number(round.sent) || 0), 0);
    const startLatLng = L.latLng(replay.start);
    const route1 = measure((route1Info?.points || []).map(point => [Number(point.lat), Number(point.lng)]));
    const hasRoute1 = route1.points.length > 1 && route1.len > 0;
    const walksRoute1 = hasRoute1 && route1Info.walk !== false;
    const spans = buildSpans(replay.route1?.spans || [], route1.len);

    const state = {
      running: false,
      done: false,
      nav: null,
      scene: null,
      chapter: -1,
      raf: 0,
      resolve: null,
      layersOn: false,
      mapLocked: false,
    };

    function trailStrength(level, untouched) {
      const ratio = Math.log1p(Math.max(0, Number(level)) / Math.max(1e-6, Number(untouched) || 1e-6));
      return Math.sqrt(clamp01(ratio / Math.log(TRAIL_FULL_RATIO)));
    }

    function edgePoints(signedNumber) {
      const points = edges[Math.abs(signedNumber) - 1] || [];
      return signedNumber < 0 ? [...points].reverse() : points;
    }

    function decodeWalk(encoded) {
      if (!Array.isArray(encoded) || encoded.length < 2) return null;
      const [arrived, ...numbers] = encoded;
      const points = [];
      numbers.forEach(number => edgePoints(number).forEach((point, index) => {
        const last = points[points.length - 1];
        if (index === 0 && last && Math.abs(last[0] - point[0]) < 1e-7 && Math.abs(last[1] - point[1]) < 1e-7) return;
        points.push(point);
      }));
      if (points.length < 2) return null;
      return { ...measure(points), ok: arrived === 1 };
    }

    // Each ant leaves in turn and walks at one shared pace (each a little
    // faster or slower), so short walks arrive first; the longest are sped
    // up just enough to end inside the round. Times are shares of the
    // round's walking time.
    function planWalks(walks) {
      const lengths = walks.map(walk => walk.len).sort((a, b) => a - b);
      const reference = lengths[Math.floor(lengths.length * 0.8)] || 1;
      walks.forEach((walk, index) => {
        walk.depart = (index / walks.length) * 0.26;
        walk.dur = Math.min((walk.len / reference) * 0.66 / (0.88 + 0.24 * hash(index)), 0.98 - walk.depart);
        walk.gait = hash(index + 99) * 6.28;
      });
      return walks;
    }

    // Route 1's spans ([metres, ...levels]) scaled onto the line as drawn.
    function buildSpans(raw, length) {
      const total = raw.reduce((sum, span) => sum + Number(span[0] || 0), 0);
      if (!total || !length) return [];
      const scale = length / total;
      let at = 0;
      return raw.map(([meters, ...levels]) => {
        at += Number(meters) * scale;
        return { to: at, levels: levels.map(Number) };
      });
    }

    function spanAt(distance) {
      return spans.find(span => distance <= span.to) || spans[spans.length - 1] || { levels: [0, 0] };
    }

    // ---- the panel ----
    const panel = document.createElement('section');
    panel.className = 'aco-replay';
    panel.setAttribute('aria-label', 'Ant colony simulation');
    const chipText = `${options.startName || 'Start'} → ${options.endName || 'Destination'}`;
    panel.innerHTML = `
      <div class="safety-section-label aco-replay-label">Ant colony simulation</div>
      <div class="safety-route-chip aco-replay-chip">${safetyIcon('pin')}<span>${escapeHtml(chipText)}</span></div>
      <ol class="aco-steps">
        ${STEP_TITLES.map(title => `
          <li class="aco-step">
            <span class="aco-step-icon" aria-hidden="true"><i></i><svg viewBox="0 0 24 24"><path d="m5 12 5 5 9-10"/></svg></span>
            <span class="aco-step-text"><span class="aco-step-title">${escapeHtml(title)}</span><span class="aco-step-detail"></span></span>
          </li>`).join('')}
      </ol>
      <div class="safety-result-cards aco-cards" data-aco-cards="search">
        ${iconCard('ruler', 'Best route so far', 'best', 'bestSub')}
      </div>
      <div class="safety-result-cards aco-cards aco-cards--walk" data-aco-cards="walk" hidden>
        ${iconCard('flag', 'Distance left', 'left', 'leftSub')}
        ${iconCard(isFlood ? 'droplet' : 'quake', isFlood ? 'Water here' : 'Road risk here', 'here', 'hereSub')}
        ${iconCard('walk', `Route ${route1Info?.number ?? 1}`, 'route', 'routeSub', { safe: 'success', caution: 'warning', unsafe: 'danger' }[route1Info?.tier] || '')}
      </div>
      <p class="aco-replay-meta"></p>
      <p class="sr-only" aria-live="polite" data-aco="caption"></p>
      <button type="button" class="aco-replay-skip">Skip to results</button>`;
    const field = name => panel.querySelector(`[data-aco="${name}"]`);
    const setText = (name, text) => {
      const el = field(name);
      if (el && el.textContent !== text) el.textContent = text;
    };
    panel.querySelector('.aco-replay-meta').textContent = options.antsTotal > mainAnts
      ? `A sped-up replay of this run's main search: ${formatCountText(mainAnts)} of the ${formatCountText(options.antsTotal)} ants.`
      : `A sped-up replay of this run's search: all ${formatCountText(mainAnts)} ants.`;
    panel.querySelector('.aco-replay-skip').addEventListener('click', () => finish());

    const sites = Number(replay.sites_searched) || 0;
    const endName = options.endName || 'the destination';
    const stepText = [
      `${replay.ants} virtual ants leave ${options.startName || 'the start'} one after another. They don't know the way yet, so they try many streets.`
        + (sites > 1 ? ` Ants went to all ${sites} evacuation sites; this is the search to ${endName}, the one with the safest route.` : ''),
      `Ants that reach ${sites ? 'the site' : 'the end point'} by a safer or shorter way leave a stronger trail. The next ants follow strong trails, so the route gets better each round.`
        + (strongestTrail < WEAK_TRAIL ? ' Here every way crosses high-risk roads, so the trails stay faint.' : ''),
      roundCount < replay.max_rounds
        ? `Most ants now take the same streets. No better route for ${replay.stagnation} rounds, so the search stops at round ${roundCount} of ${replay.max_rounds}.`
        : `Most ants now take the same streets. The search stops at its last round, ${roundCount}.`,
      buildRouteReadyText(),
    ];
    panel.querySelectorAll('.aco-step-detail').forEach((el, index) => { el.textContent = stepText[index]; });

    function buildRouteReadyText() {
      const found = {
        main: 'Route 1 follows the strongest trail.',
        alternative: 'Route 1 comes from ants sent around the strongest trail: it is safer.',
        shortest_path: 'A regular map search found a safer route than the ants, so Route 1 is that one.',
        backup_search: 'A backup search found Route 1, safer than the ants\' routes.',
      }[replay.route1?.source] || 'Route 1 is the safest route found.';
      if (!walksRoute1) {
        return hasRoute1 && isFlood
          ? `${found} It still crosses water over 1.5 m deep, so it is not one to walk.`
          : found;
      }
      if (isFlood && route1Info.wading) {
        return `${found} Walking it now to ${endName}: slower through flood water, normal pace on dry roads.`;
      }
      return `${found} Walking it now to ${endName}.`;
    }

    function describeBest(best) {
      if (!best) return ['None yet', 'Waiting for the first ants'];
      if (isFlood) {
        const water = { 0: 'No flooding', 1: 'Low water only', 2: 'Through Medium water', 3: 'Through High water' }[best.flood_var] || 'No flooding';
        return [formatKm(best.distance), water];
      }
      return [formatKm(best.distance), `${getRiskLevelLabelFromScore(best.max_hazard)} road risk`];
    }

    function syncPanel(step, chapter, afterWalk) {
      if (chapter !== state.chapter) {
        state.chapter = chapter;
        panel.querySelectorAll('.aco-step').forEach((item, index) => {
          item.classList.toggle('is-done', index < chapter);
          item.classList.toggle('is-current', index === chapter);
        });
        setText('caption', `${STEP_TITLES[chapter]}. ${stepText[chapter]}`);
        options.onPanelChange?.();
      }
      const round = step >= 1 && step <= roundCount ? rounds[step - 1] : null;
      const best = round && afterWalk
        ? round.best
        : step > 1 ? rounds[Math.min(step, roundCount + 1) - 2]?.best : null;
      const [value, sub] = describeBest(best || null);
      setText('best', value);
      setText('bestSub', sub);
    }

    // ---- the legend ----
    const antSvg = '<svg class="aco-legend-ant" viewBox="0 0 24 14" aria-hidden="true"><path d="M9 7 5 2.5M9 7 5 11.5M12 7l-1-5M12 7l-1 5M14 7l3-4.5M14 7l3 4.5"/><ellipse cx="6.5" cy="7" rx="4.4" ry="3"/><ellipse cx="12" cy="7" rx="2" ry="1.8"/><ellipse cx="16.6" cy="7" rx="2.5" ry="2.3"/></svg>';
    const walkerSvg = `<svg class="aco-legend-walker" viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="8.6" fill="#fff" stroke="${route1Info?.edgeColor || '#15803d'}" stroke-width="2"/><g fill="#111827" stroke="#111827" stroke-width=".7" stroke-linecap="round"><path d="M9.5 10 7 6.6M9.5 10 7 13.4M10.6 10l-.4-3.6M10.6 10l-.4 3.6M11.6 10l2-3M11.6 10l2 3" fill="none"/><ellipse cx="7.4" cy="10" rx="2.6" ry="1.8"/><ellipse cx="10.5" cy="10" rx="1.2" ry="1.1"/><ellipse cx="13.1" cy="10" rx="1.4" ry="1.35"/></g></svg>`;
    const legendRow = (swatch, label) => `<div class="legend-row">${swatch}<span>${escapeHtml(label)}</span></div>`;

    function renderLegend(walking) {
      if (!options.legendBody) return;
      const rows = walking
        ? legendRow(`<span class="aco-legend-route" style="background:${route1Info?.color};box-shadow:0 0 0 1px ${route1Info?.edgeColor};"></span>`, route1Info?.name || 'Route 1')
          + legendRow(walkerSvg, `Walking Route ${route1Info?.number ?? 1}`)
        : legendRow(antSvg, 'Virtual ant')
          + legendRow('<span class="aco-legend-trail"></span>', 'Ant trail')
          + legendRow('<span class="aco-legend-stuck"></span>', 'Ant that got stuck');
      const hazards = isFlood
        ? '<div class="aco-legend-levels"><span><i style="background:rgba(250,204,21,.86)"></i>Low</span><span><i style="background:rgba(249,115,22,.9)"></i>Medium</span><span><i style="background:rgba(225,29,72,.94)"></i>High</span></div>'
        : '<div class="aco-legend-levels"><span><i style="background:#f59e0b"></i>Liquefaction</span><span><i style="background:#c2410c"></i>Ground shaking</span></div>';
      // One wrapper, so the phone legend (mobile-sim.js) keeps every row; it
      // leaves out the pin rows (.aco-legend-pins) to stay short there.
      options.legendBody.innerHTML = `<div class="aco-legend">${rows}<div class="aco-legend-pins">${options.legendExtra || ''}</div>${hazards}</div>`;
    }

    // ---- map layers ----
    ensurePane(map, TRAIL_PANE, TRAIL_PANE_Z);
    const antPane = ensurePane(map, ANT_PANE, ANT_PANE_Z);
    const renderer = L.canvas({ pane: TRAIL_PANE, padding: 0.4 });
    const trailLayers = new Map(trailRoads.map(number => [number, L.polyline(edgePoints(number), {
      renderer,
      interactive: false,
      color: TRAIL_COLOR,
      weight: 0,
      opacity: 0,
      lineCap: 'round',
      lineJoin: 'round',
    })]));
    const trailStyleKeys = new Map();
    const routeLayers = hasRoute1 ? [
      L.polyline([], { renderer, interactive: false, color: route1Info.edgeColor, weight: ROUTE_BEST_WEIGHT + ROUTE_EDGE_EXTRA_WEIGHT, lineCap: 'round', lineJoin: 'round' }),
      L.polyline([], { renderer, interactive: false, color: route1Info.color, weight: ROUTE_BEST_WEIGHT, lineCap: 'round', lineJoin: 'round' }),
    ] : [];
    const antCanvas = L.DomUtil.create('canvas', 'aco-ant-canvas', antPane);
    const g = antCanvas.getContext('2d');
    let pixelRatio = 1;

    function sizeAntCanvas() {
      const size = map.getSize();
      pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
      antCanvas.width = Math.round(size.x * pixelRatio);
      antCanvas.height = Math.round(size.y * pixelRatio);
      antCanvas.style.width = `${size.x}px`;
      antCanvas.style.height = `${size.y}px`;
    }

    // Leaflet doesn't zoom-animate a canvas of one's own: hide it while the
    // map zooms, redraw it after.
    const mapHandlers = {
      resize: () => { sizeAntCanvas(); drawAnts(state.scene); },
      zoomstart: () => { antCanvas.style.visibility = 'hidden'; },
      zoomend: () => { antCanvas.style.visibility = ''; drawAnts(state.scene); },
      move: () => { if (!state.running && !state.nav) drawAnts(state.scene); },
    };

    function addLayers() {
      if (state.layersOn) return;
      state.layersOn = true;
      trailLayers.forEach(layer => layer.addTo(map));
      sizeAntCanvas();
      map.on(mapHandlers);
    }

    function removeLayers() {
      if (!state.layersOn) return;
      state.layersOn = false;
      map.off(mapHandlers);
      trailLayers.forEach(layer => layer.remove());
      routeLayers.forEach(layer => layer.remove());
      antCanvas.remove();
    }

    // strengthOf(road): 0-1 (trailStrength).
    function setTrails(strengthOf, fade = 1) {
      trailLayers.forEach((layer, number) => {
        const strength = strengthOf(number);
        const shown = strength > 0.02;
        const weight = shown ? +(1.5 + 7 * strength).toFixed(1) : 0;
        const opacity = shown ? +((0.2 + 0.7 * strength) * fade).toFixed(2) : 0;
        const key = `${weight}|${opacity}`;
        if (trailStyleKeys.get(number) === key) return;
        trailStyleKeys.set(number, key);
        layer.setStyle({ weight, opacity });
      });
    }

    function showRoute(points) {
      routeLayers.forEach(layer => {
        layer.setLatLngs(points);
        if (!map.hasLayer(layer)) layer.addTo(map);
        layer.bringToFront();
      });
    }

    // ---- drawing the ants ----
    function projected(walk) {
      const zoom = map.getZoom();
      if (walk.zoom !== zoom) {
        walk.zoom = zoom;
        walk.px = walk.points.map(point => map.project(point, zoom));
      }
      return walk.px;
    }

    function pointOn(walk, px, origin, distance) {
      const d = Math.max(0, Math.min(walk.len, distance));
      let index = 1;
      while (index < walk.cum.length - 1 && walk.cum[index] < d) index += 1;
      const a = px[index - 1];
      const b = px[index] || a;
      const share = (d - walk.cum[index - 1]) / ((walk.cum[index] - walk.cum[index - 1]) || 1);
      return {
        x: a.x + (b.x - a.x) * share - origin.x,
        y: a.y + (b.y - a.y) * share - origin.y,
        heading: Math.atan2(b.y - a.y, b.x - a.x),
        index,
      };
    }

    function strokeSpan(walk, px, origin, from, to) {
      const p0 = pointOn(walk, px, origin, from);
      const p1 = pointOn(walk, px, origin, to);
      g.beginPath();
      g.moveTo(p0.x, p0.y);
      for (let k = p0.index; k < p1.index; k += 1) g.lineTo(px[k].x - origin.x, px[k].y - origin.y);
      g.lineTo(p1.x, p1.y);
      g.stroke();
    }

    function blob(x, y, rx, ry, rotation) {
      g.beginPath();
      g.ellipse(x, y, rx, ry, rotation, 0, Math.PI * 2);
      g.fill();
    }

    // A small ant facing where it walks: six moving legs, then abdomen,
    // thorax and head over a white outline, so it reads on any map color.
    function drawAnt(x, y, heading, alpha, gait, size = 1.12) {
      const c = Math.cos(heading) * size;
      const s = Math.sin(heading) * size;
      g.globalAlpha = alpha;
      g.strokeStyle = ANT_INK;
      g.lineWidth = 0.9 * size;
      g.beginPath();
      for (let j = -1; j <= 1; j += 1) {
        const bx = x + c * j * 1.3;
        const by = y + s * j * 1.3;
        const swing = Math.sin(gait + j * 2.1) * 0.38;
        [-1, 1].forEach(side => {
          const angle = heading + side * (Math.PI / 2 - j * 0.5) + swing * side;
          g.moveTo(bx, by);
          g.lineTo(bx + Math.cos(angle) * 3.6 * size, by + Math.sin(angle) * 3.6 * size);
        });
      }
      g.stroke();
      g.fillStyle = '#ffffff';
      blob(x - c * 3.2, y - s * 3.2, 3.5 * size, 2.7 * size, heading);
      blob(x, y, 2.2 * size, 2 * size, heading);
      blob(x + c * 2.9, y + s * 2.9, 2.4 * size, 2.3 * size, heading);
      g.fillStyle = ANT_INK;
      blob(x - c * 3.2, y - s * 3.2, 2.7 * size, 1.9 * size, heading);
      blob(x, y, 1.45 * size, 1.25 * size, heading);
      blob(x + c * 2.9, y + s * 2.9, 1.65 * size, 1.55 * size, heading);
      g.globalAlpha = 1;
    }

    function ring(x, y, radius, color, alpha, width) {
      g.globalAlpha = Math.max(0, alpha);
      g.strokeStyle = color;
      g.lineWidth = Math.max(0.5, width);
      g.beginPath();
      g.arc(x, y, Math.max(0.5, radius), 0, Math.PI * 2);
      g.stroke();
      g.globalAlpha = 1;
    }

    // Ants waiting at the start, in a loose sunflower around it.
    function nestSpot(index, sx, sy, now) {
      const angle = index * 2.39996;
      const radius = 9 + 4.6 * Math.sqrt(index);
      return { x: sx + Math.cos(angle) * radius, y: sy + Math.sin(angle) * radius, heading: angle + 0.45 * Math.sin(now / 260 + index) };
    }

    // scene: null, { kind: 'nest', alpha }, or { kind: 'walk', round, u
    // (share of the walk done), walkMs, fade, live }.
    function drawAnts(scene) {
      state.scene = scene;
      const size = map.getSize();
      L.DomUtil.setPosition(antCanvas, map.containerPointToLayerPoint([0, 0]));
      g.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      g.clearRect(0, 0, size.x, size.y);
      if (!scene || scene.kind === 'none') return;
      const origin = map.getPixelBounds().min;
      const start = map.project(startLatLng, map.getZoom());
      const sx = start.x - origin.x;
      const sy = start.y - origin.y;
      const now = performance.now();
      g.lineCap = 'round';
      g.lineJoin = 'round';

      if (scene.kind === 'nest') {
        for (let index = replay.ants - 1; index >= 0; index -= 1) {
          const spot = nestSpot(index, sx, sy, now);
          drawAnt(spot.x, spot.y, spot.heading, scene.alpha, now / 90 + index, 0.9);
        }
        return;
      }

      const walks = scene.round.walks || [];
      const u = scene.u;
      // Where each ant has walked, faint, so streets many ants take turn darker.
      g.strokeStyle = `rgba(${SCENT}, ${(0.2 * scene.fade).toFixed(3)})`;
      g.lineWidth = 2.6;
      walks.forEach(walk => {
        const progress = (u - walk.depart) / walk.dur;
        if (progress > 0) strokeSpan(walk, projected(walk), origin, 0, Math.min(1, progress) * walk.len);
      });
      if (!scene.live) return;

      // Fresh scent right behind each walking ant.
      g.lineWidth = 3.4;
      walks.forEach(walk => {
        const progress = (u - walk.depart) / walk.dur;
        if (progress <= 0 || progress >= 1) return;
        const px = projected(walk);
        const d = progress * walk.len;
        const a = pointOn(walk, px, origin, d - SCENT_TAIL_METERS);
        const b = pointOn(walk, px, origin, d);
        const gradient = g.createLinearGradient(a.x, a.y, b.x, b.y);
        gradient.addColorStop(0, `rgba(${SCENT}, 0)`);
        gradient.addColorStop(1, `rgba(${SCENT}, 0.9)`);
        g.strokeStyle = gradient;
        strokeSpan(walk, px, origin, d - SCENT_TAIL_METERS, d);
      });

      const waiting = [];
      walks.forEach((walk, index) => {
        const progress = (u - walk.depart) / walk.dur;
        const px = projected(walk);
        if (progress <= 0) {
          waiting.push(index);
          return;
        }
        if (progress < 1) {
          const point = pointOn(walk, px, origin, progress * walk.len);
          drawAnt(point.x, point.y, point.heading, 1, now / 45 + walk.gait);
          return;
        }
        const since = (u - walk.depart - walk.dur) * scene.walkMs;
        const end = pointOn(walk, px, origin, walk.len);
        if (walk.ok) {
          if (since < 700) ring(end.x, end.y, 5 + 17 * since / 700, ARRIVED_RING, 0.9 * (1 - since / 700), 2.4);
          if (since < 320) drawAnt(end.x, end.y, end.heading, 1 - since / 320, 0);
        } else {
          // An ant that got stuck: a gray ring stays where it stopped.
          ring(end.x, end.y, 4.6, STUCK_RING, 0.8, 1.8);
          if (since < 500) drawAnt(end.x, end.y, end.heading, 1 - since / 500, 0);
        }
      });
      waiting.reverse().forEach(index => {
        const spot = nestSpot(index, sx, sy, now);
        drawAnt(spot.x, spot.y, spot.heading, 1, now / 90 + index, 0.9);
      });
    }

    // ---- the timeline ----
    const quickRounds = Math.max(0, roundCount - walkedRounds);
    const quickMs = quickRounds
      ? Math.max(QUICK_ROUND_MS[0], Math.min(QUICK_ROUND_MS[1], QUICK_ROUNDS_MS / quickRounds))
      : 0;
    const DRAW_STEP = roundCount + 1;
    const segments = [{ step: 0, ms: NEST_MS }];
    for (let step = 1; step <= roundCount; step += 1) {
      if (step <= walkedRounds && rounds[step - 1].walks?.length) {
        const walkMs = step === 1 ? FIRST_WALK_MS : WALK_MS;
        const trailMs = step === 1 ? FIRST_TRAIL_MS : TRAIL_MS;
        segments.push({ step, ms: walkMs + trailMs, walkMs, trailMs });
      } else {
        segments.push({ step, ms: quickMs || QUICK_ROUND_MS[1] });
      }
    }
    if (hasRoute1) segments.push({ step: DRAW_STEP, ms: DRAW_ROUTE_MS });
    let elapsedTotal = 0;
    segments.forEach(segment => {
      segment.start = elapsedTotal;
      elapsedTotal += segment.ms;
    });
    const TOTAL_MS = elapsedTotal;
    const chapterOf = step => (step <= 1 ? 0 : step <= walkedRounds ? 1 : step <= roundCount ? 2 : 3);

    function drawFrame(elapsed) {
      let index = segments.findIndex(segment => elapsed < segment.start + segment.ms);
      if (index < 0) index = segments.length - 1;
      const segment = segments[index];
      const t = clamp01((elapsed - segment.start) / segment.ms);
      const step = segment.step;

      if (step === 0) {
        setTrails(() => 0);
        drawAnts({ kind: 'nest', alpha: ease(t * 2.5) });
        syncPanel(0, 0, false);
        return;
      }
      if (step === DRAW_STEP) {
        const last = rounds[roundCount - 1].levels;
        const k = ease(t);
        setTrails(number => last.get(number) || 0, 1 - 0.7 * k);
        drawAnts(null);
        showRoute(cutLine(route1, k * route1.len));
        syncPanel(DRAW_STEP, 3, true);
        return;
      }

      const round = rounds[step - 1];
      const previous = step > 1 ? rounds[step - 2] : null;
      const tau = t * segment.ms;
      let trailPhase;
      if (segment.walkMs) {
        const u = clamp01(tau / segment.walkMs);
        trailPhase = ease((tau - segment.walkMs) / segment.trailMs);
        drawAnts({ kind: 'walk', round, u, walkMs: segment.walkMs, fade: 1 - trailPhase, live: u < 1 });
        syncPanel(step, chapterOf(step), u >= 1);
      } else {
        trailPhase = ease(t);
        drawAnts(null);
        syncPanel(step, chapterOf(step), true);
      }
      setTrails(number => {
        const from = previous ? previous.levels.get(number) || 0 : 0;
        const to = round.levels.get(number) || 0;
        return from + (to - from) * trailPhase;
      });
    }

    // ---- the walk along Route 1 ----
    const PER_MINUTE = WALKING_SPEED_METERS_PER_MINUTE;
    const paceShare = levels => (isFlood && levels[0] ? FLOOD_WALKING_PACE_SHARE_BY_VAR[levels[0]] || 1 : 1);
    const dryEquivalent = spans.reduce((sum, span, index) => sum + (span.to - (index ? spans[index - 1].to : 0)) / paceShare(span.levels), 0) || route1.len;
    const drySpeed = dryEquivalent / NAV_MS;

    function minutesLeft(distance) {
      if (!spans.length) return (route1.len - distance) / PER_MINUTE;
      let from = 0;
      let minutes = 0;
      spans.forEach(span => {
        const start = Math.max(from, distance);
        if (span.to > start) minutes += (span.to - start) / PER_MINUTE / paceShare(span.levels);
        from = span.to;
      });
      return minutes;
    }

    function focusPoint() {
      const size = map.getSize();
      const padding = options.getPadding?.() || {};
      const [left, top] = padding.paddingTopLeft || padding.padding || [0, 0];
      const [right, bottom] = padding.paddingBottomRight || padding.padding || [0, 0];
      return L.point(
        Math.max(0, Math.min(size.x, (left + size.x - right) / 2)),
        Math.max(0, Math.min(size.y, (top + size.y - bottom) / 2)),
      );
    }

    function centerShowing(latlng, zoom) {
      const size = map.getSize();
      const shift = L.point(size.x / 2, size.y / 2).subtract(focusPoint());
      return map.unproject(map.project(latlng, zoom).add(shift), zoom);
    }

    function headingAt(distance) {
      const a = map.latLngToContainerPoint(pointAlong(route1, distance - 6));
      const b = map.latLngToContainerPoint(pointAlong(route1, distance + 6));
      return Math.atan2(b.y - a.y, b.x - a.x);
    }

    function hereText(distance) {
      const levels = spanAt(distance).levels;
      if (isFlood) {
        const water = levels[0] || 0;
        const name = water ? getFloodRiskLabelFromVar(water) : 'None';
        return [`${name} · ${water ? 'slower' : 'normal'} pace`, water ? FLOOD_DEPTH_ON_ADULT_BY_VAR[water] : 'Dry road'];
      }
      const [liquefaction = 1, shaking = 1] = levels;
      return [
        getRiskLevelLabelFromScore(Math.max(liquefaction, shaking)),
        `Liquefaction ${getRiskLevelLabelFromScore(liquefaction).toLowerCase()} · ground shaking ${getRiskLevelLabelFromScore(shaking).toLowerCase()}`,
      ];
    }

    function syncWalkCards(distance) {
      const left = Math.max(0, route1.len - distance);
      setText('left', left < 5 ? 'Arrived' : formatKm(left));
      const minutes = minutesLeft(distance);
      setText('leftSub', left < 5 ? endName : minutes < 1 ? 'Under a minute to go' : `About ${formatWalkingMinutes(minutes)} walk`);
      const [value, sub] = hereText(distance);
      setText('here', value);
      setText('hereSub', sub);
    }

    // The walker is one of the colony's ants, larger, on a white disc ringed
    // in Route 1's color, so it stands out on the line. Its legs keep time
    // with the distance it covers. opts: arrived (0-1 at the end), gait,
    // ripples ({ t, level }), wet (0-1, easing in and out of flood water),
    // level (the water or road level under it).
    function drawWalker(latlng, heading, opts = {}) {
      const { arrived = 0, gait = 0, ripples = [], wet = 0, level = 0 } = opts;
      drawAnts({ kind: 'none' });
      const p = map.latLngToContainerPoint(latlng);
      const now = performance.now();
      if (isFlood && wet > 0.01 && WATER_POOL[level]) {
        g.globalAlpha = 1;
        g.fillStyle = `rgba(${WATER_POOL[level]}, ${(0.55 * wet).toFixed(3)})`;
        g.beginPath();
        g.arc(p.x, p.y, 23, 0, Math.PI * 2);
        g.fill();
        ring(p.x, p.y, 23, WATER_RIPPLE[level], 0.8 * wet, 1.6);
      }
      ripples.forEach(ripple => {
        const k = (now - ripple.t) / 1000;
        const color = isFlood ? WATER_RIPPLE[ripple.level] : QUAKE_RING[Math.min(4, ripple.level)];
        if (color) ring(p.x, p.y, 23 + 24 * k, color, 0.8 * (1 - k), 2.6 - 1.4 * k);
      });
      if (!ripples.length) ring(p.x, p.y, 20 + 3 * Math.sin(now / 260), route1Info.color, 0.35, 2);
      if (arrived) ring(p.x, p.y, 12 + 26 * arrived, route1Info.color, 0.9 * (1 - arrived), 2.6);
      g.globalAlpha = 1;
      g.fillStyle = '#ffffff';
      g.beginPath();
      g.arc(p.x, p.y, 14.5, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = route1Info.edgeColor;
      g.lineWidth = 3;
      g.stroke();
      // The ant's body runs from abdomen (behind) to head (ahead); nudge it
      // forward so the whole ant sits centered in the disc.
      const c = Math.cos(heading);
      const s = Math.sin(heading);
      drawAnt(p.x + c * 1.2, p.y + s * 1.2, heading, 1, gait, 1.45);
    }

    // While the camera follows the ant, the visitor's own drags and zooms
    // would fight it.
    function setMapLocked(locked) {
      if (state.mapLocked === locked) return;
      state.mapLocked = locked;
      ['dragging', 'scrollWheelZoom', 'doubleClickZoom', 'touchZoom', 'boxZoom', 'keyboard'].forEach(handler => {
        if (!map[handler]) return;
        if (locked) map[handler].disable();
        else map[handler].enable();
      });
    }

    function startWalk() {
      if (!walksRoute1) {
        finish();
        return;
      }
      state.nav = { raf: 0, timer: 0 };
      setMapLocked(true);
      setTrails(() => 0);
      panel.querySelector('[data-aco-cards="search"]').hidden = true;
      panel.querySelector('[data-aco-cards="walk"]').hidden = false;
      panel.classList.add('is-walking');
      setText('route', `${formatKm(route1Info.distance)} · ${route1Info.durationText} walk`);
      setText('routeSub', route1Info.name);
      renderLegend(true);
      options.onWalkChange?.(true);
      syncWalkCards(0);
      options.onPanelChange?.();
      let started = false;
      const follow = () => {
        if (!state.nav || started) return;
        started = true;
        followRoute();
      };
      map.once('moveend', follow);
      state.nav.timer = window.setTimeout(follow, NAV_FLY_SECONDS * 1000 + 500);
      map.flyTo(centerShowing(pointAlong(route1, 0), NAV_ZOOM), NAV_ZOOM, mapMoveOptions({ duration: NAV_FLY_SECONDS }));
    }

    function followRoute() {
      const startedAt = performance.now();
      let last = startedAt;
      let moved = 0;
      let distance = 0;
      let speed = 0;
      let gait = 0;
      let lastRipple = -1e9;
      let ripples = [];
      let wet = 0;
      let lastLevel = 0;
      function step(now) {
        if (!state.nav) return;
        const dt = Math.min(50, now - last);
        last = now;
        const levels = spanAt(distance).levels;
        // Flood: slower in water, back to normal on a dry road, easing into
        // each change; every walk starts gently and slows in the last metres.
        const remaining = route1.len - distance;
        const target = drySpeed * paceShare(levels)
          * Math.min(1, 0.25 + (now - startedAt) / 600)
          * Math.max(0.3, Math.min(1, remaining / 50));
        speed += (target - speed) * Math.min(1, dt / 180);
        distance = Math.min(route1.len, distance + speed * dt);
        gait += speed * dt * 0.09;
        const level = isFlood ? levels[0] || 0 : Math.max(levels[0] || 1, levels[1] || 1);
        const marked = isFlood ? level > 0 : level >= 3;
        wet += ((isFlood && level ? 1 : 0) - wet) * Math.min(1, dt / 220);
        if (marked) lastLevel = level;
        if (marked && now - lastRipple > (isFlood ? 420 : 520)) {
          ripples.push({ t: now, level });
          lastRipple = now;
        }
        ripples = ripples.filter(ripple => now - ripple.t < 1000);
        const here = pointAlong(route1, distance);
        // Keep the walker at the focus point: pan by how far it drifted.
        // _rawPanBy + 'move' (what panBy does inside) moves the map without
        // a 'moveend' every frame, which would make each renderer and tile
        // layer update 60 times a second; one goes out every
        // NAV_REFRESH_PX of travel instead.
        const offset = map.latLngToContainerPoint(here).subtract(focusPoint());
        if (Math.abs(offset.x) + Math.abs(offset.y) > 0.2) {
          map._rawPanBy(offset);
          map.fire('move');
          moved += Math.abs(offset.x) + Math.abs(offset.y);
          if (moved > NAV_REFRESH_PX) {
            moved = 0;
            map.fire('moveend');
          }
        }
        drawWalker(here, headingAt(distance), { gait, ripples, wet, level: isFlood ? lastLevel : level });
        syncWalkCards(distance);
        if (distance < route1.len) {
          state.nav.raf = requestAnimationFrame(step);
          return;
        }
        map.fire('moveend');
        arrive(here, headingAt(route1.len - 1), gait, wet, lastLevel);
      }
      state.nav.raf = requestAnimationFrame(step);
    }

    function arrive(here, heading, gait, wet, level) {
      const startedAt = performance.now();
      function step(now) {
        if (!state.nav) return;
        const k = clamp01((now - startedAt) / ARRIVE_MS);
        drawWalker(here, heading, { arrived: k, gait, wet: wet * (1 - k), level });
        if (k < 1) {
          state.nav.raf = requestAnimationFrame(step);
          return;
        }
        zoomOut();
      }
      state.nav.raf = requestAnimationFrame(step);
    }

    function routeBounds() {
      return L.latLngBounds([...route1.points, startLatLng, L.latLng(replay.end)]);
    }

    function zoomOut() {
      drawAnts(null);
      let ended = false;
      const end = () => {
        if (ended) return;
        ended = true;
        finish();
      };
      map.once('moveend', end);
      state.nav.timer = window.setTimeout(end, ZOOM_OUT_SECONDS * 1000 + 600);
      map.flyToBounds(routeBounds(), mapMoveOptions({ ...(options.getPadding?.() || {}), duration: ZOOM_OUT_SECONDS }));
    }

    function stopWalk() {
      if (!state.nav) return;
      cancelAnimationFrame(state.nav.raf);
      window.clearTimeout(state.nav.timer);
      state.nav = null;
      map.stop();
      options.onWalkChange?.(false);
    }

    // ---- running it ----
    function frameLoop() {
      let elapsed = 0;
      let last = performance.now();
      drawFrame(0);
      const frame = now => {
        if (!state.running) return;
        elapsed += Math.min(100, now - last);
        last = now;
        if (elapsed >= TOTAL_MS) {
          state.running = false;
          drawFrame(TOTAL_MS - 1);
          startWalk();
          return;
        }
        drawFrame(elapsed);
        state.raf = requestAnimationFrame(frame);
      };
      state.raf = requestAnimationFrame(frame);
    }

    function onKeyDown(event) {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      if (document.querySelector('[aria-modal="true"]:not([hidden])')) return;
      event.preventDefault();
      finish();
    }

    function finish() {
      if (state.done) return;
      state.done = true;
      state.running = false;
      cancelAnimationFrame(state.raf);
      stopWalk();
      setMapLocked(false);
      document.removeEventListener('keydown', onKeyDown);
      removeLayers();
      state.resolve?.();
    }

    // Starts the replay; resolves once it has ended or been skipped.
    function start() {
      return new Promise(resolve => {
        state.resolve = resolve;
        if (!roundCount) {
          state.done = true;
          resolve();
          return;
        }
        addLayers();
        renderLegend(false);
        document.addEventListener('keydown', onKeyDown);
        state.running = true;
        frameLoop();
      });
    }

    // Frames the search: the start, the destination, Route 1 and the
    // roads the trails ran on.
    function getSearchBounds() {
      const bounds = L.latLngBounds([startLatLng, L.latLng(replay.end)]);
      if (hasRoute1) route1.points.forEach(point => bounds.extend(point));
      trailRoads.forEach(number => edgePoints(number).forEach(point => bounds.extend(point)));
      return bounds;
    }

    // The first step shows from the start, so the panel has its full height
    // before script.js fits the map around it.
    syncPanel(0, 0, false);

    return {
      panel,
      start,
      skip: finish,
      getSearchBounds,
      resize: () => { if (state.layersOn) mapHandlers.resize(); },
      isDone: () => state.done,
    };
  }

  window.acoReplay = { create };
})();
