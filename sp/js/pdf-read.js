// Membaca pricelist dalam bentuk PDF (mis. PDF hasil "Save as PDF" dari Excel) menjadi baris tabel,
// lalu diproses sama seperti file Excel. Bekerja untuk PDF yang berisi teks (bukan hasil scan / foto).
const CDN = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/';
let lib = null;
async function pdfjs() {
  if (!lib) {
    lib = await import(CDN + 'pdf.min.mjs');
    lib.GlobalWorkerOptions.workerSrc = CDN + 'pdf.worker.min.mjs';
  }
  return lib;
}

// nama kolom yang dikenali di judul tabel PDF
const COLS = [
  ['code', /^(ITEM\s*CODE|KODE(\s*BARANG)?|PART\s*(NUMBER|NO\.?)|SKU|BARCODE|KODE\s*PART)$/],
  ['name', /^(ITEM\s*NAME|NAMA(\s*BARANG)?|KETERANGAN|DESKRIPSI|DESCRIPTION|NAMA\s*ITEM)$/],
  ['warna', /^(WARNA|COLOU?R)$/],
  ['price', /^(PRICE(\s*LIST)?(\s*\d{4})?|HARGA(\s*\w+)*|MACALLAN|HET|PRICELIST(\s*\d{4})?)$/],
  ['category', /^(KATEGORI|CATEGORY|GROUP)$/],
  ['no', /^(NO\.?|#)$/]
];
const LABEL = { code: 'Kode', name: 'Nama Barang', warna: 'Warna', price: 'Macallan', category: 'Kategori' };
const isCode = (s) => /^[A-Z0-9][A-Z0-9.\-\/ ]{2,}$/i.test(s) && /\d/.test(s) && /[-.\/]|^[A-Z0-9]{5,}$/i.test(s.replace(/\s/g, '')) && s.replace(/[^A-Z0-9]/gi, '').length >= 5;

// pages: [{ items: [{ str, x, y, w, h }] }]  (y = dari bawah halaman, seperti pdf.js)
export function pdfItemsToRows(pages) {
  const out = []; let cols = null; let headerDone = false;
  for (const pg of pages) {
    const items = pg.items.filter((i) => String(i.str).trim() !== '').map((i) => ({ ...i, str: String(i.str).replace(/\s+/g, ' ').trim(), cx: i.x + (i.w || 0) / 2 }));
    if (!items.length) continue;
    // 1) kelompokkan per baris (y mirip)
    items.sort((a, b) => b.y - a.y || a.x - b.x);
    const lines = [];
    for (const it of items) {
      const tol = Math.max(2, (it.h || 8) * 0.45);
      const ln = lines.find((l) => Math.abs(l.y - it.y) <= tol);
      if (ln) ln.items.push(it); else lines.push({ y: it.y, h: it.h || 8, items: [it] });
    }
    lines.forEach((l) => l.items.sort((a, b) => a.x - b.x));
    // 2) cari baris judul tabel (ada kolom kode & harga / nama)
    let headY = null;
    for (const l of lines) {
      const phrases = mergePhrases(l.items);
      const found = phrases.map((p) => ({ ...p, col: (COLS.find(([, re]) => re.test(p.text.toUpperCase())) || [])[0] })).filter((p) => p.col);
      const kinds = new Set(found.map((p) => p.col));
      if (kinds.has('code') && (kinds.has('price') || kinds.has('name'))) {
        cols = found.sort((a, b) => a.cx - b.cx); headY = l.y; break;
      }
    }
    if (!cols) continue;            // belum ketemu judul tabel
    if (!headerDone) { out.push(cols.filter((c) => LABEL[c.col]).map((c) => LABEL[c.col])); headerDone = true; }
    const order = cols.filter((c) => LABEL[c.col]).map((c) => c.col);
    // batas kolom = titik tengah antar judul kolom
    const bounds = cols.map((c, i) => (i < cols.length - 1 ? (c.cx + cols[i + 1].cx) / 2 : Infinity));
    const isPrice = (t) => /^(rp\.?\s*)?\d{1,3}([.,]\d{3})+([.,]\d{1,2})?$|^\d{4,}$/i.test(t);
    const colOf = (it) => {
      let i = bounds.findIndex((b) => it.cx < b); if (i < 0) i = cols.length - 1;
      let c = cols[i].col;
      // kolom kode hanya untuk teks berbentuk kode; teks lain (nama yang mulai di kiri) masuk kolom nama
      if (c === 'code' && !isCode(it.str)) c = order.includes('name') ? 'name' : c;
      // kolom harga hanya untuk angka; teks lain milik kolom sebelumnya (warna / nama)
      if (c === 'price' && !isPrice(it.str)) { const prev = cols.slice(0, i).reverse().find((x) => x.col !== 'price' && x.col !== 'no'); c = prev ? prev.col : c; }
      if (c === 'no' && !/^\d+\.?$/.test(it.str)) c = isCode(it.str) ? 'code' : 'name';
      return c;
    };
    const body = lines.filter((l) => headY == null || l.y < headY - 1);
    // 3) baris yang punya kode = 1 barang; baris lain (nama terlipat) menempel ke barang terdekat
    const rows = [];
    for (const l of body) {
      const cells = {};
      for (const it of l.items) { const c = colOf(it); (cells[c] ||= []).push(it.str); }
      const code = (cells.code || []).join(' ').trim();
      if (code && isCode(code)) rows.push({ y: l.y, h: l.h, cells, extra: [] });
      else rows.push({ y: l.y, h: l.h, cells, loose: true });
    }
    const anchors = rows.filter((r) => !r.loose);
    for (const r of rows.filter((x) => x.loose)) {
      let best = null, d = Infinity;
      for (const a of anchors) { const dd = Math.abs(a.y - r.y); if (dd < d) { d = dd; best = a; } }
      const lim = Math.max(best?.h || 8, r.h) * 1.9;
      if (best && d <= lim && !r.cells.code) best.extra.push(r);
      else {
        // judul bagian (mis. ***COMPLETE SET HONDA***) atau teks lain di luar tabel
        const text = Object.values(r.cells).flat().join(' ').trim();
        if (text && !/^(hal(aman)?\.?\s*)?\d+(\s*(\/|dari|of)\s*\d+)?$/i.test(text)) r.section = text;
      }
    }
    for (const r of rows) {
      if (r.section) { out.push([r.section]); continue; }
      if (r.loose) continue;
      const parts = [...r.extra, r].sort((a, b) => b.y - a.y);   // urut atas -> bawah
      out.push(order.map((c) => {
        if (c === 'code' || c === 'price') return (r.cells[c] || []).join(' ').trim();
        return parts.map((p) => (p.cells[c] || []).join(' ')).filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
      }));
    }
  }
  return out;
}

// gabungkan potongan teks yang berdekatan di satu baris menjadi frasa (mis. "ITEM" + "CODE")
function mergePhrases(items) {
  const out = [];
  for (const it of items) {
    const last = out[out.length - 1];
    const gap = last ? it.x - last.x1 : Infinity;
    if (last && gap < Math.max(4, (it.h || 8) * 0.8)) { last.text += ' ' + it.str; last.x1 = it.x + (it.w || 0); }
    else out.push({ text: it.str, x0: it.x, x1: it.x + (it.w || 0) });
  }
  out.forEach((p) => { p.text = p.text.replace(/\s+/g, ' ').trim(); p.cx = (p.x0 + p.x1) / 2; });
  return out;
}

export async function readPdf(file) {
  const P = await pdfjs();
  const doc = await P.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const pages = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    const tc = await page.getTextContent();
    pages.push({ items: tc.items.map((i) => ({ str: i.str, x: i.transform[4], y: i.transform[5], w: i.width, h: i.height || Math.abs(i.transform[3]) || 8 })) });
  }
  const rows = pdfItemsToRows(pages);
  if (rows.length < 2) throw new Error('Tabel di PDF tidak terbaca. Pastikan PDF berisi teks (bukan hasil scan / foto) dan punya judul kolom seperti ITEM CODE / KODE dan PRICE LIST / HARGA.');
  return rows;
}

// 2.33: baca PDF jadi baris teks (untuk daftar belanja WIN / nota), tanpa harus ada judul kolom
export async function readPdfLines(file) {
  const P = await pdfjs();
  const doc = await P.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const out = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const tc = await (await doc.getPage(n)).getTextContent();
    const items = tc.items.filter((i) => String(i.str).trim()).map((i) => ({ str: String(i.str).replace(/\s+/g, ' ').trim(), x: i.transform[4], y: i.transform[5], w: i.width, h: i.height || Math.abs(i.transform[3]) || 8 }));
    items.sort((a, b) => b.y - a.y || a.x - b.x);
    const lines = [];
    for (const it of items) {
      const ln = lines.find((l) => Math.abs(l.y - it.y) <= Math.max(2, it.h * 0.45));
      if (ln) ln.items.push(it); else lines.push({ y: it.y, items: [it] });
    }
    lines.forEach((l) => { l.items.sort((a, b) => a.x - b.x); out.push(mergePhrases(l.items).map((p) => p.text)); });
  }
  return out;
}
