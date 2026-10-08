"""Delivery for the About page's contact form and the feedback widget, and the
homepage's visitor count.

Contact messages are emailed to the team inbox through Resend's HTTPS API.
Railway's Free/Hobby plans block outbound SMTP, so Flask-Mail with Gmail SMTP
would work locally and then fail silently once deployed.

Feedback is anonymous evaluation data, so it goes to a Google Sheet (one row
per response) through an Apps Script web app -- tools/feedback_sheet.gs --
instead of one email each. The sheet's URL stays on the server, so the page
cannot be used to write to the sheet directly.

The visitor count lives in the same sheet (its "Visitors" tab), because
Railway wipes the server's files on every deploy.

Configuration comes from the environment, so nothing secret is committed:

    RESEND_API_KEY      Resend API key with sending access
    CONTACT_TO_EMAIL    the inbox that receives contact messages. Without a
                        verified domain, Resend only delivers to the address
                        the Resend account was created with, so use that one.
    CONTACT_FROM_EMAIL  optional sender, default DEFAULT_CONTACT_FROM_EMAIL
    FEEDBACK_SHEET_URL  the Apps Script web app URL (ends in /exec)

Each function returns (payload, status_code) in the app's usual
{"error": bool, "message": str} shape and never raises.
"""

import os
import re
import time
from threading import Lock

import requests

RESEND_API_URL = "https://api.resend.com/emails"
DEFAULT_CONTACT_FROM_EMAIL = "AGNAS Contact Form <onboarding@resend.dev>"
UPSTREAM_TIMEOUT_SECONDS = 10

MAX_NAME_LENGTH = 100
MAX_EMAIL_LENGTH = 254
MAX_MESSAGE_LENGTH = 5000
MAX_COMMENT_LENGTH = 2000
MAX_PAGE_LENGTH = 200

# (sends allowed, window in seconds) per visitor IP. Only requests that pass
# validation count, so a visitor fixing a typo isn't locked out.
RATE_LIMITS = {
    "contact": (5, 10 * 60),
    "feedback": (10, 10 * 60),
    # Generous: phones on the same mobile network can share one IP.
    "visit": (30, 60 * 60),
}

# How long the homepage's visitor count is reused before the sheet is asked
# again, so each page view doesn't wait on Apps Script.
VISITOR_COUNT_CACHE_SECONDS = 120

FEEDBACK_RATINGS = {1: "Confusing", 2: "Okay", 3: "Clear"}
FEEDBACK_ROLES = {
    "resident": "Resident",
    "official": "Barangay official / LGU staff",
    "student": "Researcher / Student",
    "other": "Other",
}

_EMAIL_PATTERN = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
_CONTROL_CHARS = re.compile(r"[\x00-\x08\x0b-\x1f\x7f]")

_RECENT_SENDS_LOCK = Lock()
_RECENT_SENDS = {}

_VISITOR_COUNT_LOCK = Lock()
_VISITOR_COUNT = {"count": None, "fetched_at": 0.0}


def _clean_line(value, limit):
    """One line of text: whitespace (newlines included) collapsed to spaces."""
    if not isinstance(value, str):
        return ""
    return " ".join(value.split())[:limit]


def _clean_text(value, limit):
    """Multi-line text: keeps line breaks and tabs, drops other control chars."""
    if not isinstance(value, str):
        return ""
    text = value.replace("\r\n", "\n").replace("\r", "\n")
    return _CONTROL_CHARS.sub("", text).strip()[:limit]


def _rate_limited(kind, client_ip):
    limit, window = RATE_LIMITS[kind]
    now = time.monotonic()
    key = (kind, client_ip or "unknown")
    with _RECENT_SENDS_LOCK:
        if len(_RECENT_SENDS) > 1000:
            for stale_key in [k for k, sent in _RECENT_SENDS.items() if now - sent[-1] >= window]:
                del _RECENT_SENDS[stale_key]
        recent = [sent_at for sent_at in _RECENT_SENDS.get(key, ()) if now - sent_at < window]
        limited = len(recent) >= limit
        if not limited:
            recent.append(now)
        if recent:
            _RECENT_SENDS[key] = recent
        return limited


def _error(message, status_code, code=None):
    payload = {"error": True, "message": message}
    if code:
        payload["code"] = code
    return payload, status_code


def _too_many_requests():
    return _error(
        "You've sent a few already. Please wait a few minutes and try again.",
        429,
        "rate_limited",
    )


def send_contact_message(data, client_ip=None):
    data = data if isinstance(data, dict) else {}
    # Hidden "website" field: people never see it, form-filling bots do.
    # Pretend it worked so the bot has no reason to retry.
    if _clean_line(data.get("website"), 200):
        return {"error": False, "message": "Message sent."}, 200

    name = _clean_line(data.get("name"), MAX_NAME_LENGTH)
    email = _clean_line(data.get("email"), MAX_EMAIL_LENGTH + 1)
    message = _clean_text(data.get("message"), MAX_MESSAGE_LENGTH)

    if not name or not email or not message:
        return _error("Please fill in your name, email, and message.", 400, "missing_fields")
    if len(email) > MAX_EMAIL_LENGTH or not _EMAIL_PATTERN.match(email):
        return _error("Please enter a valid email address.", 400, "invalid_email")

    api_key = os.environ.get("RESEND_API_KEY", "").strip()
    to_email = os.environ.get("CONTACT_TO_EMAIL", "").strip()
    if not api_key or not to_email:
        print("[contact] RESEND_API_KEY and CONTACT_TO_EMAIL must both be set to send contact messages.")
        return _error(
            "The contact form isn't set up yet. Please try again later.",
            503,
            "not_configured",
        )

    if _rate_limited("contact", client_ip):
        return _too_many_requests()

    from_email = os.environ.get("CONTACT_FROM_EMAIL", "").strip() or DEFAULT_CONTACT_FROM_EMAIL
    body = (
        "New message from the AGNAS contact form.\n\n"
        f"Name: {name}\n"
        f"Email: {email}\n\n"
        f"Message:\n{message}\n\n"
        "---\n"
        "Reply to this email to answer them directly.\n"
    )
    try:
        response = requests.post(
            RESEND_API_URL,
            headers={"Authorization": f"Bearer {api_key}"},
            json={
                "from": from_email,
                "to": [to_email],
                "reply_to": email,
                "subject": f"[AGNAS Contact] {name}",
                "text": body,
            },
            timeout=UPSTREAM_TIMEOUT_SECONDS,
        )
    except requests.RequestException as exc:
        print(f"[contact] Could not reach Resend: {exc}")
        return _error("Your message couldn't be sent right now. Please try again later.", 502, "send_failed")

    if not response.ok:
        print(f"[contact] Resend rejected the message: HTTP {response.status_code} {response.text[:500]}")
        return _error("Your message couldn't be sent right now. Please try again later.", 502, "send_failed")

    return {"error": False, "message": "Message sent. We'll reply by email."}, 200


def record_feedback(data, client_ip=None):
    data = data if isinstance(data, dict) else {}
    if _clean_line(data.get("website"), 200):
        return {"error": False, "message": "Thanks for the feedback!"}, 200

    try:
        rating = int(data.get("rating"))
    except (TypeError, ValueError):
        rating = None
    if rating not in FEEDBACK_RATINGS:
        rating = None
    role = FEEDBACK_ROLES.get(_clean_line(data.get("role"), 40), "")
    comment = _clean_text(data.get("comment"), MAX_COMMENT_LENGTH)
    page = _clean_line(data.get("page"), MAX_PAGE_LENGTH)

    if rating is None and not comment:
        return _error("Pick a rating or write a comment first.", 400, "missing_fields")

    sheet_url = os.environ.get("FEEDBACK_SHEET_URL", "").strip()
    if not sheet_url:
        print("[feedback] FEEDBACK_SHEET_URL must be set to record feedback.")
        return _error(
            "Feedback isn't set up yet. Please try again later.",
            503,
            "not_configured",
        )

    if _rate_limited("feedback", client_ip):
        return _too_many_requests()

    # No IP or other identifying detail goes to the sheet: the widget promises
    # anonymous responses.
    row = {
        "page": page,
        "rating": rating or "",
        "rating_label": FEEDBACK_RATINGS.get(rating, ""),
        "role": role,
        "comment": comment,
    }
    try:
        # Apps Script answers a POST with a 302 to its output; requests follows
        # it as a GET, which is what Google expects.
        response = requests.post(sheet_url, json=row, timeout=UPSTREAM_TIMEOUT_SECONDS)
        saved = response.ok and response.json().get("ok") is True
    except (requests.RequestException, ValueError, AttributeError) as exc:
        print(f"[feedback] Could not save to the feedback sheet: {exc}")
        saved = False
    else:
        if not saved:
            print(f"[feedback] The feedback sheet rejected the row: HTTP {response.status_code} {response.text[:500]}")

    if not saved:
        return _error("Your feedback couldn't be saved right now. Please try again later.", 502, "send_failed")

    return {"error": False, "message": "Thanks for the feedback!"}, 200


def _ask_visitor_sheet(action):
    """The sheet's visitor count after `action` ("visitors" reads it, "visit"
    adds one), or None if the sheet can't give one.

    GET, not POST: until the sheet's Apps Script is updated, a POST would land
    in its feedback handler and add a blank feedback row, while an old script
    has no doGet at all, so a GET just fails.
    """
    sheet_url = os.environ.get("FEEDBACK_SHEET_URL", "").strip()
    try:
        response = requests.get(sheet_url, params={"action": action}, timeout=UPSTREAM_TIMEOUT_SECONDS)
    except requests.RequestException as exc:
        print(f"[visitors] Could not reach the feedback sheet: {exc}")
        return None
    try:
        body = response.json()
    except ValueError:
        body = None
    count = body.get("count") if isinstance(body, dict) and body.get("ok") is True else None
    if isinstance(count, bool) or not isinstance(count, (int, float)) or count < 0:
        print(
            "[visitors] The feedback sheet gave no visitor count (is its Apps Script up to date?): "
            f"HTTP {response.status_code} {' '.join(response.text[:200].split())}"
        )
        return None
    return int(count)


def _remember_visitor_count(count):
    with _VISITOR_COUNT_LOCK:
        _VISITOR_COUNT.update(count=count, fetched_at=time.monotonic())


def get_visitor_count():
    if not os.environ.get("FEEDBACK_SHEET_URL", "").strip():
        return _error("The visitor count isn't set up yet.", 503, "not_configured")

    with _VISITOR_COUNT_LOCK:
        count = _VISITOR_COUNT["count"]
        fetched_at = _VISITOR_COUNT["fetched_at"]
    if not fetched_at or time.monotonic() - fetched_at >= VISITOR_COUNT_CACHE_SECONDS:
        fetched = _ask_visitor_sheet("visitors")
        # A failed read keeps the last number and still waits out the cache
        # time, so an unreachable sheet isn't asked on every page view.
        count = count if fetched is None else fetched
        _remember_visitor_count(count)

    if count is None:
        return _error("The visitor count isn't available right now.", 502, "fetch_failed")
    return {"error": False, "count": count}, 200


def record_visitor(client_ip=None):
    """Adds one visitor; the page asks once per browser (visitor-count.js)."""
    if not os.environ.get("FEEDBACK_SHEET_URL", "").strip():
        return _error("The visitor count isn't set up yet.", 503, "not_configured")
    if _rate_limited("visit", client_ip):
        return _too_many_requests()

    count = _ask_visitor_sheet("visit")
    if count is None:
        return _error("The visit couldn't be counted right now.", 502, "send_failed")
    _remember_visitor_count(count)
    return {"error": False, "count": count}, 200
