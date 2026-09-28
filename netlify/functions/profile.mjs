import { json, fail, store, userFromRequest } from "./lib/util.mjs";

// Each user's leagues, rosters and settings live under their own key.
export default async (req) => {
  const user = await userFromRequest(req);
  if (!user) return fail("Sign in again — your session expired.", 401);
  const profiles = store("profiles");

  if (req.method === "GET") {
    const p = await profiles.get(user, { type: "json" }).catch(() => null);
    return json({ username: user, profile: p });
  }
  if (req.method === "PUT") {
    const text = await req.text();
    if (text.length > 2_000_000) return fail("Profile is too large.", 413);
    let profile;
    try { profile = JSON.parse(text); } catch { return fail("Invalid JSON"); }
    profile.savedAt = Date.now();
    await profiles.setJSON(user, profile);
    return json({ ok: true, savedAt: profile.savedAt });
  }
  return fail("Method not allowed", 405);
};
