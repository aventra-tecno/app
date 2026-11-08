import { supa, rpc } from '../supa.js';
import { store, nameOf } from '../store.js';
import { esc, rp, fmtDateTime, chips, on, modal, toast, toastErr, pageHead, emptyState, skeleton, photoField, bindPhoto, photoUrl, beep, parseNum } from '../ui.js';
import { scanBox, bindScan } from '../scanner.js';

export default {
  tour: [
    { sel: '#scan', title: 'Scan paket retur', body: 'Scan resi paket retur / cancel yang kembali. Daftar di bawah berasal dari file Pembatalan & Pengembalian Shopee.' },
    { sel: '#list', title: 'Cek kondisi', body: 'Pilih Baik (kembali ke rak) atau Rusak (masuk karantina, dihitung rugi), lalu foto barangnya.' }
  ],
  async render(el) {
    let tab = 'menunggu';
    const canProcess = ['owner', 'kepala_gudang', 'supervisor'].includes(store.role);
    el.innerHTML = `${pageHead('Retur & cancel', 'Barang cancel yang sudah diambil dan paket retur harus di-scan kembali ke gudang. Yang lewat batas waktu dilaporkan ke owner.')}
      <div class="stack">${canProcess ? `<div class="card" id="scan">${scanBox('sb', 'Scan resi paket retur / no. pesanan')}</div>` : ''}
      ${chips('t', [['menunggu', 'Menunggu di-scan'], ['selesai', 'Sudah diproses']], tab)}<div id="list">${skeleton()}</div></div>`;
    let rows = [];
    const load = async () => {
      const { data, error } = await supa.from('returns').select('*').eq('status', tab).order('created_at', { ascending: tab === 'menunggu' }).limit(200);
      if (error) return toastErr(error);
      rows = data;
      const grace = store.settings.retur_grace_days || 2;
      el.querySelector('#list').innerHTML = data.length ? `<div class="card flush"><div class="list">${data.map((r) => {
        const days = Math.floor((Date.now() - new Date(r.shopee_received_at || r.created_at)) / 864e5);
        return `<div class="list-item"><div class="grow"><div class="row wrap"><span class="tag ${r.type === 'cancel' ? 'yellow' : 'red'}">${r.type === 'cancel' ? 'Cancel' : 'Retur'}</span><b class="mono small">${esc(r.order_no || '-')}</b>
          ${r.status === 'menunggu' && days >= grace ? `<span class="tag solid-red">${days} hari</span>` : ''}${r.condition ? `<span class="tag ${r.condition === 'baik' ? 'green' : 'red'}">${r.condition}</span>` : ''}</div>
          <div class="xs muted">${esc(r.reason || '')} · resi ${esc(r.resi || '-')} · ${fmtDateTime(r.created_at)}${r.status === 'selesai' ? ` · diproses ${esc(nameOf(r.scanned_by))}, rugi ${rp(Number(r.loss_amount) + Number(r.ongkir_loss))}` : ''}</div></div>
          ${r.status === 'menunggu' && canProcess ? `<button class="btn btn-sm btn-primary" data-proc="${r.id}">Proses</button>` : r.photo ? `<button class="btn btn-sm" data-photo="${esc(r.photo)}">Foto</button>` : ''}</div>`;
      }).join('')}</div></div>` : `<div class="card">${emptyState(tab === 'menunggu' ? 'Tidak ada retur / cancel yang menunggu.' : 'Belum ada.', 'ret')}</div>`;
    };
    on(el, 'click', '[data-chips="t"] .chip', (e, b) => { tab = b.dataset.v; b.parentElement.querySelectorAll('.chip').forEach((c) => c.classList.toggle('on', c === b)); load(); });
    on(el, 'click', '[data-proc]', (e, b) => processReturn(+b.dataset.proc, load));
    on(el, 'click', '[data-photo]', async (e, b) => { const u = await photoUrl(b.dataset.photo); modal({ title: 'Foto barang retur', body: `<img src="${u}" alt="Foto retur" style="border-radius:8px">` }); });
    if (canProcess) bindScan(el, 'sb', async (code) => {
      const c = code.replace(/[^\w-]/g, '');
      const { data } = await supa.from('returns').select('id').eq('status', 'menunggu').or(`resi.ilike.${c},order_no.ilike.${c},return_no.ilike.${c}`).limit(1);
      if (!data?.length) { beep(false); return { ok: false, title: 'Tidak ada retur / cancel menunggu', info: 'Cek no. resi / pesanan' }; }
      beep(true); processReturn(data[0].id, load); return { ok: true, title: 'Retur / cancel ditemukan', info: 'Pilih kondisi barang' };
    });
    load();
  }
};

async function processReturn(id, after) {
  const { data: r } = await supa.from('returns').select('*').eq('id', id).single();
  const { data: items } = r.order_id ? await supa.from('order_items').select('name, qty, ready_qty, unit_cost').eq('order_id', r.order_id) : { data: [] };
  const list = (items || []).map((i) => ({ ...i, back: r.type === 'cancel' ? i.ready_qty : i.qty })).filter((i) => i.back > 0);
  let cond = 'baik', getPhoto;
  const res = await modal({
    title: (r.type === 'cancel' ? 'Cancel ' : 'Retur ') + (r.order_no || ''),
    body: `<div class="stack">
      <div class="small muted">${esc(r.reason || '')}</div>
      ${list.length ? `<div class="card" style="background:var(--paper)">${list.map((i) => `<div class="line-row"><span>${esc(i.name)}</span><b>×${i.back}</b></div>`).join('')}</div>` : '<div class="alert yellow">Barang pesanan ini tidak tercatat di sistem (mungkin pesanan lama). Proses tetap disimpan tanpa mengubah stok.</div>'}
      <div><div class="small" style="font-weight:600;margin-bottom:6px">Kondisi barang setelah dicek</div>
        <div class="grid g2"><button type="button" class="cond-btn good on" data-c="baik">Baik<br><span class="xs" style="font-weight:400">kembali ke rak</span></button><button type="button" class="cond-btn bad" data-c="rusak">Rusak<br><span class="xs" style="font-weight:400">ke karantina, dihitung rugi</span></button></div></div>
      ${photoField('rp', 'Foto kondisi barang')}
      <div class="grid g2"><label class="field">Ongkir retur ditanggung toko<input class="input num" id="ong" inputmode="numeric" data-money value="0"></label><label class="field">Catatan<input class="input" id="nt"></label></div>
    </div>`,
    actions: [{ label: 'Batal', value: null }, { label: 'Simpan retur', cls: 'btn-primary', onClick: async (ov) => {
      const out = await rpc('process_return', { p_return: id, p_condition: cond, p_photo: getPhoto(), p_ongkir: parseNum(ov.querySelector('#ong').value) || 0, p_note: ov.querySelector('#nt').value.trim() || null });
      return out;
    } }],
    onOpen: (ov) => {
      getPhoto = bindPhoto(ov, 'rp', 'retur');
      ov.querySelectorAll('[data-c]').forEach((b) => b.addEventListener('click', () => { cond = b.dataset.c; ov.querySelectorAll('[data-c]').forEach((x) => x.classList.toggle('on', x === b)); }));
    }
  });
  if (res) { toast(`Tersimpan. ${res.barang} barang, rugi ${rp(res.rugi)}`, 'ok'); after && after(); }
}
