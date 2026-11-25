// Aventra Leads · service worker (network-first, cadangan cache saat offline)
const VERSION = 'ld-1.6.0';
const SHELL = ['./', 'index.html', 'css/app.css', 'js/app.js', 'js/api.js', 'js/ui.js', 'js/config.js',
  'js/pages/ringkasan.js', 'js/pages/funnel.js', 'js/pages/leads.js', 'js/pages/klik.js', 'js/pages/log.js', 'js/pages/pengaturan.js'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  // t.js dan semua panggilan API tidak di-cache
  if (e.request.method !== 'GET' || u.origin !== location.origin || u.pathname.endsWith('/t.js')) return;
  e.respondWith(
    // selalu cek versi terbaru ke server (hindari file lama tercampur file baru)
    fetch(e.request, { cache: 'no-cache' }).then((r) => {
      const copy = r.clone();
      caches.open(VERSION).then((c) => c.put(e.request, copy));
      return r;
    }).catch(() => caches.match(e.request, { ignoreSearch: true })),
  );
});
