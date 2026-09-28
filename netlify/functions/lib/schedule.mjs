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

// nflverse schedule, including closing spreads/totals for finished games.
export async function schedule(season) {
  return cached(`schedule-${season}`, 12 * 3600e3, async () => {
    const r = await fetch("https://github.com/nflverse/nflverse-data/releases/download/schedules/games.csv");
    if (!r.ok) throw new Error(`nflverse schedule ${r.status}`);
    return parseCsv(await r.text())
      .filter((g) => Number(g.season) === Number(season) && g.game_type === "REG")
      .map((g) => ({
        week: Number(g.week), gameday: g.gameday, home: fix(g.home_team), away: fix(g.away_team),
        spread: g.spread_line === "" || g.spread_line === "NA" ? null : Number(g.spread_line),
        total: g.total_line === "" || g.total_line === "NA" ? null : Number(g.total_line),
        hs: g.home_score === "" || g.home_score === "NA" ? null : Number(g.home_score),
        as: g.away_score === "" || g.away_score === "NA" ? null : Number(g.away_score),
      }));
  });
}

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
