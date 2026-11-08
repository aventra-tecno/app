import { supa, rpc } from '../supa.js';
import { store } from '../store.js';
import { esc, todayStr, monthStart, fmtDate, fmtTime, longToday, toast, toastErr, emptyState, photoField, bindPhoto, modal, icon, num } from '../ui.js';
import { modOn, lockBox } from '../modules.js';

// Absen harian berdasarkan LOKASI KANTOR (latitude, longitude, radius meter).
// Owner: mengatur titik kantor & aturan. Pegawai: absen masuk / pulang (GPS wajib kalau titik kantor sudah diatur).
// Tambahan "Absen selfie wajib": selfie wajib saat absen.
const getPos = () => new Promise((resolve, reject) => {
  if (!navigator.geolocation) return reject(new Error('HP / browser ini tidak mendukung lokasi GPS'));
  navigator.geolocation.getCurrentPosition((p) => resolve(p.coords), (e) => reject(new Error(e.code === 1 ? 'Akses lokasi ditolak. Izinkan lokasi untuk aplikasi ini di pengaturan HP, lalu coba lagi.' : 'Lokasi belum didapat. Pastikan GPS menyala lalu coba lagi.')), { enableHighAccuracy: true, timeout: 20000, maximumAge: 15000 });
});
const mapLink = (lat, lng) => `https://www.google.com/maps?q=${lat},${lng}`;

export default {
  async render(el) {
    if (store.role === 'owner') return officeSettings(el);
    const selfie = modOn('absen_lokasi');
    const office = store.settings.office_lat != null && store.settings.office_lng != null;
    const load = async () => {
      const { data } = await supa.from('attendance').select('*').eq('user_id', store.profile.id).gte('work_date', monthStart()).order('work_date', { ascending: false });
      const today = (data || []).find((a) => a.work_date === todayStr());
      el.innerHTML = `<div class="stack">
        <div class="hero"><div class="label">${esc(longToday())}</div>
          <div class="big">${today ? (today.check_out ? 'Sudah pulang' : 'Sudah masuk') : 'Belum absen'}</div>
          <div class="small" style="color:#C9CCC8">${today ? `Masuk ${fmtTime(today.check_in)}${today.check_out ? ' · pulang ' + fmtTime(today.check_out) : ''}` : 'Jam dicatat dari server, bukan dari HP.'}</div></div>
        ${office ? `<div class="alert blue small">${icon('compass', 16)} Absen hanya bisa di <b>lokasi kantor</b> (radius ${num(store.settings.office_radius)} m). Nyalakan GPS.${selfie ? ' Selfie wajib.' : ''}</div>`
          : `<div class="alert yellow small">Lokasi kantor belum diatur owner, jadi lokasi tidak dicek.</div>`}
        ${!today ? `<button class="btn btn-primary btn-lg" id="in">${icon('clock', 20)} Absen masuk</button>` : !today.check_out ? `<button class="btn btn-dark btn-lg" id="out">${icon('logout', 20)} Absen pulang</button>` : ''}
        <div class="card flush"><div class="card-h"><h2>Bulan ini</h2><b>${(data || []).length} hari hadir</b></div>
          ${data?.length ? `<div class="list">${data.map((a) => `<div class="list-item"><span class="grow">${fmtDate(a.work_date, { weekday: 'short', day: 'numeric', month: 'short' })}${a.outside ? ' <span class="tag red">di luar lokasi</span>' : ''}</span><span class="small">${fmtTime(a.check_in)} – ${a.check_out ? fmtTime(a.check_out) : '…'}</span></div>`).join('')}</div>` : emptyState('Belum ada absen bulan ini.', 'clock')}</div></div>`;
      const go = async (kind) => {
        let get = () => null, pos = null;
        const ok = await modal({ title: kind === 'masuk' ? 'Absen masuk' : 'Absen pulang', body: `<div class="stack">
            ${office ? `<div class="small" id="gp">${icon('compass', 16)} Mengambil lokasi…</div>` : ''}
            ${selfie ? `<p class="muted" style="margin:0">Ambil selfie di tempat kerja (wajib).</p>${photoField('sf', 'Ketuk untuk selfie')}` : '<p class="muted" style="margin:0">Tekan "Absen sekarang".</p>'}</div>`,
          actions: [{ label: 'Batal', value: false }, { label: 'Absen sekarang', cls: 'btn-primary', onClick: () => {
            if (selfie && !get()) { toast('Selfie wajib', 'err'); return false; }
            if (office && !pos) { toast('Lokasi belum didapat. Tunggu sebentar / nyalakan GPS.', 'err'); return false; }
            return true;
          } }],
          onOpen: (ov) => {
            if (selfie) get = bindPhoto(ov, 'sf', 'absen');
            if (office) getPos().then((c) => { pos = c; const g = ov.querySelector('#gp'); if (g) g.innerHTML = `${icon('check', 16)} Lokasi didapat (akurasi ±${Math.round(c.accuracy)} m)`; })
              .catch((e) => { const g = ov.querySelector('#gp'); if (g) g.innerHTML = `<span style="color:var(--red)">${esc(e.message)}</span>`; });
          } });
        if (!ok) return;
        try {
          const r = await rpc('absen', { p_kind: kind, p_lat: pos?.latitude ?? null, p_lng: pos?.longitude ?? null, p_acc: pos?.accuracy ?? null, p_photo: get() });
          toast(`Absen ${kind} tercatat${r?.dist != null ? ` · ±${num(r.dist)} m dari kantor` : ''}${r?.outside ? ' (di luar lokasi)' : ''}`, r?.outside ? 'err' : 'ok');
        } catch (e) { return toastErr(e); }
        load();
      };
      el.querySelector('#in')?.addEventListener('click', () => go('masuk'));
      el.querySelector('#out')?.addEventListener('click', () => go('pulang'));
    };
    load();
  }
};

// owner: titik lokasi kantor + radius + aturan
function officeSettings(el) {
  const s = store.settings;
  el.innerHTML = `<div class="stack" style="max-width:760px">
    <div class="page-head"><div><h2 style="font-size:22px">Lokasi kantor untuk absen</h2></div></div>
    <section class="card stack" id="loc">
      <div class="grid g2">
        <label class="field">Latitude<input class="input num" id="la" inputmode="decimal" placeholder="-6.200000" value="${s.office_lat ?? ''}"></label>
        <label class="field">Longitude<input class="input num" id="lo" inputmode="decimal" placeholder="106.816666" value="${s.office_lng ?? ''}"></label>
        <label class="field">Radius area kerja (meter)<input class="input num" id="lr" type="number" min="20" value="${s.office_radius || 150}"></label>
        <label class="field">Kalau di luar radius<select class="input" id="ls"><option value="1" ${s.office_strict !== false ? 'selected' : ''}>Tolak absen</option><option value="0" ${s.office_strict === false ? 'selected' : ''}>Tetap boleh, tapi ditandai & owner diberi tahu</option></select></label>
      </div>
      <div class="row wrap"><button class="btn" id="lh">${icon('compass', 16)} Pakai lokasi saya sekarang</button><a class="btn" id="lm" target="_blank" rel="noopener">${icon('eye', 16)} Lihat di peta</a><button class="btn btn-primary" id="sv">Simpan</button></div>
      <div class="xs muted">Cara mengisi: buka Google Maps › tekan lama titik kantor › angka yang muncul (mis. <span class="mono">-6.2000, 106.8166</span>) = latitude, longitude. Atau tekan "Pakai lokasi saya sekarang" saat berada di kantor. GPS HP biasanya meleset 10–50 m, jadi radius 100–200 m disarankan. Kosongkan latitude & longitude untuk mematikan cek lokasi.</div>
    </section>
    ${modOn('rekap_absen') ? `<a class="card dh-absen" href="#/rekap-absen">${icon('calendar', 18)}<span class="grow"><b>Rekap absensi</b><span class="xs muted" style="display:block">Hadir, telat, pulang awal, di luar lokasi per pegawai</span></span>${icon('chev', 16)}</a>` : lockBox('rekap_absen')}
  </div>`;
  const v = (id) => el.querySelector('#' + id);
  const mapUpd = () => { const a = parseFloat(v('la').value.replace(',', '.')), b = parseFloat(v('lo').value.replace(',', '.')); v('lm').href = isFinite(a) && isFinite(b) ? mapLink(a, b) : 'https://www.google.com/maps'; };
  // tempel "lat, lng" sekaligus dari Google Maps
  v('la').addEventListener('input', () => { const m = v('la').value.match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/); if (m) { v('la').value = m[1]; v('lo').value = m[2]; } mapUpd(); });
  v('lo').addEventListener('input', mapUpd); mapUpd();
  v('lh').onclick = async (e) => {
    const b = e.currentTarget; b.disabled = true;
    try { const c = await getPos(); v('la').value = c.latitude.toFixed(6); v('lo').value = c.longitude.toFixed(6); mapUpd(); toast(`Lokasi didapat (akurasi ±${Math.round(c.accuracy)} m). Tekan Simpan.`, 'ok'); } catch (err) { toastErr(err); }
    b.disabled = false;
  };
  v('sv').onclick = async () => {
    const la2 = v('la').value.trim() ? parseFloat(v('la').value.replace(',', '.')) : null, lo2 = v('lo').value.trim() ? parseFloat(v('lo').value.replace(',', '.')) : null;
    try {
      await rpc('office_save', { p_lat: la2, p_lng: lo2, p_radius: +v('lr').value || 150, p_strict: v('ls').value === '1' });
      Object.assign(store.settings, { office_lat: la2, office_lng: lo2, office_radius: +v('lr').value || 150, office_strict: v('ls').value === '1' });
      toast('Lokasi kantor tersimpan', 'ok');
    } catch (err) { toastErr(err); }
  };
}
