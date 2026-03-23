const BACKEND = 'http://localhost:5000';

const BARANGAY_DATA = {
  'Pinagbuhatan': {
    center: { lat: 14.5605, lng: 121.0925 }, zoom: 16,
    nodes: [
      { id: 'Novo Pinagbuhatan', lat: 14.5631, lng: 121.0891, haz: 3 },
      { id: 'Kenneth Talipapa', lat: 14.5618, lng: 121.0912, haz: 3 },
      { id: 'Pinagbuhatan High School', lat: 14.5592, lng: 121.0934, haz: 2 },
      { id: 'Pinagbuhatan Ferry Station', lat: 14.5578, lng: 121.0958, haz: 5 },
      { id: 'Pinagbuhatan Barangay Hall', lat: 14.5605, lng: 121.0923, haz: 2 },
      { id: '2 Centennial Street, Pinagbuhatan', lat: 14.5598, lng: 121.0952, haz: 2 },
    ],
    edges: [
      { from: 'Novo Pinagbuhatan', to: 'Kenneth Talipapa', haz: 3 },
      { from: 'Kenneth Talipapa', to: 'Pinagbuhatan Barangay Hall', haz: 2 },
      { from: 'Pinagbuhatan Barangay Hall', to: 'Pinagbuhatan High School', haz: 2 },
      { from: 'Pinagbuhatan High School', to: 'Pinagbuhatan Ferry Station', haz: 5 },
      { from: 'Pinagbuhatan Ferry Station', to: '2 Centennial Street, Pinagbuhatan', haz: 5 },
      { from: 'Pinagbuhatan Barangay Hall', to: '2 Centennial Street, Pinagbuhatan', haz: 2 },
      { from: 'Kenneth Talipapa', to: 'Pinagbuhatan Ferry Station', haz: 5 },
      { from: 'Novo Pinagbuhatan', to: 'Pinagbuhatan High School', haz: 2 },
    ]
  },
  'Sta. Lucia': {
    center: { lat: 14.5580, lng: 121.0995 }, zoom: 16,
    nodes: [
      { id: 'Sta. Lucia Barangay Hall', lat: 14.5601, lng: 121.0978, haz: 2 },
      { id: 'St Jude Thaddeus, Sta. Lucia', lat: 14.5582, lng: 121.0995, haz: 1 },
      { id: 'Sta. Lucia High School', lat: 14.5571, lng: 121.0998, haz: 2 },
      { id: 'De Castro Elementary School', lat: 14.5563, lng: 121.1012, haz: 2 },
      { id: 'Barangay Sta. Lucia Health Center', lat: 14.5589, lng: 121.0980, haz: 1 },
      { id: 'Mabuhay Subdivision', lat: 14.5555, lng: 121.1028, haz: 1 },
    ],
    edges: [
      { from: 'Sta. Lucia Barangay Hall', to: 'Barangay Sta. Lucia Health Center', haz: 1 },
      { from: 'Barangay Sta. Lucia Health Center', to: 'St Jude Thaddeus, Sta. Lucia', haz: 1 },
      { from: 'St Jude Thaddeus, Sta. Lucia', to: 'Sta. Lucia High School', haz: 2 },
      { from: 'Sta. Lucia High School', to: 'De Castro Elementary School', haz: 2 },
      { from: 'De Castro Elementary School', to: 'Mabuhay Subdivision', haz: 1 },
      { from: 'Sta. Lucia Barangay Hall', to: 'Sta. Lucia High School', haz: 2 },
      { from: 'Barangay Sta. Lucia Health Center', to: 'Mabuhay Subdivision', haz: 1 },
    ]
  }
};

let gMap = null;
let selectedBarangay = null;
let selectedHazard = 'Flood';
let simData = null;
let isBackendLive = false;
let mapLayers = { edges: [], nodes: [], routes: [] };
let activeInfoWindow = null;
let bestRouteAnimator = null;
let movingRouteMarker = null;

const MAP_STYLES = [
  { elementType: 'geometry', stylers: [{ color: '#0d1117' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#8896a5' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#0d1117' }] },
  { featureType: 'administrative', elementType: 'geometry', stylers: [{ color: '#1c2a3a' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#1c2a3a' }] },
  { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#94a3b8' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#243040' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0a1628' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#1e3a5f' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'landscape', elementType: 'geometry', stylers: [{ color: '#0d1520' }] },
];

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

  checkBackend();
}

function clearRouteAnimation() {
  if (bestRouteAnimator) {
    clearInterval(bestRouteAnimator);
    bestRouteAnimator = null;
  }
  if (movingRouteMarker) {
    movingRouteMarker.setMap(null);
    movingRouteMarker = null;
  }
}

function clearLayers() {
  clearRouteAnimation();
  [...mapLayers.edges, ...mapLayers.nodes, ...mapLayers.routes].forEach(o => o.setMap(null));
  mapLayers = { edges: [], nodes: [], routes: [] };
  if (activeInfoWindow) {
    activeInfoWindow.close();
    activeInfoWindow = null;
  }
}

function nodeColor(haz, id, start, end) {
  if (id === start) return '#a855f7';
  if (id === end) return '#06b6d4';
  if (haz <= 2) return '#22c55e';
  if (haz === 3) return '#eab308';
  return '#ef4444';
}

function interpolatePoints(a, b, steps = 14) {
  const points = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    points.push({
      lat: a.lat + (b.lat - a.lat) * t,
      lng: a.lng + (b.lng - a.lng) * t
    });
  }
  return points;
}

function buildSmoothPath(pathIds, data) {
  const pts = [];
  for (let i = 0; i < pathIds.length - 1; i++) {
    const a = data.nodes.find(n => n.id === pathIds[i]);
    const b = data.nodes.find(n => n.id === pathIds[i + 1]);
    if (!a || !b) continue;

    const segment = interpolatePoints(a, b, 14);
    if (pts.length > 0) segment.shift();
    pts.push(...segment);
  }
  return pts;
}

function shortNodeLabel(name) {
  return name.split(',')[0].split(' ').slice(0, 2).join(' ');
}

function infoPopup(title, rows) {
  return `<div style="padding:10px 2px 4px;">
    <div class="popup-title">${title}</div>
    ${rows.map(([k,v,c])=>`<div class="popup-row"><span>${k}</span><span style="${c ? 'color:'+c : ''}">${v}</span></div>`).join('')}
  </div>`;
}

function loadBarangayMapOnly(bgyName) {
  clearLayers();

  const data = BARANGAY_DATA[bgyName];

  document.getElementById('mapLegend').style.display = 'none';
  document.getElementById('mapInfoBadge').style.display = 'none';

  gMap.panTo(data.center);
  setTimeout(() => gMap.setZoom(data.zoom), 150);
}

function drawNode(n, start, end) {
  const col = nodeColor(n.haz, n.id, start, end);
  const special = n.id === start || n.id === end;

  const marker = new google.maps.Marker({
    position: { lat: n.lat, lng: n.lng },
    map: gMap,
    title: n.id,
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
      text: shortNodeLabel(n.id),
      color: '#c8d8ee',
      fontSize: '9px',
      fontFamily: 'DM Mono, monospace',
    }
  });

  const iw = new google.maps.InfoWindow({
    content: infoPopup('📍 ' + n.id, [
      ['Role', n.id === start ? '🟣 START' : n.id === end ? '🔵 END' : 'Node'],
      ['Flood Hazard', n.haz + ' / 5', col],
      ['Barangay', selectedBarangay],
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

  const data = BARANGAY_DATA[selectedBarangay];

  data.nodes.forEach(n => {
    if (n.id !== start && n.id !== end) return;

    const col = nodeColor(n.haz, n.id, start, end);

    const marker = new google.maps.Marker({
      position: { lat: n.lat, lng: n.lng },
      map: gMap,
      title: n.id,
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
        text: n.id === start ? 'S' : 'E',
        color: '#ffffff',
        fontSize: '10px',
        fontFamily: 'DM Mono, monospace',
        fontWeight: 'bold'
      }
    });

    const iw = new google.maps.InfoWindow({
      content: infoPopup('📍 ' + n.id, [
        ['Role', n.id === start ? '🟣 START' : '🔵 END'],
        ['Flood Hazard', n.haz + ' / 5', col],
        ['Barangay', selectedBarangay],
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
  BARANGAY_DATA[selectedBarangay].nodes.forEach(n => drawNode(n, start, end));
}

function animateBestRoute(polyline) {
  clearRouteAnimation();

  const path = polyline.getPath();
  if (!path || path.getLength() < 2) return;

  let arrowOffset = 0;
  let markerIndex = 0;

  const icons = [{
    icon: {
      path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
      scale: 4,
      strokeColor: '#ffffff',
      strokeWeight: 2,
      fillColor: '#22c55e',
      fillOpacity: 1
    },
    offset: '0%'
  }];

  polyline.set('icons', icons);

  movingRouteMarker = new google.maps.Marker({
    position: path.getAt(0),
    map: gMap,
    zIndex: 999,
    icon: {
      url: "assets/ant.png",
      scaledSize: new google.maps.Size(40, 40),
      anchor: new google.maps.Point(20, 20)
    }
  });

  bestRouteAnimator = setInterval(() => {
    arrowOffset = (arrowOffset + 1) % 200;

    const updatedIcons = polyline.get('icons');
    updatedIcons[0].offset = (arrowOffset / 2) + '%';
    polyline.set('icons', updatedIcons);

    markerIndex = (markerIndex + 1) % path.getLength();
    const nextPos = path.getAt(markerIndex);
    movingRouteMarker.setPosition(nextPos);

    if (markerIndex % 4 === 0) {
      gMap.panTo(nextPos);
    }
  }, 220);
}

function drawResults(result, start, end) {
  clearRouteAnimation();
  mapLayers.routes.forEach(l => l.setMap(null));
  mapLayers.routes = [];

  const data = BARANGAY_DATA[selectedBarangay];
  const CFG = {
    best: { color: '#22c55e', weight: 7, opacity: 1, zIndex: 6 },
    available: { color: '#f59e0b', weight: 4, opacity: 0.8, zIndex: 3 },
    eliminated: { color: '#ef4444', weight: 2.5, opacity: 0.30, zIndex: 1 },
  };

  [...result.routes].reverse().forEach(route => {
    const cfg = CFG[route.category] || CFG.eliminated;
    const path = route.path;
    const pts = buildSmoothPath(path, data);
    if (!pts.length) return;

    if (route.category === 'best') {
      mapLayers.routes.push(new google.maps.Polyline({
        path: pts,
        geodesic: true,
        strokeColor: '#22c55e',
        strokeOpacity: 0.08,
        strokeWeight: 24,
        map: gMap,
        zIndex: 0,
      }));

      mapLayers.routes.push(new google.maps.Polyline({
        path: pts,
        geodesic: true,
        strokeColor: '#86efac',
        strokeOpacity: 0.16,
        strokeWeight: 14,
        map: gMap,
        zIndex: 1,
      }));
    }

    const icons = route.category === 'available'
      ? [{ icon: { path: 'M 0,-1 0,1', strokeOpacity: 1, scale: 3 }, offset: '0', repeat: '14px' }]
      : route.category === 'eliminated'
      ? [{ icon: { path: 'M 0,-1 0,1', strokeOpacity: .5, scale: 2 }, offset: '0', repeat: '8px' }]
      : [];

    const poly = new google.maps.Polyline({
      path: pts,
      geodesic: true,
      strokeColor: cfg.color,
      strokeOpacity: cfg.opacity,
      strokeWeight: cfg.weight,
      icons,
      map: gMap,
      zIndex: cfg.zIndex,
    });

    const label = route.category === 'best'
      ? '🏆 Best Route'
      : route.category === 'available'
      ? '✅ Available Route'
      : '❌ Eliminated';

    poly.addListener('click', ev => {
      if (activeInfoWindow) activeInfoWindow.close();
      activeInfoWindow = new google.maps.InfoWindow({
        content: infoPopup(label, [
          ['Distance', route.distance + ' km'],
          ['Max Hazard', route.max_hazard + '/5', cfg.color],
          ['Segments', route.path.length - 1],
          ['Path', route.path.map(shortNodeLabel).join(' → ')],
        ]),
        position: ev.latLng,
      });
      activeInfoWindow.open(gMap);
    });

    mapLayers.routes.push(poly);

    if (route.category === 'best') {
      animateBestRoute(poly);
    }
  });

  redrawNodes(start, end);

  document.getElementById('mapLegend').style.display = 'block';

  const best = result.routes.find(r => r.category === 'best');
  if (best && best.path.length >= 2) {
    const bounds = new google.maps.LatLngBounds();
    best.path.forEach(id => {
      const n = data.nodes.find(x => x.id === id);
      if (n) bounds.extend({ lat: n.lat, lng: n.lng });
    });
    gMap.fitBounds(bounds, 60);
  }
}

function selectBarangay(name) {
  selectedBarangay = name;

  document.querySelectorAll('.bgy-card').forEach(c => c.classList.remove('selected'));
  document.getElementById(name === 'Pinagbuhatan' ? 'bgyPbtn' : 'bgyStaBtn').classList.add('selected');

  const locs = BARANGAY_DATA[name].nodes.map(n => n.id);
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

  startSel.onchange = () => { populate(endSel, startSel.value); onNodeChange(); };
  endSel.onchange = () => { populate(startSel, endSel.value); onNodeChange(); };

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

  clearRouteAnimation();

  const loader = document.getElementById('loader');
  loader.classList.add('show');
  document.getElementById('runBtn').disabled = true;
  document.getElementById('statusTxt').textContent = 'Simulating…';

  const msgs = [
    'Initializing ant colony…',
    'Evaluating flood hazard levels…',
    'Applying lexicographic safety-first rule…',
    'Reinforcing pheromone trails…',
    'Converging on optimal route…',
    'Classifying results…'
  ];

  let mi = 0;
  const msgTimer = setInterval(() => {
    document.getElementById('loaderSub').textContent = msgs[Math.min(mi++, msgs.length - 1)];
  }, 420);

  document.getElementById('loaderBar').style.animation = 'none';
  void document.getElementById('loaderBar').offsetWidth;
  document.getElementById('loaderBar').style.animation = 'load 2.5s ease-in-out forwards';

  try {
    let result;

    if (isBackendLive) {
      const res = await fetch(BACKEND + '/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ start, end, hazard_type: selectedHazard })
      });
      result = await res.json();
    } else {
      await new Promise(r => setTimeout(r, 2600));
      result = getMockData(start, end);
    }

    simData = result;

    clearInterval(msgTimer);
    loader.classList.remove('show');
    document.getElementById('statusTxt').textContent = 'Simulation Complete';

    drawResults(result, start, end);
    showResultsPanel(result);
    document.getElementById('resetBtn').classList.add('show');

    const best = result.routes.find(r => r.category === 'best');
    const safeCount = result.routes.filter(r => r.category !== 'eliminated').length;

    document.getElementById('mapInfoBadge').style.display = 'block';
    document.getElementById('mapInfoContent').innerHTML = `
      <div style="font-family:'DM Mono',monospace;font-size:.6rem;color:var(--accent);letter-spacing:1px;margin-bottom:5px;">${selectedHazard.toUpperCase()} SIMULATION</div>
      <div style="font-family:'DM Mono',monospace;font-size:.65rem;color:var(--muted);line-height:1.8;">
        From: <span style="color:var(--text)">${shortNodeLabel(start)}</span><br>
        To: <span style="color:var(--text)">${shortNodeLabel(end)}</span><br>
        Best: <span style="color:var(--green)">${best ? best.distance + ' km' : 'N/A'}</span><br>
        Safe routes: <span style="color:var(--text)">${safeCount}</span>
      </div>`;
  } catch(err) {
    clearInterval(msgTimer);
    loader.classList.remove('show');
    document.getElementById('statusTxt').textContent = 'Error';
    alert('Simulation failed: ' + err.message);
    document.getElementById('runBtn').disabled = false;
  }
}

function showResultsPanel(result) {
  document.getElementById('resultsPanel').classList.add('show', 'fade-in');
  document.getElementById('resultsActions').classList.add('show');

  const safe = result.routes.filter(r => r.category !== 'eliminated');
  const elim = result.routes.filter(r => r.category === 'eliminated');
  const best = result.routes.find(r => r.category === 'best');

  document.getElementById('tab-safe').innerHTML = buildTable(safe);
  document.getElementById('tab-elim').innerHTML = elim.length
    ? buildTable(elim)
    : `<div style="font-family:'DM Mono',monospace;font-size:.7rem;color:var(--muted);padding:10px;">No eliminated routes — all paths are within safe hazard threshold.</div>`;

  document.getElementById('tab-summary').innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;padding:4px 0;">
      ${statBox('Total Routes', result.routes.length, 'var(--text)')}
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
    const pips = [1,2,3,4,5].map(p => `<div class="hlevel-pip ${p <= r.max_hazard ? 'on-' + p : ''}"></div>`).join('');
    const pathShort = r.path.map(shortNodeLabel).join(' → ');

    return `<tr>
      <td>${i + 1}</td>
      <td><span class="badge badge-${r.category}">${r.category}</span></td>
      <td>${r.distance} km</td>
      <td><div class="hlevel">${pips}</div> <span style="font-size:.6rem;color:var(--muted);margin-left:3px;">${r.max_hazard}/5</span></td>
      <td>${r.path.length - 1}</td>
      <td><div class="path-txt" title="${r.path.join(' → ')}">${pathShort}</div></td>
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

  const rows = [['Route','Category','Distance (km)','Max Hazard','Segments','Path']];
  simData.routes.forEach((r, i) => rows.push([i + 1, r.category, r.distance, r.max_hazard, r.path.length - 1, r.path.join(' -> ')]));

  const csv = rows.map(r => r.map(v => `"${v}"`).join(',')).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  a.download = `safe_routes_${selectedBarangay}_${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
}

function resetAll() {
  simData = null;
  selectedBarangay = null;
  clearLayers();

  ['startSel','endSel'].forEach(id => {
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
      b.textContent = 'LIVE';
      b.style.background = 'rgba(34,197,94,.1)';
      b.style.borderColor = 'rgba(34,197,94,.3)';
      b.style.color = 'var(--green)';
      document.getElementById('statusTxt').textContent = 'Backend Connected';
    }
  } catch {}
}

function getNeighbors(barangayName, nodeId) {
  const data = BARANGAY_DATA[barangayName];
  const neighbors = [];

  data.edges.forEach(e => {
    if (e.from === nodeId) neighbors.push(e.to);
    if (e.to === nodeId) neighbors.push(e.from);
  });

  return [...new Set(neighbors)];
}

function bfsPath(barangayName, start, end) {
  if (start === end) return [start];

  const queue = [[start]];
  const visited = new Set([start]);

  while (queue.length) {
    const path = queue.shift();
    const last = path[path.length - 1];

    const neighbors = getNeighbors(barangayName, last);
    for (const next of neighbors) {
      if (visited.has(next)) continue;

      const newPath = [...path, next];
      if (next === end) return newPath;

      visited.add(next);
      queue.push(newPath);
    }
  }

  return [start, end];
}

function getPathMaxHazard(barangayName, path) {
  const data = BARANGAY_DATA[barangayName];
  let maxHaz = 0;

  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i];
    const b = path[i + 1];
    const edge = data.edges.find(e =>
      (e.from === a && e.to === b) || (e.from === b && e.to === a)
    );
    if (edge) maxHaz = Math.max(maxHaz, edge.haz);
  }

  return maxHaz;
}

function getMockData(start, end) {
  const bestPath = bfsPath(selectedBarangay, start, end);

  const data = BARANGAY_DATA[selectedBarangay];
  const altMid = data.nodes.find(n => n.id !== start && n.id !== end && !bestPath.includes(n.id));
  const altPath = altMid ? [start, altMid.id, end] : [...bestPath];

  const bestHaz = Math.min(getPathMaxHazard(selectedBarangay, bestPath) || 2, 2);
  const altHaz = Math.max(3, Math.min(getPathMaxHazard(selectedBarangay, altPath) || 3, 3));

  return {
    start,
    end,
    hazard_type: selectedHazard,
    routes: [
      {
        path: bestPath,
        distance: (1 + (bestPath.length - 1) * 0.35).toFixed(1),
        max_hazard: bestHaz,
        total_hazard: bestHaz * (bestPath.length - 1),
        category: 'best'
      },
      {
        path: altPath,
        distance: (1.2 + (altPath.length - 1) * 0.4).toFixed(1),
        max_hazard: altHaz,
        total_hazard: altHaz * (altPath.length - 1),
        category: 'available'
      },
      {
        path: bestPath,
        distance: (1.1 + (bestPath.length - 1) * 0.38).toFixed(1),
        max_hazard: 5,
        total_hazard: 10,
        category: 'eliminated'
      }
    ]
  };
}