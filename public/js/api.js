// Thin client for the Netlify functions, plus per-user profile persistence.
const TOKEN_KEY = "sharpline.session";

export const session = {
  get() { try { return JSON.parse(localStorage.getItem(TOKEN_KEY)); } catch { return null; } },
  set(v) { try { v ? localStorage.setItem(TOKEN_KEY, JSON.stringify(v)) : localStorage.removeItem(TOKEN_KEY); } catch {} },
};

export class ApiError extends Error { constructor(msg, status) { super(msg); this.status = status; } }

export async function api(path, { method = "GET", body, auth = true } = {}) {
  const headers = { accept: "application/json" };
  const s = session.get();
  if (auth && s?.token) headers.authorization = `Bearer ${s.token}`;
  if (body !== undefined) headers["content-type"] = "application/json";
  let r;
  try { r = await fetch(`/api/${path}`, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined }); }
  catch { throw new ApiError("Can't reach the server. Check your connection.", 0); }
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new ApiError(data.error || `Request failed (${r.status})`, r.status);
  return data;
}

export const sleeperApi = (path, params = {}) => api(`sleeper?${new URLSearchParams({ path, ...params })}`);   // signed-in users only

// Profile saves are debounced so rapid edits become one write, and mirrored locally for instant loads.
let timer = null, pending = null;
export function saveProfile(username, profile, onDone) {
  try { localStorage.setItem(`sharpline.profile.${username}`, JSON.stringify(profile)); } catch {}
  pending = profile; clearTimeout(timer);
  timer = setTimeout(async () => {
    const p = pending; pending = null;
    try { await api("profile", { method: "PUT", body: p }); onDone?.(null); } catch (e) { onDone?.(e); }
  }, 900);
}
export function localProfile(username) {
  try { return JSON.parse(localStorage.getItem(`sharpline.profile.${username}`)); } catch { return null; }
}
