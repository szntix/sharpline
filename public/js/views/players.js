import { S, computed, league, leagueOrDefault, pl } from "../state.js";
import { esc, posLabel } from "../ui.js";
import { loading, feedError, prow, ribbonMax, pulse, expertsNote } from "./shared.js";

const POSITIONS = ["ALL", "QB", "RB", "WR", "TE", "K", "DEF"];

export function viewPlayers() {
  if (!S.players || !S.feed) return feedError() + loading("players");
  const C = computed(), L = league(), P = C.P;
  const { plPos, plSort, plQ, plFilter } = S.ui;
  const taken = new Set(L ? [...L.roster, ...(L.taken || []), ...L.others.flatMap((o) => o.roster)] : []);
  let ids = Object.keys(P.proj).filter((id) => {
    const p = pl(id), pr = P.proj[id]; if (!p || !pr) return false;
    if (plPos !== "ALL" && p.p !== plPos) return false;
    if (!(pr.mean > 0 || pr.status || plPos === p.p)) return false;      // on the K and DEF tabs everyone shows, so an empty tab never hides why
    if (plQ && !`${p.n} ${p.t || ""}`.toLowerCase().includes(plQ.toLowerCase())) return false;
    if (L && plFilter === "mine" && !L.roster.includes(id)) return false;
    if (L && plFilter === "free" && taken.has(id)) return false;
    return true;
  });
  const key = { proj: (id) => -P.proj[id].mean, experts: (id) => C.ranks.exp[id] ? C.ranks.exp[id] + (pl(id).p === "QB" ? 0 : 0) : 999, gap: (id) => -((P.proj[id].model ?? P.proj[id].mean) - (P.proj[id].experts ?? P.proj[id].mean)) }[plSort];
  ids.sort((a, b) => key(a) - key(b) || P.proj[b].mean - P.proj[a].mean);
  const shown = ids.slice(0, 40 * S.ui.plMore), max = ribbonMax(shown.slice(0, 40).map((id) => P.proj[id]));
  const kdef = plPos === "K" || plPos === "DEF", word = plPos === "K" ? "kickers" : "defenses";
  const have = kdef ? Object.values(S.players).filter((x) => x.p === plPos).length : 0, priced = kdef ? ids.filter((id) => P.proj[id].mean > 0).length : 0;
  const kdefNote = !kdef ? "" : !have ? `<p class="lede" style="margin-top:10px">The player list has no ${word}. The page at /api/diag shows where they drop out.</p>`
    : !priced ? `<p class="lede" style="margin-top:10px">None of these ${word} has a projection yet. A game line has to be posted first, and this league's scoring must include ${word === "kickers" ? "kicker" : "defense"} rules.</p>` : "";
  const seg = (name, cur, opts, act) => `<div class="seg" role="group" aria-label="${name}">${opts.map(([v, l]) => `<button data-act="${act}" data-v="${v}" aria-pressed="${cur === v}">${l}</button>`).join("")}</div>`;
  const pick = S.ui.pick;
  return `${feedError()}<h1 class="h1" style="margin-top:8px">Players</h1>
    <p class="lede" style="margin-top:8px">Week ${S.feed.week} projections in ${L ? esc(L.name) : "standard PPR"} scoring. Tap a player for the full picture, or select two to compare.</p>${pulse(S.feed)}${expertsNote(S.feed)}
    <div class="stack" style="margin-top:14px">
      <input type="search" id="pl-q" placeholder="Search players or teams" value="${esc(plQ)}" aria-label="Search players" autocomplete="off">
      <div class="toolbar">${seg("Position", plPos, POSITIONS.map((p) => [p, p === "ALL" ? "All" : posLabel(p)]), "pl-pos")}</div>
      <div class="toolbar">${seg("Sort", plSort, [["proj", "Best projection"], ["experts", "Expert rank"], ["gap", "We like more"]], "pl-sort")}
        ${L ? seg("Show", plFilter, [["all", "Everyone"], ["free", "Free agents"], ["mine", "My team"]], "pl-filter") : ""}</div></div>
    ${kdefNote}<div class="list" style="margin-top:8px">${shown.map((id) => prow(id, C, { max, pick: true })).join("") || `<p class="muted" style="padding:20px 0">No players match.</p>`}</div>
    ${ids.length > shown.length ? `<div style="text-align:center;margin-top:12px"><button class="btn" data-act="pl-more">Show more</button></div>` : ""}
    ${pick.length ? `<div class="floatbar"><span>${pick.length === 1 ? `${esc(S.players[pick[0]].n)} selected. Pick one more.` : `Compare ${esc(S.players[pick[0]].n)} and ${esc(S.players[pick[1]].n)}`}</span>${pick.length === 2 ? `<button class="btn" data-act="cmp-go">Compare</button>` : `<button class="btn" data-act="cmp-clear">Clear</button>`}</div>` : ""}`;
}
