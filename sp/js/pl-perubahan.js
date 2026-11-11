import { matchFaktur, normName } from './faktur-win.js';
// 2.42 PDF "Daftar Perubahan Pricelist WIN" (bulanan). Isinya bukan pricelist lengkap:
//   PERUBAHAN HARGA            : nama, harga lama, harga baru         (tanpa kode barang)
//   (DAFTAR) PRODUK BARU       : nama, harga, qty, satuan             (tanpa kode barang)
//   PERUBAHAN NAMA & PART NUMBER: nama lama, PN lama, nama baru, PN baru
//   PERUBAHAN QTY              : barang, qty lama, qty baru           (isi per dus, hanya info)
// Barang dicocokkan ke master lewat nama (+ harga lama sebagai penentu), lalu disimpan lewat import_pricelist.

const isPN = (s) => /^\d{2}-[A-Z0-9]{3}-[A-Z0-9]{3}-[A-Z0-9]{3,5}$/i.test(String(s).trim()) || (/^[A-Z0-9][A-Z0-9-]{6,}$/i.test(String(s).trim()) && /\d/.test(s) && /-/.test(s));
const isMoney = (s) => /^(rp\.?\s*)?\d{1,3}([.,]\d{3})+$|^\d{4,}$/i.test(String(s).trim());
const isInt = (s) => /^\d{1,5}\.?$/.test(String(s).trim());
const money = (s) => Number(String(s).replace(/[^\d]/g, '')) || 0;

// judul kolom -> kunci
const HEAD = [
  ['oldName', /^NAMA\s*(BARANG|PRODUK|ITEM)?\s*LAMA$/], ['newName', /^NAMA\s*(BARANG|PRODUK|ITEM)?\s*BARU$/],
  ['oldPn', /^(PART\s*NUMBER|PN|KODE)\s*LAMA$/], ['newPn', /^(PART\s*NUMBER|PN|KODE)\s*BARU$/],
  ['lama', /^(HARGA\s*LAMA|OLD(\s*PRICE)?)$/], ['baru', /^(HARGA\s*BARU|NEW(\s*PRICE)?)$/],
  ['qlama', /^QTY\s*LAMA$/], ['qbaru', /^QTY\s*BARU$/],
  ['name', /^(NAMA\s*(BARANG|PRODUK|ITEM)?|BARANG|ITEM\s*NAME)$/], ['harga', /^(HARGA|PRICE(\s*LIST)?)$/],
  ['qty', /^QTY$/], ['sat', /^(SAT|SATUAN)$/], ['ket', /^(KET|KETERANGAN)$/], ['tgl', /^TGL\s*BERLAKU$/], ['no', /^NO\.?$/]
];
const TEXT_COL = ['name', 'oldName', 'newName', 'ket', 'tgl', 'sat'];

function phrasesOf(items) {
  const out = [];
  for (const it of items) {
    const last = out[out.length - 1];
    if (last && it.x - last.x1 < Math.max(4, (it.h || 8) * 0.8)) { last.text += ' ' + it.str; last.x1 = it.x + (it.w || 0); }
    else out.push({ text: it.str, x0: it.x, x1: it.x + (it.w || 0), h: it.h || 8 });
  }
  out.forEach((p) => { p.text = p.text.replace(/\s+/g, ' ').trim(); p.cx = (p.x0 + p.x1) / 2; });
  return out;
}

export function isChangeDoc(pages) {
  const t = pages.slice(0, 2).flatMap((p) => p.items.map((i) => String(i.str).toUpperCase())).join(' ');
  return /PERUBAHAN/.test(t) && /(PRICELIST|HARGA)/.test(t) && !/ITEM\s*CODE/.test(t);
}

// pages: [{ items: [{ str, x, y, w, h }] }] (y dari bawah halaman, seperti pdf.js)
export function parseChangeItems(pages) {
  const out = { harga: [], baru: [], nama: [], qty: [] };
  let sec = null, sub = '', cols = null;
  for (const pg of pages) {
    const items = pg.items.filter((i) => String(i.str).trim()).map((i) => ({ ...i, str: String(i.str).replace(/\s+/g, ' ').trim() }));
    items.sort((a, b) => b.y - a.y || a.x - b.x);
    const lines = [];
    for (const it of items) {
      const ln = lines.find((l) => Math.abs(l.y - it.y) <= Math.max(2, (it.h || 8) * 0.45));
      if (ln) ln.items.push(it); else lines.push({ y: it.y, h: it.h || 8, items: [it] });
    }
    lines.forEach((l) => { l.items.sort((a, b) => a.x - b.x); l.ph = phrasesOf(l.items); l.text = l.ph.map((p) => p.text).join(' ').toUpperCase(); });
    // baris isi tabel per bagian, lalu digabung jadi barang
    let block = [];
    const flush = () => { if (sec && cols && block.length) emit(out, sec, sub, cols, block); block = []; };
    for (const l of lines) {
      const T = l.text.trim();
      // judul bagian
      if (/PERUBAHAN\s+HARGA/.test(T) && !/NAMA/.test(T) && l.ph.length <= 2) { flush(); sec = 'harga'; sub = ''; cols = null; continue; }
      if (/PRODUK\s+BARU/.test(T) && l.ph.length <= 2) { flush(); sec = 'baru'; sub = ''; cols = null; continue; }
      if ((/PERUBAHAN\s+NAMA\s+DAN/.test(T) || /NAMA\s*&\s*PN/.test(T) || /DIGANTI\s+NAMA/.test(T)) && l.ph.length <= 2) { flush(); sec = 'nama'; sub = ''; cols = null; continue; }
      if (/PERUBAHAN\s+(QTY|ISI)/.test(T) && l.ph.length <= 2) { flush(); sec = 'qty'; sub = ''; cols = null; continue; }
      // judul kolom
      const hk = l.ph.map((p) => ({ ...p, key: (HEAD.find(([, re]) => re.test(p.text.toUpperCase())) || [])[0] }));
      const keys = new Set(hk.filter((p) => p.key).map((p) => p.key));
      if (keys.size >= 3 && (keys.has('name') || keys.has('oldName'))) {
        flush();
        cols = hk.filter((p) => p.key).sort((a, b) => a.cx - b.cx);
        if (keys.has('qlama')) sec = 'qty';
        else if (keys.has('oldPn') || keys.has('oldName')) sec = 'nama';
        else if (keys.has('lama') && keys.has('baru')) sec = 'harga';
        else if (keys.has('harga') && sec !== 'harga') sec = 'baru';
        continue;
      }
      // sub-judul (MIKA / SPAREPART, PERUBAHAN PART NUMBER / PERUBAHAN NAMA)
      if (l.ph.length === 1 && !/\d/.test(T) && cols) {
        const x = l.ph[0];
        if (sec === 'nama' && /^PERUBAHAN\s+(PART\s+NUMBER|NAMA)$/.test(T)) { flush(); sub = /PART/.test(T) ? 'pn' : 'nama'; continue; }
        if (sec === 'baru' && /^[A-Z &]{3,20}$/.test(T) && x.cx > cols[0].cx + 150) { flush(); sub = T; continue; }
      }
      if (!cols) continue;
      block.push(l);
    }
    flush();
  }
  return out;
}

function emit(out, sec, sub, cols, lines) {
  const bounds = cols.map((c, i) => (i < cols.length - 1 ? (c.cx + cols[i + 1].cx) / 2 : Infinity));
  const keyAt = (p) => { let i = bounds.findIndex((b) => p.cx < b); if (i < 0) i = cols.length - 1; return i; };
  const fix = (p) => {
    let i = keyAt(p), k = cols[i].key;
    const t = p.text;
    // isi harus cocok dengan jenis kolom; kalau tidak, pindah ke kolom teks terdekat di kiri
    const ok = (key) => (['lama', 'baru', 'harga'].includes(key) ? isMoney(t) : ['qty', 'qlama', 'qbaru', 'no'].includes(key) ? isInt(t) : ['oldPn', 'newPn'].includes(key) ? isPN(t) : true);
    if (ok(k)) return k;
    // teks di kolom angka sebelah kanan nama (mis. "belum ada info" di kolom QTY) -> keterangan
    const lastText = Math.max(...cols.map((c, j) => (['name', 'oldName', 'newName'].includes(c.key) ? j : -1)));
    if (i > lastText && cols.some((c) => c.key === 'ket') && !isPN(t)) return 'ket';
    if (isPN(t)) { const pn = cols.filter((c) => c.key === 'oldPn' || c.key === 'newPn'); if (pn.length) return pn.reduce((a, c) => (Math.abs(c.cx - p.cx) < Math.abs(a.cx - p.cx) ? c : a)).key; }
    for (let j = i; j >= 0; j--) if (TEXT_COL.includes(cols[j].key) && !['sat', 'tgl', 'ket'].includes(cols[j].key)) return cols[j].key;
    return cols.find((c) => TEXT_COL.includes(c.key))?.key || k;
  };
  // pisahkan part number yang menempel ke teks nama dalam 1 potongan
  const PNRE = /\b\d{2}-[A-Z0-9]{3}-[A-Z0-9]{3}-[A-Z0-9]{3,5}\b/i;
  const split = (p) => {
    const m = p.text.match(PNRE);
    if (!m || m[0] === p.text) return [p];
    const per = (p.x1 - p.x0) / Math.max(1, p.text.length), out = [];
    const add = (text, from) => { const t = text.trim(); if (!t) return; const x0 = p.x0 + per * (from + text.indexOf(t)); out.push({ ...p, text: t, x0, x1: x0 + per * t.length, cx: x0 + (per * t.length) / 2 }); };
    add(p.text.slice(0, m.index), 0); add(m[0], m.index); out.push(...split({ ...p, text: p.text.slice(m.index + m[0].length), x0: p.x0 + per * (m.index + m[0].length) }).filter((q) => q.text.trim()).map((q) => ({ ...q, text: q.text.trim(), cx: q.x0 + (per * q.text.trim().length) / 2, x1: q.x0 + per * q.text.trim().length })));
    return out;
  };
  lines.forEach((l) => { l.ph = l.ph.flatMap(split); });
  const rows = lines.map((l) => { const cells = {}; l.ph.forEach((p) => { const k = fix(p); (cells[k] ||= []).push(p.text); }); return { y: l.y, h: l.h, cells }; });
  // baris inti (punya nomor / harga / part number); baris lain = nama yang terlipat
  const isAnchor = (r) => r.cells.no || (sec === 'harga' && (r.cells.lama || r.cells.baru)) || (sec === 'baru' && r.cells.harga) || (sec === 'nama' && (r.cells.oldPn || r.cells.newPn)) || (sec === 'qty' && r.cells.qlama);
  const anchors = rows.filter(isAnchor);
  anchors.forEach((a) => (a.parts = [a]));
  // teks di sel Excel ditaruh di tengah (atas-bawah): bagian nama di atas & di bawah baris inti sama banyak.
  // baris yang jaraknya sama ke 2 barang -> ikut barang di atasnya kalau barang itu masih kurang bagian bawahnya.
  anchors.forEach((a) => { a.up = 0; a.down = 0; });
  rows.filter((r) => !isAnchor(r)).sort((x, y) => y.y - x.y).forEach((r) => {
    const above = anchors.filter((a) => a.y > r.y).sort((x, y) => x.y - y.y)[0], below = anchors.filter((a) => a.y < r.y).sort((x, y) => y.y - x.y)[0];
    const dA = above ? above.y - r.y : Infinity, dB = below ? r.y - below.y : Infinity;
    const tol = Math.max(r.h, 6) * 0.35;
    let best = Math.abs(dA - dB) <= tol ? (above && above.up > above.down ? above : below || above) : dA < dB ? above : below;
    const d = best === above ? dA : dB;
    if (best && d <= Math.max(best.h, r.h) * 2.6) { best.parts.push(r); if (best === above) best.down++; else best.up++; }
  });
  const join = (a, k) => a.parts.slice().sort((x, y) => y.y - x.y).map((p) => (p.cells[k] || []).join(' ')).filter(Boolean).join(' ').replace(/\s+/g, ' ').replace(/\s*\/\s*/g, ' / ').trim();
  for (const a of anchors) {
    const g = (k) => (a.cells[k] || []).join(' ').trim();
    const no = parseInt(g('no'), 10) || null;
    if (sec === 'harga') { const name = join(a, 'name'); if (name && g('lama') && g('baru')) out.harga.push({ no, name, lama: money(g('lama')), baru: money(g('baru')), ket: join(a, 'ket'), tgl: join(a, 'tgl') }); }
    if (sec === 'baru') { const name = join(a, 'name'); if (name && g('harga')) out.baru.push({ no, name, harga: money(g('harga')), qty: parseInt(g('qty'), 10) || null, sat: g('sat'), ket: join(a, 'ket'), group: sub }); }
    if (sec === 'nama') { const r = { no, oldName: join(a, 'oldName'), oldPn: g('oldPn'), newName: join(a, 'newName'), newPn: g('newPn'), kind: sub || 'nama' }; if (r.oldPn || r.newPn) out.nama.push(r); }
    if (sec === 'qty') { const name = join(a, 'name'); if (name) out.qty.push({ no, name, lama: parseInt(g('qlama'), 10) || 0, baru: parseInt(g('qbaru'), 10) || 0, sat: g('sat') }); }
  }
}

export async function readChangePdf(file) {
  const CDN = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/';
  const P = await import(CDN + 'pdf.min.mjs');
  P.GlobalWorkerOptions.workerSrc = CDN + 'pdf.worker.min.mjs';
  const doc = await P.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const pages = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const tc = await (await doc.getPage(n)).getTextContent();
    pages.push({ items: tc.items.map((i) => ({ str: i.str, x: i.transform[4], y: i.transform[5], w: i.width, h: i.height || Math.abs(i.transform[3]) || 8 })) });
  }
  if (!isChangeDoc(pages)) return null;
  return parseChangeItems(pages);
}

// ---------- cocokkan dengan master barang ----------
const nk = (s) => String(s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
export function matchChanges(d, products) {
  const bySku = new Map(products.map((p) => [nk(p.sku), p]));
  // ganti nama & PN
  const nama = d.nama.map((r) => {
    const p = bySku.get(nk(r.oldPn)) || bySku.get(nk(r.newPn)) || null;
    if (!p) return { ...r, p: null, st: 'tidak' };
    const gName = !!r.newName && normName(r.newName) !== normName(p.name), gPn = !!r.newPn && nk(r.newPn) !== nk(p.sku);
    return { ...r, p, gName, gPn, st: gName || gPn ? 'ganti' : 'sudah' };
  });
  // nama baru / lama dari daftar ganti nama ikut dipakai untuk mencocokkan (daftar harga sering memakai nama baru)
  const virt = products.slice();
  nama.filter((r) => r.p).forEach((r) => { [r.newName, r.oldName].forEach((n) => n && normName(n) !== normName(r.p.name) && virt.push({ ...r.p, name: n, _k: undefined, _o: r.p })); });
  const real = (p) => (p ? p._o || p : null);
  // nama mirip tidak boleh beda warna / varian (mis. BESAR BIRU vs BESAR SILVER)
  const WARNA = /^(HITAM|PUTIH|MERAH|BIRU|KUNING|SILVER|HIJAU|ABU|GRAY|GREY|PINK|KREM|COKLAT|ORANGE|ORANYE|UNGU|TOSCA|MAROON|DOFF|CANDY|GELAP|CHROOM|CHROME|GOLD|EMAS|BESAR|KECIL|KIRI|KANAN|DEPAN|BELAKANG|ATAS|BAWAH|LUAR|DALAM)$/;
  const tags = (n) => new Set(normName(n).replace(/[^A-Z0-9 ]/g, ' ').split(/\s+/).filter((w) => WARNA.test(w)));
  const sameTags = (a, b) => { const A = tags(a), B = tags(b); return A.size === B.size && [...A].every((w) => B.has(w)); };
  const ok = (m, name) => m.p && (m.st === 'persis' || (m.st === 'mirip' && sameTags(name, m.p.name)));
  const m1 = matchFaktur(d.harga.map((h) => ({ name: normName(h.name), harga: h.lama })), virt);
  const m2 = matchFaktur(d.harga.map((h) => ({ name: normName(h.name), harga: h.baru })), virt);
  const harga = d.harga.map((h, i) => {
    let m = null, st = 'tidak';
    if (ok(m1[i], h.name)) m = m1[i]; else if (ok(m2[i], h.name)) m = m2[i]; else if (m1[i].p && m1[i].st === 'harga' && sameTags(h.name, m1[i].p.name)) m = m1[i];
    const p = m ? real(m.p) : null;
    if (p) { const mac = Number(p.macallan) || 0; st = mac === h.baru ? 'sudah' : !mac || mac === h.lama ? 'siap' : 'beda'; }
    return { ...h, p, st, sim: m?.sim, cands: (m1[i].cands || []).map(real) };
  });
  const m3 = matchFaktur(d.baru.map((b) => ({ name: normName(b.name), harga: b.harga })), virt);
  const baru = d.baru.map((b, i) => {
    // produk baru: hanya nama persis sama (barang baru biasanya memang belum ada di master)
    const m = m3[i], exact = m.p && m.sim === 100 && (m.st === 'persis' || m.st === 'harga');
    const p = exact ? real(m.p) : null;
    return { ...b, p, st: p ? (Number(p.macallan) === b.harga ? 'ada_sama' : 'ada_beda') : 'belum', sim: m.sim, cands: (m.cands || []).map(real) };
  });
  return { harga, baru, nama, qty: d.qty };
}
