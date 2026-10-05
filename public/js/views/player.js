import { teamStrip, playerTeamSections } from "./teams.js";
import { ADV, ADV_BY_POS, peerList, gradeOf, rankLabel, whyNot, whyShort } from "./advstats.js";
import { SOURCES, S, computed, league, leagueOrDefault, pl } from "../state.js";
import { MODEL } from "../coefs.js";
import { xppr } from "../model.js";
import { signals, statusText } from "../engine.js";
import { esc, f1, f0, pct, percentile, kickoffText, posLabel, statusChip, posClass, teamStripe, emblem } from "../ui.js";
import { dotplot, dotCaption, axisMax, waterfall, pctBar, formStrip, rankRange, luck, proofDots } from "../charts.js";
import { quantile } from "../engine.js";
import { mmHtml, loading, feedError, sec, noteList, SRC_NOTE } from "./shared.js";

const AGE = (p) => (p.a ? `, age ${Math.floor(p.a)}` : "");
export const defaultThr = (pr, pos) => Math.max(5, Math.round(pr.mean / 5) * 5);
export function thrOptions(pr) {
  const t = defaultThr(pr); return [...new Set([Math.max(5, t - 5), t, t + 5, t + 10])];
}

function peerArrays(pos) {
  const key = `peers:${pos}`, C = computed();
  if (C.cache[key]) return C.cache[key];
  const rows = Object.entries(S.usage?.players || {}).filter(([id, u]) => u.p === pos && u.n >= 3 && S.players[id]?.t).map(([, u]) => u);
  const arr = (f) => rows.map(f).filter((x) => x != null).sort((a, b) => a - b);
  return (C.cache[key] = { form: arr((u) => u.form), tgt: arr((u) => u.tgt), car: arr((u) => u.car), ts: arr((u) => u.ts), ppg: arr((u) => u.ppg) });
}

function defensePct(opp, pos) {
  const vals = Object.values(S.usage?.dvp || {}).map((d) => d[pos]).filter((x) => x != null).sort((a, b) => a - b);
  const v = S.usage?.dvp?.[opp]?.[pos]; return v == null ? null : { v, p: percentile(vals, v), n: vals.length };
}

export function viewPlayer(id) {
  if (!S.players || !S.feed) return feedError() + loading("this player");
  const p = pl(id);
  if (!p) return `<div class="panel empty"><h2 class="h2">Player not found</h2><a class="btn primary" href="#players">Back to players</a></div>`;
  const C = computed(), pr = C.P.proj[id], u = S.usage?.players?.[id], pos = p.p, M = MODEL.pos[pos], L = league();
  const g = pr?.game, ours = C.ranks.ours[id], exp = C.ranks.exp[id];
  const out = pr && !(pr.mean > 0);
  const head = out
    ? `<div class="hero-num" style="font-size:60px">${pr.bye ? "Bye" : pr.noTeam ? "No team" : pr.status || "No line"}</div><p style="margin-top:6px">${pr.bye ? "Not playing this week." : pr.noTeam ? "Not on a team right now, so he is not projected until he signs." : pr.status ? esc(statusText(pr)) : "No projection yet."}</p>`
    : `<div class="pj"><div class="hero-num">${f1(pr.mean)}</div><div class="rng">projected points<br>in ${L ? "your" : "standard PPR"} scoring${pr.status ? `<br>${esc(statusText(pr))}` : ""}</div></div>`;
  const ctxBits = [`${posLabel(pos)}, ${esc(p.t || "free agent")}${AGE(p)}`];
  if (g && pos !== "DEF") ctxBits.push(`${g.home === p.t ? "vs" : "at"} ${esc(pr.opp)}, ${esc(kickoffText(g))}`);
  if (pr?.spread != null && pr.total != null) ctxBits.push(`${esc(p.t)} ${pr.spread >= 0 ? "favored by " + pr.spread : "underdog by " + -pr.spread}, total ${pr.total}`);
  if (pr?.wx) ctxBits.push(`wind ${pr.wx.wind} mph`);
  const chips = [ours ? `${({ blend: "We rank", model: "Our model ranks", experts: "Experts rank", sleeper: "Sleeper ranks" })[S.ui.src] || "We rank"} #${ours} ${posLabel(pos)}` : "", exp && S.ui.src !== "experts" ? `Experts #${exp} ${posLabel(pos)}` : "", pr?.src && SRC_NOTE[pr.src] ? SRC_NOTE[pr.src] : ""].filter(Boolean);
  const hero = `<a class="link" href="#players" style="display:inline-block;margin:6px 0">Back to players</a>
    <section class="phead" style="--team:${teamStripe(p.t)}">${emblem(p.t)}<div class="top2"><span class="pos ${posClass(pos)}">${posLabel(pos)}</span>${statusChip(pr?.status, pr?.practice)}</div><div class="nm">${esc(p.n)}</div>
      <div class="ctx">${ctxBits.map((b) => `<span>${b}</span>`).join("")}</div>${head}
      ${chips.length ? `<div class="chipline">${chips.map((c) => `<span>${esc(c)}</span>`).join("")}</div>` : ""}
      <div class="toolbar"><a class="btn primary" href="#compare/${id}">Compare with…</a>${L && !L.roster.includes(id) ? `<button class="btn" data-act="add-mine" data-id="${id}">Add to my team</button>` : ""}</div></section>`;
  if (out) return feedError() + hero + teamStrip(pos === "DEF" ? null : p.t) + notesSection(id, C);

  // 1. How likely is a big game
  const thr = S.ui.thr[id] ?? defaultThr(pr, pos), opts = thrOptions(pr), max = axisMax([pr]);
  const likely = sec("How likely is a big game?", `${dotplot(pr, { max, threshold: thr, id: "dp-" + id, name: p.n, range: [Math.max(0, quantile(pr, 0.1)), quantile(pr, 0.9)] })}
    <div class="cap" id="dp-${id}-cap">${dotCaption(pr, thr, p.n.split(" ")[0])}</div>
    <div class="thresholds" data-for="dp-${id}">${opts.map((t) => `<button data-thr="${t}" aria-pressed="${t === thr}">${t}+</button>`).join("")}</div>
    <p class="small muted" style="margin-top:10px">Each dot is one of 20 equally likely outcomes. Drag the line to ask a different question. ${S.ui.src !== "blend" ? "Ranges were checked against five seasons of results for the Blended projection; other sources use the same spread settings, which have not been checked separately:" : "Ranges were checked against five seasons of results:"} the real score landed inside the 10th-to-90th range about 80% of the time.</p>`);

  // 2. How we got the number
  function modelWhy(pid, pp, q) {
    if (q.src === "lines") return "Kickers and defenses have no player-level model. This is an estimate from the game's betting line, and it has not been tested the way player projections have.";
    const base = q.kind === "experts" ? "the experts' consensus" : q.kind === "sleeper" ? "Sleeper's number" : "our best available number", u = S.usage?.players?.[pid];
    if (!S.usage) return `Game logs are still loading, so for now this is ${base}.`;
    if (!u) return `Our stat model has nothing to work from because ${esc(pp.n)} could not be matched to his game logs, so this is ${base}.`;
    if (u.n < 3) return `Only ${u.n} game${u.n === 1 ? "" : "s"} logged for him, and our stat model needs 3, so this is ${base}.`;
    if (q.roleUnclear) return `The experts project him well below his past usage, which usually means his role has changed (for example a backup whose history comes from old starts), so our stat model sits him out this week and this is ${base}.`;
    return `Our stat model has no number for him this week, so this is ${base}.`;
  }
  let built = "";
  if (pr.parts && M) {
    const rows = [{ kind: "start", label: "Players who score like him usually get", note: "his recent games, pulled toward normal", v: pr.base }];
    const kept = M.kept, lab = {
      env: pr.implied != null ? `Vegas: ${esc(p.t)} expected to score ${f1(pr.implied)}` : "Vegas team total (no line yet)",
      usage: pos === "RB" ? "Workload" : "Target volume", dvp: pr.opp ? `${esc(pr.opp)}'s defense against ${posLabel(pos)}s` : "Opponent defense",
      wind: pr.wx ? `Wind ${pr.wx.wind} mph, ${pr.wx.temp}°` : "Wind and cold", home: pr.row?.home ? "Home field" : "Road game",
    };
    for (const k of ["env", "usage", "dvp", "wind", "home"]) if (kept.includes(k)) rows.push({ kind: "delta", label: lab[k], note: k === "usage" ? "targets, carries and target share" : "", v: pr.parts[k] || 0 });
    rows.push({ kind: "end", label: "Our stat model says", v: pr.model });
    const w = pr.weights;
    const blendPPR = C.P0.proj[id]?.ppr ?? pr.ppr;   // always the true Blend, whichever source is selected
    built = sec("How we got the number", `${waterfall(rows)}
      ${pr.experts != null || pr.sleeper != null ? `<div class="bars3" style="margin-top:18px">
        <div class="b3"><span>Our stat model</span><div class="t"><i class="m" style="width:${(pr.model / Math.max(pr.model, pr.experts || 0, pr.sleeper || 0, 1)) * 100}%"></i></div><b>${f1(pr.model)}</b></div>
        ${pr.experts != null ? `<div class="b3"><span>Experts</span><div class="t"><i class="e" style="width:${(pr.experts / Math.max(pr.model, pr.experts, pr.sleeper || 0, 1)) * 100}%"></i></div><b>${f1(pr.experts)}</b></div>` : ""}
        ${pr.sleeper != null ? `<div class="b3"><span>Sleeper</span><div class="t"><i class="e" style="width:${(pr.sleeper / Math.max(pr.model, pr.experts || 0, pr.sleeper, 1)) * 100}%;opacity:.6"></i></div><b>${f1(pr.sleeper)}</b></div>` : ""}
        <div class="b3"><span><b style="text-align:left">Blend</b></span><div class="t"><i class="bl" style="width:${(blendPPR / Math.max(pr.model, pr.experts || 0, pr.sleeper || 0, blendPPR, 1)) * 100}%"></i></div><b>${f1(blendPPR)}</b></div></div>
        <p class="small muted" style="margin-top:10px">${pr.kind === "blend" ? `Blend is ${Math.round(w.experts * 100)}% expert consensus and ${Math.round(w.model * 100)}% our stat model. Those weights came from testing ${posLabel(pos)}s over five seasons: experts were more accurate than any stats-only model, and adding the model to them kept the blend at least as accurate.` : `Only ${SRC_NOTE[pr.kind] || pr.kind} was available for this player.`} Numbers are standard PPR.</p>` : ""}`);
  } else {
    built = sec("Where the number comes from", `<p>${modelWhy(id, p, pr)}</p>`);
  }

  // 3. Where he stands
  let stands = "";
  if (u && u.n >= 3 && pos !== "K" && pos !== "DEF") {
    const pa = peerArrays(pos), bars = [];
    if (pos !== "QB") bars.push(pctBar("Targets per game", percentile(pa.tgt, u.tgt), f1(u.tgt), "recent weighted"), pctBar("Target share", percentile(pa.ts, u.ts), pct(u.ts)));
    if (pos === "RB" || pos === "QB") bars.push(pctBar("Carries per game", percentile(pa.car, u.car), f1(u.car)));
    bars.push(pctBar("Points per game", percentile(pa.form, u.form), f1(u.form), "recent weighted"));
    stands = sec(`Where he stands among ${posLabel(pos)}s`, bars.join("") + `<p class="small muted" style="margin-top:8px">Ranked against ${pa.form.length} ${posLabel(pos)}s with at least three games. The line in the middle is average.</p>`);
  }

  // 4. Form vs workload
  let form = "";
  if (u?.log?.length) {
    const xf = ["RB", "WR", "TE"].includes(pos) ? (t, c) => xppr(pos, t, c) : null;
    const gap = xf && u.g >= 2 ? u.form - xf(u.tgt, u.car) : null;
    form = sec("Recent games", `${formStrip(u.log, xf)}
      <div class="legend"><span><i class="l-bar"></i>Fantasy points (PPR)</span>${xf ? `<span><i class="l-tick"></i>What that game's workload usually earns</span>` : ""}</div>
      ${gap != null ? `<p style="margin-top:10px">${Math.abs(gap) < 2 ? "Scoring about what his workload earns." : gap > 0 ? `Scoring <b>${gap.toFixed(1)} a game more</b> than his workload usually earns, which tends to fade.` : `Scoring <b>${(-gap).toFixed(1)} a game less</b> than his workload usually earns, which tends to correct.`}</p>` : ""}`, u.ppg != null ? `${u.ppg} a game this season` : "");
  }

  // 5. Experts
  let experts = "";
  if (pr.ecr) {
    const e = pr.ecr;
    experts = sec("What the experts think", `${rankRange(e, ours && ours <= 60 ? ours : null)}
      <div class="legend"><span><i class="l-band"></i>Range of expert rankings</span><span><i class="l-dia"></i>Consensus</span>${ours ? `<span><i class="l-us"></i>Where we rank him</span>` : ""}</div>
      <p style="margin-top:10px">Consensus ${posLabel(pos)}${f1(e.e)}. The most bullish expert has him ${posLabel(pos)}${f0(e.b)}, the most bearish ${posLabel(pos)}${f0(e.w)}.${e.o != null ? ` Rostered in ${f0(e.o)}% of leagues.` : ""}${e.g ? ` FantasyPros start/sit grade: ${esc(e.g)}.` : ""}</p>`, "FantasyPros");
  } else if (S.feed.ecr.status !== "ok") {
    experts = sec("What the experts think", `<p class="muted">Expert rankings for week ${S.feed.week} haven't been published yet. FantasyPros usually posts them Tuesday or Wednesday, and they appear here automatically.</p>`);
  }

  // 6. Matchup
  let matchupSec = "";
  if (pr.opp && !["K", "DEF"].includes(pos)) {
    const d = defensePct(pr.opp, pos), sg = MODEL.proof.signals[pos]?.dvp, used = M?.kept.includes("dvp");
    if (d) matchupSec = sec("The matchup", `<p>${esc(pr.opp)} has allowed <b>${d.v >= 0 ? f0(d.v * 100) + "% more" : f0(-d.v * 100) + "% fewer"}</b> fantasy points to ${posLabel(pos)}s than the average defense, recently weighted. That is ${d.p >= 50 ? "friendlier" : "tougher"} than ${d.p >= 50 ? d.p : 100 - d.p}% of the league.</p>
      ${sg ? `<div class="callout ${used ? "" : "warn"}" style="margin-top:12px"><span style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">${proofDots(sg.years, { labels: MODEL.proof.years })} <b>${sg.years.filter(Boolean).length} of ${sg.years.length} tests</b></span><br>${used ? `Opponent rating improved our forecasts often enough for ${posLabel(pos)}s that it is included, with a small effect (${sg.avg}% lower error).` : `Opponent rating did not improve our forecasts reliably for ${posLabel(pos)}s, so it is shown here but <b>not used</b> in the projection. Treat it as background, not a prediction.`}</div>` : ""}`);
  }
  if (S.ui.src !== "blend" && built) built = built.replace("</header>", `</header><p class="callout small" style="margin:0 0 12px">The number at the top is ${SOURCES[S.ui.src]}'s${pr.srcMissing ? ", and he has none, so it is the Blended number" : ""}. The Blended number we recommend is ${f1(C.P0.proj[id]?.mean)}. The breakdown below explains the Blend.</p>`);
  return feedError() + hero + teamStrip(pos === "DEF" ? null : p.t) + matchLine(id, C, p) + likely + advSection(id, p) + built + stands + form + experts + matchupSec + notesSection(id, C) + playerTeamSections(id, p, u);
}

function notesSection(id, C) {
  const s = signals(id, C.c, C.P);
  return s.length ? sec("Worth knowing", noteList(s.map((x) => ({ t: x.t === "info" ? "" : x.t, s: x.s })))) : "";
}

// This season's efficiency from the nflverse weekly file. Each stat is ranked against everyone at the position with two or more games, and the tile says in
// words and color whether it is good: a meter filled to his percentile, a one-word grade, and the number in the grade's color. Tapping a tile opens the rankings.
function advSection(id, p) {
  const adv = S.usage?.players?.[id]?.adv; if (!adv || !adv.g || !ADV_BY_POS[p.p]) return "";
  const me = S.usage.players[id], plural = `${posLabel(p.p)}s`;
  const tiles = ADV_BY_POS[p.p].filter((k) => adv[k] != null).map((k) => { const m = ADV[k], v = adv[k], vals = peerList(S.usage, p.p, k).map((x) => x.v), why = whyNot(S.usage, p.p, k, me), { pct, word, tone } = why ? { pct: null, word: "", tone: "n" } : gradeOf(v, vals, m.kind);
    const rk = pct != null ? rankLabel(v, vals) : null, n = vals.length;
    const aria = `${m.label}: ${m.fmt(v)}. ${why ? `Not ranked yet: ${whyShort(why)}.` : pct != null ? `${m.kind === "style" ? word : `${word}.`} Ranked ${rk} of ${n} ${plural}.` : "Not enough players to rank yet."} Open the ${posLabel(p.p)} rankings.`;
    const line = why ? (why.kind === "games" ? `<b>Too early</b> · ${whyShort(why)}, not ranked yet` : `<b>Not ranked</b> · ${whyShort(why)} (needs ${why.need})`) : pct != null ? `<b>${word}</b> · #${rk} of ${n} ${plural}` : "not enough players to rank yet";
    return `<a class="tile tone-${tone}" data-tone="${tone}" ${rk ? `data-rank="${rk}" data-of="${n}"` : ""} href="#stat/${p.p}/${k}/${id}" aria-label="${esc(aria)}"><span class="chev" aria-hidden="true">›</span><span class="num">${m.fmt(v)}</span>${pct != null ? `<span class="meter" role="img" aria-label="${esc(`${word}: ranked ${rk} of ${n} ${plural}`)}"><i style="width:${Math.max(3, pct)}%"></i></span>` : ""}<small>${esc(m.label)}<br>${line}</small></a>`; }).join("");
  return tiles ? sec("Usage and efficiency", `<div class="stat3">${tiles}</div><p class="small muted" style="margin-top:8px"><span class="key tone-g2"></span>Green is better than most ${posLabel(p.p)}s, <span class="key tone-n"></span>gray is about average, <span class="key tone-b2"></span>red is worse. Tap a stat to see where he ranks. This season, ${adv.g} ${adv.g === 1 ? "game" : "games"}; early on these move a lot. EPA is expected points added per play, from nflverse.</p>`, `${adv.g} ${adv.g === 1 ? "game" : "games"}`) : "";
}

// The matchup in words, with the same meter as the lineup rows.
function matchLine(id, C, p) {
  const m = C.mu?.[id]; if (!m) return "";
  const pts = `${m.pts >= 0 ? "+" : "−"}${Math.abs(m.pts).toFixed(1)}`;
  return `<p class="matchline tone-${m.tone}">${mmHtml(m, { label: false })}<span><b>${m.word === "Neutral" ? "Neutral matchup" : `${m.word} matchup`}</b> · ${pts} points from the game and opponent${m.pct != null ? `, better than ${m.pct}% of ${posLabel(p.p)}s this week` : ""}</span></p>`;
}
