import { rpc } from '../supa.js';
import { esc, num, todayStr, fmtDate, fmtTime, on, modal, toastErr, pageHead, emptyState, skeleton, icon, ROLE_LABEL, downloadXlsx } from '../ui.js';

// Rekap absensi bulanan: diambil dari data absen (hadir, telat, pulang awal, tanpa absen pulang, di luar lokasi, jam kerja)
const jam = (m) => (m ? `${Math.floor(m / 60)}j ${String(m % 60).padStart(2, '0')}m` : '–');
const mapLink = (lat, lng) => `https://www.google.com/maps?q=${lat},${lng}`;

export default {
  tour: [{ sel: '#rk', title: 'Rekap per pegawai', body: 'Tekan nama pegawai untuk melihat detail per hari, termasuk jarak dari kantor.' }],
  async render(el) {
    let month = todayStr().slice(0, 7), d = null;
    el.innerHTML = `${pageHead('Rekap absensi', 'Rekap kehadiran per bulan, otomatis dari data absen.', `<button class="btn" id="xl">${icon('download', 18)} Excel</button>`)}
      <div class="stack"><div class="row"><input class="input" type="month" id="m" value="${month}" style="max-width:220px"></div>
        <div id="sum"></div><section class="card flush" id="rk">${skeleton(3)}</section></div>`;
    const load = async () => {
      el.querySelector('#rk').innerHTML = skeleton(3);
      try { d = await rpc('absen_rekap_bulan', { p_month: month + '-01' }); } catch (e) { toastErr(e); el.querySelector('#rk').innerHTML = `<div class="alert yellow" style="margin:12px">${esc(e.message)}</div>`; return; }
      const R = d.rows;
      const tot = (k) => R.reduce((s, r) => s + Number(r[k] || 0), 0);
      el.querySelector('#sum').innerHTML = `<div class="grid gauto">
        <div class="card kpi dark"><div class="label">Total kehadiran</div><div class="value">${num(tot('hadir'))} hari</div><div class="sub">${R.length} pegawai · jam kerja ${esc(String(d.jam_mulai).slice(0, 5))}–${esc(String(d.jam_selesai).slice(0, 5))}</div></div>
        <div class="card kpi ${tot('telat') ? 'warn' : ''}"><div class="label">Telat</div><div class="value">${num(tot('telat'))}</div><div class="sub">lebih dari 10 menit</div></div>
        <div class="card kpi"><div class="label">Pulang awal</div><div class="value">${num(tot('pulang_awal'))}</div><div class="sub">${num(tot('tanpa_pulang'))} tanpa absen pulang</div></div>
        <div class="card kpi ${tot('luar_lokasi') ? 'warn' : ''}"><div class="label">Di luar lokasi</div><div class="value">${num(tot('luar_lokasi'))}</div></div></div>`;
      el.querySelector('#rk').innerHTML = R.length ? `<div class="table-wrap"><table class="tbl"><thead><tr><th>Pegawai</th><th class="right">Hadir</th><th class="right">Telat</th><th class="right">Pulang awal</th><th class="right">Tanpa pulang</th><th class="right">Luar lokasi</th><th class="right">Jam kerja</th></tr></thead><tbody>
        ${R.map((r, i) => `<tr data-i="${i}" style="cursor:pointer"><td><b>${esc(r.name)}</b><div class="xs muted">${esc(ROLE_LABEL[r.role] || r.role)}</div></td><td class="num"><b>${r.hadir}</b></td>
          <td class="num ${r.telat ? 'warn-t' : ''}">${r.telat || ''}</td><td class="num">${r.pulang_awal || ''}</td><td class="num">${r.tanpa_pulang || ''}</td><td class="num ${r.luar_lokasi ? 'neg' : ''}">${r.luar_lokasi || ''}</td><td class="num">${jam(Number(r.menit))}</td></tr>`).join('')}</tbody></table></div>`
        : emptyState('Belum ada pegawai.', 'users');
    };
    on(el, 'click', '[data-i]', (e, tr) => {
      const r = d.rows[+tr.dataset.i];
      modal({ title: r.name + ' · ' + fmtDate(d.from, { month: 'long', year: 'numeric' }), wide: true, body: r.hari.length ? `<div class="list no-page">${r.hari.map((h) => `<div class="list-item"><span class="grow">${fmtDate(h.d, { weekday: 'short', day: 'numeric', month: 'short' })}${h.outside ? ' <span class="tag red">di luar lokasi</span>' : ''}
          <span class="xs muted" style="display:block">${h.dist != null ? '±' + num(h.dist) + ' m dari kantor' : 'tanpa lokasi'}${h.lat ? ` · <a href="${mapLink(h.lat, h.lng)}" target="_blank" rel="noopener">peta</a>` : ''}</span></span>
          <span class="small">${fmtTime(h.in)} – ${h.out ? fmtTime(h.out) : '…'}</span></div>`).join('')}</div>` : emptyState('Tidak ada absen di bulan ini.', 'clock'),
        actions: [{ label: 'Tutup', cls: 'btn-primary', value: null }] });
    });
    el.querySelector('#m').onchange = (e) => { month = e.target.value || month; load(); };
    el.querySelector('#xl').onclick = () => d && downloadXlsx(`rekap-absensi-${month}.xlsx`, d.rows.map((r) => ({ Nama: r.name, Jabatan: ROLE_LABEL[r.role] || r.role, Hadir: r.hadir, Telat: r.telat, 'Pulang awal': r.pulang_awal, 'Tanpa absen pulang': r.tanpa_pulang, 'Di luar lokasi': r.luar_lokasi, 'Jam kerja (menit)': Number(r.menit) })), 'Rekap');
    load();
  }
};
