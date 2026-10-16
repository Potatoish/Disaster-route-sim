// Phone and tablet layout of the simulator (< 1024px wide and >= 500px tall):
// a full-screen map under a floating top bar, map controls, a fixed center
// pin, one panel with a setup, a replay and a results mode (the replay holds
// aco-replay.js's panel while the ants' search plays), and a Map layers
// sheet. On
// phones the panel is a bottom sheet (peek / half / full); on tablets
// (>= 640px, isSide) it is docked on the left. The markup is #msim in
// index.html; style.css hides it on desktops and short viewports.
//
// This file keeps no simulation state: it reads script.js's globals
// (selectedHazard, routePins, simData, ...) and acts through script.js's
// functions (placeRoutePin, runSimulation, ...), so the desktop panels and
// this sheet never disagree. script.js calls in through window.mobileSim.
(function initMobileSim() {
  const SHEET_QUERY = window.matchMedia('(max-width: 1023px) and (min-height: 500px)');
  // Tablets: the panel docked on the left (style.css, same breakpoint).
  const SIDE_QUERY = window.matchMedia('(min-width: 640px)');
  // Gap between the top bar and a full-height sheet.
  const FULL_SHEET_TOP_GAP = 8;
  // Space kept under the last item that shows at peek height.
  const PEEK_BOTTOM_GAP = 10;
  // Matches the sheet's height transition in style.css.
  const SNAP_MS = 280;
  // Least map height left between the top bar and the sheet for the center
  // pin, and for the zoom/recenter/locate buttons, to stay on screen.
  const PIN_MIN_ROOM = 90;
  const CONTROLS_MIN_ROOM = 220;
  // The on-map legend's gap above the sheet (style.css) plus a little air
  // under the top bar; it needs its own height on top of this.
  const LEGEND_ROOM_MARGIN = 32;
  // The legend chip's gap above the sheet (style.css .msim-maplegend).
  const LEGEND_CHIP_GAP = 8;
  // Its height while the fonts load (the chip is measured once it shows).
  const LEGEND_CHIP_FALLBACK_H = 28;
  // Below this the sheet is full height and the map is just a sliver.
  const MAP_COVERED_ROOM = 40;
  const ROUTES_SHOWN = 3;
  // A second tap inside this window is a double-tap zoom, not a pin move.
  const MAP_TAP_DELAY_MS = 260;
  const TOAST_MS = 2200;
  const DISCLAIMER_SEEN_KEY = 'agnas-disclaimer-seen';
  const SNAP_ORDER = ['peek', 'half', 'full'];
  // The replay only folds and unfolds: its steps fit in half the screen.
  const REPLAY_SNAP_ORDER = ['peek', 'half'];
  // The Evacuation sites slot's house, for the End slot while the end point
  // is the sites.
  const EVAC_BADGE_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 11.5 12 5l8 6.5"/><path d="M6.5 10v9h11v-9"/></svg>';
  const FLOOD_LEGEND_ROWS = [
    ['rgba(250,204,21,.86)', 'Low'],
    ['rgba(249,115,22,.90)', 'Medium'],
    ['rgba(225,29,72,.94)', 'High'],
  ];

  const $ = id => document.getElementById(id);
  const shell = $('appShell');
  const sheet = $('msimSheet');
  const scroller = $('msimSheetScroll');
  const handle = $('msimSheetHandle');
  if (!shell || !sheet || !scroller || !handle) return;

  const state = {
    mode: 'setup', // 'setup' | 'replay' | 'results'
    snap: 'peek', // 'peek' | 'half' | 'full'
    height: 0, // the sheet's visible height, px
    snaps: { peek: 0, half: 0, full: 0 },
    routesExpanded: false,
    syncFrame: null,
    drag: null,
    suppressHandleClick: false,
    layersOpen: false,
    layersCloseTimer: null,
    barangayMenuOpen: false,
    baseLayers: null,
    mapTapTimer: null,
    // Folded to its chip in every step until tapped open; never opened for
    // the visitor, and nothing about it is remembered.
    legendFolded: true,
    legendHtml: null,
    legendChipH: 0,
    box: 0, // the sheet's laid-out height (--sheet-box-h), px; >= height while moving
    settleTimer: null,
    dragFrame: null,
    // The replay's compact height, kept for the whole replay (its steps'
    // texts differ in length; the sheet must not jump between them).
    replayPeek: 0,
    // The visitor panned or zoomed: the camera stops fitting the route or
    // the ants' search until they tap the fit button.
    autoFitPaused: false,
    toastTimer: null,
  };

  function isActive() {
    return SHEET_QUERY.matches;
  }

  // Tablet: the panel sits beside the map and never slides.
  function isSide() {
    return isActive() && SIDE_QUERY.matches;
  }

  // ---- geometry. #map fills the viewport here, so map-container x/y and
  // viewport x/y differ only by the map's left/top (normally 0). ----

  function getMapTop() {
    return $('map')?.getBoundingClientRect().top || 0;
  }

  function getMapLeft() {
    return $('map')?.getBoundingClientRect().left || 0;
  }

  function getTopBarBottom() {
    return $('msimTopbar')?.getBoundingClientRect().bottom || 0;
  }

  // Where the map stops being covered on the left: the docked panel's right
  // edge on a tablet, nothing on a phone.
  function getSideCover() {
    return isSide() ? Math.max(0, sheet.getBoundingClientRect().right - getMapLeft()) : 0;
  }

  // Height of the map still visible: between the top bar and the sheet on a
  // phone, the whole height beside the docked panel on a tablet.
  function getMapRoom(height = state.height) {
    if (isSide()) return window.innerHeight - getMapTop();
    return window.innerHeight - height - getTopBarBottom();
  }

  // Map-container y of the center pin's tip for a given sheet height: the
  // middle of the visible strip, not of the whole map (the sheet covers that).
  function getPinY(height = state.height) {
    if (isSide()) return window.innerHeight / 2 - getMapTop();
    return (getTopBarBottom() + window.innerHeight - height) / 2 - getMapTop();
  }

  // Map-container x of the center pin: the middle of the map beside the
  // docked panel on a tablet.
  function getPinX() {
    const width = window.innerWidth - getMapLeft();
    const cover = getSideCover();
    return cover + (width - cover) / 2;
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

  // The map buttons' strip on the right (top-right on a phone, bottom-right
  // beside a tablet's panel): all of its width is kept clear.
  function getControlsCover() {
    const controls = $('msimMapControls');
    if (!controls?.getClientRects().length) return 0;
    const mapRight = $('map')?.getBoundingClientRect().right || window.innerWidth;
    return Math.max(0, mapRight - controls.getBoundingClientRect().left);
  }

  // The legend chip above the sheet (bottom-left), folded or not: the chip
  // is what a fit keeps clear; the open legend is the visitor's to close.
  function getLegendChipCover() {
    const card = $('msimMapLegend');
    const offset = card ? parseFloat(getComputedStyle(card).bottom) || 0 : LEGEND_CHIP_GAP;
    return offset + (state.legendChipH || LEGEND_CHIP_FALLBACK_H);
  }

  // What the top bar, the sheet and the map's own buttons cover, so
  // script.js can fit routes and the barangay into the part of the map that
  // is actually visible. The legend chip is counted even before it first
  // shows (its rows arrive just after a result is fitted).
  function getCoveredInsets() {
    if (!isActive()) return null;
    const right = getControlsCover();
    if (isSide()) return { top: 0, bottom: getLegendChipCover(), left: getSideCover(), right };
    return {
      top: Math.max(0, getTopBarBottom() - getMapTop()),
      bottom: state.height + getLegendChipCover(),
      left: 0,
      right,
    };
  }

  // ---- sheet height and snapping ----

  function getPeekEnd() {
    if (state.mode === 'results') return $('msimResultActions');
    if (state.mode === 'replay') return $('msimReplay').querySelector('.aco-replay-foot');
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
    if (isSide()) {
      // Docked: no sheet height for the map controls and legend to clear.
      if (state.height || state.box) {
        state.height = 0;
        state.box = 0;
        window.clearTimeout(state.settleTimer);
        shell.style.removeProperty('--sheet-h');
        shell.style.removeProperty('--sheet-box-h');
      }
      syncChrome();
      return;
    }
    // Measured in the snap's own layout (the replay shows more when open).
    sheet.dataset.snap = state.snap;
    const full = Math.max(160, Math.round(window.innerHeight - getTopBarBottom() - FULL_SHEET_TOP_GAP));
    let peek = Math.min(full, measurePeek() || 200);
    if (state.mode === 'replay') {
      // Measured folded only, and never shrinking while the replay plays.
      if (state.snap === 'peek' || !state.replayPeek) state.replayPeek = Math.max(state.replayPeek, peek);
      peek = state.replayPeek;
    }
    const half = Math.min(full, Math.max(peek, Math.round(window.innerHeight * 0.5)));
    state.snaps = { peek, half, full };

    const target = state.drag ? null : state.snaps[state.snap];
    if (target != null && Math.abs(target - state.height) > 1) {
      applyHeight(target, { animate: state.height > 0 });
    } else {
      syncChrome();
    }
  }

  // Changes made with transitions off, so nothing on screen moves.
  function withoutTransitions(change) {
    shell.classList.add('msim-instant');
    change();
    void sheet.offsetHeight; // apply them before transitions return
    shell.classList.remove('msim-instant');
  }

  function setSheetBox(height) {
    state.box = Math.max(0, Math.round(height));
    shell.style.setProperty('--sheet-box-h', `${state.box}px`);
  }

  // Sets the sheet's visible height. The sheet moves by transform only: its
  // box (--sheet-box-h) is held at the tallest height in play and slid down
  // out of sight (style.css), so a drag or snap never re-lays out its content
  // each frame. The box shrinks to fit once the sheet stops. While the center
  // pin shows, the map pans with it so the spot under the pin stays put.
  function applyHeight(height, { animate = true } = {}) {
    const previous = state.height;
    const next = Math.max(0, Math.round(height));
    const pinWasShown = previous > 0 && isCenterPinShown(previous);
    const slides = animate && next !== previous && !prefersReducedMotion();
    state.height = next;
    window.clearTimeout(state.settleTimer);

    if (state.drag) {
      // Mid-drag the box already holds the full height (onPointerMove).
      if (state.box < next) withoutTransitions(() => setSheetBox(next));
      shell.style.setProperty('--sheet-h', `${next}px`);
    } else if (slides) {
      if (state.box < Math.max(previous, next)) {
        withoutTransitions(() => setSheetBox(Math.max(previous, next)));
      }
      shell.style.setProperty('--sheet-h', `${next}px`);
      state.settleTimer = window.setTimeout(() => {
        if (state.height === next && !state.drag) withoutTransitions(() => setSheetBox(next));
      }, SNAP_MS + 40);
    } else {
      withoutTransitions(() => {
        setSheetBox(next);
        shell.style.setProperty('--sheet-h', `${next}px`);
      });
    }
    syncChrome();

    if (pinWasShown && next !== previous && gMap) {
      const shift = getPinY(previous) - getPinY(next);
      gMap.panBy([0, shift], slides
        ? { duration: SNAP_MS / 1000, easeLinearity: 0.5 }
        : { animate: false });
    }
  }

  // refit: the visitor snapped the sheet (handle, drag, More, See details),
  // so the route or the ants' search is brought back into the map left in
  // view (script.js refitMapAfterSheetSnap).
  function snapTo(name, { animate = true, refit = false } = {}) {
    if (isSide()) {
      // The docked panel shows everything at once; it only scrolls.
      state.snap = name;
      syncChrome();
      return;
    }
    if (!state.snaps[name]) measureSnaps();
    const previous = state.height;
    state.snap = name;
    if (name === 'peek') scroller.scrollTop = 0;
    const target = state.snaps[name];
    if (target) applyHeight(target, { animate });
    else syncChrome();
    // Not into a strip too thin to show a route (a full-height sheet).
    if (refit && state.height !== previous && state.mode !== 'setup' && getMapRoom() >= CONTROLS_MIN_ROOM) {
      window.refitMapAfterSheetSnap?.();
    }
  }

  function getSnapOrder() {
    return state.mode === 'replay' ? REPLAY_SNAP_ORDER : SNAP_ORDER;
  }

  // Handle tap / Enter: peek -> half -> full -> peek (the replay: folded and
  // open), skipping a stop that is no taller than the one before it (a short
  // phone's half can equal peek).
  function cycleSnap() {
    const order = getSnapOrder();
    let next = order[(order.indexOf(state.snap) + 1) % order.length];
    if (state.mode === 'replay') {
      snapTo(next, { refit: true });
      return;
    }
    if (next === 'half' && state.snaps.half - state.snaps.peek < 24) next = 'full';
    if (next === 'full' && state.snaps.full - state.snaps[state.snap] < 24) next = 'peek';
    snapTo(next, { refit: true });
  }

  function nearestSnap(height) {
    return getSnapOrder().reduce((best, name) => (
      Math.abs(state.snaps[name] - height) < Math.abs(state.snaps[best] - height) ? name : best
    ), 'peek');
  }

  // Everything that follows the sheet's height: its scroll mode, the labels
  // that name the next size, the center pin and the map controls.
  function syncChrome() {
    sheet.dataset.snap = state.snap;
    const last = getSnapOrder().at(-1);
    handle.setAttribute('aria-label', state.snap === last ? 'Collapse panel' : 'Expand panel');
    handle.setAttribute('aria-expanded', String(state.snap !== 'peek'));
    const detailsBtn = $('msimDetailsBtn');
    if (detailsBtn) detailsBtn.textContent = state.snap === 'full' ? 'Show map' : 'See details';
    const more = $('msimReplay').querySelector('.aco-replay-more');
    if (more) {
      more.textContent = state.snap === 'peek' ? 'More' : 'Less';
      more.setAttribute('aria-expanded', String(state.snap !== 'peek'));
    }
    const room = getMapRoom();
    shell.classList.toggle('msim-controls-hidden', isActive() && room < CONTROLS_MIN_ROOM);
    shell.classList.toggle('msim-map-covered', isActive() && room < MAP_COVERED_ROOM);
    syncCenterPin();
    syncMapLegendChrome();
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
      shell.style.setProperty('--msim-pin-x', `${getPinX() + getMapLeft()}px`);
      pin.classList.toggle('is-checking', routePins[role]?.status === 'checking');
    }
    pin.hidden = !shown;
  }

  // ---- dragging the handle or a sheet header ----

  function onPointerDown(event) {
    if (!isActive() || isSide() || state.drag) return;
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
      // The box takes the full height for the whole drag (nothing visible
      // changes), so each move below is a transform.
      window.clearTimeout(state.settleTimer);
      withoutTransitions(() => setSheetBox(Math.max(state.snaps.full, state.box)));
    }

    const elapsed = event.timeStamp - drag.lastTime;
    if (elapsed > 0) drag.velocity = (drag.lastY - event.clientY) / elapsed;
    drag.lastY = event.clientY;
    drag.lastTime = event.timeStamp;

    const min = state.snaps.peek * 0.7;
    const max = state.snaps[getSnapOrder().at(-1)];
    drag.target = Math.min(max, Math.max(min, drag.startHeight + travel));
    // At most once a frame, however fast the pointer reports.
    if (!state.dragFrame) {
      state.dragFrame = window.requestAnimationFrame(() => {
        state.dragFrame = null;
        if (state.drag?.target != null) applyHeight(state.drag.target, { animate: false });
      });
    }
    event.preventDefault();
  }

  function onPointerEnd(event) {
    const drag = state.drag;
    if (!drag || event.pointerId !== drag.id) return;
    state.drag = null;
    if (!drag.moved) return;

    if (state.dragFrame) {
      window.cancelAnimationFrame(state.dragFrame);
      state.dragFrame = null;
    }
    if (drag.target != null) state.height = Math.round(drag.target);
    shell.style.setProperty('--sheet-h', `${state.height}px`);
    shell.classList.remove('msim-dragging');
    if (drag.zone === handle) {
      // The click that may follow this pointerup is the end of a drag.
      state.suppressHandleClick = true;
      window.setTimeout(() => { state.suppressHandleClick = false; }, 0);
    }
    // A flick carries on in its direction (velocity is px per ms, up > 0).
    snapTo(nearestSnap(state.height + drag.velocity * 180), { refit: true });
  }

  sheet.addEventListener('pointerdown', onPointerDown);
  // On the window: until the drag has moved far enough to capture the
  // pointer, a quick move (or a mouse) can leave the sheet, and the drag
  // would stall -- or hang, if the release lands outside it.
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerEnd);
  window.addEventListener('pointercancel', onPointerEnd);

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
    if (!isActive() || isSide() || state.snap !== 'peek' || state.drag) return;
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
    if (state.mode === 'replay' && !$('msimReplay').firstElementChild) state.mode = simData ? 'results' : 'setup';

    $('msimSetup').hidden = state.mode !== 'setup';
    $('msimReplay').hidden = state.mode !== 'replay';
    $('msimResults').hidden = state.mode !== 'results';
    // The hazard fills step back while routes or trails are on them
    // (style.css), and come back in full for setup.
    shell.classList.toggle('msim-route-on', isActive() && state.mode !== 'setup');
    syncTopBar();
    syncMapButtons();
    if (state.mode === 'setup') syncSetup();
    else if (state.mode === 'results') syncResultsChrome();
    if (state.layersOpen) syncLayersPanel();
    renderMapLegend();
    measureSnaps();
  }

  // Fit says what it frames in each step. While a run holds the map still
  // (script.js setMapGestureLock), every button that moves it is off too;
  // My location also waits out a replay, whose camera it would fight.
  function syncMapButtons() {
    const held = isMapGestureLocked();
    const fit = $('msimRecenterBtn');
    const fitLabel = state.mode === 'setup' ? 'Show the whole barangay' : 'Show the whole route';
    fit.disabled = held;
    fit.setAttribute('aria-label', fitLabel);
    fit.title = fitLabel;
    const locate = $('msimLocateBtn');
    const running = held || state.mode === 'replay';
    locate.disabled = running;
    const locateLabel = running ? 'My location is off while the simulation runs' : 'Show my location';
    locate.setAttribute('aria-label', locateLabel);
    locate.title = locateLabel;
    syncZoomButtons();
  }

  function syncTopBar() {
    const barangay = selectedBarangay
      || new URLSearchParams(window.location.search).get('barangay')
      || 'Simulator';
    $('msimTitle').textContent = barangay;
    // Which disaster and which step: "Flood · Setup", "Flood · Simulation",
    // "Flood · Results".
    const results = state.mode === 'results' && simData;
    const hazard = results
      ? (isEarthquakeSimulationResult(simData) ? 'Earthquake' : 'Flood')
      : selectedHazard;
    const stepName = results ? 'Results' : state.mode === 'replay' ? 'Simulation' : 'Setup';
    $('msimSubtitle').textContent = hazard
      ? `${hazard} · ${stepName}`
      : 'Choose a disaster';

    // The title opens the barangay switcher, except mid-run.
    const button = $('msimBarangayBtn');
    const locked = isSimulationInteractionLocked();
    button.disabled = locked;
    button.setAttribute('aria-label', `${barangay}, change barangay`);
    if (locked) closeBarangayMenu({ restoreFocus: false });
  }

  // ---- barangay switcher (the top bar's title) ----

  function renderBarangayMenu() {
    const pin = '<svg class="msim-bgy-pin" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-6.5-5.6-6.5-11A6.5 6.5 0 0 1 18.5 10c0 5.4-6.5 11-6.5 11Z"/><circle cx="12" cy="10" r="2.4"/></svg>';
    const check = '<svg class="msim-bgy-check" viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>';
    $('msimBarangayOptions').innerHTML = SUPPORTED_QUICKSTART_BARANGAYS.map(name => {
      const current = name === selectedBarangay;
      return `<button type="button" class="msim-bgy-option" data-msim-barangay="${escapeHtml(name)}" aria-pressed="${current}">
        ${pin}<span class="msim-bgy-name">${escapeHtml(name)}<span>Pasig City</span></span>${current ? check : ''}
      </button>`;
    }).join('');
    // Switching starts over, so say what goes when there is something to lose.
    $('msimBarangayNote').hidden = !simData && !PIN_ROLES.some(role => routePins[role]);
  }

  function openBarangayMenu() {
    if (!isActive() || state.barangayMenuOpen || isSimulationInteractionLocked()) return;
    state.barangayMenuOpen = true;
    renderBarangayMenu();
    $('msimBarangayMenu').hidden = false;
    $('msimBarangayScrim').hidden = false;
    $('msimBarangayBtn').setAttribute('aria-expanded', 'true');
    const menu = $('msimBarangayMenu');
    (menu.querySelector('[aria-pressed="true"]') || menu.querySelector('.msim-bgy-option'))?.focus({ preventScroll: true });
  }

  function closeBarangayMenu({ restoreFocus = true } = {}) {
    if (!state.barangayMenuOpen) return;
    state.barangayMenuOpen = false;
    $('msimBarangayMenu').hidden = true;
    $('msimBarangayScrim').hidden = true;
    $('msimBarangayBtn').setAttribute('aria-expanded', 'false');
    if (restoreFocus) $('msimBarangayBtn').focus({ preventScroll: true });
  }

  function toggleBarangayMenu() {
    if (state.barangayMenuOpen) closeBarangayMenu();
    else openBarangayMenu();
  }

  $('msimBarangayOptions').addEventListener('click', async event => {
    const name = event.target.closest?.('[data-msim-barangay]')?.dataset.msimBarangay;
    if (!name) return;
    closeBarangayMenu();
    if (name === selectedBarangay) return;
    state.mode = 'setup';
    state.snap = 'peek';
    scroller.scrollTop = 0;
    await switchBarangay(name);
    scheduleSync();
  });

  // Tabbing out of the open switcher closes it.
  $('msimBarangayMenu').addEventListener('focusout', event => {
    const next = event.relatedTarget;
    if (state.barangayMenuOpen && next && !$('msimBarangayMenu').contains(next)) {
      closeBarangayMenu({ restoreFocus: next === $('msimBarangayBtn') });
    }
  });

  function getHazardIcon(name) {
    return document.querySelector(`[data-msim-hazard="${name}"] svg`)?.outerHTML || '';
  }

  function syncSetup() {
    const hazard = selectedHazard;
    const locked = isSimulationInteractionLocked();

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
    $('msimSlot-end').hidden = false;
    syncPinSlot('end');

    const role = getPinRole();
    const checking = isAnyRoutePinChecking();
    const needsEvacSites = isDestinationChoicePending();
    // The buttons under the slots are then the one place for the choice, so
    // the destination menu (and its Change) stays shut.
    if (needsEvacSites && !$('msimDestinationMenu').hidden) {
      $('msimDestinationMenu').hidden = true;
      $('msimSlotEdit-end').setAttribute('aria-expanded', 'false');
    }
    $('msimEvacAction').hidden = !needsEvacSites;
    $('msimShowEvacBtn').disabled = locked || earthquakeEvacSitesLoading;
    $('msimChooseOwnBtn').disabled = locked;
    $('msimShowEvacLabel').textContent = earthquakeEvacSitesLoading ? 'Loading evacuation sites…' : 'Show evacuation sites';
    $('msimDestinationEvacBtn').disabled = locked || earthquakeEvacSitesLoading || (isEarthquakeMode() && !getReadyPin('start'));
    $('msimDestinationEvacBtn').setAttribute('aria-checked', String(isToEvacuationSite() && !routePins.end));
    const setPinBtn = $('msimSetPinBtn');
    setPinBtn.hidden = !role;
    if (role) {
      setPinBtn.textContent = `Set ${role} here`;
      setPinBtn.disabled = locked || routePins[role]?.status === 'checking';
    }
    $('msimSeeResultsBtn').hidden = !!role || !simData;

    const runBtn = $('msimRunBtn');
    runBtn.hidden = needsEvacSites;
    runBtn.disabled = locked || checking || !canRunCurrentSimulation();
    runBtn.classList.toggle('mbtn--primary', !role);

    $('msimSetupHelp').textContent = buildSetupHelp(role, checking);
  }

  // Start set, sites not on the map yet, no pin being placed: the visitor
  // picks the sites or a spot of their own with the buttons under the slots.
  function isDestinationChoicePending() {
    return isWaitingForEvacSites() && !!getReadyPin('start') && !getPinRole();
  }

  function syncPinSlot(role) {
    const slot = $(`msimSlot-${role}`);
    const value = $(`msimSlotValue-${role}`);
    const edit = $(`msimSlotEdit-${role}`);
    if (!slot || !value || !edit) return;

    const pin = routePins[role];
    const placing = getPinRole() === role;
    // An end point that is the evacuation sites (or the one a run picked).
    const toEvacSite = role === 'end' && !pin && isToEvacuationSite();
    // Until the start is pinned, and until the choice below is made, the
    // slot is a placeholder saying what to do.
    const choiceBelow = role === 'end' && isDestinationChoicePending();
    const waiting = role === 'end' && !pin && !placing && !getReadyPin('start');
    const set = (!!pin || toEvacSite) && !choiceBelow && !waiting;
    const pointName = role === 'start' ? 'start point' : 'end point';

    slot.classList.toggle('is-active', placing);
    slot.classList.toggle('is-empty', !set);
    slot.classList.toggle('is-disabled', waiting && !placing);
    if (role === 'end') {
      slot.querySelector('.mslot-label').textContent = 'Destination';
      // A house while the end point is the evacuation sites, like their pins.
      slot.classList.toggle('mslot--to-evac', toEvacSite && !placing);
      slot.querySelector('.mslot-badge').innerHTML = toEvacSite && !placing ? EVAC_BADGE_SVG : 'E';
    }
    value.textContent = pin?.status === 'checking'
      ? 'Checking this spot…'
      : pin
      ? pin.label || PIN_ROLE_COPY[role].fallbackLabel
      : placing
      ? `Move the map, then tap “Set ${role} here”`
      : waiting
      ? 'Pick a place first'
      : choiceBelow
      ? 'Pick a destination below'
      : toEvacSite
      ? getResultEvacSite()?.name || 'Evacuation site'
      : 'Not set yet';

    // Edit moves a set pin, Cancel stops moving it, Set arms an empty one;
    // Change trades the evacuation sites for a spot of one's own.
    const label = choiceBelow ? '' : role === 'end' && placing ? 'Cancel' : set
      ? (placing ? 'Cancel' : role === 'end' ? 'Change' : 'Edit')
      : (placing || waiting ? '' : 'Set');
    edit.hidden = !label
      || pin?.status === 'checking'
      || !canPlaceRoutePins()
      || isSimulationInteractionLocked();
    edit.textContent = label;
    edit.setAttribute('aria-label', !label
      ? ''
      : toEvacSite && !placing
      ? 'Choose your own end point instead of the evacuation site'
      : `${label} ${pointName}`);
  }

  function buildSetupHelp(role, checking) {
    if (!selectedHazard) return '';
    if (isEarthquakeMode() && !isEarthquakeBarangaySupported()) {
      return `Earthquake routing is currently available only for ${EARTHQUAKE_SUPPORTED_BARANGAY_SCOPE}.`;
    }
    if (checking) return 'Checking that the pinned spot can be reached by road…';
    // An empty slot being set already says what to do ("Move the map, then
    // tap ..."; syncPinSlot), so the sheet says it once.
    if (role) return routePins[role] ? `Drag the map so the pin sits on the ${role === 'start' ? 'start' : 'end'} point.` : '';
    // The two buttons under the slots say it themselves.
    if (isWaitingForEvacSites() && getReadyPin('start')) return '';
    if (canRunCurrentSimulation()) {
      if (simData) return 'Change the hazard or move a pin to compare routes.';
      return isToEvacuationSite() && !routePins.end
        ? `Ready. Routes go to the evacuation site with the ${getRouteRankingLabel()}. Tap Run simulation.`
        : 'Ready. Tap Run simulation.';
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

  // The worst hazard a route crosses: its peak level, how much of a flood
  // route is in Medium water, and how much is above the safety limit.
  function describeRouteRisk(route) {
    const isEarthquake = isEarthquakeRouteRecord(route);
    const label = isEarthquake ? getRiskLevelLabelFromScore(route?.max_hazard) : formatFloodPeakRisk(route);
    const medium = isEarthquake ? 0 : getMediumFloodDistance(route);
    const unsafe = Number(route?.unsafe_distance) || 0;
    // "Medium flooding for 193 m"; with unsafe parts too, both lengths.
    const mediumFor = medium > 0 && unsafe === 0 ? ` for ${formatDistanceCompact(medium)}` : '';
    const dry = !isEarthquake && getFloodPeakVar(route) === 0;
    const parts = [dry ? 'No flooding' : `${label} ${isEarthquake ? 'road risk' : 'flooding'}${mediumFor}`];
    if (unsafe > 0) parts.push(`${formatDistanceCompact(unsafe)} unsafe`);
    if (medium > 0 && unsafe > 0) parts.push(`${formatDistanceCompact(medium)} medium`);
    return { level: label.toLowerCase(), text: parts.join(' · ') };
  }

  function buildTurnStepsMarkup(route, routeNo) {
    const steps = getRouteTurnSteps(route);
    if (!steps.length) return '';

    const destination = route.destination_name || 'Your destination';
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
      ? { safe: 'best', caution: 'best-caution', unsafe: 'best-unsafe' }[getRouteSafetyTier(route)]
      : route.category === 'available' ? 'available' : 'eliminated';
    const tag = isBest ? ` · ${getTopRouteName(route).toLowerCase()}` : route.category === 'eliminated' ? ' · eliminated' : '';
    const risk = describeRouteRisk(route);
    const destination = route.destination_name
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
    const tier = getRouteSafetyTier(best);
    const peak = getPeakRiskRow(best, isEarthquake);

    // Same wording as the desktop results panel (renderRouteSafetyPanel).
    const verdict = $('msimVerdict');
    verdict.classList.toggle('is-safe', tier === 'safe');
    verdict.classList.toggle('is-caution', tier === 'caution');
    verdict.classList.toggle('is-danger', tier === 'unsafe');
    $('msimVerdictTitle').textContent = getRouteVerdictTitle(best);
    const VERDICT_SUBS = {
      safe: formatPeakRiskSentence(peak),
      caution: `${describeMediumFloodCrossing(best)} ${MEDIUM_FLOOD_WARNING}`,
      unsafe: isAreaWideHighRisk(best)
        ? `${describeAreaWideHighRisk(best, result.barangay || selectedBarangay)} ${describeLeastExposedRoute(best)}`
        : `${formatPeakRiskSentence(peak)} ${describeUnsafeCrossing(best)}`,
    };
    $('msimVerdictSub').textContent = VERDICT_SUBS[tier];

    const duration = best?.display_duration || formatRouteWalkingDuration(best);
    const distance = best?.display_distance || formatDistanceCompact(best?.distance);
    // A flood route with no safe option is not to be walked, so its walking
    // time gives way to "not walkable" (the homepage's word for High water)
    // and the call for rescue (getNoSafeRouteAction) becomes the sheet's
    // first action; an earthquake route is still walked, with care. Either
    // way the summary row is the same: what the route is, then its risk.
    const action = getNoSafeRouteAction(best);
    const showRescue = !!action && !isEarthquake;
    $('msimSummaryMain').innerHTML = showRescue
      ? `${safetyIcon('alert')}<span><strong>${escapeHtml(distance)}</strong> · not walkable</span>`
      : `${safetyIcon('walk')}<span><strong>${escapeHtml(duration)}</strong> · <strong>${escapeHtml(distance)}</strong></span>`;
    $('msimSummaryMain').classList.toggle('is-danger', showRescue);
    const rescue = $('msimRescue');
    rescue.hidden = !showRescue;
    $('msimRescueText').textContent = showRescue ? action.title : '';
    // One primary action at a time: rescue, else the details.
    $('msimDetailsBtn').classList.toggle('mbtn--primary', !showRescue);
    $('msimSummaryRoute').textContent = `Route ${best?.display_route_no ?? 1} · ${getTopRouteName(best).toLowerCase()}`;

    const destination = $('msimSummaryDest');
    destination.hidden = !best?.destination_name;
    destination.textContent = best?.destination_name ? `To ${best.destination_name}` : '';
    const farNote = $('msimFarNote');
    farNote.hidden = !isFarFromOpenArea(best);
    farNote.textContent = farNote.hidden ? '' : FAR_FROM_OPEN_AREA_NOTE;

    const ordered = [...routes].sort((left, right) => (left.display_route_no ?? 99) - (right.display_route_no ?? 99));
    state.routesExpanded = false;
    $('msimRouteList').innerHTML = ordered.map((route, index) => buildRouteRow(route, index, best)).join('');
    syncRouteRows();

    const antNote = buildAntSearchNote(result);
    $('msimSource').innerHTML = [antNote && escapeHtml(antNote), buildHazardSourceNoteHtml(isEarthquake)]
      .filter(Boolean)
      .join(' ');
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
    // A picked route past the first few is on the map only while picked.
    renderMapLegend();
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

  // Each step starts at peek, with the legend folded and the camera the
  // app's: the results are fitted once even if the visitor moved the map
  // mid-replay.
  function enterMode(mode) {
    state.mode = mode;
    state.snap = 'peek';
    state.legendFolded = true;
    state.autoFitPaused = false;
    scroller.scrollTop = 0;
  }

  // A finished run (runSimulation) or "See results": results mode at peek,
  // so the route on the map and the verdict are both in view.
  function showResults() {
    if (!simData) return;
    enterMode('results');
    syncNow();

    const disclaimer = $('msimDisclaimer');
    if (disclaimer && !isDisclaimerSeen()) {
      disclaimer.open = true;
      markDisclaimerSeen();
    }
    if (isActive()) $('msimVerdictTitle').focus({ preventScroll: true });
  }

  // The ants' search (aco-replay.js), between a run's loader and its
  // results: the sheet holds the replay's panel, at peek, so the map stays
  // in view. Returns false outside this layout.
  function showReplay(panel) {
    if (!isActive()) return false;
    $('msimReplay').replaceChildren(panel);
    enterMode('replay');
    state.replayPeek = 0;
    syncNow();
    return true;
  }

  function endReplay() {
    $('msimReplay').replaceChildren();
    state.replayPeek = 0;
    if (state.mode === 'replay') enterMode(simData ? 'results' : 'setup');
    scheduleSync();
  }

  function showSetup() {
    enterMode('setup');
    syncNow();
    if (isActive()) $('msimSetupTitle').focus({ preventScroll: true });
  }

  function toggleResultDetails() {
    snapTo(state.snap === 'full' ? 'peek' : 'full', { refit: true });
  }

  // The replay's More / Less: its other steps and full texts.
  $('msimReplay').addEventListener('click', event => {
    if (!event.target.closest?.('.aco-replay-more')) return;
    snapTo(state.snap === 'peek' ? 'half' : 'peek', { refit: true });
  });

  // Scrolls el into the part of the sheet that will be visible once the
  // current snap settles (its box may still be animating to that height).
  function revealInSheet(el) {
    if (!el) return;
    const top = el.offsetTop - scroller.offsetTop;
    const bottom = top + el.offsetHeight;
    const paddingBottom = parseFloat(getComputedStyle(sheet).paddingBottom) || 0;
    const visible = isSide() ? scroller.clientHeight : state.height - scroller.offsetTop - paddingBottom;
    let next = scroller.scrollTop;
    if (bottom + 12 > next + visible) next = bottom + 12 - visible;
    if (top - 12 < next) next = top - 12;
    scroller.scrollTo({ top: Math.max(0, next), behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
  }

  // ---- choosing start and end with the center pin ----

  // Moves the map so latlng sits under the center pin. fly: glide there
  // (setView only pans short hops and jumps on longer ones).
  function centerUnderPin(latlng, zoom = gMap?.getZoom(), { fly = false } = {}) {
    if (!gMap || !latlng) return;
    const size = gMap.getSize();
    const offset = L.point(size.x / 2 - getPinX(), size.y / 2 - getPinY());
    const center = gMap.unproject(gMap.project(latlng, zoom).add(offset), zoom);
    if (fly) gMap.flyTo(center, zoom, mapMoveOptions({ duration: RECENTER_FLY_SECONDS }));
    else gMap.setView(center, zoom, mapMoveOptions({ animate: true }));
  }

  function setPinHere() {
    const role = getPinRole();
    if (!role || !gMap) return;
    const latlng = gMap.containerPointToLatLng([getPinX(), getPinY()]);
    placeRoutePin(role, latlng.lat, latlng.lng);
  }

  function editPin(role) {
    if (!canPlaceRoutePins() || isSimulationInteractionLocked()) return;
    const pin = getReadyPin(role);
    clearPinHintError();

    if (getPinRole() === role) {
      // Cancel: keep the pin where it was (or the evacuation sites).
      if (pin || role === 'end') setPinPlacementRole(null);
      return;
    }

    setPinPlacementRole(role);
    snapTo('peek');
    if (pin) centerUnderPin(L.latLng(pin.lat, pin.lng), Math.max(gMap.getZoom(), PIN_PLACEMENT_ZOOM));
  }

  function closeDestinationMenu() {
    $('msimDestinationMenu').hidden = true;
    $('msimSlotEdit-end').setAttribute('aria-expanded', 'false');
    scheduleSync();
  }

  function toggleDestinationMenu() {
    if (getPinRole() === 'end') { editPin('end'); return; }
    if (!canPlaceRoutePins() || isSimulationInteractionLocked()) return;
    const opening = $('msimDestinationMenu').hidden;
    closePinMenus();
    $('msimDestinationMenu').hidden = !opening;
    $('msimSlotEdit-end').setAttribute('aria-expanded', String(opening));
    scheduleSync();
    if (opening) $('msimDestinationMenu').querySelector('button:not(:disabled)')?.focus({ preventScroll: true });
  }

  function chooseOwnDestination() {
    closeDestinationMenu();
    editPin('end');
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
    const held = isMapGestureLocked();
    $('msimZoomIn').disabled = held || zoom >= gMap.getMaxZoom();
    $('msimZoomOut').disabled = held || zoom <= gMap.getMinZoom();
  }

  // Zooms around the visible center (where the pin is), not the middle of
  // the whole map, which is under the sheet.
  function zoomBy(direction) {
    if (!gMap || isMapGestureLocked()) return;
    pauseAutoFit();
    const step = (gMap.options.zoomDelta || 1) * direction;
    const zoom = Math.max(gMap.getMinZoom(), Math.min(gMap.getMaxZoom(), gMap.getZoom() + step));
    gMap.setZoomAround(L.point(getPinX(), getPinY()), zoom, mapMoveOptions());
  }

  // locateVisitor (script.js) finds the visitor and keeps them inside the
  // barangay; here the spot lands under the center pin, ready for "Set
  // start here". Off during a run and its replay (syncMapButtons).
  function locate() {
    if (state.mode === 'replay' || isMapGestureLocked()) return;
    locateVisitor({
      button: $('msimLocateBtn'),
      moveTo: latlng => {
        // The visitor asked for this view; a sheet snap must not undo it.
        pauseAutoFit();
        centerUnderPin(latlng, Math.max(gMap.getZoom(), PIN_PLACEMENT_ZOOM), { fly: true });
      },
      onFound: () => showToast('Showing your location'),
    });
  }

  // ---- camera: the app's or the visitor's ----

  // A two-finger touch, wheel or double-tap still reaches the map while its
  // gestures are locked for a run (script.js setMapGestureLock), but moves
  // nothing, so the camera stays the app's.
  function pauseAutoFit() {
    if (isActive() && !isMapGestureLocked()) state.autoFitPaused = true;
  }

  function resumeAutoFit() {
    state.autoFitPaused = false;
  }

  // ---- a short notice under the top bar ----

  function showToast(message, { error = false, durationMs = TOAST_MS } = {}) {
    const toast = $('msimToast');
    if (!toast || !isActive()) return;
    window.clearTimeout(state.toastTimer);
    toast.textContent = message;
    toast.classList.toggle('is-error', error);
    toast.hidden = false;
    // Restarts the fade-in for a second notice while one shows.
    toast.classList.remove('is-shown');
    void toast.offsetWidth;
    toast.classList.add('is-shown');
    state.toastTimer = window.setTimeout(() => {
      toast.classList.remove('is-shown');
      state.toastTimer = window.setTimeout(() => { toast.hidden = true; }, 200);
    }, durationMs);
  }

  // ---- legend on the map ----

  // Same condition as the desktop severity filter (syncFloodFilterControl),
  // which also keeps the Layers sheet's chips' active state.
  function isFloodLevelsShown() {
    return $('floodFilterControl')?.hidden === false;
  }

  // The map legend's rows, minus route kinds not on the map right now (e.g.
  // no eliminated route drawn), plus the flood levels on one line while
  // they show.
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
      const rows = FLOOD_LEGEND_ROWS.map(([color, label]) => (
        `<div class="legend-row"><span class="msim-legend-swatch" style="background:${color}"></span><span>${label}</span></div>`
      )).join('');
      html += `<div><span class="msim-legend-caption">Flood level</span><div class="msim-legend-levels">${rows}</div></div>`;
    }
    return html;
  }

  // The legend on the map, bottom-left above the sheet, while there is
  // something to list.
  function renderMapLegend() {
    const card = $('msimMapLegend');
    if (!card) return;
    const html = isActive() ? buildLegendHtml(isFloodLevelsShown()) : '';
    if (html !== state.legendHtml) {
      state.legendHtml = html;
      $('msimMapLegendBody').innerHTML = html;
    }
    card.hidden = !html;
    syncMapLegendChrome();
  }

  // Folded to its chip or open above it (scrolling inside the map left in
  // view), and out of the way when the map strip is too short for the chip.
  function syncMapLegendChrome() {
    const card = $('msimMapLegend');
    if (!card) return;
    card.classList.toggle('is-folded', state.legendFolded);
    $('msimMapLegendBody').hidden = state.legendFolded;
    $('msimMapLegendToggle').setAttribute('aria-expanded', String(!state.legendFolded));
    if (state.legendFolded && card.offsetHeight) state.legendChipH = card.offsetHeight;
    const room = getMapRoom();
    const offset = parseFloat(getComputedStyle(card).bottom) || 0;
    card.style.setProperty('--msim-legend-max-h', `${Math.max(0, Math.round(room - offset - (state.legendChipH || LEGEND_CHIP_FALLBACK_H) - LEGEND_ROOM_MARGIN))}px`);
    const fits = room >= (state.legendChipH || LEGEND_CHIP_FALLBACK_H) + LEGEND_ROOM_MARGIN;
    shell.classList.toggle('msim-legend-hidden', isActive() && (card.hidden || !fits));
  }

  // Only the visitor opens it (the chip), and a second tap on the chip, a
  // tap on the map or a drag of it closes it again (attachMap).
  function toggleMapLegend() {
    state.legendFolded = !state.legendFolded;
    syncMapLegendChrome();
  }

  function foldMapLegend() {
    if (state.legendFolded) return;
    state.legendFolded = true;
    syncMapLegendChrome();
  }

  function syncLayersPanel() {
    const street = state.baseLayers?.street;
    const onStreet = !street || !gMap || gMap.hasLayer(street);
    document.querySelectorAll('[data-msim-base]').forEach(button => {
      button.setAttribute('aria-pressed', String((button.dataset.msimBase === 'street') === onStreet));
    });

    $('msimLayersFlood').hidden = !isFloodLevelsShown();
  }

  // While the layers sheet is open, everything behind it is inert.
  function setBackgroundInert(inert) {
    ['msimTopbar', 'msimSheet', 'msimMapControls', 'msimMapLegend'].forEach(id => $(id)?.toggleAttribute('inert', inert));
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
    if (!isActive()) return false;
    if (!$('msimDestinationMenu').hidden) {
      closeDestinationMenu();
      $('msimSlotEdit-end').focus({ preventScroll: true });
    } else if (state.barangayMenuOpen) closeBarangayMenu();
    else if (state.layersOpen) closeLayers();
    else return false;
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
    // Only the visitor drags (a programmatic move never fires dragstart),
    // pinches, wheels or double-taps: each hands the camera to them.
    map.on('dragstart', () => {
      $('msimCenterPin')?.classList.add('is-lifted');
      pauseAutoFit();
      foldMapLegend();
    });
    map.on('dragend', () => $('msimCenterPin')?.classList.remove('is-lifted'));
    map.on('click', foldMapLegend);
    map.on('dblclick', () => {
      window.clearTimeout(state.mapTapTimer);
      state.mapTapTimer = null;
      pauseAutoFit();
    });
    const container = map.getContainer();
    container.addEventListener('touchstart', event => {
      if (event.touches.length > 1) pauseAutoFit();
    }, { passive: true });
    container.addEventListener('wheel', pauseAutoFit, { passive: true });
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
      closeBarangayMenu({ restoreFocus: false });
      state.height = 0;
      state.box = 0;
      window.clearTimeout(state.settleTimer);
      shell.style.removeProperty('--sheet-h');
      shell.style.removeProperty('--sheet-box-h');
      shell.classList.remove('msim-controls-hidden', 'msim-map-covered', 'msim-dragging', 'msim-legend-hidden', 'msim-route-on');
      $('msimCenterPin').hidden = true;
    }
    syncRoutePinMarkers();
  }

  SHEET_QUERY.addEventListener?.('change', onLayoutChange);
  SIDE_QUERY.addEventListener?.('change', onLayoutChange);
  window.addEventListener('resize', () => {
    if (isActive()) scheduleSync();
  });
  // script.js and earthquake.js rewrite the map legend (#mapLegend, hidden
  // here) for each result, lens and pin change; the one on the map follows.
  const desktopLegend = $('mapLegend');
  if (desktopLegend) {
    new MutationObserver(() => {
      if (isActive()) scheduleSync();
    }).observe(desktopLegend, { attributes: true, attributeFilter: ['style'], childList: true, subtree: true });
  }
  document.fonts?.ready?.then(scheduleSync);

  $('msimDisclaimerText').textContent = SAFETY_DISCLAIMER_TEXT;

  window.mobileSim = {
    attachMap,
    clearResults,
    closeDestinationMenu,
    endReplay,
    getCoveredInsets,
    handleEscape,
    handleMapTap,
    isActive,
    isAutoFitPaused: () => isActive() && state.autoFitPaused,
    resumeAutoFit,
    toast: showToast,
    // The pin being moved is drawn by the center pin, not its marker.
    isCenterPinRole: role => isActive() && getPinRole() === role,
    renderResults,
    scheduleSync,
    showReplay,
    showResults,
    showSetup,
    syncRouteRows,
  };

  // index.html's inline handlers.
  Object.assign(window, {
    chooseMobileHazard: chooseHazard,
    closeMobileBarangayMenu: () => closeBarangayMenu(),
    closeMobileLayers: () => closeLayers(),
    downloadMobileReport: downloadReport,
    editMobilePin: editPin,
    chooseMobileDestination: chooseOwnDestination,
    toggleMobileDestinationMenu: toggleDestinationMenu,
    locateMobileUser: locate,
    mobileMapZoom: zoomBy,
    openMobileLayers: openLayers,
    setMobileBaseLayer: setBaseLayer,
    setMobilePinHere: setPinHere,
    showMobileHazardPicker: showHazardPicker,
    showMobileResults: showResults,
    showMobileSetup: showSetup,
    toggleMobileBarangayMenu: toggleBarangayMenu,
    toggleMobileMapLegend: toggleMapLegend,
    toggleMobileMoreRoutes: toggleMoreRoutes,
    toggleMobileResultDetails: toggleResultDetails,
  });

  syncNow();
})();
