import { cached } from "./util.mjs";

const FIX = { LA: "LAR", OAK: "LV", SD: "LAC", STL: "LAR" };
const fix = (t) => FIX[t] || t;

export function parseCsv(text) {
  const rows = []; let row = [], cur = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true;
    else if (c === ",") { row.push(cur); cur = ""; }
    else if (c === "\n") { row.push(cur); rows.push(row); row = []; cur = ""; }
    else if (c !== "\r") cur += c;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  const [head, ...body] = rows;
  return body.filter((r) => r.length === head.length).map((r) => Object.fromEntries(head.map((h, i) => [h, r[i]])));
}

// nflverse schedule, including closing spreads/totals for finished games. The file holds every season, so it is downloaded and parsed once and shared.
const NA = (v) => (v === "" || v === "NA" || v == null ? null : Number(v));
async function allGames() {
  return cached("schedule-file", 12 * 3600e3, async () => {
    const r = await fetch("https://github.com/nflverse/nflverse-data/releases/download/schedules/games.csv");
    if (!r.ok) throw new Error(`nflverse schedule ${r.status}`);
    return parseCsv(await r.text()).filter((g) => g.game_type === "REG" && Number(g.season) >= 2015)
      .map((g) => ({ season: Number(g.season), week: Number(g.week), gameday: g.gameday, home: fix(g.home_team), away: fix(g.away_team), spread: NA(g.spread_line), total: NA(g.total_line), hs: NA(g.home_score), as: NA(g.away_score), neutral: g.location === "Neutral" }));
  });
}
export async function schedule(season) { return (await allGames()).filter((g) => g.season === Number(season)).map(({ season: _s, ...g }) => g); }

export async function weekOfGames(season, games) {
  try {
    const sch = await schedule(season);
    const idx = Object.fromEntries(sch.map((g) => [`${g.away}@${g.home}`, g.week]));
    const counts = {};
    for (const g of games) { const w = idx[`${g.away}@${g.home}`]; if (w) counts[w] = (counts[w] || 0) + 1; }
    const best = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
    return best ? Number(best[0]) : null;
  } catch { return null; }
}
