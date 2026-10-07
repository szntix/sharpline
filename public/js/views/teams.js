// Teams: the power rankings (a second view inside Slate) and one page per team. Ratings describe how a team has played, opponent-adjusted and blended with
// what the betting lines say. They are not a forecast: in a 3,408-game test the closing line beat every rating we could build, so win odds come from the line.
import { S, loadTeams, loadDefStats, league, leagueOrDefault, computed } from "../state.js";
import { points } from "../scoring.js";
import { defenseStats, kickerStats, teamContext } from "../model.js";
import { lookAhead } from "../lookahead.js";
import { kickerConditions } from "../conditions.js";
import { esc, plate, teamStripe, sgn, emblem } from "../ui.js";
import { sec, fold, loading } from "./shared.js";

const erf = (x) => { const s = Math.sign(x), a = Math.abs(x), t = 1 / (1 + 0.3275911 * a), poly = ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t; return s * (1 - poly * Math.exp(-a * a)); };
export const winOdds = (line) => 0.5 * (1 + erf(line / 13.4 / Math.SQRT2));        // a betting line (points) to a win chance; the spread of NFL margins around the line is about 13.4
export const rankTone = (r) => { const p = ((33 - r) / 31) * 100; return p >= 85 ? "g2" : p >= 65 ? "g1" : p >= 35 ? "n" : p >= 15 ? "b1" : "b2"; };
const FLIP = { g2: "b2", g1: "b1", n: "n", b1: "g1", b2: "g2" };
export const softTone = (defenseRank) => FLIP[rankTone(defenseRank)];                  // a soft defense is good news for the offense facing it
const lastName = (n = "") => { const p = n.split(" "); return /^(Jr\.?|Sr\.?|II|III|IV)$/.test(p[p.length - 1]) && p.length > 1 ? p[p.length - 2] : p[p.length - 1]; };
const COLORS = ["#D7A22A", "#2F9BB5", "#7CC795", "#B58CF0"];
const pct = (v) => `${Math.round(v * 100)}%`;

// ---------- small visuals, shared with the player page ----------
export function spark(vals, { w = 120, h = 36, color = "var(--ink)" } = {}) {
  if (!vals?.length) return "";
  const lo = Math.min(...vals), hi = Math.max(...vals), rng = hi - lo || 1, pts = vals.map((v, i) => [8 + (i * (w - 16)) / Math.max(1, vals.length - 1), h - 6 - ((v - lo) / rng) * (h - 12)]);
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="Trend: ${vals.map((v) => v).join(", ")}"><polyline points="${pts.map((p) => p.map((x) => x.toFixed(1)).join(",")).join(" ")}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>${pts.map((p) => `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="3.5" fill="${color}"/>`).join("")}</svg>`;
}
export function stack(items, { link = true, mark = null, tag = null } = {}) {
  if (!items?.length) return `<p class="muted small">Nothing yet.</p>`;
  const col = (it, i) => it.color || (it.extra ? "#9AA0A6" : COLORS[i % 4]), me = (it) => !!mark && it.id === mark;
  const segs = items.map((it, i) => `<div${me(it) ? ' class="me"' : ""} style="width:${(it.share * 100).toFixed(1)}%;background:${col(it, i)};min-width:2px"></div>`).join("");
  const names = items.map((it, i) => { const nm = `${esc(lastName(it.name))} <b>${pct(it.share)}</b>`; return `<span class="tm-key${me(it) ? " me" : ""}"><i style="background:${col(it, i)}"></i>${link && it.id && !me(it) ? `<a href="#player/${esc(it.id)}">${nm}</a>` : nm}${tag ? tag(it) : ""}</span>`; }).join("");
  return `<div class="tm-stack" role="img" aria-label="${esc(items.map((it) => `${it.name} ${pct(it.share)}`).join(", "))}">${segs}<div class="rest"></div></div><div>${names}</div>`;
}
const rankBar = (label, o, fmt) => !o ? `<div class="tm-rk"><span>${label}</span><div class="tm-tr"></div><span class="muted small" style="text-align:right">not enough plays</span></div>`
  : `<div class="tm-rk tone-${rankTone(o.rank)}"><span>${label}</span><div class="tm-tr"><i style="width:${(((33 - o.rank) / 32) * 100).toFixed(0)}%"></i></div><span style="text-align:right"><b class="tm-v">${fmt(o.v)}</b> <span class="muted small">#${o.rank}</span></span></div>`;

// ---------- the rankings ----------
// ---- a team's remaining schedule, as chips, for three audiences: offensive players (the team page), defenses, and kickers ----
const roofText = (r) => (r === "dome" || r === "closed" ? "Roof" : r === "open" || r === "outdoors" ? "Open air" : "\u2013");
// How each remaining game rates for this DEFENSE, ranked 1 (best) to 32 among every defense playing that week. This week uses the betting line, the same number as
// its lineup projection; later weeks have no line, so they are rough: the opponent's scoring and this defense's points allowed, season to date.
export function defenseWeeks(code, { from, to = 18 } = {}) {
  const D = S.teams?.teams ? S.teams : null, t = D?.teams?.[code]; if (!t || !Number.isFinite(from)) return [];
  const s = (league() || leagueOrDefault()).scoring, wkNow = S.feed?.week ?? -1, proj = computed().P.proj, memo = {};
  const rough = (c, a) => { const me = D.teams[c], o = D.teams[a.opp]; return me && o && o.pf && me.pa ? points(defenseStats(22, (o.pf + me.pa) / 2, 0), s, "DEF") : null; };
  const roughAll = (w) => memo[w] ||= D.order.map((c) => { const a = D.teams[c].ahead.find((x) => x.week === w); return a ? rough(c, a) : null; }).filter((v) => v != null);
  const nowAll = () => memo.now ||= Object.keys(S.players || {}).filter((id) => S.players[id].p === "DEF" && proj[id] && !proj[id].bye && proj[id].mean != null).map((id) => proj[id].mean);
  return lookAhead(code, from - 1, D.teams, to - from + 1).map((x) => {
    if (x.bye) return x;
    const a = t.ahead.find((g) => g.week === x.week), line = x.week === wkNow && proj[code] && !proj[code].bye && proj[code].mean != null;
    const exp = line ? proj[code].mean : rough(code, a), all = line ? nowAll() : roughAll(x.week), rank = exp == null || !all.length ? null : 1 + all.filter((v) => v > exp + 1e-9).length;
    return { ...x, home: !!(a.neutral || a.home), exp, rank, kind: line ? "now" : "rough" };
  });
}
// A kicker's next weeks: this week is his projection (line, weather, injury status); later weeks are rough, from his team's scoring and the opponent's points
// allowed, with a roof counted as a roof. A bye is a bye.
export function kickerWeeks(id, { from, to = from + 2 } = {}) {
  const D = S.teams?.teams ? S.teams : null, code = S.players?.[id]?.t, t = D?.teams?.[code]; if (!t || !Number.isFinite(from)) return [];
  const s = (league() || leagueOrDefault()).scoring, wkNow = S.feed?.week ?? -1, pr = computed().P.proj[id];
  return lookAhead(code, from - 1, D.teams, to - from + 1).map((x) => {
    if (x.bye) return x;
    const a = t.ahead.find((g) => g.week === x.week), home = !!(a.neutral || a.home);
    if (x.week === wkNow && pr && !pr.bye && pr.mean != null) return { ...x, home, exp: pr.mean, kind: "now" };
    const o = D.teams[x.opp], imp = o && o.pa && t.pf ? (t.pf + o.pa) / 2 : null;
    return { ...x, home, exp: imp == null ? null : points(kickerStats(imp, { spread: 0, dome: a.roof === "dome" || a.roof === "closed" }), s, "K"), kind: "rough" };
  });
}
export function scheduleSection(code, mode = "offense") {
  const D = S.teams?.teams ? S.teams : null, t = D?.teams?.[code]; if (!t) return "";
  const L = league(), ps = L?.playoffStart ?? 15, we = L?.endWeek ?? 17, nx = t.ahead[0], first = nx ? nx.week : 18, chips = [];
  const dw = mode === "defense" ? new Map(defenseWeeks(code, { from: first }).map((x) => [x.week, x])) : null;
  for (let w = first; w <= 18; w++) {
    const a = t.ahead.find((x) => x.week === w), po = w >= ps && w <= we, cls = `${po ? " po" : ""}${w > we ? " dim" : ""}`;
    if (!a) { if (t.bye.includes(w)) chips.push(`<div class="tm-chip bye${cls}">WK ${w}<small>bye</small></div>`); continue; }
    const vs = a.neutral || a.home ? "vs" : "@";
    if (mode === "defense") { const m = dw.get(w); chips.push(`<div class="tm-chip tone-${m?.rank ? rankTone(m.rank) : "n"}${cls}" data-wk="${w}">WK ${w}<br>${vs} ${a.opp}<small>${m?.rank ? `M #${m.rank}` : "M \u2013"}</small></div>`); }
    else if (mode === "kicker") chips.push(`<div class="tm-chip tone-${a.roof === "dome" || a.roof === "closed" ? "g1" : "n"}${cls}" data-wk="${w}">WK ${w}<br>${vs} ${a.opp}<small>${roofText(a.roof)}</small></div>`);
    else { const dr = D.teams[a.opp]?.eff.defRank; chips.push(`<div class="tm-chip tone-${dr ? softTone(dr) : "n"}${cls}">WK ${w}<br>${vs} ${a.opp}<small>${dr ? `D #${dr}` : "D \u2013"}</small></div>`); }
  }
  const tail = `${we < 18 ? " Week 18 is dimmed: most leagues are over by then, and teams that have clinched often rest starters." : ""}`, po = `<span class="tm-po">outlined</span> your league's playoff weeks (${ps} to ${we}).`;
  const cap = mode === "defense" ? `<span class="tm-sw tone-g2"></span>good matchup <span class="tm-sw tone-b2"></span>tough matchup ${po} M # ranks the matchup for a defense among all defenses playing that week (1 is best). This week's rank comes from the betting line; later weeks are rough, from the opponent's scoring and this defense's points allowed.${tail}`
    : mode === "kicker" ? `<span class="tm-sw tone-g1"></span>roof or dome ${po} A roof is worth about a point a week to a kicker; wind and cold appear in the forecast near game day. The roof is the home team's stadium.${tail}`
    : `<span class="tm-sw tone-g2"></span>soft defense <span class="tm-sw tone-b2"></span>tough defense ${po} D # is the opponent's defense rank, all plays, this season so far.${tail}`;
  return sec("Schedule ahead", chips.length ? `<div class="tm-chips">${chips.join("")}</div><p class="tm-cap">${cap}</p>` : `<p class="muted small">The regular season is over.</p>`, `weeks ${first} to 18`);
}
// Team-profile numbers that matter for a defense or a kicker, on their own page.
const tile = (label, val, rank) => `<div class="dp-tile tone-${rankTone(rank)}"><small>${label}</small><b>${val}</b><span>#${rank}</span></div>`;
export function defenseHow(code) {
  const D = S.teams?.teams ? S.teams : null, t = D?.teams?.[code]; if (!t || !t.games || !t.eff) return "";
  const pa = 1 + D.order.filter((c) => D.teams[c].games && D.teams[c].pa < t.pa - 1e-9).length, e = t.eff, epa = (v) => `${v < 0 ? "\u2212" : "+"}${Math.abs(v).toFixed(2)} a play`;
  return sec("How this defense has played", `<div class="panel"><div class="dp-tiles">${tile("Points allowed", `${t.pa.toFixed(1)} a game`, pa)}${tile("Overall, adjusted", `rank ${e.defRank}`, e.defRank)}${tile("Pass defense", epa(e.passDef.v), e.passDef.rank)}${tile("Run defense", epa(e.runDef.v), e.runDef.rank)}</div><p class="tm-cap">Ranks out of 32, 1 is best. Opponent-adjusted and counting all plays, this season so far. Fewer points allowed and a lower number a play are better for a defense.</p></div>`);
}

// ---------- the defense profile, enriched: its numbers, who scores against it, and a game log ----------
// Source: /api/defstats (nflverse weekly stats, defenders plus the yards the other offense gained). Loaded only when a defense or kicker page needs it.
// If either source is missing the page says so (and retries by itself) instead of quietly leaving sections out.
const DEF_TIER = [[0, "pts_allow_0"], [6, "pts_allow_1_6"], [13, "pts_allow_7_13"], [20, "pts_allow_14_20"], [27, "pts_allow_21_27"], [34, "pts_allow_28_34"], [Infinity, "pts_allow_35p"]];
const defScoring = () => league()?.scoring || leagueOrDefault().scoring;
// one defense's games, with points allowed and home or away taken from the team table when it has that week
export function defenseGameRows(code) {
  const D = S.def?.teams?.[code]; if (!D) return null;
  const F = S.def.fields, byWeek = new Map((S.teams?.teams?.[code]?.log || []).map((g) => [g.week, g]));
  return D.map((r) => { const o = { week: r[0], opp: r[1] }; F.forEach((k, i) => (o[k] = r[i + 2])); const g = byWeek.get(r[0]); o.pa = g ? g.pa : null; o.home = g ? g.home : null; return o; });
}
// fantasy points for one game under a league's scoring (needs points allowed to know the tier)
export function defenseGamePoints(g, sc) {
  if (g.pa == null) return null;
  const tier = DEF_TIER.find(([hi]) => g.pa <= hi)[1];
  return points({ sack: g.sk, int: g.int, fum_rec: g.fr, def_td: g.td, def_st_td: g.stt, safe: g.saf, blk_kick: g.blk, [tier]: 1 }, sc, "DEF", true);
}
function leagueDef() {
  if (S.def._avg) return S.def._avg;
  const F = S.def.fields, A = {};
  for (const [code, rows] of Object.entries(S.def.teams)) {
    if (!rows.length) continue; const tot = Object.fromEntries(F.map((k, i) => [k, rows.reduce((a, r) => a + r[i + 2], 0)])), n = rows.length;
    A[code] = { n, tot, ...Object.fromEntries(Object.entries(tot).map(([k, v]) => [k + "G", v / n])) };
  }
  return (S.def._avg = A);
}
const rankOf = (A, code, f, low = false) => 1 + Object.values(A).filter((x) => (low ? f(x) < f(A[code]) - 1e-9 : f(x) > f(A[code]) + 1e-9)).length;
function defenseFp(code, sc) {                       // average per game, last three, and the rank of each among all defenses
  const key = JSON.stringify(Object.fromEntries(Object.entries(sc).filter(([k]) => /^(sack|int|fum_rec|def_td|def_st_td|safe|blk_kick|pts_allow)/.test(k))));
  if (S.def._fp?.key !== key) {
    const m = {}; for (const c of Object.keys(S.def.teams)) { const v = (defenseGameRows(c) || []).map((g) => defenseGamePoints(g, sc)).filter((x) => x != null); if (v.length) m[c] = { avg: v.reduce((a, b) => a + b, 0) / v.length, l3: v.slice(-3).reduce((a, b) => a + b, 0) / Math.min(3, v.length), n: v.length }; }
    S.def._fp = { key, m };
  }
  const m = S.def._fp.m, me = m[code]; if (!me) return null;
  return { ...me, rAvg: 1 + Object.values(m).filter((x) => x.avg > me.avg + 1e-9).length, rL3: 1 + Object.values(m).filter((x) => x.l3 > me.l3 + 1e-9).length };
}
const fpTone = (v) => (v >= 12 ? "g2" : v >= 8 ? "g1" : v >= 4 ? "n" : v >= 1 ? "b1" : "b2");
export const gateErr = (what, k) => `<div class="panel empty dp-gate" role="alert"><b>Couldn't load ${what}</b><p class="m">${esc(S.errors[k] || "")}. ${(S[`_${k}Try`] || 0) < 3 ? "Trying again automatically." : "Tap to try again."}</p><button class="btn" data-act="${{ teams: "teams-retry", def: "def-retry", k: "k-retry" }[k]}">Try again</button></div>`;
// What to show while the data this page needs is missing: a loading line, or what went wrong with a button. Nothing when all is loaded.
export function defenseGate() {
  if (!S.def?.teams && !S.errors.def && !S._defBusy) loadDefStats();
  if (!S.teams?.teams && !S.errors.teams && !S._teamsBusy) loadTeams();
  const wait = [], bad = [];
  if (!S.teams?.teams) (S.errors.teams ? bad : wait).push("the team table and schedule");
  if (!S.def?.teams) (S.errors.def ? bad : wait).push("this defense's game-by-game stats");
  return (wait.length ? `<div class="panel dp-wait" role="status"><span class="spinner"></span> Loading ${wait.join(" and ")}\u2026</div>` : "") + (!S.teams?.teams && S.errors.teams ? gateErr("the team table and schedule", "teams") : "") + (!S.def?.teams && S.errors.def ? gateErr("this defense's game-by-game stats", "def") : "");
}
// For every other profile page: only speak up when the team data failed to load.
export const teamsErrorGate = () => (!S.teams?.teams && S.errors.teams ? gateErr("the team table and schedule", "teams") : "");

// D1: this week's matchup as three tug bars: our strength (left) against the opposing offense's weakness (right). Real ranks are printed on both sides.
// It describes the matchup; it does not predict it: in 2021-2025 tests, opponent sack and giveaway rates added nothing beyond the betting line.
const verdict = (o, w) => { const a = (o + w) / 2; return a <= 17 ? [a <= 12 ? "g2" : "g1", "Our edge"] : a <= 23 ? ["n", "Even"] : ["b1", "Their edge"]; };
export function defenseMatchup(code, pr) {
  const D = S.teams?.teams, A = S.def?.teams ? leagueDef() : null, t = D?.[code]; if (!t || !A?.[code]) return "";
  const g = pr?.game, c = g ? teamContext(g, code) : null, opp = c?.opp || null;
  if (!opp) return t.bye?.includes(S.feed?.week) ? sec("The matchup", `<div class="panel"><p class="m">Bye week. No opponent this week.</p></div>`, "this week") : "";
  const O = A[opp], T2 = D[opp]; if (!O || !T2 || !T2.games) return "";
  const me = A[code], live = Object.values(D).filter((v) => v.games), paRank = 1 + live.filter((v) => v.pa < t.pa - 1e-9).length, pfRank = 1 + live.filter((v) => v.pf > T2.pf + 1e-9).length;
  const rows = [{ n: "Pressure", l: "sacks a game", o: me.skG, or: rankOf(A, code, (x) => x.skG), rl: "sacks taken", t: O.sksG, tr: rankOf(A, opp, (x) => x.sksG), wr: rankOf(A, opp, (x) => x.sksG) },
    { n: "Takeaways", l: "takeaways a game", o: me.intG + me.frG, or: rankOf(A, code, (x) => x.intG + x.frG), rl: "giveaways", t: O.gvG, tr: rankOf(A, opp, (x) => x.gvG), wr: rankOf(A, opp, (x) => x.gvG) },
    { n: "Scoring", l: "points allowed", o: t.pa, or: paRank, rl: "points scored", t: T2.pf, tr: pfRank, wr: 33 - pfRank }];
  const bar = (r) => { const [tn, vt] = verdict(r.or, r.wr); return `<div class="pf-m"><div class="pf-mh"><span>${r.n}</span><span class="pf-v tone-${tn}">${vt}</span></div><div class="pf-bar" role="img" aria-label="${r.n}: ${code} ${r.o.toFixed(1)} ${r.l}, rank ${r.or}; ${esc(opp)} ${r.t.toFixed(1)} ${r.rl}, rank ${r.tr}. ${vt}."><span class="pf-half L tone-${rankTone(r.or)}"><i style="width:${((33 - r.or) / 32) * 100}%"></i></span><span class="pf-mid"></span><span class="pf-half R tone-${rankTone(r.wr)}"><i style="width:${((33 - r.wr) / 32) * 100}%"></i></span></div><div class="pf-sides"><span><b>${esc(code)}</b> ${r.o.toFixed(1)} ${r.l} \u00B7 #${r.or}</span><span>${r.t.toFixed(1)} ${r.rl} \u00B7 #${r.tr} <b>${esc(opp)}</b></span></div></div>`; };
  const ours = rows.filter((r) => verdict(r.or, r.wr)[1] === "Our edge").length;
  const line = c.oppImp != null ? `${esc(opp)} expected to score ${c.oppImp.toFixed(1)}${c.spread == null ? "" : ` (${esc(code)} ${c.spread > 0 ? "favored" : "underdog"} by ${Math.abs(c.spread)})`}` : `vs ${esc(opp)}`;
  return sec("The matchup", `<div class="panel"><div class="pf-sum"><div><b>On paper: ${ours ? `our edge in ${ours} of 3` : "no clear edge"}</b><br><span>${line}</span></div></div>${rows.map(bar).join("")}<p class="pf-cap">Each bar is a contest: <b>our strength</b> on the left against <b>their weakness</b> on the right, longer is better for the defense. Ranks are of 32. For us 1 is best (most sacks and takeaways, fewest points allowed). For them 1 is the most sacks taken, giveaways or points scored; a strong offense makes a short bar.</p><p class="pf-cap"><b>This describes the matchup; it does not predict it.</b> In 2021\u20132025 tests, opponent sack and giveaway rates added nothing beyond the betting line, so the expected score already counts them.</p></div>`, "this week");
}

// D2: where this defense stands. Eight categories on one rank track, strongest first; tap a row for its game-by-game numbers.
export function defenseStands(code) {
  const A = S.def?.teams ? leagueDef() : null, a = A?.[code], D = S.teams?.teams, t = D?.[code]; if (!a || !t) return "";
  const live = Object.values(D).filter((v) => v.games), fp = defenseFp(code, defScoring()), games = defenseGameRows(code) || [], rk = (f, low) => rankOf(A, code, f, low), val = (n) => (n >= 100 ? String(Math.round(n)) : n.toFixed(1));
  const cats = [{ k: "Sacks", v: a.skG, r: rk((x) => x.skG), f: (g) => g.sk }, { k: "QB hits", v: a.hitG, r: rk((x) => x.hitG), f: (g) => g.hit }, { k: "Takeaways", v: a.intG + a.frG, r: rk((x) => x.intG + x.frG), f: (g) => g.int + g.fr },
    { k: "Tackles for loss", v: a.tflG, r: rk((x) => x.tflG), f: (g) => g.tfl }, { k: "Passes defended", v: a.pdG, r: rk((x) => x.pdG), f: (g) => g.pd }, { k: "Pass yards allowed", v: a.pyG, r: rk((x) => x.pyG, true), f: (g) => g.py },
    { k: "Rush yards allowed", v: a.ryG, r: rk((x) => x.ryG, true), f: (g) => g.ry }, { k: "Points allowed", v: t.pa, r: 1 + live.filter((v) => v.pa < t.pa - 1e-9).length, f: (g) => g.pa }].sort((x, y) => x.r - y.r);
  const open = S.ui.defStand ?? null, one = (v) => (v == null ? "\u2013" : Number.isInteger(v) ? v : v.toFixed(1));
  const row = (c) => `<button type="button" class="pf-lrow tone-${rankTone(c.r)}" data-act="def-stand" data-v="${esc(c.k)}" aria-expanded="${open === c.k}"><span class="nm">${c.k}<small>${val(c.v)} a game</small></span><span class="pf-track"><i class="pf-dot" style="left:${((c.r - 1) / 31) * 100}%"></i></span><span class="rk">#${c.r}</span></button>${open === c.k ? `<div class="pf-exp" role="region" aria-label="${c.k} by game">${games.map((g) => `<span>W${g.week} <b>${one(c.f(g))}</b></span>`).join("")}</div>` : ""}`;
  const tile = (label, v, rank) => `<div class="dp-tile tone-${rankTone(rank)}"><small>${label}</small><b>${v}</b><span>#${rank}</span></div>`;
  const tiles = fp ? `<div class="dp-tiles" style="margin-bottom:12px">${tile("Fantasy points", `${fp.avg.toFixed(1)} a game`, fp.rAvg)}${tile("Fantasy, last 3", `${fp.l3.toFixed(1)} a game`, fp.rL3)}</div>` : "";
  const note = S.def.fallback ? `<p class="tm-cap">Last season's final numbers, until this season's games are played.</p>` : "";
  return sec("Where this defense stands", `<div class="panel">${tiles}<div class="pf-axis"><span>best</span><span>worst</span></div>${cats.map(row).join("")}<p class="tm-cap">Per game over ${a.n} game${a.n === 1 ? "" : "s"}, from nflverse, ranked of 32. All eight on one track, strongest first, so you see what this defense is built on and where it leaks. Tap a row for the game-by-game numbers. Fantasy points use your league's scoring; ${Math.round(a.tot.td + a.tot.stt)} defensive or special-teams touchdown${Math.round(a.tot.td + a.tot.stt) === 1 ? "" : "s"} so far.</p>${note}</div>`, "rank of 32");
}

export function defenseVsPositions(code) {
  const dv = S.usage?.dvp; if (!dv?.[code]) return "";
  const POSN = ["QB", "RB", "WR", "TE"], r = {}, tiles = POSN.map((pos) => {
    const v = dv[code][pos]; if (v == null) return "";
    const vals = Object.values(dv).map((d) => d[pos]).filter((x) => x != null); r[pos] = 1 + vals.filter((x) => x < v - 1e-9).length;
    return tile(`${pos}s`, `${v >= 0 ? "+" : "\u2212"}${Math.abs(Math.round(v * 100))}%`, r[pos]);
  }).join("");
  const have = POSN.filter((p) => r[p] != null); if (!have.length) return "";
  const best = have.reduce((a, b) => (r[b] < r[a] ? b : a)), worst = have.reduce((a, b) => (r[b] > r[a] ? b : a));
  const line = r[worst] - r[best] >= 10 ? `<p class="tm-cap"><b>Toughest against ${best}s (#${r[best]}), softest against ${worst}s (#${r[worst]}).</b></p>` : "";
  return sec("Who scores on them", `<div class="panel"><div class="dp-tiles">${tiles}</div>${line}<p class="tm-cap">Fantasy points they have allowed to each position, against the league average, with recent games counting most. Rank 1 is the toughest defense for that position.</p></div>`, "vs league average");
}

// D3: recent games. The last five games as bars (five fit at 44px or more even on a 320px screen) (green = above the league average) linked to the log below: tap a bar or a row to select that game.
export function defenseRecent(code) {
  const g0 = S.def?.teams ? defenseGameRows(code) : null; if (!g0 || !g0.length) return "";
  const sc = defScoring(), all = g0.map((x) => ({ ...x, fp: defenseGamePoints(x, sc) })), fpAll = defenseFp(code, sc), shown = all.slice(-5), older = all.slice(0, -5).reverse();
  const mv = S.def._fp?.m ? Object.values(S.def._fp.m) : [], lgAvg = mv.length ? mv.reduce((a, b) => a + b.avg, 0) / mv.length : 5, A = leagueDef()[code];
  const sel = S.ui.defWeek != null && shown.some((x) => x.week === S.ui.defWeek) ? S.ui.defWeek : ([...shown].reverse().find((x) => x.fp != null) || shown[shown.length - 1]).week, cur = shown.find((x) => x.week === sel);
  const vals = shown.map((x) => x.fp ?? 0), mn = Math.min(0, ...vals), mx = Math.max(1, ...vals, lgAvg + 1), span = mx - mn, PH = 120, y = (v) => ((v - mn) / span) * PH;
  const col = (x) => { const v = x.fp; const b = v == null ? 0 : Math.min(y(0), y(v)), h = v == null ? 0 : Math.max(Math.abs(y(v) - y(0)), 2), hi = v != null && v >= lgAvg;
    return `<button type="button" class="pf-col${x.week === sel ? " sel" : ""}" data-act="def-week" data-v="${x.week}" aria-pressed="${x.week === sel}" aria-label="Week ${x.week} ${x.home === false ? "at" : "vs"} ${esc(x.opp)}: ${v == null ? "no points-allowed figure yet" : `${v} fantasy points`}"><b class="v" style="bottom:calc(var(--lab) + ${b + h + 3}px)">${v == null ? "\u2013" : v}</b><i class="bar ${hi ? "hi" : "lo"}" style="bottom:calc(var(--lab) + ${b}px);height:${h}px"></i><span class="wk">W${x.week}</span></button>`; };
  const chart = `<div class="pf-bars" style="--lab:22px;--n:${shown.length};height:${PH + 50}px"><i class="pf-avgline" style="bottom:calc(var(--lab) + ${y(lgAvg)}px)"></i>${shown.map(col).join("")}</div>`;
  const callout = `<b>W${cur.week} ${cur.home === false ? "@" : cur.home ? "vs" : ""} ${esc(cur.opp)}</b>: ${cur.sk} sack${cur.sk === 1 ? "" : "s"} and ${cur.int + cur.fr} takeaway${cur.int + cur.fr === 1 ? "" : "s"}, ${cur.pa == null ? "points allowed not in yet" : `${cur.pa} points allowed`}${cur.fp == null ? "" : `, <b>${cur.fp.toFixed(1)} fantasy points</b>`}. Green bars beat the league average (dashed line, ${lgAvg.toFixed(1)}).`;
  const tone = (f) => (f == null ? "n" : fpTone(f)), cells = (x) => `<span>W${x.week}</span><span class="o">${x.home === false ? "@ " : x.home ? "vs " : ""}${esc(x.opp)}</span><span>${x.pa == null ? "\u2013" : x.pa}</span><span>${x.sk}</span><span>${x.int + x.fr}</span><span class="y">${Math.round(x.py + x.ry)}</span><b class="tone-${tone(x.fp)}">${x.fp == null ? "\u2013" : x.fp.toFixed(1)}</b>`;
  const head = `<div class="dp-lrow head"><span>Wk</span><span class="o">Opponent</span><span>PA</span><span>Sacks</span><span>TO</span><span class="y">Yds</span><span>FP</span></div>`;
  const avg = `<div class="dp-lrow avg"><span></span><span class="o">Average</span><span>${(all.filter((x) => x.pa != null).reduce((s, x) => s + x.pa, 0) / Math.max(1, all.filter((x) => x.pa != null).length)).toFixed(1)}</span><span>${A.skG.toFixed(1)}</span><span>${(A.intG + A.frG).toFixed(1)}</span><span class="y">${Math.round(A.pyG + A.ryG)}</span><b>${fpAll ? fpAll.avg.toFixed(1) : "\u2013"}</b></div>`;
  const rowBtn = (x) => `<button type="button" class="dp-lrow rowbtn${x.week === sel ? " sel" : ""}" data-act="def-week" data-v="${x.week}" aria-pressed="${x.week === sel}">${cells(x)}</button>`;
  return sec("Recent games", `<div class="panel dp-log">${chart}<div class="pf-callout" role="status">${callout}</div>${head}${avg}${[...shown].reverse().map(rowBtn).join("")}${older.length ? fold("deflog:earlier", `Earlier games (${older.length})`, older.map((x) => `<div class="dp-lrow">${cells(x)}</div>`).join("")) : ""}<p class="pf-cap">Tap a bar or a row to select a game. PA is points allowed. TO is takeaways (interceptions plus fumble recoveries). Yds is what the other offense gained. FP is fantasy points under your league's scoring.</p></div>`, "fantasy points by game");
}

export function kickerHow(code, pr, s) {
  const D = S.teams?.teams ? S.teams : null, t = D?.teams?.[code]; if (!t || !t.games || !t.eff) return "";
  const pf = 1 + D.order.filter((c) => D.teams[c].games && D.teams[c].pf > t.pf + 1e-9).length, e = t.eff, c = pr ? kickerConditions(pr, s) : null;
  return sec("His offense", `<div class="panel"><div class="dp-tiles">${tile("Points scored", `${t.pf.toFixed(1)} a game`, pf)}${tile("Passing offense", `rank ${e.passOff.rank}`, e.passOff.rank)}${tile("Rushing offense", `rank ${e.runOff.rank}`, e.runOff.rank)}</div>${c ? `<p style="margin:12px 0 0"><b>This week:</b> ${esc(c.text)}${c.d ? ` (${c.d >= 0 ? "+" : "\u2212"}${Math.abs(c.d).toFixed(1)} points against a mild outdoor game)` : ""}</p>` : ""}<p class="tm-cap">What moves a kicker is how many points his team is expected to score, whether it is favored, and the weather. Ranks out of 32, 1 is best.</p></div>`);
}

export function viewTeams() {
  const D = S.teams;
  if (!D) { if (!S.errors.teams) loadTeams(); return S.errors.teams ? `<div class="panel empty"><h2 class="h2">Team data is unavailable</h2><p class="muted small" style="margin:6px 0 12px">${esc(S.errors.teams)}</p><button class="btn" data-act="teams-retry">Try again</button></div>` : loading("the teams"); }
  const rows = D.order.map((c) => { const t = D.teams[c], d = t.prevRank - t.rank, nx = t.ahead[0], chg = t.games < 2 || !d ? `<small class="tm-chg">–</small>` : `<small class="tm-chg tone-${d > 0 ? "g2" : "b2"}">${d > 0 ? "▲" : "▼"}${Math.abs(d)}</small>`;
    return `<div class="row rowlink" data-go="team/${c}" style="--team:${teamStripe(c)}">${plate(c)}<div class="who"><span class="name"><span class="tm-rkn">${t.rank}</span><span class="nm">${esc(t.name)}</span></span><span class="sub"><span class="meta">${t.record[0]}–${t.record[1]}${t.record[2] ? `–${t.record[2]}` : ""}${nx ? ` · ${nx.home ? "vs" : "at"} ${nx.opp}` : ""}</span></span></div><div class="proj"><span class="num tone-${rankTone(t.rank)}">${sgn(t.rating, 1)}</span>${chg}</div></div>`; }).join("");
  const off = D.fallback ? fold("teams-offseason", "Last season's table", `The ${D.fallback.wanted} schedule is not out yet, so this is the final ${D.fallback.season} table. It switches to ${D.fallback.wanted} on its own once the schedule is published.`, { headline: `The ${D.fallback.wanted} schedule is not out yet`, tone: "b1" }) : "";
  const early = D.fallback ? "" : D.throughWeek < 3 ? fold("teams-early", "Early in the season", `Only ${D.throughWeek} ${D.throughWeek === 1 ? "week" : "weeks"} played, so ratings lean on last season until week 3.`, { headline: "Ratings lean on last season until week 3", tone: "b1" }) : "";
  const b = D.backtest;
  return `<h1 class="h1" style="margin-top:8px">Team rankings</h1><p class="lede" style="margin-top:8px">All 32 teams by rating: points better than an average team on a neutral field, adjusted for who they played and blended with what the betting lines say. It describes how they have played; it is not a forecast. Tap a team for its profile.</p>${off}${early}
    <div class="list">${rows}</div>
    ${fold("teamsabout", "How much to trust this", `<p class="small" style="margin-bottom:8px">We tested ratings like these against the closing betting line on ${b.games.toLocaleString()} games from ${esc(b.seasons)}, using only games played before each one.</p><dl class="kv"><dt>Betting line</dt><dd>${pct(b.line.picks)} winners, off by ${b.line.miss.toFixed(1)}</dd><dt>Results and lines blended</dt><dd>${pct(b.blend.picks)} winners, off by ${b.blend.miss.toFixed(1)}</dd><dt>Results only</dt><dd>${pct(b.results.picks)} winners, off by ${b.results.miss.toFixed(1)}</dd></dl><p class="small muted" style="margin-top:8px">So the line is the best forecast available, and win odds on these pages come from it. Beating the line so far has not tended to repeat (correlation ${b.beatTheLineRepeat.toFixed(2)}).</p>`)}`;
}

// ---------- one team ----------
export function viewTeam(codeIn) {
  S.ui.slateView = "teams";
  const D = S.teams;
  if (!D) { if (!S.errors.teams) loadTeams(); return `<a class="link" href="#slate">‹ Back to Slate</a>${S.errors.teams ? `<div class="panel empty" style="margin-top:12px"><h2 class="h2">Team data is unavailable</h2><p class="muted small" style="margin:6px 0 12px">${esc(S.errors.teams)}</p><button class="btn" data-act="teams-retry">Try again</button></div>` : loading("the team")}`; }
  const code = String(codeIn || "").toUpperCase(), t = D.teams[code];
  if (!t) return `<a class="link" href="#slate">‹ Back to Slate</a><div class="panel empty" style="margin-top:12px"><h2 class="h2">No team called ${esc(codeIn || "that")}</h2><p class="muted small" style="margin-top:6px">Pick one from the team rankings.</p></div>`;
  const L = league(), ps = L?.playoffStart ?? 15, we = L?.endWeek ?? 17, stripe = teamStripe(code), d = t.prevRank - t.rank;
  const rec = `${t.record[0]}–${t.record[1]}${t.record[2] ? `–${t.record[2]}` : ""}`, nx = t.ahead[0];
  const hero = `<section class="phead" style="--team:${stripe}">${emblem(code)}<div class="top2"><span class="pos neu">#${t.rank} of 32</span></div><div class="nm">${esc(t.city)} ${esc(t.name)}</div>
    <div class="ctx"><span>${rec}</span>${t.games ? `<span>${t.pf} scored</span><span>${t.pa} allowed</span>` : "<span>no games yet</span>"}</div>
    <div class="tm-rate tone-${rankTone(t.rank)}"><div><div class="tm-big">${sgn(t.rating, 1)}</div><div class="tm-cap">Rating · <b>#${t.rank} of 32</b> · ${t.games < 2 || !d ? "no change" : `${d > 0 ? "▲" : "▼"} from #${t.prevRank}`}</div></div><div>${spark(t.trend.length > 1 ? t.trend : [], { w: 130, h: 40, color: "var(--ti)" })}${t.trend.length > 1 ? `<div class="tm-cap" style="margin:0">by week</div>` : ""}</div></div>
    <p class="tm-cap">Blends how they have played, adjusted for opponents, with what the betting lines say. A description, not a forecast.${t.early ? ` Only ${t.games} ${t.games === 1 ? "game" : "games"} so far, so this still leans on last season.` : ""}</p></section>`;
  // this week: the next game, with win odds from the line
  let week = "";
  if (nx) { const p = nx.line == null ? null : winOdds(nx.line), oc = teamStripe(nx.opp), who = nx.line == null ? "" : nx.line >= 0 ? code : nx.opp;
    week = sec(`Week ${nx.week}`, `<div class="panel"><div class="tm-line"><b>${nx.neutral ? "vs" : nx.home ? "vs" : "at"} ${nx.opp}</b><span class="muted">${nx.line == null ? "No line posted yet" : `${who} by ${Math.abs(nx.line).toFixed(1)}${nx.total != null ? ` · total ${nx.total}` : ""}`}</span></div>
      ${p == null ? "" : `<div class="tm-odds" role="img" aria-label="${code} ${Math.round(p * 100)} percent, ${nx.opp} ${Math.round((1 - p) * 100)} percent"><div style="width:${(p * 100).toFixed(1)}%;background:${stripe}"></div><div style="flex:1;background:${oc}"></div></div><div class="tm-line" style="font-weight:800"><span>${code} ${Math.round(p * 100)}%</span><span>${nx.opp} ${Math.round((1 - p) * 100)}%</span></div><p class="tm-cap">Win odds come from the betting line. In a ${D.backtest.games.toLocaleString()}-game test the line beat every rating we could build, so we show the line, not a home-made forecast.</p>`}</div>`);
  }
  const e = t.eff, f = (v) => sgn(v, 2);
  const played = sec("How they've played", rankBar("Pass offense", e.passOff, f) + rankBar("Run offense", e.runOff, f) + rankBar("Pass defense", e.passDef, f) + rankBar("Run defense", e.runDef, f) + `<p class="tm-cap">Expected points added per play. Defense is what opponents did against them. Rank 1 is best.</p>`, "per play, rank of 32");
  const pr = t.passRate, pos = pr ? Math.max(2, Math.min(98, ((pr.v - 0.44) / 0.24) * 100)) : 0, lgPos = pr ? Math.max(2, Math.min(98, ((pr.lg - 0.44) / 0.24) * 100)) : 0;
  const style = sec("Style", !pr ? `<p class="muted small">No plays to measure yet.</p>` : `<div class="tm-rk"><span>Pass rate</span><div class="tm-tr" style="overflow:visible"><div class="tm-tick" style="left:${lgPos.toFixed(0)}%"></div><div class="tm-dot" style="left:${pos.toFixed(0)}%"></div></div><span style="text-align:right"><b class="tm-v">${pct(pr.v)}</b> <span class="muted small">#${pr.rank}</span></span></div><p class="tm-cap" style="margin:-2px 0 8px">${pr.v > pr.lg + 0.03 ? "Pass-heavy" : pr.v < pr.lg - 0.03 ? "Run-leaning" : "Balanced"}. The tick is the league average (${pct(pr.lg)}).</p><div class="tm-rk"><span>Pace</span><div class="tm-tr"><i style="width:${(((33 - t.pace.rank) / 32) * 100).toFixed(0)}%;background:var(--ink3)"></i></div><span style="text-align:right"><b class="tm-v">${Math.round(t.pace.v)}</b> <span class="muted small">#${t.pace.rank}</span></span></div><p class="tm-cap">Plays a game, counting dropbacks and carries. Slower teams mean fewer chances for everyone.</p>`);
  // season so far: margin of each game
  const n = t.log.length, slot = 300 / Math.max(n, 4), bw = Math.min(60, slot * 0.64);
  const bars = t.log.map((g, i) => { const x = 15 + i * slot + (slot - bw) / 2, h = Math.min(56, Math.abs(g.margin) * 1.9), up = g.margin > 0, cx = x + bw / 2;
    const cov = g.cover == null ? "" : n <= 6 ? `<text x="${cx}" y="168" text-anchor="middle" font-size="11" fill="${g.cover > 0 ? "var(--up-ink)" : "var(--down-ink)"}">${g.cover > 0 ? "beat" : "missed"} by ${Math.abs(Math.round(g.cover))}</text>` : `<circle cx="${cx}" cy="166" r="3.5" fill="${g.cover > 0 ? "var(--up)" : "var(--down)"}"/>`;
    return `<rect x="${x}" y="${up ? 70 - h : 70}" width="${bw}" height="${Math.max(2, h)}" rx="5" fill="var(${up ? "--up" : "--down"})" opacity=".9"/><text x="${cx}" y="${up ? 70 - h - 6 : 70 + h + 14}" text-anchor="middle" font-size="${n > 8 ? 10 : 13}" font-weight="800" fill="var(--ink)">${g.margin > 0 ? "+" : g.margin < 0 ? "−" : ""}${Math.abs(g.margin)}</text><text x="${cx}" y="${n <= 6 ? 152 : 150}" text-anchor="middle" font-size="${n > 8 ? 9 : 12}" fill="var(--ink2)">${g.neutral || g.home ? "vs" : "@"} ${g.opp}</text>${cov}`; }).join("");
  const season = sec("Season so far", n ? `<div class="panel"><svg width="100%" viewBox="0 0 330 176" role="img" aria-label="Margin of victory or defeat, game by game"><line x1="8" x2="322" y1="70" y2="70" stroke="var(--hair2)"/>${bars}</svg><p class="tm-cap">Margin of victory or defeat each week, with how far they beat or missed the betting line${n > 6 ? " shown as a green or red dot" : " underneath"}. Beating the line has not tended to repeat in past seasons (correlation ${D.backtest.beatTheLineRepeat.toFixed(2)}), so it is context only.</p></div>` : `<p class="muted small">No games played yet.</p>`);
  const volume = sec("Who gets the volume", t.tshare.length ? `<div class="panel"><b>Targets</b>${stack(t.tshare)}<div style="height:14px"></div><b>Carries</b>${stack(t.cshare)}<p class="tm-cap">Share of the team's targets and carries this season. Tap a name for his profile.</p></div>` : `<p class="muted small">No plays to measure yet.</p>`);
  const ahead = scheduleSection(code, "offense");
  return `<a class="link" href="#slate">‹ Back to Slate</a><div style="margin-top:10px">${hero}</div>${week}${played}${style}${season}${volume}${ahead}`;
}

// ---------- on the player page ----------
// One row under the header: his team's place and style, linking to the team page. Loads the team data the first time it is needed.
export function teamStrip(code) {
  const D = S.teams?.teams ? S.teams : null; if (!code) return "";
  if (!D) { if (!S.errors.teams) loadTeams(); return ""; }
  const t = D.teams[code]; if (!t) return "";
  const bits = [], pr = t.passRate;
  if (t.games >= 2 && pr) bits.push(pr.v > pr.lg + 0.03 ? `pass-heavy (pass rate #${pr.rank})` : pr.v < pr.lg - 0.03 ? `run-leaning (pass rate #${pr.rank})` : "balanced run and pass");
  if (t.games >= 2 && t.pace) bits.push(t.pace.rank <= 10 ? `fast pace (#${t.pace.rank})` : t.pace.rank >= 23 ? `slow pace (#${t.pace.rank})` : "");
  const rec = `${t.record[0]}–${t.record[1]}${t.record[2] ? `–${t.record[2]}` : ""}`;
  return `<a class="panel tm-strip" href="#team/${esc(code)}" style="--team:${teamStripe(code)}" aria-label="${esc(t.city)} ${esc(t.name)} team profile">${plate(code)}<div><b>${esc(t.city)}</b> · ${rec} · rating #${t.rank}${bits.filter(Boolean).length ? `<div class="tm-cap" style="margin-top:2px">${esc(bits.filter(Boolean).join(", "))}</div>` : ""}</div><span class="tm-go" aria-hidden="true">›</span></a>`;
}
// Role over time, who shares the volume, and the next weeks: three sections for a running back or pass catcher, the last one for a quarterback too.
export function playerTeamSections(id, p, u) {
  const D = S.teams?.teams ? S.teams : null, code = p?.t; if (!D || !code || !["QB", "RB", "WR", "TE"].includes(p.p)) return "";
  const t = D.teams[code]; if (!t) return "";
  let out = "";
  const kind = p.p === "RB" ? "car" : p.p === "QB" ? null : "tgt", word = kind === "car" ? "carries" : "targets";
  if (kind && u?.log?.length) {
    const tot = t.weekly[kind] || {}, at2 = kind === "car" ? 3 : 2, rows = u.log.map((g) => ({ w: g[0], n: g[at2], T: tot[g[0]] })).filter((r) => r.T > 0 && r.n <= r.T);
    if (rows.length >= 2) {
      const share = rows.map((r) => r.n / r.T), season = rows.reduce((s, r) => s + r.n, 0) / rows.reduce((s, r) => s + r.T, 0), list = kind === "car" ? t.cshare : t.tshare, at = list.findIndex((x) => x.id === id);
      out += sec("Role over time", `<div class="panel"><div class="tm-rate"><div><div class="tm-big">${pct(season)}</div><div class="tm-cap">of ${esc(code)} ${word} this season${at >= 0 ? ` · #${at + 1} on the team` : ""}</div></div><div>${spark(share, { w: 150, h: 44 })}</div></div><div class="tm-wk">${rows.map((r, i) => `<span>wk ${r.w} · ${pct(share[i])}</span>`).join("")}</div><p class="tm-cap">His share of the team's ${word} in each game. A rising line means a growing role; a falling one is worth knowing before you start him.</p></div>`);
      const items = list.map((x) => ({ ...x })); if (at < 0) items.push({ id, name: p.n, pos: p.p, share: season, extra: true });
      out += sec(`Who shares the ${word}`, `<div class="panel">${stack(items, { mark: id })}<p class="tm-cap">The ${word} on ${esc(code)} this season, with him outlined. If a teammate here is ruled out, his share has to go somewhere; that is a fact we can show without guessing how much.</p></div>`);
    }
  }
  const first = t.ahead[0]?.week;
  if (first) {
    const dKey = p.p === "RB" ? "runDef" : "passDef", w2 = p.p === "RB" ? "run" : "pass", chips = [];
    for (let w = first; w <= Math.min(18, first + 4); w++) {
      const a = t.ahead.find((x) => x.week === w);
      if (!a) { if (t.bye.includes(w)) chips.push(`<div class="tm-chip bye">WK ${w}<small>bye</small></div>`); continue; }
      const o = D.teams[a.opp]?.eff[dKey]; chips.push(`<div class="tm-chip tone-${o ? softTone(o.rank) : "n"}">WK ${w}<br>${a.neutral || a.home ? "vs" : "@"} ${esc(a.opp)}<small>${w2} D ${o ? `#${o.rank}` : "–"}</small></div>`);
    }
    out += sec("Next weeks", `<div class="tm-chips">${chips.join("")}</div><p class="tm-cap">Colored by how well each opponent defends the ${w2} (green is soft). It is the weakest signal we tested, so this is context, not an input to his projection.</p>`, "from the team's schedule");
  }
  return out;
}

// ---------- on the game page ----------
const teamData = () => { if (S.teams?.teams) return S.teams; if (!S.errors.teams) loadTeams(); return null; };
export function gameOdds(g) {
  const L = g.line; if (!L || L.spread == null || g.status?.completed) return "";
  const pH = winOdds(L.spread), pA = 1 - pH, ca = teamStripe(g.away), ch = teamStripe(g.home);
  return sec("Win odds", `<div class="panel"><div class="tm-odds" role="img" aria-label="${esc(g.away)} ${Math.round(pA * 100)} percent, ${esc(g.home)} ${Math.round(pH * 100)} percent"><div style="width:${(pA * 100).toFixed(1)}%;background:${ca}"></div><div style="flex:1;background:${ch}"></div></div><div class="tm-line" style="font-weight:800"><span>${esc(g.away)} ${Math.round(pA * 100)}%</span><span>${esc(g.home)} ${Math.round(pH * 100)}%</span></div><p class="tm-cap">From the betting line, which in a 3,408-game test beat every rating we could build. Not a prediction of our own.</p></div>`);
}
export function gameMatchups(g) {
  const D = teamData(), A = D?.teams[g.away], H = D?.teams[g.home]; if (!A || !H || A.games < 2 || H.games < 2) return "";
  const row = (o, d, ot, dt, kind) => { if (!o || !d) return ""; const gap = d.rank - o.rank, edge = gap >= 10 ? `${ot} edge` : gap <= -10 ? `${dt} edge` : "even", w = (r) => (((33 - r) / 32) * 100).toFixed(0);
    return `<div class="mu"><div class="mu-t"><span><b>${esc(ot)}</b> ${kind} offense</span><span>vs <b>${esc(dt)}</b> ${kind} defense</span></div><div class="face"><div class="l tone-${rankTone(o.rank)}"><i style="width:${w(o.rank)}%"></i></div><div class="r tone-${rankTone(d.rank)}"><i style="width:${w(d.rank)}%"></i></div></div><div class="mu-rk"><span>#${o.rank} of 32</span><span class="edge">${esc(edge)}</span><span>#${d.rank} of 32</span></div></div>`; };
  const rows = row(A.eff.passOff, H.eff.passDef, g.away, g.home, "pass") + row(A.eff.runOff, H.eff.runDef, g.away, g.home, "run") + row(H.eff.passOff, A.eff.passDef, g.home, g.away, "pass") + row(H.eff.runOff, A.eff.runDef, g.home, g.away, "run");
  return rows ? sec("The matchups", `<div class="panel">${rows}<p class="tm-cap">Each bar is how strong that side has been this season (longer is better, rank 1 is best). A gap of 10 or more ranks is called an edge. It shows how they have played; the line already prices it.</p></div>`, "offense against defense") : "";
}
const styleLine = (t, code) => { const pr = t.passRate, pc = t.pace; if (!pr || !pc) return ""; return `<span class="tm-code">${esc(code)}</span>: ${pr.v > pr.lg + 0.03 ? "pass-heavy" : pr.v < pr.lg - 0.03 ? "run-leaning" : "balanced"} (pass rate #${pr.rank}), ${pc.rank <= 10 ? "fast" : pc.rank >= 23 ? "slow" : "average"} pace (#${pc.rank}).`; };
export function gameTotalContext(g) {
  const D = teamData(), A = D?.teams[g.away], H = D?.teams[g.home], tot = g.line?.total; if (!A || !H || tot == null || g.status?.completed || A.log.length < 2 || H.log.length < 2) return "";
  const avg = (t) => t.log.reduce((s, x) => s + x.pf + x.pa, 0) / t.log.length, a = avg(A), h = avg(H), hi = Math.max(a, h, tot) * 1.12;
  const bar = (label, v, cls = "") => `<div class="tot-row ${cls}"><span>${label}</span><div class="bar"><i style="width:${((v / hi) * 100).toFixed(0)}%"></i></div><b>${v.toFixed(1)}</b></div>`;
  return sec("Why the total is what it is", `<div class="panel">${bar(`${esc(g.away)} games avg`, a)}${bar(`${esc(g.home)} games avg`, h)}${bar("This game's line", tot, "line")}<p class="tm-cap">Combined points per game this season, for each team and for this game as the market sets it.</p><p class="tm-cap">${styleLine(A, g.away)}<br>${styleLine(H, g.home)}</p></div>`, "scoring context");
}
const HURT = new Set(["Out", "IR", "PUP", "Sus", "Doubtful", "Questionable", "NA", "COV"]);
export function gameVolume(g, C) {
  const D = teamData(), A = D?.teams[g.away], H = D?.teams[g.home]; if (!A || !H || (!A.tshare.length && !H.tshare.length)) return "";
  const tag = (it) => { const s = it.id ? C?.P?.proj?.[it.id]?.status : null; return s && HURT.has(s) ? `<span class="tm-hl">${esc(s)}</span>` : ""; };
  const block = (t, code) => `<b>${esc(code)}</b> targets${stack(t.tshare, { tag })}<div style="height:6px"></div>carries${stack(t.cshare, { tag })}`;
  return sec("Where the volume goes", `<div class="panel">${block(A, g.away)}<div style="height:16px"></div>${block(H, g.home)}<p class="tm-cap">Share of each team's targets and carries this season. A tag appears on anyone listed Out, Doubtful or Questionable; how the share redistributes is not guessed.</p></div>`);
}
// Notes from the ranks, added to What to know: only extremes (top or bottom five defenses, or both offenses at a pace extreme), and only with two games of evidence.
export function gameRankNotes(g) {
  const D = teamData(), A = D?.teams[g.away], H = D?.teams[g.home], out = []; if (!A || !H || A.games < 2 || H.games < 2) return out;
  for (const [o, d, ot, dt, kind] of [[A.eff.passOff, H.eff.passDef, g.away, g.home, "pass"], [A.eff.runOff, H.eff.runDef, g.away, g.home, "run"], [H.eff.passOff, A.eff.passDef, g.home, g.away, "pass"], [H.eff.runOff, A.eff.runDef, g.home, g.away, "run"]]) {
    if (!o || !d) continue;
    if (d.rank >= 28) out.push({ t: "up", s: `${ot}'s ${kind} game faces ${dt}'s ${kind} defense, #${d.rank} of 32: one of the softest in the league.` });
    if (d.rank <= 5) out.push({ t: "down", s: `${ot}'s ${kind} game faces ${dt}'s ${kind} defense, #${d.rank} of 32: one of the toughest in the league.` });
  }
  const pa = A.pace?.rank, ph = H.pace?.rank;
  if (pa >= 23 && ph >= 23) out.push({ t: "down", s: `Two slow-paced offenses (#${pa} and #${ph}): fewer plays for everyone.` });
  if (pa <= 10 && ph <= 10) out.push({ t: "up", s: `Two fast-paced offenses (#${pa} and #${ph}): more plays for everyone.` });
  return out;
}
