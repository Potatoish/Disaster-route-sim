from threading import Lock

_LOCK = Lock()
_STATE = {"current": 0, "total": 0}


def reset_progress(total=0):
    with _LOCK:
        _STATE["current"] = 0
        _STATE["total"] = max(0, int(total))


def bump_progress(step=1):
    with _LOCK:
        _STATE["current"] += step


def get_progress():
    with _LOCK:
        return dict(_STATE)
