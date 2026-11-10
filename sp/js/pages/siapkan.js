import { supa, rpc } from '../supa.js';
import { store } from '../store.js';
import { esc, num, fmtDateTime, chips, on, toast, toastErr, pageHead, emptyState, skeleton, icon, beep, confirmBox } from '../ui.js';
import { scanBox, bindScan } from '../scanner.js';
import { listEditor } from '../daftar-file.js';
import { pickRack } from '../rak-pilih.js';

// 2.33 Kepala gudang: tugaskan picker ambil di rak, cek barang dari picker, dan isi meja kepala gudang.
// Barang di meja (dari picker & dari WIN) nanti dipakai admin saat scan resi di Catat pesanan.
const T_ST = { baru: ['Picker mengambil', 'yellow'], diserahkan: ['Perlu dicek', 'blue'], selesai: ['Selesai', 'green'], batal: ['Batal', 'red'] };
const tTag = (s) => `<span class="tag ${T_ST[s]?.[1] || ''}">${T_ST[s]?.[0] || s}</span>`;

export default {
  tour: [
    { sel: '[data-chips="tab"]', title: 'Tugas picker & meja', body: 'Buat tugas ambil untuk picker, cek barang yang diserahkan picker, dan lihat barang yang siap di meja.' }
  ],
  async render(el, { params = {} }) {
    if (params.t) return checkTask(el, +params.t);
    let tab = params.tab || 'tugas';
    el.innerHTML = `${pageHead('Siapkan barang')}
      <div class="stack">${chips('tab', [['tugas', 'Tugas picker'], ['buat', 'Buat tugas'], ['meja', 'Barang WIN belum di rak']], tab)}<div id="body"></div></div>`;
    const show = () => { const b = el.querySelector('#body'); (tab === 'buat' ? renderNew(b, () => go('tugas')) : tab === 'meja' ? renderMeja(b) : renderTasks(b)); };
    const go = (t) => { tab = t; el.querySelectorAll('[data-chips="tab"] .chip').forEach((c) => c.classList.toggle('on', c.dataset.v === t)); show(); };
    on(el, 'click', '[data-chips="tab"] .chip', (e, b) => go(b.dataset.v));
    show();
  }
};

async function renderTasks(box) {
  box.innerHTML = skeleton(3);
  const { data, error } = await supa.from('pick_tasks').select('*, pick_task_items(qty, picked_qty, checked_qty, missing_qty)').order('created_at', { ascending: false }).limit(40);
  if (error) { box.innerHTML = `<div class="alert yellow">Menu ini butuh update database. Jalankan <b>supabase/update-2.33.sql</b>. (${esc(error.message)})</div>`; return; }
  const open = data.filter((t) => ['baru', 'diserahkan'].includes(t.status)), done = data.filter((t) => !['baru', 'diserahkan'].includes(t.status)).slice(0, 10);
  const row = (t) => {
    const s = (k) => t.pick_task_items.reduce((a, i) => a + i[k], 0);
    return `<a class="list-item" href="#/siapkan?t=${t.id}"><div class="grow"><div class="row wrap"><b class="mono">${esc(t.code)}</b>${tTag(t.status)}</div>
      <div class="small muted">${s('qty')} pcs · diambil ${s('picked_qty')} · dicek ${s('checked_qty')}${s('missing_qty') ? ` · <span class="neg">tidak ada ${s('missing_qty')}</span>` : ''} · ${esc(store.profilesById[t.picker_id]?.full_name || 'semua picker')} · ${fmtDateTime(t.created_at)}</div></div>
      ${t.status === 'diserahkan' ? `<span class="btn btn-sm btn-primary">${icon('scan', 16)} Cek</span>` : icon('chev', 18)}</a>`;
  };
  box.innerHTML = `<div class="stack">
    <div class="card flush"><div class="card-h"><h2>Tugas berjalan</h2><a class="btn btn-sm btn-primary" href="#/siapkan?tab=buat">${icon('plus', 16)} Buat tugas</a></div>
      ${open.length ? `<div class="list no-page">${open.map(row).join('')}</div>` : emptyState('Tidak ada tugas berjalan.', 'cart')}</div>
    ${done.length ? `<div class="card flush"><div class="card-h"><h2>Terakhir selesai</h2></div><div class="list no-page">${done.map(row).join('')}</div></div>` : ''}</div>`;
}

async function renderNew(box, after) {
  const { data: pickers } = await supa.from('profiles').select('id, full_name').eq('role', 'picker').eq('active', true).order('full_name');
  box.innerHTML = `<div class="stack">
    <section class="card stack"><h2 class="sec-title">Barang yang diambil di rak</h2><div id="le"></div></section>
    <section class="card stack">
      <div class="grid gauto"><label class="field">Picker<select class="input" id="pk"><option value="">Semua picker</option>${(pickers || []).map((p) => `<option value="${p.id}">${esc(p.full_name)}</option>`).join('')}</select></label>
        <label class="field">Catatan<input class="input" id="nt" placeholder="opsional, mis. no. resi"></label></div>
      <button class="btn btn-primary btn-lg" id="send" disabled>Kirim tugas ke picker</button></section></div>`;
  const le = listEditor(box.querySelector('#le'), { price: false, emptyText: 'Upload daftar barang, tempel teks, atau cari manual.', onChange: (st) => { box.querySelector('#send').disabled = !st.rows.length; } });
  box.querySelector('#send').onclick = async (e) => {
    const rows = le.state.rows;
    const noStock = rows.filter((r) => r.p.stock < r.qty);
    if (noStock.length && !(await confirmBox('Stok rak kurang', `${noStock.map((r) => `<b>${esc(r.p.name)}</b> (stok ${r.p.stock}, minta ${r.qty})`).join('<br>')}<br><br>Tetap kirim? Kekurangannya beli di WIN.`))) return;
    e.target.disabled = true;
    try {
      await rpc('pick_task_create', { p: { picker_id: box.querySelector('#pk').value || null, note: box.querySelector('#nt').value.trim(), items: rows.map((r) => ({ product_id: r.p.id, qty: r.qty })) } });
      toast('Tugas dikirim ke picker', 'ok'); after();
    } catch (err) { toastErr(err); e.target.disabled = false; }
  };
}

async function renderMeja(box) {
  box.innerHTML = skeleton(3);
  const { data, error } = await supa.from('products').select('id, sku, name, rack_code, stock, meja_qty').gt('meja_qty', 0).order('name');
  if (error) return toastErr(error);
  const tot = data.reduce((a, p) => a + p.meja_qty, 0);
  box.innerHTML = `<div class="stack">
    <div class="hero"><div class="label">Barang WIN belum di rak</div><div class="big">${num(tot)}</div><div class="small" style="color:#C9CCC8">${data.length} macam · dipakai admin saat scan resi</div></div>
    <div class="card flush">${data.length ? `<div class="list no-page">${data.map((p) => `<div class="list-item"><div class="grow" style="min-width:0"><b>${esc(p.name)}</b><div class="xs muted mono">${esc(p.sku)} · rak ${esc(p.rack_code || '–')} · stok rak ${p.stock}</div></div>
        <b style="font-size:18px">${p.meja_qty}</b><button class="btn btn-sm" data-back="${p.id}">Tambah ke rak</button></div>`).join('')}</div>` : emptyState('Semua barang WIN sudah di rak / terpakai.', 'box')}</div></div>`;
  on(box, 'click', '[data-back]', async (e, b) => {
    const p = data.find((x) => x.id === +b.dataset.back);
    const k = await pickRack({ title: 'Tambah ke rak', product: p, qtyMax: p.meja_qty, okLabel: 'Tambah ke rak' });
    if (!k) return;
    try { const x = await rpc('meja_to_rack', { p_product: p.id, p_qty: k.qty, p_rack: k.rack }); toast(`${x.qty} pcs ditaruh di rak ${x.rack}`, 'ok'); renderMeja(box); } catch (err) { toastErr(err); }
  });
}

// kepala gudang scan barang yang diserahkan picker
async function checkTask(el, id) {
  const load = async () => (await supa.from('pick_tasks').select('*, pick_task_items(*, products(name, sku, rack_code))').eq('id', id).single());
  let { data: t, error } = await load();
  if (error) return toastErr(error);
  const open = ['baru', 'diserahkan'].includes(t.status);
  el.innerHTML = `<div class="stack">
    <div class="row between wrap"><a href="#/siapkan" class="btn btn-ghost btn-sm">${icon('back', 16)} Kembali</a><div class="row"><b class="mono">${esc(t.code)}</b>${tTag(t.status)}</div></div>
    ${open ? `<div class="card stack" id="scan">${scanBox('sb', 'Scan barang dari picker')}<div id="last" aria-live="polite"></div></div>` : ''}
    <div class="card stack" id="items"></div>
    ${open ? `<div class="row"><button class="btn btn-danger grow" id="cancel">Batalkan tugas</button><button class="btn btn-primary btn-lg grow" id="done">Selesai cek, masuk meja</button></div>` : ''}
  </div>`;
  const paint = () => {
    const s = (k) => t.pick_task_items.reduce((a, i) => a + i[k], 0);
    el.querySelector('#items').innerHTML = `<div class="row between"><b>Dicek</b><span style="font-size:20px;font-weight:700">${s('checked_qty')} <span class="small muted">/ ${s('picked_qty')} diambil picker</span></span></div>
      <div class="progress"><div style="width:${s('picked_qty') ? (s('checked_qty') / s('picked_qty')) * 100 : 0}%"></div></div>
      ${t.pick_task_items.map((i) => `<div class="row" style="padding:10px 0;border-top:1px solid var(--line)"><div class="grow" style="min-width:0"><b>${esc(i.products.name)}</b><div class="xs muted mono">${esc(i.products.sku)} · rak ${esc(i.products.rack_code || '–')}</div></div>
        <div class="stack s8" style="align-items:flex-end"><span class="small">minta ${i.qty} · ambil ${i.picked_qty} · cek <b>${i.checked_qty}</b></span>${i.missing_qty ? `<span class="tag red">Tidak ada ${i.missing_qty} → beli WIN</span>` : ''}${i.picked_qty > i.checked_qty ? `<span class="tag yellow">Belum dicek ${i.picked_qty - i.checked_qty}</span>` : ''}</div></div>`).join('')}`;
  };
  paint();
  if (!open) return;
  bindScan(el, 'sb', async (code) => {
    try {
      const r = await rpc('pick_task_check', { p_task: id, p_code: code });
      const last = el.querySelector('#last');
      if (!r.ok) { beep(false); last.innerHTML = `<div class="alert red">${esc(r.msg)}</div>`; return { ok: false, title: r.msg }; }
      beep(true); last.innerHTML = `<div class="alert green"><b>${esc(r.name)}</b> ${r.checked}/${r.picked} → meja</div>`;
      ({ data: t } = await load()); paint();
      return { ok: true, title: r.name, info: `${r.checked}/${r.picked} → meja` };
    } catch (e) { toastErr(e); return false; }
  });
  el.querySelector('#done').onclick = async () => {
    const short = t.pick_task_items.reduce((a, i) => a + i.picked_qty - i.checked_qty, 0);
    if (short && !(await confirmBox('Barang kurang ' + short, 'Barang yang sudah diambil picker tetapi tidak sampai akan dilaporkan ke owner.', 'Selesai dengan kekurangan'))) return;
    try { const r = await rpc('pick_task_close', { p_task: id }); toast(`${r.masuk_meja} pcs masuk meja${r.kurang ? ', kurang ' + r.kurang : ''}`, r.kurang ? 'err' : 'ok'); location.hash = '#/siapkan'; } catch (e) { toastErr(e); }
  };
  el.querySelector('#cancel').onclick = async () => {
    if (!(await confirmBox('Batalkan tugas?', 'Barang yang sudah diambil picker tetapi belum dicek dikembalikan ke stok rak.', 'Batalkan tugas', true))) return;
    try { await rpc('pick_task_cancel', { p_task: id }); toast('Tugas dibatalkan', 'ok'); location.hash = '#/siapkan'; } catch (e) { toastErr(e); }
  };
}
