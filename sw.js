// Offline support: keeps a copy of the app on the device. The page is fetched fresh when online
// (so updates arrive), and the saved copy is used when there is no internet.
const CACHE = "bologna-202610242302";
const INBOX = "bologna-inbox";   // a file shared into the app from WhatsApp etc. waits here for the page
const FILES = ["./", "./index.html", "./manifest.webmanifest",
  "./icons/icon-192.png", "./icons/icon-512.png", "./icons/icon-maskable-512.png", "./icons/apple-touch-icon.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE && k !== INBOX).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener("fetch", e => {
  const req = e.request, url = new URL(req.url);
  // Android "Share" -> this app: keep the file's text and open the app, which imports it
  if (req.method === "POST" && url.pathname.endsWith("/receive-file")) {
    e.respondWith((async () => {
      try {
        const form = await req.formData(), inbox = await caches.open(INBOX);
        // WhatsApp also sends the file's name as text; that text can arrive as a file of its own.
        // Read every file that came and keep the one holding the program's data.
        let chosen = null, first = null;
        for (const [, v] of form.entries()) {
          if (!v || typeof v !== "object" || !v.text) continue;
          const t = await v.text();
          if (first === null) first = t;
          if (t.indexOf('"iq-bologna"') >= 0 || t.indexOf('"sections"') >= 0) { chosen = t; break; }
        }
        const body = chosen !== null ? chosen : first;
        const note = ["title", "text", "url"].map(k => form.get(k)).filter(Boolean).join(" ");
        if (body !== null) await inbox.put("./inbox-file", new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8" } }));
        else if (note) await inbox.put("./inbox-note", new Response(note, { headers: { "Content-Type": "text/plain; charset=utf-8" } }));
      } catch (err) { /* nothing to keep: the app simply opens */ }
      return Response.redirect("./?received=1", 303);
    })());
    return;
  }
  if (req.method !== "GET" || url.origin !== location.origin) return;
  e.respondWith(
    fetch(req).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req, { ignoreSearch: true }).then(r => r || caches.match("./index.html")))
  );
});
