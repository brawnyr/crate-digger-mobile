// Crate Digger service worker — caches the app shell for offline launch +
// installability. Archive.org audio always streams from the network, and
// library.json (your kept crate, updated from the desktop) is always fetched
// fresh so the phone's playlist never goes stale — only the shell is cached.
const CACHE = "crate-digger-v8";
const SHELL = [
  "./", "./index.html", "./app.js", "./style.css", "./manifest.webmanifest",
  "./favicon.svg", "./icons/favicon-32.png", "./icons/favicon-48.png",
  "./icons/apple-touch-icon.png", "./icons/icon-192.png", "./icons/icon-512.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
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
  if (url.pathname.endsWith("library.json")) return;      // kept crate is always fresh
  e.respondWith(
    caches.match(req).then((cached) =>
      cached || fetch(req).then((resp) => {
        if (resp && resp.ok) { const copy = resp.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
        return resp;
      }).catch(() => caches.match("./index.html")))
  );
});
