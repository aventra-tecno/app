import { rpc } from '../supa.js';
import { esc, num, todayStr, addDays, monthStart, chips, on, toastErr, pageHead, emptyState, skeleton, icon, ROLE_LABEL, ROLE_COLOR, downloadXlsx } from '../ui.js';

// Kinerja pegawai: jumlah kerja, kecepatan, kesalahan per orang. Dasar pemberian bonus.
export default {
  tour: [
    { sel: '#rank', title: 'Peringkat', body: 'Diurutkan dari nilai tertinggi. Nilai = poin kerja − poin kesalahan.' },
    { sel: '#cara', title: 'Cara hitung', body: 'Lihat di sini poin untuk setiap pekerjaan dan kesalahan.' }
  ],
  async render(el) {
    let period = 'month', rows = [];
    const range = () => { const t = todayStr(); return period === 'last' ? [monthStart(addDays(monthStart(t), -1)), addDays(monthStart(t), -1)] : period === '7' ? [addDays(t, -6), t] : period === 'today' ? [t, t] : [monthStart(t), t]; };
    el.innerHTML = `${pageHead('Kinerja pegawai', 'Siapa yang paling banyak bekerja dan paling sedikit salah. Data diambil otomatis dari scan, absen, QC, komplain, dan catatan masalah.', `<button class="btn" id="xl">${icon('download', 18)} Excel</button>`)}
      <div class="stack">${chips('p', [['today', 'Hari ini'], ['7', '7 hari'], ['month', 'Bulan ini'], ['last', 'Bulan lalu']], period)}
        <div id="rank">${skeleton(3)}</div>
        <details class="card" id="cara"><summary style="cursor:pointer;font-weight:700">Cara menghitung nilai</summary><div class="small" style="margin-top:8px;line-height:1.7">
          <b>Poin kerja</b>: 1 per resi dicatat · 1 per resi dipacking · 1 per barang diambil dari rak · 1 per barang diterima dari WIN · 5 per tugas sopir selesai · 1 per paket di-QC · 3 per komplain diselesaikan CS.<br>
          <b>Poin kesalahan</b>: 5 per catatan masalah / kecurangan · 3 per paket gagal QC (milik pemacking) · 5 per komplain barang salah / kurang (milik pemacking) · 1 per hari telat absen (lebih dari 10 menit dari jam mulai).<br>
          Gunakan sebagai bahan pertimbangan bonus, bukan satu-satunya dasar.</div></details></div>`;
    const load = async () => {
      const [a, b] = range();
      el.querySelector('#rank').innerHTML = skeleton(3);
      try { rows = (await rpc('kinerja_pegawai', { p_from: a, p_to: b })).rows || []; } catch (e) { return toastErr(e); }
      const maxK = Math.max(1, ...rows.map((r) => r.kerja));
      el.querySelector('#rank').innerHTML = rows.length ? `<div class="kin-list">${rows.map((r, i) => {
        const nilai = r.kerja - r.salah;
        const stat = [['Hadir', r.hadir + ' hr'], r.telat ? ['Telat', r.telat + ' hr'] : null, r.catat ? ['Resi dicatat', num(r.catat)] : null, r.packing ? ['Dipacking', num(r.packing)] : null,
          r.pack_menit != null ? ['Rata-rata pesanan → packing', r.pack_menit + ' mnt'] : null, r.ambil ? ['Barang diambil', num(r.ambil)] : null, r.terima ? ['Barang diterima', num(r.terima)] : null,
          r.antar ? ['Tugas sopir', num(r.antar)] : null, r.qc ? ['Paket di-QC', num(r.qc)] : null, r.cs_selesai ? ['Komplain selesai', num(r.cs_selesai)] : null].filter(Boolean);
        const bad = [r.masalah ? ['Masalah', r.masalah] : null, r.qc_gagal ? ['Gagal QC', r.qc_gagal] : null, r.komplain ? ['Komplain salah kirim', r.komplain] : null].filter(Boolean);
        return `<div class="card kin ${i === 0 && nilai > 0 ? 'top' : ''}"><div class="kin-h"><span class="rank">${i + 1}</span><div class="grow" style="min-width:0"><b>${esc(r.full_name)}</b><div class="xs" style="color:${ROLE_COLOR[r.role] || ''}">${esc(ROLE_LABEL[r.role] || r.role)}</div></div>
          <div style="text-align:right"><div class="kin-score ${nilai < 0 ? 'neg' : ''}">${num(nilai)}</div><div class="xs muted">nilai</div></div></div>
          <div class="hbar"><i style="width:${(r.kerja / maxK) * 100}%"></i></div>
          <div class="kin-stats">${stat.map(([l, v]) => `<span><small>${esc(l)}</small><b>${esc(v)}</b></span>`).join('')}</div>
          ${bad.length ? `<div class="kin-bad">${bad.map(([l, v]) => `<span class="tag red">${esc(l)}: ${v}</span>`).join(' ')}</div>` : '<div class="xs" style="color:var(--green)">Tanpa kesalahan tercatat</div>'}</div>`;
      }).join('')}</div>` : `<div class="card">${emptyState('Belum ada pegawai aktif.', 'users')}</div>`;
    };
    on(el, 'click', '[data-chips] .chip', (e, b) => { b.parentElement.querySelectorAll('.chip').forEach((c) => c.classList.toggle('on', c === b)); period = b.dataset.v; load(); });
    el.querySelector('#xl').onclick = () => downloadXlsx('kinerja-pegawai.xlsx', rows.map((r) => ({ Nama: r.full_name, Jabatan: ROLE_LABEL[r.role] || r.role, Hadir: r.hadir, Telat: r.telat, 'Resi dicatat': r.catat, Dipacking: r.packing, 'Menit ke packing': r.pack_menit, 'Barang diambil': r.ambil, 'Barang diterima': r.terima, 'Tugas sopir': r.antar, QC: r.qc, 'Komplain selesai': r.cs_selesai, Masalah: r.masalah, 'Gagal QC': r.qc_gagal, 'Komplain salah kirim': r.komplain, 'Poin kerja': r.kerja, 'Poin salah': r.salah, Nilai: r.kerja - r.salah })), 'Kinerja');
    load();
  }
};
