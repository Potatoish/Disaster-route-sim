const BACKEND = 'http://127.0.0.1:5000';

let gMap = null;
let selectedBarangay = null;
let selectedHazard = 'Flood';
let simData = null;
let isBackendLive = false;
let mapLayers = { edges: [], nodes: [], routes: [] };
let activeInfoWindow = null;
const activeInfoWindowRef = { current: null };

let ALL_LOCATIONS = [];
let LOCATIONS_BY_BARANGAY = {};

const MAP_STYLES = [
  { elementType: 'geometry', stylers: [{ color: '#f5f5f5' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#333333' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#ffffff' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#ffffff' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#c9e6ff' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
];

function initTheme() {
  document.body.classList.remove('dark');
  const btn = document.querySelector('.theme-toggle');
  if (btn) btn.textContent = '🌙';
}

function toggleTheme() {
  const body = document.body;
  body.classList.toggle('dark');

  const btn = document.querySelector('.theme-toggle');
  if (btn) {
    btn.textContent = body.classList.contains('dark') ? '☀️' : '🌙';
  }
}

function initMap() {
  gMap = new google.maps.Map(document.getElementById('map'), {
    center: { lat: 14.5590, lng: 121.0955 },
    zoom: 15,
    tilt: 0,
    heading: 0,
    mapTypeId: google.maps.MapTypeId.ROADMAP,
    styles: MAP_STYLES,
    mapTypeControl: true,
    mapTypeControlOptions: {
      style: google.maps.MapTypeControlStyle.DROPDOWN_MENU,
      position: google.maps.ControlPosition.TOP_RIGHT,
    },
    streetViewControl: false,
    fullscreenControl: true,
    zoomControl: true,
    tiltControl: false,
    rotationControl: false,
  });

  startApp();
}

async function startApp() {
  await checkBackend();

  if (!isBackendLive) {
    document.getElementById('statusTxt').textContent = 'Backend Offline';
    alert('Backend is not connected. Run the Flask backend first.');
    return;
  }

  await loadLocationsFromBackend();
}

function clearRouteAnimation() {}

function clearLayers() {
  clearRouteAnimation();
  [...mapLayers.edges, ...mapLayers.nodes, ...mapLayers.routes].forEach(o => o.setMap(null));
  mapLayers = { edges: [], nodes: [], routes: [] };

  if (activeInfoWindow) {
    activeInfoWindow.close();
    activeInfoWindow = null;
  }

  if (activeInfoWindowRef.current) {
    activeInfoWindowRef.current.close();
    activeInfoWindowRef.current = null;
  }
}

function normalizeLocation(loc) {
  return {
    name: loc.name || '',
    lat: Number(loc.lat),
    lng: Number(loc.lng),
    barangay: loc.barangay || 'Unknown',
    haz: typeof loc.haz === 'number' ? loc.haz : null,
    level: loc.level || 'safe'
  };
}

function groupLocationsByBarangay(locations) {
  const grouped = {};

  locations.forEach(loc => {
    const bgy = loc.barangay || 'Unknown';
    if (!grouped[bgy]) grouped[bgy] = [];
    grouped[bgy].push(loc);
  });

  return grouped;
}

async function loadLocationsFromBackend() {
  try {
    const res = await fetch(BACKEND + '/locations');
    const data = await res.json();

    if (data.error) {
      throw new Error(data.message || 'Failed to load locations');
    }

    ALL_LOCATIONS = (data.locations || []).map(normalizeLocation);
    LOCATIONS_BY_BARANGAY = groupLocationsByBarangay(ALL_LOCATIONS);

    document.getElementById('statusTxt').textContent = 'Locations Loaded';
  } catch (err) {
    console.error(err);
    document.getElementById('statusTxt').textContent = 'Error Loading Locations';
    alert('Failed to load locations from backend: ' + err.message);
  }
}

function getBarangayLocations(barangay) {
  return LOCATIONS_BY_BARANGAY[barangay] || [];
}

function getLocationByName(name) {
  return ALL_LOCATIONS.find(loc => loc.name === name) || null;
}

function nodeColor(haz, id, start, end) {
  if (id === start) return '#a855f7';
  if (id === end) return '#06b6d4';
  if (haz == null) return '#22c55e';
  if (haz <= 2) return '#22c55e';
  if (haz === 3) return '#eab308';
  return '#ef4444';
}

function shortNodeLabel(name) {
  return name.split(',')[0].split(' ').slice(0, 2).join(' ');
}

function infoPopup(title, rows) {
  return `<div style="padding:10px 2px 4px;">
    <div class="popup-title">${title}</div>
    ${rows.map(([k, v, c]) => `<div class="popup-row"><span>${k}</span><span style="${c ? 'color:' + c : ''}">${v}</span></div>`).join('')}
  </div>`;
}

function fitMapToLocations(locations, padding = 60) {
  if (!locations.length) return;

  const bounds = new google.maps.LatLngBounds();
  locations.forEach(loc => bounds.extend({ lat: loc.lat, lng: loc.lng }));
  gMap.fitBounds(bounds, padding);
}

function loadBarangayMapOnly(bgyName) {
  clearLayers();

  const nodes = getBarangayLocations(bgyName);

  document.getElementById('mapLegend').style.display = 'none';
  document.getElementById('mapInfoBadge').style.display = 'none';

  if (nodes.length) {
    fitMapToLocations(nodes, 70);
  }
}

function drawNode(n, start, end) {
  const col = nodeColor(n.haz, n.name, start, end);
  const special = n.name === start || n.name === end;

  const marker = new google.maps.Marker({
    position: { lat: n.lat, lng: n.lng },
    map: gMap,
    title: n.name,
    zIndex: 10,
    icon: {
      path: google.maps.SymbolPath.CIRCLE,
      scale: special ? 11 : 8,
      fillColor: col,
      fillOpacity: 0.92,
      strokeColor: '#ffffff',
      strokeWeight: 2,
    },
    label: {
      text: shortNodeLabel(n.name),
      color: '#c8d8ee',
      fontSize: '9px',
      fontFamily: 'DM Mono, monospace',
    }
  });

  const hazardText = n.haz == null ? 'N/A' : `${n.haz} / 5`;

  const iw = new google.maps.InfoWindow({
    content: infoPopup('📍 ' + n.name, [
      ['Role', n.name === start ? '🟣 START' : n.name === end ? '🔵 END' : 'Node'],
      ['Flood Hazard', hazardText, col],
      ['Barangay', n.barangay || selectedBarangay || 'N/A'],
    ])
  });

  marker.addListener('click', () => {
    if (activeInfoWindow) activeInfoWindow.close();
    iw.open(gMap, marker);
    activeInfoWindow = iw;
  });

  mapLayers.nodes.push(marker);
}

function drawSelectedPinsOnly(start, end) {
  mapLayers.nodes.forEach(m => m.setMap(null));
  mapLayers.nodes = [];

  if (!selectedBarangay) return;

  const nodes = getBarangayLocations(selectedBarangay);

  nodes.forEach(n => {
    if (n.name !== start && n.name !== end) return;

    const col = nodeColor(n.haz, n.name, start, end);
    const hazardText = n.haz == null ? 'N/A' : `${n.haz} / 5`;

    const marker = new google.maps.Marker({
      position: { lat: n.lat, lng: n.lng },
      map: gMap,
      title: n.name,
      zIndex: 20,
      icon: {
        path: google.maps.SymbolPath.CIRCLE,
        scale: 11,
        fillColor: col,
        fillOpacity: 0.95,
        strokeColor: '#ffffff',
        strokeWeight: 2,
      },
      label: {
        text: n.name === start ? 'S' : 'E',
        color: '#ffffff',
        fontSize: '10px',
        fontFamily: 'DM Mono, monospace',
        fontWeight: 'bold'
      }
    });

    const iw = new google.maps.InfoWindow({
      content: infoPopup('📍 ' + n.name, [
        ['Role', n.name === start ? '🟣 START' : '🔵 END'],
        ['Flood Hazard', hazardText, col],
        ['Barangay', n.barangay || selectedBarangay || 'N/A'],
      ])
    });

    marker.addListener('click', () => {
      if (activeInfoWindow) activeInfoWindow.close();
      iw.open(gMap, marker);
      activeInfoWindow = iw;
    });

    mapLayers.nodes.push(marker);
  });
}

function redrawNodes(start, end) {
  if (!selectedBarangay) return;

  mapLayers.nodes.forEach(m => m.setMap(null));
  mapLayers.nodes = [];

  getBarangayLocations(selectedBarangay).forEach(n => drawNode(n, start, end));
}

function selectBarangay(name) {
  selectedBarangay = name;

  document.querySelectorAll('.bgy-card').forEach(c => c.classList.remove('selected'));

  const pinBtn = document.getElementById('bgyPbtn');
  const staBtn = document.getElementById('bgyStaBtn');

  if (name === 'Pinagbuhatan' && pinBtn) pinBtn.classList.add('selected');
  if (name === 'Sta. Lucia' && staBtn) staBtn.classList.add('selected');

  const nodes = getBarangayLocations(name);
  const locs = nodes.map(n => n.name);

  const startSel = document.getElementById('startSel');
  const endSel = document.getElementById('endSel');

  function populate(sel, exclude) {
    const kept = sel.value !== exclude ? sel.value : '';
    sel.innerHTML = '<option value="">— Select node —</option>';

    locs.forEach(l => {
      if (l === exclude) return;
      sel.innerHTML += `<option value="${l}" ${l === kept ? 'selected' : ''}>${l}</option>`;
    });

    sel.value = kept;
  }

  populate(startSel, null);
  populate(endSel, null);

  startSel.disabled = false;
  endSel.disabled = false;

  startSel.onchange = () => {
    populate(endSel, startSel.value);
    onNodeChange();
  };

  endSel.onchange = () => {
    populate(startSel, endSel.value);
    onNodeChange();
  };

  document.getElementById('emptyMap').style.display = 'none';

  loadBarangayMapOnly(name);
  advanceStep(2);

  document.getElementById('infoBox').innerHTML =
    `<strong>Brgy. ${name}</strong> selected — map loaded. Choose your <strong>start</strong> and <strong>end</strong> nodes below.`;
}

function onNodeChange() {
  const start = document.getElementById('startSel').value;
  const end = document.getElementById('endSel').value;
  const canRun = !!(start && end && start !== end);

  if (canRun) advanceStep(5);
  else if (start || end) advanceStep(4);
  else advanceStep(2);

  document.getElementById('runBtn').disabled = !canRun;

  if (start || end) drawSelectedPinsOnly(start, end);

  if (canRun) {
    document.getElementById('infoBox').innerHTML =
      `Ready! <strong>${start}</strong> → <strong>${end}</strong>. Click <strong>Run Simulation</strong>.`;
  } else if (start && !end) {
    document.getElementById('infoBox').innerHTML =
      `Start selected. Now choose an <strong>end node</strong>.`;
  } else if (!start && end) {
    document.getElementById('infoBox').innerHTML =
      `End selected. Now choose a <strong>start node</strong>.`;
  } else {
    document.getElementById('infoBox').innerHTML =
      `Choose a <strong>start node</strong> from the dropdown.`;
  }
}

function selectHazard(name, el) {
  document.querySelectorAll('.hazard-card:not(.disabled)').forEach(c => c.classList.remove('selected', 'flood'));
  el.classList.add('selected', name.toLowerCase());
  selectedHazard = name;
}

function advanceStep(n) {
  for (let i = 1; i <= 5; i++) {
    const d = document.getElementById('sd' + i);
    const l = document.getElementById('sl' + i);
    d.className = i < n ? 'step-dot done' : i === n ? 'step-dot active' : 'step-dot';
    d.textContent = i < n ? '✓' : i;
    if (l) l.className = i < n ? 'step-line done' : 'step-line';
  }
}

async function runSimulation() {
  const start = document.getElementById('startSel').value;
  const end = document.getElementById('endSel').value;

  if (!start || !end || start === end) return;
  if (!isBackendLive) {
    alert('Backend is not connected.');
    return;
  }

  const loader = document.getElementById('loader');
  const loaderSub = document.getElementById('loaderSub');
  const loaderBar = document.getElementById('loaderBar');
  const runBtn = document.getElementById('runBtn');
  const statusTxt = document.getElementById('statusTxt');

  loader.classList.add('show');
  runBtn.disabled = true;
  statusTxt.textContent = 'Simulating…';

  const msgs = [
    'Fetching graph from database…',
    'Evaluating route options…',
    'Applying lexicographic safety-first rule…',
    'Rendering route overlay…',
    'Classifying results…'
  ];

  let mi = 0;
  const msgTimer = setInterval(() => {
    if (loaderSub) {
      loaderSub.textContent = msgs[Math.min(mi++, msgs.length - 1)];
    }
  }, 420);

  if (loaderBar) {
    loaderBar.style.animation = 'none';
    void loaderBar.offsetWidth;
    loaderBar.style.animation = 'load 2.5s ease-in-out forwards';
  }

  try {
    const res = await fetch(BACKEND + '/simulate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ start, end, hazard: selectedHazard })
    });

    const result = await res.json();

    if (!res.ok || result.error === true) {
      throw new Error(result.message || result.error || 'Simulation failed');
    }

    const routes = normalizeRoutes(result.routes || []);
    result.routes = routes;
    simData = result;

    await renderRoutesOnRoads({
      routes,
      gMap,
      mapLayers,
      getLocationByName,
      redrawNodes,
      start,
      end,
      infoPopup,
      shortNodeLabel,
      activeInfoWindowRef
    });

    showResultsPanel(result);
    document.getElementById('resetBtn').classList.add('show');

    const best = routes.find(r => r.category === 'best');
    const safeCount = routes.filter(r => r.category !== 'eliminated').length;

    document.getElementById('mapInfoBadge').style.display = 'block';
    document.getElementById('mapInfoContent').innerHTML = `
      <div style="font-family:'DM Mono',monospace;font-size:.6rem;color:var(--accent);letter-spacing:1px;margin-bottom:5px;">${selectedHazard.toUpperCase()} SIMULATION</div>
      <div style="font-family:'DM Mono',monospace;font-size:.65rem;color:var(--muted);line-height:1.8;">
        From: <span style="color:var(--text)">${shortNodeLabel(start)}</span><br>
        To: <span style="color:var(--text)">${shortNodeLabel(end)}</span><br>
        Best: <span style="color:var(--green)">${best ? best.distance + ' km' : 'N/A'}</span><br>
        Safe routes: <span style="color:var(--text)">${safeCount}</span>
      </div>`;

    statusTxt.textContent = 'Simulation Complete';
  } catch (err) {
    console.error(err);
    statusTxt.textContent = 'Error';
    alert('Simulation failed: ' + err.message);
  } finally {
    clearInterval(msgTimer);
    loader.classList.remove('show');
    runBtn.disabled = false;
  }
}

function showResultsPanel(result) {
  document.getElementById('resultsPanel').classList.add('show', 'fade-in');
  document.getElementById('resultsActions').classList.add('show');

  const routes = result.routes || [];
  const safe = routes.filter(r => r.category !== 'eliminated');
  const elim = routes.filter(r => r.category === 'eliminated');
  const best = routes.find(r => r.category === 'best');

  document.getElementById('tab-safe').innerHTML = buildTable(safe);
  document.getElementById('tab-elim').innerHTML = elim.length
    ? buildTable(elim)
    : `<div style="font-family:'DM Mono',monospace;font-size:.7rem;color:var(--muted);padding:10px;">No eliminated routes — all paths are within safe hazard threshold.</div>`;

  document.getElementById('tab-summary').innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;padding:4px 0;">
      ${statBox('Total Routes', routes.length, 'var(--text)')}
      ${statBox('Safe Routes', safe.length, 'var(--green)')}
      ${statBox('Eliminated', elim.length, 'var(--red)')}
      ${statBox('Best Dist.', best ? best.distance + ' km' : 'N/A', 'var(--accent)')}
    </div>
    <div style="margin-top:10px;font-family:'DM Mono',monospace;font-size:.62rem;color:var(--muted);">
      Hazard threshold: ≤3 &nbsp;|&nbsp; Algorithm: ACO &nbsp;|&nbsp; Rule: Lexicographic Safety-First &nbsp;|&nbsp; Disaster: ${result.hazard_type || selectedHazard}
    </div>`;

  document.getElementById('resultsSummaryTxt').textContent =
    `${safe.length} safe route${safe.length !== 1 ? 's' : ''} found · ${elim.length} eliminated`;
}

function statBox(label, value, color) {
  return `<div style="background:var(--panel);border:1px solid var(--border);border-radius:8px;padding:10px;text-align:center;">
    <div style="font-family:'DM Mono',monospace;font-size:1.2rem;color:${color};font-weight:500;">${value}</div>
    <div style="font-family:'DM Mono',monospace;font-size:.58rem;color:var(--muted);margin-top:3px;">${label}</div>
  </div>`;
}

function buildTable(routes) {
  if (!routes.length) {
    return `<div style="font-family:'DM Mono',monospace;font-size:.7rem;color:var(--muted);padding:10px;">No routes in this category.</div>`;
  }

  const rows = routes.map((r, i) => {
    const pips = [1, 2, 3, 4, 5].map(p => `<div class="hlevel-pip ${p <= r.max_hazard ? 'on-' + p : ''}"></div>`).join('');
    const pathShort = Array.isArray(r.path) ? r.path.map(shortNodeLabel).join(' → ') : 'N/A';

    return `<tr>
      <td>${i + 1}</td>
      <td><span class="badge badge-${r.category}">${r.category}</span></td>
      <td>${r.distance} km</td>
      <td><div class="hlevel">${pips}</div> <span style="font-size:.6rem;color:var(--muted);margin-left:3px;">${r.max_hazard}/5</span></td>
      <td>${Array.isArray(r.path) ? r.path.length - 1 : 'N/A'}</td>
      <td><div class="path-txt" title="${Array.isArray(r.path) ? r.path.join(' → ') : ''}">${pathShort}</div></td>
    </tr>`;
  }).join('');

  return `<table class="data-table">
    <thead><tr><th>#</th><th>Status</th><th>Distance</th><th>Max Hazard</th><th>Segments</th><th>Path</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

function switchTab(name, el) {
  document.querySelectorAll('.rtab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.rtab-content').forEach(c => c.classList.remove('active'));
  el.classList.add('active');
  document.getElementById('tab-' + name).classList.add('active');
}

function downloadCSV() {
  if (!simData) return;

  const rows = [['Route', 'Category', 'Distance (km)', 'Max Hazard', 'Segments', 'Path']];
  (simData.routes || []).forEach((r, i) => {
    rows.push([
      i + 1,
      r.category,
      r.distance,
      r.max_hazard,
      Array.isArray(r.path) ? r.path.length - 1 : '',
      Array.isArray(r.path) ? r.path.join(' -> ') : ''
    ]);
  });

  const csv = rows.map(r => r.map(v => `"${v}"`).join(',')).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  a.download = `safe_routes_${selectedBarangay || 'barangay'}_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
}

function resetAll() {
  simData = null;
  selectedBarangay = null;
  clearLayers();

  ['startSel', 'endSel'].forEach(id => {
    document.getElementById(id).innerHTML = '<option value="">— Select barangay first —</option>';
    document.getElementById(id).disabled = true;
    document.getElementById(id).value = '';
  });

  document.getElementById('runBtn').disabled = true;
  document.getElementById('resetBtn').classList.remove('show');
  document.getElementById('resultsPanel').classList.remove('show');
  document.getElementById('resultsActions').classList.remove('show');
  document.getElementById('mapInfoBadge').style.display = 'none';
  document.getElementById('mapLegend').style.display = 'none';
  document.getElementById('emptyMap').style.display = 'flex';
  document.getElementById('statusTxt').textContent = 'Ready';

  document.getElementById('infoBox').innerHTML =
    `Select a <strong>barangay</strong> to begin. The ACO algorithm will find the <strong>safest route</strong> using the <strong>lexicographic safety-first rule</strong>.`;

  document.querySelectorAll('.bgy-card').forEach(c => c.classList.remove('selected'));
  advanceStep(1);

  if (gMap) {
    gMap.panTo({ lat: 14.5590, lng: 121.0955 });
    gMap.setZoom(15);
  }
}

async function checkBackend() {
  try {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), 2000);
    const r = await fetch(BACKEND + '/', { signal: c.signal });
    clearTimeout(t);

    if (r.ok) {
      isBackendLive = true;
      const b = document.getElementById('modeBadge');
      if (b) {
        b.textContent = 'LIVE';
        b.style.background = 'rgba(34,197,94,.1)';
        b.style.borderColor = 'rgba(34,197,94,.3)';
        b.style.color = 'var(--green)';
      }
      document.getElementById('statusTxt').textContent = 'Backend Connected';
    }
  } catch (err) {
    isBackendLive = false;
  }
}

window.initMap = initMap;