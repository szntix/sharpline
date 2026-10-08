import { S, computed, league, pl, pname, leagueOrDefault, render } from "../state.js";
import { waivers, tradeValue, evaluateTrade, tradeReport, tradeBoardAsync, focusedTrades, optimal, heat, lineupOf, isFreeAgentId, freeAgentPos } from "../engine.js";
import { xppr } from "../model.js";
import { SLOT_ELIG, SLOT_LABEL, positionsFor, inPosition } from "../scoring.js";
import { esc, f1, f0, sgn, posLabel, posClass, plate, teamStripe } from "../ui.js";
import { luck } from "../charts.js";
import { viewStreaming } from "./streaming.js";
import { toneBy, loading, feedError, prow, emptyLeague, sec, syncLine, fold } from "./shared.js";

// A player's position as a colored chip, so a name is never just text.
const posTag = (id) => { const p = S.players[id]; return p ? `<span class="pos ${posClass(p.p)}">${esc(posLabel(p.p))}</span>` : ""; };

// What a team looks like after a trade: the same lineup optimizer that scores the trade, applied to the roster before and after.
// Values are each player's average points per game for the rest of the season, the same measure behind the verdict.
function tradePreview(L, C, give, get, partner) {
  const R = C.R, repl = C.repl, val = (id) => (isFreeAgentId(id) ? repl[freeAgentPos(id)] : R[id]?.per || 0), posOf = (id) => S.players[id]?.p;
  const view = S.ui.trView === "them" && partner ? "them" : "me";
  const known = (ids) => ids.filter((id) => S.players[id]);      // an id the player table does not know cannot be drawn, so it is left out of the counts too
  const base = known(view === "me" ? L.roster : partner.roster), out = known(view === "me" ? give : get), inn = known(view === "me" ? get : give);
  const after = [...base.filter((id) => !out.includes(id)), ...inn.filter((id) => !base.includes(id))];
  const B = lineupOf(base, L, C.c, R, repl), A = lineupOf(after, L, C.c, R, repl);   // the same lineups the verdict is built from: an open slot is filled by the best free agent
  const wasStart = new Set(B.starters.map((s) => s.id).filter(Boolean)), slotOf = (id) => B.starters.find((s) => s.id === id)?.slot;
  const tag = (kind, text) => `<span class="tag ${kind}"><i></i>${esc(text)}</span>`, last = (id) => pname(id).split(" ").slice(-1)[0];
  const row = (id, { lead, slot = null, tags = "", note = "", dim = false }) => { const p = S.players[id]; if (!p) return "";
    return `<div class="row slotted pv${dim ? " dim" : ""}" data-go="player/${id}" style="--team:${teamStripe(p.t)}"><span class="pos ${slot ? posClass(SLOT_ELIG[slot]?.length > 1 ? p.p : slot) : "neu"}">${esc(lead)}</span>
      <div class="who"><span class="name"><span class="nm">${esc(p.n)}</span>${slot && (slot === p.p || SLOT_ELIG[slot]?.length > 1) ? "" : posTag(id)}</span><span class="sub"><span class="meta">${esc(note || p.t || "FA")}</span>${tags ? `<span class="tags">${tags}</span>` : ""}</span></div>
      <div class="proj"><span class="num">${val(id) > 0 ? f1(val(id)) : "–"}</span><small>per game</small></div></div>`; };
  const starters = A.starters.map((s, i) => {
    const lead = SLOT_LABEL[s.slot] || s.slot;
    if (!s.id) return `<div class="row slotted pv"><span class="pos neu">${esc(lead)}</span><div class="who"><span class="name muted">Empty slot</span></div></div>`;
    if (isFreeAgentId(s.id)) return `<div class="row slotted pv"><span class="pos ${posClass(s.slot)}">${esc(lead)}</span><div class="who"><span class="name muted">Free agent</span><span class="sub"><span class="meta">Best on waivers</span></span></div><div class="proj"><span class="num">${f1(s.v)}</span><small>per game</small></div></div>`;
    const was = B.starters[i]?.id; let tags = "", note = "";
    if (inn.includes(s.id)) { tags = tag("up", "New"); if (was && was !== s.id) note = isFreeAgentId(was) ? "Replaces a free agent" : out.includes(was) ? `Replaces ${last(was)}` : `Takes ${last(was)}'s spot`; }
    else if (!wasStart.has(s.id)) { tags = tag("up", "Moves up"); note = "From the bench"; }
    return row(s.id, { lead, slot: s.slot, tags, note });
  }).join("");
  const bench = [...A.bench].sort((a, b) => val(b) - val(a)).map((id) => {
    if (inn.includes(id)) {
      const ahead = A.starters.filter((s) => s.id && !isFreeAgentId(s.id) && SLOT_ELIG[s.slot]?.includes(posOf(id))).sort((a, b) => a.v - b.v)[0];
      return row(id, { lead: "BN", tags: tag("up", "New"), note: ahead ? `Behind ${last(ahead.id)} by ${f1(ahead.v - val(id))}` : "No open spot" });
    }
    return row(id, { lead: "BN", tags: wasStart.has(id) ? tag("warn", "Moves to bench") : "" });
  }).join("");
  const leaving = out.map((id) => row(id, { lead: slotOf(id) ? SLOT_LABEL[slotOf(id)] || slotOf(id) : "BN", slot: slotOf(id) || null, tags: tag("down", "Leaving"), note: slotOf(id) ? "Was starting" : "Was on the bench", dim: true })).join("");
  const who = view === "me" ? "Your" : `${partner.name}'s`, diff = A.total - B.total;
  const toggle = partner ? `<div class="seg" role="group" aria-label="Whose roster" style="margin-bottom:12px">${[["me", "Your team"], ["them", partner.name]].map(([k, l]) => `<button data-act="tr-view" data-v="${k}" aria-pressed="${view === k}">${esc(l)}</button>`).join("")}</div>` : "";
  return sec(`${who} roster after the trade`, `${toggle}<div class="list"><div class="band"><span>Starters</span><span>${f1(B.total)} to ${f1(A.total)} (${sgn(diff)}) a game</span></div>${starters}
    <div class="band"><span>Bench</span><span>${A.bench.length} ${A.bench.length === 1 ? "player" : "players"}</span></div>${bench || `<p class="muted small" style="padding:12px 16px">No one on the bench.</p>`}
    <div class="band"><span>Leaving</span><span>${out.length}</span></div>${leaving}</div>
    <p class="small muted" style="margin-top:10px">Average points a game for the rest of the season, the same measure behind the verdict above. Lineup slots are filled the best way available, and an open slot is filled by the best free agent.</p>`);
}

function unavailableSet(L) { const s = new Set([...L.roster, ...(L.taken || [])]); for (const o of L.others) for (const id of o.roster) s.add(id); return s; }

export function viewMoves() {
  if (!S.players || !S.feed) return feedError() + loading();
  const tab = S.ui.moves, L = league();
  const seg = `<div class="seg" role="group" aria-label="Section">${[["waivers", "Waivers"], ["trades", "Trades"], ["stream", "Streaming"], ["regress", "Hot and cold"]].map(([k, l]) => `<button data-act="moves-tab" data-v="${k}" aria-pressed="${tab === k}">${l}</button>`).join("")}</div>`;
  const body = tab === "regress" ? viewRegress() : !L ? emptyLeague() : tab === "trades" ? viewTrades(L) : tab === "stream" ? viewStreaming(L) : viewWaivers(L);
  return `${feedError()}<div class="stack"><h1 class="h1" style="margin-top:8px">Moves</h1>${seg}${body}</div>`;
}

function viewWaivers(L) {
  const C = computed(L), { P, R } = C;
  const W = C.cache.w || (C.cache.w = waivers(C.c, L, P, R, L.roster, unavailableSet(L)));
  if (!positionsFor(L.slots).includes(S.ui.wvPos)) S.ui.wvPos = "ALL";
  const mode = S.ui.wvMode, pos = S.ui.wvPos, manual = !L.sleeper;
  const positions = positionsFor(L.slots);
  const rows = W.rows.filter((r) => inPosition(pl(r.id)?.p, pos)).sort((a, b) => (mode === "week" ? b.weekGain - a.weekGain || b.proj - a.proj : b.rosGain - a.rosGain || b.per - a.per)).slice(0, 40);
  const lede = `<div><p class="lede">Ranked by how much each free agent would add to your starting lineup. ${manual ? "Mark players other teams already have so they drop off this list." : "Rostered players are removed using your Sleeper league."}</p>${syncLine(L, "margin-top:6px")}</div>`;
  const segBar = (label, opts, cur, act, cls = () => "") => `<div class="seg" role="group" aria-label="${label}">${opts.map(([k, l]) => `<button data-act="${act}" data-v="${k}" class="${cls(k)}" aria-pressed="${cur === k}">${l}</button>`).join("")}</div>`;
  const POSCLS = { QB: "qb", RB: "rb", WR: "wr", TE: "te", K: "k", DEF: "dst" };
  const btns = (id) => `<button class="btn sm" data-act="add-mine" data-id="${id}">Add to my team</button>${manual ? `<button class="btn sm" data-act="take" data-id="${id}">Taken</button>` : ""}`;
  // Trending adds: what other managers did in the last 24 hours (Sleeper's list, already loaded at start). It describes the crowd, it does not predict; the number on each row is ours.
  const out = unavailableSet(L), tr = Object.entries(S.trending || {}).filter(([id, n]) => n > 0 && pl(id) && !L.roster.includes(id) && !out.has(id) && inPosition(pl(id).p, pos)).sort((x, y) => y[1] - x[1]).slice(0, 8);
  const trend = tr.length ? fold("wv-trend", "Trending adds", `<div class="list">${tr.map(([id, n]) => prow(id, C, { gain: `${n.toLocaleString()} adds`, act: btns(id) })).join("")}</div><p class="small muted" style="margin-top:8px">The players most added across Sleeper leagues in the last 24 hours who are not on a roster in yours. That is what other managers are doing, not a projection: the number on the right is ours.</p>`, { badge: tr.length, headline: `Most added: ${pname(tr[0][0])} (${tr[0][1].toLocaleString()})`, heading: true }) : "";

  // the gain is a short number in the action row; the horizon bar above says whether it is the rest of the season or this week
  const gainOf = (r) => mode === "week" ? (r.weekGain > 0.05 ? `${sgn(r.weekGain)} pts` : "no gain") : (r.rosGain > 0.5 ? `${sgn(r.rosGain, 0)} pts` : "no gain");
  return `${lede}${segBar("Horizon", [["ros", "Rest of season"], ["week", "This week"]], mode, "wv-mode")}${segBar("Position", positions.map((p) => [p, p === "ALL" ? "ALL" : posLabel(p)]), pos, "wv-pos", (k) => POSCLS[k] || "")}${W.drop ? `<div class="callout">If you need a roster spot, <b>${esc(pname(W.drop))}</b> costs you the least to drop.</div>` : ""}${trend}
    <div class="list">${rows.map((r) => prow(r.id, C, { gain: gainOf(r), act: btns(r.id) })).join("") || `<p class="muted" style="padding:20px 16px">No free agents at this position improve your lineup.</p>`}</div>`;
}

// An empty list should say why. A suggestion has to help BOTH lineups, so it needs a position where you hold more than your lineup uses
// and the other team is short; these counts show where each possible swap fell out.
// The board is found one team at a time so the screen stays responsive; it is kept with the computed data and drawn when it finishes.
function boardFor(C, L) {
  if (!C.cache.board) {
    C.cache.board = { pending: true };
    tradeBoardAsync(C.c, L, C.R, C.repl, L.roster, L.others).then((b) => { C.cache.board = b; if (computed(L) === C && S.route.name === "moves") render(); }).catch(() => { C.cache.board = { ideas: [], stats: { teams: 0, packages: 0, found: 0 } }; });
  }
  return C.cache.board;
}

function whyNoIdeas(rep, board = null) {
  const s = rep.stats, line = (label, n) => (n ? `<dt>${label}</dt><dd>${n}</dd>` : "");
  const lead = !s.mine ? "None of your players are worth more than a free agent at his position, so there is nothing to offer." : !s.pairs ? "Nobody on the other teams is worth more than a free agent at his position, so there is nothing to ask for." : `Checked ${s.pairs} one-for-one swaps across ${s.teams} ${s.teams === 1 ? "team" : "teams"}. Where they fell out:`;
  return `<div class="panel"><div class="verdict">No deal found that helps both lineups</div><p class="small muted" style="margin:8px 0">${esc(lead)}${board?.stats?.packages ? ` Also checked ${board.stats.packages.toLocaleString()} packages of up to two players each way.` : ""}</p>${s.pairs ? `<dl class="kv">${line("Same position", s.samePos)}${line("Would not improve your lineup", s.noGainYou)}${line("Improve yours, not theirs", s.noGainThem)}${line("Too lopsided in value", s.lopsided)}</dl>` : ""}
    <p class="small muted" style="margin-top:10px">Suggestions come from surplus: a position where you hold more than your lineup uses. If you expected some, check that the rosters above are current, or build an offer yourself.</p></div>`;
}
const KIND_LABEL = { swap: "Swap", consolidate: "Two for one", depth: "One for two", package: "Two for two" };
const lastName = (id) => pname(id).split(" ").slice(-1)[0];
const ideaTags = (t, H) => [...(t.fills ? [["flat", "Fills a weak spot"]] : []), ...(H ? [...t.give.filter((id) => H.hotIds.has(id)).map((id) => ["up", `Sell-high: ${lastName(id)}`]), ...t.get.filter((id) => H.coldIds.has(id)).map((id) => ["up", `Buy-low: ${lastName(id)}`])] : [])].slice(0, 3);
const ideaRow = (t, L, { near = false, heat: H = null } = {}) => `<div class="row trade"><span class="plate swap" aria-hidden="true"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8h13l-3.5-3.5M20 16H7l3.5 3.5"/></svg></span>
      <div class="who"><span class="name"><b class="lbl">Give</b>${t.give.map((id) => `${posTag(id)}<span class="nm">${esc(pname(id))}</span>`).join("")}</span><span class="name"><b class="lbl">Get</b>${t.get.map((id) => `${posTag(id)}<span class="nm">${esc(pname(id))}</span>`).join("")}</span><span class="sub"><span class="meta">With ${esc(t.team)}${t.board ? ` · ${KIND_LABEL[t.kind]}` : `${t.kind && t.kind !== "swap" ? ` · ${KIND_LABEL[t.kind]}` : ""}${t.why ? ` · ${esc(t.why)}` : ""}`}</span></span>${t.board ? `<span class="sub"><span class="meta">${esc(t.why)}</span></span>` : ""}${ideaTags(t, H).length ? `<span class="sub"><span class="tags">${ideaTags(t, H).map(([k, x]) => `<span class="tag ${k}"><i></i>${esc(x)}</span>`).join("")}</span></span>` : ""}</div>
      <div class="proj"><span class="num tone-${toneBy(t.lineupGain, [-12, -3, 3, 12])}">${sgn(t.lineupGain, 0)}</span><small>for you</small></div><div class="act"><button class="btn sm" data-act="tr-load" data-give="${t.give.join(",")}" data-get="${t.get.join(",")}" data-team="${esc(L.others.find((o) => o.name === t.team)?.id || "")}">Review</button>${near ? `<span class="tag ${t.theirLineupGain < -0.5 ? "down" : "flat"}"><i></i>${t.theirLineupGain < -0.5 ? `they lose ${f0(-t.theirLineupGain)}` : "they break even"}</span>` : `<span class="tag ${t.theirLineupGain > 0 ? "up" : "flat"}"><i></i>they gain ${sgn(t.theirLineupGain, 0)}</span>`}</div></div>`;

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
  // A zero means "no better than a free agent at his position" (depth), which is different from having no projection at all.
  const tvLabel = (id) => (!R[id] ? "no projection" : tv(id) > 0 ? f0(tv(id)) : "depth");
  const ageBit = (id) => ((L.type === "dynasty" || L.type === "keeper") && S.players[id]?.a ? `, ${Math.floor(S.players[id].a)}` : "");
  const chips = (ids, side) => ids.map((id) => `<span class="chip">${posTag(id)}${esc(pname(id))} <span class="muted small">${ageBit(id) ? `age ${Math.floor(S.players[id].a)} · ` : ""}${tvLabel(id)}</span><button aria-label="Remove ${esc(pname(id))}" data-act="tr-rm" data-side="${side}" data-id="${id}">×</button></span>`).join("");
  const myOpts = L.roster.filter((id) => !give.includes(id)).sort((a, b) => tv(b) - tv(a)).map((id) => `<option value="${id}">${esc(posLabel(S.players[id]?.p))} · ${esc(pname(id))}${ageBit(id)} (${tvLabel(id)})</option>`).join("");
  const theirOpts = partner ? partner.roster.filter((id) => !get.includes(id)).sort((a, b) => tv(b) - tv(a)).map((id) => `<option value="${id}">${esc(posLabel(S.players[id]?.p))} · ${esc(pname(id))}${ageBit(id)} (${tvLabel(id)})</option>`).join("") : "";
  // When only one side of the calculator is filled, the suggestions follow that player.
  const focus = L.others.length && (give.length ? !get.length : get.length) ? { side: give.length ? "give" : "get", ids: give.length ? give : get } : null;
  const short = (id) => pname(id).split(" ").slice(-1)[0], fRows = focus ? focusedTrades(c, L, R, repl, focus.side, focus.ids, L.others) : [];
  const freeAgent = focus?.side === "get" && focus.ids.every((id) => !L.others.some((o) => o.roster.includes(id)));
  const focusHtml = !focus ? "" : sec(focus.side === "get" ? `Ways to get ${esc(focus.ids.map(short).join(" and "))}` : `What ${esc(focus.ids.map(short).join(" and "))} could bring back`,
    freeAgent ? `<div class="panel muted">${esc(focus.ids.map(pname).join(", "))} is not on another team in your league, so you can add him without a trade.</div>`
    : fRows.length ? `<p class="small muted" style="margin-bottom:10px">Swaps that are close in value, or that help both teams. Review loads one above.</p><div class="list">${fRows.map((t) => ideaRow(t, L, { near: !(t.theirLineupGain > 0.5), heat: heat(S.usage, S.players) })).join("")}</div>` : `<div class="panel muted">No realistic one-for-one swap: none of the right players is close in value, and none helps both teams. Try adding a second player to either side.</div>`);
  const pitchCap = () => Math.max(0, Math.min(3, 6 - ideas.length));
  const rep = L.others.length ? (C.cache.report || (C.cache.report = tradeReport(c, L, R, repl, L.roster, L.others))) : null, board = L.others.length && !focus ? boardFor(C, L) : null, ideas = board && !board.pending ? board.ideas : [], H = heat(S.usage, S.players);
  const pitches = rep ? rep.near.slice(0, pitchCap()) : [];
  const preview = give.length && get.length ? tradePreview(L, C, give, get, partner) : "";
  return `${syncLine(L)}<label class="field" style="max-width:340px">Trading with<select data-bind="partner"><option value="">Anyone (search all players)</option>${L.others.map((o) => `<option value="${o.id}" ${o.id === S.ui.partner ? "selected" : ""}>${esc(o.name)}</option>`).join("")}</select></label>
    <div class="trade-cols"><div class="panel"><h3 class="h2">You give</h3><div class="chips" style="margin:10px 0">${chips(give, "give")}</div><select data-bind="tr-give" aria-label="Add a player you give"><option value="">Add from your roster…</option>${myOpts}</select></div>
      <div class="panel"><h3 class="h2">You get</h3><div class="chips" style="margin:10px 0">${chips(get, "get")}</div>${partner ? `<select data-bind="tr-get" aria-label="Add a player you get"><option value="">Add from ${esc(partner.name)}…</option>${theirOpts}</select>` : `<div class="search"><input type="search" id="search-get" data-search="get" placeholder="Search any player" autocomplete="off"><ul hidden></ul></div>`}</div></div>${result}${preview}
    ${focusHtml}
    ${focus ? "" : !L.others.length ? sec("Trade ideas", `<div class="panel"><div class="verdict">Trade ideas need the other teams</div><p class="small muted" style="margin:8px 0 12px">Suggestions compare your roster with each team in your league, so there is nothing to suggest until they are added. You can still build an offer yourself above.</p>${L.sleeper ? `<p class="small muted">Refresh rosters above to pull them from Sleeper.</p>` : `<button class="btn sm" data-act="edit-teams" data-id="${L.id}">Add other teams</button>`}</div>`) : ""}${!focus && L.others.length ? sec("Trade ideas", ideas.length ? `<div class="list">${ideas.map((t) => ideaRow(t, L, { heat: H })).join("")}</div>` : board?.pending ? `<div class="panel muted small" role="status">Checking swaps and packages of up to two players each way…</div>` : whyNoIdeas(rep, board)) : ""}
    ${!focus && L.others.length && pitches.length && ideas.length < 3 ? sec("Worth a pitch", `<p class="small muted" style="margin-bottom:10px">Close in value and a real gain for you, and they would barely notice the cost. Fewer than three win-win deals exist, so these are the best of the rest.</p><div class="list">${pitches.map((t) => ideaRow(t, L, { near: true })).join("")}</div>`, "Helps you, not them") : ""}`;
}

// Points that run ahead of workload tend to fade, and the reverse. Workload predicted next-game scoring better than recent points in every test season for RB, WR and TE.
function viewRegress() {
  const { rows, hot, cold } = heat(S.usage, S.players);
  const max = Math.ceil(Math.max(...rows.map((r) => Math.max(r.u.form, r.x))) / 5) * 5 || 25;
  const line = (r) => `<div class="row rowlink" data-go="player/${r.id}">${plate(S.players[r.id].t)}<div class="who"><span class="name"><span class="nm">${esc(pname(r.id))}</span><span class="pos ${posClass(r.u.p)}">${posLabel(r.u.p)}</span></span><span class="sub"><span class="meta">Scoring ${f1(r.u.form)}, workload ${f1(r.x)}</span></span></div>
    <div class="proj"><span class="num">${sgn(r.gap)}</span><small>a game</small></div><div class="act" style="padding-top:2px">${luck(r.u.form, r.x, max)}</div></div>`;
  return `<p class="lede">Some players score more than their workload usually earns, on touchdowns and long plays that are hard to repeat. Others do the opposite. In our five-season test, adding a player's workload to his recent scoring improved next-game forecasts for backs, receivers and tight ends in every test.</p>
    <div class="legend" style="margin:12px 0 0"><span><i class="l-ring"></i>What the workload earns</span><span><i class="l-hot"></i>Scoring above it, likely to fade</span><span><i class="l-us"></i>Scoring below it, likely to rise</span></div>
    ${sec("Running hot", `<div class="list">${hot.map(line).join("")}</div>`, "Sell candidates")}${sec("Running cold", `<div class="list">${cold.map(line).join("")}</div>`, "Buy candidates")}`;
}
