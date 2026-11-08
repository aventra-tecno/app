import { supa, rpc } from '../supa.js';
import { store, nameOf } from '../store.js';
import { esc, rp, num, fmtDateTime, chips, on, modal, toast, toastErr, pageHead, emptyState, skeleton, icon, parseNum, photoField, bindPhoto, photoUrl } from '../ui.js';
import { orderEvidence } from '../order-view.js';

// Komplain & garansi pembeli. Cari resi -> isi paket + foto packing sebagai bukti banding ke marketplace.
const KIND = { barang_salah: 'Barang salah', kurang: 'Barang kurang', rusak: 'Rusak / pecah', tidak_sampai: 'Paket tidak sampai', garansi: 'Klaim garansi', tidak_cocok: 'Tidak cocok / tidak sesuai', lainnya: 'Lainnya' };
const STAT = { baru: ['Baru', 'red'], proses: ['Diproses', 'yellow'], selesai: ['Selesai', 'green'], ditolak: ['Ditolak', ''] };
const RES = { refund: 'Refund ke pembeli', kirim_ulang: 'Kirim ulang barang', tukar: 'Tukar barang', banding_menang: 'Banding menang (tanpa rugi)', banding_kalah: 'Banding kalah', tanpa_biaya: 'Selesai tanpa biaya' };

export default {
  tour: [
    { sel: '#new', title: 'Komplain baru', body: 'Ketik / scan resi. Aplikasi menampilkan isi paket, siapa yang packing, dan foto packing untuk bukti banding.' },
    { sel: '#list', title: 'Daftar komplain', body: 'Tekan komplain untuk mengubah status, hasil penyelesaian, dan kerugian.' }
  ],
  async render(el, { params = {} } = {}) {
    let st = 'buka', rows = [];
    el.innerHTML = `${pageHead('Komplain & garansi', 'Catat komplain pembeli dari marketplace. Foto packing dari aplikasi bisa dipakai sebagai bukti banding.', `<button class="btn btn-primary" id="new">${icon('plus', 18)} Komplain baru</button>`)}
      <div class="stack"><form class="row" id="sf"><input class="input grow" id="sq" placeholder="Cek resi / no. pesanan (bukti packing)…" autocomplete="off"><button class="btn">${icon('search', 18)} Cek</button></form>
        <div id="sum"></div>${chips('s', [['buka', 'Belum selesai'], ['selesai', 'Selesai'], ['ditolak', 'Ditolak'], ['all', 'Semua']], st)}
        <section class="card flush" id="list">${skeleton()}</section></div>`;
    const load = async () => {
      const { data, error } = await supa.from('complaints').select('*').order('created_at', { ascending: false }).limit(500);
      if (error) return toastErr(error);
      rows = data;
      const open = rows.filter((r) => ['baru', 'proses'].includes(r.status));
      const m = new Date().toISOString().slice(0, 7);
      const month = rows.filter((r) => r.created_at.slice(0, 7) === m);
      el.querySelector('#sum').innerHTML = `<div class="grid gauto"><div class="card kpi ${open.length ? 'dark' : ''}"><div class="label">Belum selesai</div><div class="value">${open.length}</div><div class="sub">${open.filter((r) => r.status === 'baru').length} baru</div></div>
        <div class="card kpi"><div class="label">Komplain bulan ini</div><div class="value">${month.length}</div><div class="sub">${month.filter((r) => ['barang_salah', 'kurang'].includes(r.kind)).length} salah / kurang kirim</div></div>
        <div class="card kpi"><div class="label">Kerugian bulan ini</div><div class="value neg">${rp(month.reduce((s, r) => s + Number(r.loss), 0))}</div><div class="sub">${month.filter((r) => r.resolution === 'banding_menang').length} banding menang</div></div></div>`;
      paint();
    };
    const paint = () => {
      const list = rows.filter((r) => st === 'all' || (st === 'buka' ? ['baru', 'proses'].includes(r.status) : r.status === st));
      el.querySelector('#list').innerHTML = list.length ? `<div class="list">${list.map((r) => `<button class="list-item" data-c="${r.id}">
        <div class="grow" style="min-width:0"><b class="mono">${esc(r.resi || r.order_no || 'Tanpa resi')}</b> <span class="tag ${STAT[r.status][1]}">${STAT[r.status][0]}</span> <span class="tag">${esc(KIND[r.kind] || r.kind)}</span>
          <div class="small" style="margin-top:2px">${esc(r.description || '')}</div>
          <div class="xs muted">${esc(fmtDateTime(r.created_at))}${r.customer ? ' · ' + esc(r.customer) : ''} · dicatat ${esc(nameOf(r.created_by))}${r.resolution ? ' · ' + esc(RES[r.resolution]) : ''}</div></div>
        ${Number(r.loss) ? `<b class="num neg">${rp(r.loss)}</b>` : ''}</button>`).join('')}</div>` : emptyState('Tidak ada komplain di daftar ini.', 'check');
    };
    const lookup = async (code) => { try { return await rpc('order_lookup', { p_code: code }); } catch (e) { toastErr(e); return null; } };

    const create = async (code0 = '') => {
      let found = null;
      const r = await modal({ title: 'Komplain baru', wide: true, body: `<div class="stack">
        <form class="row" id="c-f"><input class="input grow" id="c-code" placeholder="Scan / ketik resi atau no. pesanan" value="${esc(code0)}" autocomplete="off"><button class="btn">${icon('search', 18)} Cari</button></form>
        <div id="c-ev"></div>
        <div class="grid g2"><label class="field">Jenis komplain<select class="input" id="c-k">${Object.entries(KIND).map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select></label>
          <label class="field">Nama / username pembeli<input class="input" id="c-n"></label>
          <label class="field" style="grid-column:1/-1">Isi komplain<textarea class="input" id="c-d" rows="3" placeholder="mis. pembeli bilang menerima kampas rem tipe lain"></textarea></label></div>
        ${photoField('c-ph', 'Foto dari pembeli (opsional)')}</div>`,
        onOpen: (ov) => {
          const get = bindPhoto(ov, 'c-ph', 'komplain'); ov._get = get;
          const go = async (e) => { e?.preventDefault(); const c = ov.querySelector('#c-code').value.trim(); if (!c) return; ov.querySelector('#c-ev').innerHTML = skeleton(1); found = await lookup(c); ov.querySelector('#c-ev').innerHTML = await orderEvidence(found, { garansi: true }); };
          ov.querySelector('#c-f').addEventListener('submit', go);
          if (code0) go();
        },
        actions: [{ label: 'Batal', value: null }, { label: 'Simpan komplain', cls: 'btn-primary', onClick: async (ov) => {
          const v = (id) => ov.querySelector('#' + id).value.trim();
          if (!v('c-d') && !v('c-code')) { toast('Isi resi atau isi komplain', 'err'); return false; }
          await rpc('complaint_save', { p: { code: v('c-code'), kind: v('c-k'), customer: v('c-n'), description: v('c-d'), photo: ov._get() } });
          return true;
        } }] });
      if (r) { toast('Komplain dicatat', 'ok'); load(); }
    };
    const detail = async (c) => {
      const o = c.resi || c.order_no ? await lookup(c.resi || c.order_no) : null;
      const buyerPhoto = c.photo ? await photoUrl(c.photo) : null;
      const r = await modal({ title: 'Komplain ' + (c.resi || c.order_no || '#' + c.id), wide: true, body: `<div class="stack">
        ${await orderEvidence(o, { garansi: true })}
        <div class="card" style="background:var(--paper)"><b>${esc(KIND[c.kind] || c.kind)}</b>${c.customer ? ' · ' + esc(c.customer) : ''}<div class="small">${esc(c.description || '')}</div>
          ${buyerPhoto ? `<a href="${esc(buyerPhoto)}" target="_blank" rel="noopener" class="btn btn-sm btn-ghost" style="margin-top:6px">${icon('camera', 15)} Foto dari pembeli</a>` : ''}
          <div class="xs muted" style="margin-top:4px">Dicatat ${esc(nameOf(c.created_by))} · ${esc(fmtDateTime(c.created_at))}${c.handled_by ? ' · ditangani ' + esc(nameOf(c.handled_by)) : ''}</div></div>
        <div class="grid g2"><label class="field">Status<select class="input" id="d-s">${Object.entries(STAT).map(([k, [l]]) => `<option value="${k}" ${c.status === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
          <label class="field">Penyelesaian<select class="input" id="d-r"><option value="">–</option>${Object.entries(RES).map(([k, l]) => `<option value="${k}" ${c.resolution === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
          <label class="field">Kerugian (refund, ongkir, barang)<input class="input num" id="d-l" inputmode="numeric" data-money value="${num(c.loss)}"></label>
          <label class="field">Catatan<input class="input" id="d-n" value="${esc(c.note || '')}" placeholder="mis. no. banding Shopee"></label></div></div>`,
        actions: [{ label: 'Tutup', value: null }, { label: 'Simpan', cls: 'btn-primary', onClick: async (ov) => {
          const v = (id) => ov.querySelector('#' + id).value;
          await rpc('complaint_save', { p: { id: c.id, status: v('d-s'), resolution: v('d-r'), loss: parseNum(v('d-l')), note: v('d-n') } });
          return true;
        } }] });
      if (r) { toast('Tersimpan', 'ok'); load(); }
    };

    el.querySelector('#new').onclick = () => create();
    el.querySelector('#sf').addEventListener('submit', async (e) => {
      e.preventDefault(); const c = el.querySelector('#sq').value.trim(); if (!c) return;
      const o = await lookup(c);
      const r = await modal({ title: 'Bukti pesanan', wide: true, body: await orderEvidence(o, { garansi: true }), actions: [{ label: 'Tutup', value: null }, { label: 'Catat komplain', cls: 'btn-primary', value: 'new' }] });
      if (r === 'new') create(c);
    });
    on(el, 'click', '[data-c]', (e, b) => detail(rows.find((r) => String(r.id) === b.dataset.c)));
    on(el, 'click', '[data-chips] .chip', (e, b) => { b.parentElement.querySelectorAll('.chip').forEach((c) => c.classList.toggle('on', c === b)); st = b.dataset.v; paint(); });
    await load();
    if (params.resi) create(params.resi);
    void store;
  }
};
