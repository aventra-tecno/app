import { supa, rpc } from '../supa.js';
import { store } from '../store.js';
import { esc, rp, num, chips, on, toastErr, pageHead, emptyState, skeleton, todayStr, addDays, copyBtn, fmtDate } from '../ui.js';

// 2.38 Penghasilan Shopee: dana cair, potongan Shopee per jenis, modal & profit (dari Laporan Penghasilan)
const monthStart = (d) => d.slice(0, 8) + '01';
const monthEnd = (d) => { const [y, m] = d.split('-').map(Number); return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10); };

export default {
  tour: [
    { sel: '#kpi', title: 'Dana cair & profit', body: 'Dari file Laporan Penghasilan Shopee (menu Upload file). Profit = dana cair − modal barang, untuk pesanan yang resinya sudah di-scan di aplikasi.' },
    { sel: '#rinci', title: 'Potongan Shopee', body: 'Biaya admin, gratis ongkir XTRA, layanan, promosi, voucher, pajak, dan selisih ongkir.' }
  ],
  async render(el) {
    const t = todayStr();
    let mode = 'bulan', from = monthStart(t), to = t, storeId = null, q = '';
    const { data: stores } = await supa.from('stores').select('id, name, marketplace').eq('active', true).order('sort').order('name');
    const shopStores = (stores || []).filter((s) => s.marketplace !== 'Offline');
    el.innerHTML = `${pageHead('Penghasilan Shopee')}
      <div class="stack">
        ${chips('pd', [['bulan', 'Bulan ini'], ['lalu', 'Bulan lalu'], ['7', '7 hari'], ['pick', 'Pilih tanggal']], mode)}
        <div class="grid g2 hidden" id="range"><label class="field">Dari<input type="date" class="input" id="d1" value="${from}"></label><label class="field">Sampai<input type="date" class="input" id="d2" value="${to}"></label></div>
        ${chips('st', [['', 'Semua toko'], ...shopStores.map((s) => [String(s.id), s.name])], '')}
        <div id="kpi">${skeleton(2)}</div>
        <div class="grid g2" style="align-items:start"><section class="card flush" id="rinci"></section><section class="card flush" id="toko"></section></div>
        <section class="card flush" id="list"></section>
        <div class="row wrap"><a class="btn" href="#/upload">Upload Laporan Penghasilan</a></div>
      </div>`;
    const setRange = () => {
      if (mode === 'bulan') { from = monthStart(t); to = t; }
      if (mode === 'lalu') { const d = addDays(monthStart(t), -1); from = monthStart(d); to = monthEnd(d); }
      if (mode === '7') { from = addDays(t, -6); to = t; }
      if (mode === 'pick') { from = el.querySelector('#d1').value || t; to = el.querySelector('#d2').value || from; if (from > to) [from, to] = [to, from]; }
    };
    const load = async () => {
      setRange();
      let r;
      try { r = await rpc('income_report', { p_from: from, p_to: to, p_store: storeId }); }
      catch (e) { el.querySelector('#kpi').innerHTML = `<div class="alert yellow">Menu ini butuh update database. Jalankan <b>supabase/update-2.38.sql</b>. (${esc(e.message || e)})</div>`; return; }
      const dana = Number(r.total) + Number(r.kompensasi);
      const potong = Number(r.harga_produk) - Number(r.total);
      const laba = Number(r.dana_cocok) - Number(r.modal);
      el.querySelector('#kpi').innerHTML = r.pesanan ? `<div class="grid gauto">
          <div class="card kpi dark"><div class="label">Dana cair</div><div class="value">${rp(dana)}</div><div class="sub">${num(r.pesanan)} pesanan · ${fmtDate(from, { day: 'numeric', month: 'short' })} – ${fmtDate(to, { day: 'numeric', month: 'short' })}</div></div>
          <div class="card kpi"><div class="label">Harga produk (omzet)</div><div class="value">${rp(r.harga_produk)}</div><div class="sub">sebelum potongan</div></div>
          <div class="card kpi"><div class="label">Dipotong Shopee</div><div class="value neg">${rp(potong)}</div><div class="sub">${r.harga_produk ? Math.round((potong / r.harga_produk) * 100) : 0}% dari harga produk</div></div>
          <div class="card kpi"><div class="label">Profit (dana cair − modal)</div><div class="value ${laba < 0 ? 'neg' : ''}">${rp(laba)}</div><div class="sub">${num(r.cocok)} dari ${num(r.pesanan)} pesanan cocok dengan resi di aplikasi · modal ${rp(r.modal)}</div></div></div>
        ${r.cocok < r.pesanan ? `<div class="alert blue small">${num(r.pesanan - r.cocok)} pesanan belum tersambung ke resi di aplikasi, jadi modalnya belum diketahui. Tersambung otomatis setelah resinya di-scan admin dan file <b>Pesanan Saya</b> diupload.</div>` : ''}`
        : `<div class="card">${emptyState('Belum ada data penghasilan di periode ini. Upload Laporan Penghasilan dari Shopee (Keuangan › Penghasilan Saya › Ekspor).', 'wallet')}</div>`;
      const rin = Object.entries(r.rinci || {}).filter(([, v]) => Number(v)).sort((a, b) => a[1] - b[1]);
      el.querySelector('#rinci').innerHTML = rin.length ? `<div class="card-h"><h2>Rincian potongan</h2></div><div class="list no-page">${rin.map(([k, v]) => `<div class="list-item" style="padding:8px 16px"><span class="grow small">${esc(k)}</span><b class="${v < 0 ? 'neg' : ''}">${rp(v)}</b><span class="xs muted" style="min-width:44px;text-align:right">${r.harga_produk ? ((Math.abs(v) / r.harga_produk) * 100).toFixed(1) + '%' : ''}</span></div>`).join('')}
        ${Number(r.kompensasi) ? `<div class="list-item" style="padding:8px 16px"><span class="grow small">Kompensasi (penyesuaian)</span><b>${rp(r.kompensasi)}</b><span class="xs muted" style="min-width:44px"></span></div>` : ''}</div>` : '';
      el.querySelector('#toko').innerHTML = (r.toko || []).length ? `<div class="card-h"><h2>Per toko</h2></div><div class="list no-page">${r.toko.map((x) => `<div class="list-item" style="padding:8px 16px"><span class="grow small"><b>${esc(x.name || 'Belum diketahui')}</b><div class="xs muted">${num(x.pesanan)} pesanan</div></span><b>${rp(x.total)}</b></div>`).join('')}</div>` : '';
      loadList();
    };
    const loadList = async () => {
      let qy = supa.from('shopee_income').select('order_no, released_on, harga_produk, total, kompensasi, order_id, store_id, items').gte('released_on', from).lte('released_on', to).order('released_on', { ascending: false }).order('order_no').limit(200);
      if (storeId) qy = qy.eq('store_id', storeId);
      if (q) qy = qy.ilike('order_no', `%${q}%`);
      const { data, error } = await qy;
      if (error) return toastErr(error);
      const sn = (id) => shopStores.find((s) => s.id === id)?.name || '';
      el.querySelector('#list').innerHTML = `<div class="card-h"><h2>Per pesanan</h2><input class="input sm" id="lq" placeholder="Cari no. pesanan" value="${esc(q)}" style="max-width:200px"></div>
        ${data.length ? `<div class="list">${data.map((o) => {
          const pct = o.harga_produk ? Math.round(((o.harga_produk - o.total) / o.harga_produk) * 100) : 0;
          return `<details class="win-po" style="margin:0 12px 8px"><summary><span class="grow" style="min-width:0"><b class="mono small">${esc(o.order_no)}</b>${copyBtn(o.order_no)} ${o.order_id ? '<span class="tag green">cocok</span>' : '<span class="tag">belum cocok</span>'}
            <div class="xs muted">${esc(sn(o.store_id))} · cair ${esc(o.released_on || '-')} · produk ${rp(o.harga_produk)} · potong ${pct}%</div></span><b>${rp(Number(o.total) + Number(o.kompensasi))}</b></summary>
            <div class="list no-page">${(o.items || []).map((i) => `<div class="list-item" style="padding:6px 0"><span class="grow small" style="min-width:0">${esc(i.name)}</span><span class="xs muted">${rp(i.harga)}</span><b class="small">${rp(i.total)}</b></div>`).join('') || '<div class="xs muted" style="padding:6px 0">Tidak ada rincian produk.</div>'}</div></details>`; }).join('')}</div>${data.length >= 200 ? '<div class="xs muted" style="padding:8px 16px">Menampilkan 200 pesanan terbaru. Pakai pencarian untuk yang lain.</div>' : ''}`
          : `<div style="padding:16px">${emptyState('Tidak ada pesanan.', 'receipt')}</div>`}`;
      const inp = el.querySelector('#lq');
      inp.addEventListener('change', () => { q = inp.value.trim(); loadList(); });
    };
    on(el, 'click', '[data-chips="pd"] .chip', (e, b) => { mode = b.dataset.v; b.parentElement.querySelectorAll('.chip').forEach((c) => c.classList.toggle('on', c === b)); el.querySelector('#range').classList.toggle('hidden', mode !== 'pick'); load(); });
    on(el, 'click', '[data-chips="st"] .chip', (e, b) => { storeId = b.dataset.v ? +b.dataset.v : null; b.parentElement.querySelectorAll('.chip').forEach((c) => c.classList.toggle('on', c === b)); load(); });
    on(el, 'change', '#d1, #d2', () => { if (mode === 'pick') load(); });
    void store;
    load();
  }
};
