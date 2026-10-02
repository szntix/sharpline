import { S, league, commit, render, pl, pname, invalidate } from "../state.js";
import { sleeperApi } from "../api.js";
import { SCORING_PRESETS, ROSTER_PRESETS, SCORING_FIELDS, SLOT_ELIG, SLOT_LABEL, LEAGUE_TYPES } from "../scoring.js";
import { VERSION, BUILT } from "../version.js";
import { esc, uid, toast, ago } from "../ui.js";
import { sec } from "./shared.js";

export function newLeague(name = "My league") {
  return { id: uid(), name, type: "redraft", teams: 12, scoringPreset: "ppr", scoring: { ...SCORING_PRESETS.ppr.s }, rosterPreset: "standard", slots: [...ROSTER_PRESETS.standard.slots], bench: ROSTER_PRESETS.standard.bench,
    endWeek: 17, playoffStart: 15, playoffWeight: true, roster: [], others: [], taken: [], opponent: null, sleeper: null };
}
const searchBox = (target, ph = "Search players") => `<div class="search"><input type="search" id="search-${esc(target)}" data-search="${esc(target)}" placeholder="${esc(ph)}" autocomplete="off" aria-label="${esc(ph)}"><ul hidden></ul></div>`;
function rosterChips(ids, target) {
  const sorted = [...ids].sort((a, b) => "QBRBWRTEKDEF".indexOf(pl(a)?.p || "") - "QBRBWRTEKDEF".indexOf(pl(b)?.p || ""));
  return `<div class="chips">${sorted.map((id) => `<span class="chip">${esc(pl(id)?.p === "DEF" ? "DST" : pl(id)?.p || "")} ${esc(pname(id))}<button aria-label="Remove ${esc(pname(id))}" data-act="rm-player" data-target="${esc(target)}" data-id="${id}">×</button></span>`).join("") || `<span class="muted small">No players yet.</span>`}</div>`;
}
const themeNow = () => localStorage.getItem("sharpline.theme") || "auto";

export function viewLeagues() {
  const L = S.profile.leagues.find((l) => l.id === S.ui.editing) || null;
  const list = S.profile.leagues.map((l) => `<div class="row slotted"><span class="pos neu">${l.sleeper ? "SL" : "MAN"}</span><div class="who"><span class="name">${esc(l.name)}${S.profile.active === l.id ? ` <span class="pos" style="--f:var(--brand);color:var(--brand-ink)">ACTIVE</span>` : ""}</span><span class="meta">${LEAGUE_TYPES[l.type]}, ${l.teams} teams, ${esc(SCORING_PRESETS[l.scoringPreset]?.label || "Custom scoring")}, ${l.roster.length} players</span></div>
    <div class="proj" style="display:flex;gap:6px">${S.profile.active !== l.id ? `<button class="btn sm" data-act="use-league" data-id="${l.id}">Use</button>` : ""}<button class="btn sm" data-act="edit-league" data-id="${l.id}">Edit</button></div></div>`).join("");
  return `<h1 class="h1" style="margin-top:8px">Leagues</h1>
    ${sec("Your leagues", `<div class="list">${list || `<p class="muted" style="padding:14px 0">No leagues yet.</p>`}</div><div class="toolbar" style="margin-top:12px"><button class="btn primary" data-act="new-league">New league</button><button class="btn" data-act="imp-start">Import from Sleeper</button></div>`)}
    ${S.ui.imp ? viewImport() : ""}${L ? viewEditLeague(L) : ""}${viewAccount()}`;
}

function viewImport() {
  const I = S.ui.imp; let inner = "";
  if (I.step === "find") inner = `<p class="muted small">Enter your Sleeper username to list your leagues, or paste a league ID.</p><div class="toolbar" style="margin-top:8px"><input type="text" id="imp-q" placeholder="Username or league ID" autocapitalize="none" style="max-width:280px" value="${esc(I.q || "")}"><button class="btn primary" data-act="imp-find">Find</button></div>`;
  if (I.step === "pick") inner = `<div class="list">${I.leagues.map((l) => `<div class="row slotted"><span class="pos neu">SL</span><div class="who"><span class="name">${esc(l.name)}</span><span class="meta">${l.total_rosters} teams, ${l.season}</span></div><div class="proj"><button class="btn sm" data-act="imp-league" data-id="${l.league_id}">Choose</button></div></div>`).join("") || `<p class="muted">No leagues found for this season.</p>`}</div>`;
  if (I.step === "team") inner = `<p class="muted small">Which team is yours in ${esc(I.league.name)}?</p><div class="list" style="margin-top:8px">${I.teams.map((t) => `<div class="row slotted"><span class="pos neu">${t.rid}</span><div class="who"><span class="name">${esc(t.name)}</span><span class="meta">${t.players.length} players</span></div><div class="proj"><button class="btn sm primary" data-act="imp-team" data-id="${t.rid}">This is me</button></div></div>`).join("")}</div>`;
  if (I.step === "busy") inner = `<span class="spinner"></span> Talking to Sleeper…`;
  return `<section class="sec"><div class="panel stack"><div style="display:flex;align-items:center"><h2 class="h2">Import from Sleeper</h2><button class="link" style="margin-left:auto" data-act="imp-cancel">Cancel</button></div>${I.error ? `<div class="banner err">${esc(I.error)}</div>` : ""}${inner}</div></section>`;
}

function viewEditLeague(L) {
  const scoringRows = [...new Set(SCORING_FIELDS.map((f) => f.g))].map((g) => `<fieldset style="border:0;padding:0;margin:0 0 12px"><legend class="small muted" style="margin-bottom:6px">${g}</legend><div class="grid-fields">${SCORING_FIELDS.filter((f) => f.g === g).map((f) => `<label class="field">${esc(f.l)}<input type="number" step="0.01" data-bind="score" data-k="${f.k}" value="${L.scoring[f.k] ?? 0}"></label>`).join("")}</div></fieldset>`).join("");
  const slotChips = L.slots.map((s, i) => `<span class="chip">${esc(SLOT_LABEL[s] || s)}<button aria-label="Remove ${esc(s)} slot" data-act="slot-rm" data-i="${i}">×</button></span>`).join("");
  const unknown = Object.keys(L.scoring).filter((k) => L.scoring[k] && !SCORING_FIELDS.some((f) => f.k === k) && !/^pts_allow|^yds_allow|^idp_|^def_|^tkl|^qb_hit|^fum$|^st_/.test(k));
  return `<section class="sec"><header><h2 class="h2">${esc(L.name)}</h2><span class="aside">${L.sleeper ? "Synced from Sleeper" : "Manual"}</span></header><div class="stack">
    <div class="panel"><div class="grid-fields">
      <label class="field">Name<input type="text" data-bind="lg" data-k="name" value="${esc(L.name)}"></label>
      <label class="field">League type<select data-bind="lg" data-k="type">${Object.entries(LEAGUE_TYPES).map(([k, v]) => `<option value="${k}" ${L.type === k ? "selected" : ""}>${v}</option>`).join("")}</select></label>
      <label class="field">Teams<input type="number" min="4" max="32" data-bind="lg" data-k="teams" value="${L.teams}"></label>
      <label class="field">Last regular week counted<input type="number" min="10" max="18" data-bind="lg" data-k="endWeek" value="${L.endWeek}"></label>
      <label class="field">Playoffs start week<input type="number" min="10" max="18" data-bind="lg" data-k="playoffStart" value="${L.playoffStart}"></label>
      <label class="field">Weight playoff weeks 1.5×<select data-bind="lg" data-k="playoffWeight"><option value="1" ${L.playoffWeight ? "selected" : ""}>Yes</option><option value="0" ${!L.playoffWeight ? "selected" : ""}>No</option></select></label></div></div>
    <div class="panel stack"><h3 class="h2">Scoring</h3><label class="field" style="max-width:360px">Start from a common rule set<select data-bind="scoring-preset"><option value="">Choose…</option>${Object.entries(SCORING_PRESETS).map(([k, v]) => `<option value="${k}" ${L.scoringPreset === k ? "selected" : ""}>${v.label}</option>`).join("")}</select></label>
      ${unknown.length ? `<p class="small muted">Imported rules not modeled yet: ${esc(unknown.slice(0, 8).join(", "))}${unknown.length > 8 ? "…" : ""}. They're ignored in projections.</p>` : ""}
      <details><summary>Fine-tune every scoring value</summary><div style="margin-top:10px">${scoringRows}</div></details></div>
    <div class="panel stack"><h3 class="h2">Starting lineup</h3><label class="field" style="max-width:360px">Common layouts<select data-bind="roster-preset"><option value="">Choose…</option>${Object.entries(ROSTER_PRESETS).map(([k, v]) => `<option value="${k}" ${L.rosterPreset === k ? "selected" : ""}>${v.label}</option>`).join("")}</select></label>
      <div class="chips">${slotChips}</div><div class="toolbar"><select id="slot-add" aria-label="Slot to add" style="max-width:180px">${Object.keys(SLOT_ELIG).map((s) => `<option value="${s}">${SLOT_LABEL[s] || s}</option>`).join("")}</select><button class="btn sm" data-act="slot-add">Add slot</button>
      <label class="field" style="max-width:120px">Bench<input type="number" min="0" max="30" data-bind="lg" data-k="bench" value="${L.bench}"></label></div></div>
    <div class="panel stack"><h3 class="h2">My roster</h3>${searchBox("mine", "Add a player to my team")}${rosterChips(L.roster, "mine")}${L.sleeper ? `<button class="btn sm" data-act="resync">Re-sync rosters from Sleeper</button>` : ""}</div>
    <div class="panel stack"><h3 class="h2">Other teams</h3><p class="small muted">Optional. Adding opponents unlocks win probability, trade ideas and accurate waiver lists.</p>
      ${L.others.map((o) => `<details ${S.ui.openTeam === o.id ? "open" : ""} data-team="${o.id}"><summary>${esc(o.name)} <span class="muted small">(${o.roster.length})</span></summary><div class="stack" style="margin-top:8px"><label class="field" style="max-width:280px">Team name<input type="text" data-bind="team-name" data-id="${o.id}" value="${esc(o.name)}"></label>${searchBox(`team:${o.id}`, `Add a player to ${o.name}`)}${rosterChips(o.roster, `team:${o.id}`)}<button class="btn sm danger" data-act="team-rm" data-id="${o.id}">Remove team</button></div></details>`).join("")}
      <button class="btn sm" data-act="team-add">Add a team</button></div>
    ${(L.taken || []).length ? `<div class="panel stack"><h3 class="h2">Marked as taken</h3>${rosterChips(L.taken, "taken")}</div>` : ""}
    <div class="toolbar"><button class="btn danger" data-act="league-rm" data-id="${L.id}">Delete league</button><button class="btn" data-act="edit-close">Done</button></div></div></section>`;
}

function viewAccount() {
  const F = S.feed, th = themeNow();
  return `<section class="sec"><header><h2 class="h2">Account and data</h2><span class="aside" id="savedot">${S.saveState === "saving" ? "Saving…" : S.saveState === "error" ? "Not saved" : "Saved"}</span></header><div class="panel stack">
    <div><div class="small muted" style="margin-bottom:6px">Appearance</div><div class="seg" role="group" aria-label="Theme">${[["auto", "Match device"], ["light", "Light"], ["dark", "Dark"]].map(([k, l]) => `<button data-act="theme" data-v="${k}" aria-pressed="${th === k}">${l}</button>`).join("")}</div></div>
    <dl class="kv"><dt>App version</dt><dd>${VERSION} (${BUILT})</dd><dt>Signed in as</dt><dd>${esc(S.user)}</dd><dt>Season and week</dt><dd>${F ? `${F.season}, week ${F.week}` : "–"}</dd><dt>Data checked</dt><dd>${F ? ago(F.fetchedAt) : "–"}</dd><dt>Game logs through week</dt><dd>${S.usage?.throughWeek ?? "–"}</dd></dl>
    <div class="toolbar"><button class="btn" data-act="reload">Check for new data</button><button class="btn" data-act="signout">Sign out</button></div>
    <p class="small muted">Data refreshes on its own. The button asks the server for the latest right now.</p>
      <div><div class="small muted" style="margin-bottom:6px">Team color on player rows</div><div class="seg" role="group" aria-label="Team color on player rows">${[["off", "Off"], ["on", "On"]].map(([k, l]) => `<button data-act="tint" data-v="${k}" aria-pressed="${(document.documentElement.dataset.tint || "off") === k}">${l}</button>`).join("")}</div>
      <p class="small muted" style="margin-top:6px">On tints each row with its team's color. Off keeps rows plain, with the team shown as the stripe on the left.</p></div></div></section>`;
}

// ---- Sleeper import ----
export async function impFind() {
  const q = document.getElementById("imp-q")?.value.trim(); if (!q) return;
  S.ui.imp = { step: "busy", q }; render();
  try {
    if (/^\d{8,}$/.test(q)) return impLeague(q);
    const u = await sleeperApi(`user/${q}`);
    if (!u?.user_id) throw new Error("No Sleeper user with that name.");
    const leagues = await sleeperApi(`user/${u.user_id}/leagues/nfl/${S.feed?.season || new Date().getFullYear()}`);
    S.ui.imp = { step: "pick", q, leagues: leagues || [], userId: u.user_id };
  } catch (e) { S.ui.imp = { step: "find", q, error: e.message }; }
  render();
}
export async function impLeague(id) {
  const prev = S.ui.imp; S.ui.imp = { ...prev, step: "busy" }; render();
  try {
    const [lg, rosters, users] = await Promise.all([sleeperApi(`league/${id}`), sleeperApi(`league/${id}/rosters`), sleeperApi(`league/${id}/users`)]);
    const uname = Object.fromEntries(users.map((u) => [u.user_id, u.metadata?.team_name || u.display_name]));
    const teams = rosters.map((r) => ({ rid: r.roster_id, owner: r.owner_id, name: uname[r.owner_id] || `Team ${r.roster_id}`, players: (r.players || []).filter((p) => S.players?.[p]) }));
    const mine = teams.find((t) => t.owner === prev.userId);
    S.ui.imp = { step: "team", league: lg, teams, rosters };
    if (mine) return impTeam(mine.rid);
  } catch (e) { S.ui.imp = { step: "find", error: e.message }; }
  render();
}
export async function impTeam(rid) {
  const I = S.ui.imp, lg = I.league, me = I.teams.find((t) => t.rid === Number(rid));
  const pos = lg.roster_positions || [], st = lg.settings || {}, L = newLeague(lg.name);
  Object.assign(L, {
    type: st.best_ball ? "bestball" : st.type === 2 ? "dynasty" : st.type === 1 ? "keeper" : "redraft",
    teams: lg.total_rosters || I.teams.length, scoring: { ...lg.scoring_settings }, scoringPreset: "custom",
    slots: pos.filter((p) => SLOT_ELIG[p]), bench: pos.filter((p) => p === "BN").length, rosterPreset: "custom",
    playoffStart: st.playoff_week_start || 15, endWeek: Math.min(17, (st.playoff_week_start || 15) + 2),
    roster: me.players, others: I.teams.filter((t) => t.rid !== me.rid).map((t) => ({ id: `sl${t.rid}`, name: t.name, roster: t.players })),
    sleeper: { leagueId: lg.league_id, rosterId: me.rid },
  });
  await setSleeperOpponent(L);
  S.profile.leagues.push(L); S.profile.active = L.id; S.ui.imp = null; S.ui.editing = null;
  commit(`Imported ${lg.name}`); location.hash = "week";
}
export async function setSleeperOpponent(L) {
  try {
    const wk = S.feed?.week; if (!wk) return;
    const ms = await sleeperApi(`league/${L.sleeper.leagueId}/matchups/${wk}`);
    const mine = ms.find((m) => m.roster_id === L.sleeper.rosterId);
    const opp = mine && ms.find((m) => m.matchup_id === mine.matchup_id && m.roster_id !== mine.roster_id);
    if (opp) L.opponent = `sl${opp.roster_id}`;
  } catch {}
}
export async function resync(L) {
  try {
    const rosters = await sleeperApi(`league/${L.sleeper.leagueId}/rosters`);
    for (const r of rosters) {
      const ids = (r.players || []).filter((p) => S.players?.[p]);
      if (r.roster_id === L.sleeper.rosterId) L.roster = ids;
      else { const o = L.others.find((x) => x.id === `sl${r.roster_id}`); if (o) o.roster = ids; }
    }
    await setSleeperOpponent(L); commit("Rosters synced");
  } catch (e) { toast(`Sync failed: ${e.message}`); }
}
