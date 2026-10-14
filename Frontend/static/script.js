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
// The destination field's "Show Evacuation Sites" (flood) makes the
// destination the barangay's evacuation sites instead of a pin: the run
// picks the site, as in earthquake mode.
let floodEvacSites = [];
let floodToEvacSite = false;
let mapLayers = { boundaries: [], routes: [], routeGroups: [] };
let activeInfoWindow = null;
let selectedRouteFocus = null;
let workflowFocusSection = null;
let simulationInProgress = false;
let floodHazardOverlayMode = 'all';
// Barangay names the homepage's quick-start card hands over in ?barangay=...;
// must match its data-barangay values exactly.
const SUPPORTED_QUICKSTART_BARANGAYS = ['Pinagbuhatan', 'Sta. Lucia'];
const activeInfoWindowRef = { current: null };
const loaderState = {
  current: 0,
  target: 0,
  frameId: null,
};
const LOADER_FADE_OUT_MS = 260;
// style.css's .app grid-template-columns transition (the docked panels).
const PANEL_SLIDE_MS = 220;
const LOADER_ROUTE_STAGE_RANGE = [22, 76];
const THEME_STORAGE_KEY = 'disaster-route-sim-theme';
const HAZARD_SELECTION_CLASSES = ['flood', 'earthquake'];
const EARTHQUAKE_SUPPORTED_BARANGAY_SCOPE = 'Pinagbuhatan and Sta. Lucia';
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

// Runs `update` inside a same-page view transition (a quick cross-fade of
// what it changes) where supported and motion is welcome; otherwise as is.
function withViewTransition(update) {
  if (typeof document.startViewTransition !== 'function' || prefersReducedMotion()) {
    update();
    return;
  }
  try {
    document.startViewTransition(update);
  } catch (err) {
    update();
  }
}

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

// The barangay outline is drawn like the best route (osm.js): a slim line
// with a thin edge in a darker shade of its own color, a size smaller than
// the route so the route still reads first (px; the edge adds 1px per side).
const BARANGAY_BOUNDARY_WEIGHT = 3;
const BARANGAY_BOUNDARY_EDGE_EXTRA_WEIGHT = 2;

// Line and edge color: one dark navy for every hazard, so the outline never
// competes with the orange evacuation pins and hazard fills. Navy disappears
// into the dark satellite imagery, so there the line turns light blue and
// keeps the navy as its edge.
const BARANGAY_BOUNDARY_COLORS = { line: '#1e3a8a', edge: '#172554' };
const BARANGAY_BOUNDARY_SATELLITE_COLORS = { line: '#93c5fd', edge: '#1e3a8a' };

// isSatelliteBaseMap (osm.js) says which base map is on.
function getBarangayBoundaryColors() {
  return isSatelliteBaseMap ? BARANGAY_BOUNDARY_SATELLITE_COLORS : BARANGAY_BOUNDARY_COLORS;
}

// Inline style of a legend route swatch, matching its line on the current
// base map: solid with a darker edge (the best route a little heavier), or
// for an available route a row of dots ringed in the edge color, like its
// trail.
function routeLegendSwatchStyle(color, kind = '') {
  const colors = getRouteLineColors(color);
  if (kind === 'available') {
    const dot = `${colors.line} 1.4px, ${colors.edge} 1.6px, ${colors.edge} 2.3px, transparent 2.6px`;
    return `background:radial-gradient(circle, ${dot}) 1px 50% / 7px 100% repeat-x;height:5px;box-shadow:none;`;
  }
  return `background:${colors.line};height:${kind ? 3 : 4}px;box-shadow:0 0 0 1px ${colors.edge};`;
}

function paintLegendSwatch(swatch, colors) {
  swatch.style.background = colors.line;
  swatch.style.boxShadow = `0 0 0 1px ${colors.edge}`;
}

// Recolors the outline, the routes (getRouteLineColors in osm.js) and their
// legend swatches for the new base map.
function onBaseMapChange(event) {
  isSatelliteBaseMap = event.layer === mapBaseLayers?.satellite;
  const colors = getBarangayBoundaryColors();
  mapLayers.boundaries.forEach(layer => {
    if (layer.boundaryRole === 'edge') layer.setStyle({ color: colors.edge });
    else if (layer.boundaryRole === 'main') layer.setStyle({ color: colors.line });
  });
  syncRouteColorsToBaseMap(mapLayers);
  // Trails gain or lose their satellite rim.
  syncRouteFocusStyles();

  document.querySelectorAll('.legend-boundary').forEach(swatch => paintLegendSwatch(swatch, colors));
  document.querySelectorAll('.legend-line--available').forEach(swatch => {
    swatch.style.cssText = routeLegendSwatchStyle(ROUTE_AVAILABLE_COLOR, 'available');
  });
  document.querySelectorAll('.legend-line--eliminated').forEach(swatch => {
    swatch.style.cssText = routeLegendSwatchStyle(ROUTE_ELIMINATED_COLOR, 'eliminated');
  });
  // The phone legend is a copy of the desktop one.
  window.mobileSim?.scheduleSync?.();
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

const darkSchemeQuery = window.matchMedia?.('(prefers-color-scheme: dark)');

function getSavedTheme() {
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    return saved === 'dark' || saved === 'light' ? saved : null;
  } catch (err) {
    return null;
  }
}

// The theme is picked with the homepage's switch (home.js); this page only
// reads that choice, or follows the device's setting when there is none.
function getPreferredTheme() {
  return getSavedTheme() || (darkSchemeQuery?.matches ? 'dark' : 'light');
}

function initTheme() {
  const theme = getPreferredTheme();
  document.body.classList.toggle('dark', theme === 'dark');
  document.documentElement.style.colorScheme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#0a1420' : '#f6f9fd');
  applyHazardTheme();
}

darkSchemeQuery?.addEventListener?.('change', () => {
  if (!getSavedTheme()) initTheme();
});

let emergencyContactReturnFocusEl = null;

function openEmergencyContactModal(event) {
  const modal = document.getElementById('emergencyContactModal');
  if (!modal) return;

  emergencyContactReturnFocusEl = event?.currentTarget instanceof HTMLElement
    ? event.currentTarget
    : document.activeElement;

  modal.classList.remove('is-closing');
  modal.hidden = false;
  window.requestAnimationFrame(() => {
    modal.querySelector('.emergency-modal-close')?.focus({ preventScroll: true });
  });
}

// Hides a dialog after its exit animation (style.css: .is-closing on the
// backdrop), or at once when it has none or motion is reduced. Reopening
// mid-exit just drops .is-closing.
function closeModalAnimated(modal, panelSelector) {
  if (!modal || modal.hidden || modal.classList.contains('is-closing')) return;
  const panel = modal.querySelector(panelSelector) || modal;
  const finish = () => {
    if (!modal.classList.contains('is-closing')) return;
    modal.classList.remove('is-closing');
    modal.hidden = true;
  };
  modal.classList.add('is-closing');
  if (prefersReducedMotion() || getComputedStyle(panel).animationName === 'none') {
    finish();
    return;
  }
  const onEnd = event => {
    if (event.target !== panel) return;
    panel.removeEventListener('animationend', onEnd);
    finish();
  };
  panel.addEventListener('animationend', onEnd);
  window.setTimeout(() => {
    panel.removeEventListener('animationend', onEnd);
    finish();
  }, 320);
}

function closeEmergencyContactModal() {
  const modal = document.getElementById('emergencyContactModal');
  if (!modal || modal.hidden) return;

  closeModalAnimated(modal, '.about-modal');

  const focusTarget = emergencyContactReturnFocusEl;
  emergencyContactReturnFocusEl = null;
  focusTarget?.focus?.({ preventScroll: true });
}

document.getElementById('emergencyContactModal')?.addEventListener('mousedown', event => {
  if (event.target === event.currentTarget) closeEmergencyContactModal();
});

// How long the "outside the barangay" notice stays up; longer than other
// map hints, since the map glides out at the same moment.
const LOCATION_OUTSIDE_HINT_MS = 7000;

// My location from outside the barangay: a short notice in the map hint, and
// the map glides out to the whole barangay so its outline shows where
// location does work.
function showLocationOutsideNotice() {
  // On a phone the map stays where it is (a route or the ants' search may
  // be on it); the notice alone says why nothing moved.
  if (window.mobileSim?.isActive()) {
    window.mobileSim.toast(
      `You're outside ${selectedBarangay || 'this barangay'}. Routes only cover this barangay.`,
      { error: true, durationMs: LOCATION_OUTSIDE_HINT_MS },
    );
    return;
  }
  fitMapToBoundaryPaths(barangayBoundaryRings, 42, { fly: true, duration: RECENTER_FLY_SECONDS });
  showPinHintError(
    `You're outside Brgy. ${selectedBarangay || 'this barangay'}. My location only works inside the outlined area.`,
    { durationMs: LOCATION_OUTSIDE_HINT_MS },
  );
}

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

// Short viewports (style.css: phone landscape, any width) -- setup and
// results are each a full-screen panel here instead of docking side by side
// in a grid column (desktop). Phones and tablets have their own bottom
// sheet instead (mobile-sim.js), which hides both panels.
const MOBILE_PANEL_QUERY = window.matchMedia('(max-height: 499px)');

function applySetupSidebarState(shouldCollapse) {
  const shell = document.getElementById('appShell');
  // This button sits inside .left-panel, so it hides with the panel;
  // #sidebarReopenBtn (outside it) brings the panel back.
  const toggleBtn = document.getElementById('sidebarToggleBtn');
  if (!shell) return;

  shell.classList.toggle('sidebar-collapsed', shouldCollapse);

  if (toggleBtn) {
    toggleBtn.setAttribute('aria-expanded', String(!shouldCollapse));
    toggleBtn.setAttribute('aria-label', shouldCollapse ? 'Show simulation setup' : 'Hide simulation setup');
    const tipLabel = toggleBtn.querySelector('[data-sidebar-tip-label]');
    if (tipLabel) tipLabel.textContent = shouldCollapse ? 'Show sidebar' : 'Hide sidebar';
  }

  // On a short viewport setup and results are each full-screen, so opening
  // setup closes results.
  if (!shouldCollapse && MOBILE_PANEL_QUERY.matches) {
    setRouteSafetyPanelVisible(false);
  }

  // No invalidateSize() here: the ResizeObserver in initMap() watches #map's
  // box and settles once the transition ends.
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

// "Edit setup" (mobile results panel): back to the setup panel, through
// toggleSetupSidebar so focus and the results panel close the usual way.
function openSetupDrawerFromResults() {
  toggleSetupSidebar(true);
}

// Esc (short viewports only): close whichever of setup/results is open (at
// most one is; see applySetupSidebarState).
function closeWorkspaceDrawers() {
  const shell = document.getElementById('appShell');
  if (!shell) return;
  if (!shell.classList.contains('sidebar-collapsed')) {
    toggleSetupSidebar(false);
  } else if (shell.classList.contains('safety-open')) {
    setRouteSafetyPanelVisible(false);
  }
}

// Bottom bar tap (short viewports only): close the open panel, or open the
// relevant one (results after a run, setup before).
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

  // The filter only restyles the map, but a level button reads like a route
  // setting, so the hint says the routes still check every level.
  if (hint) {
    const overlayConfig = getFloodOverlayConfig(floodHazardOverlayMode);
    hint.textContent = overlayConfig.focusVar
      ? `${overlayConfig.label} highlighted on the map. Routes still check every level. Click again to show all.`
      : 'Click a level to highlight it on the map. Routes always check every level.';
  }
  window.mobileSim?.scheduleSync();
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

  // Topmost first: dialogs, the "Choose on Map" menu, pinning, then the mobile
  // setup/results panel.
  if (document.getElementById('emergencyContactModal')?.hidden === false) {
    event.preventDefault();
    closeEmergencyContactModal();
  } else if (document.getElementById('routeListModal')?.hidden === false) {
    event.preventDefault();
    closeRouteListModal();
  } else if (window.mobileSim?.handleEscape()) {
    // Closed the phone layout's Map layers sheet.
    event.preventDefault();
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
    card.setAttribute('aria-disabled', String(interactionLocked));
  });

  // changeHazardBtn/changeRouteBtn are left out: syncWorkflowSummaries() (via
  // advanceStep(), just before this) recomputes their disabled state on every
  // call, and saving/restoring them here too raced with it and could leave them
  // stuck disabled. Pin fields and markers are recomputed from state too.
  syncRoutePinFields();
  syncRoutePinMarkers();
  syncBarangaySwitch();

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
        el.disabled = !canRunCurrentSimulation();
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

// Rows of tiles Leaflet keeps loaded past each edge of the view (its default
// is 2), so panning or a panel closing reveals tiles that are already there.
const MAP_TILE_KEEP_BUFFER = 4;
const MAP_TILE_MAX_RETRIES = 3;

// Leaflet never re-requests a tile that failed (a dropped connection or the
// tile server throttling a burst of requests), so it stays a blank square
// for the rest of the visit. Retry it a few times with a growing delay; the
// query string makes the browser actually send a new request.
function retryFailedTiles(layer) {
  layer.on('tileerror', ({ tile, coords }) => {
    const attempt = Number(tile.dataset.retries || 0) + 1;
    if (attempt > MAP_TILE_MAX_RETRIES) return;
    tile.dataset.retries = String(attempt);
    window.setTimeout(() => {
      // Panned out of view meanwhile: Leaflet already dropped this tile.
      if (!tile.isConnected) return;
      tile.src = `${layer.getTileUrl(coords)}?retry=${attempt}`;
    }, 600 * attempt);
  });
  return layer;
}

// How many zoom levels coarser than the view the low-detail copy under each
// base map is (makeBaseMapLayer): 2 levels = 1/16 as many tiles, 4x enlarged.
const BASEMAP_UNDERLAY_LEVELS = 2;
// The base map currently on screen ({ street, satellite } groups).
let mapBaseLayers = null;

// A tile layer that always draws its tiles BASEMAP_UNDERLAY_LEVELS zoom
// levels below the view, enlarged to fit: Leaflet's maxNativeZoom, moved
// along with the zoom the map is at or animating to. GridLayer's _update
// hands an already-coarsened zoom back to _setView when it finds its tiles
// more than a level off, so that call must not coarsen it again (or the two
// keep calling each other until the stack overflows).
const CoarseTileLayer = L.TileLayer.extend({
  initialize(url, options) {
    L.TileLayer.prototype.initialize.call(this, url, options);
    this._finestNativeZoom = this.options.maxNativeZoom ?? Infinity;
  },

  _setView(center, zoom, noPrune, noUpdate) {
    if (!this._inUpdate) {
      this.options.maxNativeZoom = Math.min(
        this._finestNativeZoom,
        Math.max(0, Math.round(zoom) - BASEMAP_UNDERLAY_LEVELS),
      );
    }
    return L.TileLayer.prototype._setView.call(this, center, zoom, noPrune, noUpdate);
  },

  _update(center) {
    const wasInUpdate = this._inUpdate;
    this._inUpdate = true;
    try {
      return L.TileLayer.prototype._update.call(this, center);
    } finally {
      this._inUpdate = wasInUpdate;
    }
  },
});

// A base map as two copies of the same tiles: a low-detail one underneath the
// full-detail one. The few low-detail tiles arrive first and fill the whole
// view, so on a slow connection the map sharpens in place instead of filling
// in square by square over empty grey, and a flight between barangays always
// has a map under it. The full-detail tiles load only once a zoom/flight
// ends (updateWhenZooming: false) instead of for every level passed on the
// way, which they rarely arrive in time for anyway.
function makeBaseMapLayer(url, { maxZoom, maxNativeZoom, attribution }) {
  const underlay = retryFailedTiles(new CoarseTileLayer(url, {
    maxZoom,
    maxNativeZoom,
    keepBuffer: MAP_TILE_KEEP_BUFFER,
    zIndex: 0,
  }));
  const detail = retryFailedTiles(L.tileLayer(url, {
    maxZoom,
    maxNativeZoom,
    keepBuffer: MAP_TILE_KEEP_BUFFER,
    updateWhenZooming: false,
    zIndex: 1,
    attribution,
  }));
  const group = L.layerGroup([underlay, detail]);
  group.underlay = underlay;
  return group;
}

function getActiveBaseMapLayer() {
  if (!gMap || !mapBaseLayers) return null;
  return Object.values(mapBaseLayers).find(layer => gMap.hasLayer(layer)) || null;
}

// Fades out the "Loading map…" cover once the low-detail map is in, so the
// first thing seen is a whole (if soft) map, not tiles popping in one by one.
// Gives up waiting after a couple of seconds on a very slow connection.
function revealMapWhenBaseReady() {
  const cover = document.getElementById('emptyMap');
  if (!cover || cover.hidden || cover.classList.contains('is-leaving')) return;

  const underlay = getActiveBaseMapLayer()?.underlay;
  let revealed = false;
  const reveal = () => {
    if (revealed) return;
    revealed = true;
    underlay?.off('load', reveal);
    window.clearTimeout(fallbackTimer);
    cover.classList.add('is-leaving');
    window.setTimeout(() => {
      cover.hidden = true;
      cover.classList.remove('is-leaving');
    }, prefersReducedMotion() ? 0 : 320);
  };
  const fallbackTimer = window.setTimeout(reveal, 2500);

  if (!underlay || !underlay.isLoading()) {
    reveal();
  } else {
    underlay.on('load', reveal);
  }
}

function initMap() {
  gMap = L.map('map', {
    center: [14.5590, 121.0955],
    zoom: 15,
    zoomControl: false,
    // Fractional zoom levels, so the +/- buttons and the scroll wheel ease
    // instead of jumping.
    zoomSnap: 0.25,
    zoomDelta: 0.5,
    wheelPxPerZoomLevel: 100,
    // Leaflet's own zoom/fade animations; programmatic moves opt out
    // individually through mapMoveOptions() (osm.js). Read once here, like
    // every other Leaflet option, so it applies from the next page load.
    zoomAnimation: !prefersReducedMotion(),
    fadeAnimation: !prefersReducedMotion(),
    markerZoomAnimation: !prefersReducedMotion(),
  });

  const streetLayer = makeBaseMapLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  }).addTo(gMap);

  const satelliteLayer = makeBaseMapLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    // Esri has imagery here only up to zoom 19; its zoom-20 tiles are a
    // grey "Map data not yet available" placeholder. Past 19, Leaflet
    // enlarges the zoom-19 tiles instead of requesting those.
    maxNativeZoom: 19,
    maxZoom: 20,
    attribution: 'Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community',
  });
  mapBaseLayers = { street: streetLayer, satellite: satelliteLayer };

  L.control.zoom({ position: 'topright' }).addTo(gMap);
  // Recenter (recenterMap), under the zoom buttons. Phones and tablets hide
  // the Leaflet controls and have their own (mobile-sim.js).
  const recenterControl = L.control({ position: 'topright' });
  recenterControl.onAdd = () => {
    const bar = L.DomUtil.create('div', 'leaflet-bar map-recenter-control');
    const button = L.DomUtil.create('button', 'map-recenter-btn', bar);
    button.type = 'button';
    button.title = 'Recenter map';
    button.setAttribute('aria-label', 'Recenter map');
    button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3"/><circle cx="12" cy="12" r="3"/></svg>';
    // My location (locateVisitor), in the same bar.
    const locateButton = L.DomUtil.create('button', 'map-recenter-btn map-locate-btn', bar);
    locateButton.type = 'button';
    locateButton.title = 'Go to my location';
    locateButton.setAttribute('aria-label', 'Go to my location');
    locateButton.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="6.5"/><circle cx="12" cy="12" r="2"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3"/></svg>';
    // Otherwise the click also reaches the map and drops a pin.
    L.DomEvent.disableClickPropagation(bar);
    L.DomEvent.on(button, 'click', () => recenterMap());
    L.DomEvent.on(locateButton, 'click', () => locateVisitor({ button: locateButton }));
    return bar;
  };
  recenterControl.addTo(gMap);
  gMap.on('click', onMapClickForPin);
  // Route widths are zoom-scaled (getRouteZoomScale); re-apply them so a
  // zoomed-in route doesn't shrink to a thin line lost in the hazard fills.
  gMap.on('zoomend', syncRouteFocusStyles);
  // collapsed:false keeps the Map/Satellite choice always visible instead of
  // behind a hover icon.
  L.control.layers({ 'Map': streetLayer, 'Satellite': satelliteLayer }, null, { position: 'topright', collapsed: false }).addTo(gMap);
  gMap.on('baselayerchange', onBaseMapChange);
  // The phone layout swaps these from its own Map layers sheet.
  window.mobileSim?.attachMap(gMap, { street: streetLayer, satellite: satelliteLayer });

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

  // Leaflet caches its container size, so anything that resizes #map without
  // resizing the window (a panel opening or collapsing, a breakpoint, the
  // mobile address bar) needs invalidateSize(). A ResizeObserver on the map's
  // box catches all of these; it runs once per frame while the box changes, so
  // tiles fill newly revealed space at once, and only the route refit waits
  // for the size to settle. The map's content stays still on screen while its
  // box changes (invalidateSize() alone keeps the center, sliding the map by
  // half of every change), and the refit after only happens if the route ended
  // up out of view.
  const resizedMapEl = document.getElementById('map');
  let lastMapRect = resizedMapEl.getBoundingClientRect();
  // Scrolling the page (short phones; keepMapInPlace) moves the box on
  // screen with its content, so it only resets the reference point.
  window.addEventListener('scroll', () => {
    lastMapRect = resizedMapEl.getBoundingClientRect();
  }, { passive: true });
  let mapResizeDebounceTimer = null;
  let mapResizeFrame = 0;
  const keepMapContentInPlace = () => {
    if (!gMap) return;
    const rect = resizedMapEl.getBoundingClientRect();
    const dx = rect.left - lastMapRect.left;
    const dy = rect.top - lastMapRect.top;
    lastMapRect = rect;
    gMap.invalidateSize({ pan: false, debounceMoveend: true });
    if (dx || dy) gMap.panBy([dx, dy], { animate: false });
  };
  const mapResizeObserver = new ResizeObserver(() => {
    if (!mapResizeFrame) {
      mapResizeFrame = window.requestAnimationFrame(() => {
        mapResizeFrame = 0;
        keepMapContentInPlace();
      });
    }
    clearTimeout(mapResizeDebounceTimer);
    mapResizeDebounceTimer = window.setTimeout(() => {
      keepMapContentInPlace();
      // A phone visitor who moved the map keeps their view (mobile-sim.js).
      if (!window.mobileSim?.isAutoFitPaused()) refitMapToCurrentRoute({ onlyIfOutOfView: true });
    }, 150);
  });
  mapResizeObserver.observe(resizedMapEl);

  window.addEventListener('resize', syncMapOverlayLayout);
  startApp();
}

// Re-fits the map to the route on screen with the same overlay-aware padding
// as after a run (getMapFitPadding), so a panel opening or closing never
// leaves the route under a panel or the map's overlays.
// onlyIfOutOfView: leave the map alone while the route and pins are still in
// the padded view. flySeconds: glide there (flyToBounds) instead of
// fitBounds, which jumps on any longer move.
function refitMapToCurrentRoute({ onlyIfOutOfView = false, flySeconds = 0 } = {}) {
  if (!gMap || !simData || !Array.isArray(simData.routes) || !simData.routes.length) return false;

  const bestRoute = getBestRoute(simData.routes);
  const routeCoords = getRoutePoints(bestRoute);
  if (!routeCoords.length) return false;

  const isEarthquakeResult = isEarthquakeSimulationResult(simData);
  const pinCoords = normalizePathCoordinates([
    getReadyPin('start'),
    isEarthquakeResult ? null : getReadyPin('end'),
    { lat: bestRoute?.destination_lat, lng: bestRoute?.destination_lng },
  ].filter(Boolean));

  const bounds = L.latLngBounds([...routeCoords, ...pinCoords]);
  const padding = getMapFitPadding();
  if (onlyIfOutOfView && boundsFitInView(bounds, padding)) return true;
  if (flySeconds) {
    gMap.flyToBounds(bounds, mapMoveOptions({ ...padding, duration: flySeconds }));
  } else {
    gMap.fitBounds(bounds, mapMoveOptions(padding));
  }
  return true;
}

// Whether `bounds` lies inside the map's view minus fitBounds-style padding.
function boundsFitInView(bounds, padding) {
  const size = gMap.getSize();
  const [left, top] = padding.paddingTopLeft || padding.padding || [0, 0];
  const [right, bottom] = padding.paddingBottomRight || padding.padding || [0, 0];
  const nw = gMap.latLngToContainerPoint(bounds.getNorthWest());
  const se = gMap.latLngToContainerPoint(bounds.getSouthEast());
  return nw.x >= left && nw.y >= top && se.x <= size.x - right && se.y <= size.y - bottom;
}

// How long Recenter's glide takes: fitBounds only animates short hops and
// snaps on longer moves or big zoom changes.
const RECENTER_FLY_SECONDS = 0.8;

// The recenter button: brings back the view the current step started from
// -- the picked route, else the best route and its pins after a run, and
// the whole barangay before one. On a phone or tablet it also frames the
// ants' search while a replay plays (or picks the walker up again), gives
// the camera back to the app after the visitor moved the map
// (mobile-sim.js), and says what it shows.
function recenterMap() {
  if (!gMap) return;

  if (window.mobileSim?.isActive()) {
    window.mobileSim.resumeAutoFit();
    if (activeReplayController && !activeReplayController.isDone()) {
      const walking = activeReplayController.isWalking();
      // Walking: the follow eases the walker back to its focus point.
      if (!walking) fitReplaySearch({ flySeconds: RECENTER_FLY_SECONDS });
      window.mobileSim.toast(walking ? 'Following the walk on Route 1' : 'Showing the ants\' search');
      return;
    }
    window.mobileSim.toast(simData ? 'Showing full route' : 'Showing the whole barangay');
  }

  const focusedGroup = selectedRouteFocus
    ? (mapLayers.routeGroups || []).find(group => Number(group.routeNo) === Number(selectedRouteFocus.routeNo))
    : null;
  const focusedPath = getRoutePreviewPath(focusedGroup);
  if (focusedPath.length > 1) {
    gMap.flyToBounds(L.latLngBounds(focusedPath), mapMoveOptions({ ...getMapFitPadding(), duration: RECENTER_FLY_SECONDS }));
  } else if (!refitMapToCurrentRoute({ flySeconds: RECENTER_FLY_SECONDS })) {
    fitMapToBoundaryPaths(barangayBoundaryRings, 42, { fly: true, duration: RECENTER_FLY_SECONDS });
  }
}

// "My location" (a control under Recenter on desktop; mobile-sim.js calls in
// for the phone/tablet button). Two requests run at once: a quick, coarse one
// (network or a recent cached fix) moves the map straight away, and a GPS one
// refines the dot after. Only a spot inside the barangay is shown; from
// anywhere else showLocationOutsideNotice explains.
const LOCATE_QUICK_OPTIONS = { enableHighAccuracy: false, timeout: 5000, maximumAge: 5 * 60 * 1000 };
const LOCATE_PRECISE_OPTIONS = { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 };
let visitorLocationLayers = null;
let locateRequestId = 0;

function setLocateBusy(button, busy) {
  if (!button) return;
  button.classList.toggle('is-busy', busy);
  if (busy) button.setAttribute('aria-busy', 'true');
  else button.removeAttribute('aria-busy');
}

function showVisitorLocation(latlng, accuracy) {
  if (!visitorLocationLayers) {
    visitorLocationLayers = {
      accuracy: L.circle(latlng, {
        radius: accuracy,
        interactive: false,
        color: '#1d4ed8',
        weight: 1,
        opacity: 0.35,
        fillColor: '#1d4ed8',
        fillOpacity: 0.1,
      }).addTo(gMap),
      dot: L.marker(latlng, {
        icon: L.divIcon({ className: 'visitor-dot', iconSize: [18, 18], iconAnchor: [9, 9] }),
        interactive: false,
        keyboard: false,
        zIndexOffset: 1000,
      }).addTo(gMap),
    };
    return;
  }
  visitorLocationLayers.accuracy.setLatLng(latlng).setRadius(accuracy);
  visitorLocationLayers.dot.setLatLng(latlng);
}

function clearVisitorLocationLayers() {
  if (!visitorLocationLayers) return;
  visitorLocationLayers.accuracy.remove();
  visitorLocationLayers.dot.remove();
  visitorLocationLayers = null;
}

// Also drops an answer still on its way (a barangay switch).
function clearVisitorLocation() {
  locateRequestId += 1;
  clearVisitorLocationLayers();
}

function flyToVisitor(latlng) {
  gMap.flyToBounds(latlng.toBounds(120), mapMoveOptions({
    ...getMapFitPadding(),
    maxZoom: Math.max(gMap.getZoom(), PIN_PLACEMENT_ZOOM),
    duration: RECENTER_FLY_SECONDS,
  }));
}

// What "My location" says: a short notice on the phone map (mobile-sim.js),
// the pin hint elsewhere.
function showLocateNotice(message, { durationMs } = {}) {
  if (window.mobileSim?.isActive()) window.mobileSim.toast(message, { error: true, durationMs });
  else showPinHintError(message, durationMs ? { durationMs } : undefined);
}

// Each way the browser can fail to give a position (GeolocationPositionError
// codes 1-3); the desktop keeps one message for the last two.
const LOCATE_ERROR_MESSAGES = {
  1: 'Location is blocked for this site. Allow it in your browser, then try again.',
  2: 'Your location isn\'t available right now. Check that location is on, then try again.',
  3: 'Finding your location took too long. Try again in a moment.',
};
const LOCATE_ERROR_FALLBACK = 'Could not get your location. Try again in a moment.';

function getLocateErrorMessage(error) {
  if (error?.code === 1) return LOCATE_ERROR_MESSAGES[1];
  return (window.mobileSim?.isActive() && LOCATE_ERROR_MESSAGES[error?.code]) || LOCATE_ERROR_FALLBACK;
}

function locateVisitor({ button = null, moveTo = flyToVisitor, onFound = null } = {}) {
  if (!gMap) return;
  if (!navigator.geolocation) {
    showLocateNotice('This browser cannot share your location.');
    return;
  }
  if (!barangayBoundaryRings.length) {
    showLocateNotice('The barangay map is still loading. Try again in a moment.');
    return;
  }

  const request = ++locateRequestId;
  let waiting = 2;
  let moved = false;
  let outside = false;
  let preciseAnswered = false;
  let error = null;
  setLocateBusy(button, true);

  const settle = () => {
    waiting -= 1;
    if (waiting > 0 || request !== locateRequestId) return;
    setLocateBusy(button, false);
    if (moved) return;
    if (outside) {
      showLocationOutsideNotice();
    } else {
      showLocateNotice(getLocateErrorMessage(error));
    }
  };

  const onFix = precise => position => {
    if (request !== locateRequestId) return;
    // Once GPS has answered, a late coarse fix has nothing to add.
    if (!precise && preciseAnswered) {
      settle();
      return;
    }
    if (precise) preciseAnswered = true;
    const { latitude, longitude, accuracy } = position.coords;
    const latlng = L.latLng(latitude, longitude);
    if (isPointInsideBarangay(latitude, longitude)) {
      outside = false;
      showVisitorLocation(latlng, accuracy || 0);
      if (!moved) {
        moved = true;
        setLocateBusy(button, false);
        moveTo(latlng);
        onFound?.();
      }
    } else {
      outside = true;
      // A coarse fix can miss a barangay this small, so only GPS takes a
      // shown dot away again.
      if (precise) {
        clearVisitorLocationLayers();
        moved = false;
      }
    }
    settle();
  };

  const onError = err => {
    if (request !== locateRequestId) return;
    error = err;
    settle();
  };

  navigator.geolocation.getCurrentPosition(onFix(false), onError, LOCATE_QUICK_OPTIONS);
  navigator.geolocation.getCurrentPosition(onFix(true), onError, LOCATE_PRECISE_OPTIONS);
}

const BACKEND_CHECK_ATTEMPTS = 6;

// The folded-map mark index.html starts #emptyMapIcon with.
const EMPTY_MAP_ICON_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M9 4.5 3.5 6.8v12.7L9 17.2l6 2.3 5.5-2.3V4.5L15 6.8 9 4.5Z"/><path d="M9 4.5v12.7M15 6.8v12.7"/></svg>';

function setEmptyMapStatus(text, { spinner = true, retry = false } = {}) {
  const icon = document.getElementById('emptyMapIcon');
  const txt = document.getElementById('emptyMapTxt');
  const retryBtn = document.getElementById('emptyMapRetry');
  if (icon) icon.innerHTML = spinner ? '<span class="empty-map-spinner"></span>' : EMPTY_MAP_ICON_SVG;
  if (txt) txt.textContent = text;
  if (retryBtn) retryBtn.hidden = !retry;
}

// A server that is asleep or restarting (a fresh deploy) can take a while to
// answer, so the first check is retried with a growing pause before the page
// gives up -- and then it offers a Try again button instead of an alert.
async function waitForBackend() {
  for (let attempt = 1; attempt <= BACKEND_CHECK_ATTEMPTS; attempt += 1) {
    if (await checkBackend()) return true;
    if (attempt === BACKEND_CHECK_ATTEMPTS) break;
    setEmptyMapStatus('Waking up the server…');
    document.getElementById('statusTxt').textContent = 'Connecting…';
    await waitMs(Math.min(2000 * attempt, 8000));
  }
  return false;
}

async function startApp() {
  if (!(await waitForBackend())) {
    document.getElementById('statusTxt').textContent = 'Backend Offline';
    setEmptyMapStatus('Could not reach the server.', { spinner: false, retry: true });
    return;
  }

  setEmptyMapStatus('Loading map…');
  await bootstrapBarangayFromUrl();
}

function retryBackendConnection() {
  setEmptyMapStatus('Connecting…');
  startApp();
}

// The homepage's quick-start card sends the barangay as ?barangay=..., loaded
// here so the workflow opens on the "Disaster" step. A missing or unknown
// value means the visitor skipped the homepage picker, so they go back to it.
async function bootstrapBarangayFromUrl() {
  const requested = new URLSearchParams(window.location.search).get('barangay') || '';

  if (!SUPPORTED_QUICKSTART_BARANGAYS.includes(requested)) {
    window.location.replace('/#heroBarangaySelector');
    return;
  }

  // Read before loading the barangay, which clears the stored copy.
  const session = readSimulationSession();
  await selectBarangay(requested);
  await restoreSimulationSession(session);
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

// keepBoundary: a hazard switch keeps the barangay's outline and mask.
function clearLayers({ keepBoundary = false } = {}) {
  clearRouteAnimation();
  const boundaries = keepBoundary ? mapLayers.boundaries : [];
  if (!keepBoundary) clearBoundaryLayers();
  mapLayers.routes.forEach(layer => layer.remove());
  mapLayers = { boundaries, routes: [], routeGroups: [] };
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

// Every route here is walked (GRAPH_NETWORK_TYPE is 'walk' on the backend):
// an average walking pace on dry roads, for flood and earthquake results.
const WALKING_SPEED_METERS_PER_MINUTE = 5000 / 60; // 5 km/h

// Wading is slower. Mean speeds of 188 adults in Li et al. (2026), Table 1:
// 1.69 m/s on dry ground, 0.99 m/s in 0.35 m of water (below the knee, for
// Low, up to 0.5 m) and 0.79 m/s at 0.90 m (waist deep, the deepest they
// tested, for Medium and High). Each class walks at that share of the dry
// pace. They were young adults told to hurry, in still, clear water, so real
// evacuees will be slower still.
const FLOOD_WALKING_PACE_SHARE_BY_VAR = {
  1: 0.99 / 1.69,
  2: 0.79 / 1.69,
  3: 0.79 / 1.69,
};

// Metres of a flood route in each flood class it crosses; none for an
// earthquake route or a result from before the backend sent them.
function getRouteWadingDistances(route) {
  if (isEarthquakeRouteRecord(route)) return {};
  const distances = route?.flood_var_distances;
  return distances && typeof distances === 'object' ? distances : {};
}

function getRouteWalkingMinutes(route) {
  const distance = Number(route?.distance);
  if (!Number.isFinite(distance) || distance < 0) return null;
  let minutes = distance / WALKING_SPEED_METERS_PER_MINUTE;
  Object.entries(getRouteWadingDistances(route)).forEach(([floodVar, meters]) => {
    const share = FLOOD_WALKING_PACE_SHARE_BY_VAR[floodVar];
    const wading = Number(meters);
    if (share && wading > 0) {
      minutes += (wading / WALKING_SPEED_METERS_PER_MINUTE) * (1 / share - 1);
    }
  });
  return minutes;
}

function routeHasWadingTime(route) {
  return Object.values(getRouteWadingDistances(route)).some(meters => Number(meters) > 0);
}

function formatRouteWalkingDuration(route, fallback = 'N/A') {
  return formatWalkingMinutes(getRouteWalkingMinutes(route), fallback);
}

function formatWalkingMinutes(totalMinutes, fallback = 'N/A') {
  if (!Number.isFinite(totalMinutes) || totalMinutes < 0) {
    return fallback;
  }

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

// The map label on a route line (bindRouteEtaLabel in osm.js): the same
// "Route N" as the results panel, then walking time over distance.
function buildRouteEtaLabel(route) {
  const duration = route?.display_duration || formatRouteWalkingDuration(route, '');
  if (!duration) return '';
  const category = ['best', 'available', 'eliminated'].includes(route?.category) ? route.category : 'eliminated';
  const isBest = route === getBestRoute(Array.isArray(simData?.routes) ? simData.routes : []);
  const tag = isBest ? getTopRouteName(route) : category === 'eliminated' ? 'Unsafe' : '';
  const name = route?.display_route_no != null
    ? `Route ${route.display_route_no}${tag ? ` · ${tag}` : ''}`
    : tag;
  const caution = isBest && getRouteSafetyTier(route) === 'caution' ? ' route-eta--caution' : '';
  return `<div class="route-eta route-eta--${category}${caution}">
    ${safetyIcon('walk')}
    <div class="route-eta-text">
      ${name ? `<em class="route-eta-name">${escapeHtml(name)}</em>` : ''}
      <strong>${escapeHtml(duration)}</strong><span>${escapeHtml(route?.display_distance || '')}</span>
    </div>
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
      return 'Medium';
    case 1:
    default:
      return 'Low';
  }
}

function getRiskLevelLabelFromScore(hazardValue) {
  const numericHazard = Number(hazardValue);
  if (!Number.isFinite(numericHazard)) return 'Unknown';
  if (numericHazard >= 4) return 'High';
  if (numericHazard >= 3) return 'Moderate';
  return 'Low';
}

function formatFloodPeakRisk(route) {
  const vars = Array.isArray(route?.flood_vars_encountered) ? route.flood_vars_encountered : [];
  if (vars.length) {
    return getFloodRiskLabelFromVar(Math.max(...vars));
  }

  // Project NOAH's class names: Medium, not the earthquake scale's Moderate.
  const score = Number(route?.max_hazard);
  if (!Number.isFinite(score)) return 'Unknown';
  return score >= 5 ? 'High' : score >= 3 ? 'Medium' : 'Low';
}

// Project NOAH's flood depth classes (Var 1/2/3). The layers carry only the
// class, not a measured depth, so a road's water can be anywhere in its range.
const FLOOD_DEPTH_RANGE_BY_VAR = {
  1: 'up to 0.5 m',
  2: '0.5–1.5 m',
  3: 'over 1.5 m',
};

// The same classes against a person, as on the homepage's flood-depth scene
// (a 163 cm adult: knees at about 0.46 m, neck at about 1.42 m).
const FLOOD_DEPTH_ON_ADULT_BY_VAR = {
  1: 'Up to knee-deep on an adult',
  2: 'Knee- to neck-deep on an adult',
  3: 'Above neck height on an adult',
};

function getFloodDepthRangeFromVar(varValue) {
  return FLOOD_DEPTH_RANGE_BY_VAR[Number(varValue)] || FLOOD_DEPTH_RANGE_BY_VAR[1];
}

// The worst flood class a route crosses: 1-3, or 0 when it touches no flood
// zone at all. A road outside every zone is level 1 too, but there the flood
// model shows no water, so calling it "Low, up to 0.5 m" would overstate it.
// A road with no hazard data (level 5) counts as High.
function getFloodPeakVar(route) {
  const vars = Array.isArray(route?.flood_vars_encountered) ? route.flood_vars_encountered.map(Number) : [];
  if (vars.length) return Math.max(...vars);
  const score = Number(route?.max_hazard);
  if (!Number.isFinite(score)) return null;
  return score >= 5 ? 3 : score >= 3 ? 2 : 0;
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
  if (getFloodPeakVar(route) === 0) return 'No flooding';
  return `${formatFloodPeakRisk(route)} (${getFloodPeakDepthRange(route)})`;
}

// A flood route has three outcomes, not two. High water (over 1.5 m) rules
// it out. Medium water (0.5–1.5 m) is not called safe either: it is unsafe
// for children and older adults past 0.5 m and for anyone past 1.2 m (AIDR
// Flood Hazard Guideline 7-3, 2017, classes H3/H4), so the route is a "Risky
// route": passable, but not safe for everyone. "Risky" means Medium water
// only; High water is a "high-hazard area". Earthquake routes are safe or not.
function getRouteSafetyTier(route) {
  if (!route || route.category === 'eliminated') return 'unsafe';
  if (!isEarthquakeRouteRecord(route) && Number(route.max_hazard) >= 3) return 'caution';
  return 'safe';
}

// A flood route that touches no flood zone at all. Earthquake routes never
// are: every road in the coverage area has a shaking and liquefaction level.
function isFloodFreeRoute(route) {
  return !isEarthquakeRouteRecord(route) && getFloodPeakVar(route) === 0;
}

// Route 1's name says how risky it is, and the names climb with the danger:
// Best, Low risk (or Moderate risk), Risky, High risk. Only a flood route
// that touches no flood zone is "Best". A green route that crosses Low water
// (up to 0.5 m) or, for an earthquake, Moderate-risk roads is named by the
// highest risk it meets: "Low risk" or "Moderate risk". Through Medium water
// it is "Risky", like its amber line and verdict. With no safe route it is
// "High risk", like its red line: still the least dangerous one found (the
// ranking is safety first), but named so it never reads safer than "Risky".
function getTopRouteName(route) {
  const tier = getRouteSafetyTier(route);
  if (tier === 'caution') return 'Risky';
  if (tier === 'unsafe') return 'High risk';
  if (isFloodFreeRoute(route)) return 'Best';
  return isEarthquakeRouteRecord(route) && Number(route?.max_hazard) >= 3 ? 'Moderate risk' : 'Low risk';
}

// The name in front of "route": "Best route", "Low-risk route", "Risky
// route", "High-risk route".
function getTopRouteTitle(route) {
  return `${getTopRouteName(route).replace(/ risk$/, '-risk')} route`;
}

const ROUTE_VERDICTS = {
  safe: { title: 'Low-risk route found', card: 'success', icon: 'shield' },
  caution: { title: 'Risky route', card: 'warning', icon: 'alert' },
  unsafe: { title: 'No safe route', card: 'danger', icon: 'alert' },
};

// The verdict a result's route 1 gets. A green route is "found" under its
// own name, so an earthquake one over Moderate-risk roads says so. When the
// risk covers the whole barangay, "No safe route" alone reads like a fault,
// so the verdict names the cause.
function getRouteVerdictTitle(route) {
  const tier = getRouteSafetyTier(route);
  if (tier === 'safe') return `${getTopRouteTitle(route)} found`;
  return isAreaWideHighRisk(route) ? 'High risk on every route' : ROUTE_VERDICTS[tier].title;
}

const AREA_WIDE_LAYER_NAMES = {
  ground_shaking: 'ground shaking',
  liquefaction: 'liquefaction risk',
};

// The earthquake layers above the safety limit on (almost) every road of the
// barangay, for this route's view, with their share of the road length
// (area_wide_high_risk, earthquake_service.py). PHIVOLCS rates each
// barangay's ground shaking as one high zone, so no route avoids it.
function getAreaWideHighRisk(route) {
  if (!isEarthquakeRouteRecord(route)) return {};
  const layers = route?.area_wide_high_risk;
  return layers && typeof layers === 'object' ? layers : {};
}

function isAreaWideHighRisk(route) {
  return getRouteSafetyTier(route) === 'unsafe'
    && Object.keys(getAreaWideHighRisk(route)).some(layer => AREA_WIDE_LAYER_NAMES[layer]);
}

// "High ground shaking covers every road in Brgy. Sta. Lucia, so no route
// can avoid it."
function describeAreaWideHighRisk(route, barangay = selectedBarangay) {
  const layers = Object.entries(getAreaWideHighRisk(route)).filter(([layer]) => AREA_WIDE_LAYER_NAMES[layer]);
  const names = layers.map(([layer]) => AREA_WIDE_LAYER_NAMES[layer]);
  const several = names.length > 1;
  const everyRoad = layers.every(([, share]) => Number(share) >= 0.995) ? 'every road' : 'almost every road';
  const place = barangay ? `Brgy. ${barangay}` : 'this barangay';
  return `High ${names.join(' and high ')} ${several ? 'cover' : 'covers'} ${everyRoad} in ${place}, so no route can avoid ${several ? 'them' : 'it'}.`;
}

function describeLeastExposedRoute(route) {
  const destination = route?.destination_name ? ` to ${route.destination_name}` : '';
  // A site named for its street ("Sandoval Ave.") already ends the sentence.
  const end = destination.endsWith('.') ? '' : '.';
  return `Route ${route?.display_route_no ?? 1} is the least exposed way${destination}${end} Once the shaking stops, watch for falling debris and damaged buildings on the way.`;
}

// Past about a 12-minute walk (5 km/h), the open area a run suggests is too
// far to reach soon after a quake, when aftershocks and falling debris make
// every extra street a risk; any open space closer by is the better refuge.
const FAR_FROM_OPEN_AREA_METERS = 1000;
const FAR_FROM_OPEN_AREA_NOTE = 'If you are far from the suggested open area, move immediately to the nearest open area once the shaking stops.';

function isFarFromOpenArea(route) {
  return isEarthquakeRouteRecord(route) && Number(route?.distance) > FAR_FROM_OPEN_AREA_METERS;
}

// How many routes are green, in words that don't call them "safe" either:
// "low risk" for flood, or "no flood zone" when none of them touches one
// (dryCount, isFloodFreeRoute); for an earthquake, where green allows
// Moderate-risk roads, "no high-risk roads".
function describeGreenRouteCount(count, isEarthquake, { total = null, dryCount = 0 } = {}) {
  const one = count === 1;
  if (isEarthquake) {
    if (total === 1) return 'It has no high-risk roads.';
    if (total === count) return 'None of them has high-risk roads.';
    return `${count} ${one ? 'has' : 'have'} no high-risk roads.`;
  }
  if (total === 1 && dryCount === 1) return 'It crosses no flood zone.';
  if (total === count && dryCount === count) return 'None of them crosses a flood zone.';
  if (total === 1) return 'It is low risk.';
  if (total === count) return 'All are low risk.';
  return `${count} ${one ? 'is' : 'are'} low risk.`;
}

function formatGreenRouteTally(count, isEarthquake) {
  return `${count} ${isEarthquake ? 'without high-risk roads' : 'low risk'}`;
}

function getMediumFloodDistance(route) {
  return Number(route?.hazard_distances?.['3']) || 0;
}

const MEDIUM_FLOOD_WARNING = 'Not safe for children, older adults, PWDs, pregnant women, or in flowing water.';

// What to do when no route is safe, shown in place of route 1's walking time
// (results panel, phone sheet, PDF). A flood route is unsafe only through
// High water, over 1.5 m (above an adult's neck), so nobody should walk it.
// After an earthquake the route is still the way to the evacuation site once
// the shaking stops; most of these results are red because one high-risk
// zone covers the whole barangay, not because the walk is impossible.
const NO_SAFE_ROUTE_ACTIONS = {
  flood: {
    title: "Don't walk. Call for rescue.",
    detail: 'In this flood, every route crosses water over 1.5 m deep. Stay somewhere high and dry, and contact your barangay or the Pasig City DRRMO for rescue.',
  },
  earthquake: {
    title: 'Walk with care once the shaking stops.',
    detail: 'Expect aftershocks. Keep clear of cracked roads, fallen wires and damaged buildings, and call for help if anyone is hurt or trapped.',
  },
};

function getNoSafeRouteAction(route) {
  if (getRouteSafetyTier(route) !== 'unsafe') return null;
  return NO_SAFE_ROUTE_ACTIONS[isEarthquakeRouteRecord(route) ? 'earthquake' : 'flood'];
}

// Called only for a "Risky route" result, whose route 1 is not "best".
function describeMediumFloodCrossing(route) {
  const distance = getMediumFloodDistance(route);
  const name = `Route ${route?.display_route_no ?? 1}`;
  const depth = `0.5–1.5 m deep, ${FLOOD_DEPTH_ON_ADULT_BY_VAR[2].toLowerCase()}`;
  return distance > 0
    ? `${name} has about ${formatDistanceCompact(distance)} of medium flood water (${depth}).`
    : `${name} has some medium flood water (${depth}).`;
}

// How much of a no-safe-route result's route 1 is above the safety limit, in
// meters like the route rows ("485 m unsafe"), not a count of road pieces:
// one street can be one piece or eight, depending on how OpenStreetMap
// splits it.
// A flood route ends there (the "What to do" card says not to walk it); an
// earthquake one adds how to walk it.
function describeUnsafeCrossing(route) {
  const unsafe = Number(route?.unsafe_distance) || 0;
  const total = Number(route?.distance) || 0;
  const name = `Route ${route?.display_route_no ?? 1}`;
  const advice = isEarthquakeRouteRecord(route) ? ` ${NO_SAFE_ROUTE_ACTIONS.earthquake.title}` : '';
  if (unsafe <= 0) return `${name} still passes through a high-hazard area.${advice}`;
  return total > 0 && unsafe >= total * 0.98
    ? `All of ${name} (${formatDistanceCompact(total)}) is in a high-hazard area.${advice}`
    : `${name} still crosses about ${formatDistanceCompact(unsafe)} of high-hazard area.${advice}`;
}

const EARTHQUAKE_LAYER_NAMES = {
  ground_shaking: 'Ground shaking',
  liquefaction: 'Liquefaction',
};

// Route 1's level per earthquake layer the lens routes by (both for the
// overall view, its own for the others, like area_wide_high_risk), with how
// much of the route is High: "High · all 876 m", "High · 620 m of 876 m".
// hazard_maxima and lens_unsafe_distances come from earthquake_service.py.
function getEarthquakeHazardRows(route) {
  const lens = route?.lens_key;
  const total = Number(route?.distance) || 0;
  return Object.keys(EARTHQUAKE_LAYER_NAMES)
    .filter(layer => !lens || lens === 'overall' || lens === layer)
    .map(layer => {
      const level = getRiskLevelLabelFromScore(route?.hazard_maxima?.[layer]);
      if (level === 'Unknown') return null;
      const high = Number(route?.lens_unsafe_distances?.[layer]) || 0;
      let extent = '';
      if (level === 'High' && total > 0 && high > 0) {
        extent = high >= total * 0.98
          ? `all ${formatDistanceCompact(total)}`
          : `${formatDistanceCompact(high)} of ${formatDistanceCompact(total)}`;
      }
      return { name: EARTHQUAKE_LAYER_NAMES[layer], level, extent };
    })
    .filter(Boolean);
}

// The "peak" row of the route safety panel, the phone sheet and the PDF
// report. A flood row's detail says how high that water reaches on a person.
// An earthquake row lists each hazard on route 1 instead of a bare "High
// road risk", which only repeated the verdict.
function getPeakRiskRow(route, isEarthquake) {
  if (isEarthquake) {
    const items = getEarthquakeHazardRows(route);
    if (items.length) return { label: `Hazards on Route ${route?.display_route_no ?? 1}`, items };
    return { label: 'Peak road risk crossed', value: `${getRiskLevelLabelFromScore(route?.max_hazard)} road risk` };
  }
  const label = 'Peak flood level crossed';
  const peakVar = getFloodPeakVar(route);
  if (peakVar === 0) return { label, value: 'None', detail: 'No flood zone along this route' };
  if (peakVar == null) return { label, value: 'Unknown' };
  return {
    label,
    value: `${getFloodRiskLabelFromVar(peakVar)}, ${getFloodDepthRangeFromVar(peakVar)} deep`,
    detail: FLOOD_DEPTH_ON_ADULT_BY_VAR[peakVar],
  };
}

// The peak row as one line of text: the phone's verdict line.
function formatPeakRiskSentence(peak) {
  if (peak.items) {
    return `${peak.label}: ${peak.items.map(item => `${item.name.toLowerCase()} ${item.level.toLowerCase()}${item.extent ? ` (${item.extent})` : ''}`).join(' and ')}.`;
  }
  return `${peak.label}: ${peak.value}.${peak.detail ? ` ${peak.detail}.` : ''}`;
}

// The peak row's value for the PDF report's table.
function formatPeakRiskValue(peak) {
  if (peak.items) return peak.items.map(item => `${item.name}: ${item.level}${item.extent ? `, ${item.extent}` : ''}.`).join(' ');
  return peak.detail ? `${peak.value}. ${peak.detail}.` : peak.value;
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
    // The backend labels the top eliminated route "Best" only when no route
    // is safe; residents see it as "High risk" (getTopRouteName).
    if (route?.status === 'Best') {
      return unsafeSections > 0
        ? `High-risk route${destinationNote}, the least dangerous one found, but ${formatRoadPartCountLabel(unsafeSections)} ${unsafeSections === 1 ? 'is' : 'are'} above the safety limit.`
        : `High-risk route${destinationNote}, the least dangerous one found, but some road parts are above the safety limit.`;
    }

    return unsafeSections > 0
      ? `Not recommended${destinationNote}. ${formatRoadPartCountLabel(unsafeSections)} ${unsafeSections === 1 ? 'is' : 'are'} above the safety limit.`
      : isEarthquakeRoute
      ? `Not recommended${destinationNote} because some road parts have high earthquake risk.`
      : 'Not recommended because some road parts have high flood risk.';
  }

  if (route?.category === 'best') {
    return `${getTopRouteTitle(route)}${destinationNote}. It is the top choice in this result.`;
  }

  if (route?.category === 'available') {
    return 'Available route, but another option is a better match in this result.';
  }

  return route?.reason || 'Route explanation unavailable.';
}

function getUserFriendlyRankingExplanation() {
  return 'The safest routes are shown first. If two routes have similar risk, the system checks which one it prefers, then looks at distance.';
}

// The ant colony's numbers for a result (flood: result.aco; earthquake: the
// active lens's, copied there by hydrateActiveEarthquakeView).
function getAcoStats(result = simData) {
  return result?.aco && Number(result.aco.ants_sent) > 0 ? result.aco : null;
}

function formatCount(value) {
  return Number(value || 0).toLocaleString('en-US');
}

// Plain-language line for the results (residents read it, so no "ACO"):
// the ant search is how the routes were found -- shown on purpose, since it
// is the heart of the system.
function buildAntSearchNote(result = simData) {
  const aco = getAcoStats(result);
  if (!aco) return '';
  const ants = formatCount(aco.ants_sent_all_sites ?? aco.ants_sent);
  const best = getBestRoute(Array.isArray(result?.routes) ? result.routes : []);
  if (best?.found_by === 'shortest_path') {
    return `${ants} virtual ants searched the streets, but a regular map search found a safer route, so that one is shown first.`;
  }
  return `${ants} virtual ants searched the streets. The safest route is shown first.`;
}

const ACO_BASELINE_COMPARISON_TEXT = {
  same_route: 'the ants found the same route as the shortest-path check',
  equally_safe: 'as safe as the shortest-path check, on different streets',
  aco_safer: 'safer than the shortest-path check',
  baseline_safer: 'the shortest-path check was safer, so its route is shown first',
  aco_found_nothing: 'no ant reached the destination, so the shortest-path check is shown',
};

const ROUTE_FOUND_BY_TEXT = {
  aco: 'Ant colony',
  shortest_path: 'Shortest-path check',
  backup_search: 'Backup search',
};

// Where a result's hazard levels and roads come from. The results panels link
// to these; the PDF report also links to the About page's full list
// (#data-sources in about.html, which lists the same links).
const DATA_SOURCES_PAGE_PATH = '/about#data-sources';
const DATA_SOURCES = {
  noah: { name: 'Project NOAH', url: 'https://noah.up.edu.ph/' },
  phivolcs: { name: 'PHIVOLCS', url: 'https://www.phivolcs.dost.gov.ph/' },
  hazardHunter: { name: 'HazardHunterPH', url: 'https://hazardhunter.georisk.gov.ph/' },
  aidr: { name: 'AIDR Flood Hazard Guideline 7-3', url: 'https://knowledge.aidr.org.au/media/3518/adr-guideline-7-3.pdf' },
  osm: { name: 'OpenStreetMap', url: 'https://www.openstreetmap.org/copyright' },
};

function buildSourceLink(text, url) {
  return `<a class="src-link" href="${escapeHtml(url)}" target="_blank" rel="noopener">${escapeHtml(text)}</a>`;
}

// The results' source line, as HTML. New tab for every link: leaving the
// simulator would drop the simulation.
function buildHazardSourceNoteHtml(isEarthquake) {
  const { noah, phivolcs, hazardHunter } = DATA_SOURCES;
  return isEarthquake
    ? `Earthquake risk levels come from ${buildSourceLink(phivolcs.name, phivolcs.url)} maps on ${buildSourceLink(hazardHunter.name, hazardHunter.url)}.`
    : `Flood levels come from the ${buildSourceLink(noah.name, noah.url)} 25-year flood map. They are estimates, not live conditions.`;
}

// The PDF report's sources: what this simulation used, each with its link.
function getReportDataSources(isEarthquake) {
  const { noah, hazardHunter, aidr, osm } = DATA_SOURCES;
  const hazardRows = isEarthquake
    ? [{ label: 'Liquefaction & ground shaking', text: 'PHIVOLCS hazard maps on HazardHunterPH, traced by the team', url: hazardHunter.url }]
    : [
      { label: 'Flood hazard levels', text: 'Project NOAH 25-year flood hazard map (a modeled scenario, not live conditions)', url: noah.url },
      { label: 'Walking limits in flood water', text: aidr.name, url: aidr.url },    ];
  return [
    ...hazardRows,
    { label: 'Road network', text: 'OpenStreetMap contributors, under the Open Database License', url: osm.url },
  ];
}

// The PDF's fuller account of the search (the report can be technical).
function buildAcoReportSummary(result = simData) {
  const aco = getAcoStats(result);
  if (!aco) return '';
  const parts = [
    `${formatCount(aco.ants_arrived)} of ${formatCount(aco.ants_sent)} ants reached the destination over ${aco.rounds} rounds`
      + (aco.alternative_colonies ? `, plus ${aco.alternative_colonies} colonies searching for alternatives` : ''),
  ];
  if (aco.sites_searched > 1) {
    parts.push(`${formatCount(aco.ants_sent_all_sites)} ants across ${aco.sites_searched} evacuation sites`);
  }
  const comparison = ACO_BASELINE_COMPARISON_TEXT[aco.best_vs_shortest_path];
  const best = getBestRoute(Array.isArray(result?.routes) ? result.routes : []);
  if (comparison) parts.push(`${getTopRouteTitle(best).toLowerCase()}: ${comparison}`);
  return `${parts.join('; ')}.`;
}

// Display strings used by the map popups, the route safety panel, the route
// list and the PDF report.
function decorateRouteForDisplay(route) {
  return {
    ...route,
    display_distance: formatDistanceCompact(route?.distance),
    display_duration: formatRouteWalkingDuration(route),
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

// ---- Simulation jobs (app.py's queue) ----
// A run is submitted once and then polled: the backend runs one simulation at
// a time and queues the rest, so a run may wait its turn (the loader says how
// many are ahead). Polling instead of one long request also lets a reload
// pick the run back up (see saveSimulationSession), and a dropped poll is
// simply retried -- the run itself is never started over.
const SIMULATION_JOB_POLL_MS = 700;
const SIMULATION_SUBMIT_TIMEOUT_MS = 30000;
// Generous: a line of earthquake runs ahead of this one can take minutes.
const SIMULATION_JOB_MAX_WAIT_MS = 20 * 60 * 1000;
const SIMULATION_JOB_MAX_POLL_FAILURES = 10;

function buildBackendRequestError(response, data, fallbackMessage) {
  const error = new Error(data?.message || fallbackMessage);
  error.statusCode = response?.status || 0;
  error.backendCode = data?.code || '';
  return error;
}

async function fetchJsonWithTimeout(url, options = {}, timeoutMs = SIMULATION_SUBMIT_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    const data = await parseBackendJsonResponse(response);
    return { response, data };
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error(`The server did not answer within ${Math.round(timeoutMs / 1000)} seconds.`);
    }
    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

// Random per tab: the backend caps unfinished runs per tab, not per IP, so a
// class on one Wi-Fi can all simulate at once (app.py's queue limits).
const SIMULATION_CLIENT_ID = (() => {
  const key = 'agnas-sim-client-id';
  try {
    const saved = sessionStorage.getItem(key);
    if (saved) return saved;
  } catch (err) {}
  const id = window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  try { sessionStorage.setItem(key, id); } catch (err) {}
  return id;
})();

async function submitSimulationJob(endpoint, payload) {
  const { response, data } = await fetchJsonWithTimeout(window.BACKEND_BASE + endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...payload, async: true, client_id: SIMULATION_CLIENT_ID }),
  });
  if (!response.ok || data?.error === true || !data?.job_id) {
    throw buildBackendRequestError(response, data, 'Could not start the simulation.');
  }
  return data;
}

async function fetchSimulationJob(jobId) {
  const { response, data } = await fetchJsonWithTimeout(
    `${window.BACKEND_BASE}/simulation-jobs/${encodeURIComponent(jobId)}`,
    {},
    15000
  );
  if (!response.ok || data?.error === true) {
    throw buildBackendRequestError(response, data, 'Could not read the simulation status.');
  }
  return data;
}

const waitMs = ms => new Promise(resolve => window.setTimeout(resolve, ms));

// Polls a job until it finishes, handing every status (queued / running) to
// onUpdate. Returns the result, or throws the run's own error message.
async function waitForSimulationJob(job, onUpdate) {
  const deadline = Date.now() + SIMULATION_JOB_MAX_WAIT_MS;
  let view = job;
  let failures = 0;

  for (;;) {
    onUpdate?.(view);
    if (view.state === 'done') return view.result;
    if (view.state === 'failed') {
      throw buildBackendRequestError({ status: view.status_code }, view.result, 'The simulation failed.');
    }
    if (Date.now() > deadline) {
      throw new Error('The simulation is taking unusually long. Try again in a few minutes.');
    }

    await waitMs(SIMULATION_JOB_POLL_MS);
    try {
      view = await fetchSimulationJob(job.job_id);
      failures = 0;
    } catch (error) {
      failures += 1;
      if (error.backendCode === 'job_not_found' || failures >= SIMULATION_JOB_MAX_POLL_FAILURES) throw error;
    }
  }
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

function resetFloodEvacState() {
  floodEvacSites = [];
  floodToEvacSite = false;
  window.floodHazardUI?.clearEvacuationSites();
}

function isFloodToEvacSite() {
  return floodToEvacSite && selectedHazard === 'Flood';
}

// The evacuation site a flood result's routes lead to, while that result
// still matches the setup.
function getFloodResultEvacSite() {
  return hasFloodSimulationResult() && simData.pins_key === getRoutePinsKey()
    ? simData.selected_evacuation_site || null
    : null;
}

function getReadyPin(role) {
  const pin = routePins[role];
  return pin && pin.status === 'ready' ? pin : null;
}

function getActivePinRoles() {
  return isEarthquakeMode() ? ['start'] : PIN_ROLES;
}

function canRunFloodSimulation() {
  return !!(selectedHazard === 'Flood' && getReadyPin('start') && (getReadyPin('end') || isFloodToEvacSite()));
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

// How the Run panel names a pin: its street, or for a spot with no named
// street close by, the nearest one (nearby_street from /check-pin).
function describePinPlace(pin) {
  if (pin.street) {
    return Number(pin.roadDistance) <= PIN_ON_STREET_METERS ? pin.street : `near ${pin.street}`;
  }
  if (pin.nearbyStreet) return `a spot near ${pin.nearbyStreet}`;
  return `the pinned spot (${formatPinCoordinates(pin)})`;
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

// A destination that is the evacuation sites needs no pin, so the map is not
// armed for one.
function getNextUnpinnedRole() {
  return getActivePinRoles().find(role => (
    !routePins[role] && !(role === 'end' && isFloodToEvacSite())
  )) || null;
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
function showPinHintError(message, { durationMs = PIN_HINT_ERROR_MS } = {}) {
  window.clearTimeout(pinHintTimer);
  pinHintMessage = { text: message, isError: true };
  if (!pinPlacementRole) {
    pinHintTimer = window.setTimeout(() => {
      pinHintMessage = null;
      syncPinHint();
    }, durationMs);
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

// Input onclick: open (or close) its menu ("Choose on Map"; the destination's
// also offers the evacuation sites).
function togglePinMenu(role) {
  const menu = document.getElementById(`${role}PinMenu`);
  if (!menu || !canPlaceRoutePins()) return;

  const opening = menu.hidden;
  closePinMenus();
  if (!opening) return;

  menu.hidden = false;
  document.getElementById(`${role}PinBtn`)?.setAttribute('aria-expanded', 'true');
  menu.querySelector('[role^="menuitem"]')?.focus({ preventScroll: true });
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

  if (prefersReducedMotion()) {
    gMap.setView(target, zoom, mapMoveOptions());
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

// Short viewports only: the setup panel covers the whole screen there, so it
// gets out of the way to let the map be tapped.
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
    // No pin: the destination is the evacuation sites, or after a run, the
    // one it picked -- unless the visitor is picking a spot of their own.
    const placingOwn = role === 'end' && !pin && pinPlacementRole === 'end';
    const toEvacSite = role === 'end' && !pin && !placingOwn && isFloodToEvacSite();
    const resultSite = toEvacSite ? getFloodResultEvacSite() : null;
    input.disabled = locked || !canPlaceRoutePins();
    if (input.disabled) {
      document.getElementById(`${role}PinMenu`)?.setAttribute('hidden', '');
      input.setAttribute('aria-expanded', 'false');
    }
    row.classList.toggle('is-placing', pinPlacementRole === role);
    row.classList.toggle('is-set', !!pin || toEvacSite);
    row.classList.toggle('is-evac', toEvacSite);

    value.textContent = pin?.status === 'checking'
      ? 'Checking this spot…'
      : toEvacSite
      ? resultSite?.name || 'Evacuation site'
      : placingOwn
      ? 'Tap the map where you want to go'
      : pin?.label || PIN_ROLE_COPY[role].empty;
    meta.hidden = !pin && !resultSite && !placingOwn;
    meta.textContent = pin
      ? formatPinCoordinates(pin)
      : resultSite
      ? 'Chosen evacuation site'
      : placingOwn
      ? 'Your own destination'
      : '';
    input.title = pin ? `${pin.label || PIN_ROLE_COPY[role].fallbackLabel} (${formatPinCoordinates(pin)})` : '';
  });

  document.getElementById('pinInputs')?.classList.toggle('is-single', isEarthquakeMode());
  syncEndPinMenu();

  // Shown while the route card is collapsed: how to change pins already set.
  const summary = document.getElementById('summaryRoute');
  if (summary) {
    const start = getReadyPin('start');
    const end = getReadyPin('end');
    summary.textContent = !selectedHazard
      ? ''
      : isEarthquakeMode()
      ? (start ? 'Your location is pinned. Drag its pin on the map to change it.' : 'Pin your location on the map.')
      : start && isFloodToEvacSite() && !routePins.end
      ? 'Your location is pinned. Routes lead to the evacuation site with the safest route.'
      : start && end
      ? 'Both points are pinned. Drag a pin on the map to change it.'
      : 'Pin your location and destination on the map.';
  }

  // Most setup changes pass through here; the phone sheet re-reads them all.
  window.mobileSim?.scheduleSync();
}

// The destination menu (flood): the evacuation site with the safest route
// comes first -- it is also the default -- and a spot of one's own second.
function syncEndPinMenu() {
  const evacItem = document.getElementById('endMenuEvacBtn');
  const ownItem = document.getElementById('endMenuOwnLabel');
  if (!evacItem || !ownItem) return;
  const ownPin = !!routePins.end;
  const toEvacSite = !ownPin && isFloodToEvacSite() && pinPlacementRole !== 'end';
  evacItem.textContent = toEvacSite ? 'Show the evacuation sites' : 'Use an evacuation site instead';
  evacItem.setAttribute('aria-checked', String(toEvacSite));
  ownItem.textContent = ownPin ? 'Move my destination on the map' : 'Choose my own destination instead';
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
const PIN_GLIDE_MS = 240;

// Moves a pin's marker to `latlng`: a short glide when it can be seen (a tap
// moving the pin, or a rejected spot sending it back where it was), a jump
// otherwise.
function glideMarkerTo(marker, latlng) {
  const target = L.latLng(latlng);
  if (marker.dragging?._draggable?._moving) return; // under the visitor's finger
  if (marker._glideTarget && marker._glideTarget.equals(target)) return; // already on its way
  window.cancelAnimationFrame(marker._glideFrame);
  marker._glideTarget = null;

  const from = marker.getLatLng();
  const onScreen = gMap.hasLayer(marker) && gMap.getBounds().pad(0.2).contains(from);
  const travel = onScreen ? gMap.latLngToContainerPoint(from).distanceTo(gMap.latLngToContainerPoint(target)) : 0;
  if (travel < 2 || prefersReducedMotion()) {
    marker.setLatLng(target);
    return;
  }

  marker._glideTarget = target;
  const startedAt = performance.now();
  const step = now => {
    const t = Math.min(1, (now - startedAt) / PIN_GLIDE_MS);
    const eased = 1 - (1 - t) ** 3;
    marker.setLatLng(L.latLng(
      from.lat + (target.lat - from.lat) * eased,
      from.lng + (target.lng - from.lng) * eased,
    ));
    if (t < 1) {
      marker._glideFrame = window.requestAnimationFrame(step);
    } else {
      marker._glideTarget = null;
    }
  };
  marker._glideFrame = window.requestAnimationFrame(step);
}

// The map marker for a route pin: the same pin over a ground shadow, in
// parts that move on their own ("ROUTE PINS" in style.css), so it drops in
// with a bounce and lifts off its shadow while dragged, like the phone's
// center pin.
function makeRoutePinMarkerIcon(role) {
  const { iconUrl, iconSize, iconAnchor } = makeRouteEndpointPinIcon(role).options;
  return L.divIcon({
    className: 'route-pin',
    html: '<span class="route-pin-shadow"></span>'
      + `<span class="route-pin-body"><img class="route-pin-img" src="${iconUrl}" alt="" draggable="false"></span>`,
    iconSize,
    iconAnchor,
  });
}

// Lengths of routePinDrop and routePinLand in style.css.
const PIN_DROP_MS = 620;
const PIN_LAND_MS = 380;

function playPinAnimation(marker, className, durationMs) {
  const el = marker?.getElement();
  if (!el || prefersReducedMotion()) return;
  el.classList.remove('route-pin-drop', 'route-pin-land');
  void el.offsetWidth;
  el.classList.add(className);
  window.clearTimeout(el._pinAnimationTimer);
  el._pinAnimationTimer = window.setTimeout(() => el.classList.remove(className), durationMs + 60);
}

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

    const isNewMarker = !marker;
    if (!marker) {
      marker = L.marker({ lat: pin.lat, lng: pin.lng }, {
        zIndexOffset: role === 'start' ? 3600 : 3500,
        icon: makeRoutePinMarkerIcon(role),
        draggable: true,
        autoPan: true,
        keyboard: false,
      });
      marker.on('dragstart', () => {
        activeInfoWindow?.remove();
        activeInfoWindow = null;
        // Lifted off its shadow while it moves; the shadow marks where the
        // tip will land.
        marker.getElement()?.classList.add('is-lifted');
      });
      marker.on('dragend', () => {
        marker.getElement()?.classList.remove('is-lifted');
        playPinAnimation(marker, 'route-pin-land', PIN_LAND_MS);
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

    // Phone layout: while this pin is being moved, the fixed center pin
    // (mobile-sim.js) stands in for its marker.
    if (window.mobileSim?.isCenterPinRole(role)) {
      marker.setLatLng({ lat: pin.lat, lng: pin.lng });
      marker.remove();
      return;
    }
    if (isNewMarker) marker.setLatLng({ lat: pin.lat, lng: pin.lng });
    else glideMarkerTo(marker, { lat: pin.lat, lng: pin.lng });
    if (!gMap.hasLayer(marker)) {
      marker.addTo(gMap);
      // A new pin drops onto the map and bounces.
      if (isNewMarker) playPinAnimation(marker, 'route-pin-drop', PIN_DROP_MS);
    }
    marker.getElement()?.classList.toggle('route-pin-checking', pin.status === 'checking');
    marker.getElement()?.setAttribute('title', pin.label || PIN_ROLE_COPY[role].fallbackLabel);
    if (draggable) marker.dragging?.enable();
    else marker.dragging?.disable();
  });

  syncFloodEvacMarkers();
}

// The flood evacuation sites on the map while they are the destination, the
// one a run picked marked "CHOSEN".
function syncFloodEvacMarkers() {
  if (!gMap) return;
  window.floodHazardUI?.drawEvacuationSites({
    map: gMap,
    sites: isFloodToEvacSite() ? floodEvacSites : null,
    highlightedSiteId: getFloodResultEvacSite()?.id ?? null,
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

// The pin goes in the request body, not the URL: URLs end up in the hosting
// platform's request logs (app.py's check_pin).
async function fetchPinCheck(lat, lng) {
  const response = await fetch(`${window.BACKEND_BASE}/check-pin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      barangay: selectedBarangay || '',
      hazard: selectedHazard || '',
      lat,
      lng,
    }),
  });
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
    nearbyStreet: check.nearby_street || null,
    roadDistance: Number(check.road_distance),
    label: buildPinLabel(role, check.street, check.road_distance),
  };
  // A pinned destination replaces the evacuation sites.
  if (role === 'end' && floodToEvacSite) {
    floodToEvacSite = false;
    setFloodLegendContent();
  }
  if (pinPlacementRole === role || !pinPlacementRole) {
    setPinPlacementRole(getNextUnpinnedRole());
  }
  onRoutePinsChange();
}

function onMapClickForPin(event) {
  // The phone layout sets pins with its center pin instead.
  if (window.mobileSim?.handleMapTap(event.latlng)) return;
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

  const pinFieldHelp = document.getElementById('pinFieldHelp');
  if (pinFieldHelp) {
    pinFieldHelp.textContent = isEarthquakeMode()
      ? 'Choose on Map, then tap the spot. Drag a pin to adjust it.'
      : 'Routes go to the evacuation site with the safest route. To go somewhere else, click the destination, then Choose my own destination. Drag a pin to adjust it.';
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
  window.mobileSim?.scheduleSync();
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
  simData.aco = nextView.aco || null;
  return nextView;
}

// The map legend's route rows (flood here, earthquake in earthquake.js).
// The best route's swatch takes its line's color (getBestRouteColor in
// osm.js): amber through Medium water, and when no route is safe, the least
// risky eliminated one in solid red, with no available routes.
function buildRouteLegendRows(routes = getCurrentDisplayRoutes()) {
  const row = (swatch, label) => `<div class="legend-row">${swatch}<span style="font-size:.78rem;">${label}</span></div>`;
  // Like the lines on the map (osm.js): solid, with a thin darker edge, and
  // the best route the heavier one. The kind class lets the phone legend
  // (mobile-sim.js) drop the rows for routes not on the map.
  const line = (color, kind = '') => `<div class="legend-line${kind ? ` legend-line--${kind}` : ''}" style="${routeLegendSwatchStyle(color, kind)}"></div>`;
  const eliminatedRow = row(line(ROUTE_ELIMINATED_COLOR, 'eliminated'), 'Eliminated route');
  const availableRow = row(line(ROUTE_AVAILABLE_COLOR, 'available'), 'Available route');
  const best = getBestRoute(routes);
  const bestRow = row(line(best ? getBestRouteColor(best) : ROUTE_BEST_COLOR), best ? getTopRouteTitle(best) : 'Low-risk route');
  if (!best) return bestRow + availableRow + eliminatedRow;

  // Only the kinds of line on the map (the first MAP_ROUTES_SHOWN routes,
  // osm.js) besides the best one: a safe result has no eliminated line, so
  // listing one was wrong. The phone legend already drops them the same way.
  const offMap = new Set(getRoutesOffMap(routes));
  const shownKinds = new Set(routes.filter(route => route !== best && !offMap.has(route)).map(route => route.category));
  return bestRow
    + (shownKinds.has('available') ? availableRow : '')
    + (shownKinds.has('eliminated') ? eliminatedRow : '');
}

// Legend row for the barangay outline, in its current (hazard) colors.
function buildBoundaryLegendRow() {
  const colors = getBarangayBoundaryColors();
  return `<div class="legend-row"><span class="legend-boundary" style="background:${colors.line};box-shadow:0 0 0 1px ${colors.edge};"></span><span style="font-size:.78rem;">Barangay boundary</span></div>`;
}

// A small copy of a map marker for the legend: a teardrop in the marker's
// colors with its letter (the S/E pins, makeRouteEndpointPinIcon) or a
// house (evacuation sites, earthquake.js).
function buildLegendPinSvg(fill, stroke, glyph) {
  const mark = glyph === 'house'
    ? '<path d="M6.6 9.6 10 6.8l3.4 2.8M7.8 9v3.4h4.4V9" fill="none" stroke="#fff" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>'
    : `<text x="10" y="12.4" text-anchor="middle" font-family="Plus Jakarta Sans, Nunito, sans-serif" font-size="8.5" font-weight="800" fill="#fff" stroke="none">${glyph}</text>`;
  return `<svg class="legend-pin" viewBox="0 0 20 24" aria-hidden="true"><path d="M10 1.5C5.6 1.5 2 5 2 9.4c0 5.6 6.3 9.4 8 13.1 1.7-3.7 8-7.5 8-13.1C18 5 14.4 1.5 10 1.5z" fill="${fill}" stroke="${stroke}" stroke-width="1.2"/>${mark}</svg>`;
}

// Same names as the setup panel's Start / End fields.
function buildPinLegendRow(role) {
  const label = role === 'start' ? 'Start' : 'End';
  const pin = role === 'start'
    ? buildLegendPinSvg('#06b6d4', '#155e75', 'S')
    : buildLegendPinSvg('#a855f7', '#6b21a8', 'E');
  return `<div class="legend-row">${pin}<span style="font-size:.78rem;">${label}</span></div>`;
}

function buildFloodEvacLegendRows() {
  const styles = window.floodHazardUI?.evacMarkerStyles;
  if (!styles) return '';
  const row = (style, label) => `<div class="legend-row">${buildLegendPinSvg(style.fill, style.stroke, 'house')}<span style="font-size:.78rem;">${label}</span></div>`;
  return (getFloodResultEvacSite() ? row(styles.chosen, 'Chosen evacuation site') : '')
    + row(styles.site, 'Evacuation site');
}

// Route rows only once a result is on the map: while pinning there are no
// route lines for them to explain.
function setFloodLegendContent() {
  const body = document.getElementById('mapLegendBody');
  if (!body) return;

  const showRouteKeys = hasFloodSimulationResult();
  body.innerHTML = `
    ${showRouteKeys ? buildRouteLegendRows() : ''}
    <div style="margin-top:${showRouteKeys ? '5px' : '0'};">
      ${buildPinLegendRow('start')}
      ${isFloodToEvacSite() ? buildFloodEvacLegendRows() : buildPinLegendRow('end')}
      ${buildBoundaryLegendRow()}
    </div>`;
}

function hasFloodSimulationResult() {
  return !!(simData && !isEarthquakeSimulationResult(simData) && Array.isArray(simData.routes) && simData.routes.length);
}

// Moving a pin after a run drops that run's routes, so the map and safety
// panel never show a route that no longer matches the pins, and puts the map
// back as it was for pinning: barangay outline, no hazard overlay (flood) or
// plain evacuation sites (earthquake), setup panel open with its Run button.
function clearSimulationOutput() {
  if (!simData) return;
  clearSimulationSession();

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
    setFloodLegendContent();
  }

  drawBarangayBoundary();
  reopenSetupSidebar();
}

function clearHazardSelectionState() {
  document.querySelectorAll('.hazard-card').forEach(card => {
    card.classList.remove('selected', ...HAZARD_SELECTION_CLASSES);
    card.setAttribute('aria-pressed', 'false');
  });
}

// Back to an empty setup for the selected barangay: no result, no pins, no
// map layers (loadBarangayMapOnly() redraws the barangay after this).
function clearBarangaySelections({ keepBoundary = false } = {}) {
  clearSimulationSession();
  floodHazardOverlayMode = 'none';
  resetEarthquakeState();
  resetFloodEvacState();
  simData = null;
  selectedRouteFocus = null;
  resetRouteSafetyPanel();
  setResultsSidebarActionsVisible(false);
  clearLayers({ keepBoundary });
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

// How long the barangay-switch flight takes (zoom out from the old barangay,
// then in on the new one).
const BARANGAY_FLY_SECONDS = 1.1;

function fitMapToBoundaryPaths(paths, padding = 42, { fly = false, duration = BARANGAY_FLY_SECONDS } = {}) {
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

  // Phone/tablet layout: fit into the strip between the top bar and the
  // sheet, or beside the tablet's docked panel.
  const covered = window.mobileSim?.getCoveredInsets();
  const fitOptions = covered
    ? {
      paddingTopLeft: [(covered.left || 0) + padding, covered.top + padding],
      paddingBottomRight: [Math.max(padding, (covered.right || 0) + 12), covered.bottom + padding],
    }
    : { padding: [padding, padding] };
  if (fly) {
    // fitBounds can only pan short hops; between barangays it jumps
    // straight there. flyToBounds arcs out and back in instead.
    gMap.flyToBounds(bounds, mapMoveOptions({ ...fitOptions, duration }));
  } else {
    gMap.fitBounds(bounds, mapMoveOptions(fitOptions));
  }
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
  let left = base;
  let right = base;

  ['floodFilterControl', 'earthquakeViewSelector', 'sidebarReopenBtn'].forEach(id => {
    const el = document.getElementById(id);
    if (!el || !el.getClientRects().length) return;
    top = Math.max(top, el.getBoundingClientRect().bottom - mapRect.top + 12);
  });

  // Phone/tablet layout: its top bar, bottom sheet and legend chip, the map
  // buttons on the right, or the tablet's docked panel (those overlays are
  // hidden there). Read from the sheet's target height, not its box, which
  // may still be animating.
  const covered = window.mobileSim?.getCoveredInsets();
  if (covered) {
    top = Math.max(top, covered.top + 12);
    bottom = Math.max(bottom, covered.bottom + 12);
    left = Math.max(left, (covered.left || 0) + 24);
    right = Math.max(right, (covered.right || 0) + 12);
  }
  top += MAP_FIT_MARKER_HEADROOM;

  const legend = document.getElementById('mapLegend');
  if (legend && legend.getClientRects().length) {
    bottom = Math.max(bottom, mapRect.bottom - legend.getBoundingClientRect().top + 12);
  }

  // The gap between the overlays is the only place the route and its pins
  // show, so the padding gives way only when that gap is nearly gone (scaling
  // it down instead put the start pin under the two-row flood filter on
  // 320-360px phones).
  const maxPadding = Math.max(mapRect.height - MAP_FIT_MIN_ROUTE_HEIGHT, mapRect.height / 2);
  if (top + bottom > maxPadding) {
    const scale = maxPadding / (top + bottom);
    top *= scale;
    bottom *= scale;
  }

  return { paddingTopLeft: [left, top], paddingBottomRight: [right, bottom] };
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

  // One move, with the minimum zoom folded in.
  const padding = getMapFitPadding(52);
  const target = gMap._getBoundsCenterZoom(bounds, padding);
  gMap.setView(target.center, Math.max(target.zoom, EARTHQUAKE_MIN_FOCUS_ZOOM), mapMoveOptions({ animate: true }));
  return true;
}

// Outline + outside-mask for barangayBoundaryRings, drawing whichever of the
// two is missing. Both stay on through a run's results; the mask also dims
// the hazard fills outside the barangay.
function drawBarangayBoundary() {
  if (!gMap || !barangayBoundaryRings.length) return;
  const hasRole = role => mapLayers.boundaries.some(layer => layer.boundaryRole === role);

  if (!hasRole('mask')) {
    const scopeMask = buildBarangayScopeMask(barangayBoundaryRings);
    if (scopeMask) {
      scopeMask.addTo(gMap);
      // Under the outline and any routes, also when it returns after them.
      scopeMask.bringToBack();
      scopeMask.boundaryRole = 'mask';
      mapLayers.boundaries.push(scopeMask);
    }
  }

  if (hasRole('main')) return;
  const colors = getBarangayBoundaryColors();
  barangayBoundaryRings.forEach(ring => {
    const lineOptions = {
      opacity: 1,
      lineCap: 'round',
      lineJoin: 'round',
      interactive: false,
      className: 'barangay-boundary-line',
    };
    const edge = L.polyline(ring, {
      ...lineOptions,
      color: colors.edge,
      weight: BARANGAY_BOUNDARY_WEIGHT + BARANGAY_BOUNDARY_EDGE_EXTRA_WEIGHT,
    }).addTo(gMap);
    edge.boundaryRole = 'edge';
    mapLayers.boundaries.push(edge);

    const outline = L.polyline(ring, {
      ...lineOptions,
      color: colors.line,
      weight: BARANGAY_BOUNDARY_WEIGHT,
    }).addTo(gMap);
    outline.boundaryRole = 'main';
    mapLayers.boundaries.push(outline);
  });
}

// Boundary rings per barangay, so switching back and forth doesn't wait on
// the server again.
const barangayBoundaryCache = new Map();
// The barangay currently drawn, to tell a switch (fly over) from a redraw of
// the same one (e.g. after changing hazard).
let shownBarangayMap = null;
let barangayMapLoadToken = 0;

async function fetchBarangayBoundaryRings(bgyName) {
  if (barangayBoundaryCache.has(bgyName)) return barangayBoundaryCache.get(bgyName);

  const res = await fetch(window.BACKEND_BASE + '/barangay-boundary/' + encodeURIComponent(bgyName));
  const data = await res.json();

  if (!res.ok || data.error === true) {
    throw new Error(data.message || 'Failed to load barangay boundary');
  }

  const paths = Array.isArray(data.boundary?.paths) ? data.boundary.paths : [];
  const rings = paths
    .map(path => (path || [])
      .filter(point => point && point.lat != null && point.lng != null)
      .map(point => ({
        lat: Number(point.lat),
        lng: Number(point.lng),
      })))
    .filter(path => path.length >= 3);
  barangayBoundaryCache.set(bgyName, rings);
  return rings;
}

async function loadBarangayMapOnly(bgyName) {
  const loadToken = ++barangayMapLoadToken;
  setMapLegendVisible(false);

  // Fetched before clearing, so the old barangay stays on screen until the
  // new one can replace it instead of leaving an empty map in between.
  let rings = [];
  try {
    rings = await fetchBarangayBoundaryRings(bgyName);
  } catch (err) {
    console.error('Failed to load barangay boundary:', err);
  }
  // A quicker later switch already took over.
  if (loadToken !== barangayMapLoadToken) return;

  clearLayers();
  barangayBoundaryRings = rings;
  if (!rings.length) {
    shownBarangayMap = null;
    return;
  }

  const isSwitch = shownBarangayMap !== null && shownBarangayMap !== bgyName;
  shownBarangayMap = bgyName;
  if (!isSwitch) {
    drawBarangayBoundary();
    fitMapToBoundaryPaths(barangayBoundaryRings, 42);
    return;
  }

  // The outline and outside mask wait for the flight to land and then fade
  // in: drawn mid-flight, Leaflet only repaints them at the end, so they
  // trail behind the map as cut-off grey slabs.
  let drawn = false;
  const drawOnLanding = () => {
    if (drawn) return;
    drawn = true;
    gMap.off('moveend', drawOnLanding);
    window.clearTimeout(fallbackTimer);
    if (loadToken === barangayMapLoadToken) drawBarangayBoundary();
  };
  // In case the flight is cut short without a moveend (a drag takes over).
  const fallbackTimer = window.setTimeout(drawOnLanding, BARANGAY_FLY_SECONDS * 1000 + 400);
  gMap.on('moveend', drawOnLanding);
  fitMapToBoundaryPaths(barangayBoundaryRings, 42, { fly: true });
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
    // The pin's tip sits at (36, 78) in the 72x88 viewBox, which is (24, 53.2)
    // at the 48x60 rendered size.
    iconAnchor: [24, 53],
  });
}

async function selectBarangay(name) {
  if (isSimulationInteractionLocked()) return;

  workflowFocusSection = null;
  selectedBarangay = name;
  syncBarangaySwitch();
  clearBarangaySelections();
  // The visitor may be outside the new barangay: locate again there.
  clearVisitorLocation();
  if (selectedHazard === 'Flood') {
    floodHazardOverlayMode = 'all';
    // The new barangay's evacuation sites are the destination, as on
    // choosing Flood (selectHazard).
    floodToEvacSite = true;
  }

  await loadBarangayMapOnly(name);
  revealMapWhenBaseReady();
  await syncFloodHazardOverlay(name);
  showPinningLegend();
  advanceStep(selectedHazard ? 3 : 2);
  if (selectedHazard) setPinPlacementRole(getNextUnpinnedRole());
  if (selectedHazard === 'Flood') await useFloodEvacSitesByDefault();
  syncRouteInfoBox();
}

// Legend while pinning, before any result: flood shows the pin key;
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
      if (pin) return `${pin.lat},${pin.lng}`;
      return role === 'end' && isFloodToEvacSite() ? 'evacuation-sites' : '-';
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
    : role === 'end'
    ? `Choose ${target}: click <strong>${PIN_ROLE_COPY.end.empty}</strong>, then the evacuation site or a spot of your own.`
    : `Pin ${target}: click <strong>${PIN_ROLE_COPY[role].empty}</strong>, then <strong>Choose on Map</strong>.`;

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
    return `The system will compare routes from <strong>${escapeHtml(describePinPlace(startPin))}</strong> to the evacuation sites that can still be reached.<br>Click <strong>Run Earthquake Simulation</strong> to view the results.`;
  }

  if (pinPlacementRole === 'end' && !endPin) {
    return `${pinPrompt('end', 'your <strong>destination</strong>')} To keep the evacuation site instead, click the destination again.`;
  }
  if (startPin && endPin) {
    // The box is justified, and the wide monospace names leave "Click" only a
    // word or two of company on its line, so the spaces there stretch wide.
    // The <br> starts the instruction on a fresh line; the line before a
    // forced break isn't stretched.
    return `Ready! <strong>${escapeHtml(describePinPlace(startPin))}</strong> to <strong>${escapeHtml(describePinPlace(endPin))}</strong>.<br>Click <strong>Run Simulation</strong>.`;
  }
  if (isFloodToEvacSite() && !routePins.end) {
    return startPin
      ? `Ready! <strong>${escapeHtml(describePinPlace(startPin))}</strong> to the <strong>evacuation site</strong> with the safest route.<br>Click <strong>Run Simulation</strong>.`
      : `${pinPrompt('start', '<strong>where you are</strong>')} Routes will lead from there to the evacuation sites.`;
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
  // Flood routes go to the evacuation sites unless a destination of the
  // visitor's own carries over.
  const toEvacSites = name === 'Flood' && !carriedPins.some(([role]) => role === 'end');

  selectedHazard = name;
  // The panel's colours change with the hazard: cross-fade them rather
  // than snap (where the browser can). The callback may run a frame later,
  // so only the visuals go in it.
  withViewTransition(() => {
    clearHazardSelectionState();
    el.classList.add('selected', name.toLowerCase());
    el.setAttribute('aria-pressed', 'true');
    applyHazardTheme();
  });
  workflowFocusSection = null;

  if (!selectedBarangay) {
    // Only possible in the moment before the barangay from the URL has
    // loaded; selectBarangay() picks the hazard up from here.
    floodHazardOverlayMode = name === 'Flood' ? 'all' : 'none';
    advanceStep(1);
    return;
  }

  // Same barangay: its outline, mask and the current view stay put.
  const keepBoundary = shownBarangayMap === selectedBarangay && mapLayers.boundaries.length > 0;
  clearBarangaySelections({ keepBoundary });
  floodHazardOverlayMode = name === 'Flood' ? 'all' : 'none';
  // Before any pin is placed, so a start pin never arms the map for an end
  // pin: a stray tap would pin a destination nobody chose.
  if (toEvacSites) floodToEvacSite = true;
  if (!keepBoundary) await loadBarangayMapOnly(selectedBarangay);
  revealMapWhenBaseReady();
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
  if (toEvacSites) await useFloodEvacSitesByDefault();
}

// Flood's default destination: the barangay's evacuation sites, on the map
// at once, the run picking the one with the safest route (floodToEvacSite).
// A destination of one's own is the menu's second choice. If the sites
// can't load, the visitor pins one instead.
async function useFloodEvacSitesByDefault() {
  if (selectedHazard !== 'Flood' || routePins.end) return;
  floodToEvacSite = true;
  await showFloodEvacuationSites({ fit: false });
  if (selectedHazard === 'Flood' && !floodEvacSites.length && !routePins.end) {
    floodToEvacSite = false;
    setFloodLegendContent();
    if (!pinPlacementRole) setPinPlacementRole(getNextUnpinnedRole());
    onRoutePinsChange();
  }
}

function getCompletedSteps() {
  return {
    1: !!selectedBarangay,
    2: !!selectedHazard,
    3: !!getReadyPin('start'),
    4: isEarthquakeMode()
      ? earthquakeEvacSitesVisible
      : !!getReadyPin('end') || isFloodToEvacSite(),
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
  if (!getReadyPin('end') && !isFloodToEvacSite()) return 4;
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
    // While running or locked, the run body below already says this in full.
    summaryRun.hidden = simulationInProgress;
    summaryRun.textContent = simulationInProgress
      ? ''
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

async function renderActiveSimulationRoutes({ fadeIn = true } = {}) {
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
    fitOptions: getMapFitPadding(),
    fitPoints: [getReadyPin('start'), isEarthquakeResult ? null : getReadyPin('end')].filter(Boolean),
    // Earthquake results fit once below, around the hazard extent too.
    fit: !isEarthquakeResult,
    fadeIn,
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

// Fits the map to the flood evacuation sites and the pins set so far.
function fitMapToFloodEvacSites() {
  if (!gMap || !floodEvacSites.length) return;
  const bounds = L.latLngBounds([]);
  floodEvacSites.forEach(site => extendBoundsWithLngLat(bounds, site.lng, site.lat));
  PIN_ROLES.forEach(role => {
    const pin = getReadyPin(role);
    if (pin) extendBoundsWithLngLat(bounds, pin.lng, pin.lat);
  });
  if (!bounds.isValid()) return;

  const padding = getMapFitPadding(52);
  // The sites spread to the barangay's edges, where the phone's zoom and
  // locate buttons would cover one; keep them clear of those too.
  const controls = document.getElementById('msimMapControls');
  if (padding.paddingBottomRight && controls?.getClientRects().length && getComputedStyle(controls).visibility !== 'hidden') {
    const mapRight = document.getElementById('map').getBoundingClientRect().right;
    const right = mapRight - controls.getBoundingClientRect().left + 32;
    padding.paddingBottomRight = [Math.max(padding.paddingBottomRight[0], right), padding.paddingBottomRight[1]];
  }
  gMap.fitBounds(bounds, mapMoveOptions({ ...padding, maxZoom: PIN_PLACEMENT_ZOOM }));
}

// The destination field's "Show Evacuation Sites" (flood): the destination
// becomes the barangay's evacuation sites, shown on the map, in place of a
// pin -- the run picks the one with the safest route -- and the setup moves
// straight on to Run.
async function showFloodEvacuationSites({ fit = true } = {}) {
  closePinMenus();
  if (isSimulationInteractionLocked() || selectedHazard !== 'Flood' || !selectedBarangay) return;

  const barangay = selectedBarangay;
  let sites;
  try {
    sites = await window.floodHazardUI.loadEvacuationSites(barangay);
  } catch (err) {
    console.error(err);
    showPinHintError(`Could not load the evacuation sites: ${err.message}`);
    return;
  }
  // The visitor switched barangay or disaster while they loaded.
  if (barangay !== selectedBarangay || selectedHazard !== 'Flood') return;
  if (!sites.length) {
    showPinHintError(`No evacuation sites are listed for Brgy. ${selectedBarangay} yet.`);
    return;
  }

  floodEvacSites = sites;
  floodToEvacSite = true;
  clearPinHintError();
  if (routePins.end) {
    routePins.end = null;
    pinCheckSeq.end += 1;
  }
  if (pinPlacementRole === 'end') setPinPlacementRole(getNextUnpinnedRole());
  setFloodLegendContent();
  setMapLegendVisible(true);
  onRoutePinsChange();
  if (fit) fitMapToFloodEvacSites();
}

async function showEvacuationSites() {
  if (!isEarthquakeMode()) {
    await showFloodEvacuationSites();
    return;
  }
  if (isSimulationInteractionLocked()) return;
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

// ---- The last run survives a reload (per tab, sessionStorage) ----
// The barangay, hazard and pins of the last run, plus its result -- or, while
// it is still computing, its job id, so a reload picks the run back up.
// Dropped when the results are (a pin moved, the hazard or barangay changed,
// New simulation).
const SIM_SESSION_KEY = 'agnas-sim-session';

function saveSimulationSession(session) {
  try {
    sessionStorage.setItem(SIM_SESSION_KEY, JSON.stringify(session));
    return true;
  } catch (err) {
    return false; // full or blocked: a reload just starts fresh
  }
}

function readSimulationSession() {
  try {
    return JSON.parse(sessionStorage.getItem(SIM_SESSION_KEY) || 'null');
  } catch (err) {
    return null;
  }
}

function clearSimulationSession() {
  try {
    sessionStorage.removeItem(SIM_SESSION_KEY);
  } catch (err) {}
}

function buildSimulationSessionBase(isEarthquakeRun) {
  return {
    barangay: selectedBarangay,
    hazard: selectedHazard,
    isEarthquake: isEarthquakeRun,
    pins: Object.fromEntries(PIN_ROLES.map(role => [role, getReadyPin(role)])),
    toEvacuationSite: !isEarthquakeRun && isFloodToEvacSite() && !routePins.end,
  };
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
  // The flood areas download while the ants work, so they appear with the
  // routes instead of a beat after them (flood.js caches the download).
  if (!isEarthquakeRun) {
    window.floodHazardUI?.loadHazardLayers({
      scope: 'barangay_buffer',
      barangay: selectedBarangay,
      vars: getFloodOverlayConfig().vars,
    }).catch(() => {});
  }
  const [endpoint, payload, label] = isEarthquakeRun
    ? ['/earthquake/simulate', { start: buildPinRequestPoint('start'), barangay: selectedBarangay }, 'Earthquake simulation']
    : isFloodToEvacSite() && !routePins.end
    ? ['/simulate', { start: buildPinRequestPoint('start'), to_evacuation_site: true, hazard: selectedHazard, barangay: selectedBarangay }, 'Simulation']
    : ['/simulate', { start: buildPinRequestPoint('start'), end: buildPinRequestPoint('end'), hazard: selectedHazard, barangay: selectedBarangay }, 'Simulation'];

  await followSimulationJob(() => submitSimulationJob(endpoint, payload), {
    label,
    isEarthquakeRun,
    pinsKey: getRoutePinsKey(),
    session: buildSimulationSessionBase(isEarthquakeRun),
  });
}

// The loader's title and bar while the backend works on the run: its place
// in line, then the ant colony's progress.
function syncLoaderWithJob(view) {
  const statusTxt = document.getElementById('statusTxt');
  if (view.state === 'queued') {
    const ahead = Number(view.queued_ahead) || 0;
    setLoaderTitle(ahead > 0
      ? `Waiting for ${ahead} simulation${ahead === 1 ? '' : 's'} ahead of yours`
      : 'Starting your simulation');
    if (statusTxt) statusTxt.textContent = ahead > 0 ? 'Waiting in line…' : 'Simulating…';
    return;
  }
  if (view.state === 'running') {
    setLoaderTitle(getLoaderStageCopy('route').title);
    if (statusTxt) statusTxt.textContent = 'Simulating…';
    const percent = Number(view.progress?.percent);
    if (Number.isFinite(percent)) {
      const [lo, hi] = LOADER_ROUTE_STAGE_RANGE;
      updateLoaderProgress(lo + (Math.max(0, Math.min(100, percent)) / 100) * (hi - lo));
    }
  }
}

// Shows the loader for a run -- a new one, or one picked back up after a
// reload (startJob submits it or fetches its status) -- then its results.
async function followSimulationJob(startJob, context) {
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
    const job = await startJob();
    saveSimulationSession({ ...context.session, jobId: job.job_id });
    const result = await waitForSimulationJob(job, syncLoaderWithJob);
    setLoaderStep('review', 76);
    // With the result if it fits; otherwise the job id stays, and the
    // backend keeps the result for a while. Not the replay: a run restored
    // after a reload goes straight to its results.
    const { replay: replayData, ...storedResult } = result;
    saveSimulationSession({ ...context.session, jobId: job.job_id, result: storedResult });
    delete result.replay;

    // The ant colony's search plays between the loader and the results; it
    // is set up behind the loader, which then fades to it.
    const replay = await prepareSimulationReplay(result, replayData, context);
    if (replay) {
      setLoaderStep('complete', 100);
      await waitMs(LOADER_REPLAY_HANDOFF_MS);
      hideLoader(0);
      await replay.play();
    }

    await showSimulationResult(result, context);
    // Only hide once the bar has eased up to 100, so it never jumps to results
    // mid-animation.
    hideLoader(650);
  } catch (err) {
    console.error(err);
    statusTxt.textContent = 'Error';
    setLoaderStep('stopped', 100);
    loaderHideDelay = 320;
    if (err.backendCode === 'job_not_found' || err.statusCode) clearSimulationSession();
    // A failed re-run leaves the previous result on the map; bring its panel back.
    if (simData) {
      renderRouteSafetyPanel(simData);
      syncMobilePanelBarLabel();
      window.mobileSim?.showResults();
    }
    if (!(context.quietIfGone && err.backendCode === 'job_not_found')) {
      alert(`${context.label} failed: ${err.message}`);
    }
  } finally {
    setSimulationInProgress(false);
    clearReplayRoute();
    if (!loaderHidden) {
      hideLoader(loaderHideDelay);
    }
    syncRouteInfoBox();
  }
}

// ---- The ant colony replay (aco-replay.js) ----
// A fresh run's search plays on the map between the loader and the results:
// the ants spreading out, their trails growing, then Route 1 walked with the
// camera following. A run restored after a reload goes straight to its
// results, and so does every run under reduced motion.

// The loader's bar eases up to 100 before it fades to the replay.
const LOADER_REPLAY_HANDOFF_MS = 450;
const REPLAY_RESIZE_SETTLE_MS = 220;

// Where the replay's panel goes: the phone/tablet sheet, a card over the map
// on a short screen (its panels cover the whole screen there), or the
// results column on a desktop.
function getReplayHost() {
  if (window.mobileSim?.isActive()) return 'sheet';
  return MOBILE_PANEL_QUERY.matches ? 'card' : 'column';
}

function mountReplayPanel(panel) {
  const host = getReplayHost();
  const shell = document.getElementById('appShell');
  const content = document.getElementById('routeSafetyContent');
  panel.classList.toggle('aco-replay--card', host === 'card');
  shell?.classList.toggle('aco-replay-card', host === 'card');
  if (host !== 'column' && content?.contains(panel)) {
    content.hidden = true;
    setRouteSafetyPanelVisible(false);
  }
  if (host === 'sheet') {
    window.mobileSim.showReplay(panel);
  } else {
    window.mobileSim?.endReplay();
    if (host === 'card') {
      document.querySelector('.map-wrap')?.appendChild(panel);
    } else if (content) {
      content.replaceChildren(panel);
      content.hidden = false;
      setRouteSafetyPanelVisible(true);
    }
  }
  return host;
}

// The replay playing now, for the recenter button and the phone sheet's
// refit; and the one whose Route 1 is still on the map until the results
// draw theirs (a phone replay's; aco-replay.js removeLayers).
let activeReplayController = null;
let replayRouteOnMap = null;

function clearReplayRoute() {
  replayRouteOnMap?.removeRoute();
  replayRouteOnMap = null;
}

// The ants' search, framed in the part of the map left in view.
function fitReplaySearch({ flySeconds = 0, onlyIfOutOfView = false } = {}) {
  const controller = activeReplayController;
  if (!gMap || !controller || controller.isDone()) return;
  const bounds = controller.getSearchBounds();
  const padding = getReplayFitPadding();
  if (onlyIfOutOfView && boundsFitInView(bounds, padding)) return;
  const fitOptions = { ...padding, maxZoom: PIN_PLACEMENT_ZOOM };
  if (flySeconds) gMap.flyToBounds(bounds, mapMoveOptions({ ...fitOptions, duration: flySeconds }));
  else gMap.fitBounds(bounds, mapMoveOptions(fitOptions));
}

// The phone sheet snapped to another height (mobile-sim.js): the picked or
// best route, or the ants' search, back into the part of the map left in
// view -- unless it is still in view, or the visitor moved the map.
const SHEET_REFIT_FLY_SECONDS = 0.5;

function refitMapAfterSheetSnap() {
  if (!gMap || window.mobileSim?.isAutoFitPaused()) return;
  if (activeReplayController && !activeReplayController.isDone()) {
    // While walking, the camera eases the walker to its new focus point.
    if (!activeReplayController.isWalking()) fitReplaySearch({ flySeconds: SHEET_REFIT_FLY_SECONDS, onlyIfOutOfView: true });
    return;
  }
  const focusedGroup = selectedRouteFocus
    ? (mapLayers.routeGroups || []).find(group => Number(group.routeNo) === Number(selectedRouteFocus.routeNo))
    : null;
  const focusedPath = getRoutePreviewPath(focusedGroup);
  if (focusedPath.length > 1) {
    const bounds = L.latLngBounds(focusedPath);
    const padding = getMapFitPadding();
    if (!boundsFitInView(bounds, padding)) {
      gMap.flyToBounds(bounds, mapMoveOptions({ ...padding, duration: SHEET_REFIT_FLY_SECONDS }));
    }
    return;
  }
  refitMapToCurrentRoute({ onlyIfOutOfView: true, flySeconds: SHEET_REFIT_FLY_SECONDS });
}

// The map's fit padding (getMapFitPadding) plus the replay's card, which on
// a short screen covers the map's left side.
function getReplayFitPadding() {
  const padding = getMapFitPadding();
  const card = document.querySelector('.aco-replay--card');
  const mapEl = document.getElementById('map');
  if (card && mapEl && padding.paddingTopLeft && card.getClientRects().length) {
    const cover = card.getBoundingClientRect().right - mapEl.getBoundingClientRect().left + 16;
    padding.paddingTopLeft = [Math.max(padding.paddingTopLeft[0], cover), padding.paddingTopLeft[1]];
  }
  return padding;
}

// The hazards and sites the results will show, on the map for the replay.
async function drawReplayMapContext(result, isEarthquakeRun, chosenSiteId) {
  if (isEarthquakeRun) {
    window.earthquakeUI?.renderHazardLayers({
      map: gMap,
      hazardLayers: result.hazard_layers,
      activeView: result.active_view || 'overall',
    });
    window.earthquakeUI?.drawEvacuationSites({
      map: gMap,
      sites: Array.isArray(result.evacuation_sites) ? result.evacuation_sites : earthquakeEvacSites,
      highlightedSiteId: chosenSiteId,
    });
    return;
  }
  const { vars } = getFloodOverlayConfig();
  try {
    const hazardLayers = await window.floodHazardUI?.loadHazardLayers({ scope: 'barangay_buffer', barangay: selectedBarangay, vars });
    window.floodHazardUI?.renderHazardLayers({ map: gMap, hazardLayers, visibleVars: vars });
  } catch (err) {
    console.warn('Failed to load flood hazard overlay for the replay:', err);
  }
  if (result.to_evacuation_site) {
    window.floodHazardUI?.drawEvacuationSites({
      map: gMap,
      sites: floodEvacSites.length ? floodEvacSites : result.evacuation_sites,
      highlightedSiteId: chosenSiteId,
    });
  }
}

// The replay legend's pin rows, like the results legend's.
function buildReplayLegendPins(result, isEarthquakeRun) {
  const pinRow = (style, label) => `<div class="legend-row">${buildLegendPinSvg(style.fill, style.stroke, 'house')}<span>${label}</span></div>`;
  let destination = buildPinLegendRow('end');
  if (isEarthquakeRun) {
    destination = pinRow({ fill: '#22c55e', stroke: '#14532d' }, 'Chosen evacuation site')
      + pinRow({ fill: '#f59e0b', stroke: '#9a3412' }, 'Open area');
  } else if (result.to_evacuation_site && window.floodHazardUI?.evacMarkerStyles) {
    const styles = window.floodHazardUI.evacMarkerStyles;
    destination = pinRow(styles.chosen, 'Chosen evacuation site') + pinRow(styles.site, 'Evacuation site');
  }
  return buildPinLegendRow('start') + destination + buildBoundaryLegendRow();
}

// Sets the replay up behind the loader -- its panel, the map's hazards and
// sites, the view -- and returns { play() }, or null when this result has no
// replay to show.
async function prepareSimulationReplay(result, replayData, { isEarthquakeRun }) {
  if (!replayData || !window.acoReplay || !gMap || prefersReducedMotion()) return null;
  if (!Array.isArray(replayData.rounds) || !replayData.rounds.length) return null;
  const view = isEarthquakeRun ? result.views?.[result.active_view || 'overall'] : result;
  const routes = decorateRoutesForDisplay(normalizeRoutes(view?.routes || []));
  const route1 = routes.find(route => Number(route.display_route_no) === 1) || routes[0];
  if (!route1) return null;

  let controller;
  try {
    // The previous run's routes and result panels make way.
    clearRenderedRoutesOnly();
    simData = null;
    syncFloodFilterControl();
    syncEarthquakeViewSelector();
    setResultsSidebarActionsVisible(false);
    syncMobilePanelBarLabel();

    const tier = getRouteSafetyTier(route1);
    const color = getBestRouteColor(route1);
    const aco = view?.aco || result.aco || null;
    const chosenSiteId = isEarthquakeRun
      ? view?.summary?.selected_evacuation_site?.id ?? null
      : result.selected_evacuation_site?.id ?? null;
    const endName = isEarthquakeRun || result.to_evacuation_site
      ? route1.destination_name || result.end
      : result.end || getReadyPin('end')?.label || PIN_ROLE_COPY.end.fallbackLabel;

    await drawReplayMapContext(result, isEarthquakeRun, chosenSiteId);
    controller = window.acoReplay.create({
      map: gMap,
      replay: replayData,
      mode: isEarthquakeRun ? 'earthquake' : 'flood',
      route1: {
        points: getRoutePoints(route1),
        number: route1.display_route_no ?? 1,
        name: getTopRouteTitle(route1),
        distance: Number(route1.distance) || 0,
        durationText: route1.display_duration || formatRouteWalkingDuration(route1),
        tier,
        color,
        edgeColor: getRouteEdgeColor(color),
        // A flood route 1 that is not safe crosses water over 1.5 m deep,
        // which the results say not to walk (getNoSafeRouteAction); after
        // an earthquake the route is still walked, with care.
        walk: isEarthquakeRun || tier !== 'unsafe',
        wading: routeHasWadingTime(route1),
      },
      startName: result.start || getReadyPin('start')?.label || PIN_ROLE_COPY.start.fallbackLabel,
      endName,
      antsTotal: Number(aco?.ants_sent_all_sites ?? aco?.ants_sent) || 0,
      legendBody: document.getElementById('mapLegendBody'),
      legendExtra: buildReplayLegendPins(result, isEarthquakeRun),
      getPadding: getReplayFitPadding,
      onPanelChange: () => window.mobileSim?.scheduleSync(),
      onWalkChange: walking => document.getElementById('appShell')?.classList.toggle('aco-replay-walking', walking),
      mobileLayout: !!window.mobileSim?.isActive(),
      isCameraPaused: () => !!window.mobileSim?.isAutoFitPaused(),
    });
    activeReplayController = controller;

    const shell = document.getElementById('appShell');
    const layoutBefore = shell?.className;
    shell?.classList.add('aco-replaying');
    mountReplayPanel(controller.panel);
    applySetupSidebarState(true);
    setMapLegendVisible(true);
    // The panels finish sliding first, and initMap's resize handling (which
    // settles 150 ms after the map's last size change) with them, so the
    // view is fitted once, to the map's final size.
    if (shell && shell.className !== layoutBefore) await waitMs(PANEL_SLIDE_MS + REPLAY_RESIZE_SETTLE_MS);
    gMap.invalidateSize({ pan: false });
    gMap.fitBounds(controller.getSearchBounds(), mapMoveOptions({ ...getReplayFitPadding(), maxZoom: PIN_PLACEMENT_ZOOM, animate: false }));
  } catch (err) {
    console.error('Could not set up the replay:', err);
    endSimulationReplay(controller);
    return null;
  }

  return {
    async play() {
      let host = getReplayHost();
      // Turning a phone or resizing the window mid-replay moves the panel
      // to the new layout's place for it.
      const onResize = () => {
        if (getReplayHost() === host) return;
        host = mountReplayPanel(controller.panel);
        controller.resize();
      };
      window.addEventListener('resize', onResize);
      try {
        await controller.start();
      } catch (err) {
        console.error('The replay stopped:', err);
        controller.skip();
      } finally {
        window.removeEventListener('resize', onResize);
        endSimulationReplay(controller, { keepRoute: true });
      }
    },
  };
}

// keepRoute: the results are next, and draw their routes over Route 1.
function endSimulationReplay(controller, { keepRoute = false } = {}) {
  controller?.skip();
  controller?.panel.remove();
  if (activeReplayController === controller) activeReplayController = null;
  clearReplayRoute();
  if (keepRoute && controller?.isRouteShown()) replayRouteOnMap = controller;
  else controller?.removeRoute();
  window.mobileSim?.endReplay();
  document.getElementById('appShell')?.classList.remove('aco-replaying', 'aco-replay-card', 'aco-replay-walking');
}

// Puts a finished run's result on the map and in the panels.
async function showSimulationResult(result, { isEarthquakeRun, pinsKey }) {
  const statusTxt = document.getElementById('statusTxt');

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
    // The destination field names the evacuation site the run picked.
    syncRoutePinFields();
  }

  setLoaderStep('draw', 92);
  statusTxt.textContent = 'Opening results…';
  const shell = document.getElementById('appShell');
  const layoutBefore = shell?.className;
  renderRouteSafetyPanel(simData);
  syncMobilePanelBarLabel();
  window.mobileSim?.showResults();
  // The setup panel folds away to give the results room -- before drawing,
  // so the route is fitted around the map overlays as they will end up.
  applySetupSidebarState(true);
  // And the panels finish sliding first, so the route is fitted once, to
  // the map's final size (behind the loader, which is still up).
  if (shell && shell.className !== layoutBefore && !prefersReducedMotion()) {
    await waitMs(PANEL_SLIDE_MS + 40);
  }
  await renderActiveSimulationRoutes({ fadeIn: !replayRouteOnMap });
  applyRouteFocusState(null);
  clearReplayRoute();
  setResultsSidebarActionsVisible(true);

  setLoaderStep('complete', 100);
  statusTxt.textContent = 'Simulation Complete';
}

// After a reload: the same hazard and pins as the last run, then its result
// -- or the run itself, if it was still computing. `session` is read before
// the barangay loads, since loading it clears the stored copy.
async function restoreSimulationSession(session) {
  if (!session || session.barangay !== selectedBarangay || !session.hazard) return;
  const card = document.getElementById(session.hazard === 'Earthquake' ? 'hEarthquake' : 'hFlood');
  if (!card) return;

  await selectHazard(session.hazard, card);
  // Pins from a finished run were already checked; they go back as they were.
  PIN_ROLES.forEach(role => {
    pinCheckSeq[role] += 1;
    const pin = session.pins?.[role];
    routePins[role] = pin ? { ...pin, status: 'ready' } : null;
  });
  // Flood starts at the evacuation sites (selectHazard); a run to a
  // destination of the visitor's own goes back to it.
  if (routePins.end) {
    floodToEvacSite = false;
    setFloodLegendContent();
  }
  setPinPlacementRole(getNextUnpinnedRole());
  onRoutePinsChange();
  if (session.toEvacuationSite) await showFloodEvacuationSites({ fit: false });

  const context = {
    label: session.isEarthquake ? 'Earthquake simulation' : 'Simulation',
    isEarthquakeRun: !!session.isEarthquake,
    pinsKey: getRoutePinsKey(),
    session: buildSimulationSessionBase(!!session.isEarthquake),
    quietIfGone: true,
  };
  if (session.result) {
    saveSimulationSession(session);
    await showSimulationResult(session.result, context);
  } else if (session.jobId) {
    await followSimulationJob(() => fetchSimulationJob(session.jobId), context);
  }
}

// "New simulation": back to choosing the disaster on the same barangay, as on
// first arriving from the homepage, without leaving the page.
function startNewSimulation() {
  if (simulationInProgress) return;
  closeRouteListModal();
  workflowFocusSection = null;
  selectedHazard = null;
  withViewTransition(() => {
    clearHazardSelectionState();
    applyHazardTheme();
  });
  clearBarangaySelections({ keepBoundary: true });
  syncFloodHazardOverlay();
  showPinningLegend();
  advanceStep(2);
  syncRouteInfoBox();
  reopenSetupSidebar();
  window.mobileSim?.showSetup();
  if (barangayBoundaryRings.length) fitMapToBoundaryPaths(barangayBoundaryRings);
  document.getElementById('statusTxt').textContent = 'Ready';
}

function safetyIcon(name) {
  const icons = {
    alert: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4 3.6 19h16.8L12 4Z"/><path d="M12 9v4m0 3h.01"/></svg>',
    shield: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l7 3v5.5c0 4.3-2.9 7.9-7 9.5-4.1-1.6-7-5.2-7-9.5V6l7-3Z"/><path d="m9 12 2 2 4-4"/></svg>',
    ruler: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 16 12-12 4 4-12 12H4v-4Z"/><path d="m12 8 4 4m-7 0 2 2m1-7 2 2"/></svg>',
    droplet: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3s6 6.5 6 11a6 6 0 1 1-12 0c0-4.5 6-11 6-11Z"/></svg>',
    quake: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12h4l2.5-6 4 13 3-9 2 2H22"/></svg>',
    road: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 20 9 4m6 16-4-16M12 6v2m0 3v2m0 3v2"/></svg>',
    pin: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z"/><path d="M12 10h.01"/></svg>',
    clock: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/></svg>',
    flag: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 21V4"/><path d="M6 4h13l-3 3.5L19 11H6"/></svg>',
    phone: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.6 3.5h2.8l1.4 4.2-2 1.4a11 11 0 0 0 6.1 6.1l1.4-2 4.2 1.4v2.8a2 2 0 0 1-2.2 2A16.5 16.5 0 0 1 4.6 5.7a2 2 0 0 1 2-2.2Z"/></svg>',
    walk: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="14" cy="4" r="1.6"/><path d="M13 6.5 11.5 13M12.3 8 9 7M12 9.3 15.6 11.6M11.5 13 8 15.5 8.6 19M11.5 13 14.6 16.8 16.2 20"/></svg>',
  };
  return icons[name] || icons.alert;
}

// "New simulation" and "Download PDF" in the safety aside share one
// show/hide lifecycle -- both only make sense once a simulation has run.
function setResultsSidebarActionsVisible(visible) {
  document.getElementById('resetBtn')?.classList.toggle('show', visible);
  document.getElementById('safetyDownloadBtn')?.classList.toggle('show', visible);
}

// The safety column only exists once a simulation has run.
function setRouteSafetyPanelVisible(visible) {
  const shell = document.getElementById('appShell');
  if (!shell || shell.classList.contains('safety-open') === visible) return;

  shell.classList.toggle('safety-open', visible);

  // Same rule as applySetupSidebarState, from this side: a caller that shows
  // results without collapsing setup first (a failed re-run restoring the
  // previous result) still can't leave both open on mobile. Each function only
  // calls the other when opening, and that call is always a close, so they
  // never loop.
  if (visible && MOBILE_PANEL_QUERY.matches) {
    applySetupSidebarState(true);
  }

  // No invalidateSize() here either: the ResizeObserver in initMap() handles it.
}

function resetRouteSafetyPanel() {
  const content = document.getElementById('routeSafetyContent');
  if (content) {
    content.hidden = true;
    content.innerHTML = '';
  }
  setRouteSafetyPanelVisible(false);
  closeRouteListModal();
  window.mobileSim?.clearResults();
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
  const best = getBestRoute(routes);
  const bestRouteNo = best?.display_route_no ?? 1;
  const bestCategory = best?.category || '';

  const start = result.start || getReadyPin('start')?.label || PIN_ROLE_COPY.start.fallbackLabel;
  const end = result.end
    || best?.destination_name
    || getReadyPin('end')?.label
    || PIN_ROLE_COPY.end.fallbackLabel;

  const peakScore = Number(best?.max_hazard || 0);
  const peak = getPeakRiskRow(best, isEarthquake);
  // Danger/red once it's actually High; amber/warning for Medium; neutral for
  // Low. "High" starts at 4 for earthquake (getRiskLevelLabelFromScore) and
  // at 5 for flood (High water).
  const peakClass = peakScore >= (isEarthquake ? 4 : 5) ? 'danger' : peakScore >= 3 ? 'warning' : '';
  const bestDistanceText = [best?.display_distance || 'Unavailable', best?.display_duration && `${best.display_duration} walk`]
    .filter(Boolean)
    .join(' · ');
  const tier = getRouteSafetyTier(best);
  const verdict = { ...ROUTE_VERDICTS[tier], title: getRouteVerdictTitle(best) };
  const action = getNoSafeRouteAction(best);
  // With no safe route, what to do takes the walking-time card's place; an
  // earthquake route is still walked, so its distance stays in the card.
  // Its Emergency hotlines button replaces the one under the disclaimer.
  const routeCardMarkup = action
    ? `
      <div class="safety-result-card danger safety-action-card">
        <div class="safety-icon-box">${safetyIcon('phone')}</div>
        <div>
          <div class="safety-card-label">What to do</div>
          <div class="safety-card-value">${escapeHtml(action.title)}</div>
          <p class="safety-card-sub safety-action-detail">${escapeHtml(action.detail)}</p>
          ${isEarthquake ? `<div class="safety-card-sub">${escapeHtml(`Route ${bestRouteNo}: ${bestDistanceText}`)}</div>` : ''}
          <button class="safety-card-action" type="button" onclick="openEmergencyContactModal(event)">${safetyIcon('phone')}Emergency hotlines</button>
        </div>
      </div>`
    : `
      <div class="safety-result-card">
        <div class="safety-icon-box">${safetyIcon('ruler')}</div>
        <div><div class="safety-card-label">${escapeHtml(getTopRouteTitle(best))}</div><div class="safety-card-value">${escapeHtml(bestDistanceText)}</div>${routeHasWadingTime(best) ? '<div class="safety-card-sub">Slower pace through flood water</div>' : ''}</div>
      </div>`;
  const fullySafeCount = routes.filter(route => getRouteSafetyTier(route) === 'safe').length;
  const dryCount = routes.filter(route => getRouteSafetyTier(route) === 'safe' && isFloodFreeRoute(route)).length;
  // The list button covers only the routes not already on the map; none off
  // the map, no button.
  const offMapCount = getRoutesOffMap(routes).length;

  // Plain wording: barangay residents read this panel, so no "ACO",
  // "evaluated" or "hazard lens".
  const single = routes.length === 1;
  const checkedLabel = `We checked ${routes.length} route${single ? '' : 's'}.`;
  const antSearchNote = buildAntSearchNote(result);
  const notes = [];
  if (tier === 'safe') {
    notes.push(
      `${checkedLabel} ${describeGreenRouteCount(fullySafeCount, isEarthquake, { total: routes.length, dryCount })}`,
      antSearchNote || 'The safest route is shown first.',
    );
  } else if (tier === 'caution') {
    // Routes with less Medium water rank first, so when the best one has
    // some, every route shown does.
    notes.push(
      `${checkedLabel} ${single ? 'It is not' : 'None are'} fully safe.`,
      `${describeMediumFloodCrossing(best)} ${MEDIUM_FLOOD_WARNING}`,
    );
    if (antSearchNote) notes.push(antSearchNote);
  } else if (isAreaWideHighRisk(best)) {
    notes.push(`${checkedLabel} ${describeAreaWideHighRisk(best, result.barangay || selectedBarangay)}`);
    if (antSearchNote) notes.push(antSearchNote);
  } else {
    notes.push(
      `${checkedLabel} ${single ? 'It is not' : 'None are'} safe.`,
      describeUnsafeCrossing(best),
    );
    if (antSearchNote) notes.push(antSearchNote);
  }
  // What to do comes right after the verdict, before how the search ran.
  if (isFarFromOpenArea(best)) notes.splice(1, 0, FAR_FROM_OPEN_AREA_NOTE);
  if (isEarthquake && result.active_view_label) {
    notes.push(`Based on ${String(result.active_view_label).toLowerCase()} risk.`);
  }
  const sourceNoteHtml = buildHazardSourceNoteHtml(isEarthquake);

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
          <span class="turn-step-instruction">${escapeHtml(!isEarthquakeRouteRecord(best) && best?.destination_name ? best.destination_name : 'Your destination')}</span>
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
      <div class="safety-result-card ${verdict.card}">
        <div class="safety-icon-box">${safetyIcon(verdict.icon)}</div>
        <div><div class="safety-card-label">Overall verdict</div><div class="safety-card-value">${escapeHtml(verdict.title)}</div></div>
      </div>
      ${routeCardMarkup}
      <div class="safety-result-card ${peakClass}">
        <div class="safety-icon-box">${safetyIcon(isEarthquake ? 'quake' : 'droplet')}</div>
        <div><div class="safety-card-label">${escapeHtml(peak.label)}</div>${peak.items
          ? `<ul class="safety-hazard-list">${peak.items.map(item => `<li><span>${escapeHtml(item.name)}</span><strong class="is-${item.level.toLowerCase()}">${escapeHtml([item.level, item.extent].filter(Boolean).join(' · '))}</strong></li>`).join('')}</ul>`
          : `<div class="safety-card-value">${escapeHtml(peak.value)}</div>${peak.detail ? `<div class="safety-card-sub">${escapeHtml(peak.detail)}</div>` : ''}`}</div>
      </div>
    </div>
    <div class="safety-notes"><em>Note:</em><ul>${notes.map(note => `<li>${escapeHtml(note)}</li>`).join('')}<li>${sourceNoteHtml}</li></ul>
      <div class="safety-disclaimer">
        <em class="safety-disclaimer-label">Disclaimer:</em>
        <p class="safety-disclaimer-text">${escapeHtml(SAFETY_DISCLAIMER_TEXT)}</p>
        ${action ? '' : '<button class="safety-disclaimer-link" type="button" onclick="openEmergencyContactModal(event)">Emergency hotlines</button>'}
      </div>
    </div>
    ${offMapCount ? `<button class="safety-all-routes-btn" type="button" onclick="openRouteListModal()">See ${offMapCount} more route${offMapCount === 1 ? '' : 's'}</button>` : ''}`;
  window.mobileSim?.renderResults(result);
}

let routeListModalReturnFocus = null;

function buildRouteModalCard(route, index) {
  const routeNo = route.display_route_no ?? index + 1;
  // Unsafe length in meters, as on the phone's route rows.
  const unsafe = Number(route.unsafe_distance) || 0;
  const isEarthquake = isEarthquakeRouteRecord(route);
  const risk = isEarthquake
    ? `${getRiskLevelLabelFromScore(route.max_hazard)} road risk`
    : formatFloodPeakRiskWithHazard(route);
  const medium = isEarthquake ? 0 : getMediumFloodDistance(route);
  const isActive = selectedRouteFocus
    && String(selectedRouteFocus.routeNo) === String(routeNo)
    && (selectedRouteFocus.category || '') === (route.category || '');
  const stats = [
    route.display_distance || 'Distance unavailable',
    risk,
    ...(medium > 0 ? [`${formatDistanceCompact(medium)} in medium water`] : []),
    ...(unsafe > 0 ? [`${formatDistanceCompact(unsafe)} unsafe`] : []),
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

  // Only the routes not already on the map: the best route and the next
  // ones can be picked straight from their lines.
  const moreRoutes = getRoutesOffMap(routes);
  const countTier = tier => moreRoutes.filter(route => getRouteSafetyTier(route) === tier).length;
  const CAUTION_TEXT = {
    safe: '',
    caution: `No route without medium flooding was found. The routes below avoid high flooding but cross water 0.5–1.5 m deep. ${MEDIUM_FLOOD_WARNING}`,
    unsafe: 'No fully safe route was found. Every route below still passes through a high-hazard area, so treat them as backup options and review each one carefully.',
  };
  const cautionText = CAUTION_TEXT[getRouteSafetyTier(getBestRoute(routes))];
  const caution = cautionText
    ? `<div class="route-modal-caution">${safetyIcon('alert')}<span>${escapeHtml(cautionText)}</span></div>`
    : '';

  body.innerHTML = caution + (moreRoutes.length
    ? moreRoutes.map((route, index) => buildRouteModalCard(route, index)).join('')
    : '<div class="route-modal-empty">No other routes were found for this trip.</div>');
  if (count) {
    const parts = [
      `${moreRoutes.length} more route${moreRoutes.length === 1 ? '' : 's'}`,
      formatGreenRouteTally(countTier('safe'), isEarthquakeSimulationResult(simData)),
    ];
    if (countTier('caution')) parts.push(`${countTier('caution')} risky`);
    count.textContent = parts.join(' · ');
  }

  routeListModalReturnFocus = document.activeElement;
  modal.classList.remove('is-closing');
  modal.hidden = false;
  modal.querySelector('.modal-close-btn')?.focus({ preventScroll: true });
}

function closeRouteListModal() {
  const modal = document.getElementById('routeListModal');
  if (!modal || modal.hidden) return;
  closeModalAnimated(modal, '.route-list-modal');

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

// cased: the white band and dark rim (ROUTE_HALO_* in osm.js), on the best
// or picked route, where the phone layout drew the route a halo layer.
function getDefaultRouteVisual(group) {
  // isBest also covers the red best route when no route is safe.
  if (group?.category === 'best' || group?.isBest) {
    return { mainWeight: ROUTE_BEST_WEIGHT, mainOpacity: 1, casingOpacity: 1, cased: true };
  }

  // Available routes: the gray dotted "fading trail" (ROUTE_TRAIL_* in osm.js).
  if (group?.category === 'available') {
    return { mainWeight: ROUTE_TRAIL_WEIGHT, mainOpacity: ROUTE_TRAIL_OPACITY, casingOpacity: ROUTE_TRAIL_OPACITY, trail: true };
  }

  // Eliminated routes: red, set apart from the gray ones by color.
  return { mainWeight: ROUTE_OTHER_WEIGHT, mainOpacity: 0.9, casingOpacity: 1 };
}

// The focused route keeps its normal look (it must stay the clearest thing on
// the map) -- the flowing dash overlay added by createRoutePreview below is
// what signals "this one is selected". A picked trail firms up into a solid
// edged line, so the dash runs along a clear line.
function getFocusedRouteVisual(group) {
  const base = getDefaultRouteVisual(group);
  return base.trail
    ? { mainWeight: ROUTE_OTHER_WEIGHT, mainOpacity: 1, casingOpacity: 1, trail: false, cased: true }
    : { ...base, mainOpacity: 1, casingOpacity: 1, cased: true };
}

function getDimmedRouteVisual(group) {
  const base = getDefaultRouteVisual(group);
  return {
    ...base,
    mainWeight: Math.max(2, base.mainWeight - 1),
    mainOpacity: group?.category === 'eliminated' ? 0.08 : 0.12,
    casingOpacity: 0,
    cased: false,
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
  // getFocusedRouteVisual -- so this is just a thin dash (white, or dark on
  // the light satellite shades; getRouteLineColors) marching along its middle
  // toward the destination. Animated by style.css (route-flow--focus), not a
  // JS timer, so it moves smoothly. Dash + gap = the 24px CSS loop.
  group.previewDotsLayer = L.polyline(path, {
    color: getRouteLineColors(group.color).dash,
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

  // Only the picked route (from its line or the results) gets the marching
  // dash; nothing moves otherwise.
  if (!enabled) {
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
  const dashArray = visual.trail ? getRouteTrailDashArray(zoomScale) : null;
  const cased = !!(group.haloLayer && visual.cased);
  group.cased = cased;
  const haloWeight = visual.mainWeight + (cased ? ROUTE_HALO_EXTRA_WEIGHT : 0);

  if (group.haloLayer) {
    group.haloLayer.setStyle({
      opacity: cased ? visual.mainOpacity : 0,
      weight: haloWeight * zoomScale,
      dashArray,
    });
  }

  if (group.casingLayer) {
    group.casingLayer.setStyle({
      color: cased ? ROUTE_RIM_COLOR : getRouteLineColors(group.color).edge,
      opacity: visual.casingOpacity,
      weight: (haloWeight + ROUTE_EDGE_EXTRA_WEIGHT) * zoomScale,
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
  if (group.haloLayer) group.haloLayer.bringToFront();
  if (group.mainLayer) group.mainLayer.bringToFront();
  if (group.hitLayer) group.hitLayer.bringToFront();
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
    // A picked route shows its whole path, shared roads included.
    showRouteGroupFullPath(group, isFocused);
    applyRouteGroupVisual(group, visual);
    if (isFocused) {
      bringRouteGroupToFront(group);
    }
    syncRoutePreview(group, isFocused);
  });
  // With nothing picked, the routes go back to their usual stacking, best on
  // top: a route picked and then let go would otherwise stay over the rest.
  if (!hasFocus) stackRouteGroups(groups.filter(group => gMap.hasLayer(group.mainLayer)));
  window.mobileSim?.syncRouteRows();
}

// Re-applies the route styles (widths are zoom-scaled) for the current focus.
function syncRouteFocusStyles() {
  applyRouteFocusState(selectedRouteFocus ? selectedRouteFocus.routeNo : null);
}

// ---- downloadable PDF report ----
// The summary is drawn from simData with jsPDF text calls, not a screenshot:
// html2canvas fails on this stylesheet's color-mix() ("unsupported color
// function"). The map is real OSM tiles under the route: the tile server
// sends Access-Control-Allow-Origin: *, so tiles loaded with
// crossOrigin='anonymous' (set before src) keep the canvas clean, and they
// are composited with the same Web Mercator math the tiles use, so the route
// lines up exactly. If tiles fail (offline, blocked), it falls back to a flat
// schematic render instead of failing the whole report.

const REPORT_MAP_TILE_SIZE = 256;
const REPORT_MAP_MIN_ZOOM = 10;
const REPORT_MAP_MAX_ZOOM = 19; // matches the live street layer's maxZoom
const REPORT_MAP_TILE_URL_TEMPLATE = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const REPORT_MAP_TILE_TIMEOUT_MS = 8000;
const REPORT_MAP_ATTRIBUTION = 'Map data © OpenStreetMap contributors';
// The report map's pins, in the live map's colors (the S/E pins, and the green
// "CHOSEN" evacuation site); the edge colors are for the legend's dots.
const REPORT_PIN_COLORS = {
  start: { color: '#06b6d4', edge: '#155e75' },
  end: { color: '#a855f7', edge: '#6b21a8' },
  chosenSite: { color: '#22c55e', edge: '#14532d' },
};

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

  // White halo keeps the label readable over busy map tiles.
  ctx.font = 'bold 15px sans-serif';
  ctx.textAlign = 'center';
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#ffffff';
  ctx.strokeText(label, x, y - 16);
  ctx.fillStyle = '#0f172a';
  ctx.fillText(label, x, y - 16);
}

// Fallback projection when tiles can't be fetched: fits the route's bounding
// box exactly to the canvas instead of snapping to a real map's integer zoom
// levels.
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

// Renders the best route for the PDF report, with OSM tiles underneath when
// they can be fetched (see the section header), else a flat schematic
// background. Returns the canvas and whether a basemap was used (it then
// needs an attribution line).
async function renderBestRouteMapCanvas(route, labels = {}, { skipBasemap = false, paintHazards = null } = {}) {
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

  // The disaster layer goes under the route, as on the live map.
  if (paintHazards) {
    try {
      paintHazards(ctx, project);
    } catch (err) {
      console.warn('Report map: hazard layer left out —', err.message);
    }
    ctx.globalAlpha = 1;
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
  const routeColor = getBestRouteColor(route);
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
  drawReportPin(ctx, sx, sy, REPORT_PIN_COLORS.start.color, labels.start || 'Start');
  drawReportPin(ctx, ex, ey, (labels.endPin || REPORT_PIN_COLORS.end).color, labels.end || 'Destination');

  return { canvas, usedBasemap };
}

// The legend strip under the report map: each mark on the map, in the
// live legend's names. Items flow left to right and wrap; items sharing a
// `group` (the hazard levels) start a new row together rather than split.
// Returns the y below the strip.
function drawReportMapLegend(doc, items, { x, y, width }) {
  const padX = 10;
  const rowHeight = 16;
  const itemGap = 18;
  const swatchGap = 5;
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  const title = 'Legend';
  const itemsLeft = x + padX + doc.getTextWidth(title) + 14;
  doc.setFont('helvetica', 'normal');

  const sized = items.map(item => {
    const swatch = item.kind === 'line' ? 22 : item.kind === 'area' ? 12 : 10;
    return { ...item, swatch, itemWidth: swatch + swatchGap + doc.getTextWidth(item.label) };
  });
  let row = 0;
  let cursor = itemsLeft;
  const placed = sized.map((item, index) => {
    const startsGroup = item.group && sized[index - 1]?.group !== item.group;
    const needed = startsGroup
      ? sized.filter(other => other.group === item.group).reduce((sum, other) => sum + other.itemWidth + itemGap, -itemGap)
      : item.itemWidth;
    if (cursor > itemsLeft && cursor + needed > x + width - padX) {
      row += 1;
      cursor = itemsLeft;
    }
    const spot = { ...item, left: cursor, row };
    cursor += item.itemWidth + itemGap;
    return spot;
  });

  const height = (row + 1) * rowHeight + 8;
  doc.setLineWidth(0.6);
  doc.setDrawColor(203, 213, 225);
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(x, y, width, height, 4, 4, 'FD');

  // Middle of each row; text sits 3.2pt below it to look centered at 9pt.
  const middle = rowNo => y + 4 + rowNo * rowHeight + rowHeight / 2;
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.text(title, x + padX, middle(0) + 3.2);
  doc.setFont('helvetica', 'normal');
  placed.forEach(item => {
    const cy = middle(item.row);
    if (item.kind === 'line') {
      // Like the route on the map: a thin darker edge around the color.
      doc.setLineCap('round');
      doc.setDrawColor(item.edge);
      doc.setLineWidth(4.4);
      doc.line(item.left + 2, cy, item.left + item.swatch - 2, cy);
      doc.setDrawColor(item.color);
      doc.setLineWidth(3);
      doc.line(item.left + 2, cy, item.left + item.swatch - 2, cy);
      doc.setLineCap('butt');
    } else if (item.kind === 'area') {
      // A hazard fill: a small tile in its color and outline.
      doc.setFillColor(item.color);
      doc.setDrawColor(item.edge);
      doc.setLineWidth(0.8);
      doc.roundedRect(item.left, cy - 4.5, item.swatch, 9, 1.5, 1.5, 'FD');
    } else {
      doc.setFillColor(item.color);
      doc.setDrawColor(item.edge);
      doc.setLineWidth(1);
      doc.circle(item.left + item.swatch / 2, cy, 4, 'FD');
    }
    doc.text(item.label, item.left + item.swatch + swatchGap, cy + 3.2);
  });
  doc.setDrawColor(0);
  doc.setTextColor(0);
  return y + height;
}

// The result's disaster layer for the report map: { paint(ctx, project),
// legend }, or null without one. Flood shows every level (the map's severity
// filter only highlights one); earthquake shows the lens on screen, whose
// routes the report lists.
async function getReportHazardLayer(isEq) {
  if (isEq) {
    const ui = window.earthquakeUI;
    const layers = simData?.hazard_layers;
    if (!ui?.paintHazardLayers || !layers) return null;
    return {
      paint: (ctx, project) => ui.paintHazardLayers(ctx, layers, activeEarthquakeView, project),
      legend: ui.getLegendItems(activeEarthquakeView),
    };
  }
  const ui = window.floodHazardUI;
  if (!ui?.paintHazardLayers) return null;
  try {
    const layers = await ui.loadHazardLayers({
      scope: 'barangay_buffer',
      barangay: selectedBarangay,
      vars: FLOOD_OVERLAY_VIEWS.all.vars,
    });
    return {
      paint: (ctx, project) => ui.paintHazardLayers(ctx, layers, project),
      legend: ui.getLegendItems(),
    };
  } catch (err) {
    console.warn('Report map: flood areas could not be loaded —', err.message);
    return null;
  }
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
    const countTier = tier => routes.filter(route => getRouteSafetyTier(route) === tier).length;
    const cautionCount = countTier('caution');
    const { barangay, hazard, start, end } = getCurrentSelections();

    // Earthquake mode has no destination pin -- the destination is whichever
    // evacuation site the ACO run picked, so label it with that instead.
    const isEq = isEarthquakeSimulationResult(simData);
    const eqSummary = isEq ? (simData.active_summary || getActiveEarthquakeViewData(simData)?.summary || null) : null;
    const endLabel = isEq
      ? (eqSummary?.selected_evacuation_site?.name || 'Evacuation site')
      : (simData.selected_evacuation_site?.name || end);
    const withPinCoordinates = (label, role) => {
      const pin = getReadyPin(role);
      return pin ? `${label} (${formatPinCoordinates(pin)})` : label;
    };

    const peak = getPeakRiskRow(best, isEq);

    // An evacuation site the run chose (earthquake, or flood's default) is the
    // green CHOSEN pin, as on the live map; a destination of one's own is E.
    const endIsChosenSite = isEq || !!simData.to_evacuation_site;
    const endPin = endIsChosenSite ? REPORT_PIN_COLORS.chosenSite : REPORT_PIN_COLORS.end;
    const mapLabels = { start, end: endLabel, endPin };
    const hazardLayer = await getReportHazardLayer(isEq);
    const paintHazards = hazardLayer?.paint || null;
    let mapResult = await renderBestRouteMapCanvas(best, mapLabels, { paintHazards });
    let mapDataUrl;
    try {
      mapDataUrl = mapResult.canvas.toDataURL('image/png');
    } catch (err) {
      // Belt-and-suspenders: if a tile response somehow tainted the canvas
      // despite the ACAO/crossOrigin handling, redo it without the basemap
      // instead of failing the whole report.
      console.warn('Report map canvas was tainted, redrawing without basemap —', err.message);
      mapResult = await renderBestRouteMapCanvas(best, mapLabels, { skipBasemap: true, paintHazards });
      mapDataUrl = mapResult.canvas.toDataURL('image/png');
    }

    // The summary is drawn from the same simData as the on-screen "Summary" tab,
    // directly with jsPDF (see the section header).
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
    y += mapHeight + 6;

    const routeColor = getBestRouteColor(best);
    y = drawReportMapLegend(doc, [
      { kind: 'line', color: routeColor, edge: getRouteEdgeColor(routeColor), label: getTopRouteTitle(best) },
      { kind: 'pin', ...REPORT_PIN_COLORS.start, label: 'Start' },
      { kind: 'pin', ...endPin, label: endIsChosenSite ? 'Chosen evacuation site' : 'Destination' },
      ...(hazardLayer?.legend || []).map(item => ({ kind: 'area', group: 'hazard', ...item })),
    ], { x: margin, y, width: mapWidth }) + 12;

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

    // A block that would run off the page starts a new one.
    const pageHeight = doc.internal.pageSize.getHeight();
    const ensureSpace = height => {
      if (y + height > pageHeight - margin) {
        doc.addPage();
        y = margin;
      }
    };

    ensureSpace(48);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.text('Simulation Summary', margin, y);
    y += 18;

    const labelColWidth = 160;
    const noSafeAction = getNoSafeRouteAction(best);
    const rows = [
      ['Barangay', barangay || 'Unknown'],
      ['Disaster type', hazard || 'Unknown'],
      ['Start', withPinCoordinates(start || 'Unknown', 'start')],
      ['Destination', isEq ? (endLabel || 'Unknown') : withPinCoordinates(endLabel || 'Unknown', 'end')],
      ['Overall verdict', getRouteVerdictTitle(best)],
      ...(noSafeAction ? [['What to do', `${noSafeAction.title} ${noSafeAction.detail}`]] : []),
      [`${getTopRouteTitle(best)} distance`, best?.display_distance || 'Unavailable'],
      ['Estimated time to destination', !isEq && noSafeAction
        ? `${best?.display_duration || 'Unavailable'} (do not walk this route)`
        : routeHasWadingTime(best)
        ? `${best?.display_duration || 'Unavailable'} (slower pace through flood water)`
        : best?.display_duration || 'Unavailable'],
      [peak.label, formatPeakRiskValue(peak)],
      ...(!isEq && getMediumFloodDistance(best) > 0
        ? [['Medium flooding crossed', `About ${formatDistanceCompact(getMediumFloodDistance(best))} (0.5–1.5 m deep). ${MEDIUM_FLOOD_WARNING}`]]
        : []),
      ...(isAreaWideHighRisk(best)
        ? [['Why every route is high risk', `${describeAreaWideHighRisk(best, barangay)} ${describeLeastExposedRoute(best)}`]]
        : []),
      ...(isFarFromOpenArea(best) ? [['Far from the open area', FAR_FROM_OPEN_AREA_NOTE]] : []),
      ['Routes checked', `${routes.length} (${formatGreenRouteTally(countTier('safe'), isEq)}, ${cautionCount ? `${cautionCount} risky, ` : ''}${countTier('unsafe')} not recommended)`],
      [`${getTopRouteTitle(best)} found by`, ROUTE_FOUND_BY_TEXT[best?.found_by] || ROUTE_FOUND_BY_TEXT.aco],
    ];
    const acoSummary = buildAcoReportSummary(simData);
    if (acoSummary) rows.push(['Ant colony search', acoSummary]);

    doc.setFontSize(10.5);
    const valueWidth = pageWidth - margin * 2 - labelColWidth;
    rows.forEach(([label, value]) => {
      const valueLines = doc.splitTextToSize(String(value), valueWidth);
      ensureSpace((valueLines.length - 1) * 13 + 4);
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
    ensureSpace(wrappedRanking.length * 12);
    doc.text(wrappedRanking, margin, y);
    y += wrappedRanking.length * 12 + 10;

    const LINK_RGB = [29, 78, 216];

    // Data sources: what this simulation used, each with a clickable link,
    // then the About page's full list.
    const sources = getReportDataSources(isEq);
    doc.setFontSize(9);
    const sourceRows = sources.map(source => ({ ...source, lines: doc.splitTextToSize(source.text, valueWidth) }));
    ensureSpace(32 + sourceRows.reduce((total, row) => total + row.lines.length * 11 + 15, 0));
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(0);
    doc.text('Data sources', margin, y);
    y += 15;
    doc.setFontSize(9);
    sourceRows.forEach(({ label, lines, url }) => {
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(0);
      doc.text(label, margin, y);
      doc.setFont('helvetica', 'normal');
      doc.text(lines, margin + labelColWidth, y);
      y += lines.length * 11;
      doc.setTextColor(...LINK_RGB);
      doc.textWithLink(url, margin + labelColWidth, y, { url });
      y += 15;
    });
    const allSourcesUrl = new URL(DATA_SOURCES_PAGE_PATH, window.location.origin).href;
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0);
    doc.text('All data sources', margin, y);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...LINK_RGB);
    doc.textWithLink(allSourcesUrl, margin + labelColWidth, y, { url: allSourcesUrl });
    doc.setTextColor(0);
    y += 20;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    const wrappedDisclaimer = doc.splitTextToSize(SAFETY_DISCLAIMER_TEXT, pageWidth - margin * 2);
    ensureSpace(wrappedDisclaimer.length * 11);
    doc.setTextColor(150);
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

// Back to the homepage for a new scope. Plain '/', not '#heroBarangaySelector':
// with the homepage's smooth scrolling, that hash played an auto-scroll past
// the hero.
function goToHomepageForNewScope() {
  if (simulationInProgress) return;
  window.location.href = '/';
}

// Changes barangay without leaving the page (the setup panel's toggle, the
// phone top bar's switcher): the same reset as loading it fresh, and the URL
// follows so a reload stays on the new one.
async function switchBarangay(name) {
  if (name === selectedBarangay || !SUPPORTED_QUICKSTART_BARANGAYS.includes(name) || isSimulationInteractionLocked()) {
    return;
  }
  const url = new URL(window.location.href);
  url.searchParams.set('barangay', name);
  history.replaceState(history.state, '', url);
  await selectBarangay(name);
}

// The setup panel's Pinagbuhatan | Sta. Lucia toggle (desktop; phones and
// tablets use the top bar's switcher). Built once, then only its pressed and
// disabled states change, so a focused button keeps focus.
function syncBarangaySwitch() {
  const group = document.getElementById('panelBarangaySwitch');
  if (!group) return;
  if (!group.children.length) {
    group.innerHTML = SUPPORTED_QUICKSTART_BARANGAYS
      .map(name => `<button type="button" data-switch-barangay="${escapeHtml(name)}">${escapeHtml(name)}</button>`)
      .join('');
  }
  const locked = isSimulationInteractionLocked();
  group.querySelectorAll('[data-switch-barangay]').forEach(button => {
    button.setAttribute('aria-pressed', String(button.dataset.switchBarangay === selectedBarangay));
    button.disabled = locked;
  });
}

// One click switches, so ask first when that would drop pins or routes.
document.getElementById('panelBarangaySwitch')?.addEventListener('click', event => {
  const name = event.target.closest?.('[data-switch-barangay]')?.dataset.switchBarangay;
  if (!name || name === selectedBarangay) return;
  const hasWork = !!simData || PIN_ROLES.some(role => routePins[role]);
  if (hasWork && !window.confirm(`Switch to Brgy. ${name}? Your pins and routes will be cleared.`)) return;
  switchBarangay(name);
});

// One /health check (waitForBackend retries it).
async function checkBackend() {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);
  try {
    const r = await fetch(window.BACKEND_BASE + '/health', { signal: controller.signal });
    isBackendLive = r.ok;
  } catch (err) {
    isBackendLive = false;
  } finally {
    clearTimeout(timeoutId);
  }
  if (isBackendLive) document.getElementById('statusTxt').textContent = 'Backend Connected';
  return isBackendLive;
}

// Route focus, shared by the route safety panel, the route list and the map
// polylines (osm.js). Clicking the focused route again clears the focus.
window.toggleRouteFocus = function toggleRouteFocus(routeNo, category) {
  const shouldClear = selectedRouteFocus && selectedRouteFocus.routeNo === routeNo;
  selectedRouteFocus = shouldClear ? null : { routeNo, category };
  applyRouteFocusState(shouldClear ? null : routeNo);
};

// A click anywhere outside a pin input closes its menu.
document.addEventListener('click', event => {
  if (!event.target.closest?.('.pin-input-combo')) closePinMenus();
});

// Up/Down move between a pin menu's items, as in any menu.
document.querySelectorAll('.pin-input-menu').forEach(menu => {
  menu.addEventListener('keydown', event => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    const items = [...menu.querySelectorAll('[role^="menuitem"]:not(:disabled)')];
    if (!items.length) return;
    event.preventDefault();
    const down = event.key === 'ArrowDown';
    const index = items.indexOf(document.activeElement);
    const next = index < 0 ? (down ? 0 : items.length - 1) : (index + (down ? 1 : -1) + items.length) % items.length;
    items[next].focus();
  });
});

// Clicking the dimmed backdrop closes the route list.
document.getElementById('routeListModal')?.addEventListener('mousedown', event => {
  if (event.target === event.currentTarget) closeRouteListModal();
});

syncLoaderContext();
initLoaderGraphPulses();
syncBarangaySwitch();
setFloodLegendContent();
syncEarthquakeRouteUi();
syncEarthquakeViewSelector();
// The setup panel starts open on desktop/tablet (a docked column, covering
// nothing) but closed on a short viewport (a full-screen panel over the
// map) -- per-visit only either way. (Phones and tablets hide both panels.)
applySetupSidebarState(MOBILE_PANEL_QUERY.matches);
syncMobilePanelBarLabel();
syncFloodFilterControl();
advanceStep(1);
