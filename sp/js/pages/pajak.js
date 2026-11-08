import { rpc } from '../supa.js';
import { store } from '../store.js';
import { esc, rp, num, todayStr, fmtDate, on, toast, toastErr, pageHead, skeleton, icon, parseNum, modal, downloadXlsx } from '../ui.js';

// Pajak UMKM: omzet per bulan & perkiraan PPh final 0,5% (PP 55/2022 jo. PP 20/2026).
const ENT = {
  op: ['Orang pribadi (perorangan)', 'Tarif 0,5% tanpa batas waktu. Omzet Rp500 juta pertama setiap tahun bebas pajak.'],
  pt_perorangan: ['PT perorangan', 'Tarif 0,5% tanpa batas waktu. Tidak ada pembebasan Rp500 juta.'],
  koperasi: ['Koperasi', 'Tarif 0,5% (cek batas waktu yang berlaku untuk koperasimu). Tidak ada pembebasan Rp500 juta.'],
  badan: ['CV / firma / PT biasa', 'Badan usaha ini tidak lagi bisa memakai tarif 0,5% (PP 20/2026). Pajak dihitung dari laba dengan tarif umum — konsultasikan ke konsultan pajak.']
};

export default {
  tour: [
    { sel: '#set', title: 'Jenis wajib pajak', body: 'Pilih sesuai NPWP usaha. Orang pribadi mendapat bebas pajak untuk omzet Rp500 juta pertama setiap tahun.' },
    { sel: '#tbl', title: 'Per bulan', body: 'Omzet dari aplikasi + omzet di luar aplikasi (tekan angka di kolom "Di luar aplikasi" untuk mengisi). PPh disetor paling lambat tanggal 15 bulan berikutnya.' }
  ],
  async render(el) {
    let year = +todayStr().slice(0, 4), d = null;
    el.innerHTML = `${pageHead('Pajak UMKM', 'Perkiraan PPh final 0,5% dari omzet. Hanya alat bantu hitung — bukan pengganti konsultan pajak.', `<button class="btn" id="xl">${icon('download', 18)} Excel</button><button class="btn" id="pdf">${icon('print', 18)} Cetak</button>`)}
      <div class="stack"><div class="row wrap" id="set">
        <label class="field" style="min-width:110px">Tahun<select class="input" id="y">${[0, 1, 2].map((i) => `<option ${i === 0 ? 'selected' : ''}>${year - i}</option>`).join('')}</select></label>
        <label class="field grow">Jenis wajib pajak<select class="input" id="e">${Object.entries(ENT).map(([k, [l]]) => `<option value="${k}">${l}</option>`).join('')}</select></label>
        <label class="field grow">Dasar omzet<select class="input" id="b"><option value="omzet">Omzet penjualan (harga jual ke pembeli)</option><option value="dana">Dana cair marketplace</option></select></label></div>
        <div id="body">${skeleton(3)}</div></div>`;
    const load = async () => {
      el.querySelector('#body').innerHTML = skeleton(3);
      try { d = await rpc('pajak_umkm', { p_year: year }); } catch (e) { return toastErr(e); }
      el.querySelector('#e').value = d.entity; el.querySelector('#b').value = d.basis;
      const rows = d.rows, now = todayStr().slice(0, 7);
      const next = rows.find((r) => r.bulan.slice(0, 7) === now) || rows[0];
      const pct = Math.min(100, (d.total_omzet / d.batas) * 100);
      el.querySelector('#body').innerHTML = `
        <div class="alert small ${d.entity === 'badan' ? 'red' : 'blue'}">${esc(ENT[d.entity][1])}</div>
        <div class="grid gauto">
          <div class="card kpi dark"><div class="label">Perkiraan PPh ${year}</div><div class="value">${d.entity === 'badan' ? '–' : rp(d.total_pph)}</div><div class="sub">0,5% × omzet kena pajak</div></div>
          <div class="card kpi"><div class="label">Omzet ${year}</div><div class="value">${rp(d.total_omzet)}</div><div class="sub">${d.free ? `${d.total_omzet <= d.free ? 'Masih di bawah' : 'Sudah lewat'} batas bebas ${rp(d.free)}` : 'Tanpa pembebasan'}</div></div>
          <div class="card kpi ${d.lewat_batas ? 'warn' : ''}"><div class="label">Batas omzet UMKM</div><div class="value">${Math.round(pct)}%</div><div class="hbar"><i style="width:${pct}%;${pct > 85 ? 'background:var(--red)' : ''}"></i></div><div class="sub">dari ${rp(d.batas)} / tahun${d.lewat_batas ? ' — <b>sudah lewat</b>, tahun depan tidak bisa 0,5%' : ''}</div></div>
          <div class="card kpi"><div class="label">Setor bulan ${esc(fmtDate(next.bulan, { month: 'long' }))}</div><div class="value">${next.pph == null ? '–' : rp(next.pph)}</div><div class="sub">paling lambat ${esc(fmtDate(next.jatuh_tempo, { day: 'numeric', month: 'long' }))}</div></div></div>
        <section class="card flush" id="tbl"><div class="card-h"><h2>Per bulan ${year}</h2></div><div class="table-wrap"><table class="tbl" style="min-width:860px"><thead><tr><th>Bulan</th><th class="right">Dari aplikasi</th><th class="right">Di luar aplikasi</th><th class="right">Omzet</th><th class="right">Kumulatif</th><th class="right">Bebas pajak</th><th class="right">Kena pajak</th><th class="right">PPh 0,5%</th><th>Setor paling lambat</th></tr></thead><tbody>
          ${rows.map((r) => `<tr ${r.lewat ? 'style="opacity:.45"' : ''}><td>${esc(fmtDate(r.bulan, { month: 'long' }))}</td><td class="num">${num(r.omzet_app)}</td>
            <td class="num"><button class="linkbtn" data-extra="${r.bulan.slice(0, 7)}" data-v="${r.omzet_lain}">${r.omzet_lain ? num(r.omzet_lain) : '+ isi'}</button></td>
            <td class="num">${num(r.omzet)}</td><td class="num">${num(r.kumulatif)}</td><td class="num">${num(r.bebas)}</td><td class="num">${num(r.dpp)}</td><td class="num"><b>${r.pph == null ? '–' : num(r.pph)}</b></td><td class="small">${r.pph ? esc(fmtDate(r.jatuh_tempo)) : ''}</td></tr>`).join('')}</tbody>
          <tfoot><tr><td>Total</td><td class="num">${num(rows.reduce((s, r) => s + Number(r.omzet_app), 0))}</td><td class="num">${num(rows.reduce((s, r) => s + Number(r.omzet_lain), 0))}</td><td class="num">${num(d.total_omzet)}</td><td></td><td class="num">${num(rows.reduce((s, r) => s + Number(r.bebas), 0))}</td><td class="num">${num(rows.reduce((s, r) => s + Number(r.dpp), 0))}</td><td class="num">${d.entity === 'badan' ? '–' : num(d.total_pph)}</td><td></td></tr></tfoot></table></div></section>
        <details class="card"><summary style="cursor:pointer;font-weight:700">Aturan yang dipakai</summary><div class="small" style="margin-top:8px;line-height:1.7">
          • PPh final UMKM 0,5% dari omzet bruto untuk peredaran bruto sampai Rp4,8 miliar setahun (PP 55/2022, diubah PP 20/2026 berlaku 22 April 2026).<br>
          • Orang pribadi & PT perorangan boleh memakai 0,5% tanpa batas waktu. CV, firma, dan PT biasa tidak lagi bisa.<br>
          • Khusus orang pribadi: omzet sampai Rp500 juta per tahun (dihitung kumulatif sejak Januari) tidak dikenai pajak.<br>
          • Setor PPh paling lambat tanggal 15 bulan berikutnya, lewat e-Billing / Coretax.<br>
          • Omzet marketplace dihitung dari pesanan yang tidak cancel / retur. Tambahkan omzet toko offline / grosir di kolom "Di luar aplikasi".<br>
          • Aturan pajak bisa berubah. Pastikan ke kantor pajak atau konsultan sebelum menyetor.</div></details>`;
    };
    const save = async (p) => { try { await rpc('pajak_save', { p }); load(); } catch (e) { toastErr(e); } };
    el.querySelector('#y').onchange = (e) => { year = +e.target.value; load(); };
    el.querySelector('#e').onchange = (e) => save({ tax_entity: e.target.value });
    el.querySelector('#b').onchange = (e) => save({ tax_basis: e.target.value });
    on(el, 'click', '[data-extra]', async (e, b) => {
      const r = await modal({ title: 'Omzet di luar aplikasi · ' + fmtDate(b.dataset.extra + '-01', { month: 'long', year: 'numeric' }), body: `<label class="field">Omzet toko offline / grosir / marketplace lain<input class="input num" id="x" inputmode="numeric" data-money value="${num(b.dataset.v)}"></label>`,
        actions: [{ label: 'Batal', value: null }, { label: 'Simpan', cls: 'btn-primary', onClick: (ov) => parseNum(ov.querySelector('#x').value) }] });
      if (r !== null && r !== undefined) { await save({ month: b.dataset.extra, extra: r }); toast('Tersimpan', 'ok'); }
    });
    el.querySelector('#pdf').onclick = () => window.print();
    el.querySelector('#xl').onclick = () => d && downloadXlsx(`pajak-umkm-${year}.xlsx`, d.rows.map((r) => ({ Bulan: r.bulan.slice(0, 7), 'Dari aplikasi': Number(r.omzet_app), 'Di luar aplikasi': Number(r.omzet_lain), Omzet: Number(r.omzet), Kumulatif: Number(r.kumulatif), 'Bebas pajak': Number(r.bebas), 'Kena pajak': Number(r.dpp), 'PPh 0,5%': r.pph == null ? '' : Number(r.pph), 'Setor paling lambat': r.jatuh_tempo })), 'Pajak');
    void store;
    load();
  }
};
