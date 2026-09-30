// Flask serves this page and the API together, so the API is always on the
// page's own origin -- whatever host/port the app runs on (dev server,
// gunicorn, Docker, Railway).
window.BACKEND_BASE = window.location.origin;

let gMap = null;
let selectedBarangay = null;
let selectedHazard = null;
let simData = null;
let isBackendLive = false;
let activeEarthquakeView = 'overall';
let earthquakeEvacSites = [];
let earthquakeEvacSitesVisible = false;
let mapLayers = { boundaries: [], routes: [], routeGroups: [] };
let activeInfoWindow = null;
let selectedRouteFocus = null;
let workflowFocusSection = null;
let simulationInProgress = false;
let backendSimulationBusy = false;
let backendSimulationStatus = null;
let backendBusyPollTimer = null;
let floodHazardOverlayMode = 'all';
// Barangay is now picked on the homepage (see home.js's quick-start card)
// and handed off via ?barangay=... -- must match the data-barangay values
// that card uses exactly, since selectBarangay() looks locations up by name.
const SUPPORTED_QUICKSTART_BARANGAYS = ['Pinagbuhatan', 'Sta. Lucia'];
const activeInfoWindowRef = { current: null };
const loaderState = {
  current: 0,
  target: 0,
  frameId: null,
};
const LOADER_FADE_OUT_MS = 260;
const LOADER_PROGRESS_POLL_MS = 900;
const LOADER_ROUTE_STAGE_RANGE = [22, 76];
let loaderProgressPollTimer = null;
const THEME_STORAGE_KEY = 'disaster-route-sim-theme';
// Matches gunicorn's --timeout; simulations legitimately take minutes.
const SIMULATION_REQUEST_TIMEOUT_MS = 300000;
const BACKEND_SIMULATION_STATUS_POLL_MS = 2500;
const HAZARD_SELECTION_CLASSES = ['flood', 'earthquake'];
const EARTHQUAKE_SUPPORTED_BARANGAY_SCOPE = 'Pinagbuhatan and Sta. Lucia';
const EARTHQUAKE_SUPPORTED_BARANGAY_PROMPT = 'Pinagbuhatan or Sta. Lucia';
const EARTHQUAKE_SUPPORTED_BARANGAY_KEYS = new Set([
  'pinagbuhatan',
  'sta lucia',
  'santa lucia',
  'st lucia',
]);
const EARTHQUAKE_VIEW_META = {
  overall: 'Overall earthquake lens',
  liquefaction: 'Liquefaction lens',
  ground_shaking: 'Ground shaking lens',
};
const EARTHQUAKE_MIN_FOCUS_ZOOM = 13;
const FLOOD_OVERLAY_VIEWS = {
  all: {
    label: 'All levels',
    vars: [1, 2, 3],
    copy: 'All flood severity levels are visible. Select a level to highlight it.',
  },
  none: {
    label: 'Hidden',
    vars: [],
    copy: 'Choose a flood layer below to display it on the map. Click the active layer again to return to the default map view.',
  },
  high: {
    label: 'High',
    vars: [1, 2, 3],
    focusVar: 3,
    copy: 'High flood areas are highlighted; other severity levels are dimmed.',
  },
  moderate: {
    label: 'Medium',
    vars: [1, 2, 3],
    focusVar: 2,
    copy: 'Medium flood areas are highlighted; other severity levels are dimmed.',
  },
  low: {
    label: 'Low',
    vars: [1, 2, 3],
    focusVar: 1,
    copy: 'Low flood areas are highlighted; other severity levels are dimmed.',
  },
};
const HAZARD_THEME_VARIABLES = [
  '--page-top',
  '--page-bottom',
  '--glow-a',
  '--glow-b',
  '--bg',
  '--surface',
  '--panel',
  '--border',
  '--border2',
  '--accent',
  '--accent2',
  '--text',
  '--muted',
  '--dim',
  '--ink-strong',
  '--ink-soft',
  '--map-ui-bg',
  '--map-ui-bg-soft',
  '--map-ui-border',
  '--map-ui-text',
  '--map-ui-muted',
  '--map-ui-accent',
  '--map-ui-chip',
  '--accent-soft-bg',
  '--accent-soft-border',
  '--accent-soft-shadow',
  '--hazard-selected-bg',
  '--hazard-selected-border',
  '--hazard-selected-text',
  '--hazard-chip-bg',
  '--hazard-chip-border',
  '--hazard-chip-text',
  '--hazard-panel-bg',
  '--hazard-panel-border',
  '--hazard-panel-strong',
  '--hazard-button-start',
  '--hazard-button-end',
  '--hazard-button-shadow',
  '--hazard-button-hover-shadow',
];
const HAZARD_THEME_PALETTES = {
  flood: {
    light: {
      '--page-top': '#eef8ff',
      '--page-bottom': '#d5ebfb',
      '--glow-a': 'rgba(14, 165, 233, .16)',
      '--glow-b': 'rgba(56, 189, 248, .12)',
      '--bg': '#d7ebf8',
      '--surface': '#ecf7ff',
      '--panel': '#f8fcff',
      '--border': '#b8d4e6',
      '--border2': '#8cb5d2',
      '--accent': '#0284c7',
      '--accent2': '#38bdf8',
      '--text': '#153247',
      '--muted': '#5e778e',
      '--dim': '#87a3bb',
      '--ink-strong': '#14384f',
      '--ink-soft': '#4e6980',
      '--map-ui-bg': '#f4fbff',
      '--map-ui-bg-soft': 'rgba(244, 251, 255, .92)',
      '--map-ui-border': '#b8d4e6',
      '--map-ui-text': '#123449',
      '--map-ui-muted': '#607a90',
      '--map-ui-accent': '#0284c7',
      '--map-ui-chip': 'rgba(14, 165, 233, .08)',
      '--accent-soft-bg': 'rgba(2, 132, 199, .06)',
      '--accent-soft-border': 'rgba(2, 132, 199, .16)',
      '--accent-soft-shadow': 'rgba(2, 132, 199, .08)',
      '--hazard-selected-bg': 'rgba(56, 189, 248, .10)',
      '--hazard-selected-border': '#38bdf8',
      '--hazard-selected-text': '#0369a1',
      '--hazard-chip-bg': 'rgba(2, 132, 199, .12)',
      '--hazard-chip-border': 'rgba(2, 132, 199, .22)',
      '--hazard-chip-text': '#075985',
      '--hazard-panel-bg': 'rgba(2, 132, 199, .06)',
      '--hazard-panel-border': 'rgba(2, 132, 199, .18)',
      '--hazard-panel-strong': '#0369a1',
      '--hazard-button-start': '#0ea5e9',
      '--hazard-button-end': '#0284c7',
      '--hazard-button-shadow': 'rgba(14, 165, 233, .22)',
      '--hazard-button-hover-shadow': 'rgba(14, 165, 233, .30)',
    },
    dark: {
      '--page-top': '#06111d',
      '--page-bottom': '#04111a',
      '--glow-a': 'rgba(14, 165, 233, .20)',
      '--glow-b': 'rgba(56, 189, 248, .16)',
      '--bg': '#071523',
      '--surface': '#0b1c2b',
      '--panel': '#102233',
      '--border': '#1f4056',
      '--border2': '#2f6987',
      '--accent': '#38bdf8',
      '--accent2': '#7dd3fc',
      '--text': '#eaf6fe',
      '--muted': '#94b1c6',
      '--dim': '#62829d',
      '--ink-strong': '#f0f8ff',
      '--ink-soft': '#c8dceb',
      '--map-ui-bg': '#0c1a28',
      '--map-ui-bg-soft': 'rgba(12, 26, 40, .94)',
      '--map-ui-border': '#23475f',
      '--map-ui-text': '#e6f2fb',
      '--map-ui-muted': '#9db7ca',
      '--map-ui-accent': '#38bdf8',
      '--map-ui-chip': 'rgba(56, 189, 248, .12)',
      '--accent-soft-bg': 'rgba(56, 189, 248, .08)',
      '--accent-soft-border': 'rgba(56, 189, 248, .22)',
      '--accent-soft-shadow': 'rgba(56, 189, 248, .12)',
      '--hazard-selected-bg': 'rgba(56, 189, 248, .12)',
      '--hazard-selected-border': '#38bdf8',
      '--hazard-selected-text': '#bae6fd',
      '--hazard-chip-bg': 'rgba(56, 189, 248, .14)',
      '--hazard-chip-border': 'rgba(56, 189, 248, .24)',
      '--hazard-chip-text': '#bae6fd',
      '--hazard-panel-bg': 'rgba(56, 189, 248, .08)',
      '--hazard-panel-border': 'rgba(56, 189, 248, .20)',
      '--hazard-panel-strong': '#bae6fd',
      '--hazard-button-start': '#0ea5e9',
      '--hazard-button-end': '#38bdf8',
      '--hazard-button-shadow': 'rgba(56, 189, 248, .26)',
      '--hazard-button-hover-shadow': 'rgba(56, 189, 248, .36)',
    },
  },
  earthquake: {
    light: {
      '--page-top': '#fff7ef',
      '--page-bottom': '#f0ddcf',
      '--glow-a': 'rgba(194, 65, 12, .14)',
      '--glow-b': 'rgba(245, 158, 11, .11)',
      '--bg': '#f5e4d5',
      '--surface': '#fff3e8',
      '--panel': '#fffaf5',
      '--border': '#dfc2a5',
      '--border2': '#c79d79',
      '--accent': '#b45309',
      '--accent2': '#f59e0b',
      '--text': '#35261c',
      '--muted': '#786559',
      '--dim': '#a28b7c',
      '--ink-strong': '#3f2b1f',
      '--ink-soft': '#6f5a4d',
      '--map-ui-bg': '#fffaf5',
      '--map-ui-bg-soft': 'rgba(255, 250, 245, .93)',
      '--map-ui-border': '#dfc2a5',
      '--map-ui-text': '#35271d',
      '--map-ui-muted': '#7a675b',
      '--map-ui-accent': '#b45309',
      '--map-ui-chip': 'rgba(180, 83, 9, .08)',
      '--accent-soft-bg': 'rgba(180, 83, 9, .06)',
      '--accent-soft-border': 'rgba(180, 83, 9, .16)',
      '--accent-soft-shadow': 'rgba(180, 83, 9, .08)',
      '--hazard-selected-bg': 'rgba(245, 158, 11, .10)',
      '--hazard-selected-border': '#f59e0b',
      '--hazard-selected-text': '#9a3412',
      '--hazard-chip-bg': 'rgba(180, 83, 9, .12)',
      '--hazard-chip-border': 'rgba(180, 83, 9, .22)',
      '--hazard-chip-text': '#9a3412',
      '--hazard-panel-bg': 'rgba(180, 83, 9, .06)',
      '--hazard-panel-border': 'rgba(180, 83, 9, .18)',
      '--hazard-panel-strong': '#b45309',
      '--hazard-button-start': '#f59e0b',
      '--hazard-button-end': '#b45309',
      '--hazard-button-shadow': 'rgba(180, 83, 9, .22)',
      '--hazard-button-hover-shadow': 'rgba(180, 83, 9, .30)',
    },
    dark: {
      '--page-top': '#1a0f0b',
      '--page-bottom': '#120906',
      '--glow-a': 'rgba(245, 158, 11, .20)',
      '--glow-b': 'rgba(239, 68, 68, .13)',
      '--bg': '#1a100b',
      '--surface': '#24160f',
      '--panel': '#2c1b13',
      '--border': '#4c2d1a',
      '--border2': '#7a4727',
      '--accent': '#f59e0b',
      '--accent2': '#fdba74',
      '--text': '#f7ede2',
      '--muted': '#d6b9a2',
      '--dim': '#8f6d57',
      '--ink-strong': '#fff4ea',
      '--ink-soft': '#e5c7b0',
      '--map-ui-bg': '#24160f',
      '--map-ui-bg-soft': 'rgba(36, 22, 15, .94)',
      '--map-ui-border': '#5a341d',
      '--map-ui-text': '#f6eadf',
      '--map-ui-muted': '#d0b39d',
      '--map-ui-accent': '#f59e0b',
      '--map-ui-chip': 'rgba(245, 158, 11, .12)',
      '--accent-soft-bg': 'rgba(245, 158, 11, .08)',
      '--accent-soft-border': 'rgba(245, 158, 11, .22)',
      '--accent-soft-shadow': 'rgba(245, 158, 11, .12)',
      '--hazard-selected-bg': 'rgba(245, 158, 11, .14)',
      '--hazard-selected-border': '#f59e0b',
      '--hazard-selected-text': '#fde68a',
      '--hazard-chip-bg': 'rgba(245, 158, 11, .14)',
      '--hazard-chip-border': 'rgba(245, 158, 11, .24)',
      '--hazard-chip-text': '#fde68a',
      '--hazard-panel-bg': 'rgba(245, 158, 11, .08)',
      '--hazard-panel-border': 'rgba(245, 158, 11, .20)',
      '--hazard-panel-strong': '#fde68a',
      '--hazard-button-start': '#f59e0b',
      '--hazard-button-end': '#fb923c',
      '--hazard-button-shadow': 'rgba(245, 158, 11, .28)',
      '--hazard-button-hover-shadow': 'rgba(245, 158, 11, .38)',
    },
  },
};

// Start/destination are points the visitor taps on the map (earthquake mode
// uses only 'start'; its destinations are the evacuation sites). Each pin is
// null or { lat, lng, status: 'checking' | 'ready', label, street, roadDistance }
// -- only a 'ready' pin, one the backend's /check-pin accepted, can be routed.
const PIN_ROLES = ['start', 'end'];
const PIN_ROLE_COPY = {
  start: {
    empty: 'Your location',
    fallbackLabel: 'Your location',
    hint: 'Tap the map to pin where you are',
    popupRole: 'Start point',
  },
  end: {
    empty: 'Choose destination',
    fallbackLabel: 'Your destination',
    hint: 'Now tap the map to pin your destination',
    popupRole: 'Destination',
  },
};
// A pin this close to its road reads as being on that street ("Tramo
// Street") rather than beside it ("Near Tramo Street").
const PIN_ON_STREET_METERS = 15;
const PIN_HINT_ERROR_MS = 5000;
// "Choose on Map" zooms to at least street level so a tap lands where meant.
const PIN_PLACEMENT_ZOOM = 17;
const routePins = { start: null, end: null };
const routePinMarkers = { start: null, end: null };
const pinCheckSeq = { start: 0, end: 0 };
let pinPlacementRole = null;
let pinHintMessage = null;
let pinHintTimer = null;
// Exterior rings of the selected barangay's boundary: drawn as the map's
// outline and outside mask, and used for an instant outside-the-barangay
// check before asking the backend about a tapped point.
let barangayBoundaryRings = [];

function applyHazardTheme() {
  const modeKey = document.body.classList.contains('dark') ? 'dark' : 'light';
  const hazardKey = String(selectedHazard || '').trim().toLowerCase();
  const palette = HAZARD_THEME_PALETTES[hazardKey]?.[modeKey] || null;

  HAZARD_THEME_VARIABLES.forEach(variableName => {
    document.body.style.removeProperty(variableName);
  });

  if (!palette) {
    document.body.dataset.hazardTheme = 'default';
    return;
  }

  Object.entries(palette).forEach(([variableName, value]) => {
    document.body.style.setProperty(variableName, value);
  });
  document.body.dataset.hazardTheme = hazardKey;
}

function getBarangayBoundaryStrokeColor() {
  const hazardKey = String(selectedHazard || '').trim().toLowerCase();

  if (hazardKey === 'earthquake') {
    return '#f97316';
  }

  if (hazardKey === 'flood') {
    return '#0ea5e9';
  }

  return '#2563eb';
}

function getBarangayBoundaryHaloColor() {
  return '#0f172a';
}

// A single world-spanning ring with each boundary ring punched into it as a
// hole - Leaflet/SVG renders the holes transparent, dimming everything
// outside the selected barangay's scope without needing per-region tiles.
const WORLD_MASK_RING = [
  [85, -180],
  [85, 180],
  [-85, 180],
  [-85, -180],
];

function buildBarangayScopeMask(rings) {
  const holes = rings.filter(ring => ring.length >= 3);
  if (!holes.length) return null;

  return L.polygon([WORLD_MASK_RING, ...holes], {
    stroke: false,
    fillColor: '#020617',
    fillOpacity: 0.45,
    interactive: false,
    className: 'barangay-scope-mask',
  });
}

function getStoredTheme() {
  try {
    return localStorage.getItem(THEME_STORAGE_KEY) === 'dark' ? 'dark' : 'light';
  } catch (err) {
    return 'light';
  }
}

// The theme is picked with the homepage's switch (home.js); this page only
// reads the stored choice.
function initTheme() {
  document.body.classList.toggle('dark', getStoredTheme() === 'dark');
  applyHazardTheme();
}

let emergencyContactReturnFocusEl = null;

function openEmergencyContactModal(event) {
  const modal = document.getElementById('emergencyContactModal');
  if (!modal) return;

  emergencyContactReturnFocusEl = event?.currentTarget instanceof HTMLElement
    ? event.currentTarget
    : document.activeElement;

  modal.hidden = false;
  window.requestAnimationFrame(() => {
    modal.querySelector('.emergency-modal-close')?.focus({ preventScroll: true });
  });
}

function closeEmergencyContactModal() {
  const modal = document.getElementById('emergencyContactModal');
  if (!modal || modal.hidden) return;

  modal.hidden = true;

  const focusTarget = emergencyContactReturnFocusEl;
  emergencyContactReturnFocusEl = null;
  focusTarget?.focus?.({ preventScroll: true });
}

document.getElementById('emergencyContactModal')?.addEventListener('mousedown', event => {
  if (event.target === event.currentTarget) closeEmergencyContactModal();
});

// The pin hint sits bottom-center and the legend bottom-left; when the map is
// too narrow for both, the legend steps aside while the hint shows.
function syncMapOverlayLayout() {
  const mapWrap = document.querySelector('.map-wrap');
  const hint = document.getElementById('mapPinHint');
  const legend = document.getElementById('mapLegend');
  if (!mapWrap || !hint) return;

  let crowded = false;
  if (!hint.hidden && legend && legend.style.display !== 'none') {
    const hintLeft = (mapWrap.clientWidth - hint.offsetWidth) / 2;
    crowded = hintLeft < legend.offsetLeft + legend.offsetWidth + 8;
  }
  mapWrap.classList.toggle('pin-hint-crowded', crowded);
}

function setMapLegendVisible(visible) {
  const legend = document.getElementById('mapLegend');
  if (legend) legend.style.display = visible ? 'block' : 'none';
  syncMapOverlayLayout();
}

// Mobile panel range (style.css: < 640px width, or any width when the
// viewport is short -- phone landscape) -- setup and results are each a
// full-screen panel here instead of docking side by side, narrower, in a
// grid column (tablet and desktop, both untouched).
const MOBILE_PANEL_QUERY = window.matchMedia('(max-width: 639px), (max-height: 499px)');

function applySetupSidebarState(shouldCollapse) {
  const shell = document.getElementById('appShell');
  // This button lives inside .left-panel itself, so it disappears along
  // with the rest of the panel when collapsed -- #sidebarReopenBtn (outside
  // .left-panel, see toggleSetupSidebar()) is what brings it back.
  const toggleBtn = document.getElementById('sidebarToggleBtn');
  if (!shell) return;

  shell.classList.toggle('sidebar-collapsed', shouldCollapse);

  if (toggleBtn) {
    toggleBtn.setAttribute('aria-expanded', String(!shouldCollapse));
    toggleBtn.setAttribute('aria-label', shouldCollapse ? 'Show simulation setup' : 'Hide simulation setup');
    const tipLabel = toggleBtn.querySelector('[data-sidebar-tip-label]');
    if (tipLabel) tipLabel.textContent = shouldCollapse ? 'Show sidebar' : 'Hide sidebar';
  }

  // On mobile, setup and results are each a full-screen panel, not two
  // panels that can both stay open like on desktop/tablet -- so opening
  // setup there also closes results, if they happened to be open.
  if (!shouldCollapse && MOBILE_PANEL_QUERY.matches) {
    setRouteSafetyPanelVisible(false);
  }

  // No invalidateSize() call here: collapsing/expanding resizes #map's own
  // box, which the ResizeObserver in initMap() already watches and settles
  // on its own once the .22s CSS transition finishes.
}

function toggleSetupSidebar(forceOpen = null) {
  const shell = document.getElementById('appShell');
  if (!shell) return;

  const shouldCollapse = forceOpen == null
    ? !shell.classList.contains('sidebar-collapsed')
    : !forceOpen;
  applySetupSidebarState(shouldCollapse);

  // Whichever button is now visible -- the reopen tab when collapsing, the
  // in-panel toggle when opening -- so focus never lands on a hidden element.
  document.getElementById(shouldCollapse ? 'sidebarReopenBtn' : 'sidebarToggleBtn')?.focus({ preventScroll: true });
}

// "Edit setup" button (mobile results panel): swap back to the setup
// panel. Goes through toggleSetupSidebar so focus management and the
// results-panel-closing side effect (applySetupSidebarState above) both
// happen the same way a bottom-bar tap already would.
function openSetupDrawerFromResults() {
  toggleSetupSidebar(true);
}

// Esc (mobile only): close whichever of setup/results is currently open. At
// most one ever is by design (see applySetupSidebarState), so this only
// ever does one or the other. Also the bottom bar's own close path -- see
// toggleMobilePanelBar below.
function closeWorkspaceDrawers() {
  const shell = document.getElementById('appShell');
  if (!shell) return;
  if (!shell.classList.contains('sidebar-collapsed')) {
    toggleSetupSidebar(false);
  } else if (shell.classList.contains('safety-open')) {
    setRouteSafetyPanelVisible(false);
  }
}

// Bottom bar tap (mobile only): closes whichever panel is open, or -- if
// neither is -- opens the one that's currently relevant (results once a
// simulation has run, setup before that).
function toggleMobilePanelBar() {
  const shell = document.getElementById('appShell');
  if (!shell) return;
  const anyPanelOpen = !shell.classList.contains('sidebar-collapsed') || shell.classList.contains('safety-open');
  if (anyPanelOpen) {
    closeWorkspaceDrawers();
  } else if (simData) {
    setRouteSafetyPanelVisible(true);
  } else {
    toggleSetupSidebar(true);
  }
}

function syncMobilePanelBarLabel() {
  const label = document.getElementById('mobilePanelBarLabel');
  if (label) label.textContent = simData ? 'Route safety results' : 'Simulation setup';
}

// On a phone the setup panel sits above the map in the page, so opening it
// or changing its height pushes the map (and the pin being edited) down.
// Runs update() and scrolls the page to keep the map where it was on screen.
function keepMapInPlace(update) {
  const mapWrap = document.querySelector('.map-wrap');
  const mapTopBefore = mapWrap?.getBoundingClientRect().top;
  update();
  const mapTopAfter = mapWrap?.getBoundingClientRect().top;
  if (Number.isFinite(mapTopBefore) && Number.isFinite(mapTopAfter) && mapTopAfter !== mapTopBefore) {
    window.scrollBy(0, mapTopAfter - mapTopBefore);
  }
}

// The setup panel collapses after a run; bring it back (e.g. once moving a
// pin drops that run's routes, so its Run button is in reach again) without
// shifting the map.
function reopenSetupSidebar() {
  const shell = document.getElementById('appShell');
  if (!shell?.classList.contains('sidebar-collapsed')) return;
  keepMapInPlace(() => applySetupSidebarState(false));
}

function syncFloodFilterControl() {
  const control = document.getElementById('floodFilterControl');
  const hint = document.getElementById('floodFilterHint');
  const isFlood = selectedHazard === 'Flood' && !!selectedBarangay && hasFloodSimulationResult();
  if (control) control.hidden = !isFlood;

  document.querySelectorAll('[data-flood-filter]').forEach(button => {
    const active = isFlood && floodHazardOverlayMode === button.dataset.floodFilter;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });

  if (hint) {
    const overlayConfig = getFloodOverlayConfig(floodHazardOverlayMode);
    hint.textContent = overlayConfig.focusVar
      ? `${overlayConfig.label} highlighted. Click again to show all.`
      : 'All levels shown. Click one to highlight it.';
  }
}

function isTypingTarget(node) {
  if (!node) return false;
  const tag = node.tagName;
  return node.isContentEditable
    || tag === 'INPUT'
    || tag === 'TEXTAREA';
}

document.addEventListener('keydown', event => {
  // tutorial.js already handled it (Escape closing the tutorial).
  if (event.defaultPrevented) return;
  const key = typeof event.key === 'string' ? event.key : '';

  if ((event.ctrlKey || event.metaKey) && key.toLowerCase() === 'b' && !event.altKey) {
    if (isTypingTarget(event.target)) return;
    event.preventDefault();
    toggleSetupSidebar();
    return;
  }

  if (key !== 'Escape') return;

  // Topmost first: dialogs, then an open "Choose on Map" menu, then pinning,
  // then the mobile setup/results panel (lowest priority: if a pin is
  // actively being placed, Esc backs out of that first -- a second press
  // then closes the panel).
  if (document.getElementById('emergencyContactModal')?.hidden === false) {
    event.preventDefault();
    closeEmergencyContactModal();
  } else if (document.getElementById('routeListModal')?.hidden === false) {
    event.preventDefault();
    closeRouteListModal();
  } else if (PIN_ROLES.some(role => document.getElementById(`${role}PinMenu`)?.hidden === false)) {
    event.preventDefault();
    closePinMenus();
  } else if (pinPlacementRole) {
    event.preventDefault();
    cancelPinPlacement();
  } else if (MOBILE_PANEL_QUERY.matches) {
    const shell = document.getElementById('appShell');
    if (shell && (!shell.classList.contains('sidebar-collapsed') || shell.classList.contains('safety-open'))) {
      event.preventDefault();
      closeWorkspaceDrawers();
    }
  }
});

// Fields are only ever locked while the ACO is actually crunching a run --
// once results come back, everything above (hazard/start/end) stays live so
// the visitor can tweak the setup and rerun without leaving the page.
function isSimulationInteractionLocked() {
  return simulationInProgress;
}

function syncSimulationConfigLock() {
  const interactionLocked = isSimulationInteractionLocked();

  document.querySelectorAll('.hazard-card').forEach(card => {
    card.classList.toggle('interaction-locked', interactionLocked);
  });

  // changeHazardBtn/changeRouteBtn are deliberately left out of this list:
  // syncWorkflowSummaries() (called via advanceStep() right before this on
  // every lock-state change) already recomputes their disabled state fresh
  // from isSimulationInteractionLocked() on every call, so running them
  // through the save/restore dance below too just races with that and can
  // leave them stuck disabled after the lock clears. The pin fields and
  // markers are likewise recomputed from state each time.
  syncRoutePinFields();
  syncRoutePinMarkers();

  ['showEvacBtn', 'runBtn']
    .forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;

      if (interactionLocked) {
        if (!Object.prototype.hasOwnProperty.call(el.dataset, 'lockPrevDisabled')) {
          el.dataset.lockPrevDisabled = el.disabled ? '1' : '0';
        }
        el.disabled = true;
        return;
      }

      if (Object.prototype.hasOwnProperty.call(el.dataset, 'lockPrevDisabled')) {
        el.disabled = el.dataset.lockPrevDisabled === '1';
        delete el.dataset.lockPrevDisabled;
      }

      if (id === 'runBtn') {
        el.disabled = backendSimulationBusy || !canRunCurrentSimulation();
      }
    });

  ['changeRunBtn', 'resetBtn'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.disabled = simulationInProgress;
  });
}

function setSimulationInProgress(running) {
  simulationInProgress = !!running;
  if (simulationInProgress) cancelPinPlacement();
  advanceStep(getMaxReachableStep());
  syncSimulationConfigLock();
}

function setLoaderProgress(percent) {
  const loaderBar = document.getElementById('loaderBar');
  const loaderPct = document.getElementById('loaderPct');
  const loaderProgress = document.getElementById('loaderProgress');
  const clamped = Math.max(0, Math.min(percent, 100));

  if (!loaderBar) return;
  loaderBar.style.width = `${clamped}%`;

  if (loaderPct) {
    loaderPct.textContent = `${Math.round(clamped)}%`;
  }

  if (loaderProgress) {
    loaderProgress.setAttribute('aria-valuenow', String(Math.round(clamped)));
    loaderProgress.style.setProperty('--progress', String(clamped));
  }
}

function stepLoaderProgress() {
  loaderState.frameId = null;
  const delta = loaderState.target - loaderState.current;

  if (Math.abs(delta) < 0.35) {
    loaderState.current = loaderState.target;
    setLoaderProgress(loaderState.current);
    return;
  }

  loaderState.current += delta * 0.18 + Math.sign(delta) * 0.35;
  loaderState.current = Math.max(0, Math.min(loaderState.current, 100));
  setLoaderProgress(loaderState.current);
  loaderState.frameId = window.requestAnimationFrame(stepLoaderProgress);
}

function updateLoaderProgress(percent, options = {}) {
  const { immediate = false } = options;
  const clamped = Math.max(0, Math.min(percent, 100));
  loaderState.target = clamped;

  if (immediate) {
    if (loaderState.frameId) {
      window.cancelAnimationFrame(loaderState.frameId);
      loaderState.frameId = null;
    }
    loaderState.current = clamped;
    setLoaderProgress(clamped);
    return;
  }

  if (!loaderState.frameId) {
    loaderState.frameId = window.requestAnimationFrame(stepLoaderProgress);
  }
}

function setLoaderTitle(message) {
  const loaderTitle = document.getElementById('loaderTitle');
  if (loaderTitle) {
    loaderTitle.textContent = message;
  }
}

function getLoaderModeLabel() {
  const hazardLabel = String(selectedHazard || '').trim();
  if (!hazardLabel) {
    return 'Route';
  }

  if (hazardLabel.toLowerCase() === 'earthquake') {
    return 'Earthquake';
  }

  if (hazardLabel.toLowerCase() === 'flood') {
    return 'Flood';
  }

  return hazardLabel;
}

function syncLoaderContext() {
  const modeLabel = getLoaderModeLabel();
  const loaderKicker = document.getElementById('loaderKicker');
  const loaderVisual = document.getElementById('loaderVisual');
  const loaderProgress = document.getElementById('loaderProgress');
  const hazardKey = String(selectedHazard || '').trim().toLowerCase();

  if (loaderKicker) {
    loaderKicker.textContent = modeLabel === 'Route' ? 'Loading' : `${modeLabel} routing`;
  }

  if (loaderVisual) {
    loaderVisual.classList.remove('loader-visual--flood', 'loader-visual--earthquake');
    if (hazardKey === 'flood' || hazardKey === 'earthquake') {
      loaderVisual.classList.add(`loader-visual--${hazardKey}`);
    }
  }

  if (loaderProgress) {
    loaderProgress.classList.remove('loader-progress--flood', 'loader-progress--earthquake');
    if (hazardKey === 'flood' || hazardKey === 'earthquake') {
      loaderProgress.classList.add(`loader-progress--${hazardKey}`);
    }
  }
}

function initLoaderGraphPulses() {
  const group = document.querySelector('.loader-graph .loader-edges');
  if (!group) return;

  const bases = Array.from(group.querySelectorAll('.loader-edge'));
  bases.forEach((edge, i) => {
    const pulse = edge.cloneNode();
    pulse.classList.remove('loader-edge');
    pulse.classList.add('loader-edge-pulse');
    pulse.style.animationDelay = `${(i * 0.37) % 3}s`;
    group.appendChild(pulse);
  });
}

function getLoaderStageCopy(stageId = '') {
  switch (stageId) {
    case 'ready':
      return { title: 'Checking your choices' };
    case 'load':
      return { title: 'Loading road and area details' };
    case 'route':
      return { title: 'Looking for route options' };
    case 'review':
      return { title: 'Preparing the results' };
    case 'draw':
      return { title: 'Showing the results' };
    case 'complete':
      return { title: 'Results are ready' };
    case 'stopped':
      return { title: "We couldn't finish this request" };
    default:
      return null;
  }
}

function setLoaderStep(stageIdOrTitle, progress, options = {}) {
  const { stageId = '', title: overrideTitle = '' } = options;
  const resolvedStageId = stageId || stageIdOrTitle;
  const stageCopy = getLoaderStageCopy(resolvedStageId);
  const title = overrideTitle || stageCopy?.title || stageIdOrTitle;

  setLoaderTitle(title);
  updateLoaderProgress(progress, options);
}

function resetLoaderState() {
  if (loaderState.frameId) {
    window.cancelAnimationFrame(loaderState.frameId);
    loaderState.frameId = null;
  }

  loaderState.current = 0;
  loaderState.target = 0;
  syncLoaderContext();
  setLoaderTitle('Loading routes');
  updateLoaderProgress(0, { immediate: true });
}

function initMap() {
  // Leaflet's touch handling already lets one finger drag/pinch the map on
  // every device (no "page becomes scrollable" quirk to work around here),
  // so there's no gestureHandling-style option needed.
  gMap = L.map('map', {
    center: [14.5590, 121.0955],
    zoom: 15,
    zoomControl: false,
    // Defaults snap to whole zoom levels (zoomSnap:1), which makes both
    // the +/- buttons and scroll-wheel zoom feel like discrete jumps.
    // Fractional levels let it ease to a smooth in-between stop instead.
    zoomSnap: 0.25,
    zoomDelta: 0.5,
    wheelPxPerZoomLevel: 100,
  });

  const streetLayer = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  }).addTo(gMap);

  const satelliteLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    // Esri has imagery here only up to zoom 19; its zoom-20 tiles are a
    // grey "Map data not yet available" placeholder. Past 19, Leaflet
    // enlarges the zoom-19 tiles instead of requesting those.
    maxNativeZoom: 19,
    maxZoom: 20,
    attribution: 'Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community',
  });

  L.control.zoom({ position: 'topright' }).addTo(gMap);
  gMap.on('click', onMapClickForPin);
  // Route widths are zoom-scaled (getRouteZoomScale); re-apply them so a
  // zoomed-in route doesn't shrink to a thin line lost in the hazard fills.
  gMap.on('zoomend', syncRouteFocusStyles);
  // collapsed:false keeps the Map/Satellite choice always visible instead of
  // hiding it behind Leaflet's default collapsed icon (a hover-to-reveal
  // layers glyph that doesn't render here since this page never loads
  // Leaflet's marker/layers image sprites, only its CSS/JS).
  L.control.layers({ 'Map': streetLayer, 'Satellite': satelliteLayer }, null, { position: 'topright', collapsed: false }).addTo(gMap);

  // The focused route's marching dash (createRoutePreview) animates for as
  // long as a route is selected. On mobile the map often scrolls out of view
  // below the results, so pause it there instead of repainting an offscreen
  // map every frame.
  if ('IntersectionObserver' in window) {
    const mapEl = document.getElementById('map');
    const mapViewportObserver = new IntersectionObserver((entries) => {
      mapEl.classList.toggle('route-flow-paused', !entries[entries.length - 1].isIntersecting);
    }, { threshold: 0 });
    mapViewportObserver.observe(mapEl);
  }

  // window 'resize' alone misses container-size changes that don't resize
  // the window itself -- the setup sidebar collapsing, the results panel
  // opening, a breakpoint's layout swapping in, a drawer/sheet opening --
  // and a media-query change event fires too early, while the panel is
  // still mid-transition. Watching the map's own box with ResizeObserver
  // instead catches all of those in one place, debounced so a CSS
  // transition's many intermediate sizes collapse into one
  // invalidateSize() once it settles.
  let mapResizeDebounceTimer = null;
  const mapResizeObserver = new ResizeObserver(() => {
    clearTimeout(mapResizeDebounceTimer);
    mapResizeDebounceTimer = window.setTimeout(() => {
      if (!gMap) return;
      // Leaflet caches its container size, so any of the above (also
      // rotating the phone or toggling the browser's mobile address bar)
      // needs this explicit nudge or the map keeps the old dimensions and
      // shows blank/cropped tiles.
      gMap.invalidateSize();
      refitMapToCurrentRoute();
    }, 150);
  });
  mapResizeObserver.observe(document.getElementById('map'));

  window.addEventListener('resize', syncMapOverlayLayout);
  startApp();
}

// Re-fits the map to whatever route is currently on screen, with the same
// overlay-aware padding used right after a run (getMapFitPadding) -- called
// after invalidateSize() so a panel/drawer/sheet opening or closing, or a
// breakpoint change, doesn't leave the route sitting under the setup panel,
// the results panel, or the map's own overlay chips.
function refitMapToCurrentRoute() {
  if (!gMap || !simData || !Array.isArray(simData.routes) || !simData.routes.length) return;

  const bestRoute = getBestRoute(simData.routes);
  const routeCoords = getRoutePoints(bestRoute);
  if (!routeCoords.length) return;

  const isEarthquakeResult = isEarthquakeSimulationResult(simData);
  const pinCoords = normalizePathCoordinates([
    getReadyPin('start'),
    isEarthquakeResult ? null : getReadyPin('end'),
    { lat: bestRoute?.destination_lat, lng: bestRoute?.destination_lng },
  ].filter(Boolean));

  gMap.fitBounds(L.latLngBounds([...routeCoords, ...pinCoords]), getMapFitPadding());
}

async function startApp() {
  await checkBackend();

  if (!isBackendLive) {
    document.getElementById('statusTxt').textContent = 'Backend Offline';
    const emptyMapTxt = document.getElementById('emptyMapTxt');
    if (emptyMapTxt) {
      document.getElementById('emptyMapIcon').innerHTML = '&#128506;';
      emptyMapTxt.textContent = 'Backend offline — reload once it is running.';
    }
    alert('Backend is not connected. Run the Flask backend first.');
    return;
  }

  await bootstrapBarangayFromUrl();
}

// The barangay picker no longer lives in this page -- the homepage's
// quick-start card sends the choice via ?barangay=... and this loads it
// immediately so the workflow opens straight on the "Disaster" step. With
// nothing in this page able to change barangay, a missing/unknown value
// means the visitor skipped the homepage picker, so send them back to it
// instead of stranding them on a workflow with no way to pick a scope.
async function bootstrapBarangayFromUrl() {
  const requested = new URLSearchParams(window.location.search).get('barangay') || '';

  if (!SUPPORTED_QUICKSTART_BARANGAYS.includes(requested)) {
    window.location.replace('/#heroBarangaySelector');
    return;
  }

  await selectBarangay(requested);
}

function clearRoutePreview(group) {
  if (!group) return;

  if (group.previewDotsLayer) {
    group.previewDotsLayer.remove();
    group.previewDotsLayer = null;
  }
}

function clearRouteAnimation() {
  const groups = Array.isArray(mapLayers.routeGroups) ? mapLayers.routeGroups : [];
  groups.forEach(clearRoutePreview);
}

function clearBoundaryLayers() {
  (mapLayers.boundaries || []).forEach(layer => layer.remove());
  mapLayers.boundaries = [];
}

function clearLayers() {
  clearRouteAnimation();
  clearBoundaryLayers();
  mapLayers.routes.forEach(layer => layer.remove());
  mapLayers = { boundaries: [], routes: [], routeGroups: [] };
  selectedRouteFocus = null;

  if (activeInfoWindow) {
    activeInfoWindow.remove();
    activeInfoWindow = null;
  }

  if (activeInfoWindowRef.current) {
    activeInfoWindowRef.current.remove();
    activeInfoWindowRef.current = null;
  }

  if (window.earthquakeUI?.reset) {
    window.earthquakeUI.reset();
  }

  if (window.floodHazardUI?.reset) {
    window.floodHazardUI.reset();
  }
}

function clearRenderedRoutesOnly() {
  clearRouteAnimation();
  mapLayers.routes.forEach(layer => layer.remove());
  mapLayers.routes = [];
  mapLayers.routeGroups = [];
  selectedRouteFocus = null;

  if (activeInfoWindowRef.current) {
    activeInfoWindowRef.current.remove();
    activeInfoWindowRef.current = null;
  }
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDistanceCompact(distanceMeters, fallback = 'N/A') {
  const numericDistance = Number(distanceMeters);
  if (!Number.isFinite(numericDistance)) {
    return fallback;
  }

  if (Math.abs(numericDistance) < 1000) {
    return `${Math.round(numericDistance)} m`;
  }

  return `${(numericDistance / 1000).toFixed(2)} km`;
}

// Every route here is walked (GRAPH_NETWORK_TYPE is 'walk' on the backend),
// so one average walking pace works for both flood and earthquake results.
const WALKING_SPEED_METERS_PER_MINUTE = 5000 / 60; // 5 km/h

function formatWalkingDuration(distanceMeters, fallback = 'N/A') {
  const numericDistance = Number(distanceMeters);
  if (!Number.isFinite(numericDistance) || numericDistance < 0) {
    return fallback;
  }

  const totalMinutes = numericDistance / WALKING_SPEED_METERS_PER_MINUTE;
  if (totalMinutes < 1) {
    return '< 1 min';
  }

  if (totalMinutes < 60) {
    return `${Math.round(totalMinutes)} min`;
  }

  const hours = Math.floor(totalMinutes / 60);
  const minutes = Math.round(totalMinutes % 60);
  return minutes > 0 ? `${hours} hr ${minutes} min` : `${hours} hr`;
}

// The map label on a route line (see bindRouteEtaLabel in osm.js): walking
// time over distance, like a map app's route bubble.
function buildRouteEtaLabel(route) {
  const duration = route?.display_duration || formatWalkingDuration(route?.distance, '');
  if (!duration) return '';
  const category = ['best', 'available', 'eliminated'].includes(route?.category) ? route.category : 'eliminated';
  return `<div class="route-eta route-eta--${category}">
    ${safetyIcon('walk')}
    <div class="route-eta-text"><strong>${escapeHtml(duration)}</strong><span>${escapeHtml(route?.display_distance || '')}</span></div>
  </div>`;
}

function formatFloodClasses(route) {
  const vars = Array.isArray(route?.flood_vars_encountered) ? route.flood_vars_encountered : [];
  const labels = [...new Set(vars.map(value => getFloodRiskLabelFromVar(value)))];
  return labels.length ? labels.join(', ') : 'None';
}

function getFloodRiskLabelFromVar(varValue) {
  switch (Number(varValue)) {
    case 3:
      return 'High';
    case 2:
      return 'Moderate';
    case 1:
    default:
      return 'Low';
  }
}

function getRiskLevelLabelFromScore(hazardValue) {
  const numericHazard = Number(hazardValue);
  if (!Number.isFinite(numericHazard)) return 'Unknown';
  if (numericHazard >= 5) return 'High';
  if (numericHazard >= 3) return 'Moderate';
  return 'Low';
}

function formatFloodPeakRisk(route) {
  const vars = Array.isArray(route?.flood_vars_encountered) ? route.flood_vars_encountered : [];
  if (vars.length) {
    return getFloodRiskLabelFromVar(Math.max(...vars));
  }

  return getRiskLevelLabelFromScore(route?.max_hazard);
}

// The source flood layers only carry a Low/Moderate/High class (Var 1/2/3),
// not a measured depth, so these are typical/representative ranges for each
// class rather than a per-location reading.
const FLOOD_DEPTH_RANGE_BY_VAR = {
  1: '0.1–0.5 m',
  2: '0.5–1.0 m',
  3: '1.0 m+',
};

function getFloodDepthRangeFromVar(varValue) {
  return FLOOD_DEPTH_RANGE_BY_VAR[Number(varValue)] || FLOOD_DEPTH_RANGE_BY_VAR[1];
}

function getFloodDepthRangeFromHazard(hazardValue) {
  const numericHazard = Number(hazardValue);
  if (!Number.isFinite(numericHazard)) return 'Unknown';
  if (numericHazard >= 5) return FLOOD_DEPTH_RANGE_BY_VAR[3];
  if (numericHazard >= 3) return FLOOD_DEPTH_RANGE_BY_VAR[2];
  return FLOOD_DEPTH_RANGE_BY_VAR[1];
}

function getFloodPeakDepthRange(route) {
  const vars = Array.isArray(route?.flood_vars_encountered) ? route.flood_vars_encountered : [];
  if (vars.length) {
    return getFloodDepthRangeFromVar(Math.max(...vars));
  }

  return getFloodDepthRangeFromHazard(route?.max_hazard);
}

function formatFloodPeakRiskWithHazard(route) {
  return `${formatFloodPeakRisk(route)} (${getFloodPeakDepthRange(route)})`;
}

// One shared "peak severity" label for the map popup, regardless of hazard
// type -- mirrors the wording used in the route safety panel.
function formatRoutePeakRiskLabel(route) {
  return isEarthquakeRouteRecord(route)
    ? getRiskLevelLabelFromScore(route?.max_hazard)
    : formatFloodPeakRiskWithHazard(route);
}

// The "peak" row of the route safety panel and the PDF report.
function getPeakRiskRow(route, isEarthquake) {
  return isEarthquake
    ? { label: 'Peak road risk crossed', value: `${getRiskLevelLabelFromScore(route?.max_hazard)} road risk` }
    : { label: 'Peak flood level crossed', value: formatFloodPeakRiskWithHazard(route) };
}

function formatEarthquakeHazardSummary(route) {
  const maxima = route?.hazard_maxima || {};
  if (maxima.liquefaction == null && maxima.ground_shaking == null) {
    return 'N/A';
  }

  return `Liquefaction: ${getRiskLevelLabelFromScore(maxima.liquefaction)}, `
    + `Ground shaking: ${getRiskLevelLabelFromScore(maxima.ground_shaking)}`;
}

function getFloodOverlayConfig(mode = floodHazardOverlayMode) {
  return FLOOD_OVERLAY_VIEWS[mode] || FLOOD_OVERLAY_VIEWS.none;
}

function isEarthquakeRouteRecord(route) {
  return route?.simulation_mode === 'earthquake';
}

function formatRoadPartCountLabel(count) {
  const numericCount = Number(count || 0);
  return `${numericCount} road part${numericCount === 1 ? '' : 's'}`;
}

function buildRouteStreetSummary(route) {
  const streetNames = Array.isArray(route?.street_path)
    ? route.street_path.map(name => String(name).trim()).filter(Boolean)
    : [];

  if (!streetNames.length) {
    return route?.path_label || 'Route summary unavailable';
  }

  const visible = streetNames.slice(0, 3);
  const suffix = streetNames.length > 3 ? ` +${streetNames.length - 3} more roads` : '';
  return `Via ${visible.join(', ')}${suffix}`;
}

function buildRouteReason(route) {
  const isEarthquakeRoute = isEarthquakeRouteRecord(route);
  const unsafeSections = Number(route?.threshold_exceedance_count || 0);
  const destinationNote = isEarthquakeRoute && route?.destination_name
    ? ` to ${route.destination_name}`
    : '';

  if (route?.category === 'eliminated') {
    // The backend labels the top eliminated route "Best" only when no route is safe.
    if (route?.status === 'Best') {
      return unsafeSections > 0
        ? `Best backup route${destinationNote}, but ${formatRoadPartCountLabel(unsafeSections)} ${unsafeSections === 1 ? 'is' : 'are'} above the safety limit.`
        : `Best backup route${destinationNote}, but some road parts are above the safety limit.`;
    }

    return unsafeSections > 0
      ? `Not recommended${destinationNote}. ${formatRoadPartCountLabel(unsafeSections)} ${unsafeSections === 1 ? 'is' : 'are'} above the safety limit.`
      : isEarthquakeRoute
      ? `Not recommended${destinationNote} because some road parts have high earthquake risk.`
      : 'Not recommended because some road parts have high flood risk.';
  }

  if (route?.category === 'best') {
    return isEarthquakeRoute && route?.destination_name
      ? `Best route to ${route.destination_name}. It is the top choice in this result.`
      : 'Best route. It is the top choice in this result.';
  }

  if (route?.category === 'available') {
    return 'Available route, but another option is a better match in this result.';
  }

  return route?.reason || 'Route explanation unavailable.';
}

function getUserFriendlyRankingExplanation() {
  return 'The safest routes are shown first. If two routes have similar risk, the system checks which one it prefers, then looks at distance.';
}

// Display strings used by the map popups, the route safety panel, the route
// list and the PDF report.
function decorateRouteForDisplay(route) {
  return {
    ...route,
    display_distance: formatDistanceCompact(route?.distance),
    display_duration: formatWalkingDuration(route?.distance),
    display_unsafe_distance: formatDistanceCompact(route?.unsafe_distance, '0 m'),
    display_flood_classes: formatFloodClasses(route),
    display_route_summary: buildRouteStreetSummary(route),
    display_reason: buildRouteReason(route),
    display_unsafe_segment_count: Number(route?.threshold_exceedance_count || 0),
  };
}

function decorateRoutesForDisplay(routes) {
  return routes.map(route => decorateRouteForDisplay(route));
}

function getCurrentSelections() {
  return {
    barangay: selectedBarangay,
    hazard: selectedHazard,
    start: getReadyPin('start')?.label || '',
    end: getReadyPin('end')?.label || '',
  };
}

async function parseBackendJsonResponse(res) {
  const contentType = (res.headers.get('content-type') || '').toLowerCase();

  if (contentType.includes('application/json')) {
    return await res.json();
  }

  const rawText = await res.text();
  const trimmedText = rawText.trim();
  throw new Error(
    trimmedText
      ? `Unexpected server response: ${trimmedText.slice(0, 180)}`
      : `Unexpected server response (${res.status})`
  );
}

async function postJsonWithTimeout(endpoint, payload, timeoutMs) {
  const controller = new AbortController();
  let timedOut = false;
  const timeoutId = window.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  try {
    const response = await fetch(window.BACKEND_BASE + endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const data = await parseBackendJsonResponse(response);
    return { response, data };
  } catch (error) {
    if (timedOut || controller.signal.aborted) {
      const timeoutError = new Error(`Request timed out after ${Math.ceil(timeoutMs / 1000)} seconds.`);
      timeoutError.name = 'RequestTimeoutError';
      timeoutError.timeoutMs = timeoutMs;
      timeoutError.endpoint = endpoint;
      throw timeoutError;
    }
    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

function isRequestTimeoutError(error) {
  return error?.name === 'RequestTimeoutError'
    || error?.name === 'AbortError'
    || /signal is aborted without reason/i.test(error?.message || '');
}

function buildBackendRequestError(response, data, fallbackMessage) {
  const error = new Error(data?.message || fallbackMessage);
  error.statusCode = response?.status || 0;
  error.backendCode = data?.code || '';
  error.backendStatus = data?.status || null;
  return error;
}

function isBackendSimulationBusyError(error) {
  return error?.backendCode === 'simulation_busy' || error?.statusCode === 429;
}

function stopBackendSimulationBusyPolling() {
  if (backendBusyPollTimer) {
    window.clearInterval(backendBusyPollTimer);
    backendBusyPollTimer = null;
  }
}

function setBackendSimulationBusyState(busy, status = null) {
  backendSimulationBusy = !!busy;
  backendSimulationStatus = backendSimulationBusy ? (status || backendSimulationStatus || {}) : null;

  if (!backendSimulationBusy) {
    stopBackendSimulationBusyPolling();
  }

  const statusTxt = document.getElementById('statusTxt');
  if (statusTxt && !simulationInProgress) {
    if (backendSimulationBusy) {
      statusTxt.textContent = 'Backend Busy';
    } else if (isBackendLive) {
      statusTxt.textContent = 'Backend Connected';
    }
  }

  syncSimulationConfigLock();
  syncWorkflowSummaries();
  syncRouteInfoBox();
}

async function fetchBackendSimulationStatus() {
  const response = await fetch(window.BACKEND_BASE + '/simulation-status');
  const data = await parseBackendJsonResponse(response);

  if (!response.ok || data?.error === true) {
    throw buildBackendRequestError(
      response,
      data,
      'Failed to read backend simulation status.'
    );
  }

  return data?.status || { busy: false };
}

async function refreshBackendSimulationStatus() {
  if (!isBackendLive) {
    setBackendSimulationBusyState(false);
    return null;
  }

  try {
    const status = await fetchBackendSimulationStatus();
    setBackendSimulationBusyState(!!status?.busy, status);
    return status;
  } catch (error) {
    return null;
  }
}

function stopLoaderProgressPolling() {
  if (loaderProgressPollTimer) {
    window.clearInterval(loaderProgressPollTimer);
    loaderProgressPollTimer = null;
  }
}

function startLoaderProgressPolling() {
  stopLoaderProgressPolling();

  loaderProgressPollTimer = window.setInterval(async () => {
    if (!isBackendLive) return;

    try {
      const status = await fetchBackendSimulationStatus();
      const percent = status?.progress?.percent;
      if (status?.busy && typeof percent === 'number') {
        const [lo, hi] = LOADER_ROUTE_STAGE_RANGE;
        const clamped = Math.max(0, Math.min(100, percent));
        updateLoaderProgress(lo + (clamped / 100) * (hi - lo));
      }
    } catch (err) {
      // Transient poll failure - leave the loader at its last known value.
    }
  }, LOADER_PROGRESS_POLL_MS);
}

function startBackendSimulationBusyPolling() {
  if (backendBusyPollTimer) {
    return;
  }

  backendBusyPollTimer = window.setInterval(async () => {
    const status = await refreshBackendSimulationStatus();
    if (status && !status.busy) {
      stopBackendSimulationBusyPolling();
    }
  }, BACKEND_SIMULATION_STATUS_POLL_MS);
}

async function syncBackendBusyStateAfterRequestError(error) {
  if (isBackendSimulationBusyError(error)) {
    setBackendSimulationBusyState(true, error.backendStatus || backendSimulationStatus);
    startBackendSimulationBusyPolling();
    return;
  }

  if (isRequestTimeoutError(error)) {
    const status = await refreshBackendSimulationStatus();
    if (status?.busy) {
      startBackendSimulationBusyPolling();
    }
  }
}

function formatTimeoutForHumans(timeoutMs) {
  const totalSeconds = Math.max(1, Math.ceil(timeoutMs / 1000));
  if (totalSeconds < 60) {
    return `${totalSeconds} second${totalSeconds === 1 ? '' : 's'}`;
  }

  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (!seconds) {
    return `${minutes} minute${minutes === 1 ? '' : 's'}`;
  }

  return `${minutes}m ${seconds}s`;
}

function shouldRetrySimulationRequest(error, statusCode) {
  if (statusCode >= 500) return true;
  if (!error) return false;
  if (isRequestTimeoutError(error)) return false;

  return /Failed to fetch/i.test(error.message || '')
    || /NetworkError/i.test(error.message || '')
    || /Unexpected server response/i.test(error.message || '');
}

// POSTs one simulation (flood: /simulate, earthquake: /earthquake/simulate),
// retrying once on a network hiccup or 5xx. `label` names the run in errors.
async function sendRoutingRequest(endpoint, payload, label) {
  let lastError = null;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    let statusCode = 0;

    try {
      const { response, data } = await postJsonWithTimeout(
        endpoint,
        payload,
        SIMULATION_REQUEST_TIMEOUT_MS
      );
      statusCode = response.status;

      if (!response.ok || data?.error === true) {
        throw buildBackendRequestError(response, data, `${label} failed`);
      }

      return data;
    } catch (error) {
      lastError = error;

      if (attempt === 1 || !shouldRetrySimulationRequest(error, statusCode)) {
        break;
      }

      await new Promise(resolve => window.setTimeout(resolve, 450));
    }
  }

  if (isRequestTimeoutError(lastError)) {
    throw new Error(
      `${label} took longer than ${formatTimeoutForHumans(SIMULATION_REQUEST_TIMEOUT_MS)} in the browser and was stopped. The backend may still be finishing that run, so wait until it clears before starting another one.`
    );
  }

  throw lastError || new Error(`${label} failed`);
}

function isEarthquakeMode(hazard = selectedHazard) {
  return hazard === 'Earthquake';
}

function normalizeEarthquakeBarangayName(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/\./g, ' ')
    .replace(/\s+/g, ' ');
}

function isEarthquakeBarangaySupported(barangay = selectedBarangay) {
  return EARTHQUAKE_SUPPORTED_BARANGAY_KEYS.has(normalizeEarthquakeBarangayName(barangay));
}

function isEarthquakeSimulationResult(result = simData) {
  return result?.simulation_mode === 'earthquake';
}

function getActiveEarthquakeViewData(result = simData) {
  if (!isEarthquakeSimulationResult(result)) {
    return null;
  }

  return result?.views?.[activeEarthquakeView] || result?.views?.overall || null;
}

function setRunButtonLabel() {
  const runBtn = document.getElementById('runBtn');
  if (!runBtn) return;

  runBtn.textContent = isEarthquakeMode() ? 'Run Earthquake Simulation' : 'Run Simulation';
}

function resetEarthquakeState() {
  earthquakeEvacSites = [];
  earthquakeEvacSitesVisible = false;
  activeEarthquakeView = 'overall';
  window.earthquakeUI?.reset();
}

function getReadyPin(role) {
  const pin = routePins[role];
  return pin && pin.status === 'ready' ? pin : null;
}

function getActivePinRoles() {
  return isEarthquakeMode() ? ['start'] : PIN_ROLES;
}

function canRunFloodSimulation() {
  return !!(selectedHazard === 'Flood' && getReadyPin('start') && getReadyPin('end'));
}

function canRunEarthquakeSimulation() {
  return !!(
    isEarthquakeMode()
    && isEarthquakeBarangaySupported()
    && getReadyPin('start')
    && earthquakeEvacSitesVisible
  );
}

function canRunCurrentSimulation() {
  return isEarthquakeMode()
    ? canRunEarthquakeSimulation()
    : canRunFloodSimulation();
}

function formatPinCoordinates(pin) {
  return `${Number(pin.lat).toFixed(5)}, ${Number(pin.lng).toFixed(5)}`;
}

function buildPinLabel(role, street, roadDistance) {
  if (!street) return PIN_ROLE_COPY[role].fallbackLabel;
  return Number(roadDistance) <= PIN_ON_STREET_METERS ? street : `Near ${street}`;
}

// The route payload for one pin; the label is what the backend echoes back
// as result.start / result.end and into each route's path_label.
function buildPinRequestPoint(role) {
  const pin = getReadyPin(role);
  return pin ? { lat: pin.lat, lng: pin.lng, label: pin.label } : null;
}

function canPlaceRoutePins() {
  return !!(
    gMap
    && selectedBarangay
    && selectedHazard
    && !isSimulationInteractionLocked()
    && (!isEarthquakeMode() || isEarthquakeBarangaySupported())
  );
}

function getNextUnpinnedRole() {
  return getActivePinRoles().find(role => !routePins[role]) || null;
}

// Ray-casting point-in-polygon over the boundary's exterior rings. With no
// rings loaded it defers to the backend, which always checks coverage itself.
function isPointInsideBarangay(lat, lng) {
  if (!barangayBoundaryRings.length) return true;

  return barangayBoundaryRings.some(ring => {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const a = ring[i];
      const b = ring[j];
      if ((a.lat > lat) !== (b.lat > lat)
        && lng < ((b.lng - a.lng) * (lat - a.lat)) / (b.lat - a.lat) + a.lng) {
        inside = !inside;
      }
    }
    return inside;
  });
}

function syncPinHint() {
  const hint = document.getElementById('mapPinHint');
  const text = document.getElementById('mapPinHintText');
  const closeBtn = document.getElementById('mapPinHintClose');
  if (!hint || !text) return;

  const message = pinHintMessage?.text
    || (pinPlacementRole ? PIN_ROLE_COPY[pinPlacementRole].hint : '');
  hint.hidden = !message;
  hint.classList.toggle('is-error', !!pinHintMessage?.isError);
  text.textContent = message;
  if (closeBtn) closeBtn.hidden = !pinPlacementRole;
  syncMapOverlayLayout();
}

// An error stays up while the visitor is still placing a pin (they need it
// to pick a better spot) and fades on its own otherwise, e.g. after a
// rejected drag.
function showPinHintError(message) {
  window.clearTimeout(pinHintTimer);
  pinHintMessage = { text: message, isError: true };
  if (!pinPlacementRole) {
    pinHintTimer = window.setTimeout(() => {
      pinHintMessage = null;
      syncPinHint();
    }, PIN_HINT_ERROR_MS);
  }
  syncPinHint();
}

function clearPinHintError() {
  window.clearTimeout(pinHintTimer);
  pinHintMessage = null;
}

function setPinPlacementRole(role) {
  const nextRole = role && canPlaceRoutePins() && getActivePinRoles().includes(role) ? role : null;
  const changed = nextRole !== pinPlacementRole;
  pinPlacementRole = nextRole;
  // Done or cancelled: drop a "Change" focus so the workflow moves on to
  // whatever step is next instead of leaving the route card pinned open.
  if (changed && !nextRole) workflowFocusSection = null;
  syncPinHint();
  // Re-sync the workflow cards too: the route card stays open while placing.
  if (changed) {
    advanceStep(getMaxReachableStep());
    syncRouteInfoBox();
  } else {
    syncRoutePinFields();
  }
}

function closePinMenus() {
  PIN_ROLES.forEach(role => {
    const menu = document.getElementById(`${role}PinMenu`);
    if (menu) menu.hidden = true;
    document.getElementById(`${role}PinBtn`)?.setAttribute('aria-expanded', 'false');
  });
}

// Input onclick: open (or close) its "Choose on Map" menu.
function togglePinMenu(role) {
  const menu = document.getElementById(`${role}PinMenu`);
  if (!menu || !canPlaceRoutePins()) return;

  const opening = menu.hidden;
  closePinMenus();
  if (!opening) return;

  menu.hidden = false;
  document.getElementById(`${role}PinBtn`)?.setAttribute('aria-expanded', 'true');
  menu.querySelector('.pin-input-menu-item')?.focus({ preventScroll: true });
}

// Zooms to street level so the visitor can tap an exact spot: around the
// pin being moved, else the other pin, else wherever they've already panned
// to inside the barangay, else the barangay's center.
function zoomMapForPinPlacement(role) {
  if (!gMap) return;

  const anchor = routePins[role] || routePins[role === 'start' ? 'end' : 'start'];
  const viewCenter = gMap.getCenter();
  const target = anchor
    ? L.latLng(anchor.lat, anchor.lng)
    : isPointInsideBarangay(viewCenter.lat, viewCenter.lng) || !barangayBoundaryRings.length
    ? viewCenter
    : L.latLngBounds(barangayBoundaryRings.flat()).getCenter();
  const zoom = Math.max(gMap.getZoom(), PIN_PLACEMENT_ZOOM);

  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
    gMap.setView(target, zoom);
  } else {
    gMap.flyTo(target, zoom, { duration: 0.7 });
  }
}

// Menu's "Choose on Map": the next map tap places this pin.
function chooseOnMap(role) {
  closePinMenus();
  if (!canPlaceRoutePins()) return;

  clearPinHintError();
  setPinPlacementRole(role);
  closeMobilePanelForMapInteraction();
  zoomMapForPinPlacement(role);
}

// Mobile only: the setup panel covers the whole screen there, so it has to
// get out of the way for the map to actually be tappable, same as
// desktop/tablet already let you tap it beside the always-visible/docked
// setup panel.
function closeMobilePanelForMapInteraction() {
  if (!MOBILE_PANEL_QUERY.matches) return;
  const shell = document.getElementById('appShell');
  if (shell && !shell.classList.contains('sidebar-collapsed')) {
    applySetupSidebarState(true);
  }
}

function cancelPinPlacement() {
  closePinMenus();
  clearPinHintError();
  setPinPlacementRole(null);
}

function syncRoutePinFields() {
  const locked = isSimulationInteractionLocked();

  PIN_ROLES.forEach(role => {
    const row = document.getElementById(`${role}Field`);
    const input = document.getElementById(`${role}PinBtn`);
    const value = document.getElementById(`${role}PinValue`);
    const meta = document.getElementById(`${role}PinMeta`);
    if (!row || !input || !value || !meta) return;

    const pin = routePins[role];
    input.disabled = locked || !canPlaceRoutePins();
    if (input.disabled) {
      document.getElementById(`${role}PinMenu`)?.setAttribute('hidden', '');
      input.setAttribute('aria-expanded', 'false');
    }
    row.classList.toggle('is-placing', pinPlacementRole === role);
    row.classList.toggle('is-set', !!pin);

    value.textContent = pin?.status === 'checking'
      ? 'Checking this spot…'
      : pin?.label || PIN_ROLE_COPY[role].empty;
    meta.hidden = !pin;
    meta.textContent = pin ? formatPinCoordinates(pin) : '';
    input.title = pin ? `${pin.label || PIN_ROLE_COPY[role].fallbackLabel} (${formatPinCoordinates(pin)})` : '';
  });

  document.getElementById('pinInputs')?.classList.toggle('is-single', isEarthquakeMode());

  // Shown while the route card is collapsed, so the pins stay readable.
  const summary = document.getElementById('summaryRoute');
  if (summary) {
    const start = getReadyPin('start')?.label;
    const end = getReadyPin('end')?.label;
    summary.textContent = !selectedHazard
      ? ''
      : isEarthquakeMode()
      ? (start ? `${start} → nearest reachable evacuation site` : 'Pin your location on the map.')
      : start && end
      ? `${start} → ${end}`
      : 'Pin your location and destination on the map.';
  }
}

function buildPinPopupContent(role) {
  const pin = routePins[role];
  const rows = [
    ['Role', PIN_ROLE_COPY[role].popupRole],
    ['Coordinates', formatPinCoordinates(pin)],
  ];
  if (Number.isFinite(pin.roadDistance)) {
    rows.push(['Nearest road', formatDistanceCompact(pin.roadDistance)]);
  }
  return infoPopup(pin.label || PIN_ROLE_COPY[role].fallbackLabel, rows);
}

// Creates, moves, or removes each role's map marker to match routePins.
// Markers stay draggable except while a simulation is running.
function syncRoutePinMarkers() {
  if (!gMap) return;

  const draggable = !isSimulationInteractionLocked();

  PIN_ROLES.forEach(role => {
    const pin = getActivePinRoles().includes(role) ? routePins[role] : null;
    let marker = routePinMarkers[role];

    if (!pin) {
      marker?.remove();
      routePinMarkers[role] = null;
      return;
    }

    if (!marker) {
      marker = L.marker({ lat: pin.lat, lng: pin.lng }, {
        zIndexOffset: role === 'start' ? 3600 : 3500,
        icon: makeRouteEndpointPinIcon(role),
        draggable: true,
        autoPan: true,
        keyboard: false,
      });
      marker.on('dragstart', () => {
        activeInfoWindow?.remove();
        activeInfoWindow = null;
      });
      marker.on('dragend', () => {
        const { lat, lng } = marker.getLatLng();
        placeRoutePin(role, lat, lng);
      });
      marker.on('click', () => {
        if (!routePins[role]) return;
        activeInfoWindow?.remove();
        // Top padding keeps the popup clear of the flood filter/lens chip
        // and zoom controls overlaid on the map's top edge.
        activeInfoWindow = L.popup({ offset: [0, -44], autoPanPaddingTopLeft: [16, 130] })
          .setLatLng(marker.getLatLng())
          .setContent(buildPinPopupContent(role))
          .openOn(gMap);
      });
      routePinMarkers[role] = marker;
    }

    marker.setLatLng({ lat: pin.lat, lng: pin.lng });
    if (!gMap.hasLayer(marker)) marker.addTo(gMap);
    marker.getElement()?.classList.toggle('route-pin-checking', pin.status === 'checking');
    marker.getElement()?.setAttribute('title', pin.label || PIN_ROLE_COPY[role].fallbackLabel);
    if (draggable) marker.dragging?.enable();
    else marker.dragging?.disable();
  });
}

function resetRoutePins() {
  PIN_ROLES.forEach(role => {
    routePins[role] = null;
    pinCheckSeq[role] += 1;
  });
  syncRoutePinMarkers();
  syncRoutePinFields();
}

async function fetchPinCheck(lat, lng) {
  const params = new URLSearchParams({
    barangay: selectedBarangay || '',
    hazard: selectedHazard || '',
    lat: String(lat),
    lng: String(lng),
  });
  const response = await fetch(`${window.BACKEND_BASE}/check-pin?${params}`);
  const data = await parseBackendJsonResponse(response);
  if (!response.ok || data?.error === true) {
    throw new Error(data?.message || 'Could not check that spot.');
  }
  return data;
}

// Places (or moves) a pin and has the backend confirm a route can start or
// end there. A spot it rejects restores the pin's previous position, so a bad
// drag or tap never loses a pin that was already fine.
async function placeRoutePin(role, lat, lng) {
  if (!canPlaceRoutePins() || !getActivePinRoles().includes(role)) {
    syncRoutePinMarkers();
    return;
  }

  const previous = getReadyPin(role);
  const seq = ++pinCheckSeq[role];
  clearPinHintError();

  if (!isPointInsideBarangay(lat, lng)) {
    // Also drops a still-pending check's "Checking..." state for this role.
    routePins[role] = previous;
    onRoutePinsChange();
    showPinHintError(`That spot is outside Brgy. ${selectedBarangay}. Tap inside the outlined area.`);
    return;
  }

  routePins[role] = { lat, lng, status: 'checking', label: '', street: null, roadDistance: null };
  onRoutePinsChange();

  let check;
  try {
    check = await fetchPinCheck(lat, lng);
  } catch (err) {
    check = { valid: false, message: `Could not check that spot: ${err.message}` };
  }
  if (seq !== pinCheckSeq[role]) return;

  if (!check.valid) {
    routePins[role] = previous;
    // A rejected pin with nothing to fall back on (e.g. one carried over from
    // the other hazard) leaves this role armed, so the next tap places it.
    if (!routePins[role] && !pinPlacementRole) setPinPlacementRole(role);
    onRoutePinsChange();
    showPinHintError(check.message || 'That spot cannot be used. Try another one.');
    return;
  }

  routePins[role] = {
    lat,
    lng,
    status: 'ready',
    street: check.street || null,
    roadDistance: Number(check.road_distance),
    label: buildPinLabel(role, check.street, check.road_distance),
  };
  if (pinPlacementRole === role || !pinPlacementRole) {
    setPinPlacementRole(getNextUnpinnedRole());
  }
  onRoutePinsChange();
}

function onMapClickForPin(event) {
  if (!pinPlacementRole || !canPlaceRoutePins()) return;
  placeRoutePin(pinPlacementRole, event.latlng.lat, event.latlng.lng);
}

function syncEarthquakeRouteUi() {
  const routeCardLabel = document.getElementById('routeCardLabel');
  const endField = document.getElementById('endField');
  const earthquakeRoutePanel = document.getElementById('earthquakeRoutePanel');
  const earthquakeRouteCopy = document.getElementById('earthquakeRouteCopy');
  const showEvacBtn = document.getElementById('showEvacBtn');
  const evacStatusTxt = document.getElementById('evacStatusTxt');
  const unsupportedEarthquake = isEarthquakeMode() && !isEarthquakeBarangaySupported();
  const hasStart = !!getReadyPin('start');
  const earthquakeSelectedBarangay = selectedBarangay || 'the selected barangay';

  if (routeCardLabel) {
    routeCardLabel.textContent = isEarthquakeMode() ? 'Start / Evacuation' : 'Start / End';
  }

  if (endField) {
    endField.hidden = isEarthquakeMode();
  }

  if (earthquakeRoutePanel) {
    earthquakeRoutePanel.hidden = !isEarthquakeMode();
  }

  if (showEvacBtn) {
    showEvacBtn.disabled = !(
      isEarthquakeMode()
      && isEarthquakeBarangaySupported()
      && hasStart
    );
  }

  if (evacStatusTxt) {
    if (!isEarthquakeMode()) {
      evacStatusTxt.textContent = 'Evacuation sites are hidden.';
    } else if (unsupportedEarthquake) {
      evacStatusTxt.textContent = `Earthquake routing is currently available only for ${EARTHQUAKE_SUPPORTED_BARANGAY_SCOPE}.`;
    } else if (!earthquakeEvacSitesVisible) {
      evacStatusTxt.textContent = hasStart
        ? 'Evacuation sites are hidden.'
        : 'Pin your location before revealing evacuation sites.';
    } else {
      evacStatusTxt.textContent = `${earthquakeEvacSites.length} evacuation site(s) loaded on the map.`;
    }
  }

  if (earthquakeRouteCopy) {
    earthquakeRouteCopy.innerHTML = unsupportedEarthquake
      ? `Earthquake routing is currently available only for <strong>${EARTHQUAKE_SUPPORTED_BARANGAY_SCOPE}</strong>.`
      : `Click <strong>Show Evacuation Sites</strong> to reveal the available evacuation shelters for <strong>${escapeHtml(earthquakeSelectedBarangay)}</strong>.`;
  }

  syncRoutePinFields();
  setRunButtonLabel();
  syncSimulationConfigLock();
}

function syncEarthquakeViewSelector() {
  const selector = document.getElementById('earthquakeViewSelector');
  const copy = document.getElementById('earthquakeViewCopy');
  const isVisible = isEarthquakeSimulationResult(simData);

  if (selector) {
    selector.hidden = !isVisible;
  }

  if (copy) {
    copy.textContent = isVisible
      ? (EARTHQUAKE_VIEW_META[activeEarthquakeView] || 'Earthquake result lens')
      : 'Earthquake result lens';
  }

  Object.keys(EARTHQUAKE_VIEW_META).forEach(viewKey => {
    const button = document.getElementById(`eqView-${viewKey}`);
    if (!button) return;

    button.classList.toggle('active', activeEarthquakeView === viewKey);
    button.setAttribute('aria-pressed', String(activeEarthquakeView === viewKey));
  });
}

function hydrateActiveEarthquakeView(viewKey = activeEarthquakeView) {
  if (!isEarthquakeSimulationResult(simData)) {
    return null;
  }

  const nextView = simData.views?.[viewKey] || simData.views?.overall || null;
  if (!nextView) {
    return null;
  }

  activeEarthquakeView = viewKey;
  simData.active_view = viewKey;
  simData.routes = Array.isArray(nextView.routes) ? nextView.routes : [];
  simData.active_summary = nextView.summary || null;
  simData.active_view_label = nextView.view_label || 'Overall';
  return nextView;
}

// The map legend's route rows (flood here, earthquake in earthquake.js).
// When no route is safe, the best route is the least risky eliminated one,
// drawn solid red (createRouteGroup in osm.js), and the legend says so.
function buildRouteLegendRows(routes = getCurrentDisplayRoutes()) {
  const row = (swatch, label) => `<div class="legend-row">${swatch}<span style="font-size:.78rem;">${label}</span></div>`;
  const eliminatedRow = row('<div class="legend-line legend-line--eliminated"></div>', 'Eliminated Route');
  const noSafeRoute = routes.length > 0 && routes.every(route => route.category === 'eliminated');

  if (noSafeRoute) {
    return row('<div class="legend-line" style="background:#ef4444;height:4px;"></div>', 'Best Route')
      + eliminatedRow;
  }
  return row('<div class="legend-line" style="background:#22c55e;height:4px;"></div>', 'Best Route')
    + row('<div class="legend-line legend-line--available"></div>', 'Available Route')
    + eliminatedRow;
}

function setFloodLegendContent() {
  const body = document.getElementById('mapLegendBody');
  if (!body) return;

  body.innerHTML = `
    ${buildRouteLegendRows()}
    <div style="margin-top:5px;">
      <div class="legend-row"><div class="legend-dot-sm" style="background:#06b6d4;"></div><span style="font-size:.78rem;">Your Location</span></div>
      <div class="legend-row"><div class="legend-dot-sm" style="background:#a855f7;"></div><span style="font-size:.78rem;">Destination</span></div>
    </div>`;
}

function hasFloodSimulationResult() {
  return !!(simData && !isEarthquakeSimulationResult(simData) && Array.isArray(simData.routes) && simData.routes.length);
}

// Once the setup stays editable after a run, moving a pin has to drop that
// run's routes so the map and safety panel never show a route that no longer
// matches the pins -- and put the map back the way it was for pinning:
// barangay outline, no hazard overlay (flood) or plain evacuation sites
// (earthquake), setup panel open with its Run button.
function clearSimulationOutput() {
  if (!simData) return;

  const wasEarthquakeResult = isEarthquakeSimulationResult(simData);
  clearRenderedRoutesOnly();
  simData = null;
  activeEarthquakeView = 'overall';
  resetRouteSafetyPanel();
  setResultsSidebarActionsVisible(false);
  document.getElementById('statusTxt').textContent = 'Ready';

  if (wasEarthquakeResult) {
    window.earthquakeUI?.renderHazardLayers({ map: gMap, hazardLayers: null });
    if (earthquakeEvacSitesVisible && earthquakeEvacSites.length && gMap) {
      window.earthquakeUI?.drawEvacuationSites({ map: gMap, sites: earthquakeEvacSites });
      window.earthquakeUI?.syncLegend(activeEarthquakeView, { showRouteKeys: false, showHazardLayers: false });
      setMapLegendVisible(true);
    } else {
      setMapLegendVisible(false);
    }
    syncEarthquakeViewSelector();
  } else {
    syncFloodHazardOverlay();
  }

  drawBarangayBoundary();
  reopenSetupSidebar();
}

function clearHazardSelectionState() {
  document.querySelectorAll('.hazard-card').forEach(card => {
    card.classList.remove('selected', ...HAZARD_SELECTION_CLASSES);
  });
}

// Back to an empty setup for the selected barangay: no result, no pins, no
// map layers (loadBarangayMapOnly() redraws the barangay after this).
function clearBarangaySelections() {
  floodHazardOverlayMode = 'none';
  resetEarthquakeState();
  simData = null;
  selectedRouteFocus = null;
  resetRouteSafetyPanel();
  setResultsSidebarActionsVisible(false);
  clearLayers();
  clearPinHintError();
  setPinPlacementRole(null);
  resetRoutePins();

  document.getElementById('runBtn').disabled = true;
  setMapLegendVisible(false);

  syncEarthquakeViewSelector();
  syncEarthquakeRouteUi();
  syncSimulationConfigLock();
}

function infoPopup(title, rows) {
  return `<div class="popup-shell">
    <div class="popup-title">${escapeHtml(title)}</div>
    ${rows.map(([k, v, c]) => `<div class="popup-row"><span>${escapeHtml(k)}</span><span style="${c ? 'color:' + c : ''}">${escapeHtml(v)}</span></div>`).join('')}
  </div>`;
}

function fitMapToBoundaryPaths(paths, padding = 42) {
  const bounds = L.latLngBounds();
  let hasPoints = false;

  (paths || []).forEach(path => {
    (path || []).forEach(point => {
      if (!point || point.lat == null || point.lng == null) return;

      bounds.extend({
        lat: Number(point.lat),
        lng: Number(point.lng),
      });
      hasPoints = true;
    });
  });

  if (!hasPoints) return false;

  gMap.fitBounds(bounds, { padding: [padding, padding] });
  return true;
}

function extendBoundsWithLngLat(bounds, lng, lat) {
  const numericLng = Number(lng);
  const numericLat = Number(lat);

  if (!Number.isFinite(numericLng) || !Number.isFinite(numericLat)) {
    return false;
  }

  bounds.extend({ lat: numericLat, lng: numericLng });
  return true;
}

// Pin and shelter markers stand up to ~60px above the point they mark, so a
// point fitted right at the top edge needs this much room above it.
const MAP_FIT_MARKER_HEADROOM = 48;

// The least height (px) a fit leaves for the route between the overlays.
const MAP_FIT_MIN_ROUTE_HEIGHT = 64;

// fitBounds options that keep fitted routes and pins out from under the
// map's own overlays -- the flood filter / earthquake lens card and the
// sidebar tab (top-left) and the legend (bottom) -- which on a phone cover a
// large share of the map.
function getMapFitPadding(base = 36) {
  const mapEl = document.getElementById('map');
  if (!mapEl) return { padding: [base, base] };

  const mapRect = mapEl.getBoundingClientRect();
  let top = base;
  let bottom = base;

  ['floodFilterControl', 'earthquakeViewSelector', 'sidebarReopenBtn'].forEach(id => {
    const el = document.getElementById(id);
    if (!el || !el.getClientRects().length) return;
    top = Math.max(top, el.getBoundingClientRect().bottom - mapRect.top + 12);
  });
  top += MAP_FIT_MARKER_HEADROOM;

  const legend = document.getElementById('mapLegend');
  if (legend && legend.getClientRects().length) {
    bottom = Math.max(bottom, mapRect.bottom - legend.getBoundingClientRect().top + 12);
  }

  // The gap between the overlays is the only place the route and its pins
  // show, so the padding gives way only when that gap is nearly gone. (Scaling
  // it down to keep the route large is what put the start pin under the
  // two-row flood filter on a 320-360px-wide phone.)
  const maxPadding = Math.max(mapRect.height - MAP_FIT_MIN_ROUTE_HEIGHT, mapRect.height / 2);
  if (top + bottom > maxPadding) {
    const scale = maxPadding / (top + bottom);
    top *= scale;
    bottom *= scale;
  }

  return { paddingTopLeft: [base, top], paddingBottomRight: [base, bottom] };
}

function getDisplayedEarthquakeRoute() {
  if (!isEarthquakeSimulationResult(simData) || !Array.isArray(simData.routes)) {
    return null;
  }

  return getBestRoute(simData.routes);
}

function fitEarthquakeMapScope(options = {}) {
  const { includeHazards = false } = options;

  if (!gMap || !selectedBarangay || !isEarthquakeMode()) {
    return false;
  }

  const bounds = L.latLngBounds();
  let hasPoints = false;

  const startPin = getReadyPin('start');
  if (startPin) {
    hasPoints = extendBoundsWithLngLat(bounds, startPin.lng, startPin.lat) || hasPoints;
  }

  if (includeHazards && isEarthquakeSimulationResult(simData)) {
    const activeRoute = getDisplayedEarthquakeRoute();
    const routePoints = Array.isArray(activeRoute?.render_path) && activeRoute.render_path.length
      ? activeRoute.render_path
      : Array.isArray(activeRoute?.path_coordinates)
      ? activeRoute.path_coordinates
      : [];

    routePoints.forEach(point => {
      hasPoints = extendBoundsWithLngLat(bounds, point?.lng, point?.lat) || hasPoints;
    });

    const activeDestination = simData?.active_summary?.selected_evacuation_site;
    if (activeDestination) {
      hasPoints = extendBoundsWithLngLat(bounds, activeDestination.lng, activeDestination.lat) || hasPoints;
    }
  } else {
    earthquakeEvacSites.forEach(site => {
      hasPoints = extendBoundsWithLngLat(bounds, site.lng, site.lat) || hasPoints;
    });
  }

  if (!hasPoints) {
    return false;
  }

  gMap.fitBounds(bounds, getMapFitPadding(52));
  gMap.once('moveend', () => {
    if (gMap.getZoom() < EARTHQUAKE_MIN_FOCUS_ZOOM) {
      gMap.setZoom(EARTHQUAKE_MIN_FOCUS_ZOOM);
    }
  });
  return true;
}

// Outline + outside-mask for barangayBoundaryRings. A run's results take the
// outline off the map; clearSimulationOutput() puts it back for pinning.
function drawBarangayBoundary() {
  if (!gMap || mapLayers.boundaries.length || !barangayBoundaryRings.length) return;

  const scopeMask = buildBarangayScopeMask(barangayBoundaryRings);
  if (scopeMask) {
    scopeMask.addTo(gMap);
    scopeMask.boundaryRole = 'mask';
    mapLayers.boundaries.push(scopeMask);
  }

  barangayBoundaryRings.forEach(ring => {
    const halo = L.polyline(ring, {
      color: getBarangayBoundaryHaloColor(),
      opacity: 0.92,
      weight: 10,
      interactive: false,
    }).addTo(gMap);
    halo.boundaryRole = 'halo';
    mapLayers.boundaries.push(halo);

    const outline = L.polyline(ring, {
      color: getBarangayBoundaryStrokeColor(),
      opacity: 1,
      weight: 5,
      interactive: false,
    }).addTo(gMap);
    outline.boundaryRole = 'main';
    mapLayers.boundaries.push(outline);
  });
}

async function loadBarangayMapOnly(bgyName) {
  clearLayers();
  barangayBoundaryRings = [];
  setMapLegendVisible(false);

  try {
    const res = await fetch(window.BACKEND_BASE + '/barangay-boundary/' + encodeURIComponent(bgyName));
    const data = await res.json();

    if (!res.ok || data.error === true) {
      throw new Error(data.message || 'Failed to load barangay boundary');
    }

    const paths = Array.isArray(data.boundary?.paths) ? data.boundary.paths : [];
    barangayBoundaryRings = paths
      .map(path => (path || [])
        .filter(point => point && point.lat != null && point.lng != null)
        .map(point => ({
          lat: Number(point.lat),
          lng: Number(point.lng),
        })))
      .filter(path => path.length >= 3);

    drawBarangayBoundary();
    fitMapToBoundaryPaths(barangayBoundaryRings, 42);
  } catch (err) {
    console.error('Failed to load barangay boundary:', err);
  }
}

function makeRouteEndpointPinIcon(kind = 'start') {
  const isStart = kind === 'start';
  const fill = isStart ? '#06b6d4' : '#a855f7';
  const stroke = isStart ? '#155e75' : '#6b21a8';
  const glyph = isStart ? 'S' : 'E';
  const outerGlow = isStart ? 'rgba(6,182,212,0.22)' : 'rgba(168,85,247,0.22)';
  const innerFill = isStart ? '#0891b2' : '#9333ea';
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="72" height="88" viewBox="0 0 72 88">
      <defs>
        <filter id="routePinShadow" x="-20%" y="-20%" width="140%" height="160%">
          <feDropShadow dx="0" dy="5" stdDeviation="5" flood-color="rgba(15,23,42,0.24)"/>
        </filter>
        <linearGradient id="routePinGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="${fill}" />
          <stop offset="100%" stop-color="${innerFill}" />
        </linearGradient>
      </defs>
      <g filter="url(#routePinShadow)">
        <ellipse cx="36" cy="77" rx="13" ry="4.5" fill="rgba(15,23,42,0.10)" />
        <circle cx="36" cy="31" r="25.5" fill="${outerGlow}" />
        <path
          d="M36 9C22.8 9 12 19.7 12 32.9c0 17.7 18.8 29.5 24 45.1 5.2-15.6 24-27.4 24-45.1C60 19.7 49.2 9 36 9z"
          fill="url(#routePinGrad)"
          stroke="#ffffff"
          stroke-width="4.8"
          stroke-linejoin="round"
        />
        <path
          d="M36 9C22.8 9 12 19.7 12 32.9c0 17.7 18.8 29.5 24 45.1 5.2-15.6 24-27.4 24-45.1C60 19.7 49.2 9 36 9z"
          fill="none"
          stroke="${stroke}"
          stroke-width="2"
          stroke-linejoin="round"
          opacity="0.88"
        />
        <circle cx="36" cy="33" r="14.8" fill="#ffffff" opacity="0.99"/>
        <circle cx="36" cy="33" r="10.8" fill="${innerFill}" opacity="0.98"/>
        <circle cx="31.5" cy="24.5" r="4.1" fill="rgba(255,255,255,0.28)" />
        <text x="36" y="38" text-anchor="middle" font-family="Plus Jakarta Sans, Nunito, sans-serif" font-size="12.8" font-weight="900" fill="#ffffff">${glyph}</text>
      </g>
    </svg>
  `;

  return L.icon({
    iconUrl: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
    iconSize: [48, 60],
    // The pin's tip sits at (36, 78) in the 72x88 source viewBox; scaled to
    // the 48x60 rendered size that's (24, 53.2) -- not (24, 55) -- which was
    // pulling the marker's true anchor a couple of px off the route's actual
    // endpoint coordinate.
    iconAnchor: [24, 53],
  });
}

async function selectBarangay(name) {
  if (isSimulationInteractionLocked()) return;

  workflowFocusSection = null;
  selectedBarangay = name;
  clearBarangaySelections();
  if (selectedHazard === 'Flood') floodHazardOverlayMode = 'all';
  document.getElementById('emptyMap').style.display = 'none';

  await loadBarangayMapOnly(name);
  await syncFloodHazardOverlay(name);
  showPinningLegend();
  advanceStep(selectedHazard ? 3 : 2);
  if (selectedHazard) setPinPlacementRole(getNextUnpinnedRole());
  syncRouteInfoBox();
}

// Legend while pinning, before any result: flood shows the route/pin key;
// earthquake shows nothing until the evacuation sites are revealed.
function showPinningLegend() {
  if (selectedHazard === 'Flood') {
    setFloodLegendContent();
    setMapLegendVisible(true);
  } else {
    setMapLegendVisible(false);
  }
}

// Identifies the pins a result was computed for, so moving a pin afterwards
// drops the now-stale routes.
function getRoutePinsKey() {
  return getActivePinRoles()
    .map(role => {
      const pin = getReadyPin(role);
      return pin ? `${pin.lat},${pin.lng}` : '-';
    })
    .join('|');
}

function isAnyRoutePinChecking() {
  return PIN_ROLES.some(role => routePins[role]?.status === 'checking');
}

// The single re-sync after any pin change.
function onRoutePinsChange() {
  syncRoutePinMarkers();

  if (isSimulationInteractionLocked()) {
    syncSimulationConfigLock();
    return;
  }

  workflowFocusSection = null;

  // Wait out a pending check: if the backend rejects the new spot the pin
  // snaps back, and the routes drawn for it are still valid.
  const dropsResult = !!simData && !isAnyRoutePinChecking() && simData.pins_key !== getRoutePinsKey();
  const update = () => {
    if (dropsResult) clearSimulationOutput();
    advanceStep(getMaxReachableStep());
    syncRouteInfoBox();
  };
  // Dropping the result reopens the setup panel and resizes its cards; the
  // moved pin has to stay on screen through all of it.
  if (dropsResult) {
    keepMapInPlace(update);
    revealRunButtonAbovePins();
  } else {
    update();
  }
}

// Phone layout: after a pin move reopens the setup panel above the map, also
// scroll its Run button into view -- but only when the pins on screen stay
// on screen too.
function revealRunButtonAbovePins() {
  const runBtn = document.getElementById('runBtn');
  if (!runBtn) return;
  const margin = 8;
  const shift = margin - runBtn.getBoundingClientRect().top;
  if (shift <= 0) return;

  const pinBottoms = Object.values(routePinMarkers)
    .map(marker => marker?.getElement()?.getBoundingClientRect())
    .filter(rect => rect && rect.top >= 0 && rect.bottom <= window.innerHeight)
    .map(rect => rect.bottom);
  const lowestPin = pinBottoms.length ? Math.max(...pinBottoms) : 0;
  if (lowestPin + shift <= window.innerHeight - margin) window.scrollBy(0, -shift);
}

// The Run card's guidance line, rebuilt from the current state -- so it only
// says "tap the map" while a tap will actually place a pin.
function syncRouteInfoBox() {
  const infoBox = document.getElementById('infoBox');
  if (!infoBox || !selectedBarangay || isSimulationInteractionLocked()) return;
  infoBox.innerHTML = buildRouteInfoHtml();
}

function buildRouteInfoHtml() {
  const startPin = getReadyPin('start');
  const endPin = getReadyPin('end');
  const pinPrompt = (role, target) => pinPlacementRole === role
    ? `Tap the map to pin ${target}.`
    : `Pin ${target}: click <strong>${PIN_ROLE_COPY[role].empty}</strong>, then <strong>Choose on Map</strong>.`;

  if (backendSimulationBusy) {
    return 'The backend is still finishing a <strong>previous simulation</strong>. Wait until it clears before starting a new one.';
  }
  if (!selectedHazard) {
    return `<strong>Brgy. ${escapeHtml(selectedBarangay)}</strong> loaded. Choose a <strong>disaster type</strong> to continue.`;
  }
  if (isEarthquakeMode() && !isEarthquakeBarangaySupported()) {
    return `<strong>Earthquake Routing</strong> is currently available only for <strong>${EARTHQUAKE_SUPPORTED_BARANGAY_SCOPE}</strong>.`;
  }
  if (isAnyRoutePinChecking()) {
    return 'Checking that the pinned spot can be reached by road…';
  }
  if (simData) {
    return 'Simulation complete. Drag a <strong>pin</strong> or change the <strong>hazard</strong> to try another route, or click <strong>Back to Home</strong> to pick a different barangay.';
  }

  if (isEarthquakeMode()) {
    if (!startPin) {
      return `${pinPrompt('start', '<strong>where you are</strong>')} Routes will lead from there to the evacuation sites.`;
    }
    if (!earthquakeEvacSitesVisible) {
      return 'Location pinned. Now click <strong>Show Evacuation Sites</strong> to load the available evacuation shelters.';
    }
    return `The system will compare routes from <strong>${escapeHtml(startPin.label)}</strong> to the evacuation sites that can still be reached. Click <strong>Run Earthquake Simulation</strong> to view the results.`;
  }

  if (startPin && endPin) {
    return `Ready! <strong>${escapeHtml(startPin.label)}</strong> to <strong>${escapeHtml(endPin.label)}</strong>. Click <strong>Run Simulation</strong>.`;
  }
  if (startPin) return `Location pinned. ${pinPrompt('end', 'your <strong>destination</strong>')}`;
  if (endPin) return `Destination pinned. ${pinPrompt('start', '<strong>where you are</strong>')}`;
  return pinPlacementRole === 'start'
    ? 'Tap the map to pin <strong>where you are</strong>, then <strong>where you want to go</strong>.'
    : pinPrompt('start', '<strong>where you are</strong>');
}

async function selectHazard(name, el) {
  if (isSimulationInteractionLocked()) return;

  // Where the visitor is doesn't depend on the hazard, so ready pins carry
  // over to the new mode (re-checked below against its coverage) -- except a
  // flood destination, which earthquake routing replaces with shelters.
  const carriedPins = PIN_ROLES
    .filter(role => role === 'start' || name === 'Flood')
    .map(role => [role, getReadyPin(role)])
    .filter(([, pin]) => pin);

  clearHazardSelectionState();
  el.classList.add('selected', name.toLowerCase());
  selectedHazard = name;
  applyHazardTheme();
  workflowFocusSection = null;

  if (!selectedBarangay) {
    // Only possible in the moment before the barangay from the URL has
    // loaded; selectBarangay() picks the hazard up from here.
    floodHazardOverlayMode = name === 'Flood' ? 'all' : 'none';
    advanceStep(1);
    return;
  }

  clearBarangaySelections();
  floodHazardOverlayMode = name === 'Flood' ? 'all' : 'none';
  document.getElementById('emptyMap').style.display = 'none';
  await loadBarangayMapOnly(selectedBarangay);
  // Flood areas and the severity filter only show with a result, so for
  // either hazard this just clears them.
  await syncFloodHazardOverlay(selectedBarangay);
  showPinningLegend();

  onRoutePinsChange();

  if (carriedPins.length && canPlaceRoutePins()) {
    carriedPins.forEach(([role, pin]) => placeRoutePin(role, pin.lat, pin.lng));
  } else {
    setPinPlacementRole(getNextUnpinnedRole());
  }
}

function getCompletedSteps() {
  return {
    1: !!selectedBarangay,
    2: !!selectedHazard,
    3: !!getReadyPin('start'),
    4: isEarthquakeMode()
      ? earthquakeEvacSitesVisible
      : !!getReadyPin('end'),
    5: canRunCurrentSimulation(),
  };
}

function getMaxReachableStep() {
  if (!selectedBarangay) return 1;
  if (!selectedHazard) return 2;

  if (isEarthquakeMode()) {
    if (!isEarthquakeBarangaySupported()) return 2;
    if (!getReadyPin('start')) return 3;
    if (!earthquakeEvacSitesVisible) return 4;
    return 5;
  }

  if (!getReadyPin('start')) return 3;
  if (!getReadyPin('end')) return 4;
  return 5;
}

function stepToSectionKey(step) {
  if (step <= 1) return 'barangay';
  if (step === 2) return 'hazard';
  if (step === 3 || step === 4) return 'route';
  return 'run';
}

function isWorkflowSectionAvailable(sectionKey) {
  if (sectionKey === 'barangay') return true;
  if (sectionKey === 'hazard') return !!selectedBarangay;
  if (sectionKey === 'route') return !!(selectedBarangay && selectedHazard);
  if (sectionKey === 'run') {
    return isEarthquakeMode()
      ? !!(selectedBarangay && selectedHazard && isEarthquakeBarangaySupported())
      : !!(selectedBarangay && selectedHazard);
  }
  return false;
}

function getActiveWorkflowSection(activeStep) {
  // Keep the pin fields open for as long as a pin is being placed.
  if (pinPlacementRole) return 'route';

  if (workflowFocusSection && isWorkflowSectionAvailable(workflowFocusSection)) {
    return workflowFocusSection;
  }

  return stepToSectionKey(activeStep);
}

function getWorkflowCard(sectionKey) {
  const map = {
    barangay: document.getElementById('cardBarangay'),
    hazard: document.getElementById('cardHazard'),
    route: document.getElementById('cardRoute'),
    run: document.getElementById('cardRun'),
  };

  return map[sectionKey] || null;
}

function syncWorkflowSummaries() {
  const canRun = canRunCurrentSimulation();

  const summaryHazard = document.getElementById('summaryHazard');
  const summaryRun = document.getElementById('summaryRun');

  if (summaryHazard) {
    summaryHazard.textContent = selectedHazard
      ? isEarthquakeMode()
        ? isEarthquakeBarangaySupported()
          ? `${selectedHazard} routing is active for ${selectedBarangay || 'the selected barangay'}.`
          : `${selectedHazard} routing is currently limited to ${EARTHQUAKE_SUPPORTED_BARANGAY_SCOPE}.`
        : `${selectedHazard} is the active hazard scenario.`
      : selectedBarangay
      ? 'Choose which hazard scenario to test.'
      : 'Choose a barangay first to unlock hazard testing.';
  }

  if (summaryRun) {
    // While running or locked, the workflow-run-body box below already
    // spells this out in full -- repeating a shorter version here is just
    // noise, so this line is hidden instead of duplicating it.
    summaryRun.hidden = simulationInProgress;
    summaryRun.textContent = simulationInProgress
      ? ''
      : backendSimulationBusy
      ? 'The backend is still finishing a previous simulation. Wait until it clears before starting another run.'
      : isEarthquakeMode()
      ? canRun
        ? 'Everything is ready. Launch the simulation when you are set.'
        : 'Review the earthquake setup, then launch the simulation.'
      : canRun
      ? 'Everything is ready. Launch the simulation when you are set.'
      : 'Review the setup, then launch the simulation.';
  }

  const changeHazardBtn = document.getElementById('changeHazardBtn');
  const changeRouteBtn = document.getElementById('changeRouteBtn');

  if (changeHazardBtn) {
    changeHazardBtn.textContent = selectedHazard ? 'Change' : 'Select';
    changeHazardBtn.disabled = isSimulationInteractionLocked() || !selectedBarangay;
  }

  if (changeRouteBtn) {
    changeRouteBtn.disabled = isSimulationInteractionLocked() || !(selectedBarangay && selectedHazard);
  }

  syncEarthquakeRouteUi();
  syncSimulationConfigLock();
}

function syncWorkflowCards(activeStep, completed) {
  const activeSection = getActiveWorkflowSection(activeStep);
  const sectionCompletion = {
    barangay: !!completed[1],
    hazard: !!completed[2],
    route: !!completed[4],
    run: !!completed[5],
  };

  ['barangay', 'hazard', 'route', 'run'].forEach(sectionKey => {
    const card = getWorkflowCard(sectionKey);
    if (!card) return;

    const isActive = sectionKey === activeSection;
    const isCompleted = sectionCompletion[sectionKey];
    const isEnabled = isWorkflowSectionAvailable(sectionKey);

    card.classList.toggle('active', isActive);
    card.classList.toggle('completed', isCompleted);
    card.classList.toggle('collapsed', !isActive);
    card.classList.toggle('disabled', !isEnabled);
  });
}

function focusWorkflowSection(sectionKey) {
  if (isSimulationInteractionLocked()) return;
  if (!isWorkflowSectionAvailable(sectionKey)) return;

  // Pin placement keeps the route card open, so opening another card
  // stops it first.
  if (sectionKey !== 'route') cancelPinPlacement();
  workflowFocusSection = sectionKey;
  advanceStep(getMaxReachableStep());

  const target = getWorkflowCard(sectionKey);
  if (target && typeof target.scrollIntoView === 'function') {
    target.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

function advanceStep(n) {
  const completed = getCompletedSteps();
  const activeStep = Math.max(1, Math.min(n, getMaxReachableStep()));

  syncWorkflowSummaries();
  syncWorkflowCards(activeStep, completed);
}

// Draws (or clears) the flood areas for the current result and filter mode.
// Resolves to { hasLayers, failed }, or null if the state moved on while the
// layers were loading (a newer call draws the current state instead).
async function syncFloodHazardOverlay(barangay = selectedBarangay) {
  const overlayConfig = getFloodOverlayConfig();
  const showsOverlay = () => !!(
    gMap
    && barangay
    && selectedHazard === 'Flood'
    && hasFloodSimulationResult()
    && getFloodOverlayConfig() === overlayConfig
    && overlayConfig.vars.length
  );

  // Flood areas and the severity filter belong to a result; while the
  // visitor is still pinning, the map shows only the barangay.
  if (!showsOverlay()) {
    window.floodHazardUI?.renderHazardLayers({ map: gMap, hazardLayers: null });
    syncFloodFilterControl();
    return { hasLayers: false, failed: false };
  }

  try {
    const hazardLayers = await window.floodHazardUI?.loadHazardLayers({
      scope: 'barangay_buffer',
      barangay,
      vars: overlayConfig.vars,
    });
    if (!showsOverlay()) return null;

    const visibleVars = overlayConfig.vars;
    const hasLayers = Array.isArray(hazardLayers?.features)
      && hazardLayers.features.some(feature => visibleVars.includes(Number(feature?.properties?.flood_var)));

    window.floodHazardUI?.renderHazardLayers({
      map: gMap,
      hazardLayers,
      visibleVars,
      highlightVar: overlayConfig.focusVar || null,
    });
    syncFloodFilterControl();
    setFloodLegendContent();
    setMapLegendVisible(true);
    return { hasLayers, failed: false };
  } catch (err) {
    console.warn('Failed to load flood hazard overlay:', err);
    window.floodHazardUI?.renderHazardLayers({ map: gMap, hazardLayers: null });
    syncFloodFilterControl();
    return { hasLayers: false, failed: true };
  }
}

async function setFloodHazardOverlayMode(modeKey) {
  if (isEarthquakeSimulationResult(simData) || selectedHazard !== 'Flood') {
    return;
  }

  floodHazardOverlayMode = floodHazardOverlayMode === modeKey ? 'all' : modeKey;

  const overlayState = await syncFloodHazardOverlay(selectedBarangay);
  if (!overlayState || floodHazardOverlayMode === 'all') return;

  if (overlayState.failed) {
    floodHazardOverlayMode = 'all';
    alert('Could not load the flood overlay. Restart the backend, then try again.');
    await syncFloodHazardOverlay(selectedBarangay);
  } else if (!overlayState.hasLayers) {
    floodHazardOverlayMode = 'all';
    alert('No flood areas were found for the selected map view.');
    await syncFloodHazardOverlay(selectedBarangay);
  }
}

async function renderActiveSimulationRoutes() {
  if (!simData || !Array.isArray(simData.routes)) return;

  const isEarthquakeResult = isEarthquakeSimulationResult(simData);
  // Show the map's result overlays before fitting the route, so the fit can
  // keep the route out from under them.
  if (isEarthquakeResult) syncEarthquakeViewSelector();
  else syncFloodFilterControl();

  await renderRoutesOnRoads({
    routes: simData.routes,
    gMap,
    mapLayers,
    drawPins: syncRoutePinMarkers,
    infoPopup,
    activeInfoWindowRef,
    fitOptions: getMapFitPadding(),
    fitPoints: [getReadyPin('start'), isEarthquakeResult ? null : getReadyPin('end')].filter(Boolean),
    buildEtaLabel: buildRouteEtaLabel,
    afterDrawPins: isEarthquakeResult
      ? () => {
          window.earthquakeUI?.drawEvacuationSites({
            map: gMap,
            sites: earthquakeEvacSites,
            highlightedSiteId: simData?.active_summary?.selected_evacuation_site?.id || null,
          });
        }
      : null,
  });

  if (isEarthquakeResult) {
    window.earthquakeUI?.renderHazardLayers({
      map: gMap,
      hazardLayers: simData.hazard_layers,
      activeView: activeEarthquakeView,
    });
    window.earthquakeUI?.syncLegend(activeEarthquakeView, { showRouteKeys: true });
    fitEarthquakeMapScope({ includeHazards: true });
  } else {
    await syncFloodHazardOverlay(selectedBarangay);
  }
}

async function showEvacuationSites() {
  if (isSimulationInteractionLocked() || !isEarthquakeMode()) return;
  if (!isEarthquakeBarangaySupported()) {
    alert(`Earthquake routing is currently available only for ${EARTHQUAKE_SUPPORTED_BARANGAY_SCOPE}.`);
    return;
  }

  if (!getReadyPin('start')) {
    alert('Pin your location on the map first.');
    return;
  }

  const statusTxt = document.getElementById('statusTxt');
  const previousStatus = statusTxt?.textContent || 'Ready';
  const hasActiveEarthquakeResult = isEarthquakeSimulationResult(simData)
    && simData.pins_key === getRoutePinsKey();

  try {
    if (statusTxt) {
      statusTxt.textContent = 'Loading evacuation sites...';
    }

    earthquakeEvacSites = await window.earthquakeUI.loadEvacuationSites(selectedBarangay);
    earthquakeEvacSitesVisible = true;

    window.earthquakeUI?.drawEvacuationSites({
      map: gMap,
      sites: earthquakeEvacSites,
      highlightedSiteId: hasActiveEarthquakeResult
        ? simData?.active_summary?.selected_evacuation_site?.id || null
        : null,
    });
    window.earthquakeUI?.syncLegend(
      activeEarthquakeView,
      hasActiveEarthquakeResult
        ? { showRouteKeys: true }
        : { showRouteKeys: false, showHazardLayers: false }
    );
    setMapLegendVisible(true);
    fitEarthquakeMapScope({ includeHazards: hasActiveEarthquakeResult });
  } catch (err) {
    console.error(err);
    alert('Failed to load evacuation sites: ' + err.message);
  } finally {
    if (statusTxt) {
      statusTxt.textContent = previousStatus;
    }
  }

  onRoutePinsChange();
}

async function switchEarthquakeView(viewKey) {
  if (!isEarthquakeSimulationResult(simData)) return;
  if (!hydrateActiveEarthquakeView(viewKey)) return;

  selectedRouteFocus = null;
  renderRouteSafetyPanel(simData);
  await renderActiveSimulationRoutes();
  applyRouteFocusState(null);
}

async function runSimulation() {
  if (isSimulationInteractionLocked()) return;

  workflowFocusSection = null;
  if (!canRunCurrentSimulation()) return;

  if (!isBackendLive) {
    alert('Backend is not connected.');
    return;
  }

  const isEarthquakeRun = isEarthquakeMode();
  const pinsKey = getRoutePinsKey();
  const request = isEarthquakeRun
    ? ['/earthquake/simulate', { start: buildPinRequestPoint('start'), barangay: selectedBarangay }, 'Earthquake simulation']
    : ['/simulate', { start: buildPinRequestPoint('start'), end: buildPinRequestPoint('end'), hazard: selectedHazard, barangay: selectedBarangay }, 'Simulation'];

  const loader = document.getElementById('loader');
  const statusTxt = document.getElementById('statusTxt');
  let loaderHideDelay = 420;
  let loaderHideTimer = null;
  let loaderHidden = false;

  const hideLoader = (delay = 0) => {
    if (loaderHidden) return;
    loaderHidden = true;

    if (loaderHideTimer) {
      window.clearTimeout(loaderHideTimer);
    }

    loaderHideTimer = window.setTimeout(() => {
      // display:none can't be transitioned, so fade opacity out first via the
      // 'leaving' class, then drop 'show' (and display) once that's done.
      loader.classList.add('leaving');
      loaderHideTimer = window.setTimeout(() => {
        loader.classList.remove('show', 'leaving');
        resetLoaderState();
        loaderHideTimer = null;
      }, LOADER_FADE_OUT_MS);
    }, delay);
  };

  resetLoaderState();
  loader.classList.add('show');
  setSimulationInProgress(true);
  resetRouteSafetyPanel();
  statusTxt.textContent = 'Simulating…';
  document.getElementById('infoBox').innerHTML =
    `Simulation is now <strong>running</strong>. The selected barangay, disaster type, and map pins are <strong>temporarily locked</strong> until the results are ready.`;
  setLoaderStep('ready', 8, { immediate: true });

  try {
    setLoaderStep('route', 22);
    startLoaderProgressPolling();
    const result = await sendRoutingRequest(...request);
    stopLoaderProgressPolling();
    setBackendSimulationBusyState(false);
    setLoaderStep('review', 76);

    if (isEarthquakeRun) {
      result.hazard_layers = result.hazard_layers || {};
      Object.values(result.views || {}).forEach(viewData => {
        viewData.routes = decorateRoutesForDisplay(normalizeRoutes(viewData.routes || []));
      });
    } else {
      result.routes = decorateRoutesForDisplay(normalizeRoutes(result.routes || []));
    }

    result.pins_key = pinsKey;
    simData = result;
    selectedRouteFocus = null;
    if (isEarthquakeRun) {
      hydrateActiveEarthquakeView(result.active_view || 'overall');
      earthquakeEvacSites = Array.isArray(result.evacuation_sites) ? result.evacuation_sites : earthquakeEvacSites;
      earthquakeEvacSitesVisible = earthquakeEvacSites.length > 0;
    } else {
      setFloodLegendContent();
    }

    setLoaderStep('draw', 92);
    statusTxt.textContent = 'Opening results…';
    renderRouteSafetyPanel(simData);
    syncMobilePanelBarLabel();
    // The setup panel folds away to give the results room -- before drawing,
    // so the route is fitted around the map overlays as they will end up.
    applySetupSidebarState(true);
    clearBoundaryLayers();
    await renderActiveSimulationRoutes();
    applyRouteFocusState(null);
    setResultsSidebarActionsVisible(true);

    setLoaderStep('complete', 100);
    statusTxt.textContent = 'Simulation Complete';
    // Only hide once the bar has actually eased up to 100 (previously this fired
    // right after the 'draw' step, so the bar visibly jumped to results mid-animation).
    hideLoader(650);
  } catch (err) {
    await syncBackendBusyStateAfterRequestError(err);
    console.error(err);
    statusTxt.textContent = backendSimulationBusy ? 'Backend Busy' : 'Error';
    setLoaderStep('stopped', 100);
    loaderHideDelay = 320;
    // A failed re-run leaves the previous result on the map; bring its panel back.
    if (simData) {
      renderRouteSafetyPanel(simData);
      syncMobilePanelBarLabel();
    }
    alert(isBackendSimulationBusyError(err) ? err.message : `${request[2]} failed: ${err.message}`);
  } finally {
    stopLoaderProgressPolling();
    setSimulationInProgress(false);
    if (!loaderHidden) {
      hideLoader(loaderHideDelay);
    }
    syncRouteInfoBox();
  }
}

function safetyIcon(name) {
  const icons = {
    alert: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4 3.6 19h16.8L12 4Z"/><path d="M12 9v4m0 3h.01"/></svg>',
    shield: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l7 3v5.5c0 4.3-2.9 7.9-7 9.5-4.1-1.6-7-5.2-7-9.5V6l7-3Z"/><path d="m9 12 2 2 4-4"/></svg>',
    ruler: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 16 12-12 4 4-12 12H4v-4Z"/><path d="m12 8 4 4m-7 0 2 2m1-7 2 2"/></svg>',
    droplet: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3s6 6.5 6 11a6 6 0 1 1-12 0c0-4.5 6-11 6-11Z"/></svg>',
    road: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 20 9 4m6 16-4-16M12 6v2m0 3v2m0 3v2"/></svg>',
    pin: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z"/><path d="M12 10h.01"/></svg>',
    clock: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/></svg>',
    flag: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 21V4"/><path d="M6 4h13l-3 3.5L19 11H6"/></svg>',
    walk: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="14" cy="4" r="1.6"/><path d="M13 6.5 11.5 13M12.3 8 9 7M12 9.3 15.6 11.6M11.5 13 8 15.5 8.6 19M11.5 13 14.6 16.8 16.2 20"/></svg>',
  };
  return icons[name] || icons.alert;
}

// "New Simulation" and "Download Report" in the safety aside share one
// show/hide lifecycle -- both only make sense once a simulation has run.
function setResultsSidebarActionsVisible(visible) {
  document.getElementById('resetBtn')?.classList.toggle('show', visible);
  document.getElementById('safetyDownloadBtn')?.classList.toggle('show', visible);
}

// The safety column only exists once the user has actually run a simulation.
function setRouteSafetyPanelVisible(visible) {
  const shell = document.getElementById('appShell');
  if (!shell || shell.classList.contains('safety-open') === visible) return;

  shell.classList.toggle('safety-open', visible);

  // Same mutual-exclusivity rule as applySetupSidebarState's, defended from
  // this side too -- so a caller that shows results without explicitly
  // collapsing setup first (a failed re-run restoring the previous result,
  // for instance) still can't leave both open at once on mobile.
  // Safe against the two functions re-triggering each other: each only
  // calls the other when *opening*, and the call it makes is always a
  // *close*, which doesn't call back.
  if (visible && MOBILE_PANEL_QUERY.matches) {
    applySetupSidebarState(true);
  }

  // No invalidateSize() call here either, same reason as
  // applySetupSidebarState above: the ResizeObserver in initMap() picks up
  // #map's resize once the results column's own transition settles.
}

function resetRouteSafetyPanel() {
  const content = document.getElementById('routeSafetyContent');
  if (content) {
    content.hidden = true;
    content.innerHTML = '';
  }
  setRouteSafetyPanelVisible(false);
  closeRouteListModal();
}

function getRouteTurnSteps(route) {
  return Array.isArray(route?.turn_steps) ? route.turn_steps : [];
}

// A single up-arrow glyph rotated per direction, plus a distinct pin for
// the first step -- avoids needing one bespoke icon per turn type.
const TURN_ARROW_ROTATION_DEGREES = {
  left: -90,
  slight_left: -45,
  straight: 0,
  slight_right: 45,
  right: 90,
  u_turn: 180,
};

const TURN_INSTRUCTION_VERB = {
  left: 'Turn left',
  slight_left: 'Turn slightly left',
  straight: 'Continue straight',
  slight_right: 'Turn slightly right',
  right: 'Turn right',
  u_turn: 'Make a U-turn',
};

function turnStepIcon(turn) {
  if (turn === 'start') {
    return safetyIcon('pin');
  }
  const rotation = TURN_ARROW_ROTATION_DEGREES[turn] ?? 0;
  return `<svg viewBox="0 0 24 24" aria-hidden="true" style="transform:rotate(${rotation}deg);"><path d="M12 19V5m-6 6 6-6 6 6"/></svg>`;
}

function formatTurnStepInstruction(step, index) {
  const name = String(step?.name || '').trim();
  if (index === 0 || step?.turn === 'start') {
    return name ? `Head out on ${name}` : 'Head out toward your destination';
  }
  const verb = TURN_INSTRUCTION_VERB[step?.turn] || 'Continue';
  return name ? `${verb} onto ${name}` : verb;
}

function toggleBestRouteStreets() {
  const chip = document.getElementById('safetyRouteChip');
  const list = document.getElementById('safetyRouteStreets');
  if (!chip || !list) return;
  const expand = list.hidden;
  list.hidden = !expand;
  chip.setAttribute('aria-expanded', String(expand));
}

function getBestRoute(routes) {
  return routes.find(route => route.category === 'best')
    || routes.find(route => route.status === 'Best')
    || routes[0]
    || null;
}

const SAFETY_DISCLAIMER_TEXT = 'This site offers disaster planning information, not official '
  + 'emergency alerts or professional safety advice. During an active flood or earthquake, '
  + 'always follow the instructions of local authorities. Rely on this content at your own '
  + 'risk; we assume no liability for any loss or damage.';

function renderRouteSafetyPanel(result) {
  const routes = Array.isArray(result?.routes) ? result.routes : [];
  const content = document.getElementById('routeSafetyContent');
  if (!content || !routes.length) {
    resetRouteSafetyPanel();
    return;
  }

  const isEarthquake = isEarthquakeSimulationResult(result);
  const safe = routes.filter(route => route.category !== 'eliminated');
  const best = getBestRoute(routes);
  const safeRouteFound = safe.length > 0;
  const bestRouteNo = best?.display_route_no ?? 1;
  const bestCategory = best?.category || '';

  const start = result.start || getReadyPin('start')?.label || PIN_ROLE_COPY.start.fallbackLabel;
  const end = result.end
    || best?.destination_name
    || getReadyPin('end')?.label
    || PIN_ROLE_COPY.end.fallbackLabel;

  const unsafeParts = Number(best?.display_unsafe_segment_count ?? best?.threshold_exceedance_count ?? 0);
  const peakScore = Number(best?.max_hazard || 0);
  const { label: peakLabel, value: peakValue } = getPeakRiskRow(best, isEarthquake);
  // Danger/red once it's actually High; amber/warning for Moderate; neutral for Low.
  const peakClass = peakScore >= 5 ? 'danger' : peakScore >= 3 ? 'warning' : '';
  const verdict = safeRouteFound ? 'Safe route found' : 'No safe route';

  // Plain, non-technical wording -- this panel is read by barangay residents,
  // not engineers, so it should make sense with no background on how the
  // system works (no "ACO", "evaluated", "hazard lens", etc.). Kept short.
  const routeCountLabel = `${routes.length} route${routes.length === 1 ? '' : 's'}`;
  const notes = [
    safeRouteFound
      ? `We checked ${routeCountLabel} — ${safe.length} ${safe.length === 1 ? 'is' : 'are'} completely safe.`
      : `We checked ${routeCountLabel} — none are completely safe.`,
    safeRouteFound
      ? 'The safest route is always shown first.'
      : `Best option still passes through ${unsafeParts || 'a few'} risky area${unsafeParts === 1 ? '' : 's'} — be extra careful.`,
  ];
  if (isEarthquake) {
    if (result.active_view_label) {
      notes.push(`Based on ${String(result.active_view_label).toLowerCase()} risk.`);
    }
    notes.push('These hazard levels are based on Hazard Hunter PH data.');
  } else {
    notes.push('These hazard levels are based on Project NOAH flood historical data.');
  }

  const bestTurnSteps = getRouteTurnSteps(best);
  const chipLabel = `${start} → ${end}`;

  const routeChipMarkup = bestTurnSteps.length
    ? `
    <div class="safety-route-hint">Tap the route below for turn-by-turn directions and to highlight it on the map.</div>
    <button class="safety-route-chip is-interactive" type="button" id="safetyRouteChip"
        aria-expanded="false" aria-controls="safetyRouteStreets" onclick="toggleBestRouteStreets()"
        data-focus-route="${escapeHtml(bestRouteNo)}" data-focus-category="${escapeHtml(bestCategory)}">
      ${safetyIcon('pin')}<span title="${escapeHtml(chipLabel)}">${escapeHtml(start)} &rarr; ${escapeHtml(end)}</span>
      <svg class="safety-route-chip-caret" viewBox="0 0 24 24" aria-hidden="true"><path d="m7 10 5 5 5-5"/></svg>
    </button>
    <ol class="safety-route-streets" id="safetyRouteStreets" hidden>
      ${bestTurnSteps.map((step, index) => `
        <li class="turn-step">
          <span class="turn-step-icon">${turnStepIcon(step.turn)}</span>
          <span class="turn-step-text">
            <span class="turn-step-instruction">${escapeHtml(formatTurnStepInstruction(step, index))}</span>
            ${Number(step.distance) > 0 ? `<span class="turn-step-distance">${escapeHtml(formatDistanceCompact(step.distance))}</span>` : ''}
          </span>
        </li>`).join('')}
      <li class="turn-step">
        <span class="turn-step-icon">${safetyIcon('flag')}</span>
        <span class="turn-step-text">
          <span class="turn-step-instruction">Your destination</span>
        </span>
      </li>
    </ol>`
    : `<div class="safety-route-chip">${safetyIcon('pin')}<span title="${escapeHtml(chipLabel)}">${escapeHtml(start)} &rarr; ${escapeHtml(end)}</span></div>`;

  setRouteSafetyPanelVisible(true);
  content.hidden = false;
  content.innerHTML = `
    ${routeChipMarkup}
    <div class="safety-section-label">Route safety results</div>
    <div class="safety-result-cards">
      <div class="safety-result-card ${safeRouteFound ? 'success' : 'danger'}">
        <div class="safety-icon-box">${safetyIcon(safeRouteFound ? 'shield' : 'alert')}</div>
        <div><div class="safety-card-label">Overall verdict</div><div class="safety-card-value">${escapeHtml(verdict)}</div></div>
      </div>
      <div class="safety-result-card">
        <div class="safety-icon-box">${safetyIcon('ruler')}</div>
        <div><div class="safety-card-label">Best route distance</div><div class="safety-card-value">${escapeHtml(best?.display_distance || 'Unavailable')}</div></div>
      </div>
      <div class="safety-result-card ${peakClass}">
        <div class="safety-icon-box">${safetyIcon('droplet')}</div>
        <div><div class="safety-card-label">${escapeHtml(peakLabel)}</div><div class="safety-card-value">${escapeHtml(peakValue)}</div></div>
      </div>
    </div>
    <div class="safety-notes"><em>Note:</em><ul>${notes.map(note => `<li>${escapeHtml(note)}</li>`).join('')}</ul>
      <div class="safety-disclaimer">
        <em class="safety-disclaimer-label">Disclaimer:</em>
        <p class="safety-disclaimer-text">${escapeHtml(SAFETY_DISCLAIMER_TEXT)}</p>
        <button class="safety-disclaimer-link" type="button" onclick="openEmergencyContactModal(event)">Click here for emergency contact information</button>
      </div>
    </div>
    <button class="safety-all-routes-btn" type="button" onclick="openRouteListModal()">See all ${Math.max(routes.length - 1, 0)} alternative route${Math.max(routes.length - 1, 0) === 1 ? '' : 's'}</button>`;
}

let routeListModalReturnFocus = null;

function buildRouteModalCard(route, index) {
  const routeNo = route.display_route_no ?? index + 1;
  const unsafe = Number(route.display_unsafe_segment_count ?? route.threshold_exceedance_count ?? 0);
  const risk = isEarthquakeRouteRecord(route)
    ? getRiskLevelLabelFromScore(route.max_hazard)
    : formatFloodPeakRisk(route);
  const isActive = selectedRouteFocus
    && String(selectedRouteFocus.routeNo) === String(routeNo)
    && (selectedRouteFocus.category || '') === (route.category || '');
  const stats = [
    route.display_distance || 'Distance unavailable',
    risk,
    `${unsafe} unsafe part${unsafe === 1 ? '' : 's'}`,
  ];

  return `<article class="route-modal-card${isActive ? ' is-active' : ''}" tabindex="0" role="button"
      aria-label="Focus route ${escapeHtml(routeNo)} on the map"
      data-focus-route="${escapeHtml(routeNo)}" data-focus-category="${escapeHtml(route.category || '')}">
      <div>
        <div class="route-modal-card-title">Route ${escapeHtml(routeNo)}</div>
        <div class="route-modal-card-stats">${stats.map(escapeHtml).join(' &middot; ')}</div>
      </div>
    </article>`;
}

function openRouteListModal() {
  const modal = document.getElementById('routeListModal');
  const body = document.getElementById('routeListModalBody');
  const count = document.getElementById('routeListModalCount');
  const routes = Array.isArray(simData?.routes) ? simData.routes : [];
  if (!modal || !body || !routes.length) return;

  const best = getBestRoute(routes);
  // The best route is already shown in the route safety panel, so this
  // modal only needs to list the other candidates.
  const alternativeRoutes = routes.filter(route => route !== best);
  const safeAlternatives = alternativeRoutes.filter(route => route.category !== 'eliminated');
  const overallSafeFound = routes.some(route => route.category !== 'eliminated');
  const caution = overallSafeFound
    ? ''
    : `<div class="route-modal-caution">${safetyIcon('alert')}<span>No fully safe route was found. Every route below still passes through a risky area, so treat them as backup options and review each one carefully.</span></div>`;

  body.innerHTML = caution + (alternativeRoutes.length
    ? alternativeRoutes.map((route, index) => buildRouteModalCard(route, index)).join('')
    : '<div class="route-modal-empty">No other alternative routes were found for this trip.</div>');
  if (count) {
    count.textContent = `${alternativeRoutes.length} alternative${alternativeRoutes.length === 1 ? '' : 's'} · ${safeAlternatives.length} safe`;
  }

  routeListModalReturnFocus = document.activeElement;
  modal.hidden = false;
  modal.querySelector('.modal-close-btn')?.focus({ preventScroll: true });
}

function closeRouteListModal() {
  const modal = document.getElementById('routeListModal');
  if (!modal || modal.hidden) return;
  modal.hidden = true;

  if (routeListModalReturnFocus && document.contains(routeListModalReturnFocus)) {
    routeListModalReturnFocus.focus({ preventScroll: true });
  }
  routeListModalReturnFocus = null;
}

function focusRouteFromModal(routeNo, category) {
  closeRouteListModal();
  window.toggleRouteFocus(routeNo, category, false);
}

// Delegated so route data-attributes don't need inline handler interpolation;
// uses toggleRouteFocus so re-clicking an active route clears the focus.
document.addEventListener('click', event => {
  const trigger = event.target?.closest?.('[data-focus-route]');
  if (!trigger) return;
  const routeNo = Number(trigger.dataset.focusRoute);
  if (!Number.isFinite(routeNo)) return;

  if (trigger.closest('#routeListModal')) {
    focusRouteFromModal(routeNo, trigger.dataset.focusCategory || '');
  } else {
    window.toggleRouteFocus(routeNo, trigger.dataset.focusCategory || '', false);
  }
});

document.addEventListener('keydown', event => {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  const card = event.target?.closest?.('.route-modal-card[data-focus-route]');
  if (!card) return;
  event.preventDefault();
  focusRouteFromModal(Number(card.dataset.focusRoute), card.dataset.focusCategory || '');
});

function getDefaultRouteVisual(group) {
  // isBest also covers the red best route when no route is safe.
  if (group?.category === 'best' || group?.isBest) {
    return { mainWeight: ROUTE_BEST_WEIGHT, mainOpacity: 1, casingOpacity: 1 };
  }

  if (group?.category === 'available') {
    return { mainWeight: ROUTE_DASHED_WEIGHT, mainOpacity: 1, casingOpacity: 1 };
  }

  // Eliminated routes: red dashes, set apart from the violet ones by their
  // color and tighter dash spacing (ROUTE_DASHES in osm.js).
  return { mainWeight: ROUTE_DASHED_WEIGHT, mainOpacity: 0.9, casingOpacity: 1 };
}

// The focused route keeps its normal look (it must stay the clearest thing on
// the map) -- the flowing dash overlay added by createRoutePreview below is
// what signals "this one is selected".
function getFocusedRouteVisual(group) {
  return { ...getDefaultRouteVisual(group), mainOpacity: 1, casingOpacity: 1 };
}

function getDimmedRouteVisual(group) {
  const base = getDefaultRouteVisual(group);
  return {
    ...base,
    mainWeight: Math.max(2, base.mainWeight - 1),
    mainOpacity: group?.category === 'eliminated' ? 0.08 : 0.12,
    casingOpacity: 0,
  };
}

function getRoutePreviewPath(group) {
  if (!group?.route) return [];

  const renderPath = Array.isArray(group.route.render_path) ? group.route.render_path : [];
  if (renderPath.length > 1) return renderPath;

  const coords = Array.isArray(group.route.path_coordinates) ? group.route.path_coordinates : [];
  if (coords.length > 1) return coords;

  return [];
}

function createRoutePreview(group) {
  if (!gMap || !group) return;

  const path = getRoutePreviewPath(group);
  if (path.length < 2) return;

  clearRoutePreview(group);

  // The focused route's own solid line stays fully visible underneath -- see
  // getFocusedRouteVisual -- so this is just a thin white dash marching along
  // its middle toward the destination. Animated by style.css
  // (route-flow--focus), not a JS timer, so it moves smoothly. Dash + gap =
  // the 24px CSS loop.
  group.previewDotsLayer = L.polyline(path, {
    color: '#ffffff',
    weight: 2 * getRouteZoomScale(gMap),
    opacity: 0.95,
    dashArray: '13 11',
    lineCap: 'round',
    noClip: true,
    interactive: false,
    className: 'route-line route-flow route-flow--focus',
  }).addTo(gMap);

  group.previewDotsLayer.bringToFront();
}

function syncRoutePreview(group, enabled) {
  if (!group) return;

  // Dashed routes (available/eliminated) stay static even when picked --
  // a marching dash over their dashes reads as moving dots.
  if (!enabled || group.dashKey) {
    clearRoutePreview(group);
    return;
  }

  createRoutePreview(group);
}

// Leaflet paths have no zIndex option; bringRouteGroupToFront() (called only
// for the focused route, below) handles the dynamic re-stacking.
function applyRouteGroupVisual(group, visual) {
  if (!group) return;

  const zoomScale = getRouteZoomScale(gMap);
  const dashArray = getRouteDashArray(group.dashKey, zoomScale);

  if (group.casingLayer) {
    group.casingLayer.setStyle({
      opacity: visual.casingOpacity * (dashArray ? ROUTE_DASH_CASING_OPACITY : 1),
      weight: (visual.mainWeight + getRouteCasingExtraWeight(group.dashKey)) * zoomScale,
      dashArray,
    });
  }

  if (group.mainLayer) {
    group.mainLayer.setStyle({
      opacity: visual.mainOpacity,
      weight: visual.mainWeight * zoomScale,
      dashArray,
    });
  }
}

function bringRouteGroupToFront(group) {
  if (!group) return;
  if (group.casingLayer) group.casingLayer.bringToFront();
  if (group.mainLayer) group.mainLayer.bringToFront();
  if (group.hitLayer) group.hitLayer.bringToFront();
}

// The best route's time label (permanent, see bindRouteEtaLabel) steps aside
// while another route is picked and comes back with the best route.
function syncBestRouteEtaLabel(group, shown) {
  const tooltip = group?.hitLayer?.getTooltip();
  if (!tooltip?.options.permanent) return;
  if (shown && !tooltip.isOpen()) group.hitLayer.openTooltip();
  else if (!shown && tooltip.isOpen()) group.hitLayer.closeTooltip();
}

function applyRouteFocusState(routeNo) {
  const groups = Array.isArray(mapLayers.routeGroups) ? mapLayers.routeGroups : [];
  const hasFocus = routeNo != null;

  groups.forEach(group => {
    const isFocused = hasFocus && group.routeNo === routeNo;
    const visual = !hasFocus
      ? getDefaultRouteVisual(group)
      : isFocused
      ? getFocusedRouteVisual(group)
      : getDimmedRouteVisual(group);

    // Routes past the first few (MAP_ROUTES_SHOWN) are on the map only
    // while picked.
    if (group.hiddenByDefault) setRouteGroupShown(group, gMap, isFocused);
    syncBestRouteEtaLabel(group, !hasFocus || isFocused);
    applyRouteGroupVisual(group, visual);
    if (isFocused) {
      bringRouteGroupToFront(group);
    }
    syncRoutePreview(group, isFocused);
  });
}

// Re-applies the route styles (widths are zoom-scaled) for the current focus.
function syncRouteFocusStyles() {
  applyRouteFocusState(selectedRouteFocus ? selectedRouteFocus.routeNo : null);
}

// ---- downloadable PDF report: the summary half is drawn straight from
// simData with jsPDF text calls, never a screenshot of the live page --
// html2canvas (used for an earlier version of this half) chokes on this
// app's stylesheet with "unsupported color function" errors because it
// predates color-mix(), which is used throughout style.css.
//
// The map half used to be redrawn from data too (a flat background with
// just the route line), on the assumption that the OSM/Esri tile images
// would taint the canvas as cross-origin content. That assumption doesn't
// hold: both tile.openstreetmap.org and server.arcgisonline.com send
// `Access-Control-Allow-Origin: *`, so fetching tiles as `Image` objects
// with crossOrigin='anonymous' set *before* `src` keeps the canvas clean.
// renderBestRouteMapCanvas() below fetches the OSM street tiles under the
// route's bounding box and composites them with the same Web Mercator math
// the tiles themselves are addressed by, so the route lines up exactly. If
// tile loading fails for any reason (offline, blocked, slow network), it
// falls back to the old flat schematic render rather than failing the
// whole report. ----

const REPORT_MAP_TILE_SIZE = 256;
const REPORT_MAP_MIN_ZOOM = 10;
const REPORT_MAP_MAX_ZOOM = 19; // matches the live street layer's maxZoom
const REPORT_MAP_TILE_URL_TEMPLATE = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const REPORT_MAP_TILE_TIMEOUT_MS = 8000;
const REPORT_MAP_ATTRIBUTION = 'Map data © OpenStreetMap contributors';

function reportMercatorX(lng, zoom) {
  return (lng + 180) / 360 * REPORT_MAP_TILE_SIZE * Math.pow(2, zoom);
}

function reportMercatorY(lat, zoom) {
  const clampedLat = Math.max(Math.min(lat, 85.0511), -85.0511);
  const rad = clampedLat * Math.PI / 180;
  const yFraction = 0.5 - Math.log(Math.tan(Math.PI / 4 + rad / 2)) / (2 * Math.PI);
  return yFraction * REPORT_MAP_TILE_SIZE * Math.pow(2, zoom);
}

// Largest integer zoom (tiles only exist at integer zooms) at which the
// lat/lng box still fits inside a boxWidth x boxHeight pixel area.
function pickReportMapZoom(minLat, maxLat, minLng, maxLng, boxWidth, boxHeight) {
  for (let z = REPORT_MAP_MAX_ZOOM; z >= REPORT_MAP_MIN_ZOOM; z--) {
    const w = reportMercatorX(maxLng, z) - reportMercatorX(minLng, z);
    const h = reportMercatorY(minLat, z) - reportMercatorY(maxLat, z);
    if (w <= boxWidth && h <= boxHeight) return z;
  }
  return REPORT_MAP_MIN_ZOOM;
}

function loadReportMapTile(url, timeoutMs = REPORT_MAP_TILE_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    // Must be set before `src` -- this is what keeps a same-permissive-CORS
    // tile from tainting the canvas once it loads.
    img.crossOrigin = 'anonymous';
    const timer = setTimeout(() => reject(new Error('Tile timed out: ' + url)), timeoutMs);
    img.onload = () => { clearTimeout(timer); resolve(img); };
    img.onerror = () => { clearTimeout(timer); reject(new Error('Tile failed to load: ' + url)); };
    img.src = url;
  });
}

// Fetches and draws the OSM tiles under a lat/lng box, centered in a
// width x height canvas with `pad` pixels reserved on every side. Returns
// the projection info needed to place route geometry on top, or throws if
// not a single tile could be loaded (caller falls back to a flat render).
async function drawReportBasemap(ctx, { minLat, maxLat, minLng, maxLng, width, height, pad }) {
  const zoom = pickReportMapZoom(minLat, maxLat, minLng, maxLng, width - pad * 2, height - pad * 2);
  const originX = (reportMercatorX(minLng, zoom) + reportMercatorX(maxLng, zoom)) / 2 - width / 2;
  const originY = (reportMercatorY(minLat, zoom) + reportMercatorY(maxLat, zoom)) / 2 - height / 2;

  const tilesPerAxis = Math.pow(2, zoom);
  const minTileX = Math.floor(originX / REPORT_MAP_TILE_SIZE);
  const maxTileX = Math.floor((originX + width) / REPORT_MAP_TILE_SIZE);
  const minTileY = Math.max(0, Math.floor(originY / REPORT_MAP_TILE_SIZE));
  const maxTileY = Math.min(tilesPerAxis - 1, Math.floor((originY + height) / REPORT_MAP_TILE_SIZE));

  const tileJobs = [];
  for (let tx = minTileX; tx <= maxTileX; tx++) {
    const wrappedX = ((tx % tilesPerAxis) + tilesPerAxis) % tilesPerAxis;
    for (let ty = minTileY; ty <= maxTileY; ty++) {
      const url = REPORT_MAP_TILE_URL_TEMPLATE
        .replace('{z}', zoom).replace('{x}', wrappedX).replace('{y}', ty);
      tileJobs.push(loadReportMapTile(url).then(img => ({ img, tx, ty })).catch(() => null));
    }
  }

  const tiles = (await Promise.all(tileJobs)).filter(Boolean);
  if (!tiles.length) {
    throw new Error('No basemap tiles could be loaded for the report map.');
  }

  tiles.forEach(({ img, tx, ty }) => {
    ctx.drawImage(
      img,
      tx * REPORT_MAP_TILE_SIZE - originX,
      ty * REPORT_MAP_TILE_SIZE - originY,
      REPORT_MAP_TILE_SIZE,
      REPORT_MAP_TILE_SIZE
    );
  });

  return { zoom, originX, originY };
}

function getCurrentDisplayRoutes() {
  if (isEarthquakeSimulationResult(simData)) {
    return getActiveEarthquakeViewData(simData)?.routes || [];
  }
  return simData?.routes || [];
}

function drawReportPin(ctx, x, y, color, label) {
  ctx.beginPath();
  ctx.arc(x, y, 8, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#ffffff';
  ctx.stroke();

  // White halo keeps the label readable over busy map tiles, not just the
  // old flat background.
  ctx.font = 'bold 15px sans-serif';
  ctx.textAlign = 'center';
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#ffffff';
  ctx.strokeText(label, x, y - 16);
  ctx.fillStyle = '#0f172a';
  ctx.fillText(label, x, y - 16);
}

// Fallback projection used when real tiles can't be fetched: fits the
// route's bounding box exactly to the canvas (the old, pre-basemap
// behavior) rather than snapping to a real map's integer zoom levels.
function buildFlatFitProjection(minLat, maxLat, minLng, maxLng, width, height, pad) {
  const spanLat = Math.max(maxLat - minLat, 1e-6);
  const spanLng = Math.max(maxLng - minLng, 1e-6);
  // Longitude degrees are narrower than latitude degrees away from the
  // equator; this keeps the drawn route from looking horizontally stretched.
  const latCorrection = Math.cos(((minLat + maxLat) / 2) * Math.PI / 180) || 1;

  const usableW = width - pad * 2;
  const usableH = height - pad * 2;
  const scale = Math.min(usableW / (spanLng * latCorrection), usableH / spanLat);
  const drawnW = spanLng * latCorrection * scale;
  const drawnH = spanLat * scale;
  const offsetX = pad + (usableW - drawnW) / 2;
  const offsetY = pad + (usableH - drawnH) / 2;

  return (p) => [
    offsetX + (p.lng - minLng) * latCorrection * scale,
    offsetY + (maxLat - p.lat) * scale,
  ];
}

// Renders the best route for the PDF report onto a canvas, with real OSM
// street tiles composited underneath when they can be fetched (see the
// header comment above for why that's safe from canvas tainting). Falls
// back to a flat schematic background otherwise. Returns both the canvas
// and whether a basemap was actually used, since the caller needs that to
// decide whether an attribution line is required.
async function renderBestRouteMapCanvas(route, labels = {}, { skipBasemap = false } = {}) {
  const width = 900;
  const height = 540;
  const pad = 56;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  const points = Array.isArray(route?.render_path) && route.render_path.length
    ? route.render_path
    : Array.isArray(route?.path_coordinates) ? route.path_coordinates : [];

  if (points.length < 2) {
    ctx.fillStyle = '#eef3fa';
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = '#516579';
    ctx.font = '20px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('No route geometry available for this simulation.', width / 2, height / 2);
    return { canvas, usedBasemap: false };
  }

  // Pins go where the visitor put them (the evacuation site for an
  // earthquake route), which can be off the street the line starts or ends on.
  const startPin = getReadyPin('start') || points[0];
  const endPin = route?.destination_lat != null && route?.destination_lng != null
    ? { lat: Number(route.destination_lat), lng: Number(route.destination_lng) }
    : points[points.length - 1];

  const lats = [...points, startPin, endPin].map(p => p.lat);
  const lngs = [...points, startPin, endPin].map(p => p.lng);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);

  let project = null;
  let usedBasemap = false;

  if (!skipBasemap) {
    try {
      const { zoom, originX, originY } = await drawReportBasemap(ctx, { minLat, maxLat, minLng, maxLng, width, height, pad });
      project = (p) => [reportMercatorX(p.lng, zoom) - originX, reportMercatorY(p.lat, zoom) - originY];
      usedBasemap = true;
    } catch (err) {
      console.warn('Report map: falling back to schematic render —', err.message);
    }
  }

  if (!project) {
    ctx.fillStyle = '#eef3fa';
    ctx.fillRect(0, 0, width, height);
    project = buildFlatFitProjection(minLat, maxLat, minLng, maxLng, width, height, pad);
  }

  const tracePath = () => {
    ctx.beginPath();
    points.forEach((p, i) => {
      const [x, y] = project(p);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
  };

  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  // Same slim line as the map (addRouteCasing in osm.js): a thin edge in a
  // darker shade of the route color, not a wide band covering the road.
  const routeColor = route?.color || '#22c55e';
  ctx.strokeStyle = getRouteEdgeColor(routeColor);
  ctx.lineWidth = 7;
  tracePath();
  ctx.stroke();

  ctx.strokeStyle = routeColor;
  ctx.lineWidth = 5;
  tracePath();
  ctx.stroke();

  const [sx, sy] = project(startPin);
  const [ex, ey] = project(endPin);
  drawReportPin(ctx, sx, sy, '#06b6d4', labels.start || 'Start');
  drawReportPin(ctx, ex, ey, '#a855f7', labels.end || 'Destination');

  return { canvas, usedBasemap };
}

async function downloadSimulationReport() {
  const routes = getCurrentDisplayRoutes();
  if (!routes.length) return;

  const btn = document.getElementById('safetyDownloadBtn');
  const originalLabel = btn?.innerHTML;
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Preparing report…';
  }

  try {
    if (!window.jspdf) {
      throw new Error('The report generator failed to load. Check your internet connection and try again.');
    }

    const best = getBestRoute(routes);
    const safe = routes.filter(r => r.category !== 'eliminated');
    const eliminated = routes.filter(r => r.category === 'eliminated');
    const safeRouteFound = safe.length > 0;
    const { barangay, hazard, start, end } = getCurrentSelections();

    // Earthquake mode has no destination pin -- the destination is whichever
    // evacuation site the ACO run picked, so label it with that instead.
    const isEq = isEarthquakeSimulationResult(simData);
    const eqSummary = isEq ? (simData.active_summary || getActiveEarthquakeViewData(simData)?.summary || null) : null;
    const endLabel = isEq ? (eqSummary?.selected_evacuation_site?.name || 'Evacuation site') : end;
    const withPinCoordinates = (label, role) => {
      const pin = getReadyPin(role);
      return pin ? `${label} (${formatPinCoordinates(pin)})` : label;
    };

    const { label: peakLabel, value: peakValue } = getPeakRiskRow(best, isEq);

    let mapResult = await renderBestRouteMapCanvas(best, { start, end: endLabel });
    let mapDataUrl;
    try {
      mapDataUrl = mapResult.canvas.toDataURL('image/png');
    } catch (err) {
      // Belt-and-suspenders: if a tile response somehow tainted the canvas
      // despite the ACAO/crossOrigin handling, redo it without the basemap
      // instead of failing the whole report.
      console.warn('Report map canvas was tainted, redrawing without basemap —', err.message);
      mapResult = await renderBestRouteMapCanvas(best, { start, end: endLabel }, { skipBasemap: true });
      mapDataUrl = mapResult.canvas.toDataURL('image/png');
    }

    // The summary is built from the same simData the on-screen "Summary" tab
    // reads, drawn directly with jsPDF -- not a screenshot of that tab. This
    // used to go through html2canvas, which chokes on modern CSS color
    // functions (color-mix(), used throughout this app's stylesheet) with
    // "unsupported color function" errors, so it never reliably rendered.
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'pt', format: 'a4' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 40;
    let y = margin;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.text('AGNAS Simulation Report', margin, y);
    y += 20;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(110);
    doc.text(`Generated ${new Date().toLocaleString()}`, margin, y);
    doc.setTextColor(0);
    y += 22;

    const mapWidth = pageWidth - margin * 2;
    const mapHeight = mapWidth * (mapResult.canvas.height / mapResult.canvas.width);
    doc.addImage(mapDataUrl, 'PNG', margin, y, mapWidth, mapHeight);
    y += mapHeight + 12;

    if (mapResult.usedBasemap) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(140);
      doc.text(REPORT_MAP_ATTRIBUTION, margin, y);
      doc.setTextColor(0);
      y += 18;
    } else {
      y += 12;
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.text('Simulation Summary', margin, y);
    y += 18;

    const labelColWidth = 160;
    const rows = [
      ['Barangay', barangay || 'Unknown'],
      ['Disaster type', hazard || 'Unknown'],
      ['Start', withPinCoordinates(start || 'Unknown', 'start')],
      ['Destination', isEq ? (endLabel || 'Unknown') : withPinCoordinates(endLabel || 'Unknown', 'end')],
      ['Overall verdict', safeRouteFound ? 'Safe route found' : 'No safe route'],
      ['Best route distance', best?.display_distance || 'Unavailable'],
      ['Estimated time to destination', best?.display_duration || 'Unavailable'],
      [peakLabel, peakValue],
      ['Routes checked', `${routes.length} (${safe.length} safe, ${eliminated.length} not recommended)`],
    ];

    doc.setFontSize(10.5);
    const valueWidth = pageWidth - margin * 2 - labelColWidth;
    rows.forEach(([label, value]) => {
      const valueLines = doc.splitTextToSize(String(value), valueWidth);
      doc.setFont('helvetica', 'bold');
      doc.text(String(label), margin, y);
      doc.setFont('helvetica', 'normal');
      doc.text(valueLines, margin + labelColWidth, y);
      y += 17 + (valueLines.length - 1) * 13;
    });

    y += 10;
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(9);
    doc.setTextColor(120);
    const rankingText = `How routes are ordered: ${getUserFriendlyRankingExplanation()}`;
    const wrappedRanking = doc.splitTextToSize(rankingText, pageWidth - margin * 2);
    doc.text(wrappedRanking, margin, y);
    y += wrappedRanking.length * 12 + 10;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(150);
    const wrappedDisclaimer = doc.splitTextToSize(SAFETY_DISCLAIMER_TEXT, pageWidth - margin * 2);
    doc.text(wrappedDisclaimer, margin, y);
    doc.setTextColor(0);

    const fileSafeBarangay = (barangay || 'agnas').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    doc.save(`agnas-report-${fileSafeBarangay}-${Date.now()}.pdf`);
  } catch (err) {
    console.error(err);
    alert('Could not generate the report: ' + err.message);
  } finally {
    if (btn) {
      btn.disabled = false;
      if (originalLabel) btn.innerHTML = originalLabel;
    }
  }
}

// Sends the visitor back to the homepage so a new simulation starts from
// scratch, since barangay can't be changed here. Plain '/' rather than the
// '#heroBarangaySelector' anchor -- with the homepage's scroll-behavior:smooth,
// landing on that hash played a visible auto-scroll past the hero on every
// "Back to Home" click, which read as a bug rather than a shortcut.
function goToHomepageForNewScope() {
  if (simulationInProgress) return;
  window.location.href = '/';
}

async function checkBackend() {
  // Generous: on a slow phone connection (or a just-woken server) a couple of
  // seconds is not enough, and failing here strands the page as "offline".
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);
  try {
    const r = await fetch(window.BACKEND_BASE + '/health', { signal: controller.signal });

    if (r.ok) {
      isBackendLive = true;
      document.getElementById('statusTxt').textContent = 'Backend Connected';
      await refreshBackendSimulationStatus();
    }
  } catch (err) {
    isBackendLive = false;
    setBackendSimulationBusyState(false);
  } finally {
    clearTimeout(timeoutId);
  }
}

// Route focus, shared by the route safety panel, the route list and the map
// polylines (osm.js). Clicking the focused route again clears the focus.
window.toggleRouteFocus = function toggleRouteFocus(routeNo, category) {
  const shouldClear = selectedRouteFocus && selectedRouteFocus.routeNo === routeNo;
  selectedRouteFocus = shouldClear ? null : { routeNo, category };
  applyRouteFocusState(shouldClear ? null : routeNo);
};

window.focusRouteSelection = function focusRouteSelection(routeNo, category) {
  if (routeNo == null) return;
  selectedRouteFocus = { routeNo, category };
  applyRouteFocusState(routeNo);
};

// A click anywhere outside a pin input closes its "Choose on Map" menu.
document.addEventListener('click', event => {
  if (!event.target.closest?.('.pin-input-combo')) closePinMenus();
});

// Clicking the dimmed backdrop closes the route list.
document.getElementById('routeListModal')?.addEventListener('mousedown', event => {
  if (event.target === event.currentTarget) closeRouteListModal();
});

syncLoaderContext();
initLoaderGraphPulses();
setFloodLegendContent();
syncEarthquakeRouteUi();
syncEarthquakeViewSelector();
// The setup panel starts open on desktop/tablet (a docked column, covering
// nothing) but closed on mobile (a full-screen panel over the map) --
// per-visit only either way.
applySetupSidebarState(MOBILE_PANEL_QUERY.matches);
syncMobilePanelBarLabel();
syncFloodFilterControl();
advanceStep(1);
