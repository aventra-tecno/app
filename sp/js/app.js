import { supa, configured, rpc, logEvent, logPage } from './supa.js';
import { store, loadNotifs, unreadCount, markRead, loadProfiles, onEvt, emit } from './store.js';
import { PAGES, TABS, HOME, canOpen, menuFor, isLocked, tabsFor } from './nav.js';
import { loadModules, modOn, paywall, ROLE_MOD } from './modules.js';
import { esc, icon, iconSolid, toast, toastErr, ago, ROLE_LABEL, ROLE_COLOR, modal, rp, fmtDate, todayStr, addDays } from './ui.js';
import { renderLogin, renderPending } from './auth.js';
import { runTour, mainSteps } from './tour.js';
import { APP_NAME } from './config.js';
import { CURRENT, versionLabel, deviceLabel, watchUpdates, fetchLatest, getLatest, isOutdated, applyUpdate } from './version.js';
import { setFallbackScan, showScanResult } from './scanner.js';
import { GROUP_STYLE } from './pages/menu.js';
import { startPaging } from './paging.js';
import { initPush, unsubscribePush } from './push.js';

const root = document.getElementById('app');
let current = { page: null, mod: null };
let channel = null;
let booted = false;
let routeSeq = 0;
let hashBound = false;
let beforeBell = null;

// ---------- PWA ----------
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  window.__installPrompt = e;
  document.getElementById('install-btn')?.classList.remove('hidden');
  emit('installable');
});

// ---------- auth ----------
if (!configured) renderLogin(root);
else {
  supa.auth.onAuthStateChange((event, session) => {
    if (event === 'PASSWORD_RECOVERY') { booted = false; renderLogin(root, { recovery: true }); return; }
    if (event === 'SIGNED_OUT' || !session) { booted = false; teardown(); renderLogin(root); return; }
    if ((event === 'SIGNED_IN' || event === 'INITIAL_SESSION') && !booted) { booted = true; setTimeout(() => boot(session), 0); }
  });
}

function teardown() {
  if (channel) { supa.removeChannel(channel); channel = null; }
  setFallbackScan(null);
  Object.assign(store, { session: null, profile: null, role: null, superadmin: false, notifs: [], reads: new Set() });
}

// kunci ukuran layar: cubit 2 jari & ketuk 2x tidak memperbesar / memperkecil (iPhone mengabaikan meta viewport)
(function lockZoom() {
  const stop = (e) => { if (e.cancelable) e.preventDefault(); };
  ['gesturestart', 'gesturechange', 'gestureend'].forEach((ev) => document.addEventListener(ev, stop, { passive: false }));
  document.addEventListener('touchmove', (e) => { if (e.touches.length > 1 || (e.scale && e.scale !== 1)) stop(e); }, { passive: false });
  // ketuk 2x untuk zoom dimatikan lewat CSS touch-action: manipulation (klik cepat tetap jalan)
  // ctrl + roda mouse / ctrl +/- di laptop tetap boleh (aksesibilitas browser), hanya sentuhan yang dikunci
})();

async function boot(session) {
  store.session = session;
  try {
    const { data: profile, error } = await supa.from('profiles').select('*').eq('id', session.user.id).maybeSingle();
    if (error) throw error;
    if (!profile || profile.role === 'pending' || !profile.active) return renderPending(root, profile);
    store.profile = profile;
    if (profile.role === 'superadmin') {
      // super admin: pilih mau masuk sebagai jabatan apa (berlaku sampai tab ditutup / ganti jabatan)
      // super admin punya menu sendiri; "masuk sebagai jabatan" dipilih dari menu itu (berlaku sampai tab ditutup)
      let picked = null; try { picked = sessionStorage.getItem('sa-role'); } catch (_) {}
      if (!picked || (picked !== 'superadmin' && picked !== profile.act_as)) picked = 'superadmin';
      if (picked === 'superadmin' && profile.act_as && profile.act_as !== 'owner') await rpc('sa_act_as', { p_role: 'superadmin' }).catch(() => {});
      store.role = picked; store.superadmin = true;
    } else {
      store.role = profile.role; store.superadmin = false;
      let logged = null; try { logged = sessionStorage.getItem('logged-' + profile.id); } catch (_) {}
      if (!logged) { logEvent('login', 'Masuk aplikasi · ' + versionLabel() + ' · ' + deviceLabel()); try { sessionStorage.setItem('logged-' + profile.id, '1'); } catch (_) {} }
    }
    // dimuat bersamaan supaya aplikasi cepat terbuka
    const [{ data: settings }] = await Promise.all([supa.from('settings').select('*').eq('id', 1).single(), loadModules().catch(() => {}), loadProfiles().catch(() => {})]);
    store.settings = settings || {};
    if (!store.profile.tab_prefs) { try { store.profile.tab_prefs = JSON.parse(localStorage.getItem('tab-prefs-' + store.profile.id) || 'null'); } catch (_) {} }
    renderShell();
    if (!hashBound) { window.addEventListener('hashchange', route); hashBound = true; }
    await route();
    subscribe();
    rpc('report_version', { p_version: CURRENT.version, p_device: deviceLabel() }).catch(() => {});
    watchUpdates();
    if (!store.superadmin) initPush();
    loadNotifs().catch(() => {});
    if (store.role === 'owner') billBar();
    if (store.role !== 'superadmin' && profile.tour_auto && !profile.tour_done?.main) setTimeout(() => startMainTour(true), 600);
  } catch (e) {
    toastErr(e);
    root.innerHTML = `<div class="boot"><div class="boot-logo">SG</div><div class="boot-text">Gagal memuat data. Periksa koneksi, lalu muat ulang.</div><button class="btn" onclick="location.reload()">Muat ulang</button></div>`;
  }
}

// ---------- super admin ----------
// kembali ke menu super admin (dari "masuk sebagai jabatan"), lalu buka halaman tertentu
async function backToSA(page = 'superadmin') {
  try { await rpc('sa_act_as', { p_role: 'superadmin' }); } catch (e) { return toastErr(e); }
  try { sessionStorage.setItem('sa-role', 'superadmin'); } catch (_) {}
  location.hash = '#/' + page; location.reload();
}

// ---------- shell ----------
// menu bawah HP: pilihan sendiri (Lainnya > Atur menu bawah) atau bawaan jabatan
function tabsHtml(role) {
  return tabsFor(role, store.profile.tab_prefs).filter((k) => role === 'owner' || !isLocked(k)).map((k) => {
    const pg = PAGES[k];
    return `<a class="tab" href="#/${k}" data-nav="${k}" data-tour="nav-${k}"><span class="ic">${icon(pg.icon, 22)}<span class="ic-fill">${iconSolid(pg.icon, 22)}</span>${k === 'masalah' ? '<span class="badge-dot hidden" data-mbadge></span>' : ''}${isLocked(k) ? `<span class="tab-lock">${icon('lock', 10, 2.6)}</span>` : ''}${k === 'notifikasi' ? '<span class="badge-dot hidden" data-badge></span>' : ''}</span><span class="lbl">${esc(pg.short || pg.label)}</span></a>`;
  }).join('') + `<a class="tab" href="#/menu" data-nav="menu" data-tour="nav-lainnya"><span class="ic">${icon('grid', 22)}<span class="ic-fill">${iconSolid('grid', 22)}</span></span><span class="lbl">Lainnya</span></a>`;
}
onEvt('tabs', () => {
  const bar = document.querySelector('.tabbar'); if (!bar) return;
  bar.innerHTML = tabsHtml(store.role);
  const page = (location.hash.replace(/^#\//, '').split('?')[0]) || HOME[store.role];
  bar.querySelectorAll('[data-nav]').forEach((a) => a.classList.toggle('on', a.dataset.nav === page));
  paintBadge();
});
const GROUP_ICON = { Penjualan: 'bag', Gudang: 'box', Keuangan: 'wallet', Pengaturan: 'gear', Saya: 'user', 'Super admin': 'shield' };
const ini = (n) => (n || 'SG').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
function renderShell() {
  const role = store.role, p = store.profile;
  const menu = menuFor(role);
  // menu samping (laptop): < 12 menu = semua terbuka; >= 12 menu = per kategori (buka-tutup dengan panah)
  const ACC = menu.length >= 12;
  const link = (m) => `<a class="side-link ${m.locked ? 'locked' : ''}" href="#/${m.key}" data-nav="${m.key}" data-tour="nav-${m.key}" data-q="${esc((m.label + ' ' + (m.short || '') + ' ' + (m.group || '')).toLowerCase())}" title="${esc(m.label)}">${icon(m.icon, 18)}<span class="sl-t">${esc(m.label)}</span>${m.locked ? `<span class="lk" title="Terkunci">${icon('lock', 14, 2.2)}</span>` : ''}<span class="cnt hidden" data-cnt="${m.key}"></span></a>`;
  const groups = [];
  menu.forEach((m) => { const g = m.group || ''; let x = groups.find((y) => y.g === g); if (!x) groups.push((x = { g, items: [] })); x.items.push(m); });
  const side = groups.map(({ g, items }) => {
    if (!g) return `<div class="side-sec flat">${items.map(link).join('')}</div>`;
    const c = (GROUP_STYLE[g] || [g, '#6B706C'])[1];
    const gi = `<i class="sg-ic" style="--gc:${c}">${icon(GROUP_ICON[g] || 'grid', 14, 2.2)}</i>`;
    return `<div class="side-sec ${ACC ? 'acc' : ''}" data-g="${esc(g)}">
      ${ACC ? `<button class="side-group sg-btn" data-gt="${esc(g)}" aria-expanded="false">${gi}<span class="sl-t">${esc(g)}</span><small>${items.length}</small><span class="sg-chev">${icon('chev', 15, 2.4)}</span></button>`
            : `<div class="side-group">${gi}<span class="sl-t">${esc(g)}</span></div>`}
      <div class="side-items"><div>${items.map(link).join('')}</div></div></div>`;
  }).join('');
  const tabs = tabsHtml(role);

  root.innerHTML = `<div class="shell">
    <nav class="sidebar" aria-label="Menu utama">
      <div class="side-brand"><span class="logo logo-img"><img src="assets/logo.svg" alt="" width="36" height="36"></span><div class="sb-t"><b>${esc(store.settings.nama_toko || APP_NAME)}</b><span>${esc(ROLE_LABEL[role])} · ${esc(p.full_name)}</span></div>
        <button class="side-mini-btn" data-mini title="Kecilkan menu" aria-label="Kecilkan / lebarkan menu">${icon('chev', 16, 2.4)}</button></div>
      <label class="side-search" title="Cari menu">${icon('search', 16)}<input id="side-q" placeholder="Cari menu…" autocomplete="off" aria-label="Cari menu"><kbd>/</kbd></label>
      <div class="side-menu">${side}<div class="side-none hidden">Menu tidak ditemukan</div></div>
      <div class="side-foot"><button class="side-link" data-logout style="background:none;border:0;cursor:pointer;width:100%">${icon('logout', 18)}<span>Keluar</span></button>
        <button class="side-ver" data-ver title="Info versi aplikasi">${icon('refresh', 14)}<span>Versi ${esc(versionLabel())}</span></button></div>
    </nav>
    <div class="main">
      <header class="topbar">
        <button class="tb-logo" data-me aria-label="Profil saya">${esc(ini(p.full_name))}</button>
        <div class="grow tb-text"><div class="tb-id"><b>${esc(p.full_name)}</b><span class="role-pill">${esc(ROLE_LABEL[role])}</span></div><div class="t-sub" id="t-sub"><span class="crumb" id="t-crumb"></span><span class="who">${esc(ROLE_LABEL[role])} · ${esc(p.full_name)}</span><span class="t-ver" data-ver>${esc(versionLabel())}</span></div><h1 id="t-title">${esc(APP_NAME)}</h1></div>
        <span class="tb-date">${icon('calendar', 16)}${esc(new Intl.DateTimeFormat('id-ID', { timeZone: 'Asia/Jakarta', weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }).format(new Date()))}</span>
        ${role === 'owner' ? `<a class="icon-btn tb-bill" href="#/tagihan" data-bill aria-label="Tagihan" title="Tagihan">${icon('receipt')}<span class="badge-dot hidden" data-bill-badge></span></a>` : ''}
        <button class="icon-btn" data-help data-tour="help" aria-label="Bantuan halaman ini">${icon('help')}</button>
        <button class="icon-btn bell" data-bell data-tour="bell" aria-label="Notifikasi">${icon('bell')}<span class="badge-dot hidden" data-badge></span></button>
        <button class="tb-user" data-me aria-haspopup="menu" aria-label="Profil saya"><span class="av">${esc(ini(p.full_name))}</span><span class="tb-u-txt"><b>${esc(p.full_name)}</b><small>${esc(ROLE_LABEL[role])}</small></span>${icon('chev', 16)}</button>
      </header>
      ${store.superadmin && role !== 'superadmin' ? `<div class="sa-bar">${icon('shield', 16)}<span><b>Super admin</b> · sedang masuk sebagai <b>${esc(ROLE_LABEL[role])}</b></span><button class="btn btn-ghost" data-sa-switch2>Ganti jabatan</button><button class="btn" data-sa>Kembali ke super admin</button></div>` : ''}
      <main class="view" id="view" tabindex="-1"></main>
    </div>
    <nav class="tabbar" aria-label="Menu bawah">${tabs}</nav>
  </div>`;

  root.querySelector('[data-logout]').onclick = logout;
  sideInit();
  root.querySelector('[data-bell]').onclick = toggleBell;
  root.querySelector('[data-sa]')?.addEventListener('click', () => backToSA());
  root.querySelector('[data-sa-switch2]')?.addEventListener('click', () => backToSA('sa-jabatan'));
  root.querySelectorAll('[data-ver]').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); showVersion(); }));
  root.querySelectorAll('[data-me]').forEach((b) => { b.onclick = (e) => toggleMe(e.currentTarget); b.onkeydown = (e) => { if (e.key === 'Enter') toggleMe(b); }; });
  startPaging(root.querySelector('.main'));
  root.querySelector('[data-help]').onclick = () => {
    if (current.mod?.tour?.length) runTour({ steps: current.mod.tour });
    else startMainTour(false);
  };
  onEvt('notifs', paintBadge);
  setFallbackScan(globalScan);
}

// scan alat (USB/Bluetooth) di halaman yang BUKAN menu scan: ditolak, dengan petunjuk menu yang benar
const SCAN_PAGES = ['catat', 'ambil', 'packing', 'terima', 'retur', 'cek', 'qc'];
function globalScan() {
  const menus = SCAN_PAGES.filter((k) => canOpen(k, store.role)).map((k) => PAGES[k].label);
  return { ok: false, title: 'Halaman ini bukan menu scan', info: 'Scan diabaikan. Buka menu: ' + menus.join(', ') + '.' };
}

// 2.23: jumlah masalah yang BELUM ditangani (owner) -> badge + gema di menu Masalah (menu bawah, menu samping, Lainnya, menu pintas)
store.masalahN = 0;
let masalahAt = 0;
export async function refreshMasalah(force = false) {
  if (store.role !== 'owner' || (!force && Date.now() - masalahAt < 30000)) return paintMasalah();
  masalahAt = Date.now();
  try { const { count, error } = await supa.from('anomalies').select('id', { count: 'exact', head: true }).eq('resolved', false); if (!error) store.masalahN = count || 0; } catch (_) {}
  paintMasalah();
}
function paintMasalah() {
  const n = store.role === 'owner' ? store.masalahN || 0 : 0, t = n > 99 ? '99+' : String(n);
  document.querySelectorAll('[data-cnt="masalah"], [data-mbadge]').forEach((c) => { c.textContent = t; c.classList.toggle('hidden', !n); });
  document.querySelectorAll('[data-nav="masalah"], .menu-tile[href="#/masalah"]').forEach((a) => a.classList.toggle('has-masalah', n > 0));
}
addEventListener('masalah-changed', () => refreshMasalah(true));
addEventListener('masalah-paint', () => paintMasalah());

// 2.27: notifikasi melayang (heads-up) di dalam aplikasi, seperti notifikasi HP: turun dari atas, bisa diketuk / digeser ke atas
export function headsUp(n) {
  document.querySelector('.hu')?.remove();
  const el = document.createElement('div');
  el.className = 'hu' + (n.level === 'masalah' ? ' hu-bad' : '');
  el.setAttribute('role', 'alert');
  el.innerHTML = `<span class="hu-ic">${icon(n.level === 'masalah' ? 'alert' : 'bell', 20, 2.2)}</span>
    <div class="hu-t"><div class="hu-app">${esc(APP_NAME)} · sekarang</div><b>${esc(n.title)}</b>${n.body ? `<span>${esc(n.body)}</span>` : ''}</div>`;
  document.body.appendChild(el);
  try { navigator.vibrate?.(n.level === 'masalah' ? [200, 80, 200] : 120); } catch (_) {}
  requestAnimationFrame(() => el.classList.add('on'));
  const close = () => { el.classList.remove('on'); setTimeout(() => el.remove(), 300); };
  let t = setTimeout(close, n.level === 'masalah' ? 8000 : 5000), y0 = null;
  el.addEventListener('click', () => { close(); if (n.id) markRead([n.id]).catch?.(() => {}); location.hash = n.link || '#/notifikasi'; });
  el.addEventListener('touchstart', (e) => { y0 = e.touches[0].clientY; clearTimeout(t); }, { passive: true });
  el.addEventListener('touchmove', (e) => { if (y0 == null) return; const dy = Math.min(0, e.touches[0].clientY - y0); el.style.transform = `translateY(${dy}px)`; }, { passive: true });
  el.addEventListener('touchend', (e) => { const dy = (e.changedTouches[0].clientY - (y0 ?? 0)); el.style.transform = ''; y0 = null; if (dy < -30) close(); else t = setTimeout(close, 3000); });
}

function paintBadge() {
  const n = unreadCount();
  document.querySelectorAll('[data-badge]').forEach((b) => { b.textContent = n > 99 ? '99+' : n; b.classList.toggle('hidden', !n); });
  paintMasalah();
  const bp = document.getElementById('bell-panel');
  if (bp) renderBellBody(bp);
  if (current.page === 'notifikasi' && current.mod?.refresh) current.mod.refresh();
}

async function logout() {
  if (await modal({ title: 'Keluar dari aplikasi?', body: '<p style="margin:0">Kamu perlu login lagi dengan email &amp; password.</p>', actions: [{ label: 'Batal', value: false }, { label: 'Keluar', cls: 'btn-dark', value: true }] })) {
    if (!store.superadmin) await Promise.race([supa.rpc('log_event', { p_kind: 'login', p_summary: 'Keluar aplikasi' }), new Promise((r) => setTimeout(r, 1500))]).catch(() => {});
    try { sessionStorage.removeItem('logged-' + store.profile.id); sessionStorage.removeItem('sa-role'); } catch (_) {}
    await unsubscribePush();
    await supa.auth.signOut();
    location.hash = '';
  }
}

// ---------- info versi ----------
async function showVersion() {
  const l = await fetchLatest();
  const old = isOutdated(CURRENT.version, l) && CURRENT.build !== 'dev';
  const fmt = (d) => { try { return d ? new Date(d).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '–'; } catch (_) { return d; } };
  const r = await modal({
    title: 'Versi aplikasi',
    body: `<div class="stack">
      <div class="ver-big ${old ? 'old' : 'ok'}"><span>Dipakai di perangkat ini</span><b>${esc(versionLabel())}</b><small>${old ? 'Ada versi lebih baru' : 'Sudah versi terbaru'}</small></div>
      <div class="line-row"><span>Versi terbaru di server</span><b class="mono">${l ? 'v' + esc(l.version) : '–'}</b></div>
      <div class="line-row"><span>Diterbitkan</span><b>${esc(fmt(l?.date))}</b></div>
      <div class="line-row"><span>Perangkat</span><b>${esc(deviceLabel())}</b></div>
    </div>`,
    actions: [{ label: 'Tutup', value: null }, { label: old ? 'Perbarui sekarang' : 'Muat ulang', cls: 'btn-primary', value: 'upd' }]
  });
  if (r === 'upd') applyUpdate();
}

// ---------- menu profil (pojok kanan atas / logo) ----------
function meMenuHtml() {
  const p = store.profile, role = store.role;
  const items = [['akun', 'user', 'Profil & ganti password'], ['pengaturan-scanner', 'bt', 'Pengaturan scanner'], ['panduan', 'compass', 'Panduan aplikasi'], ['notifikasi', 'bell', 'Semua notifikasi']];
  if (role === 'superadmin') items.splice(1, 1, ['log', 'clock', 'Log aktivitas']);
  if (role === 'owner') items.unshift(['tagihan', 'receipt', 'Tagihan aplikasi', billUnpaid ? `<span class="tag red">${billUnpaid} belum dibayar</span>` : '']);
  if (role === 'owner') items.push(['modul', 'lock', 'Menu tambahan'], ['log', 'clock', 'Log aktivitas'], ['pengaturan', 'gear', 'Pengaturan toko'], ['pegawai', 'users', 'Pegawai & jabatan']);
  return `<div class="me-head"><span class="av">${esc(ini(p.full_name))}</span><div style="min-width:0"><b>${esc(p.full_name)}</b><div class="xs muted" style="overflow-wrap:anywhere">${esc(p.email || store.session?.user?.email || '')}</div><span class="tag dark" style="margin-top:6px">${esc(ROLE_LABEL[role])}</span></div></div>
    <div class="me-list">${store.superadmin && role !== 'superadmin' ? `<button class="me-item" data-sa-back style="color:#A63A2A">${icon('shield', 18)}<span>Kembali ke super admin</span></button><button class="me-item" data-sa-switch style="color:#A63A2A">${icon('users', 18)}<span>Ganti jabatan</span></button>` : role === 'superadmin' ? `<a class="me-item" href="#/sa-jabatan" data-close style="color:#A63A2A">${icon('users', 18)}<span>Masuk sebagai jabatan</span></a>` : ''}${items.map(([k, ic, l, extra]) => `<a class="me-item" href="#/${k}" data-close>${icon(ic, 18)}<span class="grow">${l}</span>${extra || ''}</a>`).join('')}
    <button class="me-item" data-ver-me>${icon('refresh', 18)}<span class="grow">Versi aplikasi</span><span class="small muted mono">${esc(versionLabel())}</span></button>
    <button class="me-item danger" data-lo>${icon('logout', 18)}<span>Keluar</span></button></div>`;
}
function toggleMe(btn) {
  document.getElementById('bell-panel')?.remove();
  if (window.matchMedia('(max-width: 899px)').matches) {
    modal({ title: 'Profil saya', body: `<div class="me-sheet">${meMenuHtml()}</div>`, actions: [], onOpen: (ov, close) => {
      ov.querySelectorAll('[data-close]').forEach((a) => a.addEventListener('click', () => close(null)));
      ov.querySelector('[data-lo]').onclick = () => { close(null); logout(); };
      ov.querySelector('[data-sa-switch]')?.addEventListener('click', () => { close(null); backToSA('sa-jabatan'); });
      ov.querySelector('[data-sa-back]')?.addEventListener('click', () => { close(null); backToSA(); });
      ov.querySelector('[data-ver-me]').addEventListener('click', () => { close(null); showVersion(); });
    } });
    return;
  }
  const ex = document.getElementById('me-panel');
  if (ex) { ex.remove(); return; }
  const panel = document.createElement('div');
  panel.id = 'me-panel'; panel.className = 'me-panel'; panel.setAttribute('role', 'menu');
  panel.innerHTML = meMenuHtml();
  if (btn.closest('.sidebar')) panel.classList.add('from-side');
  document.body.appendChild(panel);
  panel.addEventListener('click', (e) => {
    e.stopPropagation();
    if (e.target.closest('[data-lo]')) { panel.remove(); logout(); return; }
    if (e.target.closest('[data-sa-switch]')) { panel.remove(); backToSA('sa-jabatan'); return; }
    if (e.target.closest('[data-sa-back]')) { panel.remove(); backToSA(); return; }
    if (e.target.closest('[data-ver-me]')) { panel.remove(); showVersion(); return; }
    if (e.target.closest('a')) panel.remove();
  });
  setTimeout(() => document.addEventListener('click', function off(e) {
    if (!e.target.isConnected) return;
    if (!panel.contains(e.target) && !e.target.closest('[data-me]')) { panel.remove(); document.removeEventListener('click', off); }
  }), 0);
}

// ---------- notifikasi ----------
function notifItem(n) {
  const color = n.level === 'masalah' ? 'var(--red)' : n.level === 'tugas' ? 'var(--accent)' : 'var(--blue)';
  const role = n.source_role || 'sistem';
  return `<a class="notif ${store.reads.has(n.id) ? '' : 'unread'}" href="${esc(n.link || '#/notifikasi')}" data-nid="${n.id}">
    <span class="dot" style="background:${color}"></span>
    <div class="grow">${store.role === 'owner' ? `<div class="n-role" style="color:${ROLE_COLOR[role] || '#1A1D1B'}">${esc(ROLE_LABEL[role] || role)}</div>` : ''}
      <div class="n-title">${esc(n.title)}</div>${n.body ? `<div class="n-body">${esc(n.body)}</div>` : ''}</div>
    <span class="n-time">${ago(n.created_at)}</span></a>`;
}
export { notifItem };

let bellFilter = 'all';
function renderBellBody(panel) {
  const roles = ['admin', 'sopir', 'kepala_gudang', 'picker', 'packing', 'supervisor', 'keuangan', 'qc', 'cs', 'marketing'].filter((r) => !ROLE_MOD[r] || modOn(ROLE_MOD[r]));
  let list = store.notifs;
  if (bellFilter === 'masalah') list = list.filter((n) => n.level === 'masalah');
  else if (bellFilter !== 'all') list = list.filter((n) => n.source_role === bellFilter || n.target_role === bellFilter);
  panel.querySelector('.bp-body').innerHTML = (store.role === 'owner' ? `<div class="chips" style="padding:10px 16px">${[['all', 'Semua jabatan'], ['masalah', 'Masalah'], ...roles.map((r) => [r, ROLE_LABEL[r]])].map(([v, l]) => `<button class="chip ${bellFilter === v ? 'on' : ''}" data-bf="${v}" style="min-height:30px;padding:0 10px">${l}</button>`).join('')}</div>` : '')
    + (list.slice(0, 30).map(notifItem).join('') || '<div class="empty">Belum ada notifikasi</div>');
}

function toggleBell() {
  document.getElementById('me-panel')?.remove();
  // 2.24: HP & desktop sama — lonceng membuka pop up notifikasi yang muncul dari lonceng
  const ex = document.getElementById('bell-panel');
  if (ex) { ex.remove(); return; }
  const panel = document.createElement('div');
  panel.id = 'bell-panel'; panel.className = 'bell-panel';
  panel.innerHTML = `<div class="bp-head"><b>Notifikasi</b><button class="btn btn-ghost btn-sm" data-readall style="color:var(--blue)">Tandai semua dibaca</button></div><div class="bp-body"></div>
    <a href="#/notifikasi" class="btn btn-ghost" style="border-top:1px solid var(--line);border-radius:0">Lihat semua notifikasi</a>`;
  const bell = document.querySelector('[data-bell]').getBoundingClientRect();
  panel.style.setProperty('--bp-top', Math.round(bell.bottom + 10) + 'px');
  panel.style.setProperty('--bp-ox', Math.max(20, Math.round(innerWidth - bell.left - bell.width / 2)) + 'px');
  document.body.appendChild(panel);
  renderBellBody(panel);
  panel.addEventListener('click', (e) => {
    e.stopPropagation();
    const f = e.target.closest('[data-bf]');
    if (f) { bellFilter = f.dataset.bf; renderBellBody(panel); return; }
    if (e.target.closest('[data-readall]')) { markRead(store.notifs.map((n) => n.id)); return; }
    const a = e.target.closest('[data-nid]');
    if (a) markRead([+a.dataset.nid]);
    if (e.target.closest('a')) { panel.remove(); location.hash = e.target.closest('a').getAttribute('href'); }
  });
  setTimeout(() => document.addEventListener('click', function off(e) {
    if (!e.target.isConnected) return;
    if (!panel.contains(e.target) && !e.target.closest('[data-bell]')) { panel.remove(); document.removeEventListener('click', off); }
  }), 0);
}

function subscribe() {
  channel = supa.channel('notif-' + store.profile.id)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications' }, (payload) => {
      const n = payload.new;
      if (store.notifs.find((x) => x.id === n.id)) return;
      store.notifs.unshift(n);
      emit('notifs');
      if (n.source_user !== store.profile.id) headsUp(n);
    })
    .subscribe();
}

// ---------- router ----------
// bar pengingat tagihan aplikasi (owner): tampil kalau ada tagihan terlambat / jatuh tempo ≤ 7 hari
let billBarAt = 0, billUnpaid = 0;
addEventListener('bills-changed', () => { if (store.role === 'owner') billBar(); });
async function billBar() {
  billBarAt = Date.now();
  try {
    await rpc('billing_ensure').catch(() => {});
    const { data, error } = await supa.from('bills').select('amount, due_date').in('status', ['belum', 'menunggu']).order('due_date');
    document.getElementById('bill-bar')?.remove();
    billUnpaid = data?.length || 0;
    document.querySelector('.tb-logo')?.classList.toggle('has-bill', !!billUnpaid);
    document.querySelector('.tb-bill')?.classList.toggle('has-bill', !!billUnpaid);
    const badge = document.querySelector('[data-bill-badge]');
    if (badge) { badge.classList.toggle('hidden', !data?.length); badge.textContent = data?.length > 1 ? data.length : ''; }
    if (error || !data?.length || data[0].due_date > addDays(todayStr(), 7)) return;
    const late = data[0].due_date < todayStr();
    const bar = document.createElement('a');
    bar.id = 'bill-bar'; bar.href = '#/tagihan'; bar.className = 'bill-bar' + (late ? ' late' : '');
    bar.innerHTML = `${icon('receipt', 16)}<span><b>Tagihan ${rp(data.reduce((a, b) => a + Number(b.amount), 0))}</b> · ${late ? 'terlambat sejak' : 'jatuh tempo'} ${fmtDate(data[0].due_date, { day: 'numeric', month: 'short' })}</span><span class="bb-btn">Bayar</span>`;
    document.querySelector('.topbar')?.after(bar);
    if (location.hash.startsWith('#/tagihan')) bar.classList.add('hidden');
  } catch (_) {}
}

// bar atas HP: garis tipis muncul saat halaman digulir
addEventListener('scroll', () => { if (document.documentElement.classList.contains('no-scroll')) return; document.querySelector('.topbar')?.classList.toggle('scrolled', scrollY > 4); }, { passive: true });

// 2.25: saat pop up apa pun terbuka (modal, notifikasi lonceng, menu akun) halaman di belakangnya dikunci, tidak ikut tergeser
const POPUP_SEL = '.overlay, #bell-panel, #me-panel';
const popupScrollLock = () => document.documentElement.classList.toggle('no-scroll', !!document.querySelector(POPUP_SEL) && !document.querySelector('.tour-block'));
new MutationObserver(popupScrollLock).observe(document.body, { childList: true, subtree: true });
// HP (iPhone juga): geseran jari di luar bagian pop up yang bisa digulir diabaikan
addEventListener('touchmove', (e) => {
  if (!document.documentElement.classList.contains('no-scroll')) return;
  let el = e.target;
  while (el && el !== document.body) {
    if (el.scrollHeight > el.clientHeight + 1 && /(auto|scroll)/.test(getComputedStyle(el).overflowY)) return;
    el = el.parentElement;
  }
  e.preventDefault();
}, { passive: false });

// 2.25: tanda gulir (scroll) sendiri di HP: berjalan di antara header dan menu bawah, tidak menutupi keduanya
const sInd = document.createElement('div'); sInd.className = 'scroll-ind'; sInd.innerHTML = '<i></i>'; document.body.appendChild(sInd);
let sIndT = 0;
function paintScrollInd() {
  if (!matchMedia('(max-width: 899px)').matches) return;
  const top = Math.max(0, document.querySelector('.topbar')?.getBoundingClientRect().bottom || 0);
  const tb = document.querySelector('.tabbar'), bot = tb && getComputedStyle(tb).display !== 'none' ? innerHeight - tb.getBoundingClientRect().top : 0;
  const H = document.documentElement.scrollHeight, V = innerHeight, track = V - top - bot - 12;
  if (H <= V + 4 || track < 40) { sInd.classList.remove('on'); return; }
  const th = Math.max(36, track * V / H), y = (scrollY / (H - V)) * (track - th);
  sInd.style.top = top + 6 + 'px'; sInd.style.height = track + 'px';
  sInd.firstChild.style.height = th + 'px'; sInd.firstChild.style.transform = `translateY(${Math.max(0, Math.min(track - th, y))}px)`;
  sInd.classList.add('on'); clearTimeout(sIndT); sIndT = setTimeout(() => sInd.classList.remove('on'), 900);
}
addEventListener('scroll', paintScrollInd, { passive: true });
// 2.21.1: matikan menu tekan-lama browser (Open in new tab, Copy link, Download, Share) supaya terasa seperti aplikasi asli.
// Kolom isian tetap bisa tekan-lama untuk salin / tempel.
const editable = (t) => t?.closest?.('input, textarea, select, [contenteditable="true"], .allow-menu, .mono');
addEventListener('contextmenu', (e) => { if (!editable(e.target)) e.preventDefault(); });
addEventListener('dragstart', (e) => { if (e.target?.closest?.('a, img')) e.preventDefault(); });
// ---------- menu samping laptop: kategori buka-tutup, cari menu, mode ikon saja ----------
const LS = { get: (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch (_) { return d; } }, set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} } };
function sideSet(sec, open) {
  sec.classList.toggle('open', open);
  sec.querySelector('[data-gt]')?.setAttribute('aria-expanded', open ? 'true' : 'false');
}
function sideOpenFor(page) {
  const a = document.querySelector(`.sidebar [data-nav="${page}"]`);
  const sec = a?.closest('.side-sec.acc');
  if (sec && !sec.classList.contains('open')) { sideSet(sec, true); const o = LS.get('side-open', []); if (!o.includes(sec.dataset.g)) LS.set('side-open', [...o, sec.dataset.g]); }
}
function sideInit() {
  const sb = document.querySelector('.sidebar'); if (!sb) return;
  const open = LS.get('side-open', []);
  sb.querySelectorAll('.side-sec.acc').forEach((x) => sideSet(x, open.includes(x.dataset.g)));
  document.documentElement.classList.toggle('side-mini', !!LS.get('side-mini', false));
  sb.addEventListener('click', (e) => {
    const gt = e.target.closest('[data-gt]');
    if (gt) {
      const sec = gt.closest('.side-sec'), on = !sec.classList.contains('open');
      sideSet(sec, on);
      const o = LS.get('side-open', []).filter((g) => g !== sec.dataset.g); if (on) o.push(sec.dataset.g); LS.set('side-open', o);
      return;
    }
    if (e.target.closest('[data-mini]')) {
      const mini = !document.documentElement.classList.contains('side-mini');
      document.documentElement.classList.toggle('side-mini', mini); LS.set('side-mini', mini);
      return;
    }
    // mode ikon: tekan kotak cari -> menu dilebarkan lagi lalu langsung bisa mengetik
    if (e.target.closest('.side-search') && document.documentElement.classList.contains('side-mini')) {
      document.documentElement.classList.remove('side-mini'); LS.set('side-mini', false); setTimeout(() => sb.querySelector('#side-q').focus(), 180);
    }
  });
  const q = sb.querySelector('#side-q');
  const filter = () => {
    const v = q.value.trim().toLowerCase();
    sb.classList.toggle('searching', !!v);
    let n = 0;
    sb.querySelectorAll('.side-sec').forEach((sec) => {
      let k = 0;
      sec.querySelectorAll('.side-link').forEach((a) => { const hit = !v || a.dataset.q.includes(v); a.classList.toggle('hidden', !hit); if (hit) k++; });
      sec.classList.toggle('hidden', !!v && !k); n += k;
    });
    sb.querySelector('.side-none').classList.toggle('hidden', !v || n > 0);
  };
  q.addEventListener('input', filter);
  q.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { const a = sb.querySelector('.side-link[data-nav]:not(.hidden)'); if (a) { location.hash = a.getAttribute('href'); q.value = ''; filter(); q.blur(); } }
    if (e.key === 'Escape') { q.value = ''; filter(); q.blur(); }
  });
  // tekan "/" di mana saja (bukan saat mengetik) untuk mencari menu
  if (sideInit.k) return; sideInit.k = true;
  addEventListener('keydown', (e) => { if (e.key === '/' && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName) && innerWidth >= 900) { e.preventDefault(); if (document.documentElement.classList.contains('side-mini')) { document.documentElement.classList.remove('side-mini'); LS.set('side-mini', false); } document.querySelector('#side-q')?.focus(); } });
}

const FREE_PAGES = ['akun', 'panduan', 'notifikasi', 'pengaturan-scanner', 'menu', 'superadmin'];
async function route() {
  const hash = location.hash.replace(/^#\/?/, '');
  const [pageRaw, qs] = hash.split('?');
  let page = pageRaw || HOME[store.role];
  if (!canOpen(page, store.role)) page = HOME[store.role];
  const params = Object.fromEntries(new URLSearchParams(qs || ''));
  document.getElementById('bell-panel')?.remove();
  document.querySelectorAll('[data-nav]').forEach((a) => a.classList.toggle('on', a.dataset.nav === page));
  sideOpenFor(page);
  document.body.dataset.page = page;
  document.querySelector('[data-bell]')?.classList.toggle('on', page === 'notifikasi');
  const pg = PAGES[page];
  document.getElementById('t-title').textContent = pg.label;
  const cr = document.getElementById('t-crumb'); if (cr) cr.textContent = (pg.group || 'Beranda') + '  ›  ' + pg.label;
  document.title = pg.label + ' · ' + APP_NAME;
  document.getElementById('me-panel')?.remove();
  // sisa jendela / panduan dari halaman sebelumnya (mis. tekan tombol Kembali HP) jangan sampai menutupi tombol
  document.querySelectorAll('.overlay, .tour-block, .tour-hole, .tour-tip, .tour-welcome').forEach((x) => x.remove());
  const seq = ++routeSeq;
  // ganti elemen halaman dengan yang baru supaya event dari halaman sebelumnya tidak ikut terbawa
  const oldView = document.getElementById('view');
  const view = oldView.cloneNode(false);
  oldView.replaceWith(view);
  view.innerHTML = '<div class="stack"><div class="skeleton" style="height:90px"></div><div class="skeleton" style="height:240px"></div></div>';
  try {
    current.mod?.destroy?.();
    // jabatan berbayar yang belum / tidak lagi dibuka, atau menu tambahan yang terkunci -> halaman "buka menu"
    const roleMod = ROLE_MOD[store.role];
    const lockCode = roleMod && !modOn(roleMod) && !FREE_PAGES.includes(page) ? roleMod : isLocked(page) ? pg.mod : null;
    if (lockCode) {
      current = { page, mod: null };
      paywall(view, lockCode, { roleLock: lockCode === roleMod });
      logPage(page, pg.label + ' (terkunci)');
      view.focus({ preventScroll: true }); window.scrollTo(0, 0);
      return;
    }
    const mod = (await import(`./pages/${page}.js`)).default;
    if (seq !== routeSeq) return;
    current = { page, mod };
    await mod.render(view, { params, go: (h) => (location.hash = h), store });
    logPage(page, pg.label);
    if (store.role === 'owner' && page !== 'tagihan' && Date.now() - billBarAt > 60e3) billBar();
    refreshMasalah(page === 'masalah' || page === 'dashboard');
    document.getElementById('bill-bar')?.classList.toggle('hidden', page === 'tagihan');
  } catch (e) {
    toastErr(e);
    view.innerHTML = `<div class="card"><b>Halaman gagal dimuat.</b><div class="muted small" style="margin-top:6px">${esc(e.message || e)}</div><button class="btn" style="margin-top:12px" onclick="location.reload()">Muat ulang</button></div>`;
  }
  view.focus({ preventScroll: true });
  window.scrollTo(0, 0);
}

// ---------- panduan ----------
export async function startMainTour(firstLogin) {
  const role = store.role;
  const status = await runTour({
    steps: mainSteps(role),
    welcome: firstLogin ? { title: `Selamat datang, ${store.profile.full_name}`, body: `Kamu login sebagai <b>${esc(ROLE_LABEL[role])}</b>. Kami tunjukkan menu penting dalam ±1 menit. Bisa dilewati kapan saja dan diputar ulang dari <b>Panduan aplikasi</b>.` } : null
  });
  const done = { ...(store.profile.tour_done || {}), main: status, at: new Date().toISOString() };
  store.profile.tour_done = done;
  await supa.from('profiles').update({ tour_done: done }).eq('id', store.profile.id);
  if (firstLogin) toast(status === 'selesai' ? 'Panduan selesai. Bisa diputar ulang di menu Panduan.' : 'Panduan dilewati. Nyalakan lagi di menu Panduan.');
}
window.__startMainTour = startMainTour;
