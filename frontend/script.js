let map;
let routeLine;

// Replace these coordinates later with your exact coordinates.
// For UI testing, these are fine placeholders around Pasig area.
const nodes = {
  "Novo Pinagbuhatan": { lat: 14.5760, lng: 121.0850 },
  "Kenneth Talipapa": { lat: 14.5770, lng: 121.0860 },
  "Pinagbuhatan High School": { lat: 14.5780, lng: 121.0870 },
  "Pinagbuhatan Ferry station": { lat: 14.5790, lng: 121.0880 },
  "Pinagbuhatan Barangay Hall": { lat: 14.5800, lng: 121.0890 },
  "2 Centennial Street, Pinagbuhatan": { lat: 14.5810, lng: 121.0900 }
};

function initMap() {
  // Center map on Pinagbuhatan
  map = new google.maps.Map(document.getElementById("map"), {
    center: nodes["Novo Pinagbuhatan"],
    zoom: 14,
    mapTypeId: "roadmap",
    // Optional: make the map a bit darker-ish
    styles: [
      { elementType: "geometry", stylers: [{ saturation: -10 }, { lightness: -5 }] },
      { elementType: "labels.text.stroke", stylers: [{ lightness: -80 }] },
      { elementType: "labels.text.fill", stylers: [{ lightness: 20 }] }
    ]
  });

  // Markers
  Object.entries(nodes).forEach(([name, pos]) => {
    new google.maps.Marker({
      position: pos,
      map,
      title: name
    });
  });

  // Button click: UI-only demo route
  document.getElementById("runBtn").addEventListener("click", () => {
    const start = document.getElementById("start").value;
    const end = document.getElementById("end").value;

    if (start === end) {
      alert("Start and End must be different.");
      return;
    }

    // Demo route logic (UI-only):
    // Always goes via Barangay Hall if start/end not equal
    const demoPath = buildDemoPath(start, end);

    drawRoute(demoPath);
    fitToPath(demoPath);
  });
}

function buildDemoPath(start, end) {
  const via = "Pinagbuhatan Barangay Hall";

  // If start or end is already the via node, avoid duplicates
  const path = [start];
  if (start !== via && end !== via) path.push(via);
  path.push(end);

  // Remove duplicates if any
  return path.filter((node, idx) => path.indexOf(node) === idx);
}

function drawRoute(pathNames) {
  // Clear previous route
  if (routeLine) routeLine.setMap(null);

  const coords = pathNames
    .map(name => nodes[name])
    .filter(Boolean);

  routeLine = new google.maps.Polyline({
    path: coords,
    geodesic: true,
    strokeOpacity: 1.0,
    strokeWeight: 6
    // Don't set color yet if you want; later you’ll color based on best/available/eliminated
  });

  routeLine.setMap(map);
}

function fitToPath(pathNames) {
  const bounds = new google.maps.LatLngBounds();
  pathNames.forEach(name => {
    const p = nodes[name];
    if (p) bounds.extend(p);
  });
  map.fitBounds(bounds);
}
// Expose initMap globally for Google callback
window.initMap = initMap;