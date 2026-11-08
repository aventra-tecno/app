import { rpc } from '../supa.js';
import { store } from '../store.js';
import { esc, rp, num, todayStr, monthStart, fmtDate, chips, on, toastErr, pageHead, emptyState, skeleton, icon, downloadXlsx } from '../ui.js';

// Laporan premium: laba per toko per bulan, tren 12 bulan, perbandingan toko, barang paling untung. Bisa dicetak / PDF.
const bulanTxt = (d) => fmtDate(d, { month: 'short', year: '2-digit' });
const addMonths = (d, n) => { const x = new Date(d + 'T00:00:00Z'); x.setUTCMonth(x.getUTCMonth() + n); return x.toISOString().slice(0, 10); };

export default {
  tour: [
    { sel: '#trend', title: 'Tren bulanan', body: 'Batang = laba per bulan, angka di atas = omzet. Bandingkan bulan ke bulan.' },
    { sel: '#toko', title: 'Perbandingan toko', body: 'Toko mana yang paling banyak menyumbang laba, dan berapa persen.' },
    { sel: '#pdf', title: 'Cetak / PDF', body: 'Tekan untuk mencetak. Pilih "Simpan sebagai PDF" di jendela cetak untuk mendapatkan file PDF.' }
  ],
  async render(el) {
    let period = '12', d = null;
    const range = () => {
      const t = todayStr(), y = +t.slice(0, 4);
      if (period === 'year') return [y + '-01-01', t];
      if (period === 'lastyear') return [(y - 1) + '-01-01', (y - 1) + '-12-31'];
      if (period === '3') return [addMonths(monthStart(t), -2), t];
      return [addMonths(monthStart(t), -11), t];
    };
    el.innerHTML = `${pageHead('Laporan premium', 'Laba per toko per bulan. Laba = perkiraan dana cair − modal barang − biaya packing − rugi retur. Biaya operasional dikurangkan di kolom "Bersih".',
      `<button class="btn" id="xl">${icon('download', 18)} Excel</button><button class="btn btn-primary" id="pdf">${icon('print', 18)} Cetak / PDF</button>`)}
      <div class="stack">${chips('p', [['12', '12 bulan'], ['3', '3 bulan'], ['year', 'Tahun ini'], ['lastyear', 'Tahun lalu']], period)}
        <div class="print-only print-head"><b>${esc(store.settings.nama_toko || '')}</b> · Laporan premium · <span id="ph"></span></div>
        <div id="body">${skeleton(3)}</div></div>`;

    const load = async () => {
      const [a, b] = range();
      el.querySelector('#body').innerHTML = skeleton(3);
      try { d = await rpc('laporan_premium', { p_from: a, p_to: b }); } catch (e) { return toastErr(e); }
      el.querySelector('#ph').textContent = fmtDate(a) + ' – ' + fmtDate(b);
      paint(a, b);
    };
    const paint = (a, b) => {
      const rows = d.rows || [];
      if (!rows.length) { el.querySelector('#body').innerHTML = `<div class="card">${emptyState('Belum ada penjualan di periode ini.', 'chart')}</div>`; return; }
      // daftar bulan lengkap (bulan tanpa penjualan tetap tampil)
      const months = []; for (let m = monthStart(a); m <= b; m = addMonths(m, 1)) months.push(m);
      const ops = Object.fromEntries((d.biaya || []).map((x) => [x.bulan, Number(x.operasional)]));
      const sumBy = (list, k) => list.reduce((s, r) => s + Number(r[k] || 0), 0);
      const perM = months.map((m) => { const l = rows.filter((r) => r.bulan === m); return { m, resi: sumBy(l, 'resi'), omzet: sumBy(l, 'omzet'), dana: sumBy(l, 'dana'), modal: sumBy(l, 'modal'), laba: sumBy(l, 'laba'), rugi: sumBy(l, 'rugi'), packing: sumBy(l, 'packing'), cancel: sumBy(l, 'cancel'), retur: sumBy(l, 'retur'), ops: ops[m] || 0 }; });
      const stores = [...new Set(rows.map((r) => r.toko))];
      const perS = stores.map((t) => { const l = rows.filter((r) => r.toko === t); return { t, resi: sumBy(l, 'resi'), omzet: sumBy(l, 'omzet'), laba: sumBy(l, 'laba'), cancel: sumBy(l, 'cancel'), retur: sumBy(l, 'retur') }; }).sort((x, y) => y.laba - x.laba);
      const T = { resi: sumBy(perM, 'resi'), omzet: sumBy(perM, 'omzet'), laba: sumBy(perM, 'laba'), ops: sumBy(perM, 'ops'), modal: sumBy(perM, 'modal'), dana: sumBy(perM, 'dana') };
      const best = perM.reduce((x, y) => (y.laba > x.laba ? y : x), perM[0]);
      const max = Math.max(1, ...perM.map((x) => Math.abs(x.laba)));
      const maxS = Math.max(1, ...perS.map((x) => Math.abs(x.laba)));
      el._x = { perM, perS, stores, rows };
      el.querySelector('#body').innerHTML = `<div class="grid gauto">
          <div class="card kpi dark"><div class="label">Laba setelah operasional</div><div class="value">${rp(T.laba - T.ops)}</div><div class="sub">Laba ${rp(T.laba)} − operasional ${rp(T.ops)}</div></div>
          <div class="card kpi"><div class="label">Omzet</div><div class="value">${rp(T.omzet)}</div><div class="sub">${num(T.resi)} resi · rata-rata ${rp(T.resi ? T.omzet / T.resi : 0)}/resi</div></div>
          <div class="card kpi"><div class="label">Margin laba</div><div class="value">${T.omzet ? Math.round((T.laba / T.omzet) * 100) : 0}%</div><div class="sub">dari omzet</div></div>
          <div class="card kpi"><div class="label">Bulan terbaik</div><div class="value" style="font-size:20px">${esc(fmtDate(best.m, { month: 'long', year: 'numeric' }))}</div><div class="sub">Laba ${rp(best.laba)}</div></div></div>
        <section class="card" id="trend"><div class="card-h" style="padding:0 0 10px"><h2>Tren laba per bulan</h2></div>
          <div class="vbars">${perM.map((x) => `<div class="vb" title="${esc(bulanTxt(x.m))}: laba ${rp(x.laba)}, omzet ${rp(x.omzet)}"><span class="vb-top">${x.omzet ? num(x.omzet / 1000) + 'rb' : ''}</span>
            <div class="vb-col"><i class="${x.laba < 0 ? 'neg' : ''}" style="height:${Math.max(2, (Math.abs(x.laba) / max) * 100)}%"></i></div><span class="vb-lbl">${esc(bulanTxt(x.m))}</span><b class="vb-val ${x.laba < 0 ? 'neg' : ''}">${x.laba ? num(x.laba / 1000) + 'rb' : '–'}</b></div>`).join('')}</div></section>
        <section class="card flush"><div class="card-h"><h2>Per bulan</h2></div><div class="table-wrap"><table class="tbl" style="min-width:820px"><thead><tr><th>Bulan</th><th class="right">Resi</th><th class="right">Cancel/retur</th><th class="right">Omzet</th><th class="right">Dana cair</th><th class="right">Modal</th><th class="right">Laba</th><th class="right">Operasional</th><th class="right">Bersih</th></tr></thead><tbody>
          ${perM.map((x) => `<tr><td>${esc(fmtDate(x.m, { month: 'long', year: 'numeric' }))}</td><td class="num">${num(x.resi)}</td><td class="num">${x.cancel + x.retur || ''}</td><td class="num">${num(x.omzet)}</td><td class="num">${num(x.dana)}</td><td class="num">${num(x.modal)}</td><td class="num"><b class="${x.laba < 0 ? 'neg' : 'pos'}">${num(x.laba)}</b></td><td class="num">${num(x.ops)}</td><td class="num"><b>${num(x.laba - x.ops)}</b></td></tr>`).join('')}</tbody>
          <tfoot><tr><td>Total</td><td class="num">${num(T.resi)}</td><td></td><td class="num">${num(T.omzet)}</td><td class="num">${num(T.dana)}</td><td class="num">${num(T.modal)}</td><td class="num">${num(T.laba)}</td><td class="num">${num(T.ops)}</td><td class="num">${num(T.laba - T.ops)}</td></tr></tfoot></table></div></section>
        <section class="card flush" id="toko"><div class="card-h"><h2>Perbandingan toko</h2></div><div class="list no-page">${perS.map((x) => `<div class="list-item"><div class="grow" style="min-width:0"><b>${esc(x.t)}</b> <span class="xs muted">${num(x.resi)} resi · omzet ${rp(x.omzet)}${x.cancel + x.retur ? ` · ${x.cancel + x.retur} cancel/retur` : ''}</span>
            <div class="hbar"><i style="width:${(Math.abs(x.laba) / maxS) * 100}%;${x.laba < 0 ? 'background:var(--red)' : ''}"></i></div></div>
            <div style="text-align:right"><b class="num ${x.laba < 0 ? 'neg' : ''}">${rp(x.laba)}</b><div class="xs muted">${T.laba ? Math.round((x.laba / T.laba) * 100) : 0}% laba · margin ${x.omzet ? Math.round((x.laba / x.omzet) * 100) : 0}%</div></div></div>`).join('')}</div></section>
        <section class="card flush"><div class="card-h"><h2>Laba per toko per bulan</h2></div><div class="table-wrap"><table class="tbl" style="min-width:${200 + stores.length * 110}px"><thead><tr><th>Bulan</th>${perS.map((x) => `<th class="right">${esc(x.t)}</th>`).join('')}<th class="right">Total</th></tr></thead><tbody>
          ${perM.map((x) => `<tr><td>${esc(bulanTxt(x.m))}</td>${perS.map((s) => { const r = rows.find((y) => y.bulan === x.m && y.toko === s.t); return `<td class="num ${r && r.laba < 0 ? 'neg' : ''}">${r ? num(r.laba) : ''}</td>`; }).join('')}<td class="num"><b>${num(x.laba)}</b></td></tr>`).join('')}</tbody></table></div></section>
        <div class="grid g2">
          <section class="card flush"><div class="card-h"><h2>Barang paling untung</h2></div>${(d.top || []).length ? `<div class="list no-page">${d.top.map((p, i) => `<div class="list-item"><span class="rank">${i + 1}</span><div class="grow" style="min-width:0"><b>${esc(p.name)}</b><div class="xs muted mono">${esc(p.sku)} · ${num(p.qty)} pcs · omzet ${rp(p.omzet)}</div></div><b class="num pos">${rp(p.laba)}</b></div>`).join('')}</div>` : emptyState('–', 'chart')}</section>
          <section class="card flush"><div class="card-h"><h2>Barang yang rugi</h2></div>${(d.rugi_top || []).length ? `<div class="list no-page">${d.rugi_top.map((p) => `<div class="list-item"><div class="grow" style="min-width:0"><b>${esc(p.name)}</b><div class="xs muted mono">${esc(p.sku)} · ${num(p.qty)} pcs</div></div><b class="num neg">${rp(p.laba)}</b></div>`).join('')}</div>` : emptyState('Tidak ada barang yang dijual rugi. 👍', 'check')}</section>
        </div>
        <div class="xs muted">Dana cair memakai angka file Penghasilan Shopee bila sudah diupload; kalau belum, diperkirakan omzet − ${num(d.fee_pct)}% potongan. Biaya packing ${rp(d.packing_cost)}/resi.</div>`;
    };
    on(el, 'click', '[data-chips] .chip', (e, b) => { b.parentElement.querySelectorAll('.chip').forEach((c) => c.classList.toggle('on', c === b)); period = b.dataset.v; load(); });
    el.querySelector('#pdf').onclick = () => window.print();
    el.querySelector('#xl').onclick = () => {
      if (!el._x) return;
      const { perM, rows } = el._x;
      downloadXlsx('laporan-premium.xlsx', [...perM.map((x) => ({ Bulan: x.m, Toko: 'SEMUA', Resi: x.resi, Omzet: x.omzet, 'Dana cair': x.dana, Modal: x.modal, Laba: x.laba, Operasional: x.ops, Bersih: x.laba - x.ops })),
        ...rows.map((r) => ({ Bulan: r.bulan, Toko: r.toko, Resi: Number(r.resi), Omzet: Number(r.omzet), 'Dana cair': Number(r.dana), Modal: Number(r.modal), Laba: Number(r.laba), Operasional: '', Bersih: '' }))], 'Laporan');
    };
    load();
  }
};
