/* EatWell Barbados — service worker
 *
 * Deliberately network-first for the page and for merchants.json, so that
 * publishing a new merchants.json to GitHub shows up immediately. A naive
 * cache-first worker would make the publish workflow look broken.
 * Everything else (icons, manifest) is cache-first, and cross-origin
 * requests (Google Maps, OpenStreetMap tiles, cdnjs) are left alone.
 */
const VERSION = "eatwell-2026-10-19";
const SHELL = [
  "./",
  "./index.html",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png",
  "./icon-maskable-512.png"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(VERSION)
      .then(c => c.addAll(SHELL))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting())   /* a missing optional file must not block install */
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function cachePut(request, response){
  const copy = response.clone();
  caches.open(VERSION).then(c => c.put(request, copy)).catch(() => {});
  return response;
}

self.addEventListener("fetch", event => {
  const req = event.request;
  if (req.method !== "GET") return;

  let url;
  try { url = new URL(req.url); } catch (e) { return; }
  if (url.origin !== self.location.origin) return;   /* maps, tiles, CDN: untouched */

  const isPage = req.mode === "navigate" || url.pathname.endsWith("/index.html");
  const isData = url.pathname.endsWith("/merchants.json");

  if (isPage || isData) {
    /* network first — always prefer what was just published */
    event.respondWith(
      fetch(req)
        .then(res => cachePut(req, res))
        .catch(() => caches.match(req).then(hit => hit || caches.match("./index.html")))
    );
    return;
  }

  /* everything else same-origin: cache first, fill on miss */
  event.respondWith(
    caches.match(req).then(hit => hit || fetch(req).then(res => cachePut(req, res)))
  );
});
