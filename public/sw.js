// App shell is cached for offline launch. Data calls always try the network first and fall back to the last good copy.
const SHELL = "sharpline-shell-v3-7", DATA = "sharpline-data-v3-7";
const FILES = [
 "/",
 "/fonts/archivo-latin-wdth-normal.woff2",
 "/icons/icon-192.png",
 "/icons/icon.svg",
 "/index.html",
 "/js/api.js",
 "/js/app.js",
 "/js/charts.js",
 "/js/coefs.js",
 "/js/engine.js",
 "/js/model.js",
 "/js/refresh.js",
 "/js/research.js",
 "/js/scoring.js",
 "/js/state.js",
 "/js/teams.js",
 "/js/version.js",
 "/js/ui.js",
 "/js/views/compare.js",
 "/js/views/leagues.js",
 "/js/views/moves.js",
 "/js/views/player.js",
 "/js/views/players.js",
 "/js/views/proof.js",
 "/js/views/shared.js",
 "/js/views/slate.js",
 "/js/views/week.js",
 "/manifest.webmanifest",
 "/styles.css"
];
self.addEventListener("install", (e) => { e.waitUntil(caches.open(SHELL).then((c) => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => ![SHELL, DATA].includes(k)).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET" || u.origin !== location.origin) return;
  if (u.pathname.startsWith("/api/")) {
    if (u.pathname.startsWith("/api/profile") || u.pathname.startsWith("/api/auth")) return;
    e.respondWith(fetch(e.request).then((r) => { if (r.ok) { const c = r.clone(); caches.open(DATA).then((d) => d.put(e.request, c)); } return r; })
      .catch(() => caches.match(e.request).then((r) => r || new Response(JSON.stringify({ error: "Offline" }), { status: 503, headers: { "content-type": "application/json" } }))));
    return;
  }
  e.respondWith(fetch(e.request).then((r) => { if (r.ok) { const c = r.clone(); caches.open(SHELL).then((d) => d.put(e.request, c)); } return r; }).catch(() => caches.match(e.request).then((r) => r || caches.match("/index.html"))));
});
