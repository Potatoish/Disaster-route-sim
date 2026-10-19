// Homepage / About page behavior: theme toggle, ant colony hero
// background, and the feedback widget. Loaded on every page that extends
// site_base.html.

// Flask serves the pages and the API together, so the API is on the page's
// own origin.
window.BACKEND_BASE = window.BACKEND_BASE || window.location.origin;

const HOME_THEME_STORAGE_KEY = 'disaster-route-sim-theme';
// The phone browser's toolbar color per theme (--page-top in home.css).
const HOME_THEME_COLORS = { light: '#f7f9fc', dark: '#000f22' };
const darkSchemeQuery = window.matchMedia?.('(prefers-color-scheme: dark)');

// Only a theme the visitor picked with the switch is stored.
function getSavedHomeTheme() {
  try {
    const saved = localStorage.getItem(HOME_THEME_STORAGE_KEY);
    return saved === 'dark' || saved === 'light' ? saved : null;
  } catch (err) {
    return null;
  }
}

// The visitor's pick, else their device's setting (as the inline script in
// site_base.html decided before the first paint).
function getPreferredHomeTheme() {
  return getSavedHomeTheme() || (darkSchemeQuery?.matches ? 'dark' : 'light');
}

// Set by initAntCanvas() so a theme flip can refresh its cached colors
// without going back to getComputedStyle() on every animation frame.
let refreshAntCanvasColors = null;
let homeThemeTransition = null;

function applyHomeTheme(theme) {
  document.body.classList.toggle('dark', theme === 'dark');
  document.documentElement.style.colorScheme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', HOME_THEME_COLORS[theme]);
  document.querySelectorAll('.theme-switch-btn').forEach((btn) => {
    const active = btn.dataset.theme === theme;
    btn.classList.toggle('is-active', active);
    btn.setAttribute('aria-pressed', String(active));
  });
  if (refreshAntCanvasColors) refreshAntCanvasColors();
}

function initHomeTheme() {
  applyHomeTheme(getPreferredHomeTheme());
  initAntCanvas();
  syncQuickStartLink();
}

// Until the visitor picks a theme, the page follows the device's setting as
// it changes (an automatic sunset switch, say).
darkSchemeQuery?.addEventListener?.('change', () => {
  if (!getSavedHomeTheme()) switchHomeTheme(getPreferredHomeTheme());
});

// The theme switch: the visitor's pick, kept for every page.
function setHomeTheme(theme) {
  try {
    localStorage.setItem(HOME_THEME_STORAGE_KEY, theme);
  } catch (err) {
    // Storage blocked: the theme still applies for this page view.
  }
  switchHomeTheme(theme);
}

// The page cross-fades into the other theme instead of flipping (where the
// browser has view transitions); the switch itself stays live, so its thumb
// slides across without a ghost of the old one fading out.
function switchHomeTheme(theme) {
  const unchanged = document.body.classList.contains('dark') === (theme === 'dark');
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  homeThemeTransition?.skipTransition();
  if (unchanged || reduced || window.agnasUI?.constrained
      || window.matchMedia('(pointer: coarse)').matches || typeof document.startViewTransition !== 'function') {
    applyHomeTheme(theme);
    return;
  }
  const root = document.documentElement;
  root.classList.add('theme-transition');
  try {
    const transition = document.startViewTransition(() => applyHomeTheme(theme));
    homeThemeTransition = transition;
    transition.finished.catch(() => {}).finally(() => {
      if (homeThemeTransition === transition) {
        homeThemeTransition = null;
        root.classList.remove('theme-transition');
      }
    });
  } catch (err) {
    root.classList.remove('theme-transition');
    applyHomeTheme(theme);
  }
}

// Home and About share the compact right-side menu on phones. The links
// move back into the header when the viewport reaches desktop width.
(function initMobileNavigation() {
  const nav = document.querySelector('.site-nav');
  const toggle = document.getElementById('siteNavToggle');
  const links = document.getElementById('siteNavLinks');
  if (!nav || !toggle || !links) return;
  const mobile = window.matchMedia('(max-width: 767px)');
  const drawer = document.getElementById('dashboardNavDrawer');
  const drawerLinks = document.getElementById('dashboardNavDrawerLinks');
  const actions = nav.querySelector('.nav-actions');
  const usesDrawer = () => Boolean(drawer && mobile.matches);
  function setOpen(open) {
    open = open && mobile.matches;
    toggle.setAttribute('aria-expanded', String(open));
    nav.classList.toggle('is-menu-open', open && !usesDrawer());
    if (!drawer) return;
    if (open && usesDrawer()) {
      if (!drawer.open) drawer.show();
    } else {
      drawer.close();
    }
  }
  function placeLinks() {
    setOpen(false);
    if (!drawer) return;
    if (usesDrawer()) {
      drawerLinks.appendChild(links);
      toggle.setAttribute('aria-haspopup', 'dialog');
    } else {
      actions.before(links);
      toggle.removeAttribute('aria-haspopup');
    }
  }
  toggle.addEventListener('click', (event) => {
    const open = toggle.getAttribute('aria-expanded') !== 'true';
    setOpen(open);
    if (open && event.detail === 0 && !usesDrawer()) links.querySelector('a')?.focus();
  });
  links.addEventListener('click', (event) => {
    if (event.target.closest('.nav-btn')) setOpen(false);
  }, true);
  document.addEventListener('click', (event) => {
    const menu = usesDrawer() ? drawer : links;
    if (!menu.contains(event.target) && !toggle.contains(event.target)) setOpen(false);
  });
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || toggle.getAttribute('aria-expanded') !== 'true') return;
    event.preventDefault();
    setOpen(false);
    toggle.focus();
  });
  drawer?.addEventListener('close', () => {
    toggle.setAttribute('aria-expanded', 'false');
  });
  mobile.addEventListener('change', placeLinks);
  document.addEventListener('tutorial:open', () => setOpen(false));
  placeLinks();
})();

// ---- feedback widget and contact form ----
// Both POST to the backend (contact_service.py): feedback becomes a row in
// the team's Google Sheet, a contact message an email to the team inbox. The
// visitor only sees "sent" once the backend confirms it; on any failure what
// they typed stays put so they can try again.
let fabOpen = false;
let toastTimer = null;

// Opening moves focus to the first rating, closing hands it back to the
// button, so keyboard users never land on a control that has vanished.
function toggleFab(open = !fabOpen) {
  const panel = document.getElementById('fabPanel');
  const button = document.getElementById('fabBtn');
  if (!panel) return;
  fabOpen = open;
  panel.hidden = !fabOpen;
  panel.classList.toggle('open', fabOpen);
  button?.setAttribute('aria-expanded', String(fabOpen));
  if (fabOpen) {
    window.modalFocus?.enter(panel, panel.querySelector('button[data-v]'));
  } else {
    window.modalFocus?.restore(panel);
  }
}

function showHomeToast(message, duration = 2200) {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), duration);
}

function setSending(button, sending) {
  if (!button) return;
  if (sending) button.dataset.label = button.textContent;
  button.disabled = sending;
  button.setAttribute('aria-busy', String(sending));
  button.textContent = sending ? 'Sending…' : button.dataset.label;
}

// Spam check: the backend takes a form only with the token this page was
// served with, and quietly drops one sent within seconds of that (bots fill
// forms instantly), so a very quick send waits out the gap first. A server
// restart or a page left open for a day voids the token ("form_expired"):
// then a fresh one is fetched and the send retried once.
const FORM_MIN_WAIT_MS = 3500;
let formToken = document.querySelector('meta[name="form-token"]')?.content || '';
let formTokenAt = Date.now();

async function refreshFormToken() {
  const res = await fetch(`${window.BACKEND_BASE}/form-token`, { cache: 'no-store' });
  const data = await res.json();
  if (!res.ok || !data.token) throw new Error('No form token');
  formToken = data.token;
  formTokenAt = Date.now();
}

async function postHomeForm(path, body) {
  try {
    for (let attempt = 0; ; attempt += 1) {
      const wait = formTokenAt + FORM_MIN_WAIT_MS - Date.now();
      if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 20000);
      let res, data;
      try {
        res = await fetch(`${window.BACKEND_BASE}${path}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...body, form_token: formToken }),
          signal: controller.signal,
        });
        data = await res.json().catch(() => ({}));
      } finally {
        clearTimeout(timeout);
      }
      if (res.ok && data.error === false) return { ok: true, message: data.message };
      if (data.code === 'form_expired' && attempt === 0) {
        await refreshFormToken();
        continue;
      }
      return { ok: false, message: data.message || 'Something went wrong. Please try again.' };
    }
  } catch (err) {
    return { ok: false, message: "Couldn't reach the server. Check your connection and try again." };
  }
}

async function sendFeedback() {
  const msg = document.getElementById('fabMsg');
  const role = document.getElementById('fabRole');
  const button = document.getElementById('fabSend');
  if (!button || button.disabled) return;
  const error = document.getElementById('fabError');
  error.hidden = true;
  const rated = rateRow ? rateRow.querySelector('button[aria-pressed="true"]') : null;
  const comment = msg ? msg.value.trim() : '';
  const submittedRole = role?.value || '';
  if (!rated && !comment) {
    error.textContent = 'Pick a rating or write a comment first.';
    error.hidden = false;
    rateRow?.querySelector('button')?.focus();
    return;
  }

  setSending(button, true);
  const result = await postHomeForm('/feedback', {
    rating: rated ? Number(rated.dataset.v) : null,
    role: submittedRole,
    comment,
    page: window.location.pathname,
    website: document.getElementById('fabWebsite')?.value || '',
  });
  setSending(button, false);
  if (!result.ok) {
    error.textContent = result.message;
    error.hidden = false;
    return;
  }

  if (fabOpen) toggleFab(false);
  showHomeToast(result.message || 'Thanks for the feedback!');
  if (msg?.value.trim() === comment) msg.value = '';
  if (role?.value === submittedRole) role.value = '';
  if (rateRow?.querySelector('button[aria-pressed="true"]') === rated) setRating(null);
}

const rateRow = document.getElementById('rateRow');

// One rating at most; picking the chosen one again clears it.
function setRating(btn) {
  rateRow?.querySelectorAll('button[data-v]').forEach((child) => {
    child.setAttribute('aria-pressed', String(child === btn));
  });
}

rateRow?.addEventListener('click', (event) => {
  const btn = event.target.closest('button[data-v]');
  if (btn) setRating(btn.getAttribute('aria-pressed') === 'true' ? null : btn);
});

// The contact form's message line (About page): stays until the next send,
// unlike a toast, and is read out as it appears (role="alert").
function setContactError(message) {
  const el = document.getElementById('contactError');
  if (!el) return;
  el.textContent = message || '';
  el.hidden = !message;
}

async function submitContactForm(event) {
  event?.preventDefault();
  const name = document.getElementById('cName');
  const email = document.getElementById('cEmail');
  const msg = document.getElementById('cMsg');
  const button = document.getElementById('cSend');
  if (!name || !email || !msg || button?.disabled) return;
  const status = document.getElementById('contactStatus');
  if (status) status.hidden = true;

  const fields = [name, email, msg];
  fields.forEach((field) => field.removeAttribute('aria-invalid'));
  const empty = fields.filter((field) => !field.value.trim());
  const invalid = empty.length ? empty : (email.checkValidity() ? [] : [email]);
  if (invalid.length) {
    invalid.forEach((field) => {
      field.setAttribute('aria-invalid', 'true');
      field.setAttribute('aria-describedby', 'contactError');
    });
    setContactError(empty.length
      ? 'Please fill in your name, email, and message.'
      : 'Please enter a valid email address.');
    invalid[0].focus();
    return;
  }

  setContactError(null);
  setSending(button, true);
  const submitted = {
    name: name.value.trim(),
    email: email.value.trim(),
    message: msg.value.trim(),
    website: document.getElementById('cWebsite')?.value || '',
  };
  const result = await postHomeForm('/contact', submitted);
  setSending(button, false);
  if (!result.ok) {
    setContactError(result.message);
    return;
  }

  // A slow response must not erase edits made after the request began.
  if (name.value.trim() === submitted.name) name.value = '';
  if (email.value.trim() === submitted.email) email.value = '';
  if (msg.value.trim() === submitted.message) msg.value = '';
  if (status) {
    status.textContent = result.message || "Message sent. We'll reply by email.";
    status.hidden = false;
  }
}

// A field marked invalid is cleared as soon as the visitor fixes it.
document.getElementById('contactForm')?.addEventListener('input', (event) => {
  const field = event.target;
  if (field.getAttribute('aria-invalid') !== 'true' || !field.value.trim()) return;
  if (field.type === 'email' && !field.checkValidity()) return;
  field.removeAttribute('aria-invalid');
  field.removeAttribute('aria-describedby');
  if (!document.querySelector('#contactForm [aria-invalid="true"]')) setContactError(null);
});

// ---- hero quick-start card ----
// The barangay pick goes into the "Open simulator" link as ?barangay=...;
// until one is picked the link stays inert and clicking it shows
// qsBarangayError.
let quickStartBarangay = null;

function syncQuickStartLink() {
  const link = document.getElementById('quickStartLaunch');
  if (!link) return;

  // The helper line under the button names the pick once there is one.
  const note = document.getElementById('quickStartNote');
  if (note) {
    note.dataset.defaultText ??= note.textContent;
    note.textContent = quickStartBarangay ? `Opens with ${quickStartBarangay} selected.` : note.dataset.defaultText;
  }

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
// A modal with a Leaflet map outlining both supported barangays, from the
// same /barangay-boundary endpoint the simulator uses. Both share one color:
// it only shows coverage, not routes or hazards.
const SCOPE_BARANGAYS = [
  { name: 'Pinagbuhatan', color: '#2563eb' },
  { name: 'Sta. Lucia', color: '#2563eb' },
];
// Leaflet 1.9.4, served by this app (static/vendor/leaflet), not a CDN.
const LEAFLET_CSS_URL = '/static/vendor/leaflet/leaflet.css';
const LEAFLET_JS_URL = '/static/vendor/leaflet/leaflet.js';

let scopeMapInstance = null;
let scopeLeafletPromise = null;
let scopeBoundariesPromise = null;
let scopeBoundaryLayer = null;

function loadScopeLeaflet() {
  if (window.L) return Promise.resolve();
  if (scopeLeafletPromise) return scopeLeafletPromise;

  scopeLeafletPromise = new Promise((resolve, reject) => {
    if (!document.querySelector(`link[href="${LEAFLET_CSS_URL}"]`)) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = LEAFLET_CSS_URL;
      document.head.appendChild(link);
    }

    const script = document.createElement('script');
    script.src = LEAFLET_JS_URL;
    script.onload = () => resolve();
    script.onerror = () => { script.remove(); reject(new Error('Could not load the map library.')); };
    document.body.appendChild(script);
  }).catch(error => { scopeLeafletPromise = null; throw error; });

  return scopeLeafletPromise;
}

// Same "reduce motion" rule as the simulator's map (prefersReducedMotion in
// osm.js, which this page doesn't load).
function scopeMapMayAnimate() {
  return !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

function initScopeMap() {
  if (scopeMapInstance) return scopeMapInstance;

  scopeMapInstance = L.map('scopeMapEl', {
    attributionControl: false,
    zoomAnimation: scopeMapMayAnimate(),
    fadeAnimation: scopeMapMayAnimate(),
    markerZoomAnimation: scopeMapMayAnimate(),
  });
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
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
    const outlines = L.featureGroup();

    for (const { name, color } of SCOPE_BARANGAYS) {
      const res = await fetch(`${window.BACKEND_BASE}/barangay-boundary/${encodeURIComponent(name)}`);
      const data = await res.json().catch(() => ({ error: true }));
      if (!res.ok || data.error) throw new Error('Coverage boundaries could not load. Please try again.');

      const paths = Array.isArray(data.boundary?.paths) ? data.boundary.paths : [];
      if (!paths.length) throw new Error('Coverage boundaries are unavailable. Please try again.');
      paths.forEach((path) => {
        const latlngs = (path || [])
          .filter((p) => p && p.lat != null && p.lng != null)
          .map((p) => [p.lat, p.lng]);
        if (latlngs.length < 3) return;

        L.polygon(latlngs, { color, weight: 2, fillColor: color, fillOpacity: 0.16 })
          .addTo(outlines)
          .bindTooltip(name, { direction: 'center', className: 'scope-map-tooltip' });
        allLatLngs.push(...latlngs);
      });
    }

    if (allLatLngs.length) {
      scopeBoundaryLayer?.remove();
      scopeBoundaryLayer = outlines.addTo(scopeMapInstance);
      scopeMapInstance.fitBounds(allLatLngs, { padding: [24, 24], animate: scopeMapMayAnimate() });
    } else {
      throw new Error('Coverage boundaries are unavailable. Please try again.');
    }
  })().catch(error => { scopeBoundariesPromise = null; throw error; });

  return scopeBoundariesPromise;
}

async function openScopeMap() {
  const modal = document.getElementById('scopeModal');
  if (!modal) return;

  modal.hidden = false;
  document.body.classList.add('scope-modal-open');
  window.modalFocus?.enter(modal, document.getElementById('scopeModalClose'));
  setScopeMapError(null);
  const status = document.getElementById('scopeMapStatus');
  if (status) status.hidden = false;

  try {
    await loadScopeLeaflet();
    if (modal.hidden) return;
    initScopeMap();
    await loadScopeBoundaries();
    setTimeout(() => scopeMapInstance?.invalidateSize(), 60);
  } catch (err) {
    setScopeMapError(err.message || 'Could not load the coverage map.');
  } finally {
    if (status) status.hidden = true;
  }
}

function closeScopeMap() {
  const modal = document.getElementById('scopeModal');
  if (!modal || modal.hidden) return;
  modal.hidden = true;
  document.body.classList.remove('scope-modal-open');
  window.modalFocus?.restore(modal);
}

function setScopeMapError(message) {
  const el = document.getElementById('scopeMapError');
  if (!el) return;
  el.hidden = !message;
  el.textContent = message || '';
  const retry = document.getElementById('scopeMapRetry');
  if (retry) retry.hidden = !message;
}

// ---- feedback button vs. footer ----
// --fab-lift is how much of the footer is on screen. home.css raises the
// feedback button by that much, so the footer can stay compact and the
// button still never lands on its links.
(function trackFooterForFab() {
  const footer = document.querySelector('.site-footer');
  if (!footer) return;

  let frame = null;
  const update = () => {
    frame = null;
    const visible = Math.max(0, window.innerHeight - footer.getBoundingClientRect().top);
    document.body.style.setProperty('--fab-lift', `${Math.round(visible)}px`);
  };
  const schedule = () => {
    if (!frame) frame = window.requestAnimationFrame(update);
  };
  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', schedule);
  update();
})();

// ---- "Emergency hotlines" (Plan ahead card, homepage only) ----
let hotlinesReturnFocus = null;

function openHotlines(event) {
  const modal = document.getElementById('hotlineModal');
  if (!modal) return;
  hotlinesReturnFocus = event?.currentTarget || document.activeElement;
  modal.hidden = false;
  document.body.classList.add('scope-modal-open');
  document.getElementById('hotlineModalClose')?.focus({ preventScroll: true });
}

function closeHotlines() {
  const modal = document.getElementById('hotlineModal');
  if (!modal || modal.hidden) return;
  modal.hidden = true;
  document.body.classList.remove('scope-modal-open');
  hotlinesReturnFocus?.focus?.({ preventScroll: true });
  hotlinesReturnFocus = null;
}

document.addEventListener('keydown', (event) => {
  if (event.defaultPrevented || event.key !== 'Escape') return;
  if (document.getElementById('hotlineModal')?.hidden === false) {
    event.preventDefault();
    closeHotlines();
  } else if (document.getElementById('scopeModal')?.hidden === false) {
    event.preventDefault();
    closeScopeMap();
  } else if (fabOpen) {
    event.preventDefault();
    toggleFab(false);
  }
});

// ---- ant colony ambient hero background ----
// Ants walk a faint road network, like the ACO graph walk the app simulates.
// Cache their walking poses and deposit pheromone dots onto one fading
// canvas, keeping the trail cost independent of how long the page runs.

function initAntCanvas() {
  const canvas = document.getElementById('antCanvas');
  if (!canvas || canvas.dataset.initialized) return;
  canvas.dataset.initialized = 'true';

  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  let reduced = motionQuery.matches;
  let animationFrame = 0;
  let lastPaint = 0;
  let lastUpdate = 0;
  const frameInterval = 1000 / (window.agnasUI?.constrained ? 24 : 30);
  const motionScale = window.agnasUI?.constrained ? 0.75 : 1;
  let width, height, ratio, network = { nodes: [], edges: [] }, ants = [];
  let antSprites = [];
  let pheromoneSprite;
  let cachedAccent = '#1d4ed8';
  let cachedRoad = '#94a3b8';
  let cachedPheromone = '#0891b2';
  let resizeTimer = null;

  // Road lines and nodes never move once generated, so they are painted once
  // onto an offscreen layer and blitted with drawImage() every frame instead
  // of re-stroking ~80 segments per frame.
  const networkLayer = document.createElement('canvas');
  const networkCtx = networkLayer.getContext('2d');
  const pheromoneLayer = document.createElement('canvas');
  const pheromoneCtx = pheromoneLayer.getContext('2d');

  function refreshColors() {
    cachedAccent = getComputedStyle(document.body).getPropertyValue('--accent').trim() || '#1d4ed8';
    cachedRoad = getComputedStyle(document.body).getPropertyValue('--border2').trim() || '#94a3b8';
    cachedPheromone = document.body.classList.contains('dark') ? '#22d3ee' : '#0891b2';
  }
  refreshAntCanvasColors = () => {
    refreshColors();
    buildAntSprites();
    buildPheromoneSprite();
    paintNetworkLayer();
    resetPheromones();
    paint();
  };

  function buildPheromoneSprite() {
    pheromoneSprite = document.createElement('canvas');
    pheromoneSprite.width = Math.round(10 * ratio);
    pheromoneSprite.height = Math.round(10 * ratio);
    const pen = pheromoneSprite.getContext('2d');
    pen.scale(ratio, ratio);
    pen.fillStyle = cachedPheromone;
    // Flat halo and a crisp center: no blur pass per particle.
    for (const [radius, opacity] of [[3.4, 0.16], [1.3, 0.95]]) {
      pen.globalAlpha = opacity;
      pen.beginPath();
      pen.arc(5, 5, radius, 0, Math.PI * 2);
      pen.fill();
    }
  }

  function stampPheromone(x, y, opacity = 1) {
    pheromoneCtx.globalAlpha = opacity;
    pheromoneCtx.drawImage(pheromoneSprite, x - 5, y - 5, 10, 10);
  }

  function resetPheromones() {
    pheromoneCtx.clearRect(0, 0, width, height);
    ants.forEach(ant => {
      const from = network.nodes[ant.fromIdx];
      const to = network.nodes[ant.toIdx];
      const length = Math.hypot(to.x - from.x, to.y - from.y);
      // A short trail is already visible on arrival, then fresh deposits
      // follow the walking ant and old ones steadily evaporate.
      for (let i = 1; i <= 24; i++) {
        const t = ant.t - i * 3 / length;
        if (t < 0) break;
        stampPheromone(from.x + (to.x - from.x) * t, from.y + (to.y - from.y) * t, 1 - i / 25);
      }
    });
  }

  function drawPheromones(frameStep) {
    if (frameStep > 0) {
      pheromoneCtx.globalCompositeOperation = 'destination-out';
      pheromoneCtx.globalAlpha = 1 - Math.exp(-frameStep / 1.6);
      pheromoneCtx.fillRect(0, 0, width, height);
      pheromoneCtx.globalCompositeOperation = 'source-over';
    }
    ctx.drawImage(pheromoneLayer, 0, 0, width, height);
  }

  function buildAntSprites() {
    antSprites = Array.from({ length: 4 }, (_, frame) => {
      const sprite = document.createElement('canvas');
      sprite.width = Math.round(24 * ratio);
      sprite.height = Math.round(20 * ratio);
      const pen = sprite.getContext('2d');
      pen.scale(ratio, ratio);
      pen.translate(12, 10);
      pen.fillStyle = cachedAccent;
      pen.strokeStyle = cachedAccent;
      pen.lineWidth = 0.9;
      pen.lineCap = 'round';
      pen.lineJoin = 'round';

      // Three jointed legs on each side, alternating as the ant walks.
      pen.beginPath();
      for (let leg = 0; leg < 3; leg++) {
        const x = 1.5 - leg * 1.7;
        for (const side of [-1, 1]) {
          const stride = Math.sin(frame * Math.PI / 2 + leg * Math.PI + (side > 0 ? Math.PI : 0)) * 1.1;
          pen.moveTo(x, side * 0.8);
          pen.lineTo(x + (1 - leg) * 1.8 + stride, side * 3.5);
          pen.lineTo(x + (1 - leg) * 2.6 + stride, side * 5.5);
        }
      }
      // Bent antennae extend from the head in the direction of travel.
      for (const side of [-1, 1]) {
        pen.moveTo(5, side);
        pen.lineTo(7, side * 2.2);
        pen.lineTo(8.4, side * 3.5);
      }
      pen.stroke();

      // Abdomen, narrow thorax, and head give a recognizable ant silhouette.
      for (const [x, rx, ry] of [[-4.5, 3.5, 2.5], [0, 2.2, 1.5], [3.8, 2, 1.9]]) {
        pen.beginPath();
        pen.ellipse(x, 0, rx, ry, 0, 0, Math.PI * 2);
        pen.fill();
      }
      return sprite;
    });
  }

  function resize() {
    width = canvas.parentElement.clientWidth;
    height = canvas.parentElement.clientHeight;
    ratio = window.agnasUI?.canvasRatio() || Math.min(devicePixelRatio || 1, 1.5);
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);

    networkLayer.width = canvas.width;
    networkLayer.height = canvas.height;
    networkCtx.setTransform(ratio, 0, 0, ratio, 0, 0);
    pheromoneLayer.width = canvas.width;
    pheromoneLayer.height = canvas.height;
    pheromoneCtx.setTransform(ratio, 0, 0, ratio, 0, 0);
    buildAntSprites();
    buildPheromoneSprite();
  }

  // A jittered grid reads as an organic little street layout at a glance
  // without needing real GIS data for a purely decorative background.
  function buildRoadNetwork() {
    const spacing = 120;
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

  function makeAnt(index, count) {
    const travelable = network.nodes.filter((n) => n.edges.length > 0);
    if (!travelable.length) return null;

    const from = travelable[Math.floor((index + Math.random()) * travelable.length / count)];
    const fromIdx = network.nodes.indexOf(from);
    const toIdx = from.edges[Math.floor(Math.random() * from.edges.length)];

    return {
      fromIdx,
      toIdx,
      t: 0.3 + Math.random() * 0.65,
      speed: 20 + Math.random() * 12,
      gait: Math.random() * 4,
      depositTime: Math.random() * 0.13,
    };
  }

  function advanceAnt(ant, frameStep) {
    const from = network.nodes[ant.fromIdx];
    const to = network.nodes[ant.toIdx];
    ant.t += ant.speed * frameStep / Math.hypot(to.x - from.x, to.y - from.y);
    if (ant.t < 1) return;

    const arrived = network.nodes[ant.toIdx];
    const options = arrived.edges.filter((n) => n !== ant.fromIdx);
    const choices = options.length ? options : arrived.edges;
    const nextIdx = choices[Math.floor(Math.random() * choices.length)];

    ant.fromIdx = ant.toIdx;
    ant.toIdx = nextIdx;
    ant.t -= 1;
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

    networkCtx.globalAlpha = 0.2;
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

    networkCtx.globalAlpha = 0.28;
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
    const count = Math.min(window.agnasUI?.constrained ? 10 : 20, Math.max(8, Math.round(width / 72)));
    for (let i = 0; i < count; i++) {
      const ant = makeAnt(i, count);
      if (ant) ants.push(ant);
    }
    resetPheromones();
  }

  function init() {
    refreshColors();
    resize();
    rebuildScene();
  }

  function drawAnts(frameStep) {
    ants.forEach((ant) => {
      advanceAnt(ant, frameStep);
      ant.gait = (ant.gait + frameStep * 8) % antSprites.length;
      const pose = antPose(ant);
      ant.depositTime += frameStep;
      if (ant.depositTime >= 0.13) {
        stampPheromone(pose.x, pose.y);
        ant.depositTime %= 0.13;
      }

      ctx.save();
      ctx.translate(pose.x, pose.y);
      ctx.rotate(pose.angle);
      ctx.globalAlpha = 0.95;
      ctx.drawImage(antSprites[Math.floor(ant.gait)], -13, -11, 26, 22);
      ctx.restore();
    });
  }

  // `visible` stops the loop while the canvas is offscreen or the tab is in
  // the background; the observer/visibility callback restarts it with a single
  // requestAnimationFrame. step() only reschedules itself while visible, so
  // there is never more than one loop.
  let visible = true;

  function paint(frameStep = 0) {
    ctx.clearRect(0, 0, width, height);
    ctx.globalAlpha = 1;
    ctx.drawImage(networkLayer, 0, 0, width, height);
    drawPheromones(frameStep);
    drawAnts(frameStep);
  }

  function step(now) {
    animationFrame = 0;
    if (!visible || document.hidden || reduced) return;
    const paintElapsed = now - lastPaint;
    if (paintElapsed >= frameInterval - 0.1) {
      const frameStep = lastUpdate ? Math.min(100, now - lastUpdate) / 1000 * motionScale : 0;
      paint(frameStep);
      lastUpdate = now;
      lastPaint += Math.max(1, Math.floor((paintElapsed + 0.1) / frameInterval)) * frameInterval;
    }
    animationFrame = requestAnimationFrame(step);
  }

  function syncAnimation() {
    cancelAnimationFrame(animationFrame);
    animationFrame = 0;
    lastPaint = performance.now();
    lastUpdate = 0;
    if (visible && !document.hidden && !reduced) animationFrame = requestAnimationFrame(step);
  }

  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver((entries) => {
      visible = entries[entries.length - 1].isIntersecting;
      syncAnimation();
    }, { threshold: 0 });
    observer.observe(canvas);
  }
  document.addEventListener('visibilitychange', syncAnimation);

  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => {
      const nextWidth = canvas.parentElement.clientWidth;
      const nextHeight = canvas.parentElement.clientHeight;
      // Mobile browsers fire 'resize' when the URL bar collapses or expands on
      // scroll; a small change like that isn't worth rebuilding the road network.
      if (Math.abs(nextWidth - width) < 40 && Math.abs(nextHeight - height) < 80) return;
      resize();
      rebuildScene();
      paint();
    }, 150);
  });

  init();
  paint();
  syncAnimation();
  motionQuery.addEventListener?.('change', () => { reduced = motionQuery.matches; syncAnimation(); });
  window.addEventListener('pagehide', () => { cancelAnimationFrame(animationFrame); clearTimeout(resizeTimer); });
  window.addEventListener('pageshow', syncAnimation);
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

// The DOM is ready here. Fonts, map tiles and tutorial images must not hold
// up theme controls, selection state or the decorative canvas initialization.
initHomeTheme();
