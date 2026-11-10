// 2.38: membaca file Shopee Seller Center
//  - Laporan Penghasilan (Keuangan › Penghasilan Saya › Ekspor): sheet Summary, Adjustment, Penghasilan
//  - Pesanan Saya (Pesanan › Ekspor): satu baris per produk dalam pesanan
//  - Template Ubah Massal › Info Penjualan: diisi SKU dari peta kode barang
// Modul ini tidak memakai jaringan, jadi bisa diuji tanpa browser.

const clean = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
const key = (s) => clean(s).toLowerCase().replace(/[^a-z0-9]/g, '');
export const nameKey = (s) => clean(s).toLowerCase();

// angka dari Excel Shopee: 110.400 / -5200 / 33,800 / 1.234,5 / "Rp 12.000"
export function num(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  let s = String(v ?? '').replace(/rp|\s/gi, '');
  if (!s || s === '-') return 0;
  if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) s = s.replace(/,/g, '');
  else if (/^-?\d+,\d+$/.test(s)) s = s.replace(',', '.');
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}
const day = (v) => { const m = String(v ?? '').match(/(\d{4})-(\d{2})-(\d{2})/); return m ? `${m[1]}-${m[2]}-${m[3]}` : null; };

function headerIndex(rows, must, maxScan = 15) {
  for (let r = 0; r < Math.min(rows.length, maxScan); r++) {
    const H = (rows[r] || []).map(key);
    if (must.every((m) => H.includes(key(m)))) return r;
  }
  return -1;
}
const colMap = (row) => { const m = {}; (row || []).forEach((h, i) => { const k = key(h); if (k && !(k in m)) m[k] = i; }); return m; };

// ---------- Laporan Penghasilan ----------
export function isIncomeBook(sheets) {
  const rows = sheets.Penghasilan || Object.values(sheets).find((r) => headerIndex(r, ['No. Pesanan', 'Total Penghasilan', 'Lihat berdasarkan']) >= 0);
  return !!rows && headerIndex(rows, ['No. Pesanan', 'Total Penghasilan']) >= 0;
}

const ONGKIR = ['Ongkir Dibayar Pembeli', 'Ongkos Kirim yang Dibayarkan ke Jasa Kirim', 'Potongan Ongkos Kirim dari Jasa Kirim', 'Gratis Ongkir dari Shopee',
  'Ongkos Kirim Pengembalian Barang', 'Return to Seller Fee', 'Pengembalian Biaya Kirim'];
const VOUCHER = ['Voucher disponsor oleh Penjual', 'Cashback Koin disponsori Penjual', 'Voucher co-fund disponsor oleh Penjual', 'Cashback Koin Co-fund disponsori Penjual'];
const PAJAK = ['PPh 22'];
// nama pendek untuk rincian potongan
export const FEE_LABEL = {
  'Voucher disponsor oleh Penjual': 'Voucher penjual', 'Cashback Koin disponsori Penjual': 'Cashback koin penjual', 'Voucher co-fund disponsor oleh Penjual': 'Voucher co-fund',
  'Cashback Koin Co-fund disponsori Penjual': 'Cashback co-fund', 'Diskon Produk dari Shopee': 'Diskon dari Shopee',
  'Biaya Administrasi': 'Biaya administrasi', 'Biaya Proses Pesanan': 'Biaya proses pesanan', 'Biaya Gratis Ongkir XTRA': 'Gratis Ongkir XTRA',
  'Biaya Transaksi': 'Biaya transaksi', 'Biaya Layanan Promo XTRA+': 'Layanan Promo XTRA+', 'Biaya Kampanye': 'Biaya kampanye', 'Biaya Komisi AMS': 'Komisi AMS (affiliate)',
  'Biaya Isi Saldo Otomatis (dari Penghasilan)': 'Isi saldo iklan otomatis', 'Premi': 'Premi (asuransi)', 'FBS Fee': 'FBS fee', 'PPh 22': 'PPh 22',
  'Jumlah Pengembalian Dana ke Pembeli': 'Pengembalian dana ke pembeli', 'Ongkir': 'Selisih ongkir'
};

export function parseIncome(sheets) {
  const rows = sheets.Penghasilan || Object.values(sheets).find((r) => headerIndex(r, ['No. Pesanan', 'Total Penghasilan']) >= 0) || [];
  const hr = headerIndex(rows, ['No. Pesanan', 'Total Penghasilan']);
  const H = rows[hr] || [];
  const C = colMap(H);
  const g = (r, name) => r[C[key(name)]];
  const n = (r, name) => (C[key(name)] === undefined ? 0 : num(g(r, name)));
  const by = C[key('Lihat berdasarkan')];
  const feeCols = H.map((h, i) => [clean(h), i]).filter(([h]) => /^Biaya /i.test(h) || h === 'Premi' || h === 'FBS Fee');
  const orders = new Map();
  let last = null;
  for (const r of rows.slice(hr + 1)) {
    const no = clean(g(r, 'No. Pesanan'));
    if (!no) continue;
    const kind = by === undefined ? 'Order' : clean(r[by]);
    if (kind.toLowerCase() === 'sku') {
      const o = orders.get(no) || last;
      if (o && o.order_no === no) o.items.push({ pid: clean(g(r, 'ID Produk')), name: clean(g(r, 'Nama Produk')), harga: n(r, 'Harga Produk'), total: n(r, 'Total Penghasilan') });
      continue;
    }
    if (by !== undefined && kind.toLowerCase() !== 'order') continue;
    const rincian = {};
    const add = (label, v) => { if (v) rincian[label] = (rincian[label] || 0) + v; };
    let biaya = 0;
    for (const [h, i] of feeCols) {
      const v = num(r[i]); biaya += v;
      add(/^Biaya Gratis Ongkir XTRA/i.test(h) ? 'Gratis Ongkir XTRA' : FEE_LABEL[h] || h, v);
    }
    VOUCHER.forEach((h) => add(FEE_LABEL[h], n(r, h)));
    add('Diskon dari Shopee', n(r, 'Diskon Produk dari Shopee'));
    add('PPh 22', n(r, 'PPh 22'));
    add('Pengembalian dana ke pembeli', n(r, 'Jumlah Pengembalian Dana ke Pembeli'));
    const ongkir = ONGKIR.reduce((a, h) => a + n(r, h), 0);
    add('Selisih ongkir', ongkir);
    const o = {
      order_no: no, created_on: day(g(r, 'Waktu Pesanan Dibuat')), released_on: day(g(r, 'Tanggal Dana Dilepaskan')),
      tipe: clean(g(r, 'Tipe Pesanan')) || null, metode: clean(g(r, 'Metode pembayaran pembeli')) || null,
      harga_produk: n(r, 'Harga Produk'), refund: n(r, 'Jumlah Pengembalian Dana ke Pembeli'), ongkir,
      voucher: VOUCHER.reduce((a, h) => a + n(r, h), 0), diskon_shopee: n(r, 'Diskon Produk dari Shopee'), biaya_shopee: biaya,
      pajak: PAJAK.reduce((a, h) => a + n(r, h), 0), total: n(r, 'Total Penghasilan'), rincian, items: []
    };
    if (orders.has(no)) {   // baris pesanan dobel (jarang): jumlahkan
      const p = orders.get(no);
      ['harga_produk', 'refund', 'ongkir', 'voucher', 'diskon_shopee', 'biaya_shopee', 'pajak', 'total'].forEach((k) => { p[k] += o[k]; });
      Object.entries(rincian).forEach(([k, v]) => { p.rincian[k] = (p.rincian[k] || 0) + v; });
    } else orders.set(no, o);
    last = orders.get(no);
  }
  // ringkasan & username (sheet Summary)
  const sum = {}; let username = null, from = null, to = null;
  for (const r of sheets.Summary || []) {
    const a = clean(r[0]), b = clean(r[1]);
    if (/^username/i.test(a)) username = b || null;
    if (a === 'Dari') from = day(r[1]);
    if (a === 'ke') to = day(r[1]);
    const label = a || b, val = [...r].reverse().find((c) => c !== null && c !== '' && !isNaN(num(c)) && /\d/.test(String(c)));
    if (/^\d\.\s/.test(a) && val !== undefined) sum[a.replace(/^\d\.\s*/, '')] = num(val);
    void label;
  }
  // penyesuaian (kompensasi jasa kirim, dll.)
  const adjustments = [];
  const ar = sheets.Adjustment || [];
  const ah = headerIndex(ar, ['No. Pesanan Terhubung', 'Biaya Penyesuaian'], 40);
  if (ah >= 0) {
    const A = colMap(ar[ah]);
    for (const r of ar.slice(ah + 1)) {
      const amt = num(r[A[key('Biaya Penyesuaian')]]);
      const first = clean(r[0]);
      if (/^total/i.test(first) || !amt) continue;
      adjustments.push({ order_no: clean(r[A[key('No. Pesanan Terhubung')]]) || null, adj_date: day(r[A[key('Tanggal Penyesuaian Dibuat')]]),
        kind: clean(r[A[key('Tipe Penyesuaian | Deskripsi')]]) || 'Penyesuaian', amount: amt, released_on: day(r[A[key('Tanggal Dana Dilepaskan')]]) });
    }
  }
  const list = [...orders.values()];
  return { username, from, to, summary: sum, rows: list, adjustments,
    total: list.reduce((a, o) => a + o.total, 0), kompensasi: adjustments.reduce((a, x) => a + x.amount, 0) };
}

// ---------- Pesanan Saya ----------
const OE = { order_no: 'No. Pesanan', resi: 'No. Resi', status: 'Status Pesanan', cancel_status: 'Status Pembatalan/ Pengembalian', product_name: 'Nama Produk',
  variation: 'Nama Variasi', qty: 'Jumlah', price: 'Harga Setelah Diskon', subtotal: 'Subtotal Pesanan', voucher_penjual: 'Voucher Ditanggung Penjual',
  total_bayar: 'Total Pembayaran', ongkir_est: 'Perkiraan Ongkos Kirim', buyer: 'Username (Pembeli)', created: 'Waktu Pesanan Dibuat', finished: 'Waktu Pesanan Selesai',
  sku_induk: 'SKU Induk', sku_ref: 'Nomor Referensi SKU' };
export function isOrderExport(rows) { return headerIndex(rows, ['No. Pesanan', 'Nama Produk', 'Jumlah']) >= 0 && headerIndex(rows, ['No. Resi']) >= 0; }
export function parseOrderExport(rows) {
  const hr = headerIndex(rows, ['No. Pesanan', 'Nama Produk', 'Jumlah']);
  const C = colMap(rows[hr]);
  const g = (r, f) => (C[key(OE[f])] === undefined ? '' : r[C[key(OE[f])]]);
  const lines = [], seen = new Map();
  rows.slice(hr + 1).forEach((r, i) => {
    const no = clean(g(r, 'order_no')); if (!no) return;
    const ln = (seen.get(no) || 0) + 1; seen.set(no, ln);
    lines.push({ order_no: no, line_no: ln, resi: clean(g(r, 'resi')) || null, status: clean(g(r, 'status')), cancel_status: clean(g(r, 'cancel_status')) || null,
      product_name: clean(g(r, 'product_name')), variation: clean(g(r, 'variation')), qty: Math.max(1, Math.round(num(g(r, 'qty'))) || 1),
      price: num(g(r, 'price')), subtotal: num(g(r, 'subtotal')), voucher_penjual: num(g(r, 'voucher_penjual')), total_bayar: num(g(r, 'total_bayar')),
      ongkir_est: num(g(r, 'ongkir_est')), buyer: clean(g(r, 'buyer')) || null, created: clean(g(r, 'created')) || null, finished: clean(g(r, 'finished')) || null,
      _row: hr + 1 + i });
  });
  return { headerRow: hr, cols: C, lines, orders: seen.size };
}
// isi kolom SKU di file pesanan: lookup(name, variation) -> kode barang
export function fillOrderExport(rows, lookup) {
  const hr = headerIndex(rows, ['No. Pesanan', 'Nama Produk', 'Jumlah']);
  const C = colMap(rows[hr]);
  const ci = (f) => C[key(OE[f])];
  let filled = 0, missing = 0;
  const out = rows.map((r) => [...r]);
  for (let i = hr + 1; i < out.length; i++) {
    const r = out[i]; if (!clean(r[ci('order_no')])) continue;
    const sku = lookup(clean(r[ci('product_name')]), clean(r[ci('variation')]));
    if (!sku) { missing++; continue; }
    if (ci('sku_ref') !== undefined) r[ci('sku_ref')] = sku;
    if (ci('sku_induk') !== undefined && !clean(r[ci('variation')])) r[ci('sku_induk')] = sku;
    filled++;
  }
  return { rows: out, filled, missing };
}

// ---------- template Ubah Massal (Info Penjualan) ----------
const TP = {
  name: ['et_title_product_name', 'Nama Produk', 'Product Name'],
  variation: ['et_title_variation_name', 'Nama Variasi', 'Variation Name'],
  parent: ['et_title_parent_sku', 'SKU Induk', 'Parent SKU'],
  sku: ['et_title_variation_sku', 'SKU', 'Variation SKU', 'SKU Variasi', 'Kode Variasi SKU'],
  pid: ['et_title_product_id', 'Kode Produk', 'Product ID', 'ID Produk']
};
export function findTemplateCols(rows) {
  for (let r = 0; r < Math.min(rows.length, 12); r++) {
    const H = (rows[r] || []).map((h) => clean(h).toLowerCase());
    const find = (alts) => { for (const a of alts) { const i = H.indexOf(a.toLowerCase()); if (i >= 0) return i; } return -1; };
    const c = { name: find(TP.name), variation: find(TP.variation), parent: find(TP.parent), sku: find(TP.sku), pid: find(TP.pid) };
    if (c.name >= 0 && (c.sku >= 0 || c.parent >= 0)) return { headerRow: r, ...c };
  }
  return null;
}
export function fillTemplate(rows, lookup) {
  const c = findTemplateCols(rows);
  if (!c) throw new Error('Kolom Nama Produk / SKU tidak ditemukan. Pakai template Ubah Massal › Info Penjualan dari Shopee.');
  const out = rows.map((r) => [...r]);
  let filled = 0, missing = 0; const miss = [];
  for (let i = c.headerRow + 1; i < out.length; i++) {
    const r = out[i]; const name = clean(r[c.name]);
    if (!name) continue;
    if (c.pid >= 0 && !/\d{5,}/.test(String(r[c.pid] ?? ''))) continue;   // baris keterangan / judul kedua
    const variation = c.variation >= 0 ? clean(r[c.variation]) : '';
    const sku = lookup(name, variation);
    if (!sku) { missing++; if (miss.length < 50) miss.push(variation ? `${name} — ${variation}` : name); continue; }
    if (variation && c.sku >= 0) r[c.sku] = sku;
    else if (c.parent >= 0) r[c.parent] = sku;
    else if (c.sku >= 0) r[c.sku] = sku;
    filled++;
  }
  return { rows: out, filled, missing, miss, cols: c };
}
