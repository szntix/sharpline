// Small shared helpers for every view.
import { teamColors, ghostKind, logoUrl } from "./teams.js";
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
  const kind = ghostKind(abbr);     // tone on tone: a light panel gets a light silhouette, a dark panel a dark one, and a near-black panel a light one (see ghostKind)
  return `<img class="emblem${kind ? " " + kind : ""}" src="${url}" alt="" aria-hidden="true" loading="lazy" decoding="async" referrerpolicy="no-referrer">`;
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
// His rank among a sorted (ascending) cohort, 1 is best, ties share the better rank; n is the cohort size.
export function rankIn(sorted, v) { if (!sorted.length || v == null) return null; let hi = 0; while (hi < sorted.length && sorted[hi] <= v) hi++; return { rank: sorted.length - hi + 1, n: sorted.length }; }
export function percentile(sorted, v) {
  if (!sorted.length) return null;
  let lo = 0; while (lo < sorted.length && sorted[lo] < v) lo++;
  let hi = lo; while (hi < sorted.length && sorted[hi] === v) hi++;
  return Math.round(((lo + hi) / 2 / sorted.length) * 100);
}

// A short label for an opponent's team name, for tight spots like the score bug. Emoji and filler words ("The", "Mr", "Team"...) are ignored; a name of three
// or more real words becomes its initials ("Smokin' Jay Cutler" is SJC); otherwise the first real word, abbreviated with an ellipsis if it runs past ten letters.
const FILLER = new Set(["the", "a", "an", "mr", "mrs", "ms", "dr", "team", "los", "las", "of", "and", "da", "el", "la"]);
export function shortTeamName(raw) {
  const text = String(raw ?? "").trim(), clean = text.replace(/[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\uFE0F\u200D]/gu, "").replace(/\s+/g, " ").trim();
  const edge = (w) => w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ""), words = clean.split(" ").map(edge).filter(Boolean), real = words.filter((w) => !FILLER.has(w.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "")));
  const fit = (s) => (s.length <= 10 ? s : s.slice(0, 9) + "\u2026");
  if (real.length >= 3) return real.slice(0, 4).map((w) => Array.from(w)[0]).join("").toUpperCase();
  if (real.length && real[0].replace(/[^\p{L}\p{N}]/gu, "").length >= 2) return fit(real[0]);
  return fit(clean || text || "Opponent");
}
