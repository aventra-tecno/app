import { supa, rpc } from '../supa.js';
import { store } from '../store.js';
import { esc, fmtDateTime, fmtTime, on, toast, toastErr, emptyState, skeleton, icon, modal, photoField, bindPhoto } from '../ui.js';
import { poTag } from './beli.js';

export default {
  tour: [
    { sel: '[data-tour="task"]', title: 'Tugas ambil', body: 'Setiap tugas berisi daftar barang yang harus diambil di pabrik WIN.' },
    { sel: '[data-tour="act"]', title: 'Tekan sesuai langkah', body: 'Berangkat → Barang diterima dari WIN (foto nota) → Sudah sampai gudang. Kepala gudang lalu men-scan barangnya.' }
  ],
  async render(el) {
    el.innerHTML = `<div class="stack"><div id="active">${skeleton(2)}</div><h2 class="sec-title" style="margin-top:8px">Riwayat</h2><div class="card flush" id="hist"></div></div>`;
    const load = async () => {
      const { data, error } = await supa.from('purchase_orders').select('*, po_items(qty, products(name, sku))').eq('driver_id', store.profile.id).order('created_at', { ascending: false }).limit(40);
      if (error) return toastErr(error);
      const act = data.filter((p) => !['selesai', 'batal'].includes(p.status));
      const hist = data.filter((p) => ['selesai', 'batal'].includes(p.status));
      el.querySelector('#active').innerHTML = act.length ? `<div class="stack">${act.map((p, idx) => {
        const steps = [['berangkat', 'Berangkat ke pabrik', p.departed_at], ['diambil', 'Barang diterima dari WIN', p.picked_at], ['sampai', 'Serahkan ke kepala gudang', p.arrived_at]];
        const next = p.status === 'ditugaskan' || p.status === 'draft' ? 'berangkat' : p.status === 'berangkat' ? 'diambil' : p.status === 'diambil' ? 'sampai' : null;
        const nextLabel = { berangkat: 'Berangkat sekarang', diambil: 'Barang sudah diterima dari WIN', sampai: 'Sudah sampai gudang' }[next];
        const q = p.po_items.reduce((a, i) => a + i.qty, 0);
        return `<div class="card outline stack" ${idx === 0 ? 'data-tour="task"' : ''}>
          <div class="row between wrap"><b class="mono">${esc(p.code)}</b>${poTag(p.status)}</div>
          <div style="font-size:17px;font-weight:700">Pabrik WIN — ${q} item / ${p.po_items.length} macam</div>
          <div class="small muted">No. order WIN <b class="mono">${esc(p.win_order_no || '–')}</b>${p.note ? ' · ' + esc(p.note) : ''}</div>
          <details><summary style="cursor:pointer;font-weight:600" class="small">Lihat daftar barang</summary>
            <div class="small" style="margin-top:6px;line-height:1.7">${p.po_items.map((i) => `${esc(i.products.name)} <b>×${i.qty}</b>`).join('<br>')}</div></details>
          <div class="step-list">${steps.map(([k, l, t], i) => `<div class="step-item"><span class="step-num ${t ? 'done' : ''}">${t ? icon('check', 14, 3) : i + 1}</span><span class="grow ${!t && k === next ? '' : ''}" style="${k === next ? 'font-weight:700' : ''}">${l}</span><span class="small muted">${t ? fmtTime(t) : ''}</span></div>`).join('')}</div>
          ${next ? `<button class="btn btn-primary btn-lg" data-next="${p.id}" data-st="${next}" ${idx === 0 ? 'data-tour="act"' : ''}>${nextLabel}</button>` : '<div class="alert blue">Menunggu kepala gudang men-scan barang.</div>'}
          <div class="xs muted">Sopir tidak menghitung stok. Jumlah resmi tercatat saat kepala gudang scan barang di gudang.</div></div>`;
      }).join('')}</div>` : `<div class="card">${emptyState('Belum ada tugas ambil hari ini.', 'truck')}</div>`;
      el.querySelector('#hist').innerHTML = hist.length ? `<div class="list">${hist.map((p) => `<div class="list-item"><div class="grow"><b class="mono small">${esc(p.code)}</b><div class="xs muted">${p.po_items.reduce((a, i) => a + i.qty, 0)} item · ${fmtDateTime(p.finished_at || p.created_at)}</div></div>${poTag(p.status)}</div>`).join('')}</div>` : emptyState('Belum ada riwayat.', 'clip');
    };
    on(el, 'click', '[data-next]', async (e, b) => {
      const st = b.dataset.st, id = +b.dataset.next;
      let photo = null;
      if (st === 'diambil') {
        let get;
        const ok = await modal({
          title: 'Foto nota / surat jalan WIN', body: `<p class="muted" style="margin-top:0">Foto nota sebagai bukti jumlah barang yang diberikan pabrik.</p>${photoField('nota', 'Ketuk untuk foto nota')}`,
          actions: [{ label: 'Batal', value: false }, { label: 'Simpan', cls: 'btn-primary', onClick: () => { photo = get(); if (!photo) { toast('Foto nota dulu', 'err'); return false; } return true; } }],
          onOpen: (ov) => { get = bindPhoto(ov, 'nota', 'nota'); }
        });
        if (!ok) return;
      }
      b.disabled = true;
      try { await rpc('driver_update_po', { p_po: id, p_status: st, p_photo: photo }); toast('Tersimpan', 'ok'); load(); }
      catch (err) { toastErr(err); b.disabled = false; }
    });
    load();
  }
};
