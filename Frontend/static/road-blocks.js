// Road blocks: on a result, the visitor can close up to MAX_BLOCKS roads (a
// third replaces the oldest) and AGNAS finds a way around them. The blocks
// belong to the result (simData.road_blocks, placed on the roads by the
// backend's add_road_access_nodes), so they go when it does: New
// simulation, a pin moved, another disaster or barangay. Each change re-runs
// quietly (rerunForRoadBlocks in script.js): no loader, scenario or replay;
// the routes fade until the new ones replace them. A block no route on the
// map uses changes nothing, so it is only added. Desktop: "Add road block",
// then a click on the road. Phones and tablets (mobile-sim.js): the center
// pin, then "Block this road". No state of its own beyond the placing step:
// it reads script.js globals.
(function initRoadBlocks() {
  const MAX_BLOCKS = 2;
  // A route line this close to a block runs through it: route lines follow
  // the road centerlines the blocks are placed on.
  const ON_ROUTE_METERS = 4;
  const METERS_PER_DEGREE = 111320;

  let placing = false;
  let busy = false;
  // The blocks a re-run is finding routes for, drawn while it works.
  let pendingBlocks = null;
  let note = { text: '', error: false };
  let layer = null;
  // Whether the legend last drawn had the road block row.
  let lastLegendKey = null;

  // A barrier across a road: red and white stripes in a dark rim, on a white
  // disc so it reads on the flood fills and the satellite view.
  const BARRIER = `<rect x="6" y="11" width="18" height="8" rx="1.5" fill="#dc2626"/>
    <path d="M8 19 11 11h2.5l-3 8Zm5 0 3-8h2.5l-3 8Zm5 0 3-8h2.5l-3 8Z" fill="#fff"/>
    <rect x="6" y="11" width="18" height="8" rx="1.5" fill="none" stroke="#7f1d1d" stroke-width="1.2"/>`;
  const MARKER_SVG = `<svg viewBox="0 0 30 30" width="30" height="30" aria-hidden="true">
    <circle cx="15" cy="15" r="13" fill="#fff" stroke="#7f1d1d" stroke-width="2"/>${BARRIER}</svg>`;
  const SWATCH_SVG = `<svg viewBox="4 9 22 12" aria-hidden="true">${BARRIER}</svg>`;
  const REMOVE_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 7 10 10M17 7 7 17"/></svg>';

  const blockName = block => block?.street || 'Unnamed road';

  function hasResult() {
    return !!(simData && simData.pins_key === getRoutePinsKey()
      && Array.isArray(simData.routes) && simData.routes.length);
  }

  function currentBlocks() {
    return hasResult() && Array.isArray(simData.road_blocks) ? simData.road_blocks : [];
  }

  function shownBlocks() {
    return pendingBlocks || currentBlocks();
  }

  function isPlacing() {
    return placing && hasResult();
  }

  // ---- the run request ----

  // A full re-run (Update my route, after a reload) keeps the blocks.
  function requestFields() {
    const blocks = currentBlocks();
    return blocks.length ? { road_blocks: blocks.map(({ lat, lng }) => ({ lat, lng })) } : {};
  }

  // ---- placing ----

  function startPlacing() {
    if (busy || placing || !hasResult() || isSimulationInteractionLocked()) return;
    placing = true;
    setNote('');
    gMap?.closePopup();
    if (!window.mobileSim?.startRoadBlock()) gMap?.getContainer().classList.add('road-block-placing');
    sync();
  }

  function stopPlacing({ restoreFocus = false } = {}) {
    if (!placing) return;
    placing = false;
    // A refused spot's message goes with the step it was about.
    if (note.error) note = { text: '', error: false };
    gMap?.getContainer().classList.remove('road-block-placing');
    window.mobileSim?.endRoadBlock();
    sync();
    if (restoreFocus) document.querySelector('[data-road-blocks]:not([hidden]) [data-road-block-add]')?.focus({ preventScroll: true });
  }

  // A click on the map while placing (script.js onMapClickForPin, and a
  // route line's own click in osm.js). Desktop only: phones set the block
  // with the center pin.
  function handleMapClick(latlng) {
    if (!isPlacing() || window.mobileSim?.isActive()) return false;
    place(latlng);
    return true;
  }

  async function fetchCheck(latlng) {
    const response = await fetch(`${window.BACKEND_BASE}/check-pin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        barangay: selectedBarangay || '',
        hazard: isEarthquakeSimulationResult(simData) ? 'Earthquake' : 'Flood',
        lat: latlng.lat,
        lng: latlng.lng,
        kind: 'road_block',
      }),
    });
    const data = await parseBackendJsonResponse(response);
    if (!response.ok || data?.error === true) throw new Error(data?.message || 'Could not check that spot.');
    return data;
  }

  // Resolves { ok, message }: ok once the block is taken (the placing step
  // ends), otherwise why not, and the visitor can try another spot.
  async function place(latlng) {
    if (busy || !hasResult()) return { ok: false, message: '' };
    if (!isPointInsideBarangay(latlng.lat, latlng.lng)) {
      return refuse(`Tap on a road inside Brgy. ${selectedBarangay}.`);
    }
    busy = true;
    setNote('Checking that road…');
    sync();
    let check;
    try {
      check = await fetchCheck(latlng);
    } catch (err) {
      check = { valid: false, message: `Could not check that spot: ${err.message}` };
    } finally {
      busy = false;
    }
    if (!hasResult()) return { ok: false, message: '' };
    if (!check.valid) return refuse(check.message || 'Tap on a road to block it.');

    const block = { lat: Number(check.road_lat), lng: Number(check.road_lng), street: check.street || null };
    stopPlacing();
    const next = [...currentBlocks(), block];
    const replaced = next.length > MAX_BLOCKS ? next.shift() : null;
    // The routes on the map stay the safest found: none of them uses that
    // road, and closing a road only takes routes away.
    if (!replaced && !touchesShownRoute(block)) {
      simData.road_blocks = next;
      storeInSession(next);
      setNote('None of the routes use this road, so they stay the same.');
      sync();
      return { ok: true, message: '' };
    }
    rerun(next, { added: block, replaced });
    return { ok: true, message: '' };
  }

  function refuse(message) {
    setNote(message, { error: true });
    sync();
    return { ok: false, message };
  }

  function remove(index) {
    const blocks = currentBlocks();
    if (busy || !blocks[index] || isSimulationInteractionLocked()) return;
    gMap?.closePopup();
    stopPlacing();
    rerun(blocks.filter((_, i) => i !== index), { removed: blocks[index] });
  }

  // ---- the quiet re-run ----

  async function rerun(next, change) {
    busy = true;
    pendingBlocks = next;
    setNote(change.removed ? 'Updating the route…' : 'Finding a way around the block…');
    gMap?.getContainer().classList.add('road-block-rerouting');
    sync();
    try {
      const result = await window.rerunForRoadBlocks(next);
      if (!result) return;
      setNote(change.replaced ? `Replaced the block on ${blockName(change.replaced)}.` : 'Route updated.');
    } catch (err) {
      console.warn('Road block re-run failed:', err);
      setNote(
        err.noRouteAroundBlocks
          ? (change.added ? "No route gets around that block, so it wasn't added." : 'No route gets around these blocks.')
          : err.roadBlockInvalid ? err.message
          : `Couldn't update the route: ${err.message}`,
        { error: true },
      );
    } finally {
      busy = false;
      pendingBlocks = null;
      gMap?.getContainer().classList.remove('road-block-rerouting');
      sync();
    }
  }

  // A reload brings the result back from the tab's stored copy.
  function storeInSession(blocks) {
    const session = readSimulationSession();
    if (!session?.result) return;
    session.result.road_blocks = blocks;
    saveSimulationSession(session);
  }

  // ---- does a route run through a block? ----

  function routesOnMap() {
    if (isEarthquakeSimulationResult(simData)) {
      return Object.values(simData.views || {}).flatMap(view => view?.routes || []);
    }
    return simData?.routes || [];
  }

  function toLatLng(point) {
    return Array.isArray(point) ? { lat: Number(point[0]), lng: Number(point[1]) } : { lat: Number(point.lat), lng: Number(point.lng) };
  }

  // Metres from p to the segment a-b, on a flat projection around p (fine
  // over a few metres).
  function segmentDistance(p, a, b) {
    const cos = Math.cos(p.lat * Math.PI / 180);
    const ax = (a.lng - p.lng) * cos * METERS_PER_DEGREE;
    const ay = (a.lat - p.lat) * METERS_PER_DEGREE;
    const bx = (b.lng - p.lng) * cos * METERS_PER_DEGREE;
    const by = (b.lat - p.lat) * METERS_PER_DEGREE;
    const dx = bx - ax;
    const dy = by - ay;
    const length = dx * dx + dy * dy;
    const t = length ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / length)) : 0;
    return Math.hypot(ax + t * dx, ay + t * dy);
  }

  function touchesShownRoute(block) {
    return routesOnMap().some(route => {
      const points = getRoutePoints(route).map(toLatLng);
      for (let i = 1; i < points.length; i += 1) {
        if (segmentDistance(block, points[i - 1], points[i]) <= ON_ROUTE_METERS) return true;
      }
      return false;
    });
  }

  // ---- drawing ----

  function setNote(text, { error = false } = {}) {
    note = { text, error };
    if (text && window.mobileSim?.isActive() && !placing) window.mobileSim.toast(uiCopy(text), { error });
  }

  function sync() {
    if (placing && !hasResult()) {
      placing = false;
      gMap?.getContainer().classList.remove('road-block-placing');
      window.mobileSim?.endRoadBlock();
    }
    if (!hasResult() && !pendingBlocks) note = { text: '', error: false };
    syncMarkers();
    renderSlots();
    const legendKey = hasResult() ? shownBlocks().length > 0 : null;
    if (legendKey !== lastLegendKey) {
      lastLegendKey = legendKey;
      refreshLegend();
    }
    window.mobileSim?.scheduleSync();
  }

  function syncMarkers() {
    if (!gMap) return;
    if (!layer) layer = L.layerGroup();
    layer.clearLayers();
    const blocks = hasResult() ? shownBlocks() : [];
    if (!blocks.length) {
      layer.remove();
      return;
    }
    if (!gMap.hasLayer(layer)) layer.addTo(gMap);
    const committed = currentBlocks();
    blocks.forEach(block => {
      const index = committed.indexOf(block);
      const marker = L.marker([block.lat, block.lng], {
        icon: L.divIcon({
          className: `road-block-marker${index < 0 ? ' is-pending' : ''}`,
          html: MARKER_SVG,
          iconSize: [30, 30],
          iconAnchor: [15, 15],
          popupAnchor: [0, -14],
        }),
        title: `Road block on ${blockName(block)}`,
        keyboard: index >= 0,
        zIndexOffset: 3200,
      });
      if (index >= 0) {
        marker.bindPopup(() => `<div class="road-block-popup-body">
            <div class="popup-title">Road block</div>
            <p>${escapeHtml(blockName(block))}</p>
            <button type="button" class="road-block-popup-remove" data-road-block-remove="${index}">Remove</button>
          </div>`, {
          ...getEvacSitePopupPanOptions(),
          className: 'road-block-popup',
          maxWidth: 240,
        });
      }
      marker.addTo(layer);
    });
  }

  function renderSlots() {
    const result = hasResult();
    const blocks = shownBlocks();
    const committed = currentBlocks();
    const desktopPlacing = placing && !window.mobileSim?.isActive();
    const hint = desktopPlacing ? 'Click the blocked road on the map.'
      : blocks.length ? '' : 'Is a street blocked? Add it, and AGNAS finds another way.';
    const items = blocks.map(block => {
      const index = committed.indexOf(block);
      const name = escapeHtml(blockName(block));
      return `<li class="road-block-item${index < 0 ? ' is-pending' : ''}">
          <span class="road-block-swatch">${SWATCH_SVG}</span>
          <span class="road-block-name">${name}</span>
          ${index < 0 ? '' : `<button type="button" class="road-block-remove" data-road-block-remove="${index}" aria-label="Remove the road block on ${name}"${busy ? ' disabled' : ''}>${REMOVE_SVG}</button>`}
        </li>`;
    }).join('');
    const html = result ? `<section class="road-blocks${busy ? ' is-busy' : ''}" aria-label="Road blocks">
        <div class="road-blocks-head">
          <span class="road-blocks-title">Road blocks</span>
          <span class="road-blocks-count">${blocks.length} of ${MAX_BLOCKS}</span>
        </div>
        ${hint ? `<p class="road-blocks-hint">${hint}</p>` : ''}
        ${items ? `<ul class="road-blocks-list">${items}</ul>` : ''}
        <button type="button" class="road-blocks-add${desktopPlacing ? ' is-cancel' : ''}" data-road-block-add${busy && !placing ? ' disabled' : ''}>${desktopPlacing ? 'Cancel' : 'Add road block'}</button>
        <p class="road-blocks-status${note.error ? ' is-error' : ''}" role="status" aria-live="polite">${escapeHtml(note.text)}</p>
      </section>` : '';
    document.querySelectorAll('[data-road-blocks]').forEach(slot => {
      if (slot._html === html) return;
      // Keyboard focus stays on the same control across a redraw.
      const focused = slot.contains(document.activeElement)
        ? document.activeElement.matches('[data-road-block-add]') ? '[data-road-block-add]' : null
        : null;
      slot._html = html;
      slot.innerHTML = html;
      slot.hidden = !html;
      if (focused) slot.querySelector(focused)?.focus({ preventScroll: true });
    });
  }

  // The center pin's picture on phones (mobile-sim.js): a map pin carrying
  // the barrier, its tip at y 53 like the start and end pins'
  // (.msim-center-pin in style.css).
  function centerPinIconUrl() {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 60" width="48" height="60">
      <path d="M24 53C22.2 46 17.6 37.6 13 32.9A15.5 15.5 0 1 1 35 32.9C30.4 37.6 25.8 46 24 53Z" fill="#dc2626" stroke="#7f1d1d" stroke-width="2" stroke-linejoin="round"/>
      <circle cx="24" cy="22" r="11" fill="#fff"/>
      <g transform="translate(9 7)">${BARRIER}</g></svg>`;
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  }

  // The map legend's row (setFloodLegendContent, earthquake.js syncLegend),
  // while the result has blocks.
  function legendRowHtml() {
    if (!shownBlocks().length || !hasResult()) return '';
    return `<div class="legend-row"><span class="road-block-legend-swatch">${SWATCH_SVG}</span><span style="font-size:.78rem;">Road block</span></div>`;
  }

  function refreshLegend() {
    if (!gMap || !hasResult()) return;
    if (isEarthquakeSimulationResult(simData)) {
      window.earthquakeUI?.syncLegend(activeEarthquakeView, { showRouteKeys: true, hazardLayers: simData.hazard_layers });
    } else {
      setFloodLegendContent();
    }
  }

  // ---- the PDF report (script.js) ----

  function drawOnReport(ctx, project) {
    currentBlocks().forEach(block => {
      const [x, y] = project(block);
      ctx.save();
      ctx.translate(x - 15, y - 15);
      ctx.beginPath();
      ctx.arc(15, 15, 13, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#7f1d1d';
      ctx.stroke();
      ctx.fillStyle = '#dc2626';
      ctx.fillRect(6, 11, 18, 8);
      ctx.fillStyle = '#ffffff';
      [8, 13, 18].forEach(left => {
        ctx.beginPath();
        ctx.moveTo(left, 19);
        ctx.lineTo(left + 3, 11);
        ctx.lineTo(left + 5.5, 11);
        ctx.lineTo(left + 2.5, 19);
        ctx.closePath();
        ctx.fill();
      });
      ctx.lineWidth = 1.2;
      ctx.strokeRect(6, 11, 18, 8);
      ctx.restore();
    });
  }

  // ---- wiring ----

  document.addEventListener('click', event => {
    const add = event.target.closest?.('[data-road-block-add]');
    if (add) {
      if (placing) stopPlacing({ restoreFocus: true });
      else startPlacing();
      return;
    }
    const removeButton = event.target.closest?.('[data-road-block-remove]');
    if (removeButton) remove(Number(removeButton.dataset.roadBlockRemove));
  });
  // Before script.js's handler, which would otherwise close what is behind.
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || !placing || window.mobileSim?.isActive()) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    stopPlacing({ restoreFocus: true });
  }, true);

  window.roadBlocks = {
    sync,
    isPlacing,
    isBusy: () => busy,
    handleMapClick,
    place,
    startPlacing,
    stopPlacing,
    requestFields,
    current: currentBlocks,
    centerPinIconUrl,
    drawOnReport,
    legendRowHtml,
  };
})();
