// Small shared helpers for every view.
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

// Status chip text for a player row
export function statusChip(status, practice) {
  if (!status && practice !== "DNP") return "";
  const s = status || "";
  const cls = ["Out", "IR", "PUP", "Sus", "NA", "COV"].includes(s) ? "out" : s === "Doubtful" ? "doubt" : "q";
  const label = s === "Questionable" ? "Q" : s === "Doubtful" ? "D" : s === "Out" ? "OUT" : s || "DNP";
  return `<span class="tag ${cls}" title="${esc(s || "Did not practice")}">${esc(label)}</span>`;
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
