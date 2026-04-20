from flask import Flask, request, jsonify
from flask_cors import CORS
from earthquake_service import (
    get_earthquake_evacuation_sites,
    prewarm_earthquake,
    simulate_earthquake,
)
from main import simulate, get_locations, prewarm_simulation, warm_startup_data
from osm_routing import build_flood_hazard_layer_payload, get_barangay_boundary_payload

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
@app.route("/barangay-boundary/<path:name>", methods=["GET"])
def barangay_boundary(name=None):
    try:
        name = (name or request.args.get("name") or "").strip()
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

@app.route("/flood-hazard-layers", methods=["GET"])
def flood_hazard_layers():
    try:
        barangay = (request.args.get("barangay") or "").strip()
        scope = (request.args.get("scope") or "barangay_buffer").strip().lower()
        vars_param = (request.args.get("vars") or "").strip()
        vars_filter = [
            int(value)
            for value in vars_param.split(",")
            if value.strip().isdigit()
        ] if vars_param else None

        if scope == "city":
            payload = build_flood_hazard_layer_payload(
                vars_filter=vars_filter,
                clip_scope="city",
            )
        else:
            if not barangay:
                return jsonify({
                    "error": True,
                    "message": "Barangay name is required"
                }), 400

            payload = build_flood_hazard_layer_payload(
                barangay,
                vars_filter=vars_filter,
                clip_scope="barangay_buffer" if scope == "barangay_buffer" else "barangay",
            )
        if payload is None:
            return jsonify({
                "error": True,
                "message": f"No flood hazard layers found for '{barangay or 'Pasig City'}'"
            }), 404

        return jsonify({
            "error": False,
            **payload,
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

@app.route("/earthquake/evac-sites", methods=["GET"])
def earthquake_evac_sites():
    try:
        barangay = (request.args.get("barangay") or "").strip()
        result = get_earthquake_evacuation_sites(barangay)
        status_code = 200 if not result.get("error") else 400
        return jsonify(result), status_code
    except Exception as e:
        return jsonify({
            "error": True,
            "message": str(e)
        }), 500

@app.route("/earthquake/prewarm", methods=["POST"])
def warm_earthquake():
    try:
        data = request.get_json() or {}
        barangay = data.get("barangay")
        result = prewarm_earthquake(barangay)
        status_code = 200 if not result.get("error") else 400
        return jsonify(result), status_code
    except Exception as e:
        return jsonify({
            "error": True,
            "message": str(e)
        }), 500

@app.route("/earthquake/simulate", methods=["POST"])
def run_earthquake():
    try:
        data = request.get_json() or {}
        start = data.get("start")
        barangay = data.get("barangay")
        result = simulate_earthquake(start, barangay)
        status_code = 200 if not result.get("error") else 400
        return jsonify(result), status_code
    except Exception as e:
        return jsonify({
            "error": True,
            "message": str(e)
        }), 500

if __name__ == "__main__":
    app.run(debug=True, use_reloader=False, host="127.0.0.1", port=5000, threaded=True)
