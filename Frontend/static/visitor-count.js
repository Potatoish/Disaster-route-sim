// Website visitor count. Each browser is counted once, on whichever page it
// opens first (homepage, About or the simulator); the homepage's stat strip
// shows the total in #visitorCount. The count itself lives in the feedback
// Google Sheet (contact_service.py), so it survives redeploys.
(() => {
  const COUNTED_KEY = 'agnas-visitor-counted';
  const output = document.getElementById('visitorCount');

  // null when storage is blocked: such a browser can't remember it was
  // counted, so it is never counted rather than counted on every visit.
  let counted = null;
  try {
    counted = localStorage.getItem(COUNTED_KEY) === '1';
  } catch (err) {}

  const show = count => {
    if (output && Number.isFinite(count)) output.textContent = count.toLocaleString('en-US');
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

  const run = async () => {
    if (counted === false) {
      // Marked before asking, so a second page opened meanwhile doesn't
      // count the same browser again.
      setCounted(true);
      try {
        show(await ask('POST'));
        return;
      } catch (err) {
        // Not counted this time (sheet down, rate limit): try again next visit.
        setCounted(false);
      }
    }
    if (output) show(await ask('GET'));
  };

  run().catch(() => {});
})();
