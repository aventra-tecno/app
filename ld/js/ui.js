// Aventra Leads · helper tampilan
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const rp = (n) => (n == null || n === '' ? '-' : 'Rp' + Math.round(Number(n)).toLocaleString('id-ID'));
export const num = (n) => Number(n || 0).toLocaleString('id-ID');
export const pct = (a, b) => (b ? ((a / b) * 100).toFixed(1).replace('.', ',') + '%' : '-');
export const tgl = (iso) => (iso ? new Date(iso).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' }) : '-');
export const jam = (iso) => (iso ? new Date(iso).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '-');
export const waktu = (iso) => (iso ? `${tgl(iso)} ${jam(iso)}` : '-');
export const $ = (sel, el = document) => el.querySelector(sel);
export const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];

export const TAHAP = {
  A: 'Sapa, lalu diam', B: 'Tanya harga, hilang', C: 'Bahas jadwal', D: 'Sepakat, batal', E: 'Closing',
};
export const ALASAN = {
  1: 'Tidak membalas', 2: 'Merasa mahal', 3: 'Di luar area', 4: 'Jadwal penuh',
  5: 'Di luar menu', 6: 'Nanti dulu', 7: 'Minta terapis tertentu', 8: 'Lainnya',
};

export const icon = (name) => {
  const p = {
    home: 'M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
    users: 'M16 19v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1M9 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6m13 9v-1a4 4 0 0 0-3-3.9M16 4.1a3 3 0 0 1 0 5.8',
    click: 'M9 9l5 12 1.8-5.2L21 14zM7.2 2.2l.8 2.9M2.2 7.2l2.9.8M14 4.1 12 6M6 12l-1.9 2',
    pulse: 'M3 12h4l3-8 4 16 3-8h4',
    funnel: 'M3 4h18l-7 8.5V19l-4 2v-8.5z',
    gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm7.4-3a7.4 7.4 0 0 0-.1-1.3l2-1.6-2-3.4-2.4 1a7.4 7.4 0 0 0-2.2-1.3L14.4 2h-4l-.4 2.5a7.4 7.4 0 0 0-2.2 1.3l-2.4-1-2 3.4 2 1.6a7.4 7.4 0 0 0 0 2.6l-2 1.6 2 3.4 2.4-1a7.4 7.4 0 0 0 2.2 1.3l.4 2.5h4l.4-2.5a7.4 7.4 0 0 0 2.2-1.3l2.4 1 2-3.4-2-1.6c.1-.4.1-.9.1-1.3z',
    out: 'M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M15 12H3',
    menu: 'M3 6h18M3 12h18M3 18h18',
    calendar: 'M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2zM4 10h16M8 2v4M16 2v4',
    plus: 'M12 5v14M5 12h14',
    search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zm10 2-4.3-4.3',
    check: 'M20 6 9 17l-5-5',
    x: 'M18 6 6 18M6 6l12 12',
    copy: 'M9 9h11v11H9zM5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1',
  }[name];
  return `<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="${p}"/></svg>`;
};

export function toast(msg, type = 'ok') {
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.classList.add('show'), 10);
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 2800);
}

export function modal(title, bodyHtml, { wide = false } = {}) {
  const wrap = document.createElement('div');
  wrap.className = 'modal-wrap';
  wrap.innerHTML = `<div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true">
    <div class="modal-head"><h3>${esc(title)}</h3><button class="icon-btn" data-close aria-label="Tutup">${icon('x')}</button></div>
    <div class="modal-body">${bodyHtml}</div></div>`;
  document.body.appendChild(wrap);
  document.documentElement.classList.add('no-scroll');
  const close = () => { wrap.remove(); document.documentElement.classList.remove('no-scroll'); };
  wrap.addEventListener('click', (e) => { if (e.target === wrap || e.target.closest('[data-close]')) close(); });
  return { el: wrap.querySelector('.modal'), close };
}

export function copyText(text) {
  navigator.clipboard?.writeText(text).then(() => toast('Tersalin'), () => toast('Gagal menyalin', 'err'));
}

// Rentang tanggal untuk filter
// key: today | yesterday | 7d | 14d | 30d | custom:YYYY-MM-DD:YYYY-MM-DD
const lokal = (ymd) => { const [y, m, d] = ymd.split('-').map(Number); return new Date(y, m - 1, d); };
export function range(key) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (typeof key === 'string' && key.startsWith('custom:')) {
    const [, a, b] = key.split(':');
    const s = lokal(a), e = new Date(lokal(b).getTime() + 864e5);
    return { from: s.toISOString(), to: e.toISOString(), days: Math.round((e - s) / 864e5) };
  }
  if (key === 'yesterday') return { from: new Date(today.getTime() - 864e5).toISOString(), to: today.toISOString(), days: 1 };
  const end = new Date(today.getTime() + 864e5);
  const days = { today: 1, '7d': 7, '14d': 14, '30d': 30 }[key] ?? 7;
  return { from: new Date(end.getTime() - days * 864e5).toISOString(), to: end.toISOString(), days };
}
export const ymdLocal = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export function customLabel(key) {
  if (!key?.startsWith('custom:')) return 'Pilih tanggal';
  const [, a, b] = key.split(':');
  const f = (x) => lokal(x).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
  return a === b ? f(a) : `${f(a)} – ${f(b)}`;
}
export const RANGE_LABEL = { today: 'Hari ini', yesterday: 'Kemarin', '7d': '7 hari', '14d': '14 hari', '30d': '30 hari' };
