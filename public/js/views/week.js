import { withSource, SOURCES, S, league, computed, leagueOrDefault, pname, pl } from "../state.js";
import { optimal, matchup, bestBallExpectation, lineupNotes } from "../engine.js";
import { esc, f1, f0, pct, ago, posLabel } from "../ui.js";
import { drive } from "../charts.js";
import { pulse, expertsNote, loading, feedError, prow, emptyLeague, sec, noteList } from "./shared.js";
import { SLOT_LABEL } from "../scoring.js";

const title = () => `Week ${S.feed?.week ?? S.week ?? ""}`;

export function viewWeek() {
  const L = league();
  if (!S.players || !S.feed) return feedError() + loading();
  const C = computed(L || undefined); if (!C) return loading();
  if (!L) return feedError() + welcome(C);
  if (!L.roster.length) return feedError() + `<div class="panel empty"><h2 class="h2">Add your players</h2><p class="muted" style="margin:6px 0 16px">Your roster is empty in ${esc(L.name)}.</p><a class="btn primary" href="#leagues" data-act="edit-league" data-id="${L.id}">Edit roster</a></div>`;
  const { P } = C, opp = L.others.find((o) => o.id === L.opponent), mkey = `m:${L.opponent}`;
  const m = C.cache[mkey] || (C.cache[mkey] = matchup(C.c, L, P, L.roster, opp?.roster));
  const startIds = m.alt ? m.alt.ids : m.best.starters.map((x) => x.id);
  const notes = lineupNotes(C.c, P, startIds, m.opp?.starters.map((x) => x.id) || []);
  let hero;
  if (L.type === "bestball") {
    const bb = C.cache.bb ?? (C.cache.bb = bestBallExpectation(C.c, L, P, L.roster));
    hero = `<section class="turf"><div class="sub">${title()}</div><div class="hero-num" style="margin-top:8px">${f1(bb)}</div>
      <p style="margin-top:10px;max-width:46ch">Expected best-ball score. That is ${f1(bb - m.best.total)} above one fixed lineup (${f1(m.best.total)}), because volatile players earn extra when your best lineup counts each week.</p></section>`;
  } else if (m.win != null) {
    const w = m.alt ? m.alt.p : m.win;
    hero = `<section class="turf"><div class="sub" style="font-weight:700">${title()} · vs ${esc(opp.name)}</div><div class="hero-num" style="margin-top:6px">${Math.round(w * 100)}<small>%</small></div>
      <div style="font-weight:700;font-size:16px;margin:6px 0 12px">chance to beat ${esc(opp.name)}</div>
      ${drive(w, { you: "You", foe: opp.name })}
      <div class="hero-2"><div><b>${f1(m.me.p50)}</b>You, likely ${f0(m.me.p10)} to ${f0(m.me.p90)}</div><div><b>${f1(m.them.p50)}</b>${esc(opp.name)}, likely ${f0(m.them.p10)} to ${f0(m.them.p90)}</div></div>
      ${weekPicker(L, true)}</section>`;
  } else {
    hero = `<section class="turf"><div class="sub">${title()}</div><div class="hero-num" style="margin-top:8px">${f1(m.best.total)}</div>
      <p style="margin-top:8px">Projected points, likely ${f0(m.me?.p10 ?? m.best.total * 0.82)} to ${f0(m.me?.p90 ?? m.best.total * 1.2)}.</p>
      <p class="sub" style="margin-top:8px">Pick this week's opponent to see your win chance, and a lineup built to win rather than just to score.</p>${weekPicker(L, false)}</section>`;
  }
  const swap = m.win != null && L.type !== "bestball" ? (m.alt
    ? `<div class="callout">Start <b>${esc(pname(m.alt.swap.in))}</b> over <b>${esc(pname(m.alt.swap.out))}</b>. It raises your win chance by ${(m.alt.swap.gain * 100).toFixed(1)} points and gives up ${f1(m.alt.swap.ptsCost)} projected points. ${m.win < 0.5 ? "As the underdog, a wider range of outcomes helps you." : "As the favorite, a steadier lineup protects your lead."}</div>`
    : `<div class="callout">The highest-projected lineup is also your best chance to win. No change needed.</div>`) : "";
  const starters = m.best.starters.map((st) => {
    const id = m.alt && st.id === m.alt.swap.out ? m.alt.swap.in : st.id;
    return id ? prow(id, C, { slot: st.slot, sig: true }) : `<div class="row slotted"><span class="pos neu">${esc(SLOT_LABEL[st.slot] || st.slot)}</span><div class="who muted">Empty. No eligible player.</div></div>`;
  }).join("");
  const benchIds = [...m.best.bench.filter((id) => !(m.alt && id === m.alt.swap.in)), ...(m.alt ? [m.alt.swap.out] : [])].sort((a, b) => (P.proj[b]?.mean || 0) - (P.proj[a]?.mean || 0));
  const bench = benchIds.map((id) => prow(id, C, { sig: true, dim: true })).join("");
  return `${feedError()}${hero}${pulse(S.feed)}${expertsNote(S.feed)}<div class="stack" style="margin-top:14px">${swap}</div>
    ${notes.length ? sec("Things to know", noteList(notes)) : ""}
    ${sourcesPanel(L, C)}
    ${sec("Starters", `<div class="list">${starters}</div>`, `${f1(m.best.total)} projected`)}
    ${sec("Bench", `<div class="list">${bench || `<div class="row"><div></div><div class="muted">No bench players.</div></div>`}</div>`, L.sleeper ? "" : `<button class="link" data-act="edit-roster" data-id="${L.id}">Edit roster</button>`)}`;
}

function weekPicker(L, hasOpp) {
  if (L.type === "bestball") return "";
  return `<div style="margin-top:14px"><label class="field">This week's opponent
    <select data-bind="opponent"><option value="">None selected</option>${L.others.map((o) => `<option value="${o.id}" ${o.id === L.opponent ? "selected" : ""}>${esc(o.name)}</option>`).join("")}</select></label>
    ${!L.others.length ? `<p class="small sub" style="margin-top:6px">Add other teams under Leagues to compare matchups.</p>` : ""}</div>`;
}

// Before a league exists, the app is still useful: this week's best plays at each position.
function welcome(C) {
  const feed = S.feed, top = (pos, n) => Object.values(C.P.proj).filter((p) => pl(p.id)?.p === pos && p.mean > 0).sort((a, b) => b.mean - a.mean).slice(0, n).map((p) => p.id);
  const ids = ["QB", "RB", "WR", "TE"].flatMap((p) => top(p, 3));
  const nGames = feed.games.length, priced = feed.games.filter((g) => g.line).length;
  return `<section class="turf"><div class="sub">${title()}</div><div style="font-stretch:72%;font-weight:850;font-size:38px;line-height:1;margin:4px 0 10px">The week at a glance</div>
      <p style="max-width:46ch">${nGames} games, ${priced} with betting lines. Add your league to get start/sit advice, waiver targets and trade ideas in your scoring.</p>
      <div class="toolbar" style="margin-top:14px"><a class="btn solid" href="#leagues" data-act="imp-start">Import from Sleeper</a><a class="btn" href="#leagues" data-act="new-league">Enter manually</a></div></section>
    ${pulse(feed)}${expertsNote(feed)}${sec("Best plays this week", `<div class="list">${ids.map((id) => prow(id, C)).join("")}</div>`)}`;
}

// Every source's best lineup side by side, only where they disagree, and what each alternative gives up by the tested (Blended) numbers.
function sourcesPanel(L, C) {
  const posOf = (id) => S.players[id]?.p, last = (id) => (S.players[id]?.n || "").split(" ").slice(-1)[0], keys = Object.keys(SOURCES);
  const blendMean = (id) => C.P0.proj[id]?.mean || 0;
  const lineup = Object.fromEntries(keys.map((k) => { const P = withSource(C.P0, k); return [k, optimal(L.roster, L.slots, (id) => P.proj[id]?.mean || 0, posOf)]; }));
  const rows = lineup.blend.starters.map((s, i) => ({ slot: s.slot, cells: keys.map((k) => lineup[k].starters[i]?.id || null) })).filter((r) => r.cells.some((c) => c !== r.cells[0]));
  if (!rows.length) return sec("Lineup by source", `<p class="small muted">Blended, our model, the experts and Sleeper all start the same lineup this week.</p>`);
  const cost = keys.map((k) => lineup[k].starters.reduce((t, s) => t + (s.id ? blendMean(s.id) : 0), 0) - lineup.blend.starters.reduce((t, s) => t + (s.id ? blendMean(s.id) : 0), 0));
  return sec("Lineup by source", `<div style="overflow-x:auto"><table class="srct"><thead><tr><th></th>${keys.map((k) => `<th>${SOURCES[k]}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr><th>${esc(SLOT_LABEL[r.slot] || r.slot)}</th>${r.cells.map((c, i) => `<td class="${i && c !== r.cells[0] ? "diff" : ""}">${c ? esc(last(c)) : "–"}</td>`).join("")}</tr>`).join("")}<tr class="tot"><th>Cost</th>${cost.map((c, i) => `<td>${i ? (Math.abs(c) < 0.05 ? "same" : (c > 0 ? "+" : "−") + Math.abs(c).toFixed(1)) : "–"}</td>`).join("")}</tr></tbody></table></div><p class="small muted" style="margin-top:8px">Only slots where the sources disagree. The Cost row is what each source's lineup gives up by the Blended numbers, which tested most accurate. Change the numbers used everywhere in Settings.</p>`);
}
