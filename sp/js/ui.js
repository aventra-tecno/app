import { supa, errMsg } from './supa.js';

// ---------- format ----------
export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const nf = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 });
export const num = (n) => nf.format(Math.round(Number(n) || 0));
export const rp = (n) => (Number(n) < 0 ? '−Rp' : 'Rp') + nf.format(Math.abs(Math.round(Number(n) || 0)));
export const pct = (n) => (n === null || n === undefined ? '–' : Math.round(n) + '%');

// Kolom isian nominal (data-money): titik ribuan muncul langsung saat mengetik, mis. 15000 -> 15.000.
// Baca nilainya dengan parseNum(), jangan dengan +value.
export function fmtMoneyInput(inp) {
  const v = inp.value, pos = inp.selectionStart ?? v.length;
  const neg = inp.dataset.money === 'neg' && /^\s*[-−]/.test(v);
  const before = v.slice(0, pos).replace(/\D/g, '').length;
  const digits = v.replace(/\D/g, '').replace(/^0+(?=\d)/, '').slice(0, 15);
  const out = (neg ? '-' : '') + (digits ? nf.format(Number(digits)) : '');
  if (out === v) return;
  inp.value = out;
  let i = neg ? 1 : 0, d = 0;
  while (i < out.length && d < before) { if (/\d/.test(out[i])) d++; i++; }
  try { if (document.activeElement === inp) inp.setSelectionRange(i, i); } catch (_) {}
}
if (typeof document !== 'undefined') {
  document.addEventListener('input', (e) => { if (e.target?.matches?.('input[data-money]')) fmtMoneyInput(e.target); }, true);
  // nilai awal yang ditulis tanpa titik ikut dirapikan saat kolom disentuh
  document.addEventListener('focusin', (e) => { if (e.target?.matches?.('input[data-money]')) fmtMoneyInput(e.target); }, true);
}

const TZ = 'Asia/Jakarta';
export const todayStr = () => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());
export const addDays = (dateStr, n) => { const d = new Date(dateStr + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
export const monthStart = (dateStr = todayStr()) => dateStr.slice(0, 8) + '01';
const toDate = (v) => { const d = new Date(v); return isNaN(d) ? null : d; };
export const fmtDate = (v, opt = { day: 'numeric', month: 'short', year: 'numeric' }) => { const d = v && toDate(v); return d ? new Intl.DateTimeFormat('id-ID', { timeZone: TZ, ...opt }).format(d) : '–'; };
export const fmtDateTime = (v) => { const d = v && toDate(v); return d ? new Intl.DateTimeFormat('id-ID', { timeZone: TZ, day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(d) : '–'; };
export const fmtTime = (v) => { const d = v && toDate(v); return d ? new Intl.DateTimeFormat('id-ID', { timeZone: TZ, hour: '2-digit', minute: '2-digit' }).format(d) : '–'; };
export const longToday = () => new Intl.DateTimeFormat('id-ID', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date());
export function ago(v) {
  const s = (Date.now() - new Date(v).getTime()) / 1000;
  if (s < 60) return 'baru saja';
  if (s < 3600) return Math.floor(s / 60) + ' mnt';
  if (s < 86400) return Math.floor(s / 3600) + ' jam';
  if (s < 172800) return 'kemarin';
  return fmtDate(v, { day: 'numeric', month: 'short' });
}
export function parseNum(v) {
  if (typeof v === 'number') return v;
  let s = String(v ?? '').replace(/rp/i, '').replace(/\s/g, '');
  if (!s) return 0;
  const neg = /^-|^\(/.test(s);
  s = s.replace(/[^0-9.,]/g, '');
  const lastDot = s.lastIndexOf('.'), lastComma = s.lastIndexOf(',');
  if (lastDot > -1 && lastComma > -1) {
    const dec = lastDot > lastComma ? '.' : ',';
    s = s.split(dec === '.' ? ',' : '.').join('').replace(dec, '.');
  } else if (lastComma > -1) {
    s = /^\d{1,3}(,\d{3})+$/.test(s) ? s.replace(/,/g, '') : s.replace(',', '.');
  } else if (lastDot > -1) {
    if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  }
  const n = parseFloat(s) || 0;
  return neg ? -n : n;
}

// kode barang: '01-B38-305-47AA' = '01B3830547AA' = barcode '01B3830547AA1'
export const normSku = (s) => String(s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
export function skuMatch(scan, sku) {
  const a = normSku(scan), b = normSku(sku);
  if (!a || !b) return false;
  return a === b || (a.length > 6 && /[0-9]$/.test(a) && a.slice(0, -1) === b);
}
// 2.35: tombol salin kode (span, supaya boleh di dalam baris yang bisa diklik)
const COPY_SVG = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
export const copyBtn = (text) => text ? `<span class="cpy" role="button" tabindex="0" data-copy="${esc(text)}" title="Salin kode" aria-label="Salin ${esc(text)}">${COPY_SVG}</span>` : '';
export const codeCopy = (text, cls = 'xs muted mono') => `<span class="${cls} code-c">${esc(text || '')}${copyBtn(text)}</span>`;
export async function copyText(t) {
  try { await navigator.clipboard.writeText(t); }
  catch (_) { const ta = document.createElement('textarea'); ta.value = t; ta.style.cssText = 'position:fixed;opacity:0'; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); } catch (__) {} ta.remove(); }
  toast('Disalin: ' + t, 'ok');
}
// pencarian teks yang sama dengan aturan scan: nama / kode berisi kata, kode tanpa strip,
// dan barcode dengan 1 angka tambahan di belakang ('01B3830547AA1' -> '01B3830547AA')
export function codeHit(q, p) {
  const s = String(q || '').trim().toLowerCase(); if (!s) return true;
  const n = normSku(s);
  return String(p.name || '').toLowerCase().includes(s) || String(p.sku || '').toLowerCase().includes(s)
    || (n && normSku(p.sku).includes(n)) || skuMatch(s, p.sku);
}
// filter PostgREST .or(...) untuk tabel products dengan aturan di atas
export function codeOr(q, extra = []) {
  const s = String(q || '').replace(/[,()*%\\]/g, ' ').trim(); if (!s) return null;
  const n = normSku(s);
  const parts = [`name.ilike.%${s}%`, `sku.ilike.%${s}%`, ...extra.map((c) => `${c}.ilike.%${s}%`)];
  if (n) parts.push(`sku_norm.ilike.%${n}%`);
  if (n.length > 6 && /[0-9]$/.test(n)) parts.push(`sku_norm.eq.${n.slice(0, -1)}`);
  return parts.join(',');
}

// ---------- dom ----------
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
// Pasang klik/aksi lewat delegasi. Kalau dipasang ulang (render ulang / buka halaman lagi)
// pemasangan lama DIGANTI, bukan ditumpuk -> tidak ada pop-up dobel / tombol macet.
export function on(root, event, selector, fn) {
  const reg = root.__onReg || (root.__onReg = new Map());
  const key = event + '|' + selector;
  const prev = reg.get(key);
  if (prev) root.removeEventListener(event, prev);
  const h = (e) => {
    const t = e.target.closest(selector);
    if (t && root.contains(t)) fn(e, t);
  };
  reg.set(key, h);
  root.addEventListener(event, h);
}
export const debounce = (fn, ms = 300) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

// ---------- icons (stroke) ----------
const P = {
  home: '<path d="M3 12 12 4l9 8"/><path d="M5 10v10h14V10"/>',
  chart: '<path d="M3 3v18h18"/><path d="m7 15 4-4 3 3 5-6"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10"/><path d="M12 8v4m0 4h.01"/>',
  box: '<path d="M21 8 12 3 3 8v8l9 5 9-5z"/><path d="M3 8l9 5 9-5M12 13v8"/>',
  more: '<circle cx="5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="19" cy="12" r="1.2"/>',
  bag: '<path d="M6 2 3 6v14h18V6l-3-4z"/><path d="M3 6h18M16 10a4 4 0 0 1-8 0"/>',
  upload: '<path d="M12 15V3m-5 5 5-5 5 5"/><path d="M4 15v5h16v-5"/>',
  download: '<path d="M12 3v12m-5-5 5 5 5-5"/><path d="M4 15v5h16v-5"/>',
  truck: '<path d="M1 4h14v12H1zM15 9h4l4 4v3h-8"/><circle cx="5" cy="18" r="2"/><circle cx="17" cy="18" r="2"/>',
  list: '<path d="M4 6h16M4 12h16M4 18h10"/>',
  scan: '<path d="M3 7V3h4M17 3h4v4M21 17v4h-4M7 21H3v-4"/><path d="M7 12h10"/>',
  ret: '<path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-15-6.7L3 13"/>',
  clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  user: '<path d="M16 21v-2a4 4 0 0 0-8 0v2"/><circle cx="12" cy="7" r="4"/>',
  users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/>',
  clip: '<path d="M9 2h6v4H9z"/><path d="M8 4H5v18h14V4h-3"/>',
  bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
  tag: '<path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z"/><path d="M7.5 7.5h.01"/>',
  wallet: '<path d="M2 6h20v12H2z"/><circle cx="12" cy="12" r="3"/>',
  receipt: '<path d="M5 2h14v20l-3-2-2 2-2-2-2 2-2-2-3 2z"/><path d="M9 7h6M9 11h6M9 15h4"/>',
  send: '<path d="m22 2-7 20-4-9-9-4z"/><path d="M22 2 11 13"/>',
  barcode: '<path d="M3 5v14M7 5v14M11 5v14M14 5v14M18 5v14M21 5v14"/>',
  inbox: '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.5 5h13L22 12v7H2v-7z"/>',
  cart: '<circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/><path d="M2 3h3l2.6 12.4a1 1 0 0 0 1 .8h9.6a1 1 0 0 0 1-.8L21 7H6"/>',
  grid: '<path d="M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z"/>',
  bt: '<path d="m7 7 10 10-5 5V2l5 5L7 17"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
  calendar: '<path d="M8 2v4m8-4v4"/><path d="M3 8h18v13H3z"/>',
  help: '<circle cx="12" cy="12" r="10"/><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>',
  compass: '<circle cx="12" cy="12" r="10"/><path d="m16 8-2 6-6 2 2-6z"/>',
  camera: '<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>',
  check: '<path d="m5 12 5 5L20 7"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  back: '<path d="M15 18 9 12l6-6"/>',
  chev: '<path d="m9 18 6-6-6-6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  alert: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5M21 12H9"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>',
  sliders: '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>',
  eye: '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>',
  eyeoff: '<path d="M17.9 17.9A10 10 0 0 1 12 20c-7 0-11-8-11-8a18 18 0 0 1 5.1-5.9M9.9 4.2A9 9 0 0 1 12 4c7 0 11 8 11 8a18 18 0 0 1-2.2 3.2M1 1l22 22"/><path d="M14.1 14.1a3 3 0 1 1-4.2-4.2"/>',
  print: '<path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M6 14h12v8H6z"/>',
  file: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6"/>',
  lock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  install: '<rect x="5" y="2" width="14" height="20" rx="2"/><path d="M12 8v7m-3-3 3 3 3-3"/>',
  refresh: '<path d="M23 4v6h-6M1 20v-6h6"/><path d="M3.5 9a9 9 0 0 1 14.9-3.4L23 10M1 14l4.6 4.4A9 9 0 0 0 20.5 15"/>'
};
// versi ikon "terisi" (untuk menu bawah yang aktif): bentuk utama diisi putih, detail di dalamnya biru
// [indeks bentuk yang diisi, indeks detail]; ikon yang tidak terdaftar: bentuk pertama diisi
const SOLID = {
  home: [[0, 1], []], shield: [[0], [1]], tag: [[0], [1]], grid: [[0], []], calendar: [[1], []], box: [[0], [1]], bag: [[0], [1]],
  clock: [[0], [1]], wallet: [[0], [1]], receipt: [[0], [1]], user: [[0, 1], []], users: [[0, 1], []], truck: [[0, 1, 2], []],
  bell: [[0], []], inbox: [[1], [0]], alert: [[0], [1]], file: [[0], [1]], camera: [[0], [1]], send: [[0], [1]], gear: [[1], [0]],
  cart: [[0, 1], []], chart: [[], []], barcode: [[], []], scan: [[], []], check: [[], []], upload: [[], []], list: [[], []], link: [[], []], search: [[], []]
};
export function iconSolid(name, size = 22, sw = 2) {
  const parts = (P[name] || '').match(/<[^>]+\/>/g) || [];
  const [fill, det] = SOLID[name] || [[0], []];
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${parts.map((p, i) =>
    fill.includes(i) ? p.replace(/^<(\w+)/, '<$1 fill="#fff"') : det.includes(i) ? p.replace(/^<(\w+)/, '<$1 stroke="var(--solid-in, #26348B)"') : p).join('')}</svg>`;
}
export function icon(name, size = 20, sw = 2) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name] || ''}</svg>`;
}

// ---------- toast ----------
export function toast(msg, type = '') {
  const box = document.getElementById('toasts');
  const el = document.createElement('div');
  el.className = 'toast ' + type;
  el.textContent = msg;
  box.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .3s'; }, type === 'err' ? 4200 : 2600);
  setTimeout(() => el.remove(), type === 'err' ? 4600 : 3000);
}
export const toastErr = (e) => { console.error(e); toast(errMsg(e), 'err'); };

// ---------- modal ----------
// actions: [{label, cls, value, onClick?:async()=>bool(close?)}]
export function modal({ title, body = '', actions = [{ label: 'Tutup', value: null }], wide = false, onOpen }) {
  return new Promise((resolve) => {
    const ov = document.createElement('div');
    ov.className = 'overlay';
    ov.innerHTML = `<div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <div class="modal-h"><h2>${esc(title)}</h2><button class="icon-btn" style="border:0;width:40px;height:40px" data-x aria-label="Tutup">${icon('x')}</button></div>
      <div class="modal-b">${body}</div>
      ${actions.length ? `<div class="modal-actions">${actions.map((a, i) => `<button class="btn ${a.cls || ''}" data-i="${i}">${esc(a.label)}</button>`).join('')}</div>` : ''}
    </div>`;
    const close = (v) => { ov.remove(); document.removeEventListener('keydown', keyH); resolve(v); };
    const keyH = (e) => { if (e.key === 'Escape') close(null); };
    document.addEventListener('keydown', keyH);
    ov.addEventListener('click', async (e) => {
      if (e.target === ov || e.target.closest('[data-x]')) return close(null);
      const b = e.target.closest('[data-i]');
      if (!b) return;
      const a = actions[+b.dataset.i];
      if (a.onClick) {
        b.disabled = true;
        try { const r = await a.onClick(ov); if (r !== false) close(r === undefined ? a.value : r); }
        catch (err) { toastErr(err); }
        finally { b.disabled = false; }
      } else close(a.value);
    });
    document.body.appendChild(ov);
    onOpen && onOpen(ov, close);
    const f = ov.querySelector('input:not([type=hidden]),select,textarea');
    if (f && window.innerWidth > 700) setTimeout(() => f.focus(), 50);
  });
}
export const confirmBox = (title, text, okLabel = 'Ya, lanjut', danger = false) =>
  modal({ title, body: `<p style="margin:0">${text}</p>`, actions: [{ label: 'Batal', value: false }, { label: okLabel, value: true, cls: danger ? 'btn-dark' : 'btn-primary' }] });
export async function promptBox(title, label, { value = '', placeholder = '', type = 'text', required = true } = {}) {
  const r = await modal({
    title, body: `<label class="field">${esc(label)}<input class="input" id="pb-in" type="${type}" value="${esc(value)}" placeholder="${esc(placeholder)}"></label>`,
    actions: [{ label: 'Batal', value: null }, { label: 'Simpan', cls: 'btn-primary', onClick: (ov) => { const v = ov.querySelector('#pb-in').value.trim(); if (required && !v) { toast('Wajib diisi', 'err'); return false; } return v; } }]
  });
  return r;
}

// ---------- feedback ----------
let actx;
export function beep(ok = true) {
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    const o = actx.createOscillator(), g = actx.createGain();
    o.type = 'square'; o.frequency.value = ok ? 1500 : 220;
    g.gain.value = 0.06; o.connect(g); g.connect(actx.destination);
    o.start(); o.stop(actx.currentTime + (ok ? 0.08 : 0.35));
  } catch (_) { /* no audio */ }
  if (navigator.vibrate) navigator.vibrate(ok ? 40 : [80, 60, 80]);
}

// ---------- photo ----------
export function pickPhoto() {
  return new Promise((resolve) => {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = 'image/*'; inp.capture = 'environment';
    inp.onchange = () => resolve(inp.files[0] || null);
    inp.click();
  });
}
export async function compress(file, max = 960, quality = 0.55) {   // 2.36: ±80–120 KB per foto
  const bmp = await createImageBitmap(file);
  const r = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * r); c.height = Math.round(bmp.height * r);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  return await new Promise((res) => c.toBlob(res, 'image/jpeg', quality));
}
export async function uploadPhoto(file, folder) {
  const blob = await compress(file);
  const path = `${folder}/${todayStr()}/${crypto.randomUUID()}.jpg`;
  const { error } = await supa.storage.from('photos').upload(path, blob, { contentType: 'image/jpeg' });
  if (error) throw error;
  return path;
}
export async function photoUrl(path) {
  if (!path) return null;
  const { data } = await supa.storage.from('photos').createSignedUrl(path, 3600);
  return data?.signedUrl || null;
}
// komponen: tombol ambil foto yang menyimpan path di data-path
export function photoField(id, label = 'Ketuk untuk ambil foto') {
  return `<button type="button" class="photo-drop" id="${id}" data-path="">${icon('camera', 26)}<span class="small">${esc(label)}</span></button>`;
}
export function bindPhoto(root, id, folder) {
  const el = root.querySelector('#' + id);
  el.addEventListener('click', async () => {
    const f = await pickPhoto();
    if (!f) return;
    el.innerHTML = '<span class="small">Mengunggah foto…</span>';
    try {
      const path = await uploadPhoto(f, folder);
      el.dataset.path = path;
      el.innerHTML = `<img src="${URL.createObjectURL(f)}" alt="Foto">`;
    } catch (e) { toastErr(e); el.innerHTML = `${icon('camera', 26)}<span class="small">Gagal, coba lagi</span>`; }
  });
  return () => el.dataset.path || null;
}

// ---------- scripts & excel ----------
const loaded = {};
export function loadScript(src) {
  if (!loaded[src]) loaded[src] = new Promise((res, rej) => {
    const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('Gagal memuat ' + src));
    document.head.appendChild(s);
  });
  return loaded[src];
}
export async function xlsx() {
  await loadScript('https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js');
  return window.XLSX;
}
export async function downloadXlsx(filename, rows, sheet = 'Data') {
  const X = await xlsx();
  const ws = X.utils.json_to_sheet(rows);
  const wb = X.utils.book_new();
  X.utils.book_append_sheet(wb, ws, sheet);
  X.writeFile(wb, filename);
}

// ---------- small render helpers ----------
export const skeleton = (n = 4) => `<div class="stack">${Array.from({ length: n }, () => '<div class="skeleton" style="height:64px"></div>').join('')}</div>`;
export const emptyState = (text, ic = 'box') => `<div class="empty">${icon(ic, 36, 1.6)}<div>${esc(text)}</div></div>`;
export const pageHead = (title, desc = '', actions = '') =>
  // 2.23: keterangan panjang di bawah judul dihilangkan (tampilan lebih bersih); parameter desc diabaikan
  `<div class="page-head"><div><h2 style="font-size:22px">${esc(title)}</h2></div>${actions ? `<div class="actions">${actions}</div>` : ''}</div>`;
export function chips(name, options, current) {
  return `<div class="chips scroll" data-chips="${name}">${options.map(([v, l]) => `<button class="chip ${v === current ? 'on' : ''}" data-v="${esc(v)}">${esc(l)}</button>`).join('')}</div>`;
}
export const ROLE_LABEL = { owner: 'Owner', admin: 'Admin', sopir: 'Sopir', kepala_gudang: 'Kepala Gudang', picker: 'Picker', packing: 'Packing', keuangan: 'Keuangan', supervisor: 'Supervisor Gudang', qc: 'QC', cs: 'CS Marketplace', marketing: 'Marketing', pending: 'Menunggu', sistem: 'Sistem', superadmin: 'Super admin' };
export const ROLE_COLOR = { owner: '#1A1D1B', admin: '#5B3E9A', sopir: '#1B4280', kepala_gudang: '#17563A', picker: '#6B4A00', packing: '#8A2E20', keuangan: '#8A6A00', supervisor: '#0F4A40', qc: '#2E5E8C', cs: '#9A3D6B', marketing: '#B5562A', sistem: '#6B6F6A', superadmin: '#A63A2A' };
export const STATUS_LABEL = {
  baru: ['Baru', ''], menunggu_win: ['Menunggu WIN', 'yellow'], siap_pick: ['Siap diambil', 'blue'], siap_packing: ['Siap packing', 'blue'],
  dikirim: ['Dikirim', 'green'], selesai: ['Selesai', 'green'], cancel: ['Cancel', 'red'], retur: ['Retur', 'red']
};
export const statusTag = (s) => { const [l, c] = STATUS_LABEL[s] || [s, '']; return `<span class="tag ${c}">${esc(l)}</span>`; };

// 2.30: kombinasi warna aplikasi — 'biru' (navy, bawaan) atau 'hitam' (hitam + kuning). Dipilih owner di Pengaturan.
export const THEMES = { biru: { label: 'Biru', bar: '#26348B' }, hitam: { label: 'Hitam', bar: '#1A1D1B' } };
export function applyTheme(t) {
  const th = THEMES[t] ? t : 'biru';
  document.documentElement.dataset.theme = th;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEMES[th].bar);
  try { localStorage.setItem('ui-theme', th); } catch (_) {}
  return th;
}
