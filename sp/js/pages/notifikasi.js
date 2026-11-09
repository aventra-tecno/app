import { store, loadNotifs, markRead } from '../store.js';
import { esc, chips, on, emptyState, ROLE_LABEL, icon, toast, toastErr, modal } from '../ui.js';
import { pushSupported, pushPermission, sendTestPush, subscribePush, isIOS, isStandalone } from '../push.js';
import { notifItem } from '../app.js';

let refresh = null;
export default {
  get refresh() { return refresh; },
  async render(el) {
    let f = 'all';
    const isOwner = store.role === 'owner';
    const opts = [['all', 'Semua'], ['unread', 'Belum dibaca'], ['masalah', 'Masalah'], ['tugas', 'Tugas'], ...(isOwner ? ['admin', 'sopir', 'kepala_gudang', 'picker', 'packing', 'supervisor', 'keuangan', 'qc', 'cs', 'marketing'].map((r) => [r, ROLE_LABEL[r]]) : [])];
    el.innerHTML = `<div class="stack">
      <div class="row nt-act"><button class="btn" id="rf" aria-label="Muat ulang">${icon('refresh', 16)}</button><button class="btn" id="hu" aria-label="Atur notifikasi melayang" title="Atur notifikasi melayang">${icon('sliders', 16)}</button><button class="btn grow" id="ra">${icon('check', 16)} Tandai semua dibaca</button></div>
      <section class="card stack" id="push"></section>
      <div id="ch"></div><div class="card flush" id="list"></div></div>`;
    // notifikasi HP otomatis aktif; kartu ini hanya muncul kalau ada yang perlu dibereskan (atau untuk super admin)
    const paintPush = () => {
      const box = el.querySelector('#push');
      const perm = pushPermission();
      const iosNeedsHome = isIOS() && !isStandalone();
      let msg = '';
      if (iosNeedsHome) msg = 'Di iPhone, notifikasi baru bisa muncul setelah aplikasi dipasang: buka di <b>Safari</b> › ketuk <b>Bagikan</b> (kotak panah ke atas) › <b>Tambah ke Layar Utama</b>, lalu buka aplikasi dari ikon itu. Butuh iOS 16.4 ke atas.';
      else if (perm === 'denied') msg = 'Notifikasi HP diblokir di perangkat ini, jadi tugas &amp; masalah tidak muncul saat aplikasi ditutup. Buka <b>Setelan HP › Aplikasi › Stok Gudang › Notifikasi</b> › izinkan, lalu buka ulang aplikasi.';
      else if (perm === 'default' && pushSupported()) msg = 'Notifikasi HP sedang meminta izin. Pilih <b>Izinkan</b> saat ditanya.';
      if (!msg) { box.classList.add('hidden'); return; }
      box.classList.remove('hidden');
      box.innerHTML = `<div class="alert yellow small" style="margin:0">${msg}</div>`;
      box.querySelector('#ptest')?.addEventListener('click', async (e) => { e.target.disabled = true; try { await subscribePush(); await sendTestPush(); toast('Tes dikirim. Tutup / kecilkan aplikasi, notifikasi muncul dalam beberapa detik.', 'ok'); } catch (err) { toastErr(err); } setTimeout(() => { e.target.disabled = false; }, 4000); });
    };
    const paint = () => {
      el.querySelector('#ch').innerHTML = chips('f', opts, f);
      let list = store.notifs;
      if (f === 'unread') list = list.filter((n) => !store.reads.has(n.id));
      else if (f === 'masalah' || f === 'tugas') list = list.filter((n) => n.level === f);
      else if (f !== 'all') list = list.filter((n) => n.source_role === f || n.target_role === f);
      el.querySelector('#list').innerHTML = list.length ? list.map(notifItem).join('') : emptyState('Tidak ada notifikasi.', 'bell');
    };
    refresh = paint;
    el.querySelector('#hu').addEventListener('click', headsUpGuide);
    on(el, 'click', '[data-chips="f"] .chip', (e, b) => { f = b.dataset.v; paint(); });
    on(el, 'click', '[data-nid]', (e, a) => markRead([+a.dataset.nid]));
    el.querySelector('#ra').onclick = () => markRead(store.notifs.map((n) => n.id));
    el.querySelector('#rf').onclick = async () => { await loadNotifs(); paint(); };
    paintPush();
    paint();
    if (!store.notifs.length) { await loadNotifs().catch(() => {}); paint(); }
  },
  destroy() { refresh = null; }
};

// 2.27: panduan supaya notifikasi HP muncul MELAYANG (heads-up) + tes langsung di HP ini.
// Melayang / tidaknya diatur Android per aplikasi, aplikasi web tidak bisa memaksanya.
async function localTest() {
  if (!('Notification' in window)) return toast('HP / browser ini tidak mendukung notifikasi', 'err');
  if (Notification.permission !== 'granted') { const p = await Notification.requestPermission(); if (p !== 'granted') return toast('Izin notifikasi belum diberikan', 'err'); }
  const reg = await navigator.serviceWorker?.ready;
  if (!reg) return toast('Buka aplikasi dari ikon yang terpasang, lalu coba lagi', 'err');
  toast('Kecilkan aplikasi sekarang — notifikasi muncul 5 detik lagi', 'ok');
  setTimeout(() => reg.showNotification('Tes notifikasi melayang', { body: 'Kalau ini turun di atas layar, notifikasi sudah benar.', icon: 'assets/icon-192.png', badge: 'assets/badge-96.png', tag: 'sg-tes', renotify: true, vibrate: [200, 80, 200], data: { link: '#/notifikasi' } }), 5000);
}
export function headsUpGuide() {
  const android = /Android/i.test(navigator.userAgent);
  modal({ title: 'Notifikasi melayang', body: `<div class="stack">
    ${android ? `<ol class="hu-steps">
      <li>Buka <b>Setelan HP › Aplikasi › Stok Gudang</b> (kalau dipasang dari Chrome dan tidak ada, pilih <b>Chrome</b>).</li>
      <li>Ketuk <b>Notifikasi</b>, pastikan <b>Izinkan notifikasi</b> menyala.</li>
      <li>Ketuk kategori notifikasinya (nama situs / Stok Gudang), lalu nyalakan <b>Pop-up di layar</b> / <b>Tampilkan sebagai pop-up</b> dan pilih <b>Peringatan / Suara</b> (bukan Senyap).</li>
      <li>Matikan <b>Penghemat baterai</b> untuk aplikasi ini supaya notifikasi tidak terlambat.</li>
    </ol>` : `<ol class="hu-steps"><li>iPhone: pasang dulu lewat Safari › Bagikan › Tambah ke Layar Utama.</li><li>Setelan › Notifikasi › Stok Gudang › nyalakan <b>Spanduk</b> (Banner) dan pilih <b>Menetap</b>.</li></ol>`}
    <div class="xs muted">Nama menu bisa sedikit berbeda di tiap merek HP (Samsung, Xiaomi, Oppo, Vivo).</div></div>`,
    actions: [{ label: 'Tutup', value: false }, { label: 'Tes di HP ini', cls: 'btn-primary', onClick: () => { localTest().catch(toastErr); return true; } }] });
}
