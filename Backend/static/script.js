const BACKEND = 'http://127.0.0.1:5000';
window.BACKEND_BASE = ['127.0.0.1', 'localhost'].includes(window.location.hostname)
  ? `${window.location.protocol}//127.0.0.1:5000`
  : window.location.origin;

let gMap = null;
let selectedBarangay = null;
let selectedHazard = null;
let simData = null;
let resultsCollapsed = false;
let isBackendLive = false;
let activeResultsTab = 'routes';
let activeEarthquakeView = 'overall';
let earthquakeEvacSites = [];
let earthquakeEvacSitesVisible = false;
let mapLayers = { boundaries: [], edges: [], nodes: [], routes: [], routeGroups: [] };
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
  stage: '',
};
const LOADER_FADE_OUT_MS = 260;
const LOADER_PROGRESS_POLL_MS = 900;
const LOADER_ROUTE_STAGE_RANGE = [22, 76];
let loaderProgressPollTimer = null;
const THEME_STORAGE_KEY = 'disaster-route-sim-theme';
const SIMULATION_REQUEST_TIMEOUT_MS = 300000;
const EARTHQUAKE_REQUEST_TIMEOUT_MS = 300000;
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
const EARTHQUAKE_CLASSIFICATION_VIEWS = ['liquefaction', 'ground_shaking'];
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
let mapThemeTransitionTimer = null;
let resultsResizeState = null;

let ALL_LOCATIONS = [];
let LOCATIONS_BY_BARANGAY = {};

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

function getThemeColorValue(variableName, fallback) {
  const bodyValue = getComputedStyle(document.body).getPropertyValue(variableName).trim();
  if (bodyValue) return bodyValue;

  const rootValue = getComputedStyle(document.documentElement).getPropertyValue(variableName).trim();
  return rootValue || fallback;
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

function syncBarangayBoundaryTheme() {
  const strokeColor = getBarangayBoundaryStrokeColor();
  const haloColor = getBarangayBoundaryHaloColor();
  (mapLayers.boundaries || []).forEach(layer => {
    if (layer?.boundaryRole === 'mask') return;
    const isHalo = layer?.boundaryRole === 'halo';
    layer.setStyle({
      color: isHalo ? haloColor : strokeColor,
      opacity: isHalo ? 0.92 : 1,
      weight: isHalo ? 10 : 5,
    });
  });
}

function animateMapThemeTransition() {
  const mapWrap = document.querySelector('.map-wrap');
  if (!mapWrap) return;

  mapWrap.classList.remove('theme-transitioning');
  void mapWrap.offsetWidth;
  mapWrap.classList.add('theme-transitioning');

  if (mapThemeTransitionTimer) {
    window.clearTimeout(mapThemeTransitionTimer);
  }

  mapThemeTransitionTimer = window.setTimeout(() => {
    mapWrap.classList.remove('theme-transitioning');
    mapThemeTransitionTimer = null;
  }, 360);
}

function syncMapTheme(animated = false) {
  if (!gMap) return;

  syncBarangayBoundaryTheme();

  if (animated) {
    animateMapThemeTransition();
  }
}

function syncSiteThemeButton() {
  const btn = document.getElementById('themeToggleBtn');
  const icon = document.getElementById('themeToggleIcon');
  const label = document.getElementById('themeToggleLabel');
  const isDark = document.body.classList.contains('dark');
  const nextTheme = isDark ? 'light' : 'dark';

  if (btn) {
    btn.onclick = toggleTheme;
    btn.setAttribute('aria-label', `Switch to ${nextTheme} mode`);
    btn.setAttribute('aria-pressed', String(isDark));
  }

  if (icon) {
    icon.innerHTML = isDark
      ? '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z"/>'
      : '<circle cx="12" cy="12" r="4.2"/><path d="M12 2v2.4M12 19.6V22M4.9 4.9l1.7 1.7M17.4 17.4l1.7 1.7M2 12h2.4M19.6 12H22M4.9 19.1l1.7-1.7M17.4 6.6l1.7-1.7"/>';
  }

  if (label) {
    label.textContent = isDark ? 'Dark mode' : 'Light mode';
  }
}

function getStoredTheme() {
  try {
    return localStorage.getItem(THEME_STORAGE_KEY) === 'dark' ? 'dark' : 'light';
  } catch (err) {
    return 'light';
  }
}

function applyTheme(theme) {
  document.body.classList.toggle('dark', theme === 'dark');
  document.querySelectorAll('.theme-logo').forEach((logo) => {
    logo.src = theme === 'dark' ? logo.dataset.logoDark : logo.dataset.logoLight;
  });
  applyHazardTheme();
  syncSiteThemeButton();
  syncMapTheme(true);

  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch (err) {
    // Ignore storage failures and keep the theme in-memory only.
  }
}

function initTheme() {
  applyTheme(getStoredTheme());
}

function toggleTheme() {
  applyTheme(document.body.classList.contains('dark') ? 'light' : 'dark');
}

let aboutReturnFocusEl = null;

function showAboutModal(event) {
  const modal = document.getElementById('aboutModal');
  if (!modal) return;

  aboutReturnFocusEl = event?.currentTarget instanceof HTMLElement
    ? event.currentTarget
    : document.activeElement;

  modal.hidden = false;
  window.requestAnimationFrame(() => {
    modal.querySelector('.about-modal-close')?.focus({ preventScroll: true });
  });
}

function closeAboutModal() {
  const modal = document.getElementById('aboutModal');
  if (!modal || modal.hidden) return;

  modal.hidden = true;

  const focusTarget = aboutReturnFocusEl || document.getElementById('aboutTriggerBtn');
  aboutReturnFocusEl = null;
  focusTarget?.focus?.({ preventScroll: true });
}

document.getElementById('aboutModal')?.addEventListener('mousedown', event => {
  if (event.target === event.currentTarget) closeAboutModal();
});

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

// ---- nav's "How to use" step-by-step tutorial (mirrors home.js) ----
const TUTORIAL_STEPS = 5;
let tutorialStep = 1;

function renderTutorialStep() {
  document.querySelectorAll('.tutorial-slide').forEach((el) => {
    el.classList.toggle('is-active', Number(el.dataset.step) === tutorialStep);
  });
  document.querySelectorAll('.tutorial-dot').forEach((dot, i) => {
    dot.classList.toggle('is-active', i + 1 === tutorialStep);
  });
  const stepNum = document.getElementById('tutorialStepNum');
  if (stepNum) stepNum.textContent = String(tutorialStep);

  const back = document.getElementById('tutorialBack');
  if (back) back.disabled = tutorialStep === 1;

  const next = document.getElementById('tutorialNext');
  if (next) next.textContent = tutorialStep === TUTORIAL_STEPS ? 'Done' : 'Next';
}

function goToTutorialStep(step) {
  tutorialStep = Math.min(TUTORIAL_STEPS, Math.max(1, step));
  renderTutorialStep();
}

function tutorialNext() {
  if (tutorialStep === TUTORIAL_STEPS) {
    closeTutorial();
    return;
  }
  goToTutorialStep(tutorialStep + 1);
}

function tutorialPrev() {
  goToTutorialStep(tutorialStep - 1);
}

function openTutorial() {
  const modal = document.getElementById('tutorialModal');
  if (!modal) return;
  goToTutorialStep(1);
  modal.hidden = false;
  document.body.classList.add('tutorial-modal-open');
}

function closeTutorial() {
  const modal = document.getElementById('tutorialModal');
  if (modal) modal.hidden = true;
  document.body.classList.remove('tutorial-modal-open');
}

function handleNavHowToUse(event) {
  event.preventDefault();
  openTutorial();
  return false;
}

function syncMapOverlayLayout() {
  const legend = document.getElementById('mapLegend');
  if (!legend) return;

  // Legend is docked bottom-left via CSS; clear any leftover inline offset.
  legend.style.top = '';
}

// Alias kept for existing call sites; the legend is always fully expanded now.
function syncLegendVisibility() {
  syncMapOverlayLayout();
}

// Clears a sidebar-collapsed key from an older build that no longer uses localStorage for this.
const LEGACY_SIDEBAR_STATE_KEY = 'agnas.setupSidebarCollapsed';
try { window.localStorage?.removeItem(LEGACY_SIDEBAR_STATE_KEY); } catch (err) { /* ignore */ }

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

  window.setTimeout(() => {
    if (gMap) {
      gMap.invalidateSize();
    }
  }, 240);
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

// Setup panel always starts open; the hide/show toggle is per-session only.
function restoreSetupSidebarState() {
  applySetupSidebarState(false);
}

function syncFloodFilterControl() {
  const control = document.getElementById('floodFilterControl');
  const hint = document.getElementById('floodFilterHint');
  const isFlood = selectedHazard === 'Flood' && !!selectedBarangay;
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
  const key = typeof event.key === 'string' ? event.key : '';

  if ((event.ctrlKey || event.metaKey) && key.toLowerCase() === 'b' && !event.altKey) {
    if (isTypingTarget(event.target)) return;
    event.preventDefault();
    toggleSetupSidebar();
    return;
  }

  if (key === 'Escape' && !document.getElementById('routeListModal')?.hidden) {
    event.preventDefault();
    closeRouteListModal();
    return;
  }

  if (key === 'Escape' && document.getElementById('aboutModal')?.hidden === false) {
    event.preventDefault();
    closeAboutModal();
  }
});

function hideFallbackWarningModal() {
  const modal = document.getElementById('fallbackWarningModal');
  if (!modal) return;
  modal.hidden = true;
}

function showFallbackWarningModal() {
  const modal = document.getElementById('fallbackWarningModal');
  const kicker = document.getElementById('fallbackWarningKicker');
  const title = document.getElementById('fallbackWarningTitle');
  const copy = document.getElementById('fallbackWarningCopy');
  if (!modal) return;

  if (kicker) {
    kicker.textContent = 'Warning';
  }

  if (title) {
    title.textContent = 'Proceed with caution';
  }

  if (copy) {
    copy.textContent = 'The routes below are possible routes options only. Review them carefully.';
  }
  modal.hidden = false;
}

function acknowledgeFallbackWarning() {
  hideFallbackWarningModal();
}

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

  // changeBarangayBtn/changeHazardBtn/changeRouteBtn are deliberately left
  // out of this list: syncWorkflowSummaries() (called via advanceStep()
  // right before this on every lock-state change) already recomputes their
  // disabled state fresh from isSimulationInteractionLocked() on every call,
  // so running them through the save/restore dance below too just races
  // with that and can leave them stuck disabled after the lock clears.
  ['startSel', 'endSel', 'showEvacBtn', 'runBtn']
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

  ['changeRunBtn', 'resetBtn', 'resultsNewSimulationBtn'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.disabled = simulationInProgress;
  });
}

function setSimulationInProgress(running) {
  simulationInProgress = !!running;
  advanceStep(getMaxReachableStep());
  syncSimulationConfigLock();
}

function clampResultsPanelHeight(value) {
  const viewportHeight = window.innerHeight || 900;
  const rightPanel = document.querySelector('.right-panel');
  const mapWrap = document.querySelector('.map-wrap');
  const resultsActions = document.getElementById('resultsActions');
  const minHeight = 180;
  const viewportCap = Math.min(Math.round(viewportHeight * 0.82), 800);
  const rightPanelHeight = rightPanel?.getBoundingClientRect().height || viewportHeight;
  const mapMinHeight = Math.max(200, Math.min(Math.round(viewportHeight * 0.35), 380));
  const liveMapHeight = mapWrap?.getBoundingClientRect().height || mapMinHeight;
  const actionsHeight = resultsActions?.offsetHeight || 52;
  const reservedMapHeight = Math.max(mapMinHeight, Math.min(liveMapHeight, Math.round(rightPanelHeight * 0.52)));
  const layoutCap = Math.max(minHeight, rightPanelHeight - actionsHeight - reservedMapHeight - 8);
  const maxHeight = Math.max(minHeight, Math.min(viewportCap, layoutCap));
  return Math.max(minHeight, Math.min(value, maxHeight));
}

function applyResultsPanelHeight(height) {
  const panel = document.getElementById('resultsPanel');
  if (!panel) return;
  panel.style.height = `${clampResultsPanelHeight(height)}px`;
}

function stopResultsResize(event) {
  if (!resultsResizeState) return;

  const handle = document.getElementById('resultsResizeHandle');
  if (handle && event && typeof event.pointerId === 'number') {
    try { handle.releasePointerCapture(event.pointerId); } catch (err) { /* already released */ }
  }

  window.removeEventListener('pointermove', onResultsResizeMove);
  window.removeEventListener('pointerup', stopResultsResize);
  window.removeEventListener('pointercancel', stopResultsResize);
  document.body.classList.remove('results-resizing');
  resultsResizeState = null;
}

function onResultsResizeMove(event) {
  if (!resultsResizeState) return;

  const deltaY = event.clientY - resultsResizeState.startY;
  applyResultsPanelHeight(resultsResizeState.startHeight - deltaY);
}

function startResultsResize(event) {
  const panel = document.getElementById('resultsPanel');
  if (!panel || !panel.classList.contains('show')) return;

  event.preventDefault();
  resultsResizeState = {
    startY: event.clientY,
    startHeight: panel.getBoundingClientRect().height,
  };

  const handle = document.getElementById('resultsResizeHandle');
  if (handle && typeof event.pointerId === 'number') {
    try { handle.setPointerCapture(event.pointerId); } catch (err) { /* not capturable, fall back to window listeners */ }
  }

  document.body.classList.add('results-resizing');
  window.addEventListener('pointermove', onResultsResizeMove);
  window.addEventListener('pointerup', stopResultsResize);
  window.addEventListener('pointercancel', stopResultsResize);
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

  loaderState.stage = stageCopy ? resolvedStageId : '';
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
  loaderState.stage = '';
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
    maxZoom: 20,
    attribution: 'Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community',
  });

  L.control.zoom({ position: 'topright' }).addTo(gMap);
  // Route widths are zoom-scaled (getRouteZoomScale); re-apply them so a
  // zoomed-in route doesn't shrink to a thin line lost in the hazard fills.
  gMap.on('zoomend', syncVisibleRoutesForActiveTab);
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

  let mapResizeDebounceTimer = null;
  window.addEventListener('resize', () => {
    syncMapOverlayLayout();
    const resultsPanel = document.getElementById('resultsPanel');
    if (resultsPanel?.classList.contains('show')) {
      applyResultsPanelHeight(resultsPanel.getBoundingClientRect().height || 320);
    }

    // Leaflet caches its container size, so rotating the phone or toggling
    // the browser's mobile address bar (both fire 'resize') needs an
    // explicit nudge or the map keeps the old dimensions and shows
    // blank/cropped tiles.
    clearTimeout(mapResizeDebounceTimer);
    mapResizeDebounceTimer = window.setTimeout(() => {
      if (gMap) {
        gMap.invalidateSize();
      }
    }, 150);
  });
  startApp();
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

  await loadLocationsFromBackend();
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
  [...mapLayers.edges, ...mapLayers.nodes, ...mapLayers.routes].forEach(o => o.remove());
  mapLayers = { boundaries: [], edges: [], nodes: [], routes: [], routeGroups: [] };
  selectedRouteFocus = null;

  if (activeInfoWindow) {
    activeInfoWindow.remove();
    activeInfoWindow = null;
  }

  if (activeInfoWindowRef.current) {
    activeInfoWindowRef.current.remove();
    activeInfoWindowRef.current = null;
  }

  if (typeof window.clearSelectedRouteRow === 'function') {
    window.clearSelectedRouteRow();
  }
  if (typeof window.clearRouteRowHighlight === 'function') {
    window.clearRouteRowHighlight();
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

  clearSelectedRouteRow();
  if (typeof window.clearRouteRowHighlight === 'function') {
    window.clearRouteRowHighlight();
  }
}

function normalizeLocation(loc) {
  return {
    name: loc.name || '',
    lat: Number(loc.lat),
    lng: Number(loc.lng),
    barangay: loc.barangay || 'Unknown',
    haz: typeof loc.haz === 'number' ? loc.haz : null,
    flood_var: typeof loc.flood_var === 'number' ? loc.flood_var : null,
    hazard_source: loc.hazard_source || null,
    level: loc.level || 'safe'
  };
}

function groupLocationsByBarangay(locations) {
  const grouped = {};

  locations.forEach(loc => {
    const bgy = loc.barangay || 'Unknown';
    if (!grouped[bgy]) grouped[bgy] = [];
    grouped[bgy].push(loc);
  });

  return grouped;
}

async function loadLocationsFromBackend() {
  try {
    const res = await fetch(window.BACKEND_BASE + '/locations');
    const data = await res.json();

    if (data.error) {
      throw new Error(data.message || 'Failed to load locations');
    }

    ALL_LOCATIONS = (data.locations || []).map(normalizeLocation);
    if (!ALL_LOCATIONS.length) {
      throw new Error('No node locations were returned by the backend.');
    }
    LOCATIONS_BY_BARANGAY = groupLocationsByBarangay(ALL_LOCATIONS);

    document.getElementById('statusTxt').textContent = 'Locations Loaded';
  } catch (err) {
    console.error(err);
    document.getElementById('statusTxt').textContent = 'Error Loading Locations';
    alert('Failed to load locations from backend: ' + err.message);
  }
}

function getBarangayLocations(barangay) {
  return LOCATIONS_BY_BARANGAY[barangay] || [];
}

function getLocationByName(name) {
  return ALL_LOCATIONS.find(loc => loc.name === name) || null;
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

function getFloodRiskLabelFromHazard(hazardValue) {
  return getRiskLevelLabelFromScore(hazardValue);
}

function formatFloodPeakRisk(route) {
  const vars = Array.isArray(route?.flood_vars_encountered) ? route.flood_vars_encountered : [];
  if (vars.length) {
    return getFloodRiskLabelFromVar(Math.max(...vars));
  }

  return getFloodRiskLabelFromHazard(route?.max_hazard);
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
// type -- mirrors the wording already used in the main results panel.
function formatRoutePeakRiskLabel(route) {
  return isEarthquakeRouteRecord(route)
    ? getRiskLevelLabelFromScore(route?.max_hazard)
    : formatFloodPeakRiskWithHazard(route);
}

function formatEarthquakeHazardSummary(route) {
  const maxima = route?.hazard_maxima || {};
  if (maxima.liquefaction == null && maxima.ground_shaking == null) {
    return 'N/A';
  }

  return `Liquefaction: ${getRiskLevelLabelFromScore(maxima.liquefaction)}, `
    + `Ground shaking: ${getRiskLevelLabelFromScore(maxima.ground_shaking)}`;
}

function getAcoRankingRuleText() {
  return 'safer routes first, then the route the system favors more, then shorter distance';
}

function getAcoRankingRuleHtml() {
  return '<strong>safer routes first</strong>, then <strong>the route the system favors more</strong>, then <strong>shorter distance</strong>';
}

function getFloodOverlayConfig(mode = floodHazardOverlayMode) {
  return FLOOD_OVERLAY_VIEWS[mode] || FLOOD_OVERLAY_VIEWS.none;
}

function formatHazardBreakdown(route) {
  const entries = Object.entries(route?.hazard_breakdown || {});
  return entries.length
    ? entries.map(([level, count]) => `H${level}:${count}`).join(' · ')
    : 'No hazard data';
}

function isEarthquakeRouteRecord(route) {
  return route?.simulation_mode === 'earthquake';
}

function formatRoadPartCountLabel(count) {
  const numericCount = Number(count || 0);
  return `${numericCount} road part${numericCount === 1 ? '' : 's'}`;
}

function getRouteStatusLabel(route) {
  if (route?.status) {
    return route.status;
  }

  switch (route?.category) {
    case 'best':
      return 'Best';
    case 'available':
      return 'Available';
    case 'eliminated':
      return 'Eliminated';
    default:
      return route?.status || 'Route';
  }
}

function getRouteRiskHeadline(route) {
  if (isEarthquakeRouteRecord(route)) {
    return `${getRiskLevelLabelFromScore(route?.max_hazard)} road risk`;
  }

  return `${formatFloodPeakRisk(route)} flood risk`;
}

function getRouteRiskSubtext(route) {
  const unsafeRoadParts = Number(route?.display_unsafe_segment_count || 0);

  if (isEarthquakeRouteRecord(route)) {
    return `Highest risk level: ${getRiskLevelLabelFromScore(route?.max_hazard)} · Unsafe road parts: ${unsafeRoadParts}`;
  }

  const parts = [
    `Peak flood depth: ${getFloodPeakDepthRange(route)}`,
  ];

  if (unsafeRoadParts > 0) {
    parts.push(`Unsafe road parts: ${unsafeRoadParts}`);
  }

  return parts.join(' · ');
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
    if (route?.status === 'Best') {
      return unsafeSections > 0
        ? `Best backup route${destinationNote}, but ${formatRoadPartCountLabel(unsafeSections)} ${unsafeSections === 1 ? 'is' : 'are'} above the safety limit.`
        : `Best backup route${destinationNote}, but some road parts are above the safety limit.`;
    }

    if (route?.status === 'Available') {
      return unsafeSections > 0
        ? `Available backup route${destinationNote}, but ${formatRoadPartCountLabel(unsafeSections)} ${unsafeSections === 1 ? 'is' : 'are'} above the safety limit.`
        : `Available backup route${destinationNote}, but some road parts are above the safety limit.`;
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

function buildRouteEvidenceChips(route) {
  if (isEarthquakeRouteRecord(route)) {
    return [
      route?.destination_name ? { label: 'Shelter', value: route.destination_name } : null,
      { label: 'Risk view', value: route?.lens_label || 'Overall' },
      { label: 'Highest risk level', value: getRiskLevelLabelFromScore(route?.max_hazard) },
    ].filter(Boolean);
  }

  return [
    { label: 'Flood levels crossed', value: route?.display_flood_classes || 'None' },
    { label: 'Highest flood level', value: formatFloodPeakRiskWithHazard(route) },
  ];
}

function getFriendlyEarthquakeViewDescription(viewKey) {
  switch (viewKey) {
    case 'liquefaction':
      return 'This view focuses on liquefaction risk and shows the safer routes first.';
    case 'ground_shaking':
      return 'This view focuses on ground-shaking risk and shows the safer routes first.';
    case 'overall':
    default:
      return 'This view checks both liquefaction and ground-shaking risk and shows the safer routes first.';
  }
}

function getUserFriendlyRankingExplanation() {
  return 'The safest routes are shown first. If two routes have similar risk, the system checks which one it prefers, then looks at distance.';
}

function buildSummaryCallout(result, safeRoutes, bestRoute, earthquakeSummary) {
  if (isEarthquakeSimulationResult(result)) {
    if (!safeRoutes.length) {
      return earthquakeSummary?.selected_evacuation_site
        ? `<div class="summary-callout-title">Quick Summary</div><div class="summary-callout-copy">No fully safe route was found to <strong>${escapeHtml(earthquakeSummary.selected_evacuation_site.name)}</strong>. The routes shown still pass through road sections above the safety limit.</div>`
        : '<div class="summary-callout-title">Quick Summary</div><div class="summary-callout-copy">No fully safe route was found in this view. The routes shown still pass through road sections above the safety limit.</div>';
    }

    const selectedSite = earthquakeSummary?.selected_evacuation_site?.name || 'the selected evacuation site';
    const viewLabel = result.active_view_label || earthquakeSummary?.view_label || 'Overall';
    const distanceText = bestRoute?.display_distance || 'N/A';
    const durationText = bestRoute?.display_duration || 'N/A';
    return earthquakeSummary?.selected_evacuation_site
      ? `<div class="summary-callout-title">Quick Summary</div><div class="summary-callout-copy">The recommended route goes to <strong>${escapeHtml(selectedSite)}</strong> and is about <strong>${escapeHtml(distanceText)}</strong> long, roughly <strong>${escapeHtml(durationText)}</strong> on foot.</div><div class="summary-callout-copy">This result uses the <strong>${escapeHtml(viewLabel)}</strong> earthquake view and shows the safest option first.</div>`
      : `<div class="summary-callout-title">Quick Summary</div><div class="summary-callout-copy">The recommended route is about <strong>${escapeHtml(distanceText)}</strong> long, roughly <strong>${escapeHtml(durationText)}</strong> on foot.</div><div class="summary-callout-copy">This result uses the <strong>${escapeHtml(viewLabel)}</strong> earthquake view and shows the safest option first.</div>`;
  }

  if (!safeRoutes.length) {
    return '<div class="summary-callout-title">Quick Summary</div><div class="summary-callout-copy">No fully safe flood route was found. All shown options still pass through road sections above the safety limit.</div>';
  }

  const highestFloodLevel = bestRoute ? formatFloodPeakRiskWithHazard(bestRoute) : 'N/A';
  const distanceText = bestRoute?.display_distance || 'N/A';
  const durationText = bestRoute?.display_duration || 'N/A';

  return bestRoute
    ? `<div class="summary-callout-title">Quick Summary</div><div class="summary-callout-copy">The recommended route is about <strong>${escapeHtml(distanceText)}</strong> long, roughly <strong>${escapeHtml(durationText)}</strong> on foot.</div><div class="summary-callout-copy">Its highest flood level is <strong>${escapeHtml(highestFloodLevel)}</strong>, and it stays within the safe limit.</div>`
    : 'Route summary unavailable.';
}

function decorateRouteForDisplay(route) {
  const segmentCount = typeof route?.segments === 'number'
    ? route.segments
    : Array.isArray(route?.path)
    ? Math.max(0, route.path.length - 1)
    : 0;
  const unsafeSegmentCount = Number(route?.threshold_exceedance_count || 0);
  const streetPreview = Array.isArray(route?.street_path) && route.street_path.length
    ? route.street_path.join(' -> ')
    : 'No named streets available';

  return {
    ...route,
    display_distance: formatDistanceCompact(route?.distance),
    display_duration: formatWalkingDuration(route?.distance),
    display_unsafe_distance: formatDistanceCompact(route?.unsafe_distance, '0 m'),
    display_flood_classes: formatFloodClasses(route),
    display_hazard_breakdown: formatHazardBreakdown(route),
    display_route_summary: buildRouteStreetSummary(route),
    display_street_preview: streetPreview,
    display_reason: buildRouteReason(route),
    display_segment_count: segmentCount,
    display_unsafe_segment_count: unsafeSegmentCount,
  };
}

function decorateRoutesForDisplay(routes) {
  return routes.map(route => decorateRouteForDisplay(route));
}

function getCurrentSelections() {
  return {
    barangay: selectedBarangay,
    hazard: selectedHazard,
    start: document.getElementById('startSel')?.value || '',
    end: document.getElementById('endSel')?.value || '',
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

async function sendSimulationRequest(payload) {
  let lastError = null;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    let statusCode = 0;

    try {
      const { response, data } = await postJsonWithTimeout(
        '/simulate',
        payload,
        SIMULATION_REQUEST_TIMEOUT_MS
      );
      statusCode = response.status;

      if (!response.ok || data?.error === true) {
        throw buildBackendRequestError(response, data, 'Simulation failed');
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
      `Simulation took longer than ${formatTimeoutForHumans(SIMULATION_REQUEST_TIMEOUT_MS)} in the browser and was stopped. The backend may still be finishing that run, so wait until it clears before starting another one.`
    );
  }

  throw lastError || new Error('Simulation failed');
}

async function sendEarthquakeRequest(payload) {
  let lastError = null;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    let statusCode = 0;

    try {
      const { response, data } = await postJsonWithTimeout(
        '/earthquake/simulate',
        payload,
        EARTHQUAKE_REQUEST_TIMEOUT_MS
      );
      statusCode = response.status;

      if (!response.ok || data?.error === true) {
        throw buildBackendRequestError(response, data, 'Earthquake simulation failed');
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
      `Earthquake simulation took longer than ${formatTimeoutForHumans(EARTHQUAKE_REQUEST_TIMEOUT_MS)} in the browser and was stopped. The backend may still be finishing that run, so wait until it clears before starting another one.`
    );
  }

  throw lastError || new Error('Earthquake simulation failed');
}

function setRouteSelectorsEnabled(enabled) {
  ['startSel', 'endSel'].forEach(id => {
    document.getElementById(id).disabled = !enabled;
  });
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

function resetEarthquakeState(options = {}) {
  const { clearResults = true, clearCache = false } = options;

  earthquakeEvacSites = [];
  earthquakeEvacSitesVisible = false;
  activeEarthquakeView = 'overall';

  if (clearResults && isEarthquakeSimulationResult(simData)) {
    simData = null;
  }

  if (window.earthquakeUI?.reset) {
    window.earthquakeUI.reset({ clearCache });
  }
}

function getCurrentStartValue() {
  return document.getElementById('startSel')?.value || '';
}

function getCurrentEndValue() {
  return document.getElementById('endSel')?.value || '';
}

function canRunFloodSimulation(start = getCurrentStartValue(), end = getCurrentEndValue()) {
  return !!(selectedHazard === 'Flood' && start && end && start !== end);
}

function canRunEarthquakeSimulation(start = getCurrentStartValue()) {
  return !!(
    isEarthquakeMode()
    && isEarthquakeBarangaySupported()
    && start
    && earthquakeEvacSitesVisible
  );
}

function canRunCurrentSimulation(start = getCurrentStartValue(), end = getCurrentEndValue()) {
  return isEarthquakeMode()
    ? canRunEarthquakeSimulation(start)
    : canRunFloodSimulation(start, end);
}

function syncEarthquakeRouteUi() {
  const routeCardLabel = document.getElementById('routeCardLabel');
  const startNodeLabel = document.getElementById('startNodeLabel');
  const endField = document.getElementById('endField');
  const earthquakeRoutePanel = document.getElementById('earthquakeRoutePanel');
  const earthquakeRouteCopy = document.getElementById('earthquakeRouteCopy');
  const showEvacBtn = document.getElementById('showEvacBtn');
  const evacStatusTxt = document.getElementById('evacStatusTxt');
  const startSel = document.getElementById('startSel');
  const endSel = document.getElementById('endSel');
  const unsupportedEarthquake = isEarthquakeMode() && !isEarthquakeBarangaySupported();
  const hasStart = !!getCurrentStartValue();
  const earthquakeSelectedBarangay = selectedBarangay || 'the selected barangay';

  if (routeCardLabel) {
    routeCardLabel.textContent = isEarthquakeMode() ? 'Start / Evacuation' : 'Start / End';
  }

  if (startNodeLabel) {
    startNodeLabel.textContent = 'Pin location';
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
        : 'Select a start node before revealing evacuation sites.';
    } else {
      evacStatusTxt.textContent = `${earthquakeEvacSites.length} evacuation site(s) loaded on the map.`;
    }
  }

  if (earthquakeRouteCopy) {
    earthquakeRouteCopy.innerHTML = unsupportedEarthquake
      ? `Earthquake routing is currently available only for <strong>${EARTHQUAKE_SUPPORTED_BARANGAY_SCOPE}</strong>.`
      : `Click <strong>Show Evacuation Sites</strong> to reveal the available evacuation shelters for <strong>${escapeHtml(earthquakeSelectedBarangay)}</strong>.`;
  }

  if (startSel && isEarthquakeMode()) {
    startSel.disabled = unsupportedEarthquake;
  }

  if (endSel && isEarthquakeMode()) {
    endSel.disabled = true;
  }

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

function setFloodLegendContent(options = {}) {
  const { showHazardLayers = false } = options;
  const body = document.getElementById('mapLegendBody');
  if (!body) return;

  body.innerHTML = `
    <div class="legend-row"><div class="legend-line" style="background:#22c55e;height:4px;"></div><span style="font-size:.78rem;">Best Route</span></div>
    <div class="legend-row"><div class="legend-line" style="background:#f59e0b;"></div><span style="font-size:.78rem;">Available Route</span></div>
    <div class="legend-row"><div class="legend-line" style="background:#ef4444;opacity:.8;"></div><span style="font-size:.78rem;">Eliminated Route</span></div>
    <div style="margin-top:5px;">
      <div class="legend-row"><div class="legend-dot-sm" style="background:#06b6d4;"></div><span style="font-size:.78rem;">Start Node</span></div>
      <div class="legend-row"><div class="legend-dot-sm" style="background:#a855f7;"></div><span style="font-size:.78rem;">End Node</span></div>
      ${(showHazardLayers || selectedHazard === 'Flood') ? '' : `
        <div class="legend-row"><div class="legend-dot-sm" style="background:var(--green);"></div><span style="font-size:.78rem;">Safe</span></div>
        <div class="legend-row"><div class="legend-dot-sm" style="background:var(--yellow);"></div><span style="font-size:.78rem;">Moderate</span></div>
        <div class="legend-row"><div class="legend-dot-sm" style="background:var(--red);"></div><span style="font-size:.78rem;">Danger</span></div>
      `}
    </div>`;
}

function clearEarthquakeSimulationOutput() {
  if (!isEarthquakeSimulationResult(simData)) {
    return;
  }

  clearRenderedRoutesOnly();
  simData = null;
  activeEarthquakeView = 'overall';
  activeResultsTab = 'routes';

  if (window.earthquakeUI?.renderHazardLayers) {
    window.earthquakeUI.renderHazardLayers({
      map: gMap,
      hazardLayers: null,
      activeView: activeEarthquakeView,
    });
  }

  if (earthquakeEvacSitesVisible && earthquakeEvacSites.length && gMap) {
    window.earthquakeUI?.drawEvacuationSites({
      map: gMap,
      sites: earthquakeEvacSites,
    });
    window.earthquakeUI?.syncLegend(activeEarthquakeView, {
      showRouteKeys: false,
      showHazardLayers: false,
      showHazardSection: false,
    });
    document.getElementById('mapLegend').style.display = 'block';
    syncLegendVisibility();
  } else {
    document.getElementById('mapLegend').style.display = 'none';
    syncLegendVisibility();
  }

  document.getElementById('resultsSummaryTxt').textContent = '';
  setResultsSidebarActionsVisible(false);
  document.getElementById('statusTxt').textContent = 'Ready';
  syncResultsVisibility(false);
  syncEarthquakeViewSelector();
}

// Mirrors clearEarthquakeSimulationOutput() for flood mode: once the setup
// stays editable after a run, picking a different start/end needs to drop
// the previous run's routes so the map/results panel don't show a route
// that no longer matches the selected pins.
function clearFloodSimulationOutput() {
  if (!simData || isEarthquakeSimulationResult(simData)) {
    return;
  }

  clearRenderedRoutesOnly();
  simData = null;
  activeResultsTab = 'routes';

  document.getElementById('resultsSummaryTxt').textContent = '';
  setResultsSidebarActionsVisible(false);
  document.getElementById('statusTxt').textContent = 'Ready';
  syncResultsVisibility(false);
}

function clearHazardSelectionState() {
  document.querySelectorAll('.hazard-card:not(.disabled)').forEach(card => {
    card.classList.remove('selected', ...HAZARD_SELECTION_CLASSES);
  });
}

function populateBarangayNodeSelectors(name) {
  const nodes = getBarangayLocations(name);
  const locs = nodes.map(n => n.name);

  const startSel = document.getElementById('startSel');
  const endSel = document.getElementById('endSel');

  function populate(sel, exclude, placeholder) {
    const kept = sel.value !== exclude ? sel.value : '';
    sel.innerHTML = `<option value="">${placeholder}</option>`;

    locs.forEach(l => {
      if (l === exclude) return;
      sel.innerHTML += `<option value="${l}" ${l === kept ? 'selected' : ''}>${l}</option>`;
    });

    sel.value = kept;
  }

  populate(startSel, null, 'Pin location');
  populate(endSel, null, 'Your destination');

  startSel.disabled = !selectedHazard;
  endSel.disabled = !selectedHazard;

  startSel.onchange = () => {
    populate(endSel, startSel.value, 'Your destination');
    onNodeChange();
  };

  endSel.onchange = () => {
    populate(startSel, endSel.value, 'Pin location');
    onNodeChange();
  };
}

// startSel/endSel stay in the DOM as the source of truth (value/disabled/onchange
// all keep working exactly as before) but are visually hidden; this renders a
// themeable listbox on top of them because a native <select>'s open popup is
// OS-drawn and its hover/selected colors can't be restyled with CSS.
function initLocationCombo(selectId) {
  const select = document.getElementById(selectId);
  const trigger = document.getElementById(`${selectId}Trigger`);
  const valueEl = document.getElementById(`${selectId}Value`);
  const list = document.getElementById(`${selectId}List`);
  if (!select || !trigger || !valueEl || !list) return;

  function closeList() {
    if (list.hidden) return;
    list.hidden = true;
    trigger.setAttribute('aria-expanded', 'false');
  }

  function renderOptions() {
    list.innerHTML = '';
    Array.from(select.options).forEach(opt => {
      const li = document.createElement('li');
      li.setAttribute('role', 'option');
      li.className = 'location-combo-option';
      li.textContent = opt.text;
      li.dataset.value = opt.value;
      li.tabIndex = -1;
      const isSelected = opt.value === select.value;
      li.setAttribute('aria-selected', String(isSelected));
      if (isSelected) li.classList.add('selected');
      li.addEventListener('click', () => chooseValue(opt.value));
      li.addEventListener('keydown', onOptionKeydown);
      list.appendChild(li);
    });
  }

  function openList() {
    if (trigger.disabled || !list.hidden) return;
    renderOptions();
    list.hidden = false;
    trigger.setAttribute('aria-expanded', 'true');
    (list.querySelector('[aria-selected="true"]') || list.firstElementChild)?.focus();
  }

  function chooseValue(value) {
    if (select.value !== value) {
      select.value = value;
      select.dispatchEvent(new Event('change', { bubbles: true }));
    }
    sync();
    closeList();
    trigger.focus();
  }

  function onOptionKeydown(e) {
    const items = Array.from(list.children);
    const idx = items.indexOf(document.activeElement);
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      (items[idx + 1] || items[0])?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      (items[idx - 1] || items[items.length - 1])?.focus();
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      chooseValue(document.activeElement.dataset.value);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      closeList();
      trigger.focus();
    } else if (e.key === 'Tab') {
      closeList();
    }
  }

  function sync() {
    // No <option>s exist yet before a barangay is picked - leave the
    // HTML-authored placeholder ("Pin location" / "Your destination") alone.
    const selectedOption = select.options[select.selectedIndex];
    if (selectedOption) valueEl.textContent = selectedOption.text;
    trigger.disabled = select.disabled;
    if (!list.hidden) renderOptions();
  }

  trigger.addEventListener('click', () => {
    if (list.hidden) openList();
    else closeList();
  });

  trigger.addEventListener('keydown', e => {
    // Enter/Space already reach us as a native click on a <button> - only
    // ArrowDown needs handling here, or opening would immediately re-close.
    if (!list.hidden) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      openList();
    }
  });

  document.addEventListener('click', e => {
    if (list.hidden || trigger.contains(e.target) || list.contains(e.target)) return;
    closeList();
  });

  new MutationObserver(sync).observe(select, { attributes: true, attributeFilter: ['disabled'], childList: true });

  sync();
}

function clearBarangaySelections(options = {}) {
  const { keepResults = false, keepInfoText = false } = options;

  floodHazardOverlayMode = 'none';
  resetEarthquakeState({ clearResults: !keepResults });
  hideFallbackWarningModal();
  simData = null;
  selectedRouteFocus = null;
  resetRouteSafetyPanel();
  clearLayers();

  ['startSel', 'endSel'].forEach(id => {
    const select = document.getElementById(id);
    const placeholder = !selectedHazard
      ? '— Select disaster type first —'
      : id === 'startSel'
      ? 'Pin location'
      : 'Your destination';

    select.innerHTML = `<option value="">${placeholder}</option>`;
    select.value = '';
    select.disabled = !selectedHazard;
  });

  document.getElementById('runBtn').disabled = true;
  document.getElementById('mapInfoBadge')?.style?.setProperty('display', 'none');
  document.getElementById('mapLegend').style.display = 'none';
  syncLegendVisibility();

  if (!keepResults) {
    document.getElementById('resultsPanel').classList.remove('show');
    document.getElementById('resultsActions').classList.remove('show');
    setResultsSidebarActionsVisible(false);
    document.getElementById('resultsSummaryTxt').textContent = '';
    document.getElementById('resultsToggleFab').classList.remove('show');
    resultsCollapsed = false;
  }

  if (!keepInfoText) {
    document.getElementById('infoBox').innerHTML = selectedBarangay
      ? `<strong>Brgy. ${selectedBarangay}</strong> loaded. ${selectedHazard ? 'Choose your <strong>start</strong> and <strong>end</strong> nodes below.' : 'Choose a <strong>disaster type</strong> first.'}`
      : `Select a <strong>barangay</strong> and then choose a <strong>disaster type</strong> to begin. The ACO algorithm will rank routes using ${getAcoRankingRuleHtml()}.`;
  }

  syncEarthquakeViewSelector();
  syncEarthquakeRouteUi();
  updateMapContextBadge();
  syncSimulationConfigLock();
}

function syncResultsVisibility(expanded) {
  const hasResults = !!(simData && Array.isArray(simData.routes) && simData.routes.length);
  const resultsPanel = document.getElementById('resultsPanel');
  const resultsActions = document.getElementById('resultsActions');
  const resultsToggleFab = document.getElementById('resultsToggleFab');
  const routeCount = hasResults ? simData.routes.length : 0;

  resultsPanel.classList.toggle('show', hasResults && expanded);
  resultsActions.classList.toggle('show', hasResults && expanded);
  resultsToggleFab.classList.toggle('show', hasResults && !expanded);
  resultsToggleFab.textContent = routeCount ? `Show Results (${routeCount})` : 'Show Results';

  resultsCollapsed = hasResults && !expanded;

  if (!hasResults) resetRouteSafetyPanel();

  if (hasResults && expanded) {
    window.requestAnimationFrame(() => {
      const desiredHeight = parseFloat(resultsPanel.style.height) || resultsPanel.getBoundingClientRect().height || 320;
      applyResultsPanelHeight(desiredHeight);
    });
  }
}

function hideResultsPanel() {
  if (!simData) return;
  syncResultsVisibility(false);
}

function showResultsPanelDrawer() {
  if (!simData) return;
  syncResultsVisibility(true);
}

function nodeColor(haz, id, start, end) {
  if (id === start) return '#06b6d4';
  if (id === end) return '#a855f7';
  if (haz == null) return '#94a3b8';
  if (haz <= 2) return '#22c55e';
  if (haz === 3) return '#eab308';
  return '#ef4444';
}

function describeNodeFloodClass(node) {
  if (typeof node.flood_var === 'number') {
    return `Var ${node.flood_var}`;
  }

  if (node.hazard_source === 'flood_json') {
    return 'No direct polygon match';
  }

  return 'Unavailable';
}

function describeHazardSource(node) {
  if (node.hazard_source === 'flood_json') {
    return 'Flood GeoJSON';
  }

  return 'Unavailable';
}

function buildNodePopupRows(node, start, end) {
  if (isEarthquakeMode()) {
    return [
      ['Role', node.name === start ? 'Start point' : 'Node'],
      ['Mode', 'Earthquake'],
      ['Barangay', node.barangay || selectedBarangay || 'N/A'],
    ];
  }

  const col = nodeColor(node.haz, node.name, start, end);
  const hazardText = node.haz == null ? 'Unavailable' : `${node.haz} / 5`;
  const hazardSourceText = describeHazardSource(node);

  return [
    ['Role', node.name === start ? 'Start point' : node.name === end ? 'End point' : 'Node'],
    ['Node Flood Hazard', hazardText, col],
    ['Hazard Source', hazardSourceText],
    ['Barangay', node.barangay || selectedBarangay || 'N/A'],
  ];
}

function shortNodeLabel(name) {
  if (name == null) return 'N/A';
  return String(name).split(',')[0].split(' ').slice(0, 2).join(' ');
}

function infoPopup(title, rows) {
  return `<div class="popup-shell">
    <div class="popup-title">${escapeHtml(title)}</div>
    ${rows.map(([k, v, c]) => `<div class="popup-row"><span>${escapeHtml(k)}</span><span style="${c ? 'color:' + c : ''}">${escapeHtml(v)}</span></div>`).join('')}
  </div>`;
}

function updateMapContextBadge() {
  const badge = document.getElementById('mapInfoBadge');
  const content = document.getElementById('mapInfoContent');
  if (!badge || !content) return;

  const { barangay, hazard, start, end } = getCurrentSelections();
  const hasSelection = Boolean(barangay || hazard || start || end || simData);

  if (!hasSelection) {
    badge.style.display = 'none';
    content.innerHTML = '';
    window.requestAnimationFrame(syncMapOverlayLayout);
    return;
  }

  const routes = Array.isArray(simData?.routes) ? simData.routes : [];
  const bestRoute = routes.find(route => route.category === 'best') || null;
  const safeCount = routes.filter(route => route.category !== 'eliminated').length;
  const eliminatedCount = routes.filter(route => route.category === 'eliminated').length;
  const earthquakeSummary = isEarthquakeSimulationResult(simData)
    ? simData?.active_summary || getActiveEarthquakeViewData(simData)?.summary || null
    : null;
  const selectionRoute = isEarthquakeMode()
    ? start
      ? earthquakeEvacSitesVisible
        ? `${shortNodeLabel(start)} -> ${earthquakeSummary?.selected_evacuation_site?.name || (routes.length ? 'No safe evacuation site' : 'Candidate evacuation sites')}`
        : `${shortNodeLabel(start)} -> Reveal evacuation sites`
      : 'Select a start node'
    : start && end
    ? `${shortNodeLabel(start)} -> ${shortNodeLabel(end)}`
    : start
    ? `${shortNodeLabel(start)} -> Choose destination`
    : 'Select start and end nodes';
  const stats = [
    `${routes.length || 0} shown`,
    `${safeCount || 0} safe`,
  ];

  if (eliminatedCount > 0) {
    stats.push(`${eliminatedCount} eliminated`);
  }

  content.innerHTML = `
    <div class="map-context compact">
      <div class="map-context-head">
        <div class="map-context-kicker">${escapeHtml((hazard || 'Route').toUpperCase())} CONTEXT</div>
        <div class="map-context-status">${routes.length ? 'Results Ready' : 'Selection In Progress'}</div>
      </div>
      <div class="map-context-grid">
        <div class="map-context-row">
          <span>Barangay</span>
          <strong>${escapeHtml(barangay || 'Not selected')}</strong>
        </div>
        <div class="map-context-row">
          <span>Route</span>
          <strong>${escapeHtml(selectionRoute)}</strong>
        </div>
        <div class="map-context-row">
          <span>Best</span>
          <strong>${escapeHtml(bestRoute ? (bestRoute.destination_name || bestRoute.display_distance) : (routes.length ? 'No safe route' : 'Run simulation'))}</strong>
        </div>
      </div>
      <div class="map-context-chips">
        ${stats.map(value => `<span class="map-context-chip">${escapeHtml(value)}</span>`).join('')}
      </div>
    </div>`;

  badge.style.display = 'block';
  window.requestAnimationFrame(syncMapOverlayLayout);
}

function fitMapToLocations(locations, padding = 60) {
  if (!locations.length) return;

  const bounds = L.latLngBounds(locations.map(loc => ({ lat: loc.lat, lng: loc.lng })));
  gMap.fitBounds(bounds, { padding: [padding, padding] });
}

function buildScopeBounds(points) {
  return L.latLngBounds(points);
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

function fitMapToRoute(route, padding = 34) {
  const routePoints = Array.isArray(route?.render_path) && route.render_path.length
    ? route.render_path
    : Array.isArray(route?.path_coordinates)
    ? route.path_coordinates
    : [];

  if (!routePoints.length) return false;

  const bounds = buildScopeBounds(routePoints);
  gMap.fitBounds(bounds, { padding: [padding, padding] });

  gMap.once('moveend', () => {
    const currentZoom = gMap.getZoom();
    if (!Number.isFinite(currentZoom)) return;

    const ne = bounds.getNorthEast();
    const sw = bounds.getSouthWest();
    const maxSpan = Math.max(
      Math.abs(ne.lat - sw.lat),
      Math.abs(ne.lng - sw.lng)
    );

    let minZoom = null;
    if (maxSpan <= 0.012) minZoom = 15;
    if (maxSpan <= 0.007) minZoom = 16;
    if (maxSpan <= 0.0035) minZoom = 17;

    const targetZoom = minZoom == null ? currentZoom : Math.max(minZoom, currentZoom);

    if (currentZoom < targetZoom) {
      gMap.setZoom(targetZoom);
    }
  });

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

function extendBoundsWithGeoJsonGeometry(bounds, geometry) {
  if (!geometry || !geometry.type) {
    return false;
  }

  const { type, coordinates } = geometry;
  let hasPoints = false;

  const extendCoordinate = coordinate => {
    if (!Array.isArray(coordinate) || coordinate.length < 2) {
      return;
    }

    hasPoints = extendBoundsWithLngLat(bounds, coordinate[0], coordinate[1]) || hasPoints;
  };

  if (type === 'Point') {
    extendCoordinate(coordinates);
    return hasPoints;
  }

  if (type === 'LineString' || type === 'MultiPoint') {
    (coordinates || []).forEach(extendCoordinate);
    return hasPoints;
  }

  if (type === 'Polygon' || type === 'MultiLineString') {
    (coordinates || []).forEach(path => {
      (path || []).forEach(extendCoordinate);
    });
    return hasPoints;
  }

  if (type === 'MultiPolygon') {
    (coordinates || []).forEach(polygon => {
      (polygon || []).forEach(path => {
        (path || []).forEach(extendCoordinate);
      });
    });
  }

  return hasPoints;
}

function getDisplayedEarthquakeRoute() {
  if (!isEarthquakeSimulationResult(simData) || !Array.isArray(simData.routes)) {
    return null;
  }

  return simData.routes.find(route => route.category === 'best') || simData.routes[0] || null;
}

function shouldShowEarthquakeHazardOverlays(viewKey = activeEarthquakeView) {
  // "Overall" renders a blend of both hazard layers, so it needs the overlay too.
  return viewKey === 'overall' || EARTHQUAKE_CLASSIFICATION_VIEWS.includes(viewKey);
}

function getEarthquakeHazardCollectionsForView(viewKey = activeEarthquakeView) {
  if (!isEarthquakeSimulationResult(simData)) {
    return [];
  }

  if (shouldShowEarthquakeHazardOverlays(viewKey)) {
    const collection = simData.hazard_layers?.[viewKey];
    return collection ? [collection] : [];
  }

  return [];
}

function fitEarthquakeMapScope(options = {}) {
  const { includeHazards = false } = options;

  if (!gMap || !selectedBarangay || !isEarthquakeMode()) {
    return false;
  }

  const bounds = L.latLngBounds();
  let hasPoints = false;

  const startNode = getLocationByName(getCurrentStartValue());
  if (startNode) {
    hasPoints = extendBoundsWithLngLat(bounds, startNode.lng, startNode.lat) || hasPoints;
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

  gMap.fitBounds(bounds, { padding: [52, 52] });
  gMap.once('moveend', () => {
    if (gMap.getZoom() < EARTHQUAKE_MIN_FOCUS_ZOOM) {
      gMap.setZoom(EARTHQUAKE_MIN_FOCUS_ZOOM);
    }
  });
  return true;
}

async function loadBarangayMapOnly(bgyName) {
  clearLayers();

  const nodes = getBarangayLocations(bgyName);

  document.getElementById('mapLegend').style.display = 'none';
  syncLegendVisibility();
  document.getElementById('mapInfoBadge')?.style?.setProperty('display', 'none');

  if (!nodes.length) return;

  try {
    const res = await fetch(window.BACKEND_BASE + '/barangay-boundary/' + encodeURIComponent(bgyName));
    const data = await res.json();

    if (!res.ok || data.error === true) {
      throw new Error(data.message || 'Failed to load barangay boundary');
    }

    const paths = Array.isArray(data.boundary?.paths) ? data.boundary.paths : [];
    let hasBoundary = false;

    const normalizedPaths = paths.map(path => (path || [])
      .filter(point => point && point.lat != null && point.lng != null)
      .map(point => ({
        lat: Number(point.lat),
        lng: Number(point.lng),
      })));

    const scopeMask = buildBarangayScopeMask(normalizedPaths);
    if (scopeMask) {
      scopeMask.addTo(gMap);
      scopeMask.boundaryRole = 'mask';
      mapLayers.boundaries.push(scopeMask);
    }

    normalizedPaths.forEach(normalizedPath => {
      if (normalizedPath.length < 2) return;

      const halo = L.polyline(normalizedPath, {
        color: getBarangayBoundaryHaloColor(),
        opacity: 0.92,
        weight: 10,
        interactive: false,
      }).addTo(gMap);

      halo.boundaryRole = 'halo';
      mapLayers.boundaries.push(halo);

      const outline = L.polyline(normalizedPath, {
        color: getBarangayBoundaryStrokeColor(),
        opacity: 1,
        weight: 5,
        interactive: false,
      }).addTo(gMap);

      outline.boundaryRole = 'main';
      mapLayers.boundaries.push(outline);
      hasBoundary = true;
    });

    if (hasBoundary && fitMapToBoundaryPaths(paths, 42)) {
      return;
    }
  } catch (err) {
    console.error('Failed to load barangay boundary:', err);
  }

  fitMapToLocations(nodes, 70);
}

function drawNode(n, start, end) {
  const col = nodeColor(n.haz, n.name, start, end);
  const special = n.name === start || n.name === end;
  const role = n.name === start ? 'start' : n.name === end ? 'end' : null;

  // Special (start/end) pins are real Leaflet markers, which always paint
  // above plain vector paths regardless of insertion order (markerPane sits
  // above overlayPane) - that alone reproduces the old special-vs-regular
  // zIndex contrast. Regular nodes are lightweight circleMarkers (a Path,
  // like the old SymbolPath.CIRCLE icon) with their label as a permanent,
  // centered tooltip instead of Google's marker `label` option.
  const marker = special
    ? L.marker({ lat: n.lat, lng: n.lng }, {
        title: n.name,
        zIndexOffset: 3400,
        icon: makeRouteEndpointPinIcon(role),
      }).addTo(gMap)
    : L.circleMarker({ lat: n.lat, lng: n.lng }, {
        title: n.name,
        radius: 10,
        fillColor: col,
        fillOpacity: 0.95,
        color: '#ffffff',
        weight: 2.5,
      }).addTo(gMap);

  if (!special) {
    marker.bindTooltip(shortNodeLabel(n.name), {
      permanent: true,
      direction: 'center',
      className: 'agnas-node-label',
    });
  }

  marker.on('click', () => {
    if (activeInfoWindow) activeInfoWindow.remove();
    activeInfoWindow = L.popup()
      .setLatLng(marker.getLatLng())
      .setContent(infoPopup(n.name, buildNodePopupRows(n, start, end)))
      .openOn(gMap);
  });

  mapLayers.nodes.push(marker);
}

function makeNodeBadgeIcon(text) {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="184" height="56" viewBox="0 0 184 56">
      <defs>
        <filter id="bubbleShadow" x="-20%" y="-20%" width="140%" height="160%">
          <feDropShadow dx="0" dy="4" stdDeviation="6" flood-color="rgba(15,23,42,0.20)"/>
        </filter>
      </defs>
      <g filter="url(#bubbleShadow)">
        <rect x="8" y="6" rx="15" ry="15" width="168" height="36" fill="#ffffff" stroke="#d7deea" stroke-width="1.5"/>
        <path d="M85 42 L99 42 L92 51 Z" fill="#ffffff" stroke="#d7deea" stroke-width="1.5" stroke-linejoin="round"/>
      </g>
      <text x="92" y="28" text-anchor="middle" font-family="Nunito, Arial, sans-serif" font-size="12" font-weight="700" fill="#1f2937">${text}</text>
    </svg>
  `;

  return L.icon({
    iconUrl: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
    iconSize: [184, 56],
    iconAnchor: [92, 51],
  });
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

function drawSelectedPinsOnly(start, end) {
  mapLayers.nodes.forEach(m => m.remove());
  mapLayers.nodes = [];

  if (!selectedBarangay) return;

  const nodes = getBarangayLocations(selectedBarangay);

  nodes.forEach(n => {
    if (n.name !== start && n.name !== end) return;

    const marker = L.marker({ lat: n.lat, lng: n.lng }, {
      title: n.name,
      zIndexOffset: 3600,
      icon: makeRouteEndpointPinIcon(n.name === start ? 'start' : 'end'),
    }).addTo(gMap);

    marker.on('click', () => {
      if (activeInfoWindow) activeInfoWindow.remove();
      activeInfoWindow = L.popup()
        .setLatLng(marker.getLatLng())
        .setContent(infoPopup(n.name, buildNodePopupRows(n, start, end)))
        .openOn(gMap);
    });

    mapLayers.nodes.push(marker);
  });
}

function redrawNodes(start, end) {
  if (!selectedBarangay) return;

  mapLayers.nodes.forEach(m => m.remove());
  mapLayers.nodes = [];

  getBarangayLocations(selectedBarangay).forEach(n => drawNode(n, start, end));
}

async function selectBarangay(name) {
  if (isSimulationInteractionLocked()) return;

  const nodes = getBarangayLocations(name);
  workflowFocusSection = null;

  if (!nodes.length) {
    document.getElementById('infoBox').innerHTML =
      `<strong>Brgy. ${name}</strong> has no available nodes in the current database.`;
    updateMapContextBadge();
    return;
  }

  if (selectedBarangay === name) {
    clearBarangaySelections({ keepResults: false, keepInfoText: true });
    if (selectedHazard === 'Flood') floodHazardOverlayMode = 'all';
    await loadBarangayMapOnly(name);
    if (selectedHazard === 'Flood') await syncFloodHazardOverlay(name);
  syncFloodFilterControl();
    document.getElementById('emptyMap').style.display = 'none';
    advanceStep(selectedHazard ? 3 : 2);
    if (isEarthquakeMode()) {
      document.getElementById('infoBox').innerHTML = isEarthquakeBarangaySupported(name)
        ? `<strong>Brgy. ${name}</strong> reset. Choose your <strong>start node</strong>, then reveal the <strong>evacuation sites</strong>.`
        : `<strong>Earthquake Routing</strong> is currently available only for <strong>${EARTHQUAKE_SUPPORTED_BARANGAY_SCOPE}</strong>.`;
    } else {
      document.getElementById('infoBox').innerHTML = selectedHazard
        ? `<strong>Brgy. ${name}</strong> reset. Choose your <strong>start</strong> and <strong>end</strong> nodes again.`
        : `<strong>Brgy. ${name}</strong> loaded. Choose a <strong>disaster type</strong> to continue.`;
    }
    syncEarthquakeRouteUi();
    updateMapContextBadge();
    return;
  }

  selectedBarangay = name;

  clearBarangaySelections({ keepResults: false, keepInfoText: true });
  if (selectedHazard === 'Flood') floodHazardOverlayMode = 'all';

  const locs = nodes.map(n => n.name);

  const startSel = document.getElementById('startSel');
  const endSel = document.getElementById('endSel');

  function populate(sel, exclude, placeholder) {
    const kept = sel.value !== exclude ? sel.value : '';
    sel.innerHTML = `<option value="">${placeholder}</option>`;

    locs.forEach(l => {
      if (l === exclude) return;
      sel.innerHTML += `<option value="${l}" ${l === kept ? 'selected' : ''}>${l}</option>`;
    });

    sel.value = kept;
  }

  populate(startSel, null, 'Pin location');
  populate(endSel, null, 'Your destination');

  startSel.disabled = !selectedHazard;
  endSel.disabled = !selectedHazard;

  startSel.onchange = () => {
    populate(endSel, startSel.value, 'Your destination');
    onNodeChange();
  };

  endSel.onchange = () => {
    populate(startSel, endSel.value, 'Pin location');
    onNodeChange();
  };

  document.getElementById('emptyMap').style.display = 'none';

  await loadBarangayMapOnly(name);
  if (selectedHazard === 'Flood') await syncFloodHazardOverlay(name);
  syncFloodFilterControl();
  advanceStep(selectedHazard ? 3 : 2);

  if (!selectedHazard) {
    document.getElementById('infoBox').innerHTML =
      `<strong>Brgy. ${name}</strong> selected — map loaded. Choose a <strong>disaster type</strong> first.`;
  } else if (isEarthquakeMode()) {
    document.getElementById('infoBox').innerHTML = isEarthquakeBarangaySupported(name)
      ? `<strong>Brgy. ${name}</strong> selected — earthquake routing is ready. Choose a <strong>start node</strong> first.`
      : `<strong>Earthquake Routing</strong> is currently available only for <strong>${EARTHQUAKE_SUPPORTED_BARANGAY_SCOPE}</strong>.`;
  } else {
    document.getElementById('infoBox').innerHTML =
      `<strong>Brgy. ${name}</strong> selected — map loaded. Choose your <strong>start</strong> and <strong>end</strong> nodes below.`;
  }

  syncEarthquakeRouteUi();
  updateMapContextBadge();
}

function onNodeChange() {
  if (isSimulationInteractionLocked()) {
    syncSimulationConfigLock();
    return;
  }

  const start = document.getElementById('startSel').value;
  const end = document.getElementById('endSel').value;
  const canRun = canRunCurrentSimulation(start, end);
  workflowFocusSection = null;

  if (isEarthquakeMode()) {
    if (isEarthquakeSimulationResult(simData) && simData.start !== start) {
      clearEarthquakeSimulationOutput();
    }

    if (!selectedHazard) advanceStep(2);
    else if (!isEarthquakeBarangaySupported()) advanceStep(2);
    else if (!start) advanceStep(3);
    else if (!earthquakeEvacSitesVisible) advanceStep(4);
    else advanceStep(5);
  } else {
    if (simData && !isEarthquakeSimulationResult(simData) && (simData.start !== start || simData.end !== end)) {
      clearFloodSimulationOutput();
    }

    if (canRun) advanceStep(5);
    else if (!selectedHazard) advanceStep(2);
    else if (start || end) advanceStep(4);
    else advanceStep(3);
  }

  document.getElementById('runBtn').disabled = !canRun || backendSimulationBusy;

  if (isEarthquakeMode()) {
    if (start) {
      drawSelectedPinsOnly(start, null);
      if (earthquakeEvacSitesVisible && earthquakeEvacSites.length) {
        window.earthquakeUI?.drawEvacuationSites({
          map: gMap,
          sites: earthquakeEvacSites,
          highlightedSiteId: simData?.active_summary?.selected_evacuation_site?.id || null,
        });
      }
    } else {
      drawSelectedPinsOnly('', null);
      if (earthquakeEvacSitesVisible && earthquakeEvacSites.length) {
        window.earthquakeUI?.drawEvacuationSites({
          map: gMap,
          sites: earthquakeEvacSites,
        });
      }
    }
    if (backendSimulationBusy) {
      document.getElementById('infoBox').innerHTML =
        `The backend is still finishing a <strong>previous simulation</strong>. Wait until it clears before running a new earthquake simulation.`;
    } else if (!isEarthquakeBarangaySupported()) {
      document.getElementById('infoBox').innerHTML =
        `<strong>Earthquake Routing</strong> is currently available only for <strong>${EARTHQUAKE_SUPPORTED_BARANGAY_SCOPE}</strong>.`;
    } else if (canRun) {
      document.getElementById('infoBox').innerHTML =
        `The system will compare routes from <strong>${start}</strong> to the evacuation sites that can still be reached. Click <strong>Run Earthquake Simulation</strong> to view the results.`;
    } else if (!start) {
      document.getElementById('infoBox').innerHTML =
        `Choose a <strong>start node</strong> to begin the earthquake routing flow.`;
    } else if (!earthquakeEvacSitesVisible) {
      document.getElementById('infoBox').innerHTML =
        `Start selected. Now click <strong>Show Evacuation Sites</strong> to load the available evacuation shelters.`;
    } else {
      document.getElementById('infoBox').innerHTML =
        `Evacuation sites are loaded. Click <strong>Run Earthquake Simulation</strong> when you are ready.`;
    }

  } else {
    if (start || end) drawSelectedPinsOnly(start, end);

    if (backendSimulationBusy) {
      document.getElementById('infoBox').innerHTML =
        `The backend is still finishing a <strong>previous simulation</strong>. Wait until it clears before running a new route simulation.`;
    } else if (canRun) {
      document.getElementById('infoBox').innerHTML =
        `Ready! <strong>${start}</strong> to <strong>${end}</strong>. Click <strong>Run Simulation</strong>.`;
    } else if (!selectedHazard) {
      document.getElementById('infoBox').innerHTML =
        `Choose a <strong>disaster type</strong> to enable route testing.`;
    } else if (start && !end) {
      document.getElementById('infoBox').innerHTML =
        `Start selected. Now choose an <strong>end node</strong>.`;
    } else if (!start && end) {
      document.getElementById('infoBox').innerHTML =
        `End selected. Now choose a <strong>start node</strong>.`;
    } else {
      document.getElementById('infoBox').innerHTML =
        `Choose a <strong>start node</strong> from the dropdown.`;
    }

  }

  syncEarthquakeRouteUi();
  updateMapContextBadge();
}

async function selectHazard(name, el) {
  if (isSimulationInteractionLocked()) return;

  clearHazardSelectionState();
  resetEarthquakeState({ clearResults: true });
  el.classList.add('selected', name.toLowerCase());
  selectedHazard = name;
  applyHazardTheme();
  workflowFocusSection = null;
  document.getElementById('endSel').value = '';

  if (!selectedBarangay) {
    floodHazardOverlayMode = name === 'Flood' ? 'all' : 'none';
    syncFloodFilterControl();
    document.getElementById('infoBox').innerHTML =
      isEarthquakeMode(name)
        ? `<strong>${name}</strong> selected. Choose <strong>Brgy. ${EARTHQUAKE_SUPPORTED_BARANGAY_PROMPT}</strong> to start earthquake routing.`
        : `Disaster type <strong>${name}</strong> selected. Now choose a <strong>barangay</strong>.`;
    advanceStep(1);
    syncEarthquakeRouteUi();
    updateMapContextBadge();
    return;
  }

  clearBarangaySelections({ keepResults: false, keepInfoText: true });
  floodHazardOverlayMode = name === 'Flood' ? 'all' : 'none';
  syncFloodFilterControl();
  document.getElementById('emptyMap').style.display = 'none';
  await loadBarangayMapOnly(selectedBarangay);
  if (name === 'Flood') {
    const overlayState = await syncFloodHazardOverlay(selectedBarangay);
    setFloodLegendContent({ showHazardLayers: overlayState.visible, hazardOverlayMode: floodHazardOverlayMode });
    document.getElementById('mapLegend').style.display = 'block';
    syncLegendVisibility();
  } else {
    // Flood polygons and the severity filter are flood-only; clear both for earthquake.
    await syncFloodHazardOverlay(selectedBarangay);
  }

  populateBarangayNodeSelectors(selectedBarangay);
  setRouteSelectorsEnabled(!isEarthquakeMode());
  document.getElementById('startSel').disabled = isEarthquakeMode() && !isEarthquakeBarangaySupported();
  advanceStep(3);
  onNodeChange();

  if (!document.getElementById('startSel').value && !document.getElementById('endSel').value) {
    document.getElementById('infoBox').innerHTML =
      isEarthquakeMode(name)
        ? isEarthquakeBarangaySupported()
          ? `<strong>${name}</strong> selected for <strong>Brgy. ${selectedBarangay}</strong>. Choose a <strong>start node</strong> first.`
          : `<strong>${name}</strong> is currently available only for <strong>${EARTHQUAKE_SUPPORTED_BARANGAY_SCOPE}</strong>.`
        : `<strong>${name}</strong> selected for <strong>Brgy. ${selectedBarangay}</strong>. Choose your <strong>start</strong> and <strong>end</strong> nodes.`;
  }

  syncEarthquakeRouteUi();
  updateMapContextBadge();
}

function getCompletedSteps() {
  const start = document.getElementById('startSel')?.value || '';
  const end = document.getElementById('endSel')?.value || '';

  return {
    1: !!selectedBarangay,
    2: !!selectedHazard,
    3: !!start,
    4: isEarthquakeMode()
      ? earthquakeEvacSitesVisible
      : !!end && start !== end,
    5: isEarthquakeMode()
      ? canRunEarthquakeSimulation(start)
      : canRunFloodSimulation(start, end),
  };
}

function getMaxReachableStep() {
  if (!selectedBarangay) return 1;
  if (!selectedHazard) return 2;

  const start = document.getElementById('startSel')?.value || '';
  const end = document.getElementById('endSel')?.value || '';

  if (isEarthquakeMode()) {
    if (!isEarthquakeBarangaySupported()) return 2;
    if (!start) return 3;
    if (!earthquakeEvacSitesVisible) return 4;
    return 5;
  }

  if (!start) return 3;
  if (!end || start === end) return 4;
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

function getStepValue(step) {
  const start = document.getElementById('startSel')?.value || '';
  const end = document.getElementById('endSel')?.value || '';

  if (step === 1) return selectedBarangay || 'Choose a barangay';
  if (step === 2) return selectedHazard || (selectedBarangay ? 'Choose disaster type' : 'Waiting for barangay');
  if (step === 3) return start || (selectedHazard ? 'Choose start node' : 'Waiting for disaster type');
  if (step === 4) {
    if (isEarthquakeMode()) {
      return earthquakeEvacSitesVisible ? 'Evacuation sites shown' : (start ? 'Show evacuation sites' : 'Waiting for start node');
    }
    return end || (start ? 'Choose end node' : 'Waiting for start node');
  }
  if (step === 5) {
    if (isEarthquakeMode()) {
      return canRunEarthquakeSimulation(start) ? 'Ready to simulate' : 'Continue earthquake routing';
    }
    return selectedHazard && start && end && start !== end ? 'Ready to simulate' : 'Complete selections first';
  }
  return '';
}

function syncWorkflowStatus(activeStep, completed, maxReachableStep) {
  for (let i = 1; i <= 5; i++) {
    const stepEl = document.getElementById('sd' + i);
    if (!stepEl) continue;

    const badge = stepEl.querySelector('.workflow-step-badge');
    const value = document.getElementById('stepValue' + i);

    stepEl.className = 'workflow-step';
    stepEl.classList.toggle('done', !!completed[i] && i !== activeStep);
    stepEl.classList.toggle('active', i === activeStep);
    stepEl.classList.toggle('ready', i <= maxReachableStep && !completed[i] && i !== activeStep);
    stepEl.classList.toggle('locked', i > maxReachableStep);

    if (badge) {
      badge.textContent = completed[i] && i !== activeStep ? '✓' : String(i);
    }

    if (value) {
      value.textContent = getStepValue(i);
    }
  }
}

function syncWorkflowSummaries() {
  const start = document.getElementById('startSel')?.value || '';
  const end = document.getElementById('endSel')?.value || '';
  const canRun = canRunCurrentSimulation(start, end);

  const summaryBarangay = document.getElementById('summaryBarangay');
  const summaryHazard = document.getElementById('summaryHazard');
  const summaryRun = document.getElementById('summaryRun');

  if (summaryBarangay) {
    summaryBarangay.textContent = selectedBarangay
      ? `${selectedBarangay} is selected as the active simulation scope.`
      : 'Select the scope you want to simulate.';
  }

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

  const changeBarangayBtn = document.getElementById('changeBarangayBtn');
  const changeHazardBtn = document.getElementById('changeHazardBtn');
  const changeRouteBtn = document.getElementById('changeRouteBtn');

  if (changeBarangayBtn) {
    changeBarangayBtn.textContent = selectedBarangay ? 'Change' : 'Select';
    changeBarangayBtn.disabled = isSimulationInteractionLocked();
  }

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

  workflowFocusSection = sectionKey;
  advanceStep(getMaxReachableStep());

  const target = getWorkflowCard(sectionKey);
  if (target && typeof target.scrollIntoView === 'function') {
    target.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

function advanceStep(n) {
  const completed = getCompletedSteps();
  const maxReachableStep = getMaxReachableStep();
  const activeStep = Math.max(1, Math.min(n, maxReachableStep));
  const displayStep = workflowFocusSection
    ? ({
        barangay: 1,
        hazard: 2,
        route: completed[3] ? 4 : 3,
        run: 5,
      }[workflowFocusSection] || activeStep)
    : activeStep;

  syncWorkflowStatus(displayStep, completed, maxReachableStep);
  syncWorkflowSummaries();
  syncWorkflowCards(activeStep, completed);
}

async function syncFloodHazardOverlay(barangay = selectedBarangay) {
  const overlayConfig = getFloodOverlayConfig();

  if (!gMap || !barangay || selectedHazard !== 'Flood' || !overlayConfig.vars.length) {
    window.floodHazardUI?.renderHazardLayers({ map: gMap, hazardLayers: null });
    syncFloodFilterControl();
    return {
      visible: false,
      hasLayers: false,
      failed: false,
    };
  }

  try {
    const hazardLayers = await window.floodHazardUI?.loadHazardLayers({
      scope: 'barangay_buffer',
      barangay,
      vars: overlayConfig.vars,
    });
    const visibleVars = overlayConfig.vars;
    const filteredFeatures = Array.isArray(hazardLayers?.features)
      ? hazardLayers.features.filter(feature => visibleVars.includes(Number(feature?.properties?.flood_var)))
      : [];
    const hasLayers = filteredFeatures.length > 0;

    window.floodHazardUI?.renderHazardLayers({
      map: gMap,
      hazardLayers,
      visibleVars,
      highlightVar: overlayConfig.focusVar || null,
    });
    syncFloodFilterControl();
    const legend = document.getElementById('mapLegend');
    if (legend) {
      legend.style.display = 'block';
      setFloodLegendContent({ showHazardLayers: hasLayers, hazardOverlayMode: floodHazardOverlayMode });
      syncLegendVisibility();
    }
    return {
      visible: hasLayers,
      hasLayers,
      failed: false,
    };
  } catch (err) {
    console.warn('Failed to load flood hazard overlay:', err);
    window.floodHazardUI?.renderHazardLayers({ map: gMap, hazardLayers: null });
    syncFloodFilterControl();
    return {
      visible: false,
      hasLayers: false,
      failed: true,
    };
  }
}

function buildFloodOverlayControl() {
  const activeMode = floodHazardOverlayMode;
  const overlayConfig = getFloodOverlayConfig(activeMode);
  const options = [
    ['high', 'High'],
    ['moderate', 'Moderate'],
    ['low', 'Low'],
  ];
  const optionButtons = options.map(([modeKey, label]) => `
    <button
      class="overlay-toggle-btn ${activeMode === modeKey ? 'active' : ''}"
      type="button"
      aria-pressed="${activeMode === modeKey ? 'true' : 'false'}"
      onclick="setFloodHazardOverlayMode('${modeKey}')"
    >
      ${escapeHtml(label)}
    </button>
  `).join('');

  return `
    <div class="results-inline-actions">
      <div class="overlay-toggle-group" role="group" aria-label="Flood map views">
        ${optionButtons}
      </div>
      <div class="results-inline-copy">${escapeHtml(overlayConfig.copy)}</div>
    </div>
  `;
}

async function setFloodHazardOverlayMode(modeKey) {
  if (isEarthquakeSimulationResult(simData) || selectedHazard !== 'Flood') {
    return;
  }

  floodHazardOverlayMode = floodHazardOverlayMode === modeKey ? 'all' : modeKey;

  const overlayState = await syncFloodHazardOverlay(selectedBarangay);
  if (floodHazardOverlayMode !== 'all' && overlayState.failed) {
    floodHazardOverlayMode = 'all';
    alert('Could not load the flood overlay. Restart the backend, then try again.');
  } else if (floodHazardOverlayMode !== 'all' && !overlayState.hasLayers) {
    floodHazardOverlayMode = 'all';
    alert('No flood areas were found for the selected map view.');
  }

  setFloodLegendContent({
    showHazardLayers: overlayState.visible,
    hazardOverlayMode: floodHazardOverlayMode,
  });
  if (simData) showResultsPanel(simData, { preserveActiveTab: true });
  updateMapContextBadge();
}

async function renderActiveSimulationRoutes() {
  if (!simData || !Array.isArray(simData.routes)) return;

  await renderRoutesOnRoads({
    routes: simData.routes,
    gMap,
    mapLayers,
    getLocationByName,
    drawSelectedPinsOnly,
    start: getCurrentStartValue(),
    end: isEarthquakeSimulationResult(simData) ? '' : getCurrentEndValue(),
    infoPopup,
    shortNodeLabel,
    activeInfoWindowRef,
    afterDrawPins: isEarthquakeSimulationResult(simData)
      ? () => {
          window.earthquakeUI?.drawEvacuationSites({
            map: gMap,
            sites: earthquakeEvacSites,
            highlightedSiteId: simData?.active_summary?.selected_evacuation_site?.id || null,
          });
        }
      : null,
  });

  if (isEarthquakeSimulationResult(simData)) {
    const showHazardLayers = shouldShowEarthquakeHazardOverlays(activeEarthquakeView);
    window.earthquakeUI?.renderHazardLayers({
      map: gMap,
      hazardLayers: simData.hazard_layers,
      activeView: activeEarthquakeView,
    });
    window.earthquakeUI?.syncLegend(activeEarthquakeView, {
      showRouteKeys: true,
      showHazardLayers,
    });
    fitEarthquakeMapScope({ includeHazards: true });
  } else {
    const overlayState = await syncFloodHazardOverlay(selectedBarangay);
    setFloodLegendContent({
      showHazardLayers: overlayState.visible,
      hazardOverlayMode: floodHazardOverlayMode,
    });
  }
}

async function showEvacuationSites() {
  if (isSimulationInteractionLocked()) return;
  if (!isEarthquakeMode()) return;
  if (!isEarthquakeBarangaySupported()) {
    alert(`Earthquake routing is currently available only for ${EARTHQUAKE_SUPPORTED_BARANGAY_SCOPE}.`);
    return;
  }

  const start = getCurrentStartValue();
  if (!start) {
    alert('Select a start node first.');
    return;
  }

  const statusTxt = document.getElementById('statusTxt');
  const previousStatus = statusTxt?.textContent || 'Ready';
  const hasActiveEarthquakeResult = isEarthquakeSimulationResult(simData) && simData.start === start;

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
        ? {
            showRouteKeys: true,
            showHazardLayers: shouldShowEarthquakeHazardOverlays(activeEarthquakeView),
          }
        : { showRouteKeys: false, showHazardLayers: false, showHazardSection: false }
    );
    document.getElementById('mapLegend').style.display = 'block';
    syncLegendVisibility();
    if (!hasActiveEarthquakeResult) {
      document.getElementById('infoBox').innerHTML =
        `<strong>${earthquakeEvacSites.length}</strong> evacuation site(s) are now visible. Click <strong>Run Earthquake Simulation</strong> to route to the nearest road-reachable site.`;
    }
    fitEarthquakeMapScope({ includeHazards: hasActiveEarthquakeResult });
  } catch (err) {
    console.error(err);
    alert('Failed to load evacuation sites: ' + err.message);
  } finally {
    if (statusTxt) {
      statusTxt.textContent = previousStatus;
    }
  }

  if (hasActiveEarthquakeResult) {
    syncEarthquakeRouteUi();
    updateMapContextBadge();
    return;
  }

  onNodeChange();
}

async function switchEarthquakeView(viewKey) {
  if (!isEarthquakeSimulationResult(simData)) return;

  const nextView = hydrateActiveEarthquakeView(viewKey);
  if (!nextView) return;

  syncEarthquakeViewSelector();
  await renderActiveSimulationRoutes();
  showResultsPanel(simData, { preserveActiveTab: true });
  selectedRouteFocus = null;
  clearSelectedRouteRow();
  window.clearRouteRowHighlight();
  applyRouteFocusState(null);
  updateMapContextBadge();
}

async function runSimulation() {
  if (isSimulationInteractionLocked()) return;

  const start = document.getElementById('startSel').value;
  const end = document.getElementById('endSel').value;
  workflowFocusSection = null;

  if (isEarthquakeMode()) {
    if (!canRunEarthquakeSimulation(start)) {
      return;
    }
  } else {
    if (!start || !end || start === end) return;
  }

  if (!isBackendLive) {
    alert('Backend is not connected.');
    return;
  }

  const loader = document.getElementById('loader');
  const runBtn = document.getElementById('runBtn');
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
  syncLoaderContext();
  loader.classList.add('show');
  setSimulationInProgress(true);
  resetRouteSafetyPanel();
  runBtn.disabled = true;
  statusTxt.textContent = 'Simulating…';
  document.getElementById('infoBox').innerHTML =
    `Simulation is now <strong>running</strong>. The selected barangay, disaster type, and node inputs are <strong>temporarily locked</strong> until the results are ready.`;
  setLoaderStep(
    'ready',
    8,
    { immediate: true }
  );

  try {
    let result;
    if (isEarthquakeMode()) {
      setLoaderStep('load', 22);
      setLoaderStep('route', 22);
      statusTxt.textContent = 'Simulating…';
      startLoaderProgressPolling();

      result = await sendEarthquakeRequest({
        start,
        barangay: selectedBarangay,
        hazard: selectedHazard,
      });
      stopLoaderProgressPolling();
      setBackendSimulationBusyState(false);
      setLoaderStep('review', 76);

      result.hazard_layers = result.hazard_layers || {};
      Object.entries(result.views || {}).forEach(([viewKey, viewData]) => {
        const routes = decorateRoutesForDisplay(
          normalizeRoutes(viewData.routes || [])
        );
        viewData.routes = routes;
      });

      simData = result;
      hydrateActiveEarthquakeView(result.active_view || 'overall');
      earthquakeEvacSites = Array.isArray(result.evacuation_sites) ? result.evacuation_sites : earthquakeEvacSites;
      earthquakeEvacSitesVisible = earthquakeEvacSites.length > 0;
      showResultsPanel(simData);
      setLoaderStep('draw', 92);
      statusTxt.textContent = 'Opening results…';
      syncEarthquakeViewSelector();
      clearBoundaryLayers();
      await renderActiveSimulationRoutes();
    } else {
      setLoaderStep('load', 22);
      setLoaderStep('route', 22);
      statusTxt.textContent = 'Simulating…';
      startLoaderProgressPolling();

      result = await sendSimulationRequest({
        start,
        end,
        hazard: selectedHazard,
        barangay: selectedBarangay,
      });
      stopLoaderProgressPolling();
      setBackendSimulationBusyState(false);
      result.routes = decorateRoutesForDisplay(
        normalizeRoutes(result.routes || [])
      );

      setLoaderStep('review', 76);
      simData = result;
      showResultsPanel(simData);
      setLoaderStep('draw', 92);
      statusTxt.textContent = 'Opening results…';
      clearBoundaryLayers();
      setFloodLegendContent();
      await renderActiveSimulationRoutes();
    }

    selectedRouteFocus = null;
    clearSelectedRouteRow();
    window.clearRouteRowHighlight();
    applyRouteFocusState(null);
    applySetupSidebarState(true);
    setResultsSidebarActionsVisible(true);
    document.getElementById('infoBox').innerHTML =
      `Simulation complete. Tweak the <strong>hazard</strong> or <strong>start/end</strong> above to try another route, or click <strong>Back to Home</strong> to pick a different barangay.`;
    updateMapContextBadge();

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
    alert(isBackendSimulationBusyError(err) ? err.message : 'Simulation failed: ' + err.message);
  } finally {
    stopLoaderProgressPolling();
    setSimulationInProgress(false);
    if (!loaderHidden) {
      hideLoader(loaderHideDelay);
    }
    syncSimulationConfigLock();
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

function getRouteSafetyNodes() {
  return {
    content: document.getElementById('routeSafetyContent'),
  };
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
  window.setTimeout(() => {
    if (gMap) {
      gMap.invalidateSize();
    }
  }, 240);
}

function resetRouteSafetyPanel() {
  const { content } = getRouteSafetyNodes();
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
window.toggleBestRouteStreets = toggleBestRouteStreets;

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
  const { content } = getRouteSafetyNodes();
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

  const start = result.start || document.getElementById('startSel')?.value || 'Start';
  const end = result.end
    || best?.destination_name
    || document.getElementById('endSel')?.value
    || 'Destination';

  const unsafeParts = Number(best?.display_unsafe_segment_count ?? best?.threshold_exceedance_count ?? 0);
  const peakScore = Number(best?.max_hazard || 0);
  const peakValue = isEarthquake
    ? `${getRiskLevelLabelFromScore(best?.max_hazard)} road risk`
    : `${formatFloodPeakRisk(best)} (${getFloodPeakDepthRange(best)})`;
  // Danger/red once it's actually High; amber/warning for Moderate; neutral for Low.
  const peakClass = peakScore >= 5 ? 'danger' : peakScore >= 3 ? 'warning' : '';
  const verdict = safeRouteFound ? 'Safe route found' : 'No safe route';
  const peakLabel = isEarthquake ? 'Peak road risk crossed' : 'Peak flood level crossed';

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
      <div class="safety-result-card">
        <div class="safety-icon-box">${safetyIcon('walk')}</div>
        <div><div class="safety-card-label">Estimated time to destination</div><div class="safety-card-value">${escapeHtml(best?.display_duration || 'Unavailable')}</div></div>
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
  // The best route is already shown in the main results panel, so this
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

function showResultsPanel(result, options = {}) {
  const { preserveActiveTab = false } = options;
  const resultsPanel = document.getElementById('resultsPanel');
  resultsPanel.classList.remove('fade-in');
  syncResultsVisibility(true);
  void resultsPanel.offsetWidth;
  resultsPanel.classList.add('fade-in');

  const routes = result.routes || [];
  const safe = routes.filter(r => r.category !== 'eliminated');
  const elim = routes.filter(r => r.category === 'eliminated');
  const best = routes.find(r => r.category === 'best');
  const shouldShowFallbackRoutes = safe.length === 0 && elim.length > 0;
  const floodOverlayControl = !isEarthquakeSimulationResult(result)
    ? buildFloodOverlayControl()
    : '';
  const earthquakeSummary = isEarthquakeSimulationResult(result)
    ? result.active_summary || getActiveEarthquakeViewData(result)?.summary || null
    : null;

  syncEarthquakeViewSelector();
  renderRouteSafetyPanel(result);

  document.getElementById('tab-routes').innerHTML = routes.length
    ? shouldShowFallbackRoutes
    ? `${floodOverlayControl}<div class="fallback-warning-inline"><strong>No safe route found.</strong> The routes below still cross unsafe road sections.</div>${buildTable(routes, { switchTabOnFocus: false })}`
    : `${floodOverlayControl}${buildTable(routes)}`
    : `<div class="tab-section-empty">No routes found for this simulation.</div>`;

  if (isEarthquakeSimulationResult(result)) {
    document.getElementById('tab-summary').innerHTML = `
      <div class="results-stats-grid">
        ${statBox('Routes Shown', routes.length, 'var(--ink-strong)')}
        ${statBox('Safe Options', safe.length, 'var(--green)')}
        ${statBox('Not Recommended', elim.length, 'var(--red)')}
        ${statBox('Chosen Shelter', earthquakeSummary?.selected_evacuation_site?.name || 'No route', safe.length ? 'var(--accent)' : 'var(--red)')}
      </div>
      <div class="summary-callout">
        ${buildSummaryCallout(result, safe, best, earthquakeSummary)}
      </div>
      <div class="summary-meta" style="margin-top:10px;">
        <strong>How routes are ordered:</strong> ${escapeHtml(getUserFriendlyRankingExplanation())} &nbsp;|&nbsp; <strong>View:</strong> ${escapeHtml(result.active_view_label || 'Overall')}
      </div>`;
  } else {
    document.getElementById('tab-summary').innerHTML = `
      <div class="results-stats-grid">
        ${statBox('Routes Shown', routes.length, 'var(--ink-strong)')}
        ${statBox('Safe Options', safe.length, 'var(--green)')}
        ${statBox('Not Recommended', elim.length, 'var(--red)')}
        ${statBox('Top Route', best ? best.display_distance : 'No safe route', best ? 'var(--accent)' : 'var(--red)')}
      </div>
      <div class="summary-callout">
        ${buildSummaryCallout(result, safe, best, null)}
      </div>
      <div class="summary-meta" style="margin-top:10px;">
        <strong>How routes are ordered:</strong> ${escapeHtml(getUserFriendlyRankingExplanation())} &nbsp;|&nbsp; <strong>Disaster:</strong> ${escapeHtml(result.hazard_type || selectedHazard || 'Unknown')}
      </div>`;
  }

  document.getElementById('resultsSummaryTxt').textContent = routes.length
    ? isEarthquakeSimulationResult(result)
      ? `${result.active_view_label || 'Overall'} · ${routes.length} routes listed`
      : shouldShowFallbackRoutes
      ? `${routes.length} routes listed · safest routes first`
      : `${routes.length} routes listed`
    : 'No route results to display';

  const nextTab = preserveActiveTab
    ? activeResultsTab
    : routes.length
    ? 'routes'
    : 'summary';

  setActiveTab(nextTab);

  // The safety verdict is immediately visible in the right panel; do not block it
  // behind the former fallback warning dialog.
  hideFallbackWarningModal();
}

function getDefaultRouteVisual(group) {
  if (group?.category === 'best') {
    return {
      mainWeight: 5,
      mainOpacity: 1,
      outlineWeight: 5 + ROUTE_OUTLINE_EXTRA_WEIGHT,
      outlineOpacity: 1,
      glowOpacities: [0.06, 0.10],
      zIndex: 8,
    };
  }

  if (group?.category === 'available') {
    return {
      mainWeight: 4,
      mainOpacity: 1,
      outlineWeight: 4 + ROUTE_OUTLINE_EXTRA_WEIGHT,
      outlineOpacity: 1,
      glowOpacities: [0.04],
      zIndex: 5,
    };
  }

  // Eliminated routes: dimmed for flood, kept bold for earthquake since they
  // mark streets to avoid on the way to a shelter.
  const isEarthquake = isEarthquakeSimulationResult();
  return isEarthquake
    ? {
        mainWeight: 4,
        mainOpacity: 0.9,
        outlineWeight: 4 + ROUTE_OUTLINE_EXTRA_WEIGHT,
        outlineOpacity: 0.95,
        glowOpacities: [0.04],
        zIndex: 4,
      }
    : {
        mainWeight: 3,
        mainOpacity: 0.8,
        outlineWeight: 3 + ROUTE_OUTLINE_EXTRA_WEIGHT,
        outlineOpacity: 0.9,
        glowOpacities: [],
        zIndex: 4,
      };
}

// The focused route keeps its normal bold/solid look (it must stay the
// clearest thing on the map) -- the flowing dash overlay added by
// createRoutePreview below is what signals "this one is selected", not a
// dimmed-out base line replaced by sparse dots.
function getFocusedRouteVisual(group) {
  const base = getDefaultRouteVisual(group);
  return {
    ...base,
    mainOpacity: 1,
    outlineOpacity: 1,
    glowOpacities: base.glowOpacities.map(opacity => Math.min(1, opacity * 2)),
    zIndex: 12,
  };
}

function getDimmedRouteVisual(group) {
  const base = getDefaultRouteVisual(group);
  return {
    ...base,
    mainWeight: Math.max(2, base.mainWeight - 1),
    mainOpacity: group?.category === 'eliminated' ? 0.08 : 0.12,
    outlineOpacity: 0,
    glowOpacities: base.glowOpacities.map(() => 0),
    zIndex: 2,
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
  // getFocusedRouteVisual -- so this is just a white dash marching on top of
  // it toward the destination. Animated by style.css (route-flow--focus), not
  // a JS timer, so it moves smoothly. Dash + gap = the 24px CSS loop.
  group.previewDotsLayer = L.polyline(path, {
    color: '#ffffff',
    weight: 4 * getRouteZoomScale(gMap),
    opacity: 0.95,
    dashArray: '13 11',
    lineCap: 'round',
    interactive: false,
    className: 'route-line route-flow route-flow--focus',
  }).addTo(gMap);

  group.previewDotsLayer.bringToFront();
}

function syncRoutePreview(group, enabled) {
  if (!group) return;

  if (!enabled) {
    clearRoutePreview(group);
    return;
  }

  createRoutePreview(group);
}

function hasVisibleSafeRouteResults() {
  const groups = Array.isArray(mapLayers.routeGroups) ? mapLayers.routeGroups : [];
  return groups.some(group => group.category !== 'eliminated');
}

function isRouteCategoryVisibleOnMap(category, tabName = activeResultsTab) {
  return true;
}

function hideRouteGroup(group) {
  if (!group) return;

  if (group.casingLayer) {
    group.casingLayer.setStyle({ opacity: 0 });
  }

  if (group.outlineLayer) {
    group.outlineLayer.setStyle({ opacity: 0 });
  }

  if (group.mainLayer) {
    group.mainLayer.setStyle({ opacity: 0 });
  }

  (group.glowLayers || []).forEach(layer => layer.setStyle({ opacity: 0 }));
  clearRoutePreview(group);
}

// Leaflet paths have no zIndex option; bringRouteGroupToFront() (called only
// for the focused route, below) handles the dynamic re-stacking that Google's
// per-layer zIndex used to do here.
function applyRouteGroupVisual(group, visual) {
  if (!group) return;

  const zoomScale = getRouteZoomScale(gMap);
  const outlineWeight = visual.outlineWeight * zoomScale;

  if (group.casingLayer) {
    group.casingLayer.setStyle({
      opacity: visual.outlineOpacity * ROUTE_CASING_OPACITY,
      weight: outlineWeight + ROUTE_CASING_EXTRA_WEIGHT,
    });
  }

  if (group.outlineLayer) {
    group.outlineLayer.setStyle({
      opacity: visual.outlineOpacity,
      weight: outlineWeight,
    });
  }

  if (group.mainLayer) {
    group.mainLayer.setStyle({
      opacity: visual.mainOpacity,
      weight: visual.mainWeight * zoomScale,
    });
  }

  (group.glowLayers || []).forEach((layer, index) => {
    const glowOpacity = visual.glowOpacities[index] ?? 0;
    layer.setStyle({ opacity: glowOpacity });
  });
}

function bringRouteGroupToFront(group) {
  if (!group) return;
  (group.glowLayers || []).forEach(layer => layer.bringToFront());
  if (group.casingLayer) group.casingLayer.bringToFront();
  if (group.outlineLayer) group.outlineLayer.bringToFront();
  if (group.mainLayer) group.mainLayer.bringToFront();
}

function applyRouteFocusState(routeNo) {
  const groups = Array.isArray(mapLayers.routeGroups) ? mapLayers.routeGroups : [];
  const hasFocus = routeNo != null;

  groups.forEach(group => {
    if (!isRouteCategoryVisibleOnMap(group.category)) {
      hideRouteGroup(group);
      return;
    }

    const isFocused = hasFocus && group.routeNo === routeNo;
    const visual = !hasFocus
      ? getDefaultRouteVisual(group)
      : isFocused
      ? getFocusedRouteVisual(group)
        : getDimmedRouteVisual(group);

      applyRouteGroupVisual(group, visual);
      if (isFocused) {
        bringRouteGroupToFront(group);
      }
      syncRoutePreview(group, isFocused);
    });
}

function syncVisibleRoutesForActiveTab() {
  const isFocusedRouteVisible = !!(
    selectedRouteFocus
    && isRouteCategoryVisibleOnMap(selectedRouteFocus.category)
  );

  if (!isFocusedRouteVisible && selectedRouteFocus) {
    selectedRouteFocus = null;
    clearSelectedRouteRow();
    if (typeof window.clearRouteRowHighlight === 'function') {
      window.clearRouteRowHighlight();
    }
  }

  applyRouteFocusState(isFocusedRouteVisible ? selectedRouteFocus.routeNo : null);
}

function clearSelectedRouteRow() {
  document.querySelectorAll('.route-row.route-row-selected').forEach(row => {
    row.classList.remove('route-row-selected');
  });
}

function setSelectedRouteRow(routeNo, category, switchTab = false) {
  clearSelectedRouteRow();

  if (routeNo == null) return;

  if (switchTab) {
    setActiveTab('routes');
  }

  const row = document.querySelector(`.route-row[data-route-no="${routeNo}"]`);
  if (!row) return;

  row.classList.add('route-row-selected');
  row.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

function handleRouteRowKey(event, routeNo, category, switchTab = true) {
  if (event.key !== 'Enter' && event.key !== ' ') {
    return;
  }

  event.preventDefault();
  window.toggleRouteFocus(routeNo, category, switchTab);
}

function statBox(label, value, color) {
  return `<div class="results-stat-box">
    <div class="results-stat-value" style="color:${color};">${escapeHtml(value)}</div>
    <div class="results-stat-label">${escapeHtml(label)}</div>
  </div>`;
}

function buildTable(routes, options = {}) {
  const { switchTabOnFocus = true } = options;

  if (!routes.length) {
    return `<div style="font-family:'DM Mono',monospace;font-size:.81rem;color:var(--muted);padding:10px;">No routes in this category.</div>`;
  }

  const rows = routes.map((r, i) => {
    const pips = [1, 2, 3, 4, 5]
      .map(p => `<div class="hlevel-pip ${p <= r.max_hazard ? 'on-' + p : ''}"></div>`)
      .join('');
    const riskHeadline = getRouteRiskHeadline(r);
    const riskSubtext = getRouteRiskSubtext(r);

    const rowTitle = `${r.display_route_summary}. ${r.display_reason}`;
    const evidenceChips = buildRouteEvidenceChips(r)
      .map(chip => `<span class="evidence-chip">${escapeHtml(chip.label)}: ${escapeHtml(chip.value)}</span>`)
      .join('');

    return `<tr class="route-row" tabindex="0" role="button" aria-label="${escapeHtml(rowTitle)}" data-route-no="${r.display_route_no ?? i + 1}" data-route-category="${r.category || ''}" onclick="toggleRouteFocus(${r.display_route_no ?? i + 1}, '${r.category || ''}', ${switchTabOnFocus ? 'true' : 'false'})" onkeydown="handleRouteRowKey(event, ${r.display_route_no ?? i + 1}, '${r.category || ''}', ${switchTabOnFocus ? 'true' : 'false'})">
      <td>${escapeHtml(r.display_route_no ?? i + 1)}</td>
      <td>
        <div class="table-status-stack">
          <span class="badge badge-${r.category}">${escapeHtml(getRouteStatusLabel(r))}</span>
        </div>
      </td>
      <td>
        <div class="metric-strong">${escapeHtml(r.display_distance)}</div>
        <div class="metric-sub">${escapeHtml(r.display_duration || '')} walking</div>
      </td>
      <td>
        <div class="hlevel">${pips}</div>
        <div class="metric-strong">${escapeHtml(riskHeadline)}</div>
        <div class="metric-sub">${escapeHtml(riskSubtext)}</div>
      </td>
      <td>
        <div class="path-txt route-summary" title="${escapeHtml(r.display_route_summary)}">${escapeHtml(r.display_route_summary)}</div>
        <div class="route-reason-text">${escapeHtml(r.display_reason)}</div>
        <div class="route-evidence-row">
          ${evidenceChips}
        </div>
        <div class="path-txt path-street" title="${escapeHtml(r.display_street_preview)}">${escapeHtml(r.display_street_preview)}</div>
      </td>
    </tr>`;
  }).join('');

  return `<div class="results-table-wrap"><table class="data-table">
    <thead><tr><th>#</th><th>Recommendation</th><th>Distance &amp; Time</th><th>Risk &amp; Exposure</th><th>Route details</th></tr></thead>
    <tbody>${rows}</tbody>
  </table></div>`;
}

function switchTab(name, el) {
  setActiveTab(name);
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

  const lats = points.map(p => p.lat);
  const lngs = points.map(p => p.lng);
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

  // White casing under the route line keeps it visible over both light
  // streets and darker map features, not just the flat fallback background.
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
  ctx.lineWidth = 9;
  tracePath();
  ctx.stroke();

  ctx.strokeStyle = route?.color || '#22c55e';
  ctx.lineWidth = 5;
  tracePath();
  ctx.stroke();

  const [sx, sy] = project(points[0]);
  const [ex, ey] = project(points[points.length - 1]);
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

    const best = routes.find(r => r.category === 'best') || routes[0];
    const safe = routes.filter(r => r.category !== 'eliminated');
    const eliminated = routes.filter(r => r.category === 'eliminated');
    const safeRouteFound = safe.length > 0;
    const { barangay, hazard, start, end } = getCurrentSelections();

    // Earthquake mode has no "end node" dropdown -- the destination is
    // whichever evacuation site the ACO run picked, so label it with that
    // instead of an empty string.
    const isEq = isEarthquakeSimulationResult(simData);
    const eqSummary = isEq ? (simData.active_summary || getActiveEarthquakeViewData(simData)?.summary || null) : null;
    const endLabel = isEq ? (eqSummary?.selected_evacuation_site?.name || 'Evacuation site') : end;

    const peakLabel = isEq ? 'Peak road risk crossed' : 'Peak flood level crossed';
    const peakValue = isEq
      ? `${getRiskLevelLabelFromScore(best?.max_hazard)} road risk`
      : `${formatFloodPeakRisk(best)} (${getFloodPeakDepthRange(best)})`;

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
      ['Start', start || 'Unknown'],
      ['Destination', endLabel || 'Unknown'],
      ['Overall verdict', safeRouteFound ? 'Safe route found' : 'No safe route'],
      ['Best route distance', best?.display_distance || 'Unavailable'],
      ['Estimated time to destination', best?.display_duration || 'Unavailable'],
      [peakLabel, peakValue],
      ['Routes checked', `${routes.length} (${safe.length} safe, ${eliminated.length} not recommended)`],
    ];

    doc.setFontSize(10.5);
    rows.forEach(([label, value]) => {
      doc.setFont('helvetica', 'bold');
      doc.text(String(label), margin, y);
      doc.setFont('helvetica', 'normal');
      doc.text(String(value), margin + labelColWidth, y);
      y += 17;
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
  try {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), 2000);
    const r = await fetch(window.BACKEND_BASE + '/health', { signal: c.signal });
    clearTimeout(t);

    if (r.ok) {
      isBackendLive = true;
      document.getElementById('statusTxt').textContent = 'Backend Connected';
      await refreshBackendSimulationStatus();
    }
  } catch (err) {
    isBackendLive = false;
    setBackendSimulationBusyState(false);
  }
}

function setActiveTab(tabName) {
  activeResultsTab = tabName;

  document.querySelectorAll('.rtab').forEach(t => {
    t.classList.remove('active');
    t.setAttribute('aria-selected', 'false');
  });
  document.querySelectorAll('.rtab-content').forEach(c => c.classList.remove('active'));

  const tabMap = {
    routes: document.querySelector('.rtab[onclick*="routes"]'),
    summary: document.querySelector('.rtab[onclick*="summary"]'),
  };

  const tab = tabMap[tabName];
  if (tab) {
    tab.classList.add('active');
    tab.setAttribute('aria-selected', 'true');
  }

  const content = document.getElementById('tab-' + tabName);
  if (content) content.classList.add('active');

  syncVisibleRoutesForActiveTab();
}

window.clearRouteRowHighlight = function clearRouteRowHighlight() {
  document.querySelectorAll('.route-row.route-row-active').forEach(row => row.classList.remove('route-row-active'));
};

window.highlightRouteRow = function highlightRouteRow(routeNo, category, switchTab = false) {
  if (routeNo == null) return;

  if (resultsCollapsed) {
    showResultsPanelDrawer();
  }

  if (switchTab) {
    setActiveTab('routes');
  }

  window.clearRouteRowHighlight();

  const row = document.querySelector(`.route-row[data-route-no="${routeNo}"]`);
  if (!row) return;

  row.classList.add('route-row-active');
  row.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
};

window.clearSelectedRouteRow = clearSelectedRouteRow;
window.focusWorkflowSection = focusWorkflowSection;
window.syncLegendVisibility = syncLegendVisibility;
window.acknowledgeFallbackWarning = acknowledgeFallbackWarning;

window.toggleRouteFocus = function toggleRouteFocus(routeNo, category, switchTab = false) {
  const shouldClear = selectedRouteFocus && selectedRouteFocus.routeNo === routeNo;

  if (shouldClear) {
    selectedRouteFocus = null;
    clearSelectedRouteRow();
    applyRouteFocusState(null);
    window.clearRouteRowHighlight();
    return;
  }

  selectedRouteFocus = { routeNo, category };
  setSelectedRouteRow(routeNo, category, switchTab);
  applyRouteFocusState(routeNo);
  window.highlightRouteRow(routeNo, category, switchTab);
};

window.focusRouteSelection = function focusRouteSelection(routeNo, category, switchTab = false) {
  if (routeNo == null) return;
  selectedRouteFocus = { routeNo, category };
  setSelectedRouteRow(routeNo, category, switchTab);
  applyRouteFocusState(routeNo);
};

window.clearRouteAnimation = clearRouteAnimation;
window.startResultsResize = startResultsResize;
window.initMap = initMap;
window.handleRouteRowKey = handleRouteRowKey;
window.formatRoutePeakRiskLabel = formatRoutePeakRiskLabel;
window.formatEarthquakeHazardSummary = formatEarthquakeHazardSummary;
window.setFloodHazardOverlayMode = setFloodHazardOverlayMode;
window.showEvacuationSites = showEvacuationSites;
window.switchEarthquakeView = switchEarthquakeView;
window.toggleSetupSidebar = toggleSetupSidebar;
window.openRouteListModal = openRouteListModal;
window.closeRouteListModal = closeRouteListModal;
window.focusRouteFromModal = focusRouteFromModal;
window.openEmergencyContactModal = openEmergencyContactModal;
window.closeEmergencyContactModal = closeEmergencyContactModal;
window.openTutorial = openTutorial;
window.closeTutorial = closeTutorial;
window.goToTutorialStep = goToTutorialStep;
window.tutorialNext = tutorialNext;
window.tutorialPrev = tutorialPrev;
window.handleNavHowToUse = handleNavHowToUse;

// Clicking the dimmed backdrop closes the route list.
document.getElementById('routeListModal')?.addEventListener('mousedown', event => {
  if (event.target === event.currentTarget) closeRouteListModal();
});

syncLoaderContext();
initLoaderGraphPulses();
setFloodLegendContent();
initLocationCombo('startSel');
initLocationCombo('endSel');
syncEarthquakeRouteUi();
syncEarthquakeViewSelector();
restoreSetupSidebarState();
syncFloodFilterControl();
advanceStep(1);
