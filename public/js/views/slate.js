import { S, computed, pl } from "../state.js";
import { teamContext } from "../model.js";
import { esc, f1, sgn, kickoffText, ago, plate, emblem, isDark } from "../ui.js";
import { teamColors } from "../teams.js";
import { slateMap } from "../charts.js";
import { fold, toneBy, pulse, loading, feedError, prow, sec, noteList } from "./shared.js";
import { viewTeams, gameOdds, gameMatchups, gameTotalContext, gameVolume, gameRankNotes } from "./teams.js";

const WX_ICON = "";
function wxLine(g) {
  const bits = [];
  if (g.venue?.indoor) bits.push("Indoors");
  else if (g.forecast) bits.push(`${g.forecast.temp}°, wind ${g.forecast.wind} mph${g.forecast.pop >= 40 ? `, ${g.forecast.pop}% rain` : ""}`);
  else if (g.weather) bits.push(`${g.weather.temp != null ? g.weather.temp + "°, " : ""}${g.weather.text.toLowerCase()}`);
  return bits.join("");
}
function moveText(l) {
  if (!l || l.totalOpen == null) return "";
  const d = l.total - l.totalOpen;
  const a = Math.abs(d), amt = Number.isInteger(a) ? a : +a.toFixed(1);
  return a >= 1.5 ? `<span class="mvchip ${d < 0 ? "mv-down" : "mv-up"}" role="img" aria-label="total ${d < 0 ? "down" : "up"} ${amt} points since the line opened"><span aria-hidden="true">${d < 0 ? "▼" : "▲"}${amt}</span></span>` : "";
}

export function gameRow(g) {
  const c = g.line ? { h: g.line.total / 2 + g.line.spread / 2, a: g.line.total / 2 - g.line.spread / 2 } : null;
  const fav = g.line && g.line.spread !== 0 ? (g.line.spread > 0 ? g.home : g.away) : null;
  const spr = g.line ? (g.line.spread === 0 ? "Pick'em" : `${fav} by ${Math.abs(g.line.spread)}`) : "";
  const dk = isDark(), sa = teamColors(g.away, dk).stripe, sh = teamColors(g.home, dk).stripe;
  return `<a class="gamerow" href="#game/${esc(g.id)}">
    <div class="tug"><div class="tm">${plate(g.away)}<span>${esc(g.away)}<small>${c ? f1(c.a) : ""}</small></span></div>
      <div class="tugbar" aria-hidden="true">${c ? `<div class="tb-in"><i style="width:${(c.a / (c.a + c.h)) * 100}%;background:${sa}"></i><i style="width:${(c.h / (c.a + c.h)) * 100}%;background:${sh}"></i></div>` : ""}</div>
      <div class="tm r"><span>${esc(g.home)}<small>${c ? f1(c.h) : ""}</small></span>${plate(g.home)}</div></div>
    <div class="gmeta"><b>${esc(kickoffText(g))}</b>${g.line ? `<span class="nw">${esc(spr)}, total ${g.line.total}${moveText(g.line)}</span>` : `<span>Line not posted yet</span>`}<span>${esc(wxLine(g))}</span></div></a>`;
}

function viewGames() {
  if (!S.feed) return feedError() + loading("the schedule");
  const games = S.feed.games, priced = games.filter((g) => g.line).length;
  // In kickoff order, soonest first. Games that kick off together keep the old order (highest total first, then no-line games), and a game with no time yet goes last.
  const kick = (g) => (g.kickoff && Number.isFinite(Date.parse(g.kickoff)) ? Date.parse(g.kickoff) : Infinity);
  const ranked = [...games].sort((a, b) => kick(a) - kick(b) || (b.line ? b.line.total : -1) - (a.line ? a.line.total : -1) || String(a.id).localeCompare(String(b.id)));
  return `${feedError()}<h1 class="h1" style="margin-top:8px">Week ${S.feed.week} slate</h1>
    <p class="lede" style="margin-top:8px">Every game in kickoff order, with how many points the betting market expects and how lopsided it should be. Shootouts lift passing games. Blowouts can bury the losing side's offense. A ▲ or ▼ beside a total shows how far it has moved since the line opened.</p>
    ${pulse(S.feed)}
    <div class="sec" style="margin-top:20px"><div class="list"><div class="band"><span>By kickoff, then game total</span><span>${priced} of ${games.length} priced</span></div>${ranked.map(gameRow).join("") || `<p class="muted" style="padding:16px">No games found for this week.</p>`}</div>
      <p class="small muted" style="margin-top:8px">Each bar splits the game's expected points between the two teams, in their colors.</p></div>
    ${priced ? `<details class="mapd" style="margin-top:18px"><summary>Map view: totals against margins</summary><div style="padding-top:10px">${slateMap(games)}</div></details>` : ""}`;
}

function moveRail(label, open, now, signed = false) {
  if (open == null) return "";
  const fmt = (v) => (signed && v > 0 ? "+" + v : String(v)), d = now - open, same = Math.abs(d) < 0.5;
  const lo = Math.min(open, now) - 3, hi = Math.max(open, now) + 3, X = (v) => ((v - lo) / (hi - lo)) * 100;
  return `<div style="margin-top:14px"><div class="small"><b>${label}</b>: ${same ? `${fmt(now)}, unchanged since it opened` : `opened ${fmt(open)}, now ${fmt(now)} <span class="${d < 0 ? "mv-down" : "mv-up"}">(${sgn(d, 1)})</span>`}</div>
    <div class="linemove"><div class="rail"></div>${same ? "" : `<div class="seg2" style="left:${Math.min(X(open), X(now))}%;width:${Math.abs(X(now) - X(open))}%"></div><div class="from" style="left:${X(open)}%"></div>`}<div class="to" style="left:${X(now)}%"></div>
    ${same ? `<span class="lbl" style="left:${X(now)}%">now</span>` : `<span class="lbl" style="left:${X(open)}%">open</span><span class="lbl" style="left:${X(now)}%">now</span>`}</div></div>`;
}

export function viewGame(id) {
  if (!S.feed || !S.players) return feedError() + loading();
  const g = S.feed.games.find((x) => x.id === id);
  if (!g) return `<div class="panel empty"><h2 class="h2">Game not found</h2><p class="muted">It may belong to a different week.</p><a class="btn primary" href="#slate">Back to the slate</a></div>`;
  const C = computed(); const L = g.line;
  const ch = teamContext(g, g.home), ca = teamContext(g, g.away);
  const tot = L ? L.total : null;
  const top = (team) => Object.values(C.P.proj).filter((p) => pl(p.id)?.t === team && ["QB", "RB", "WR", "TE"].includes(pl(p.id).p) && p.mean > 0).sort((a, b) => b.mean - a.mean).slice(0, 6).map((p) => p.id);
  const ids = [...top(g.away), ...top(g.home)];
  const notes = [];
  if (L) {
    if (tot >= 49) notes.push({ t: "up", s: `Total ${tot}: one of the higher-scoring games on the board. Passing games and their pass catchers get a lift.` });
    if (tot <= 38.5) notes.push({ t: "down", s: `Total ${tot}: a low-scoring game is expected. Volume matters more than usual.` });
    if (L.totalOpen != null && Math.abs(tot - L.totalOpen) >= 1.5) notes.push({ t: tot < L.totalOpen ? "down" : "up", s: `The total has ${tot < L.totalOpen ? "dropped" : "climbed"} ${Math.abs(tot - L.totalOpen)} points since it opened. The betting market now expects ${tot < L.totalOpen ? "fewer" : "more"} points.` });
  }
  if (g.forecast?.wind >= 15) notes.push({ t: "down", s: `${g.forecast.wind} mph wind expected at kickoff. Quarterbacks have scored less in wind like this over the last five seasons.` });
  if (g.forecast?.temp <= 35) notes.push({ t: "down", s: `${g.forecast.temp}° at kickoff. Cold has cost quarterbacks a little production in past seasons.` });
  notes.push(...gameRankNotes(g));
  const done = g.status.completed;
  return `<a class="link" href="#slate" style="display:inline-block;margin:6px 0">Back to the slate</a>
    <p class="muted small" style="margin:2px 0 10px">${esc(kickoffText(g))}${g.venue?.name ? `, ${esc(g.venue.name)}` : ""}${g.tv ? `, ${esc(g.tv)}` : ""}</p>
    <div class="gh">${[[g.away, "Away", ca], [g.home, "Home", ch]].map(([ab, lab, cx]) => { const c = teamColors(ab, false); return `<div style="--tc:${c.plate};--tci:${c.plateInk}">${emblem(ab)}<small>${lab}</small><a class="ab" href="#team/${esc(ab)}" aria-label="${esc(ab)} team profile">${esc(ab)}</a><small>${done ? (ab === g.away ? g.awayScore : g.homeScore) + " final" : cx?.imp != null ? f1(cx.imp) + " expected points" : ""}</small></div>`; }).join("")}</div>
    ${L ? `<div class="stat3" style="margin-top:12px"><div><span class="num">${tot}</span><small>Total points</small></div><div><span class="num">${L.spread === 0 ? "0" : Math.abs(L.spread)}</span><small>${L.spread === 0 ? "Pick'em" : `${L.spread > 0 ? esc(g.home) : esc(g.away)} favored`}</small></div><div><span class="num">${g.venue?.indoor ? "Dome" : g.forecast ? g.forecast.wind : g.weather?.temp ?? "–"}</span><small>${g.venue?.indoor ? "No weather" : g.forecast ? "mph wind" : "degrees"}</small></div></div>` : `<p style="margin-top:14px">${done ? "Final." : "The line hasn't been posted yet."}</p>`}
    ${L ? `<p class="small muted" style="margin-top:8px">${esc(L.book)}${done && !/closing/i.test(L.book) ? ", closing line" : ""}. ${L.totalOpen != null ? "Movement since the line opened is below." : ""}</p>` : ""}
    ${gameOdds(g)}
    ${notes.length ? fold("game-notes", "What to know", noteList(notes), { badge: notes.length, headline: notes[0].s, tone: notes.some((n) => n.t === "down") ? "b1" : "g2", heading: true }) : ""}
    ${L && L.totalOpen != null ? sec("Line movement", moveRail("Total", L.totalOpen, L.total) + moveRail(`${esc(g.home)} spread`, L.spreadOpen == null ? null : -L.spreadOpen, -L.spread, true), "Sharp money moves lines") : ""}
    ${gameMatchups(g)}
    ${gameTotalContext(g)}
    ${ids.length ? sec("Fantasy players in this game", `<div class="list">${ids.map((i) => prow(i, C)).join("")}</div>`) : ""}
    ${gameVolume(g, C)}
    ${dvpSection(g)}`;
}

// How each defense has treated each position this season, against the league average (recency weighted, from nflverse), colored from the point of
// view of the player facing it: green is a soft defense (a good matchup), red a tough one. An arrow and the sign say the same without color.
function dvpSection(g) {
  const d = S.usage?.dvp; if (!d || (!d[g.home] && !d[g.away])) return "";
  const rank = {}; for (const pos of ["QB", "RB", "WR", "TE"]) { const vs = Object.entries(d).filter(([, x]) => x?.[pos] != null).sort((a, b) => a[1][pos] - b[1][pos]); vs.forEach(([t], i) => { (rank[t] ||= {})[pos] = i + 1; }); }   // 1 = holds the position down the most
  const cell = (team, pos) => cell0(team, pos).replace(/<\/td>$/, rank[team]?.[pos] ? ` <small class="muted">#${rank[team][pos]}</small></td>` : "</td>");
  const cell0 = (team, pos) => { const v = d[team]?.[pos]; if (v == null) return `<td class="tone-n">–</td>`; const t = toneBy(v, [-0.15, -0.05, 0.05, 0.15]), arrow = v >= 0.05 ? "▲" : v <= -0.05 ? "▼" : "▬";
    return `<td class="tone-${t}" data-tone="${t}" title="${v >= 0 ? "Allows" : "Holds"} ${Math.round(Math.abs(v) * 100)}% ${v >= 0 ? "more" : "less"} than the average defense"><span class="arr" aria-hidden="true">${arrow}</span> ${v >= 0 ? "+" : "−"}${Math.round(Math.abs(v) * 100)}%</td>`; };
  const rows = ["QB", "RB", "WR", "TE"].map((pos) => `<tr><th>${pos}</th>${cell(g.home, pos)}${cell(g.away, pos)}</tr>`).join("");
  return sec("Defense against each position", `<div style="overflow-x:auto"><table class="dvp"><thead><tr><th></th><th>${esc(g.home)} defense<br><small>faces ${esc(g.away)}</small></th><th>${esc(g.away)} defense<br><small>faces ${esc(g.home)}</small></th></tr></thead><tbody>${rows}</tbody></table></div>
    <p class="small muted" style="margin-top:8px"><span class="key tone-g2"></span>Soft: a good matchup for the player facing it. <span class="key tone-n"></span>Average. <span class="key tone-b2"></span>Tough. The number is the fantasy points the defense has allowed to that position compared with the league average.</p>`);
}

// Slate has two views: the week's games (as it always was) and the team rankings.
export function viewSlate() {
  const v = S.ui.slateView === "teams" ? "teams" : "games";
  const seg = `<div class="seg" role="group" aria-label="Slate view" style="margin-bottom:12px">${[["games", "Games"], ["teams", "Teams"]].map(([k, l]) => `<button data-act="slate-view" data-v="${k}" aria-pressed="${v === k}">${l}</button>`).join("")}</div>`;
  return seg + (v === "teams" ? viewTeams() : viewGames());
}
