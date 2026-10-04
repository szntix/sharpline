import { cached, getText, getJson, freshness, normName } from "./util.mjs";
import { checkEcr, checkInjuries, checkProjections } from "./shape.mjs";
import { parseCsv, schedule } from "./schedule.mjs";
import { abbr } from "./teams.mjs";
import { loadPlayers } from "../players.mjs";
import { points, PPR } from "../../../public/js/scoring.js";

const RAW = "https://raw.githubusercontent.com/dynastyprocess/data/master/files";
const NFLV = "https://github.com/nflverse/nflverse-data/releases/download";
const na = (v) => (v === undefined || v === "" || v === "NA" ? null : v);
const numOrNull = (v) => { const x = Number(na(v)); return na(v) == null || !isFinite(x) ? null : x; };

// ---------------------------------------------------------------------------------------------
// Expert consensus: FantasyPros weekly rankings, republished daily by the dynastyprocess project.
// ---------------------------------------------------------------------------------------------
// The ID table links the same player across sites. One download feeds two lookups: FantasyPros id to Sleeper id (for expert
// rankings) and nflverse (gsis) id to Sleeper id (for game logs and injury reports).
export async function idTable() {
  return cached("id-table-v2", 3 * 864e5, async () => {
    const rows = parseCsv(await getText(`${RAW}/db_playerids.csv`, { timeout: 30000 }));
    const fp = {}, gsis = {};
    for (const r of rows) {
      const s = na(r.sleeper_id); if (!s) continue;
      if (na(r.fantasypros_id)) fp[r.fantasypros_id] = s;
      if (na(r.gsis_id)) gsis[r.gsis_id] = s;
    }
    return { fp, gsis };
  });
}
export async function fpIds() { return (await idTable()).fp; }

// nflverse id to Sleeper id. Sleeper's own player table carries a gsis id for only some players (its documentation does not list
// the field at all), and a player without one used to get no stat-model number and no injury status. The ID table fills the gaps;
// Sleeper's own value wins if the two ever disagree.
export async function gsisToSleeper(players) {
  const out = {};
  try { const { gsis } = await idTable(); for (const [g, s] of Object.entries(gsis)) if (players[s]) out[g] = s; } catch {}
  for (const [id, p] of Object.entries(players)) if (p.g) out[p.g] = id;
  return out;
}

async function rawEcr() {
  return cached("ecr-v3", 45 * 60e3, async () => {
    const [csv, ids, roster] = await Promise.all([getText(`${RAW}/fp_latest_weekly.csv`), fpIds(), loadPlayers().catch(() => ({}))]);
    // The id table misses a few kickers, so those are matched by name and team. Defenses have no id
    // at all: Sleeper's id for a defense is its team abbreviation, so they are matched by team.
    const byNameTeam = {};
    for (const [id, p] of Object.entries(roster)) if (p.p === "K" && p.t) (byNameTeam[`${normName(p.n)}|${p.t}`] ||= []).push(id);
    const rows = parseCsv(csv), cols = Object.keys(rows[0] || {});
    const players = {}, counts = {}, stats = {}, unmapped = { K: [], DST: [] }; let scraped = null;
    for (const r of rows) {
      const pos = r.pos; counts[pos] = (counts[pos] || 0) + 1;
      if (!["QB", "RB", "WR", "TE", "K", "DST"].includes(pos)) continue;
      const e = numOrNull(r.ecr); if (e == null) continue;
      const team = abbr(r.team);
      let sid = pos === "DST" ? (roster[team]?.p === "DEF" ? team : null) : ids[r.fantasypros_id];
      if (!sid && pos === "K") { const hit = byNameTeam[`${normName(r.player_name)}|${team}`]; if (hit?.length === 1) sid = hit[0]; }
      const st = (stats[pos] ||= { rows: 0, mapped: 0 }); st.rows++;
      if (!sid) { unmapped[pos]?.push(r.player_name); continue; }
      st.mapped++; scraped = na(r.scrape_date) || scraped;
      players[sid] = { e, sd: numOrNull(r.sd), b: numOrNull(r.best), w: numOrNull(r.worst), o: numOrNull(r.player_owned_avg), g: na(r.start_sit_grade),
        t: team, ts: numOrNull(r.player_game_kickoff_ts) };
    }
    return { fetchedAt: Date.now(), scraped, players, stats, unmapped, shape: checkEcr(cols, counts, scraped) };
  });
}

// The rankings are only usable for the week whose games they point at. Match each player's kickoff
// to the week's schedule; if most don't line up, the rankings are for a different week and are withheld.
export async function loadEcr(games) {
  const d = await rawEcr();
  const kick = {}; for (const g of games) if (g.kickoff) { kick[g.home] = Date.parse(g.kickoff); kick[g.away] = Date.parse(g.kickoff); }
  let total = 0, hit = 0;
  for (const p of Object.values(d.players)) {
    if (kick[p.t] == null) continue; total++;
    if (p.ts && Math.abs(p.ts * 1000 - kick[p.t]) <= 15 * 60e3) hit++;
  }
  const ok = total > 0 && hit / total >= 0.5;
  return { status: ok ? "ok" : "not-yet", scraped: d.scraped, asOf: d.fetchedAt, match: total ? +(hit / total).toFixed(2) : 0, players: ok ? d.players : {}, stats: d.stats, unmapped: d.unmapped, shape: d.shape };
}

// ---------------------------------------------------------------------------------------------
// Sleeper's weekly projections (what league-mates see)
// ---------------------------------------------------------------------------------------------
const KEEP = ["pass_yd", "pass_td", "pass_int", "pass_att", "pass_cmp", "pass_2pt", "rush_yd", "rush_td", "rush_att", "rush_2pt", "rec", "rec_yd", "rec_td", "rec_2pt",
  "fum_lost", "fgm", "fgm_0_19", "fgm_20_29", "fgm_30_39", "fgm_40_49", "fgm_50p", "xpm", "fgmiss", "xpmiss", "pts_ppr"];
export async function sleeperProj(season, week) {
  return cached(`sl-proj2-${season}-${week}`, 30 * 60e3, async () => {
    const pos = ["QB", "RB", "WR", "TE", "K"].map((p) => `position[]=${p}`).join("&");
    const urls = [`https://api.sleeper.com/projections/nfl/${season}/${week}?season_type=regular&${pos}&order_by=pts_ppr`,
      `https://api.sleeper.app/v1/projections/nfl/regular/${season}/${week}`];
    const players = await loadPlayers(); let shape = null;
    for (const u of urls) {
      try {
        const d = await getJson(u); shape = checkProjections(d);
        const rows = Array.isArray(d) ? d.map((x) => [String(x.player_id), x.stats]) : Object.entries(d || {});
        const out = {};
        for (const [id, st] of rows) {
          if (!players[id] || !st) continue;
          const s = {}; for (const k of KEEP) if (st[k] != null) s[k] = +(+st[k]).toFixed(3);
          const ppr = st.pts_ppr != null ? +st.pts_ppr : points(s, PPR, players[id].p);
          if (players[id].p !== "K" && !(ppr >= 1)) continue;
          s.ppr = +(+ppr).toFixed(2); out[id] = s;
        }
        if (Object.keys(out).length > 20) return { fetchedAt: Date.now(), players: out, shape };
      } catch {}
    }
    return { fetchedAt: Date.now(), players: {}, error: "Sleeper projections unavailable", shape };
  });
}

// ---------------------------------------------------------------------------------------------
// Official injury reports (nflverse republishes them through the week)
// ---------------------------------------------------------------------------------------------
// Both injury areas, such as "Knee, Hamstring", from the game report or else the practice report. Missing or repeated parts are dropped.
const tx = (v) => (v == null ? null : na(v));
export const injuryText = (a, b) => [...new Set([tx(a), tx(b)].filter(Boolean))].join(", ") || null;
export async function loadInjuries(season, week) {
  const all = await cached(`inj5-${season}`, 30 * 60e3, async () => {
    const csv = await getText(`${NFLV}/injuries/injuries_${season}.csv`);
    const players = await loadPlayers(); const g2s = await gsisToSleeper(players);
    const byWeek = {}, rows = parseCsv(csv), shape = checkInjuries(Object.keys(rows[0] || {}));
    for (const r of rows) {
      const sid = g2s[r.gsis_id]; if (!sid || !["QB", "RB", "WR", "TE", "K"].includes(r.position)) continue;
      const practice = /Did Not/.test(r.practice_status) ? "DNP" : /Limited/.test(r.practice_status) ? "Limited" : /Full/.test(r.practice_status) ? "Full" : null;
      (byWeek[r.week] ||= {})[sid] = { s: na(r.report_status), p: practice, i: injuryText(r.report_primary_injury, r.report_secondary_injury) || injuryText(r.practice_primary_injury, r.practice_secondary_injury) };
    }
    return { fetchedAt: Date.now(), byWeek, shape };
  });
  const wk = all.byWeek[week];
  return { status: wk ? "ok" : "not-yet", asOf: all.fetchedAt, players: wk || {}, shape: all.shape };
}

// ---------------------------------------------------------------------------------------------
// Schedule lines from nflverse: the fallback when ESPN is down, and the record of closing lines
// for games that are already final (ESPN drops odds after the final whistle).
// ---------------------------------------------------------------------------------------------
export async function nflverseGames(season, week) {
  const sch = await schedule(season);
  return sch.filter((g) => g.week === week).map((g) => ({
    id: `nfl-${g.away}-${g.home}-${week}`, week, kickoff: null, day: g.gameday, home: g.home, away: g.away,
    homeScore: g.hs, awayScore: g.as, status: { state: g.hs != null ? "post" : "pre", completed: g.hs != null, detail: g.hs != null ? "Final" : "" },
    venue: { name: "", indoor: false, neutral: false }, records: { home: "", away: "" }, tv: "", weather: null,
    line: g.spread != null && g.total != null ? { book: "nflverse", spread: g.spread, total: g.total, spreadOpen: null, totalOpen: null } : null,
  }));
}

export function mergeGames(espn, nfl) {
  if (!espn.length) return nfl.map((g) => ({ ...g, from: "nflverse" }));
  const idx = Object.fromEntries(nfl.map((g) => [`${g.away}@${g.home}`, g]));
  return espn.map((g) => {
    const f = idx[`${g.away}@${g.home}`];
    if (!g.line && f?.line) return { ...g, line: { ...f.line, book: g.status.completed ? "Closing line" : "nflverse" }, from: "espn+nflverse" };
    return { ...g, from: "espn" };
  });
}
export { freshness };
