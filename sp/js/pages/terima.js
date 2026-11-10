import { supa, rpc } from '../supa.js';
import { store } from '../store.js';
import { esc, on, toast, toastErr, emptyState, skeleton, icon, beep, confirmBox, fmtDateTime, chips, todayStr, addDays, copyBtn, rp } from '../ui.js';
import { scanBox, bindScan } from '../scanner.js';
import { poTag } from './beli.js';

export default {
  tour: [
    { sel: '#direct', title: 'Barang WIN datang', body: 'Barang yang dibeli langsung di WIN: tekan Mulai scan, scan semua barangnya, lalu Selesai. Barang masuk stok gudang (belum di rak) dan siap dipakai admin.' },
    { sel: '#scan', title: 'Scan barang datang', body: 'Scan barcode setiap barang (scanner gun atau kamera). Sistem langsung bilang: ke meja packing atau ke rak mana.' },
    { sel: '#items', title: 'Cek jumlah', body: 'Baris merah = belum lengkap. Kalau memang kurang, tekan Selesai — sistem mencatat kekurangannya.' }
  ],
  async render(el, { params }) {
    if (params.po) return scanPO(el, +params.po);
    el.innerHTML = skeleton(3);
    const { data: all, error } = await supa.from('purchase_orders').select('*, po_items(qty, received_qty)').in('status', ['ditugaskan', 'berangkat', 'diambil', 'sampai']).order('created_at');
    if (error) return toastErr(error);
    const canDirect = ['owner', 'kepala_gudang', 'supervisor'].includes(store.role);
    const open = all.find((p) => p.direct);
    const data = all.filter((p) => !p.direct);
    el.innerHTML = `<div class="stack">
      ${canDirect ? `<section class="card stack direct-card" id="direct"><div><h2 class="sec-title" style="margin:0">Barang WIN datang</h2>
          <div class="small muted">Scan semua barang yang dibeli di WIN. Langsung masuk stok gudang (belum di rak), siap dipakai admin.</div></div>
        ${open ? `<a class="btn btn-primary btn-lg" href="#/terima?po=${open.id}">${icon('scan', 20)} Lanjutkan scan · ${open.po_items.reduce((a, i) => a + i.received_qty, 0)} barang</a>`
          : `<button class="btn btn-primary btn-lg" id="start">${icon('scan', 20)} Mulai scan barang WIN</button>`}
        </section>
      <section class="card stack" id="lap"><div class="row between wrap"><h2 class="sec-title" style="margin:0">Laporan barang WIN</h2><button class="btn btn-sm" id="xls">${icon('download', 16)} Unduh Excel</button></div>
        ${chips('d', [['today', 'Hari ini'], ['yday', 'Kemarin'], ['pick', 'Pilih tanggal']], 'today')}
        <div class="grid g2 hidden" id="range"><label class="field">Dari<input type="date" class="input" id="d1" value="${todayStr()}"></label><label class="field">Sampai<input type="date" class="input" id="d2" value="${todayStr()}"></label></div>
        <div id="laplist">${skeleton(2)}</div></section>` : ''}
      ${data.length || !canDirect ? `<h2 class="sec-title">Barang WIN dari daftar beli</h2>` : ''}
      ${data.length ? `<div class="card flush"><div class="list">${data.map((p) => `<a class="list-item" href="#/terima?po=${p.id}"><div class="grow"><div class="row wrap"><b class="mono">${esc(p.code)}</b>${poTag(p.status)}</div>
        <div class="small muted">${p.po_items.reduce((a, i) => a + i.qty, 0)} item · sopir ${esc(store.profilesById[p.driver_id]?.full_name || '–')}${p.arrived_at ? ' · sampai ' + fmtDateTime(p.arrived_at) : ''}</div></div>
        <span class="btn btn-sm ${p.status === 'sampai' ? 'btn-primary' : ''}">${icon('scan', 16)} Scan</span></a>`).join('')}</div></div>` : canDirect ? '' : `<div class="card">${emptyState('Tidak ada barang WIN yang ditunggu.', 'truck')}</div>`}
      <div class="alert blue small">Barang retur & cancel di-scan di menu <a href="#/retur">Retur</a>.</div></div>`;
    if (canDirect) report(el);
    el.querySelector('#start')?.addEventListener('click', async (e) => {
      e.target.disabled = true;
      try { const id = await rpc('win_direct_start'); location.hash = '#/terima?po=' + id; } catch (err) { toastErr(err); e.target.disabled = false; }
    });
  }
};

async function scanPO(el, id) {
  const load = async () => (await supa.from('purchase_orders').select('*, po_items(*, products(name, sku, rack_code))').eq('id', id).single());
  let { data: p, error } = await load();
  if (error) return toastErr(error);
  if (p.direct) return scanDirect(el, id, p, load);
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

// 2.34: barang dibeli langsung di WIN (tanpa daftar) -> scan semua -> masuk stok gudang (belum di rak)
async function scanDirect(el, id, p, load) {
  const open = p.status === 'sampai';
  el.innerHTML = `<div class="stack">
    <div class="row between wrap"><a href="#/terima" class="btn btn-ghost btn-sm">${icon('back', 16)} Kembali</a><div class="row"><b class="mono">${esc(p.code)}</b>${open ? '<span class="tag yellow">Sedang di-scan</span>' : poTag(p.status)}</div></div>
    ${open ? `<div class="card stack" id="scan">${scanBox('sb', 'Scan barang WIN yang datang')}<div id="last" aria-live="polite"></div></div>` : ''}
    <div class="card stack" id="items"></div>
    ${open ? `<div class="row"><button class="btn btn-danger grow" id="cancel">Batalkan</button><button class="btn btn-primary btn-lg grow" id="done">${icon('check', 18)} Selesai terima</button></div>` : ''}
  </div>`;
  const paint = () => {
    const items = [...p.po_items].sort((a, b) => b.id - a.id);
    const t = items.reduce((a, i) => a + i.received_qty, 0);
    el.querySelector('#items').innerHTML = `<div class="row between"><b>${open ? 'Sudah di-scan' : 'Diterima'}</b><span style="font-size:22px;font-weight:700">${t} <span class="small muted">barang · ${items.length} macam</span></span></div>
      ${items.length ? items.map((i) => `<div class="row" style="padding:10px 0;border-top:1px solid var(--line)"><div class="grow" style="min-width:0"><b>${esc(i.products.name)}</b><div class="xs muted mono">${esc(i.products.sku)}${i.products.rack_code ? ' · rak ' + esc(i.products.rack_code) : ''}</div></div>
        <b style="font-size:18px">${i.received_qty}</b>${open ? `<button class="btn btn-ghost btn-sm" data-undo="${i.id}" aria-label="Kurangi 1" style="color:var(--red)">−1</button>` : ''}</div>`).join('')
        : '<div class="small muted">Belum ada barang. Scan barang pertama.</div>'}`;
  };
  paint();
  if (!open) return;
  const reload = async () => { ({ data: p } = await load()); paint(); };
  bindScan(el, 'sb', async (code) => {
    try {
      const r = await rpc('win_direct_scan', { p_po: id, p_code: code });
      const last = el.querySelector('#last');
      if (!r.ok) { beep(false); last.innerHTML = `<div class="alert red">${esc(r.msg)}</div>`; return { ok: false, title: r.msg }; }
      beep(true); last.innerHTML = `<div class="alert green"><b>${esc(r.name)}</b> × ${r.qty} · total ${r.total} barang</div>`;
      await reload();
      return { ok: true, title: r.name, info: `× ${r.qty} · total ${r.total} barang` };
    } catch (e) { toastErr(e); return false; }
  });
  on(el, 'click', '[data-undo]', async (e, b) => { try { await rpc('win_direct_undo', { p_item: +b.dataset.undo }); await reload(); } catch (err) { toastErr(err); } });
  el.querySelector('#done').onclick = async () => {
    const t = p.po_items.reduce((a, i) => a + i.received_qty, 0);
    if (!t) return toast('Belum ada barang yang di-scan', 'err');
    if (!(await confirmBox('Selesai terima?', `${t} barang masuk stok gudang (belum di rak). Admin bisa langsung scan resinya di Catat pesanan.`, 'Selesai'))) return;
    try { const r = await rpc('finish_receive', { p_po: id }); toast(`${r.ke_meja} barang masuk stok gudang`, 'ok'); location.hash = '#/terima'; } catch (e) { toastErr(e); }
  };
  el.querySelector('#cancel').onclick = async () => {
    if (!(await confirmBox('Batalkan penerimaan ini?', 'Semua scan di daftar ini dihapus. Stok tidak berubah.', 'Batalkan', true))) return;
    try { await rpc('win_direct_cancel', { p_po: id }); toast('Dibatalkan', 'ok'); location.hash = '#/terima'; } catch (e) { toastErr(e); }
  };
}

// 2.35: laporan barang WIN diterima per tanggal (hari ini / kemarin / rentang), buka-tutup per nomor WIN, unduh Excel
function report(el) {
  let mode = 'today', last = { pos: [], dates: [] };
  const money = ['owner', 'admin'].includes(store.role);
  const range = () => {
    const t = todayStr();
    if (mode === 'today') return [t, t];
    if (mode === 'yday') return [addDays(t, -1), addDays(t, -1)];
    let a = el.querySelector('#d1').value || t, b = el.querySelector('#d2').value || a;
    if (a > b) [a, b] = [b, a];
    return [a, b];
  };
  const days = (a, b) => { const out = []; for (let d = a; d <= b && out.length < 62; d = addDays(d, 1)) out.push(d); return out; };
  const jkt = (ts) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date(ts));
  const load = async () => {
    const box = el.querySelector('#laplist'); box.innerHTML = skeleton(2);
    const [a, b] = range();
    const { data, error } = await supa.from('purchase_orders').select('id, code, direct, finished_at, created_at, win_order_no, po_items(received_qty, unit_cost, products(sku, name))')
      .eq('status', 'selesai').gte('finished_at', a + 'T00:00:00+07:00').lt('finished_at', addDays(b, 1) + 'T00:00:00+07:00').order('finished_at', { ascending: false });
    if (error) { box.innerHTML = `<div class="alert red small">${esc(error.message)}</div>`; return; }
    data.forEach((p) => { p.finished_at = p.finished_at || p.created_at || new Date().toISOString(); });
    const dates = days(a, b);
    last = { pos: data, dates, a, b };
    const tot = data.reduce((x, p) => x + p.po_items.reduce((y, i) => y + i.received_qty, 0), 0);
    box.innerHTML = data.length ? `<div class="small muted">${data.length} kiriman · <b>${tot}</b> barang${a === b ? '' : ` · ${dates.length} hari`}</div>
      <div class="win-rep">${data.map((p) => {
        const items = p.po_items.filter((i) => i.received_qty > 0).sort((x, y) => String(x.products?.name).localeCompare(String(y.products?.name)));
        const q = items.reduce((x, i) => x + i.received_qty, 0);
        return `<details class="win-po"><summary><span class="grow"><b class="mono">${esc(p.code)}</b>${p.direct ? '' : ' <span class="tag">daftar beli</span>'}<div class="xs muted">${a === b ? '' : jkt(p.finished_at).split('-').reverse().join('/') + ' · '}${new Date(p.finished_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' })} · ${items.length} macam</div></span>
          <b class="win-q">${q}</b>${icon('chev', 16)}</summary>
          <div class="list no-page">${items.map((i) => `<div class="list-item" style="padding:8px 0"><div class="grow" style="min-width:0"><span class="small">${esc(i.products?.name || '')}</span><div class="xs muted mono">${esc(i.products?.sku || '')}${copyBtn(i.products?.sku)}</div></div>${money ? `<span class="xs muted">${rp(i.unit_cost)}</span>` : ''}<b>${i.received_qty}</b></div>`).join('')}</div></details>`;
      }).join('')}</div>` : emptyState(mode === 'today' ? 'Belum ada barang WIN yang diterima hari ini.' : 'Tidak ada barang WIN di tanggal ini.', 'truck');
  };
  on(el, 'click', '[data-chips="d"] .chip', (e, b) => {
    mode = b.dataset.v; b.parentElement.querySelectorAll('.chip').forEach((c) => c.classList.toggle('on', c === b));
    el.querySelector('#range').classList.toggle('hidden', mode !== 'pick'); load();
  });
  on(el, 'change', '#d1, #d2', () => { if (mode === 'pick') load(); });
  el.querySelector('#xls').onclick = async (e) => {
    const [a, b] = range();
    if (!last.pos || last.a !== a || last.b !== b) await load();
    e.target.disabled = true;
    try {
      const { downloadWinExcel } = await import('../excel-win.js');
      await downloadWinExcel({ pos: last.pos, dates: last.dates, money, shop: store.settings?.nama_toko || '' }, `barang-win-${a}${a === b ? '' : '_sd_' + b}.xlsx`);
    } catch (err) { toastErr(err); }
    e.target.disabled = false;
  };
  load();
}
