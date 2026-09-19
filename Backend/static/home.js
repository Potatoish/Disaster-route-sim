// Homepage / About & Contact page behavior: theme toggle, ant-trail hero
// background, and the feedback widget. Loaded on every page that extends
// site_base.html.

const HOME_THEME_STORAGE_KEY = 'disaster-route-sim-theme';

function getStoredHomeTheme() {
  try {
    return localStorage.getItem(HOME_THEME_STORAGE_KEY) === 'dark' ? 'dark' : 'light';
  } catch (err) {
    return 'light';
  }
}

function applyHomeTheme(theme) {
  document.body.classList.toggle('dark', theme === 'dark');
  const icon = document.getElementById('themeToggleIcon');
  if (icon) {
    icon.innerHTML = theme === 'dark'
      ? '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z"/>'
      : '<circle cx="12" cy="12" r="4.2"/><path d="M12 2v2.4M12 19.6V22M4.9 4.9l1.7 1.7M17.4 17.4l1.7 1.7M2 12h2.4M19.6 12H22M4.9 19.1l1.7-1.7M17.4 6.6l1.7-1.7"/>';
  }
  try {
    localStorage.setItem(HOME_THEME_STORAGE_KEY, theme);
  } catch (err) {
    // Ignore storage failures and keep the theme in-memory only.
  }
}

function initHomeTheme() {
  applyHomeTheme(getStoredHomeTheme());
  initAntCanvas();
}

function toggleHomeTheme() {
  applyHomeTheme(document.body.classList.contains('dark') ? 'light' : 'dark');
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
  toggleFab();
  showHomeToast('Thanks for the feedback!');
  if (msg) msg.value = '';
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

// ---- launch transition: brief branded overlay before handing off to /app ----
let launchInProgress = false;

function launchSimulator(event, link) {
  if (launchInProgress) return false;
  event.preventDefault();
  launchInProgress = true;

  link.classList.add('is-loading');
  const overlay = document.getElementById('launchOverlay');
  if (overlay) requestAnimationFrame(() => overlay.classList.add('show'));

  setTimeout(() => {
    window.location.href = link.href;
  }, 550);

  return false;
}

// ---- ant colony ambient hero background ----
function initAntCanvas() {
  const canvas = document.getElementById('antCanvas');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let width, height, ants = [], trail = [];

  function accentColor() {
    return getComputedStyle(document.body).getPropertyValue('--accent').trim() || '#1d4ed8';
  }

  function resize() {
    width = canvas.parentElement.clientWidth;
    height = canvas.parentElement.clientHeight;
    canvas.width = width * devicePixelRatio;
    canvas.height = height * devicePixelRatio;
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';
    ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
  }

  function makeAnt() {
    return {
      x: Math.random() * width,
      y: Math.random() * height,
      a: Math.random() * Math.PI * 2,
      s: 0.4 + Math.random() * 0.5,
      turn: (Math.random() - 0.5) * 0.06,
    };
  }

  function init() {
    resize();
    ants = [];
    for (let i = 0; i < 26; i++) ants.push(makeAnt());
    trail = [];
  }

  function step() {
    ctx.clearRect(0, 0, width, height);
    const color = accentColor();

    for (let i = trail.length - 1; i >= 0; i--) {
      trail[i].life -= 1;
      if (trail[i].life <= 0) trail.splice(i, 1);
    }
    trail.forEach((p) => {
      ctx.globalAlpha = Math.max(0, p.life / 140) * 0.5;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 1.4, 0, Math.PI * 2);
      ctx.fill();
    });

    ctx.globalAlpha = 1;
    ants.forEach((ant) => {
      ant.turn += (Math.random() - 0.5) * 0.02;
      ant.turn = Math.max(-0.09, Math.min(0.09, ant.turn));
      ant.a += ant.turn;
      ant.x += Math.cos(ant.a) * ant.s;
      ant.y += Math.sin(ant.a) * ant.s;
      if (ant.x < -10) ant.x = width + 10;
      if (ant.x > width + 10) ant.x = -10;
      if (ant.y < -10) ant.y = height + 10;
      if (ant.y > height + 10) ant.y = -10;
      if (Math.random() < 0.7) trail.push({ x: ant.x, y: ant.y, life: 140 });

      ctx.save();
      ctx.translate(ant.x, ant.y);
      ctx.rotate(ant.a);
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.85;
      ctx.beginPath();
      ctx.ellipse(0, 0, 3.4, 1.7, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(-4.2, 0, 2, 1.2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });

    if (!reduced) requestAnimationFrame(step);
  }

  window.addEventListener('resize', resize);
  init();
  if (reduced) {
    step();
  } else {
    requestAnimationFrame(step);
  }
}

window.initHomeTheme = initHomeTheme;
window.toggleHomeTheme = toggleHomeTheme;
window.toggleFab = toggleFab;
window.sendFeedback = sendFeedback;
window.submitContactForm = submitContactForm;
window.launchSimulator = launchSimulator;
