// The evacuation site choice, played on the map before the ants' replay
// (aco-replay.js) of a run to the evacuation sites: the ants' best route to
// each site the run searched, one site at a time in the order they searched
// them, then the ranking -- safety first, as the results rank routes -- and
// the pick: the best-ranked site with room for the visitor's group, a better
// one that is full passed over (evac-capacity.js). Drawn from what the
// backend recorded of this very run (build_site_search in osm_routing.py),
// sped up.
//
// script.js decides when it plays (prepareSimulationReplay) and where its
// panel goes, like the replay's: the results column, the phone sheet, or a
// card over the map.
(function initSitePick() {
  const PANE = 'sitePickPane';
  // Above the replay's trails and Route 1 (380, 385), under the route lines
  // (overlayPane, 400) and the pins (markerPane, 600).
  const PANE_Z = 388;
  // The ants' search color (the replay's trails), the results' best-route
  // green, and the eliminated routes' red.
  const SEARCH = '#2563eb';
  const SEARCH_EDGE = '#1e3a8a';
  const CHOSEN = '#16a34a';
  const CHOSEN_EDGE = '#14532d';
  const PASSED = '#dc2626';
  const DIM = '#64748b';

  // The timeline, in ms. A site's line is drawn at one pace, so a far site
  // takes longer, within these bounds; many sites go a little faster.
  const INTRO_MS = 900;
  const DRAW_MIN_MS = 800;
  const DRAW_MAX_MS = 1500;
  const DRAW_MS_PER_KM = 700;
  const SITE_HOLD_MS = 380;
  const RANK_MS = 1300;
  const PASSED_MS = 1000;
  const CHOSEN_HOLD_MS = 2200;
  const FIT_FLY_SECONDS = 0.8;
  const METERS_PER_DEGREE_LAT = 110574;
  const METERS_PER_DEGREE_LNG = 111320;

  const CHECK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 5 5 9-10"/></svg>';
  const clamp01 = value => Math.max(0, Math.min(1, value));
  const easeInOut = value => {
    const x = clamp01(value);
    return x < 0.5 ? 2 * x * x : 1 - ((-2 * x + 2) ** 2) / 2;
  };
  const formatKm = meters => (meters >= 1000 ? `${(meters / 1000).toFixed(2)} km` : `${Math.round(meters)} m`);
  // A name that already ends a sentence ("Near GreenWood Ave.") takes no
  // second period.
  const endSentence = text => (/\.$/.test(text) ? text : `${text}.`);

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

  // The line from its start to `distance` metres along it.
  function cutLine(line, distance) {
    if (distance >= line.len) return line.points;
    let index = 1;
    while (index < line.cum.length - 1 && line.cum[index] < distance) index += 1;
    const share = (distance - line.cum[index - 1]) / ((line.cum[index] - line.cum[index - 1]) || 1);
    const a = line.points[index - 1];
    const b = line.points[index] || a;
    return [...line.points.slice(0, index), [a[0] + (b[0] - a[0]) * share, a[1] + (b[1] - a[1]) * share]];
  }

  // options:
  //   map, sites (the replay's site_search), start ({lat, lng}), startName,
  //   mode ('flood' | 'earthquake'), groupSize
  //   fit(bounds, flySeconds): frames bounds clear of the panels
  //   legendBody, legendExtra: the map legend's body and its pin rows
  //   onPanelChange(): the panel's content changed size
  function create(options) {
    const { map } = options;
    const isFlood = options.mode !== 'earthquake';
    const group = Math.max(1, Number(options.groupSize) || 1);
    const sites = options.sites.map(site => ({
      ...site,
      line: site.route?.coordinates?.length > 1 ? measure(site.route.coordinates) : null,
    }));
    const chosen = sites.find(site => site.chosen) || null;
    const ranked = sites.filter(site => site.rank).sort((a, b) => a.rank - b.rank);
    const passed = ranked.filter(site => site.passed_over);
    const hasCapacity = sites.some(site => site.capacity);
    const fast = sites.length > 5 ? 0.75 : 1;

    const state = { done: false, skipped: false, resolve: null, timers: new Set(), rafs: new Set() };
    const layers = [];

    // ---- the panel ----
    const panel = document.createElement('section');
    panel.className = 'aco-replay site-pick';
    panel.setAttribute('aria-label', 'Choosing an evacuation site');
    panel.innerHTML = `
      <div class="safety-section-label aco-replay-label">Choosing an evacuation site</div>
      <div class="safety-route-chip aco-replay-chip">${safetyIcon('pin')}<span>${escapeHtml(`${options.startName || 'Start'} → ${sites.length} evacuation sites`)}</span></div>
      <p class="site-pick-lead" data-pick-lead></p>
      <ol class="site-pick-list">
        ${sites.map(site => `
          <li class="site-pick-row is-waiting" data-site="${escapeHtml(site.id)}">
            <span class="site-pick-dot" aria-hidden="true"><i></i>${CHECK}</span>
            <span class="site-pick-main">
              <span class="site-pick-name">${escapeHtml(site.name)}</span>
              <span class="site-pick-meta" data-pick-meta>Waiting</span>
            </span>
            <span class="site-pick-badge" data-pick-badge></span>
          </li>`).join('')}
      </ol>
      <div class="aco-replay-foot">
        <p class="aco-replay-meta"><span class="aco-meta-long">Each line is the ants' best route to that site, from this run.</span><span class="aco-meta-short">The ants' best route to each site</span></p>
        <button type="button" class="aco-replay-skip">Skip to results</button>
      </div>
      <p class="sr-only" aria-live="polite" data-pick-caption></p>`;
    panel.querySelector('.aco-replay-skip').addEventListener('click', () => finish({ skipped: true }));
    const rowOf = site => panel.querySelector(`[data-site="${CSS.escape(String(site.id))}"]`);
    const setLead = text => {
      panel.querySelector('[data-pick-lead]').textContent = text;
      panel.querySelector('[data-pick-caption]').textContent = text;
    };

    function describeRoute(site) {
      const route = site.route;
      if (!route) return 'No route found';
      const distance = formatKm(Number(route.distance) || 0);
      if (!isFlood) return `${distance} · ${getRiskLevelLabelFromScore(route.max_hazard)} road risk`;
      const high = Number(route.high_distance) || 0;
      const medium = Number(route.medium_distance) || 0;
      const water = high > 0 ? `${formatKm(high)} in High water`
        : medium > 0 ? `${formatKm(medium)} in Medium water`
        : Number(route.flood_var) >= 1 ? 'Low water only'
        : 'No flooding';
      return `${distance} · ${water}`;
    }

    function capacityBadge(site) {
      const room = site.capacity;
      if (!room) return null;
      if (!room.has_room) return { text: room.occupancy >= room.capacity ? 'Full' : `No room for ${group}`, level: 'full' };
      return { text: `${room.available} left`, level: room.occupancy >= room.capacity * 0.8 ? 'filling' : 'open' };
    }

    function setRow(site, status, { meta, badge } = {}) {
      const row = rowOf(site);
      if (!row) return;
      row.className = `site-pick-row is-${status}${row.classList.contains('is-ranked') ? ' is-ranked' : ''}`;
      if (meta != null) row.querySelector('[data-pick-meta]').textContent = meta;
      const badgeEl = row.querySelector('[data-pick-badge]');
      if (badge !== undefined) {
        badgeEl.textContent = badge?.text || '';
        badgeEl.className = `site-pick-badge${badge ? ` is-${badge.level}` : ''}`;
      }
    }

    // ---- the legend ----
    function renderLegend() {
      if (!options.legendBody) return;
      const line = (color, edge, dashed = false) => `<span class="site-pick-legend-line${dashed ? ' is-dashed' : ''}" style="--line:${color};--edge:${edge}"></span>`;
      const row = (swatch, label) => `<div class="legend-row">${swatch}<span>${escapeHtml(label)}</span></div>`;
      options.legendBody.innerHTML = `<div class="aco-legend">
        ${row(line(SEARCH, SEARCH_EDGE), "Ants' best route to a site")}
        ${row(line(CHOSEN, CHOSEN_EDGE), 'Route to the chosen site')}
        ${hasCapacity ? row(line(PASSED, PASSED, true), 'Full site, passed over') : ''}
        <div class="aco-legend-pins">${options.legendExtra || ''}</div>
      </div>`;
    }

    // ---- the map ----
    const pane = map.getPane(PANE) || map.createPane(PANE);
    pane.style.zIndex = String(PANE_Z);
    pane.style.pointerEvents = 'none';
    const renderer = L.svg({ pane: PANE, padding: 0.5 });
    const add = layer => {
      layers.push(layer);
      return layer.addTo(map);
    };
    const polyline = (style) => add(L.polyline([], {
      renderer, interactive: false, lineCap: 'round', lineJoin: 'round', ...style,
    }));
    sites.forEach(site => {
      if (!site.line) return;
      site.edge = polyline({ color: SEARCH_EDGE, weight: 7, opacity: 0 });
      site.stroke = polyline({ color: SEARCH, weight: 4.5, opacity: 0 });
    });
    const head = add(L.circleMarker(options.start, {
      renderer, interactive: false, radius: 6, color: '#ffffff', weight: 2.5, fillColor: SEARCH, fillOpacity: 1, opacity: 0,
    }));
    head.setStyle({ fillOpacity: 0 });

    function ping(site, kind) {
      const icon = L.divIcon({ className: 'site-pick-ping', html: `<span class="is-${kind}"></span>`, iconSize: [0, 0] });
      const marker = add(L.marker([site.lat, site.lng], { icon, interactive: false, keyboard: false, zIndexOffset: -1000 }));
      return marker;
    }

    function label(site, text, kind) {
      site.label?.remove();
      const icon = L.divIcon({
        className: 'site-pick-tag',
        html: `<span class="is-${kind}">${kind === 'chosen' ? CHECK : ''}${escapeHtml(text)}</span>`,
        iconSize: [0, 0],
      });
      site.label = add(L.marker([site.lat, site.lng], { icon, interactive: false, keyboard: false, zIndexOffset: 4000 }));
    }

    function styleLine(site, { color, edge, weight, opacity, dashArray = null }) {
      if (!site.line) return;
      site.edge.setStyle({ color: edge, weight: weight + 2.5, opacity: opacity * 0.9, dashArray });
      site.stroke.setStyle({ color, weight, opacity, dashArray });
    }

    // ---- timing, cancelled by finish ----
    const wait = ms => new Promise(resolve => {
      if (state.done) { resolve(); return; }
      const id = window.setTimeout(() => { state.timers.delete(id); resolve(); }, ms);
      state.timers.add(id);
    });

    const animate = (ms, onFrame) => new Promise(resolve => {
      if (state.done) { resolve(); return; }
      const begun = performance.now();
      const step = now => {
        if (state.done) { resolve(); return; }
        const t = clamp01((now - begun) / ms);
        onFrame(t);
        if (t >= 1) { resolve(); return; }
        const id = requestAnimationFrame(step);
        state.rafs.add(id);
      };
      state.rafs.add(requestAnimationFrame(step));
    });

    // ---- the timeline ----
    async function checkSite(site, index) {
      setLead(endSentence(`Site ${index + 1} of ${sites.length}: the ants look for the safest way to ${site.name}`));
      setRow(site, 'checking', { meta: 'Ants searching…' });
      options.onPanelChange?.();
      const pinging = ping(site, 'search');
      if (site.line) {
        site.edge.setLatLngs([]);
        site.stroke.setLatLngs([]);
        styleLine(site, { color: SEARCH, edge: SEARCH_EDGE, weight: 4.5, opacity: 1 });
        head.setStyle({ opacity: 1, fillOpacity: 1, fillColor: SEARCH });
        head.bringToFront();
        const ms = Math.min(DRAW_MAX_MS, Math.max(DRAW_MIN_MS, (site.line.len / 1000) * DRAW_MS_PER_KM)) * fast;
        await animate(ms, t => {
          const part = cutLine(site.line, site.line.len * easeInOut(t));
          site.edge.setLatLngs(part);
          site.stroke.setLatLngs(part);
          head.setLatLng(part[part.length - 1]);
        });
        head.setStyle({ opacity: 0, fillOpacity: 0 });
      }
      if (state.done) return;
      pinging.remove();
      const badge = capacityBadge(site);
      setRow(site, site.route ? 'checked' : 'unreached', { meta: describeRoute(site), badge });
      if (site.route) label(site, formatKm(Number(site.route.distance) || 0), 'distance');
      // The finished line steps back, so the next site's search stands out.
      styleLine(site, { color: SEARCH, edge: SEARCH_EDGE, weight: 3.5, opacity: 0.55 });
      await wait(SITE_HOLD_MS * fast);
    }

    async function rank() {
      setLead(isFlood
        ? 'Ranking the sites: the least flooded route first, then the shortest.'
        : 'Ranking the sites: the least risky route first, then the shortest.');
      // The list re-orders by rank, each row gliding to its new place.
      const list = panel.querySelector('.site-pick-list');
      const rows = [...list.children];
      const before = new Map(rows.map(row => [row, row.getBoundingClientRect().top]));
      const order = [...ranked, ...sites.filter(site => !site.rank)];
      order.forEach(site => {
        const row = rowOf(site);
        if (!row) return;
        list.appendChild(row);
        if (site.rank) row.querySelector('.site-pick-dot').dataset.rank = String(site.rank);
        row.classList.add('is-ranked');
      });
      if (!prefersReducedMotion()) {
        rows.forEach(row => {
          const delta = before.get(row) - row.getBoundingClientRect().top;
          if (!delta) return;
          row.animate([{ transform: `translateY(${delta}px)` }, { transform: 'translateY(0)' }], {
            duration: 520, easing: 'cubic-bezier(.22, 1, .36, 1)',
          });
        });
      }
      options.onPanelChange?.();
      ranked.forEach(site => label(site, `#${site.rank}`, 'rank'));
      await wait(RANK_MS);
    }

    async function decide() {
      for (const site of passed) {
        if (state.done) return;
        setLead(`${site.name} ranks #${site.rank}, but it is full. The ants pass it over.`);
        setRow(site, 'passed', { meta: `${describeRoute(site)} · Passed over` });
        styleLine(site, { color: PASSED, edge: PASSED, weight: 3.5, opacity: 0.85, dashArray: '2 9' });
        label(site, 'FULL', 'passed');
        await wait(PASSED_MS);
      }
      if (state.done || !chosen) return;
      sites.forEach(site => {
        if (site === chosen || site.passed_over) return;
        styleLine(site, { color: DIM, edge: DIM, weight: 3, opacity: 0.22 });
        site.label?.remove();
        site.label = null;
        if (site.rank) setRow(site, 'other');
      });
      setRow(chosen, 'chosen', { meta: describeRoute(chosen) });
      styleLine(chosen, { color: CHOSEN, edge: CHOSEN_EDGE, weight: 6, opacity: 1 });
      chosen.edge?.bringToFront();
      chosen.stroke?.bringToFront();
      label(chosen, 'Chosen', 'chosen');
      ping(chosen, 'chosen');
      setLead(finalSentence());
      options.onPanelChange?.();
      await wait(CHOSEN_HOLD_MS);
    }

    function finalSentence() {
      if (!chosen) return '';
      if (passed.length) {
        const names = passed.map(site => site.name);
        const list = names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names[0];
        return `${list} ${passed.length > 1 ? 'are' : 'is'} full, so the ants go to ${chosen.name}, the next safest site with room.`;
      }
      return hasCapacity
        ? `${chosen.name} has the safest route, and it has room.`
        : `${chosen.name} has the safest route.`;
    }

    function finish({ skipped = false } = {}) {
      if (state.done) return;
      state.done = true;
      state.skipped = skipped;
      state.timers.forEach(id => window.clearTimeout(id));
      state.rafs.forEach(id => cancelAnimationFrame(id));
      document.removeEventListener('keydown', onKeyDown);
      state.resolve?.({ skipped });
    }

    function onKeyDown(event) {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      if (document.querySelector('[aria-modal="true"]:not([hidden])')) return;
      event.preventDefault();
      finish({ skipped: true });
    }

    // Plays the choice; resolves with { skipped } once it has ended.
    function start() {
      return new Promise(resolve => {
        state.resolve = resolve;
        if (state.done) {
          resolve({ skipped: state.skipped });
          return;
        }
        document.addEventListener('keydown', onKeyDown);
        renderLegend();
        (async () => {
          setLead(`The ants look for the safest route to each of the ${sites.length} evacuation sites, one site at a time.`);
          await wait(INTRO_MS);
          for (let index = 0; index < sites.length && !state.done; index += 1) {
            await checkSite(sites[index], index);
          }
          if (!state.done) await rank();
          if (!state.done) await decide();
          finish();
        })().catch(err => {
          console.error('The site choice stopped:', err);
          finish();
        });
      });
    }

    // The start, every site and every searched route.
    function getBounds() {
      const bounds = L.latLngBounds([L.latLng(options.start)]);
      sites.forEach(site => {
        bounds.extend([site.lat, site.lng]);
        site.line?.points.forEach(point => bounds.extend(point));
      });
      return bounds;
    }

    // The chosen site, for the replay's panel once this one gives way.
    function buildSummary() {
      const summary = document.createElement('div');
      summary.className = 'quake-summary site-pick-summary';
      const passedNote = passed.length
        ? `<span>${escapeHtml(`${passed.map(site => site.name).join(', ')} ${passed.length > 1 ? 'were' : 'was'} full`)}</span>`
        : '';
      summary.innerHTML = `<span class="aco-step-icon" aria-hidden="true">${CHECK}</span>
        <span><b>Evacuation site</b><span>${escapeHtml(chosen?.name || '')}</span>${passedNote ? `, ${passedNote}` : ''}</span>`;
      return summary;
    }

    // fade: the lines and tags fade out as the replay takes over.
    function destroy({ fade = false } = {}) {
      finish();
      const remove = () => {
        layers.forEach(layer => layer.remove());
        layers.length = 0;
        sites.forEach(site => { site.label = null; });
      };
      if (!fade || prefersReducedMotion()) {
        remove();
        return;
      }
      pane.classList.add('is-fading');
      document.querySelectorAll('.site-pick-tag, .site-pick-ping').forEach(el => el.classList.add('is-fading'));
      window.setTimeout(() => {
        remove();
        pane.classList.remove('is-fading');
      }, 420);
    }

    sites.forEach(site => setRow(site, 'waiting'));
    setLead(`The ants look for the safest route to each of the ${sites.length} evacuation sites, one site at a time.`);

    return {
      panel,
      start,
      skip: () => finish({ skipped: true }),
      destroy,
      getBounds,
      buildSummary,
      isDone: () => state.done,
      fitSeconds: FIT_FLY_SECONDS,
    };
  }

  window.sitePick = { create };
})();
