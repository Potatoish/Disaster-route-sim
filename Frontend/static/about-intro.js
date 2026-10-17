// Scroll-linked About introduction. Only scroll/resize events schedule a
// frame; there is no animation loop while the page is idle.
(function initAboutIntro() {
  const intro = document.querySelector('.about-intro');
  const heading = intro?.querySelector('.about-heading');
  if (!heading) return;

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let frame = 0;
  let maximumScale = 1;
  let scrollDistance = 180;
  let previousScale = null;

  function measure() {
    const style = getComputedStyle(intro);
    maximumScale = parseFloat(style.getPropertyValue('--about-intro-max-scale')) || 1;
    scrollDistance = parseFloat(style.getPropertyValue('--about-intro-scroll-distance')) || 180;
  }

  function update() {
    frame = 0;
    const progress = Math.max(0, Math.min(1, window.scrollY / scrollDistance));
    const eased = progress * progress * (3 - 2 * progress);
    const scale = reducedMotion.matches ? 1 : 1 + (maximumScale - 1) * (1 - eased);
    if (scale === previousScale) return;
    heading.style.setProperty('--about-intro-scale', scale.toFixed(4));
    previousScale = scale;
  }

  function schedule() {
    if (!frame) frame = requestAnimationFrame(update);
  }

  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', () => { measure(); schedule(); }, { passive: true });
  window.addEventListener('pageshow', schedule);
  window.addEventListener('pagehide', () => { cancelAnimationFrame(frame); frame = 0; });
  reducedMotion.addEventListener?.('change', schedule);
  measure();
  update();
})();
