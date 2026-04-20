const BACKEND = 'http://127.0.0.1:5000';
window.BACKEND_BASE = BACKEND;

let gMap = null;
let selectedBarangay = null;
let selectedHazard = null;
let simData = null;
let resultsCollapsed = false;
let isBackendLive = false;
let isLegendCollapsed = true;
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
let floodHazardOverlayMode = 'none';
const activeInfoWindowRef = { current: null };
const loaderState = {
  current: 0,
  target: 0,
  frameId: null,
};
const THEME_STORAGE_KEY = 'disaster-route-sim-theme';
const SIMULATION_WARMUP_DEBOUNCE_MS = 180;
const SIMULATION_WARMUP_TIMEOUT_MS = 120000;
const SIMULATION_REQUEST_TIMEOUT_MS = 300000;
const EARTHQUAKE_REQUEST_TIMEOUT_MS = 300000;
const EARTHQUAKE_WARMUP_TIMEOUT_MS = 300000;
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
  none: {
    label: 'Hidden',
    vars: [],
    copy: 'Choose a flood layer below to display it on the map. Click the active layer again to return to the default map view.',
  },
  high: {
    label: 'High',
    vars: [3],
    copy: 'Showing only the high flood-risk areas around the selected barangay. This is a map view only.',
  },
  moderate: {
    label: 'Moderate',
    vars: [2],
    copy: 'Showing only the moderate flood-risk areas around the selected barangay. This is a map view only.',
  },
  low: {
    label: 'Low',
    vars: [1],
    copy: 'Showing only the low flood-risk areas around the selected barangay. This is a map view only.',
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
let pendingSimulationWarmup = null;
let pendingSimulationWarmupKey = '';
let simulationWarmupTimer = null;
const completedSimulationWarmups = new Set();
let pendingEarthquakeWarmup = null;
let pendingEarthquakeWarmupKey = '';
const completedEarthquakeWarmups = new Set();
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

function syncMapOverlayLayout() {
  const legend = document.getElementById('mapLegend');
  const infoBadge = document.getElementById('mapInfoBadge');

  if (!legend) return;

  const defaultLegendTop = 132;
  let nextLegendTop = defaultLegendTop;

  if (infoBadge && infoBadge.style.display !== 'none' && infoBadge.offsetParent !== null) {
    nextLegendTop = Math.max(defaultLegendTop, infoBadge.offsetTop + infoBadge.offsetHeight + 12);
  }

  legend.style.top = `${nextLegendTop}px`;
}

function syncLegendVisibility() {
  const legend = document.getElementById('mapLegend');
  const toggleBtn = document.getElementById('legendToggleBtn');

  if (!legend) return;

  syncMapOverlayLayout();
  legend.classList.toggle('legend-collapsed', isLegendCollapsed);

  if (toggleBtn) {
    toggleBtn.textContent = isLegendCollapsed ? 'Show' : 'Hide';
    toggleBtn.setAttribute('aria-expanded', String(!isLegendCollapsed));
  }
}

function toggleLegendVisibility() {
  isLegendCollapsed = !isLegendCollapsed;
  syncLegendVisibility();
}

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

function stopResultsResize() {
  if (!resultsResizeState) return;

  window.removeEventListener('mousemove', onResultsResizeMove);
  window.removeEventListener('mouseup', stopResultsResize);
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

  document.body.classList.add('results-resizing');
  window.addEventListener('mousemove', onResultsResizeMove);
  window.addEventListener('mouseup', stopResultsResize);
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
  const loaderModeBadge = document.getElementById('loaderModeBadge');

  if (loaderKicker) {
    loaderKicker.textContent = modeLabel === 'Route' ? 'Loading' : `${modeLabel} routing`;
  }

  if (loaderModeBadge) {
    loaderModeBadge.textContent = modeLabel;
  }
}

function setLoaderStep(title, progress, options = {}) {
  setLoaderTitle(title);
  updateLoaderProgress(progress, options);
  updateLoaderStepDetail(options.detail || '');
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
  hideLoaderSteps();
}

function updateLoaderStepDetail(stepText) {
  const stepsContainer = document.getElementById('loaderSteps');
  if (!stepsContainer) return;

  if (stepText && stepText.trim()) {
    stepsContainer.textContent = stepText;
    stepsContainer.hidden = false;
  } else {
    hideLoaderSteps();
  }
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
  });

  window.addEventListener('resize', () => {
    syncMapOverlayLayout();
    const resultsPanel = document.getElementById('resultsPanel');
    if (resultsPanel?.classList.contains('show')) {
      applyResultsPanelHeight(resultsPanel.getBoundingClientRect().height || 320);
    }
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
    const res = await fetch(BACKEND + '/locations');
    const data = await res.json();

    if (data.error) {
      throw new Error(data.message || 'Failed to load locations');
    }

    ALL_LOCATIONS = (data.locations || []).map(normalizeLocation);
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
  return `Highest score: ${formatHazardScoreText(route?.max_hazard)} · Unsafe road parts: ${Number(route?.display_unsafe_segment_count || 0)}`;
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
      ? `Best route to ${route.destination_name}. It has the lowest road risk among the options shown.`
      : 'Best route. It has the lowest flood risk among the options shown.';
  }

  if (route?.category === 'available') {
    return 'Available route, but another option is safer or shorter.';
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
    { label: 'Road parts in route', value: `${route?.display_segment_count ?? 0}` },
  ];
}

function getFriendlyEarthquakeViewDescription(viewKey) {
  switch (viewKey) {
    case 'liquefaction':
      return 'This view favors routes with lower liquefaction risk before distance.';
    case 'ground_shaking':
      return 'This view favors routes with lower ground-shaking risk before distance.';
    case 'overall':
    default:
      return 'Overall checks both liquefaction and ground shaking first, then distance.';
  }
}

function buildSummaryCallout(result, safeRoutes, bestRoute, earthquakeSummary) {
  if (isEarthquakeSimulationResult(result)) {
    if (!safeRoutes.length) {
      return earthquakeSummary?.selected_evacuation_site
        ? `No safe route was found to <strong>${escapeHtml(earthquakeSummary.selected_evacuation_site.name)}</strong>. The routes shown below still cross road sections above the safety limit.`
        : 'No safe route was found in this view. The routes shown below still cross road sections above the safety limit.';
    }

    const base = getFriendlyEarthquakeViewDescription(
      earthquakeSummary?.view_key || result.active_view || 'overall'
    );
    return earthquakeSummary?.selected_evacuation_site
      ? `${base}<br><br>Target shelter: <strong>${escapeHtml(earthquakeSummary.selected_evacuation_site.name)}</strong>`
      : base;
  }

  if (!safeRoutes.length) {
    return 'No safe flood route was found. All shown options cross road sections above the safety limit.';
  }

  return bestRoute
    ? 'The top flood route keeps water risk lowest before distance.'
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

function buildSimulationWarmupKey({ barangay, hazard, start, end }) {
  return [barangay || '', hazard || '', start || '', end || '']
    .map(value => String(value).trim().toLowerCase())
    .join('::');
}

function clearPendingSimulationWarmup() {
  if (simulationWarmupTimer) {
    window.clearTimeout(simulationWarmupTimer);
    simulationWarmupTimer = null;
  }

  pendingSimulationWarmup = null;
  pendingSimulationWarmupKey = '';
}

function buildEarthquakeWarmupKey(barangay = selectedBarangay) {
  return String(barangay || '').trim().toLowerCase();
}

function clearPendingEarthquakeWarmup() {
  pendingEarthquakeWarmup = null;
  pendingEarthquakeWarmupKey = '';
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
    const response = await fetch(BACKEND + endpoint, {
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
        const message = data?.message || data?.error || 'Simulation failed';
        throw new Error(message);
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
      `Simulation took longer than ${formatTimeoutForHumans(SIMULATION_REQUEST_TIMEOUT_MS)} in the browser and was stopped. The backend may still be computing that request, so avoid running it again immediately.`
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
        throw new Error(data?.message || 'Earthquake simulation failed');
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
      `Earthquake simulation took longer than ${formatTimeoutForHumans(EARTHQUAKE_REQUEST_TIMEOUT_MS)} in the browser and was stopped. Keep the backend running and try again after the current computation finishes.`
    );
  }

  throw lastError || new Error('Earthquake simulation failed');
}

async function sendEarthquakePrewarmRequest(payload) {
  let lastError = null;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    let statusCode = 0;

    try {
      const { response, data } = await postJsonWithTimeout(
        '/earthquake/prewarm',
        payload,
        EARTHQUAKE_WARMUP_TIMEOUT_MS
      );
      statusCode = response.status;

      if (!response.ok || data?.error === true) {
        throw new Error(data?.message || 'Earthquake routing preparation failed');
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
      `Earthquake routing preparation took longer than ${formatTimeoutForHumans(EARTHQUAKE_WARMUP_TIMEOUT_MS)} in the browser and was stopped. Check the backend connection and try again.`
    );
  }

  throw lastError || new Error('Earthquake routing preparation failed');
}

async function prewarmEarthquakeContext(barangay, warmupKey) {
  try {
    await sendEarthquakePrewarmRequest({ barangay });
    completedEarthquakeWarmups.add(warmupKey);
    return true;
  } catch (error) {
    console.warn('Earthquake warmup skipped:', error);
    return false;
  } finally {
    if (pendingEarthquakeWarmupKey === warmupKey) {
      pendingEarthquakeWarmup = null;
    }
  }
}

function scheduleEarthquakeWarmup(barangay = selectedBarangay) {
  if (!isEarthquakeMode() || !isEarthquakeBarangaySupported(barangay) || !earthquakeEvacSitesVisible) {
    clearPendingEarthquakeWarmup();
    return;
  }

  const warmupKey = buildEarthquakeWarmupKey(barangay);
  if (!warmupKey || completedEarthquakeWarmups.has(warmupKey) || pendingEarthquakeWarmupKey === warmupKey) {
    return;
  }

  pendingEarthquakeWarmupKey = warmupKey;
  pendingEarthquakeWarmup = prewarmEarthquakeContext(barangay, warmupKey);
}

async function ensureEarthquakeWarmup(barangay = selectedBarangay) {
  if (!isEarthquakeMode() || !isEarthquakeBarangaySupported(barangay)) {
    return false;
  }

  const warmupKey = buildEarthquakeWarmupKey(barangay);
  if (!warmupKey) {
    return false;
  }

  if (completedEarthquakeWarmups.has(warmupKey)) {
    return true;
  }

  if (pendingEarthquakeWarmupKey === warmupKey && pendingEarthquakeWarmup) {
    return await pendingEarthquakeWarmup;
  }

  pendingEarthquakeWarmupKey = warmupKey;
  pendingEarthquakeWarmup = prewarmEarthquakeContext(barangay, warmupKey);
  return await pendingEarthquakeWarmup;
}

async function prewarmSimulationContext(start, end, warmupKey) {
  try {
    const { response, data } = await postJsonWithTimeout(
      '/prewarm-simulation',
      {
        start,
        end,
        barangay: selectedBarangay,
      },
      SIMULATION_WARMUP_TIMEOUT_MS
    );

    if (response.ok && data?.error !== true) {
      completedSimulationWarmups.add(warmupKey);
      return true;
    }

    throw new Error(data?.message || 'Warmup failed');
  } catch (error) {
    console.warn('Simulation warmup skipped:', error);
    return false;
  }
}

function scheduleSimulationWarmup(start, end) {
  if (!isBackendLive || !selectedBarangay || !selectedHazard || !start || !end || start === end) {
    clearPendingSimulationWarmup();
    return;
  }

  const warmupKey = buildSimulationWarmupKey(getCurrentSelections());
  const hasMatchingWarmupInFlight = pendingSimulationWarmupKey === warmupKey
    && (!!pendingSimulationWarmup || !!simulationWarmupTimer);

  if (completedSimulationWarmups.has(warmupKey) || hasMatchingWarmupInFlight) {
    return;
  }

  clearPendingSimulationWarmup();
  pendingSimulationWarmupKey = warmupKey;

  simulationWarmupTimer = window.setTimeout(() => {
    simulationWarmupTimer = null;
    const activeWarmupKey = warmupKey;

    pendingSimulationWarmup = prewarmSimulationContext(start, end, activeWarmupKey)
      .finally(() => {
        if (pendingSimulationWarmupKey === activeWarmupKey) {
          pendingSimulationWarmup = null;
        }
      });
  }, SIMULATION_WARMUP_DEBOUNCE_MS);
}

async function ensureSimulationWarmup(start, end) {
  if (!isBackendLive || !selectedBarangay || !selectedHazard || !start || !end || start === end) {
    return false;
  }

  const warmupKey = buildSimulationWarmupKey(getCurrentSelections());
  if (completedSimulationWarmups.has(warmupKey)) {
    return true;
  }

  if (pendingSimulationWarmupKey === warmupKey && pendingSimulationWarmup) {
    return await pendingSimulationWarmup;
  }

  if (pendingSimulationWarmupKey !== warmupKey) {
    clearPendingSimulationWarmup();
    pendingSimulationWarmupKey = warmupKey;
  }

  if (simulationWarmupTimer) {
    window.clearTimeout(simulationWarmupTimer);
    simulationWarmupTimer = null;
  }

  const activeWarmupKey = warmupKey;
  pendingSimulationWarmup = prewarmSimulationContext(start, end, activeWarmupKey)
    .finally(() => {
      if (pendingSimulationWarmupKey === activeWarmupKey) {
        pendingSimulationWarmup = null;
      }
    });

  return await pendingSimulationWarmup;
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
  const {
    showHazardLayers = false,
    hazardOverlayMode = floodHazardOverlayMode,
  } = options;
  const body = document.getElementById('mapLegendBody');
  if (!body) return;

  const overlayVars = getFloodOverlayConfig(hazardOverlayMode).vars;
  const hazardLegend = [
    overlayVars.includes(1)
      ? `<div class="legend-row"><div class="legend-line" style="background:rgba(250,204,21,.86);height:8px;border-radius:999px;"></div><span style="font-size:.63rem;">Low Flood Area</span></div>`
      : '',
    overlayVars.includes(2)
      ? `<div class="legend-row"><div class="legend-line" style="background:rgba(251,146,60,.90);height:8px;border-radius:999px;"></div><span style="font-size:.63rem;">Moderate Flood Area</span></div>`
      : '',
    overlayVars.includes(3)
      ? `<div class="legend-row"><div class="legend-line" style="background:rgba(244,63,94,.94);height:8px;border-radius:999px;"></div><span style="font-size:.63rem;">High Flood Area</span></div>`
      : '',
  ].filter(Boolean).join('');

  body.innerHTML = `
    <div class="legend-row"><div class="legend-line" style="background:var(--green);height:4px;"></div><span style="font-size:.63rem;">Best Route</span></div>
    <div class="legend-row"><div class="legend-line" style="background:var(--yellow);"></div><span style="font-size:.63rem;">Available Route</span></div>
    <div class="legend-row"><div class="legend-line" style="background:var(--red);opacity:.5;"></div><span style="font-size:.63rem;">Eliminated Route</span></div>
    <div style="margin-top:5px;">
      <div class="legend-row"><div class="legend-dot-sm" style="background:#a855f7;"></div><span style="font-size:.63rem;">Start Node</span></div>
      <div class="legend-row"><div class="legend-dot-sm" style="background:#06b6d4;"></div><span style="font-size:.63rem;">End Node</span></div>
      ${showHazardLayers ? `
        ${hazardLegend}
      ` : `
        <div class="legend-row"><div class="legend-dot-sm" style="background:var(--green);"></div><span style="font-size:.63rem;">Safe</span></div>
        <div class="legend-row"><div class="legend-dot-sm" style="background:var(--yellow);"></div><span style="font-size:.63rem;">Moderate</span></div>
        <div class="legend-row"><div class="legend-dot-sm" style="background:var(--red);"></div><span style="font-size:.63rem;">Danger</span></div>
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

  clearPendingSimulationWarmup();
  clearPendingEarthquakeWarmup();
  floodHazardOverlayMode = 'none';
  resetEarthquakeState({ clearResults: !keepResults });
  hideFallbackWarningModal();
  simData = null;
  selectedRouteFocus = null;
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
  document.getElementById('mapInfoBadge').style.display = 'none';
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
      : `Select a <strong>barangay</strong> and then choose a <strong>disaster type</strong> to begin. The ACO algorithm will find the <strong>safest route</strong> using the <strong>lexicographic safety-first rule</strong>.`;
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
  return EARTHQUAKE_CLASSIFICATION_VIEWS.includes(viewKey);
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
  document.getElementById('mapInfoBadge').style.display = 'none';

  if (!nodes.length) return;

  try {
    const res = await fetch(BACKEND + '/barangay-boundary/' + encodeURIComponent(bgyName));
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
    zIndex: 10,
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
  const halo = isStart ? 'rgba(168,85,247,0.18)' : 'rgba(6,182,212,0.18)';
  const glyph = isStart ? 'S' : 'E';
  const label = isStart ? 'START' : 'END';
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="88" height="104" viewBox="0 0 88 104">
      <defs>
        <filter id="nodePinShadow" x="-20%" y="-20%" width="140%" height="160%">
          <feDropShadow dx="0" dy="5" stdDeviation="5" flood-color="rgba(15,23,42,0.24)"/>
        </filter>
      </defs>
      <circle cx="44" cy="34" r="28" fill="${halo}" />
      <g filter="url(#nodePinShadow)">
        <path d="M44 8C27.4 8 14 21.4 14 38c0 20.7 22.7 36 30 50 7.3-14 30-29.3 30-50C74 21.4 60.6 8 44 8z"
          fill="${fill}" stroke="${stroke}" stroke-width="3"/>
        <circle cx="44" cy="37" r="17" fill="#ffffff" opacity="0.98"/>
        <text x="44" y="43" text-anchor="middle" font-family="Plus Jakarta Sans, Nunito, sans-serif" font-size="16" font-weight="800" fill="${stroke}">${glyph}</text>
        <rect x="18" y="73" width="52" height="16" rx="8" fill="#ffffff" opacity="0.98"/>
        <text x="44" y="84" text-anchor="middle" font-family="Plus Jakarta Sans, Nunito, sans-serif" font-size="8.5" font-weight="800" fill="${stroke}">${label}</text>
      </g>
    </svg>
  `;

  return {
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
    scaledSize: new google.maps.Size(48, 58),
    anchor: new google.maps.Point(24, 51),
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
      zIndex: 20,
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
    await loadBarangayMapOnly(name);
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

  document.getElementById('runBtn').disabled = !canRun;

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
    clearPendingSimulationWarmup();

    if (!isEarthquakeBarangaySupported()) {
      document.getElementById('infoBox').innerHTML =
        `<strong>Earthquake Routing</strong> is currently available only for <strong>${EARTHQUAKE_SUPPORTED_BARANGAY_SCOPE}</strong>.`;
    } else if (canRun) {
      document.getElementById('infoBox').innerHTML =
        `Ready! <strong>${start}</strong> will be routed to the nearest <strong>road-reachable evacuation site</strong>. Click <strong>Run Earthquake Simulation</strong>.`;
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
    clearPendingSimulationWarmup();

    if (canRun) {
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
  document.getElementById('emptyMap').style.display = 'none';
  await loadBarangayMapOnly(selectedBarangay);

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
      return canRunEarthquakeSimulation(start) ? 'Ready to simulate' : 'Complete earthquake setup';
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
      : simulationConfigLocked
      ? 'Setup is locked for this run. Click New Simulation to change it.'
      : isEarthquakeMode()
      ? canRun
        ? 'Earthquake setup is complete. The ACO run will route to the nearest road-reachable evacuation site.'
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

function initStepNavigation() {}

function goToStep() {}

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
    });
    return {
      visible: hasLayers,
      hasLayers,
      failed: false,
    };
  } catch (err) {
    console.warn('Failed to load flood hazard overlay:', err);
    window.floodHazardUI?.renderHazardLayers({ map: gMap, hazardLayers: null });
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

  floodHazardOverlayMode = floodHazardOverlayMode === modeKey ? 'none' : modeKey;

  const overlayState = await syncFloodHazardOverlay(selectedBarangay);
  if (floodHazardOverlayMode !== 'none' && overlayState.failed) {
    floodHazardOverlayMode = 'none';
    alert('Could not load the flood overlay. Restart the backend, then try again.');
  } else if (floodHazardOverlayMode !== 'none' && !overlayState.hasLayers) {
    floodHazardOverlayMode = 'none';
    alert('No flood areas were found for the selected map view.');
  }

  setFloodLegendContent({
    showHazardLayers: floodHazardOverlayMode !== 'none' && overlayState.visible,
    hazardOverlayMode: floodHazardOverlayMode,
  });
  showResultsPanel(simData, { preserveActiveTab: true });
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
    clearPendingEarthquakeWarmup();
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

  resetLoaderState();
  syncLoaderContext();
  loader.classList.add('show');
  setSimulationInProgress(true);
  runBtn.disabled = true;
  statusTxt.textContent = 'Simulating…';
  document.getElementById('infoBox').innerHTML =
    `Simulation is now <strong>running</strong>. The selected barangay, disaster type, and node inputs are <strong>temporarily locked</strong> until the results are ready.`;
  setLoaderStep(
    'Getting everything ready',
    5,
    { immediate: true, detail: 'Preparing the map, hazard data, and route settings...' }
  );

  try {
    let result;
    if (isEarthquakeMode()) {
      clearPendingEarthquakeWarmup();
      setLoaderStep('Loading earthquake data', 20);
      setLoaderStep('Finding routes', 50);

      result = await sendEarthquakeRequest({
        start,
        barangay: selectedBarangay,
        hazard: selectedHazard,
      });
      setLoaderStep('Reviewing results', 75);

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
      setLoaderStep('Drawing route map', 90);
      syncEarthquakeViewSelector();
      clearBoundaryLayers();
      await renderActiveSimulationRoutes();
      showResultsPanel(simData);
    } else {
      clearPendingSimulationWarmup();
      setLoaderStep('Loading flood data', 20);
      setLoaderStep('Finding routes', 50);

      result = await sendSimulationRequest({
        start,
        end,
        hazard: selectedHazard,
        barangay: selectedBarangay,
      });
      result.routes = decorateRoutesForDisplay(
        normalizeRoutes(result.routes || [])
      );

      setLoaderStep('Reviewing results', 75);
      simData = result;
      setLoaderStep('Drawing route map', 90);
      clearBoundaryLayers();
      setFloodLegendContent();
      await renderActiveSimulationRoutes();
      showResultsPanel(simData);
      showResultsPanel(result);
    }

    selectedRouteFocus = null;
    clearSelectedRouteRow();
    window.clearRouteRowHighlight();
    applyRouteFocusState(null);
    document.getElementById('resetBtn').classList.add('show');
    document.getElementById('infoBox').innerHTML =
      `This setup is now <strong>locked</strong> to keep the result stable. Click <strong>New Simulation</strong> if you want to change the barangay, disaster, or nodes.`;
    setSimulationConfigLocked(true);
    updateMapContextBadge();

    setLoaderStep('Routes are ready', 100);
    statusTxt.textContent = 'Simulation Complete';
  } catch (err) {
    console.error(err);
    statusTxt.textContent = 'Error';
    setLoaderStep('Simulation could not finish', 100);
    loaderHideDelay = 320;
    alert('Simulation failed: ' + err.message);
  } finally {
    setSimulationInProgress(false);
    window.setTimeout(() => {
      loader.classList.remove('show');
      resetLoaderState();
    }, loaderHideDelay);
    runBtn.disabled = isSimulationInteractionLocked();
    syncSimulationConfigLock();
  }
}

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

  document.getElementById('tab-routes').innerHTML = routes.length
    ? shouldShowFallbackRoutes
    ? `${floodOverlayControl}<div class="fallback-warning-inline"><strong>No safe route found.</strong> The routes below still cross unsafe road sections.</div>${buildTable(routes, { switchTabOnFocus: false })}`
    : `${floodOverlayControl}${buildTable(routes)}`
    : `<div class="tab-section-empty">No routes found for this simulation.</div>`;

  if (isEarthquakeSimulationResult(result)) {
    document.getElementById('tab-summary').innerHTML = `
      <div class="results-stats-grid">
        ${statBox('Displayed', routes.length, 'var(--ink-strong)')}
        ${statBox('Safe Routes', safe.length, 'var(--green)')}
        ${statBox('Eliminated', elim.length, 'var(--red)')}
        ${statBox('Target Evac', earthquakeSummary?.selected_evacuation_site?.name || 'No route', safe.length ? 'var(--accent)' : 'var(--red)')}
      </div>
      <div class="summary-callout">
        ${buildSummaryCallout(result, safe, best, earthquakeSummary)}
      </div>
      <div class="summary-meta" style="margin-top:10px;">
        Ranking rule: lower risk first, shorter distance second. &nbsp;|&nbsp; View: ${escapeHtml(result.active_view_label || 'Overall')}
      </div>`;
  } else {
    document.getElementById('tab-summary').innerHTML = `
      <div class="results-stats-grid">
        ${statBox('Displayed', routes.length, 'var(--ink-strong)')}
        ${statBox('Safe Routes', safe.length, 'var(--green)')}
        ${statBox('Eliminated', elim.length, 'var(--red)')}
        ${statBox('Best Dist.', best ? best.display_distance : 'No safe route', best ? 'var(--accent)' : 'var(--red)')}
      </div>
      <div class="summary-callout">
        ${buildSummaryCallout(result, safe, best, null)}
      </div>
      <div class="summary-meta" style="margin-top:10px;">
        Ranking rule: lower risk first, shorter distance second. &nbsp;|&nbsp; Disaster: ${result.hazard_type || selectedHazard}
      </div>`;
  }

  document.getElementById('resultsSummaryTxt').textContent = routes.length
    ? isEarthquakeSimulationResult(result)
      ? `${result.active_view_label || 'Overall'} · ${routes.length} routes listed`
      : shouldShowFallbackRoutes
      ? `${routes.length} routes listed · least-risk first`
      : `${routes.length} routes listed`
    : 'No route results to display';

  const nextTab = preserveActiveTab
    ? activeResultsTab
    : routes.length
    ? 'routes'
    : 'summary';

  setActiveTab(nextTab);

  if (shouldShowFallbackRoutes) {
    if (!result._fallbackWarningHandled) {
      result._fallbackWarningHandled = true;
      showFallbackWarningModal();
    }
  } else {
    hideFallbackWarningModal();
  }
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

  return {
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
    scale: 7.8,
    fillColor: '#ffffff',
    fillOpacity: 0.98,
    strokeColor: '#ffffff',
    strokeWeight: 3,
  };

  const arrowSymbol = {
    path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
    scale: 6.2,
    fillColor: previewColor,
    fillOpacity: 1,
    strokeColor: '#0f172a',
    strokeWeight: 1.8,
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
      offset: '0%',
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
        offset: '0%',
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
    return `<div style="font-family:'DM Mono',monospace;font-size:.7rem;color:var(--muted);padding:10px;">No routes in this category.</div>`;
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
    <thead><tr><th>#</th><th>Recommendation</th><th>Distance</th><th>Risk level</th><th>Route details</th></tr></thead>
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
  clearPendingSimulationWarmup();
  clearPendingEarthquakeWarmup();
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
  document.getElementById('mapInfoBadge').style.display = 'none';
  document.getElementById('mapLegend').style.display = 'none';
  syncLegendVisibility();
  document.getElementById('emptyMap').style.display = 'flex';
  document.getElementById('statusTxt').textContent = 'Ready';

  document.getElementById('infoBox').innerHTML =
    `Select a <strong>barangay</strong> and then choose a <strong>disaster type</strong> to begin. The ACO algorithm will find the <strong>safest route</strong> using the <strong>lexicographic safety-first rule</strong>.`;

  document.querySelectorAll('.bgy-card').forEach(c => c.classList.remove('selected'));
  clearHazardSelectionState();
  setFloodLegendContent();
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
    const r = await fetch(BACKEND + '/', { signal: c.signal });
    clearTimeout(t);

    if (r.ok) {
      isBackendLive = true;
      document.getElementById('statusTxt').textContent = 'Backend Connected';
    }
  } catch (err) {
    isBackendLive = false;
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
window.toggleLegendVisibility = toggleLegendVisibility;
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
window.goToStep = goToStep;
window.startResultsResize = startResultsResize;
window.initMap = initMap;
window.handleRouteRowKey = handleRouteRowKey;
window.formatFloodPeakRisk = formatFloodPeakRisk;
window.setFloodHazardOverlayMode = setFloodHazardOverlayMode;
window.showEvacuationSites = showEvacuationSites;
window.switchEarthquakeView = switchEarthquakeView;

syncLoaderContext();
initStepNavigation();
setFloodLegendContent();
syncEarthquakeRouteUi();
syncEarthquakeViewSelector();
advanceStep(1);
