import { supa, rpc } from '../supa.js';
import { store } from '../store.js';
import { esc, rp, num, fmtDateTime, chips, on, modal, toast, toastErr, pageHead, emptyState, skeleton, icon, photoUrl, confirmBox, parseNum } from '../ui.js';
import { listEditor } from '../daftar-file.js';

const PO_ST = { draft: ['Draft', ''], ditugaskan: ['Ditugaskan', 'yellow'], berangkat: ['Sopir berangkat', 'yellow'], diambil: ['Sudah diambil', 'blue'], sampai: ['Sampai gudang', 'blue'], selesai: ['Selesai', 'green'], batal: ['Batal', 'red'] };
export const poTag = (s) => `<span class="tag ${PO_ST[s]?.[1] || ''}">${PO_ST[s]?.[0] || s}</span>`;

export default {
  tour: [
    { sel: '[data-chips="tab"]', title: 'Perlu dibeli & daftar PO', body: '“Perlu dibeli” berisi barang pesanan yang stoknya kurang. “Daftar PO” berisi pembelian yang sudah dibuat.' },
    { sel: '#need', title: 'Pilih barang', body: 'Centang barang, ubah jumlah (bisa ditambah stok cadangan) dan harga beli. Harga di atas harga master akan dilaporkan ke owner.' },
    { sel: '#poform', title: 'Tugaskan sopir', body: 'Isi no. order di aplikasi WIN, pilih sopir, lalu simpan. Sopir langsung dapat notifikasi.' }
  ],
  async render(el, { params }) {
    const kg = store.settings.alur_kg !== false;
    let tab = params.tab || (kg ? 'file' : 'need');
    el.innerHTML = `${pageHead('Beli di WIN')}
      <div class="stack">${chips('tab', [...(kg ? [['file', 'Daftar dari WIN']] : []), ['need', 'Perlu dibeli'], ['po', 'Daftar PO']], tab)}<div id="body"></div></div>`;
    const toPO = () => { tab = 'po'; el.querySelectorAll('[data-chips="tab"] .chip').forEach((c) => c.classList.toggle('on', c.dataset.v === 'po')); show(); };
    on(el, 'click', '[data-chips="tab"] .chip', (e, b) => { tab = b.dataset.v; b.parentElement.querySelectorAll('.chip').forEach((c) => c.classList.toggle('on', c === b)); show(); });
    const show = () => { const b = el.querySelector('#body'); tab === 'file' ? renderFile(b, toPO) : tab === 'need' ? renderNeed(b, toPO) : renderPOs(b); };
    show();
  }
};

// 2.33: kepala gudang memesan di aplikasi WIN, lalu upload screenshot / PDF / Excel daftarnya di sini.
// Barang dicocokkan dengan master barang; saat sopir sampai & di-scan, barang masuk meja kepala gudang.
async function renderFile(box, afterCreate) {
  const { data: drivers } = await supa.from('profiles').select('id, full_name').eq('role', 'sopir').eq('active', true);
  box.innerHTML = `<div class="stack">
    <section class="card stack"><h2 class="sec-title">Barang yang dipesan di WIN</h2><div id="le"></div></section>
    <section class="card stack" id="poform"><div class="grid gauto">
        <label class="field">No. order di aplikasi WIN<input class="input mono" id="win" placeholder="mis. WIN-88213450"></label>
        <label class="field">Tugaskan sopir<select class="input" id="drv"><option value="">— pilih nanti —</option>${(drivers || []).map((d) => `<option value="${d.id}">${esc(d.full_name)}</option>`).join('')}</select></label>
        <label class="field">Catatan<input class="input" id="note" placeholder="opsional"></label></div>
      <button class="btn btn-primary btn-lg" id="mk" disabled>Simpan & kirim tugas ke sopir</button></section></div>`;
  const le = listEditor(box.querySelector('#le'), { price: true, emptyText: 'Upload screenshot / PDF / Excel pesanan dari aplikasi WIN, atau cari manual.', onChange: (st) => { box.querySelector('#mk').disabled = !st.rows.length; } });
  box.querySelector('#mk').onclick = async (e) => {
    const rows = le.state.rows;
    const over = rows.filter((r) => Number(r.p.harga_beli) > 0 && r.price > Number(r.p.harga_beli));
    if (over.length && !(await confirmBox('Harga beli di atas harga master', `${over.length} barang harganya lebih tinggi dari harga master. Ini akan dilaporkan ke owner. Lanjut?`))) return;
    e.target.disabled = true;
    try {
      await rpc('create_po', { p: { to_meja: true, source_file: le.state.file || null, win_order_no: box.querySelector('#win').value.trim(), driver_id: box.querySelector('#drv').value || null, note: box.querySelector('#note').value.trim(),
        items: rows.map((r) => ({ product_id: r.p.id, qty: r.qty, unit_cost: r.price || Number(r.p.harga_beli) || 0 })) } });
      toast('Daftar beli tersimpan' + (box.querySelector('#drv').value ? ' & tugas dikirim ke sopir' : ''), 'ok');
      afterCreate();
    } catch (err) { toastErr(err); e.target.disabled = false; }
  };
}

async function renderNeed(box, afterCreate) {
  box.innerHTML = skeleton(3);
  const { data, error } = await supa.from('order_items')
    .select('id, qty, ready_qty, rack_qty, product_id, sku, name, orders!inner(order_no, resi, status, entry), products(id, name, sku, harga_beli, stock, rack_code)')
    .eq('source', 'win').is('po_id', null).in('orders.status', ['baru', 'menunggu_win', 'siap_pick']);
  if (error) return toastErr(error);
  // pesanan hasil scan resi: SEMUA barang dibeli (yang sudah diambil dari rak akan mengisi ulang rak)
  const needOf = (r) => (r.orders.entry === 'scan' ? r.qty : r.qty - r.ready_qty);
  const rows = data.filter((r) => needOf(r) > 0);
  const unknown = rows.filter((r) => !r.product_id);
  const groups = {};
  rows.filter((r) => r.product_id).forEach((r) => {
    const g = groups[r.product_id] ||= { p: r.products, need: 0, ids: [], orders: [] };
    g.need += needOf(r); g.ids.push(r.id); g.orders.push(r.orders.resi || r.orders.order_no); g.rack = (g.rack || 0) + (r.orders.entry === 'scan' ? r.rack_qty : 0);
  });
  const list = Object.values(groups);
  const { data: drivers } = await supa.from('profiles').select('id, full_name').eq('role', 'sopir').eq('active', true);
  if (!list.length && !unknown.length) { box.innerHTML = `<div class="card">${emptyState('Tidak ada barang yang perlu dibeli. Semua pesanan bisa dipenuhi dari gudang.', 'truck')}</div>`; return; }
  box.innerHTML = `<div class="stack">
    ${unknown.length ? `<div class="alert yellow"><b>${unknown.length} baris pesanan memakai kode yang belum ada di master barang</b>, jadi modalnya belum tercatat:
      <div class="mono xs" style="margin-top:6px">${[...new Set(unknown.map((u) => (u.sku || '') + ' — ' + u.name))].slice(0, 10).map(esc).join('<br>')}</div>
      <a class="btn btn-sm" style="margin-top:8px" href="#/barang">Tambah di master barang</a></div>` : ''}
    <input class="input need-q" id="nq" placeholder="Cari nama / kode barang" aria-label="Cari barang" autocomplete="off">
    <div class="card flush" id="need"><div class="table-wrap"><table class="tbl" style="min-width:720px"><thead><tr><th></th><th>Barang</th><th class="right">Butuh</th><th class="right">Beli</th><th class="right">Harga beli / pcs</th><th class="right">Subtotal</th></tr></thead><tbody>
      ${list.map((g, i) => `<tr data-row="${i}" data-q="${esc((g.p.name + ' ' + g.p.sku).toLowerCase())}"><td><input type="checkbox" class="check" data-ck checked aria-label="Pilih"></td>
        <td><b>${esc(g.p.name)}</b><div class="xs muted mono">${esc(g.p.sku)} · stok ${g.p.stock} · untuk ${g.orders.length} pesanan${g.rack ? ` · ${g.rack} sudah diambil dari rak (beli untuk isi ulang)` : ''}</div></td>
        <td class="num">${g.need}</td><td class="right"><input class="input sm num" style="width:80px" data-qty value="${g.need}" inputmode="numeric"></td>
        <td class="right"><input class="input sm num" style="width:110px" data-cost data-money value="${num(g.p.harga_beli)}" inputmode="numeric"></td><td class="num" data-sub></td></tr>`).join('')}
      </tbody><tfoot><tr><td></td><td colspan="3">Total modal</td><td></td><td class="num" id="tot"></td></tr></tfoot></table></div></div>
    <div class="card stack" id="poform">
      <div class="grid gauto">
        <label class="field">No. order di aplikasi WIN<input class="input mono" id="win" placeholder="mis. WIN-88213450"></label>
        <label class="field">Tugaskan sopir<select class="input" id="drv"><option value="">— pilih nanti —</option>${(drivers || []).map((d) => `<option value="${d.id}">${esc(d.full_name)}</option>`).join('')}</select></label>
        <label class="field">Catatan<input class="input" id="note" placeholder="opsional"></label>
      </div>
      <button class="btn btn-primary btn-lg" id="mk">Simpan & kirim tugas ke sopir</button>
    </div></div>`;
  // cari nama / kode di daftar "Perlu dibeli" (barang yang disembunyikan tetap ikut kalau dicentang)
  box.querySelector('#nq')?.addEventListener('input', (e) => {
    const q = e.target.value.trim().toLowerCase();
    box.querySelectorAll('#need [data-row]').forEach((tr) => { tr.style.display = !q || tr.dataset.q.includes(q) ? '' : 'none'; });
  });
  const recalc = () => {
    let tot = 0;
    box.querySelectorAll('[data-row]').forEach((tr) => {
      const sub = (+tr.querySelector('[data-qty]').value || 0) * (parseNum(tr.querySelector('[data-cost]').value) || 0);
      tr.querySelector('[data-sub]').textContent = rp(sub);
      tr.style.opacity = tr.querySelector('[data-ck]').checked ? 1 : 0.45;
      if (tr.querySelector('[data-ck]').checked) tot += sub;
    });
    box.querySelector('#tot').textContent = rp(tot);
  };
  box.addEventListener('input', recalc); box.addEventListener('change', recalc); recalc();
  box.querySelector('#mk').onclick = async (e) => {
    const items = [];
    box.querySelectorAll('[data-row]').forEach((tr) => {
      if (!tr.querySelector('[data-ck]').checked) return;
      const g = list[+tr.dataset.row];
      items.push({ product_id: g.p.id, qty: Math.max(1, +tr.querySelector('[data-qty]').value || g.need), unit_cost: parseNum(tr.querySelector('[data-cost]').value) || g.p.harga_beli, order_item_ids: g.ids });
    });
    if (!items.length) return toast('Pilih minimal 1 barang', 'err');
    const over = items.filter((it) => { const g = list.find((x) => x.p.id === it.product_id); return it.unit_cost > g.p.harga_beli; });
    if (over.length && !(await confirmBox('Harga beli di atas harga master', `${over.length} barang diisi harga beli lebih tinggi dari harga master. Ini akan dilaporkan ke owner. Lanjut?`))) return;
    e.target.disabled = true;
    try {
      await rpc('create_po', { p: { win_order_no: box.querySelector('#win').value.trim(), driver_id: box.querySelector('#drv').value || null, note: box.querySelector('#note').value.trim(), items } });
      toast('Daftar beli tersimpan' + (box.querySelector('#drv').value ? ' & tugas dikirim ke sopir' : ''), 'ok');
      afterCreate();
    } catch (err) { toastErr(err); e.target.disabled = false; }
  };
}

async function renderPOs(box) {
  box.innerHTML = skeleton(3);
  const { data, error } = await supa.from('purchase_orders').select('*, po_items(qty, received_qty, unit_cost)').order('created_at', { ascending: false }).limit(60);
  if (error) return toastErr(error);
  if (!data.length) { box.innerHTML = `<div class="card">${emptyState('Belum ada PO.', 'truck')}</div>`; return; }
  box.innerHTML = `<div class="card flush"><div class="list">${data.map((p) => {
    const q = p.po_items.reduce((a, i) => a + i.qty, 0), rcv = p.po_items.reduce((a, i) => a + i.received_qty, 0), cost = p.po_items.reduce((a, i) => a + i.qty * i.unit_cost, 0);
    return `<button class="list-item" data-po="${p.id}"><div class="grow"><div class="row wrap"><b class="mono">${esc(p.code)}</b>${poTag(p.status)}</div>
      <div class="small muted">${q} item · ${rp(cost)} · sopir ${esc(store.profilesById[p.driver_id]?.full_name || '–')} · ${fmtDateTime(p.created_at)}${p.status === 'selesai' && rcv < q ? ` · <span class="neg">kurang ${q - rcv}</span>` : ''}</div></div>${icon('chev', 18)}</button>`;
  }).join('')}</div></div>`;
  on(box, 'click', '[data-po]', (e, b) => openPO(+b.dataset.po, () => renderPOs(box)));
}

export async function openPO(id, after) {
  const { data: p, error } = await supa.from('purchase_orders').select('*, po_items(*, products(name, sku, rack_code))').eq('id', id).single();
  if (error) return toastErr(error);
  const { data: drivers } = await supa.from('profiles').select('id, full_name').eq('role', 'sopir').eq('active', true);
  const nota = p.nota_photo ? await photoUrl(p.nota_photo) : null;
  const canEdit = ['owner', 'kepala_gudang', 'supervisor'].includes(store.role) && ['draft', 'ditugaskan'].includes(p.status);
  const r = await modal({
    title: p.code, wide: true,
    body: `<div class="stack"><div class="row wrap">${poTag(p.status)}${p.to_meja ? '<span class="tag blue">ke meja kepala gudang</span>' : ''}<span class="small muted">No. order WIN <b class="mono">${esc(p.win_order_no || '–')}</b>${p.source_file ? ' · dari ' + esc(p.source_file) : ''}</span></div>
      <div class="table-wrap card flush" style="border:1px solid var(--line)"><table class="tbl po-tbl"><colgroup><col class="c-name"><col><col><col><col class="c-rp"></colgroup><thead><tr><th>Barang</th><th class="right">Beli</th><th class="right">Terima</th><th class="right" title="Untuk pesanan">Pesanan</th><th class="right">Harga</th></tr></thead><tbody>
      ${p.po_items.map((i) => `<tr class="${p.status === 'selesai' && i.received_qty < i.qty ? 'bad' : ''}"><td>${esc(i.products.name)}<div class="xs muted mono">${esc(i.products.sku)}</div></td><td class="num">${i.qty}</td><td class="num">${i.received_qty}</td><td class="num">${i.for_orders}</td><td class="num">${rp(i.unit_cost)}</td></tr>`).join('')}
      </tbody></table></div>
      <div class="small muted">Dibuat ${fmtDateTime(p.created_at)} oleh ${esc(store.profilesById[p.created_by]?.full_name || '–')} · Berangkat ${fmtDateTime(p.departed_at)} · Diambil ${fmtDateTime(p.picked_at)} · Sampai ${fmtDateTime(p.arrived_at)} · Selesai ${fmtDateTime(p.finished_at)}</div>
      ${nota ? `<img src="${nota}" alt="Foto nota WIN" style="border-radius:8px;max-height:220px;object-fit:contain;background:var(--paper)">` : ''}
      ${canEdit ? `<label class="field">Sopir<select class="input" id="drv"><option value="">— pilih —</option>${(drivers || []).map((d) => `<option value="${d.id}" ${d.id === p.driver_id ? 'selected' : ''}>${esc(d.full_name)}</option>`).join('')}</select></label>` : ''}</div>`,
    actions: canEdit ? [{ label: 'Batalkan PO', cls: 'btn-danger', value: 'batal' }, { label: 'Tutup', value: null }, { label: 'Simpan sopir', cls: 'btn-primary', onClick: async (ov) => {
      const d = ov.querySelector('#drv').value; if (!d) { toast('Pilih sopir', 'err'); return false; }
      await rpc('assign_po', { p_po: id, p_driver: d }); toast('Tugas dikirim ke sopir', 'ok'); return 'ok';
    } }] : [{ label: 'Tutup', value: null }]
  });
  if (r === 'batal' && await confirmBox('Batalkan PO?', 'Barang pesanan di PO ini akan kembali ke daftar “Perlu dibeli”.', 'Batalkan PO', true)) {
    try { await rpc('po_cancel', { p_po: id }); toast('PO dibatalkan', 'ok'); } catch (err) { return toastErr(err); }
  }
  after && after();
}
