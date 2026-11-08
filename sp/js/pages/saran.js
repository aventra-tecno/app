import { rpc } from '../supa.js';
import { esc, rp, num, chips, on, toast, toastErr, pageHead, emptyState, skeleton, icon, confirmBox, downloadXlsx } from '../ui.js';

// Saran belanja stok: dari rata-rata penjualan, stok sekarang, stok minimum, dan barang yang sedang dipesan.
export default {
  tour: [
    { sel: '#opt', title: 'Dasar hitungan', body: 'Pilih berapa hari penjualan yang dipakai dan stok untuk berapa hari ke depan.' },
    { sel: '#list', title: 'Saran beli', body: 'Saran = (rata-rata terjual per hari × hari stok) + stok minimum − stok sekarang − yang sedang dipesan. Centang lalu buat daftar beli.' }
  ],
  async render(el) {
    let days = '30', cover = '14', rows = [], sup = '';
    const sel = new Set();
    el.innerHTML = `${pageHead('Saran belanja stok', 'Barang yang perlu dibeli supaya tidak kehabisan, dihitung dari penjualan nyata.', `<button class="btn" id="xl">${icon('download', 18)} Excel</button>`)}
      <div class="stack"><div class="row wrap" id="opt"><span class="small muted">Penjualan</span>${chips('d', [['14', '14 hari'], ['30', '30 hari'], ['60', '60 hari'], ['90', '90 hari']], days)}<span class="small muted">Stok untuk</span>${chips('c', [['7', '7 hari'], ['14', '14 hari'], ['30', '30 hari']], cover)}</div>
        <div id="sum"></div><section class="card flush" id="list">${skeleton()}</section></div>`;
    const load = async () => {
      el.querySelector('#list').innerHTML = skeleton();
      try { rows = (await rpc('saran_stok', { p_days: +days, p_cover: +cover })).rows || []; } catch (e) { return toastErr(e); }
      sel.clear(); rows.forEach((r) => sel.add(r.id));
      paint();
    };
    const paint = () => {
      const sups = [...new Set(rows.map((r) => r.supplier || 'WIN'))];
      const list = sup ? rows.filter((r) => (r.supplier || 'WIN') === sup) : rows;
      const picked = list.filter((r) => sel.has(r.id));
      el.querySelector('#sum').innerHTML = `<div class="grid gauto"><div class="card kpi dark"><div class="label">Perkiraan biaya belanja</div><div class="value">${rp(picked.reduce((s, r) => s + Number(r.biaya), 0))}</div><div class="sub">${picked.length} macam · ${num(picked.reduce((s, r) => s + r.saran, 0))} pcs dicentang</div></div>
        <div class="card kpi ${list.filter((r) => r.stock <= 0).length ? 'warn' : ''}"><div class="label">Sudah habis</div><div class="value">${list.filter((r) => r.stock <= 0).length}</div><div class="sub">barang laku tapi stok 0</div></div>
        <div class="card kpi"><div class="label">Habis ≤ 7 hari</div><div class="value">${list.filter((r) => r.stock > 0 && r.sisa_hari != null && r.sisa_hari <= 7).length}</div></div></div>`;
      el.querySelector('#list').innerHTML = `<div class="card-h"><h2>Saran beli</h2><div class="row">${sups.length > 1 ? `<select class="input" id="fs" style="min-height:36px;width:auto"><option value="">Semua supplier</option>${sups.map((s) => `<option ${s === sup ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select>` : ''}
          <button class="btn btn-sm btn-primary" id="po" ${picked.length ? '' : 'disabled'}>${icon('truck', 16)} Buat daftar beli (${picked.length})</button></div></div>
        ${list.length ? `<div class="table-wrap"><table class="tbl" style="min-width:880px"><thead><tr><th><input type="checkbox" id="all" ${picked.length === list.length ? 'checked' : ''} aria-label="Pilih semua"></th><th>Barang</th><th class="right">Terjual</th><th class="right">Per hari</th><th class="right">Stok</th><th class="right">Dipesan</th><th class="right">Habis dalam</th><th class="right">Saran beli</th><th class="right">Biaya</th></tr></thead><tbody>
          ${list.map((r) => `<tr><td><input type="checkbox" data-pick="${r.id}" ${sel.has(r.id) ? 'checked' : ''} aria-label="Pilih"></td><td><b>${esc(r.name)}</b><div class="xs muted mono">${esc(r.sku)}${r.rack_code ? ' · rak ' + esc(r.rack_code) : ''} · ${esc(r.supplier || 'WIN')}</div></td>
            <td class="num">${num(r.terjual)}</td><td class="num">${r.per_hari}</td><td class="num ${r.stock <= 0 ? 'neg' : ''}">${num(r.stock)}</td><td class="num">${r.dipesan || ''}</td>
            <td class="num">${r.stock <= 0 ? '<span class="tag red">habis</span>' : r.sisa_hari != null ? `<span class="${r.sisa_hari <= 7 ? 'warn-t' : ''}">${r.sisa_hari} hari</span>` : '–'}</td>
            <td class="num"><b>${num(r.saran)}</b></td><td class="num">${num(r.biaya)}</td></tr>`).join('')}</tbody></table></div>`
          : emptyState('Semua barang laku stoknya cukup. 👍', 'check')}`;
      el.querySelector('#fs')?.addEventListener('change', (e) => { sup = e.target.value; paint(); });
      el.querySelector('#all')?.addEventListener('change', (e) => { list.forEach((r) => (e.target.checked ? sel.add(r.id) : sel.delete(r.id))); paint(); });
      el.querySelector('#po')?.addEventListener('click', async (e) => {
        if (!await confirmBox('Buat daftar beli?', `${picked.length} macam barang (${num(picked.reduce((s, r) => s + r.saran, 0))} pcs), perkiraan ${rp(picked.reduce((s, r) => s + Number(r.biaya), 0))}. Daftar bisa diubah lagi di menu Beli WIN.`)) return;
        e.target.disabled = true;
        try {
          await rpc('create_po', { p: { note: 'Dari saran belanja stok', items: picked.map((r) => ({ product_id: r.id, qty: r.saran, unit_cost: r.harga_beli })) } });
          toast('Daftar beli dibuat', 'ok'); location.hash = '#/beli';
        } catch (err) { toastErr(err); e.target.disabled = false; }
      });
    };
    on(el, 'change', '[data-pick]', (e, b) => { const id = +b.dataset.pick; b.checked ? sel.add(id) : sel.delete(id); paint(); });
    on(el, 'click', '[data-chips] .chip', (e, b) => {
      const g = b.closest('[data-chips]').dataset.chips;
      b.parentElement.querySelectorAll('.chip').forEach((c) => c.classList.toggle('on', c === b));
      if (g === 'd') days = b.dataset.v; else cover = b.dataset.v;
      load();
    });
    el.querySelector('#xl').onclick = () => downloadXlsx('saran-belanja.xlsx', rows.map((r) => ({ Kode: r.sku, Barang: r.name, Supplier: r.supplier || 'WIN', Terjual: r.terjual, 'Per hari': Number(r.per_hari), Stok: r.stock, Dipesan: r.dipesan, 'Habis (hari)': r.sisa_hari, 'Saran beli': r.saran, 'Harga beli': Number(r.harga_beli), Biaya: Number(r.biaya) })), 'Saran');
    load();
  }
};
