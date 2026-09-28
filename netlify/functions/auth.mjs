import { pbkdf2Sync, randomBytes, timingSafeEqual } from "node:crypto";
import { json, fail, store } from "./lib/util.mjs";

const SESSION_DAYS = 90;
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
    const a = Buffer.from(hash(pin, existing.salt), "hex"), b = Buffer.from(existing.hash, "hex");
    if (a.length !== b.length || !timingSafeEqual(a, b)) return fail("Wrong PIN.", 401);
  } else {
    return fail("Unknown action");
  }

  const token = randomBytes(24).toString("hex");
  await store("sessions").setJSON(token, { user: username, exp: Date.now() + SESSION_DAYS * 864e5 });
  return json({ token, username });
};
