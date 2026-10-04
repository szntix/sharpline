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

// Ask the host whether a file changed since we last saw it. A 304 costs a few hundred bytes instead of the whole file, and the parse is skipped too.
// 404 means "not published yet" (a new season's stats file before its first week), which is not an error.
export async function getTextConditional(url, etag, { timeout = 20000 } = {}) {
  const r = await fetch(url, { signal: AbortSignal.timeout(timeout), headers: etag ? { "if-none-match": etag } : {} });
  if (r.status === 304) return { notModified: true };
  if (r.status === 404) return { missing: true };
  if (!r.ok) throw new Error(`${new URL(url).host} returned ${r.status}`);
  return { text: await r.text(), etag: r.headers.get("etag") || null };
}

// Like cached(), but when the data is older than maxAgeMs it first asks whether the source changed. fetcher(etag) returns one of:
//   { notModified: true }   keep what we have, and count it as checked now
//   { missing: true }       not published yet; nothing is stored, so the next call asks again
//   { data, etag }          new data
// A failed check never throws away data we already have. The data itself is rewritten only when it changed; "checked at" is a small separate record.
export async function cachedConditional(key, maxAgeMs, fetcher, { empty = [] } = {}) {
  let s = null; try { s = store("cache"); } catch {}
  let hit = null, chk = null;
  try { if (s) { hit = await s.get(key, { type: "json" }); chk = await s.get(`${key}:chk`, { type: "json" }); } } catch {}
  if (hit && Date.now() - Math.max(hit.at || 0, chk?.at || 0) < maxAgeMs) return hit.data;
  let r;
  try { r = await fetcher(hit?.etag || null); if (r.notModified && !hit) r = await fetcher(null); }
  catch (e) { if (hit) return hit.data; throw e; }
  if (r.notModified) { try { if (s) await s.setJSON(`${key}:chk`, { at: Date.now() }); } catch {} return hit.data; }
  if (r.missing) return hit ? hit.data : empty;
  try { if (s) { await s.setJSON(key, { at: Date.now(), data: r.data, etag: r.etag || null }); await s.setJSON(`${key}:chk`, { at: Date.now() }); } } catch {}
  return r.data;
}
