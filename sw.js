// Service worker : met en cache la coquille de l'application (l'API reste réseau)
// et affiche les notifications d'alerte de prix envoyées par le serveur (Web Push).
const CACHE = "volrail-20261013220203";
const SHELL = ["./", "./index.html", "./styles.css", "./app.js", "./manifest.webmanifest", "./icons/icon.svg", "./icons/icon-180.png", "./fonts/Nunito-Variable.woff2", "./fonts/Fredoka-Variable.woff2"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  // L'API et les autres sites (liens de réservation) restent hors du cache.
  if (url.origin !== self.location.origin || url.pathname.includes("/api/") || e.request.method !== "GET") return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
        }
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }))
  );
});

self.addEventListener("push", (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { title: "VolRail", body: e.data?.text() }; }
  e.waitUntil(self.registration.showNotification(d.title || "VolRail", {
    body: d.body || "",
    tag: d.tag || "volrail",
    icon: "./icons/icon-180.png",
    badge: "./icons/icon-180.png",
    data: { url: d.url || "./" },
    renotify: true,
  }));
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const target = new URL(e.notification.data?.url || "./", self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
    const win = list.find((c) => c.url.startsWith(self.registration.scope));
    if (win) return win.navigate(target).then((w) => w && w.focus());
    return self.clients.openWindow(target);
  }));
});
