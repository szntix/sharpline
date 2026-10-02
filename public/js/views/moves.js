import { S, computed, league, pl, pname, leagueOrDefault } from "../state.js";
import { waivers, tradeValue, evaluateTrade, tradeIdeas } from "../engine.js";
import { xppr } from "../model.js";
import { SLOT_ELIG, positionsFor, inPosition } from "../scoring.js";
import { esc, f1, f0, sgn, posLabel, posClass } from "../ui.js";
import { luck } from "../charts.js";
import { loading, feedError, prow, emptyLeague, sec, syncLine } from "./shared.js";

function unavailableSet(L) { const s = new Set([...L.roster, ...(L.taken || [])]); for (const o of L.others) for (const id of o.roster) s.add(id); return s; }

export function viewMoves() {
  if (!S.players || !S.feed) return feedError() + loading();
  const tab = S.ui.moves, L = league();
  const seg = `<div class="seg" role="group" aria-label="Section" style="margin:10px 0 14px">${[["waivers", "Waivers"], ["trades", "Trades"], ["regress", "Hot and cold"]].map(([k, l]) => `<button data-act="moves-tab" data-v="${k}" aria-pressed="${tab === k}">${l}</button>`).join("")}</div>`;
  const body = tab === "regress" ? viewRegress() : !L ? emptyLeague() : tab === "trades" ? viewTrades(L) : viewWaivers(L);
  return `${feedError()}<h1 class="h1" style="margin-top:8px">Moves</h1>${seg}${L && tab !== "regress" ? syncLine(L) : ""}${body}`;
}

function viewWaivers(L) {
  const C = computed(L), { P, R } = C;
  const W = C.cache.w || (C.cache.w = waivers(C.c, L, P, R, L.roster, unavailableSet(L)));
  if (!positionsFor(L.slots).includes(S.ui.wvPos)) S.ui.wvPos = "ALL";
  const mode = S.ui.wvMode, pos = S.ui.wvPos, manual = !L.sleeper;
  const positions = positionsFor(L.slots);
  const rows = W.rows.filter((r) => inPosition(pl(r.id)?.p, pos)).sort((a, b) => (mode === "week" ? b.weekGain - a.weekGain || b.proj - a.proj : b.rosGain - a.rosGain || b.per - a.per)).slice(0, 40);
  return `<p class="lede">Ranked by how much each free agent would add to your starting lineup. ${manual ? "Mark players other teams already have so they drop off this list." : "Rostered players are removed using your Sleeper league."}</p>
    <div class="stack" style="margin-top:12px"><div class="toolbar"><div class="seg" role="group" aria-label="Horizon">${[["ros", "Rest of season"], ["week", "This week"]].map(([k, l]) => `<button data-act="wv-mode" data-v="${k}" aria-pressed="${mode === k}">${l}</button>`).join("")}</div>
      <div class="seg" role="group" aria-label="Position">${positions.map((p) => `<button data-act="wv-pos" data-v="${p}" class="${{ QB: "qb", RB: "rb", WR: "wr", TE: "te", FLEX: "flex", K: "k", DEF: "dst" }[p] || ""}" aria-pressed="${pos === p}">${p === "ALL" ? "All" : p === "FLEX" ? "Flex" : posLabel(p)}</button>`).join("")}</div></div>
      ${W.drop ? `<div class="callout">If you need a roster spot, <b>${esc(pname(W.drop))}</b> costs you the least to drop.</div>` : ""}</div>
    <div class="list" style="margin-top:8px">${rows.map((r) => prow(r.id, C, { sig: true, extra: `, ${mode === "week" ? (r.weekGain > 0.05 ? sgn(r.weekGain) + " to your lineup" : "no lineup gain") : (r.rosGain > 0.5 ? sgn(r.rosGain, 0) + " season pts" : "no lineup gain")}`,
      act: `<button class="btn sm" data-act="add-mine" data-id="${r.id}">Add to my team</button>${manual ? `<button class="btn sm" data-act="take" data-id="${r.id}">Taken</button>` : ""}` })).join("") || `<p class="muted" style="padding:20px 0">No free agents at this position improve your lineup.</p>`}</div>`;
}

function viewTrades(L) {
  const C = computed(L), { P, R, repl } = C, c = C.c;
  const tv = (id) => tradeValue(id, c, L, R, repl);
  const partner = L.others.find((o) => o.id === S.ui.partner);
  const give = S.ui.give.filter((id) => L.roster.includes(id)), get = S.ui.get;
  let result = "";
  if (give.length && get.length) {
    const ev = evaluateTrade(c, L, R, repl, L.roster, give, get, partner?.roster || null);
    const dv = ev.getValue - ev.giveValue, lg = ev.lineupGain;
    const verdict = lg > 2 && dv >= -5 ? "Good for you" : lg > 2 ? "Helps your lineup, costs long-term value" : lg <= 2 && dv > 5 ? "Value win, no lineup upgrade" : "Pass";
    result = `<div class="panel"><div class="verdict">${verdict}</div><dl class="kv" style="margin-top:10px">
      <dt>Value you give</dt><dd>${f0(ev.giveValue)}</dd><dt>Value you get</dt><dd>${f0(ev.getValue)}</dd>
      <dt>Your lineup, rest of season</dt><dd class="${lg >= 0 ? "pos-r" : "neg-r"}">${sgn(lg, 0)} pts</dd>
      ${ev.theirLineupGain != null ? `<dt>${esc(partner.name)}'s lineup</dt><dd>${sgn(ev.theirLineupGain, 0)} pts</dd>` : ""}</dl>
      <p class="small muted" style="margin-top:10px">Value is points above a replacement-level player in your league over the remaining ${ev.weeks} weeks${L.playoffWeight ? ", with playoff weeks counting 1.5×" : ""}${L.type === "dynasty" ? ", plus 3 future seasons adjusted for age" : L.type === "keeper" ? ", plus part of next season" : ""}.</p>
      ${ev.theirLineupGain != null && ev.theirLineupGain > 0 && lg > 0 ? `<div class="callout" style="margin-top:10px">Both lineups improve, so this one has a real chance of being accepted.</div>` : ""}</div>`;
  }
  const chips = (ids, side) => ids.map((id) => `<span class="chip">${esc(pname(id))} <span class="muted small">${f0(tv(id))}</span><button aria-label="Remove ${esc(pname(id))}" data-act="tr-rm" data-side="${side}" data-id="${id}">×</button></span>`).join("");
  const myOpts = L.roster.filter((id) => !give.includes(id)).sort((a, b) => tv(b) - tv(a)).map((id) => `<option value="${id}">${esc(pname(id))} (${f0(tv(id))})</option>`).join("");
  const theirOpts = partner ? partner.roster.filter((id) => !get.includes(id)).sort((a, b) => tv(b) - tv(a)).map((id) => `<option value="${id}">${esc(pname(id))} (${f0(tv(id))})</option>`).join("") : "";
  const ideas = L.others.length ? (C.cache.ideas || (C.cache.ideas = tradeIdeas(c, L, R, repl, L.roster, L.others))) : [];
  return `<div class="stack"><label class="field" style="max-width:340px">Trading with<select data-bind="partner"><option value="">Anyone (search all players)</option>${L.others.map((o) => `<option value="${o.id}" ${o.id === S.ui.partner ? "selected" : ""}>${esc(o.name)}</option>`).join("")}</select></label>
    <div class="trade-cols"><div class="panel"><h3 class="h2">You give</h3><div class="chips" style="margin:10px 0">${chips(give, "give")}</div><select data-bind="tr-give" aria-label="Add a player you give"><option value="">Add from your roster…</option>${myOpts}</select></div>
      <div class="panel"><h3 class="h2">You get</h3><div class="chips" style="margin:10px 0">${chips(get, "get")}</div>${partner ? `<select data-bind="tr-get" aria-label="Add a player you get"><option value="">Add from ${esc(partner.name)}…</option>${theirOpts}</select>` : `<div class="search"><input type="search" id="search-get" data-search="get" placeholder="Search any player" autocomplete="off"><ul hidden></ul></div>`}</div></div>${result}</div>
    ${L.others.length ? sec("Trade ideas", ideas.length ? `<div class="list">${ideas.map((t) => `<div class="row slotted"><span class="pos neu">↔</span><div class="who"><span class="name">Give ${esc(t.give.map(pname).join(", "))}, get ${esc(t.get.map(pname).join(", "))}</span><span class="meta">With ${esc(t.team)}. Your lineup ${sgn(t.lineupGain, 0)}, theirs ${sgn(t.theirLineupGain, 0)} over the season.</span></div>
      <div class="proj"><span class="num">${sgn(t.lineupGain, 0)}</span><small>for you</small></div><div class="act"><button class="btn sm" data-act="tr-load" data-give="${t.give.join(",")}" data-get="${t.get.join(",")}" data-team="${esc(L.others.find((o) => o.name === t.team)?.id || "")}">Review</button></div></div>`).join("")}</div>` : `<div class="panel muted">No one-for-one deal found that improves both lineups at similar value. Try building an offer above.</div>`) : ""}`;
}

// Points that run ahead of workload tend to fade, and the reverse. Workload predicted next-game scoring better than recent points in every test season for RB, WR and TE.
function viewRegress() {
  const rows = [];
  for (const [id, u] of Object.entries(S.usage?.players || {})) {
    if (!["RB", "WR", "TE"].includes(u.p) || u.g < 3 || u.form < 6 || !S.players[id]?.t) continue;
    const x = xppr(u.p, u.tgt, u.car); if (x == null) continue;
    rows.push({ id, u, x, gap: u.form - x });
  }
  const hot = rows.sort((a, b) => b.gap - a.gap).slice(0, 8), cold = [...rows].sort((a, b) => a.gap - b.gap).slice(0, 8);
  const max = Math.ceil(Math.max(...rows.map((r) => Math.max(r.u.form, r.x))) / 5) * 5 || 25;
  const line = (r) => `<div class="row rowlink slotted" data-go="player/${r.id}"><span class="pos ${posClass(r.u.p)}">${posLabel(r.u.p)}</span><div class="who"><span class="name">${esc(pname(r.id))}</span><span class="meta">${esc(S.players[r.id].t)}, scoring ${f1(r.u.form)} on a workload worth ${f1(r.x)}</span></div>
    <div class="proj"><span class="num">${sgn(r.gap)}</span><small>a game</small></div><span style="grid-column:2/-1">${luck(r.u.form, r.x, max)}</span></div>`;
  return `<p class="lede">Some players score more than their workload usually earns, on touchdowns and long plays that are hard to repeat. Others do the opposite. In our five-season test, adding a player's workload to his recent scoring improved next-game forecasts for backs, receivers and tight ends in every test.</p>
    <div class="legend" style="margin:12px 0 0"><span><i class="l-ring"></i>What the workload earns</span><span><i class="l-hot"></i>Scoring above it, likely to fade</span><span><i class="l-us"></i>Scoring below it, likely to rise</span></div>
    ${sec("Running hot", `<div class="list">${hot.map(line).join("")}</div>`, "Sell candidates")}${sec("Running cold", `<div class="list">${cold.map(line).join("")}</div>`, "Buy candidates")}`;
}
