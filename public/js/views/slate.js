import { S, computed, pl } from "../state.js";
import { teamContext } from "../model.js";
import { esc, f1, sgn, kickoffText, ago } from "../ui.js";
import { slateMap } from "../charts.js";
import { pulse, loading, feedError, prow, ribbonMax, sec, noteList } from "./shared.js";

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
  return Math.abs(d) >= 1.5 ? `<span class="${d < 0 ? "mv-down" : "mv-up"}">total ${d < 0 ? "down" : "up"} ${Math.abs(d)} since open</span>` : "";
}

export function gameRow(g) {
  const c = g.line ? { h: g.line.total / 2 + g.line.spread / 2, a: g.line.total / 2 - g.line.spread / 2 } : null;
  const fav = g.line && g.line.spread !== 0 ? (g.line.spread > 0 ? g.home : g.away) : null;
  const spr = g.line ? (g.line.spread === 0 ? "Pick'em" : `${fav} by ${Math.abs(g.line.spread)}`) : "";
  return `<a class="gamerow" href="#game/${esc(g.id)}">
    <div class="tug"><div class="tm">${esc(g.away)}<small>${c ? f1(c.a) : ""}</small></div>
      <div class="tugbar" aria-hidden="true">${c ? `<i class="a" style="width:${(c.a / (c.a + c.h)) * 100}%"></i><i class="h" style="width:${(c.h / (c.a + c.h)) * 100}%"></i>` : ""}</div>
      <div class="tm r">${esc(g.home)}<small>${c ? f1(c.h) : ""}</small></div></div>
    <div class="gmeta"><b>${esc(kickoffText(g))}</b>${g.line ? `<span>${esc(spr)}, total ${g.line.total}</span>${moveText(g.line)}` : `<span>Line not posted yet</span>`}<span>${esc(wxLine(g))}</span></div></a>`;
}

export function viewSlate() {
  if (!S.feed) return feedError() + loading("the schedule");
  const games = S.feed.games;
  const priced = games.filter((g) => g.line).length;
  return `${feedError()}<h1 class="h1" style="margin-top:8px">Week ${S.feed.week} slate</h1>
    <p class="lede" style="margin-top:8px">Every game by how many points the betting market expects and how lopsided it should be. Shootouts lift passing games. Blowouts can bury the losing side's offense.</p>
    ${pulse(S.feed)}
    ${priced ? sec("Where the points will be", slateMap(games), `${priced} of ${games.length} priced`) : ""}
    ${sec("Games", `<div class="list">${games.map(gameRow).join("") || `<p class="muted">No games found for this week.</p>`}</div>`, "Expected points for each team on the bar")}`;
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
  const max = ribbonMax(ids.map((i) => C.P.proj[i]));
  const notes = [];
  if (L) {
    if (tot >= 49) notes.push({ t: "up", s: `Total ${tot}: one of the higher-scoring games on the board. Passing games and their pass catchers get a lift.` });
    if (tot <= 38.5) notes.push({ t: "down", s: `Total ${tot}: a low-scoring game is expected. Volume matters more than usual.` });
    if (L.totalOpen != null && Math.abs(tot - L.totalOpen) >= 1.5) notes.push({ t: tot < L.totalOpen ? "down" : "up", s: `The total has ${tot < L.totalOpen ? "dropped" : "climbed"} ${Math.abs(tot - L.totalOpen)} points since it opened. The betting market now expects ${tot < L.totalOpen ? "fewer" : "more"} points.` });
  }
  if (g.forecast?.wind >= 15) notes.push({ t: "down", s: `${g.forecast.wind} mph wind expected at kickoff. Quarterbacks have scored less in wind like this over the last five seasons.` });
  if (g.forecast?.temp <= 35) notes.push({ t: "down", s: `${g.forecast.temp}° at kickoff. Cold has cost quarterbacks a little production in past seasons.` });
  const done = g.status.completed;
  return `<a class="link" href="#slate" style="display:inline-block;margin:6px 0">Back to the slate</a>
    <section class="turf"><div class="sub">${esc(kickoffText(g))}${g.venue?.name ? `, ${esc(g.venue.name)}` : ""}${g.tv ? `, ${esc(g.tv)}` : ""}</div>
      <div class="tug" style="margin-top:12px"><div class="tm" style="font-size:46px">${esc(g.away)}<small style="color:rgba(255,255,255,.8)">${done ? g.awayScore : ca?.imp != null ? f1(ca.imp) + " expected" : ""}</small></div>
      <div class="tugbar" style="height:18px;background:rgba(255,255,255,.2)">${L ? `<i style="background:#fff;opacity:.55;width:${(ca.imp / (ca.imp + ch.imp)) * 100}%"></i><i style="background:#fff;width:${(ch.imp / (ca.imp + ch.imp)) * 100}%"></i>` : ""}</div>
      <div class="tm r" style="font-size:46px">${esc(g.home)}<small style="color:rgba(255,255,255,.8)">${done ? g.homeScore : ch?.imp != null ? f1(ch.imp) + " expected" : ""}</small></div></div>
      ${L ? `<div class="stat3" style="margin-top:16px;color:var(--ink)"><div><span class="num">${tot}</span><small>Total points</small></div><div><span class="num">${L.spread === 0 ? "0" : Math.abs(L.spread)}</span><small>${L.spread === 0 ? "Pick'em" : `${L.spread > 0 ? esc(g.home) : esc(g.away)} favored`}</small></div><div><span class="num">${g.venue?.indoor ? "Dome" : g.forecast ? g.forecast.wind : g.weather?.temp ?? "–"}</span><small>${g.venue?.indoor ? "No weather" : g.forecast ? "mph wind" : "degrees"}</small></div></div>` : `<p style="margin-top:14px">${done ? "Final." : "The line hasn't been posted yet."}</p>`}</section>
    ${L ? `<p class="small muted" style="margin-top:8px">${esc(L.book)}${done ? ", closing line" : ""}. ${L.totalOpen != null ? "Movement since the line opened is below." : ""}</p>` : ""}
    ${L && L.totalOpen != null ? sec("Line movement", moveRail("Total", L.totalOpen, L.total) + moveRail(`${esc(g.home)} spread`, L.spreadOpen == null ? null : -L.spreadOpen, -L.spread, true), "Sharp money moves lines") : ""}
    ${notes.length ? sec("What to know", noteList(notes)) : ""}
    ${ids.length ? sec("Fantasy players in this game", `<div class="list">${ids.map((i) => prow(i, C, { max })).join("")}</div>`) : ""}`;
}
