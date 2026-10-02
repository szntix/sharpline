import { pbkdf2Sync, randomBytes, timingSafeEqual } from "node:crypto";
import { json, fail, store } from "./lib/util.mjs";

const SESSION_DAYS = 90, MAX_FAILS = 5, WINDOW_MS = 15 * 60e3, LOCK_MS = 15 * 60e3;
const hash = (pin, salt) => pbkdf2Sync(pin, salt, 120000, 32, "sha256").toString("hex");

export default async (req) => {
  if (req.method !== "POST") return fail("Use POST", 405);
  let body;
  try { body = await req.json(); } catch { return fail("Invalid JSON"); }
  const action = body.action;
  const username = String(body.username || "").trim().toLowerCase();
  const pin = String(body.pin || "");

  if (!/^[a-z0-9_.-]{3,24}$/.test(username))
    return fail("Usernames are 3–24 characters: letters, numbers, dots, dashes or underscores.");
  if (pin.length < 4) return fail("PIN must be at least 4 characters.");

  const users = store("users");
  const existing = await users.get(username, { type: "json" }).catch(() => null);

  if (action === "register") {
    if (existing) return fail("That username is taken. Sign in instead, or pick another name.", 409);
    const invite = process.env.INVITE_CODE;
    if (invite && body.invite !== invite) return fail("Invite code doesn't match. Ask whoever runs this site for it.", 403);
    const salt = randomBytes(16).toString("hex");
    await users.setJSON(username, { salt, hash: hash(pin, salt), created: Date.now() });
  } else if (action === "login") {
    if (!existing) return fail("No account with that username.", 404);
    // A short PIN can be guessed by trying them all, so wrong guesses are counted and the account locks briefly.
    const tries = store("attempts"), now = Date.now(), rec = await tries.get(username, { type: "json" }).catch(() => null);
    if (rec?.lockedUntil > now) return fail(`Too many wrong PINs. Try again in ${Math.ceil((rec.lockedUntil - now) / 60e3)} minutes.`, 429);
    const a = Buffer.from(hash(pin, existing.salt), "hex"), b = Buffer.from(existing.hash, "hex");
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      const fresh = rec && now - rec.first < WINDOW_MS, count = (fresh ? rec.count : 0) + 1;
      await tries.setJSON(username, { count, first: fresh ? rec.first : now, lockedUntil: count >= MAX_FAILS ? now + LOCK_MS : 0 }).catch(() => {});
      return fail(count >= MAX_FAILS ? "Too many wrong PINs. This account is locked for 15 minutes." : `Wrong PIN. ${MAX_FAILS - count} ${MAX_FAILS - count === 1 ? "try" : "tries"} left.`, count >= MAX_FAILS ? 429 : 401);
    }
    if (rec) await tries.delete(username).catch(() => {});
  } else {
    return fail("Unknown action");
  }

  const token = randomBytes(24).toString("hex");
  await store("sessions").setJSON(token, { user: username, exp: Date.now() + SESSION_DAYS * 864e5 });
  return json({ token, username });
};
