// "Request to book" widget for room pages. Usage: <div id="book-widget" data-room="3"></div>
// A request is only created after the guest verifies their email (Google or email link).
import { auth, RULES, roomName, today, addDays, nights, busyFor, clash, google, sendEmailLink, finishEmailLink, createRequest, onAuthStateChanged, signOut } from "/assets/mn-firebase.js";

const el = document.getElementById("book-widget");
if (el) init();

function init() {
  const room = el.dataset.room, t = today(), PKEY = "mn-pending-" + room;
  let pending = {}; try { pending = JSON.parse(localStorage.getItem(PKEY) || "{}"); } catch (e) {}
  const v = (k, d) => pending[k] || d;
  el.innerHTML = `
  <form class="bk" novalidate>
    <div class="bk-row">
      <label for="bk-in">Check-in<input id="bk-in" type="date" required min="${t}" value="${v("checkin", addDays(t, 1))}"></label>
      <label for="bk-out">Check-out<input id="bk-out" type="date" required min="${addDays(t, 1)}" value="${v("checkout", addDays(t, 2))}"></label>
      <label for="bk-g">Guests<select id="bk-g"><option value="1">1</option><option value="2" selected>2</option><option value="3">3 (1 extra, charged)</option></select></label>
    </div>
    <p class="bk-status" id="bk-status" aria-live="polite">Checking dates…</p>
    <div class="bk-row">
      <label for="bk-name">Your name<input id="bk-name" autocomplete="name" required value="${esc(v("name", ""))}"></label>
      <label for="bk-phone">WhatsApp number<input id="bk-phone" type="tel" autocomplete="tel" required placeholder="+91" value="${esc(v("phone", ""))}"></label>
    </div>
    <div class="bk-verify" id="bk-verify"></div>
    <button class="btn btn-brass" id="bk-send" type="submit" disabled>Send booking request</button>
    <p class="muted bk-note">No payment now. We confirm on WhatsApp, then you pay the full amount by UPI to hold the room. Bookings are non-refundable. <a href="/booking-policy">Booking policy</a>.</p>
  </form>`;
  const $ = (id) => document.getElementById(id);
  if (pending.guests) $("bk-g").value = pending.guests;
  let busy = [], user = null, datesOk = false;

  const form = () => ({ room, checkin: $("bk-in").value, checkout: $("bk-out").value, guests: $("bk-g").value, name: $("bk-name").value.trim(), phone: $("bk-phone").value.trim() });
  const savePending = () => { try { localStorage.setItem(PKEY, JSON.stringify(form())); } catch (e) {} };
  const setStatus = (cls, txt) => { const s = $("bk-status"); s.className = "bk-status " + cls; s.textContent = txt; };
  const refresh = () => { $("bk-send").disabled = !(datesOk && user && user.emailVerified); };

  function checkDates() {
    const f = form(), n = nights(f.checkin, f.checkout);
    if (!f.checkin || !f.checkout || n < 1) { datesOk = false; setStatus("bad", "Check-out must be after check-in."); return refresh(); }
    if (clash(busy, f.checkin, f.checkout).length) { datesOk = false; setStatus("bad", "Not available for these dates. Try other dates or another room."); return refresh(); }
    datesOk = true; setStatus("ok", `Available: ${n} night${n > 1 ? "s" : ""}. Price is confirmed on WhatsApp.`); refresh();
  }
  ["bk-in", "bk-out"].forEach((id) => $(id).addEventListener("change", () => { if ($("bk-out").value <= $("bk-in").value) $("bk-out").value = addDays($("bk-in").value, 1); checkDates(); savePending(); }));
  ["bk-g", "bk-name", "bk-phone"].forEach((id) => $(id).addEventListener("change", savePending));

  function renderVerify() {
    const box = $("bk-verify");
    if (user && user.emailVerified) {
      box.innerHTML = `<p class="bk-ok">✓ Verified as <b>${esc(user.email)}</b> <button type="button" class="linkbtn" id="bk-out-btn">Use another email</button></p>`;
      $("bk-out-btn").onclick = () => signOut(auth);
    } else {
      box.innerHTML = `<p class="bk-vt"><b>Verify your email to send the request</b></p>
        <div class="bk-row"><button type="button" class="btn" id="bk-google">Continue with Google</button></div>
        <div class="bk-row bk-email"><label for="bk-email">Or get a link by email<input id="bk-email" type="email" autocomplete="email" placeholder="you@example.com"></label><button type="button" class="btn" id="bk-link">Email me a link</button></div>
        <p class="muted" id="bk-vmsg" aria-live="polite"></p>`;
      $("bk-google").onclick = async () => { savePending(); try { await google(); } catch (e) { $("bk-vmsg").textContent = "Google sign-in was closed or blocked. Try again or use the email link."; } };
      $("bk-link").onclick = async () => {
        const email = $("bk-email").value.trim();
        if (!/^\S+@\S+\.\S+$/.test(email)) { $("bk-vmsg").textContent = "Please enter a valid email address."; return; }
        savePending();
        try { await sendEmailLink(email, location.origin + location.pathname + "#book"); $("bk-vmsg").textContent = "Link sent. Open it on this device to verify, then send your request."; }
        catch (e) { $("bk-vmsg").textContent = "Could not send the link. Please try again in a minute."; }
      };
    }
    refresh();
  }

  onAuthStateChanged(auth, (u) => { user = u; renderVerify(); });
  finishEmailLink().catch(() => setStatus("bad", "That verification link has expired. Please request a new one."));
  busyFor(room).then((b) => { busy = b; checkDates(); }).catch(() => { busy = []; checkDates(); });

  el.querySelector("form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = form();
    if (!datesOk || !user || !user.emailVerified) return;
    if (f.name.length < 2 || f.phone.replace(/\D/g, "").length < 10) { setStatus("bad", "Please add your name and a 10-digit WhatsApp number."); return; }
    $("bk-send").disabled = true; setStatus("", "Sending…");
    try {
      const ref = await createRequest(user, f);
      try { localStorage.removeItem(PKEY); } catch (e) {}
      if (window.gtag) gtag("event", "booking_request", { room });
      const msg = `Hi, I sent a booking request for the ${roomName(room)} at Mahadev Niwas.\nCheck-in: ${f.checkin}\nCheck-out: ${f.checkout}\nGuests: ${f.guests}\nName: ${f.name}\nRef: ${ref.id}`;
      el.innerHTML = `<div class="bk-done"><b>Request received.</b><p>Reference <code>${ref.id}</code>. We'll confirm availability and price on WhatsApp and send you a payment link (full amount by UPI). To speed it up, send us this request now:</p>
        <a class="btn btn-brass" target="_blank" rel="noopener" href="https://wa.me/919876954987?text=${encodeURIComponent(msg)}">Send on WhatsApp</a></div>`;
    } catch (err) { setStatus("bad", "Could not send the request. Please try again or message us on WhatsApp."); refresh(); }
  });
}
function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }
