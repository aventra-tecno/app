import { supa } from '../supa.js';
import { store } from '../store.js';
import { esc, icon, rp, fmtDateTime, chips, on, modal, toast, toastErr, pageHead, emptyState, skeleton } from '../ui.js';

const LV = { tinggi: ['Tinggi', 'solid-red'], sedang: ['Sedang', 'solid-yellow'], info: ['Info', ''] };
const KIND = {
  barang_hilang: 'Selisih stok opname (barang hilang)', kirim_tanpa_packing: 'Resi dikirim tanpa scan packing',
  retur_tidak_kembali: 'Retur / cancel tidak kembali ke gudang', terima_kurang: 'Barang WIN diterima kurang',
  harga_beli_naik: 'Harga beli di atas harga master', packing_paksa: 'Packing memaksa lanjut',
  edit_luar_jam: 'Stok diubah di luar jam kerja', tidak_ada_di_rak: 'Barang tidak ada di rak', stok_minus: 'Stok sistem minus'
};

export default {
  async render(el, { params }) {
    let filter = 'open', level = 'all';
    el.innerHTML = `${pageHead('Kecurangan & masalah', 'Dicatat otomatis oleh sistem setiap kali ada langkah yang tidak sesuai alur scan.')}
      <div class="row wrap between" style="margin-bottom:12px">${chips('st', [['open', 'Belum ditangani'], ['done', 'Sudah ditangani'], ['all', 'Semua']], filter)}
      ${chips('lv', [['all', 'Semua tingkat'], ['tinggi', 'Tinggi'], ['sedang', 'Sedang'], ['info', 'Info']], level)}</div>
      <div id="list">${skeleton()}</div>
      <details class="card" style="margin-top:16px"><summary style="cursor:pointer;font-weight:700">Apa saja yang dideteksi?</summary>
        <ul class="small muted" style="margin:10px 0 0;padding-left:18px;line-height:1.7">${Object.values(KIND).map((k) => `<li>${esc(k)}</li>`).join('')}</ul></details>`;
    const load = async () => {
      let qy = supa.from('anomalies').select('*').order('created_at', { ascending: false }).limit(200);
      if (filter === 'open') qy = qy.eq('resolved', false);
      if (filter === 'done') qy = qy.eq('resolved', true);
      if (level !== 'all') qy = qy.eq('level', level);
      const { data, error } = await qy;
      if (error) return toastErr(error);
      const box = el.querySelector('#list');
      if (!data.length) { box.innerHTML = `<div class="card">${emptyState('Tidak ada data.', 'shield')}</div>`; return; }
      box.innerHTML = `<div class="stack s8">${data.map((a) => `<div class="card ${String(a.id) === params.id ? 'outline' : ''}" style="${a.level === 'tinggi' && !a.resolved ? 'border-left:4px solid var(--red)' : ''}">
        <div class="row between wrap"><div class="row"><span class="tag ${LV[a.level][1]}">${LV[a.level][0]}</span><span class="xs muted">${esc(KIND[a.kind] || a.kind)}</span></div><span class="xs muted">${fmtDateTime(a.created_at)}</span></div>
        <div style="font-weight:700;font-size:16px;margin-top:6px">${esc(a.title)}</div>
        <div class="small muted" style="margin-top:4px">${esc(a.evidence || '')}</div>
        <div class="row between wrap" style="margin-top:10px"><div class="small">Terkait: <b>${esc(store.profilesById[a.related_user]?.full_name || '–')}</b> · Nilai <b>${rp(a.value)}</b></div>
          ${a.resolved ? `<span class="tag green">Ditangani: ${esc(a.resolved_note || '')}</span>` : `<button class="btn btn-sm btn-resolve" data-resolve="${a.id}">${icon('check', 16, 2.6)} Tandai sudah ditangani</button>`}</div>
      </div>`).join('')}</div>`;
    };
    on(el, 'click', '[data-chips] .chip', (e, b) => {
      const g = b.closest('[data-chips]').dataset.chips;
      if (g === 'st') filter = b.dataset.v; else level = b.dataset.v;
      b.parentElement.querySelectorAll('.chip').forEach((c) => c.classList.toggle('on', c === b));
      load();
    });
    on(el, 'click', '[data-resolve]', async (e, b) => {
      const note = await modal({
        title: 'Tandai sudah ditangani', body: `<label class="field">Catatan tindakan<textarea class="input" id="rn" placeholder="mis. sudah dikonfirmasi, barang ditemukan, potong gaji, dll"></textarea></label>`,
        actions: [{ label: 'Batal', value: null }, { label: 'Simpan', cls: 'btn-primary', onClick: (ov) => ov.querySelector('#rn').value.trim() || 'Ditangani' }]
      });
      if (!note) return;
      const { error } = await supa.from('anomalies').update({ resolved: true, resolved_note: note, resolved_at: new Date().toISOString(), resolved_by: store.profile.id }).eq('id', b.dataset.resolve); dispatchEvent(new Event('masalah-changed'));
      if (error) return toastErr(error);
      toast('Tersimpan', 'ok'); load();
    });
    load();
  }
};
