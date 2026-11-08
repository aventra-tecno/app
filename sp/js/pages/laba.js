import { rpc } from '../supa.js';
import { esc, rp, num, todayStr, addDays, monthStart, chips, on, toastErr, pageHead, emptyState, skeleton, icon, downloadXlsx } from '../ui.js';

export default {
  async render(el) {
    let period = 'month', sort = 'laba', rows = [];
    const range = () => { const t = todayStr(); return period === '7' ? [addDays(t, -6), t] : period === '30' ? [addDays(t, -29), t] : period === 'last' ? [monthStart(addDays(monthStart(t), -1)), addDays(monthStart(t), -1)] : [monthStart(t), t]; };
    el.innerHTML = `${pageHead('Laba per barang', 'Dana Shopee dibagi proporsional per barang dalam satu resi, dikurangi harga beli. Cancel & retur tidak dihitung sebagai penjualan.', `<button class="btn" id="xl">${icon('download', 18)} Unduh Excel</button>`)}
      <div class="stack"><div class="row wrap between">${chips('p', [['7', '7 hari'], ['month', 'Bulan ini'], ['last', 'Bulan lalu'], ['30', '30 hari']], period)}${chips('s', [['laba', 'Laba terbesar'], ['thin', 'Margin tipis'], ['rugi', 'Rugi'], ['qty', 'Paling laku'], ['retur', 'Sering retur']], sort)}</div>
      <div class="card flush" id="tbl">${skeleton()}</div></div>`;
    const load = async () => {
      const [a, b] = range();
      try { rows = (await rpc('profit_by_product', { p_from: a, p_to: b })).map((r) => ({ ...r, pct: Number(r.est_dana) ? (Number(r.laba) / Number(r.est_dana)) * 100 : 0 })); } catch (e) { return toastErr(e); }
      paint();
    };
    const paint = () => {
      let list = rows.filter((r) => Number(r.qty) > 0 || Number(r.retur) > 0);
      if (sort === 'laba') list.sort((a, b) => b.laba - a.laba);
      if (sort === 'thin') list = list.filter((r) => r.pct < 10 && r.laba >= 0).sort((a, b) => a.pct - b.pct);
      if (sort === 'rugi') list = list.filter((r) => r.laba < 0).sort((a, b) => a.laba - b.laba);
      if (sort === 'qty') list.sort((a, b) => b.qty - a.qty);
      if (sort === 'retur') list = list.filter((r) => r.retur > 0).sort((a, b) => b.retur - a.retur);
      el._list = list;
      el.querySelector('#tbl').innerHTML = list.length ? `<div class="table-wrap"><table class="tbl" style="min-width:840px"><thead><tr><th>Barang</th><th class="right">Terjual</th><th class="right">Omzet</th><th class="right">Est. dana Shopee</th><th class="right">Modal</th><th class="right">Laba</th><th class="right">Margin</th><th class="right">Retur</th><th class="right">Laba / pcs</th></tr></thead><tbody>
        ${list.map((r) => `<tr><td><b>${esc(r.name)}</b><div class="xs muted mono">${esc(r.sku)}</div></td><td class="num">${num(r.qty)}</td><td class="num">${num(r.omzet)}</td><td class="num">${num(r.est_dana)}</td><td class="num">${num(r.modal)}</td>
          <td class="num"><b class="${r.laba < 0 ? 'neg' : 'pos'}">${num(r.laba)}</b></td><td class="num ${r.pct < 10 ? 'warn-t' : ''}">${Math.round(r.pct)}%</td><td class="num">${r.retur || ''}</td><td class="num">${r.qty ? num(r.laba / r.qty) : '–'}</td></tr>`).join('')}
        </tbody><tfoot><tr><td>Total</td><td class="num">${num(list.reduce((a, r) => a + Number(r.qty || 0), 0))}</td><td class="num">${num(list.reduce((a, r) => a + Number(r.omzet), 0))}</td><td class="num">${num(list.reduce((a, r) => a + Number(r.est_dana), 0))}</td><td class="num">${num(list.reduce((a, r) => a + Number(r.modal), 0))}</td><td class="num">${num(list.reduce((a, r) => a + Number(r.laba), 0))}</td><td colspan="3"></td></tr></tfoot></table></div>` : emptyState('Tidak ada data di periode / filter ini.', 'chart');
    };
    on(el, 'click', '[data-chips] .chip', (e, b) => {
      const g = b.closest('[data-chips]').dataset.chips;
      b.parentElement.querySelectorAll('.chip').forEach((c) => c.classList.toggle('on', c === b));
      if (g === 'p') { period = b.dataset.v; load(); } else { sort = b.dataset.v; paint(); }
    });
    el.querySelector('#xl').onclick = () => downloadXlsx('laba-per-barang.xlsx', (el._list || []).map((r) => ({ Kode: r.sku, Barang: r.name, Terjual: Number(r.qty), Omzet: Number(r.omzet), 'Est dana': Number(r.est_dana), Modal: Number(r.modal), Laba: Number(r.laba), 'Margin %': Math.round(r.pct), Retur: Number(r.retur) })), 'Laba');
    load();
  }
};
