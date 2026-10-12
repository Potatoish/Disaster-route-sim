import hashlib
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
import contact_service
from contact_service import (
    get_visitor_count,
    issue_form_token,
    record_feedback,
    record_visitor,
    send_contact_message,
    warm_visitor_count,
)
from earthquake_service import (
    check_earthquake_pin,
    get_earthquake_evacuation_sites,
    simulate_earthquake,
)
from main import simulate
import osm_routing
from osm_routing import (
    BARANGAY_BOUNDARY_FILES,
    build_flood_hazard_layer_payload,
    check_flood_pin,
    get_barangay_boundary,
    get_barangay_boundary_payload,
)
from simulation_progress import get_progress, reset_progress

FRONTEND_DIR = Path(__file__).resolve().parent.parent / "Frontend"

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

# Static URLs carry a hash of the file's content (?v=...), so browsers can
# keep them for a year without asking again: a changed file gets a new URL.
# Without this every page view re-asked the server about each file, a full
# round trip each before the page could use its cached CSS. The hash is of
# the content, not the mtime, because Railway gives every file the commit's
# time, so one deploy would have re-downloaded every unchanged file too.
STATIC_CACHE_SECONDS = 365 * 24 * 60 * 60
_STATIC_HASHES = {}

def _static_file_hash(filename):
    path = os.path.join(app.static_folder, filename)
    stat = os.stat(path)
    key = (filename, stat.st_mtime_ns, stat.st_size)
    if key not in _STATIC_HASHES:
        with open(path, "rb") as file:
            _STATIC_HASHES[key] = hashlib.sha256(file.read()).hexdigest()[:12]
    return _STATIC_HASHES[key]

@app.url_defaults
def _version_static_urls(endpoint, values):
    if endpoint != "static" or "v" in values:
        return
    filename = values.get("filename")
    if not filename:
        return
    try:
        values["v"] = _static_file_hash(filename)
    except OSError:
        pass

@app.after_request
def _cache_versioned_static(response):
    if request.endpoint == "static" and request.args.get("v") and response.status_code in (200, 304):
        response.headers["Cache-Control"] = f"public, max-age={STATIC_CACHE_SECONDS}, immutable"
    return response

@app.context_processor
def _inject_form_token():
    return {"form_token": issue_form_token}

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
        # Anyone can read /simulation-status, so it names the run's barangay
        # and hazard but never its pins (another visitor's locations).
        _SIMULATION_STATE["request"] = {
            key: value
            for key, value in request_summary.items()
            if key not in ("start", "end") and value not in (None, "")
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
# served: the graph caches, the progress counter and the CPU are shared. The
# frontend submits with {"async": true} and polls GET /simulation-jobs/<id>,
# so a page reload can pick its run back up; without "async" the request
# waits for its result. A request identical to a recent one (same mode,
# barangay, hazard and pins -- the colony is seeded from those) gets that
# job back instead of running again.
JOB_RESULT_TTL_SECONDS = 30 * 60
MAX_KEPT_JOBS = 40
SYNC_WAIT_TIMEOUT_SECONDS = 300
# One worker runs every simulation, so a script sending new pins in a loop
# would make everyone else wait behind it. A person runs one at a time (the
# page sends a per-tab client_id), but a class on one Wi-Fi, or phones on one
# mobile network, share an IP, so the per-IP cap is much higher. A run takes
# a few seconds, so a full queue clears in a few minutes.
MAX_ACTIVE_JOBS_PER_BROWSER = 2
MAX_ACTIVE_JOBS_PER_IP = 40
MAX_QUEUED_JOBS = 60
MAX_CLIENT_ID_LENGTH = 64

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


def _job_refusal_locked(client):
    """(payload, status) when this client, an (ip, client_id) pair, may not
    queue another job."""
    active = [job["client"] for job in _JOBS.values() if job["state"] in ("queued", "running")]
    if active.count(client) >= MAX_ACTIVE_JOBS_PER_BROWSER:
        return {
            "error": True,
            "code": "too_many_simulations",
            "message": "You already have a simulation waiting. Let it finish, then try again.",
        }, 429
    if sum(1 for ip, _ in active if ip == client[0]) >= MAX_ACTIVE_JOBS_PER_IP:
        return {
            "error": True,
            "code": "too_many_simulations",
            "message": "Many simulations from your network are waiting. Please try again in a minute.",
        }, 429
    if len(_JOB_QUEUE) >= MAX_QUEUED_JOBS:
        return {
            "error": True,
            "code": "queue_full",
            "message": "The simulator is busy right now. Please try again in a few minutes.",
        }, 503
    return None


def _submit_simulation_job(mode, request_summary, work, client):
    """(job, None), or (None, (payload, status)) when the job is refused."""
    key = _job_request_key(mode, request_summary)
    with _JOBS_LOCK:
        _prune_jobs_locked()
        existing = _reusable_job_locked(key)
        if existing is not None:
            return existing, None
        refusal = _job_refusal_locked(client)
        if refusal is not None:
            return None, refusal

        job = {
            "id": uuid.uuid4().hex,
            "key": key,
            "client": client,
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
        return job, None


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


def _run_simulation_request(mode, request_summary, work, data):
    client_id = data.get("client_id")
    client_id = client_id[:MAX_CLIENT_ID_LENGTH] if isinstance(client_id, str) else ""
    wait_async = data.get("async") is True
    job, refusal = _submit_simulation_job(mode, request_summary, work, (_client_ip(), client_id))
    if refusal is not None:
        payload, status_code = refusal
        return jsonify(payload), status_code
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

        # A few hundred KB that only changes with a deploy: the browser keeps
        # it and asks with its ETag, and an unchanged layer answers 304 with
        # no body.
        response = jsonify({
            "error": False,
            **payload,
        })
        response.headers["Cache-Control"] = "no-cache"
        response.add_etag()
        return response.make_conditional(request)
    except Exception as e:
        return jsonify({
            "error": True,
            "message": str(e)
        }), 500

# POST, not GET: a URL's query string lands in the hosting platform's request
# logs, and the pin's coordinates must not (the site promises not to keep
# pins); a request body does not.
@app.route("/check-pin", methods=["POST"])
def check_pin():
    """Instant check of a start/destination tapped on the map, run before the
    (much slower) simulation: can a route be checked for safety from there?"""
    data = request.get_json(silent=True)
    data = data if isinstance(data, dict) else {}
    barangay = str(data.get("barangay") or "").strip()
    hazard = str(data.get("hazard") or "Flood").strip()
    try:
        lat = float(data.get("lat", ""))
        lng = float(data.get("lng", ""))
    except (TypeError, ValueError):
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

        return _run_simulation_request("flood", request_summary, work, data)
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

        return _run_simulation_request("earthquake", request_summary, work, data)
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

@app.route("/form-token", methods=["GET"])
def form_token():
    """A fresh token for a page whose own one stopped working (home.js)."""
    response = jsonify({"error": False, "token": issue_form_token()})
    response.headers["Cache-Control"] = "no-store"
    return response

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

@app.route("/visitors", methods=["GET", "POST"])
def visitors():
    try:
        if request.method == "POST":
            payload, status_code = record_visitor(_client_ip())
        else:
            payload, status_code = get_visitor_count()
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
    return render_template("index.html")

def _warm_caches():
    """Builds, right after startup, what the first visitor would otherwise
    wait for: each barangay's flood map layer and the graphs behind the pin
    check (seconds each on Railway, after every deploy)."""
    started = time.time()
    for name in BARANGAY_BOUNDARY_FILES:
        boundary = get_barangay_boundary(name)
        if boundary is None:
            continue
        point = boundary["geometry"].representative_point()
        steps = (
            lambda: build_flood_hazard_layer_payload(name, clip_scope="barangay_buffer"),
            lambda: check_flood_pin(name, point.y, point.x),
            lambda: check_earthquake_pin(name, point.y, point.x),
        )
        for step in steps:
            try:
                step()
            except ValueError:
                pass  # e.g. no earthquake data for this barangay
            except Exception as exc:
                print(f"[warm-up] {name}: {exc}")
    print(f"[warm-up] caches ready in {time.time() - started:.1f}s")

Thread(target=_warm_caches, name="cache-warm-up", daemon=True).start()
# Its own thread: the sheet answers in seconds, the graphs take longer.
Thread(target=warm_visitor_count, name="visitor-count-warm-up", daemon=True).start()

def _stop_old_dev_servers(port):
    # Werkzeug binds with SO_REUSEADDR, which on Windows lets a second server
    # listen on a port that is already taken instead of failing. A dev server
    # left running in another terminal then keeps answering with its old data
    # and caches, so the restarted one looks like it ignored every change.
    if os.name != "nt":
        return
    import subprocess
    try:
        netstat = subprocess.run(
            ["netstat", "-ano", "-p", "TCP"], capture_output=True, text=True, timeout=20,
        ).stdout
    except (OSError, subprocess.SubprocessError):
        return
    # netstat, not Get-NetTCPConnection: that lists only one of several
    # sockets sharing the port. A listening socket's remote end is 0.0.0.0:0,
    # which holds in every Windows language (the "LISTENING" word does not).
    pids = set()
    for row in netstat.splitlines():
        cols = row.split()
        if (len(cols) >= 5 and cols[1].endswith(f":{port}") and cols[2] == "0.0.0.0:0"
                and cols[-1].isdigit() and int(cols[-1]) != os.getpid()):
            pids.add(int(cols[-1]))
    if not pids:
        return
    script = (
        "Get-CimInstance Win32_Process -Filter \""
        + " OR ".join(f"ProcessId={pid}" for pid in sorted(pids))
        + "\" | Select-Object ProcessId, CommandLine | ConvertTo-Json"
    )
    try:
        output = subprocess.run(
            ["powershell", "-NoProfile", "-NonInteractive", "-Command", script],
            capture_output=True, text=True, timeout=20,
        ).stdout.strip()
        listeners = json.loads(output) if output else []
    except (OSError, subprocess.SubprocessError, ValueError):
        return
    if isinstance(listeners, dict):
        listeners = [listeners]
    for listener in listeners:
        pid = listener.get("ProcessId")
        command = listener.get("CommandLine") or ""
        if not pid or pid == os.getpid():
            continue
        # Only stop an AGNAS server; anything else on the port is left alone.
        if "app.py" not in command:
            print(f"[dev] port {port} is also used by PID {pid} ({command or 'unknown'}); not stopping it")
            continue
        subprocess.run(["taskkill", "/PID", str(pid), "/F"], capture_output=True)
        print(f"[dev] stopped the old AGNAS server on port {port} (PID {pid})")

if __name__ == "__main__":
    # Local dev only (gunicorn never runs this block): always revalidate static
    # files instead of caching them, so edits to script.js/style.css show up on
    # a plain reload instead of silently running stale JS/CSS from an old tab.
    app.config["SEND_FILE_MAX_AGE_DEFAULT"] = 0
    # Simulation logs show pins; fine on a developer's own machine, never on
    # the server (osm_routing.DEBUG).
    osm_routing.DEBUG = True
    # Without FEEDBACK_SHEET_URL the homepage shows the live site's visitor
    # count (contact_service.USE_LIVE_VISITOR_COUNT).
    contact_service.USE_LIVE_VISITOR_COUNT = True
    _stop_old_dev_servers(5000)
    app.run(debug=True, use_reloader=False, host="127.0.0.1", port=5000, threaded=True)
