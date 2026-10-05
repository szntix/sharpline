import { getTextConditional, cachedConditional, cached, getText, nflState, normName } from "./util.mjs";
import { gsisToSleeper } from "./sources.mjs";
import { loadPlayers } from "../players.mjs";
import { MODEL } from "../../../public/js/coefs.js";
import { abbr } from "./teams.mjs";

const NFLV = "https://github.com/nflverse/nflverse-data/releases/download";
const POS = ["QB", "RB", "WR", "TE"];

function splitLine(line) {
  if (!line.includes('"')) return line.split(",");
  const out = []; let cur = "", q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) { if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true; else if (c === ",") { out.push(cur); cur = ""; } else cur += c;
  }
  out.push(cur); return out;
}

// Reads only the columns we need from nflverse's very wide weekly stats file.
// Efficiency columns from the same file, kept for the player page and Compare. Missing columns read as 0, so an older file still works.
const ADV = ["attempts", "sacks_suffered", "passing_epa", "passing_cpoe", "receptions", "receiving_air_yards", "receiving_yards_after_catch", "receiving_epa", "rushing_epa", "air_yards_share", "wopr", "passing_first_downs", "rushing_first_downs", "receiving_first_downs"];
function advanced(now) {
  const g = now.length; if (!g) return null;
  const t = ADV.map(() => 0); let tg = 0, cr = 0, cpoeW = 0;
  for (const x of now) { const a = x.adv || []; for (let i = 0; i < ADV.length; i++) t[i] += a[i] || 0; tg += x.tgt; cr += x.car; cpoeW += (a[0] || 0) * (a[3] || 0); }
  const [att, sk, pepa, , rec, ray, yac, repa, rushepa, ays, wopr, pfd, rfd, refd] = t, k = (v, d) => +v.toFixed(d);
  return { g, epaDb: att + sk >= 20 ? k(pepa / (att + sk), 3) : null, cpoe: att >= 20 ? k(cpoeW / att, 1) : null, rushEpa: cr >= 10 ? k(rushepa / cr, 3) : null,
    recEpa: tg >= 6 ? k(repa / tg, 3) : null, adot: tg >= 6 ? k(ray / tg, 1) : null, yac: rec >= 4 ? k(yac / rec, 1) : null, catchRate: tg >= 6 ? k(rec / tg, 3) : null,
    ays: k(ays / g, 3), wopr: k(wopr / g, 3), fd: k((pfd + rfd + refd) / g, 1),
    // Season totals of the plays behind these rates, so a ranking can require real volume (the NFL's own leaderboard minimums) and not just two games.
    vol: { db: att + sk, car: cr, tgt: tg, rec } };
}
// The fetcher cachedConditional wants: unchanged (304), not published yet (404), or the parsed rows with the file's ETag.
export const rowsFetcher = (season) => async (etag) => {
  const r = await getTextConditional(`${NFLV}/stats_player/stats_player_week_${season}.csv`, etag, { timeout: 45000 });
  return r.text != null ? { data: parseRows(r.text), etag: r.etag } : r;
};
function parseRows(text) {
  const lines = text.split("\n"); const head = splitLine(lines[0].replace(/\r$/, ""));
  const ix = Object.fromEntries(head.map((h, i) => [h, i]));
  const need = ["player_id", "position", "season_type", "week", "team", "opponent_team", "fantasy_points_ppr", "targets", "carries", "target_share", "player_display_name"];
  for (const k of need) if (!(k in ix)) throw new Error(`nflverse stats file is missing "${k}"`);
  const out = [];
  for (let i = 1; i < lines.length; i++) {
    const l = lines[i]; if (!l) continue;
    const c = splitLine(l.replace(/\r$/, ""));
    if (c[ix.season_type] !== "REG" || !POS.includes(c[ix.position])) continue;
    out.push([c[ix.player_id], c[ix.position], +c[ix.week], abbr(c[ix.team]), abbr(c[ix.opponent_team]),
      +(+c[ix.fantasy_points_ppr] || 0).toFixed(2), +c[ix.targets] || 0, +c[ix.carries] || 0, +(+c[ix.target_share] || 0).toFixed(3), c[ix.player_display_name] || "",
      ADV.map((k) => (ix[k] != null ? +c[ix[k]] || 0 : 0))]);
  }
  return out;
}

// Recency-weighted average of everything up to now, with one pseudo-game at the position mean.
// This is the same formula the backtest used, so live numbers match what was validated.
export function ewmaNext(values, mu, half = MODEL.halfLife, w0 = MODEL.priorWeight) {
  const n = values.length; let sw = 0, sx = 0;
  for (let j = 0; j < n; j++) { const w = Math.pow(0.5, (n - 1 - j) / half); sw += w; sx += w * values[j]; }
  return (sx + w0 * mu) / (sw + w0);
}

export async function computeUsage() {
  return cached("usage-v5", 60 * 60e3, async () => {
    const state = await nflState(); const season = Number(state.season);
    const [prev, cur, players] = await Promise.all([
      cachedConditional(`rows2-${season - 1}`, 30 * 864e5, rowsFetcher(season - 1)).catch(() => []),
      cachedConditional(`rows2-${season}`, 50 * 60e3, rowsFetcher(season)),
      loadPlayers(),
    ]);
    const g2s = await gsisToSleeper(players);
    const tag = (rows, s) => rows.map((r) => [s, ...r]);
    const all = [...tag(prev, season - 1), ...tag(cur, season)];
    const byPlayer = {}, allowed = {}, thisYear = {};
    for (const r of all) {
      const [s, gsis, pos, week, team, opp, ppr, tgt, car, ts, name, adv] = r;
      (byPlayer[gsis] ||= []).push({ s, week, ppr, tgt, car, ts, opp, pos, adv });
      if (s === season) { const c = (thisYear[gsis] ||= { name: "", pos, pts: 0 }); c.pts += ppr; if (name) c.name = name; }
      const k = `${opp}|${pos}|${s}|${week}`; allowed[k] = (allowed[k] || 0) + ppr;
    }
    // Last resort for anyone neither table links: the same name and position, when exactly one Sleeper player matches.
    const byNamePos = {}; for (const [id, p] of Object.entries(players)) if (p.p !== "DEF") (byNamePos[`${normName(p.n)}|${p.p}`] ||= []).push(id);
    const used = new Set(Object.values(g2s)); let byName = 0;
    for (const [gsis, c] of Object.entries(thisYear)) {
      if (g2s[gsis] || !c.name) continue;
      const hit = byNamePos[`${normName(c.name)}|${c.pos}`];
      if (hit?.length === 1 && !used.has(hit[0])) { g2s[gsis] = hit[0]; used.add(hit[0]); byName++; }
    }
    const ids = Object.keys(thisYear), unlinked = ids.filter((g) => !g2s[g]).sort((a, b) => thisYear[b].pts - thisYear[a].pts);
    const coverage = { active: ids.length, linked: ids.length - unlinked.length, byName, missing: unlinked.slice(0, 12).map((g) => ({ n: thisYear[g].name || g, p: thisYear[g].pos, pts: +thisYear[g].pts.toFixed(1) })) };
    const out = {}; let through = 0;
    for (const [gsis, seq] of Object.entries(byPlayer)) {
      const sid = g2s[gsis]; if (!sid) continue;
      seq.sort((a, b) => a.s - b.s || a.week - b.week);
      const pos = seq[seq.length - 1].pos; const mu = MODEL.mu;
      const now = seq.filter((x) => x.s === season);
      for (const x of now) through = Math.max(through, x.week);
      out[sid] = {
        p: pos, n: seq.length, g: now.length,
        form: +ewmaNext(seq.map((x) => x.ppr), mu.form[pos]).toFixed(2), tgt: +ewmaNext(seq.map((x) => x.tgt), mu.tgt[pos]).toFixed(2),
        car: +ewmaNext(seq.map((x) => x.car), mu.car[pos]).toFixed(2), ts: +ewmaNext(seq.map((x) => x.ts), mu.ts[pos]).toFixed(3),
        ppg: now.length ? +(now.reduce((t, x) => t + x.ppr, 0) / now.length).toFixed(1) : null,
        log: now.map((x) => [x.week, x.ppr, x.tgt, x.car, x.opp]), adv: advanced(now),
      };
    }
    // How generous each defense has been to each position (recency weighted, relative to the league average)
    const seqs = {};
    for (const [k, v] of Object.entries(allowed)) { const [team, pos, s, w] = k.split("|"); (seqs[`${team}|${pos}`] ||= []).push({ s: +s, w: +w, v }); }
    const dvp = {};
    for (const [k, arr] of Object.entries(seqs)) {
      const [team, pos] = k.split("|"); arr.sort((a, b) => a.s - b.s || a.w - b.w);
      const mu = MODEL.dvpMu[pos];
      (dvp[team] ||= {})[pos] = +(ewmaNext(arr.map((x) => x.v), mu, 6, 3) / mu - 1).toFixed(3);
    }
    return { season, throughWeek: through, asOf: Date.now(), players: out, dvp, coverage };
  });
}
