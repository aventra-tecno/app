// Aventra Leads · kerangka aplikasi, login, router
import { api } from './api.js';
import { APP_VERSION, DEMO } from './config.js';
import { esc, icon, toast, $, $$, RANGE_LABEL } from './ui.js';

export const state = {
  user: null, tenants: [], tenant: null, role: 'cs', wa: [],
  period: localStorage.getItem('ld_period') || '7d',
};

const PAGES = [
  { id: 'ringkasan', label: 'Ringkasan', icon: 'home', load: () => import('./pages/ringkasan.js') },
  { id: 'leads', label: 'Leads & Closing', icon: 'users', load: () => import('./pages/leads.js') },
  { id: 'funnel', label: 'Funnel & Target', icon: 'funnel', load: () => import('./pages/funnel.js') },
  { id: 'klik', label: 'Klik Tombol WA', icon: 'click', load: () => import('./pages/klik.js') },
  { id: 'log', label: 'Log Event Meta', icon: 'pulse', load: () => import('./pages/log.js') },
  { id: 'pengaturan', label: 'Pengaturan', icon: 'gear', load: () => import('./pages/pengaturan.js'), admin: true },
];

const root = document.getElementById('app');

async function boot() {
  try {
    const s = await api.session();
    if (!s) return showLogin();
    state.user = s.user;
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
  [state.role, state.wa] = await Promise.all([api.myRole(state.tenant.id), api.waNumbers(state.tenant.id)]);
}

// ------------------------------------------------------------------ LOGIN
function showLogin() {
  root.innerHTML = `<div class="center-screen hero-bg">
    <form class="auth-card" id="f">
      <div class="brand-row"><span class="logo">A</span><div><b>Aventra Leads</b><small>Lacak klik WA sampai closing</small></div></div>
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
  const isAdmin = state.role !== 'cs';
  root.innerHTML = `<div class="shell">
    <aside class="side" id="side">
      <div class="side-brand"><span class="logo">A</span><div><b>Aventra Leads</b><small>${esc(state.tenant.nama)}</small></div></div>
      <nav class="side-nav">
        ${PAGES.filter((p) => !p.admin || isAdmin).map((p) => `<a href="#/${p.id}" data-page="${p.id}">${icon(p.icon)}<span>${p.label}</span></a>`).join('')}
      </nav>
      <div class="side-foot">
        ${state.tenants.length > 1 ? `<select id="tenantSel" class="dark-select">${state.tenants.map((t) => `<option value="${t.id}" ${t.id === state.tenant.id ? 'selected' : ''}>${esc(t.nama)}</option>`).join('')}</select>` : ''}
        <div class="who">${esc(state.user?.email ?? '')}<small>${state.role} · v${APP_VERSION}${DEMO ? ' · DEMO' : ''}</small></div>
        <button class="btn danger block" id="logout">${icon('out')}Keluar</button>
      </div>
    </aside>
    <div class="scrim" id="scrim"></div>
    <div class="main">
      <header class="top">
        <button class="icon-btn only-m" id="menuBtn" aria-label="Menu">${icon('menu')}</button>
        <h1 id="pageTitle"></h1>
        <div class="top-right">
          <div class="seg" id="periodSeg">${Object.entries(RANGE_LABEL).map(([k, v]) => `<button data-p="${k}" class="${k === state.period ? 'on' : ''}">${v}</button>`).join('')}</div>
        </div>
      </header>
      <main id="page" class="page"></main>
    </div>
  </div>`;

  $('#logout').onclick = async () => { await api.signOut(); location.hash = ''; boot(); };
  const side = $('#side'), scrim = $('#scrim');
  const toggle = (open) => { side.classList.toggle('open', open); scrim.classList.toggle('show', open); };
  $('#menuBtn').onclick = () => toggle(true);
  scrim.onclick = () => toggle(false);
  $$('.side-nav a').forEach((a) => a.addEventListener('click', () => toggle(false)));
  $('#periodSeg').onclick = (e) => {
    const b = e.target.closest('button'); if (!b) return;
    state.period = b.dataset.p; localStorage.setItem('ld_period', state.period);
    $$('#periodSeg button').forEach((x) => x.classList.toggle('on', x === b));
    route();
  };
  const ts = $('#tenantSel');
  if (ts) ts.onchange = async () => { state.tenant = state.tenants.find((t) => t.id === ts.value); await loadTenantData(); renderShell(); route(); };
}

let seq = 0;
async function route() {
  if (!$('#page')) return;
  const id = (location.hash.replace(/^#\/?/, '').split('?')[0]) || 'ringkasan';
  const page = PAGES.find((p) => p.id === id && (!p.admin || state.role !== 'cs')) || PAGES[0];
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
