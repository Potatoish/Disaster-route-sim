// Homepage hazard showcase (#hazards in home.html): the flood depth scene and
// the earthquake cross-section. Illustrative only -- no API calls. Styles are
// the hz- rules in home.css.
(function initHazardShowcase() {
  const flood = document.getElementById('hzFlood');
  const cross = document.getElementById('hzCross');
  if (!flood || !cross) return;

  const $ = id => document.getElementById(id);

  // ================= FLOOD =================
  const LEVELS = {
    low: { preset: 0.3, color: 'var(--low)', ink: 'var(--low-ink)', on: 'var(--low-on)', label: 'Low' },
    medium: { preset: 1.0, color: 'var(--med)', ink: 'var(--med-ink)', on: 'var(--med-on)', label: 'Medium' },
    high: { preset: 1.75, color: 'var(--high)', ink: 'var(--high-ink)', on: 'var(--high-on)', label: 'High' },
  };
  // Project NOAH's classes, as in the app's FLOOD_DEPTH_RANGE_BY_VAR: Low up
  // to 0.5 m, Medium to 1.5 m, High above.
  const levelFor = d => (d <= 0.5 ? 'low' : d <= 1.5 ? 'medium' : 'high');
  // The readout's Walking row: AGNAS plans walking routes only, so it says
  // whether a person can walk through, not whether a road is open. It follows
  // the depth, not the class: past 1.2 m floodwater is unsafe for any adult
  // (AIDR Flood Hazard Guideline 7-3, class H4), which is still Medium.
  const walkFor = d => (d <= 0.5 ? ['safe', 'Walkable'] : d <= 1.2 ? ['risk', 'Walk with caution'] : ['elim', 'Not walkable']);

  // Water depth (m) up to each body landmark, from standard proportions of
  // standing height: a 163 cm adult (DOST-FNRI) and a 130 cm child.
  const ADULT = [[0.1, 'ankles'], [0.3, 'shins'], [0.46, 'knees'], [0.87, 'thighs'], [0.98, 'waist'], [1.18, 'chest'], [1.34, 'shoulders'], [1.42, 'neck'], [9, 'face']];
  const CHILD = [[0.08, 'ankles'], [0.25, 'shins'], [0.37, 'knees'], [0.69, 'thighs'], [0.78, 'waist'], [0.94, 'chest'], [1.06, 'shoulders'], [1.13, 'neck'], [1.3, 'face'], [9, null]];
  const firstAtOrAbove = (table, d) => table.find(([limit]) => d <= limit + 1e-9)[1];
  const reachText = part => (part ? `up to the ${part}` : 'over the head');
  const DEPTH_NOTES = [
    [0.2, 'Walk carefully. The water can hide open drains.'],
    [0.5, 'Walking is slower. Keep children close.'],
    [0.8, 'Hard to walk. Carry small children.'],
    [1.2, 'Hard to stay standing. Children can be swept away.'],
    [1.5, 'Too deep to walk through.'],
    [9, 'Too deep. Stay on higher ground.'],
  ];

  function wavePath(from, to, len, amp) {
    let d = `M${from} 0`;
    for (let x = from; x < to; x += len) d += ` Q${x + len / 4} ${-amp} ${x + len / 2} 0 T${x + len} 0`;
    return d;
  }
  const waveTop = wavePath(-130, 650, 65, 3.5);
  $('hzWaterLine').setAttribute('d', waveTop);
  $('hzWaterBody').setAttribute('d', waveTop + ' L650 260 L-130 260 Z');

  const slider = $('hzDepth');
  const cards = flood.querySelectorAll('.hz-level');

  // Drawn to scale: 1 m = 60 scene units above the street at y = 200.
  function setDepth(depth) {
    const key = levelFor(depth);
    const lvl = LEVELS[key];
    const y = 200 - depth * 60;
    $('hzWater').style.transform = `translateY(${y}px)`;
    $('hzDepthMarker').style.transform = `translateY(${y}px)`;
    const label = depth.toFixed(2) + ' m';
    $('hzDepthMarkerText').textContent = label;
    $('hzDepthOut').textContent = label;
    slider.value = depth;
    slider.setAttribute('aria-valuetext', `${label}, ${lvl.label} flood`);
    flood.style.setProperty('--lvl', lvl.color);
    flood.style.setProperty('--lvl-ink', lvl.ink);
    flood.style.setProperty('--lvl-on', lvl.on);
    cards.forEach(card => card.setAttribute('aria-pressed', String(card.dataset.level === key)));

    $('hzReach').innerHTML = `<span>Adult: ${reachText(firstAtOrAbove(ADULT, depth))}</span>`
      + `<span>Child: ${reachText(firstAtOrAbove(CHILD, depth))}</span>`;
    $('hzLevel').textContent = lvl.label;
    $('hzLevelNote').textContent = firstAtOrAbove(DEPTH_NOTES, depth);
    const [walkClass, walkText] = walkFor(depth);
    $('hzRoad').innerHTML = `<span class="hz-chip hz-chip--${walkClass}">${walkText}</span>`;
  }

  cards.forEach(card => card.addEventListener('click', () => setDepth(LEVELS[card.dataset.level].preset)));
  slider.addEventListener('input', () => setDepth(Number(slider.value)));
  // Opens on Low; the markup's starting values match.
  setDepth(LEVELS.low.preset);

  // ================= EARTHQUAKE =================
  const layers = { gs: true, liq: false };
  const tiles = { gs: $('hzTileGs'), liq: $('hzTileLiq') };
  const simBtn = $('hzSimBtn');
  const CAPTIONS = {
    both: '<b>Both:</b> the ground shakes and turns soft. Buildings sway, tilt and sink, and roads crack.',
    liq: '<b>Liquefaction:</b> shaking turns wet, sandy ground soft like mud. Buildings sink and tilt, and roads crack.',
    gs: '<b>Ground shaking:</b> strong shaking cracks walls and drops debris on roads.',
    none: 'Turn on a layer to see what it does.',
  };
  const LENS_NAMES = { both: 'Both', liq: 'Liquefaction', gs: 'Ground shaking', none: 'No layer' };
  // The simulate button names and pictures whatever is switched on.
  const ICON_QUAKE = '<path d="M2 12h4l2.5-6 4 13 3-9 2 2H22"/>';
  const ICON_BOTH = '<path d="M2 9h3.5l2-4.5 3 9 2.5-6.5 1.5 2H22"/><path d="M2 19.5h5l1.5-1.5 2 2.5 2-2 1.5 1h8"/>';
  const ICON_LIQ = '<path d="M8.5 17.5 7 7.3l6-1 1.8 10.3"/><path d="M9.5 10l2-.3M10 13l2-.3"/><path d="M2 19.5h5l1.5-1.5 2 2.5 2-2 1.5 1h8"/>';
  const SIM_BUTTON = {
    both: { label: 'Simulate both', icon: ICON_BOTH, mode: 'both' },
    liq: { label: 'Simulate liquefaction', icon: ICON_LIQ, mode: 'liq' },
    gs: { label: 'Simulate ground shaking', icon: ICON_QUAKE, mode: 'gs' },
    none: { label: 'Turn on a layer first', icon: ICON_QUAKE, mode: 'gs' },
  };
  const noLayer = () => !layers.gs && !layers.liq;

  // Snap the scene back to its before-the-quake state without animating.
  function resetCross() {
    cross.classList.add('no-anim');
    cross.classList.remove('is-shaking', 'is-done');
    void cross.getBoundingClientRect();
    cross.classList.remove('no-anim');
  }

  function renderQuake() {
    const key = layers.gs && layers.liq ? 'both' : layers.gs ? 'gs' : layers.liq ? 'liq' : 'none';
    tiles.gs.setAttribute('aria-pressed', String(layers.gs));
    tiles.liq.setAttribute('aria-pressed', String(layers.liq));
    $('hzLensName').textContent = LENS_NAMES[key];
    const sim = SIM_BUTTON[key];
    $('hzSimLabel').textContent = sim.label;
    $('hzSimIcon').innerHTML = sim.icon;
    simBtn.dataset.mode = sim.mode;
    simBtn.disabled = key === 'none';
    cross.classList.toggle('gs-on', layers.gs);
    cross.classList.toggle('liq-on', layers.liq);
    resetCross();
    $('hzCrossCaption').innerHTML = CAPTIONS[key];
  }

  Object.entries(tiles).forEach(([layer, tile]) => tile.addEventListener('click', () => {
    layers[layer] = !layers[layer];
    renderQuake();
  }));

  simBtn.addEventListener('click', () => {
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    simBtn.disabled = true;
    resetCross();
    cross.classList.add('is-shaking', 'is-done');
    setTimeout(() => {
      cross.classList.remove('is-shaking');
      simBtn.disabled = noLayer();
    }, reduced ? 0 : 950);
  });

  renderQuake();
})();
