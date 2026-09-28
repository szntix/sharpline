import { getStore } from "@netlify/blobs";

export const env = (k, d = undefined) => {
  try { if (typeof Netlify !== "undefined" && Netlify.env?.get(k)) return Netlify.env.get(k); } catch {}
  return process.env[k] ?? d;
};

export const json = (data, status = 200, extra = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store", ...extra },
  });

export const fail = (message, status = 400) => json({ error: message }, status);

// Named stores. "strong" consistency so a write is visible to the next read.
// Falls back to memory when Blobs isn't configured (local development and tests).
const mem = new Map();
const memStore = (name) => ({
  async get(k) { const v = mem.get(`${name}/${k}`); return v === undefined ? null : JSON.parse(v); },
  async setJSON(k, v) { mem.set(`${name}/${k}`, JSON.stringify(v)); },
  async delete(k) { mem.delete(`${name}/${k}`); },
  async list({ prefix = "" } = {}) { return { blobs: [...mem.keys()].filter((k) => k.startsWith(`${name}/${prefix}`)).map((k) => ({ key: k.slice(name.length + 1) })) }; },
});
export const store = (name) => { try { return getStore({ name, consistency: "strong" }); } catch { return memStore(name); } };

export async function cached(key, maxAgeMs, loader) {
  let s = null;
  try { s = store("cache"); } catch {}
  try {
    const hit = s && (await s.get(key, { type: "json" }));
    if (hit && Date.now() - hit.at < maxAgeMs) return hit.data;
  } catch {}
  const data = await loader();
  try { if (s) await s.setJSON(key, { at: Date.now(), data }); } catch {}
  return data;
}

const SLEEPER = "https://api.sleeper.app/v1";
export async function sleeper(path) {
  const r = await fetch(`${SLEEPER}/${path}`, { headers: { accept: "application/json" } });
  if (!r.ok) throw new Error(`Sleeper ${path} returned ${r.status}`);
  return r.json();
}

export async function nflState() {
  return cached("nfl-state", 60 * 60 * 1000, () => sleeper("state/nfl"));
}

// ---------- outbound requests ----------
// No custom User-Agent on purpose: ESPN's edge rejects branded and browser-style agents.
export async function getJson(url, { timeout = 12000, retries = 1 } = {}) {
  let last;
  for (let i = 0; i <= retries; i++) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(timeout), headers: { accept: "application/json" } });
      if (!r.ok) throw new Error(`${new URL(url).host} returned ${r.status}`);
      return await r.json();
    } catch (e) { last = e; await new Promise((res) => setTimeout(res, 400)); }
  }
  throw last;
}
export async function getText(url, { timeout = 20000 } = {}) {
  const r = await fetch(url, { signal: AbortSignal.timeout(timeout) });
  if (!r.ok) throw new Error(`${new URL(url).host} returned ${r.status}`);
  return r.text();
}

// A source is fresh inside its window, aging for a few windows after, then stale.
export function freshness(asOf, ttlMs) {
  if (!asOf) return "missing";
  const age = Date.now() - asOf;
  return age <= ttlMs ? "fresh" : age <= ttlMs * 4 ? "aging" : "stale";
}

// ---------- auth ----------
export async function userFromRequest(req) {
  const h = req.headers.get("authorization") || "";
  const token = h.startsWith("Bearer ") ? h.slice(7) : null;
  if (!token) return null;
  try {
    const sess = await store("sessions").get(token, { type: "json" });
    if (!sess || sess.exp < Date.now()) return null;
    return sess.user;
  } catch { return null; }
}

// ---------- names ----------
export function normName(n) {
  return String(n || "")
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/\b(jr|sr|ii|iii|iv|v)\b\.?/g, "")
    .replace(/[^a-z]/g, "");
}
