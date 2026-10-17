// The ant colony's search, replayed on the map between the loader and the
// results: the colony's ants leave the start round by round, their trails
// grow on the streets it comes to prefer, then Route 1 is drawn along the
// strongest trail and previewed to its end with the camera following -- by
// an ant, or by an arrow when a regular map search
// found Route 1 instead of the ants. It is drawn from what the backend
// recorded of this very run (build_colony_replay in osm_routing.py), sped up.
//
// script.js decides when it plays (playSimulationReplay) and where its panel
// goes: the results column on a desktop, the phone sheet (mobile-sim.js), or
// a card over the map on short screens.
(function initAcoReplay() {
  const TRAIL_PANE = 'acoTrailPane';
  const ROUTE_PANE = 'acoRoutePane';
  const ANT_PANE = 'acoAntPane';
  // Above the hazard fills (350), under the route lines (overlayPane, 400)
  // and the pins (markerPane, 600); Route 1 is drawn over the trails, and
  // the ants walk above both.
  const TRAIL_PANE_Z = 380;
  const ROUTE_PANE_Z = 385;
  const ANT_PANE_Z = 450;
  // The trail color, rgb.
  const SCENT = '37, 99, 235';
  // Trails are stroked in this many strengths, one path each, so a frame
  // costs a few strokes however many roads the ants took.
  const TRAIL_STEPS = 24;
  // Walks and roads are projected once, at this zoom; any other zoom is
  // the same picture scaled (Web Mercator), so zooming costs no reprojection.
  const REF_ZOOM = 18;
  // The canvases reach this far past each edge of the map: a frame is drawn
  // before a drag moves the map on, so the edge it moves towards is
  // already drawn. Phones and tablets hold the map still for the whole run
  // (script.js setMapGestureLock), and the camera's own moves redraw every
  // frame, so there a thin margin does (and saves a third of the pixels).
  const VIEW_PAD = 120;
  const VIEW_PAD_HELD = 40;
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

  // The timeline, in ms. All walked rounds share the first round's pace
  // so the spreading out stays easy to follow. Rounds after the recorded
  // walks only grow the trails.
  const NEST_MS = 800;
  const FIRST_WALK_MS = 6000;
  const FIRST_TRAIL_MS = 700;
  const WALK_MS = FIRST_WALK_MS;
  const TRAIL_MS = 320;
  const QUICK_ROUNDS_MS = 3000;
  const QUICK_ROUND_MS = [120, 250];
  const DRAW_ROUTE_MS = 1000;
  // Walk all of Route 1 at one virtual travel speed, regardless of route
  // length or hazard severity. There is no route duration limit: finish
  // only when the marker reaches the destination.
  const NAV_ZOOM = 17;
  const NAV_FLY_SECONDS = 1.1;
  const NAV_METERS_PER_SECOND = 104.544;
  const NAV_GAIT_PER_MS = 0.0064;
  const ARRIVE_MS = 650;
  const WALKER_FADE_MS = 450;
  // Covers the disc, ant, arrival ring and expanding hazard ripples.
  const WALKER_CLEAR_RADIUS = 64;
  const ZOOM_OUT_SECONDS = 1;
  // Leaflet's renderers and tiles catch up on 'moveend'; while the camera
  // follows the ant, refresh after this much panning, at most four times
  // a second while the camera follows the walker.
  const NAV_REFRESH_PX = 160;
  const NAV_REFRESH_MS = 250;

  // Phones and tablets (options.mobileLayout): the map is small and the
  // hazard fills sit right under the lines, so Route 1 and the converged
  // trails get a white casing with a dark rim (3:1 against any fill, WCAG
  // 1.4.11), and converged trails never fade into the fill. A trail is
  // converged at this share of the run's strongest trail.
  const CASING_WHITE = '#ffffff';
  const CASING_RIM = '#0f172a';
  const CONVERGED_SHARE = 0.6;
  const CONVERGED_MIN_ALPHA = 0.85;
  const CONVERGED_MIN_FADE = 0.8;
  // While the camera follows the walker, a focus point that moved further
  // than this (the sheet snapped to another height) is eased to over about
  // this long instead of jumped to.
  const FOLLOW_EASE_PX = 30;
  const FOLLOW_EASE_MS = 160;
  // The focus point comes from the panels' boxes, which costs a layout to
  // read, and the walk cards' text a layout to change: the walk refreshes
  // them a few times a second, not every frame.
  const FOCUS_REFRESH_MS = 250;
  const CARDS_REFRESH_MS = 100;
  // Bound canvas and map work even when device hints miss a slow phone.
  // Movement uses elapsed time, so this does not change the replay's pace.
  const FRAME_INTERVAL = 1000 / 60;

  // Flood: the water the ant walks through, in the map's own fill colors.
  const WATER_RIPPLE = { 1: '#ca8a04', 2: '#ea580c', 3: '#be123c' };
  const WATER_POOL = { 1: '250, 204, 21', 2: '249, 115, 22', 3: '225, 29, 72' };
  // Earthquake: Low (1-2), Moderate (3) and High (4+) roads.
  const QUAKE_RING = { 1: '#ca8a04', 2: '#ca8a04', 3: '#d97706', 4: '#c2410c' };
  // Stronger hazards make larger, bolder, more frequent signal rings.
  // Rings fit inside the walker clear box; cap their count to bound work.
  const HAZARD_SIGNAL_STYLES = {
    1: { spread: 14, alpha: 0.45, width: 1.4, interval: 650 },
    2: { spread: 22, alpha: 0.65, width: 2.1, interval: 500 },
    3: { spread: 30, alpha: 0.9, width: 2.8, interval: 350 },
  };
  const HAZARD_SIGNAL_MAX_RINGS = 3;

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
  // Thousands separators by hand: a first toLocaleString call loads the
  // number formatter, a noticeable pause on a slow phone as the replay opens.
  const formatCountText = value => String(Math.round(Number(value) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

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

  // Locate a segment without scanning the entire walked path every frame.
  function findLineSegment(cumulative, distance) {
    let low = 1;
    let high = cumulative.length - 1;
    while (low < high) {
      const middle = Math.floor((low + high) / 2);
      if (cumulative[middle] < distance) low = middle + 1;
      else high = middle;
    }
    return low;
  }

  function pointAlong(line, distance) {
    const { points, cum } = line;
    const d = Math.max(0, Math.min(line.len, distance));
    const index = findLineSegment(cum, d);
    const share = (d - cum[index - 1]) / ((cum[index] - cum[index - 1]) || 1);
    const a = points[index - 1];
    const b = points[index] || a;
    return L.latLng(a[0] + (b[0] - a[0]) * share, a[1] + (b[1] - a[1]) * share);
  }

  function cutLine(line, distance) {
    if (distance >= line.len) return line.points;
    const index = findLineSegment(line.cum, distance);
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
  //     color, edgeColor, walk (false: no route preview), previewOnly
  //     (true: unsafe flood route, not a walking demonstration), wading }
  //   startName, endName, antsTotal
  //   legendBody: the map legend's body element (rewritten while it plays)
  //   hazardLegendHtml: the legend's hazard rows (earthquake.js), in place
  //     of the two-swatch default
  //   getPadding(): fitBounds padding that keeps clear of the panels
  //   onPanelChange(): the panel's content changed size
  //   mobileLayout: plays in the phone/tablet sheet (cased lines, compact
  //     cards, an eased follow, Route 1 left on the map for the results)
  //   isCameraPaused(): the visitor moved the map, so the camera stays put
  //   lockMap(locked): turn the visitor's map gestures off (true) while the
  //     camera follows the walker, and back on (false)
  function create(options) {
    const { map, replay, mode, route1: route1Info } = options;
    const isFlood = mode !== 'earthquake';
    const mobileLayout = !!options.mobileLayout;
    const viewPad = mobileLayout ? VIEW_PAD_HELD : VIEW_PAD;
    const isCameraPaused = () => !!options.isCameraPaused?.();
    const edges = decodeEdges(replay);
    const rounds = replay.rounds.map((round, index) => ({
      ...round,
      number: index + 1,
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
    const previewOnly = !!route1Info?.previewOnly;
    const routeRankingLabel = route1Info?.tier === 'unsafe' ? 'best route' : 'safest route';
    const antsReachedEnd = rounds.some(round => Number(round.arrived) > 0);
    const stepTitles = [...STEP_TITLES];
    if (!antsReachedEnd) {
      stepTitles[1] = 'Ants explore the streets';
      stepTitles[2] = 'Map search supplies a route';
    }
    if (previewOnly) stepTitles[3] = 'High-risk route preview';
    // Route 1 is walked by an ant only when the ants found it; one a
    // regular map search found (Dijkstra: the safety-first baseline or the
    // backup search) is walked by a navigation arrow instead.
    const antFoundRoute1 = !['shortest_path', 'backup_search'].includes(replay.route1?.source);
    const spans = buildSpans(replay.route1?.spans || [], route1.len);

    const state = {
      running: false,
      done: false,
      completed: false,
      nav: null,
      scene: null,
      trailOf: null,
      trailFade: 1,
      zoomAnim: false,
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
        ${stepTitles.map(title => `
          <li class="aco-step">
            <span class="aco-step-icon" aria-hidden="true"><i></i><svg viewBox="0 0 24 24"><path d="m5 12 5 5 9-10"/></svg></span>
            <span class="aco-step-text"><span class="aco-step-title">${escapeHtml(title)}</span><span class="aco-step-detail"></span></span>
          </li>`).join('')}
      </ol>
      <button type="button" class="aco-replay-more" aria-expanded="false" aria-controls="msimSheetScroll">More</button>
      <div class="safety-result-cards aco-cards" data-aco-cards="search">
        ${iconCard('ruler', 'Best route so far', 'best', 'bestSub')}
      </div>
      <div class="safety-result-cards aco-cards aco-cards--walk" data-aco-cards="walk" hidden>
        ${iconCard('flag', 'Distance left', 'left', 'leftSub')}
        ${iconCard(isFlood ? 'droplet' : 'quake', isFlood ? 'Water here' : 'Road risk here', 'here', 'hereSub')}
        ${iconCard('walk', `Route ${route1Info?.number ?? 1}`, 'route', 'routeSub', { safe: 'success', caution: 'warning', unsafe: 'danger' }[route1Info?.tier] || '')}
      </div>
      <div class="aco-replay-foot">
        <p class="aco-replay-meta"><span class="aco-meta-long"></span><span class="aco-meta-short"></span></p>
        <button type="button" class="aco-replay-skip">Skip to results</button>
      </div>
      <p class="sr-only" aria-live="polite" data-aco="caption"></p>`;
    // Looked up once: the panel's numbers are rewritten every frame.
    const fields = {};
    const field = name => {
      if (!fields[name]) fields[name] = panel.querySelector(`[data-aco="${name}"]`);
      return fields[name];
    };
    const setText = (name, text) => {
      const el = field(name);
      if (el && el.textContent !== text) el.textContent = text;
    };
    const someAnts = options.antsTotal > mainAnts;
    panel.querySelector('.aco-meta-long').textContent = someAnts
      ? `A sped-up replay of this run's main search: ${formatCountText(mainAnts)} of the ${formatCountText(options.antsTotal)} ants.`
      : `A sped-up replay of this run's search: all ${formatCountText(mainAnts)} ants.`;
    // The phone sheet's one-line version (style.css).
    panel.querySelector('.aco-meta-short').textContent = someAnts
      ? `Sped-up replay · ${formatCountText(mainAnts)} of ${formatCountText(options.antsTotal)} ants`
      : `Sped-up replay · all ${formatCountText(mainAnts)} ants`;
    panel.querySelector('.aco-replay-skip').addEventListener('click', () => finish());

    const sites = Number(replay.sites_searched) || 0;
    const endName = options.endName || 'the destination';
    const stepText = [
      `${replay.ants} virtual ants leave ${options.startName || 'the start'} one after another. They don't know the way yet, so they try many streets.`
        + (sites > 1 ? ` Ants went to all ${sites} evacuation sites; this is the search to ${endName}, the one with the ${routeRankingLabel}.` : ''),
      !antsReachedEnd
        ? `No ant reached ${endName} within the search limits, so no route trails were reinforced.`
        : `Ants that reach ${sites ? 'the site' : 'the end point'} by a safer or shorter way leave a stronger trail. The next ants follow strong trails, so the route gets better each round.`
          + (strongestTrail < WEAK_TRAIL ? ' Here every way crosses high-risk roads, so the trails stay faint.' : ''),
      !antsReachedEnd
        ? `The ants did not complete a route in ${roundCount} rounds. A regular map search supplied Route 1 instead.`
        : roundCount < replay.max_rounds
        ? `Most ants now take the same streets. No better route for ${replay.stagnation} rounds, so the search stops at round ${roundCount} of ${replay.max_rounds}.`
        : `Most ants now take the same streets. The search stops at its last round, ${roundCount}.`,
      buildRouteReadyText(),
    ];
    panel.querySelectorAll('.aco-step-detail').forEach((el, index) => { el.textContent = stepText[index]; });

    function buildRouteReadyText() {
      const found = {
        main: 'Route 1 follows the strongest trail.',
        alternative: 'Route 1 comes from ants sent around the strongest trail: it is safer.',
        shortest_path: antsReachedEnd
          ? 'A regular map search found a safer route than the ants, so Route 1 is that one.'
          : 'A regular map search found Route 1 after the ants did not complete a route.',
        backup_search: 'A backup search supplied Route 1.',
      }[replay.route1?.source] || `Route 1 is the ${routeRankingLabel} found.`;
      if (previewOnly) {
        // Not `found`: its "it is safer" reads wrong beside "unsafe".
        return 'Virtual preview only: this route is unsafe to walk. Of all the routes found, it crosses the least High water.';
      }
      if (!walksRoute1) {
        return hasRoute1 && isFlood
          ? `${found} It still crosses water over 1.5 m deep, so it is not one to walk.`
          : found;
      }
      return `${found} Previewing the route toward ${endName}.`;
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
        setText('caption', `${stepTitles[chapter]}. ${stepText[chapter]}`);
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
    const walkerSvg = antFoundRoute1
      ? `<svg class="aco-legend-walker" viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="8.6" fill="#fff" stroke="${route1Info?.edgeColor || '#15803d'}" stroke-width="2"/><g fill="#111827" stroke="#111827" stroke-width=".7" stroke-linecap="round"><path d="M9.5 10 7 6.6M9.5 10 7 13.4M10.6 10l-.4-3.6M10.6 10l-.4 3.6M11.6 10l2-3M11.6 10l2 3" fill="none"/><ellipse cx="7.4" cy="10" rx="2.6" ry="1.8"/><ellipse cx="10.5" cy="10" rx="1.2" ry="1.1"/><ellipse cx="13.1" cy="10" rx="1.4" ry="1.35"/></g></svg>`
      : `<svg class="aco-legend-walker" viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="8.6" fill="#fff" stroke="${route1Info?.edgeColor || '#15803d'}" stroke-width="2"/><path d="M14.6 10 7.4 6.2 9 10l-1.6 3.8Z" fill="${route1Info?.color || '#16a34a'}"/></svg>`;
    const legendRow = (swatch, label) => `<div class="legend-row">${swatch}<span>${escapeHtml(label)}</span></div>`;

    function renderLegend(walking) {
      if (!options.legendBody) return;
      const rows = walking
        ? legendRow(`<span class="aco-legend-route" style="background:${route1Info?.color};box-shadow:0 0 0 1px ${route1Info?.edgeColor};"></span>`, route1Info?.name || 'Route 1')
          + legendRow(walkerSvg, previewOnly ? 'Unsafe route preview' : `Walking Route ${route1Info?.number ?? 1}`)
        : legendRow(antSvg, 'Virtual ant')
          + legendRow('<span class="aco-legend-trail"></span>', 'Ant trail')
          + legendRow('<span class="aco-legend-stuck"></span>', 'Ant that got stuck');
      const hazards = options.hazardLegendHtml || (isFlood
        ? '<div class="aco-legend-levels"><span><i style="background:rgba(250,204,21,.86)"></i>Low</span><span><i style="background:rgba(249,115,22,.9)"></i>Medium</span><span><i style="background:rgba(225,29,72,.94)"></i>High</span></div>'
        : '<div class="aco-legend-levels"><span><i style="background:#f59e0b"></i>Liquefaction</span><span><i style="background:#c2410c"></i>Ground shaking</span></div>');
      // One wrapper, so the phone legend (mobile-sim.js) keeps every row; it
      // leaves out the pin rows (.aco-legend-pins) to stay short there.
      options.legendBody.innerHTML = `<div class="aco-legend">${rows}<div class="aco-legend-pins">${options.legendExtra || ''}</div>${hazards}</div>`;
    }

    // ---- map layers ----
    // The trails and the ants are drawn on two canvases the size of the map,
    // redrawn every frame at the current view, so they stay whole and in
    // step with the map while the visitor drags or zooms it. (A Leaflet
    // canvas renderer redraws only once a move has ended, and leaves out
    // whatever lies past its padding until then.)
    ensurePane(map, TRAIL_PANE, TRAIL_PANE_Z);
    ensurePane(map, ROUTE_PANE, ROUTE_PANE_Z);
    ensurePane(map, ANT_PANE, ANT_PANE_Z);
    const renderer = L.canvas({ pane: ROUTE_PANE, padding: 0.4 });
    const routeLine = (color, weight) => L.polyline([], { renderer, interactive: false, color, weight, lineCap: 'round', lineJoin: 'round' });
    const routeLayers = !hasRoute1 ? [] : mobileLayout ? [
      routeLine(CASING_RIM, ROUTE_BEST_WEIGHT + ROUTE_HALO_EXTRA_WEIGHT + ROUTE_EDGE_EXTRA_WEIGHT),
      routeLine(CASING_WHITE, ROUTE_BEST_WEIGHT + ROUTE_HALO_EXTRA_WEIGHT),
      routeLine(route1Info.color, ROUTE_BEST_WEIGHT),
    ] : [
      routeLine(route1Info.edgeColor, ROUTE_BEST_WEIGHT + ROUTE_EDGE_EXTRA_WEIGHT),
      routeLine(route1Info.color, ROUTE_BEST_WEIGHT),
    ];
    // leaflet-zoom-animated: the CSS transition Leaflet gives its own layers
    // while a zoom animates (onZoomAnim).
    const viewCanvas = (pane, className) => {
      const canvas = L.DomUtil.create('canvas', `${className} leaflet-zoom-animated`, map.getPane(pane));
      return { canvas, g: canvas.getContext('2d'), at: L.point(0, 0) };
    };
    const trailView = viewCanvas(TRAIL_PANE, 'aco-trail-canvas');
    const antView = viewCanvas(ANT_PANE, 'aco-ant-canvas');
    const views = [trailView, antView];
    const g = antView.g;
    let pixelRatio = 1;
    // Where the round's ants have walked so far (drawWalked), off screen.
    const walked = { canvas: document.createElement('canvas'), key: null };
    walked.g = walked.canvas.getContext('2d');

    const startRef = map.project(startLatLng, REF_ZOOM);
    const trailRef = new Map(trailRoads.map(number => [number, edgePoints(number).map(point => map.project(point, REF_ZOOM))]));
    const refPoints = walk => {
      if (!walk.ref) walk.ref = walk.points.map(point => map.project(point, REF_ZOOM));
      return walk.ref;
    };

    function sizeCanvases() {
      const size = map.getSize().add([viewPad * 2, viewPad * 2]);
      pixelRatio = window.agnasUI?.canvasRatio() || Math.min(window.devicePixelRatio || 1, 1.5);
      views.forEach(view => {
        view.canvas.width = Math.round(size.x * pixelRatio);
        view.canvas.height = Math.round(size.y * pixelRatio);
        view.canvas.style.width = `${size.x}px`;
        view.canvas.style.height = `${size.y}px`;
        view.drawn = null;
        view.blank = true;
        view.walkerBox = null;
      });
      walked.canvas.width = trailView.canvas.width;
      walked.canvas.height = trailView.canvas.height;
      walked.key = null;
    }

    // Canvases are released now rather than at the next garbage
    // collection: Safari caps the memory all canvases on a page may hold,
    // and a few runs in a row could reach it, after which a new replay's
    // canvases stay blank.
    function releaseCanvas(canvas) {
      if (!canvas) return;
      canvas.width = 0;
      canvas.height = 0;
    }

    // What a canvas's picture depends on besides its content: the map's
    // zoom, origin and pan, and whether a zoom is animating.
    function viewKey() {
      const origin = map.getPixelOrigin();
      const pane = map.containerPointToLayerPoint([0, 0]);
      return `${map.getZoom()}|${origin.x}|${origin.y}|${pane.x}|${pane.y}|${state.zoomAnim}`;
    }

    // Clears a canvas and lines it up with the map (VIEW_PAD past it). While
    // a zoom animates it keeps the place and scale onZoomAnim gave it.
    function beginView(view, dirtyBox = null) {
      if (!state.zoomAnim) {
        view.at = map.containerPointToLayerPoint([-viewPad, -viewPad]);
        L.DomUtil.setPosition(view.canvas, view.at);
      }
      view.g.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      if (dirtyBox) {
        view.g.clearRect(dirtyBox.x, dirtyBox.y, dirtyBox.size, dirtyBox.size);
      } else {
        const size = map.getSize().add([viewPad * 2, viewPad * 2]);
        view.g.clearRect(0, 0, size.x, size.y);
      }
      view.walkerBox = null;
    }

    // From REF_ZOOM pixels to the canvas: x * k - ox. While a zoom animates,
    // the frame from before it (view.frozen).
    function frameOf(view) {
      if (state.zoomAnim && view.frozen) return view.frozen;
      const origin = map.getPixelOrigin().add(view.at);
      return { k: map.getZoomScale(map.getZoom(), REF_ZOOM), ox: origin.x, oy: origin.y };
    }

    // A wheel, button or end-of-pinch zoom animates the map's layers with a
    // CSS transform towards the new view; the canvases take the same one,
    // and the ants keep walking in them, still drawn in the frame from
    // before the zoom (Leaflet switches the map to the new zoom as soon as
    // this event is over, while the picture is still animating).
    function onZoomAnim(event) {
      const scale = map.getZoomScale(event.zoom, map.getZoom());
      const origin = map.getPixelOrigin();
      const newOrigin = map._getNewPixelOrigin(event.center, event.zoom);
      views.forEach(view => {
        view.frozen = frameOf(view);
        L.DomUtil.setTransform(view.canvas, view.at.add(origin).multiplyBy(scale).subtract(newOrigin), scale);
      });
      state.zoomAnim = true;
    }

    function onZoomEnd() {
      state.zoomAnim = false;
      views.forEach(view => { view.frozen = null; });
      redraw();
    }

    function redraw() {
      drawTrails(state.trailOf, state.trailFade);
      drawAnts(state.scene);
    }

    const mapHandlers = {
      resize: () => { sizeCanvases(); redraw(); },
      zoomanim: onZoomAnim,
      zoomend: onZoomEnd,
      move: () => { if (!state.running && !state.nav) redraw(); },
    };

    function addLayers() {
      if (state.layersOn) return;
      state.layersOn = true;
      sizeCanvases();
      map.on(mapHandlers);
    }

    // Keep Route 1 in every layout until the results draw their lines over
    // it (removeRoute), so the handoff never leaves a blank map.
    function removeLayers() {
      views.forEach(view => {
        releaseCanvas(view.canvas);
        view.canvas.remove();
      });
      releaseCanvas(walked.canvas);
      if (!state.layersOn) return;
      state.layersOn = false;
      map.off(mapHandlers);
    }

    function removeRoute() {
      routeLayers.forEach(layer => layer.remove());
      const box = renderer._container;
      renderer.remove();
      if (box?.tagName === 'CANVAS') releaseCanvas(box);
    }

    // strengthOf(road): 0-1 (trailStrength). Stronger trails are wider and
    // darker, and drawn last, over the weaker ones. key names the trails'
    // state (null: always draw): the trails hold still while each round's
    // ants walk, and a canvas left alone costs the frame nothing.
    function drawTrails(strengthOf, fade = 1, key = null) {
      state.trailOf = strengthOf;
      state.trailFade = fade;
      const drawn = key === null ? null : `${key}|${viewKey()}`;
      if (drawn !== null && drawn === trailView.drawn) return;
      trailView.drawn = drawn;
      beginView(trailView);
      if (!strengthOf) return;
      const t = trailView.g;
      const f = frameOf(trailView);
      const byStep = [];
      trailRef.forEach((ref, number) => {
        const strength = strengthOf(number);
        if (!(strength > 0.02)) return;
        const step = Math.max(1, Math.round(clamp01(strength) * TRAIL_STEPS));
        if (!byStep[step]) byStep[step] = [];
        byStep[step].push(ref);
      });
      t.lineCap = 'round';
      t.lineJoin = 'round';
      const trace = refs => {
        t.beginPath();
        refs.forEach(ref => ref.forEach((point, index) => {
          const x = point.x * f.k - f.ox;
          const y = point.y * f.k - f.oy;
          if (index) t.lineTo(x, y);
          else t.moveTo(x, y);
        }));
      };
      byStep.forEach((refs, step) => {
        if (!refs) return;
        const strength = step / TRAIL_STEPS;
        const width = 1.5 + 7 * strength;
        let alpha = (0.2 + 0.7 * strength) * fade;
        trace(refs);
        // Relative to this run's strongest trail: a search through
        // high-risk roads keeps every trail thin, but its converged one
        // still has to show on the fill under it.
        if (mobileLayout && strength >= CONVERGED_SHARE * strongestTrail) {
          const casingFade = Math.max(fade, CONVERGED_MIN_FADE);
          alpha = Math.max(CONVERGED_MIN_ALPHA, 0.2 + 0.7 * strength) * casingFade;
          t.lineWidth = width + 5;
          t.strokeStyle = CASING_RIM;
          t.globalAlpha = 0.75 * casingFade;
          t.stroke();
          t.lineWidth = width + 3;
          t.strokeStyle = CASING_WHITE;
          t.globalAlpha = 0.95 * casingFade;
          t.stroke();
          t.globalAlpha = 1;
        }
        t.lineWidth = width;
        t.strokeStyle = `rgba(${SCENT}, ${alpha.toFixed(3)})`;
        t.stroke();
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
    // f: frameOf(antView).
    function pointOn(walk, f, distance) {
      const ref = refPoints(walk);
      const d = Math.max(0, Math.min(walk.len, distance));
      const index = findLineSegment(walk.cum, d);
      const a = ref[index - 1];
      const b = ref[index] || a;
      const share = (d - walk.cum[index - 1]) / ((walk.cum[index] - walk.cum[index - 1]) || 1);
      return {
        x: (a.x + (b.x - a.x) * share) * f.k - f.ox,
        y: (a.y + (b.y - a.y) * share) * f.k - f.oy,
        heading: Math.atan2(b.y - a.y, b.x - a.x),
        index,
      };
    }

    function strokeSpan(ctx, walk, f, from, to) {
      const ref = refPoints(walk);
      const p0 = pointOn(walk, f, from);
      const p1 = pointOn(walk, f, to);
      ctx.beginPath();
      ctx.moveTo(p0.x, p0.y);
      for (let k = p0.index; k < p1.index; k += 1) ctx.lineTo(ref[k].x * f.k - f.ox, ref[k].y * f.k - f.oy);
      ctx.lineTo(p1.x, p1.y);
      ctx.stroke();
    }

    // Where each ant has walked, faint, so streets many ants take turn
    // darker. Re-stroking a round's 40 walks from the start every frame
    // would be most of the replay's GPU time, so they are kept on a canvas
    // of their own: each frame strokes only what the ants walked since the
    // last one (butt caps, so the pieces meet without darker beads), and the
    // whole round is redrawn only when the view has moved.
    function drawWalked(scene, f) {
      const w = walked.g;
      const walks = scene.round.walks || [];
      const key = `${scene.round.number}|${f.k}|${f.ox}|${f.oy}|${walked.canvas.width}`;
      w.setTransform(1, 0, 0, 1, 0, 0);
      if (key !== walked.key) {
        walked.key = key;
        w.clearRect(0, 0, walked.canvas.width, walked.canvas.height);
        walks.forEach(walk => { walk.drawnTo = 0; });
      }
      w.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      w.strokeStyle = `rgba(${SCENT}, 0.2)`;
      w.lineWidth = 2.6;
      w.lineCap = 'butt';
      w.lineJoin = 'round';
      walks.forEach(walk => {
        const to = Math.min(1, (scene.u - walk.depart) / walk.dur) * walk.len;
        if (!(to > walk.drawnTo)) return;
        strokeSpan(w, walk, f, walk.drawnTo, to);
        walk.drawnTo = to;
      });
      g.globalAlpha = scene.fade;
      g.drawImage(walked.canvas, 0, 0, walked.canvas.width / pixelRatio, walked.canvas.height / pixelRatio);
      g.globalAlpha = 1;
    }

    // An ellipse as a subpath of its own: without the moveTo, ellipse()
    // joins it to the one before with a line, and the fill spans the gap.
    function traceBlob(x, y, rx, ry, rotation) {
      g.moveTo(x + rx * Math.cos(rotation), y + rx * Math.sin(rotation));
      g.ellipse(x, y, rx, ry, rotation, 0, Math.PI * 2);
    }

    // Small ants facing where they walk: six moving legs, then abdomen,
    // thorax and head over a white outline, so they read on any map color.
    // A group is one stroke and two fills however many ants are in it (a
    // round sends 40), not seven draw calls per ant.
    // ants: [{ x, y, heading, gait }], all at one alpha and size.
    function drawAntGroup(ants, alpha = 1, size = 1.12) {
      if (!ants.length) return;
      g.globalAlpha = alpha;
      g.strokeStyle = ANT_INK;
      g.lineWidth = 0.9 * size;
      g.beginPath();
      ants.forEach(({ x, y, heading, gait }) => {
        const c = Math.cos(heading) * size;
        const s = Math.sin(heading) * size;
        for (let j = -1; j <= 1; j += 1) {
          const bx = x + c * j * 1.3;
          const by = y + s * j * 1.3;
          const swing = Math.sin(gait + j * 2.1) * 0.38;
          for (let side = -1; side <= 1; side += 2) {
            const angle = heading + side * (Math.PI / 2 - j * 0.5) + swing * side;
            g.moveTo(bx, by);
            g.lineTo(bx + Math.cos(angle) * 3.6 * size, by + Math.sin(angle) * 3.6 * size);
          }
        }
      });
      g.stroke();
      // Abdomen, thorax and head, each [rx, ry] at size 1.
      const bodies = (abdomen, thorax, head) => {
        g.beginPath();
        ants.forEach(({ x, y, heading }) => {
          const c = Math.cos(heading) * size;
          const s = Math.sin(heading) * size;
          traceBlob(x - c * 3.2, y - s * 3.2, abdomen[0] * size, abdomen[1] * size, heading);
          traceBlob(x, y, thorax[0] * size, thorax[1] * size, heading);
          traceBlob(x + c * 2.9, y + s * 2.9, head[0] * size, head[1] * size, heading);
        });
        g.fill();
      };
      g.fillStyle = '#ffffff';
      bodies([3.5, 2.7], [2.2, 2], [2.4, 2.3]);
      g.fillStyle = ANT_INK;
      bodies([2.7, 1.9], [1.45, 1.25], [1.65, 1.55]);
      g.globalAlpha = 1;
    }

    function drawAnt(x, y, heading, alpha, gait, size = 1.12) {
      drawAntGroup([{ x, y, heading, gait }], alpha, size);
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
      // Nothing to show, and nothing shown since the canvas was cleared.
      if (!scene && antView.blank) return;
      beginView(antView);
      antView.blank = !scene;
      if (!scene || scene.kind === 'none') return;
      const f = frameOf(antView);
      const sx = startRef.x * f.k - f.ox;
      const sy = startRef.y * f.k - f.oy;
      const now = performance.now();
      g.lineCap = 'round';
      g.lineJoin = 'round';

      if (scene.kind === 'nest') {
        const nest = [];
        for (let index = replay.ants - 1; index >= 0; index -= 1) {
          nest.push({ ...nestSpot(index, sx, sy, now), gait: now / 90 + index });
        }
        drawAntGroup(nest, scene.alpha, 0.9);
        return;
      }

      const walks = scene.round.walks || [];
      const u = scene.u;
      drawWalked(scene, f);
      if (!scene.live) return;

      // Fresh scent right behind each walking ant.
      g.lineWidth = 3.4;
      walks.forEach(walk => {
        const progress = (u - walk.depart) / walk.dur;
        if (progress <= 0 || progress >= 1) return;
        const d = progress * walk.len;
        const a = pointOn(walk, f, d - SCENT_TAIL_METERS);
        const b = pointOn(walk, f, d);
        const gradient = g.createLinearGradient(a.x, a.y, b.x, b.y);
        gradient.addColorStop(0, `rgba(${SCENT}, 0)`);
        gradient.addColorStop(1, `rgba(${SCENT}, 0.9)`);
        g.strokeStyle = gradient;
        strokeSpan(g, walk, f, d - SCENT_TAIL_METERS, d);
      });

      const waiting = [];
      const walking = [];
      const stuck = [];
      walks.forEach((walk, index) => {
        const progress = (u - walk.depart) / walk.dur;
        if (progress <= 0) {
          waiting.push({ ...nestSpot(index, sx, sy, now), gait: now / 90 + index });
          return;
        }
        if (progress < 1) {
          walking.push({ ...pointOn(walk, f, progress * walk.len), gait: now / 45 + walk.gait });
          return;
        }
        const since = (u - walk.depart - walk.dur) * scene.walkMs;
        const end = pointOn(walk, f, walk.len);
        if (walk.ok) {
          if (since < 700) ring(end.x, end.y, 5 + 17 * since / 700, ARRIVED_RING, 0.9 * (1 - since / 700), 2.4);
          if (since < 320) drawAnt(end.x, end.y, end.heading, 1 - since / 320, 0);
        } else {
          // An ant that got stuck: a gray ring stays where it stopped.
          stuck.push(end);
          if (since < 500) drawAnt(end.x, end.y, end.heading, 1 - since / 500, 0);
        }
      });
      if (stuck.length) {
        g.globalAlpha = 0.8;
        g.strokeStyle = STUCK_RING;
        g.lineWidth = 1.8;
        g.beginPath();
        stuck.forEach(end => {
          g.moveTo(end.x + 4.6, end.y);
          g.arc(end.x, end.y, 4.6, 0, Math.PI * 2);
        });
        g.stroke();
        g.globalAlpha = 1;
      }
      drawAntGroup(walking);
      drawAntGroup(waiting.reverse(), 1, 0.9);
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
        drawTrails(() => 0, 1, 'none');
        drawAnts({ kind: 'nest', alpha: ease(t * 2.5) });
        syncPanel(0, 0, false);
        return;
      }
      if (step === DRAW_STEP) {
        const last = rounds[roundCount - 1].levels;
        const k = ease(t);
        drawTrails(number => last.get(number) || 0, 1 - 0.7 * k, `route|${k}`);
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
      drawTrails(number => {
        const from = previous ? previous.levels.get(number) || 0 : 0;
        const to = round.levels.get(number) || 0;
        return from + (to - from) * trailPhase;
      }, 1, `${step}|${trailPhase}`);
    }

    // ---- the walk along Route 1 ----
    const PER_MINUTE = WALKING_SPEED_METERS_PER_MINUTE;
    // This affects the real walking estimate only. Animation speed never
    // changes with hazard severity, including unsafe virtual previews.
    const walkingEtaPaceShare = levels => (!previewOnly && isFlood && levels[0] ? FLOOD_WALKING_PACE_SHARE_BY_VAR[levels[0]] || 1 : 1);

    function minutesLeft(distance) {
      if (!spans.length) return (route1.len - distance) / PER_MINUTE;
      let from = 0;
      let minutes = 0;
      spans.forEach(span => {
        const start = Math.max(from, distance);
        if (span.to > start) minutes += (span.to - start) / PER_MINUTE / walkingEtaPaceShare(span.levels);
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

    // The phone sheet's cards are half as wide, so there each line is short
    // enough to stay on one line.
    function hereText(distance) {
      const levels = spanAt(distance).levels;
      if (isFlood) {
        const water = levels[0] || 0;
        const name = water ? getFloodRiskLabelFromVar(water) : 'None';
        if (previewOnly) {
          return [name, water === 3 ? 'Not walkable' : water ? FLOOD_DEPTH_ON_ADULT_BY_VAR[water] : 'Dry road'];
        }
        return [name, water ? FLOOD_DEPTH_ON_ADULT_BY_VAR[water] : 'Dry road'];
      }
      const [liquefaction = 1, shaking = 1] = levels;
      const level = getRiskLevelLabelFromScore(Math.max(liquefaction, shaking));
      const liquefactionLabel = getRiskLevelLabelFromScore(liquefaction);
      const shakingLabel = getRiskLevelLabelFromScore(shaking);
      if (mobileLayout) {
        return [level, liquefactionLabel === shakingLabel
          ? 'Liquefaction and shaking'
          : liquefaction > shaking ? 'From liquefaction' : 'From ground shaking'];
      }
      return [
        level,
        `Liquefaction ${liquefactionLabel.toLowerCase()} · ground shaking ${shakingLabel.toLowerCase()}`,
      ];
    }

    function syncWalkCards(distance) {
      const left = Math.max(0, route1.len - distance);
      const reachedEnd = distance >= route1.len;
      const endText = previewOnly ? 'Preview complete' : 'Arrived';
      setText('left', reachedEnd ? endText : formatKm(left));
      if (previewOnly) {
        setText('leftSub', 'Unsafe route preview');
      } else {
        const minutes = minutesLeft(distance);
        setText('leftSub', reachedEnd ? endName : minutes < 1 ? 'Under a minute to go' : `About ${formatWalkingMinutes(minutes)} walk`);
      }
      const [value, sub] = hereText(distance);
      setText('here', value);
      setText('hereSub', sub);
    }

    function hazardSignalStyle(level) {
      const severity = isFlood ? Math.min(3, level) : level >= 4 ? 3 : level >= 3 ? 2 : level > 0 ? 1 : 0;
      return HAZARD_SIGNAL_STYLES[severity];
    }

    // The walker is a white disc ringed in Route 1's color, so it stands out
    // on the line, carrying one of the colony's ants (larger; its legs keep
    // a steady rhythm) when the ants found Route 1, or a
    // navigation arrow in Route 1's color pointing the way when a regular
    // map search did. opts: arrived (0-1 at the end), gait, ripples ({ t,
    // level }), wet (0-1, easing in and out of flood water), level (the
    // water or road level under it).
    function drawWalker(latlng, heading, opts = {}) {
      const { arrived = 0, gait = 0, ripples = [], wet = 0, level = 0 } = opts;
      state.scene = { kind: 'none' };
      // Search ants need the full canvas; a single walker only needs its
      // old drawing cleared. Resize/zoom redraws reset this to a full clear.
      beginView(antView, antView.walkerBox);
      antView.blank = false;
      const f = frameOf(antView);
      const ref = map.project(latlng, REF_ZOOM);
      const p = { x: ref.x * f.k - f.ox, y: ref.y * f.k - f.oy };
      antView.walkerBox = {
        x: p.x - WALKER_CLEAR_RADIUS,
        y: p.y - WALKER_CLEAR_RADIUS,
        size: WALKER_CLEAR_RADIUS * 2,
      };
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
        const signal = hazardSignalStyle(ripple.level);
        if (color && signal) ring(p.x, p.y, 23 + signal.spread * k, color, signal.alpha * (1 - k), signal.width * (1 - 0.5 * k));
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
      const c = Math.cos(heading);
      const s = Math.sin(heading);
      if (!antFoundRoute1) {
        // An arrowhead with a notched tail, centered on the disc.
        const k = 1.32;
        g.fillStyle = route1Info.color;
        g.beginPath();
        g.moveTo(p.x + c * 6 * k, p.y + s * 6 * k);
        g.lineTo(p.x - c * 4 * k - s * 4.6 * k, p.y - s * 4 * k + c * 4.6 * k);
        g.lineTo(p.x - c * 1.6 * k, p.y - s * 1.6 * k);
        g.lineTo(p.x - c * 4 * k + s * 4.6 * k, p.y - s * 4 * k - c * 4.6 * k);
        g.closePath();
        g.fill();
        return;
      }
      // The ant's body runs from abdomen (behind) to head (ahead); nudge it
      // forward so the whole ant sits centered in the disc.
      drawAnt(p.x + c * 1.2, p.y + s * 1.2, heading, 1, gait, 1.45);
    }

    // While the camera follows the ant, the visitor's own drags and zooms
    // would fight it.
    function setMapLocked(locked) {
      if (state.mapLocked === locked) return;
      state.mapLocked = locked;
      options.lockMap?.(locked);
    }

    function startWalk() {
      if (!walksRoute1) {
        finish({ completed: true });
        return;
      }
      state.nav = { raf: 0, timer: 0 };
      const paused = isCameraPaused();
      setMapLocked(!paused);
      drawTrails(() => 0);
      panel.querySelector('[data-aco-cards="search"]').hidden = true;
      panel.querySelector('[data-aco-cards="walk"]').hidden = false;
      panel.classList.add('is-walking');
      setText('route', previewOnly ? formatKm(route1Info.distance) : `${formatKm(route1Info.distance)} · ${route1Info.durationText} walk`);
      setText('routeSub', previewOnly ? 'Preview only — unsafe to walk' : route1Info.name);
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
      // The visitor has the map where they want it: the walk starts there.
      if (paused) {
        follow();
        return;
      }
      map.once('moveend', follow);
      state.nav.timer = window.setTimeout(follow, NAV_FLY_SECONDS * 1000 + 500);
      map.flyTo(centerShowing(pointAlong(route1, 0), NAV_ZOOM), NAV_ZOOM, mapMoveOptions({ duration: NAV_FLY_SECONDS }));
    }

    function followRoute() {
      const startedAt = performance.now();
      let last = startedAt;
      let lastPaint = startedAt;
      let focus = null;
      let focusAt = -Infinity;
      let cardsAt = -Infinity;
      let moved = 0;
      let refreshedAt = startedAt;
      let distance = 0;
      let gait = 0;
      let lastRipple = -1e9;
      let ripples = [];
      let wet = 0;
      let lastLevel = 0;
      function step(now) {
        if (!state.nav) return;
        const paintElapsed = now - lastPaint;
        if (paintElapsed < FRAME_INTERVAL - 0.1) {
          state.nav.raf = requestAnimationFrame(step);
          return;
        }
        // Preserve fractional frame time on 75/90/144 Hz displays instead
        // of rounding every paint down to a whole browser callback.
        lastPaint += Math.max(1, Math.floor((paintElapsed + 0.1) / FRAME_INTERVAL)) * FRAME_INTERVAL;
        // A stalled frame or returning to the tab must not jump the marker
        // to the destination. Ordinary frames keep the same travel speed.
        const travelMs = Math.min(100, now - last);
        const dt = Math.min(50, travelMs);
        last = now;
        distance = Math.min(route1.len, distance + NAV_METERS_PER_SECOND * travelMs / 1000);
        gait += travelMs * NAV_GAIT_PER_MS;
        const levels = spanAt(distance).levels;
        const level = isFlood ? levels[0] || 0 : Math.max(levels[0] || 1, levels[1] || 1);
        const signal = hazardSignalStyle(level);
        wet += ((isFlood && level ? 1 : 0) - wet) * Math.min(1, dt / 220);
        if (signal && (level !== lastLevel || now - lastRipple >= signal.interval)) {
          ripples.push({ t: now, level });
          lastRipple = now;
        }
        if (signal) lastLevel = level;
        ripples = ripples.filter(ripple => now - ripple.t < 1000).slice(-HAZARD_SIGNAL_MAX_RINGS);
        const here = pointAlong(route1, distance);
        // Keep the walker at the focus point: pan by how far it drifted.
        // _rawPanBy + 'move' (what panBy does inside) moves the map without
        // a 'moveend' every frame, which would make each renderer and tile
        // layer update every frame; refreshes are limited by both travel
        // distance and elapsed time. While the visitor has moved the
        // map (isCameraPaused) it is theirs, and unlocked.
        const paused = isCameraPaused();
        setMapLocked(!paused);
        if (now - focusAt >= FOCUS_REFRESH_MS) {
          focus = focusPoint();
          focusAt = now;
        }
        let offset = paused ? L.point(0, 0) : map.latLngToContainerPoint(here).subtract(focus);
        if (mobileLayout && Math.abs(offset.x) + Math.abs(offset.y) > FOLLOW_EASE_PX) {
          offset = offset.multiplyBy(Math.min(1, dt / FOLLOW_EASE_MS));
        }
        if (Math.abs(offset.x) + Math.abs(offset.y) > 0.2) {
          map._rawPanBy(offset);
          map.fire('move');
          moved += Math.abs(offset.x) + Math.abs(offset.y);
          if (moved > NAV_REFRESH_PX && now - refreshedAt >= NAV_REFRESH_MS) {
            moved = 0;
            refreshedAt = now;
            map.fire('moveend');
          }
        }
        drawWalker(here, headingAt(distance), { gait, ripples, wet, level: isFlood ? lastLevel : level });
        if (now - cardsAt >= CARDS_REFRESH_MS || distance >= route1.len) {
          syncWalkCards(distance);
          cardsAt = now;
        }
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
      let lastPaint = startedAt;
      function step(now) {
        if (!state.nav) return;
        const paintElapsed = now - lastPaint;
        if (paintElapsed < FRAME_INTERVAL - 0.1) {
          state.nav.raf = requestAnimationFrame(step);
          return;
        }
        lastPaint += Math.max(1, Math.floor((paintElapsed + 0.1) / FRAME_INTERVAL)) * FRAME_INTERVAL;
        const k = clamp01((now - startedAt) / ARRIVE_MS);
        drawWalker(here, heading, { arrived: k, gait, wet: wet * (1 - k), level });
        if (k < 1) {
          state.nav.raf = requestAnimationFrame(step);
          return;
        }
        zoomOut(here, heading, gait, level);
      }
      state.nav.raf = requestAnimationFrame(step);
    }

    function routeBounds() {
      return L.latLngBounds([...route1.points, startLatLng, L.latLng(replay.end)]);
    }

    function zoomOut(here, heading, gait, level) {
      const startedAt = performance.now();
      let lastPaint = startedAt;
      let cameraEnded = isCameraPaused();
      let markerFaded = false;
      const end = () => {
        if (cameraEnded && markerFaded) finish({ completed: true });
      };
      // Continue drawing at the last position while the camera pulls back;
      // a frozen canvas would slide away from its road during the flight.
      const fade = now => {
        if (!state.nav) return;
        const paintElapsed = now - lastPaint;
        if (paintElapsed < FRAME_INTERVAL - 0.1) {
          state.nav.raf = requestAnimationFrame(fade);
          return;
        }
        lastPaint += Math.max(1, Math.floor((paintElapsed + 0.1) / FRAME_INTERVAL)) * FRAME_INTERVAL;
        const k = ease((now - startedAt) / WALKER_FADE_MS);
        antView.canvas.style.opacity = String(1 - k);
        drawWalker(here, heading, { gait, level });
        if (k < 1) {
          state.nav.raf = requestAnimationFrame(fade);
          return;
        }
        markerFaded = true;
        drawAnts(null);
        end();
      };
      state.nav.raf = requestAnimationFrame(fade);
      if (!cameraEnded) {
        const onMoveEnd = () => { cameraEnded = true; end(); };
        state.nav.onMoveEnd = onMoveEnd;
        map.once('moveend', onMoveEnd);
        state.nav.timer = window.setTimeout(onMoveEnd, ZOOM_OUT_SECONDS * 1000 + 600);
        map.flyToBounds(routeBounds(), mapMoveOptions({ ...(options.getPadding?.() || {}), duration: ZOOM_OUT_SECONDS }));
      }
    }

    function stopWalk() {
      if (!state.nav) return;
      cancelAnimationFrame(state.nav.raf);
      window.clearTimeout(state.nav.timer);
      if (state.nav.onMoveEnd) map.off('moveend', state.nav.onMoveEnd);
      state.nav = null;
      map.stop();
      options.onWalkChange?.(false);
    }

    // ---- running it ----
    function frameLoop() {
      let elapsed = 0;
      let last = performance.now();
      let lastPaint = last;
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
        const paintElapsed = now - lastPaint;
        if (paintElapsed >= FRAME_INTERVAL - 0.1) {
          drawFrame(elapsed);
          lastPaint += Math.max(1, Math.floor((paintElapsed + 0.1) / FRAME_INTERVAL)) * FRAME_INTERVAL;
        }
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

    function finish({ completed = false } = {}) {
      if (state.done) return;
      state.done = true;
      state.completed = completed;
      state.running = false;
      state.zoomAnim = false;
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
        // Skipped before it began (Skip is on screen while the loader fades).
        if (state.done || !roundCount) {
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
      didComplete: () => state.completed,
      // The camera follows the walker (or flies to the end of the walk).
      isWalking: () => !!state.nav,
      isRouteShown: () => routeLayers.some(layer => map.hasLayer(layer)),
      removeRoute,
    };
  }

  window.acoReplay = { create };
})();
