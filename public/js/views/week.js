import { opponentIdFor, ensureOpponent, withSource, SOURCES, S, league, computed, leagueOrDefault, pname, pl } from "../state.js";
import { optimal, matchup, bestBallExpectation, lineupNotes, lateFlex } from "../engine.js";
import { shortTeamName, esc, f1, f0, pct, ago, posLabel } from "../ui.js";
import { fieldStrip } from "../charts.js";
import { fold, pulse, expertsNote, loading, feedError, prow, emptyLeague, sec, noteList } from "./shared.js";
import { SLOT_LABEL } from "../scoring.js";

const title = () => `Week ${S.feed?.week ?? S.week ?? ""}`;

export function viewWeek() {
  const L = league();
  if (!S.players || !S.feed) return feedError() + loading();
  const C = computed(L || undefined); if (!C) return loading();
  if (!L) return feedError() + welcome(C);
  if (!L.roster.length) return feedError() + `<div class="panel empty"><h2 class="h2">Add your players</h2><p class="muted" style="margin:6px 0 16px">Your roster is empty in ${esc(L.name)}.</p><a class="btn primary" href="#leagues" data-act="edit-league" data-id="${L.id}">Edit roster</a></div>`;
  const wkNow = S.feed?.week ?? S.week; ensureOpponent(L, wkNow);
  const { P } = C, oppId = opponentIdFor(L, wkNow), opp = L.others.find((o) => o.id === oppId), mkey = `m:${oppId}`;
  const m = C.cache[mkey] || (C.cache[mkey] = matchup(C.c, L, P, L.roster, opp?.roster));
  // The lineup as shown: the optimal one (with any win-chance swap), then flex slots handed to the latest games. Totals everywhere follow this lineup.
  const shownStarters = m.best.starters.map((st) => ({ ...st, id: m.alt && st.id === m.alt.swap.out ? m.alt.swap.in : st.id }));
  const shownBench = [...m.best.bench.filter((id) => !(m.alt && id === m.alt.swap.in)), ...(m.alt ? [m.alt.swap.out] : [])];
  const kick = (id) => { const k = P.proj[id]?.game?.kickoff; const ms = k ? Date.parse(k) : NaN; return Number.isFinite(ms) ? ms : null; };
  const late = lateFlex({ starters: shownStarters, bench: shownBench }, { value: (id) => P.proj[id]?.mean || 0, posOf: (id) => pl(id)?.p, kickoff: kick, status: (id) => P.proj[id]?.status || null, now: S.ui.now ?? Date.now() });
  const startIds = late.starters.map((x) => x.id).filter(Boolean);
  const notes = lineupNotes(C.c, P, startIds, m.opp?.starters.map((x) => x.id) || []);
  let hero;
  if (L.type === "bestball") {
    const bb = C.cache.bb ?? (C.cache.bb = bestBallExpectation(C.c, L, P, L.roster));
    hero = `<section class="turf"><div class="sub">${title()}</div><div class="hero-num" style="margin-top:8px">${f1(bb)}</div>
      <p style="margin-top:10px;max-width:46ch">Expected best-ball score. That is ${f1(bb - late.total)} above one fixed lineup (${f1(late.total)}), because volatile players earn extra when your best lineup counts each week.</p></section>`;
  } else if (m.win != null) {
    const w = m.alt ? m.alt.p : m.win;
    const pct = Math.round(w * 100), margin = m.me.p50 - m.them.p50, sdm = Math.hypot((m.me.p90 - m.me.p10) / 2.563, (m.them.p90 - m.them.p10) / 2.563), perPt = Math.max(1, Math.round(39.89 / sdm));
    const edge = Math.abs(margin) < 0.5 ? `Dead even, and each point is worth about ${perPt}%.` : `${Math.abs(margin).toFixed(1)} points ${margin < 0 ? "from" : "clear of"} a coin flip, and each point is worth about ${perPt}%.`;
    // when the first game starts, and whether anyone in the lineup needs a look
    const nowMs = S.ui.now ?? Date.now(), ks = startIds.map((id) => kick(id)).filter((x) => x != null), future = ks.filter((x) => x > nowMs), dayTime = (ms) => new Date(ms).toLocaleString("en-US", { weekday: "short", hour: "numeric", minute: "2-digit" }).replace(",", "");
    const done = startIds.length && startIds.every((id) => P.proj[id]?.game?.status?.completed);
    const kickTxt = future.length ? `${ks.some((x) => x <= nowMs) ? "Next kickoff" : "Kickoff"} ${dayTime(Math.min(...future))}` : done ? "All games final" : ks.length ? "Games under way" : "";
    const HURTS = new Set(["Out", "IR", "PUP", "Sus", "Doubtful", "Questionable", "NA", "COV"]), flagged = startIds.filter((id) => { const pr = P.proj[id]; return !!pr && (!!pr.noTeam || !!pr.bye || (!!pr.status && HURTS.has(pr.status))); });
    const one = flagged.length === 1 ? P.proj[flagged[0]] : null, alertTxt = flagged.length > 1 ? `${flagged.length} starters flagged` : one ? `${pname(flagged[0]).split(" ").slice(-1)[0]}: ${one.noTeam ? "No team" : one.bye ? "Bye" : one.status}` : "";
    const chips = kickTxt || alertTxt ? `<div class="wc-chips">${kickTxt ? `<span class="wchip">${esc(kickTxt)}</span>` : ""}${alertTxt ? `<button class="wchip" data-act="jump-starters"><i></i>${esc(alertTxt)}</button>` : ""}</div>` : "";
    const oppSel = `<select data-bind="opponent" aria-label="This week's opponent"><option value="">None selected</option>${L.others.map((o) => `<option value="${o.id}" ${o.id === oppId ? "selected" : ""}>vs ${esc(o.name)}</option>`).join("")}</select>`;
    hero = `<section class="turf wcard" id="wcard"><div class="wc-head"><span class="wc-wk">${title()}</span>${oppSel}</div>
      <div class="wc-g3"><div class="s"><small>You</small><span class="big">${f1(m.me.p50)}</span><em>likely ${f0(m.me.p10)} to ${f0(m.me.p90)}</em></div><div class="p"><span class="pc">${pct}<small>%</small></span><em>to win</em></div><div class="s r"><small>${esc(shortTeamName(opp.name))}</small><span class="big">${f1(m.them.p50)}</span><em>likely ${f0(m.them.p10)} to ${f0(m.them.p90)}</em></div></div>
      ${fieldStrip(w, { label: "\u00A0" })}
      <p class="wc-note">${edge}</p>${chips}</section>
      <div class="wbug" id="wbug" data-act="to-top" aria-hidden="true"><div class="bgt"><div class="bgs"><small>You</small><span class="big">${f1(m.me.p50)}</span></div><div class="bgp"><span>${pct}<small>%</small></span><em>to win</em></div><div class="bgs r"><small>${esc(shortTeamName(opp.name))}</small><span class="big">${f1(m.them.p50)}</span></div></div>${fieldStrip(w, { label: `${pct}%`, compact: true })}<div class="bgl"><span>${esc(kickTxt)}</span><span>${esc(alertTxt)}</span></div></div>`;
  } else {
    hero = `<section class="turf"><div class="sub">${title()}</div><div class="hero-num" style="margin-top:8px">${f1(late.total)}</div>
      <p style="margin-top:8px">Projected points, likely ${f0(m.me?.p10 ?? late.total * 0.82)} to ${f0(m.me?.p90 ?? late.total * 1.2)}.</p>
      <p class="sub" style="margin-top:8px">Pick this week's opponent to see your win chance, and a lineup built to win rather than just to score.</p>${weekPicker(L, false)}</section>`;
  }
  const swap = m.win != null && L.type !== "bestball" ? (m.alt
    ? fold("alert:swap", "Lineup suggestion", `Start <b>${esc(pname(m.alt.swap.in))}</b> over <b>${esc(pname(m.alt.swap.out))}</b>. It raises your win chance by ${(m.alt.swap.gain * 100).toFixed(1)} points and gives up ${f1(m.alt.swap.ptsCost)} projected points. ${m.win < 0.5 ? "As the underdog, a wider range of outcomes helps you." : "As the favorite, a steadier lineup protects your lead."}`, { headline: `Start ${pname(m.alt.swap.in)} over ${pname(m.alt.swap.out)}: +${(m.alt.swap.gain * 100).toFixed(1)} points of win chance`, tone: "b1" })
    : fold("alert:swap", "Lineup suggestion", "The highest-projected lineup is also your best chance to win. No change needed.", { headline: "No change needed", tone: "g2" })) : "";
  const starters = late.starters.map((st) => {
    const id = st.id;
    return id ? prow(id, C, { slot: st.slot, sig: true }) : `<div class="row slotted"><span class="pos neu">${esc(SLOT_LABEL[st.slot] || st.slot)}</span><div class="who muted">Empty. No eligible player.</div></div>`;
  }).join("");
  // Bench: everyone who can play, best projection first; anyone who cannot (out, IR, suspended, no team, bye, or ruled out by the report) goes to the bottom.
  const notPlaying = (id) => { const pr = P.proj[id]; return !!pr && (!!pr.noTeam || !!pr.bye || (!!pr.status && !(pr.mean > 0))); };
  const byValue = (a, b) => (P.proj[b]?.mean || 0) - (P.proj[a]?.mean || 0) || pname(a).localeCompare(pname(b));
  const benchIds = [...late.bench.filter((id) => !notPlaying(id)).sort(byValue), ...late.bench.filter(notPlaying).sort(byValue)], firstOut = benchIds.findIndex(notPlaying);
  const dayOf = (ms) => new Date(ms).toLocaleDateString("en-US", { weekday: "long" }), lastOf = (id) => pname(id).split(" ").slice(-1)[0];
  const moveText = (x) => (x.kind === "swap" ? `${lastOf(x.id)} is in ${SLOT_LABEL[x.slot] || x.slot} for his ${dayOf(x.t)} game.` : `${lastOf(x.id)} takes ${SLOT_LABEL[x.slot] || x.slot} over ${lastOf(x.out)} for his ${dayOf(x.t)} game, giving up ${x.cost.toFixed(1)} projected points.`);
  const lateNote = late.moves.length ? `<div style="margin-top:12px">${fold("alert:flex", "Flex order", `${late.moves.slice(0, 3).map((x) => esc(moveText(x))).join(" ")} A flex spot goes to your latest game, so you can still decide after earlier games. A swap for a later game only happens at a cost of ${late.tie} points or less, with no one hurt.`, { headline: moveText(late.moves[0]), tone: "g1" })}</div>` : "";
  const bench = benchIds.map((id, i) => (i === firstOut ? `<div class="bn-sep">Not playing this week</div>` : "") + prow(id, C, { sig: true, dim: true })).join("");
  return `${feedError()}${hero}${pulse(S.feed)}${expertsNote(S.feed)}<div class="stack" style="margin-top:14px">${swap}</div>
    ${notes.length ? fold("notes", "Things to know", noteList(notes), { badge: notes.length, headline: notes[0].s, tone: notes.some((n) => n.t === "down") ? "b1" : "g2" }) : ""}
    ${sourcesPanel(L, C)}
    <span id="starters"></span>${sec("Starters", `<div class="list">${starters}</div>${lateNote}`, `${f1(late.total)} projected`)}
    ${sec("Bench", `<div class="list">${bench || `<div class="row"><div></div><div class="muted">No bench players.</div></div>`}</div>`, L.sleeper ? "" : `<button class="link" data-act="edit-roster" data-id="${L.id}">Edit roster</button>`)}`;
}

function weekPicker(L, hasOpp) {
  if (L.type === "bestball") return "";
  const wk = S.feed?.week ?? S.week, oppId = opponentIdFor(L, wk), last = L.others.find((o) => o.id === L.opponent && L.oppWeek != null && L.oppWeek < wk);
  const msg = !L.others.length ? "Add other teams under Leagues to compare matchups." : oppId ? "" : L.sleeper ? (L.opps?.[wk] === "" ? "Sleeper has no matchup for you this week (a bye, or your team is out)." : "Looking up this week's opponent on Sleeper. You can also pick one below.") : last ? `Last week you played ${last.name}. Pick this week's opponent to see your chance of winning.` : "";
  return `<div style="margin-top:14px"><label class="field">This week's opponent
    <select data-bind="opponent"><option value="">None selected</option>${L.others.map((o) => `<option value="${o.id}" ${o.id === oppId ? "selected" : ""}>${esc(o.name)}</option>`).join("")}</select></label>
    ${msg ? `<p class="small sub" style="margin-top:6px">${esc(msg)}</p>` : ""}</div>`;
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

// Who each source starts. Only players the sources disagree on are listed, and the odd one out is bolded: a player only one source starts, or only one source sits.
// The same players in different slots is not a disagreement, because it changes nobody's chance to play.
export function sourceSplit(keys, startersBy) {
  const sets = Object.fromEntries(keys.map((k) => [k, new Set(startersBy[k])])), all = [...new Set(keys.flatMap((k) => [...sets[k]]))];
  return all.map((id) => { const who = keys.filter((k) => sets[k].has(id)); return { id, who, starts: who.length, lone: who.length === 1 ? who[0] : null, loneSit: who.length === keys.length - 1 ? keys.find((k) => !sets[k].has(id)) : null, has: Object.fromEntries(keys.map((k) => [k, sets[k].has(id)])) }; }).filter((r) => r.starts < keys.length);
}
function sourcesPanel(L, C) {
  const posOf = (id) => S.players[id]?.p, last = (id) => (S.players[id]?.n || "").split(" ").slice(-1)[0], keys = Object.keys(SOURCES);
  const blendMean = (id) => C.P0.proj[id]?.mean || 0;
  const lineup = Object.fromEntries(keys.map((k) => { const P = withSource(C.P0, k); return [k, optimal(L.roster, L.slots, (id) => P.proj[id]?.mean || 0, posOf)]; }));
  const split = sourceSplit(keys, Object.fromEntries(keys.map((k) => [k, lineup[k].starters.map((s) => s.id).filter(Boolean)])));
  if (!split.length) {
    const slotOnly = lineup.blend.starters.some((s, i) => keys.some((k) => lineup[k].starters[i]?.id !== s.id));
    return fold("sources", "Lineup by source", `<p class="small muted">Blended, our model, the experts and Sleeper start the same players this week${slotOnly ? ", only in different slots, which changes nobody's chance to play" : ""}.</p>`, { badge: "same" });
  }
  const odd = (r) => !!(r.lone || r.loneSit), rows = [...split].sort((a, b) => odd(b) - odd(a) || blendMean(b.id) - blendMean(a.id));
  const cost = keys.map((k) => lineup[k].starters.reduce((t, s) => t + (s.id ? blendMean(s.id) : 0), 0) - lineup.blend.starters.reduce((t, s) => t + (s.id ? blendMean(s.id) : 0), 0));
  const why = (r) => r.lone ? `Only ${SOURCES[r.lone]} starts him` : r.loneSit ? `Only ${SOURCES[r.loneSit]} sits him` : `${r.starts} of ${keys.length} start him`;
  return fold("sources", "Lineup by source", `<div style="overflow-x:auto"><table class="srct"><thead><tr><th></th>${keys.map((k) => `<th>${SOURCES[k]}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr><th${odd(r) ? ' class="odd"' : ""}>${esc(last(r.id))}<small>${esc(why(r))}</small></th>${keys.map((k) => `<td class="${odd(r) && (k === r.lone || k === r.loneSit) ? "diff" : ""}">${r.has[k] ? "Starts" : "Sits"}</td>`).join("")}</tr>`).join("")}<tr class="tot"><th>Cost</th>${cost.map((c, i) => `<td>${i === 0 ? "–" : Math.abs(c) < 0.05 ? "same" : (c > 0 ? "+" : "−") + f1(Math.abs(c))}</td>`).join("")}</tr></tbody></table></div>
    <p class="small muted" style="margin-top:10px">Only players the sources disagree on. Bold marks the odd one out. The Cost row is what each source's lineup gives up by the Blended numbers, which tested most accurate. Change the numbers used everywhere in Settings.</p>`, { badge: `${rows.length} differ` });
}
