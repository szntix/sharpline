import { S, computed, render, loadTeams } from "../state.js";
import { points, positionsFor } from "../scoring.js";
import { defenseStats, kickerStats, teamContext } from "../model.js";
import { esc, f1 } from "../ui.js";
import { prow, sec } from "./shared.js";

// Streaming: this week's best defenses and kickers still on waivers, using the same projection as your lineup. Both positions are mostly week-to-week luck, so the
// honest message is a small, real edge: for defenses it is the opponent's expected score (history: the best available beat an average defense by about 2.9 points
// a week, 2021 to 2025), for kickers it is the team's expected score and the weather (about a point).
const TIERS = [["pts_allow_0", 0, 0], ["pts_allow_1_6", 1, 6], ["pts_allow_7_13", 7, 13], ["pts_allow_14_20", 14, 20], ["pts_allow_21_27", 21, 27], ["pts_allow_28_34", 28, 34], ["pts_allow_35p", 35, 1e9]];
const MILD = { wind: 8.4, temp: 57.1 }, sg = (v) => (v >= 0 ? "+" : "\u2212") + Math.abs(v).toFixed(1), mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0);
const median = (a) => { const b = [...a].sort((x, y) => x - y), n = b.length; return n ? (n % 2 ? b[(n - 1) / 2] : (b[n / 2 - 1] + b[n / 2]) / 2) : 0; };

// How often a defense facing this expected opposing score has had a big game (10 or more points) or a dud (0 or fewer), from five seasons of real games
// re-scored with the league's own settings. Games within 3 points of the expected score count, nearer ones more.
export function dstChances(games, oppImp, s) {
  if (!games || oppImp == null) return null;
  const x = oppImp * 10, bw = 30; let w = 0, big = 0, dud = 0;
  for (const g of games) {
    const d = Math.abs(g[0] - x); if (d >= bw) continue; const k = 1 - d / bw, pa = g[9], tier = TIERS.find(([, lo, hi]) => pa >= lo && pa <= hi);
    const pts = (s.sack || 0) * g[2] + (s.int || 0) * g[3] + (s.fum_rec || 0) * g[4] + (s.def_td || 0) * g[5] + (s.safe || 0) * g[6] + (s.blk_kick || 0) * g[7] + (s.def_st_td || 0) * g[8] + (tier ? s[tier[0]] || 0 : 0);
    w += k; if (pts >= 10) big += k; if (pts <= 0) dud += k;
  }
  return w > 5 ? { big: big / w, dud: dud / w } : null;
}
let HIST = null, loading = false;
const loadHist = () => { if (HIST || loading) return; loading = true; import("../dsthistory.js").then((m) => { HIST = m.DST_GAMES; if (S.ui.moves === "stream") render(); }).catch(() => { loading = false; }); };

// What the weather and roof are worth to this kicker this week, in his league's points, against a typical mild outdoor game.
export function kickerConditions(pr, s) {
  const c = teamContext(pr.game, pr.team); if (!c || c.imp == null) return null;
  const indoor = !!pr.game?.venue?.indoor, wx = pr.game?.forecast || null, base = points(kickerStats(c.imp, { spread: c.spread, wx: MILD }), s, "K");
  const d = points(kickerStats(c.imp, { spread: c.spread, wx, dome: indoor }), s, "K") - base;
  if (indoor) return { text: `Dome ${sg(d)}`, tone: d >= 0.3 ? "up" : "", d };
  if (!wx) return { text: "Forecast not out", tone: "", d: 0 };
  const windy = wx.wind != null && wx.wind >= 15, cold = wx.temp != null && wx.temp <= 35;
  if (windy && cold) return { text: `Wind and cold ${sg(d)}`, tone: "dn", d };
  if (windy) return { text: `Wind ${Math.round(wx.wind)} mph ${sg(d)}`, tone: "dn", d };
  if (cold) return { text: `Cold ${Math.round(wx.temp)}\u00B0F ${sg(d)}`, tone: "dn", d };
  return { text: "Mild outdoors", tone: "", d };
}

// The next three weeks' opponents, colored by how good the matchup looks. Lines are only posted a week ahead, so these are rough: each opponent's scoring this
// season against this defense's points allowed.
function ribbon(code, s, mid) {
  const T = S.teams?.teams, t = T?.[code]; if (!t) return "";
  const wk = S.feed?.week ?? 0, nxt = (t.ahead || []).filter((a) => a.week > wk).slice(0, 3), chips = nxt.map((a) => {
    const o = T[a.opp], tone = o && o.pf && t.pa ? (() => { const e = points(defenseStats(22, (o.pf + t.pa) / 2, 0), s, "DEF"); return e >= mid + 1 ? "g" : e <= mid - 1 ? "r" : ""; })() : "";
    return `<span class="st-rib ${tone}">${a.home ? "" : "@"}${esc(a.opp)}</span>`;
  });
  for (const b of t.bye || []) if (b > wk && b <= wk + 3) chips.push(`<span class="st-rib">bye</span>`);
  return chips.length ? `<div class="st-ribbon"><small>next</small>${chips.join("")}</div>` : "";
}

export function viewStreaming(L) {
  if (!S.teams && !S.errors.teams) loadTeams(); loadHist();
  const C = computed(L), { P } = C, s = L.scoring, pos = positionsFor(L.slots), mine = new Set([...L.roster, ...(L.taken || [])]);
  const taken = new Set(mine); for (const o of L.others) for (const id of o.roster) taken.add(id);
  const wk = S.feed.week, manual = !L.sleeper;
  const lede = `<p class="lede">Defenses and kickers swing from week to week more than any other position, so the edge here is small and real: the best defense on waivers is worth a few points, a kicker about one. ${manual ? "Mark players other teams already have so they drop off." : "Players rostered in your Sleeper league are left out."}</p>`;
  const all = (p) => Object.keys(S.players).filter((id) => S.players[id].p === p).map((id) => ({ id, pr: P.proj[id] })).filter(({ pr }) => pr && !pr.bye && !pr.noTeam && pr.mean != null && pr.src !== "none");
  const mineOf = (p) => { const id = L.roster.find((x) => S.players[x]?.p === p); return id ? { id, pr: P.proj[id] } : null; };
  const nick = (id) => esc((S.players[id]?.n || id).replace(/ D\/ST$| DST$/, ""));
  const chip = (t, cls = "") => `<span class="st-chip ${cls}">${esc(t)}</span>`;
  let html = lede;
  if (pos.includes("DEF")) {
    const defs = all("DEF"), avail = defs.filter(({ id }) => !taken.has(id)).sort((a, b) => b.pr.mean - a.pr.mean).slice(0, 5), mid = median(defs.map((d) => d.pr.mean)), mi = mineOf("DEF"), best = avail[0];
    const row = ({ id, pr }, i, isMine) => { const ch = dstChances(HIST, pr.oppImplied, s), gain = !isMine && i === 0 && mi && pr.mean - mi.pr.mean > 0.05 ? `+${(pr.mean - mi.pr.mean).toFixed(1)}` : "";
      return `<div class="st-item${isMine ? " st-mine" : ""}">${prow(id, C, { gain })}<div class="st-info">${ch ? chip(`${Math.round(ch.big * 100)}% for 10+`, "up") + chip(`${Math.round(ch.dud * 100)}% dud`, ch.dud >= 0.15 ? "dn" : "") : ""}${pr.oppImplied != null ? chip(`opp. expected ${f1(pr.oppImplied)}`) : ""}</div>${ribbon(pr.team, s, mid)}</div>`; };
    let head = "";
    if (best) { const g = best.pr.mean - (mi ? mi.pr.mean : mean(defs.map((d) => d.pr.mean))), who = mi ? `your ${nick(mi.id)}` : "the average defense", stream = g > 0.3;
      const gap = Math.abs(g) <= 0.3 ? `within a third of a point of ${who}` : `${Math.abs(g).toFixed(1)} points ${g > 0 ? "above" : "below"} ${who}`;
      head = `<div class="panel st-sum"><div class="st-big${stream ? " up" : ""}${stream ? "" : " hold"}" data-gain="${g.toFixed(2)}">${stream ? "+" + g.toFixed(1) : "Hold"}</div><p>${stream ? `<b>${nick(best.id)}</b> is projected ${gap} this week.` : `<b>You already hold one of the best matchups.</b> The best defense on waivers is ${gap}.`} Over 2021 to 2025, the best available defense typically beat an average one by about 2.9 points a week.</p></div>`; }
    html += sec("Defenses", `${head}${mi ? `<div class="list" style="margin-bottom:12px">${row(mi, 0, true)}</div>` : ""}${avail.length ? `<div class="list">${avail.map((r, i) => row(r, i, false)).join("")}</div>` : `<p class="muted">No defense is available to add.</p>`}<p class="st-cap">A dud is 0 points or less. The chances come from five seasons of games with the same opponent expected score, re-scored with your league's settings. The dashed next-week chips are rough: lines are only posted a week ahead.</p>`, `Week ${wk}`);
  }
  if (pos.includes("K")) {
    const ks = all("K"), avail = ks.filter(({ id }) => !taken.has(id)).sort((a, b) => b.pr.mean - a.pr.mean).slice(0, 5), mi = mineOf("K");
    const row = ({ id, pr }, isMine) => { const c = kickerConditions(pr, s);
      return `<div class="st-item${isMine ? " st-mine" : ""}">${prow(id, C, {})}<div class="st-info">${c ? chip(c.text, c.tone) : ""}${pr.implied != null ? chip(`team expected ${f1(pr.implied)}`) : ""}</div></div>`; };
    html += sec("Kickers", `<div class="panel st-sum"><div class="st-big" data-gain="1">~1</div><p>Streaming a kicker is worth about a point a week, so it is not worth waiver priority. What moves a kicker is how many points his team is expected to score, whether it is favored, and the weather.</p></div>${mi ? `<div class="list" style="margin-bottom:12px">${row(mi, true)}</div>` : ""}${avail.length ? `<div class="list">${avail.map((r) => row(r, false)).join("")}</div>` : `<p class="muted">No kicker is available to add.</p>`}<p class="st-cap">Weather and roof chips show what the forecast is worth to that kicker, in your league's points, against a typical mild outdoor game.</p>`, `Week ${wk}`);
  }
  if (!pos.includes("DEF") && !pos.includes("K")) html += `<div class="panel empty"><p class="muted">Your league doesn't start a defense or a kicker, so there is nothing to stream.</p></div>`;
  return html;
}
