// 2.38: upload file Shopee yang dikenali khusus:
//  - Laporan Penghasilan  -> import_shopee_income (dana cair, potongan, kompensasi)
//  - Pesanan Saya (alur kepala gudang) -> shopee_orders_sync (no. pesanan ↔ resi, status, peta SKU)
// Upload ulang file yang mirip: server hanya menyimpan baris yang baru / berubah.
import { supa, rpc } from './supa.js';
import { store } from './store.js';
import { esc, rp, num, toast, toastErr, icon, xlsx } from './ui.js';
import { isIncomeBook, parseIncome, isOrderExport, parseOrderExport, FEE_LABEL } from './shopee-data.js';

const CHUNK = 150;
let stores = null;
async function storeList() {
  if (!stores) stores = ((await supa.from('stores').select('id, name, marketplace, shopee_username').eq('active', true).order('sort').order('name')).data || []).filter((s) => s.marketplace !== 'Offline');
  return stores;
}
const guessStore = (list, filename, username) =>
  list.find((s) => username && s.shopee_username && s.shopee_username.toLowerCase() === username.toLowerCase())
  || [...list].sort((a, b) => b.name.length - a.name.length).find((s) => new RegExp(`(^|[^A-Z])${s.name.toUpperCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '[ _-]*')}([^A-Z]|$)`).test(filename.toUpperCase()));

// semua sheet -> { sheets: {nama: rows}, wb, X }
export async function readBook(file) {
  const X = await xlsx();
  const wb = X.read(await file.arrayBuffer(), { type: 'array', cellDates: false });
  const sheets = {};
  for (const n of wb.SheetNames) sheets[n] = X.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true, defval: '' });
  return { sheets, wb, X };
}
export function kindOf(sheets) {
  if (isIncomeBook(sheets)) return 'income';
  const name = Object.keys(sheets).find((n) => isOrderExport(sheets[n]));
  return name ? 'orders:' + name : null;
}

const storePicker = (list, cur) => `<div class="field"><span>File ini milik toko</span><div class="chips">${list.map((s) => `<button type="button" class="chip ${s.id === cur ? 'on' : ''}" data-st="${s.id}">${esc(s.name)}</button>`).join('')}</div></div>`;

// potong per ~CHUNK baris; baris dengan kunci sama (1 pesanan) tidak dipisah ke kiriman berbeda
function chunks(list, keyOf) {
  const out = []; let cur = [];
  for (let i = 0; i < list.length; i++) {
    cur.push(list[i]);
    const next = list[i + 1];
    if (cur.length >= CHUNK && (!keyOf || !next || keyOf(next) !== keyOf(list[i]))) { out.push(cur); cur = []; }
  }
  if (cur.length || !out.length) out.push(cur);
  return out;
}
async function sendChunks(fn, base, key, list, prog, extraFirst = {}, keyOf = null) {
  let upload_id = null; const agg = {}; let done = 0;
  const parts = chunks(list, keyOf);
  for (let c = 0; c < parts.length; c++) {
    const i = c;
    prog.innerHTML = `<div class="small muted">Menyimpan ${done + parts[c].length} / ${list.length}…</div><div class="progress"><div style="width:${Math.round((done / Math.max(list.length, 1)) * 100)}%"></div></div>`;
    const r = await rpc(fn, { p: { ...base, ...(i === 0 ? extraFirst : {}), upload_id, final: c === parts.length - 1, [key]: parts[c] } });
    done += parts[c].length;
    upload_id = r.upload_id;
    for (const [k, v] of Object.entries(r)) if (typeof v === 'number' && k !== 'upload_id' && k !== 'store_id') agg[k] = (agg[k] || 0) + v;
  }
  prog.innerHTML = '';
  return agg;
}

// tampilkan pemeriksaan + simpan. opts: { forceStore, onSaved(result, ctx) }
export async function shopeeUpload(file, box, book, kind, opts = {}) {
  const list = await storeList();
  if (kind === 'income') {
    const d = parseIncome(book.sheets);
    let st = opts.forceStore || guessStore(list, file.name, d.username)?.id || null;
    const fees = {}; d.rows.forEach((o) => Object.entries(o.rincian).forEach(([k, v]) => { fees[k] = (fees[k] || 0) + v; }));
    const harga = d.rows.reduce((a, o) => a + o.harga_produk, 0);
    const paint = () => {
      box.innerHTML = `<div class="card stack">
        <div class="row between wrap"><h2 class="sec-title" style="margin:0">Laporan Penghasilan Shopee</h2><span class="mono xs muted">${esc(file.name)}</span></div>
        <div class="small muted">Akun <b>${esc(d.username || '-')}</b> · dana dilepas ${esc(d.from || '?')}${d.to && d.to !== d.from ? ' s/d ' + esc(d.to) : ''}</div>
        ${opts.forceStore ? '' : storePicker(list, st)}
        <div class="grid gauto">
          <div class="stat gray"><b>${num(d.rows.length)}</b><span>pesanan</span></div>
          <div class="stat gray"><b>${rp(harga)}</b><span>harga produk</span></div>
          <div class="stat green"><b>${rp(d.total + d.kompensasi)}</b><span>dana cair${d.kompensasi ? ' (termasuk kompensasi ' + rp(d.kompensasi) + ')' : ''}</span></div>
          <div class="stat red"><b>${harga ? Math.round(((harga - d.total) / harga) * 100) : 0}%</b><span>dipotong Shopee</span></div></div>
        ${d.summary['Total yang Dilepas'] !== undefined && Math.abs(d.summary['Total yang Dilepas'] - d.total) > 1 ? `<div class="alert yellow small">Total di file (${rp(d.summary['Total yang Dilepas'])}) berbeda dengan jumlah per pesanan (${rp(d.total)}). Cek file-nya.</div>` : ''}
        <details><summary class="small" style="cursor:pointer"><b>Rincian potongan</b></summary><div class="list no-page" style="margin-top:6px">${Object.entries(fees).sort((a, b) => a[1] - b[1]).map(([k, v]) => `<div class="list-item" style="padding:6px 0"><span class="grow small">${esc(k)}</span><b class="${v < 0 ? 'neg' : ''}">${rp(v)}</b></div>`).join('')}</div></details>
        <div class="small muted">Pesanan yang resinya sudah di-scan admin langsung terisi <b>harga selesai</b> & lunas. Yang belum, otomatis tersambung nanti setelah file Pesanan Saya diupload / resinya di-scan. Upload ulang file yang sama tidak membuat data dobel.</div>
        <div id="prog"></div>
        <div class="row wrap" style="justify-content:flex-end"><button class="btn" data-cancel>Batal</button><button class="btn btn-primary btn-lg" data-save>Simpan ${num(d.rows.length)} pesanan</button></div></div>`;
      box.querySelectorAll('[data-st]').forEach((b) => b.addEventListener('click', () => { st = +b.dataset.st; paint(); }));
      box.querySelector('[data-cancel]').onclick = () => { box.innerHTML = ''; };
      box.querySelector('[data-save]').onclick = async (ev) => {
        ev.target.disabled = true;
        try {
          const base = { filename: file.name, username: d.username, store_id: st };
          const a = await sendChunks('import_shopee_income', base, 'rows', d.rows, box.querySelector('#prog'), { adjustments: d.adjustments });
          stores = null;
          box.innerHTML = `<div class="card stack" style="border:2px solid var(--green)"><div class="row">${icon('check', 24)}<h2 class="sec-title" style="margin:0">Laporan penghasilan tersimpan</h2></div>
            <div class="grid gauto"><div class="stat green"><b>${num(a.baru || 0)}</b><span>pesanan baru</span></div><div class="stat ${a.berubah ? 'yellow' : 'gray'}"><b>${num(a.berubah || 0)}</b><span>diperbarui</span></div>
              <div class="stat gray"><b>${num(a.sama || 0)}</b><span>sama, dilewati</span></div><div class="stat gray"><b>${num(a.cocok_pesanan || 0)}</b><span>cocok dengan resi di aplikasi</span></div></div>
            <div class="row wrap"><a class="btn btn-primary" href="#/penghasilan">Lihat penghasilan & profit</a></div></div>`;
          toast('Penghasilan tersimpan', 'ok');
          opts.onSaved && opts.onSaved(a, { kind });
        } catch (e) { toastErr(e); ev.target.disabled = false; }
      };
    };
    paint();
    return;
  }
  // ---------- Pesanan Saya ----------
  const sheet = kind.split(':')[1];
  const d = parseOrderExport(book.sheets[sheet]);
  let st = opts.forceStore || guessStore(list, file.name, null)?.id || null;
  const statuses = {}; d.lines.forEach((l) => { statuses[l.status || '-'] = (statuses[l.status || '-'] || 0) + 1; });
  const noResi = new Set(d.lines.filter((l) => !l.resi).map((l) => l.order_no)).size;
  const paint = () => {
    box.innerHTML = `<div class="card stack">
      <div class="row between wrap"><h2 class="sec-title" style="margin:0">File Pesanan Shopee</h2><span class="mono xs muted">${esc(file.name)}</span></div>
      ${opts.forceStore ? '' : storePicker(list, st)}
      ${st ? '' : '<div class="alert yellow small">Pilih tokonya dulu supaya peta SKU tersimpan per toko.</div>'}
      <div class="grid gauto"><div class="stat gray"><b>${num(d.orders)}</b><span>pesanan · ${num(d.lines.length)} baris produk</span></div>
        ${Object.entries(statuses).map(([k, v]) => `<div class="stat ${/batal/i.test(k) ? 'red' : 'gray'}"><b>${num(v)}</b><span>${esc(k)}</span></div>`).join('')}
        ${noResi ? `<div class="stat yellow"><b>${num(noResi)}</b><span>belum ada no. resi</span></div>` : ''}</div>
      <div class="small muted">Tidak membuat pesanan baru. Yang dilakukan: no. pesanan Shopee disambungkan ke resi yang di-scan admin, status Shopee diperbarui (pesanan batal dilaporkan), dan nama produk Shopee dipetakan ke kode barang untuk <b>Update SKU</b>. Upload ulang hanya memperbarui baris yang berubah.</div>
      <div id="prog"></div>
      <div class="row wrap" style="justify-content:flex-end"><button class="btn" data-cancel>Batal</button><button class="btn btn-primary btn-lg" data-save ${st ? '' : 'disabled'}>Simpan ${num(d.lines.length)} baris</button></div></div>`;
    box.querySelectorAll('[data-st]').forEach((b) => b.addEventListener('click', () => { st = +b.dataset.st; paint(); }));
    box.querySelector('[data-cancel]').onclick = () => { box.innerHTML = ''; };
    box.querySelector('[data-save]').onclick = async (ev) => {
      ev.target.disabled = true;
      try {
        // satu pesanan jangan terpotong di dua kiriman
        const lines = d.lines.map(({ _row, ...x }) => x);
        const lines2 = [...lines].sort((x, y) => (x.order_no < y.order_no ? -1 : x.order_no > y.order_no ? 1 : x.line_no - y.line_no));
        const a = await sendChunks('shopee_orders_sync', { filename: file.name, store_id: st }, 'rows', lines2, box.querySelector('#prog'), {}, (x) => x.order_no);
        box.innerHTML = `<div class="card stack" style="border:2px solid var(--green)"><div class="row">${icon('check', 24)}<h2 class="sec-title" style="margin:0">File pesanan tersimpan</h2></div>
          <div class="grid gauto"><div class="stat green"><b>${num(a.baru || 0)}</b><span>baris baru</span></div><div class="stat ${a.berubah ? 'yellow' : 'gray'}"><b>${num(a.berubah || 0)}</b><span>berubah (status dll.)</span></div>
            <div class="stat gray"><b>${num(a.sama || 0)}</b><span>sama, dilewati</span></div><div class="stat gray"><b>${num(a.cocok_resi || 0)}</b><span>cocok dengan resi di aplikasi</span></div>
            <div class="stat green"><b>${num(a.sku_terpetakan || 0)}</b><span>SKU otomatis terpetakan</span></div>${a.batal ? `<div class="stat red"><b>${num(a.batal)}</b><span>batal di Shopee, jangan dikirim</span></div>` : ''}</div>
          <div class="row wrap"><a class="btn btn-primary" href="#/sku">Buka Update SKU</a></div></div>`;
        toast('File pesanan tersimpan', 'ok');
        opts.onSaved && opts.onSaved(a, { kind, store_id: st, book, sheet, file });
      } catch (e) { toastErr(e); ev.target.disabled = false; }
    };
  };
  paint();
}
export { FEE_LABEL };
