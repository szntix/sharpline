import { S, league, pl } from "../state.js";
import { esc, plate, posLabel } from "../ui.js";
import { ADV, ADV_BY_POS, MIN_GAMES, peerList, unrankedList, peerCount, rankOf, rankLabel, gradeOf, gateFor, whyNot, whyShort, whySentence } from "./advstats.js";
import { feedError, loading, fold } from "./shared.js";

// Everyone at a position ranked by one efficiency stat, with the player you came from highlighted. Ranks are among all qualifying players even when the list is filtered.
export function viewStat(pos, key, id) {
  if (!S.players || !S.usage) return feedError() + loading("these rankings");
  const m = ADV[key];
  if (!m || !ADV_BY_POS[pos]?.includes(key)) return `<div class="panel empty"><h2 class="h2">Ranking not found</h2><a class="btn primary" href="#players">Back to players</a></div>`;
  const L = league(), peers = peerList(S.usage, pos, key).sort((a, b) => b.v - a.v || (S.players[a.id]?.n || "").localeCompare(S.players[b.id]?.n || "")), vals = peers.map((x) => x.v), n = peers.length;
  const notRanked = peerCount(S.usage, pos) - n, taken = new Set(L ? [...L.roster, ...(L.taken || []), ...(L.others || []).flatMap((o) => o.roster)] : []);
  const canFree = !!(L && L.others?.length), filter = S.ui.plFilter === "free" && !canFree ? "all" : S.ui.plFilter === "mine" && !L ? "all" : S.ui.plFilter;
  const keep = (x) => (filter === "free" ? !taken.has(x.id) : filter === "mine" ? L.roster.includes(x.id) : true);
  const me = id ? peers.find((x) => x.id === id) : null, who = id ? pl(id) : null, fmtRank = (v) => rankLabel(v, vals);
  const unr = unrankedList(S.usage, pos, key), lows = unr.filter(keep).sort((a, b) => b.v - a.v || (S.players[a.id]?.n || "").localeCompare(S.players[b.id]?.n || "")), lowMe = id ? unr.find((x) => x.id === id) : null, gt = gateFor(pos, key);
  const rows = peers.filter(keep).map((x) => { const p = pl(x.id); if (!p) return ""; const g = gradeOf(x.v, vals, m.kind);
    return `<a class="statrow tone-${g.tone}${x.id === id ? " me" : ""}" href="#player/${esc(x.id)}" ${x.id === id ? "data-focus-row" : ""}><span class="rk">${fmtRank(x.v)}</span>${plate(p.t)}<span class="who"><b>${esc(p.n)}</b><small>${esc(p.t || "FA")} · ${x.g} ${x.g === 1 ? "game" : "games"}</small></span><span class="val">${m.fmt(x.v)}</span></a>`; }).join("");
  const g = me ? gradeOf(me.v, vals, m.kind) : null, nm = who ? esc(who.n) : "He";
  const callout = !id ? "" : me ? `<div class="panel statme tone-${g.tone}"><b>#${fmtRank(me.v)} of ${n}</b> ${posLabel(pos)}s${who ? ` · ${nm}` : ""}: ${m.fmt(me.v)}${g.pct != null ? ` · ${m.kind === "style" ? g.word : `<b>${g.word}</b>`}` : ""}</div>`
    : lowMe ? `<div class="panel statme">${nm} ${whySentence(lowMe.why)}. His ${m.fmt(lowMe.v)} would sit #${rankOf(lowMe.v, vals)} among the ${n} ${posLabel(pos)}s ranked.</div>`
    : `<div class="panel statme">${nm} has not had enough plays for this stat yet, so he is not ranked.</div>`;
  if (lowMe && S.ui.statFocus !== location.hash) (S.ui.folds ||= {}).unranked = true;   // coming from a one-game player: open the list he is in
  const seg = L ? `<div class="seg" role="group" aria-label="Show players">${[["all", "Everyone"], ...(canFree ? [["free", "Free agents"]] : []), ["mine", "My team"]].map(([k, l]) => `<button data-act="st-filter" data-v="${k}" aria-pressed="${filter === k}">${l}</button>`).join("")}</div>` : "";
  if (id && S.ui.statFocus !== location.hash) { S.ui.statFocus = location.hash; setTimeout(() => document.querySelector("[data-focus-row]")?.scrollIntoView({ block: "center" }), 0); }
  return `<a class="link" href="${who ? "#player/" + esc(id) : "#players"}" style="display:inline-block;margin:6px 0">${who ? `Back to ${esc(who.n)}` : "Back to players"}</a>
    <h1 class="h1" style="margin-top:4px">${esc(m.label)}</h1>
    <p class="lede" style="margin-top:6px">${esc(m.help)} Ranked: ${posLabel(pos)}s with at least ${MIN_GAMES} games and ${gt.need} ${gt.label} a week, ${gt.label === "touches" ? "so a backup's few snaps do not lead the list" : "the NFL's own leaderboard minimum, so a backup's few snaps do not lead the list"}. ${n} ranked so far.${notRanked > 0 ? ` ${notRanked} more are not ranked yet (too few games, plays or volume).` : ""}</p>
    ${callout}${seg ? `<div style="margin:12px 0">${seg}</div>` : ""}
    <div class="statlist" role="list">${rows || `<p class="muted" style="padding:14px 0">No one matches this filter.</p>`}</div>
    ${lows.length ? fold("unranked", `Not ranked (too few games or too little volume)`, `<div class="statlist" role="list">${lows.map((x) => { const p = pl(x.id); return p ? `<a class="statrow low tone-n${x.id === id ? " me" : ""}" href="#player/${esc(x.id)}" ${x.id === id ? "data-focus-row" : ""}><span class="rk">–</span>${plate(p.t)}<span class="who"><b>${esc(p.n)}</b><small>${esc(p.t || "FA")} · ${esc(whyShort(x.why))}</small></span><span class="val">${m.fmt(x.v)}</span></a>` : ""; }).join("")}</div><p class="small muted" style="margin-top:8px">Too few games or too little volume to rank fairly. They are shown so you can still see them.</p>`, { badge: lows.length }) : ""}
    <p class="small muted" style="margin-top:10px">${filter !== "all" ? "Ranks are among everyone with enough plays, not just this list. " : ""}Early in the season these move a lot. From nflverse.</p>`;
}
