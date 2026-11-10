import { supa, rpc } from '../supa.js';
import { store } from '../store.js';
import { esc, on, toast, toastErr, emptyState, skeleton, beep, modal, icon, fmtDateTime, confirmBox } from '../ui.js';
import { scanBox, bindScan } from '../scanner.js';

export default {
  tour: [
    { sel: '#scan', title: 'Scan barang yang diambil', body: 'Ambil barang dari rak, lalu scan barcodenya. Jumlah di daftar otomatis berkurang.' },
    { sel: '#list', title: 'Urut per rak', body: 'Daftar diurutkan per rak supaya cukup jalan satu putaran.' },
    { sel: '[data-missing]', title: 'Barang tidak ada?', body: 'Tekan “Tidak ada”. Barang otomatis dipindah ke daftar beli WIN, dan admin & kepala gudang mendapat notifikasi.' }
  ],
  async render(el, { params = {} } = {}) {
    if (params.t) return taskView(el, +params.t);
    // 2.33: tugas ambil dari kepala gudang
    const { data: tasks } = await supa.from('pick_tasks').select('*, pick_task_items(qty, picked_qty, missing_qty)').eq('status', 'baru').order('created_at');
    const mine = (tasks || []).filter((t) => !t.picker_id || t.picker_id === store.profile?.id || store.role !== 'picker');
    el.innerHTML = `<div class="stack">
      ${mine.length ? `<div class="card flush" id="tasks"><div class="card-h"><h2>Tugas dari kepala gudang</h2></div><div class="list no-page">${mine.map((t) => {
        const q = t.pick_task_items.reduce((a, i) => a + i.qty, 0), d = t.pick_task_items.reduce((a, i) => a + i.picked_qty + i.missing_qty, 0);
        return `<a class="list-item" href="#/ambil?t=${t.id}"><div class="grow"><b class="mono">${esc(t.code)}</b><div class="small muted">${d}/${q} pcs · ${t.pick_task_items.length} macam · ${fmtDateTime(t.created_at)}${t.note ? ' · ' + esc(t.note) : ''}</div></div><span class="btn btn-sm btn-primary">${icon('scan', 16)} Ambil</span></a>`; }).join('')}</div></div>` : ''}
      <div id="olds" class="stack">
      <div class="hero"><div class="label">Daftar ambil dari rak</div><div class="big" id="total">…</div><div class="small" style="color:#C9CCC8">barang belum diambil</div></div>
      <div class="card stack" id="scan">${scanBox('sb', 'Scan barcode barang yang diambil')}<div id="last" aria-live="polite"></div></div>
      <div id="list">${skeleton(4)}</div></div></div>`;
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
      if (!groups.length) {
        if (mine.length) { el.querySelector('#olds').classList.add('hidden'); return; }
        el.querySelector('#list').innerHTML = `<div class="card">${emptyState('Tidak ada barang yang perlu diambil. Tunggu tugas dari kepala gudang.', 'check')}</div>`; return;
      }
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

// 2.33: picker mengerjakan tugas dari kepala gudang -> scan setiap barang yang diambil, lalu serahkan
async function taskView(el, id) {
  const load = async () => (await supa.from('pick_tasks').select('*, pick_task_items(*, products(name, sku, rack_code, stock))').eq('id', id).single());
  let { data: t, error } = await load();
  if (error) return toastErr(error);
  const open = t.status === 'baru';
  el.innerHTML = `<div class="stack">
    <div class="row between wrap"><a href="#/ambil" class="btn btn-ghost btn-sm">${icon('back', 16)} Kembali</a><b class="mono">${esc(t.code)}</b></div>
    ${open ? `<div class="card stack" id="scan">${scanBox('sb', 'Scan barcode barang yang diambil')}<div id="last" aria-live="polite"></div></div>` : `<div class="alert green">Tugas ini sudah diserahkan ke kepala gudang.</div>`}
    <div id="items"></div>
    ${open ? `<button class="btn btn-primary btn-lg" id="hand">${icon('check', 18)} Selesai, serahkan ke kepala gudang</button>` : ''}</div>`;
  const paint = () => {
    const rows = [...t.pick_task_items].sort((a, b) => String(a.products.rack_code || 'zzz').localeCompare(String(b.products.rack_code || 'zzz'), 'id', { numeric: true }));
    const q = rows.reduce((a, i) => a + i.qty, 0), d = rows.reduce((a, i) => a + i.picked_qty, 0);
    el.querySelector('#items').innerHTML = `<div class="hero"><div class="label">Sudah diambil</div><div class="big">${d} <span style="font-size:18px;opacity:.7">/ ${q}</span></div></div>
      <div class="stack s8" style="margin-top:10px">${rows.map((i) => {
        const left = i.qty - i.picked_qty - i.missing_qty;
        return `<div class="pick-row ${left <= 0 ? 'done' : ''}"><span class="rack">${esc(i.products.rack_code || '?')}</span>
          <div class="grow"><b>${esc(i.products.name)}</b><div class="xs muted">Ambil <b style="color:var(--ink);font-size:14px">${i.qty}</b> · sudah ${i.picked_qty}${i.missing_qty ? ` · <span class="neg">tidak ada ${i.missing_qty}</span>` : ''} · stok sistem ${i.products.stock}</div></div>
          ${open && left > 0 ? `<button class="btn btn-sm btn-danger" data-miss="${i.id}">Tidak ada</button>` : left <= 0 ? icon('check', 20) : ''}</div>`; }).join('')}</div>`;
  };
  paint();
  if (!open) return;
  bindScan(el, 'sb', async (code) => {
    try {
      const r = await rpc('pick_task_scan', { p_task: id, p_code: code });
      const last = el.querySelector('#last');
      if (!r.ok) { beep(false); last.innerHTML = `<div class="alert red">${esc(r.msg)}</div>`; return { ok: false, title: r.msg }; }
      beep(true); last.innerHTML = `<div class="alert green"><b>${esc(r.name)}</b> ${r.picked}/${r.qty} · rak ${esc(r.rack || '-')}</div>`;
      ({ data: t } = await load()); paint();
      return { ok: true, title: r.name, info: `${r.picked}/${r.qty} · rak ${r.rack || '-'}` };
    } catch (e) { toastErr(e); return false; }
  });
  on(el, 'click', '[data-miss]', async (e, b) => {
    const it = t.pick_task_items.find((x) => x.id === +b.dataset.miss);
    const note = await modal({ title: 'Barang tidak ada di rak', body: `<p style="margin-top:0"><b>${esc(it.products.name)}</b> di rak ${esc(it.products.rack_code || '-')}. Kurang ${it.qty - it.picked_qty - it.missing_qty} pcs.</p>
      <p class="small muted">Scan dulu yang ada. Sisanya dilaporkan ke kepala gudang untuk dibeli di WIN.</p><label class="field">Keterangan (opsional)<input class="input" id="mn" placeholder="mis. rak kosong"></label>`,
      actions: [{ label: 'Batal', value: null }, { label: 'Laporkan', cls: 'btn-dark', onClick: (ov) => ov.querySelector('#mn').value.trim() || '-' }] });
    if (!note) return;
    try { await rpc('pick_task_missing', { p_item: it.id, p_note: note }); ({ data: t } = await load()); paint(); toast('Dilaporkan ke kepala gudang', 'ok'); } catch (err) { toastErr(err); }
  });
  el.querySelector('#hand').onclick = async () => {
    const left = t.pick_task_items.reduce((a, i) => a + i.qty - i.picked_qty - i.missing_qty, 0);
    if (left && !(await confirmBox('Masih ada ' + left + ' pcs', 'Barang yang belum di-scan dianggap tidak ada di rak dan dilaporkan ke kepala gudang.', 'Serahkan'))) return;
    try { await rpc('pick_task_handover', { p_task: id }); toast('Diserahkan. Bawa barangnya ke kepala gudang.', 'ok'); location.hash = '#/ambil'; } catch (e) { toastErr(e); }
  };
}
