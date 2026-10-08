import { withSource, S, computed, pl } from "../state.js";
import { duel, duelRecord, xppr } from "../model.js";
import { pairCorr } from "../research.js";
import { quantile } from "../engine.js";
import { esc, f1, f0, pct, posLabel, kickoffText, plate, emblem, isDark } from "../ui.js";
import { teamColors } from "../teams.js";
import { dotplot, dotCaption, axisMax, mirrorRows } from "../charts.js";
import { kickerCompareRows } from "./kicker.js";
import { defenseCompareRows, defenseGate } from "./teams.js";
import { loading, feedError, sec } from "./shared.js";

function picker(a) {
  const A = a ? pl(a) : null;
  return `<a class="link" href="#players" style="display:inline-block;margin:6px 0">Back to players</a>
    <h1 class="h1">${A ? `Compare ${esc(A.n)} with…` : "Compare two players"}</h1>
    <p class="lede" style="margin:8px 0 16px">Pick ${A ? "a second" : "the first"} player. You'll see who is more likely to score more, how wide each range is, and where each one has the edge.</p>
    <div class="search"><input type="search" id="search-cmp${a ? ":" + a : ""}" data-search="cmp${a ? ":" + a : ""}" placeholder="Search players" autocomplete="off" aria-label="Search players" autofocus><ul hidden></ul></div>`;
}

export function viewCompare(a, b) {
  if (!S.players || !S.feed) return feedError() + loading();
  if (!a || !pl(a)) return picker(null);
  if (!b || !pl(b)) return picker(a);
  const C = computed(), A = C.P.proj[a], B = C.P.proj[b], pa = pl(a), pb = pl(b);
  if (!A || !B) return picker(a);
  const rho = pairCorr(pa.p, pa.t, pb.p, pb.t, C.P.oppOf);
  const pA = duel({ ...A, pos: pa.p }, { ...B, pos: pb.p }, rho), gap = A.mean - B.mean;
  const leader = pA >= 0.5 ? [a, pa, A, pA] : [b, pb, B, 1 - pA];
  const recent = pa.p === pb.p ? duelRecord(pa.p, gap) : null;
  const max = axisMax([A, B]), dk = isDark(), tA = teamColors(pa.t, false), tB = teamColors(pb.t, false), vA = teamColors(pa.t, dk).stripe, vB = teamColors(pb.t, dk).stripe;
  const short = (n) => n.split(" ").slice(-1)[0];
  const mid = (A.mean + B.mean) / 2, t0 = Math.max(5, Math.round(mid / 5) * 5), gkey = `cmp-${a}-${b}`, thr = S.ui.thr[gkey] ?? t0, opts = [...new Set([Math.max(5, t0 - 5), t0, t0 + 5, t0 + 10])];
  const u = (id) => S.usage?.players?.[id];
  const rows = [
    { label: "Projection", a: A.mean, b: B.mean },
    { label: "Bad week", a: quantile(A, 0.1), b: quantile(B, 0.1) },
    { label: "Great week", a: quantile(A, 0.9), b: quantile(B, 0.9) },
    { label: "Team points", a: A.implied, b: B.implied, fa: A.implied != null ? f1(A.implied) : "–", fb: B.implied != null ? f1(B.implied) : "–" },
    { label: "Matchup & game", a: C.mu?.[a]?.pts, b: C.mu?.[b]?.pts, fa: C.mu?.[a] ? `${C.mu[a].pts >= 0 ? "+" : "−"}${Math.abs(C.mu[a].pts).toFixed(1)}` : "–", fb: C.mu?.[b] ? `${C.mu[b].pts >= 0 ? "+" : "−"}${Math.abs(C.mu[b].pts).toFixed(1)}` : "–", tol: 0.05 },
    { label: "Recent avg", a: u(a)?.form, b: u(b)?.form, fa: f1(u(a)?.form), fb: f1(u(b)?.form) },
  ];
  if (pa.p !== "QB" && pb.p !== "QB") rows.push({ label: "Targets/game", a: u(a)?.tgt, b: u(b)?.tgt, fa: f1(u(a)?.tgt), fb: f1(u(b)?.tgt) }, { label: "Target share", tol: 0.005, a: u(a)?.ts, b: u(b)?.ts, fa: u(a) ? pct(u(a).ts) : "–", fb: u(b) ? pct(u(b).ts) : "–" });
  if (["RB", "QB"].includes(pa.p) || ["RB", "QB"].includes(pb.p)) rows.push({ label: "Carries/game", a: u(a)?.car, b: u(b)?.car, fa: f1(u(a)?.car), fb: f1(u(b)?.car) });
  if (pa.p === "K" && pb.p === "K") rows.push(...kickerCompareRows(a, pa, b, pb));
  if (pa.p === "DEF" && pb.p === "DEF") rows.push(...defenseCompareRows(pa.t, pb.t));
  const ea = C.ranks.exp[a], eb = C.ranks.exp[b];
  const xad = (id) => u(id)?.adv, xpct = (v) => (v * 100).toFixed(1) + "%", xsg = (d) => (v) => (v >= 0 ? "+" : "") + v.toFixed(d);
  const XADV = [["epaDb", "EPA/dropback", xsg(2)], ["cpoe", "CPOE", xsg(1)], ["rushEpa", "EPA/carry", xsg(2)], ["recEpa", "EPA/target", xsg(2)], ["wopr", "WOPR", (v) => v.toFixed(2)], ["ays", "Air yards share", xpct], ["adot", "Depth of target", (v) => v.toFixed(1)], ["yac", "YAC/catch", (v) => v.toFixed(1)], ["catchRate", "Catch rate", xpct]];
  for (const [k, label, fmt] of XADV) if (xad(a)?.[k] != null && xad(b)?.[k] != null) rows.push({ label, a: xad(a)[k], b: xad(b)[k], fa: fmt(xad(a)[k]), fb: fmt(xad(b)[k]), tol: 0.0005, adv: k });
  if (ea && eb) rows.push({ label: "Expert rank", a: ea, b: eb, fa: posLabel(pa.p) + ea, fb: posLabel(pb.p) + eb, lowerBetter: true });
  const fa = quantile(A, 0.1), fb = quantile(B, 0.1), ca = quantile(A, 0.9), cb = quantile(B, 0.9);
  const verdict = [`<b>Lean ${esc(short(leader[1].n))}</b>: ${Math.abs(gap) < 0.05 ? "level on the projection, and" : `${Math.abs(gap).toFixed(1)} points ahead on the projection, and`} ${f0(leader[3] * 100)} times in 100 he outscores the other.`];
  if (leader[0] === a ? fa < fb - 1.5 : fb < fa - 1.5) verdict.push(`${esc(short((leader[0] === a ? pb : pa).n))} has the higher floor, so he's the safer pick if you're protecting a lead.`);
  if (leader[0] === a ? cb > ca + 1.5 : ca > cb + 1.5) verdict.push(`${esc(short((leader[0] === a ? pb : pa).n))} has the higher ceiling, so he's the swing if you need a big game.`);
  // Background, only when there is something to say. Our stat model's two reasons the players differ, and whether the independent sources agree.
  if (A.parts && B.parts && A.base != null && B.base != null) {
    const form = (A.base + A.parts.usage) * (A.lscale || 1) - (B.base + B.parts.usage) * (B.lscale || 1), env = (C.mu?.[a]?.pts ?? NaN) - (C.mu?.[b]?.pts ?? NaN), nm2 = (v) => esc(short((v > 0 ? pa : pb).n));
    if (isFinite(env) && (Math.abs(form) >= 0.5 || Math.abs(env) >= 0.5)) verdict.push(`Our stat model: ${Math.abs(form) < 0.5 ? "recent form and workload are even" : `recent form and workload favor ${nm2(form)} by ${Math.abs(form).toFixed(1)}`}; ${Math.abs(env) < 0.5 ? "the matchup and game are even" : `the matchup and game favor ${nm2(env)} by ${Math.abs(env).toFixed(1)}`}.`);
  }
  { const want = [["model", "Our model"], ["experts", "The experts"], ["sleeper", "Sleeper"]], votes = [];
    for (const [k, label] of want) { const P = withSource(C.P0, k), x = P.proj[a], y = P.proj[b]; if (!x || !y || x.srcMissing || y.srcMissing || Math.abs(x.mean - y.mean) < 0.05) continue; votes.push([label, x.mean > y.mean ? a : b]); }
    if (votes.length >= 2) { const forA = votes.filter(([, w]) => w === a).map(([l]) => l), forB = votes.filter(([, w]) => w === b).map(([l]) => l), list = (xs) => (xs.length > 1 ? `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}` : xs[0]);
      const verb = (xs) => (xs.length > 1 || xs[0] === "The experts" ? "favor" : "favors"), lc = (s) => s.replace(/^The /, "the "), all = votes.map(([l]) => l);
      verdict.push(forA.length && forB.length ? `${list(forA)} ${verb(forA)} ${esc(short(pa.n))}; ${lc(list(forB))} ${verb(forB)} ${esc(short(pb.n))}.` : `${votes.length === 3 ? "All three sources" : list(all)} ${votes.length === 3 ? "favor" : verb(all)} ${esc(short((forA.length ? pa : pb).n))}.`); } }
  // Only stats that mean something for the positions being compared (a row must apply to both).
  const BASE = ["Projection", "Bad week", "Great week", "Team points", "Matchup & game", "Recent avg", "Expert rank"], REL = { QB: [...BASE, "Carries/game", "EPA/dropback", "CPOE", "EPA/carry"], RB: [...BASE, "Carries/game", "Targets/game", "Target share", "EPA/carry", "EPA/target", "Catch rate"], WR: [...BASE, "Targets/game", "Target share", "WOPR", "Air yards share", "Depth of target", "YAC/catch", "EPA/target", "Catch rate"], TE: [...BASE, "Targets/game", "Target share", "WOPR", "Air yards share", "Depth of target", "YAC/catch", "EPA/target", "Catch rate"], K: [...BASE, "Fantasy pts/game", "Kicks tried/game", "FG accuracy", "Longest"], DEF: [...BASE, "Fantasy pts/game", "Last 3 games", "Sacks/game", "Takeaways/game", "Points allowed/game"] }; REL.TE = REL.WR;
  rows.splice(0, rows.length, ...rows.filter((r) => (REL[pa.p] || BASE).includes(r.label) && (REL[pb.p] || BASE).includes(r.label) && !(r.label === "Matchup & game" && (r.a == null || r.b == null)) && !(r.a == null && r.b == null)));
  // Each bar is measured against this week's best at the position(s) being compared, with a tick for a typical starter (the last starter league-wide).
  const xpool = Object.keys(C.P.proj).filter((id) => [pa.p, pb.p].includes(pl(id)?.p) && C.P.proj[id].mean > 0);
  const xk = Math.max(1, (S.profile?.leagues?.find((l) => l.id === S.profile.active)?.teams || 12) * (["RB", "WR"].includes(pa.p) ? 2 : 1));
  const xmetric = { "Projection": (id) => C.P.proj[id].mean, "Bad week": (id) => quantile(C.P.proj[id], 0.1), "Great week": (id) => quantile(C.P.proj[id], 0.9), "Team points": (id) => C.P.proj[id].implied, "Recent avg": (id) => u(id)?.form,
    "Matchup & game": (id) => C.mu?.[id]?.pts, "Targets/game": (id) => u(id)?.tgt, "Target share": (id) => u(id)?.ts, "Carries/game": (id) => u(id)?.car, "Expert rank": (id) => C.ranks.exp[id] };
  for (const r of rows) {
    const f = r.adv ? (id) => (u(id)?.adv?.g >= 2 ? u(id).adv[r.adv] : null) : xmetric[r.label]; if (!f) continue;
    const vals = xpool.map(f).filter((v) => typeof v === "number" && isFinite(v)).sort((x, y) => y - x); if (vals.length < 3) continue;
    if (r.lowerBetter) { r.n = Math.max(vals.length, r.a, r.b); r.ref = Math.min(xk, r.n); r.max = 1; }
    else { r.max = Math.max(vals[0], r.a ?? -Infinity, r.b ?? -Infinity); r.min = Math.min(0, vals[vals.length - 1], r.a ?? 0, r.b ?? 0); r.ref = vals[Math.min(vals.length - 1, xk - 1)]; }
  }
  return `<a class="link" href="#compare" style="display:inline-block;margin:6px 0">Change players</a>
    <div class="vs-head" style="--ta:${tA.plate};--tai:${tA.plateInk};--tb:${tB.plate};--tbi:${tB.plateInk}"><div class="a">${emblem(pa.t)}<div class="n">${esc(pa.n)}</div><div class="p">${esc(pa.t || "FA")}, ${A.opp ? `${A.game.home === pa.t ? "vs" : "at"} ${esc(A.opp)}` : "no game"}</div><div class="pr">${f1(A.mean)}</div></div>
      <div class="mid"><div><span class="num">${Math.round(leader[3] * 100)}%</span><small>${esc(short(leader[1].n))} scores more</small></div></div>
      <div class="b">${emblem(pb.t)}<div class="n">${esc(pb.n)}</div><div class="p">${esc(pb.t || "FA")}, ${B.opp ? `${B.game.home === pb.t ? "vs" : "at"} ${esc(B.opp)}` : "no game"}</div><div class="pr">${f1(B.mean)}</div></div></div>
    <div class="callout" style="margin-top:14px">${verdict.map((v) => `<p>${v}</p>`).join("")}</div>
    ${sec("If this week were played 20 times", `<p class="small muted" style="margin-bottom:8px">Pick a score, or drag the line on either plot. Filled dots reach it.</p>
      <div class="thresholds" data-for="cmpA" role="group" aria-label="Score to reach">${opts.map((t) => `<button data-thr="${t}" aria-pressed="${t === thr}">${t}+</button>`).join("")}</div>
      <div class="toolbar" style="gap:8px;margin:14px 0 2px">${plate(pa.t, { mono: true })}<b>${esc(pa.n)}</b></div>${dotplot(A, { max, color: vA, threshold: thr, id: "cmpA", name: pa.n, group: gkey, who: short(pa.n) })}
      <div class="cap" id="cmpA-cap">${dotCaption(A, thr, short(pa.n))}</div>
      <div class="toolbar" style="gap:8px;margin:16px 0 2px">${plate(pb.t, { mono: true })}<b>${esc(pb.n)}</b></div>${dotplot(B, { max, color: vB, threshold: thr, id: "cmpB", name: pb.n, group: gkey, who: short(pb.n) })}
      <div class="cap" id="cmpB-cap">${dotCaption(B, thr, short(pb.n))}</div>
      <p class="small muted" style="margin-top:10px">Same ruler and the same line for both. The more spread out the dots, the less predictable the week.</p>`)}
    ${pa.p === "DEF" || pb.p === "DEF" ? defenseGate() : ""}${sec("Side by side", mirrorRows(rows, { ta: vA, tb: vB }) + `<p class="small muted" style="margin-top:10px">Each bar is measured against this week's best at the position: a full bar is the leader. The tick marks a typical starter (the last one in a league your size). The solid bar is the better of the two. A bad week and a great week are the 1-in-10 outcomes; for expert rank, lower is better.</p>`, "Solid bar wins")}
    ${sec("How much to trust this", `<p>${recent ? `Across ${recent.n.toLocaleString()} past ${posLabel(pa.p)} pairings with a gap like this (${recent.gap[0]} to ${recent.gap[1] > 50 ? "more than 8" : recent.gap[1]} projected points), the higher-projected player scored more <b>${Math.round(recent.higher_wins * 100)}%</b> of the time.` : "Different positions can't be checked against past pairings, so this percentage uses the average of the two positions' history."} Projections narrow the odds but never settle them: even an 8-point edge loses about one time in seven.</p>
      ${rho ? `<p class="small muted" style="margin-top:8px">These two are ${A.team === B.team ? "teammates" : "opponents"}, so their scores tend to move ${rho > 0 ? "together" : "against each other"} (correlation ${rho.toFixed(2)}). That is included.</p>` : ""}`)}`;
}
