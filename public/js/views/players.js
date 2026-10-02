import { S, computed, league, leagueOrDefault, pl } from "../state.js";
import { esc, posLabel } from "../ui.js";
import { loading, feedError, prow, pulse, expertsNote } from "./shared.js";
import { positionsFor, usablePositions, inPosition } from "../scoring.js";

export function viewPlayers() {
  if (!S.players || !S.feed) return feedError() + loading("players");
  const C = computed(), L = league(), P = C.P;
  const slots = leagueOrDefault().slots, avail = positionsFor(slots), usable = usablePositions(slots);
  if (!avail.includes(S.ui.plPos)) S.ui.plPos = "ALL";      // the league changed and the chosen tab no longer applies
  const { plPos, plSort, plQ, plFilter } = S.ui;
  const taken = new Set(L ? [...L.roster, ...(L.taken || []), ...L.others.flatMap((o) => o.roster)] : []);
  let ids = Object.keys(P.proj).filter((id) => {
    const p = pl(id), pr = P.proj[id]; if (!p || !pr) return false;
    if (!inPosition(p.p, plPos)) return false;
    if (plPos === "ALL" && !usable.has(p.p)) return false;      // positions this league does not start are left out of All
    if (!(pr.mean > 0 || pr.status || plPos === p.p)) return false;      // on the K and DEF tabs everyone shows, so an empty tab never hides why
    if (plQ && !`${p.n} ${p.t || ""}`.toLowerCase().includes(plQ.toLowerCase())) return false;
    if (L && plFilter === "mine" && !L.roster.includes(id)) return false;
    if (L && plFilter === "free" && taken.has(id)) return false;
    return true;
  });
  const key = { proj: (id) => -P.proj[id].mean, experts: (id) => C.ranks.exp[id] ? C.ranks.exp[id] + (pl(id).p === "QB" ? 0 : 0) : 999, gap: (id) => -((P.proj[id].model ?? P.proj[id].mean) - (P.proj[id].experts ?? P.proj[id].mean)) }[plSort];
  ids.sort((a, b) => key(a) - key(b) || P.proj[b].mean - P.proj[a].mean);
  const shown = ids.slice(0, 40 * S.ui.plMore);
  const kdef = plPos === "K" || plPos === "DEF", word = plPos === "K" ? "kickers" : "defenses";
  const have = kdef ? Object.values(S.players).filter((x) => x.p === plPos).length : 0, priced = kdef ? ids.filter((id) => P.proj[id].mean > 0).length : 0;
  const kdefNote = !kdef ? "" : !have ? `<p class="lede" style="margin-top:10px">The player list has no ${word}. The page at /api/diag shows where they drop out.</p>`
    : !priced ? `<p class="lede" style="margin-top:10px">None of these ${word} has a projection yet. A game line has to be posted first, and this league's scoring must include ${word === "kickers" ? "kicker" : "defense"} rules.</p>` : "";
  const POSCLS = { QB: "qb", RB: "rb", WR: "wr", TE: "te", FLEX: "flex", K: "k", DEF: "dst" };
  const seg = (name, cur, opts, act, cls = () => "") => `<div class="seg" role="group" aria-label="${name}">${opts.map(([v, l]) => `<button data-act="${act}" data-v="${v}" class="${cls(v)}" aria-pressed="${cur === v}">${l}</button>`).join("")}</div>`;
  const pick = S.ui.pick, pickMode = S.ui.cmpMode || pick.length > 0;
  const opt = (v, l, cur) => `<option value="${v}" ${cur === v ? "selected" : ""}>${l}</option>`;
  const band = `<div class="band"><span class="bsel"><span class="lab">Sort</span><select data-act="pl-sort" aria-label="Sort players">${opt("proj", "Best projection", plSort)}${opt("experts", "Expert rank", plSort)}${opt("gap", "We like more", plSort)}</select></span>${L ? `<span class="bsel"><span class="lab">Show</span><select data-act="pl-filter" aria-label="Show players">${opt("all", "Everyone", plFilter)}${opt("free", "Free agents", plFilter)}${opt("mine", "My team", plFilter)}</select></span>` : ""}</div>`;
  const CMP = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 8h13l-3.5-3.5M20 16H7l3.5 3.5"/></svg>`;
  return `${feedError()}<div class="titlerow"><h1 class="h1">Players</h1><span class="muted small">Week ${S.feed.week} · ${L ? esc(L.name) : "standard PPR"} scoring</span></div>${pulse(S.feed)}${expertsNote(S.feed)}
    <div class="stack" style="margin-top:14px">
      <div class="searchrow"><input type="search" id="pl-q" placeholder="Search players or teams" value="${esc(plQ)}" aria-label="Search players" autocomplete="off"><button class="iconbtn" data-act="cmp-mode" aria-pressed="${pickMode}" aria-label="${pickMode ? "Stop comparing" : "Compare two players"}" title="${pickMode ? "Stop comparing" : "Compare two players"}">${CMP}</button></div>
      ${seg("Position", plPos, avail.map((p) => [p, p === "ALL" ? "All" : p === "FLEX" ? "Flex" : posLabel(p)]), "pl-pos", (v) => POSCLS[v] || "")}
    </div>
    ${kdefNote}<div class="list" style="margin-top:8px">${band}${shown.map((id) => prow(id, C, { pick: pickMode, showExp: plSort === "experts" })).join("") || `<p class="muted" style="padding:20px 16px">No players match.</p>`}</div>
    ${ids.length > shown.length ? `<div style="text-align:center;margin-top:12px"><button class="btn" data-act="pl-more">Show more</button></div>` : ""}
    ${pick.length ? `<div class="floatbar"><span>${pick.length === 1 ? `${esc(S.players[pick[0]].n)} selected. Pick one more.` : `Compare ${esc(S.players[pick[0]].n)} and ${esc(S.players[pick[1]].n)}`}</span>${pick.length === 2 ? `<button class="btn" data-act="cmp-go">Compare</button>` : `<button class="btn" data-act="cmp-clear">Clear</button>`}</div>` : ""}`;
}
