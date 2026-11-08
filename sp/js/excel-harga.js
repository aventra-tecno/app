// Excel "Pricelist + rekap per toko" (menu Atur harga › Unduh Excel)
// Tab 1 PRICELIST : pricelist terbaru + ringkasan (jumlah barang, kategori, dll).
// Tab berikutnya  : satu tab per toko untuk tanggal yang dipilih, format seperti rekap kertas.
//                   Ringkasan di atas memakai rumus: kalau resi & kode diketik manual di baris abu-abu,
//                   keterangan & harga terisi otomatis dari tab PRICELIST dan totalnya ikut berubah.
import { Book, colName, excelDate } from './xlsx-writer.js';

const PINK = 'FF3EA5', PINK_SOFT = 'FDE3F1', RED_SOFT = 'F9E8E4', GREY = 'F3F2EE', MUTED = '6B6F6A';
const RP = '"Rp"#,##0';
const DATE_FMT = '[$-421]d mmmm yyyy';   // tanggal bahasa Indonesia, mis. 31 Agustus 2026
const DATE_DAYS = 120;                   // pilihan tanggal: 60 hari sebelum s/d 59 hari sesudah
// kode tanpa strip / spasi / titik, huruf besar (sama seperti pencarian di aplikasi)
const normKey = (v) => String(v ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
export const EXTRA_ROWS = 50;   // baris kosong per toko untuk diisi manual
const PL_HEAD = 9;              // baris judul tabel di tab PRICELIST
const ST_HEAD = 8;              // baris judul tabel di tab toko

const sheetName = (s, used) => {
  let n = String(s || 'TOKO').replace(/[\\/?*[\]:']/g, ' ').trim().slice(0, 31) || 'TOKO';
  if (n.toUpperCase() === 'PRICELIST') n = 'TOKO ' + n;
  let k = n, i = 2;
  while (used.has(k.toUpperCase())) k = n.slice(0, 28) + ' ' + i++;
  used.add(k.toUpperCase());
  return k;
};

// data: { products, stores, rows (rekap_harian), settings, lastUpload, dateLabel, printedAt }
// date: 'YYYY-MM-DD' (tanggal resi)
export function buildHargaBook({ products, stores = [], rows = [], settings = {}, suppliers = [], lastUpload = null, date, printedAt }) {
  const s = settings;
  const SUPS = suppliers.length ? suppliers : [{ code: 'WIN', name: 'WIN', potongan_5_pct: s.potongan_5_pct ?? 5, diskon_beli_pct: s.diskon_beli_pct ?? 25, diskon_set_pct: s.diskon_set_pct ?? 30, set_keyword: s.diskon_set_keyword || 'COMPLETE SET' }];
  const supOf = (p) => SUPS.find((x) => x.code === (p.supplier || 'WIN')) || SUPS[0];
  // judul kolom ikut menampilkan persentase rumus, mis. HARGA BELI (−25% / −30%), HARGA SHOPEE (+20%)
  const pctTxt = (v) => String(Number(v || 0)).replace('.', ',') + '%';
  const beliTxt = (x) => (!Number(x.diskon_beli_pct) && !x.set_keyword ? '= MACALLAN' : '−' + pctTxt(x.diskon_beli_pct) + (x.set_keyword ? ' / −' + pctTxt(x.diskon_set_pct) : ''));
  const shopeeTxt = (x) => x.shopee_mode === 'rumus' ? ['+' + pctTxt(x.shopee_plus_pct), Number(x.shopee_plus_rp) ? (x.shopee_plus_rp < 0 ? '−' : '+') + 'Rp' + Math.abs(x.shopee_plus_rp).toLocaleString('id-ID') : ''].filter((t) => t && t !== '+0%').join(' ') || 'rumus' : x.shopee_mode === 'file' ? 'ikut file' : 'manual';
  const both = (f) => (SUPS.length === 1 ? f(SUPS[0]) : SUPS.map((x) => x.name + ' ' + f(x)).join(' · '));
  const BELI_LBL = `HARGA BELI (${both(beliTxt)})`, SHOPEE_LBL = `HARGA SHOPEE (${both(shopeeTxt)})`;
  const wb = new Book();
  const st = {
    title: wb.style({ bold: true, size: 13, color: 'FFFFFF', fill: PINK, h: 'center', v: 'center' }),
    head: wb.style({ bold: true, color: 'FFFFFF', fill: PINK, border: true, h: 'center', v: 'center', wrap: true }),
    sub: wb.style({ italic: true, color: MUTED }),
    note: wb.style({ italic: true, size: 9, color: MUTED, wrap: true, v: 'top' }),
    lbl: wb.style({ bold: true, fill: PINK_SOFT, border: true, v: 'center' }),
    valN: wb.style({ bold: true, size: 12, border: true, h: 'right', fmt: '#,##0' }),
    valRp: wb.style({ bold: true, size: 12, border: true, h: 'right', fmt: RP }),
    valPct: wb.style({ bold: true, size: 12, border: true, h: 'right', fmt: '0.0%' }),
    valT: wb.style({ bold: true, size: 12, border: true, h: 'right' }),
    titleR: wb.style({ bold: true, size: 13, color: 'FFFFFF', fill: PINK, h: 'right', v: 'center' }),
    titleDate: wb.style({ bold: true, size: 13, color: 'FFFFFF', fill: PINK, h: 'left', v: 'center', fmt: DATE_FMT }),
    keyCol: wb.style({ border: true, fmt: '@', italic: true, color: MUTED, fill: GREY })
  };
  const cell = {};
  const cs = (o) => { const k = JSON.stringify(o); return (cell[k] ??= wb.style({ border: true, ...o })); };
  const summary = (ws, r, c1, c2, cv, label, value, vs) => {
    ws.merge(r, c1, r, c2);
    ws.set(r, c1, label, st.lbl); for (let c = c1 + 1; c <= c2; c++) ws.set(r, c, null, st.lbl);
    ws.set(r, cv, value, vs);
  };
  const title = (ws, text, last) => { ws.merge(1, 1, 1, last); ws.set(1, 1, text, st.title); for (let c = 2; c <= last; c++) ws.set(1, c, null, st.title); ws.height(1, 24); };
  const head = (ws, r, labels) => { labels.forEach((l, i) => ws.set(r, i + 1, l, st.head)); ws.height(r, 46); };

  // ---------------- tab PRICELIST ----------------
  const sord = (p) => SUPS.indexOf(supOf(p));
  const pl = [...products].sort((a, b) => sord(a) - sord(b) || String(a.category || '').localeCompare(String(b.category || '')) || String(a.name).localeCompare(String(b.name)));
  const ws = wb.sheet('PRICELIST', { cols: [6, 20, 44, 24, 11, 14, 22, 22, 11, 9, 18], freezeRow: PL_HEAD });
  title(ws, 'PRICELIST TERBARU · ' + SUPS.map((x) => x.name).join(' & '), 11);
  ws.merge(2, 1, 2, 11);
  ws.set(2, 1, `Diunduh ${printedAt || ''}${lastUpload ? ` · pricelist terakhir diupload ${lastUpload}` : ''}`, st.sub);
  const cats = new Set(pl.map((p) => String(p.category || '').trim()).filter(Boolean));
  const nShp = pl.filter((p) => Number(p.harga_shopee) > 0).length;
  const shpTxt = (x) => x.shopee_mode === 'rumus' ? `Shopee +${[Number(x.shopee_plus_pct) ? x.shopee_plus_pct + '%' : '', Number(x.shopee_plus_rp) ? 'Rp' + x.shopee_plus_rp : ''].filter(Boolean).join(' +') || '0'}` : x.shopee_mode === 'file' ? 'Shopee ikut file' : 'Shopee manual';
  const supRow = (x) => [`${x.name} (beli −${x.diskon_beli_pct}%${x.set_keyword ? ' / ' + x.diskon_set_pct + '%' : ''} · ${shpTxt(x)})`, pl.filter((p) => supOf(p) === x).length, st.valN];
  const supRows = SUPS.slice(0, 2).map(supRow);
  if (supRows.length < 2) supRows.push(['Rumus harga Shopee', shpTxt(SUPS[0]).replace(/^Shopee\s*/, 'Macallan '), st.valT]);
  const sum = [
    ['Jumlah barang', pl.length, st.valN, 'Jumlah kategori / bagian', cats.size, st.valN],
    [...supRows[0], ...supRows[1]],
    ['Sudah ada harga Shopee', nShp, st.valN, 'Belum ada harga Shopee', pl.length - nShp, st.valN],
    ['Harga dikunci owner', pl.filter((p) => p.price_locked).length, st.valN, 'Modal kosong (harga beli Rp0)', pl.filter((p) => !Number(p.harga_beli)).length, st.valN],
    ['Total Macallan (1 pcs tiap barang)', pl.reduce((a, p) => a + Number(p.macallan || 0), 0), st.valRp, 'Est. potongan Shopee sebelum dana cair', `${s.shopee_fee_pct ?? 0}%`, st.valT]
  ];
  sum.forEach(([l1, v1, s1, l2, v2, s2], i) => { summary(ws, 3 + i, 2, 3, 4, l1, v1, s1); summary(ws, 3 + i, 5, 7, 8, l2, v2, s2); });
  head(ws, PL_HEAD, ['NO', 'KODE', 'KETERANGAN', 'KATEGORI', 'SUPPLIER', 'MACALLAN', BELI_LBL, SHOPEE_LBL, 'DISKON BELI', 'DIKUNCI', 'KODE TANPA STRIP']);
  const cN = cs({ h: 'center' }), cT = cs({ fmt: '@' }), cTx = cs({}), cR = cs({ fmt: RP }), cRz = cs({ fmt: RP, fill: RED_SOFT }), cP = cs({ fmt: '0%', h: 'center' });
  pl.forEach((p, i) => {
    const r = PL_HEAD + 1 + i;
    const R = supOf(p), d = p.diskon_pct ?? (p.price_group === 'set' ? Number(R.diskon_set_pct) : Number(R.diskon_beli_pct));
    ws.set(r, 1, i + 1, cN); ws.set(r, 2, String(p.sku || ''), cT); ws.set(r, 3, p.name || '', cTx); ws.set(r, 4, p.category || '', cTx); ws.set(r, 5, R.name, cN);
    ws.set(r, 6, Number(p.macallan || 0), cR); ws.set(r, 7, Number(p.harga_beli || 0), Number(p.harga_beli) ? cR : cRz);
    ws.set(r, 8, Number(p.harga_shopee || 0), cR); ws.set(r, 9, Number(d || 0) / 100, cP); ws.set(r, 10, p.price_locked ? 'YA' : '', cN);
    ws.set(r, 11, normKey(p.sku), st.keyCol);   // dipakai pencarian: kode dengan / tanpa strip dianggap sama
  });
  const plLast = PL_HEAD + Math.max(1, pl.length);
  ws.autoFilter(PL_HEAD, 1, plLast, 11);
  const PLC = (col) => `PRICELIST!$${col}$${PL_HEAD + 1}:$${col}$${plLast}`;

  // ---------------- daftar tanggal (tab tersembunyi) untuk pilihan tanggal di judul tab toko ----------------
  const d0 = excelDate(date);
  const tg = wb.sheet('TANGGAL', { cols: [22], hidden: true });
  const dCell = wb.style({ fmt: DATE_FMT });
  for (let i = 0; i < DATE_DAYS; i++) tg.set(i + 1, 1, d0 - 60 + i, dCell);
  const DATE_LIST = `TANGGAL!$A$1:$A$${DATE_DAYS}`;
  wb.sheets.splice(wb.sheets.indexOf(tg), 1);   // dipindah ke paling belakang setelah tab toko

  // ---------------- tab per toko ----------------
  const groups = new Map();
  stores.filter((t) => t.active !== false).forEach((t) => groups.set('id' + t.id, { name: t.name, orders: new Map() }));
  rows.forEach((r) => {
    const k = r.store_id ? 'id' + r.store_id : 'none';
    if (!groups.has(k)) groups.set(k, { name: r.store_name || 'TANPA TOKO', orders: new Map() });
    const g = groups.get(k).orders;
    if (!g.has(r.order_id)) g.set(r.order_id, []);
    g.get(r.order_id).push(r);
  });
  if (!groups.size) groups.set('none', { name: 'TOKO', orders: new Map() });
  const used = new Set(['PRICELIST']);
  const HEAD = ['NO', 'NO RESI', 'KODE', 'KETERANGAN', 'QTT', 'MACALLAN', BELI_LBL, SHOPEE_LBL, 'HARGA SELESAI', 'MARGIN', 'STATUS'];
  const C = (fill) => ({ n: cs({ h: 'center', ...(fill && { fill }) }), t: cs({ fmt: '@', ...(fill && { fill }) }), x: cs({ ...(fill && { fill }) }), r: cs({ fmt: RP, ...(fill && { fill }) }) });
  const norm = C(null), bad = C(RED_SOFT), grey = C(GREY);

  for (const { name, orders } of groups.values()) {
    const sh = wb.sheet(sheetName(name, used), { cols: [6, 22, 18, 42, 6, 13, 20, 20, 15, 13, 12, { w: 8, hidden: true }], freezeRow: ST_HEAD });
    // judul: NAMA TOKO | tanggal (klik sel tanggal -> panah -> pilih tanggal lain)
    sh.merge(1, 1, 1, 4); sh.set(1, 1, String(name).toUpperCase(), st.titleR);
    for (let c = 2; c <= 4; c++) sh.set(1, c, null, st.titleR);
    sh.merge(1, 5, 1, 11); sh.set(1, 5, d0, st.titleDate);
    for (let c = 6; c <= 11; c++) sh.set(1, c, null, st.titleDate);
    sh.height(1, 26);
    sh.listValidation(1, 5, DATE_LIST);
    head(sh, ST_HEAD, HEAD);
    let r = ST_HEAD + 1, n = 0;
    const tot = { resi: 0, qty: 0, mac: 0, beli: 0, shp: 0, sel: 0, mar: 0, bad: 0, lunas: 0 };
    for (const items of orders.values()) {
      n++; const o = items[0];
      const isBad = ['cancel', 'retur'].includes(o.status);
      const stt = o.status === 'cancel' ? 'CANCEL' : o.status === 'retur' ? 'RETUR' : o.paid ? 'LUNAS' : 'BELUM CAIR';
      tot.resi++; if (isBad) tot.bad++; if (stt === 'LUNAS') tot.lunas++;
      tot.mar += Number(o.margin || 0);
      const S = isBad ? bad : norm;
      items.forEach((i, k) => {
        const q = Number(i.qty || 1);
        const v = [Number(i.macallan || 0) * q, Number(i.harga_beli || 0) * q, Number(i.harga_jual || 0) * q];
        tot.qty += q; tot.mac += v[0];
        if (!isBad) { tot.beli += v[1]; tot.shp += v[2]; if (k === 0) tot.sel += Number(o.harga_selesai || 0); }
        sh.set(r, 1, k === 0 ? n : null, S.n); sh.set(r, 2, k === 0 ? String(o.resi || o.order_no || '') : null, S.t); sh.set(r, 3, String(i.sku || ''), S.t);
        sh.set(r, 4, i.name || '', S.x); sh.set(r, 5, q, S.n);
        v.forEach((x, j) => sh.set(r, 6 + j, x, S.r));
        sh.set(r, 9, k === 0 ? Number(o.harga_selesai || 0) : null, S.r); sh.set(r, 10, k === 0 ? Number(o.margin || 0) : null, S.r);
        sh.set(r, 11, stt, S.n);
        r++;
      });
    }
    const first = ST_HEAD + 1;
    // baris kosong dengan rumus: isi NO RESI, KODE, QTT, HARGA SELESAI -> sisanya otomatis dari tab PRICELIST
    for (let k = 0; k < EXTRA_ROWS; k++, r++) {
      // kode diketik dengan / tanpa strip, spasi, titik -> dicocokkan ke kolom "KODE TANPA STRIP" di PRICELIST
      // (barcode dengan 1 angka tambahan di belakang juga dicocokkan, sama seperti di aplikasi)
      const key = `SUBSTITUTE(SUBSTITUTE(SUBSTITUTE(SUBSTITUTE(UPPER(TRIM($C${r}&"")),"-","")," ",""),".",""),"/","")`;
      const qty = `IF($E${r}="",1,$E${r})`;
      const look = (col) => ({ f: `IF($C${r}="","",IF($L${r}=0,0,INDEX(${PLC(col)},$L${r})*${qty}))`, v: '' });
      sh.set(r, 12, { f: `IF($C${r}="","",IFERROR(MATCH(${key},${PLC('K')},0),IF(LEN(${key})>6,IFERROR(MATCH(LEFT(${key},LEN(${key})-1),${PLC('K')},0),0),0)))`, v: '' });
      sh.set(r, 1, { f: `IF($B${r}="","",COUNTA($B$${first}:$B${r}))`, v: '' }, grey.n);
      sh.set(r, 2, null, norm.t); sh.set(r, 3, null, norm.t);
      sh.set(r, 4, { f: `IF($C${r}="","",IF($L${r}=0,"KODE TIDAK ADA DI PRICELIST",INDEX(${PLC('C')},$L${r})))`, v: '' }, grey.x);
      sh.set(r, 5, null, norm.n);
      ['F', 'G', 'H'].forEach((col, j) => sh.set(r, 6 + j, look(col), grey.r));
      sh.set(r, 9, null, norm.r);
      sh.set(r, 10, { f: `IF($I${r}="","",$I${r}-$G${r})`, v: '' }, grey.r);
      sh.set(r, 11, null, norm.n);
    }
    const last = r - 1;
    const R = (col) => `$${col}$${first}:$${col}$${last}`;
    const ok = (col) => `SUMIFS(${R(col)},${R('K')},"<>CANCEL",${R('K')},"<>RETUR")`;
    summary(sh, 2, 2, 3, 4, 'Jumlah resi', { f: `COUNTA(${R('B')})`, v: tot.resi }, st.valN);
    summary(sh, 3, 2, 3, 4, 'Total barang (qty)', { f: `SUM(${R('E')})`, v: tot.qty }, st.valN);
    summary(sh, 4, 2, 3, 4, 'Total Macallan', { f: `SUM(${R('F')})`, v: tot.mac }, st.valRp);
    summary(sh, 5, 2, 3, 4, 'Resi cancel / retur', { f: `COUNTIFS(${R('K')},"CANCEL",${R('B')},"<>")+COUNTIFS(${R('K')},"RETUR",${R('B')},"<>")`, v: tot.bad }, st.valN);
    summary(sh, 6, 2, 3, 4, 'Resi sudah cair', { f: `COUNTIFS(${R('K')},"LUNAS",${R('B')},"<>")`, v: tot.lunas }, st.valN);
    summary(sh, 2, 6, 8, 9, 'Total modal (harga beli)', { f: ok('G'), v: tot.beli }, st.valRp);
    summary(sh, 3, 6, 8, 9, 'Total harga Shopee', { f: ok('H'), v: tot.shp }, st.valRp);
    summary(sh, 4, 6, 8, 9, 'Total harga selesai (pendapatan)', { f: ok('I'), v: tot.sel }, st.valRp);
    summary(sh, 5, 6, 8, 9, 'Total margin', { f: `SUM(${R('J')})`, v: tot.mar }, st.valRp);
    summary(sh, 6, 6, 8, 9, 'Margin dari pendapatan', { f: 'IFERROR(I5/I4,0)', v: tot.sel ? tot.mar / tot.sel : 0 }, st.valPct);
    sh.merge(2, 10, 6, 11);
    sh.set(2, 10, 'Baris abu-abu: cukup ketik NO RESI, KODE (boleh pakai / tanpa strip), QTT & HARGA SELESAI. Keterangan, harga & margin terisi otomatis dari tab PRICELIST, ringkasan di kiri ikut berubah. Resi berisi beberapa barang: tulis harga selesai di baris pertama. Ganti tanggal: klik tanggal di judul, lalu pilih dari panah.', st.note);
  }
  wb.sheets.push(tg);
  return { wb, stores: groups.size, products: pl.length, resi: new Set(rows.map((x) => x.order_id)).size, colName };
}

// codes: supplier yang dipilih (mis. ['WIN'] atau ['WIN','STRONG'])
export async function downloadHargaExcel({ date, products, suppliers = [], codes = null }) {
  if (codes?.length) { suppliers = suppliers.filter((x) => codes.includes(x.code)); products = products.filter((p) => codes.includes(p.supplier || 'WIN')); }
  const [{ supa, rpc }, { store }, ui] = await Promise.all([import('./supa.js'), import('./store.js'), import('./ui.js')]);
  const [{ data: stores, error: e1 }, { data: lastPl }, rows] = await Promise.all([
    supa.from('stores').select('id, name, active').order('sort').order('name'),
    supa.from('uploads').select('created_at, filename').eq('type', 'pricelist').order('created_at', { ascending: false }).limit(1),
    rpc('rekap_harian', { p_date: date })
  ]);
  if (e1) throw e1;
  const lu = lastPl?.[0];
  const out = buildHargaBook({
    products, stores: stores || [], rows: rows || [], settings: store.settings || {}, suppliers,
    lastUpload: lu ? ui.fmtDate(lu.created_at) + (lu.filename ? ` (${lu.filename})` : '') : null,
    date,
    printedAt: ui.fmtDateTime(new Date())
  });
  const blob = await out.wb.toBlob();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = `pricelist-${(suppliers.length ? suppliers.map((x) => x.name) : ['WIN']).join('-').replace(/[^\w-]+/g, '')}-${date}.xlsx`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  return out;
}
