// Aventra Leads · kerangka aplikasi, login, router
import { api } from './api.js';
import { showLogin as loginPage, stopLogin } from './login.js';
import { APP_VERSION, DEMO } from './config.js';
import { esc, icon, toast, modal, $, $$, RANGE_LABEL, customLabel, range, ymdLocal, metaDates, tzBeda } from './ui.js';

export const state = {
  user: null, tenants: [], tenant: null, role: 'cs', nama: null, jabatan: null, menus: null, wa: [],
  period: localStorage.getItem('ld_period') || '7d',
};

const PAGES = [
  { id: 'ringkasan', label: 'Ringkasan', icon: 'home', load: () => import('./pages/ringkasan.js') },
  { id: 'leads', label: 'Leads & Closing', icon: 'users', load: () => import('./pages/leads.js') },
  { id: 'funnel', label: 'Funnel & Target', icon: 'funnel', load: () => import('./pages/funnel.js') },
  { id: 'klik', label: 'Klik Tombol WA', icon: 'click', load: () => import('./pages/klik.js') },
  { id: 'log', label: 'Log Event Meta', icon: 'pulse', load: () => import('./pages/log.js') },
  { id: 'kinerja', label: 'Kinerja CS', icon: 'award', load: () => import('./pages/kinerja.js'), admin: true },
  { id: 'tim', label: 'Tim & Akses', icon: 'team', load: () => import('./pages/tim.js'), admin: true },
  { id: 'pengaturan', label: 'Pengaturan', icon: 'gear', load: () => import('./pages/pengaturan.js'), admin: true },
];
export const MENU_LIST = PAGES.map(({ id, label, admin }) => ({ id, label, admin: !!admin }));
const LOGO_LIGHT = 'img/logo-full-light.png';   // logo putih (untuk sidebar hijau gelap)
const LOGO_COLOR = 'img/logo-lockup.png';        // logo berwarna (untuk halaman login)
// logo resmi; bila gagal dimuat, tampilkan teks
const logo = (src, cls) => `<img class="${cls}" src="${src}" alt="Aventra" onerror="this.outerHTML='<b class=&quot;${cls} brand-text&quot;>aventra</b>'">`;

// menu yang boleh dibuka orang ini
export function allowed(p) {
  if (p.admin && state.role === 'cs') return false;
  if (state.role === 'owner' || !Array.isArray(state.menus)) return true;
  return state.menus.includes(p.id);
}

const root = document.getElementById('app');

// link reset password dari email: #access_token=...&type=recovery
const RECOVERY = /type=recovery/.test(location.hash);
let recoveryShown = false;

async function boot() {
  try {
    const s = await api.session();
    if (RECOVERY && s && !recoveryShown) {
      recoveryShown = true;
      history.replaceState(null, '', location.pathname + location.search);
      return showLogin('baru');
    }
    if (!s) return showLogin();
    stopLogin();
    state.user = s.user;
    await api.klaimUndangan();
    state.tenants = await api.tenants();
    if (!state.tenants.length) return showOnboarding();
    const saved = localStorage.getItem('ld_tenant');
    state.tenant = state.tenants.find((t) => t.id === saved) || state.tenants[0];
    await loadTenantData();
    renderShell();
    route();
  } catch (e) {
    root.innerHTML = `<div class="center-screen"><div class="auth-card"><h2>Gagal memuat</h2><p class="muted">${esc(e.message)}</p>
      <button class="btn primary" onclick="location.reload()">Coba lagi</button></div></div>`;
  }
}

export async function loadTenantData() {
  localStorage.setItem('ld_tenant', state.tenant.id);
  const [me, wa] = await Promise.all([api.myMember(state.tenant.id), api.waNumbers(state.tenant.id)]);
  Object.assign(state, { role: me.role, nama: me.nama, jabatan: me.jabatan, menus: me.menus, wa });
}

// ------------------------------------------------------------------ LOGIN (lihat login.js)
function showLogin(mode) { loginPage(root, boot, mode); }

function showOnboarding() {
  root.innerHTML = `<div class="center-screen hero-bg">
    <form class="auth-card" id="f">
      <div class="brand-row">${logo(LOGO_COLOR, 'auth-logo')}<div><b>Daftarkan bisnis</b><small>Satu akun bisa punya beberapa bisnis</small></div></div>
      <label>Nama bisnis<input name="nama" required placeholder="Mahyra Relaksia"></label>
      <label>Awalan kode promo (2–4 huruf)<input name="prefix" required pattern="[A-Za-z]{2,4}" maxlength="4" placeholder="MR"></label>
      <button class="btn primary block">Simpan</button>
    </form></div>`;
  const f = $('#f');
  f.onsubmit = async (e) => {
    e.preventDefault();
    try { await api.createTenant(f.nama.value.trim(), f.prefix.value.trim().toUpperCase()); boot(); } catch (err) { toast(err.message, 'err'); }
  };
}

// ------------------------------------------------------------------ KERANGKA
function renderShell() {
  const pages = PAGES.filter(allowed);
  const initial = (state.nama || state.user?.email || '?').trim()[0].toUpperCase();
  const roleLbl = { owner: 'Owner', admin: 'Admin', cs: 'CS' }[state.role] || state.role;
  root.innerHTML = `<div class="shell">
    <aside class="side" id="side">
      <div class="side-brand">
        <div class="brand-frame">${logo(LOGO_LIGHT, 'brand-logo')}<span class="brand-app">Leads</span></div>
        <div class="biz">
          <span class="biz-ic">${icon('store')}</span>
          ${state.tenants.length > 1
            ? `<select id="tenantSel" class="biz-select">${state.tenants.map((t) => `<option value="${t.id}" ${t.id === state.tenant.id ? 'selected' : ''}>${esc(t.nama)}</option>`).join('')}</select>`
            : `<div class="biz-name"><small>Bisnis</small><b>${esc(state.tenant.nama)}</b></div>`}
        </div>
      </div>
      <div class="nav-label">Menu</div>
      <nav class="side-nav">
        ${pages.map((p) => `<a href="#/${p.id}" data-page="${p.id}"><i class="nav-ic">${icon(p.icon)}</i><span>${p.label}</span><em class="nav-go">${icon('chev')}</em></a>`).join('')}
      </nav>
      <div class="side-foot">
        <button class="me" id="meBtn" title="Ganti nama"><span class="avatar">${esc(initial)}</span><div>
          <b>${esc(state.nama || 'Tanpa nama')}</b><small>${esc(state.user?.email ?? '')}</small>
          <small class="me-role">${esc(state.jabatan || roleLbl)} · v${APP_VERSION}${DEMO ? ' · DEMO' : ''}</small></div></button>
        <button class="btn out block" id="logout">${icon('out')}Keluar</button>
      </div>
    </aside>
    <div class="scrim" id="scrim"></div>
    <div class="main">
      <header class="top">
        <button class="icon-btn only-m" id="menuBtn" aria-label="Menu">${icon('menu')}</button>
        <div class="top-title"><h1 id="pageTitle"></h1><small id="pageSub">${esc(state.tenant.nama)}</small></div>
        <div class="top-right">
          <div class="sync-box" id="syncBox"></div>
          <div class="seg" id="periodSeg">${Object.entries(RANGE_LABEL).map(([k, v]) => `<button data-p="${k}" class="${k === state.period ? 'on' : ''}">${v}</button>`).join('')}<button data-p="custom" class="pickdate ${state.period.startsWith('custom:') ? 'on' : ''}">${icon('calendar')}<span>${esc(customLabel(state.period))}</span></button></div>
        </div>
      </header>
      <main id="page" class="page"></main>
    </div>
  </div>`;

  drawSync();
  $('#meBtn').onclick = () => {
    const m = modal('Nama saya', `<form class="form" id="nf"><label>Nama<input name="nama" required value="${esc(state.nama || '')}" placeholder="mis. Akhmad Janni"></label>
      <p class="muted small">Tampil di pojok kiri bawah dan di daftar Tim & Akses.</p><button class="btn primary block">Simpan</button></form>`);
    const f = m.el.querySelector('#nf');
    f.onsubmit = async (e) => {
      e.preventDefault();
      try { await api.renameMe(state.tenant.id, f.nama.value.trim()); state.nama = f.nama.value.trim(); m.close(); renderShell(); route(); } catch (err) { toast(err.message, 'err'); }
    };
    setTimeout(() => f.nama.focus(), 50);
  };
  $('#logout').onclick = async () => { await api.signOut(); location.hash = ''; boot(); };
  const side = $('#side'), scrim = $('#scrim');
  const toggle = (open) => { side.classList.toggle('open', open); scrim.classList.toggle('show', open); };
  $('#menuBtn').onclick = () => toggle(true);
  scrim.onclick = () => toggle(false);
  $$('.side-nav a').forEach((a) => a.addEventListener('click', () => toggle(false)));
  const setPeriod = (p) => {
    state.period = p; localStorage.setItem('ld_period', p);
    $$('#periodSeg button').forEach((x) => x.classList.toggle('on', x.dataset.p === p || (x.dataset.p === 'custom' && p.startsWith('custom:'))));
    $('#periodSeg .pickdate span').textContent = customLabel(p);
    route();
  };
  $('#periodSeg').onclick = (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.p !== 'custom') return setPeriod(b.dataset.p);
    const r = range(state.period);
    const a0 = ymdLocal(new Date(r.from)), b0 = ymdLocal(new Date(Date.parse(r.to) - 1)), max = ymdLocal(new Date());
    const m = modal('Pilih tanggal', `<div class="form">
      <div class="row2">
        <label>Dari<input type="date" id="pdA" value="${a0}" max="${max}"></label>
        <label>Sampai<input type="date" id="pdB" value="${b0}" max="${max}"></label>
      </div>
      <button class="btn primary block" id="pdOk">Terapkan</button></div>`);
    m.el.querySelector('#pdOk').onclick = () => {
      let a = m.el.querySelector('#pdA').value, z = m.el.querySelector('#pdB').value;
      if (!a || !z) return toast('Isi kedua tanggal', 'err');
      if (a > z) [a, z] = [z, a];
      m.close(); setPeriod(`custom:${a}:${z}`);
    };
  };
  const ts = $('#tenantSel');
  if (ts) ts.onchange = async () => { state.tenant = state.tenants.find((t) => t.id === ts.value); await loadTenantData(); renderShell(); route(); };
}

// ---------------------------------------------------------------- sinkron Meta (pojok kanan atas)
const lalu = (iso) => {
  const m = Math.round((Date.now() - Date.parse(iso)) / 60000);
  return m < 1 ? 'baru saja' : m < 60 ? `${m} mnt lalu` : m < 1440 ? `${Math.round(m / 60)} jam lalu` : `${Math.round(m / 1440)} hari lalu`;
};
function drawSync(busy = false) {
  const box = $('#syncBox'); if (!box) return;
  const t = state.tenant, info = String(t.last_sync_info || ''), gagal = info.startsWith('GAGAL');
  const isAdmin = state.role !== 'cs';
  if (!t.ad_account_id) { box.hidden = !isAdmin; box.innerHTML = `<span class="sync-dot off"></span><div class="sync-txt"><small>Data Meta</small><b>belum terhubung</b></div>${isAdmin ? `<a class="sync-btn" href="#/pengaturan">${icon('gear')}Atur</a>` : ''}`; return; }
  box.hidden = false;
  const when = t.last_sync_at ? `${new Date(t.last_sync_at).toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })} · ${lalu(t.last_sync_at)}` : 'belum pernah';
  box.title = `${info}${tzBeda(t.ad_tz) ? `\nZona akun iklan: ${t.ad_tz}` : ''}${t.auto_sync !== false ? '\nSinkron otomatis tiap 30 menit' : ''}`;
  box.innerHTML = `<span class="sync-dot ${gagal ? 'err' : ''}"></span>
    <div class="sync-txt"><small>Sinkron Meta${t.auto_sync !== false ? ' · otomatis' : ''}</small><b class="${gagal ? 'err' : ''}">${gagal ? 'Gagal · ' : ''}${esc(when)}</b></div>
    ${isAdmin ? `<button class="sync-btn ${busy ? 'spin' : ''}" id="syncBtn" ${busy ? 'disabled' : ''}>${icon('sync')}${busy ? 'Menyinkron…' : 'Sinkron'}</button>` : ''}`;
  const b = $('#syncBtn');
  if (b) b.onclick = async () => {
    drawSync(true);
    try {
      const md = metaDates(state.period, t.ad_tz);
      const r = await api.syncMeta(t.id, md.since, md.until);
      if (r.tz) t.ad_tz = r.tz;
      t.last_sync_at = new Date().toISOString(); t.last_sync_info = `${r.baris} baris`;
      toast(`Sinkron selesai: ${r.baris} baris, spend Rp${Number(r.spend || 0).toLocaleString('id-ID')}`);
      drawSync(); route();
    } catch (err) {
      t.last_sync_info = 'GAGAL: ' + err.message; toast(err.message, 'err'); drawSync();
    }
  };
}
// ambil ulang status sinkron (jadwal otomatis berjalan di server), paling sering 1x per menit
let lastPull = 0;
async function pullTenant() {
  if (Date.now() - lastPull < 60000) return;
  lastPull = Date.now();
  try {
    const list = await api.tenants();
    const fresh = list.find((x) => x.id === state.tenant.id);
    if (fresh) { Object.assign(state.tenant, { last_sync_at: fresh.last_sync_at, last_sync_info: fresh.last_sync_info, ad_tz: fresh.ad_tz, auto_sync: fresh.auto_sync, ad_account_id: fresh.ad_account_id }); drawSync(); }
  } catch { /* abaikan */ }
}

let seq = 0;
async function route() {
  if (!$('#page')) return;
  const id = (location.hash.replace(/^#\/?/, '').split('?')[0]) || 'ringkasan';
  const ok = PAGES.filter(allowed);
  if (!ok.length) { $('#page').innerHTML = '<div class="card"><b>Belum ada menu untuk akun ini</b><p class="muted">Minta owner/admin membuka akses menu di Tim & Akses.</p></div>'; return; }
  const page = ok.find((p) => p.id === id) || ok[0];
  $$('.side-nav a').forEach((a) => a.classList.toggle('active', a.dataset.page === page.id));
  $('#pageTitle').textContent = page.label;
  // menu tanpa filter tanggal: sembunyikan pilihan tanggal, kotak sinkron Meta bergeser ke kanan
  $('#periodSeg').style.display = ['ringkasan', 'leads', 'klik', 'funnel', 'kinerja', 'log'].includes(page.id) ? '' : 'none';
  pullTenant();
  const el = $('#page');
  const my = ++seq;
  el.innerHTML = '<div class="loading">Memuat…</div>';
  try {
    const mod = await page.load();
    if (my !== seq) return;
    el.innerHTML = '';
    await mod.render(el, { state, refresh: route });
  } catch (e) {
    el.innerHTML = `<div class="card"><b>Gagal memuat halaman</b><p class="muted">${esc(e.message)}</p></div>`;
  }
}

window.addEventListener('hashchange', route);
boot();
