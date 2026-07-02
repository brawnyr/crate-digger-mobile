// Crate Digger service worker — caches the app shell for offline launch +
// installability. Archive.org audio always streams from the network, and
// library.json (your kept crate, updated from the desktop) is always fetched
// fresh so the phone's playlist never goes stale — only the shell is cached.
const CACHE = "crate-digger-v8";
const SHELL = [
  "./", "./index.html", "./app.js", "./mode.js", "./bg.js", "./style.css",
  "./manifest.webmanifest",
  "./favicon.svg", "./icons/favicon-32.png", "./icons/favicon-48.png",
  "./icons/apple-touch-icon.png", "./icons/icon-192.png", "./icons/icon-512.png",
];

self.addEventListener("install", (e) => {
  // Cache each shell entry independently: a single missing/duplicate URL must not
  // abort the whole install (addAll() rejects atomically — one bad entry = no cache).
  e.waitUntil(caches.open(CACHE)
    .then((c) => Promise.all([...new Set(SHELL)].map((u) => c.add(u).catch(() => {}))))
    .then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;        // IA audio, fonts → network

  // The kept crate: network-first so it's fresh when online, but fall back to the
  // last-seen copy (stored under a canonical key) so the phone player still works
  // offline instead of erroring out with an empty crate.
  if (url.pathname.endsWith("library.json")) {
    e.respondWith(
      fetch(req).then((resp) => {
        if (resp && resp.ok) { const copy = resp.clone(); caches.open(CACHE).then((c) => c.put("./library.json", copy)).catch(() => {}); }
        return resp;
      }).catch(() => caches.match("./library.json"))
    );
    return;
  }

  // App shell: cache-first, populated on first use. Fall back to the shell only for
  // navigations, so a failed asset fetch never resolves to HTML with the wrong type.
  e.respondWith(
    caches.match(req).then((cached) =>
      cached || fetch(req).then((resp) => {
        if (resp && resp.ok) { const copy = resp.clone(); caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {}); }
        return resp;
      }).catch(() => (req.mode === "navigate" ? caches.match("./index.html") : Response.error())))
  );
});
