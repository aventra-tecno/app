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
    team: 'M17 20v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 5 18.5V20M11 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zm8.5-1.5v5M22 12h-5',
    store: 'M4 9h16l-1.5-5h-13zM4 9v11h16V9M9 20v-6h6v6M4 9a2.7 2.7 0 0 0 5.3 0 2.7 2.7 0 0 0 5.4 0 2.7 2.7 0 0 0 5.3 0',
    chev: 'm9 6 6 6-6 6',
    award: 'M12 15a6 6 0 1 0 0-12 6 6 0 0 0 0 12zM8.2 13.9 7 22l5-3 5 3-1.2-8.1',
    mail: 'M4 6h16v12H4zM4 7l8 6 8-6',
    chat: 'M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z',
    image: 'M4 5h16v14H4zM4 15l4-4 5 5M14 13l2-2 4 4M15.5 8.5h.01',
    mic: 'M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zM5 11a7 7 0 0 0 14 0M12 18v3',
    file: 'M6 3h8l4 4v14H6zM14 3v4h4',
    lock: 'M6 11h12v9H6zM8.5 11V8a3.5 3.5 0 0 1 7 0v3M12 15v2',
    eye: 'M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
    eyeoff: 'M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4.1M6.6 6.6A17 17 0 0 0 2 12s3.6 7 10 7a9.6 9.6 0 0 0 4.4-1.1M9.9 9.9a3 3 0 0 0 4.2 4.2',
    up: 'M12 19V5M5 12l7-7 7 7',
    out2: 'M7 17 17 7M8 7h9v9',
    back: 'M15 18l-6-6 6-6',
    sync: 'M20 11a8 8 0 0 0-14.6-4.5L4 8M4 4v4h4M4 13a8 8 0 0 0 14.6 4.5L20 16m0 4v-4h-4',
    edit: 'M4 20h4L19 9l-4-4L4 16zM14 6l4 4',
    trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
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
// Nama iklan dari URL kadang tersandi 2x ("Konten+1+Leads+25%2F11") → rapikan
export function cleanName(v) {
  if (v == null) return v;
  let s = String(v);
  for (let i = 0; i < 3 && /%[0-9A-Fa-f]{2}|\+/.test(s); i++) {
    try { s = decodeURIComponent(s.replace(/\+/g, ' ')); } catch { s = s.replace(/\+/g, ' '); break; }
  }
  return s.trim();
}

// Tanggal data Meta mengikuti zona waktu akun iklan (mis. America/Los_Angeles).
const tzYmd = (d, tz) => { try { if (tz) return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d); } catch {} return ymdLocal(d); };
export function metaDates(key, tz) {
  if (typeof key === 'string' && key.startsWith('custom:')) { const [, a, b] = key.split(':'); return { since: a, until: b }; }
  const now = new Date();
  const back = (n) => tzYmd(new Date(now.getTime() - n * 864e5), tz);
  if (key === 'today') return { since: back(0), until: back(0) };
  if (key === 'yesterday') return { since: back(1), until: back(1) };
  const days = { '7d': 7, '14d': 14, '30d': 30 }[key] ?? 7;
  return { since: back(days - 1), until: back(0) };
}
export const tzBeda = (tz) => !!tz && !['Asia/Jakarta', 'Asia/Bangkok', 'Asia/Ho_Chi_Minh', 'Asia/Pontianak'].includes(tz);

// Isian rupiah: <input data-rp> otomatis jadi 135.000 saat diketik
export const rpVal = (v) => Number(String(v ?? '').replace(/\D/g, '')) || 0;
if (typeof document !== 'undefined' && document.addEventListener) {
  document.addEventListener('input', (e) => {
    const i = e.target;
    if (!(i instanceof HTMLInputElement) || !i.hasAttribute('data-rp')) return;
    const pos = i.selectionStart ?? i.value.length;
    const digitsBefore = i.value.slice(0, pos).replace(/\D/g, '').length;
    const d = i.value.replace(/\D/g, '').replace(/^0+(?=\d)/, '');
    const out = d ? Number(d).toLocaleString('id-ID') : '';
    i.value = out;
    let k = 0, p = 0;
    while (p < out.length && k < digitsBefore) { if (/\d/.test(out[p])) k++; p++; }
    try { i.setSelectionRange(p, p); } catch {}
  }, true);
}

export const ymdLocal = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export function customLabel(key) {
  if (!key?.startsWith('custom:')) return 'Pilih tanggal';
  const [, a, b] = key.split(':');
  const f = (x) => lokal(x).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
  return a === b ? f(a) : `${f(a)} – ${f(b)}`;
}
export const RANGE_LABEL = { today: 'Hari ini', yesterday: 'Kemarin', '7d': '7 hari', '14d': '14 hari', '30d': '30 hari' };

// ---------------------------------------------------------------- v1.15.0: halaman (20 data per halaman)
export const PER_HAL = 20;
export function potong(list, hal) {
  const pages = Math.max(1, Math.ceil(list.length / PER_HAL));
  const page = Math.min(Math.max(1, hal || 1), pages);
  return { rows: list.slice((page - 1) * PER_HAL, page * PER_HAL), page, pages, total: list.length };
}
export function pagerHtml({ page, pages, total }) {
  if (!total) return '';
  const a = (page - 1) * PER_HAL + 1, b = Math.min(page * PER_HAL, total);
  if (pages <= 1) return `<div class="pager"><span>${Number(total).toLocaleString('id-ID')} data</span></div>`;
  return `<div class="pager"><span>${a}–${b} dari <b>${Number(total).toLocaleString('id-ID')}</b> data</span>
    <div class="pg">
      <button type="button" class="btn sm" data-pg="${page - 1}" ${page <= 1 ? 'disabled' : ''}>‹ Sebelumnya</button>
      <label>Halaman <select data-pg-sel>${Array.from({ length: pages }, (_, i) => `<option value="${i + 1}" ${i + 1 === page ? 'selected' : ''}>${i + 1}</option>`).join('')}</select> dari ${pages}</label>
      <button type="button" class="btn sm" data-pg="${page + 1}" ${page >= pages ? 'disabled' : ''}>Selanjutnya ›</button>
    </div></div>`;
}
export function bindPager(box, go) {
  if (!box) return;
  box.onclick = (e) => { const b = e.target.closest('[data-pg]'); if (b && !b.disabled) go(Number(b.dataset.pg)); };
  const s = box.querySelector('[data-pg-sel]');
  if (s) s.onchange = () => go(Number(s.value));
}

// ---------------------------------------------------------------- v1.15.0: campaign › ad set › iklan dari data Meta
export function petaIklan(ins) {
  const meta = {};
  (ins || []).forEach((r) => { meta[r.ad_id] = { c: r.campaign_id || r.campaign_name, cn: r.campaign_name, a: r.adset_id || r.adset_name, an: r.adset_name, dn: r.ad_name }; });
  return (x) => {
    if (!x) return { c: '-', cn: '(tanpa iklan)', a: '-', an: '', d: '-', dn: 'manual' };
    const m = meta[x.ad_id];
    if (m) return { c: m.c, cn: m.cn, a: m.a, an: m.an, d: x.ad_id, dn: m.dn || x.ad_name };
    const cn = x.campaign_name || x.utm_campaign || '';
    const dn = x.ad_name || x.utm_content || '';
    return { c: cn ? 'n:' + cn : '-', cn: cn || '(tanpa campaign)', a: '-', an: '(ad set tidak diketahui)', d: x.ad_id || (dn ? 'n:' + dn : '-'), dn: dn || '(tanpa iklan)' };
  };
}
// opsi <select> campaign / ad set / iklan yang saling menyaring
export function opsiIklan(items, sel) {
  const camps = {}, sets = {}, ads = {};
  items.forEach((m) => { camps[m.c] = m.cn; sets[m.a] = { name: m.an, c: m.c }; ads[m.d] = { name: m.dn, a: m.a, c: m.c }; });
  const e = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const opt = (obj, cur, all, keep = () => true) => `<option value="">${all}</option>` +
    Object.entries(obj).filter(([k, v]) => keep(k, v)).sort((x, y) => String(x[1].name ?? x[1]).localeCompare(String(y[1].name ?? y[1])))
      .map(([k, v]) => `<option value="${e(k)}" ${k === cur ? 'selected' : ''}>${e(v.name ?? v)}</option>`).join('');
  return {
    ada: (s) => !s.c || !!camps[s.c],
    html: `<select data-f="c">${opt(camps, sel.c, 'Semua campaign')}</select>
      <select data-f="a">${opt(sets, sel.a, 'Semua ad set', (k, v) => !sel.c || v.c === sel.c)}</select>
      <select data-f="d">${opt(ads, sel.d, 'Semua iklan', (k, v) => (!sel.c || v.c === sel.c) && (!sel.a || v.a === sel.a))}</select>`,
  };
}
export const lolosIklan = (m, sel) => (!sel.c || m.c === sel.c) && (!sel.a || m.a === sel.a) && (!sel.d || m.d === sel.d);
