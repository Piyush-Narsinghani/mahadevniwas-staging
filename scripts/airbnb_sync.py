"""Two-way calendar sync between Airbnb and the Mahadev Niwas booking system.

1. Airbnb -> site: reads each room's Airbnb iCal export link (from the AIRBNB_ICAL secret,
   a JSON object like {"3": "https://www.airbnb.co.in/calendar/ical/...ics?s=..."}) and writes
   data/airbnb-busy.json with dates only (no guest details), used by the room pages and dashboard.
2. Site -> Airbnb: reads confirmed direct bookings and blocked dates from the public, dates-only
   Firestore "busy" collection and writes data/cal/room-<no>.ics, which Airbnb imports per listing.

Runs hourly in GitHub Actions. Standard library only.
"""
import datetime as dt, json, os, re, sys, urllib.request

PROJECT = "mahadev-niwas-bookings"
API_KEY = "AIzaSyDM9Xa4rPIgxe3xzRByXFnt1QY78t8UAhc"  # public web key; busy/ is world-readable by rule
ROOMS = ["1", "2", "3", "4", "5", "6"]
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TODAY = dt.date.today().isoformat()


def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": "MahadevNiwasCalendarSync/1.0"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read().decode("utf-8", "replace")


def parse_ics(text):
    text = re.sub(r"\r?\n[ \t]", "", text)  # unfold lines
    out = []
    for ev in re.findall(r"BEGIN:VEVENT(.*?)END:VEVENT", text, re.S):
        s = re.search(r"DTSTART[^:]*:(\d{8})", ev)
        e = re.search(r"DTEND[^:]*:(\d{8})", ev)
        if not s or not e:
            continue
        f = lambda x: f"{x[:4]}-{x[4:6]}-{x[6:]}"
        out.append((f(s.group(1)), f(e.group(1))))
    return out


def airbnb_to_site():
    raw = os.environ.get("AIRBNB_ICAL", "").strip()
    if not raw:
        print("AIRBNB_ICAL secret not set; skipping Airbnb import")
        return None
    links = json.loads(raw)
    blocks, errors = [], []
    for room, url in links.items():
        try:
            for a, b in parse_ics(get(url)):
                if b > TODAY:
                    blocks.append({"room": str(room), "from": a, "to": b, "kind": "airbnb"})
        except Exception as e:  # keep other rooms working if one link fails
            errors.append(str(room))
            print(f"room {room}: fetch failed ({type(e).__name__})", file=sys.stderr)
    blocks.sort(key=lambda x: (x["room"], x["from"]))
    return {"updated": dt.datetime.utcnow().strftime("%Y-%m-%dT%H:%MZ"), "errors": errors, "blocks": blocks}


def site_to_airbnb():
    url = f"https://firestore.googleapis.com/v1/projects/{PROJECT}/databases/(default)/documents/busy?pageSize=1000&key={API_KEY}"
    docs = json.loads(get(url)).get("documents", [])
    per = {r: [] for r in ROOMS}
    for d in docs:
        f = {k: list(v.values())[0] for k, v in d.get("fields", {}).items()}
        if f.get("kind") == "airbnb" or f.get("room") not in per:
            continue  # never echo Airbnb's own dates back to Airbnb
        if f.get("to", "") > TODAY:
            per[f["room"]].append((d["name"].split("/")[-1], f["from"], f["to"]))
    stamp = dt.datetime.utcnow().strftime("%Y%m%dT%H%M%SZ")
    files = {}
    for room, evs in per.items():
        lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Mahadev Niwas//Direct bookings//EN", "CALSCALE:GREGORIAN"]
        for uid, a, b in sorted(evs, key=lambda x: x[1]):
            lines += ["BEGIN:VEVENT", f"UID:{uid}@mahadevniwas.com", f"DTSTAMP:{stamp}",
                      f"DTSTART;VALUE=DATE:{a.replace('-', '')}", f"DTEND;VALUE=DATE:{b.replace('-', '')}",
                      "SUMMARY:Not available", "END:VEVENT"]
        lines.append("END:VCALENDAR")
        files[room] = "\r\n".join(lines) + "\r\n"
    return files


def write(path, content):
    path = os.path.join(ROOT, path)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    old = open(path, encoding="utf-8").read() if os.path.exists(path) else None
    if old != content:
        open(path, "w", encoding="utf-8", newline="").write(content)
        print("updated", os.path.relpath(path, ROOT))


if __name__ == "__main__":
    data = airbnb_to_site()
    if data is not None:
        prev = os.path.join(ROOT, "data/airbnb-busy.json")
        if os.path.exists(prev):  # only bump the timestamp when dates actually change
            try:
                p = json.load(open(prev))
                if p.get("blocks") == data["blocks"] and p.get("errors") == data["errors"]:
                    data["updated"] = p.get("updated", data["updated"])
            except Exception:
                pass
        write("data/airbnb-busy.json", json.dumps(data, indent=1) + "\n")
    for room, ics in site_to_airbnb().items():
        body = re.sub(r"DTSTAMP:\d{8}T\d{6}Z", "DTSTAMP:20260101T000000Z", ics)  # stable file unless dates change
        write(f"data/cal/room-{room}.ics", body)
