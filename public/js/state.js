import { feedSignature } from "./refresh.js";
import { api, sleeperApi, saveProfile } from "./api.js";
import { toast } from "./ui.js";
import { SCORING_PRESETS, ROSTER_PRESETS } from "./scoring.js";
import { buildProjections, rosValues, replacement, waiverLevel } from "./engine.js";

// Everything the views share: loaded data, the signed-in user's profile, and derived projections.
export const S = {
  user: null, profile: null, players: null, feed: null, usage: null, outlook: null, acc: null, trending: {},
  week: null, activeWeek: null, errors: {}, loading: true, saveState: "saved", route: { name: "week", args: [] },
  ui: { src: (() => { try { return localStorage.getItem("sharpline.src") || "blend"; } catch { return "blend"; } })(), trView: "me", cmpMode: false, wvMode: "ros", wvPos: "ALL", give: [], get: [], partner: "", imp: null, editing: null, plPos: "ALL", plSort: "proj", plQ: "", plFilter: "all", plMore: 1, pick: [], moves: "waivers", proofPos: "WR", thr: {} },
};
export let render = () => {};
export const setRender = (fn) => { render = fn; };

export const league = () => S.profile?.leagues?.find((l) => l.id === S.profile.active) || S.profile?.leagues?.[0] || null;
export const DEFAULT_LEAGUE = { id: "default", name: "Standard PPR", type: "redraft", teams: 12, scoringPreset: "ppr", scoring: { ...SCORING_PRESETS.ppr.s }, slots: [...ROSTER_PRESETS.standard.slots], bench: 6, endWeek: 17, playoffStart: 15, playoffWeight: true, roster: [], others: [], taken: [], opponent: null };
export const leagueOrDefault = () => league() || DEFAULT_LEAGUE;
export const pl = (id) => S.players?.[id];
export const pname = (id) => pl(id)?.n || id;

const memo = { key: null, v: null };
export const invalidate = () => { memo.key = null; };
export const ctx = () => ({ players: S.players || {}, feed: S.feed, usage: S.usage, outlook: S.outlook, acc: S.acc, trending: S.trending });

// Rankings inside each position: ours (by projection) and the experts' (by average rank).
function rankTables(P, feed) {
  const ours = {}, exp = {}, byPos = {};
  for (const pr of Object.values(P.proj)) {
    const pos = S.players[pr.id]?.p; if (!pos || pr.kind === "none") continue;
    (byPos[pos] ||= []).push(pr);
  }
  for (const [pos, arr] of Object.entries(byPos)) {
    arr.filter((x) => x.ppr > 0).sort((a, b) => b.ppr - a.ppr).forEach((x, i) => { ours[x.id] = i + 1; });
    arr.filter((x) => x.ecr).sort((a, b) => a.ecr.e - b.ecr.e).forEach((x, i) => { exp[x.id] = i + 1; });
  }
  return { ours, exp };
}
// Which numbers drive the app. Blended is the tested default; the others swap in that source's own number (in your scoring) wherever it has one.
export const SOURCES = { blend: "Blended", model: "Our model", experts: "Experts", sleeper: "Sleeper" };
function withSource(P, src) {
  if (!src || src === "blend") return P;
  const proj = {};
  for (const [id, x] of Object.entries(P.proj)) { const raw = src === "model" ? x.model : src === "experts" ? x.experts : x.sleeper, scale = x.ppr > 0 ? x.mean / x.ppr : null;
    proj[id] = raw != null && scale != null ? { ...x, mean: raw * scale, srcMissing: false } : { ...x, srcMissing: true }; }
  return { ...P, proj };
}
export function computed(L = leagueOrDefault()) {
  if (!S.players || !S.feed) return null;
  const key = JSON.stringify([L, S.ui.src, S.feed.fetchedAt, S.feed.week, S.usage?.asOf, !!S.outlook, S.acc?.sleeperShare]);
  if (memo.key === key) return memo.v;
  const c = ctx(), P0 = buildProjections(c, L), P = withSource(P0, S.ui.src), R = rosValues(c, L, P), repl = waiverLevel(c, L, R, replacement(c, L, R));
  memo.key = key; memo.v = { c, P, P0, R, repl, ranks: rankTables(P, S.feed), cache: {}, L };
  return memo.v;
}

export async function loadFeed(week = null) {
  try {
    S.feed = await api(`feed${week ? `?week=${week}` : ""}`, { auth: false }); S.feedAt = Date.now();
    if (S.week == null || week == null) S.activeWeek = S.feed.week;
    S.week = S.feed.week; delete S.errors.feed;
  } catch (e) { S.errors.feed = e.message; }
  invalidate(); render();
}
// Re-check the feed without touching the screen unless something visible changed.
export async function refreshFeedQuiet() {
  try {
    const f = await api(`feed${S.week ? `?week=${S.week}` : ""}`, { auth: false }); S.feedAt = Date.now();
    if (feedSignature(f) === feedSignature(S.feed)) { S.feed.fetchedAt = f.fetchedAt; return false; }
    S.feed = f; S.week = f.week; delete S.errors.feed; invalidate(); render(); return true;
  } catch { return false; }     // keep what is on screen; errors only surface on a manual refresh
}

export async function loadData() {
  S.loading = true;
  const jobs = {
    players: api("players", { auth: false }), usage: api("usage", { auth: false }), outlook: api("outlook", { auth: false }),
    acc: api("accuracy", { auth: false }), trending: sleeperApi("players/nfl/trending/add", { lookback_hours: "24", limit: "200" }),
  };
  const feedJob = loadFeed(S.week);
  await Promise.all([feedJob, ...Object.entries(jobs).map(async ([k, p]) => {
    try {
      const v = await p;
      if (k === "trending") S.trending = Object.fromEntries((v || []).map((x) => [x.player_id, x.count]));
      else S[k] = v;
      delete S.errors[k];
    } catch (e) { S.errors[k] = e.message; }
    invalidate(); if (S.players) render();
  })]);
  S.loading = false; render();
}

// Save the profile (debounced by api.js) and redraw.
export function commit(msg) {
  invalidate(); S.saveState = "saving";
  saveProfile(S.user, S.profile, (err) => { S.saveState = err ? "error" : "saved"; if (err) toast(`Not saved: ${err.message}`); const d = document.getElementById("savedot"); if (d) d.textContent = S.saveState === "saving" ? "Saving…" : S.saveState === "error" ? "Not saved" : "Saved"; });
  render(); if (msg) toast(msg);
}
