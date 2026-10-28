"""Nightly reminders for the Temporary Mining Outpost (bins, rent, house events, upkeep).

Runs on GitHub Actions in the evening (America/Toronto). It:
  1. Fetches the live Peel collection calendar for 582 Rapids Lane from ReCollect
     (falls back to app/data/schedule.json, then to the Monday rhythm).
  2. Writes the next ~2 months of pickups to Firestore (households/{id}/meta/schedule) so the app shows
     holiday shifts as soon as Peel publishes them.
  3. If tomorrow is collection day, or an upkeep job is due, sends a push notification to every
     registered phone (Firebase Cloud Messaging) and/or an ntfy.sh topic.

Environment:
  FIREBASE_SERVICE_ACCOUNT  service-account JSON (optional; enables Firestore + push)
  HOUSEHOLD_ID              household code shown in the app's Settings (needed with Firebase)
  APP_URL                   where the app is hosted, opened when a notification is tapped
  NTFY_TOPIC                optional ntfy.sh topic, for phones using the ntfy app instead of push
  TRIGGER                   the cron expression that fired (github.event.schedule)
  FORCE=1                   send regardless of time window / already-sent-today (for testing)
  DRY_RUN=1                 print instead of sending
"""
from __future__ import annotations

import datetime as dt
import json
import os
import sys
import urllib.request
from pathlib import Path
from zoneinfo import ZoneInfo

TZ = ZoneInfo("America/Toronto")
PLACE_ID = "800207DC-6C7E-11E9-BA83-48EA3EDCD761"  # 582 Rapids Lane, Mississauga
SERVICE_ID = 1063                                  # PeelRegionON waste
GARBAGE_ANCHOR = dt.date(2026, 11, 9)              # a known garbage Monday
PRIMARY_CRON = "15 0 * * *"                        # the run used when there is no Firestore to dedupe with
LABELS = {"garbage": "Garbage", "recycling": "Recycling", "organics": "Organics", "yardwaste": "Yard waste"}
ORDER = ["garbage", "recycling", "organics", "yardwaste"]
BUNDLED = Path(__file__).resolve().parent.parent / "app" / "data" / "schedule.json"

DRY = os.environ.get("DRY_RUN") == "1"
FORCE = os.environ.get("FORCE") == "1"


def log(*a):
    print("[notify]", *a, flush=True)


# ---------------- schedule ----------------
def fetch_recollect(start: dt.date, end: dt.date) -> dict[str, list[str]]:
    url = (f"https://api.recollect.net/api/places/{PLACE_ID}/services/{SERVICE_ID}/events"
           f"?nomerge=1&hide=reminder_only&after={start}&before={end}&locale=en-US")
    req = urllib.request.Request(url, headers={"User-Agent": "tmo-house-notifier/1.0"})
    with urllib.request.urlopen(req, timeout=20) as r:
        data = json.load(r)
    days: dict[str, list[str]] = {}
    for ev in data.get("events", []):
        for f in ev.get("flags", []):
            days.setdefault(ev["day"], [])
            if f["name"] not in days[ev["day"]]:
                days[ev["day"]].append(f["name"])
    return days


def load_days(today: dt.date) -> tuple[dict[str, list[str]], str]:
    try:
        days = fetch_recollect(today - dt.timedelta(days=1), today + dt.timedelta(days=70))
        if days:
            return days, "recollect"
    except Exception as e:  # network or API change; fall back rather than stay silent on bin night
        log("ReCollect fetch failed:", e)
    try:
        return json.loads(BUNDLED.read_text(encoding="utf-8"))["days"], "bundled"
    except Exception as e:
        log("bundled schedule unavailable:", e)
        return {}, "none"


def streams_on(day: dt.date, days: dict[str, list[str]]) -> tuple[list[str], bool]:
    """Streams collected on `day` and whether that is an estimate."""
    key = day.isoformat()
    known = sorted(days)
    if key in days:
        s = {f for f in days[key] if f != "holiday"}
        if not s:
            return [], False
        if "garbage" not in s:
            s.add("recycling")  # Circular Materials collects recycling on the non-garbage weeks
        return [k for k in ORDER if k in s], False
    if known and key <= known[-1]:
        return [], False  # inside the published calendar and nothing that day
    if day.weekday() != 0:
        return [], True
    weeks = (day - GARBAGE_ANCHOR).days // 7
    return (["garbage", "organics"] if weeks % 2 == 0 else ["recycling", "organics"]), True


# ---------------- upkeep ----------------
def upkeep_messages(jobs: list[dict], today: dt.date) -> list[str]:
    out = []
    for j in jobs:
        try:
            last = dt.date.fromisoformat(j.get("lastDone") or "")
            due = last + dt.timedelta(days=int(j.get("intervalDays") or 30))
        except ValueError:
            continue
        left = (due - today).days
        name = j.get("name", "Upkeep job")
        if left == 1:
            out.append(f"{name} is due tomorrow.")
        elif left == 0:
            out.append(f"{name} is due today.")
        elif left < 0 and (-left) % 3 == 0:  # nag every third day while overdue
            out.append(f"{name} is {-left} days overdue.")
    return out



# ---------------- calendar + rent ----------------
def occurs_on(ev: dict, day: dt.date) -> bool:
    """Whether a calendar event (see app/js/calendar-model.js) starts on `day`."""
    try:
        start = dt.date.fromisoformat(ev.get("date") or "")
    except ValueError:
        return False
    if day < start or day.isoformat() in (ev.get("skip") or []):
        return False
    until = ev.get("until") or ""
    if until and day.isoformat() > until:
        return False
    rep = ev.get("repeat") or "none"
    if rep == "none":
        return day == start
    if rep == "daily":
        return True
    if rep in ("weekly", "biweekly"):
        step = 7 if rep == "weekly" else 14
        return (day - start).days % step == 0
    if rep == "monthly":
        return day.day == start.day
    return False


def fmt_time(hhmm: str) -> str:
    if not hhmm:
        return ""
    h, m = (int(x) for x in hhmm.split(":"))
    return f"{h % 12 or 12}{':%02d' % m if m else ''} {'a.m.' if h < 12 else 'p.m.'}"


def house_event_messages(events: list[dict], tomorrow: dt.date) -> list[str]:
    out = []
    for ev in sorted(events, key=lambda e: (not e.get("allDay"), e.get("start") or "")):
        if ev.get("owner") != "house" or not occurs_on(ev, tomorrow):
            continue
        when = "all day" if ev.get("allDay") else f"at {fmt_time(ev.get('start', ''))}"
        line = f"Tomorrow: {ev.get('title', 'House event')} {when}"
        out.append(line if line.endswith('.') else line + '.')
    return out


def rent_message(household: dict, tomorrow: dt.date) -> str | None:
    rent = household.get("rent") or {}
    amount = rent.get("amount", 5000)
    due_day = int(rent.get("dueDay", 1))
    if tomorrow.day != due_day:
        return None
    return f"Rent (${amount:,.0f}) is due tomorrow." if float(amount).is_integer() else f"Rent (${amount:,.2f}) is due tomorrow."

# ---------------- delivery ----------------
def send_ntfy(topic: str, title: str, body: str, url: str | None):
    if DRY:
        return log(f"DRY ntfy -> {topic}: {title} | {body}")
    req = urllib.request.Request(f"https://ntfy.sh/{topic}", data=body.encode("utf-8"), method="POST")
    req.add_header("Title", title.encode("utf-8").decode("latin-1", "ignore"))
    req.add_header("Tags", "wastebasket" if "Bins" in title else "wrench")
    if url:
        req.add_header("Click", url)
    urllib.request.urlopen(req, timeout=20).read()
    log("ntfy sent")


def send_fcm(db, hid: str, title: str, body: str, url: str | None):
    from firebase_admin import messaging

    devices = list(db.collection("households").document(hid).collection("devices").stream())
    if not devices:
        return log("no registered phones")
    msgs = [messaging.Message(
        token=d.get("token"),
        webpush=messaging.WebpushConfig(
            notification=messaging.WebpushNotification(title=title, body=body, icon="icons/icon-192.png",
                                                       tag="tmo-nightly", renotify=True),
            fcm_options=messaging.WebpushFCMOptions(link=url) if url else None,
        ),
    ) for d in devices]
    if DRY:
        return log(f"DRY fcm -> {len(msgs)} phone(s): {title} | {body}")
    res = messaging.send_each(msgs)
    for d, r in zip(devices, res.responses):
        if r.exception is not None:
            log("push failed for a phone:", type(r.exception).__name__)
            if isinstance(r.exception, (messaging.UnregisteredError, messaging.SenderIdMismatchError)):
                d.reference.delete()
    log(f"push sent to {res.success_count}/{len(msgs)} phone(s)")


def main() -> int:
    now = dt.datetime.now(TZ)
    today = now.date()
    tomorrow = today + dt.timedelta(days=1)
    sa = os.environ.get("FIREBASE_SERVICE_ACCOUNT", "").strip()
    hid = os.environ.get("HOUSEHOLD_ID", "").strip()
    topic = os.environ.get("NTFY_TOPIC", "").strip()
    app_url = os.environ.get("APP_URL", "").strip() or None
    trigger = os.environ.get("TRIGGER", "")

    days, source = load_days(today)
    log(f"{now:%Y-%m-%d %H:%M} Toronto, schedule source: {source}")

    db = None
    if sa and hid:
        import firebase_admin
        from firebase_admin import credentials, firestore

        firebase_admin.initialize_app(credentials.Certificate(json.loads(sa)))
        db = firestore.client()
        home = db.collection("households").document(hid)
        if not home.get().exists:
            log("HOUSEHOLD_ID not found in Firestore; check the code in the app's Settings")
            return 1
        if source == "recollect" and not DRY:
            home.collection("meta").document("schedule").set(
                {"days": days, "fetchedAt": now.isoformat(), "source": "ReCollect PeelRegionON"})
    elif sa or hid:
        log("set both FIREBASE_SERVICE_ACCOUNT and HOUSEHOLD_ID to use Firebase")

    # Only send in the evening, once a night.
    if not FORCE:
        if not 18 <= now.hour <= 23:
            log("outside the 6-11 p.m. window, not sending")
            return 0
        if db is None and trigger and trigger != PRIMARY_CRON:
            log("backup run without Firestore to dedupe, not sending")
            return 0
        if db is not None:
            state = db.collection("households").document(hid).collection("meta").document("notifier")
            snap = state.get()
            if snap.exists and snap.to_dict().get("lastSent") == today.isoformat():
                log("already sent tonight")
                return 0

    lines, title = [], None
    streams, estimated = streams_on(tomorrow, days)
    if streams:
        title = "Bins out tonight"
        names = ", ".join(LABELS[s] for s in streams)
        lines.append(f"Tomorrow: {names}. Out by 7 a.m.{' (estimated date)' if estimated else ''}")
    if db is not None:
        home_ref = db.collection("households").document(hid)
        rent = rent_message(home_ref.get().to_dict() or {}, tomorrow)
        if rent:
            title = title or "Rent due tomorrow"
            lines.append(rent)
        events = [d.to_dict() for d in home_ref.collection("events").stream()]
        house = house_event_messages(events, tomorrow)
        if house:
            title = title or "Tomorrow at the house"
            lines += house
        jobs = [d.to_dict() for d in home_ref.collection("upkeep").stream()]
        ups = upkeep_messages(jobs, today)
        if ups:
            title = title or "House upkeep"
            lines += ups

    if not lines:
        log("nothing to send tonight")
        return 0
    body = "\n".join(lines)
    log("message:", title, "|", body.replace("\n", " / "))

    if db is not None:
        send_fcm(db, hid, title, body, app_url)
    if topic:
        send_ntfy(topic, title, body, app_url)
    if db is None and not topic:
        log("no delivery configured (set NTFY_TOPIC or Firebase secrets)")
    if db is not None and not DRY:
        db.collection("households").document(hid).collection("meta").document("notifier").set(
            {"lastSent": today.isoformat(), "at": now.isoformat()})
    return 0


if __name__ == "__main__":
    sys.exit(main())
