import { supa, rpc } from '../supa.js';
import { esc, rp, todayStr, addDays, fmtDateTime, chips, on, modal, toast, toastErr, pageHead, emptyState, skeleton, statusTag, photoUrl, debounce, icon, confirmBox } from '../ui.js';

const VIEWS = [['proses', 'Sedang diproses'], ['siap_pick', 'Siap diambil'], ['menunggu_win', 'Menunggu WIN'], ['siap_packing', 'Siap packing'], ['today', 'Masuk hari ini'], ['dikirim', 'Dikirim'], ['cancel', 'Cancel'], ['retur', 'Retur']];

export default {
  tour: [
    { sel: '[data-chips="v"]', title: 'Saring pesanan', body: 'Lihat pesanan yang masih diproses, menunggu barang WIN, siap packing, dikirim, cancel, atau retur.' },
    { sel: '#search', title: 'Cari cepat', body: 'Ketik atau scan nomor resi / nomor pesanan.' },
    { sel: '[data-tour="up"]', title: 'Pesanan masuk lewat upload', body: 'Pesanan baru dimasukkan dengan upload file dari Shopee Seller Center.' }
  ],
  async render(el) {
    let view = 'proses', search = '';
    el.innerHTML = `${pageHead('Pesanan Shopee', '', `<a class="btn btn-primary" href="#/upload" data-tour="up">${icon('upload', 18)} Upload file pesanan</a>`)}
      <div class="stack">
        <div id="counts" class="grid gauto"></div>
        <div class="row wrap">${chips('v', VIEWS, view)}</div>
        <input class="input" id="search" placeholder="Cari no. resi / no. pesanan / nama barang" aria-label="Cari pesanan">
        <div class="card flush" id="list">${skeleton()}</div>
      </div>`;

    const counts = async () => {
      const st = ['siap_pick', 'menunggu_win', 'siap_packing'];
      const res = await Promise.all(st.map((s) => supa.from('orders').select('id', { count: 'exact', head: true }).eq('status', s)));
      const lbl = { siap_pick: ['Siap diambil picker', 'blue'], menunggu_win: ['Menunggu barang WIN', 'yellow'], siap_packing: ['Siap packing', 'green'] };
      el.querySelector('#counts').innerHTML = st.map((s, i) => `<div class="stat ${lbl[s][1] === 'blue' ? 'gray' : lbl[s][1]}"><b>${res[i].count ?? 0}</b><span>${lbl[s][0]}</span></div>`).join('');
    };

    const load = async () => {
      const box = el.querySelector('#list');
      let qy = supa.from('orders').select('id, order_no, resi, order_date, status, total_jual, harga_selesai, paid, entry, stores(name), order_items(name, qty, source, ready_qty, packed_qty)').order('order_date', { ascending: false, nullsFirst: false }).limit(300);
      if (view === 'proses') qy = qy.in('status', ['baru', 'siap_pick', 'menunggu_win', 'siap_packing']);
      else if (view === 'today') { const t = todayStr(); qy = qy.gte('order_date', t + 'T00:00:00+07:00').lt('order_date', addDays(t, 1) + 'T00:00:00+07:00'); }
      else qy = qy.eq('status', view);
      if (search) qy = qy.or(`order_no.ilike.%${search}%,resi.ilike.%${search}%`);
      const { data, error } = await qy;
      if (error) return toastErr(error);
      if (!data.length) { box.innerHTML = emptyState('Tidak ada pesanan di sini.', 'bag'); return; }
      box.innerHTML = `<div class="table-wrap"><table class="tbl" style="min-width:720px"><thead><tr><th>No. pesanan / resi</th><th>Barang</th><th>Status</th><th class="right">Total jual</th><th>Tanggal</th></tr></thead><tbody>
        ${data.map((o) => `<tr style="cursor:pointer" data-open="${o.id}"><td><b class="mono small">${esc(o.order_no)}</b><div class="xs muted mono">${esc(o.resi || '–')}</div>${o.stores?.name ? `<span class="tag">${esc(o.stores.name)}</span>` : ''}</td>
          <td class="small">${o.order_items.map((i) => `${esc(i.name)} ×${i.qty} ${i.source === 'win' ? '<span class="tag yellow">WIN</span>' : ''}`).join('<br>')}</td>
          <td>${statusTag(o.status)}${o.paid ? ' <span class="tag green">Lunas</span>' : ''}</td><td class="num">${rp(o.total_jual)}</td><td class="small nowrap">${fmtDateTime(o.order_date)}</td></tr>`).join('')}
      </tbody></table></div><div class="xs muted" style="padding:10px 16px">Menampilkan ${data.length} pesanan (maks. 300).</div>`;
    };

    on(el, 'click', '[data-chips="v"] .chip', (e, b) => { view = b.dataset.v; b.parentElement.querySelectorAll('.chip').forEach((c) => c.classList.toggle('on', c === b)); load(); });
    el.querySelector('#search').addEventListener('input', debounce((e) => { search = e.target.value.trim().replace(/[,%()]/g, ''); load(); }, 350));
    on(el, 'click', '[data-open]', (e, tr) => openOrder(+tr.dataset.open, () => { load(); counts(); }));
    counts(); load();
  }
};

export async function openOrder(id, after) {
  const { data: o, error } = await supa.from('orders').select('*, order_items(*)').eq('id', id).single();
  if (error) return toastErr(error);
  const photo = o.pack_photo ? await photoUrl(o.pack_photo) : null;
  const canCancel = ['baru', 'siap_pick', 'menunggu_win', 'siap_packing'].includes(o.status);
  const r = await modal({
    title: 'Pesanan ' + o.order_no, wide: true,
    body: `<div class="stack">
      <div class="row wrap">${statusTag(o.status)} <span class="small muted">Resi <b class="mono">${esc(o.resi || '–')}</b> · ${fmtDateTime(o.order_date)}</span></div>
      <div class="table-wrap card flush" style="border:1px solid var(--line)"><table class="tbl"><thead><tr><th>Barang</th><th>Sumber</th><th class="right">Qty</th><th class="right">Siap</th><th class="right">Dipacking</th><th class="right">Harga</th></tr></thead><tbody>
      ${o.order_items.map((i) => `<tr><td>${esc(i.name)}<div class="xs muted mono">${esc(i.sku || '')}</div></td><td>${i.source === 'win' ? '<span class="tag yellow">Beli WIN</span>' : '<span class="tag">Gudang</span>'}</td>
        <td class="num">${i.qty}</td><td class="num">${i.ready_qty}</td><td class="num">${i.packed_qty}</td><td class="num">${rp(i.price)}</td></tr>`).join('')}
      </tbody></table></div>
      <div class="grid g2"><div class="card" style="background:var(--paper)"><div class="line-row"><span>Total jual</span><b>${rp(o.total_jual)}</b></div>
        <div class="line-row"><span>Dana cair Shopee</span><b>${o.paid ? rp(o.harga_selesai) : 'belum'}</b></div>
        <div class="line-row"><span>Modal</span><b>${rp(o.order_items.reduce((a, i) => a + i.qty * i.unit_cost, 0))}</b></div></div>
        <div class="card" style="background:var(--paper)"><div class="line-row"><span>Dipacking</span><b>${o.packed_at ? fmtDateTime(o.packed_at) : '–'}</b></div>
        ${o.pack_override ? `<div class="alert yellow small">Dipaksa lanjut: ${esc(o.pack_override)}</div>` : ''}
        ${photo ? `<img src="${photo}" alt="Foto paket" style="border-radius:8px;margin-top:8px;max-height:180px;object-fit:cover">` : ''}</div></div>
    </div>`,
    actions: canCancel ? [{ label: 'Tutup', value: null }, { label: 'Batalkan pesanan', cls: 'btn-danger', value: 'cancel' }] : [{ label: 'Tutup', value: null }]
  });
  if (r === 'cancel' && await confirmBox('Batalkan pesanan?', 'Kalau barang sudah diambil dari rak, kepala gudang akan mendapat tugas mengembalikannya.', 'Ya, batalkan', true)) {
    try { await rpc('import_cancels', { p: { filename: 'manual', rows: [{ order_no: o.order_no, reason: 'Dibatalkan manual' }] } }); toast('Pesanan dibatalkan', 'ok'); after && after(); }
    catch (e) { toastErr(e); }
  }
}
