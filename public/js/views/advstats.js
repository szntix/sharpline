// The efficiency stats a player's page shows as tiles and the rankings page ranks. One definition, so a tile and its leaderboard can never disagree.
const ep = (v) => (v >= 0 ? "+" : "−") + Math.abs(v).toFixed(2), pc = (v) => Math.round(v * 100) + "%", n1 = (v) => v.toFixed(1), n2 = (v) => v.toFixed(2), cp = (v) => (v >= 0 ? "+" : "−") + Math.abs(v).toFixed(1);
export const ADV = {
  epaDb: { label: "EPA per dropback", fmt: ep, kind: "signed", help: "Expected points added per dropback, counting passes and sacks. Higher is better." },
  cpoe: { label: "Completion % over expected", fmt: cp, kind: "signed", help: "How much his completion percentage beats what those throws were expected to produce. Higher is better." },
  rushEpa: { label: "EPA per carry", fmt: ep, kind: "signed", help: "Expected points added per rushing attempt. Higher is better." },
  recEpa: { label: "EPA per target", fmt: ep, kind: "signed", help: "Expected points added per target. Higher is better." },
  wopr: { label: "WOPR (target and air yards share)", short: "WOPR", fmt: n2, help: "A blend of his share of the team's targets and of its air yards. Higher means a bigger role." },
  ays: { label: "Air yards share", fmt: pc, help: "His share of the team's air yards: how much of the downfield passing runs through him." },
  adot: { label: "Depth of target", fmt: n1, kind: "style", help: "How far downfield he is targeted, on average. Deeper is not better or worse, just a different role." },
  yac: { label: "Yards after catch", fmt: n1, help: "Yards gained after the catch, per catch." },
  catchRate: { label: "Catch rate", fmt: pc, help: "Receptions per target." },
  fd: { label: "First downs a game", fmt: n1, help: "First downs a game from passing, rushing and receiving." },
};
export const ADV_BY_POS = { QB: ["epaDb", "cpoe", "rushEpa", "fd"], RB: ["rushEpa", "recEpa", "fd", "catchRate"], WR: ["wopr", "ays", "adot", "yac", "recEpa", "catchRate"], TE: ["wopr", "ays", "adot", "yac", "recEpa", "catchRate"] };
export const TIERS = [[85, "Elite", "g2"], [65, "Strong", "g1"], [35, "Average", "n"], [15, "Weak", "b1"], [0, "Poor", "b2"]];
export const rankOf = (v, vals) => 1 + vals.filter((x) => x > v).length;
// Percentile among peers, a one-word grade, and a tone. Needs ten peers to grade at all. A negative EPA or CPOE is never graded good, a positive one never bad,
// and depth of target is a style (Deep, Mixed, Short) with no good or bad.
export function gradeOf(v, vals, kind) {
  const pct = vals.length >= 10 ? Math.round((100 * vals.filter((x) => x < v).length) / vals.length) : null; if (pct == null) return { pct: null, word: "", tone: "n" };
  const t = TIERS.find(([c]) => pct >= c); let word = t[1], tone = t[2];
  if (kind === "style") { word = pct >= 65 ? "Deep" : pct <= 35 ? "Short" : "Mixed"; tone = "n"; }
  if (kind === "signed") { if (v < 0 && (tone === "g1" || tone === "g2")) tone = "n"; if (v > 0 && (tone === "b1" || tone === "b2")) tone = "n"; }
  return { pct, word, tone };
}

// Who is ranked on a stat. A player needs two games AND the NFL's own leaderboard pace for that kind of play, per week of the season: 14 dropbacks for a
// quarterback, 6.25 carries for rushing, about 3 targets (the NFL's 1.875 catches) for receiving, 8 touches for first downs by a back. So a backup's garbage-time
// snaps cannot lead a list, while every starter clears the bar easily. Players below it are still shown, just not ranked.
export const MIN_GAMES = 2;
export function gateFor(pos, key) {
  if (pos === "QB") return { fields: ["db"], need: 14, label: "dropbacks" };
  if (pos === "RB") return key === "rushEpa" ? { fields: ["car"], need: 6.25, label: "carries" } : key === "fd" ? { fields: ["car", "tgt"], need: 8, label: "touches" } : { fields: ["tgt"], need: 3, label: "targets" };
  return { fields: ["tgt"], need: 3, label: "targets" };
}
export const weeksOf = (usage, x) => Math.max(usage?.throughWeek || 0, x?.adv?.g || 0);
export function pace(usage, pos, key, x) { const v = x?.adv?.vol; if (!v) return null; const gt = gateFor(pos, key); return { per: gt.fields.reduce((s, f) => s + (v[f] || 0), 0) / weeksOf(usage, x), need: gt.need, label: gt.label }; }
// Why a player is not ranked on a stat, or null when he is. Data saved before volume totals existed falls back to the games rule alone.
export function whyNot(usage, pos, key, x) {
  const a = x?.adv; if (!a) return { kind: "none" }; if (a.g < MIN_GAMES) return { kind: "games", g: a.g }; if (a[key] == null) return { kind: "plays" };
  const pc = pace(usage, pos, key, x); return pc && pc.per < pc.need ? { kind: "volume", ...pc } : null;
}
export function peerList(usage, pos, key) { const out = []; for (const [id, x] of Object.entries(usage?.players || {})) if (x.p === pos && x.adv && !whyNot(usage, pos, key, x)) out.push({ id, v: x.adv[key], g: x.adv.g }); return out; }
// Players with a number for the stat who are not ranked (too few games or too little volume), so they can still be seen.
export function unrankedList(usage, pos, key) { const out = []; for (const [id, x] of Object.entries(usage?.players || {})) { if (x.p !== pos || !x.adv || x.adv[key] == null) continue; const why = whyNot(usage, pos, key, x); if (why && (why.kind === "games" || why.kind === "volume")) out.push({ id, v: x.adv[key], g: x.adv.g, why }); } return out; }
export const peerCount = (usage, pos) => Object.values(usage?.players || {}).filter((x) => x.p === pos && x.adv && x.adv.g >= 1).length;
export const rankLabel = (v, vals) => `${vals.filter((x) => x === v).length > 1 ? "T-" : ""}${rankOf(v, vals)}`;
const pl1 = (n) => (n === 1 ? "" : "s"), r1 = (v) => (Math.round(v * 10) / 10).toString();
export const whyShort = (w) => (w.kind === "games" ? `${w.g} game${pl1(w.g)}` : `${r1(w.per)} ${w.label} a week`);
export const whySentence = (w) => (w.kind === "games" ? `has played ${w.g} game${pl1(w.g)}, and players need ${MIN_GAMES} to be ranked` : `averages ${r1(w.per)} ${w.label} a week, and ranking needs ${w.need}`);
