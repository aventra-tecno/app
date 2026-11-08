import { rpc, supa } from '../supa.js';
import { esc, rp, num, todayStr, addDays, fmtDate, chips, on, toast, toastErr, pageHead, emptyState, skeleton, icon, statusTag } from '../ui.js';

export default {
  tour: [
    { sel: '#d', title: 'Pilih tanggal', body: 'Rekap mengikuti tanggal pesanan dibuat di Shopee.' },
    { sel: '#tbl', title: 'Sama seperti rekap kertas', body: 'No resi, kode, barang, qty, Macallan, harga beli, harga Shopee, harga selesai, margin — plus sumber barang & status.' }
  ],
  async render(el, { params }) {
    let date = params.d || todayStr(), filter = 'all', rows = [];
    let storeF = (() => { try { return sessionStorage.getItem('rekap-store') || 'all'; } catch (_) { return 'all'; } })();
    const { data: stores } = await supa.from('stores').select('id, name, marketplace').order('sort').order('name');
    el.innerHTML = `${pageHead('Rekap harian per resi', 'Harga selesai = dana cair dari file Penghasilan Shopee. Sebelum cair dipakai estimasi (ditandai *).',
      `<button class="btn" id="xl">${icon('download', 18)} Unduh Excel</button><button class="btn btn-primary" id="pr">${icon('print', 18)} Cetak</button>`)}
      <div class="stack">
        <div class="row wrap no-print"><button class="btn btn-sm" data-shift="-1" aria-label="Hari sebelumnya">${icon('back', 16)}</button><input type="date" class="input" id="d" value="${date}" style="max-width:190px"><button class="btn btn-sm" data-shift="1" aria-label="Hari berikutnya">${icon('chev', 16)}</button><h3 style="font-size:16px" id="dl"></h3></div>
        ${stores?.length ? `<div class="no-print" id="storef"></div>` : ''}
        <div class="grid gauto" id="kpi"></div>
        <div id="warn"></div>
        <div class="no-print" id="fil"></div>
        <div class="card flush" id="tbl">${skeleton()}</div>
      </div>`;
    const load = async () => {
      el.querySelector('#dl').textContent = fmtDate(date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
      el.querySelector('#tbl').innerHTML = skeleton();
      try { rows = await rpc('rekap_harian', { p_date: date }); } catch (e) { return toastErr(e); }
      paint();
    };
    const paint = () => {
      if (stores?.length) el.querySelector('#storef').innerHTML = chips('st', [['all', 'Semua toko'], ...stores.map((s) => [String(s.id), s.name + ' (' + new Set(rows.filter((r) => r.store_id === s.id).map((r) => r.order_id)).size + ')'])], storeF);
      const orders = new Map();
      rows.filter((r) => storeF === 'all' || String(r.store_id) === storeF).forEach((r) => { if (!orders.has(r.order_id)) orders.set(r.order_id, { ...r, items: [] }); orders.get(r.order_id).items.push(r); });
      const all = [...orders.values()];
      const valid = all.filter((o) => !['cancel', 'retur'].includes(o.status));
      const zeroCost = all.filter((o) => o.items.some((i) => !Number(i.harga_beli)));
      const zeroMargin = zeroCost.filter((o) => !['cancel', 'retur'].includes(o.status)).reduce((a, o) => a + Number(o.margin), 0);
      const sum = (arr, k) => arr.reduce((a, o) => a + Number(o[k] || 0), 0);
      el.querySelector('#kpi').innerHTML = `
        <div class="card kpi"><div class="label">Resi</div><div class="value">${valid.length}</div><div class="sub">${all.length - valid.length} cancel / retur</div></div>
        <div class="card kpi"><div class="label">Harga selesai (dana Shopee)</div><div class="value">${rp(sum(valid, 'harga_selesai'))}</div><div class="sub">${valid.filter((o) => o.paid).length} sudah cair</div></div>
        <div class="card kpi"><div class="label">Modal beli WIN</div><div class="value">${rp(sum(valid, 'modal_order'))}</div></div>
        <div class="card kpi dark"><div class="label">Margin kotor</div><div class="value">${rp(sum(all, 'margin'))}</div><div class="sub" style="color:var(--accent)">${zeroMargin ? rp(zeroMargin) + ' belum pasti (modal kosong)' : 'termasuk rugi retur'}</div></div>`;
      el.querySelector('#warn').innerHTML = zeroCost.length ? `<div class="card warn row wrap between"><div class="small grow" style="min-width:240px"><b>${zeroCost.length} resi memakai barang dengan modal Rp0.</b> Margin terlihat lebih besar dari aslinya.</div><a class="btn btn-dark btn-sm" href="#/harga">Lengkapi harga beli</a></div>` : '';
      el.querySelector('#fil').innerHTML = chips('f', [['all', `Semua (${all.length})`], ['ok', `Terkirim / proses (${valid.length})`], ['cancel', 'Cancel'], ['retur', 'Retur'], ['zero', `Modal kosong (${zeroCost.length})`], ['unpaid', 'Belum cair']], filter);
      const list = all.filter((o) => filter === 'all' || (filter === 'ok' && valid.includes(o)) || o.status === filter || (filter === 'zero' && zeroCost.includes(o)) || (filter === 'unpaid' && !o.paid && valid.includes(o)));
      if (!list.length) { el.querySelector('#tbl').innerHTML = emptyState('Tidak ada pesanan di tanggal ini.', 'calendar'); return; }
      let n = 0;
      el.querySelector('#tbl').innerHTML = `<div class="table-wrap"><table class="tbl" style="min-width:1100px"><thead><tr><th>No</th><th>No resi</th><th>Kode</th><th>Keterangan</th><th class="right">Qty</th><th>Sumber</th><th class="right">Macallan</th><th class="right">Harga beli</th><th class="right">Harga Shopee</th><th class="right">Harga selesai</th><th class="right">Margin</th><th>Status</th></tr></thead><tbody>
        ${list.map((o) => o.items.map((i, k) => `<tr class="${['cancel', 'retur'].includes(o.status) ? 'bad' : !Number(i.harga_beli) ? 'hl' : ''}">
          ${k === 0 ? `<td rowspan="${o.items.length}">${++n}</td><td rowspan="${o.items.length}" class="mono xs">${esc(o.resi || o.order_no)}${storeF === 'all' && o.store_name ? `<div><span class="tag">${esc(o.store_name)}</span></div>` : ''}</td>` : ''}
          <td class="mono xs">${esc(i.sku || '')}</td><td class="small">${esc(i.name)}</td><td class="num">${i.qty}</td><td>${i.rack_qty ? `<span class="tag green">Rak ${i.rack_qty}</span> ` : ''}${i.source === 'win' ? '<span class="tag yellow">WIN</span>' : '<span class="tag">Gudang</span>'}${i.rack ? ` <span class="xs mono muted">${esc(i.rack)}</span>` : ''}</td>
          <td class="num">${num(i.macallan)}</td><td class="num ${!Number(i.harga_beli) ? 'neg' : ''}">${num(i.harga_beli * i.qty)}</td><td class="num">${num(i.harga_jual)}</td>
          ${k === 0 ? `<td rowspan="${o.items.length}" class="num">${num(o.harga_selesai)}${o.paid ? '' : '*'}</td><td rowspan="${o.items.length}" class="num"><b class="${o.margin < 0 ? 'neg' : 'pos'}">${num(o.margin)}</b></td><td rowspan="${o.items.length}">${statusTag(o.status)}</td>` : ''}</tr>`).join('')).join('')}
        </tbody><tfoot><tr><td colspan="7">Total ${list.length} resi</td><td class="num">${num(sum(list, 'modal_order'))}</td><td></td><td class="num">${num(sum(list.filter((o) => !['cancel', 'retur'].includes(o.status)), 'harga_selesai'))}</td><td class="num">${num(sum(list, 'margin'))}</td><td></td></tr></tfoot></table></div>`;
      el._list = list;
    };
    el.querySelector('#d').addEventListener('change', (e) => { date = e.target.value; load(); });
    on(el, 'click', '[data-shift]', (e, b) => { date = addDays(date, +b.dataset.shift); el.querySelector('#d').value = date; load(); });
    on(el, 'click', '[data-chips="f"] .chip', (e, b) => { filter = b.dataset.v; paint(); });
    on(el, 'click', '[data-chips="st"] .chip', (e, b) => { storeF = b.dataset.v; try { sessionStorage.setItem('rekap-store', storeF); } catch (_) {} paint(); });
    el.querySelector('#pr').onclick = () => window.print();
    // Excel berwarna: tab RINGKASAN + 1 tab per toko (ringkasan di atas, baris cancel / retur merah)
    el.querySelector('#xl').onclick = async (e) => {
      const b = e.currentTarget; b.disabled = true;
      try {
        const { buildRekapBook } = await import('../excel-rekap.js');
        const out = buildRekapBook({ rows, dateLabel: fmtDate(date, { day: 'numeric', month: 'long', year: 'numeric' }).toUpperCase(), printedAt: fmtDate(new Date(), { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }), storeFilter: storeF === 'all' ? null : storeF });
        const blob = await out.wb.toBlob();
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `rekap-${date}${storeF === 'all' ? '' : '-' + (stores?.find((x) => String(x.id) === storeF)?.name || storeF)}.xlsx`;
        document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
        toast(`Excel siap: ${out.resi} resi, ${out.stores} toko`, 'ok');
      } catch (err) { toastErr(err); } finally { b.disabled = false; }
    };
    load();
  }
};
