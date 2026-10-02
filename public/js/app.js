import { api, session, localProfile } from "./api.js";
import { SCORING_PRESETS, ROSTER_PRESETS } from "./scoring.js";
import { S, setRender, league, commit, invalidate, loadData, loadFeed, refreshFeedQuiet, pl, pname } from "./state.js";
import { nextRefreshMs } from "./refresh.js";
import { esc, toast } from "./ui.js";
import { capHtml } from "./charts.js";
import { VERSION } from "./version.js";
import { viewWeek } from "./views/week.js";
import { viewSlate, viewGame } from "./views/slate.js";
import { viewPlayers } from "./views/players.js";
import { viewPlayer } from "./views/player.js";
import { viewCompare } from "./views/compare.js";
import { viewMoves } from "./views/moves.js";
import { viewProof } from "./views/proof.js";
import { viewLeagues, newLeague, impFind, impLeague, impTeam, resync, syncRosters, ensureRosters } from "./views/leagues.js";

const $app = document.getElementById("app");
setRender(render);

// ---------------------------------------------------------------- theme
function applyTheme() {
  try { document.documentElement.dataset.tint = localStorage.getItem("sharpline.tint") === "on" ? "on" : "off"; } catch {}
  const t = localStorage.getItem("sharpline.theme") || "auto";
  if (t === "auto") document.documentElement.removeAttribute("data-theme"); else document.documentElement.dataset.theme = t;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", (t === "dark" || (t === "auto" && matchMedia("(prefers-color-scheme: dark)").matches)) ? "#151517" : "#eae8e1");
}
applyTheme();
matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", () => { applyTheme(); render(); });
// A team logo that does not load just disappears, leaving the letters underneath.
$app.addEventListener("error", (e) => { const t = e.target; if (t?.tagName === "IMG" && t.closest(".plate")) t.remove(); }, true);

// ---------------------------------------------------------------- icons and shell
const LOGO = `<svg viewBox="0 0 64 64" aria-hidden="true"><rect width="64" height="64" rx="15" fill="#2b5837"/><g stroke="#fff" stroke-width="2.6" opacity=".55"><path d="M16 8v48M32 8v48M48 8v48"/></g><ellipse cx="38" cy="30" rx="14" ry="8.6" transform="rotate(-18 38 30)" fill="#8a4620" stroke="#2b1206" stroke-width="1.6"/><path d="M31 32l14-6M34.5 26.5l1.6 5M38 25.3l1.6 5M41.5 24l1.6 5" stroke="#fff" stroke-width="1.8" stroke-linecap="round"/></svg>`;
const I = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const ICON = {
  week: I('<rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="M9 5v14M15 5v14M3 12h18" opacity=".6"/><circle cx="12" cy="12" r="2"/>'),
  slate: I('<circle cx="7" cy="16" r="2.6"/><circle cx="16.5" cy="8" r="2.6"/><circle cx="17" cy="17" r="2"/><path d="M3 20h18M3 20V4" opacity=".6"/>'),
  players: I('<circle cx="9" cy="8" r="3.2"/><path d="M3.5 19c.7-3.4 3-5 5.5-5s4.8 1.6 5.5 5"/><path d="M16 5.5a3 3 0 010 5.6M17.5 14.5c1.9.6 3.2 2.1 3.6 4.5"/>'),
  moves: I('<path d="M4 8h13l-3.5-3.5M20 16H7l3.5 3.5"/>'),
  proof: I('<circle cx="12" cy="12" r="8.5"/><path d="M8 12.5l2.7 2.7L16.3 9"/>'),
  leagues: I('<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>'),
  prev: I('<path d="M14.5 6l-6 6 6 6"/>'), next: I('<path d="M9.5 6l6 6-6 6"/>'),
};
const TABS = [["week", "Week"], ["slate", "Slate"], ["players", "Players"], ["moves", "Moves"], ["proof", "Proof"]];
const TAB_OF = { week: "week", slate: "slate", game: "slate", players: "players", player: "players", compare: "players", moves: "moves", proof: "proof" };

function parseRoute() {
  const [name = "week", ...args] = (location.hash.slice(1) || "week").split("/");
  return { name: ["week", "slate", "game", "players", "player", "compare", "moves", "proof", "leagues"].includes(name) ? name : "week", args };
}

function render() {
  if (!S.user) return;
  const active = document.activeElement, fid = active?.id, sel = active?.selectionStart, y = window.scrollY;
  S.route = parseRoute();
  const { name, args } = S.route;
  let body = "";
  try {
    body = { week: viewWeek, slate: viewSlate, game: () => viewGame(args[0]), players: viewPlayers, player: () => viewPlayer(args[0]), compare: () => viewCompare(args[0], args[1]), moves: viewMoves, proof: viewProof, leagues: viewLeagues }[name]();
  } catch (e) { console.error(e); body = `<div class="panel empty"><h2 class="h2">Something went wrong on this screen</h2><p class="muted small" style="margin:6px 0 14px">${esc(e.message)}<br>Version ${VERSION}</p><a class="btn primary" href="#week">Back to the week</a></div>`; }
  const wk = S.feed?.week ?? S.week, atNow = S.activeWeek == null || wk === S.activeWeek;
  $app.innerHTML = `<header class="top"><a class="brand" href="#week" aria-label="Sharpline home">${LOGO}<span>Sharpline</span></a>
      <div class="weeknav" role="group" aria-label="Week"><button data-act="wk-prev" aria-label="Previous week" ${!wk || wk <= 1 ? "disabled" : ""}>${ICON.prev}</button><b ${atNow ? "" : 'data-act="wk-now" style="cursor:pointer" title="Back to the current week"'}>${wk ? `Week ${wk}` : "…"}</b><button data-act="wk-next" aria-label="Next week" ${!wk || wk >= 18 ? "disabled" : ""}>${ICON.next}</button></div>
      <a class="iconbtn" href="#leagues" aria-label="Leagues and settings">${ICON.leagues}</a></header>
    <main><div class="wrap">${!atNow && S.feed ? `<div class="banner" style="margin:4px 0 12px">You're looking at week ${wk}. The current week is ${S.activeWeek}. <button class="link" data-act="wk-now">Go to week ${S.activeWeek}</button></div>` : ""}${body}</div></main>
    <nav class="tabs" aria-label="Sections">${TABS.map(([k, l]) => `<a href="#${k}" ${TAB_OF[name] === k ? 'aria-current="page"' : ""}>${ICON[k]}<span>${l}</span></a>`).join("")}</nav>`;
  if (fid) { const el = document.getElementById(fid); if (el) { el.focus(); try { if (sel != null) el.setSelectionRange(sel, sel); } catch {} } }
  if (window.scrollY !== y && S._keepScroll) window.scrollTo(0, y);
  document.title = "Sharpline";
  if (["week", "players", "moves"].includes(name)) queueMicrotask(() => ensureRosters());
}
window.addEventListener("hashchange", () => { S._keepScroll = false; render(); window.scrollTo(0, 0); });

// ---------------------------------------------------------------- auth and boot
function renderAuth(msg = "") {
  S.user = null;
  $app.innerHTML = `<div class="auth"><div class="brand">${LOGO}<span>Sharpline</span></div>
    <p class="lede">Start/sit, waiver and trade help built on live betting lines and a tested model. Each account keeps its own leagues.</p>
    <form id="authform" novalidate>${msg ? `<div class="banner err" role="alert">${esc(msg)}</div>` : ""}
      <label class="field">Username<input type="text" name="username" autocomplete="username" autocapitalize="none" required minlength="3"></label>
      <label class="field">PIN<input type="password" name="pin" autocomplete="current-password" inputmode="numeric" required minlength="4"></label>
      <details><summary class="small">Creating an account? Invite code</summary><label class="field" style="margin-top:8px">Invite code (only if this site requires one)<input type="text" name="invite" autocomplete="off"></label></details>
      <div class="toolbar"><button class="btn primary" name="action" value="login" type="submit">Sign in</button><button class="btn" name="action" value="register" type="submit">Create account</button></div></form></div>`;
  const form = document.getElementById("authform");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(form), action = e.submitter?.value || "login";
    form.querySelectorAll("button").forEach((b) => (b.disabled = true));
    try { const r = await api("auth", { method: "POST", auth: false, body: { action, username: fd.get("username"), pin: fd.get("pin"), invite: fd.get("invite") } }); session.set(r); boot(); }
    catch (err) { renderAuth(err.message); }
  });
}
async function boot() {
  const s = session.get();
  if (!s?.token) return renderAuth();
  S.user = s.username;
  S.profile = localProfile(S.user) || { leagues: [], active: null };
  render();
  api("profile").then((r) => { if (r.profile) { S.profile = r.profile; invalidate(); render(); } }).catch((e) => { if (e.status === 401) { session.set(null); renderAuth("Your session expired. Sign in again."); } });
  loadData();
}

// ---------------------------------------------------------------- auto-refresh
// Quiet re-check while the app is open. It waits if the page is hidden, a finger is dragging the dotplot, or a field has focus.
function autoRefresh() {
  if (!S.user || !S.feed || S.loading || document.hidden || dragging) return;
  if (/^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement?.tagName || "")) return;
  ensureRosters(10 * 60e3);
  if (Date.now() - (S.feedAt || 0) < nextRefreshMs(S.feed)) return;
  S._keepScroll = true; refreshFeedQuiet().finally(() => { S._keepScroll = false; });
}
setInterval(autoRefresh, 20e3);
document.addEventListener("visibilitychange", autoRefresh);
window.addEventListener("online", autoRefresh);

// ---------------------------------------------------------------- dotplot interaction
function setThreshold(svg, v) {
  const max = +svg.dataset.max, W = +svg.dataset.w, pl_ = +svg.dataset.pl, pr_ = +svg.dataset.pr;
  v = Math.max(1, Math.min(max - 1, Math.round(v)));
  const x = pl_ + (v / max) * (W - pl_ - pr_);
  svg.querySelector(".thr").style.transform = `translateX(${x}px)`;
  let n = 0; svg.querySelectorAll(".dot").forEach((d) => { const on = +d.dataset.v >= v; d.classList.toggle("on", on); if (on) n++; });
  const cap = document.getElementById(svg.dataset.cap);
  if (cap) cap.innerHTML = capHtml(n, (svg.dataset.name || "he").split(" ")[0], v);
  const chips = svg.closest("section")?.querySelectorAll(".thresholds button"); chips?.forEach((b) => b.setAttribute("aria-pressed", String(+b.dataset.thr === v)));
  if (svg.id.startsWith("dp-")) S.ui.thr[svg.id.slice(3)] = v;
}
function dragValue(svg, ev) {
  const r = svg.getBoundingClientRect(), W = +svg.dataset.w, pl_ = +svg.dataset.pl, pr_ = +svg.dataset.pr, max = +svg.dataset.max;
  const vx = ((ev.clientX - r.left) / r.width) * W; return ((vx - pl_) / (W - pl_ - pr_)) * max;
}
let dragging = null;
$app.addEventListener("pointerdown", (e) => {
  const svg = e.target.closest?.("svg.dotplot"); if (!svg || !svg.dataset.cap || !svg.id.startsWith("dp-")) return;
  dragging = svg; svg.setPointerCapture?.(e.pointerId); svg.querySelector(".thr").style.transition = "none"; setThreshold(svg, dragValue(svg, e));
});
$app.addEventListener("pointermove", (e) => { if (dragging) setThreshold(dragging, dragValue(dragging, e)); });
const endDrag = () => { if (dragging) { dragging.querySelector(".thr").style.transition = ""; dragging = null; } };
$app.addEventListener("pointerup", endDrag); $app.addEventListener("pointercancel", endDrag);

// ---------------------------------------------------------------- clicks
const editingLeague = () => S.profile.leagues.find((l) => l.id === S.ui.editing);
function rosterFor(target) {
  const L = editingLeague() || league(); if (!L) return null;
  if (target === "mine") return L.roster; if (target === "taken") return (L.taken ||= []);
  if (target.startsWith("team:")) return L.others.find((o) => o.id === target.slice(5))?.roster; return null;
}
$app.addEventListener("click", async (e) => {
  const thr = e.target.closest("[data-thr]");
  if (thr) { const svg = document.getElementById(thr.closest(".thresholds").dataset.for); if (svg) setThreshold(svg, +thr.dataset.thr); return; }
  const el = e.target.closest("[data-act]");
  if (!el) { const go = e.target.closest("[data-go]"); if (go && !e.target.closest("button, a, select, input")) location.hash = go.dataset.go; return; }
  if (el.tagName === "SELECT") return;      // dropdowns act on "change", not on the tap that opens them
  const a = el.dataset.act, id = el.dataset.id, v = el.dataset.v, L = league();
  switch (a) {
    case "reload": { S.errors = {}; el.disabled = true; await loadFeed(S.week); loadData(); toast("Checked for new data"); break; }
    case "wk-prev": await loadFeed((S.feed?.week || 1) - 1); break;
    case "wk-next": await loadFeed((S.feed?.week || 1) + 1); break;
    case "wk-now": await loadFeed(null); S.week = S.activeWeek; break;
    case "pl-pos": S.ui.plPos = v; S.ui.plMore = 1; render(); break;
    case "pl-more": S.ui.plMore++; render(); break;
    case "cmp-mode": S.ui.cmpMode = !S.ui.cmpMode; if (!S.ui.cmpMode) S.ui.pick = []; render(); break;
    case "pick-cmp": { const i = S.ui.pick.indexOf(id); if (i >= 0) S.ui.pick.splice(i, 1); else { if (S.ui.pick.length >= 2) S.ui.pick.shift(); S.ui.pick.push(id); } render(); break; }
    case "cmp-go": { const [x, y] = S.ui.pick; S.ui.pick = []; location.hash = `compare/${x}/${y}`; break; }
    case "cmp-clear": S.ui.pick = []; render(); break;
    case "moves-tab": S.ui.moves = v; render(); break;
    case "proof-pos": S.ui.proofPos = v; render(); break;
    case "theme": localStorage.setItem("sharpline.theme", v); applyTheme(); render(); break;
    case "tint": try { localStorage.setItem("sharpline.tint", v === "on" ? "on" : "off"); } catch {} applyTheme(); render(); break;
    case "new-league": { const nl = newLeague(`League ${S.profile.leagues.length + 1}`); S.profile.leagues.push(nl); S.profile.active = nl.id; S.ui.editing = nl.id; commit(); break; }
    case "use-league": S.profile.active = id; S.ui.give = []; S.ui.get = []; S.ui.partner = ""; commit("League switched"); break;
    case "edit-league": S.ui.editing = id; if (S.route.name !== "leagues") location.hash = "leagues"; else render(); break;
    case "edit-close": S.ui.editing = null; render(); break;
    case "league-rm": if (confirm("Delete this league? This can't be undone.")) { S.profile.leagues = S.profile.leagues.filter((l) => l.id !== id); if (S.profile.active === id) S.profile.active = S.profile.leagues[0]?.id || null; S.ui.editing = null; commit("League deleted"); } break;
    case "slot-add": { const E = editingLeague(); E.slots.push(document.getElementById("slot-add").value); E.rosterPreset = "custom"; commit(); break; }
    case "slot-rm": { const E = editingLeague(); E.slots.splice(Number(el.dataset.i), 1); E.rosterPreset = "custom"; commit(); break; }
    case "team-add": { const E = editingLeague(); const t = { id: Math.random().toString(36).slice(2, 10), name: `Team ${E.others.length + 2}`, roster: [] }; E.others.push(t); S.ui.openTeam = t.id; commit(); break; }
    case "team-rm": { const E = editingLeague(); E.others = E.others.filter((o) => o.id !== id); if (E.opponent === id) E.opponent = null; commit(); break; }
    case "rm-player": { const r = rosterFor(el.dataset.target); if (r) { const i = r.indexOf(id); if (i >= 0) r.splice(i, 1); } commit(); break; }
    case "pick": {
      const target = el.dataset.target;
      if (target.startsWith("cmp")) { const first = target.split(":")[1]; location.hash = first ? `compare/${first}/${id}` : `compare/${id}`; break; }
      if (target === "get") { if (!S.ui.get.includes(id)) S.ui.get.push(id); render(); break; }
      const r = rosterFor(target);
      if (r && !r.includes(id)) { r.push(id); if (target.startsWith("team:")) S.ui.openTeam = target.slice(5); commit(`Added ${pname(id)}`); }
      setTimeout(() => document.getElementById(`search-${target}`)?.focus(), 0); break;
    }
    case "add-mine": if (L && !L.roster.includes(id)) { L.roster.push(id); commit(`Added ${pname(id)} to your team`); } break;
    case "take": if (L) { (L.taken ||= []).push(id); commit(`${pname(id)} marked as taken`); } break;
    case "wv-mode": S.ui.wvMode = v; render(); break;
    case "wv-pos": S.ui.wvPos = v; render(); break;
    case "tr-rm": S.ui[el.dataset.side] = S.ui[el.dataset.side].filter((x) => x !== id); render(); break;
    case "tr-load": S.ui.give = el.dataset.give.split(","); S.ui.get = el.dataset.get.split(","); S.ui.partner = el.dataset.team; render(); window.scrollTo(0, 0); break;
    case "imp-start": S.ui.imp = { step: "find" }; if (S.route.name === "leagues") render(); break;
    case "imp-cancel": S.ui.imp = null; render(); break;
    case "imp-find": impFind(); break;
    case "imp-league": impLeague(id); break;
    case "imp-team": impTeam(id); break;
    case "resync": resync(editingLeague()); break;
    case "resync-now": syncRosters(league(), { fresh: true }); break;
    case "sync-league": syncRosters(S.profile.leagues.find((l) => l.id === id), { fresh: true }); break;
    case "signout": session.set(null); renderAuth(); break;
  }
});

// ---------------------------------------------------------------- form changes and search
$app.addEventListener("change", (e) => {
  const el = e.target, b = el.dataset.bind;
  if (el.dataset.change === "pl-sort") { if (["proj", "experts", "gap"].includes(el.value)) S.ui.plSort = el.value; render(); return; }
  if (el.dataset.change === "pl-filter") { if (["all", "free", "mine"].includes(el.value)) S.ui.plFilter = el.value; S.ui.plMore = 1; render(); return; }
  if (!b) return;
  const L = league(), E = editingLeague();
  if (b === "opponent") { L.opponent = el.value || null; commit(); return; }
  if (b === "partner") { S.ui.partner = el.value; S.ui.get = []; render(); return; }
  if (b === "tr-give") { if (el.value) S.ui.give.push(el.value); render(); return; }
  if (b === "tr-get") { if (el.value) S.ui.get.push(el.value); render(); return; }
  if (!E) return;
  if (b === "lg") {
    const k = el.dataset.k; let val = el.value;
    if (["teams", "endWeek", "playoffStart", "bench"].includes(k)) val = Math.max(0, Number(val) || 0);
    if (k === "playoffWeight") val = val === "1";
    E[k] = val; commit(); return;
  }
  if (b === "score") { E.scoring[el.dataset.k] = Number(el.value) || 0; E.scoringPreset = "custom"; commit(); return; }
  if (b === "scoring-preset" && el.value) { E.scoring = { ...E.scoring, ...SCORING_PRESETS[el.value].s }; E.scoringPreset = el.value; commit("Scoring updated"); return; }
  if (b === "roster-preset" && el.value) { const r = ROSTER_PRESETS[el.value]; E.slots = [...r.slots]; E.bench = r.bench; E.rosterPreset = el.value; commit("Lineup slots updated"); return; }
  if (b === "team-name") { const o = E.others.find((x) => x.id === el.dataset.id); if (o) { o.name = el.value || o.name; commit(); } }
});
$app.addEventListener("input", (e) => {
  const el = e.target;
  if (el.id === "pl-q") { S.ui.plQ = el.value; S.ui.plMore = 1; render(); return; }
  if (!el.dataset.search) return;
  const ul = el.nextElementSibling, q = el.value.trim().toLowerCase();
  if (q.length < 2 || !S.players) { ul.hidden = true; ul.innerHTML = ""; return; }
  const words = q.split(/\s+/);
  const res = Object.entries(S.players).filter(([, p]) => { const n = (p.n + " " + (p.t || "")).toLowerCase(); return words.every((w) => n.includes(w)); }).sort((a, b) => a[1].r - b[1].r).slice(0, 12);
  ul.innerHTML = res.map(([id, p]) => `<li><button type="button" data-act="pick" data-target="${esc(el.dataset.search)}" data-id="${id}"><span>${esc(p.n)}</span><span class="muted small">${p.p === "DEF" ? "DST" : p.p} ${esc(p.t || "FA")}</span></button></li>`).join("") || `<li class="muted small" style="padding:8px">No matches</li>`;
  ul.hidden = false;
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && e.target.id === "imp-q") impFind();
  if (e.key === "Escape") document.querySelectorAll(".search ul").forEach((u) => (u.hidden = true));
});
document.addEventListener("click", (e) => { if (!e.target.closest(".search")) document.querySelectorAll(".search ul").forEach((u) => (u.hidden = true)); });

boot();
