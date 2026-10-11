// Smooth wheel scrolling for the homepage. A mouse wheel moves the page in
// jumps of about 100 px, which reads as a stutter on a long page; here each
// notch adds to a target and the page eases toward it. Touch, keyboard and
// scrollbar scrolling stay native, and reduced motion turns it off.
(function () {
  const root = document.documentElement;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  // Share of the remaining distance covered per 60 Hz frame. It is scaled by
  // the real frame time, so 120 and 144 Hz screens glide at the same speed.
  const EASE_PER_FRAME = 0.1;
  const FRAME_MS = 1000 / 60;
  // Firefox can report wheel steps in lines or pages instead of pixels.
  const LINE_PX = 40;

  let target = 0;
  let current = 0;
  let frame = 0;
  let lastFrameTime = 0;
  let lastSetY = null;

  const maxScroll = () => Math.max(0, root.scrollHeight - window.innerHeight);

  function stop() {
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    lastSetY = null;
    root.style.scrollBehavior = '';
  }

  // A wheel over a modal, the feedback panel or any box that scrolls by
  // itself belongs to that box, not to the page.
  function belongsToInnerScroller(node) {
    let el = node instanceof Element ? node : node?.parentElement;
    for (; el && el !== document.body && el !== root; el = el.parentElement) {
      const style = getComputedStyle(el);
      if (style.position === 'fixed') return true;
      if (/(auto|scroll)/.test(style.overflowY) && el.scrollHeight > el.clientHeight) return true;
    }
    return false;
  }

  function tick(now) {
    const elapsed = lastFrameTime ? Math.min(now - lastFrameTime, 64) : FRAME_MS;
    lastFrameTime = now;
    // The page can get shorter mid-glide (a section collapsing, a font swap).
    target = Math.min(target, maxScroll());
    current += (target - current) * (1 - Math.pow(1 - EASE_PER_FRAME, elapsed / FRAME_MS));
    if (Math.abs(target - current) < 0.5) current = target;
    window.scrollTo(0, current);
    lastSetY = window.scrollY;
    if (current === target) stop();
    else frame = requestAnimationFrame(tick);
  }

  function onWheel(event) {
    if (reducedMotion.matches || event.ctrlKey || event.defaultPrevented) return;
    if (Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
    // An open modal locks the page with overflow:hidden; its own content
    // scrolls natively.
    if (getComputedStyle(document.body).overflowY === 'hidden') return;
    if (belongsToInnerScroller(event.target)) return;

    const unit = event.deltaMode === 1 ? LINE_PX : event.deltaMode === 2 ? window.innerHeight : 1;
    event.preventDefault();
    if (!frame) {
      target = current = window.scrollY;
      lastFrameTime = 0;
      // html{scroll-behavior:smooth} (for anchor links) would otherwise
      // animate every small step on its own.
      root.style.scrollBehavior = 'auto';
      frame = requestAnimationFrame(tick);
    }
    target = Math.max(0, Math.min(maxScroll(), target + event.deltaY * unit));
  }

  // Anything else that moves the page (keys, the scrollbar, an anchor link,
  // find in page) takes over: the glide stops instead of fighting it.
  function onScroll() {
    if (frame && lastSetY !== null && Math.abs(window.scrollY - lastSetY) > 2) stop();
  }

  window.addEventListener('wheel', onWheel, { passive: false });
  window.addEventListener('scroll', onScroll, { passive: true });
  ['keydown', 'mousedown', 'touchstart'].forEach((type) => {
    window.addEventListener(type, () => { if (frame) stop(); }, { passive: true });
  });
  reducedMotion.addEventListener?.('change', stop);
})();
