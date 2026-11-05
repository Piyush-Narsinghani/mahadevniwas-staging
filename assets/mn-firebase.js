// Firebase setup shared by the booking widget and the host dashboard.
// The web config is public by design; access is controlled by firestore.rules.
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged,
  sendSignInLinkToEmail, isSignInWithEmailLink, signInWithEmailLink
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore, collection, doc, addDoc, setDoc, updateDoc, deleteDoc, getDocs,
  onSnapshot, query, where, orderBy, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const app = initializeApp({
  apiKey: "AIzaSyDM9Xa4rPIgxe3xzRByXFnt1QY78t8UAhc",
  authDomain: "mahadev-niwas-bookings.firebaseapp.com",
  projectId: "mahadev-niwas-bookings",
  storageBucket: "mahadev-niwas-bookings.firebasestorage.app",
  messagingSenderId: "863252002461",
  appId: "1:863252002461:web:d99978da2d3ab38f918674"
});
export const auth = getAuth(app);
export const db = getFirestore(app);
export const ADMIN_EMAIL = "piyushnarsinghani13@gmail.com";

export const ROOMS = [
  { no: "3", name: "King AC Suite" }, { no: "4", name: "Family AC Suite" }, { no: "6", name: "Roomy AC Suite" },
  { no: "5", name: "Compact AC Room" }, { no: "1", name: "Quiet AC Suite" }, { no: "2", name: "Budget Fan Room" }
];
// Draft rules for staging, to be finalised by the owner.
export const RULES = { advancePct: 100, refundable: false, maxGuests: 3 };
export const roomName = (no) => (ROOMS.find((r) => r.no === String(no)) || { name: "Room " + no }).name;

export const iso = (d) => d.toISOString().slice(0, 10);
export function today() { const d = new Date(); return iso(new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))); }
export function addDays(s, n) { const d = new Date(s + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return iso(d); }
export const nights = (a, b) => Math.round((new Date(b) - new Date(a)) / 864e5);
const overlaps = (a1, a2, b1, b2) => a1 < b2 && b1 < a2;

// Availability (public, dates only)
export async function airbnbBusy() {
  try { const r = await fetch("https://raw.githubusercontent.com/Piyush-Narsinghani/mahadevniwas-staging/main/data/airbnb-busy.json", { cache: "no-store" }); return r.ok ? (await r.json()).blocks || [] : []; } catch (e) { return []; }
}
export async function busyFor(room) {
  const [snap, ab] = await Promise.all([getDocs(query(collection(db, "busy"), where("room", "==", String(room)))), airbnbBusy()]);
  return snap.docs.map((d) => d.data()).concat(ab.filter((b) => b.room === String(room)));
}
export function clash(busy, checkin, checkout) { return busy.filter((b) => overlaps(checkin, checkout, b.from, b.to)); }

// Guest verification
export const google = () => signInWithPopup(auth, new GoogleAuthProvider());
export async function sendEmailLink(email, returnUrl) {
  await sendSignInLinkToEmail(auth, email, { url: returnUrl, handleCodeInApp: true });
  try { localStorage.setItem("mn-email-for-signin", email); } catch (e) {}
}
export async function finishEmailLink() {
  if (!isSignInWithEmailLink(auth, location.href)) return null;
  let email = null; try { email = localStorage.getItem("mn-email-for-signin"); } catch (e) {}
  if (!email) email = prompt("Confirm your email to finish verification");
  if (!email) return null;
  const cred = await signInWithEmailLink(auth, email, location.href);
  try { localStorage.removeItem("mn-email-for-signin"); } catch (e) {}
  history.replaceState(null, "", location.pathname + location.hash);
  return cred.user;
}

export async function createRequest(user, f) {
  return addDoc(collection(db, "bookings"), {
    room: String(f.room), checkin: f.checkin, checkout: f.checkout, guests: Number(f.guests),
    name: f.name, phone: f.phone, email: user.email, uid: user.uid,
    status: "requested", source: "website", note: f.note || "",
    verifiedBy: user.providerData[0] ? user.providerData[0].providerId : "email",
    created: serverTimestamp()
  });
}

export { onAuthStateChanged, signOut, collection, doc, addDoc, setDoc, updateDoc, deleteDoc, onSnapshot, query, orderBy, where, serverTimestamp };
