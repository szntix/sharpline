// The kicker profile: this week's conditions, his season by the numbers, a kick map, and how his team scores.
// Data: every kicker's season kick by kick rides in the usage payload the app already loads (S.usage.kickers): no extra request.
// What is shown is description, not prediction: a kicker's season is only 15 to 40 kicks, so every percentage is printed next to "made of tried" and the league's figure.
import { S, league, leagueOrDefault } from "../state.js";
import { points } from "../scoring.js";
import { kickerStats, teamContext } from "../model.js";
import { MILD } from "../conditions.js";
import { esc } from "../ui.js";
import { sec, fold } from "./shared.js";
import { rankTone, defenseGate } from "./teams.js";

const sc = () => league()?.scoring || leagueOrDefault().scoring;
const nn = (s) => String(s || "").toLowerCase().replace(/[^a-z]/g, "");
const BANDS = [["Under 30", 0, 29], ["30\u201339", 30, 39], ["40\u201349", 40, 49], ["50+", 50, 99]];
const bandOf = (d) => (d < 30 ? 0 : d < 40 ? 1 : d < 50 ? 2 : 3);
const pct = (a, b) => (b ? Math.round((a / b) * 100) : null);
const sign = (v) => (v >= 0 ? "+" : "\u2212") + Math.abs(v).toFixed(1);

// His rows: by Sleeper id when the server could map it, otherwise by name and team.
export function findKicker(id, p) {
  const K = S.usage?.kickers || {}; if (K[id]) return K[id];
  const pool = Object.values(K).filter((x) => nn(x.n) === nn(p?.n)); return pool.find((x) => x.t === p?.t) || pool[0] || null;
}
// one game (a row from the endpoint) as the stat line the league's scoring understands
const gameStat = (r) => { const st = { fgm_0_19: 0, fgm_20_29: 0, fgm_30_39: 0, fgm_40_49: 0, fgm_50p: 0, xpm: r[5], xpmiss: Math.max(0, r[6] - r[5]), fgmiss: r[4].length }; for (const d of r[3]) st[d <= 19 ? "fgm_0_19" : d <= 29 ? "fgm_20_29" : d <= 39 ? "fgm_30_39" : d <= 49 ? "fgm_40_49" : "fgm_50p"]++; return st; };
export const gameFp = (r, s = sc()) => points(gameStat(r), s, "K", true);
function league_() {                                    // every kicker's totals, cached per scoring
  const key = JSON.stringify(sc()); if (S.usage._kagg?.key === key) return S.usage._kagg;
  const bands = BANDS.map(() => [0, 0]), per = [];
  for (const k of Object.values(S.usage.kickers)) {
    let made = 0, att = 0, fp = 0, long = 0, xm = 0, xa = 0; for (const r of k.g) { for (const d of r[3]) { bands[bandOf(d)][0]++; bands[bandOf(d)][1]++; made++; att++; long = Math.max(long, d); } for (const d of r[4]) { bands[bandOf(d)][1]++; att++; } fp += gameFp(r); xm += r[5]; xa += r[6]; }
    per.push({ k, n: k.g.length, made, att, long, fpg: k.g.length ? fp / k.g.length : 0, acc: att ? made / att : null, xm, xa, apg: k.g.length ? att / k.g.length : 0 });
  }
  return (S.usage._kagg = { key, bands, per, qual: per.filter((x) => x.n >= 2) });
}
const rankAmong = (A, me, f) => 1 + A.qual.filter((x) => f(x) > f(me) + 1e-9).length;

// What to show while the data this page needs is missing: a loading line, or what went wrong with a button. Nothing once everything is loaded.
export function kickerGate() { return defenseGate(); }   // same team-table gate as every profile; his kicks come with the usage payload

// ---------------- this week: conditions
export function kickerConditionsSec(id, p, pr) {
  const g = pr?.game; if (!g) return ""; const c = teamContext(g, p.t); if (!c || c.imp == null) return "";
  const s = sc(), wx = g.forecast || null, dome = !!g.venue?.indoor;
  const base = points(kickerStats(c.imp, { spread: c.spread, wx: MILD }), s, "K"), now = points(kickerStats(c.imp, { spread: c.spread, wx, dome }), s, "K"), d = now - base;
  const windy = wx?.wind != null ? (wx.wind >= 15 ? ["b1", "Breezy"] : wx.wind >= 9 ? ["n", "Moderate"] : ["g1", "Calm"]) : ["n", dome ? "Indoors" : "Forecast not out"];
  const temp = wx?.temp != null ? (wx.temp <= 35 ? ["b1", "Cold"] : wx.temp >= 85 ? ["n", "Hot"] : wx.temp <= 50 ? ["n", "Cool"] : ["g1", "Mild"]) : ["n", dome ? "Indoors" : "Forecast not out"];
  const tile = (label, big, small, tone) => `<div class="pf-tile tone-${tone}"><small>${label}</small><b>${big}</b><span>${small}</span></div>`;
  const tiles = tile("Roof", dome ? "Indoors" : "Open air", dome ? "no weather" : "outdoors", dome ? "g1" : "n") + tile("Wind", dome ? "\u2013" : wx?.wind != null ? `${Math.round(wx.wind)} mph` : "\u2013", windy[1], windy[0]) + tile("Kickoff temp", dome ? "\u2013" : wx?.temp != null ? `${Math.round(wx.temp)}\u00B0F` : "\u2013", temp[1], temp[0]);
  const fav = c.spread == null ? "" : ` as a ${Math.abs(c.spread)}-point ${c.spread > 0 ? "favorite" : "underdog"}`;
  const callout = `<b>Expect about ${now.toFixed(1)} points</b>${Math.abs(d) < 0.05 ? ", the same as a mild outdoor game" : `, ${Math.abs(d).toFixed(1)} ${d < 0 ? "below" : "above"} a mild outdoor game`}. His team is expected to score <b>${c.imp.toFixed(1)}</b>${fav} (${c.home ? "home" : "away"} vs ${esc(c.opp)}).`;
  return sec("This week: conditions", `<div class="panel"><div class="pf-tiles">${tiles}</div><div class="pf-callout">${callout}</div><p class="pf-cap">Weather and the score a team is expected to reach are what move a kicker. Wind under 15 mph and temperatures above 35\u00B0F barely matter.</p></div>`, `vs ${esc(c.opp)}`);
}

// ---------------- season so far: by the numbers
export function kickerNumbers(id, p) {
  if (!S.usage?.kickers) return ""; const me = findKicker(id, p); if (!me) return "";
  const A = league_(), m = A.per.find((x) => x.k === me); if (!m || !m.n) return "";
  const tile = (label, val, rank) => `<div class="dp-tile tone-${rank ? rankTone(rank) : "n"}"><small>${label}</small><b>${val}</b>${rank ? `<span>#${rank}</span>` : ""}</div>`, N = A.qual.length;
  const q = m.n >= 2, tiles = [tile("Fantasy points", `${m.fpg.toFixed(1)} a game`, q ? rankAmong(A, m, (x) => x.fpg) : null), tile("Kicks tried", `${m.apg.toFixed(1)} a game`, q ? rankAmong(A, m, (x) => x.apg) : null),
    tile("Field goals", `${m.made} of ${m.att}`, null), tile("Accuracy", m.acc == null ? "\u2013" : `${pct(m.made, m.att)}%`, q && m.att >= 5 ? 1 + A.qual.filter((x) => x.att >= 5 && x.acc > m.acc + 1e-9).length : null), tile("Longest", m.long ? `${m.long} yards` : "\u2013", q && m.long ? rankAmong(A, m, (x) => x.long) : null), tile("Extra points", `${m.xm} of ${m.xa}`, null)].join("");
  return sec("By the numbers", `<div class="panel"><div class="dp-tiles">${tiles}</div><p class="tm-cap">This season, ${m.n} game${m.n === 1 ? "" : "s"}, from nflverse. Ranks are among the ${N} kickers with two or more games (accuracy: five or more kicks); 1 is best. Fantasy points use your league's scoring.</p></div>`, `${m.n} game${m.n === 1 ? "" : "s"}`);
}

// Compare rows for two kickers, from the same per-kicker totals the profile's "By the numbers" uses, so the two pages cannot disagree.
export function kickerCompareRows(idA, pA, idB, pB) {
  const kA = findKicker(idA, pA), kB = findKicker(idB, pB); if (!kA || !kB) return [];
  const T = league_().per, a = T.find((x) => x.k === kA), b = T.find((x) => x.k === kB); if (!a?.n || !b?.n) return [];
  const f1 = (v) => (v == null ? "\u2013" : v.toFixed(1)), ac = (m) => (m.acc == null ? "\u2013" : `${Math.round(m.acc * 100)}%`), yd = (m) => (m.long ? `${m.long} yd` : "\u2013");
  return [{ label: "Fantasy pts/game", a: a.fpg, b: b.fpg, fa: f1(a.fpg), fb: f1(b.fpg) }, { label: "Kicks tried/game", a: a.apg, b: b.apg, fa: f1(a.apg), fb: f1(b.apg) },
    { label: "FG accuracy", a: a.acc, b: b.acc, fa: ac(a), fb: ac(b), tol: 0.005 }, { label: "Longest", a: a.long || null, b: b.long || null, fa: yd(a), fb: yd(b) }];
}

// ---------------- season so far: the kick map
export function kickMap(id, p) {
  if (!S.usage?.kickers) return ""; const me = findKicker(id, p);
  if (!me) return sec("Kick map", `<div class="panel"><p class="m">No kicks recorded for him yet this season.</p></div>`);
  const A = league_(), games = [...me.g].reverse(), sel = S.ui.kickBand ?? null, bs = BANDS.map(([nm, lo, hi], i) => { let made = 0, att = 0; for (const r of me.g) { for (const d of r[3]) if (bandOf(d) === i) { made++; att++; } for (const d of r[4]) if (bandOf(d) === i) att++; } return { nm, lo, hi, made, att, p: att ? made / att : null, lg: A.bands[i][1] ? A.bands[i][0] / A.bands[i][1] : null }; });
  const tone = (b) => (b.p == null || b.lg == null ? "n" : b.p - b.lg >= 0.05 ? "g2" : b.p - b.lg <= -0.2 ? "b2" : b.p - b.lg <= -0.1 ? "b1" : "n");
  const RH = games.length > 9 ? 18 : 25, top = 24, W = 340, x0 = 50, x1 = 332, d0 = 18, d1 = 62, X = (d) => x0 + ((Math.min(Math.max(d, d0), d1) - d0) / (d1 - d0)) * (x1 - x0), ph = games.length * RH + 6, H = top + ph, R = RH > 20 ? 7.5 : 6;
  const kicks = me.g.flatMap((r) => [...r[3], ...r[4]]).length, madeAll = me.g.reduce((a, r) => a + r[3].length, 0);
  let svg = `<svg class="pf-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Every field goal attempt, ${madeAll} made and ${kicks - madeAll} missed, by distance and game">`;
  for (let d = 20; d < 62; d += 10) svg += `<rect x="${X(d)}" y="${top - 4}" width="${X(Math.min(d + 10, 62)) - X(d)}" height="${ph}" fill="${(d / 10) % 2 ? "var(--turf-a)" : "var(--turf-b)"}"/>`;
  svg += `<rect x="${x0}" y="${top - 4}" width="${x1 - x0}" height="${ph}" fill="none" stroke="var(--hair)" rx="3"/>`;
  if (sel != null) svg += `<rect x="${X(BANDS[sel][1])}" y="${top - 4}" width="${X(Math.min(BANDS[sel][2] + 1, 62)) - X(BANDS[sel][1])}" height="${ph}" fill="#fff" opacity=".14"/>`;
  for (const d of [20, 30, 40, 50, 60]) svg += `<line x1="${X(d)}" x2="${X(d)}" y1="${top - 4}" y2="${top - 4 + ph}" stroke="#fff" opacity=".28"/><text x="${X(d)}" y="${top - 9}" text-anchor="middle" font-size="10.5" font-weight="800" fill="var(--ink2)">${d}</text>`;
  games.forEach((r, i) => { const y = top + i * RH + RH / 2 - 1; svg += `<text x="2" y="${y + 3.5}" font-size="10.5" font-weight="700" fill="var(--ink2)">W${r[0]} ${S.teams?.teams?.[r[1]]?.log?.find((g) => g.week === r[0])?.home === false ? "@" : "vs"} ${esc(r[2])}</text>`;
    for (const [list, m] of [[r[3], 1], [r[4], 0]]) for (const d of list) { const op = sel == null || bandOf(d) === sel ? 1 : 0.3, cx = X(d);
      svg += m ? `<g opacity="${op}"><circle cx="${cx}" cy="${y}" r="${R}" fill="#fff" stroke="#2a9d5c" stroke-width="3"/></g>` : `<g opacity="${op}"><circle cx="${cx}" cy="${y}" r="${R}" fill="#e5483a" stroke="#fff" stroke-width="1.6"/><path d="M${cx - 2.8} ${y - 2.8}l5.6 5.6M${cx + 2.8} ${y - 2.8}l-5.6 5.6" stroke="#fff" stroke-width="1.7" stroke-linecap="round"/></g>`; } });
  svg += "</svg>";
  const chips = bs.map((b, i) => `<button type="button" class="pf-chip tone-${tone(b)}${sel === i ? " sel" : ""}" data-act="kick-band" data-v="${i}" aria-pressed="${sel === i}"><span>${b.nm}</span><b>${b.p == null ? "\u2013" : Math.round(b.p * 100) + "%"}</b><small>${b.made} of ${b.att}</small></button>`).join("");
  const s = sel == null ? null : bs[sel], few = s && s.att < 5 ? ` Only ${s.att} kick${s.att === 1 ? "" : "s"}: too few to say much.` : "";
  const callout = s ? `<b>${s.nm} yards: ${s.made} of ${s.att}</b>${s.p == null ? "" : ` (${Math.round(s.p * 100)}%)`}${s.lg == null ? "" : ` against ${Math.round(s.lg * 100)}% for kickers league-wide`}. Overall ${madeAll} of ${kicks} (${pct(madeAll, kicks)}%).${few}` : `<b>${madeAll} of ${kicks} (${pct(madeAll, kicks)}%) overall.</b> Tap a distance to focus those kicks and compare with the league.`;
  return sec("Kick map", `<div class="panel">${svg}<div class="pf-chips g4">${chips}</div><div class="pf-callout" role="status">${callout}</div><p class="pf-cap"><span class="pf-key made"></span> made &nbsp;<span class="pf-key miss"></span> missed or blocked. Newest game on top; yard lines every 10.</p></div>`, `${me.g.length} game${me.g.length === 1 ? "" : "s"}`);
}

// ---------------- the team parallel: how his team scores
export function kickerTeamMix(id, p) {
  if (!S.usage?.kickers || !S.teams?.teams) return ""; const me = findKicker(id, p); if (!me) return "";
  const rows = me.g.map((r) => { const lg = S.teams.teams[r[1]]?.log?.find((g) => g.week === r[0]); return lg ? { w: r[0], pf: lg.pf, fg: 3 * r[3].length, xp: r[5], att: r[3].length + r[4].length } : null; }).filter(Boolean);
  if (!rows.length) return "";
  const max = Math.max(...rows.map((x) => x.pf), 1), PH = 110, hh = (v) => Math.round((v / max) * PH), kick = rows.reduce((a, x) => a + x.fg + x.xp, 0), all = rows.reduce((a, x) => a + x.pf, 0), att = rows.reduce((a, x) => a + x.att, 0);
  const cols = rows.map((x) => `<div class="pf-scol" role="img" aria-label="Week ${x.w}: ${x.pf} points, ${x.fg} from field goals, ${x.xp} from extra points, ${x.att} kicks tried"><b>${x.pf}</b><div class="pf-splot"><i class="td" style="height:${hh(Math.max(0, x.pf - x.fg - x.xp))}px"></i><i class="xp" style="height:${hh(x.xp)}px"></i><i class="fg" style="height:${hh(x.fg)}px"></i></div><span>W${x.w}</span><em>${x.att}</em></div>`).join("");
  const fgT = rows.reduce((a, x) => a + x.fg, 0), xpT = rows.reduce((a, x) => a + x.xp, 0), tdT = rows.reduce((a, x) => a + Math.max(0, x.pf - x.fg - x.xp), 0), tot = fgT + xpT + tdT;
  const seg = (cls, v) => (v > 0 ? `<i class="${cls}" style="flex-grow:${v}"></i>` : ""), key = (cls, name, v) => `<span><span class="pf-key ${cls}"></span>${name} <b>${v}</b> <small>${Math.round((v / tot) * 100)}%</small></span>`;
  // One bar for the season, in the app's standard 14px: where his team's points come from. The week-by-week stacks stay behind a fold for anyone who wants them.
  const bar = `<div class="cbar" role="img" aria-label="Points by source this season, ${tot} in all: ${fgT} from field goals, ${xpT} from extra points, ${tdT} from touchdowns and other scores">${seg("fg", fgT)}${seg("xp", xpT)}${seg("td", tdT)}</div><div class="ckey">${key("fg", "Field goals", fgT)}${key("xp", "Extra points", xpT)}${key("td", "Touchdowns and other scores", tdT)}</div>`;
  return sec("How his team scores", `<div class="panel">${bar}<div class="pf-chips" style="margin-top:12px"><div class="pf-chip tone-g1"><span>${pct(kick, all)}% of the points</span><small>come off his kicks</small></div><div class="pf-chip tone-n"><span>${(att / rows.length).toFixed(1)} kicks a game</span><small>tried</small></div></div><p class="pf-cap">A kicker scores when an offense <b>settles for three</b>: the more his team stalls near the goal line, the more he kicks. Touchdowns and other scores include two-pointers and defensive or special-teams scores.</p>${fold("kmix:games", "Game by game", `<div class="pf-stack">${cols}</div><p class="pf-cap" style="margin-top:4px">The bold number under each week is how many kicks he tried.</p>`)}</div>`, "points by source");
}
