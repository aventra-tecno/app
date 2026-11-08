import { supa, rpc } from '../supa.js';
import { store } from '../store.js';
import { esc, on, toast, toastErr, emptyState, skeleton, beep, icon, photoField, bindPhoto, promptBox, statusTag, fmtDateTime, skuMatch, normSku } from '../ui.js';
import { scanBox, bindScan } from '../scanner.js';

export default {
  tour: [
    { sel: '#scan', title: 'Langkah 1: scan resi', body: 'Scan barcode resi Shopee (atau ketik no. resi / no. pesanan). Pakai scanner gun supaya cepat.' },
    { sel: '#queue', title: 'Antrian packing', body: 'Pesanan yang semua barangnya sudah siap (sudah diambil picker / datang dari WIN).' }
  ],
  async render(el) {
    let order = null, getPhoto = () => null;
    el.innerHTML = `<div class="stack">
      <div class="card stack" id="scan"><div class="row between"><b id="mode">Langkah 1 · Scan resi Shopee</b><button class="btn btn-sm hidden" id="reset">Ganti resi</button></div>
        ${scanBox('sb', 'Scan resi / barcode barang')}<div id="msg" aria-live="polite"></div></div>
      <div id="order"></div>
      <section><div class="row between"><h2 class="sec-title">Antrian siap packing</h2><span class="tag" id="qcount">…</span></div><div class="card flush" id="queue" style="margin-top:8px">${skeleton(2)}</div></section>
    </div>`;
    const msg = (html, cls = 'red') => (el.querySelector('#msg').innerHTML = html ? `<div class="alert ${cls}">${html}</div>` : '');

    const loadQueue = async () => {
      const { data } = await supa.from('orders').select('id, order_no, resi, order_items(name, qty)').eq('status', 'siap_packing').order('order_date').limit(100);
      el.querySelector('#qcount').textContent = (data || []).length + ' resi';
      el.querySelector('#queue').innerHTML = data?.length ? `<div class="list">${data.map((o) => `<button class="list-item" data-pick="${esc(o.resi || o.order_no)}"><div class="grow"><b class="mono small">${esc(o.resi || o.order_no)}</b><div class="xs muted">${o.order_items.map((i) => esc(i.name) + ' ×' + i.qty).join(', ')}</div></div>${icon('chev', 18)}</button>`).join('')}</div>` : emptyState('Belum ada resi yang siap dipacking.', 'bag');
    };

    const openOrder = async (code) => {
      const c = code.replace(/[^\w-]/g, '');
      const { data, error } = await supa.from('orders').select('*, order_items(*, products(sku, name))').or(`resi.ilike.${c},order_no.ilike.${c}`).limit(1);
      if (error) { toastErr(error); return false; }
      if (!data.length) { beep(false); msg(`Resi / pesanan <b class="mono">${esc(code)}</b> tidak ditemukan. Sudah dicatat kepala gudang / diupload?`); return { ok: false, title: 'Resi tidak ditemukan', info: 'Sudah dicatat di menu Catat pesanan?' }; }
      order = data[0];
      if (['cancel', 'retur'].includes(order.status)) { beep(false); msg(`<b>PESANAN DIBATALKAN — JANGAN DIKIRIM.</b><br>Serahkan barangnya ke kepala gudang.`); order = null; return { ok: false, title: 'Pesanan dibatalkan — jangan dikirim', info: 'Serahkan barangnya ke kepala gudang' }; }
      if (['dikirim', 'selesai'].includes(order.status)) { beep(false); msg(`Pesanan ini sudah dipacking ${fmtDateTime(order.packed_at)}.`, 'yellow'); order = null; return { ok: false, title: 'Pesanan sudah dipacking', info: fmtDateTime(data[0].packed_at) }; }
      beep(true); msg(order.status === 'menunggu_win' ? '<b>Menunggu barang WIN.</b> Boleh disiapkan dan di-scan, tapi baru bisa dikirim setelah kepala gudang selesai terima barang WIN. Kalau WIN kosong, pesanan ini otomatis cancel.' : '', 'yellow');
      getPhoto = () => null; paint();
      return { ok: true, title: 'Resi ' + (order.resi || order.order_no), info: order.order_items.map((i) => i.name + ' ×' + i.qty).join(', ') };
    };

    let photoPath = null;
    const paint = () => {
      const box = el.querySelector('#order');
      photoPath = order ? (getPhoto() || photoPath) : null;
      el.querySelector('#reset').classList.toggle('hidden', !order);
      el.querySelector('#mode').textContent = order ? 'Langkah 2 · Scan tiap barang' : 'Langkah 1 · Scan resi Shopee';
      if (!order) { box.innerHTML = ''; return; }
      const items = order.order_items;
      const total = items.reduce((a, i) => a + i.qty, 0), packed = items.reduce((a, i) => a + i.packed_qty, 0);
      const done = packed >= total;
      box.innerHTML = `<div class="card stack outline">
        <div class="row between wrap"><div><div class="xs muted">Resi</div><b class="mono" style="font-size:17px">${esc(order.resi || '–')}</b></div><div class="right"><div class="xs muted">Pesanan</div><span class="mono small">${esc(order.order_no)}</span></div></div>
        ${order.status !== 'siap_packing' ? `<div class="alert yellow">Status ${statusTag(order.status)} — sebagian barang mungkin belum siap.</div>` : ''}
        <div class="row between"><b>Barang</b><b>${packed} / ${total}</b></div><div class="progress"><div style="width:${(packed / total) * 100}%"></div></div>
        ${items.map((i) => `<div class="row" style="padding:6px 0"><span class="grow">${esc(i.name)}<div class="xs muted mono">${esc(i.products?.sku || i.sku || '')}</div></span><b class="${i.packed_qty >= i.qty ? 'pos' : ''}">${i.packed_qty}/${i.qty}</b></div>`).join('')}
        <div><div class="small" style="font-weight:600;margin-bottom:6px">Langkah 3 · Foto paket ${store.settings.wajib_foto_packing ? '(wajib)' : '(bukti kalau ada komplain)'}</div>${photoField('pf', 'Ketuk untuk foto paket')}</div>
        <button class="btn btn-primary btn-lg" id="finish" ${done ? '' : 'disabled'}>Selesai &amp; siap kirim</button>
        ${!done ? '<button class="btn btn-ghost btn-sm" id="force" style="color:var(--red-ink)">Tetap kirim walau belum lengkap (dilaporkan ke owner)</button>' : ''}
      </div>`;
      const g = bindPhoto(box, 'pf', 'packing');
      if (photoPath) { const pf = box.querySelector('#pf'); pf.dataset.path = photoPath; pf.innerHTML = `${icon('check', 22)}<span class="small">Foto paket sudah diambil (ketuk untuk ganti)</span>`; }
      getPhoto = () => g() || photoPath;
      box.querySelector('#finish').onclick = () => complete(null);
      box.querySelector('#force')?.addEventListener('click', async () => {
        const reason = await promptBox('Alasan tetap kirim', 'Kenapa barang belum lengkap / tidak cocok?', { placeholder: 'mis. stok H6 habis, diganti H4 atas izin pembeli' });
        if (reason) complete(reason);
      });
    };

    const complete = async (override) => {
      const photo = getPhoto();
      if (store.settings.wajib_foto_packing && !photo) return toast('Foto paket wajib diambil', 'err');
      try {
        await rpc('pack_complete', { p_order: order.id, p_photo: photo, p_override: override });
        beep(true); toast('Resi ' + (order.resi || order.order_no) + ' siap kirim', 'ok');
        order = null; getPhoto = () => null; paint(); msg(''); loadQueue();
      } catch (e) { toastErr(e); }
    };

    bindScan(el, 'sb', async (code) => {
      if (!order) return openOrder(code);
      if (normSku(code) === normSku(order.resi) || normSku(code) === normSku(order.order_no)) { msg('Itu resi pesanan ini. Sekarang scan barangnya.', 'yellow'); return { ok: false, title: 'Itu resi pesanan ini', info: 'Sekarang scan barangnya' }; }
      try {
        const r = await rpc('pack_scan', { p_order: order.id, p_sku: code });
        if (!r.ok) {
          beep(false);
          if (r.wrong) {
            // mungkin resi lain
            const { data: other } = await supa.from('orders').select('id').or(`resi.ilike.${code.replace(/[^\w-]/g, '')},order_no.ilike.${code.replace(/[^\w-]/g, '')}`).limit(1);
            if (other?.length) { msg('Itu resi lain. Selesaikan pesanan ini dulu atau tekan “Ganti resi”.', 'yellow'); return { ok: false, title: 'Itu resi pesanan lain', info: 'Selesaikan pesanan ini dulu atau tekan Ganti resi' }; }
          }
          msg(`<b>${esc(r.msg)}</b>${r.wrong ? '<br>Tukar dulu barangnya sebelum lanjut.' : ''}`); return { ok: false, title: r.msg, info: r.wrong ? 'Tukar dulu barangnya sebelum lanjut' : '' };
        }
        beep(true); msg('');
        const it = order.order_items.find((i) => i.packed_qty < i.qty && (skuMatch(code, i.products?.sku) || normSku(code) === normSku(i.sku)));
        if (it) it.packed_qty++;
        paint(); return { ok: true, title: r.name, info: `${r.packed}/${r.qty} dipacking` };
      } catch (e) { toastErr(e); return false; }
    });
    el.querySelector('#reset').onclick = () => { order = null; getPhoto = () => null; paint(); msg(''); };
    on(el, 'click', '[data-pick]', (e, b) => openOrder(b.dataset.pick));
    loadQueue();
  }
};
