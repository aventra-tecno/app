import { supa, rpc } from '../supa.js';
import { store } from '../store.js';
import { esc, num, chips, on, toast, toastErr, pageHead, emptyState, skeleton, icon, copyBtn } from '../ui.js';
import { fillOrderExport, fillTemplate, nameKey } from '../shopee-data.js';
import { pickProduct } from '../daftar-file.js';

// 2.38 Update SKU Shopee (admin):
// 1) upload file Pesanan Saya -> nama produk Shopee dicocokkan dengan kode barang lewat resi yang di-scan admin
// 2) pilih manual yang belum pasti
// 3) unduh file pesanan berisi SKU, atau isi template Ubah Massal › Info Penjualan untuk diupload ke Shopee
let last = null;   // file pesanan terakhir yang diupload di halaman ini: { book, sheet, file, store_id }

const HOW = { peta: ['dari peta', ''], resi: ['cocok lewat resi', 'green'], jumlah: ['cocok lewat jumlah', 'green'], manual: ['dipilih manual', 'blue'] };

export default {
  tour: [
    { sel: '#s1', title: '1. Upload file pesanan', body: 'Ekspor Pesanan Saya dari Shopee. Produk dicocokkan dengan kode barang yang di-scan admin di Catat pesanan (lewat no. resi).' },
    { sel: '#s2', title: '2. Cek & pilih', body: 'Produk yang belum pasti dipilih kode barangnya. Pilihan disimpan dan dipakai untuk pesanan berikutnya.' },
    { sel: '#s3', title: '3. Update massal di Shopee', body: 'Isi template Ubah Massal › Info Penjualan, lalu upload template itu di Shopee.' }
  ],
  async render(el) {
    const { data: stores } = await supa.from('stores').select('id, name, marketplace').eq('active', true).order('sort').order('name');
    const list = (stores || []).filter((s) => s.marketplace !== 'Offline');
    let st = last?.store_id || list[0]?.id || null, filter = 'pilih', items = [];
    el.innerHTML = `${pageHead('Update SKU Shopee')}
      <div class="stack">
        ${chips('st', list.map((s) => [String(s.id), s.name]), String(st))}
        <div id="sum"></div>
        <section class="card stack" id="s1"><h2 class="sec-title" style="margin:0">1. Upload file Pesanan Shopee</h2>
          <div class="small muted">Shopee › Pesanan Saya › Ekspor. Upload ulang file yang mirip aman: hanya baris yang berubah yang diperbarui.</div>
          <label class="btn le-up">${icon('upload', 18)} Pilih file pesanan (.xlsx)<input type="file" accept=".xlsx,.xls" hidden id="fo"></label>
          <div id="up"></div></section>
        <section class="card flush" id="s2"><div class="card-h"><h2>2. Cocokkan produk</h2></div><div style="padding:0 16px 8px" id="fl"></div><div id="rows">${skeleton(3)}</div></section>
        <section class="card stack" id="s3"><h2 class="sec-title" style="margin:0">3. Update SKU massal di Shopee</h2>
          <ol class="small steps-ol"><li>Di Shopee: <b>Produk Saya › Ubah Massal › Info Penjualan</b> → unduh template untuk toko ini.</li>
            <li>Upload template itu di sini. Kolom <b>SKU</b> / <b>SKU Induk</b> terisi kode barang.</li>
            <li>Upload file hasilnya kembali di Shopee (Ubah Massal › Upload).</li></ol>
          <label class="btn btn-primary">${icon('upload', 18)} Isi template Ubah Massal<input type="file" accept=".xlsx,.xls" hidden id="ft"></label>
          <button class="btn" id="dlorder" ${last ? '' : 'disabled'}>${icon('download', 18)} Unduh file pesanan + SKU</button>
          <div id="tres"></div></section>
      </div>`;

    const lookupFor = async () => {
      // peta toko ini dulu, lalu toko lain (nama produk sama)
      const { data } = await supa.from('shopee_sku_map').select('store_id, product_name, variation, products(sku)').limit(20000);
      const own = new Map(), any = new Map();
      (data || []).forEach((m) => { const k = nameKey(m.product_name) + '|' + nameKey(m.variation); if (!m.products?.sku) return; if (m.store_id === st) own.set(k, m.products.sku); else if (!any.has(k)) any.set(k, m.products.sku); });
      return (n, v) => { const k = nameKey(n) + '|' + nameKey(v); return own.get(k) || any.get(k) || own.get(nameKey(n) + '|') || null; };
    };
    const download = async (book, sheet, rows, out, name) => {
      const ws = book.wb.Sheets[sheet], X = book.X;
      let changed = 0;
      out.forEach((r, i) => r.forEach((v, j) => {
        if (v !== rows[i]?.[j]) { ws[X.utils.encode_cell({ r: i, c: j })] = { t: 's', v: String(v) }; changed++; }
      }));
      const rg = X.utils.decode_range(ws['!ref'] || 'A1');
      out.forEach((r, i) => { rg.e.r = Math.max(rg.e.r, i); rg.e.c = Math.max(rg.e.c, r.length - 1); });
      ws['!ref'] = X.utils.encode_range(rg);
      X.writeFile(book.wb, name);
      return changed;
    };

    const paintSum = async () => {
      const s = await rpc('sku_summary', { p_store: st }).catch(() => null);
      el.querySelector('#sum').innerHTML = s ? `<div class="grid gauto">
        <div class="stat gray"><b>${num(s.produk)}</b><span>produk Shopee (nama + variasi)</span></div>
        <div class="stat green"><b>${num(s.terpetakan)}</b><span>sudah punya kode barang</span></div>
        <div class="stat ${s.belum - s.belum_scan ? 'yellow' : 'gray'}"><b>${num(s.belum - s.belum_scan)}</b><span>perlu dipilih</span></div>
        <div class="stat gray"><b>${num(s.belum_scan)}</b><span>resinya belum di-scan admin</span></div></div>` : `<div class="alert yellow">Menu ini butuh update database. Jalankan <b>supabase/update-2.38.sql</b>.</div>`;
    };
    const paintRows = () => {
      const c = { pilih: items.filter((x) => !x.product_id && x.linked).length, scan: items.filter((x) => !x.product_id && !x.linked).length, ok: items.filter((x) => x.product_id).length };
      el.querySelector('#fl').innerHTML = chips('f', [['pilih', `Perlu dipilih (${c.pilih})`], ['scan', `Belum di-scan (${c.scan})`], ['ok', `Sudah (${c.ok})`]], filter);
      const vis = items.filter((x) => (filter === 'ok' ? x.product_id : filter === 'pilih' ? !x.product_id && x.linked : !x.product_id && !x.linked)).slice(0, 300);
      el.querySelector('#rows').innerHTML = vis.length ? `<div class="list no-page">${vis.map((x) => `<div class="list-item sku-row" style="padding:10px 16px;align-items:flex-start;flex-wrap:wrap">
          <div class="grow" style="min-width:0"><b class="small">${esc(x.name)}</b>${x.var ? `<div class="xs muted">Variasi: ${esc(x.var)}</div>` : ''}<div class="xs muted">${num(x.qty)} pcs · ${num(x.pesanan)} pesanan</div>
            ${x.product_id ? `<div class="small" style="margin-top:4px"><b class="mono">${esc(x.sku)}</b>${copyBtn(x.sku)} ${esc(x.pname || '')} <span class="tag ${HOW[x.how]?.[1] || ''}">${HOW[x.how]?.[0] || ''}</span></div>`
              : x.calon?.length ? `<div class="chips" style="margin-top:6px">${x.calon.map((p) => `<button class="chip" data-pick="${x.line_id}:${p.id}" title="${esc(p.name)}"><span class="mono">${esc(p.sku)}</span> ${esc(String(p.name).slice(0, 28))}</button>`).join('')}</div>` : ''}</div>
          <div class="row" style="gap:6px">${x.product_id ? `<button class="btn btn-sm" data-find="${x.line_id}">Ganti</button><button class="btn btn-ghost btn-sm" data-clear="${x.line_id}" style="color:var(--red)">Hapus</button>` : `<button class="btn btn-sm btn-see" data-find="${x.line_id}">Cari kode</button>`}</div></div>`).join('')}</div>
          ${items.length > 300 ? '<div class="xs muted" style="padding:8px 16px">Menampilkan 300 produk pertama.</div>' : ''}`
        : `<div style="padding:16px">${emptyState(filter === 'pilih' ? 'Tidak ada yang perlu dipilih.' : filter === 'scan' ? 'Semua produk sudah tersambung ke resi.' : 'Belum ada produk yang punya kode barang.', 'check')}</div>`;
    };
    const load = async () => {
      if (!st) { el.querySelector('#rows').innerHTML = `<div style="padding:16px">${emptyState('Belum ada toko.', 'box')}</div>`; return; }
      paintSum();
      try { items = await rpc('sku_products', { p_store: st }); } catch (e) { items = []; }
      paintRows();
    };
    const setSku = async (line, pid) => {
      try { const n = await rpc('sku_set', { p_line: line, p_product: pid }); toast(pid ? `Tersimpan untuk ${n} baris pesanan` : 'Kode dihapus', 'ok'); load(); } catch (e) { toastErr(e); }
    };
    on(el, 'click', '[data-chips="st"] .chip', (e, b) => { st = +b.dataset.v; b.parentElement.querySelectorAll('.chip').forEach((c) => c.classList.toggle('on', c === b)); load(); });
    on(el, 'click', '[data-chips="f"] .chip', (e, b) => { filter = b.dataset.v; paintRows(); });
    on(el, 'click', '[data-pick]', (e, b) => { const [l, p] = b.dataset.pick.split(':').map(Number); setSku(l, p); });
    on(el, 'click', '[data-clear]', (e, b) => setSku(+b.dataset.clear, null));
    on(el, 'click', '[data-find]', async (e, b) => { const x = items.find((i) => i.line_id === +b.dataset.find); const p = await pickProduct('Kode barang untuk produk ini', x?.name || ''); if (p) setSku(x.line_id, p.id); });

    el.querySelector('#fo').addEventListener('change', async (e) => {
      const f = e.target.files[0]; e.target.value = ''; if (!f) return;
      const box = el.querySelector('#up'); box.innerHTML = skeleton(1);
      try {
        const { readBook, kindOf, shopeeUpload } = await import('../shopee-upload.js');
        const book = await readBook(f); const k = kindOf(book.sheets);
        if (!k || !k.startsWith('orders:')) { box.innerHTML = '<div class="alert red small">Ini bukan file Pesanan Saya dari Shopee.</div>'; return; }
        await shopeeUpload(f, box, book, k, { forceStore: st, onSaved: () => { last = { book, sheet: k.split(':')[1], file: f, store_id: st }; el.querySelector('#dlorder').disabled = false; filter = 'pilih'; load(); } });
      } catch (err) { toastErr(err); box.innerHTML = ''; }
    });
    el.querySelector('#dlorder').onclick = async () => {
      if (!last) return;
      const look = await lookupFor();
      const rows = last.book.sheets[last.sheet];
      const r = fillOrderExport(rows, look);
      await download(last.book, last.sheet, rows, r.rows, last.file.name.replace(/\.xlsx?$/i, '') + '-SKU.xlsx');
      toast(`${r.filled} baris terisi SKU, ${r.missing} belum`, r.missing ? '' : 'ok');
    };
    el.querySelector('#ft').addEventListener('change', async (e) => {
      const f = e.target.files[0]; e.target.value = ''; if (!f) return;
      const res = el.querySelector('#tres'); res.innerHTML = skeleton(1);
      try {
        const { readBook } = await import('../shopee-upload.js');
        const book = await readBook(f);
        const { findTemplateCols } = await import('../shopee-data.js');
        const sheet = Object.keys(book.sheets).find((n) => findTemplateCols(book.sheets[n]));
        if (!sheet) throw new Error('Kolom Nama Produk / SKU tidak ditemukan. Pakai template Ubah Massal › Info Penjualan dari Shopee.');
        const look = await lookupFor();
        const r = fillTemplate(book.sheets[sheet], look);
        if (r.filled) await download(book, sheet, book.sheets[sheet], r.rows, f.name.replace(/\.xlsx?$/i, '') + '-isi-SKU.xlsx');
        res.innerHTML = `<div class="alert ${r.filled ? 'green' : 'yellow'} small"><b>${num(r.filled)}</b> produk/variasi terisi SKU${r.filled ? ' — file hasil sudah diunduh, upload di Shopee › Ubah Massal' : ''}. <b>${num(r.missing)}</b> belum punya kode barang.</div>
          ${r.miss.length ? `<details class="small"><summary style="cursor:pointer">Lihat yang belum (${num(r.missing)})</summary><ul style="margin:6px 0 0;padding-left:18px">${r.miss.map((m) => `<li>${esc(m)}</li>`).join('')}</ul><div class="xs muted">Upload file Pesanan yang berisi produk ini (setelah resinya di-scan admin), atau pilih kodenya di langkah 2.</div></details>` : ''}`;
      } catch (err) { res.innerHTML = `<div class="alert red small">${esc(err.message || err)}</div>`; }
    });
    void store;
    load();
  }
};
