// 2.52 Laporan hasil upload file Pesanan Shopee (Pesanan Saya › Export).
// Setiap pesanan dicocokkan dengan resi yang di-scan admin di Catat pesanan, lalu dikelompokkan:
// resi terlewat, dikirim tanpa scan, batal tapi sudah di-scan, minta batal, belum ada resi, ada retur, cocok, dll.
import { supa } from './supa.js';
import { esc, num, rp, copyBtn, todayStr } from './ui.js';

const G = {
  belum_scan: ['Perlu dikirim, resi belum di-scan', 'red', 'Paket harus dikirim tapi resinya belum di-scan di Catat pesanan. Scan sebelum batas kirim supaya stok berkurang & tidak terlambat.'],
  kirim_tanpa_scan: ['Sudah dikirim, tidak tercatat di aplikasi', 'red', 'Shopee mencatat sudah dikirim / selesai, tapi resinya tidak pernah di-scan. Stok di aplikasi belum berkurang — cek barang apa yang keluar.'],
  batal_scan: ['Batal di Shopee, sudah di-scan', 'red', 'Jangan dikirim. Batalkan juga di Catat pesanan (Batalkan / Hapus resi) supaya barang kembali ke stok.'],
  minta_batal: ['Pembeli minta batal', 'yellow', 'Tanggapi di Shopee (Pengembalian/Pembatalan › tab Pembatalan). Tahan dulu pengirimannya.'],
  tanpa_resi: ['Perlu dikirim, belum ada no. resi', 'yellow', 'Atur pengiriman di Shopee dulu (pesanan Same Day / pick-up sering belum punya resi), lalu upload ulang file pesanan.'],
  retur: ['Ada pengajuan retur', 'yellow', 'Upload file Retur & gagal kirim, lalu scan paketnya di menu Retur & cancel saat kembali.'],
  cocok: ['Sudah di-scan (cocok)', 'green', 'Resi sudah di-scan di Catat pesanan.'],
  kilat: ['Pengiriman Kilat (gudang Shopee)', 'gray', 'Dikirim dari stok Pengiriman Kilat di gudang Shopee — tidak perlu di-scan di gudang sendiri.'],
  belum_bayar: ['Belum bayar', 'gray', 'Menunggu pembayaran pembeli. Belum perlu dikirim.'],
  batal: ['Batal', 'gray', 'Dibatalkan sebelum di-scan. Tidak perlu tindakan.']
};
const ACTIVE = /perlu dikirim|sedang dikirim|telah dikirim|selesai|siap/i;
const isKilat = (o) => /kilat|fulfil|gudang shopee|fbs/i.test(`${o.tipe} ${o.ship}`);

// lines: hasil parseOrderExport().lines -> pesanan (1 pesanan bisa beberapa baris produk)
export function groupOrders(lines) {
  const m = new Map();
  for (const l of lines) {
    let o = m.get(l.order_no);
    if (!o) {
      o = { order_no: l.order_no, resi: l.resi, status: l.status, cancel_status: l.cancel_status, total_bayar: l.total_bayar, items: [], returned: 0, ...(l._x || {}) };
      m.set(l.order_no, o);
    }
    if (!o.resi && l.resi) o.resi = l.resi;
    o.items.push({ name: l.product_name, var: l.variation, qty: l.qty });
    o.returned += Number(l._x?.returned || 0);
  }
  return [...m.values()];
}

export function classify(o, a) {
  const st = o.status || '';
  if (/belum bayar/i.test(st)) return 'belum_bayar';
  if (/pembatalan diajukan/i.test(st)) return 'minta_batal';
  if (/batal/i.test(st)) return a && a.status !== 'cancel' ? 'batal_scan' : 'batal';
  if (isKilat(o)) return 'kilat';
  if (o.returned > 0 || /pengembalian|retur/i.test(`${st} ${o.cancel_status || ''}`)) return 'retur';
  if (a) return 'cocok';
  if (/perlu dikirim/i.test(st)) return o.resi ? 'belum_scan' : 'tanpa_resi';
  if (ACTIVE.test(st)) return 'kirim_tanpa_scan';
  return 'batal';
}

async function appOrders(orders) {
  const resi = [...new Set(orders.map((o) => o.resi).filter(Boolean))], nos = [...new Set(orders.map((o) => o.order_no))];
  const byResi = new Map(), byNo = new Map();
  const chunk = (a, n) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));
  for (const c of chunk(resi, 150)) { const { data } = await supa.from('orders').select('id, resi, order_no, status').in('resi', c); (data || []).forEach((x) => byResi.set(x.resi, x)); }
  for (const c of chunk(nos, 150)) { const { data } = await supa.from('orders').select('id, resi, order_no, status').in('order_no', c); (data || []).forEach((x) => byNo.set(x.order_no, x)); }
  return (o) => (o.resi && byResi.get(o.resi)) || byNo.get(o.order_no) || null;
}

export async function renderOrderReport(box, lines) {
  box.innerHTML = '<div class="small muted">Mencocokkan dengan resi di Catat pesanan…</div>';
  const orders = groupOrders(lines);
  let find;
  try { find = await appOrders(orders); } catch (e) { box.innerHTML = `<div class="alert yellow small">Laporan tidak bisa dibuat: ${esc(e.message || e)}</div>`; return null; }
  const t = todayStr();
  orders.forEach((o) => { o.app = find(o); o.g = classify(o, o.app); o.cod = /cod|bayar di tempat/i.test(o.pay || ''); o.today = (o.deadline || '').slice(0, 10) === t; });
  const by = (k) => orders.filter((o) => o.g === k);
  const cod = orders.filter((o) => o.cod && !/batal|belum bayar/i.test(o.status || ''));
  const urgent = by('belum_scan').filter((o) => o.today);
  const row = (o) => `<div class="list-item rep-row" style="padding:8px 0;align-items:flex-start;flex-wrap:wrap">
      <div class="grow" style="min-width:0">
        <div class="small"><b class="mono">${esc(o.resi || '— belum ada resi —')}</b>${o.resi ? copyBtn(o.resi) : ''} <span class="xs muted">pesanan</span> <span class="mono xs">${esc(o.order_no)}</span>${copyBtn(o.order_no)}</div>
        <div class="xs muted">${o.items.map((i) => `×${i.qty} ${esc(i.name)}${i.var ? ` <i>(${esc(i.var)})</i>` : ''}`).join(' · ')}</div>
        ${o.reason ? `<div class="xs" style="color:var(--red)">Alasan: ${esc(o.reason)}</div>` : ''}</div>
      <div class="right xs" style="min-width:120px"><span class="tag">${esc(o.status || '-')}</span>${o.cod ? ' <span class="tag yellow">COD</span>' : ''}
        ${o.deadline ? `<div class="${o.today && o.g === 'belum_scan' ? 'neg' : 'muted'}">kirim sebelum ${esc(o.deadline.slice(5).replace('-', '/'))}</div>` : ''}
        ${o.app ? `<div class="muted">di aplikasi: ${esc(o.app.status)}</div>` : ''}${o.total_bayar ? `<div class="muted">${rp(o.total_bayar)}</div>` : ''}</div></div>`;
  box.innerHTML = `<div class="stack s8">
    <h3 class="sec-title" style="margin:0">Laporan pesanan</h3>
    <div class="grid gauto">
      <div class="stat ${by('belum_scan').length ? 'red' : 'green'}"><b>${num(by('belum_scan').length)}</b><span>resi belum di-scan${urgent.length ? ` · <b>${num(urgent.length)}</b> batas kirim hari ini` : ''}</span></div>
      <div class="stat ${by('kirim_tanpa_scan').length + by('batal_scan').length ? 'red' : 'gray'}"><b>${num(by('kirim_tanpa_scan').length + by('batal_scan').length)}</b><span>perlu dicek (dikirim tanpa scan / batal sudah di-scan)</span></div>
      <div class="stat green"><b>${num(by('cocok').length)}</b><span>sudah di-scan, cocok</span></div>
      <div class="stat ${cod.length ? 'yellow' : 'gray'}"><b>${num(cod.length)}</b><span>COD (${orders.length ? Math.round((cod.length / Math.max(1, orders.filter((o) => !/batal|belum bayar/i.test(o.status || '')).length)) * 100) : 0}%) · risiko gagal kirim</span></div></div>
    ${Object.keys(G).filter((k) => by(k).length).map((k) => `<details class="fk-grp" ${['red', 'yellow'].includes(G[k][1]) ? 'open' : ''}><summary><span class="tag ${G[k][1]}">${G[k][0]}</span> <b>${num(by(k).length)} pesanan</b></summary>
      <div class="xs muted" style="margin:6px 0">${G[k][2]}</div>
      <div class="list no-page">${by(k).sort((a, b) => String(a.deadline || 'z').localeCompare(String(b.deadline || 'z'))).map(row).join('')}</div></details>`).join('')}
  </div>`;
  return orders;
}
