// Availability calendar for room pages. Usage: <div id="book-widget" data-room="3"></div>
// Guests pick dates on a live calendar (Airbnb + direct bookings), then book on Airbnb or WhatsApp.
import { roomName, today, addDays, nights, busyFor } from "/assets/mn-firebase.js?v=3";

const AIRBNB = { "3": "1337026475284159269", "4": "1337056930228579269", "6": "1337043712766653017", "5": "1337059087112427101", "1": "1339101345497451595", "2": "1339104264281029729" };
const WA = "919876954987";
const el = document.getElementById("book-widget");
if (el) init();

function init() {
  const room = el.dataset.room, t = today();
  let busy = [], start = null, end = null, view = t.slice(0, 7); // YYYY-MM
  el.innerHTML = `
  <div class="cal-wrap">
    <div class="cal-nav"><button type="button" class="btn btn-ghost cal-arrow" id="cal-prev" aria-label="Previous month">‹</button>
      <span class="cal-help" id="cal-help">Loading availability…</span>
      <button type="button" class="btn btn-ghost cal-arrow" id="cal-next" aria-label="Next month">›</button></div>
    <div class="cal-months" id="cal-months"></div>
    <div class="cal-legend"><span><i class="lg free"></i>Available</span><span><i class="lg off"></i>Booked</span><span><i class="lg sel"></i>Your dates</span></div>
    <div class="cal-pick">
      <p class="cal-sum" id="cal-sum" aria-live="polite">Tap your check-in date.</p>
      <label for="cal-g">Guests<select id="cal-g"><option value="1">1</option><option value="2" selected>2</option><option value="3">3 (1 extra, charged)</option></select></label>
    </div>
    <div class="cta cal-cta">
      <a class="btn btn-brass" id="go-ab" target="_blank" rel="noopener" data-room="${room}">Book on Airbnb →</a>
      <a class="btn btn-ghost" id="go-wa" target="_blank" rel="noopener">Book on WhatsApp</a>
    </div>
  </div>`;
  const $ = (id) => document.getElementById(id);
  const isBusy = (d) => busy.some((b) => b.from <= d && d < b.to); // night of d is taken
  const rangeFree = (a, b) => { for (let d = a; d < b; d = addDays(d, 1)) if (isBusy(d)) return false; return true; };
  const monthAdd = (ym, n) => { const [y, m] = ym.split("-").map(Number); const d = new Date(Date.UTC(y, m - 1 + n, 1)); return d.toISOString().slice(0, 7); };
  const label = (ym) => new Date(ym + "-01T00:00:00").toLocaleDateString("en-IN", { month: "long", year: "numeric" });
  const fmt = (d) => new Date(d + "T00:00:00").toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });

  function month(ym) {
    const first = new Date(ym + "-01T00:00:00"), lead = (first.getDay() + 6) % 7, days = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
    let h = `<div class="cal-m"><div class="cal-title">${label(ym)}</div><div class="cal-g">` + ["M", "T", "W", "T", "F", "S", "S"].map((x) => `<span class="cal-dow">${x}</span>`).join("") + "<span></span>".repeat(lead);
    for (let i = 1; i <= days; i++) {
      const d = ym + "-" + String(i).padStart(2, "0"), past = d < t, off = isBusy(d);
      const sel = start && (d === start || (end && d > start && d < end) || d === end);
      const cls = ["cal-d", past ? "past" : off ? "off" : "free", sel ? "sel" : "", d === start ? "s" : "", d === end ? "e" : ""].join(" ");
      // a booked night can still be picked as a checkout day
      const canEnd = start && !end && d > start && rangeFree(start, d);
      const dis = past || (off && !canEnd);
      h += `<button type="button" class="${cls}" data-d="${d}" ${dis ? "disabled" : ""} aria-label="${fmt(d)}${off ? ", booked" : ""}">${i}</button>`;
    }
    return h + "</div></div>";
  }
  function render() {
    $("cal-months").innerHTML = month(view) + month(monthAdd(view, 1));
    $("cal-prev").disabled = view <= t.slice(0, 7);
    const g = $("cal-g").value, ab = `https://www.airbnb.co.in/rooms/${AIRBNB[room]}`;
    if (start && end) {
      const n = nights(start, end);
      $("cal-sum").innerHTML = `<b>${fmt(start)} → ${fmt(end)}</b> · ${n} night${n > 1 ? "s" : ""} · <button type="button" class="linkbtn" id="cal-clear">Change dates</button>`;
      $("cal-clear").onclick = () => { start = end = null; render(); };
      $("go-ab").href = `${ab}?check_in=${start}&check_out=${end}&adults=${g}`;
      $("go-wa").href = `https://wa.me/${WA}?text=` + encodeURIComponent(`Hi, I'd like to book the ${roomName(room)} at Mahadev Niwas.\nCheck-in: ${fmt(start)}\nCheck-out: ${fmt(end)} (${n} night${n > 1 ? "s" : ""})\nGuests: ${g}\nIs it available?`);
      $("cal-help").textContent = "Dates selected";
    } else {
      $("cal-sum").textContent = start ? `Check-in ${fmt(start)}. Now tap your check-out date.` : "Tap your check-in date.";
      $("go-ab").href = `${ab}?adults=${g}`;
      $("go-wa").href = `https://wa.me/${WA}?text=` + encodeURIComponent(`Hi, I'd like to book the ${roomName(room)} at Mahadev Niwas. Which dates are free?`);
      $("cal-help").textContent = busy.loaded ? "Live availability" : "Loading availability…";
    }
  }
  $("cal-months").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-d]"); if (!b) return;
    const d = b.dataset.d;
    if (!start || end || d <= start) { if (!isBusy(d)) { start = d; end = null; } }
    else if (rangeFree(start, d)) end = d;
    else { start = isBusy(d) ? null : d; end = null; }
    render();
  });
  $("cal-prev").onclick = () => { view = monthAdd(view, -1); render(); };
  $("cal-next").onclick = () => { view = monthAdd(view, 1); render(); };
  $("cal-g").onchange = render;
  $("go-ab").addEventListener("click", () => { if (window.gtag) gtag("event", "airbnb_click", { room, dates: !!(start && end) }); });
  $("go-wa").addEventListener("click", () => { if (window.gtag) gtag("event", "whatsapp_click", { page: "room-" + room, dates: !!(start && end) }); });
  render();
  busyFor(room).then((b) => { busy = b; }).catch(() => { busy = []; }).finally(() => { busy.loaded = true; render(); });
}
