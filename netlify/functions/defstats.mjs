// Placeholder (tombstone). This endpoint was removed in 3.25.0: the data now rides in /api/teams. The file stays only because unzipping an
// update cannot delete old files, and a stale copy importing code that no longer exists would break the deploy. It imports nothing; the app never calls it.
export default async () => new Response(JSON.stringify({ error: "Removed in 3.25.0. The data is in /api/teams." }), { status: 410, headers: { "content-type": "application/json" } });
