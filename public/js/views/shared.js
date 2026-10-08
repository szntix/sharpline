import { SOURCES, S, pl, league, computed } from "../state.js";
import { signals } from "../engine.js";
import { esc, f1, ago, agoShort, kickoffText, posLabel, statusChip, posClass, plate, teamStripe } from "../ui.js";
import { SLOT_ELIG, SLOT_LABEL } from "../scoring.js";

export const SRC_NOTE = { blend: "", experts: "experts only", sleeper: "Sleeper only", model: "model only", lines: "estimate", none: "no line", bye: "bye" };

// How fresh is everything on screen. One line when all is well; the detail is a tap away.
export function pulse(feed) {
  if (!feed) return "";
  const src = feed.sources || [];
  const waiting = src.filter((s) => s.status === "missing" || s.status === "stale").length;
  const broken = src.filter((s) => s.status === "broken").length;
  const label = broken ? `${broken} source${broken > 1 ? "s" : ""} changed format` : waiting ? `${waiting} of ${src.length} sources waiting` : `Live data, checked ${ago(feed.fetchedAt)}`;
  return `<details class="pulse" data-fold="pulse" ${S.ui.folds?.pulse ? "open" : ""}><summary><span class="pdots" aria-hidden="true">${src.map((s) => `<i class="${s.status}"></i>`).join("")}</span>${esc(label)}</summary>
    <div class="plist">${src.map((s) => `<div class="pr"><i class="${s.status}"></i><div>${esc(s.label)}<small>${esc(s.note)}</small></div><time>${s.asOf ? agoShort(s.asOf) : "waiting"}</time></div>`).join("")}
    <div class="pr"><i class="${S.usage ? "fresh" : "missing"}"></i><div>Game logs<small>${S.usage ? `Through week ${S.usage.throughWeek}, nflverse` : "Not loaded"}</small></div><time>${S.usage ? agoShort(S.usage.asOf) : "waiting"}</time></div></div></details>`;
}

// Shown when this week's expert rankings aren't out yet: the numbers are still useful, but less sharp.
export function expertsNote(feed) {
  if (!feed || feed.ecr?.status === "ok") return "";
  return `<div class="banner" style="margin-top:10px">Expert rankings for week ${feed.week} aren't published yet, so projections lean on our stat model and Sleeper. They sharpen when FantasyPros posts them, usually Tuesday or Wednesday, and this updates by itself.</div>`;
}

export function loading(what = "this week's numbers") {
  return `<div class="stack"><div class="skel" style="height:220px;border-radius:20px"></div><div class="skel" style="height:64px"></div><div class="skel" style="height:64px"></div><p class="muted small"><span class="spinner"></span> Loading ${esc(what)}…</p></div>`;
}
export function feedError() {
  return S.errors.feed ? fold("alert:feed", "Couldn't reach the data feed", `${esc(S.errors.feed)}. What you see may be out of date. <button class="link" data-act="reload">Try again</button>`, { open: true, headline: "What you see may be out of date", tone: "b2", role: "alert" }) : "";
}

// One player row, always two lines so every row is the same size: the name, position and status on top, and below it
// the game on the left with at most two short condition tags on the right. The full sentence for each tag is on the
// player page and is read out to screen readers. The team shows as a stripe on the left edge.
export function prow(id, C, { slot = null, sig = false, act = "", dim = false, pick = false, gain = "", showExp = false, value = "blend", nopos = false } = {}) {
  const p = pl(id), pr = C.P.proj[id]; if (!p) return "";
  const pos = p.p, g = pr?.game;
  const where = pos === "DEF" || !p.t ? "" : pr?.bye ? "Bye week" : pr?.opp ? `${g.home === p.t ? "vs" : "at"} ${pr.opp} · ${kickoffText(g)}` : "";
  const exp = showExp && C.ranks.exp[id] ? ` · experts ${posLabel(pos)}${C.ranks.exp[id]}` : "";
  const note = SRC_NOTE[pr?.src] || "";
  const chip = statusChip(pr?.status, pr?.practice);
  const tags = [];   // lineup rows stay clean: health is the ring, matchup is the meter, and everything else lives in the profile
  const gainHtml = gain ? `<span class="tag ${/^\+/.test(gain) ? "up" : "flat"}"><i></i>${esc(gain)}</span>` : "";
  const tagHtml = tags.map((x, n) => `<span class="tag ${x.t}${n ? " t2" : ""}" title="${esc(x.s)}"><i></i>${esc(x.k)}<span class="sr">: ${esc(x.s)}</span></span>`).join("");
  // value "model" shows our stat model on its own, in this league's scoring; players it does not cover show a dash.
  const modelPts = pr?.model != null && pr.ppr > 0 ? pr.model * (pr.mean / pr.ppr) : null;
  const srcWord = { model: "our model", experts: "experts", sleeper: "Sleeper" }[S.ui.src];
  // Under the number: the matchup meter when the model covers him. A caption appears only for exceptions (an estimate, a bye, a number kept from Blended).
  const mu = C.mu?.[id], exception = srcWord ? (pr?.srcMissing ? "blended" : "") : (/estimate|bye|injur|no /i.test(note) ? note : "");
  const under = `${mu ? mmHtml(mu) : ""}${exception ? `<small>${esc(exception)}</small>` : mu ? "" : "<small>&nbsp;</small>"}`;
  const shownNum = `<span class="num">${pr?.noTeam ? "–" : pr?.mean > 0 || (!srcWord && (pr?.src === "none" || pr?.bye)) ? f1(pr?.mean) : pr?.mean === 0 ? "0.0" : "–"}</span>${under}`;
  const flexy = !!slot && (SLOT_ELIG[slot]?.length || 0) > 1;   // a flex-type slot wears the color of the position playing it
  const lead = pick ? `<button class="pick" aria-label="Select ${esc(p.n)} to compare" aria-pressed="${S.ui.pick.includes(id)}" data-act="pick-cmp" data-id="${id}"></button>`
    : slot ? `<span class="pos ${posClass(flexy ? pos : slot)}"${flexy ? ` title="${esc(SLOT_LABEL[slot] || slot)}, ${esc(posLabel(pos))}" aria-label="${esc(SLOT_LABEL[slot] || slot)} slot, ${esc(posLabel(pos))}"` : ""}>${esc(SLOT_LABEL[slot] || slot)}</span>` : plate(p.t);
  return `<div class="row rowlink${slot || pick ? " slotted" : ""}${dim ? " dim" : ""}" data-go="player/${id}" style="--team:${teamStripe(p.t)}">
    ${lead}
    <div class="who"><span class="name"><span class="nm">${esc(p.n)}</span>${nopos || (slot && (slot === pos || flexy || (slot === "DEF" && pos === "DEF"))) ? "" : `<span class="pos ${posClass(pos)}">${esc(posLabel(pos))}</span>`}${chip}</span>
      <span class="sub"><span class="meta">${esc(where || p.t || "No team")}${exp}</span></span></div>
    <div class="proj">${shownNum}</div>
    ${act || gainHtml ? `<div class="act">${act}${gainHtml}</div>` : ""}</div>`;
}
export const ribbonMax = (prs) => Math.max(30, Math.ceil(Math.max(...prs.map((p) => (p ? p.mean + 1.7 * p.sd : 0)), 0) / 10) * 10);

export function emptyLeague() {
  return `<div class="panel empty"><h2 class="h2">Add your league</h2><p class="muted" style="margin:6px 0 16px">Import it from Sleeper or enter it by hand. You'll get lineup, waiver and trade advice in your league's scoring.</p>
    <div class="toolbar" style="justify-content:center"><a class="btn primary" href="#leagues" data-act="imp-start">Import from Sleeper</a><a class="btn" href="#leagues" data-act="new-league">Enter manually</a></div></div>`;
}
export const sec = (title, body, aside = "") => `<section class="sec"><header><h2 class="h2">${title}</h2>${aside ? `<span class="aside">${aside}</span>` : ""}</header>${body}</section>`;
export const noteList = (items) => `<ul class="notes">${items.map((n) => `<li class="${n.t}">${esc(n.s)}</li>`).join("")}</ul>`;

// Where the roster data came from and how fresh it is, with a way to refresh it right now.
export function syncLine(L, style = "") {
  if (!L?.sleeper) return "";
  const t = L.sleeper.syncedAt, when = t ? ago(t) : "when you imported", busy = S.ui.syncing;
  const text = busy ? `<span class="spinner" aria-hidden="true"></span><span>Checking Sleeper for roster changes</span>`
    : S.ui.syncErr ? `<span>Couldn't reach Sleeper just now. Showing rosters from ${esc(t ? ago(t) : "when you imported")}.</span>` : `<span>Rosters from Sleeper, checked ${esc(when)}.</span>`;
  return `<div class="syncline" role="status" ${style ? `style="${style}"` : ""}>${text}${busy ? "" : `<button class="link" data-act="resync-now">Refresh</button>`}</div>`;
}

// The projection source switch: the same control wherever it appears.
export const srcBar = () => `<div class="seg" role="group" aria-label="Projections from">${Object.entries(SOURCES).map(([k, l]) => `<button data-act="src" data-v="${k}" aria-pressed="${S.ui.src === k}">${l}</button>`).join("")}</div>`;

// Shown under the header on every screen, only while the numbers are not the tested Blended ones.
export const srcStrip = () => (S.ui.src === "blend" ? "" : `<div class="srcstrip" role="status"><span>Numbers from <b>${SOURCES[S.ui.src]}</b></span><span class="srcact"><button class="link" data-act="src" data-v="blend">Use Blended</button><a class="link" href="#leagues">Settings</a></span></div>`);
export const SRC_HELP = { blend: "The tested default: experts and Sleeper blended with our stat model, weighted by position.", model: "Our stat model on its own: recent usage, the betting market, the opponent, weather. Players it cannot rate keep their Blended number.", experts: "The experts' consensus projection, in your scoring.", sleeper: "Sleeper's own projection, in your scoring." };

// Good, neutral or bad at a glance. Five tones (b2 bad, b1 weak, n neutral, g1 good, g2 strong), each with a fill for bars and washes and an ink for text.
// Color is never the only cue: the same screens also carry words or arrows.
export const toneBy = (v, cuts) => (v == null || !isFinite(v) ? "n" : v < cuts[0] ? "b2" : v < cuts[1] ? "b1" : v < cuts[2] ? "n" : v < cuts[3] ? "g1" : "g2");
// A section that stays folded until tapped; its open or closed state survives redraws.
// A collapsible box. The choice is remembered per key (see saveFolds); `open` is only the starting state before anyone has chosen. An alert passes a
// headline, which stays visible on one line while the box is closed, and a tone for the colored edge, so closing it never hides that something is there.
export function fold(key, title, body, { badge = null, open: start = false, headline = "", tone = "", heading = false, role = "" } = {}) {
  const saved = S.ui.folds?.[key], open = saved != null ? !!saved : !!start, alert = !!(headline || tone);
  return `<details class="fold${alert ? " alertf" : ""}${tone ? ` tone-${tone}` : ""}" data-fold="${key}"${role ? ` role="${role}"` : ""} ${open ? "open" : ""}><summary>${heading ? `<h2 class="ft">${esc(title)}</h2>` : `<span class="ft">${esc(title)}</span>`}${badge != null ? `<span class="count">${esc(String(badge))}</span>` : ""}${headline ? `<span class="fh">${esc(headline)}</span>` : ""}</summary><div class="foldbody">${body}</div></details>`;
}

// Five bars, filled to the matchup's level and colored by its tone. Wordless on rows; the profile says it in words.
export const mmHtml = (m, { label = true } = {}) => `<span class="mm tone-${m.tone}" ${label ? `role="img" aria-label="${m.word} matchup and game"` : 'aria-hidden="true"'}>${[1, 2, 3, 4, 5].map((n) => `<i${n <= m.lvl ? ' class="on"' : ""}></i>`).join("")}</span>`;
