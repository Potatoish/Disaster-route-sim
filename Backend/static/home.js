// Homepage / About & Contact page behavior: theme toggle, ant-trail hero
// background, and the feedback widget. Loaded on every page that extends
// site_base.html.

// Mirrors script.js's BACKEND_BASE (only ever loaded together with this file
// on the simulator page, never here) so the scope-map modal below can hit
// the same API from the homepage/about pages without the simulator's JS.
window.BACKEND_BASE = window.BACKEND_BASE || (
  ['127.0.0.1', 'localhost'].includes(window.location.hostname)
    ? `${window.location.protocol}//127.0.0.1:5000`
    : window.location.origin
);

const HOME_THEME_STORAGE_KEY = 'disaster-route-sim-theme';

function getStoredHomeTheme() {
  try {
    return localStorage.getItem(HOME_THEME_STORAGE_KEY) === 'dark' ? 'dark' : 'light';
  } catch (err) {
    return 'light';
  }
}

// Set by initAntCanvas() so a theme flip can refresh its cached colors
// without going back to getComputedStyle() on every animation frame.
let refreshAntCanvasColors = null;

function applyHomeTheme(theme) {
  document.body.classList.toggle('dark', theme === 'dark');
  const logo = document.getElementById('brandLogo');
  if (logo) {
    logo.src = theme === 'dark' ? logo.dataset.logoDark : logo.dataset.logoLight;
  }
  document.querySelectorAll('.theme-switch-btn').forEach((btn) => {
    const active = btn.dataset.theme === theme;
    btn.classList.toggle('is-active', active);
    btn.setAttribute('aria-pressed', String(active));
  });
  if (refreshAntCanvasColors) refreshAntCanvasColors();
  try {
    localStorage.setItem(HOME_THEME_STORAGE_KEY, theme);
  } catch (err) {
    // Ignore storage failures and keep the theme in-memory only.
  }
}

function initHomeTheme() {
  applyHomeTheme(getStoredHomeTheme());
  initAntCanvas();
  syncQuickStartLink();
}

function setHomeTheme(theme) {
  applyHomeTheme(theme);
}

// ---- feedback widget (UI only for now — no backend to send to yet) ----
let fabOpen = false;

function toggleFab() {
  fabOpen = !fabOpen;
  const panel = document.getElementById('fabPanel');
  if (panel) panel.classList.toggle('open', fabOpen);
}

function showHomeToast(message) {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2200);
}

function sendFeedback() {
  const msg = document.getElementById('fabMsg');
  const role = document.getElementById('fabRole');
  toggleFab();
  showHomeToast('Thanks for the feedback!');
  if (msg) msg.value = '';
  if (role) role.value = '';
  if (rateRow) rateRow.querySelectorAll('button.sel').forEach((btn) => btn.classList.remove('sel'));
}

const rateRow = document.getElementById('rateRow');
if (rateRow) {
  rateRow.addEventListener('click', (event) => {
    const btn = event.target.closest('button');
    if (!btn) return;
    Array.from(rateRow.children).forEach((child) => child.classList.toggle('sel', child === btn));
  });
}

function submitContactForm() {
  showHomeToast('Thanks — preview only, this would send your message.');
}

// ---- hero quick-start card: barangay pick, folded into the "See map"
// link's query string (?barangay=...) so the simulator page can read a
// starting selection from the URL. No barangay is pre-selected, so the
// link stays inert (href="#") until the visitor picks one -- clicking it
// before that just surfaces qsBarangayError instead of navigating.
let quickStartBarangay = null;

function syncQuickStartLink() {
  const link = document.getElementById('quickStartLaunch');
  if (!link) return;

  if (!quickStartBarangay) {
    link.href = '#';
    return;
  }

  const params = new URLSearchParams({ barangay: quickStartBarangay });
  link.href = `${link.dataset.baseHref}?${params.toString()}`;
}

function setQuickStartBarangay(barangay, btn) {
  // Clicking the already-selected card deselects it instead of re-selecting.
  quickStartBarangay = quickStartBarangay === barangay ? null : barangay;
  document.querySelectorAll('.qs-barangay-card').forEach((el) => {
    const active = el === btn && quickStartBarangay === barangay;
    el.classList.toggle('is-active', active);
    el.setAttribute('aria-pressed', String(active));
  });
  syncQuickStartLink();

  const error = document.getElementById('qsBarangayError');
  if (error) error.hidden = true;
  document.getElementById('heroBarangaySelector')?.classList.remove('has-error');
}

function handleQuickStartLaunch(event) {
  if (quickStartBarangay) return;

  event.preventDefault();
  const error = document.getElementById('qsBarangayError');
  if (error) error.hidden = false;

  const field = document.getElementById('heroBarangaySelector');
  if (field) {
    field.classList.remove('has-error');
    // Re-trigger the shake animation even if it's already showing an error.
    void field.offsetWidth;
    field.classList.add('has-error');
  }
}

// ---- nav's "Map" badge: a read-only coverage-area preview ----
// Opens a modal with a real Leaflet map outlining both supported barangays,
// fetched from the same /barangay-boundary endpoint the simulator uses.
// This is a viewer only -- it never touches simulate/ACO endpoints, so it
// works identically from the homepage or the About page and needs no
// barangay to already be picked.
// Both barangays use the same color -- this map is coverage-viewing only,
// not a route/hazard display, so there's nothing for distinct colors to
// distinguish.
const SCOPE_BARANGAYS = [
  { name: 'Pinagbuhatan', color: '#2563eb' },
  { name: 'Sta. Lucia', color: '#2563eb' },
];
const LEAFLET_CSS_URL = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
const LEAFLET_JS_URL = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';

let scopeMapInstance = null;
let scopeLeafletPromise = null;
let scopeBoundariesPromise = null;

function loadScopeLeaflet() {
  if (window.L) return Promise.resolve();
  if (scopeLeafletPromise) return scopeLeafletPromise;

  scopeLeafletPromise = new Promise((resolve, reject) => {
    if (!document.querySelector(`link[href="${LEAFLET_CSS_URL}"]`)) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = LEAFLET_CSS_URL;
      link.integrity = 'sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=';
      link.crossOrigin = '';
      document.head.appendChild(link);
    }

    const script = document.createElement('script');
    script.src = LEAFLET_JS_URL;
    script.integrity = 'sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=';
    script.crossOrigin = '';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Could not load the map library.'));
    document.body.appendChild(script);
  });

  return scopeLeafletPromise;
}

function initScopeMap() {
  if (scopeMapInstance) return scopeMapInstance;

  scopeMapInstance = L.map('scopeMapEl', { attributionControl: false });
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors',
  }).addTo(scopeMapInstance);
  L.control.attribution({ prefix: false }).addTo(scopeMapInstance);
  scopeMapInstance.setView([14.5590, 121.0955], 14);
  return scopeMapInstance;
}

async function loadScopeBoundaries() {
  if (scopeBoundariesPromise) return scopeBoundariesPromise;

  scopeBoundariesPromise = (async () => {
    const allLatLngs = [];

    for (const { name, color } of SCOPE_BARANGAYS) {
      const res = await fetch(`${window.BACKEND_BASE}/barangay-boundary/${encodeURIComponent(name)}`);
      const data = await res.json();
      if (!res.ok || data.error) continue;

      const paths = Array.isArray(data.boundary?.paths) ? data.boundary.paths : [];
      paths.forEach((path) => {
        const latlngs = (path || [])
          .filter((p) => p && p.lat != null && p.lng != null)
          .map((p) => [p.lat, p.lng]);
        if (latlngs.length < 3) return;

        L.polygon(latlngs, { color, weight: 2, fillColor: color, fillOpacity: 0.16 })
          .addTo(scopeMapInstance)
          .bindTooltip(name, { direction: 'center', className: 'scope-map-tooltip' });
        allLatLngs.push(...latlngs);
      });
    }

    if (allLatLngs.length) {
      scopeMapInstance.fitBounds(allLatLngs, { padding: [24, 24] });
    }
  })();

  return scopeBoundariesPromise;
}

async function openScopeMap() {
  const modal = document.getElementById('scopeModal');
  if (!modal) return;

  modal.hidden = false;
  document.body.classList.add('scope-modal-open');
  setScopeMapError(null);

  try {
    await loadScopeLeaflet();
    initScopeMap();
    await loadScopeBoundaries();
    setTimeout(() => scopeMapInstance?.invalidateSize(), 60);
  } catch (err) {
    setScopeMapError(err.message || 'Could not load the coverage map.');
  }
}

function closeScopeMap() {
  const modal = document.getElementById('scopeModal');
  if (modal) modal.hidden = true;
  document.body.classList.remove('scope-modal-open');
}

function setScopeMapError(message) {
  const el = document.getElementById('scopeMapError');
  if (!el) return;
  el.hidden = !message;
  el.textContent = message || '';
}

// ---- hero's "How to use" step-by-step tutorial ----
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

// The modal markup lives in site_base.html, so it's present on every page
// that shares this nav (Home, About) -- always open it in place instead of
// navigating anywhere.
function handleNavHowToUse(event) {
  event.preventDefault();
  openTutorial();
  return false;
}

function closeTutorial() {
  const modal = document.getElementById('tutorialModal');
  if (modal) modal.hidden = true;
  document.body.classList.remove('tutorial-modal-open');
}

// ---- ant colony ambient hero background ----
// Ants no longer wander freely -- they walk a small procedural "road
// network" (nodes + edges regenerated per canvas size) and only travel
// along its edges, closer to the ACO graph-walk the rest of the app is
// simulating. Pheromone trail is fixed to the brand's electric cyan
// (#00e5ff) with a glow, independent of the road/ant theme colors.
const PHEROMONE_COLOR = '#00e5ff';

function initAntCanvas() {
  const canvas = document.getElementById('antCanvas');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let width, height, network = { nodes: [], edges: [] }, ants = [], trail = [];
  let cachedAccent = '#1d4ed8';
  let cachedRoad = '#94a3b8';
  let resizeTimer = null;

  // Road lines/nodes never move once generated, so they're painted once
  // onto an offscreen layer and blitted with drawImage() every frame
  // instead of re-stroking ~80 line segments per frame -- that redundant
  // redraw (plus a per-frame getComputedStyle() call and a shadowBlur glow
  // on every trail dot) was the actual cause of the scroll jank, not the
  // page itself.
  const networkLayer = document.createElement('canvas');
  const networkCtx = networkLayer.getContext('2d');

  function refreshColors() {
    cachedAccent = getComputedStyle(document.body).getPropertyValue('--accent').trim() || '#1d4ed8';
    cachedRoad = getComputedStyle(document.body).getPropertyValue('--border2').trim() || '#94a3b8';
  }
  refreshAntCanvasColors = refreshColors;

  function resize() {
    width = canvas.parentElement.clientWidth;
    height = canvas.parentElement.clientHeight;
    canvas.width = width * devicePixelRatio;
    canvas.height = height * devicePixelRatio;
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';
    ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);

    networkLayer.width = canvas.width;
    networkLayer.height = canvas.height;
    networkCtx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
  }

  // A jittered grid reads as an organic little street layout at a glance
  // without needing real GIS data for a purely decorative background.
  function buildRoadNetwork() {
    const spacing = 96;
    const cols = Math.max(2, Math.ceil(width / spacing) + 1);
    const rows = Math.max(2, Math.ceil(height / spacing) + 1);
    const jitter = spacing * 0.28;
    const nodes = [];

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        nodes.push({
          x: c * spacing + (Math.random() - 0.5) * jitter,
          y: r * spacing + (Math.random() - 0.5) * jitter,
          edges: [],
        });
      }
    }

    const idx = (r, c) => r * cols + c;
    const edges = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (c < cols - 1 && Math.random() > 0.22) edges.push({ a: idx(r, c), b: idx(r, c + 1) });
        if (r < rows - 1 && Math.random() > 0.22) edges.push({ a: idx(r, c), b: idx(r + 1, c) });
      }
    }
    edges.forEach(({ a, b }) => {
      nodes[a].edges.push(b);
      nodes[b].edges.push(a);
    });

    return { nodes, edges };
  }

  function makeAnt() {
    const travelable = network.nodes.filter((n) => n.edges.length > 0);
    if (!travelable.length) return null;

    const from = travelable[Math.floor(Math.random() * travelable.length)];
    const fromIdx = network.nodes.indexOf(from);
    const toIdx = from.edges[Math.floor(Math.random() * from.edges.length)];

    return {
      fromIdx,
      toIdx,
      t: Math.random(),
      speed: 0.006 + Math.random() * 0.007,
    };
  }

  function advanceAnt(ant) {
    ant.t += ant.speed;
    if (ant.t < 1) return;

    const arrived = network.nodes[ant.toIdx];
    const options = arrived.edges.filter((n) => n !== ant.fromIdx);
    const choices = options.length ? options : arrived.edges;
    const nextIdx = choices[Math.floor(Math.random() * choices.length)];

    ant.fromIdx = ant.toIdx;
    ant.toIdx = nextIdx;
    ant.t = 0;
  }

  function antPose(ant) {
    const from = network.nodes[ant.fromIdx];
    const to = network.nodes[ant.toIdx];
    return {
      x: from.x + (to.x - from.x) * ant.t,
      y: from.y + (to.y - from.y) * ant.t,
      angle: Math.atan2(to.y - from.y, to.x - from.x),
    };
  }

  function paintNetworkLayer() {
    networkCtx.clearRect(0, 0, width, height);

    networkCtx.globalAlpha = 0.5;
    networkCtx.strokeStyle = cachedRoad;
    networkCtx.lineWidth = 1;
    network.edges.forEach(({ a, b }) => {
      const A = network.nodes[a];
      const B = network.nodes[b];
      networkCtx.beginPath();
      networkCtx.moveTo(A.x, A.y);
      networkCtx.lineTo(B.x, B.y);
      networkCtx.stroke();
    });

    networkCtx.globalAlpha = 0.65;
    networkCtx.fillStyle = cachedRoad;
    network.nodes.forEach((n) => {
      if (!n.edges.length) return;
      networkCtx.beginPath();
      networkCtx.arc(n.x, n.y, 1.6, 0, Math.PI * 2);
      networkCtx.fill();
    });
  }

  function rebuildScene() {
    network = buildRoadNetwork();
    paintNetworkLayer();
    ants = [];
    for (let i = 0; i < 14; i++) {
      const ant = makeAnt();
      if (ant) ants.push(ant);
    }
    trail = [];
  }

  function init() {
    resize();
    refreshColors();
    rebuildScene();
  }

  function drawTrail() {
    for (let i = trail.length - 1; i >= 0; i--) {
      trail[i].life -= 1;
      if (trail[i].life <= 0) trail.splice(i, 1);
    }

    // Two flat, differently-sized fills (soft wide + solid core) fake a
    // glow far more cheaply per-shape than ctx.shadowBlur, which forces an
    // extra blur pass for every single dot and was the main scroll-jank
    // culprit at this trail density.
    ctx.fillStyle = PHEROMONE_COLOR;
    trail.forEach((p) => {
      const ratio = Math.max(0, p.life / 70);
      ctx.globalAlpha = ratio * 0.22;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = ratio * 0.85;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 1.3, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  function drawAnts() {
    ctx.fillStyle = cachedAccent;
    ants.forEach((ant) => {
      advanceAnt(ant);
      const pose = antPose(ant);
      if (Math.random() < 0.45) trail.push({ x: pose.x, y: pose.y, life: 70 });

      ctx.save();
      ctx.translate(pose.x, pose.y);
      ctx.rotate(pose.angle);
      ctx.globalAlpha = 0.85;
      ctx.beginPath();
      ctx.ellipse(0, 0, 3.4, 1.7, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(-4.2, 0, 2, 1.2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });
  }

  // The loop below used to run forever regardless of scroll position --
  // once the hero (and this canvas) scrolls out of view, the rAF callback
  // still fires and still does a full clear+drawImage+14-ant redraw every
  // frame, competing with the browser's own scroll compositing for main-
  // thread time on every section below the hero. `visible` gates
  // rescheduling so the loop actually stops while the canvas is offscreen
  // or the tab is backgrounded, and a single requestAnimationFrame from
  // the observer/visibility callback restarts it -- there's never more
  // than one loop alive at a time since step() only reschedules itself
  // while still visible.
  let visible = true;

  function step() {
    ctx.clearRect(0, 0, width, height);
    ctx.globalAlpha = 1;
    ctx.drawImage(networkLayer, 0, 0, width, height);
    drawTrail();
    ctx.globalAlpha = 1;
    drawAnts();

    if (!reduced && visible) requestAnimationFrame(step);
  }

  if ('IntersectionObserver' in window) {
    const inViewport = { current: true };
    const observer = new IntersectionObserver((entries) => {
      inViewport.current = entries[entries.length - 1].isIntersecting;
      const wasVisible = visible;
      visible = inViewport.current && !document.hidden;
      if (visible && !wasVisible && !reduced) requestAnimationFrame(step);
    }, { threshold: 0 });
    observer.observe(canvas);

    document.addEventListener('visibilitychange', () => {
      const wasVisible = visible;
      visible = inViewport.current && !document.hidden;
      if (visible && !wasVisible && !reduced) requestAnimationFrame(step);
    });
  }

  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => {
      const nextWidth = canvas.parentElement.clientWidth;
      const nextHeight = canvas.parentElement.clientHeight;
      // Mobile browsers fire 'resize' when the URL bar collapses/expands
      // on scroll; a small height-only change isn't worth rebuilding the
      // whole road graph for, and doing so on every such event is exactly
      // what made scrolling feel laggy.
      if (Math.abs(nextWidth - width) < 40 && Math.abs(nextHeight - height) < 80) return;
      resize();
      rebuildScene();
    }, 150);
  });

  init();
  if (reduced) {
    step();
  } else {
    requestAnimationFrame(step);
  }
}

window.initHomeTheme = initHomeTheme;
window.setHomeTheme = setHomeTheme;
window.toggleFab = toggleFab;
window.sendFeedback = sendFeedback;
window.submitContactForm = submitContactForm;
window.setQuickStartBarangay = setQuickStartBarangay;
window.handleQuickStartLaunch = handleQuickStartLaunch;
window.openScopeMap = openScopeMap;
window.closeScopeMap = closeScopeMap;
window.openTutorial = openTutorial;
window.handleNavHowToUse = handleNavHowToUse;
window.closeTutorial = closeTutorial;
window.tutorialNext = tutorialNext;
window.tutorialPrev = tutorialPrev;
window.goToTutorialStep = goToTutorialStep;
