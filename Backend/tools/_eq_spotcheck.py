import json
import sys
sys.path.insert(0, '.')
import osm_routing
osm_routing.DEBUG = False
from earthquake_service import simulate_earthquake

results = {}
for start, barangay in [
    ({"label": "Novo Pinagbuhatan", "lat": 14.558085412, "lng": 121.084921938}, "Pinagbuhatan"),
    ({"label": "Pasig Skatepark", "lat": 14.575852237, "lng": 121.101736924}, "Sta. Lucia"),
]:
    print(f"Running earthquake sim for {start['label']} ({barangay})...", flush=True)
    result = simulate_earthquake(start, barangay)
    results[start["label"]] = result

with open("tools/eq_spotcheck_report.json", "w", encoding="utf-8") as f:
    json.dump(results, f, indent=2, default=str)

print("DONE")
