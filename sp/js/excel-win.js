// 2.35: Excel laporan barang WIN yang diterima — satu sheet per tanggal.
import { Book } from './xlsx-writer.js';

const NAVY = '26348B', SOFT = 'E8EBF7', MUTED = '6B6F6A', RP = '"Rp"#,##0';
const BULAN = ['JANUARI', 'FEBRUARI', 'MARET', 'APRIL', 'MEI', 'JUNI', 'JULI', 'AGUSTUS', 'SEPTEMBER', 'OKTOBER', 'NOVEMBER', 'DESEMBER'];
export const dateLabel = (d) => `${+d.slice(8, 10)} ${BULAN[+d.slice(5, 7) - 1]} ${d.slice(0, 4)}`;
const jkt = (ts) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date(ts));
const jam = (ts) => new Date(ts).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' });

// pos: [{ code, finished_at, po_items: [{ received_qty, unit_cost, products: { sku, name } }] }]
// dates: ['2026-11-09', '2026-11-10'] (urut), money: tampilkan harga beli
export function buildWinBook({ pos = [], dates = [], money = false, shop = '' }) {
  const wb = new Book();
  const st = {
    title: wb.style({ bold: true, size: 13, color: 'FFFFFF', fill: NAVY, v: 'center' }),
    sub: wb.style({ italic: true, color: MUTED }),
    head: wb.style({ bold: true, color: 'FFFFFF', fill: NAVY, border: true, h: 'center', v: 'center', wrap: true }),
    grp: wb.style({ bold: true, fill: SOFT, border: true }),
    cell: wb.style({ border: true }), code: wb.style({ border: true, fmt: '@' }),
    n: wb.style({ border: true, h: 'right', fmt: '#,##0' }), rp: wb.style({ border: true, h: 'right', fmt: RP }),
    totL: wb.style({ bold: true, fill: SOFT, border: true }), totN: wb.style({ bold: true, fill: SOFT, border: true, h: 'right', fmt: '#,##0' }), totRp: wb.style({ bold: true, fill: SOFT, border: true, h: 'right', fmt: RP }),
    empty: wb.style({ italic: true, color: MUTED })
  };
  const cols = money ? [16, 8, 22, 46, 9, 14, 16] : [16, 8, 22, 46, 9];
  for (const d of dates) {
    const day = pos.filter((p) => jkt(p.finished_at) === d).sort((a, b) => String(a.finished_at).localeCompare(String(b.finished_at)));
    const ws = wb.sheet(`${d.slice(8, 10)}-${d.slice(5, 7)}-${d.slice(0, 4)}`, { cols, freezeRow: 4 });
    const last = cols.length;
    ws.set(1, 1, `BARANG WIN DITERIMA · ${dateLabel(d)}`, st.title); for (let c = 2; c <= last; c++) ws.set(1, c, null, st.title); ws.merge(1, 1, 1, last); ws.height(1, 24);
    ws.set(2, 1, `${shop ? shop + ' · ' : ''}${day.length} kiriman · ${day.reduce((a, p) => a + p.po_items.reduce((x, i) => x + i.received_qty, 0), 0)} barang`, st.sub);
    const H = ['No. WIN', 'Jam', 'Kode barang', 'Nama barang', 'Jumlah', ...(money ? ['Harga beli', 'Subtotal'] : [])];
    H.forEach((h, i) => ws.set(4, i + 1, h, st.head)); ws.height(4, 20);
    let r = 5, tq = 0, tv = 0;
    if (!day.length) { ws.set(r, 1, 'Tidak ada barang WIN yang diterima di tanggal ini.', st.empty); continue; }
    for (const p of day) {
      const items = p.po_items.filter((i) => i.received_qty > 0).sort((a, b) => String(a.products?.name).localeCompare(String(b.products?.name)));
      const pq = items.reduce((a, i) => a + i.received_qty, 0);
      ws.set(r, 1, p.code, st.grp); ws.set(r, 2, jam(p.finished_at), st.grp); ws.set(r, 3, `${items.length} macam`, st.grp); ws.set(r, 4, p.direct ? 'Beli langsung di WIN' : 'Dari daftar beli', st.grp); ws.set(r, 5, pq, st.totN);
      if (money) { ws.set(r, 6, null, st.grp); ws.set(r, 7, items.reduce((a, i) => a + i.received_qty * Number(i.unit_cost || 0), 0), st.totRp); }
      r++;
      for (const i of items) {
        ws.set(r, 1, p.code, st.cell); ws.set(r, 2, jam(p.finished_at), st.cell); ws.set(r, 3, String(i.products?.sku || ''), st.code); ws.set(r, 4, i.products?.name || '', st.cell); ws.set(r, 5, i.received_qty, st.n);
        if (money) { ws.set(r, 6, Number(i.unit_cost || 0), st.rp); ws.set(r, 7, i.received_qty * Number(i.unit_cost || 0), st.rp); }
        tq += i.received_qty; tv += i.received_qty * Number(i.unit_cost || 0); r++;
      }
    }
    ws.set(r, 1, 'TOTAL', st.totL); for (let c = 2; c <= 4; c++) ws.set(r, c, null, st.totL); ws.set(r, 5, tq, st.totN);
    if (money) { ws.set(r, 6, null, st.totL); ws.set(r, 7, tv, st.totRp); }
    ws.autoFilter(4, 1, r - 1, last);
  }
  if (!dates.length) wb.sheet('KOSONG').set(1, 1, 'Tidak ada data', st.empty);
  return wb;
}

export async function downloadWinExcel(opts, filename) {
  const blob = await buildWinBook(opts).toBlob();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 30000);
}
