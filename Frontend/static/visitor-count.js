// Website visitor count. Each browser is counted once, on whichever page it
// opens first (homepage, About or the simulator); the homepage's stat strip
// shows the total in #visitorCount. The count itself lives in the feedback
// Google Sheet (contact_service.py), so it survives redeploys.
(() => {
  const COUNTED_KEY = 'agnas-visitor-counted';
  // A failed read is tried again after these pauses, so a slow sheet right
  // after a deploy doesn't leave the dash.
  const RETRY_DELAYS_MS = [2000, 5000, 10000];
  const output = document.getElementById('visitorCount');

  // null when storage is blocked: such a browser can't remember it was
  // counted, so it is never counted rather than counted on every visit.
  let counted = null;
  try {
    counted = localStorage.getItem(COUNTED_KEY) === '1';
  } catch (err) {}

  // A new visitor's own count (POST) and the plain read (GET) can come back
  // in either order; the count only grows, so the higher one is current.
  // The server writes its latest count into the page (data-count).
  const written = Number.parseInt(output?.dataset.count ?? '', 10);
  let shown = Number.isFinite(written) ? written : -1;
  const show = count => {
    if (!output || !Number.isFinite(count) || count < shown) return;
    shown = count;
    output.textContent = count.toLocaleString('en-US');
  };

  const setCounted = value => {
    try {
      if (value) localStorage.setItem(COUNTED_KEY, '1');
      else localStorage.removeItem(COUNTED_KEY);
    } catch (err) {}
  };

  const ask = async method => {
    // keepalive: a visitor who leaves the page at once is still counted.
    const response = await fetch(`${window.BACKEND_BASE || ''}/visitors`, {
      method,
      keepalive: method === 'POST',
      headers: { Accept: 'application/json' },
    });
    const body = await response.json();
    if (!response.ok || body.error) throw new Error(body.message || `HTTP ${response.status}`);
    return body.count;
  };

  if (counted === false) {
    // Marked before asking, so a second page opened meanwhile doesn't count
    // the same browser again.
    setCounted(true);
    // Not counted this time (sheet down, rate limit): try again next visit.
    ask('POST').then(show, () => setCounted(false));
  }
  // Asked only when the page came without a count (the server had none
  // yet), and alongside the POST, not after it: adding a visitor waits
  // seconds on the Google Sheet. Retried until either one gives a number.
  const read = attempt => ask('GET').then(show, () => {
    if (shown < 0 && attempt < RETRY_DELAYS_MS.length) {
      setTimeout(() => read(attempt + 1), RETRY_DELAYS_MS[attempt]);
    }
  });
  if (output && shown < 0) read(0);
})();
