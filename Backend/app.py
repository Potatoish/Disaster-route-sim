from flask import Flask, request, jsonify
from flask_cors import CORS
from earthquake_test_service import (
    get_earthquake_test_evacuation_sites,
    simulate_earthquake_test,
)
from main import simulate, get_locations, prewarm_simulation, warm_startup_data
from osm_routing import get_barangay_boundary_payload

app = Flask(__name__)
CORS(app)

try:
    warm_startup_data()
except Exception as e:
    print(f"[STARTUP] Warmup skipped: {e}")

@app.route("/", methods=["GET"])
def health():
    return jsonify({"status": "ok"})

@app.route("/locations", methods=["GET"])
def locations():
    return jsonify({
        "error": False,
        "locations": get_locations()
    })

@app.route("/barangay-boundary", methods=["GET"])
def barangay_boundary():
    try:
        name = (request.args.get("name") or "").strip()
        if not name:
            return jsonify({
                "error": True,
                "message": "Barangay name is required"
            }), 400

        boundary = get_barangay_boundary_payload(name)
        if boundary is None:
            return jsonify({
                "error": True,
                "message": f"No boundary found for '{name}'"
            }), 404

        return jsonify({
            "error": False,
            "boundary": boundary
        })
    except Exception as e:
        return jsonify({
            "error": True,
            "message": str(e)
        }), 500

@app.route("/simulate", methods=["POST"])
def run_simulation():
    try:
        data = request.get_json() or {}
        start = data.get("start")
        end = data.get("end")
        hazard = data.get("hazard", "Flood")
        barangay = data.get("barangay")
        result = simulate(start, end, hazard, barangay=barangay)
        return jsonify(result)
    except Exception as e:
        return jsonify({
            "error": True,
            "message": str(e)
        }), 500

@app.route("/prewarm-simulation", methods=["POST"])
def warm_simulation():
    try:
        data = request.get_json() or {}
        start = data.get("start")
        end = data.get("end")
        barangay = data.get("barangay")
        result = prewarm_simulation(start, end, barangay=barangay)
        status_code = 200 if not result.get("error") else 400
        return jsonify(result), status_code
    except Exception as e:
        return jsonify({
            "error": True,
            "message": str(e)
        }), 500

@app.route("/earthquake-test/evac-sites", methods=["GET"])
def earthquake_test_evac_sites():
    try:
        barangay = (request.args.get("barangay") or "").strip()
        result = get_earthquake_test_evacuation_sites(barangay)
        status_code = 200 if not result.get("error") else 400
        return jsonify(result), status_code
    except Exception as e:
        return jsonify({
            "error": True,
            "message": str(e)
        }), 500

@app.route("/earthquake-test/simulate", methods=["POST"])
def run_earthquake_test():
    try:
        data = request.get_json() or {}
        start = data.get("start")
        barangay = data.get("barangay")
        result = simulate_earthquake_test(start, barangay)
        status_code = 200 if not result.get("error") else 400
        return jsonify(result), status_code
    except Exception as e:
        return jsonify({
            "error": True,
            "message": str(e)
        }), 500

if __name__ == "__main__":
    app.run(debug=True, use_reloader=False, host="127.0.0.1", port=5000, threaded=True)
