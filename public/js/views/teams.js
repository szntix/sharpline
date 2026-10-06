// Teams: the power rankings (a second view inside Slate) and one page per team. Ratings describe how a team has played, opponent-adjusted and blended with
// what the betting lines say. They are not a forecast: in a 3,408-game test the closing line beat every rating we could build, so win odds come from the line.
import { S, loadTeams, league, leagueOrDefault, computed } from "../state.js";
import { points } from "../scoring.js";
import { defenseStats, kickerStats } from "../model.js";
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
