// Quiet auto-refresh. The app re-checks the feed on its own so a screen left open stays current.
// How often depends on whether games are on: every minute while a game is live, every 3 minutes within
// 90 minutes of a kickoff (or up to 4 hours after), every 10 minutes the rest of the week, and every 3 hours when games are listed but none is within a week (the off-season), and twice an hour when none is listed at all.
export function nextRefreshMs(feed, now = Date.now()) {
  if (!feed) return 10 * 60e3;                    // nothing loaded yet (a first or failed load): try again soon
  const games = feed.games || [];
  if (games.some((g) => g.status?.state === "in")) return 60e3;
  const near = games.some((g) => { const k = Date.parse(g.kickoff || ""); return k && now >= k - 90 * 60e3 && now <= k + 4 * 3600e3; });
  if (near) return 3 * 60e3;
  if (!games.length) return 30 * 60e3;           // nothing listed: the off-season, or a source hiccup, so check twice an hour
  const soon = games.some((g) => { const k = Date.parse(g.kickoff || ""); return k && Math.abs(k - now) < 7 * 864e5; });
  return soon ? 10 * 60e3 : 3 * 3600e3;
}

// What changed on screen, in a few numbers: lines, scores, status, injury designations, rankings. If this
// is unchanged the screen is not redrawn, so nothing flickers and nobody loses their place.
export function feedSignature(feed) {
  if (!feed) return "";
  return JSON.stringify([
    feed.week,
    (feed.games || []).map((g) => [g.id, g.line?.spread, g.line?.total, g.status?.state, g.homeScore, g.awayScore, g.forecast?.wind, g.forecast?.temp]),
    feed.injuries?.players, feed.ecr?.scraped, feed.ecr?.status, Object.keys(feed.ecr?.players || {}).length,
    (feed.sources || []).map((s) => s.status),
  ]);
}
