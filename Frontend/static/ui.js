// Small shared runtime; native APIs only. Device memory is an optional hint,
// never a promise about the memory available to this browser tab.
(function initUI() {
  const constrained = (navigator.deviceMemory || 8) <= 4
    || (navigator.hardwareConcurrency || 8) <= 4
    || !!navigator.connection?.saveData;
  const root = document.documentElement;
  const viewport = window.visualViewport;
  let viewportFrame = 0;
  function updateViewport() {
    viewportFrame = 0;
    if (viewport && viewport.scale > 1.01) return; // Preserve pinch zoom.
    const height = Math.round(viewport?.height || innerHeight);
    const inset = Math.max(0, Math.round(innerHeight - height - (viewport?.offsetTop || 0)));
    root.style.setProperty('--visual-height', `${height}px`);
    root.style.setProperty('--keyboard-inset', `${inset}px`);
    root.dataset.keyboardOpen = String(inset > 120);
  }
  function scheduleViewport() {
    if (!viewportFrame) viewportFrame = requestAnimationFrame(updateViewport);
  }
  viewport?.addEventListener('resize', scheduleViewport, { passive: true });
  viewport?.addEventListener('scroll', scheduleViewport, { passive: true });
  window.addEventListener('resize', scheduleViewport, { passive: true });
  window.addEventListener('pageshow', scheduleViewport);
  window.addEventListener('pagehide', () => { cancelAnimationFrame(viewportFrame); viewportFrame = 0; });
  updateViewport();

  // Decorative SVGs stop repainting when their section or tab is not visible.
  const sections = [...document.querySelectorAll('.hz-section, .algo-flow')];
  const visible = new WeakMap();
  const syncMotion = () => {
    root.classList.toggle('ui-tab-hidden', document.hidden);
    sections.forEach(section => section.classList.toggle('ui-motion-paused', document.hidden || visible.get(section) === false));
  };
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => visible.set(entry.target, entry.isIntersecting));
      syncMotion();
    });
    sections.forEach(section => observer.observe(section));
  }
  document.addEventListener('visibilitychange', syncMotion);
  syncMotion();

  window.agnasUI = {
    constrained,
    canvasRatio: (maximum = 1.5) => Math.min(devicePixelRatio || 1, constrained ? 1 : maximum),
  };
})();
