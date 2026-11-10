// Service worker: aplikasi tetap terbuka cepat & bisa dipasang (PWA).
// Naikkan VERSION setiap kali kamu upload perubahan file ke GitHub.
const VERSION = 'v2.37.0';
const CACHE = 'stok-gudang-' + VERSION;
const SHELL = [
  './', 'index.html', 'manifest.json', 'css/app.css',
  'js/app.js', 'js/config.js', 'js/supa.js', 'js/ui.js', 'js/nav.js', 'js/store.js', 'js/auth.js', 'js/tour.js', 'js/scanner.js', 'js/shopee.js', 'js/labels.js', 'js/paging.js', 'js/version.js', 'js/push.js', 'js/xlsx-writer.js', 'js/excel-harga.js', 'js/billing.js', 'js/excel-rekap.js', 'js/pdf-read.js', 'js/modules.js', 'js/order-view.js', 'js/shortcuts.js', 'js/pages/dash-staff.js', 'js/install.js', 'js/daftar-file.js', 'js/pdf-mini.js', 'js/rak-pilih.js', 'js/pct.js', 'js/products-cache.js',
  'assets/icon-192.png', 'assets/logo.svg', 'assets/icon-512.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // data Supabase selalu langsung dari server
  if (url.hostname.endsWith('supabase.co') || url.hostname.endsWith('supabase.in')) return;
  // info versi: selalu langsung dari server
  if (url.origin === self.location.origin && url.pathname.endsWith('/version.json')) return;
  // file aplikasi sendiri: ambil versi terbaru (cek ulang ke server, bukan cache browser), kalau offline pakai cache
  if (url.origin === self.location.origin) {
    const net = req.mode === 'navigate' ? fetch(req) : fetch(req, { cache: 'no-cache' });   // halaman utama tidak boleh diberi opsi
    e.respondWith(net.then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(req, copy));
      return res;
    }).catch(() => caches.match(req).then((r) => r || caches.match('index.html'))));
    return;
  }
  // library CDN & font: cache dulu
  e.respondWith(caches.match(req).then((r) => r || fetch(req).then((res) => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
    return res;
  })));
});

// push dari server: tampil walau aplikasi ditutup
self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (_) { d = { title: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(d.title || 'Stok Gudang', {
    body: d.body || '',
    icon: 'assets/icon-192.png',
    badge: 'assets/badge-96.png',
    tag: d.tag || undefined,
    renotify: true,
    silent: false,
    timestamp: d.ts || Date.now(),
    requireInteraction: d.level === 'masalah',          // masalah tetap terlihat sampai disentuh
    vibrate: d.level === 'masalah' ? [300, 120, 300, 120, 300] : [200, 80, 200],
    actions: [{ action: 'open', title: 'Buka' }],
    data: { link: d.link || '#/notifikasi' }
  }));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const link = e.notification.data?.link || '#/notifikasi';
  e.waitUntil(self.clients.matchAll({ type: 'window' }).then((list) => {
    for (const c of list) { return c.focus().then((w) => (w || c).navigate(c.url.split('#')[0] + link)).catch(() => c.focus()); }
    return self.clients.openWindow('./' + link);
  }));
});
