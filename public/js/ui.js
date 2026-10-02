// Small shared helpers for every view.
import { teamColors, logoUrl } from "./teams.js";
export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
export const f1 = (x) => (x == null || !isFinite(x) ? "–" : (Math.round(x * 10) / 10).toFixed(1));
export const f0 = (x) => (x == null || !isFinite(x) ? "–" : Math.round(x).toString());
export const sgn = (x, d = 1) => (x >= 0 ? "+" : "−") + Math.abs(x).toFixed(d);
export const pct = (x) => `${Math.round(x * 100)}%`;
export const uid = () => Math.random().toString(36).slice(2, 10);
export const posLabel = (p) => (p === "DEF" ? "DST" : p);

export function ago(t) {
  if (!t) return "never";
  const m = Math.max(0, (Date.now() - t) / 60000);
  if (m < 1.5) return "just now";
  if (m < 60) return `${Math.round(m)} min ago`;
  if (m < 60 * 36) return `${Math.round(m / 60)} h ago`;
  return `${Math.round(m / 1440)} days ago`;
}
export const agoShort = (t) => {
  if (!t) return "–";
  const m = Math.max(0, (Date.now() - t) / 60000);
  return m < 1.5 ? "now" : m < 60 ? `${Math.round(m)}m` : m < 60 * 36 ? `${Math.round(m / 60)}h` : `${Math.round(m / 1440)}d`;
};

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export function kickoffText(g) {
  if (!g) return "";
  if (g.status?.completed) return g.homeScore != null ? `Final ${g.awayScore}–${g.homeScore}` : "Final";
  if (g.status?.state === "in") return g.status.detail || "Live";
  if (!g.kickoff) return g.day ? new Date(g.day + "T12:00:00").toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }) : "";
  const d = new Date(g.kickoff);
  return `${DAYS[d.getDay()]} ${d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }).replace(":00", "")}`;
}

// Position chip class, and which team color is visible on the current theme.
const POS_CLASS = { QB: "qb", RB: "rb", WR: "wr", TE: "te", K: "k", DEF: "dst" };
export const posClass = (p) => POS_CLASS[p] || "neu";
export const isDark = () => { const t = document.documentElement.dataset.theme; return t === "dark" || (t !== "light" && matchMedia("(prefers-color-scheme: dark)").matches); };
export const teamStripe = (abbr) => teamColors(abbr, isDark()).stripe;
// The team plate: letters on the team color, with the logo laid over them when it loads.
// mono: the logo as a one-color silhouette (white, or black on a light team color) directly on the team color, with no pale disc behind it.
export function plate(abbr, { mono = false } = {}) {
  const c = teamColors(abbr, isDark()), url = logoUrl(abbr), ink = c.plateInk === "#111111";
  return `<span class="plate${mono ? " mono" : ""}${mono && ink ? " ink" : ""}" style="--pl:${c.plate};--pli:${c.plateInk}" aria-hidden="true">${esc(abbr || "FA")}${url ? `<img src="${url}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">` : ""}</span>`;
}
// A team logo as a soft silhouette for the corner of a panel. It is a filter on the same logo image, so it works for every team and
// both themes, and if the image does not load nothing is left behind. A light team color gets a dark silhouette.
export function emblem(abbr) {
  const url = logoUrl(abbr); if (!url) return "";
  const lite = teamColors(abbr, false).plateInk === "#111111";     // dark text on a light panel: a light silhouette; white text on a dark panel: a dark one
  return `<img class="emblem${lite ? " lite" : ""}" src="${url}" alt="" aria-hidden="true" loading="lazy" decoding="async" referrerpolicy="no-referrer">`;
}

// A small ring that shows how likely a player is to play: full is healthy, empty is out.
export function ring(f) {
  const r = 6, c = 2 * Math.PI * r;
  return `<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="${r}" fill="none" stroke="currentColor" stroke-opacity=".28" stroke-width="2.4"/>${f > 0 ? `<circle cx="8" cy="8" r="${r}" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-dasharray="${(f * c).toFixed(2)} ${c.toFixed(2)}" transform="rotate(-90 8 8)"/>` : ""}</svg>`;
}
const RING = { out: 0, doubt: 0.25, q: 0.75, dnp: 0.5 };

// Status chip for a player row: a ring and a short label. The full word is there for screen readers.
export function statusChip(status, practice) {
  if (!status && practice !== "DNP") return "";
  const s = status || "";
  const kind = ["Out", "IR", "PUP", "Sus", "NA", "COV"].includes(s) ? "out" : s === "Doubtful" ? "doubt" : s ? "q" : "dnp";
  const label = s === "Questionable" ? "Q" : s === "Doubtful" ? "D" : s === "Out" ? "OUT" : s || "DNP";
  return `<span class="chance ${kind === "out" ? "out" : ""}" title="${esc(s || "Did not practice")}">${ring(RING[kind])}<span aria-hidden="true">${esc(label)}</span><span class="sr">${esc(s || "Did not practice")}</span></span>`;
}

export function toast(msg) {
  const t = document.createElement("div"); t.className = "toast"; t.role = "status"; t.textContent = msg;
  document.body.appendChild(t); setTimeout(() => t.remove(), 2800);
}

// Percentile of value within sorted array (0-100)
export function percentile(sorted, v) {
  if (!sorted.length) return null;
  let lo = 0; while (lo < sorted.length && sorted[lo] < v) lo++;
  let hi = lo; while (hi < sorted.length && sorted[hi] === v) hi++;
  return Math.round(((lo + hi) / 2 / sorted.length) * 100);
}
