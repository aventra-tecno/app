// Excel menu Rekap harian: berwarna & rapi seperti Excel di Atur harga.
// Tab RINGKASAN (semua toko) + satu tab per toko dengan ringkasan di atas & tabel resi.
import { Book } from './xlsx-writer.js';

const PINK = 'FF3EA5', PINK_SOFT = 'FDE3F1', RED_SOFT = 'F9E8E4', MUTED = '6B6F6A', GREEN_SOFT = 'DCEFE4';
const RP = '"Rp"#,##0';
const HEAD_ROW = 8;

const sheetName = (s, used) => {
  let n = String(s || 'TOKO').replace(/[\\/?*[\]:']/g, ' ').trim().slice(0, 31) || 'TOKO';
  if (n.toUpperCase() === 'RINGKASAN') n = 'TOKO ' + n;
  let k = n, i = 2;
  while (used.has(k.toUpperCase())) k = n.slice(0, 28) + ' ' + i++;
  used.add(k.toUpperCase());
  return k;
};
const statusTxt = (o) => (o.status === 'cancel' ? 'CANCEL' : o.status === 'retur' ? 'RETUR' : o.paid ? 'LUNAS' : 'BELUM CAIR');
const bad = (o) => ['cancel', 'retur'].includes(o.status);

// rows = hasil rekap_harian, dateLabel mis. "5 NOVEMBER 2026"
export function buildRekapBook({ rows = [], dateLabel = '', printedAt = '', storeFilter = null }) {
  const wb = new Book();
  const st = {
    title: wb.style({ bold: true, size: 13, color: 'FFFFFF', fill: PINK, h: 'center', v: 'center' }),
    head: wb.style({ bold: true, color: 'FFFFFF', fill: PINK, border: true, h: 'center', v: 'center', wrap: true }),
    sub: wb.style({ italic: true, color: MUTED }),
    lbl: wb.style({ bold: true, fill: PINK_SOFT, border: true, v: 'center' }),
    valN: wb.style({ bold: true, size: 12, border: true, h: 'right', fmt: '#,##0' }),
    valRp: wb.style({ bold: true, size: 12, border: true, h: 'right', fmt: RP }),
    valPct: wb.style({ bold: true, size: 12, border: true, h: 'right', fmt: '0.0%' }),
    totL: wb.style({ bold: true, border: true, fill: PINK_SOFT }),
    totN: wb.style({ bold: true, border: true, fill: PINK_SOFT, h: 'right', fmt: '#,##0' }),
    totR: wb.style({ bold: true, border: true, fill: PINK_SOFT, h: 'right', fmt: RP }),
    totP: wb.style({ bold: true, border: true, fill: PINK_SOFT, h: 'right', fmt: '0.0%' })
  };
  const cache = {};
  const cs = (o) => { const k = JSON.stringify(o); return (cache[k] ??= wb.style({ border: true, ...o })); };
  const C = (fill) => ({ n: cs({ h: 'center', ...(fill && { fill }) }), t: cs({ fmt: '@', ...(fill && { fill }) }), x: cs({ ...(fill && { fill }) }), r: cs({ fmt: RP, ...(fill && { fill }) }) });
  const norm = C(null), red = C(RED_SOFT), paid = C(null);
  const title = (ws, text, last) => { ws.merge(1, 1, 1, last); ws.set(1, 1, text, st.title); for (let c = 2; c <= last; c++) ws.set(1, c, null, st.title); ws.height(1, 24); };
  const head = (ws, r, labels) => { labels.forEach((l, i) => ws.set(r, i + 1, l, st.head)); ws.height(r, 32); };
  const summary = (ws, r, c1, c2, cv, label, value, vs) => {
    ws.merge(r, c1, r, c2); ws.set(r, c1, label, st.lbl); for (let c = c1 + 1; c <= c2; c++) ws.set(r, c, null, st.lbl); ws.set(r, cv, value, vs);
  };

  // kelompokkan per toko -> per resi
  const groups = new Map();
  rows.filter((r) => !storeFilter || String(r.store_id) === String(storeFilter)).forEach((r) => {
    const k = r.store_id ? 'id' + r.store_id : 'none';
    if (!groups.has(k)) groups.set(k, { name: r.store_name || 'TANPA TOKO', orders: new Map() });
    const g = groups.get(k).orders;
    if (!g.has(r.order_id)) g.set(r.order_id, []);
    g.get(r.order_id).push(r);
  });
  const totals = [];
  for (const g of groups.values()) {
    const t = { name: g.name, g, resi: 0, bad: 0, qty: 0, mac: 0, modal: 0, shp: 0, sel: 0, mar: 0, lunas: 0 };
    for (const items of g.orders.values()) {
      const o = items[0]; t.resi++; if (bad(o)) t.bad++; if (statusTxt(o) === 'LUNAS') t.lunas++;
      t.mar += Number(o.margin || 0);
      items.forEach((i, k) => { t.qty += Number(i.qty || 1); t.mac += Number(i.macallan || 0) * Number(i.qty || 1); if (!bad(o)) { t.modal += Number(i.harga_beli || 0) * Number(i.qty || 1); t.shp += Number(i.harga_jual || 0) * Number(i.qty || 1); if (k === 0) t.sel += Number(o.harga_selesai || 0); } });
    }
    totals.push(t);
  }

  // ---------- RINGKASAN ----------
  const sum = wb.sheet('RINGKASAN', { cols: [6, 24, 10, 14, 10, 16, 16, 18, 16, 12], freezeRow: 4 });
  title(sum, `REKAP HARIAN · ${dateLabel}`, 10);
  sum.merge(2, 1, 2, 10); sum.set(2, 1, `Diunduh ${printedAt} · harga selesai = dana cair Shopee (sebelum cair memakai estimasi). Modal & pendapatan tidak menghitung resi cancel / retur.`, st.sub);
  head(sum, 4, ['NO', 'TOKO', 'RESI', 'CANCEL / RETUR', 'QTY', 'MODAL (HARGA BELI)', 'HARGA SHOPEE', 'HARGA SELESAI (PENDAPATAN)', 'MARGIN', 'MARGIN %']);
  totals.forEach((t, i) => {
    const r = 5 + i;
    [i + 1, t.name, t.resi, t.bad, t.qty, t.modal, t.shp, t.sel, t.mar].forEach((v, j) => sum.set(r, j + 1, v, j === 1 ? norm.x : j >= 5 ? norm.r : norm.n));
    sum.set(r, 10, { f: `IFERROR(I${r}/H${r},0)`, v: t.sel ? t.mar / t.sel : 0 }, cs({ fmt: '0.0%', h: 'right' }));
  });
  const tr = 5 + totals.length, a = 5, b = Math.max(5, tr - 1);
  sum.set(tr, 1, null, st.totL); sum.set(tr, 2, 'TOTAL', st.totL);
  ['C', 'D', 'E'].forEach((col, j) => sum.set(tr, 3 + j, { f: `SUM(${col}${a}:${col}${b})`, v: totals.reduce((x, t) => x + [t.resi, t.bad, t.qty][j], 0) }, st.totN));
  ['F', 'G', 'H', 'I'].forEach((col, j) => sum.set(tr, 6 + j, { f: `SUM(${col}${a}:${col}${b})`, v: totals.reduce((x, t) => x + [t.modal, t.shp, t.sel, t.mar][j], 0) }, st.totR));
  const tSel = totals.reduce((x, t) => x + t.sel, 0), tMar = totals.reduce((x, t) => x + t.mar, 0);
  sum.set(tr, 10, { f: `IFERROR(I${tr}/H${tr},0)`, v: tSel ? tMar / tSel : 0 }, st.totP);
  if (!totals.length) { sum.merge(5, 1, 5, 10); sum.set(5, 1, 'Tidak ada pesanan di tanggal ini.', st.sub); }

  // ---------- per toko ----------
  const used = new Set(['RINGKASAN']);
  const HEAD = ['NO', 'NO RESI', 'KODE', 'KETERANGAN', 'QTT', 'SUMBER', 'MACALLAN', 'HARGA BELI', 'HARGA SHOPEE', 'HARGA SELESAI', 'MARGIN', 'STATUS'];
  for (const g of groups.values()) {
    const sh = wb.sheet(sheetName(g.name, used), { cols: [6, 22, 18, 40, 6, 14, 13, 14, 14, 15, 13, 12], freezeRow: HEAD_ROW });
    title(sh, `${String(g.name).toUpperCase()} · ${dateLabel}`, 12);
    head(sh, HEAD_ROW, HEAD);
    let r = HEAD_ROW + 1, n = 0;
    const t = totals.find((x) => x.g === g);
    for (const items of g.orders.values()) {
      n++; const o = items[0], S = bad(o) ? red : paid, stt = statusTxt(o);
      items.forEach((i, k) => {
        const q = Number(i.qty || 1);
        sh.set(r, 1, k === 0 ? n : null, S.n); sh.set(r, 2, k === 0 ? String(o.resi || o.order_no || '') : null, S.t); sh.set(r, 3, String(i.sku || ''), S.t);
        sh.set(r, 4, i.name || '', S.x); sh.set(r, 5, q, S.n);
        sh.set(r, 6, i.rack_qty ? `Rak ${i.rack || ''}${i.source === 'win' ? ' + WIN' : ''}`.trim() : i.source === 'win' ? 'WIN' : 'Gudang', S.n);
        [Number(i.macallan || 0) * q, Number(i.harga_beli || 0) * q, Number(i.harga_jual || 0) * q].forEach((v, j) => sh.set(r, 7 + j, v, S.r));
        sh.set(r, 10, k === 0 ? Number(o.harga_selesai || 0) : null, S.r); sh.set(r, 11, k === 0 ? Number(o.margin || 0) : null, S.r);
        sh.set(r, 12, stt, stt === 'LUNAS' ? cs({ h: 'center', fill: GREEN_SOFT }) : S.n);
        r++;
      });
    }
    const first = HEAD_ROW + 1, last = Math.max(first, r - 1);
    const R = (col) => `$${col}$${first}:$${col}$${last}`;
    const ok = (col) => `SUMIFS(${R(col)},${R('L')},"<>CANCEL",${R('L')},"<>RETUR")`;
    summary(sh, 2, 2, 3, 4, 'Jumlah resi', { f: `COUNTA(${R('B')})`, v: t.resi }, st.valN);
    summary(sh, 3, 2, 3, 4, 'Total barang (qty)', { f: `SUM(${R('E')})`, v: t.qty }, st.valN);
    summary(sh, 4, 2, 3, 4, 'Total Macallan', { f: `SUM(${R('G')})`, v: t.mac }, st.valRp);
    summary(sh, 5, 2, 3, 4, 'Resi cancel / retur', { f: `COUNTIFS(${R('L')},"CANCEL",${R('B')},"<>")+COUNTIFS(${R('L')},"RETUR",${R('B')},"<>")`, v: t.bad }, st.valN);
    summary(sh, 6, 2, 3, 4, 'Resi sudah cair', { f: `COUNTIFS(${R('L')},"LUNAS",${R('B')},"<>")`, v: t.lunas }, st.valN);
    summary(sh, 2, 6, 8, 9, 'Total modal (harga beli)', { f: ok('H'), v: t.modal }, st.valRp);
    summary(sh, 3, 6, 8, 9, 'Total harga Shopee', { f: ok('I'), v: t.shp }, st.valRp);
    summary(sh, 4, 6, 8, 9, 'Total harga selesai (pendapatan)', { f: ok('J'), v: t.sel }, st.valRp);
    summary(sh, 5, 6, 8, 9, 'Total margin', { f: `SUM(${R('K')})`, v: t.mar }, st.valRp);
    summary(sh, 6, 6, 8, 9, 'Margin dari pendapatan', { f: 'IFERROR(I5/I4,0)', v: t.sel ? t.mar / t.sel : 0 }, st.valPct);
    sh.merge(2, 10, 6, 12);
    sh.set(2, 10, 'Baris merah = resi cancel / retur (tidak dihitung di modal & pendapatan). Status LUNAS = dana Shopee sudah cair; BELUM CAIR memakai estimasi harga selesai.', wb.style({ italic: true, size: 9, color: MUTED, wrap: true, v: 'top' }));
    sh.autoFilter(HEAD_ROW, 1, last, 12);
  }
  return { wb, stores: groups.size, resi: totals.reduce((x, t) => x + t.resi, 0) };
}
