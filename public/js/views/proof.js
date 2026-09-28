import { S } from "../state.js";
import { MODEL } from "../coefs.js";
import { esc, f1, ago, posLabel } from "../ui.js";
import { proofDots } from "../charts.js";
import { pulse, sec } from "./shared.js";

const POS = ["QB", "RB", "WR", "TE"];
const YEARS = MODEL.proof.years;

function signalRows(pos) {
  const sg = MODEL.proof.signals[pos], L = MODEL.proof.labels;
  const order = Object.keys(sg).sort((a, b) => sg[b].years.filter(Boolean).length - sg[a].years.filter(Boolean).length || sg[b].avg - sg[a].avg);
  return `<div class="yrs" aria-hidden="true">${YEARS.map((y) => `<span>${y.slice(2, 4)}</span>`).join("")}</div>` + order.map((k) => {
    const s = sg[k], n = s.years.filter(Boolean).length;
    const verdict = s.kept ? `<b>Used.</b> Helped in ${n} of ${s.years.length} tests, lowering error by ${s.avg}% on average.` : `<b>Left out.</b> Helped in ${n} of ${s.years.length} tests${s.avg > 0 ? `, and only ${s.avg}% on average` : ", and on average it made forecasts worse"}.`;
    return `<div class="prow"><div><b>${esc(L[k])}</b></div>${proofDots(s.years, { labels: YEARS })}<div class="v">${verdict}</div></div>`;
  }).join("");
}

function expertBars(pos) {
  const e = MODEL.proof.experts[pos], yrs = Object.keys(e);
  const mx = Math.max(...yrs.flatMap((y) => [e[y].model, e[y].experts, e[y].blend]));
  const wins = yrs.filter((y) => e[y].blend <= Math.min(e[y].model, e[y].experts) + 0.05).length;
  return `<div class="bars3">${yrs.map((y) => `<div style="margin-top:8px"><b class="small">${y === "2026" ? "2026, weeks 1 to 3" : y}</b>
    ${[["Our model", "m", e[y].model], ["Experts", "e", e[y].experts], ["Blend", "bl", e[y].blend]].map(([l, c, v]) => `<div class="b3"><span>${l}</span><div class="t"><i class="${c}" style="width:${(v / mx) * 100}%"></i></div><b>${v.toFixed(1)}</b></div>`).join("")}</div>`).join("")}</div>
    <p class="small muted" style="margin-top:10px">Average squared miss per game, in points squared. Shorter is better. The blend matched or beat both in ${wins} of ${yrs.length} seasons for ${posLabel(pos)}s.</p>`;
}

function liveTracker() {
  const a = S.acc;
  if (!a || !a.weeks?.length) return `<p>Tracking starts with this week's games. Before each kickoff the app records exactly what it projected, and after the games it grades those saved numbers against what happened. Nothing is graded after the fact, so there's no hindsight.</p><p class="muted small" style="margin-top:8px">Check back after Monday night. Results build up week by week and appear here.</p>`;
  const rows = [["Sharpline blend", "blend"], ["Our stat model", "model"], ["Experts", "experts"], ["Sleeper", "sleeper"]].filter(([, k]) => a.bySource[k]?.ALL?.n);
  const best = Math.min(...rows.map(([, k]) => a.bySource[k].ALL.mae));
  return `<p class="muted small" style="margin-bottom:8px">${a.weeks.length} graded week${a.weeks.length > 1 ? "s" : ""} this season, saved before kickoff. Average miss per player, in fantasy points (lower is better).</p>
    <div class="bars3">${rows.map(([l, k]) => { const s = a.bySource[k].ALL; return `<div class="b3"><span>${l}</span><div class="t"><i class="${k === "experts" ? "e" : k === "model" ? "m" : "bl"}" style="width:${(s.mae / Math.max(...rows.map(([, kk]) => a.bySource[kk].ALL.mae))) * 100}%"></i></div><b>${s.mae.toFixed(2)}</b></div>`; }).join("")}</div>
    ${a.coverage80 != null ? `<p style="margin-top:12px">Our 80% ranges captured <b>${Math.round(a.coverage80 * 100)}%</b> of ${a.graded} graded player-weeks.</p>` : ""}
    <p class="small muted" style="margin-top:8px">${a.sleeperShare != null ? `Sleeper's projection counts for ${Math.round(a.sleeperShare * 100)}% of the consensus, tuned from these results.` : "Sleeper's projection currently counts for 35% of the consensus. That's a starting guess. After two graded weeks the data sets it."}</p>`;
}

export function viewProof() {
  const pos = S.ui.proofPos, P = MODEL.proof, duel = P.duel[pos];
  const seg = `<div class="seg" role="group" aria-label="Position">${POS.map((p) => `<button data-act="proof-pos" data-v="${p}" aria-pressed="${pos === p}">${p}</button>`).join("")}</div>`;
  const r2 = P.r2[pos], avg = (a) => a.reduce((t, x) => t + x, 0) / a.length;
  const maxWin = Math.max(...duel.map((d) => d.higher_wins));
  const feed = S.feed;
  return `<h1 class="h1" style="margin-top:8px">Proof</h1>
    <p class="lede" style="margin-top:8px">What's real, what's noise, and how fresh everything is. Every rule in this app was tested on past seasons, and anything that didn't hold up year after year was left out.</p>
    ${sec("Is the data current?", `${pulse(feed).replace("<details", "<details open")}<p class="small muted" style="margin-top:10px">Betting lines and injuries refresh through the week. Expert rankings are published Tuesday or Wednesday. If a source hasn't published this week's numbers, the app says so and leaves it out instead of showing last week's as if it were current.</p>`)}
    ${sec("Live record", liveTracker(), "Saved before kickoff")}
    <div class="stack" style="margin-top:34px">${seg}</div>
    ${sec(`What actually predicts ${posLabel(pos)} scores`, signalRows(pos), "Tested over 6 periods")}
    <p class="small muted" style="margin-top:8px">Each square is one test: 2021 through 2025 plus the first three weeks of 2026, predicting games the model hadn't seen. Filled means adding that signal made the forecast better.</p>
    ${sec("Experts vs. our stat model", expertBars(pos))}
    ${sec("If I pick the higher projection, how often am I right?", `<div class="curve">${duel.map((d) => `<div class="cb"><b>${Math.round(d.higher_wins * 100)}%</b><i style="height:${((d.higher_wins - 0.4) / (maxWin - 0.4)) * 100}%"></i><span>${d.gap[1] > 50 ? "8+" : d.gap[0] + " to " + d.gap[1]}</span></div>`).join("")}</div>
      <p class="small muted" style="margin-top:8px">Bars show how often the higher-projected ${posLabel(pos)} outscored the lower one, grouped by how many points apart their projections were. A gap under 1 point is close to a coin flip.</p>`)}
    ${sec("How wide the ranges should be", `<p>Our 10th-to-90th ranges should contain the real score about 80% of the time. In testing they did: <b>${Math.round(P.coverage[pos] * 100)}%</b> for ${posLabel(pos)}s.</p>`)}
    ${sec("The honest part", `<ul class="notes"><li class="warn">Predicting one game is hard. Recent form plus our model explains about ${Math.round(avg(r2.model) * 100)}% of the ups and downs in a ${posLabel(pos)}'s weekly score. The rest is luck, which is why every projection is a range.</li>
      <li class="warn">Kickers and defenses have no player-level model. Their numbers are estimates from the game line and haven't been tested.</li>
      <li class="warn">Sportsbook player props are not used. Free historical props don't exist, so they couldn't be tested, and current ones disappear or go stale before games.</li>
      <li class="warn">Kickoff wind comes from a weather forecast at the stadium, not a reading on the field, so it's approximate.</li>
      <li>Injury news that breaks after the last update can change everything. Check status close to kickoff.</li></ul>`)}`;
}
