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
    FORM_TOKEN_SECRET   optional key for signing form tokens. Without it a
                        random key is made at startup, so each restart makes
                        open pages fetch a new token (home.js does that).

Spam checks, cheapest first: the hidden "website" field, a form token the
page got when it was served (no token means the page was never loaded; a
token only seconds old means a bot filled the form), a limit on links,
dropping a message already delivered, then the per-visitor and daily limits.
Signs of a bot get a fake "sent", so it has no reason to retry.

Each function returns (payload, status_code) in the app's usual
{"error": bool, "message": str} shape and never raises.
"""

import hashlib
import hmac
import os
import re
import secrets
import time
from threading import Condition, Lock, Thread

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
    # Generous: a class or group evaluating the system on one Wi-Fi shares
    # one IP. The form token and duplicate check stop bots instead.
    "feedback": (60, 10 * 60),
    # Generous: phones on the same mobile network can share one IP.
    "visit": (30, 60 * 60),
    # All visitors together: spam from many IPs must not use up Resend's
    # free daily quota (100 emails) or flood the feedback sheet.
    "contact_all": (50, 24 * 60 * 60),
    "feedback_all": (500, 60 * 60),
}
ALL_VISITORS = "*"

# A person needs more than a few seconds to fill in a form; a bot doesn't.
FORM_TOKEN_MIN_AGE_SECONDS = 3
FORM_TOKEN_MAX_AGE_SECONDS = 24 * 60 * 60
_FORM_TOKEN_SECRET = (
    os.environ.get("FORM_TOKEN_SECRET", "").strip().encode() or secrets.token_bytes(32)
)

MAX_LINKS = 3
_LINK_PATTERN = re.compile(r"https?://|www\.|<a\s|\[url", re.IGNORECASE)

# The same text again within this time is dropped: spam campaigns repeat one
# message from many IPs, which the per-visitor limits can't see.
DUPLICATE_WINDOW_SECONDS = 24 * 60 * 60
# Short feedback ("Good", "Nice") legitimately repeats.
MIN_DUPLICATE_CHECK_LENGTH = 20

# How long the homepage's visitor count is reused before the sheet is asked
# again, so each page view doesn't wait on Apps Script.
VISITOR_COUNT_CACHE_SECONDS = 120
# With no count at all yet, a failed read is tried again this much sooner,
# so the homepage isn't left without a number for the whole cache time.
VISITOR_COUNT_RETRY_SECONDS = 5

# A local dev server has no FEEDBACK_SHEET_URL (it lives in Render's
# environment), so app.py turns this on when run directly and the homepage there
# shows the live site's count instead of a dash. Only read: local visits never
# count.
LIVE_VISITOR_COUNT_URL = "https://agnas-nav.onrender.com/visitors"
USE_LIVE_VISITOR_COUNT = False

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

_RECENT_TEXTS_LOCK = Lock()
_RECENT_TEXTS = {}

_VISITOR_COUNT_LOCK = Lock()
# Notified when a read of the count finishes.
_VISITOR_COUNT_READ = Condition(_VISITOR_COUNT_LOCK)
_VISITOR_COUNT = {"count": None, "fetched_at": 0.0, "refreshing": False}


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
            for stale_key in [
                k for k, sent in _RECENT_SENDS.items() if now - sent[-1] >= RATE_LIMITS[k[0]][1]
            ]:
                del _RECENT_SENDS[stale_key]
        recent = [sent_at for sent_at in _RECENT_SENDS.get(key, ()) if now - sent_at < window]
        limited = len(recent) >= limit
        if not limited:
            recent.append(now)
        if recent:
            _RECENT_SENDS[key] = recent
        return limited


def _sign(issued):
    return hmac.new(_FORM_TOKEN_SECRET, str(issued).encode(), hashlib.sha256).hexdigest()[:32]


def issue_form_token():
    """Put in each page (site_base.html) and returned by GET /form-token."""
    issued = int(time.time())
    return f"{issued}.{_sign(issued)}"


def _form_token_problem(token):
    """None for a good token, "too_fast" or "expired" otherwise."""
    issued, _, signature = (token if isinstance(token, str) else "").partition(".")
    if not (issued.isascii() and issued.isdigit()):
        return "expired"
    if not hmac.compare_digest(signature.encode(), _sign(int(issued)).encode()):
        return "expired"
    age = time.time() - int(issued)
    if age > FORM_TOKEN_MAX_AGE_SECONDS:
        return "expired"
    if age < FORM_TOKEN_MIN_AGE_SECONDS:
        return "too_fast"
    return None


def _count_links(text):
    return len(_LINK_PATTERN.findall(text))


def _text_key(kind, text):
    if len(text) < MIN_DUPLICATE_CHECK_LENGTH:
        return None
    normalized = " ".join(text.lower().split())
    return kind, hashlib.sha256(normalized.encode()).hexdigest()


def _already_delivered(kind, text):
    key = _text_key(kind, text)
    if key is None:
        return False
    now = time.monotonic()
    with _RECENT_TEXTS_LOCK:
        sent_at = _RECENT_TEXTS.get(key)
        return sent_at is not None and now - sent_at < DUPLICATE_WINDOW_SECONDS


def _remember_delivered(kind, text):
    key = _text_key(kind, text)
    if key is None:
        return
    now = time.monotonic()
    with _RECENT_TEXTS_LOCK:
        if len(_RECENT_TEXTS) > 1000:
            for stale_key in [k for k, sent in _RECENT_TEXTS.items() if now - sent >= DUPLICATE_WINDOW_SECONDS]:
                del _RECENT_TEXTS[stale_key]
        _RECENT_TEXTS[key] = now


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


def _too_many_links():
    return _error(f"Please include at most {MAX_LINKS} links.", 400, "too_many_links")


def _bot_check(data, sent_message):
    """The answer for a bot (a fake "sent") or a page without a valid form
    token, or None when the request looks like a person's."""
    # Hidden "website" field: people never see it, form-filling bots do.
    if _clean_line(data.get("website"), 200):
        return {"error": False, "message": sent_message}, 200
    problem = _form_token_problem(data.get("form_token"))
    if problem == "too_fast":
        return {"error": False, "message": sent_message}, 200
    if problem == "expired":
        return _error(
            "This page has been open a long time. Please reload it and send again.",
            400,
            "form_expired",
        )
    return None


def send_contact_message(data, client_ip=None):
    data = data if isinstance(data, dict) else {}
    sent_message = "Message sent. We'll reply by email."
    bot_answer = _bot_check(data, sent_message)
    if bot_answer:
        return bot_answer

    name = _clean_line(data.get("name"), MAX_NAME_LENGTH)
    email = _clean_line(data.get("email"), MAX_EMAIL_LENGTH + 1)
    message = _clean_text(data.get("message"), MAX_MESSAGE_LENGTH)

    if not name or not email or not message:
        return _error("Please fill in your name, email, and message.", 400, "missing_fields")
    if len(email) > MAX_EMAIL_LENGTH or not _EMAIL_PATTERN.match(email):
        return _error("Please enter a valid email address.", 400, "invalid_email")
    if _count_links(name):
        return _error("Please enter just your name, without links.", 400, "invalid_name")
    if _count_links(message) > MAX_LINKS:
        return _too_many_links()
    if _already_delivered("contact", message):
        return {"error": False, "message": sent_message}, 200

    api_key = os.environ.get("RESEND_API_KEY", "").strip()
    to_email = os.environ.get("CONTACT_TO_EMAIL", "").strip()
    if not api_key or not to_email:
        print("[contact] RESEND_API_KEY and CONTACT_TO_EMAIL must both be set to send contact messages.")
        return _error(
            "The contact form isn't set up yet. Please try again later.",
            503,
            "not_configured",
        )

    # Per visitor first, so one spammer's blocked tries don't use up the
    # shared daily allowance.
    if _rate_limited("contact", client_ip):
        return _too_many_requests()
    if _rate_limited("contact_all", ALL_VISITORS):
        return _error(
            "The contact form has had too many messages today. Please try again tomorrow.",
            429,
            "daily_limit",
        )

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

    _remember_delivered("contact", message)
    return {"error": False, "message": sent_message}, 200


def record_feedback(data, client_ip=None):
    data = data if isinstance(data, dict) else {}
    sent_message = "Thanks for the feedback!"
    bot_answer = _bot_check(data, sent_message)
    if bot_answer:
        return bot_answer

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
    if _count_links(comment) > MAX_LINKS:
        return _too_many_links()
    if _already_delivered("feedback", comment):
        return {"error": False, "message": sent_message}, 200

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
    if _rate_limited("feedback_all", ALL_VISITORS):
        return _error(
            "We're getting a lot of feedback right now. Please try again in a while.",
            429,
            "busy",
        )

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

    _remember_delivered("feedback", comment)
    return {"error": False, "message": sent_message}, 200


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


def _ask_live_site():
    """The live site's count, for a local dev server without the sheet."""
    try:
        response = requests.get(LIVE_VISITOR_COUNT_URL, timeout=UPSTREAM_TIMEOUT_SECONDS)
        body = response.json()
    except (requests.RequestException, ValueError) as exc:
        print(f"[visitors] Could not read the live site's visitor count: {exc}")
        return None
    count = body.get("count") if isinstance(body, dict) and body.get("error") is False else None
    if isinstance(count, bool) or not isinstance(count, int) or count < 0:
        return None
    return count


def _visitor_count_set_up():
    return bool(os.environ.get("FEEDBACK_SHEET_URL", "").strip()) or USE_LIVE_VISITOR_COUNT


def _remember_visitor_count(count):
    with _VISITOR_COUNT_LOCK:
        _VISITOR_COUNT.update(count=count, fetched_at=time.monotonic())


def _claim_visitor_count_read():
    """With the lock held: True if the count is due to be read again and no
    read is on its way, marking one as started."""
    if _VISITOR_COUNT["refreshing"]:
        return False
    fetched_at = _VISITOR_COUNT["fetched_at"]
    max_age = VISITOR_COUNT_CACHE_SECONDS if _VISITOR_COUNT["count"] is not None else VISITOR_COUNT_RETRY_SECONDS
    if fetched_at and time.monotonic() - fetched_at < max_age:
        return False
    _VISITOR_COUNT["refreshing"] = True
    return True


def _refresh_visitor_count():
    """Reads the count; the caller has claimed the read."""
    started_at = time.monotonic()
    if os.environ.get("FEEDBACK_SHEET_URL", "").strip():
        fetched = _ask_visitor_sheet("visitors")
    else:
        fetched = _ask_live_site()
    with _VISITOR_COUNT_READ:
        _VISITOR_COUNT["refreshing"] = False
        # A visit counted while this read was on its way is newer than it.
        if _VISITOR_COUNT["fetched_at"] <= started_at:
            if fetched is not None:
                _VISITOR_COUNT["count"] = fetched
            # A failed read keeps the last number and still waits out the
            # cache time, so an unreachable sheet isn't asked on every page
            # view.
            _VISITOR_COUNT["fetched_at"] = time.monotonic()
        _VISITOR_COUNT_READ.notify_all()


def warm_visitor_count():
    """Reads the count at startup, so the first homepage view after a deploy
    already has it."""
    if not _visitor_count_set_up():
        return
    with _VISITOR_COUNT_LOCK:
        claimed = _claim_visitor_count_read()
    if claimed:
        _refresh_visitor_count()


def peek_visitor_count():
    """The count to write straight into the homepage, or None. Never waits:
    Apps Script takes seconds to answer, so an old count is still given and
    read again in the background."""
    if not _visitor_count_set_up():
        return None
    with _VISITOR_COUNT_LOCK:
        count = _VISITOR_COUNT["count"]
        claimed = _claim_visitor_count_read()
    if claimed:
        Thread(target=_refresh_visitor_count, name="visitor-count", daemon=True).start()
    return count


def get_visitor_count():
    if not _visitor_count_set_up():
        return _error("The visitor count isn't set up yet.", 503, "not_configured")

    count = peek_visitor_count()
    if count is None:
        # No number yet (the server just started): wait for the read on its
        # way rather than asking the sheet a second time.
        with _VISITOR_COUNT_READ:
            _VISITOR_COUNT_READ.wait_for(
                lambda: not _VISITOR_COUNT["refreshing"], timeout=UPSTREAM_TIMEOUT_SECONDS + 5,
            )
            count = _VISITOR_COUNT["count"]

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
