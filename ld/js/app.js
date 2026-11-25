// Aventra Leads · kerangka aplikasi, login, router
import { api } from './api.js';
import { APP_VERSION, DEMO } from './config.js';
import { esc, icon, toast, modal, $, $$, RANGE_LABEL, customLabel, range, ymdLocal } from './ui.js';

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
  { id: 'tim', label: 'Tim & Akses', icon: 'team', load: () => import('./pages/tim.js'), admin: true },
  { id: 'pengaturan', label: 'Pengaturan', icon: 'gear', load: () => import('./pages/pengaturan.js'), admin: true },
];
export const MENU_LIST = PAGES.map(({ id, label, admin }) => ({ id, label, admin: !!admin }));
const LOGO_LIGHT = 'https://aventra.id/logo-full-light.png';
const LOGO_COLOR = 'https://aventra.id/logo-lockup.png';
// logo resmi; bila gagal dimuat, tampilkan teks
const logo = (src, cls) => `<img class="${cls}" src="${src}" alt="Aventra" onerror="this.outerHTML='<b class=&quot;${cls} brand-text&quot;>aventra</b>'">`;

// menu yang boleh dibuka orang ini
export function allowed(p) {
  if (p.admin && state.role === 'cs') return false;
  if (state.role === 'owner' || !Array.isArray(state.menus)) return true;
  return state.menus.includes(p.id);
}

const root = document.getElementById('app');

async function boot() {
  try {
    const s = await api.session();
    if (!s) return showLogin();
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

// ------------------------------------------------------------------ LOGIN
function showLogin() {
  root.innerHTML = `<div class="center-screen hero-bg">
    <form class="auth-card" id="f">
      <div class="auth-brand">${logo(LOGO_COLOR, 'auth-logo')}<div><b>Aventra Leads</b><small>Lacak klik WA sampai closing</small></div></div>
      <label>Email<input name="email" type="email" required autocomplete="email"></label>
      <label>Password<input name="password" type="password" required minlength="6" autocomplete="current-password"></label>
      <button class="btn primary block" name="masuk">Masuk</button>
      <button class="btn ghost block" type="button" id="daftar">Buat akun baru</button>
    </form></div>`;
  const f = $('#f');
  f.onsubmit = async (e) => {
    e.preventDefault();
    try { await api.signIn(f.email.value, f.password.value); boot(); } catch (err) { toast(err.message, 'err'); }
  };
  $('#daftar').onclick = async () => {
    if (!f.reportValidity()) return;
    try { await api.signUp(f.email.value, f.password.value); toast('Akun dibuat. Cek email untuk konfirmasi, lalu masuk.'); } catch (err) { toast(err.message, 'err'); }
  };
}

function showOnboarding() {
  root.innerHTML = `<div class="center-screen hero-bg">
    <form class="auth-card" id="f">
      <div class="brand-row"><span class="logo">A</span><div><b>Daftarkan bisnis</b><small>Satu akun bisa punya beberapa bisnis</small></div></div>
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
          <div class="seg" id="periodSeg">${Object.entries(RANGE_LABEL).map(([k, v]) => `<button data-p="${k}" class="${k === state.period ? 'on' : ''}">${v}</button>`).join('')}<button data-p="custom" class="pickdate ${state.period.startsWith('custom:') ? 'on' : ''}">${icon('calendar')}<span>${esc(customLabel(state.period))}</span></button></div>
        </div>
      </header>
      <main id="page" class="page"></main>
    </div>
  </div>`;

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

let seq = 0;
async function route() {
  if (!$('#page')) return;
  const id = (location.hash.replace(/^#\/?/, '').split('?')[0]) || 'ringkasan';
  const ok = PAGES.filter(allowed);
  if (!ok.length) { $('#page').innerHTML = '<div class="card"><b>Belum ada menu untuk akun ini</b><p class="muted">Minta owner/admin membuka akses menu di Tim & Akses.</p></div>'; return; }
  const page = ok.find((p) => p.id === id) || ok[0];
  $$('.side-nav a').forEach((a) => a.classList.toggle('active', a.dataset.page === page.id));
  $('#pageTitle').textContent = page.label;
  $('#periodSeg').style.visibility = ['ringkasan', 'leads', 'klik', 'funnel'].includes(page.id) ? 'visible' : 'hidden';
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
