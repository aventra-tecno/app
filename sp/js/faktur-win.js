// 2.40 Faktur WIN ("Penjualan Harian per Faktur" dari WIN / PWM, file .xls / .xlsx).
// Faktur tidak memuat kode barang, hanya nama. Nama dicocokkan dengan master barang:
//   persis  : nama sama persis (spasi / huruf besar-kecil diabaikan)
//   mirip   : nama sedikit beda (mis. "VARIO 150 15" vs "VARIO 150") tapi harga sama dengan harga pricelist di master
//   harga   : barang ketemu, tapi harga faktur beda dengan harga pricelist di master
//   tidak   : tidak ada di master barang -> dipilih manual
import { xlsx } from './ui.js';
import { buildIndex, nameCandidates } from './daftar-file.js';

const NUM = (v) => { if (typeof v === 'number') return v; const s = String(v ?? '').replace(/[^\d,.-]/g, ''); if (!s) return 0; return Number(/,\d{1,2}$/.test(s) ? s.replace(/\./g, '').replace(',', '.') : s.replace(/[.,](?=\d{3}(\D|$))/g, '').replace(',', '.')) || 0; };
export const normName = (s) => String(s ?? '').toUpperCase().replace(/\s+/g, ' ').trim();
const key = (s) => normName(s).replace(/[^A-Z0-9 ]/g, ' ').split(/\s+/).filter(Boolean).sort().join(' ');
const MON = { JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, MEI: 5, JUN: 6, JUL: 7, AUG: 8, AGU: 8, AGS: 8, SEP: 9, OCT: 10, OKT: 10, NOV: 11, DEC: 12, DES: 12 };
const pad = (n) => String(n).padStart(2, '0');

export function toDate(v) {
  if (v instanceof Date && !isNaN(v)) return `${v.getFullYear()}-${pad(v.getMonth() + 1)}-${pad(v.getDate())}`;
  if (typeof v === 'number' && v > 30000 && v < 80000) { const d = new Date(Math.round((v - 25569) * 864e5)); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`; }
  const s = String(v ?? '').trim().toUpperCase();
  let m = s.match(/^(\d{1,2})[-\s/]([A-Z]{3})[A-Z]*[-\s/](\d{2,4})$/);
  if (m && MON[m[2]]) return `${m[3].length === 2 ? '20' + m[3] : m[3]}-${pad(MON[m[2]])}-${pad(m[1])}`;
  m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/); if (m) return `${m[1]}-${pad(m[2])}-${pad(m[3])}`;
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/); if (m) return `${m[3].length === 2 ? '20' + m[3] : m[3]}-${pad(m[2])}-${pad(m[1])}`;
  return null;
}

// file -> baris mentah (tanggal tetap tanggal)
export async function readFakturRows(file) {
  const X = await xlsx();
  const wb = X.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
  for (const n of wb.SheetNames) {
    const rows = X.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true, defval: '' });
    if (isFakturWin(rows)) return rows;
  }
  return null;
}

export function isFakturWin(rows) {
  let head = 0;
  for (const r of rows.slice(0, 60)) {
    const t = r.map((c) => String(c ?? '').trim().toLowerCase());
    if (t.some((c) => c.includes('per faktur'))) return true;
    if (t.includes('no faktur') && t.some((c) => c.includes('total net'))) head++;
  }
  return head > 0;
}

// -> { customer, lines: [{ date, inv, ref, no, name, qty, harga, disc, net }] }
export function parseFaktur(rows) {
  const lines = []; let date = null, headDate = null, inv = null, ref = '', customer = '';
  for (const r of rows) {
    const c = r.filter((x) => x !== '' && x !== null && x !== undefined);
    if (!c.length) continue;
    const s0 = typeof c[0] === 'string' ? c[0].trim() : c[0];
    // tanggal di kepala laporan: "Tanggal :" <tgl>
    const ti = c.findIndex((x) => /^tanggal\s*:?$/i.test(String(x).trim()));
    if (ti >= 0 && c[ti + 1] !== undefined) { headDate = toDate(c[ti + 1]) || headDate; continue; }
    // baris tanggal kelompok (satu sel berisi tanggal)
    if (c.length === 1 && toDate(s0)) { date = toDate(s0); continue; }
    // baris faktur: INC-00/2611/0665 | customer | sales | kota | SO | SJ | ref | bruto | net
    if (typeof s0 === 'string' && /^[A-Z]{2,5}-[\w]+\/[\w]+\/[\w]+/i.test(s0) && c.length >= 6) {
      inv = s0; customer = String(c[1] || customer).trim();
      ref = c.length >= 9 ? String(c[6] ?? '').trim() : '';
      continue;
    }
    // baris barang: "1." | nama | qty | harga | bruto | disc | net
    if (typeof s0 === 'string' && /^\d+\.$/.test(s0) && c.length >= 5 && inv) {
      const qty = NUM(c[2]), harga = NUM(c[3]);
      const net = c.length >= 7 ? NUM(c[6]) : NUM(c[c.length - 1]);
      const disc = c.length >= 7 ? String(c[5]).trim() : '';
      if (!qty) continue;
      lines.push({ date: date || headDate, inv, ref, no: parseInt(s0, 10), name: normName(c[1]), qty, harga, disc, net, unit: Math.round(net / qty) });
    }
  }
  lines.forEach((l) => { if (!l.date) l.date = headDate; });
  return { customer, lines };
}

// kemiripan dua nama (pasangan huruf, kata diurutkan) 0..1
function dice(a, b) {
  if (a === b) return 1;
  const bg = (s) => { const m = new Map(); for (let i = 0; i < s.length - 1; i++) { const g = s.slice(i, i + 2); m.set(g, (m.get(g) || 0) + 1); } return m; };
  const A = bg(a), B = bg(b); let inter = 0;
  for (const [g, n] of A) inter += Math.min(n, B.get(g) || 0);
  return (2 * inter) / Math.max(1, a.length - 1 + b.length - 1);
}

// cocokkan baris faktur dengan master barang
export function matchFaktur(lines, products) {
  const idx = buildIndex(products);
  const byName = new Map();
  for (const p of products) { const n = normName(p.name); if (!byName.has(n) || (!byName.get(n).active && p.active)) byName.set(n, p); p._k = p._k || key(p.name); }
  const memo = new Map();
  return lines.map((l) => {
    const mk = l.name + '|' + l.harga;
    if (!memo.has(mk)) memo.set(mk, matchOne(l, idx, byName));
    return { ...l, ...memo.get(mk) };
  });
}
function matchOne(l, idx, byName) {
  const plPrice = (p) => Number(p.macallan) || 0;
  const ex = byName.get(l.name);
  if (ex) return { p: ex, st: plPrice(ex) && plPrice(ex) !== l.harga ? 'harga' : 'persis', sim: 100 };
  const k = key(l.name);
  const cands = nameCandidates(idx, l.name, 25).map((x) => ({ p: x.p, s: dice(k, x.p._k || key(x.p.name)) })).sort((a, b) => b.s - a.s);
  const same = cands.find((x) => x.s >= 0.8 && plPrice(x.p) === l.harga);
  if (same) return { p: same.p, st: 'mirip', sim: Math.round(same.s * 100), cands: cands.slice(0, 3).map((x) => x.p) };
  const top = cands[0];
  if (top && top.s >= 0.92) return { p: top.p, st: 'harga', sim: Math.round(top.s * 100), cands: cands.slice(0, 3).map((x) => x.p) };
  return { p: null, st: 'tidak', sim: top ? Math.round(top.s * 100) : 0, cands: cands.slice(0, 3).map((x) => x.p) };
}
