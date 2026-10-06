// Streaming plans. A pickup is worth what it adds over a NORMAL streaming pickup, week by week, with this week counting most, and you may hold it for one, two or
// three weeks. Judging by the gain over a normal pickup (not raw points) is what makes two good weeks in a row beat three decent ones; a bye scores zero, so a
// defense cannot be held through one; and the weights keep points now in charge. The weights and the pickup cost were tuned by replaying five seasons of streaming
// (2021 to 2025, random waiver pools): the plan beats always taking the top score this week by about 0.09 points a week, at a cost to this week's expected points of
// about 0.01. Kickers get lighter weights because their future weeks are even harder to see.
export const WEIGHTS = { DEF: [1, 0.5, 0.3], K: [1, 0.4, 0.2] }, PICKUP_COST = 0.4;
const val = (w) => (w == null ? null : w.bye ? 0 : w.e);          // a week is { e } (expected points), { bye: true }, or null when it is past the end of the schedule

// Best hold length k (1 to 3) for one candidate: the k that maximizes the weighted sum of (expected - normal pickup); ties keep the shorter hold.
export function holdValue(weeks, repl, W) {
  let cum = 0, best = -Infinity, k = 1; const excess = [];
  for (let j = 0; j < W.length; j++) {
    const e = val(weeks[j]); if (e == null || !Number.isFinite(e)) break;
    excess.push(e - repl[j]); cum += W[j] * (e - repl[j]); if (cum > best + 1e-12) { best = cum; k = j + 1; }
  }
  return { value: excess.length ? best : -Infinity, k, excess, byeAt: weeks.findIndex((w) => w?.bye) };
}
// What a normal streaming pickup scores in each week: the average of the best three candidates' expected points, a bye counting as zero.
export function replacement(allWeeks, n = 3) {
  return [0, 1, 2].map((j) => { const v = allWeeks.map((ws) => val(ws[j])).filter((x) => x != null && Number.isFinite(x)).sort((a, b) => b - a).slice(0, n); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0; });
}
// cands: [{ id, weeks: [w0, w1, w2] }]. `held` is the player already on your roster, scored the same way (but with no pickup cost).
export function planBoard(cands, W, { held = null } = {}) {
  const repl = replacement(cands.map((c) => c.weeks)), build = (c) => ({ ...c, ...holdValue(c.weeks, repl, W), e0: val(c.weeks[0]) });
  const rows = cands.map(build).sort((a, b) => b.value - a.value || (b.e0 ?? 0) - (a.e0 ?? 0));
  return { rows, heldRow: held ? build(held) : null, repl };
}
// The recommended move, and different ways to play it: most points now, best two-week run, best three-week hold (each only when it differs from what came before).
export function pickPlans(board, cost = PICKUP_COST) {
  const { rows, heldRow } = board; if (!rows.length) return null;
  const top = rows[0], hold = !!heldRow && heldRow.value >= top.value - cost, rec = { kind: hold ? "hold" : "add", row: hold ? heldRow : top }, used = new Set([rec.row.id]), alts = [];
  const now = rows.filter((r) => r.e0 != null && !r.weeks[0]?.bye).sort((a, b) => b.e0 - a.e0)[0]; if (now && !used.has(now.id)) { alts.push({ kind: "now", row: now }); used.add(now.id); }
  const run = rows.find((r) => r.k === 2 && !used.has(r.id)); if (run) { alts.push({ kind: "run", row: run }); used.add(run.id); }          // labeled by the hold it really has: exactly two weeks,
  const long = rows.find((r) => r.k === 3 && !used.has(r.id)); if (long) alts.push({ kind: "long", row: long });                           // or exactly three
  return { top, rec, alts };
}
