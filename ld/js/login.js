// Aventra Leads · halaman login (v1.10.0): animasi alur iklan → closing → Meta, lupa password
import { api } from './api.js';
import { esc, icon, toast } from './ui.js';

const LOGO = 'img/logo-lockup.png';
const logo = `<img class="lg-logo" src="${LOGO}" alt="Aventra" onerror="this.outerHTML='<b class=&quot;lg-logo brand-text&quot;>aventra</b>'">`;
let timers = [], raf = 0, alive = false;
export const stopLogin = () => { alive = false; timers.forEach(clearInterval); timers = []; cancelAnimationFrame(raf); };

const field = (ic, name, type, ph, extra = '') => `
  <label class="fi"><span class="fi-ic">${icon(ic)}</span>
    <input name="${name}" type="${type}" placeholder="${ph}" ${extra}>
    ${type === 'password' ? `<button type="button" class="fi-eye" tabindex="-1" aria-label="Lihat password">${icon('eye')}</button>` : ''}
  </label>`;

export function showLogin(root, onDone, mode = 'masuk') {
  stopLogin();
  root.innerHTML = `<div class="lx" id="lx">
    <canvas class="lx-net" id="lxNet"></canvas>
    <div class="lx-floor"></div><div class="lx-orb a"></div><div class="lx-orb b"></div><div class="lx-scan"></div>
    <svg class="lx-links" id="lxLinks"></svg>
    <div class="lx-float" id="lxFloat"></div>
    <div class="lx-center">
      <div class="lx-kicker"><span class="dotlive"></span>Terhubung ke Meta Ads &amp; Conversions API</div>
      <div class="lx-cardbox" id="lxCard">
        <svg class="lx-orbit" viewBox="0 0 200 200" preserveAspectRatio="none"><rect x="1" y="1" width="198" height="198" rx="14" pathLength="100" class="o1"/><rect x="1" y="1" width="198" height="198" rx="14" pathLength="100" class="o2"/></svg>
        <form class="lg-form" id="lf" novalidate></form>
      </div>
      <p class="lg-foot">aventra by PT. Klinhome Indonesia</p>
    </div>
  </div>`;
  drawForm(mode);
  alive = true;
  network(root.querySelector('#lxNet'));
  floaters(root);

  function drawForm(m) {
    const f = root.querySelector('#lf');
    const head = (t, s) => `<div class="lg-brand">${logo}<h1>${t}</h1><p>${s}</p></div>`;
    if (m === 'masuk' || m === 'daftar') {
      const daftar = m === 'daftar';
      f.innerHTML = `${head(daftar ? 'Buat akun' : 'Selamat datang', daftar ? 'Daftar dengan email kerja Anda' : 'Masuk ke Aventra Leads')}
        ${field('mail', 'email', 'email', 'Email', 'required autocomplete="email"')}
        ${field('lock', 'password', 'password', daftar ? 'Password (min. 6 karakter)' : 'Password', `required minlength="6" autocomplete="${daftar ? 'new-password' : 'current-password'}"`)}
        ${daftar ? '' : '<div class="lg-row"><span class="muted small">Tetap masuk di perangkat ini</span><a href="#" id="lupa">Lupa password?</a></div>'}
        <button class="btn primary lg-btn">${daftar ? 'Daftar' : 'Masuk'}</button>
        <div class="lg-or"><span>atau</span></div>
        <button type="button" class="btn lg-btn ghost2" id="swap">${daftar ? 'Sudah punya akun? Masuk' : 'Buat akun baru'}</button>`;
      f.querySelector('#swap').onclick = () => drawForm(daftar ? 'masuk' : 'daftar');
      const l = f.querySelector('#lupa'); if (l) l.onclick = (e) => { e.preventDefault(); drawForm('lupa'); };
      f.onsubmit = async (e) => {
        e.preventDefault();
        if (!f.reportValidity()) return;
        const b = f.querySelector('.lg-btn'); b.disabled = true; b.textContent = daftar ? 'Mendaftar…' : 'Masuk…';
        try {
          if (daftar) { await api.signUp(f.email.value.trim(), f.password.value); toast('Akun dibuat. Cek email untuk konfirmasi, lalu masuk.'); drawForm('masuk'); }
          else { await api.signIn(f.email.value.trim(), f.password.value); stopLogin(); onDone(); }
        } catch (err) {
          toast(err.message === 'Invalid login credentials' ? 'Email atau password salah' : err.message, 'err');
          b.disabled = false; b.textContent = daftar ? 'Daftar' : 'Masuk';
        }
      };
    } else if (m === 'lupa') {
      f.innerHTML = `${head('Lupa password?', 'Kami kirim link untuk membuat password baru ke email Anda')}
        ${field('mail', 'email', 'email', 'Email terdaftar', 'required autocomplete="email"')}
        <button class="btn primary lg-btn">Kirim link reset</button>
        <button type="button" class="btn lg-btn ghost2" id="back">${icon('back')}Kembali ke login</button>`;
      f.querySelector('#back').onclick = () => drawForm('masuk');
      f.onsubmit = async (e) => {
        e.preventDefault(); if (!f.reportValidity()) return;
        const b = f.querySelector('.lg-btn'); b.disabled = true; b.textContent = 'Mengirim…';
        try {
          await api.resetPassword(f.email.value.trim());
          f.innerHTML = `${head('Cek email Anda', `Link reset sudah dikirim ke <b>${esc(f.email.value.trim())}</b>. Buka link itu di perangkat ini untuk membuat password baru.`)}
            <button type="button" class="btn lg-btn ghost2" id="back2">${icon('back')}Kembali ke login</button>`;
          f.querySelector('#back2').onclick = () => drawForm('masuk');
        } catch (err) { toast(err.message, 'err'); b.disabled = false; b.textContent = 'Kirim link reset'; }
      };
    } else if (m === 'baru') {
      f.innerHTML = `${head('Buat password baru', 'Masukkan password baru untuk akun Anda')}
        ${field('lock', 'p1', 'password', 'Password baru (min. 6 karakter)', 'required minlength="6" autocomplete="new-password"')}
        ${field('lock', 'p2', 'password', 'Ulangi password baru', 'required minlength="6" autocomplete="new-password"')}
        <button class="btn primary lg-btn">Simpan password</button>`;
      f.onsubmit = async (e) => {
        e.preventDefault(); if (!f.reportValidity()) return;
        if (f.p1.value !== f.p2.value) return toast('Password tidak sama', 'err');
        try { await api.updatePassword(f.p1.value); toast('Password diperbarui'); stopLogin(); onDone(); } catch (err) { toast(err.message, 'err'); }
      };
    }
    f.querySelectorAll('.fi-eye').forEach((b) => (b.onclick = () => {
      const i = b.parentElement.querySelector('input'); const show = i.type === 'password';
      i.type = show ? 'text' : 'password'; b.innerHTML = icon(show ? 'eyeoff' : 'eye');
    }));
    setTimeout(() => f.querySelector('input')?.focus(), 60);
  }
}


// ---------------------------------------------------------------- latar: jaringan titik bergerak
function network(cv) {
  const ctx = cv.getContext('2d');
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let W = 0, H = 0, pts = [], pulses = [];
  const size = () => {
    const d = Math.min(2, devicePixelRatio || 1);
    W = cv.clientWidth; H = cv.clientHeight; cv.width = W * d; cv.height = H * d; ctx.setTransform(d, 0, 0, d, 0, 0);
    const n = Math.min(110, Math.round(W * H / 14000));
    pts = Array.from({ length: n }, () => ({ x: Math.random() * W, y: Math.random() * H, vx: (Math.random() - .5) * .25, vy: (Math.random() - .5) * .25, r: Math.random() * 1.6 + .6, hot: Math.random() < .12 }));
  };
  size();
  const ro = new ResizeObserver(size); ro.observe(cv);
  const L = 140;
  const frame = () => {
    if (!alive || !cv.isConnected) { ro.disconnect(); return; }
    ctx.clearRect(0, 0, W, H);
    for (const p of pts) {
      if (!still) { p.x += p.vx; p.y += p.vy; }
      if (p.x < -10) p.x = W + 10; if (p.x > W + 10) p.x = -10; if (p.y < -10) p.y = H + 10; if (p.y > H + 10) p.y = -10;
    }
    for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) {
      const a = pts[i], b = pts[j], dx = a.x - b.x, dy = a.y - b.y, d = Math.hypot(dx, dy);
      if (d < L) { ctx.strokeStyle = `rgba(59,240,138,${(1 - d / L) * .22})`; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        if (!still && Math.random() < .0009 && pulses.length < 14) pulses.push({ a, b, t: 0 }); }
    }
    for (const p of pts) { ctx.fillStyle = p.hot ? 'rgba(124,247,174,.95)' : 'rgba(200,255,225,.55)'; ctx.beginPath(); ctx.arc(p.x, p.y, p.hot ? p.r + 1 : p.r, 0, 7); ctx.fill();
      if (p.hot) { ctx.fillStyle = 'rgba(59,240,138,.12)'; ctx.beginPath(); ctx.arc(p.x, p.y, 7, 0, 7); ctx.fill(); } }
    // denyut data yang berjalan di antara titik
    pulses = pulses.filter((q) => (q.t += .012) < 1);
    for (const q of pulses) { const x = q.a.x + (q.b.x - q.a.x) * q.t, y = q.a.y + (q.b.y - q.a.y) * q.t;
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x, y, 1.8, 0, 7); ctx.fill(); ctx.fillStyle = 'rgba(59,240,138,.35)'; ctx.beginPath(); ctx.arc(x, y, 5, 0, 7); ctx.fill(); }
    raf = requestAnimationFrame(frame);
  };
  frame();
}

// ---------------------------------------------------------------- data melayang di sekitar kartu login
const W_LIST = [
  { k: 'stat', l: 'Omzet dari iklan · hari ini', v: 2430000, f: 'rp', s: '▲ 18% dari kemarin', sp: true },
  { k: 'stat', l: 'ROAS', v: 3.4, f: 'x', s: 'naik dari 2,1x' },
  { k: 'stat good', l: 'CPA', v: 28900, f: 'rp', s: 'di bawah target Rp36.450 ✓' },
  { k: 'ev', l: 'MR-K7M2QX', s: 'klik WA · "FBM 90 Menit - Reels"' },
  { k: 'ev meta', l: 'Purchase Rp135.000', s: 'terkirim ke Meta CAPI ✓' },
  { k: 'ev meta', l: 'Contact', s: 'Pixel + CAPI · match fbc' },
  { k: 'ev', l: 'Chat masuk', s: 'Rina · CS Surabaya · 2 mnt' },
  { k: 'sc up', l: 'Scale up', s: 'CPA aman 3 hari → budget +20%' },
  { k: 'sc ext', l: 'Scale out', s: 'Duplikat ke lookalike pembeli' },
  { k: 'sc fix', l: 'Perbaiki', s: 'Chat masuk 47% · patokan 80%' },
  { k: 'flow', l: 'Klik → Chat → Closing', s: '' },
  { k: 'stat meta', l: 'Sinkron Meta Ads', v: 759839, f: 'rp', s: 'spend 7 hari · 12 iklan' },
];
function widget(w) {
  const num0 = w.f === 'rp' ? 'Rp0' : w.f === 'x' ? '0,0x' : '0';
  if (w.k.startsWith('stat')) return `<small>${esc(w.l)}</small><b data-v="${w.v}" data-f="${w.f}">${num0}</b><span>${esc(w.s)}</span>
    ${w.sp ? '<svg viewBox="0 0 160 34" class="lx-spark"><path pathLength="1" d="M0,30 C18,28 26,22 40,23 S62,14 78,16 S102,9 116,11 S140,4 160,2"/></svg>' : ''}`;
  if (w.k.startsWith('ev')) return `<div class="lx-ev"><i></i><div><b>${esc(w.l)}</b><span>${esc(w.s)}</span></div></div>`;
  if (w.k.startsWith('sc')) return `<div class="lx-sc"><em>${w.k.includes('up') ? '↗' : w.k.includes('ext') ? '⇉' : '!'}</em><div><small>Saran dari data</small><b>${esc(w.l)}</b><span>${esc(w.s)}</span></div></div>`;
  return `<small>${esc(w.l)}</small><svg viewBox="0 0 180 28" class="lx-flow"><line x1="10" y1="14" x2="170" y2="14"/>${[10, 50, 90, 130, 170].map((x, i) => `<circle cx="${x}" cy="14" r="5" style="animation-delay:${i * .5}s"/>`).join('')}<circle r="3" class="mv"><animateMotion dur="2.6s" repeatCount="indefinite" path="M10,14 L170,14"/></circle></svg>`;
}
function floaters(root) {
  const box = root.querySelector('#lxFloat'), links = root.querySelector('#lxLinks'), card = root.querySelector('#lxCard');
  let wi = Math.floor(Math.random() * W_LIST.length);
  const live = [];
  const fmt = (v, f) => (f === 'rp' ? 'Rp' + Math.round(v).toLocaleString('id-ID') : f === 'x' ? v.toFixed(1).replace('.', ',') + 'x' : Math.round(v).toLocaleString('id-ID'));
  const spawn = () => {
    if (!alive || !box.isConnected) return stopLogin();
    const vw = innerWidth, vh = innerHeight, mob = vw < 700;
    const cr = root.querySelector('.lx-center').getBoundingClientRect(), cb = card.getBoundingClientRect(), pad = mob ? 10 : 26;
    const ww = mob ? 172 : 232, wh = mob ? 74 : 96;
    // cari tempat kosong: tidak menutupi kartu login & data lain
    let pos = null;
    for (let tries = 0; tries < 30 && !pos; tries++) {
      const x = 12 + Math.random() * (vw - ww - 24), y = 12 + Math.random() * (vh - wh - 24);
      const hit = (r) => x < r.x + r.w + pad && x + ww + pad > r.x && y < r.y + r.h + pad && y + wh + pad > r.y;
      if (hit({ x: cr.left, y: cr.top, w: cr.width, h: cr.height })) continue;
      if (live.some((o) => hit(o))) continue;
      pos = { x, y, w: ww, h: wh };
    }
    if (!pos) return;
    const w = W_LIST[wi++ % W_LIST.length];
    const el = document.createElement('div');
    el.className = `lx-w ${w.k}`;
    el.style.cssText = `left:${pos.x}px;top:${pos.y}px;width:${ww}px`;
    el.innerHTML = widget(w);
    box.appendChild(el);
    // garis penghubung ke kartu login
    const cx = pos.x + ww / 2, cy = pos.y + wh / 2;
    const tx = Math.max(cb.left, Math.min(cx, cb.right)), ty = Math.max(cb.top, Math.min(cy, cb.bottom));
    const ln = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    const mx = (cx + tx) / 2;
    ln.setAttribute('d', `M${cx},${cy} C${mx},${cy} ${mx},${ty} ${tx},${ty}`);
    ln.setAttribute('class', `lx-ln ${w.k.split(' ')[0]}`); ln.setAttribute('pathLength', '1');
    links.appendChild(ln);
    const o = { ...pos, el, ln };
    live.push(o);
    // angka naik
    el.querySelectorAll('[data-v]').forEach((b) => {
      const to = Number(b.dataset.v), t0 = performance.now(), d = 1300;
      const st = (t) => { const p = Math.min(1, (t - t0) / d); b.textContent = fmt(to * (1 - Math.pow(1 - p, 3)), b.dataset.f); if (p < 1 && b.isConnected) requestAnimationFrame(st); };
      requestAnimationFrame(st);
    });
    const life = 5200 + Math.random() * 2600;
    setTimeout(() => { el.classList.add('bye'); ln.classList.add('bye'); }, life);
    setTimeout(() => { el.remove(); ln.remove(); live.splice(live.indexOf(o), 1); }, life + 700);
  };
  for (let i = 0; i < 4; i++) setTimeout(spawn, 300 + i * 450);
  timers.push(setInterval(spawn, innerWidth < 700 ? 2600 : 1500));
}
