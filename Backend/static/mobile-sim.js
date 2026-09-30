// Phone and tablet layout of the simulator (< 1024px wide and >= 500px tall):
// a full-screen map under a floating top bar, map controls and a fixed center
// pin, one bottom sheet with a setup mode and a results mode, and a Map
// layers sheet (a centered card on tablets). The markup is #msim in
// index.html; style.css hides it on desktops and short viewports, where the
// setup and results panels do the same job.
//
// This file keeps no simulation state of its own. Everything it shows is read
// from script.js's globals (selectedHazard, routePins, pinPlacementRole,
// simData, ...) and every action goes through script.js's own functions
// (placeRoutePin, selectHazard, runSimulation, ...), so the desktop panels and
// this sheet can never disagree. script.js calls in through window.mobileSim.
(function initMobileSim() {
  const SHEET_QUERY = window.matchMedia('(max-width: 1023px) and (min-height: 500px)');
  // Gap between the top bar and a full-height sheet.
  const FULL_SHEET_TOP_GAP = 8;
  // Space kept under the last item that shows at peek height.
  const PEEK_BOTTOM_GAP = 10;
  // Matches the sheet's height transition in style.css.
  const SNAP_MS = 280;
  // Least map height left between the top bar and the sheet for the center
  // pin, and for the zoom/locate buttons, to stay on screen.
  const PIN_MIN_ROOM = 90;
  const CONTROLS_MIN_ROOM = 170;
  // Below this the sheet is full height and the map is just a sliver.
  const MAP_COVERED_ROOM = 40;
  const ROUTES_SHOWN = 3;
  // A second tap inside this window is a double-tap zoom, not a pin move.
  const MAP_TAP_DELAY_MS = 260;
  const DISCLAIMER_SEEN_KEY = 'agnas-disclaimer-seen';
  const SNAP_ORDER = ['peek', 'half', 'full'];
  const FLOOD_LEGEND_ROWS = [
    ['rgba(250,204,21,.86)', 'Low flooding'],
    ['rgba(249,115,22,.90)', 'Medium flooding'],
    ['rgba(225,29,72,.94)', 'High flooding'],
  ];

  const $ = id => document.getElementById(id);
  const shell = $('appShell');
  const sheet = $('msimSheet');
  const scroller = $('msimSheetScroll');
  const handle = $('msimSheetHandle');
  if (!shell || !sheet || !scroller || !handle) return;

  const state = {
    mode: 'setup', // 'setup' | 'results'
    snap: 'peek', // 'peek' | 'half' | 'full'
    height: 0, // the sheet's visible height, px
    snaps: { peek: 0, half: 0, full: 0 },
    routesExpanded: false,
    syncFrame: null,
    drag: null,
    suppressHandleClick: false,
    layersOpen: false,
    layersCloseTimer: null,
    baseLayers: null,
    mapTapTimer: null,
  };

  function isActive() {
    return SHEET_QUERY.matches;
  }

  // ---- geometry. #map fills the viewport here, so map-container y and
  // viewport y differ only by the map's top (normally 0). ----

  function getMapTop() {
    return $('map')?.getBoundingClientRect().top || 0;
  }

  function getTopBarBottom() {
    return $('msimTopbar')?.getBoundingClientRect().bottom || 0;
  }

  // Height of the map strip still visible between the top bar and the sheet.
  function getMapRoom(height = state.height) {
    return window.innerHeight - height - getTopBarBottom();
  }

  // Map-container y of the center pin's tip for a given sheet height: the
  // middle of the visible strip, not of the whole map (the sheet covers that).
  function getPinY(height = state.height) {
    return (getTopBarBottom() + window.innerHeight - height) / 2 - getMapTop();
  }

  function getPinRole() {
    return pinPlacementRole && canPlaceRoutePins() ? pinPlacementRole : null;
  }

  function isCenterPinShown(height = state.height) {
    return isActive()
      && state.mode === 'setup'
      && !!getPinRole()
      && getMapRoom(height) >= PIN_MIN_ROOM;
  }

  // What the sheet and top bar cover, so script.js can fit routes and the
  // barangay into the part of the map that is actually visible.
  function getCoveredInsets() {
    if (!isActive()) return null;
    return { top: Math.max(0, getTopBarBottom() - getMapTop()), bottom: state.height };
  }

  // ---- sheet height and snapping ----

  function getPeekEnd() {
    if (state.mode === 'results') return $('msimResultActions');
    if (!selectedHazard) return $('msimHazardSection');
    const help = $('msimSetupHelp');
    return help.textContent.trim() ? help : $('msimSetupActions');
  }

  // Peek fits the real content (the Start/End slots and the action row, or
  // the verdict and its buttons) instead of a fixed number.
  function measurePeek() {
    const end = getPeekEnd();
    if (!end || !end.getClientRects().length) return 0;
    const bottom = end.getBoundingClientRect().bottom - sheet.getBoundingClientRect().top + scroller.scrollTop;
    const paddingBottom = parseFloat(getComputedStyle(sheet).paddingBottom) || 0;
    return Math.ceil(bottom + PEEK_BOTTOM_GAP + paddingBottom);
  }

  function measureSnaps() {
    if (!isActive()) return;
    const full = Math.max(160, Math.round(window.innerHeight - getTopBarBottom() - FULL_SHEET_TOP_GAP));
    const peek = Math.min(full, measurePeek() || 200);
    const half = Math.min(full, Math.max(peek, Math.round(window.innerHeight * 0.5)));
    state.snaps = { peek, half, full };

    const target = state.drag ? null : state.snaps[state.snap];
    if (target != null && Math.abs(target - state.height) > 1) {
      applyHeight(target, { animate: state.height > 0 });
    } else {
      syncChrome();
    }
  }

  // Sets the sheet's visible height. While the center pin shows, the map
  // pans by as much as the pin moves, so the spot under it stays put.
  function applyHeight(height, { animate = true } = {}) {
    const previous = state.height;
    const next = Math.max(0, Math.round(height));
    const pinWasShown = previous > 0 && isCenterPinShown(previous);
    state.height = next;

    if (!animate) shell.classList.add('msim-instant');
    shell.style.setProperty('--sheet-h', `${next}px`);
    syncChrome();
    if (!animate) {
      void sheet.offsetHeight; // apply the new height before transitions return
      shell.classList.remove('msim-instant');
    }

    if (pinWasShown && next !== previous && gMap) {
      const shift = getPinY(previous) - getPinY(next);
      gMap.panBy([0, shift], animate && !prefersReducedMotion()
        ? { duration: SNAP_MS / 1000, easeLinearity: 0.5 }
        : { animate: false });
    }
  }

  function snapTo(name, { animate = true } = {}) {
    if (!state.snaps[name]) measureSnaps();
    state.snap = name;
    if (name === 'peek') scroller.scrollTop = 0;
    const target = state.snaps[name];
    if (target) applyHeight(target, { animate });
    else syncChrome();
  }

  // Handle tap / Enter: peek -> half -> full -> peek, skipping a stop that is
  // no taller than the one before it (a short phone's half can equal peek).
  function cycleSnap() {
    let next = SNAP_ORDER[(SNAP_ORDER.indexOf(state.snap) + 1) % SNAP_ORDER.length];
    if (next === 'half' && state.snaps.half - state.snaps.peek < 24) next = 'full';
    if (next === 'full' && state.snaps.full - state.snaps[state.snap] < 24) next = 'peek';
    snapTo(next);
  }

  function nearestSnap(height) {
    return SNAP_ORDER.reduce((best, name) => (
      Math.abs(state.snaps[name] - height) < Math.abs(state.snaps[best] - height) ? name : best
    ), 'peek');
  }

  // Everything that follows the sheet's height: its scroll mode, the labels
  // that name the next size, the center pin and the map controls.
  function syncChrome() {
    sheet.dataset.snap = state.snap;
    handle.setAttribute('aria-label', state.snap === 'full' ? 'Collapse panel' : 'Expand panel');
    const detailsBtn = $('msimDetailsBtn');
    if (detailsBtn) detailsBtn.textContent = state.snap === 'full' ? 'Show map' : 'See details';
    const room = getMapRoom();
    shell.classList.toggle('msim-controls-hidden', isActive() && room < CONTROLS_MIN_ROOM);
    shell.classList.toggle('msim-map-covered', isActive() && room < MAP_COVERED_ROOM);
    syncCenterPin();
  }

  function syncCenterPin() {
    const pin = $('msimCenterPin');
    const img = $('msimCenterPinImg');
    if (!pin || !img) return;

    const role = getPinRole();
    const shown = !!role && isCenterPinShown();
    if (shown) {
      if (img.dataset.role !== role) {
        img.src = makeRouteEndpointPinIcon(role).options.iconUrl;
        img.dataset.role = role;
      }
      shell.style.setProperty('--msim-pin-y', `${getPinY() + getMapTop()}px`);
      pin.classList.toggle('is-checking', routePins[role]?.status === 'checking');
    }
    pin.hidden = !shown;
  }

  // ---- dragging the handle or a sheet header ----

  function onPointerDown(event) {
    if (!isActive() || state.drag) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    const zone = event.target.closest?.('.msheet-handle, [data-sheet-drag]');
    if (!zone || !sheet.contains(zone)) return;
    if (zone !== handle && event.target.closest('button, a, input, select, textarea, summary')) return;

    state.drag = {
      id: event.pointerId,
      zone,
      startY: event.clientY,
      startHeight: state.height,
      lastY: event.clientY,
      lastTime: event.timeStamp,
      velocity: 0,
      moved: false,
    };
  }

  function onPointerMove(event) {
    const drag = state.drag;
    if (!drag || event.pointerId !== drag.id) return;

    const travel = drag.startY - event.clientY;
    if (!drag.moved) {
      if (Math.abs(travel) < 6) return;
      drag.moved = true;
      drag.zone.setPointerCapture?.(drag.id);
      shell.classList.add('msim-dragging');
    }

    const elapsed = event.timeStamp - drag.lastTime;
    if (elapsed > 0) drag.velocity = (drag.lastY - event.clientY) / elapsed;
    drag.lastY = event.clientY;
    drag.lastTime = event.timeStamp;

    const min = state.snaps.peek * 0.7;
    applyHeight(Math.min(state.snaps.full, Math.max(min, drag.startHeight + travel)), { animate: false });
    event.preventDefault();
  }

  function onPointerEnd(event) {
    const drag = state.drag;
    if (!drag || event.pointerId !== drag.id) return;
    state.drag = null;
    if (!drag.moved) return;

    shell.classList.remove('msim-dragging');
    if (drag.zone === handle) {
      // The click that may follow this pointerup is the end of a drag.
      state.suppressHandleClick = true;
      window.setTimeout(() => { state.suppressHandleClick = false; }, 0);
    }
    // A flick carries on in its direction (velocity is px per ms, up > 0).
    snapTo(nearestSnap(state.height + drag.velocity * 180));
  }

  sheet.addEventListener('pointerdown', onPointerDown);
  sheet.addEventListener('pointermove', onPointerMove);
  sheet.addEventListener('pointerup', onPointerEnd);
  sheet.addEventListener('pointercancel', onPointerEnd);

  handle.addEventListener('click', () => {
    if (state.suppressHandleClick) {
      state.suppressHandleClick = false;
      return;
    }
    cycleSnap();
  });

  // Tabbing to something below the peek line opens the sheet to half, so the
  // focused control is never hidden under the bottom of the screen.
  sheet.addEventListener('focusin', event => {
    if (!isActive() || state.snap !== 'peek' || state.drag) return;
    const bottom = event.target.getBoundingClientRect().bottom - sheet.getBoundingClientRect().top + scroller.scrollTop;
    if (bottom > state.snaps.peek) snapTo('half');
  });

  // ---- rendering ----

  function scheduleSync() {
    if (state.syncFrame) return;
    state.syncFrame = window.requestAnimationFrame(() => {
      state.syncFrame = null;
      syncNow();
    });
  }

  function syncNow() {
    if (state.syncFrame) {
      window.cancelAnimationFrame(state.syncFrame);
      state.syncFrame = null;
    }
    if (state.mode === 'results' && !simData) state.mode = 'setup';

    $('msimSetup').hidden = state.mode !== 'setup';
    $('msimResults').hidden = state.mode !== 'results';
    syncTopBar();
    if (state.mode === 'setup') syncSetup();
    else syncResultsChrome();
    if (state.layersOpen) syncLayersPanel();
    measureSnaps();
  }

  function syncTopBar() {
    const barangay = selectedBarangay
      || new URLSearchParams(window.location.search).get('barangay')
      || 'Simulator';
    $('msimTitle').textContent = barangay;
    $('msimSubtitle').textContent = state.mode === 'results' && simData
      ? `${isEarthquakeSimulationResult(simData) ? 'Earthquake' : 'Flood'} route`
      : 'Location';
  }

  function getHazardIcon(name) {
    return document.querySelector(`[data-msim-hazard="${name}"] svg`)?.outerHTML || '';
  }

  function syncSetup() {
    const hazard = selectedHazard;
    const locked = isSimulationInteractionLocked();
    const earthquake = isEarthquakeMode();

    // Until a disaster is picked, the Disaster cards lead the sheet (and are
    // its peek); after that they drop below the Start/End slots.
    $('msimSetupFlow').classList.toggle('is-choosing', !hazard);
    $('msimSlots').hidden = !hazard;
    $('msimSetupActions').hidden = !hazard;

    const chip = $('msimHazardChip');
    chip.hidden = !hazard;
    chip.disabled = locked;
    if (hazard) {
      $('msimHazardChipLabel').textContent = hazard;
      $('msimHazardChipIcon').innerHTML = getHazardIcon(hazard);
    }

    document.querySelectorAll('[data-msim-hazard]').forEach(button => {
      const selected = button.dataset.msimHazard === hazard;
      button.classList.toggle('selected', selected);
      button.setAttribute('aria-pressed', String(selected));
      button.disabled = locked;
    });

    syncPinSlot('start');
    $('msimSlot-end').hidden = earthquake;
    $('msimSlot-evac').hidden = !earthquake;
    if (earthquake) syncEvacSlot();
    else syncPinSlot('end');

    const role = getPinRole();
    const checking = isAnyRoutePinChecking();
    const setPinBtn = $('msimSetPinBtn');
    setPinBtn.hidden = !role;
    if (role) {
      setPinBtn.textContent = `Set ${role} here`;
      setPinBtn.disabled = locked || routePins[role]?.status === 'checking';
    }
    $('msimSeeResultsBtn').hidden = !!role || !simData;

    const runBtn = $('msimRunBtn');
    runBtn.disabled = locked || backendSimulationBusy || checking || !canRunCurrentSimulation();
    runBtn.classList.toggle('mbtn--primary', !role);

    $('msimSetupHelp').textContent = buildSetupHelp(role, checking);
  }

  function syncPinSlot(role) {
    const slot = $(`msimSlot-${role}`);
    const value = $(`msimSlotValue-${role}`);
    const edit = $(`msimSlotEdit-${role}`);
    if (!slot || !value || !edit) return;

    const pin = routePins[role];
    const placing = getPinRole() === role;
    const waiting = role === 'end' && !pin && !getReadyPin('start');
    const pointName = role === 'start' ? 'start point' : 'end point';

    slot.classList.toggle('is-active', placing);
    slot.classList.toggle('is-empty', !pin);
    slot.classList.toggle('is-disabled', waiting && !placing);
    value.textContent = pin?.status === 'checking'
      ? 'Checking this spot…'
      : pin
      ? pin.label || PIN_ROLE_COPY[role].fallbackLabel
      : placing
      ? `Move the map, then tap “Set ${role} here”`
      : waiting
      ? 'Set the start point first'
      : 'Not set yet';

    // Edit moves a set pin, Cancel stops moving it, Set arms an empty one.
    const label = pin ? (placing ? 'Cancel' : 'Edit') : (placing || waiting ? '' : 'Set');
    edit.hidden = !label
      || pin?.status === 'checking'
      || !canPlaceRoutePins()
      || isSimulationInteractionLocked();
    edit.textContent = label;
    edit.setAttribute('aria-label', label ? `${label} ${pointName}` : '');
  }

  function syncEvacSlot() {
    const slot = $('msimSlot-evac');
    const value = $('msimSlotValue-evac');
    const button = $('msimEvacBtn');
    const supported = isEarthquakeBarangaySupported();
    const hasStart = !!getReadyPin('start');
    const loaded = earthquakeEvacSitesVisible;

    slot.classList.toggle('is-empty', !loaded);
    slot.classList.toggle('is-disabled', !supported || (!hasStart && !loaded));
    value.textContent = !supported
      ? `Earthquake routing covers only ${EARTHQUAKE_SUPPORTED_BARANGAY_SCOPE}.`
      : loaded
      ? `${earthquakeEvacSites.length} on the map`
      : hasStart
      ? 'Tap Show to put them on the map'
      : 'Set the start point first';
    button.hidden = loaded || !supported || !hasStart;
    button.disabled = isSimulationInteractionLocked();
  }

  function buildSetupHelp(role, checking) {
    if (!selectedHazard) return '';
    if (backendSimulationBusy) {
      return 'The backend is still finishing a previous simulation. Wait until it clears before starting a new one.';
    }
    if (isEarthquakeMode() && !isEarthquakeBarangaySupported()) {
      return `Earthquake routing is currently available only for ${EARTHQUAKE_SUPPORTED_BARANGAY_SCOPE}.`;
    }
    if (checking) return 'Checking that the pinned spot can be reached by road…';
    if (role) return `Drag the map so the pin sits on the ${role === 'start' ? 'start' : 'end'} point.`;
    if (isEarthquakeMode() && getReadyPin('start') && !earthquakeEvacSitesVisible) {
      return 'Tap Show to put the evacuation sites on the map, then run the simulation.';
    }
    if (canRunCurrentSimulation()) {
      return simData ? 'Change the hazard or move a pin to compare routes.' : 'Ready. Tap Run simulation.';
    }
    return '';
  }

  function syncResultsChrome() {
    const lens = $('msimLens');
    lens.hidden = !isEarthquakeSimulationResult(simData);
    lens.querySelectorAll('[data-msim-eq-view]').forEach(button => {
      const active = button.dataset.msimEqView === activeEarthquakeView;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });
  }

  // The worst hazard a route crosses: its peak level and, when some of it is
  // above the safety limit, how much (unsafe_distance). The backend sends no
  // per-level distances, so a Low or Moderate peak has no length to show.
  function describeRouteRisk(route) {
    const isEarthquake = isEarthquakeRouteRecord(route);
    const label = isEarthquake ? getRiskLevelLabelFromScore(route?.max_hazard) : formatFloodPeakRisk(route);
    const unsafe = Number(route?.unsafe_distance) || 0;
    return {
      level: label.toLowerCase(),
      text: `${label} ${isEarthquake ? 'road risk' : 'flooding'}${unsafe > 0 ? ` · ${formatDistanceCompact(unsafe)} unsafe` : ''}`,
    };
  }

  function buildTurnStepsMarkup(route, routeNo) {
    const steps = getRouteTurnSteps(route);
    if (!steps.length) return '';

    const destination = isEarthquakeRouteRecord(route) && route.destination_name
      ? route.destination_name
      : 'Your destination';
    const items = steps.map((step, index) => `
      <li class="turn-step">
        <span class="turn-step-icon">${turnStepIcon(step.turn)}</span>
        <span class="turn-step-text">
          <span class="turn-step-instruction">${escapeHtml(formatTurnStepInstruction(step, index))}</span>
          ${Number(step.distance) > 0 ? `<span class="turn-step-distance">${escapeHtml(formatDistanceCompact(step.distance))}</span>` : ''}
        </span>
      </li>`).join('');

    return `<ol class="mroute-steps" hidden aria-label="Directions for route ${escapeHtml(routeNo)}">
      ${items}
      <li class="turn-step">
        <span class="turn-step-icon">${safetyIcon('flag')}</span>
        <span class="turn-step-text"><span class="turn-step-instruction">${escapeHtml(destination)}</span></span>
      </li>
    </ol>`;
  }

  // data-focus-route/-category are what script.js's delegated click handler
  // reads to focus the route on the map (the same one the desktop list uses).
  function buildRouteRow(route, index, best) {
    const routeNo = route.display_route_no ?? index + 1;
    const isBest = route === best;
    const swatch = isBest
      ? (route.category === 'eliminated' ? 'best-unsafe' : 'best')
      : route.category === 'available' ? 'available' : 'eliminated';
    const tag = isBest ? ' · best' : route.category === 'eliminated' ? ' · eliminated' : '';
    const risk = describeRouteRisk(route);
    const destination = isEarthquakeRouteRecord(route) && route.destination_name
      ? `<span class="mroute-dest">To ${escapeHtml(route.destination_name)}</span>`
      : '';

    return `<li class="mroute-item"${index >= ROUTES_SHOWN ? ' data-extra' : ''}>
      <button type="button" class="mroute${isBest ? ' is-best' : ''}" aria-pressed="false"
          data-focus-route="${escapeHtml(routeNo)}" data-focus-category="${escapeHtml(route.category || '')}">
        <span class="mroute-swatch mroute-swatch--${swatch}" aria-hidden="true"></span>
        <span class="mroute-text">
          <span class="mroute-name">Route ${escapeHtml(routeNo)}${tag}</span>
          <span class="mroute-risk mroute-risk--${escapeHtml(risk.level)}">${escapeHtml(risk.text)}</span>
          ${destination}
        </span>
        <span class="mroute-time">${escapeHtml(route.display_duration || '')}</span>
      </button>
      ${buildTurnStepsMarkup(route, routeNo)}
    </li>`;
  }

  // Called by renderRouteSafetyPanel (script.js) with the same result.
  function renderResults(result) {
    const routes = Array.isArray(result?.routes) ? result.routes : [];
    if (!routes.length) {
      clearResults();
      return;
    }

    const isEarthquake = isEarthquakeSimulationResult(result);
    const best = getBestRoute(routes);
    const safeRouteFound = routes.some(route => route.category !== 'eliminated');
    const peak = getPeakRiskRow(best, isEarthquake);
    const unsafeParts = Number(best?.display_unsafe_segment_count ?? best?.threshold_exceedance_count ?? 0);

    // Same wording as the desktop results panel (renderRouteSafetyPanel).
    const verdict = $('msimVerdict');
    verdict.classList.toggle('is-safe', safeRouteFound);
    verdict.classList.toggle('is-danger', !safeRouteFound);
    $('msimVerdictTitle').textContent = safeRouteFound ? 'Safe route found' : 'No safe route';
    $('msimVerdictSub').textContent = safeRouteFound
      ? `${peak.label}: ${peak.value}`
      : `${peak.label}: ${peak.value}. Best option still passes through ${unsafeParts || 'a few'} risky area${unsafeParts === 1 ? '' : 's'}, so be extra careful.`;

    const duration = best?.display_duration || formatWalkingDuration(best?.distance);
    const distance = best?.display_distance || formatDistanceCompact(best?.distance);
    $('msimSummaryMain').innerHTML = `${safetyIcon('walk')}<span><strong>${escapeHtml(duration)}</strong> · <strong>${escapeHtml(distance)}</strong></span>`;
    $('msimSummaryRoute').textContent = `Route ${best?.display_route_no ?? 1} · best`;

    const destination = $('msimSummaryDest');
    destination.hidden = !(isEarthquake && best?.destination_name);
    destination.textContent = isEarthquake && best?.destination_name ? `To ${best.destination_name}` : '';

    const ordered = [...routes].sort((left, right) => (left.display_route_no ?? 99) - (right.display_route_no ?? 99));
    state.routesExpanded = false;
    $('msimRouteList').innerHTML = ordered.map((route, index) => buildRouteRow(route, index, best)).join('');
    syncRouteRows();

    $('msimSource').textContent = isEarthquake
      ? 'These hazard levels are based on Hazard Hunter PH data.'
      : 'These hazard levels are based on Project NOAH flood historical data.';
    scheduleSync();
  }

  function clearResults() {
    $('msimRouteList').innerHTML = '';
    state.routesExpanded = false;
    syncMoreRoutes();
    if (state.mode === 'results') {
      state.mode = 'setup';
      state.snap = 'peek';
    }
    scheduleSync();
  }

  // Row highlight follows the map's route focus (applyRouteFocusState).
  function syncRouteRows() {
    const focusNo = selectedRouteFocus ? Number(selectedRouteFocus.routeNo) : null;
    $('msimRouteList')?.querySelectorAll('.mroute').forEach(button => {
      const active = focusNo != null && Number(button.dataset.focusRoute) === focusNo;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
      const steps = button.parentElement.querySelector('.mroute-steps');
      if (steps) steps.hidden = !active;
    });
    syncMoreRoutes();
  }

  // Top ROUTES_SHOWN rows, then "+ N more"; a focused extra row stays shown.
  function syncMoreRoutes() {
    const list = $('msimRouteList');
    const more = $('msimRoutesMore');
    if (!list || !more) return;

    const extra = list.children.length - ROUTES_SHOWN;
    more.hidden = extra <= 0;
    more.textContent = state.routesExpanded ? 'Show fewer routes' : `+ ${extra} more route${extra === 1 ? '' : 's'}`;
    more.setAttribute('aria-expanded', String(state.routesExpanded));
    list.querySelectorAll('[data-extra]').forEach(item => {
      item.hidden = !state.routesExpanded && !item.querySelector('.mroute.is-active');
    });
  }

  function toggleMoreRoutes() {
    state.routesExpanded = !state.routesExpanded;
    syncMoreRoutes();
  }

  function isDisclaimerSeen() {
    try {
      return sessionStorage.getItem(DISCLAIMER_SEEN_KEY) === '1';
    } catch (err) {
      return false;
    }
  }

  function markDisclaimerSeen() {
    try {
      sessionStorage.setItem(DISCLAIMER_SEEN_KEY, '1');
    } catch (err) {}
  }

  // A finished run (runSimulation) or "See results": results mode at peek,
  // so the route on the map and the verdict are both in view.
  function showResults() {
    if (!simData) return;
    state.mode = 'results';
    state.snap = 'peek';
    scroller.scrollTop = 0;
    syncNow();

    const disclaimer = $('msimDisclaimer');
    if (disclaimer && !isDisclaimerSeen()) {
      disclaimer.open = true;
      markDisclaimerSeen();
    }
    if (isActive()) $('msimVerdictTitle').focus({ preventScroll: true });
  }

  function showSetup() {
    state.mode = 'setup';
    state.snap = 'peek';
    scroller.scrollTop = 0;
    syncNow();
    if (isActive()) $('msimSetupTitle').focus({ preventScroll: true });
  }

  function toggleResultDetails() {
    snapTo(state.snap === 'full' ? 'peek' : 'full');
  }

  // Scrolls el into the part of the sheet that will be visible once the
  // current snap settles (its box may still be animating to that height).
  function revealInSheet(el) {
    if (!el) return;
    const top = el.offsetTop - scroller.offsetTop;
    const bottom = top + el.offsetHeight;
    const paddingBottom = parseFloat(getComputedStyle(sheet).paddingBottom) || 0;
    const visible = state.height - scroller.offsetTop - paddingBottom;
    let next = scroller.scrollTop;
    if (bottom + 12 > next + visible) next = bottom + 12 - visible;
    if (top - 12 < next) next = top - 12;
    scroller.scrollTo({ top: Math.max(0, next), behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
  }

  // ---- choosing start and end with the center pin ----

  // Moves the map so latlng sits under the center pin.
  function centerUnderPin(latlng, zoom = gMap?.getZoom()) {
    if (!gMap || !latlng) return;
    const offsetY = gMap.getSize().y / 2 - getPinY();
    const center = gMap.unproject(gMap.project(latlng, zoom).add([0, offsetY]), zoom);
    gMap.setView(center, zoom, mapMoveOptions({ animate: true }));
  }

  function setPinHere() {
    const role = getPinRole();
    if (!role || !gMap) return;
    const latlng = gMap.containerPointToLatLng([gMap.getSize().x / 2, getPinY()]);
    placeRoutePin(role, latlng.lat, latlng.lng);
  }

  function editPin(role) {
    if (!canPlaceRoutePins() || isSimulationInteractionLocked()) return;
    const pin = getReadyPin(role);
    clearPinHintError();

    if (getPinRole() === role) {
      // Cancel: keep the pin where it was.
      if (pin) setPinPlacementRole(getNextUnpinnedRole());
      return;
    }

    setPinPlacementRole(role);
    snapTo('peek');
    if (pin) centerUnderPin(L.latLng(pin.lat, pin.lng), Math.max(gMap.getZoom(), PIN_PLACEMENT_ZOOM));
  }

  // A map tap never drops a pin here (the pin is set with the button); while
  // one is being placed, it moves the map so the tapped spot is under it.
  function handleMapTap(latlng) {
    if (!isActive()) return false;
    if (state.mode !== 'setup' || !getPinRole()) return true;

    window.clearTimeout(state.mapTapTimer);
    state.mapTapTimer = window.setTimeout(() => {
      state.mapTapTimer = null;
      centerUnderPin(latlng);
    }, MAP_TAP_DELAY_MS);
    return true;
  }

  function chooseHazard(name) {
    const card = $(name === 'Earthquake' ? 'hEarthquake' : 'hFlood');
    if (!card || isSimulationInteractionLocked()) return;
    snapTo('peek');
    // The cards drop below the peek line; keep focus where it can be seen.
    $('msimSetupTitle').focus({ preventScroll: true });
    if (selectedHazard !== name) selectHazard(name, card);
  }

  function showHazardPicker() {
    if (isSimulationInteractionLocked()) return;
    snapTo(state.snaps.half - state.snaps.peek < 24 ? 'full' : 'half');
    const section = $('msimHazardSection');
    revealInSheet(section);
    (section.querySelector('.mhazard.selected') || section.querySelector('.mhazard'))?.focus({ preventScroll: true });
  }

  // ---- map controls ----

  function syncZoomButtons() {
    if (!gMap) return;
    const zoom = gMap.getZoom();
    $('msimZoomIn').disabled = zoom >= gMap.getMaxZoom();
    $('msimZoomOut').disabled = zoom <= gMap.getMinZoom();
  }

  // Zooms around the visible center (where the pin is), not the middle of
  // the whole map, which is under the sheet.
  function zoomBy(direction) {
    if (!gMap) return;
    const step = (gMap.options.zoomDelta || 1) * direction;
    const zoom = Math.max(gMap.getMinZoom(), Math.min(gMap.getMaxZoom(), gMap.getZoom() + step));
    gMap.setZoomAround(L.point(gMap.getSize().x / 2, getPinY()), zoom, mapMoveOptions());
  }

  function locate() {
    const button = $('msimLocateBtn');
    if (!navigator.geolocation) {
      showPinHintError('This browser cannot share your location.');
      return;
    }

    const done = () => {
      button.classList.remove('is-busy');
      button.removeAttribute('aria-busy');
    };
    button.classList.add('is-busy');
    button.setAttribute('aria-busy', 'true');

    navigator.geolocation.getCurrentPosition(position => {
      done();
      const { latitude, longitude } = position.coords;
      if (!isPointInsideBarangay(latitude, longitude)) {
        showPinHintError(`Your location is outside Brgy. ${selectedBarangay || 'this barangay'}, so the map stays here.`);
        return;
      }
      centerUnderPin(L.latLng(latitude, longitude), Math.max(gMap.getZoom(), PIN_PLACEMENT_ZOOM));
    }, () => {
      done();
      showPinHintError('Could not get your location. Check that this site is allowed to use it.');
    }, { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 });
  }

  // ---- Map layers sheet ----

  // The map legend's rows, minus route kinds not on the map right now (e.g.
  // no eliminated route drawn), plus the flood levels while they show.
  function buildLegendHtml(floodShown) {
    const legend = $('mapLegend');
    const body = $('mapLegendBody');
    let html = '';
    if (legend && legend.style.display !== 'none' && body) {
      const groups = mapLayers.routeGroups || [];
      const shownKinds = new Set(groups
        .filter(group => !group.isBest && group.mainLayer && gMap?.hasLayer(group.mainLayer))
        .map(group => group.category));
      const rows = document.createElement('div');
      rows.innerHTML = body.innerHTML;
      // Route rows are the top-level ones (buildRouteLegendRows); hazard
      // layer rows sit in the nested group and are left alone.
      [...rows.children].forEach(row => {
        const line = row.classList.contains('legend-row') ? row.querySelector('.legend-line') : null;
        if (!line) return;
        const kind = ['available', 'eliminated'].find(name => line.classList.contains(`legend-line--${name}`)) || 'best';
        if (kind === 'best' ? !groups.length : !shownKinds.has(kind)) row.remove();
      });
      html = rows.innerHTML.trim();
    }
    if (floodShown) {
      html += `<div class="msim-legend-group">${FLOOD_LEGEND_ROWS.map(([color, label]) => (
        `<div class="legend-row"><span class="msim-legend-swatch" style="background:${color}"></span><span>${label}</span></div>`
      )).join('')}</div>`;
    }
    return html;
  }

  function syncLayersPanel() {
    const street = state.baseLayers?.street;
    const onStreet = !street || !gMap || gMap.hasLayer(street);
    document.querySelectorAll('[data-msim-base]').forEach(button => {
      button.setAttribute('aria-pressed', String((button.dataset.msimBase === 'street') === onStreet));
    });

    // Same condition as the desktop severity filter (syncFloodFilterControl),
    // which also keeps these chips' active state.
    const floodShown = $('floodFilterControl')?.hidden === false;
    $('msimLayersFlood').hidden = !floodShown;

    const legendHtml = buildLegendHtml(floodShown);
    $('msimLayersLegendWrap').hidden = !legendHtml;
    $('msimLayersLegend').innerHTML = legendHtml;
  }

  // While the layers sheet is open, everything behind it is inert.
  function setBackgroundInert(inert) {
    ['msimTopbar', 'msimSheet', 'msimMapControls'].forEach(id => $(id)?.toggleAttribute('inert', inert));
    document.querySelector('.map-wrap')?.toggleAttribute('inert', inert);
  }

  function openLayers() {
    if (!isActive() || state.layersOpen) return;
    state.layersOpen = true;
    window.clearTimeout(state.layersCloseTimer);
    syncLayersPanel();

    const panel = $('msimLayers');
    const scrim = $('msimScrim');
    panel.hidden = false;
    scrim.hidden = false;
    void panel.offsetHeight; // start the slide from off-screen
    panel.classList.add('is-open');
    scrim.classList.add('is-open');
    setBackgroundInert(true);
    $('msimLayersBtn').setAttribute('aria-expanded', 'true');
    $('msimLayersClose').focus({ preventScroll: true });
  }

  function closeLayers({ restoreFocus = true } = {}) {
    if (!state.layersOpen) return;
    state.layersOpen = false;

    const panel = $('msimLayers');
    const scrim = $('msimScrim');
    panel.classList.remove('is-open');
    scrim.classList.remove('is-open');
    setBackgroundInert(false);
    $('msimLayersBtn').setAttribute('aria-expanded', 'false');
    state.layersCloseTimer = window.setTimeout(() => {
      panel.hidden = true;
      scrim.hidden = true;
    }, prefersReducedMotion() ? 0 : 260);
    if (restoreFocus) $('msimLayersBtn').focus({ preventScroll: true });
  }

  // Swaps the base tiles directly; Leaflet's own Map/Satellite control
  // (hidden here) follows along through the layers' add/remove events.
  function setBaseLayer(key) {
    const layers = state.baseLayers;
    if (!layers || !gMap || !layers[key]) return;
    if (!gMap.hasLayer(layers[key])) layers[key].addTo(gMap);
    Object.entries(layers).forEach(([name, layer]) => {
      if (name !== key && gMap.hasLayer(layer)) gMap.removeLayer(layer);
    });
    syncLayersPanel();
    syncZoomButtons();
  }

  function handleEscape() {
    if (!isActive() || !state.layersOpen) return false;
    closeLayers();
    return true;
  }

  // ---- results actions ----

  async function downloadReport(button) {
    if (!button || button.disabled) return;
    const label = button.textContent;
    button.disabled = true;
    button.textContent = 'Preparing report…';
    try {
      await downloadSimulationReport();
    } finally {
      button.disabled = false;
      button.textContent = label;
    }
  }

  // After script.js's delegated handler toggles the route focus: drop the
  // sheet to half and fit the map to the picked route.
  document.addEventListener('click', event => {
    const row = event.target.closest?.('#msimRouteList .mroute[data-focus-route]');
    if (!row || !isActive() || !selectedRouteFocus || !gMap) return;

    snapTo('half');
    const group = (mapLayers.routeGroups || []).find(item => Number(item.routeNo) === Number(selectedRouteFocus.routeNo));
    const path = getRoutePreviewPath(group);
    if (path.length > 1) {
      gMap.fitBounds(L.latLngBounds(path), mapMoveOptions(getMapFitPadding()));
    }
    revealInSheet(row);
  });

  // ---- hooks ----

  // initMap() hands over the map and its two base layers.
  function attachMap(map, baseLayers) {
    state.baseLayers = baseLayers || null;
    map.on('dragstart', () => $('msimCenterPin')?.classList.add('is-lifted'));
    map.on('dragend', () => $('msimCenterPin')?.classList.remove('is-lifted'));
    map.on('dblclick', () => {
      window.clearTimeout(state.mapTapTimer);
      state.mapTapTimer = null;
    });
    map.on('zoomend', syncZoomButtons);
    map.on('baselayerchange', () => {
      if (state.layersOpen) syncLayersPanel();
      syncZoomButtons();
    });
    syncZoomButtons();
    scheduleSync();
  }

  // Leaving the phone layout (rotation, resize) closes the layers sheet and
  // gives the moving pin its marker back; entering it re-measures from zero.
  function onLayoutChange() {
    if (isActive()) {
      state.height = 0;
      state.snap = 'peek';
      syncNow();
    } else {
      closeLayers({ restoreFocus: false });
      state.height = 0;
      shell.style.removeProperty('--sheet-h');
      shell.classList.remove('msim-controls-hidden', 'msim-map-covered', 'msim-dragging');
      $('msimCenterPin').hidden = true;
    }
    syncRoutePinMarkers();
  }

  SHEET_QUERY.addEventListener?.('change', onLayoutChange);
  window.addEventListener('resize', () => {
    if (isActive()) scheduleSync();
  });
  document.fonts?.ready?.then(scheduleSync);

  $('msimDisclaimerText').textContent = SAFETY_DISCLAIMER_TEXT;

  window.mobileSim = {
    attachMap,
    clearResults,
    getCoveredInsets,
    handleEscape,
    handleMapTap,
    // The pin being moved is drawn by the center pin, not its marker.
    isCenterPinRole: role => isActive() && getPinRole() === role,
    renderResults,
    scheduleSync,
    showResults,
    syncRouteRows,
  };

  // index.html's inline handlers.
  Object.assign(window, {
    chooseMobileHazard: chooseHazard,
    closeMobileLayers: () => closeLayers(),
    downloadMobileReport: downloadReport,
    editMobilePin: editPin,
    locateMobileUser: locate,
    mobileMapZoom: zoomBy,
    openMobileLayers: openLayers,
    setMobileBaseLayer: setBaseLayer,
    setMobilePinHere: setPinHere,
    showMobileHazardPicker: showHazardPicker,
    showMobileResults: showResults,
    showMobileSetup: showSetup,
    toggleMobileMoreRoutes: toggleMoreRoutes,
    toggleMobileResultDetails: toggleResultDetails,
  });

  syncNow();
})();
