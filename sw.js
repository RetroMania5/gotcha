// ═══════════════════════════════════════════════════════════════════════
//  Gotcha — service worker
//
//  This exists so the game works offline. It is deliberately NOT the usual
//  cache-first worker, because that is the classic way a home-screen app
//  stops updating: cache-first serves whatever it saw the first time, for
//  ever, and every edit you push stays invisible until the user clears their
//  data. People end up deleting the app and adding it again.
//
//  So: NETWORK FIRST for anything that is code, with the cache only as a
//  fallback when the network fails. Online, you always get the newest
//  version; on a train, you get the last one that worked.
//
//  And crucially, that network fetch is {cache: "no-store"}. Plain fetch()
//  still goes through the BROWSER's HTTP cache, and GitHub Pages serves
//  everything with max-age=600 — so "network first" was happily returning a
//  stale copy it had never asked the network for. That is exactly the bug
//  this worker was written to avoid, arriving through a different door.
//
//  Pictures are the exception. There are 120, they are the bulk of the
//  download, and a card's image never changes once generated — a new set
//  means new filenames. Those are cache-first, which is safe precisely
//  because their names are stable.
// ═══════════════════════════════════════════════════════════════════════
var VERSION = "gotcha-f775120326";
var SHELL = [
  "./",
  "./index.html",
  "./css/ios.css",
  "./css/app.css",
  "./js/sfx.js",
  "./js/state.js",
  "./js/flappy.js",
  "./js/app.js",
  "./assets/manifest.js",
  "./manifest.webmanifest",
];

self.addEventListener("install", function (e) {
  // Take over straight away rather than waiting for every tab to close.
  // Without this a new version sits idle until the app is fully quit, which
  // on a phone can be days.
  self.skipWaiting();
  e.waitUntil(
    caches.open(VERSION).then(function (c) {
      // Added one at a time, so a single 404 does not throw away the whole
      // install and leave the app with no offline copy at all.
      return Promise.all(SHELL.map(function (u) {
        return c.add(u).catch(function () {});
      }));
    })
  );
});

self.addEventListener("activate", function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        if (k !== VERSION) return caches.delete(k);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener("fetch", function (e) {
  var req = e.request;
  if (req.method !== "GET") return;

  var url;
  try { url = new URL(req.url); } catch (err) { return; }
  if (url.origin !== self.location.origin) return;   // leave anything external alone

  // Card images: cache-first. Their names never change, so a cached one is
  // simply the right one, and they are the whole weight of the download.
  if (/\/assets\/.+\.(png|jpg|jpeg|webp)$/i.test(url.pathname)) {
    e.respondWith(
      caches.match(req).then(function (hit) {
        return hit || fetch(req).then(function (res) {
          if (res && res.ok) {
            var copy = res.clone();
            caches.open(VERSION).then(function (c) { c.put(req, copy); });
          }
          return res;
        });
      })
    );
    return;
  }

  // Everything else: network first, going past the HTTP cache. This is what
  // keeps edits arriving.
  e.respondWith(
    fetch(req, { cache: "no-store" }).then(function (res) {
      if (res && res.ok) {
        var copy = res.clone();
        caches.open(VERSION).then(function (c) { c.put(req, copy); });
      }
      return res;
    }).catch(function () {
      // Offline: fall back to the cache, and to the page itself for a
      // navigation, so launching from the home screen still opens something.
      return caches.match(req).then(function (hit) {
        return hit || (req.mode === "navigate" ? caches.match("./index.html") : undefined);
      });
    })
  );
});
