import { S, computed, render, loadTeams } from "../state.js";
import { points, positionsFor } from "../scoring.js";
import { defenseStats, kickerStats, teamContext } from "../model.js";
import { esc, f1 } from "../ui.js";
import { prow, sec } from "./shared.js";
import { kickerConditions } from "../conditions.js";
import { defenseWeeks, kickerWeeks } from "./teams.js";
import { planBoard, pickPlans, WEIGHTS } from "../plan.js";

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

// This week and the next three, from the same builder as the defense page and the team page, so they can never disagree. This week uses the betting line (solid
// border); later weeks are rough (dashed). The tint is the matchup's rank among all defenses that week.
function ribbon(code) {
  const wk = S.feed?.week ?? 0, items = defenseWeeks(code, { from: wk, to: wk + 3 });
  const chips = items.map((x) => x.bye ? `<span class="st-rib">W${x.week} bye</span>` : `<span class="st-rib${x.kind === "now" ? " now" : ""}${x.rank && x.rank <= 10 ? " g" : x.rank && x.rank >= 23 ? " r" : ""}">W${x.week} ${x.home ? "vs" : "@"} ${esc(x.opp)}</span>`);
  return chips.length ? `<div class="st-ribbon"><small>weeks</small>${chips.join("")}</div>` : "";
}

// Who this defense plays this week, spelled out: home or away, the kickoff, and what the line says that offense will score.
const kickTxt = (ms) => new Date(ms).toLocaleString("en-US", { weekday: "short", hour: "numeric", minute: "2-digit" }).replace(",", "");
export function oppLine(pr) {
  if (!pr?.opp) return "";
  const g = pr.game, kick = g?.kickoff && Number.isFinite(Date.parse(g.kickoff)) ? kickTxt(Date.parse(g.kickoff)) : "";
  return `<div class="st-opp" data-opp="${esc(pr.opp)}"><b>${g && g.home === pr.team ? "vs" : "at"} ${esc(pr.opp)}</b>${kick ? ` \u00B7 ${esc(kick)}` : ""}${pr.oppImplied != null ? ` \u00B7 expected to score ${f1(pr.oppImplied)}` : ""}</div>`;
}

// The three weeks a candidate is judged on: this week, then the next two. A week is { e } (expected points), { bye: true }, or null past the end of the schedule.
const weeksOf = (kind, id, team, wk, pr) => {
  // This week always comes straight from the lineup's own projection, so it never depends on the team table being loaded. A game that has started or finished cannot
  // be used this week (zero), and the later weeks come from the schedule.
  const ahead = kind === "DEF" ? defenseWeeks(team, { from: wk + 1, to: wk + 2 }) : kickerWeeks(id, { from: wk + 1, to: wk + 2 });
  const w0 = pr.bye ? { bye: true } : ["in", "post"].includes(pr.game?.status?.state) ? { e: 0, locked: true } : pr.mean == null ? null : { e: pr.mean };
  return [w0, ...[1, 2].map((j) => { const x = ahead.find((it) => it.week === wk + j); return x ? (x.bye ? { bye: true } : { e: x.exp }) : null; })];
};
const sgn1 = (v) => (v >= 0 ? "+" : "\u2212") + Math.abs(v).toFixed(1);
// "W5 +4.7, W6 +1.9, W7 bye": what each week adds over a normal streaming pickup, for as long as the plan holds him, and the bye if it ends the run.
const windowTxt = (row, wk, upTo = row.k) => { const out = []; for (let j = 0; j < Math.min(3, Math.max(upTo, row.byeAt >= 0 ? row.byeAt + 1 : 0)); j++) { const w = row.weeks[j]; if (w == null) break; out.push(w.bye ? `W${wk + j} bye` : w.locked ? `W${wk + j} already started` : `W${wk + j} ${sgn1(row.excess[j])}`); } return out.join(", "); };
const KIND = { now: "Most points now", run: "Best two-week run", long: "Best three-week hold" };

export function viewStreaming(L) {
  if (!S.teams && !S.errors.teams) loadTeams(); loadHist();
  const C = computed(L), { P } = C, s = L.scoring, pos = positionsFor(L.slots), mine = new Set([...L.roster, ...(L.taken || [])]);
  const taken = new Set(mine); for (const o of L.others) for (const id of o.roster) taken.add(id);
  const wk = S.feed.week, manual = !L.sleeper;
  const lede = `<p class="lede">Defenses and kickers swing from week to week more than any other position, so the edge here is small and real. Each suggestion is judged by what it adds over a normal streaming pickup this week and the next two, with this week counting most. A bye scores nothing, and two good weeks in a row beat three decent ones. ${manual ? "Mark players other teams already have so they drop off." : "Players rostered in your Sleeper league are left out."}</p>`;
  const all = (p) => Object.keys(S.players).filter((id) => S.players[id].p === p).map((id) => ({ id, pr: P.proj[id] })).filter(({ pr }) => pr && !pr.bye && !pr.noTeam && pr.mean != null && pr.src !== "none");
  const mineOf = (p) => { const id = L.roster.find((x) => S.players[x]?.p === p); return id ? { id, pr: P.proj[id] } : null; };
  const nick = (id) => esc((S.players[id]?.n || id).replace(/ D\/ST$| DST$/, ""));
  const chip = (t, cls = "") => `<span class="st-chip ${cls}">${esc(t)}</span>`;
  const board = (kind, pool, mi) => { const cands = pool.map(({ id, pr }) => ({ id, weeks: weeksOf(kind, id, pr.team, wk, pr) })), held = mi ? { id: mi.id, weeks: weeksOf(kind, mi.id, mi.pr.team, wk, mi.pr) } : null; const b = planBoard(cands, WEIGHTS[kind], { held }); return { ...b, plans: pickPlans(b) }; };
  // tags that say what kind of move a row is
  const tags = (r) => (r.weeks[0]?.locked ? chip("Game already started", "dn") : "") + (r.k >= 2 ? chip(`Hold ${r.k} weeks`, "up") : "") + (r.byeAt >= 0 ? chip(`Bye in W${wk + r.byeAt}`, "dn") : "");
  const planCard = (b, mi, kind) => {
    const { plans } = b, rec = plans.rec, r = rec.row, name = nick(r.id), noun = kind === "DEF" ? "defense" : "kicker", mineE = mi ? mi.pr.mean : null;
    const gain = plans.top.e0 - (mineE ?? mean(pool_(kind).map((d) => d.pr.mean))), stream = rec.kind === "add", over = mi ? `your ${nick(mi.id)}` : `the average ${noun}`;
    const verb = stream ? `Add <b>${name}</b>${r.k > 1 ? ` and keep ${kind === "DEF" ? "them" : "him"} ${r.k} weeks` : " for this week"}` : `<b>Keep your ${name}</b>${r.k > 1 ? ` for ${r.k} weeks` : " this week"}`;
    const now = stream ? `This week alone that is ${sgn1(gain)} over ${over}.` : `The best ${noun} on waivers is ${Math.abs(gain) <= 0.3 ? `within a third of a point of ${over}` : `${Math.abs(gain).toFixed(1)} points ${gain > 0 ? "above" : "below"} ${over}`} this week.`;
    return `<div class="panel st-sum st-plan"><div class="st-big${stream && gain > 0.3 ? " up" : ""}${stream ? "" : " hold"}" data-gain="${gain.toFixed(2)}">${stream ? sgn1(Math.max(gain, 0)).replace("\u2212", "") : "Hold"}</div><div><p class="st-kind">Recommended</p><p>${verb}.</p><p class="st-sub">Over a normal ${noun} pickup: <span class="st-win">${esc(windowTxt(r, wk))}</span>. ${now}</p></div></div>`;
  };
  const altCards = (b, kind) => { const a = b.plans.alts; return a.length ? `<h3 class="st-h3">Other ways to play it</h3><div class="st-alts">${a.map(({ kind: k, row: r }) => `<a class="st-alt" href="#player/${esc(r.id)}" data-go="player/${esc(r.id)}"><b>${KIND[k]}</b><span>${nick(r.id)}${r.k > 1 && k !== "now" ? ` \u00B7 hold ${r.k} weeks` : ""} \u00B7 ${esc(windowTxt(r, wk, Math.max(r.k, k === "now" ? 1 : 0)))}${k === "now" && r.byeAt >= 0 ? ` \u00B7 bye in W${wk + r.byeAt}` : ""}</span></a>`).join("")}</div>` : ""; };
  let pool_ = (kind) => all(kind); let html = lede;
  if (pos.includes("DEF")) {
    const defs = all("DEF"), avail = defs.filter(({ id }) => !taken.has(id)), mi = mineOf("DEF"), b = avail.length ? board("DEF", avail, mi) : null, rows = b ? b.rows.slice(0, 5) : [];
    const prOf = (id) => P.proj[id];
    const row = (r, isMine) => { const pr = prOf(r.id), ch = dstChances(HIST, pr.oppImplied, s), gain = !isMine && b && r.id === b.plans.rec.row.id && b.plans.rec.kind === "add" && mi && r.e0 - mi.pr.mean > 0.05 ? `+${(r.e0 - mi.pr.mean).toFixed(1)}` : "";
      return `<div class="st-item${isMine ? " st-mine" : ""}">${prow(r.id, C, { gain })}${oppLine(pr)}<div class="st-info">${ch ? chip(`${Math.round(ch.big * 100)}% for 10+`, "up") + chip(`${Math.round(ch.dud * 100)}% dud`, ch.dud >= 0.15 ? "dn" : "") : ""}${tags(r)}</div>${ribbon(pr.team)}</div>`; };
    const mineRow = mi && b ? { ...b.heldRow } : null;
    html += sec("Defenses", `${b ? planCard(b, mi, "DEF") : ""}${mineRow ? `<div class="list" style="margin-bottom:12px">${row(mineRow, true)}</div>` : ""}${b ? altCards(b, "DEF") : ""}${rows.length ? `<h3 class="st-h3">Best available, by the plan</h3><div class="list">${rows.map((r) => row(r, false)).join("")}</div>` : `<p class="muted">No defense is available to add.</p>`}<p class="st-cap">Ranked by what each adds over a normal pickup across this week and the next two (this week counts most; a bye counts as nothing). This week comes from the betting line; later weeks are rough because lines are only posted a week ahead, which is why they count for less. A dud is 0 points or less. Over 2021 to 2025 this ranking beat always taking the top score this week by about 0.09 points a week, giving up about 0.01 points this week to do it.</p>`, `Week ${wk}`);
  }
  if (pos.includes("K")) {
    const ks = all("K"), avail = ks.filter(({ id }) => !taken.has(id)), mi = mineOf("K"), b = avail.length ? board("K", avail, mi) : null, rows = b ? b.rows.slice(0, 5) : [];
    const row = (r, isMine) => { const pr = P.proj[r.id], c = kickerConditions(pr, s);
      return `<div class="st-item${isMine ? " st-mine" : ""}">${prow(r.id, C, {})}<div class="st-info">${c ? chip(c.text, c.tone) : ""}${pr.implied != null ? chip(`team expected ${f1(pr.implied)}`) : ""}${tags(r)}</div></div>`; };
    const rec = b?.plans.rec, kcard = b ? `<div class="panel st-sum"><div class="st-big" data-gain="1">~1</div><div><p class="st-kind">Recommended</p><p>${rec.kind === "add" ? `Add <b>${nick(rec.row.id)}</b>${rec.row.k > 1 ? ` and keep him ${rec.row.k} weeks` : " for this week"}` : `<b>Keep your ${nick(rec.row.id)}</b>`}. <span class="st-win">${esc(windowTxt(rec.row, wk))}</span> over a normal kicker pickup. Streaming a kicker is worth about a point a week, so it is not worth waiver priority: what moves a kicker is how many points his team is expected to score, whether it is favored, and the weather.</p></div></div>` : "";
    html += sec("Kickers", `${kcard}${mi && b ? `<div class="list" style="margin-bottom:12px">${row({ ...b.heldRow }, true)}</div>` : ""}${rows.length ? `<div class="list">${rows.map((r) => row(r, false)).join("")}</div>` : `<p class="muted">No kicker is available to add.</p>`}<p class="st-cap">Ranked the same way, with lighter weight on later weeks because a kicker's future is even harder to see. Weather and roof chips show what the forecast is worth to that kicker, in your league's points, against a typical mild outdoor game.</p>`, `Week ${wk}`);
  }
  if (!pos.includes("DEF") && !pos.includes("K")) html += `<div class="panel empty"><p class="muted">Your league doesn't start a defense or a kicker, so there is nothing to stream.</p></div>`;
  return html;
}
