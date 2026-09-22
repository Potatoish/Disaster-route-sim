import json
import sys
sys.path.insert(0, '.')
import osm_routing
osm_routing.DEBUG = False
from earthquake_service import simulate_earthquake

results = {}
for start_name, barangay in [
    ("Novo Pinagbuhatan", "Pinagbuhatan"),
    ("Pasig Skatepark", "Sta. Lucia"),
]:
    print(f"Running earthquake sim for {start_name} ({barangay})...", flush=True)
    result = simulate_earthquake(start_name, barangay)
    results[start_name] = result

with open("tools/eq_spotcheck_report.json", "w", encoding="utf-8") as f:
    json.dump(results, f, indent=2, default=str)

print("DONE")
