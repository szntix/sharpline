import { json, fail, store } from "./lib/util.mjs";
import { KINDS, docKey } from "./lib/capture.mjs";

// Read-only view of the saved history.
//   /api/capture                              what is saved for the current week, and when each kind last ran
//   /api/capture?kind=lines&season=2026&week=4&since=<ms>   the saved rows
export default async (req) => {
  const url = new URL(req.url), q = (k) => url.searchParams.get(k), st = store("capture");
  const meta = await st.get("meta", { type: "json" }).catch(() => null);
  const season = Number(q("season")) || meta?.season || null, week = Number(q("week")) || meta?.week || null;
  const kind = q("kind");

  if (!kind) {
    const kinds = {};
    for (const k of KINDS) {
      const d = season && week ? await st.get(docKey(season, week, k), { type: "json" }).catch(() => null) : null;
      kinds[k] = d ? { rows: d.rows.length, first: d.rows[0]?.[0] ?? null, last: d.rows.at(-1)?.[0] ?? null, bytes: JSON.stringify(d).length, full: !!d.full } : null;
    }
    return json({ ok: true, season, week, meta: meta ? { lastRun: meta.lastRun, phase: meta.phase, last: meta.last, trendsDay: meta.trendsDay } : null, kinds });
  }
  if (!KINDS.includes(kind)) return fail("Unknown kind");
  if (!season || !week) return fail("season and week are required");
  const since = Number(q("since")) || 0;
  const d = await st.get(docKey(season, week, kind), { type: "json" }).catch(() => null);
  if (!d) return json({ ok: true, season, week, kind, rows: [] });
  return json({ ok: true, season, week, kind, games: d.games, scraped: d.scraped, rows: d.rows.filter((r) => r[0] > since) });
};
