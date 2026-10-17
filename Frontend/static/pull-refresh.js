// Natural pull-to-refresh from dashboard content, with no control at rest.
// Touch scrolling stays native until a downward pull begins at scroll zero.
(function initPullRefresh() {
  const indicator = document.getElementById('dashboardRefresh');
  const label = document.getElementById('pullRefreshLabel');
  const main = document.getElementById('main');
  if (!indicator || !label || !main) return;

  document.documentElement.classList.add('has-pull-refresh');
  const threshold = 64;
  const excluded = 'a, button, input, textarea, select, summary, details, nav, [role="dialog"], [contenteditable]:not([contenteditable="false"]), .leaflet-container';
  let gesture = null;
  let distance = 0;
  let frame = 0;
  let reloadTimer = 0;
  let refreshing = false;
  let message = '';

  function paint() {
    frame = 0;
    indicator.hidden = !distance && !refreshing;
    const progress = Math.min(1, distance / threshold);
    indicator.style.setProperty('--pull-progress', progress.toFixed(3));
    indicator.style.setProperty('--pull-distance', Math.min(distance, 72).toFixed(1) + 'px');
    indicator.classList.toggle('is-ready', progress === 1);
    message = refreshing ? 'Refreshing…' : progress === 1 ? 'Release to refresh' : distance ? 'Pull down to refresh' : '';
    const translated = window.agnasI18n?.t(message) || message;
    if (label.textContent !== translated) label.textContent = translated;
  }

  function schedule() {
    if (!frame) frame = requestAnimationFrame(paint);
  }

  function reset() {
    gesture = null;
    if (refreshing) return;
    distance = 0;
    schedule();
  }

  function eligible(target) {
    return !refreshing && window.scrollY <= 1 && target instanceof Element
      && main.contains(target) && !target.closest(excluded)
      && !document.body.matches('.scope-modal-open, .tutorial-modal-open');
  }

  function start(type, id, x, y) {
    window.getSelection()?.removeAllRanges();
    const navBottom = document.querySelector('.site-nav')?.getBoundingClientRect().bottom || 0;
    indicator.style.setProperty('--pull-refresh-top', Math.round(navBottom + 8) + 'px');
    gesture = { type, id, x, y };
    distance = 0;
  }

  function move(x, y, event) {
    const dx = x - gesture.x;
    const dy = y - gesture.y;
    if (window.scrollY > 1 || dy < -4 || (Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy))) { reset(); return; }
    if (dy <= 4) return;
    if (!event.cancelable) { reset(); return; }
    event.preventDefault();
    distance = Math.max(0, Math.min(84, dy * 0.5));
    schedule();
  }

  function finish() {
    if (!gesture) return;
    const ready = distance >= threshold;
    gesture = null;
    if (!ready) { reset(); return; }
    refreshing = true;
    indicator.setAttribute('aria-busy', 'true');
    paint();
    reloadTimer = window.setTimeout(() => window.location.reload(), 120);
  }

  document.addEventListener('touchstart', event => {
    if (event.touches.length !== 1 || !eligible(event.target)) { reset(); return; }
    const touch = event.touches[0];
    start('touch', touch.identifier, touch.clientX, touch.clientY);
  }, { passive: true });
  document.addEventListener('touchmove', event => {
    if (!gesture || gesture.type !== 'touch') return;
    if (event.touches.length !== 1) { reset(); return; }
    const touch = [...event.touches].find(item => item.identifier === gesture.id);
    if (touch) move(touch.clientX, touch.clientY, event);
  }, { passive: false });
  document.addEventListener('touchend', event => {
    if (gesture?.type === 'touch' && [...event.changedTouches].some(touch => touch.identifier === gesture.id)) finish();
  }, { passive: true });
  document.addEventListener('touchcancel', reset, { passive: true });

  document.addEventListener('mousedown', event => {
    if (event.button !== 0 || !eligible(event.target)) return;
    start('mouse', 0, event.clientX, event.clientY);
  });
  document.addEventListener('mousemove', event => {
    if (gesture?.type !== 'mouse') return;
    if (!(event.buttons & 1)) { reset(); return; }
    move(event.clientX, event.clientY, event);
  });
  document.addEventListener('mouseup', () => { if (gesture?.type === 'mouse') finish(); });
  document.addEventListener('mouseleave', reset);
  window.addEventListener('blur', reset);
  window.addEventListener('scroll', () => { if (window.scrollY > 1) reset(); }, { passive: true });
  document.addEventListener('site:languagechange', () => { label.textContent = window.agnasI18n?.t(message) || message; });
  window.addEventListener('pagehide', () => { cancelAnimationFrame(frame); clearTimeout(reloadTimer); frame = 0; });
  window.addEventListener('pageshow', event => {
    if (!event.persisted) return;
    refreshing = false;
    indicator.removeAttribute('aria-busy');
    reset();
  });
})();
