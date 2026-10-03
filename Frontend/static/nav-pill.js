// Home / About nav: the highlight slides to the page or panel you switch to.
// One gradient layer over the links holds a white copy of every label and is
// clipped to the pill's shape, so whatever sits under the pill reads white at
// every frame. Its two edges move separately, the leading one first, so the
// pill stretches toward where it is going and settles there.
//
// Switching page: the pill slides first and the page follows once it has
// nearly landed (NAVIGATE_AFTER_MS), since a loading page drops frames. The
// next page starts its pill where this one left it (sessionStorage); a page
// reached any other way slides the rest of the way after its first render.
(function initNavPill() {
  const links = document.querySelector('.site-nav .nav-links');
  if (!links || typeof links.animate !== 'function') return;

  const items = Array.from(links.querySelectorAll('.nav-btn'));
  const pageItem = links.querySelector('.nav-btn.is-active');
  const howToUseItem = document.getElementById('howToUseNavBtn');
  const HANDOFF_KEY = 'agnas-nav-pill';
  const HANDOFF_MAX_AGE_MS = 8000;
  // The leading edge's travel time, then the trailing edge's (it starts a
  // beat later): about 0.4 s in all.
  const LEAD_MS = 280;
  const TRAIL_DELAY_MS = 20;
  const TRAIL_MS = 380;
  const SLIDE_MS = TRAIL_DELAY_MS + TRAIL_MS;
  // By then the leading edge is ~97% there and the trailing one ~85%; the
  // next page finishes the slide from the handoff.
  const NAVIGATE_AFTER_MS = 160;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  const pill = document.createElement('span');
  pill.className = 'nav-pill';
  pill.setAttribute('aria-hidden', 'true');
  const labels = items.map((item) => {
    const label = document.createElement('span');
    label.className = 'nav-btn nav-pill-label';
    label.innerHTML = item.innerHTML;
    pill.appendChild(label);
    return label;
  });
  links.appendChild(pill);
  links.classList.add('has-pill');

  let geometry = null; // { width, height, boxes: [{ x, w, y, h }], key }
  let target = null;   // the link the pill rests on, or is heading to
  let rest = null;     // the pill's shape once any slide ends
  let slide = null;    // { animation, from, to }
  let holding = false; // parked where the previous page left it
  let navigateTimer = 0;

  const easeOutQuart = (p) => 1 - (1 - Math.min(1, Math.max(0, p))) ** 4;
  const px = (value) => `${Math.round(value * 100) / 100}px`;

  // Everything is in .nav-links' content coordinates (scroll included), which
  // is where the absolutely positioned pill layer lives. The pill fills a
  // link's padding box: phone links have a transparent border around it.
  function measure() {
    const box = links.getBoundingClientRect();
    const originX = box.left + links.clientLeft - links.scrollLeft;
    const originY = box.top + links.clientTop - links.scrollTop;
    const boxes = items.map((item, i) => {
      const rect = item.getBoundingClientRect();
      const x = rect.left - originX;
      const y = rect.top - originY;
      Object.assign(labels[i].style, { left: px(x), top: px(y), width: px(rect.width), height: px(rect.height) });
      return {
        x: x + item.clientLeft,
        w: rect.width - 2 * item.clientLeft,
        y: y + item.clientTop,
        h: rect.height - 2 * item.clientTop,
      };
    });
    const width = Math.max(links.scrollWidth, links.clientWidth);
    const height = links.clientHeight;
    pill.style.width = px(width);
    pill.style.height = px(height);
    const key = JSON.stringify([width, height, boxes.map((b) => [b.x, b.w, b.y, b.h].map(Math.round))]);
    const changed = geometry?.key !== key;
    geometry = { width, height, boxes, key };
    return changed;
  }

  function clipFor({ x, w, y, h }) {
    const right = geometry.width - x - w;
    const bottom = geometry.height - y - h;
    return `inset(${px(y)} ${px(right)} ${px(bottom)} ${px(x)} round ${px(h / 2)})`;
  }

  function shapeAt({ from, to }, t) {
    const lead = easeOutQuart(t / LEAD_MS);
    const trail = easeOutQuart((t - TRAIL_DELAY_MS) / TRAIL_MS);
    const movingRight = to.x + to.w / 2 >= from.x + from.w / 2;
    const left = from.x + (to.x - from.x) * (movingRight ? trail : lead);
    const right = from.x + from.w + (to.x + to.w - from.x - from.w) * (movingRight ? lead : trail);
    return { x: left, w: right - left, y: to.y, h: to.h };
  }

  function currentShape() {
    const time = slide?.animation.currentTime;
    if (slide && slide.animation.playState === 'running' && time != null) return shapeAt(slide, time);
    return rest;
  }

  function paint(shape) {
    pill.hidden = !shape;
    if (!shape) return;
    pill.style.backgroundSize = `100% ${px(shape.h)}`;
    pill.style.backgroundPosition = `0 ${px(shape.y)}`;
    pill.style.clipPath = clipFor(shape);
  }

  function stopSlide() {
    if (!slide) return;
    slide.animation.cancel();
    slide = null;
  }

  // `from` overrides where the slide starts (null: just appear there).
  function moveTo(item, { animate = true, from } = {}) {
    if (!geometry) measure();
    const start = from === undefined ? currentShape() : from;
    stopSlide();
    holding = false;
    target = item;
    const to = geometry.boxes[items.indexOf(item)] || null;
    rest = to;
    paint(to);
    if (!to) return;
    const stays = !start || (Math.abs(start.x - to.x) < 0.5 && Math.abs(start.w - to.w) < 0.5);
    if (!animate || stays || reducedMotion.matches) return;

    const next = { from: start, to };
    const frames = [];
    for (let t = 0; t < SLIDE_MS; t += 1000 / 60) {
      frames.push({ offset: t / SLIDE_MS, clipPath: clipFor(shapeAt(next, t)) });
    }
    frames.push({ offset: 1, clipPath: clipFor(to) });
    next.animation = pill.animate(frames, { duration: SLIDE_MS, easing: 'linear' });
    next.animation.onfinish = () => {
      if (slide === next) slide = null;
    };
    slide = next;
  }

  // Parks the pill at `shape`, on the row of the link it will slide to.
  function hold(item, shape) {
    const row = geometry.boxes[items.indexOf(item)];
    if (!row) return false;
    stopSlide();
    target = item;
    rest = { x: shape.x, w: shape.w, y: row.y, h: row.h };
    holding = true;
    paint(rest);
    return true;
  }

  // Slides on from where the previous page left the pill, once this page has
  // parsed and drawn its first full frame (it drops frames until then).
  function arrive(from) {
    if (!from || reducedMotion.matches || !hold(pageItem, from)) {
      moveTo(pageItem, { animate: false });
      return;
    }
    const go = () => requestAnimationFrame(() => requestAnimationFrame(() => {
      if (holding) moveTo(pageItem);
    }));
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go, { once: true });
    else go();
  }

  // Fonts loading, a resize or a breakpoint moves the links: follow them.
  function remeasure() {
    if (!measure()) return;
    if (holding) hold(target, rest);
    else moveTo(target, { animate: Boolean(slide) });
  }

  function saveHandoff() {
    const shape = currentShape();
    try {
      if (shape) sessionStorage.setItem(HANDOFF_KEY, JSON.stringify({ x: shape.x, w: shape.w, at: Date.now() }));
      else sessionStorage.removeItem(HANDOFF_KEY);
    } catch (err) {
      // Storage blocked: the next page's pill simply appears in place.
    }
  }

  function takeHandoff() {
    let data = null;
    try {
      data = JSON.parse(sessionStorage.getItem(HANDOFF_KEY) || 'null');
      sessionStorage.removeItem(HANDOFF_KEY);
    } catch (err) {
      return null;
    }
    const fresh = data && Date.now() - data.at < HANDOFF_MAX_AGE_MS;
    if (!fresh || !Number.isFinite(data.x) || !Number.isFinite(data.w)) return null;
    return { x: data.x, w: data.w };
  }

  links.addEventListener('click', (event) => {
    const item = event.target.closest('.nav-btn');
    // "How to use" opens the tutorial in place; its events move the pill.
    if (!item || item === howToUseItem || event.defaultPrevented || event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    moveTo(item);
    if (!slide) return; // nowhere to slide (or reduced motion): go now
    event.preventDefault();
    clearTimeout(navigateTimer);
    if (item === pageItem) return; // back to this page mid-switch: stay
    navigateTimer = setTimeout(() => window.location.assign(item.href), NAVIGATE_AFTER_MS);
  });
  document.addEventListener('tutorial:open', () => {
    if (howToUseItem) moveTo(howToUseItem);
  });
  document.addEventListener('tutorial:close', () => moveTo(pageItem));

  window.addEventListener('pagehide', saveHandoff);
  // Back/forward restores a frozen page whose pill may have been mid-slide.
  window.addEventListener('pageshow', (event) => {
    if (!event.persisted) return;
    clearTimeout(navigateTimer);
    measure();
    arrive(takeHandoff());
  });

  if ('ResizeObserver' in window) {
    const observer = new ResizeObserver(remeasure);
    observer.observe(links);
    items.forEach((item) => observer.observe(item));
  } else {
    window.addEventListener('resize', remeasure);
  }
  document.fonts?.ready?.then(remeasure);

  measure();
  const handoff = takeHandoff();
  const reloaded = performance.getEntriesByType?.('navigation')?.[0]?.type === 'reload';
  arrive(reloaded ? null : handoff);
})();
