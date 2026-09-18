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
let simulationConfigLocked = false;
let simulationInProgress = false;
let backendSimulationBusy = false;
let backendSimulationStatus = null;
let backendBusyPollTimer = null;
// A selected mode is a visual highlight, not a layer-reveal switch - all levels stay visible.
let floodHazardOverlayMode = 'all';
const activeInfoWindowRef = { current: null };
const loaderState = {
  current: 0,
  target: 0,
  frameId: null,
  stage: '',
};
const LOADER_PATIENCE_DELAY_MS = 8000;
let loaderPatienceTimer = null;
let loaderPatienceDismissed = false;
const LOADER_PROGRESS_POLL_MS = 900;
const LOADER_ROUTE_STAGE_RANGE = [22, 76];
let loaderProgressPollTimer = null;
const THEME_STORAGE_KEY = 'disaster-route-sim-theme';
const TUTORIAL_STORAGE_KEY = 'agnas.tutorialSeen';
let tutorialReturnFocusEl = null;
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

function getMapThemeStyles() {
  // Keep the Google map UI and base map on the default light style in all site themes.
  return null;
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

function syncBarangayBoundaryTheme() {
  const strokeColor = getBarangayBoundaryStrokeColor();
  const haloColor = getBarangayBoundaryHaloColor();
  (mapLayers.boundaries || []).forEach(layer => {
    const isHalo = layer?.boundaryRole === 'halo';
    layer.setOptions({
      strokeColor: isHalo ? haloColor : strokeColor,
      strokeOpacity: isHalo ? 0.92 : 1,
      strokeWeight: isHalo ? 10 : 5,
      zIndex: isHalo ? 2 : 3,
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

  gMap.setOptions({
    styles: getMapThemeStyles(),
    backgroundColor: '#ffffff',
  });
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
    icon.textContent = isDark ? '\u2600' : '\u263E';
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

function hasSeenTutorial() {
  try {
    return localStorage.getItem(TUTORIAL_STORAGE_KEY) === '1';
  } catch (err) {
    return false;
  }
}

// Auto-trigger for first-time visitors only; returning users re-open it via
// the topbar "Show tutorial" button, which calls showTutorial() directly.
function maybeShowTutorial() {
  if (hasSeenTutorial()) return;
  showTutorial();
}

function showTutorial(event) {
  const overlay = document.getElementById('tutorialOverlay');
  if (!overlay) return;

  tutorialReturnFocusEl = event?.currentTarget instanceof HTMLElement
    ? event.currentTarget
    : document.activeElement;

  overlay.hidden = false;
  document.body.classList.add('tutorial-open');
  document.getElementById('tutorialCardRow')?.scrollTo({ left: 0 });
  window.requestAnimationFrame(() => {
    overlay.querySelector('.tutorial-skip-btn')?.focus({ preventScroll: true });
  });
}

function skipTutorial() {
  const overlay = document.getElementById('tutorialOverlay');
  if (!overlay || overlay.hidden) return;

  overlay.hidden = true;
  document.body.classList.remove('tutorial-open');

  try {
    localStorage.setItem(TUTORIAL_STORAGE_KEY, '1');
  } catch (err) {
    // Ignore storage failures; the tutorial will simply auto-show again next visit.
  }

  const focusTarget = tutorialReturnFocusEl || document.getElementById('tutorialTriggerBtn');
  tutorialReturnFocusEl = null;
  focusTarget?.focus?.({ preventScroll: true });
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
  const inlineToggle = document.getElementById('setupSidebarToggle');
  const mapToggle = document.getElementById('mapSidebarToggle');
  if (!shell) return;

  shell.classList.toggle('sidebar-collapsed', shouldCollapse);

  if (inlineToggle) {
    inlineToggle.setAttribute('aria-expanded', String(!shouldCollapse));
    inlineToggle.setAttribute('aria-label', 'Hide simulation setup');
    const tipLabel = inlineToggle.querySelector('[data-sidebar-tip-label]');
    if (tipLabel) tipLabel.textContent = 'Hide sidebar';
  }

  if (mapToggle) {
    mapToggle.hidden = !shouldCollapse;
    mapToggle.setAttribute('aria-expanded', String(!shouldCollapse));
    mapToggle.setAttribute('aria-label', 'Show simulation setup');
    const tipLabel = mapToggle.querySelector('[data-sidebar-tip-label]');
    if (tipLabel) tipLabel.textContent = 'Show sidebar';
  }

  window.setTimeout(() => {
    if (gMap && window.google?.maps?.event) {
      window.google.maps.event.trigger(gMap, 'resize');
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

  const focusTarget = shouldCollapse
    ? document.getElementById('mapSidebarToggle')
    : document.getElementById('setupSidebarToggle');
  if (focusTarget && !focusTarget.hidden) focusTarget.focus({ preventScroll: true });
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

  if (key === 'Escape' && document.getElementById('tutorialOverlay')?.hidden === false) {
    event.preventDefault();
    skipTutorial();
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

function isSimulationInteractionLocked() {
  return simulationConfigLocked || simulationInProgress;
}

function syncSimulationConfigLock() {
  const interactionLocked = isSimulationInteractionLocked();
  const configLocked = simulationConfigLocked;

  document.querySelectorAll('.bgy-card[data-barangay], .hazard-card').forEach(card => {
    card.classList.toggle('interaction-locked', interactionLocked);
  });

  ['startSel', 'endSel', 'showEvacBtn', 'runBtn', 'changeBarangayBtn', 'changeHazardBtn', 'changeRouteBtn', 'resetRouteBtn']
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

      if (configLocked) {
        el.disabled = true;
        return;
      }

      if (id === 'runBtn') {
        el.disabled = backendSimulationBusy || !canRunCurrentSimulation();
      }
    });

  ['changeRunBtn', 'resetBtn', 'resultsNewSimulationBtn'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.disabled = simulationInProgress || (id === 'resetBtn' && !configLocked);
  });
}

function setSimulationConfigLocked(locked) {
  simulationConfigLocked = !!locked;
  advanceStep(getMaxReachableStep());
  syncSimulationConfigLock();
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

function updateLoaderStepDetail(detail = '') {
  const stepsContainer = document.getElementById('loaderSteps');
  if (!stepsContainer) return;

  const message = String(detail || '').trim();
  stepsContainer.textContent = message;
  stepsContainer.hidden = !message;
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
  const hazardKey = String(selectedHazard || '').trim().toLowerCase();

  switch (stageId) {
    case 'ready':
      return {
        title: 'Checking your choices',
        detail: 'Making sure your selected area and route setup are complete.',
      };
    case 'load':
      return {
        title: 'Loading road and area details',
        detail: hazardKey === 'earthquake'
          ? 'Getting the road, site, and earthquake details needed for your request.'
          : 'Getting the road and flood details needed for your request.',
      };
    case 'route':
      return {
        title: 'Looking for route options',
        detail: hazardKey === 'earthquake'
          ? 'Checking possible road paths from your start point to reachable evacuation sites.'
          : 'Checking possible road paths between your selected points.',
      };
    case 'review':
      return {
        title: 'Preparing the results',
        detail: 'Organizing the safest route options and summary details.',
      };
    case 'draw':
      return {
        title: 'Showing the results',
        detail: 'Opening the result panel and drawing the route on the map.',
      };
    case 'complete':
      return {
        title: 'Results are ready',
        detail: 'You can now review the map and route details.',
      };
    case 'stopped':
      return {
        title: "We couldn't finish this request",
        detail: 'Something went wrong while finding your route. Please try again in a moment.',
      };
    default:
      return null;
  }
}

function getPatienceNotificationCopy(stageId = loaderState.stage) {
  switch (stageId) {
    case 'load':
      return {
        title: 'Still loading the route details',
        text: 'The system is still getting the road and area data needed for this request.',
      };
    case 'route':
      return {
        title: 'Still checking route options',
        text: 'The system is still comparing possible road paths and safety data. This step usually takes the longest.',
      };
    case 'review':
    case 'draw':
      return {
        title: 'Still putting your results together',
        text: "We've already found your routes and are finishing the summary and map now.",
      };
    default:
      return {
        title: 'Still working on your request',
        text: 'The system is still working on this route request. Larger or more complex areas can take longer.',
      };
  }
}

function updatePatienceNotification(stageId = loaderState.stage) {
  const patienceTitle = document.getElementById('patienceTitle');
  const patienceText = document.getElementById('patienceText');
  const copy = getPatienceNotificationCopy(stageId);

  if (patienceTitle) {
    patienceTitle.textContent = copy.title;
  }

  if (patienceText) {
    patienceText.textContent = copy.text;
  }
}

function showPatienceNotification(stageId = loaderState.stage) {
  const patienceNotice = document.getElementById('patienceNotice');
  if (!patienceNotice || loaderPatienceDismissed) return;

  updatePatienceNotification(stageId);
  patienceNotice.hidden = false;
}

function dismissPatienceNotification() {
  loaderPatienceDismissed = true;
  const patienceNotice = document.getElementById('patienceNotice');
  if (patienceNotice) {
    patienceNotice.hidden = true;
  }
}

function resetPatienceNotification() {
  if (loaderPatienceTimer) {
    window.clearTimeout(loaderPatienceTimer);
    loaderPatienceTimer = null;
  }

  loaderPatienceDismissed = false;
  const patienceNotice = document.getElementById('patienceNotice');
  if (patienceNotice) {
    patienceNotice.hidden = true;
  }
}

function schedulePatienceNotification() {
  resetPatienceNotification();
  loaderPatienceTimer = window.setTimeout(() => {
    loaderPatienceTimer = null;
    showPatienceNotification(loaderState.stage);
  }, LOADER_PATIENCE_DELAY_MS);
}

function setLoaderStep(stageIdOrTitle, progress, options = {}) {
  const { stageId = '', title: overrideTitle = '', detail: overrideDetail = '' } = options;
  const resolvedStageId = stageId || stageIdOrTitle;
  const stageCopy = getLoaderStageCopy(resolvedStageId);
  const title = overrideTitle || stageCopy?.title || stageIdOrTitle;
  const detail = overrideDetail || stageCopy?.detail || '';

  loaderState.stage = stageCopy ? resolvedStageId : '';
  setLoaderTitle(title);
  updateLoaderProgress(progress, options);
  updateLoaderStepDetail(detail);

  const patienceNotice = document.getElementById('patienceNotice');
  if (patienceNotice && !patienceNotice.hidden) {
    updatePatienceNotification(loaderState.stage);
  }
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
  hideLoaderSteps();
  resetPatienceNotification();
}

function hideLoaderSteps() {
  const stepsContainer = document.getElementById('loaderSteps');
  if (stepsContainer) {
    stepsContainer.hidden = true;
    stepsContainer.textContent = '';
  }
}

function initMap() {
  gMap = new google.maps.Map(document.getElementById('map'), {
    center: { lat: 14.5590, lng: 121.0955 },
    zoom: 15,
    tilt: 0,
    heading: 0,
    mapTypeId: google.maps.MapTypeId.ROADMAP,
    styles: getMapThemeStyles(),
    backgroundColor: '#ffffff',
    mapTypeControl: true,
    mapTypeControlOptions: {
      style: google.maps.MapTypeControlStyle.DROPDOWN_MENU,
      position: google.maps.ControlPosition.TOP_RIGHT,
    },
    streetViewControl: false,
    fullscreenControl: true,
    zoomControl: true,
    tiltControl: false,
    rotationControl: false,
    // Default "auto" gesture handling falls back to two-finger panning once the
    // page itself becomes scrollable (the phone/tablet layout), which reads as
    // "the map doesn't respond to touch." Greedy keeps one-finger drag/pinch
    // working on the map on every device; page scrolling still works from any
    // area outside the map surface.
    gestureHandling: 'greedy',
  });

  let mapResizeDebounceTimer = null;
  window.addEventListener('resize', () => {
    syncMapOverlayLayout();
    const resultsPanel = document.getElementById('resultsPanel');
    if (resultsPanel?.classList.contains('show')) {
      applyResultsPanelHeight(resultsPanel.getBoundingClientRect().height || 320);
    }

    // Google Maps caches its canvas size at creation time and after layout
    // changes, so rotating the phone or toggling the browser's mobile address
    // bar (both fire 'resize') needs an explicit nudge or the map keeps the
    // old dimensions and shows blank/cropped tiles.
    clearTimeout(mapResizeDebounceTimer);
    mapResizeDebounceTimer = window.setTimeout(() => {
      if (gMap && window.google?.maps?.event) {
        window.google.maps.event.trigger(gMap, 'resize');
      }
    }, 150);
  });
  startApp();
}

async function startApp() {
  await checkBackend();

  if (!isBackendLive) {
    document.getElementById('statusTxt').textContent = 'Backend Offline';
    alert('Backend is not connected. Run the Flask backend first.');
    return;
  }

  await loadLocationsFromBackend();
}

function clearRoutePreview(group) {
  if (!group) return;

  if (group.previewTimer) {
    window.clearInterval(group.previewTimer);
    group.previewTimer = null;
  }

  if (group.previewDotsHaloLayer) {
    group.previewDotsHaloLayer.setMap(null);
    group.previewDotsHaloLayer = null;
  }

  if (group.previewDotsLayer) {
    group.previewDotsLayer.setMap(null);
    group.previewDotsLayer = null;
  }

  if (group.previewArrowHaloLayer) {
    group.previewArrowHaloLayer.setMap(null);
    group.previewArrowHaloLayer = null;
  }

  if (group.previewArrowLayer) {
    group.previewArrowLayer.setMap(null);
    group.previewArrowLayer = null;
  }
}

function clearRouteAnimation() {
  const groups = Array.isArray(mapLayers.routeGroups) ? mapLayers.routeGroups : [];
  groups.forEach(clearRoutePreview);
}

function clearBoundaryLayers() {
  (mapLayers.boundaries || []).forEach(layer => layer.setMap(null));
  mapLayers.boundaries = [];
}

function clearLayers() {
  clearRouteAnimation();
  clearBoundaryLayers();
  [...mapLayers.edges, ...mapLayers.nodes, ...mapLayers.routes].forEach(o => o.setMap(null));
  mapLayers = { boundaries: [], edges: [], nodes: [], routes: [], routeGroups: [] };
  selectedRouteFocus = null;

  if (activeInfoWindow) {
    activeInfoWindow.close();
    activeInfoWindow = null;
  }

  if (activeInfoWindowRef.current) {
    activeInfoWindowRef.current.close();
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
  mapLayers.routes.forEach(layer => layer.setMap(null));
  mapLayers.routes = [];
  mapLayers.routeGroups = [];
  selectedRouteFocus = null;

  if (activeInfoWindowRef.current) {
    activeInfoWindowRef.current.close();
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

function setBarangayCardStates() {
  document.querySelectorAll('.bgy-card[data-barangay]').forEach(card => {
    const barangay = card.dataset.barangay || '';
    const hasLocations = getBarangayLocations(barangay).length > 0;

    card.classList.toggle('disabled', !hasLocations);
    card.title = hasLocations ? '' : 'No locations available for this barangay in the current database';
  });
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
    setBarangayCardStates();

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

function formatHazardScoreText(hazardValue, fallback = 'Unknown') {
  const numericHazard = Number(hazardValue);
  if (!Number.isFinite(numericHazard)) {
    return fallback;
  }

  return `${numericHazard}/5`;
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

function formatFloodPeakRiskWithHazard(route) {
  return `${formatFloodPeakRisk(route)} (${formatHazardScoreText(route?.max_hazard)})`;
}

function formatRouteScore(value, digits = 2, fallback = 'N/A') {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return fallback;
  }

  return numericValue.toFixed(digits);
}

function buildFloodExposureDisplay(route) {
  if (isEarthquakeRouteRecord(route)) {
    return null;
  }

  const score = formatRouteScore(route?.risk_distance, 2);
  if (score === 'N/A') {
    return {
      meaning: 'Unavailable',
      score: 'N/A',
    };
  }

  return {
    meaning: 'Smaller scores mean less total flood exposure along the route.',
    score,
  };
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
    return `Highest score: ${formatHazardScoreText(route?.max_hazard)} · Unsafe road parts: ${unsafeRoadParts}`;
  }

  const parts = [
    `Peak score: ${formatHazardScoreText(route?.max_hazard)}`,
  ];

  if (route?.display_flood_exposure_score) {
    parts.push(`Flood exposure score: ${route.display_flood_exposure_score}`);
  }

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
        ? `Best fallback route${destinationNote}, but ${formatRoadPartCountLabel(unsafeSections)} ${unsafeSections === 1 ? 'is' : 'are'} above the safety limit.`
        : `Best fallback route${destinationNote}, but some road parts are above the safety limit.`;
    }

    if (route?.status === 'Available') {
      return unsafeSections > 0
        ? `Available fallback route${destinationNote}, but ${formatRoadPartCountLabel(unsafeSections)} ${unsafeSections === 1 ? 'is' : 'are'} above the safety limit.`
        : `Available fallback route${destinationNote}, but some road parts are above the safety limit.`;
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
      { label: 'Highest risk score', value: formatHazardScoreText(route?.max_hazard) },
    ].filter(Boolean);
  }

  return [
    { label: 'Flood levels crossed', value: route?.display_flood_classes || 'None' },
    { label: 'Highest flood level', value: formatFloodPeakRiskWithHazard(route) },
    { label: 'Flood exposure score', value: route?.display_flood_exposure_score || 'N/A' },
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
    return earthquakeSummary?.selected_evacuation_site
      ? `<div class="summary-callout-title">Quick Summary</div><div class="summary-callout-copy">The recommended route goes to <strong>${escapeHtml(selectedSite)}</strong> and is about <strong>${escapeHtml(distanceText)}</strong> long.</div><div class="summary-callout-copy">This result uses the <strong>${escapeHtml(viewLabel)}</strong> earthquake view and shows the safest option first.</div>`
      : `<div class="summary-callout-title">Quick Summary</div><div class="summary-callout-copy">The recommended route is about <strong>${escapeHtml(distanceText)}</strong> long.</div><div class="summary-callout-copy">This result uses the <strong>${escapeHtml(viewLabel)}</strong> earthquake view and shows the safest option first.</div>`;
  }

  if (!safeRoutes.length) {
    return '<div class="summary-callout-title">Quick Summary</div><div class="summary-callout-copy">No fully safe flood route was found. All shown options still pass through road sections above the safety limit.</div>';
  }

  const highestFloodLevel = bestRoute ? formatFloodPeakRiskWithHazard(bestRoute) : 'N/A';
  const distanceText = bestRoute?.display_distance || 'N/A';

  return bestRoute
    ? `<div class="summary-callout-title">Quick Summary</div><div class="summary-callout-copy">The recommended route is about <strong>${escapeHtml(distanceText)}</strong> long.</div><div class="summary-callout-copy">Its highest flood level is <strong>${escapeHtml(highestFloodLevel)}</strong>, and it stays within the safe limit.</div>`
    : 'Route summary unavailable.';
}

function decorateRouteForDisplay(route, exposureDisplay = null) {
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
    display_unsafe_distance: formatDistanceCompact(route?.unsafe_distance, '0 m'),
    display_flood_classes: formatFloodClasses(route),
    display_hazard_breakdown: formatHazardBreakdown(route),
    display_route_summary: buildRouteStreetSummary(route),
    display_street_preview: streetPreview,
    display_reason: buildRouteReason(route),
    display_segment_count: segmentCount,
    display_unsafe_segment_count: unsafeSegmentCount,
    display_flood_exposure_score: exposureDisplay?.score || '',
    display_flood_exposure_meaning: exposureDisplay?.meaning || '',
  };
}

function decorateRoutesForDisplay(routes) {
  const exposureDisplays = routes.map(route => buildFloodExposureDisplay(route));
  return routes.map((route, index) => decorateRouteForDisplay(route, exposureDisplays[index]));
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
  const routeDivider = document.getElementById('routeDivider');
  const earthquakeModeFlag = document.getElementById('earthquakeModeFlag');
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
    startNodeLabel.textContent = isEarthquakeMode()
      ? 'START NODE - Earthquake Origin'
      : 'START NODE - Safety Origin';
  }

  if (endField) {
    endField.hidden = isEarthquakeMode();
  }

  if (routeDivider) {
    routeDivider.hidden = isEarthquakeMode();
  }

  if (earthquakeModeFlag) {
    earthquakeModeFlag.hidden = !isEarthquakeMode();
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
    <div class="legend-row"><div class="legend-line" style="background:var(--green);height:4px;"></div><span style="font-size:.78rem;">Best Route</span></div>
    <div class="legend-row"><div class="legend-line" style="background:var(--yellow);"></div><span style="font-size:.78rem;">Available Route</span></div>
    <div class="legend-row"><div class="legend-line" style="background:var(--red);opacity:.5;"></div><span style="font-size:.78rem;">Eliminated Route</span></div>
    <div style="margin-top:5px;">
      <div class="legend-row"><div class="legend-dot-sm" style="background:#a855f7;"></div><span style="font-size:.78rem;">Start Node</span></div>
      <div class="legend-row"><div class="legend-dot-sm" style="background:#06b6d4;"></div><span style="font-size:.78rem;">End Node</span></div>
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
    });
    document.getElementById('mapLegend').style.display = 'block';
    syncLegendVisibility();
  } else {
    document.getElementById('mapLegend').style.display = 'none';
    syncLegendVisibility();
  }

  document.getElementById('resultsSummaryTxt').textContent = '';
  document.getElementById('resetBtn').classList.remove('show');
  document.getElementById('statusTxt').textContent = 'Ready';
  syncResultsVisibility(false);
  syncEarthquakeViewSelector();
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

  function populate(sel, exclude) {
    const kept = sel.value !== exclude ? sel.value : '';
    sel.innerHTML = '<option value="">— Select node —</option>';

    locs.forEach(l => {
      if (l === exclude) return;
      sel.innerHTML += `<option value="${l}" ${l === kept ? 'selected' : ''}>${l}</option>`;
    });

    sel.value = kept;
  }

  populate(startSel, null);
  populate(endSel, null);

  startSel.disabled = !selectedHazard;
  endSel.disabled = !selectedHazard;

  startSel.onchange = () => {
    populate(endSel, startSel.value);
    onNodeChange();
  };

  endSel.onchange = () => {
    populate(startSel, endSel.value);
    onNodeChange();
  };
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
    const placeholder = selectedHazard
      ? '— Select node —'
      : '— Select disaster type first —';

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
    document.getElementById('resetBtn').classList.remove('show');
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
  if (id === start) return '#a855f7';
  if (id === end) return '#06b6d4';
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

  const bounds = new google.maps.LatLngBounds();
  locations.forEach(loc => bounds.extend({ lat: loc.lat, lng: loc.lng }));
  gMap.fitBounds(bounds, padding);
}

function buildScopeBounds(points) {
  const bounds = new google.maps.LatLngBounds();
  points.forEach(point => bounds.extend(point));
  return bounds;
}

function fitMapToBoundaryPaths(paths, padding = 42) {
  const bounds = new google.maps.LatLngBounds();
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

  gMap.fitBounds(bounds, padding);
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
  gMap.fitBounds(bounds, padding);

  google.maps.event.addListenerOnce(gMap, 'idle', () => {
    const currentZoom = gMap.getZoom();
    if (!Number.isFinite(currentZoom)) return;

    const ne = bounds.getNorthEast();
    const sw = bounds.getSouthWest();
    const maxSpan = Math.max(
      Math.abs(ne.lat() - sw.lat()),
      Math.abs(ne.lng() - sw.lng())
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

  const bounds = new google.maps.LatLngBounds();
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

  gMap.fitBounds(bounds, 52);
  google.maps.event.addListenerOnce(gMap, 'idle', () => {
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

    paths.forEach(path => {
      const normalizedPath = (path || [])
        .filter(point => point && point.lat != null && point.lng != null)
        .map(point => ({
          lat: Number(point.lat),
          lng: Number(point.lng),
        }));

      if (normalizedPath.length < 2) return;

      const halo = new google.maps.Polyline({
        path: normalizedPath,
        geodesic: false,
        strokeColor: getBarangayBoundaryHaloColor(),
        strokeOpacity: 0.92,
        strokeWeight: 10,
        clickable: false,
        map: gMap,
        zIndex: 2,
      });

      halo.boundaryRole = 'halo';
      mapLayers.boundaries.push(halo);

      const outline = new google.maps.Polyline({
        path: normalizedPath,
        geodesic: false,
        strokeColor: getBarangayBoundaryStrokeColor(),
        strokeOpacity: 1,
        strokeWeight: 5,
        clickable: false,
        map: gMap,
        zIndex: 3,
      });

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

  const marker = new google.maps.Marker({
    position: { lat: n.lat, lng: n.lng },
    map: gMap,
    title: n.name,
    zIndex: special ? 34 : 10,
    icon: special
      ? makeRouteEndpointPinIcon(role)
      : {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 10,
          fillColor: col,
          fillOpacity: 0.95,
          strokeColor: '#ffffff',
          strokeWeight: 2.5,
        },
    label: special
      ? undefined
      : {
          text: shortNodeLabel(n.name),
          color: '#ffffff',
          fontSize: '10px',
          fontFamily: 'Plus Jakarta Sans, Nunito, sans-serif',
          fontWeight: '700'
        }
  });

  const iw = new google.maps.InfoWindow({
    content: infoPopup(n.name, buildNodePopupRows(n, start, end))
  });

  marker.addListener('click', () => {
    if (activeInfoWindow) activeInfoWindow.close();
    iw.open(gMap, marker);
    activeInfoWindow = iw;
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

  return {
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
    scaledSize: new google.maps.Size(184, 56),
    anchor: new google.maps.Point(92, 51),
  };
}

function makeRouteEndpointPinIcon(kind = 'start') {
  const isStart = kind === 'start';
  const fill = isStart ? '#a855f7' : '#06b6d4';
  const stroke = isStart ? '#6b21a8' : '#155e75';
  const glyph = isStart ? 'S' : 'E';
  const outerGlow = isStart ? 'rgba(168,85,247,0.22)' : 'rgba(6,182,212,0.22)';
  const innerFill = isStart ? '#9333ea' : '#0891b2';
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

  return {
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
    scaledSize: new google.maps.Size(48, 60),
    anchor: new google.maps.Point(24, 55),
  };
}

function drawSelectedPinsOnly(start, end) {
  mapLayers.nodes.forEach(m => m.setMap(null));
  mapLayers.nodes = [];

  if (!selectedBarangay) return;

  const nodes = getBarangayLocations(selectedBarangay);

  nodes.forEach(n => {
    if (n.name !== start && n.name !== end) return;

    const col = nodeColor(n.haz, n.name, start, end);

    const marker = new google.maps.Marker({
      position: { lat: n.lat, lng: n.lng },
      map: gMap,
      title: n.name,
      zIndex: 36,
      icon: makeRouteEndpointPinIcon(n.name === start ? 'start' : 'end')
    });

    const iw = new google.maps.InfoWindow({
      content: infoPopup(n.name, buildNodePopupRows(n, start, end))
    });

    marker.addListener('click', () => {
      if (activeInfoWindow) activeInfoWindow.close();
      iw.open(gMap, marker);
      activeInfoWindow = iw;
    });

    mapLayers.nodes.push(marker);
  });
}

function redrawNodes(start, end) {
  if (!selectedBarangay) return;

  mapLayers.nodes.forEach(m => m.setMap(null));
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

  document.querySelectorAll('.bgy-card[data-barangay]').forEach(card => {
    const isSelected = card.dataset.barangay === name;
    card.classList.toggle('selected', isSelected);
  });

  clearBarangaySelections({ keepResults: false, keepInfoText: true });
  if (selectedHazard === 'Flood') floodHazardOverlayMode = 'all';

  const locs = nodes.map(n => n.name);

  const startSel = document.getElementById('startSel');
  const endSel = document.getElementById('endSel');

  function populate(sel, exclude) {
    const kept = sel.value !== exclude ? sel.value : '';
    sel.innerHTML = '<option value="">— Select node —</option>';

    locs.forEach(l => {
      if (l === exclude) return;
      sel.innerHTML += `<option value="${l}" ${l === kept ? 'selected' : ''}>${l}</option>`;
    });

    sel.value = kept;
  }

  populate(startSel, null);
  populate(endSel, null);

  startSel.disabled = !selectedHazard;
  endSel.disabled = !selectedHazard;

  startSel.onchange = () => {
    populate(endSel, startSel.value);
    onNodeChange();
  };

  endSel.onchange = () => {
    populate(startSel, endSel.value);
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
        `Ready! The system will compare routes from <strong>${start}</strong> to the evacuation sites that can still be reached. Click <strong>Run Earthquake Simulation</strong> to view the results.`;
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
  const summaryRoute = document.getElementById('summaryRoute');
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

  if (summaryRoute) {
    if (isEarthquakeMode()) {
      summaryRoute.textContent = !isEarthquakeBarangaySupported()
        ? `Earthquake routing is currently locked outside ${EARTHQUAKE_SUPPORTED_BARANGAY_SCOPE}.`
        : earthquakeEvacSitesVisible && start
        ? `Start node: ${shortNodeLabel(start)}. ${earthquakeEvacSites.length} evacuation site(s) are visible.`
        : start
        ? `Start node: ${shortNodeLabel(start)}. Reveal the evacuation sites next.`
        : 'Pick the earthquake start node inside the selected barangay.';
    } else {
      summaryRoute.textContent = start && end
        ? `${shortNodeLabel(start)} → ${shortNodeLabel(end)}`
        : start
        ? `Start node: ${shortNodeLabel(start)}. Choose an end node next.`
        : selectedHazard
        ? 'Pick the origin and destination nodes inside the selected barangay.'
        : 'Choose a barangay and disaster type before selecting nodes.';
    }
  }

  if (summaryRun) {
    summaryRun.textContent = simulationInProgress
      ? 'Simulation is running. Inputs are temporarily locked until the results are ready.'
      : backendSimulationBusy
      ? 'The backend is still finishing a previous simulation. Wait until it clears before starting another run.'
      : simulationConfigLocked
      ? 'Setup is locked for this run. Click New Simulation to change it.'
      : isEarthquakeMode()
      ? canRun
        ? 'Earthquake setup is complete. Run the simulation to see which evacuation sites can still be reached and which routes are safer.'
        : 'Review the earthquake setup, then launch the simulation.'
      : canRun
      ? 'Everything is ready. Launch the simulation when you are set.'
      : 'Review the setup, then launch the simulation.';
  }

  const changeBarangayBtn = document.getElementById('changeBarangayBtn');
  const changeHazardBtn = document.getElementById('changeHazardBtn');
  const changeRouteBtn = document.getElementById('changeRouteBtn');
  const resetRouteBtn = document.getElementById('resetRouteBtn');

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

  if (resetRouteBtn) {
    resetRouteBtn.disabled = isSimulationInteractionLocked() || (isEarthquakeMode()
      ? !(start || earthquakeEvacSitesVisible)
      : !(start || end));
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

async function resetRouteSelection() {
  if (isSimulationInteractionLocked()) return;
  if (!selectedBarangay) return;

  workflowFocusSection = 'route';
  clearBarangaySelections({ keepResults: false, keepInfoText: true });

  if (selectedHazard) {
    populateBarangayNodeSelectors(selectedBarangay);
    setRouteSelectorsEnabled(!isEarthquakeMode());
    document.getElementById('infoBox').innerHTML = isEarthquakeMode()
      ? isEarthquakeBarangaySupported()
        ? `<strong>Brgy. ${selectedBarangay}</strong> kept. Choose your <strong>start node</strong>, then reveal the <strong>evacuation sites</strong> again.`
        : `<strong>Earthquake Routing</strong> is currently available only for <strong>${EARTHQUAKE_SUPPORTED_BARANGAY_SCOPE}</strong>.`
      : `<strong>Brgy. ${selectedBarangay}</strong> kept. Choose your <strong>start</strong> and <strong>end</strong> nodes again.`;
    advanceStep(isEarthquakeMode() && !isEarthquakeBarangaySupported() ? 2 : 3);
  } else {
    document.getElementById('infoBox').innerHTML =
      `<strong>Brgy. ${selectedBarangay}</strong> kept. Choose a <strong>disaster type</strong> first.`;
    advanceStep(2);
  }

  document.getElementById('emptyMap').style.display = 'none';
  await loadBarangayMapOnly(selectedBarangay);
  syncEarthquakeRouteUi();
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
        : { showRouteKeys: false, showHazardLayers: false }
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
    resetPatienceNotification();

    if (loaderHideTimer) {
      window.clearTimeout(loaderHideTimer);
    }

    loaderHideTimer = window.setTimeout(() => {
      loader.classList.remove('show');
      resetLoaderState();
      loaderHideTimer = null;
    }, delay);
  };

  resetLoaderState();
  syncLoaderContext();
  schedulePatienceNotification();
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
      loaderHideDelay = 140;
      hideLoader(loaderHideDelay);
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
      loaderHideDelay = 140;
      hideLoader(loaderHideDelay);
      clearBoundaryLayers();
      setFloodLegendContent();
      await renderActiveSimulationRoutes();
    }

    selectedRouteFocus = null;
    clearSelectedRouteRow();
    window.clearRouteRowHighlight();
    applyRouteFocusState(null);
    applySetupSidebarState(true);
    document.getElementById('resetBtn').classList.add('show');
    document.getElementById('infoBox').innerHTML =
      `This setup is now <strong>locked</strong> to keep the result stable. Click <strong>New Simulation</strong> if you want to change the barangay, disaster, or nodes.`;
    setSimulationConfigLocked(true);
    updateMapContextBadge();

    setLoaderStep('complete', 100);
    statusTxt.textContent = 'Simulation Complete';
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
    resetPatienceNotification();
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
  };
  return icons[name] || icons.alert;
}

function getRouteSafetyNodes() {
  return {
    content: document.getElementById('routeSafetyContent'),
  };
}

// The safety column only exists once the user has actually run a simulation.
function setRouteSafetyPanelVisible(visible) {
  const shell = document.getElementById('appShell');
  if (!shell || shell.classList.contains('safety-open') === visible) return;

  shell.classList.toggle('safety-open', visible);
  window.setTimeout(() => {
    if (gMap && window.google?.maps?.event) {
      window.google.maps.event.trigger(gMap, 'resize');
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

function getRouteStreetNames(route) {
  return Array.isArray(route?.street_path)
    ? route.street_path.map(name => String(name).trim()).filter(Boolean)
    : [];
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
  const totalParts = Number(best?.display_segment_count ?? best?.segment_count ?? 0);
  const peakScore = Number(best?.max_hazard || 0);
  const peakValue = isEarthquake
    ? `${getRiskLevelLabelFromScore(best?.max_hazard)} road risk`
    : `${formatFloodPeakRisk(best)} (${best?.max_hazard ?? '—'}/5)`;
  // Spec: amber/warning for medium-high peak severity; unsafe-part count stays neutral.
  const peakClass = peakScore >= 3 ? 'warning' : '';
  const unsafeClass = '';
  const verdict = safeRouteFound ? 'Safe route found' : 'No safe route';
  const peakLabel = isEarthquake ? 'Peak road risk crossed' : 'Peak flood level crossed';

  const notes = [
    `${routes.length} route${routes.length === 1 ? '' : 's'} evaluated, ${safe.length} fully safe.`,
    safeRouteFound
      ? 'Routes are ordered safer first, then by the ACO ranking rule.'
      : `Best fallback still crosses ${unsafeParts || 'unsafe'} road section${unsafeParts === 1 ? '' : 's'}.`,
  ];
  if (isEarthquake) {
    if (result.active_view_label) {
      notes.push(`Scores use the ${String(result.active_view_label).toLowerCase()} hazard lens.`);
    }
    notes.push('These hazard levels are based on Hazard Hunter PH data.');
  } else {
    notes.push('These hazard levels are based on Project NOAH flood historical data.');
  }

  const bestStreets = getRouteStreetNames(best);
  const chipLabel = `${start} → ${end}`;

  // Only clickable when there's a street-by-street path to show.
  const routeChipMarkup = bestStreets.length
    ? `
    <div class="safety-route-hint">Tap the route below to see every street on the way to your destination.</div>
    <button class="safety-route-chip is-interactive" type="button" id="safetyRouteChip"
        aria-expanded="false" aria-controls="safetyRouteStreets" onclick="toggleBestRouteStreets()">
      ${safetyIcon('pin')}<span title="${escapeHtml(chipLabel)}">${escapeHtml(start)} &rarr; ${escapeHtml(end)}</span>
      <svg class="safety-route-chip-caret" viewBox="0 0 24 24" aria-hidden="true"><path d="m7 10 5 5 5-5"/></svg>
    </button>
    <ol class="safety-route-streets" id="safetyRouteStreets" hidden>
      ${bestStreets.map(name => `<li>${escapeHtml(name)}</li>`).join('')}
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
      <button class="safety-result-card is-clickable" type="button" data-focus-route="${escapeHtml(bestRouteNo)}" data-focus-category="${escapeHtml(bestCategory)}" title="Highlight this route on the map">
        <div class="safety-icon-box">${safetyIcon('ruler')}</div>
        <div><div class="safety-card-label">Best route distance</div><div class="safety-card-value">${escapeHtml(best?.display_distance || 'Unavailable')}</div></div>
      </button>
      <div class="safety-result-card ${peakClass}">
        <div class="safety-icon-box">${safetyIcon('droplet')}</div>
        <div><div class="safety-card-label">${escapeHtml(peakLabel)}</div><div class="safety-card-value">${escapeHtml(peakValue)}</div></div>
      </div>
      <div class="safety-result-card ${unsafeClass}" title="How many of this recommended route's own road segments cross the hazard threshold — not the other candidate routes shown on the map.">
        <div class="safety-icon-box">${safetyIcon('road')}</div>
        <div><div class="safety-card-label">Unsafe parts on this route</div><div class="safety-card-value">${escapeHtml(totalParts ? `${unsafeParts} of ${totalParts}` : String(unsafeParts))}</div></div>
      </div>
    </div>
    <div class="safety-notes"><em>Note:</em><ul>${notes.map(note => `<li>${escapeHtml(note)}</li>`).join('')}</ul></div>
    <button class="safety-all-routes-btn" type="button" onclick="openRouteListModal()">See all ${routes.length} route${routes.length === 1 ? '' : 's'}</button>
    <button class="safety-secondary-btn" type="button" onclick="downloadCSV()">Download CSV</button>`;
}

let routeListModalReturnFocus = null;

function buildRouteModalCard(route, index, best) {
  const routeNo = route.display_route_no ?? index + 1;
  const isBest = route === best;
  const isEliminated = route.category === 'eliminated';
  const unsafe = Number(route.display_unsafe_segment_count ?? route.threshold_exceedance_count ?? 0);
  const risk = isEarthquakeRouteRecord(route)
    ? getRiskLevelLabelFromScore(route.max_hazard)
    : formatFloodPeakRisk(route);
  const isActive = selectedRouteFocus
    && String(selectedRouteFocus.routeNo) === String(routeNo)
    && (selectedRouteFocus.category || '') === (route.category || '');
  const suffix = isBest && isEliminated ? ' — best fallback' : '';
  const stats = [
    route.display_distance || 'Distance unavailable',
    risk,
    `${unsafe} unsafe part${unsafe === 1 ? '' : 's'}`,
  ];

  return `<article class="route-modal-card${isActive ? ' is-active' : ''}" tabindex="0" role="button"
      aria-label="Focus route ${escapeHtml(routeNo)} on the map"
      data-focus-route="${escapeHtml(routeNo)}" data-focus-category="${escapeHtml(route.category || '')}">
      <div>
        <div class="route-modal-card-title">Route ${escapeHtml(routeNo)}${suffix}</div>
        <div class="route-modal-card-stats">${stats.map(escapeHtml).join(' &middot; ')}</div>
      </div>
      ${isBest ? '<span class="route-best-badge">Best</span>' : ''}
    </article>`;
}

function openRouteListModal() {
  const modal = document.getElementById('routeListModal');
  const body = document.getElementById('routeListModalBody');
  const count = document.getElementById('routeListModalCount');
  const routes = Array.isArray(simData?.routes) ? simData.routes : [];
  if (!modal || !body || !routes.length) return;

  const best = getBestRoute(routes);
  const safe = routes.filter(route => route.category !== 'eliminated');
  const caution = safe.length === 0
    ? `<div class="route-modal-caution">${safetyIcon('alert')}<span>No fully safe route was found. Every route below crosses a hazardous section, so treat them as fallback options and review each one carefully.</span></div>`
    : '';

  body.innerHTML = caution + routes.map((route, index) => buildRouteModalCard(route, index, best)).join('');
  if (count) {
    count.textContent = `${routes.length} route${routes.length === 1 ? '' : 's'} · ${safe.length} safe`;
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
      mainOpacity: 0.95,
      outlineWeight: 9,
      outlineOpacity: 0.92,
      glowOpacities: [0.06, 0.10],
      zIndex: 8,
    };
  }

  if (group?.category === 'available') {
    return {
      mainWeight: 4,
      mainOpacity: 0.85,
      outlineWeight: 8,
      outlineOpacity: 0.88,
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
        mainOpacity: 0.85,
        outlineWeight: 8,
        outlineOpacity: 0.88,
        glowOpacities: [0.04],
        zIndex: 4,
      }
    : {
        mainWeight: 3,
        mainOpacity: 0.65,
        outlineWeight: 7,
        outlineOpacity: 0.82,
        glowOpacities: [],
        zIndex: 4,
      };
}

function getFocusedRouteVisual(group) {
  const base = getDefaultRouteVisual(group);
  return {
    ...base,
    mainWeight: base.mainWeight,
    mainOpacity: 0,
    outlineWeight: base.outlineWeight + 2,
    outlineOpacity: 0,
    glowOpacities: base.glowOpacities.map(() => 0),
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

function getRoutePreviewColor(group) {
  if (group?.category === 'best') return '#22c55e';
  if (group?.category === 'available') return '#f59e0b';
  if (group?.category === 'eliminated') return '#ef4444';
  return '#3b82f6';
}

function createRoutePreview(group) {
  if (!gMap || !group) return;

  const path = getRoutePreviewPath(group);
  if (path.length < 2) return;

  clearRoutePreview(group);
  const previewColor = getRoutePreviewColor(group);

  const haloDotSymbol = {
    path: google.maps.SymbolPath.CIRCLE,
    scale: 7.6,
    fillColor: '#ffffff',
    fillOpacity: 0.98,
    strokeColor: '#ffffff',
    strokeWeight: 2.8,
  };

  const dotSymbol = {
    path: google.maps.SymbolPath.CIRCLE,
    scale: 5.8,
    fillColor: previewColor,
    fillOpacity: 1,
    strokeColor: '#0f172a',
    strokeWeight: 1.8,
  };

  const haloArrowSymbol = {
    path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
    scale: 8.6,
    fillColor: '#ffffff',
    fillOpacity: 0.99,
    strokeColor: '#ffffff',
    strokeWeight: 3.6,
  };

  const arrowSymbol = {
    path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
    scale: 6.7,
    fillColor: previewColor,
    fillOpacity: 1,
    strokeColor: '#0f172a',
    strokeWeight: 1.9,
  };

  group.previewDotsHaloLayer = new google.maps.Polyline({
    path,
    geodesic: false,
    strokeOpacity: 0,
    clickable: false,
    icons: [{
      icon: haloDotSymbol,
      offset: '0px',
      repeat: '24px',
    }],
    map: gMap,
    zIndex: 18,
  });

  group.previewDotsLayer = new google.maps.Polyline({
    path,
    geodesic: false,
    strokeOpacity: 0,
    clickable: false,
    icons: [{
      icon: dotSymbol,
      offset: '0px',
      repeat: '24px',
    }],
    map: gMap,
    zIndex: 19,
  });

  group.previewArrowHaloLayer = new google.maps.Polyline({
    path,
    geodesic: false,
    strokeOpacity: 0,
    clickable: false,
    icons: [{
      icon: haloArrowSymbol,
      offset: '3%',
    }],
    map: gMap,
    zIndex: 20,
    });

  group.previewArrowLayer = new google.maps.Polyline({
    path,
    geodesic: false,
    strokeOpacity: 0,
    clickable: false,
      icons: [{
        icon: arrowSymbol,
        offset: '3%',
      }],
      map: gMap,
      zIndex: 21,
    });

  let dotOffset = 0;
  let arrowOffset = 0;
  group.previewTimer = window.setInterval(() => {
    if (!group.previewDotsHaloLayer || !group.previewDotsLayer || !group.previewArrowHaloLayer || !group.previewArrowLayer) return;

    dotOffset = (dotOffset + 1) % 24;
    arrowOffset = (arrowOffset + 1.35) % 100;

    group.previewDotsHaloLayer.set('icons', [{
      icon: haloDotSymbol,
      offset: `${dotOffset}px`,
      repeat: '24px',
    }]);

    group.previewDotsLayer.set('icons', [{
      icon: dotSymbol,
      offset: `${dotOffset}px`,
      repeat: '24px',
    }]);

    group.previewArrowHaloLayer.set('icons', [{
      icon: haloArrowSymbol,
      offset: `${arrowOffset}%`,
    }]);

    group.previewArrowLayer.set('icons', [{
      icon: arrowSymbol,
      offset: `${arrowOffset}%`,
    }]);
  }, 100);
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

  if (group.outlineLayer) {
    group.outlineLayer.setVisible(false);
  }

  if (group.mainLayer) {
    group.mainLayer.setVisible(false);
  }

  (group.glowLayers || []).forEach(layer => layer.setVisible(false));
  clearRoutePreview(group);
}

function applyRouteGroupVisual(group, visual) {
  if (!group) return;

  if (group.outlineLayer) {
    group.outlineLayer.setVisible((visual.outlineOpacity ?? 0) > 0.001);
    group.outlineLayer.setOptions({
      strokeOpacity: visual.outlineOpacity,
      strokeWeight: visual.outlineWeight,
      zIndex: Math.max(1, visual.zIndex - 1),
    });
  }

  if (group.mainLayer) {
    group.mainLayer.setVisible((visual.mainOpacity ?? 0) > 0.001);
    group.mainLayer.setOptions({
      strokeOpacity: visual.mainOpacity,
      strokeWeight: visual.mainWeight,
      zIndex: visual.zIndex,
    });
  }

  (group.glowLayers || []).forEach((layer, index) => {
    const glowOpacity = visual.glowOpacities[index] ?? 0;
    layer.setVisible(glowOpacity > 0.001);
    layer.setOptions({
      strokeOpacity: glowOpacity,
      zIndex: Math.max(1, visual.zIndex - 2 - index),
    });
  });
}

function applyRouteFocusState(routeNo) {
  const groups = Array.isArray(mapLayers.routeGroups) ? mapLayers.routeGroups : [];
  const hasFocus = routeNo != null;

  groups.forEach(group => {
    if (!isRouteCategoryVisibleOnMap(group.category)) {
      hideRouteGroup(group);
      return;
    }

    const visual = !hasFocus
      ? getDefaultRouteVisual(group)
      : group.routeNo === routeNo
      ? getFocusedRouteVisual(group)
        : getDimmedRouteVisual(group);

      applyRouteGroupVisual(group, visual);
      syncRoutePreview(group, hasFocus && group.routeNo === routeNo);
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
    <thead><tr><th>#</th><th>Recommendation</th><th>Distance</th><th>Risk &amp; Exposure</th><th>Route details</th></tr></thead>
    <tbody>${rows}</tbody>
  </table></div>`;
}

function switchTab(name, el) {
  setActiveTab(name);
}

function downloadCSV() {
  if (!simData) return;

  const rows = [[
    'Route',
    'Category',
    'Status',
    'Distance',
    'Unsafe Distance',
    'Max Hazard',
    'Unsafe Segments',
    'Segments',
    ...(isEarthquakeSimulationResult(simData) ? ['View', 'Destination', 'Hazards'] : ['Flood Classes']),
    'Hazard Breakdown',
    'Route Summary',
    'Reason',
    'Streets',
  ]];
  (simData.routes || []).forEach((r, i) => {
    rows.push([
      r.display_route_no ?? i + 1,
      r.category || '',
      r.status || '',
      r.display_distance || '',
      r.display_unsafe_distance || '',
      r.max_hazard ?? '',
      r.display_unsafe_segment_count ?? '',
      r.display_segment_count ?? '',
      ...(isEarthquakeSimulationResult(simData)
        ? [simData.active_view_label || 'Overall', r.destination_name || '', r.hazard_signature || '']
        : [r.display_flood_classes || '']),
      r.display_hazard_breakdown || '',
      r.display_route_summary || '',
      r.display_reason || '',
      Array.isArray(r.street_path) ? r.street_path.join(' -> ') : ''
    ]);
  });

  const csv = rows.map(r => r.map(v => `"${v}"`).join(',')).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  a.download = `safe_routes_${selectedBarangay || 'barangay'}_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
}

function resetAll() {
  if (simulationInProgress) return;
  floodHazardOverlayMode = 'none';
  resetEarthquakeState({ clearResults: true });
  hideFallbackWarningModal();
  simData = null;
  selectedBarangay = null;
  selectedHazard = null;
  applyHazardTheme();
  selectedRouteFocus = null;
  activeResultsTab = 'routes';
  workflowFocusSection = null;
  simulationConfigLocked = false;
  simulationInProgress = false;
  clearLayers();

  ['startSel', 'endSel'].forEach(id => {
    document.getElementById(id).innerHTML = '<option value="">— Select barangay first —</option>';
    document.getElementById(id).disabled = true;
    document.getElementById(id).value = '';
  });

  document.getElementById('runBtn').disabled = true;
  document.getElementById('resetBtn').classList.remove('show');
  syncResultsVisibility(false);
  document.getElementById('mapInfoBadge')?.style?.setProperty('display', 'none');
  document.getElementById('mapLegend').style.display = 'none';
  syncLegendVisibility();
  document.getElementById('emptyMap').style.display = 'flex';
  document.getElementById('statusTxt').textContent = 'Ready';

  document.getElementById('infoBox').innerHTML =
    `Select a <strong>barangay</strong> and then choose a <strong>disaster type</strong> to begin. The ACO algorithm will rank routes using ${getAcoRankingRuleHtml()}.`;

  document.querySelectorAll('.bgy-card').forEach(c => c.classList.remove('selected'));
  clearHazardSelectionState();
  setFloodLegendContent();
  syncFloodFilterControl();
  resetRouteSafetyPanel();
  // Mirrors the force-collapse on simulation start, so the panel reliably reopens.
  applySetupSidebarState(false);
  syncEarthquakeViewSelector();
  syncEarthquakeRouteUi();
  advanceStep(1);

  if (gMap) {
    gMap.panTo({ lat: 14.5590, lng: 121.0955 });
    gMap.setZoom(15);
  }

  updateMapContextBadge();
  syncSimulationConfigLock();
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
window.resetRouteSelection = resetRouteSelection;
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
window.formatFloodPeakRisk = formatFloodPeakRisk;
window.setFloodHazardOverlayMode = setFloodHazardOverlayMode;
window.showEvacuationSites = showEvacuationSites;
window.switchEarthquakeView = switchEarthquakeView;
window.toggleSetupSidebar = toggleSetupSidebar;
window.downloadCSV = downloadCSV;
window.openRouteListModal = openRouteListModal;
window.closeRouteListModal = closeRouteListModal;
window.focusRouteFromModal = focusRouteFromModal;

// Clicking the dimmed backdrop closes the route list.
document.getElementById('routeListModal')?.addEventListener('mousedown', event => {
  if (event.target === event.currentTarget) closeRouteListModal();
});

syncLoaderContext();
initLoaderGraphPulses();
setFloodLegendContent();
syncEarthquakeRouteUi();
syncEarthquakeViewSelector();
restoreSetupSidebarState();
syncFloodFilterControl();
advanceStep(1);
