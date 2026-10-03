import json
import os
import time
import uuid
from collections import OrderedDict, deque
from datetime import datetime, timezone
from pathlib import Path
from threading import Condition, RLock, Thread

from flask import Flask, request, jsonify, render_template
from flask_cors import CORS
from contact_service import record_feedback, send_contact_message
from earthquake_service import (
    check_earthquake_pin,
    get_earthquake_evacuation_sites,
    simulate_earthquake,
)
from main import simulate, get_locations
from osm_routing import (
    build_flood_hazard_layer_payload,
    check_flood_pin,
    get_barangay_boundary_payload,
)
from simulation_progress import get_progress, reset_progress

# The pages and their CSS/JS/images live in Frontend/, next to Backend/.
FRONTEND_DIR = Path(__file__).resolve().parent.parent / "Frontend"

# /health never renders a page, so a deploy that left Frontend/ out would pass
# Railway's health check and go live with every page broken. Refuse to start
# instead, which keeps the previous deploy serving.
if not (FRONTEND_DIR / "templates" / "index.html").is_file():
    raise RuntimeError(
        f"Frontend not found at {FRONTEND_DIR}. Build and deploy from the "
        "repository root so both Frontend/ and Backend/ are included."
    )

app = Flask(
    __name__,
    template_folder=str(FRONTEND_DIR / "templates"),
    static_folder=str(FRONTEND_DIR / "static"),
    static_url_path="/static",
)
CORS(app)


@app.url_defaults
def _version_static_urls(endpoint, values):
    # Production sends static files with no Cache-Control, so phones fall back
    # to heuristic caching and can keep serving an old home.css/script.js for
    # hours after a deploy. Stamping every url_for('static', ...) with the
    # file's mtime changes the URL whenever the file does, forcing a refetch.
    if endpoint != "static" or "v" in values:
        return
    filename = values.get("filename")
    if not filename:
        return
    try:
        values["v"] = int(os.stat(os.path.join(app.static_folder, filename)).st_mtime)
    except OSError:
        pass

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
    with _JOBS_LOCK:
        queue_length = len(_JOB_QUEUE)
    with _SIMULATION_STATE_LOCK:
        if not _SIMULATION_STATE["busy"]:
            return {
                "busy": False,
                "mode": None,
                "hazard": None,
                "started_at": None,
                "elapsed_seconds": 0.0,
                "request": None,
                "queue_length": queue_length,
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
            "progress": _current_progress(),
            "queue_length": queue_length,
        }

def _current_progress():
    progress_state = get_progress()
    total = progress_state["total"]
    current = min(progress_state["current"], total) if total else 0
    percent = round((current / total) * 100, 1) if total else 0.0
    return {
        "current": current,
        "total": total,
        "percent": percent,
    }

def _mark_simulation_started(mode, request_summary):
    reset_progress(0)
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


# ---- Simulation queue ----
# Simulations run one at a time on a single worker thread, first come first
# served (the graph caches, the progress counter and the CPU are shared). A
# request no longer gets "busy" while another runs: it waits in line, and the
# frontend shows its place (per the user). The frontend submits with
# {"async": true} and polls GET /simulation-jobs/<id>, so a page reload can
# pick its run back up; without "async" the request waits for its result as
# before (tools, curl). A request identical to a recent one (same mode,
# barangay, hazard and pins -- the ant colony is seeded from those, so the
# result would be the same) gets that job instead of running again.
JOB_RESULT_TTL_SECONDS = 30 * 60
MAX_KEPT_JOBS = 40
SYNC_WAIT_TIMEOUT_SECONDS = 300

_JOBS_LOCK = Condition()
_JOBS = OrderedDict()
_JOB_QUEUE = deque()
_JOB_WORKER = None


def _job_request_key(mode, request_summary):
    def normalize(value):
        if isinstance(value, dict):
            normalized = {}
            for key, item in value.items():
                if key == "label":
                    continue
                if key in ("lat", "lng"):
                    try:
                        item = round(float(item), 6)
                    except (TypeError, ValueError):
                        pass
                normalized[key] = item
            return normalized
        return value

    payload = {key: normalize(value) for key, value in request_summary.items()}
    payload["mode"] = mode
    return json.dumps(payload, sort_keys=True, default=str)


def _prune_jobs_locked():
    now = time.time()
    for job_id in list(_JOBS):
        finished = _JOBS[job_id]["finished_at"]
        if finished is not None and now - finished > JOB_RESULT_TTL_SECONDS:
            del _JOBS[job_id]
    finished_ids = [job_id for job_id, job in _JOBS.items() if job["finished_at"] is not None]
    while len(_JOBS) > MAX_KEPT_JOBS and finished_ids:
        del _JOBS[finished_ids.pop(0)]


def _reusable_job_locked(key):
    for job in reversed(_JOBS.values()):
        if job["key"] != key:
            continue
        # A crash (5xx) is not a real answer; anything else for the same
        # inputs would come out the same again.
        if job["state"] == "failed" and job["status_code"] >= 500:
            continue
        return job
    return None


def _ensure_job_worker_locked():
    global _JOB_WORKER
    if _JOB_WORKER is None or not _JOB_WORKER.is_alive():
        _JOB_WORKER = Thread(target=_job_worker_loop, name="simulation-worker", daemon=True)
        _JOB_WORKER.start()


def _submit_simulation_job(mode, request_summary, work):
    key = _job_request_key(mode, request_summary)
    with _JOBS_LOCK:
        _prune_jobs_locked()
        existing = _reusable_job_locked(key)
        if existing is not None:
            return existing

        job = {
            "id": uuid.uuid4().hex,
            "key": key,
            "mode": mode,
            "summary": request_summary,
            "work": work,
            "state": "queued",
            "created_at": time.time(),
            "started_at": None,
            "finished_at": None,
            "result": None,
            "status_code": None,
        }
        _JOBS[job["id"]] = job
        _JOB_QUEUE.append(job["id"])
        _ensure_job_worker_locked()
        _JOBS_LOCK.notify_all()
        return job


def _job_worker_loop():
    while True:
        with _JOBS_LOCK:
            while not _JOB_QUEUE:
                _JOBS_LOCK.wait()
            job = _JOBS.get(_JOB_QUEUE.popleft())
            if job is None:
                continue
            job["state"] = "running"
            job["started_at"] = time.time()

        _mark_simulation_started(job["mode"], job["summary"])
        try:
            result = job["work"]()
            status_code = 200 if not result.get("error") else 400
        except Exception as exc:
            result = {"error": True, "message": str(exc)}
            status_code = 500
        finally:
            _mark_simulation_finished()

        with _JOBS_LOCK:
            job["result"] = result
            job["status_code"] = status_code
            job["state"] = "done" if status_code == 200 else "failed"
            job["finished_at"] = time.time()
            job["work"] = None
            _JOBS_LOCK.notify_all()


def _job_public_view(job):
    with _JOBS_LOCK:
        state = job["state"]
        ahead = 0
        if state == "queued" and job["id"] in _JOB_QUEUE:
            # The simulations that run first: those queued before it, plus
            # the one running now (if any).
            ahead = _JOB_QUEUE.index(job["id"]) + sum(
                1 for other in _JOBS.values() if other["state"] == "running"
            )
        view = {
            "error": False,
            "job_id": job["id"],
            "state": state,
            "queued_ahead": ahead,
            "status_code": job["status_code"],
        }
        if state in ("done", "failed"):
            view["result"] = job["result"]
    if state == "running":
        view["progress"] = _current_progress()
    elif state == "done":
        view["progress"] = {"percent": 100.0}
    return view


def _run_simulation_request(mode, request_summary, work, wait_async):
    job = _submit_simulation_job(mode, request_summary, work)
    if wait_async:
        return jsonify(_job_public_view(job)), 202

    with _JOBS_LOCK:
        finished = _JOBS_LOCK.wait_for(
            lambda: job["state"] in ("done", "failed"),
            timeout=SYNC_WAIT_TIMEOUT_SECONDS,
        )
    if not finished:
        return jsonify({
            "error": True,
            "message": "The simulation is still running. Try again shortly.",
            "job_id": job["id"],
        }), 504
    return jsonify(job["result"]), job["status_code"]

@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok"})


@app.route("/simulation-status", methods=["GET"])
def simulation_status():
    return jsonify({
        "error": False,
        "status": _serialize_simulation_status(),
    })

@app.route("/simulation-jobs/<job_id>", methods=["GET"])
def simulation_job(job_id):
    with _JOBS_LOCK:
        job = _JOBS.get(job_id)
    if job is None:
        return jsonify({
            "error": True,
            "code": "job_not_found",
            "message": "That simulation is no longer available. Run it again.",
        }), 404
    return jsonify(_job_public_view(job))

@app.route("/locations", methods=["GET"])
def locations():
    locations_payload = get_locations()
    if locations_payload is None:
        return jsonify({
            "error": True,
            "message": "Failed to load node locations. Check that Backend/data/node.csv exists and is readable."
        }), 500

    if not locations_payload:
        return jsonify({
            "error": True,
            "message": "No node locations were found. Check that Backend/data/node.csv has data for the supported barangays."
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

@app.route("/check-pin", methods=["GET"])
def check_pin():
    """Instant check of a start/destination tapped on the map, run before the
    (much slower) simulation: can a route be checked for safety from there?"""
    barangay = (request.args.get("barangay") or "").strip()
    hazard = (request.args.get("hazard") or "Flood").strip()
    try:
        lat = float(request.args.get("lat", ""))
        lng = float(request.args.get("lng", ""))
    except ValueError:
        lat = lng = float("nan")

    if not barangay:
        return jsonify({
            "error": True,
            "message": "Barangay name is required"
        }), 400
    if not (-90 <= lat <= 90 and -180 <= lng <= 180):
        return jsonify({
            "error": True,
            "message": "Valid lat and lng are required"
        }), 400

    try:
        if hazard.lower() == "earthquake":
            result = check_earthquake_pin(barangay, lat, lng)
        else:
            result = check_flood_pin(barangay, lat, lng)
    except ValueError as e:
        return jsonify({
            "error": True,
            "message": str(e)
        }), 400
    except Exception as e:
        return jsonify({
            "error": True,
            "message": str(e)
        }), 500

    return jsonify({
        "error": False,
        "lat": lat,
        "lng": lng,
        **result,
    })

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

        def work():
            return simulate(start, end, hazard, barangay=barangay)

        return _run_simulation_request("flood", request_summary, work, data.get("async") is True)
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
            return simulate_earthquake(start, barangay)

        return _run_simulation_request("earthquake", request_summary, work, data.get("async") is True)
    except Exception as e:
        return jsonify({
            "error": True,
            "message": str(e)
        }), 500

def _client_ip():
    # Behind Railway's edge proxy remote_addr is the proxy, which would put
    # every visitor in one rate-limit bucket. The edge appends the connecting
    # IP to X-Forwarded-For, so the rightmost entry is the one a client can't
    # forge.
    forwarded = request.headers.get("X-Forwarded-For", "")
    if forwarded.strip():
        return forwarded.split(",")[-1].strip()
    return request.remote_addr

@app.route("/contact", methods=["POST"])
def contact():
    try:
        payload, status_code = send_contact_message(request.get_json(silent=True), _client_ip())
        return jsonify(payload), status_code
    except Exception as e:
        return jsonify({
            "error": True,
            "message": str(e)
        }), 500

@app.route("/feedback", methods=["POST"])
def feedback():
    try:
        payload, status_code = record_feedback(request.get_json(silent=True), _client_ip())
        return jsonify(payload), status_code
    except Exception as e:
        return jsonify({
            "error": True,
            "message": str(e)
        }), 500

@app.route("/", methods=["GET"])
def home():
    return render_template("home.html", active_page="home")


@app.route("/about", methods=["GET"])
def about_page():
    return render_template("about.html", active_page="about")


@app.route("/app", methods=["GET"])
def simulator_app():
    return render_template(
        "index.html",
        google_maps_api_key=os.environ.get("GOOGLE_MAPS_API_KEY", ""),
    )

if __name__ == "__main__":
    # Local dev only (gunicorn never runs this block): always revalidate static
    # files instead of caching them, so edits to script.js/style.css show up on
    # a plain reload instead of silently running stale JS/CSS from an old tab.
    app.config["SEND_FILE_MAX_AGE_DEFAULT"] = 0
    app.run(debug=True, use_reloader=False, host="127.0.0.1", port=5000, threaded=True)
