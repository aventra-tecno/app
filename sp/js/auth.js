import { supa, errMsg, configured } from './supa.js';
import { esc, icon, modal, toast } from './ui.js';
import { APP_NAME, APP_VERSION } from './config.js';

const dayStr = () => new Intl.DateTimeFormat('id-ID', { timeZone: 'Asia/Jakarta', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date());
const fmtD = (v) => new Intl.DateTimeFormat('id-ID', { timeZone: 'Asia/Jakarta', day: 'numeric', month: 'short' }).format(new Date(v));
const initials = (n) => (n || 'SG').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();

function annCards(items) {
  if (!items.length) return '<div class="ann-empty">Belum ada pengumuman.</div>';
  return items.map((a) => `<article class="ann ${a.pinned ? 'pin' : ''}">
    <div class="ann-meta">${a.pinned ? `<span class="ann-pin">${icon('alert', 14)} Penting</span>` : ''}<span>${esc(fmtD(a.created_at))}</span></div>
    <h3>${esc(a.title)}</h3>${a.body ? `<p>${esc(a.body)}</p>` : ''}</article>`).join('');
}

export function renderLogin(root, { recovery = false } = {}) {
  root.innerHTML = `<div class="login">
    <section class="login-brand">
      <div class="brand-mark"><span class="logo" id="lg-ini">SG</span><span id="lg-name">${esc(APP_NAME)}</span></div>
      <div class="ann-wrap">
        <div class="ann-head"><span>${icon('bell', 18)} Pengumuman</span><span class="ann-date">${esc(dayStr())}</span></div>
        <div class="ann-list" id="ann-desk"><div class="ann-empty">Memuat…</div></div>
      </div>
      <div class="login-legal">Akses hanya untuk pegawai. Akun dibuat oleh owner. · Versi v${esc(APP_VERSION)}</div>
    </section>
    <section class="login-side">
      <div class="login-card">
        <div class="login-top">
          <div class="brand-mark"><span class="logo" id="lg-ini-m">SG</span><div><b id="lg-name-m">${esc(APP_NAME)}</b><div class="lt-date">${esc(dayStr())}</div></div></div>
        </div>
        <div id="login-body"></div>
        <section class="ann-mobile hidden" id="ann-mob-wrap"><div class="ann-head"><span>${icon('bell', 18)} Pengumuman</span></div><div class="ann-list" id="ann-mob"></div></section>
        <div class="login-foot">Belum punya akun? Minta owner membuatkan akun untukmu.<br><button class="btn btn-ghost btn-sm hidden" id="install-btn" style="margin-top:10px">${icon('install', 18)} Pasang aplikasi di HP / laptop</button><div class="xs muted" style="margin-top:10px">Versi v${esc(APP_VERSION)}</div></div>
      </div>
    </section>
  </div>`;
  const body = root.querySelector('#login-body');
  if (!configured) {
    body.innerHTML = `<h2>Atur Supabase dulu</h2><div class="alert yellow" style="margin-top:12px">Buka file <b>js/config.js</b>, isi <b>SUPABASE_URL</b> dan <b>SUPABASE_ANON_KEY</b>, lalu upload ulang ke GitHub.</div>`;
    return;
  }
  recovery ? newPasswordForm(body) : loginForm(body);
  const ios = /iPhone|iPad|iPod/i.test(navigator.userAgent) && !(window.matchMedia('(display-mode: standalone)').matches || navigator.standalone);
  if (ios) root.querySelector('.login-foot').insertAdjacentHTML('beforeend', '<div class="alert blue small" style="margin-top:12px;text-align:left">Pasang di iPhone: buka di <b>Safari</b> › ketuk <b>Bagikan</b> (kotak panah ke atas) › <b>Tambah ke Layar Utama</b>.</div>');
  const ib = root.querySelector('#install-btn');
  if (window.__installPrompt) ib.classList.remove('hidden');
  ib.onclick = () => window.__installPrompt && window.__installPrompt.prompt();
  // pengumuman dari owner (boleh dibaca sebelum login)
  supa.rpc('login_board').then(({ data, error }) => {
    if (error || !data) { root.querySelector('#ann-desk').innerHTML = annCards([]); return; }
    const name = data.nama_toko || APP_NAME;
    ['#lg-name', '#lg-name-m'].forEach((s) => { const e = root.querySelector(s); if (e) e.textContent = name; });
    ['#lg-ini', '#lg-ini-m'].forEach((s) => { const e = root.querySelector(s); if (e) e.textContent = initials(name); });
    const items = data.items || [];
    root.querySelector('#ann-desk').innerHTML = annCards(items);
    if (items.length) { root.querySelector('#ann-mob').innerHTML = annCards(items); root.querySelector('#ann-mob-wrap').classList.remove('hidden'); }
  });
}

function pwField(id, label, auto) {
  return `<label class="field">${label}<div class="pw-wrap"><input class="input" id="${id}" type="password" autocomplete="${auto}" required minlength="6">
    <button type="button" class="pw-toggle" data-pw="${id}" aria-label="Tampilkan password">${icon('eye')}</button></div></label>`;
}
function bindPw(root) {
  root.querySelectorAll('[data-pw]').forEach((b) => b.addEventListener('click', () => {
    const i = root.querySelector('#' + b.dataset.pw);
    const show = i.type === 'password';
    i.type = show ? 'text' : 'password';
    b.innerHTML = icon(show ? 'eyeoff' : 'eye');
    b.setAttribute('aria-label', show ? 'Sembunyikan password' : 'Tampilkan password');
  }));
}

function loginForm(body) {
  const lastEmail = localStorage.getItem('last-email') || '';
  body.innerHTML = `<h2>Masuk</h2><div class="muted small">Gunakan email &amp; password akunmu.</div>
    <form class="login-form" id="lf" novalidate>
      <div class="form-error hidden" id="lerr" role="alert"></div>
      <label class="field">Email<input class="input" id="em" type="email" autocomplete="username" inputmode="email" required value="${esc(lastEmail)}" placeholder="nama@email.com"></label>
      ${pwField('pw', 'Password', 'current-password')}
      <div class="row between"><span></span><button type="button" class="btn btn-ghost btn-sm" id="forgot" style="color:var(--blue)">Lupa password?</button></div>
      <button class="btn btn-primary btn-lg btn-block" id="lbtn">Masuk</button>
    </form>`;
  bindPw(body);
  const err = body.querySelector('#lerr');
  body.querySelector('#lf').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = body.querySelector('#em').value.trim(), password = body.querySelector('#pw').value;
    err.classList.add('hidden');
    if (!email || !password) { err.textContent = 'Email dan password wajib diisi.'; err.classList.remove('hidden'); return; }
    const btn = body.querySelector('#lbtn'); btn.disabled = true; btn.textContent = 'Memeriksa…';
    const { error } = await supa.auth.signInWithPassword({ email, password });
    btn.disabled = false; btn.textContent = 'Masuk';
    if (error) { err.textContent = errMsg(error); err.classList.remove('hidden'); return; }
    localStorage.setItem('last-email', email);
  });
  body.querySelector('#forgot').addEventListener('click', async () => {
    const r = await modal({
      title: 'Atur ulang password',
      body: `<p class="muted" style="margin-top:0">Kami kirim link untuk membuat password baru ke email kamu.</p><label class="field">Email<input class="input" id="fe" type="email" value="${esc(body.querySelector('#em').value)}"></label>`,
      actions: [{ label: 'Batal', value: null }, { label: 'Kirim link', cls: 'btn-primary', onClick: async (ov) => {
        const email = ov.querySelector('#fe').value.trim();
        if (!email) { toast('Isi email dulu', 'err'); return false; }
        const { error } = await supa.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
        if (error) throw error;
        return true;
      } }]
    });
    if (r) toast('Link reset password sudah dikirim. Cek email kamu.', 'ok');
  });
}

function newPasswordForm(body) {
  body.innerHTML = `<h2>Buat password baru</h2>
    <form class="login-form" id="nf">
      <div class="form-error hidden" id="nerr" role="alert"></div>
      ${pwField('np1', 'Password baru', 'new-password')}
      ${pwField('np2', 'Ulangi password baru', 'new-password')}
      <button class="btn btn-primary btn-lg btn-block">Simpan password</button>
    </form>`;
  bindPw(body);
  body.querySelector('#nf').addEventListener('submit', async (e) => {
    e.preventDefault();
    const a = body.querySelector('#np1').value, b = body.querySelector('#np2').value, err = body.querySelector('#nerr');
    if (a.length < 6) { err.textContent = 'Password minimal 6 karakter.'; err.classList.remove('hidden'); return; }
    if (a !== b) { err.textContent = 'Password tidak sama.'; err.classList.remove('hidden'); return; }
    const { error } = await supa.auth.updateUser({ password: a });
    if (error) { err.textContent = errMsg(error); err.classList.remove('hidden'); return; }
    toast('Password tersimpan', 'ok');
    location.hash = '';
    location.reload();
  });
}

export function renderPending(root, profile) {
  root.innerHTML = `<div class="login"><section class="login-side"><div class="login-card stack">
    <div class="brand-mark"><span class="logo" style="width:44px;height:44px;border-radius:12px;background:var(--accent);display:grid;place-items:center">SG</span>${esc(APP_NAME)}</div>
    <h2>${profile && profile.active === false ? 'Akun dinonaktifkan' : 'Akun menunggu jabatan'}</h2>
    <p class="muted" style="margin:0">Halo ${esc(profile?.full_name || '')}, akunmu sudah terdaftar tetapi belum diberi jabatan oleh owner (atau sedang dinonaktifkan). Minta owner membuka menu <b>Pegawai &amp; jabatan</b>.</p>
    <button class="btn btn-lg" id="po">Keluar</button>
  </div></section></div>`;
  root.querySelector('#po').onclick = () => supa.auth.signOut();
}
