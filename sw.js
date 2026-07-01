// Crate Digger service worker — caches the app shell for offline launch +
// installability. The crate log (library.json) and all Archive.org / GitHub
// traffic always go to the network so data stays fresh.
const CACHE = "crate-digger-v2";
const SHELL = [
  "./", "./index.html", "./app.js", "./style.css", "./manifest.webmanifest",
  "./icons/icon-192.png", "./icons/icon-512.png",
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
  if (req.method !== "GET") return;                       // never intercept GitHub writes
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;        // IA audio/API, GitHub, fonts → network
  if (url.pathname.endsWith("library.json")) return;      // log is always fresh
  e.respondWith(
    caches.match(req).then((cached) =>
      cached || fetch(req).then((resp) => {
        if (resp && resp.ok) { const copy = resp.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
        return resp;
      }).catch(() => caches.match("./index.html")))
  );
});
