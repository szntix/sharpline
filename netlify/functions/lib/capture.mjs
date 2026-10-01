import { store } from "./util.mjs";

// History capture. Betting lines, expert ranks, injury designations, forecast weather and Sleeper's
// add/drop trends cannot be rebuilt after the fact, so a scheduled job saves them as they change.
//
// Storage: one small document per week and kind, in the "capture" store, keyed "2026-w4/lines".
// A document is { v, season, week, kind, rows } and a row is [timestamp, key, ...values].
// Only changes are stored: a row is added when a key's values differ from its last row.
//   lines     key "AWAY@HOME"        values spread, total, moneyline home, moneyline away
//   ecr       key Sleeper id         values rank, best, worst, percent rostered
//   injuries  key Sleeper id         values Friday designation, practice status, injury
//   weather   key "AWAY@HOME"        values temp, wind, gust, chance of precipitation
//   trends    key Sleeper id         values "a" (add) or "d" (drop), count over 24 hours
//   health    key source             values "ok" or "broken", the problem
// The final pre-kickoff line for a game is simply its last lines row before kickoff.

export const KINDS = ["lines", "ecr", "injuries", "weather", "trends", "health"];
const MAX_ROWS = 20000;           // a document that large means something is wrong; stop growing it
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export const docKey = (season, week, kind) => `${season}-w${week}/${kind}`;

// ---------- the calendar ----------
export function etParts(ms) {
  const f = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short", hour: "numeric", minute: "numeric", hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit" });
  const o = Object.fromEntries(f.formatToParts(new Date(ms)).map((p) => [p.type, p.value]));
  const hour = Number(o.hour);
  return { dow: DOW.indexOf(o.weekday), mins: hour * 60 + Number(o.minute), day: `${o.year}-${o.month}-${o.day}` };
}

// How often each kind is due, in minutes. A game window is anywhere near a known kickoff, or by the
// usual calendar (Thursday night, Sunday including the 9:30 AM London games, Monday night).
export function phase(ms, kickoffs = []) {
  const { dow, mins } = etParts(ms);
  const win = (d, a, b) => dow === d && mins >= a && mins < b;
  const near = kickoffs.some((k) => ms >= k - 2 * 3600e3 && ms <= k + 4 * 3600e3);
  const calendar = win(4, 19 * 60, 1440) || win(5, 0, 30) || win(0, 8 * 60 + 30, 1440) || win(1, 0, 30) || win(1, 19 * 60, 1440) || win(2, 0, 30);
  if (near || calendar) return { name: "game window", gap: { lines: 15, injuries: 15, weather: 15, ecr: 60 } };
  if (dow === 4 || dow === 0 || dow === 1) return { name: "game day", gap: { lines: 60, injuries: 60, weather: 60, ecr: 60 } };
  if (dow === 2) return { name: "early week", gap: { lines: 360, injuries: 360, weather: 360, ecr: 360 } };
  return { name: "midweek", gap: { lines: 180, injuries: 180, weather: 180, ecr: 180 } };
}

// A minute of slack, because a cron that fires every 15 minutes drifts by a few seconds.
export const due = (last, gapMin, now) => !last || now - last >= gapMin * 60e3 - 60e3;

// ---------- documents ----------
export async function loadDoc(st, season, week, kind) {
  return (await st.get(docKey(season, week, kind), { type: "json" }).catch(() => null)) || { v: 1, season, week, kind, rows: [] };
}

// Append a row for every entry whose values changed since its last row. entry = [key, ...values].
// `always` is for kinds that are a fresh reading each time (trends) rather than a state.
export function applyChanges(doc, now, entries, { always = false } = {}) {
  const cur = {};
  if (!always) for (const r of doc.rows) cur[r[1]] = JSON.stringify(r.slice(2));
  let n = 0;
  for (const e of entries) {
    if (doc.rows.length >= MAX_ROWS) { doc.full = true; break; }
    const sig = JSON.stringify(e.slice(1));
    if (!always && cur[e[0]] === sig) continue;
    doc.rows.push([now, ...e]); cur[e[0]] = sig; n++;
  }
  return n;
}

// ---------- what to save from a feed ----------
const r1 = (x) => (x == null ? null : Math.round(x * 10) / 10);
const r2 = (x) => (x == null ? null : Math.round(x * 100) / 100);
export function entriesFromFeed(feed) {
  const lines = [], weather = [], games = {};
  for (const g of feed.games || []) {
    const key = `${g.away}@${g.home}`, L = g.line;
    games[key] = { id: g.id, k: g.kickoff || null, st: g.status?.state || null };
    // Only ESPN's live number counts as a line reading; nflverse's fallback is a closing line from the schedule.
    if (L && g.from !== "nflverse" && L.book !== "nflverse" && L.book !== "Closing line") lines.push([key, L.spread, L.total, L.mlHome ?? null, L.mlAway ?? null]);
    if (g.forecast) weather.push([key, g.forecast.temp, g.forecast.wind, g.forecast.gust, g.forecast.pop ?? null]);
  }
  const ecr = feed.ecr?.status === "ok" ? Object.entries(feed.ecr.players || {}).map(([id, p]) => [id, r2(p.e), p.b, p.w, r1(p.o)]) : [];
  const injuries = Object.entries(feed.injuries?.players || {}).map(([id, v]) => [id, v.s ?? null, v.p ?? null, v.i ?? null]);
  const health = Object.entries(feed.health || {}).map(([k, v]) => [k, v.ok ? "ok" : "broken", (v.problems || []).join("; ")]);
  return { lines, weather, ecr, injuries, health, games, ecrScraped: feed.ecr?.scraped || null };
}

// ---------- one run ----------
// Loaders are passed in so the whole run can be tested without a network.
export async function runCapture({ now = Date.now(), loadFeed, loadTrends, st = store("capture") } = {}) {
  const meta = (await st.get("meta", { type: "json" }).catch(() => null)) || { v: 1, last: {}, kickoffs: [] };
  const ph = phase(now, meta.kickoffs), t = etParts(now);
  const todo = ["lines", "injuries", "weather", "ecr"].filter((k) => due(meta.last[k], ph.gap[k], now));
  const trendsDue = t.mins >= 360 && meta.trendsDay !== t.day;       // once a day, from 6 AM Eastern
  const out = { ok: true, at: now, phase: ph.name, ran: [], wrote: {}, errors: [] };
  if (!todo.length && !trendsDue) { out.skipped = true; return out; }

  if (todo.length) {
    try {
      const feed = await loadFeed(), E = entriesFromFeed(feed);
      meta.season = feed.season; meta.week = feed.week;
      meta.kickoffs = (feed.games || []).map((g) => Date.parse(g.kickoff)).filter(Boolean);
      for (const kind of todo) {
        const doc = await loadDoc(st, feed.season, feed.week, kind);
        const n = applyChanges(doc, now, E[kind]); let dirty = n > 0;
        if (kind === "lines" && JSON.stringify(doc.games) !== JSON.stringify(E.games)) { doc.games = E.games; dirty = true; }
        if (kind === "ecr" && E.ecrScraped && doc.scraped !== E.ecrScraped) { doc.scraped = E.ecrScraped; dirty = true; }
        if (dirty) { doc.updated = now; await st.setJSON(docKey(feed.season, feed.week, kind), doc); }
        meta.last[kind] = now; out.ran.push(kind); out.wrote[kind] = n;
      }
      const hd = await loadDoc(st, feed.season, feed.week, "health"), hn = applyChanges(hd, now, E.health);
      if (hn) await st.setJSON(docKey(feed.season, feed.week, "health"), hd);
      out.wrote.health = hn;
    } catch (e) { out.ok = false; out.errors.push(`feed: ${e.message}`); }
  }

  if (trendsDue && meta.season && meta.week) {
    try {
      const tr = await loadTrends(), doc = await loadDoc(st, meta.season, meta.week, "trends");
      const entries = [...(tr.add || []).map((x) => [String(x.player_id), "a", x.count]), ...(tr.drop || []).map((x) => [String(x.player_id), "d", x.count])];
      const n = applyChanges(doc, now, entries, { always: true });
      if (n) await st.setJSON(docKey(meta.season, meta.week, "trends"), doc);
      meta.trendsDay = t.day; out.ran.push("trends"); out.wrote.trends = n;
    } catch (e) { out.ok = false; out.errors.push(`trends: ${e.message}`); }
  }

  meta.lastRun = now; meta.phase = ph.name;
  await st.setJSON("meta", meta);
  return out;
}
