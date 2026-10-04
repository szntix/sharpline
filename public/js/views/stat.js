import { S, league, pl } from "../state.js";
import { esc, plate, posLabel } from "../ui.js";
import { ADV, ADV_BY_POS, peerList, peerCount, rankOf, gradeOf } from "./advstats.js";
import { feedError, loading } from "./shared.js";

// Everyone at a position ranked by one efficiency stat, with the player you came from highlighted. Ranks are among all qualifying players even when the list is filtered.
export function viewStat(pos, key, id) {
  if (!S.players || !S.usage) return feedError() + loading("these rankings");
  const m = ADV[key];
  if (!m || !ADV_BY_POS[pos]?.includes(key)) return `<div class="panel empty"><h2 class="h2">Ranking not found</h2><a class="btn primary" href="#players">Back to players</a></div>`;
  const L = league(), peers = peerList(S.usage, pos, key).sort((a, b) => b.v - a.v || (S.players[a.id]?.n || "").localeCompare(S.players[b.id]?.n || "")), vals = peers.map((x) => x.v), n = peers.length;
  const notRanked = peerCount(S.usage, pos) - n, taken = new Set(L ? [...L.roster, ...(L.taken || []), ...(L.others || []).flatMap((o) => o.roster)] : []);
  const canFree = !!(L && L.others?.length), filter = S.ui.plFilter === "free" && !canFree ? "all" : S.ui.plFilter === "mine" && !L ? "all" : S.ui.plFilter;
  const keep = (x) => (filter === "free" ? !taken.has(x.id) : filter === "mine" ? L.roster.includes(x.id) : true);
  const me = id ? peers.find((x) => x.id === id) : null, who = id ? pl(id) : null, fmtRank = (v) => `${vals.filter((x) => x === v).length > 1 ? "T-" : ""}${rankOf(v, vals)}`;
  const rows = peers.filter(keep).map((x) => { const p = pl(x.id); if (!p) return ""; const g = gradeOf(x.v, vals, m.kind);
    return `<a class="statrow tone-${g.tone}${x.id === id ? " me" : ""}" href="#player/${esc(x.id)}" ${x.id === id ? "data-focus-row" : ""}><span class="rk">${fmtRank(x.v)}</span>${plate(p.t)}<span class="who"><b>${esc(p.n)}</b><small>${esc(p.t || "FA")} · ${x.g} ${x.g === 1 ? "game" : "games"}</small></span><span class="val">${m.fmt(x.v)}</span></a>`; }).join("");
  const g = me ? gradeOf(me.v, vals, m.kind) : null;
  const callout = !id ? "" : me ? `<div class="panel statme tone-${g.tone}"><b>#${fmtRank(me.v)} of ${n}</b> ${posLabel(pos)}s${who ? ` · ${esc(who.n)}` : ""}: ${m.fmt(me.v)}${g.pct != null ? ` · ${m.kind === "style" ? g.word : `<b>${g.word}</b>`}, ${m.kind === "style" ? "deeper" : "better"} than ${g.pct}% of ${posLabel(pos)}s` : ""}</div>` : `<div class="panel statme">${who ? esc(who.n) : "He"} does not have enough plays to be ranked yet.</div>`;
  const seg = L ? `<div class="seg" role="group" aria-label="Show players">${[["all", "Everyone"], ...(canFree ? [["free", "Free agents"]] : []), ["mine", "My team"]].map(([k, l]) => `<button data-act="st-filter" data-v="${k}" aria-pressed="${filter === k}">${l}</button>`).join("")}</div>` : "";
  if (id && S.ui.statFocus !== location.hash) { S.ui.statFocus = location.hash; setTimeout(() => document.querySelector("[data-focus-row]")?.scrollIntoView({ block: "center" }), 0); }
  return `<a class="link" href="${who ? "#player/" + esc(id) : "#players"}" style="display:inline-block;margin:6px 0">${who ? `Back to ${esc(who.n)}` : "Back to players"}</a>
    <h1 class="h1" style="margin-top:4px">${esc(m.label)}</h1>
    <p class="lede" style="margin-top:6px">${esc(m.help)} ${posLabel(pos)}s with enough plays so far this season: ${n}.${notRanked > 0 ? ` ${notRanked} more do not have enough plays yet and are not ranked.` : ""}</p>
    ${callout}${seg ? `<div style="margin:12px 0">${seg}</div>` : ""}
    <div class="statlist" role="list">${rows || `<p class="muted" style="padding:14px 0">No one matches this filter.</p>`}</div>
    <p class="small muted" style="margin-top:10px">${filter !== "all" ? "Ranks are among everyone with enough plays, not just this list. " : ""}Early in the season these move a lot. From nflverse.</p>`;
}
