from datetime import datetime, timezone
from threading import Lock, RLock

from flask import Flask, request, jsonify
from flask_cors import CORS
from earthquake_service import (
    get_earthquake_evacuation_sites,
    simulate_earthquake,
)
from main import simulate, get_locations
from osm_routing import build_flood_hazard_layer_payload, get_barangay_boundary_payload

app = Flask(__name__)
CORS(app)

_SIMULATION_GATE = Lock()
_SIMULATION_STATE_LOCK = RLock()
_SIMULATION_STATE = {
    "busy": False,
    "mode": None,
    "hazard": None,
    "started_at": None,
    "request": None,
}

def _utc_now_iso():
    return datetime.now(timezone.utc).isoformat()

def _serialize_simulation_status():
    with _SIMULATION_STATE_LOCK:
        if not _SIMULATION_STATE["busy"]:
            return {
                "busy": False,
                "mode": None,
                "hazard": None,
                "started_at": None,
                "elapsed_seconds": 0.0,
                "request": None,
            }

        started_at_raw = _SIMULATION_STATE["started_at"]
        started_at = datetime.fromisoformat(started_at_raw)
        elapsed_seconds = max(
            0.0,
            (datetime.now(timezone.utc) - started_at).total_seconds(),
        )
        request_summary = dict(_SIMULATION_STATE["request"] or {})
        return {
            "busy": True,
            "mode": _SIMULATION_STATE["mode"],
            "hazard": _SIMULATION_STATE["hazard"],
            "started_at": started_at_raw,
            "elapsed_seconds": round(elapsed_seconds, 1),
            "request": request_summary,
        }

def _mark_simulation_started(mode, request_summary):
    with _SIMULATION_STATE_LOCK:
        _SIMULATION_STATE["busy"] = True
        _SIMULATION_STATE["mode"] = mode
        _SIMULATION_STATE["hazard"] = request_summary.get("hazard")
        _SIMULATION_STATE["started_at"] = _utc_now_iso()
        _SIMULATION_STATE["request"] = {
            key: value
            for key, value in request_summary.items()
            if value not in (None, "")
        }

def _mark_simulation_finished():
    with _SIMULATION_STATE_LOCK:
        _SIMULATION_STATE["busy"] = False
        _SIMULATION_STATE["mode"] = None
        _SIMULATION_STATE["hazard"] = None
        _SIMULATION_STATE["started_at"] = None
        _SIMULATION_STATE["request"] = None


def _simulation_busy_response():
    status = _serialize_simulation_status()
    return jsonify({
        "error": True,
        "code": "simulation_busy",
        "message": "Another simulation is still running on the backend. Wait for it to finish before starting a new one.",
        "status": status,
    }), 429


def _run_with_simulation_gate(mode, request_summary, work):
    if not _SIMULATION_GATE.acquire(blocking=False):
        return _simulation_busy_response()

    _mark_simulation_started(mode, request_summary)
    try:
        return work()
    finally:
        _mark_simulation_finished()
        _SIMULATION_GATE.release()

@app.route("/", methods=["GET"])
def health():
    return jsonify({"status": "ok"})


@app.route("/simulation-status", methods=["GET"])
def simulation_status():
    return jsonify({
        "error": False,
        "status": _serialize_simulation_status(),
    })

@app.route("/locations", methods=["GET"])
def locations():
    locations_payload = get_locations()
    if locations_payload is None:
        return jsonify({
            "error": True,
            "message": "Failed to load node locations from SQL Server. Check the database connection and the nodes table."
        }), 500

    if not locations_payload:
        return jsonify({
            "error": True,
            "message": "No node locations were returned from SQL Server. Check whether the nodes table has data for the supported barangays."
        }), 500

    return jsonify({
        "error": False,
        "locations": locations_payload
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
        request_summary = {
            "mode": "flood",
            "hazard": hazard,
            "barangay": barangay,
            "start": start,
            "end": end,
        }

        return _run_with_simulation_gate(
            "flood",
            request_summary,
            lambda: jsonify(simulate(start, end, hazard, barangay=barangay)),
        )
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

@app.route("/earthquake/simulate", methods=["POST"])
def run_earthquake():
    try:
        data = request.get_json() or {}
        start = data.get("start")
        barangay = data.get("barangay")
        request_summary = {
            "mode": "earthquake",
            "hazard": "Earthquake",
            "barangay": barangay,
            "start": start,
        }

        def work():
            result = simulate_earthquake(start, barangay)
            status_code = 200 if not result.get("error") else 400
            return jsonify(result), status_code

        return _run_with_simulation_gate(
            "earthquake",
            request_summary,
            work,
        )
    except Exception as e:
        return jsonify({
            "error": True,
            "message": str(e)
        }), 500

if __name__ == "__main__":
    app.run(debug=True, use_reloader=False, host="127.0.0.1", port=5000, threaded=True)
