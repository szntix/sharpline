// The next few weeks for a team, in week order. A bye counts as a week, so it shows up in the week it falls rather than after the games.
// `T` is the teams payload keyed by team code: each team has `ahead` (its remaining games: week, opp, home) and `bye` (the weeks it does not play).
export function lookAhead(team, week, T, span = 3) {
  const t = T?.[team]; if (!t || !Number.isFinite(week)) return [];
  const games = new Map((t.ahead || []).map((a) => [a.week, a])), byes = new Set(t.bye || []), out = [];
  for (let k = week + 1; k <= week + span && k <= 18; k++) {
    const g = games.get(k);
    if (g) out.push({ week: k, bye: false, opp: g.opp, home: !!g.home });
    else if (byes.has(k)) out.push({ week: k, bye: true });
  }
  return out;
}
