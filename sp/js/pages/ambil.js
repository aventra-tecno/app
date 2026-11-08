import { supa, rpc } from '../supa.js';
import { esc, on, toast, toastErr, emptyState, skeleton, beep, modal } from '../ui.js';
import { scanBox, bindScan } from '../scanner.js';

export default {
  tour: [
    { sel: '#scan', title: 'Scan barang yang diambil', body: 'Ambil barang dari rak, lalu scan barcodenya. Jumlah di daftar otomatis berkurang.' },
    { sel: '#list', title: 'Urut per rak', body: 'Daftar diurutkan per rak supaya cukup jalan satu putaran.' },
    { sel: '[data-missing]', title: 'Barang tidak ada?', body: 'Tekan “Tidak ada”. Barang otomatis dipindah ke daftar beli WIN, dan admin & kepala gudang mendapat notifikasi.' }
  ],
  async render(el) {
    el.innerHTML = `<div class="stack">
      <div class="hero"><div class="label">Daftar ambil dari rak</div><div class="big" id="total">…</div><div class="small" style="color:#C9CCC8">barang belum diambil</div></div>
      <div class="card stack" id="scan">${scanBox('sb', 'Scan barcode barang yang diambil')}<div id="last" aria-live="polite"></div></div>
      <div id="list">${skeleton(4)}</div></div>`;
    let groups = [];
    const load = async () => {
      const { data, error } = await supa.from('order_items')
        .select('qty, ready_qty, product_id, orders!inner(status, order_no), products(id, name, sku, rack_code, stock)')
        .eq('source', 'gudang').in('orders.status', ['siap_pick', 'menunggu_win']);
      if (error) return toastErr(error);
      const m = {};
      data.filter((r) => r.qty > r.ready_qty && r.products).forEach((r) => {
        const g = m[r.product_id] ||= { p: r.products, need: 0, orders: 0 };
        g.need += r.qty - r.ready_qty; g.orders++;
      });
      groups = Object.values(m).sort((a, b) => String(a.p.rack_code || 'zzz').localeCompare(String(b.p.rack_code || 'zzz'), 'id', { numeric: true }));
      el.querySelector('#total').textContent = groups.reduce((a, g) => a + g.need, 0);
      if (!groups.length) { el.querySelector('#list').innerHTML = `<div class="card">${emptyState('Semua barang sudah diambil. Mantap!', 'check')}</div>`; return; }
      let lastHead = null;
      el.querySelector('#list').innerHTML = `<div class="stack s8">${groups.map((g, i) => {
        const head = (g.p.rack_code || 'Tanpa rak').replace(/[-\s].*$/, '');
        const h = head !== lastHead ? `<div class="rack-head">RAK ${esc(head.toUpperCase())}</div>` : '';
        lastHead = head;
        return `${h}<div class="pick-row"><span class="rack">${esc(g.p.rack_code || '?')}</span>
          <div class="grow"><b>${esc(g.p.name)}</b><div class="xs muted">Ambil <b style="color:var(--ink);font-size:14px">${g.need}</b> · stok sistem ${g.p.stock} · ${g.orders} pesanan</div></div>
          <button class="btn btn-sm btn-danger" data-missing="${i}">Tidak ada</button></div>`;
      }).join('')}</div>`;
    };
    bindScan(el, 'sb', async (code) => {
      try {
        const r = await rpc('pick_scan', { p_sku: code });
        const last = el.querySelector('#last');
        if (!r.ok) { beep(false); last.innerHTML = `<div class="alert red">${esc(r.msg)}</div>`; return { ok: false, title: r.msg }; }
        beep(true);
        last.innerHTML = `<div class="alert green"><b>${esc(r.name)}</b> diambil dari rak ${esc(r.rack || '-')}. ${r.remaining ? `Masih perlu ${r.remaining} lagi.` : 'Barang ini sudah lengkap.'}</div>`;
        load(); return { ok: true, title: r.name, info: `Rak ${r.rack || '-'} · ${r.remaining ? 'masih perlu ' + r.remaining + ' lagi' : 'barang ini sudah lengkap'}` };
      } catch (e) { toastErr(e); return false; }
    });
    on(el, 'click', '[data-missing]', async (e, b) => {
      const g = groups[+b.dataset.missing];
      const note = await modal({
        title: 'Barang tidak ada di rak',
        body: `<p style="margin-top:0"><b>${esc(g.p.name)}</b> di rak ${esc(g.p.rack_code || '-')}. Stok sistem ${g.p.stock}, dibutuhkan ${g.need}.</p>
          <p class="small muted">Kalau sebagian sudah kamu ambil, scan dulu yang ada. Sisanya akan dipindah ke daftar beli WIN.</p>
          <label class="field">Keterangan (opsional)<input class="input" id="mn" placeholder="mis. rak kosong, barang rusak"></label>`,
        actions: [{ label: 'Batal', value: null }, { label: 'Laporkan', cls: 'btn-dark', onClick: (ov) => ov.querySelector('#mn').value.trim() || '-' }]
      });
      if (!note) return;
      try { const r = await rpc('pick_missing', { p_product: g.p.id, p_found: 0, p_note: note }); toast(`${r.pindah_ke_win} pcs dipindah ke daftar beli WIN`, 'ok'); load(); }
      catch (err) { toastErr(err); }
    });
    load();
  }
};
