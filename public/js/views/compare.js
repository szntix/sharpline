import { S, computed, pl } from "../state.js";
import { duel, duelRecord, xppr } from "../model.js";
import { pairCorr } from "../research.js";
import { quantile } from "../engine.js";
import { esc, f1, f0, pct, posLabel, kickoffText, plate, isDark } from "../ui.js";
import { teamColors } from "../teams.js";
import { dotplot, axisMax, mirrorRows } from "../charts.js";
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
  const u = (id) => S.usage?.players?.[id];
  const rows = [
    { label: "Projection", a: A.mean, b: B.mean },
    { label: "Bad week", a: quantile(A, 0.1), b: quantile(B, 0.1) },
    { label: "Great week", a: quantile(A, 0.9), b: quantile(B, 0.9) },
    { label: "Team points", a: A.implied, b: B.implied, fa: A.implied != null ? f1(A.implied) : "–", fb: B.implied != null ? f1(B.implied) : "–" },
    { label: "Recent avg", a: u(a)?.form, b: u(b)?.form, fa: f1(u(a)?.form), fb: f1(u(b)?.form) },
  ];
  if (pa.p !== "QB" && pb.p !== "QB") rows.push({ label: "Targets/game", a: u(a)?.tgt, b: u(b)?.tgt, fa: f1(u(a)?.tgt), fb: f1(u(b)?.tgt) }, { label: "Target share", tol: 0.005, a: u(a)?.ts, b: u(b)?.ts, fa: u(a) ? pct(u(a).ts) : "–", fb: u(b) ? pct(u(b).ts) : "–" });
  if (["RB", "QB"].includes(pa.p) || ["RB", "QB"].includes(pb.p)) rows.push({ label: "Carries/game", a: u(a)?.car, b: u(b)?.car, fa: f1(u(a)?.car), fb: f1(u(b)?.car) });
  const ea = C.ranks.exp[a], eb = C.ranks.exp[b];
  if (ea && eb) rows.push({ label: "Expert rank", a: ea, b: eb, fa: posLabel(pa.p) + ea, fb: posLabel(pb.p) + eb, lowerBetter: true });
  const fa = quantile(A, 0.1), fb = quantile(B, 0.1), ca = quantile(A, 0.9), cb = quantile(B, 0.9);
  const verdict = [`<b>Lean ${esc(short(leader[1].n))}</b>: ${Math.abs(gap).toFixed(1)} points ahead on the projection, and ${f0(leader[3] * 100)} times in 100 he outscores the other.`];
  if (leader[0] === a ? fa < fb - 1.5 : fb < fa - 1.5) verdict.push(`${esc(short((leader[0] === a ? pb : pa).n))} has the higher floor, so he's the safer pick if you're protecting a lead.`);
  if (leader[0] === a ? cb > ca + 1.5 : ca > cb + 1.5) verdict.push(`${esc(short((leader[0] === a ? pb : pa).n))} has the higher ceiling, so he's the swing if you need a big game.`);
  return `<a class="link" href="#compare" style="display:inline-block;margin:6px 0">Change players</a>
    <div class="vs-head" style="--ta:${tA.plate};--tai:${tA.plateInk};--tb:${tB.plate};--tbi:${tB.plateInk}"><div class="a"><div class="n">${esc(pa.n)}</div><div class="p">${esc(pa.t || "FA")}, ${A.opp ? `${A.game.home === pa.t ? "vs" : "at"} ${esc(A.opp)}` : "no game"}</div><div class="pr">${f1(A.mean)}</div></div>
      <div class="mid"><div><span class="num">${Math.round(pA * 100)}%</span><small>${esc(short(pa.n))} scores more</small></div></div>
      <div class="b"><div class="n">${esc(pb.n)}</div><div class="p">${esc(pb.t || "FA")}, ${B.opp ? `${B.game.home === pb.t ? "vs" : "at"} ${esc(B.opp)}` : "no game"}</div><div class="pr">${f1(B.mean)}</div></div></div>
    <div class="callout" style="margin-top:14px">${verdict.map((v) => `<p>${v}</p>`).join("")}</div>
    ${sec("If this week were played 20 times", `<div class="toolbar" style="gap:8px;margin-bottom:2px">${plate(pa.t)}<b>${esc(pa.n)}</b></div>${dotplot(A, { max, color: vA, all: true, id: "cmpA", name: pa.n })}
      <div class="toolbar" style="gap:8px;margin:12px 0 2px">${plate(pb.t)}<b>${esc(pb.n)}</b></div>${dotplot(B, { max, color: vB, all: true, id: "cmpB", name: pb.n })}
      <p class="small muted" style="margin-top:10px">Same ruler for both. The more spread out the dots, the less predictable the week.</p>`)}
    ${sec("Side by side", mirrorRows(rows, { ta: vA, tb: vB }) + `<p class="small muted" style="margin-top:10px">The solid bar wins each row. A bad week and a great week are the 1-in-10 outcomes. For expert rank, lower is better.</p>`, "Solid bar wins")}
    ${sec("How much to trust this", `<p>${recent ? `Across ${recent.n.toLocaleString()} past ${posLabel(pa.p)} pairings with a gap like this (${recent.gap[0]} to ${recent.gap[1] > 50 ? "more than 8" : recent.gap[1]} projected points), the higher-projected player scored more <b>${Math.round(recent.higher_wins * 100)}%</b> of the time.` : "Different positions can't be checked against past pairings, so this percentage uses the average of the two positions' history."} Projections narrow the odds but never settle them: even an 8-point edge loses about one time in seven.</p>
      ${rho ? `<p class="small muted" style="margin-top:8px">These two are ${A.team === B.team ? "teammates" : "opponents"}, so their scores tend to move ${rho > 0 ? "together" : "against each other"} (correlation ${rho.toFixed(2)}). That is included.</p>` : ""}`)}`;
}
