# AGNAS

**Ant Guided Navigation And Safety System** is a disaster-aware evacuation route simulator for **Barangay Pinagbuhatan** and **Barangay Sta. Lucia** in **Pasig City**.  
The project uses an **Ant Colony Optimization (ACO)** approach with a **lexicographic safety-first rule**, meaning route safety is prioritized before travel distance.

## What It Does

AGNAS helps users explore evacuation routes under two hazard scenarios:

- **Flood**
  - Uses flood hazard classes (`Var 1`, `Var 2`, `Var 3`)
  - Scores road segments by flood risk
  - Highlights safer and riskier route options on the map

- **Earthquake**
  - Uses **liquefaction** and **ground shaking** layers
  - Routes toward configured evacuation sites
  - Supports earthquake result views for different hazard lenses

## Main Features

- ACO-based route search
- Safety-first route ranking
- Interactive Google Maps route display
- Flood hazard overlays
- Earthquake evacuation site routing
- Route list with risk summaries
- Themed UI for flood and earthquake modes
- SQL Server-backed location storage

## Tech Stack

- **Frontend:** HTML, CSS, JavaScript, Google Maps API
- **Backend:** Python, Flask, Flask-CORS
- **Routing/Data:** OSMnx, NetworkX, Shapely, GeoPandas
- **Database:** SQL Server via `pyodbc`

## Project Structure

```text
Disaster-route-sim/
├─ Backend/
│  ├─ app.py
│  ├─ main.py
│  ├─ osm_routing.py
│  ├─ earthquake_service.py
│  ├─ earthquake_data.py
│  ├─ requirements.txt
│  └─ data/
│     ├─ boundaries/
│     ├─ earthquake/
│     └─ flood_classes/
├─ Frontend/
│  ├─ index.html
│  ├─ script.js
│  ├─ osm.js
│  ├─ earthquake.js
│  ├─ flood.js
│  └─ style.css
└─ README.md
```

## Setup

### 1. Install backend dependencies

```bash
pip install -r Backend/requirements.txt
```

### 2. Configure SQL Server

Update the SQL Server connection in `Backend/data/database.py` so it matches your local machine:

- `SERVER`
- `DATABASE`
- trusted connection / driver settings

The project expects tables such as:

- `nodes`
- `edges`
- `flood_hazard`

If your team is using seed files, run those first before launching the backend.

### 3. Check map/API setup

The frontend currently uses the **Google Maps JavaScript API** from `Frontend/index.html`.  
If needed, replace the API key with your own valid key before deployment or sharing.

### 4. Run the backend

```bash
py Backend/app.py
```

The Flask server runs on:

```text
http://127.0.0.1:5000
```

### 5. Run the frontend

Open the frontend with a local static server such as **VS Code Live Server**, or serve the `Frontend/` folder over HTTP.

Example:

```bash
cd Frontend
py -m http.server 5500
```

Then open:

```text
http://127.0.0.1:5500
```

## Supported Scope

- **Flood routing:** Pinagbuhatan and Sta. Lucia
- **Earthquake routing:** Pinagbuhatan and Sta. Lucia

## Backend Routes

Main backend endpoints include:

- `GET /locations`
- `GET /barangay-boundary`
- `GET /flood-hazard-layers`
- `POST /simulate`
- `POST /prewarm-simulation`
- `GET /earthquake/evac-sites`
- `POST /earthquake/prewarm`
- `POST /earthquake/simulate`

## Notes

- Flood routing now uses the split flood class GeoJSON files in `Backend/data/flood_classes/`
- Earthquake routing uses:
  - `evacuation_sites.json`
  - `liquefaction.geojson`
  - `ground_shaking.geojson`
- The UI is designed for simulation and route review, not full live turn-by-turn navigation

## Authors
Ambulario, Ranielle Pearl C.
Gaces, Winrock, D.
Globiogo, Jefferson, T.
Nunez, Jessa, S.

Built as a disaster route simulation project focused on safer evacuation path analysis for selected barangays in Pasig City.
