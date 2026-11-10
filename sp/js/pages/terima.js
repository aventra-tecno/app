import { supa, rpc } from '../supa.js';
import { store } from '../store.js';
import { esc, on, toast, toastErr, emptyState, skeleton, icon, beep, confirmBox, fmtDateTime } from '../ui.js';
import { scanBox, bindScan } from '../scanner.js';
import { poTag } from './beli.js';

export default {
  tour: [
    { sel: '#scan', title: 'Scan barang datang', body: 'Scan barcode setiap barang (scanner gun atau kamera). Sistem langsung bilang: ke meja packing atau ke rak mana.' },
    { sel: '#items', title: 'Cek jumlah', body: 'Baris merah = belum lengkap. Kalau memang kurang, tekan Selesai — sistem mencatat kekurangannya.' }
  ],
  async render(el, { params }) {
    if (params.po) return scanPO(el, +params.po);
    el.innerHTML = skeleton(3);
    const { data, error } = await supa.from('purchase_orders').select('*, po_items(qty)').in('status', ['ditugaskan', 'berangkat', 'diambil', 'sampai']).order('created_at');
    if (error) return toastErr(error);
    el.innerHTML = `<div class="stack"><h2 class="sec-title">Barang WIN yang akan / sudah datang</h2>
      ${data.length ? `<div class="card flush"><div class="list">${data.map((p) => `<a class="list-item" href="#/terima?po=${p.id}"><div class="grow"><div class="row wrap"><b class="mono">${esc(p.code)}</b>${poTag(p.status)}</div>
        <div class="small muted">${p.po_items.reduce((a, i) => a + i.qty, 0)} item · sopir ${esc(store.profilesById[p.driver_id]?.full_name || '–')}${p.arrived_at ? ' · sampai ' + fmtDateTime(p.arrived_at) : ''}</div></div>
        <span class="btn btn-sm ${p.status === 'sampai' ? 'btn-primary' : ''}">${icon('scan', 16)} Scan</span></a>`).join('')}</div></div>` : `<div class="card">${emptyState('Tidak ada barang WIN yang ditunggu.', 'truck')}</div>`}
      <div class="alert blue small">Barang retur & cancel di-scan di menu <a href="#/retur">Retur</a>.</div></div>`;
  }
};

async function scanPO(el, id) {
  const load = async () => (await supa.from('purchase_orders').select('*, po_items(*, products(name, sku, rack_code))').eq('id', id).single());
  let { data: p, error } = await load();
  if (error) return toastErr(error);
  el.innerHTML = `<div class="stack">
    <div class="row between wrap"><a href="#/terima" class="btn btn-ghost btn-sm">${icon('back', 16)} Kembali</a><div class="row"><b class="mono">${esc(p.code)}</b>${poTag(p.status)}</div></div>
    <div class="card stack" id="scan">${scanBox('sb', 'Scan barcode barang')}<div id="last" aria-live="polite"></div></div>
    <div class="card stack" id="items"></div>
    <div class="row"><button class="btn btn-danger grow" id="short">Lapor kurang & selesai</button><button class="btn btn-primary btn-lg grow" id="done">Selesai terima</button></div>
  </div>`;
  const paint = () => {
    const q = p.po_items.reduce((a, i) => a + i.qty, 0), r = p.po_items.reduce((a, i) => a + i.received_qty, 0);
    el.querySelector('#items').innerHTML = `<div class="row between"><b>Sudah di-scan</b><span style="font-size:20px;font-weight:700">${r} <span class="small muted">/ ${q} item</span></span></div>
      <div class="progress"><div style="width:${q ? (r / q) * 100 : 0}%"></div></div>
      ${p.po_items.map((i) => {
        const full = i.received_qty >= i.qty;
        const toPack = p.to_meja ? 0 : Math.min(i.received_qty, i.for_orders), toRack = p.to_meja ? 0 : Math.max(0, i.received_qty - i.for_orders), toMeja = p.to_meja ? i.received_qty : 0;
        return `<div class="row" style="padding:10px 0;border-top:1px solid var(--line)"><div class="grow"><b>${esc(i.products.name)}</b> <span class="small">${i.received_qty}/${i.qty}</span><div class="xs muted mono">${esc(i.products.sku)}</div></div>
          <div class="stack s8" style="align-items:flex-end">${toMeja ? `<span class="tag green">${toMeja} → Meja</span>` : ''}${toPack ? `<span class="tag blue">${toPack} → Packing</span>` : ''}${toRack ? `<span class="tag">${toRack} → Rak ${esc(i.products.rack_code || '?')}</span>` : ''}${!full ? `<span class="tag red">Kurang ${i.qty - i.received_qty}</span>` : ''}</div></div>`;
      }).join('')}`;
  };
  paint();
  bindScan(el, 'sb', async (code) => {
    try {
      const r = await rpc('receive_scan', { p_po: id, p_sku: code });
      const last = el.querySelector('#last');
      if (!r.ok) { beep(false); last.innerHTML = `<div class="alert red">${esc(r.msg)}</div>`; return { ok: false, title: r.msg }; }
      beep(true);
      const dest = r.dest === 'packing' ? 'Meja packing' : r.dest === 'meja' ? 'Meja kepala gudang' : r.dest;
      last.innerHTML = `<div class="alert ${r.dest === 'packing' ? 'blue' : 'green'}"><b>${esc(r.name)}</b> ${r.received}/${r.qty} → <b>${esc(dest)}</b></div>`;
      ({ data: p } = await load()); paint();
      return { ok: true, title: r.name, info: `${r.received}/${r.qty} → ${dest}` };
    } catch (e) { toastErr(e); return false; }
  });
  const finish = async (short) => {
    const q = p.po_items.reduce((a, i) => a + i.qty, 0), r = p.po_items.reduce((a, i) => a + i.received_qty, 0);
    if (r < q && !(await confirmBox('Barang kurang ' + (q - r), 'Kekurangan dicatat dan dilaporkan ke owner. Beli lagi di WIN untuk barang yang kurang.', 'Selesai dengan kekurangan'))) return;
    if (r === 0 && !short) return toast('Belum ada barang yang di-scan', 'err');
    try {
      const res = await rpc('finish_receive', { p_po: id });
      toast(`Selesai: ${res.ke_meja ? res.ke_meja + ' barang ke meja, ' : ''}${res.siap ? res.siap + ' pesanan siap packing, ' : ''}${res.ke_packing} barang ke packing, ${res.ke_rak} ke rak${res.kurang ? ', kurang ' + res.kurang : ''}${res.cancel ? ' · ' + res.cancel + ' pesanan CANCEL (WIN kosong)' : ''}`, res.cancel ? 'err' : 'ok');
      location.hash = '#/terima';
    } catch (e) { toastErr(e); }
  };
  el.querySelector('#done').onclick = () => finish(false);
  el.querySelector('#short').onclick = () => finish(true);
}
