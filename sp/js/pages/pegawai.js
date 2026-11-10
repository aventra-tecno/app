import { supa, tempClient, errMsg } from '../supa.js';
import { store, loadProfiles } from '../store.js';
import { esc, rp, num, on, modal, toast, toastErr, pageHead, emptyState, skeleton, icon, ROLE_LABEL, parseNum, confirmBox, ago } from '../ui.js';
import { fetchLatest, isOutdated } from '../version.js';
import { ROLE_MOD, modOn } from '../modules.js';

const ROLES = ['admin', 'sopir', 'kepala_gudang', 'picker', 'packing', 'supervisor', 'keuangan', 'qc', 'cs', 'marketing'];
const DESC = {
  admin: 'Upload file Shopee, pesanan, beli WIN, master barang',
  sopir: 'Tugas ambil barang di pabrik WIN',
  kepala_gudang: 'Terima barang, stok & rak, retur, stok opname',
  picker: 'Ambil barang dari rak sesuai daftar',
  packing: 'Scan resi & barang, foto paket',
  supervisor: 'Semua tugas kepala gudang + kinerja pegawai, multi gudang, saran stok',
  keuangan: 'Kas & rekening, hutang supplier, laporan premium, pajak',
  qc: 'Periksa paket sebelum dikirim (lolos / gagal + foto)',
  cs: 'Komplain & garansi pembeli, lihat pesanan',
  marketing: 'Katalog harga grosir, lihat stok'
};
const locked = (r) => ROLE_MOD[r] && !modOn(ROLE_MOD[r]);

export default {
  tour: [
    { sel: '#add', title: 'Buat akun pegawai', body: 'Isi nama, email, password awal, dan jabatan. Pegawai login dengan email & password itu.' },
    { sel: '#list', title: 'Ubah jabatan & gaji', body: 'Tekan pegawai untuk mengubah jabatan, gaji pokok, uang makan, atau menonaktifkan akun.' }
  ],
  async render(el) {
    el.innerHTML = `${pageHead('Pegawai & jabatan', 'Setiap pegawai punya akun sendiri, supaya setiap scan tercatat siapa yang melakukannya.', `<button class="btn btn-primary" id="add">${icon('plus', 18)} Tambah pegawai</button>`)}
      <div class="stack"><div id="pending"></div><div class="small muted" id="verhead"></div><div class="card flush" id="list">${skeleton()}</div>
      <details class="card"><summary style="cursor:pointer;font-weight:700">Hak akses tiap jabatan</summary><div class="list" style="margin-top:8px">${ROLES.map((r) => `<div class="list-item" style="padding:8px 0"><b style="width:130px">${ROLE_LABEL[r]}</b><span class="small muted grow">${DESC[r]}</span>${locked(r) ? `<a class="tag" href="#/modul">${icon('lock', 12)} terkunci</a>` : ''}</div>`).join('')}
        <div class="list-item" style="padding:8px 0"><b style="width:130px">Owner</b><span class="small muted grow">Semua menu, laba, gaji, harga, kecurangan, notifikasi semua jabatan</span></div></div></details></div>`;
    const load = async () => {
      const [{ data, error }, latest] = await Promise.all([supa.from('profiles').select('*').order('role').order('full_name'), fetchLatest()]);
      const verInfo = (p) => p.app_version
        ? `<div class="xs" style="margin-top:3px"><span class="tag ${isOutdated(p.app_version, latest) ? 'red' : 'green'}">v${esc(p.app_version)}${isOutdated(p.app_version, latest) ? ' · versi lama' : ''}</span> <span class="muted">${esc(p.app_device || '')}${p.app_seen_at ? ' · dibuka ' + esc(ago(p.app_seen_at)) : ''}</span></div>`
        : '<div class="xs muted" style="margin-top:3px">Belum membuka aplikasi versi 1.7+</div>';
      if (error) return toastErr(error);
      const pend = data.filter((p) => p.role === 'pending');
      el.querySelector('#pending').innerHTML = pend.length ? `<div class="card warn"><b>${pend.length} akun menunggu jabatan</b><div class="list">${pend.map((p) => `<div class="list-item" style="padding:8px 0"><span class="grow">${esc(p.full_name)} <span class="xs muted">${esc(p.email || '')}</span></span><button class="btn btn-sm" data-edit="${p.id}">Atur jabatan</button></div>`).join('')}</div></div>` : '';
      const staff = data.filter((p) => p.role !== 'pending');
      el.querySelector('#list').innerHTML = staff.length ? `<div class="list">${staff.map((p) => `<button class="list-item" data-edit="${p.id}" ${p.role === 'owner' ? 'disabled style="cursor:default"' : ''}>
        <div class="grow"><b>${esc(p.full_name)}</b> ${p.active ? '' : '<span class="tag red">nonaktif</span>'}<div class="xs muted">${esc(p.email || '')}</div>${verInfo(p)}</div>
        <span class="tag ${p.role === 'owner' ? 'dark' : ''}">${ROLE_LABEL[p.role]}</span>${p.role !== 'owner' && modOn('gaji') ? `<span class="small muted hide-mobile" style="width:150px;text-align:right">${rp(p.base_salary)} + ${rp(p.meal_allowance)}/hr</span>` : ''}</button>`).join('')}</div>` : emptyState('Belum ada pegawai.', 'users');
      el._staff = data;
      const old = staff.filter((p) => p.role !== 'owner' && p.app_version && isOutdated(p.app_version, latest)).length;
      el.querySelector('#verhead').innerHTML = latest && latest.build !== 'dev' ? `Versi terbaru: <b>v${esc(latest.version)}</b>${old ? ` · <span style="color:var(--red)">${old} pegawai masih memakai versi lama</span> (minta tutup-buka aplikasi atau tekan Perbarui)` : ' · semua pegawai sudah versi terbaru'}` : '';
    };

    const form = (p = {}) => `<div class="grid g2">
      <label class="field" style="grid-column:1/-1">Nama lengkap<input class="input" id="f-n" value="${esc(p.full_name || '')}"></label>
      ${!p.id ? `<label class="field">Email login<input class="input" id="f-e" type="email" autocomplete="off"></label><label class="field">Password awal (min. 6)<input class="input" id="f-p" type="text" autocomplete="off" value="${Math.random().toString(36).slice(2, 8)}"></label>` : ''}
      <label class="field" style="grid-column:1/-1">Jabatan<select class="input" id="f-r">${ROLES.map((r) => `<option value="${r}" ${p.role === r ? 'selected' : ''} ${locked(r) && p.role !== r ? 'disabled' : ''}>${locked(r) ? '🔒 ' : ''}${ROLE_LABEL[r]} — ${DESC[r]}${locked(r) ? ' (terkunci)' : ''}</option>`).join('')}</select>
        ${ROLES.some(locked) ? '<span class="xs muted">Jabatan bergembok bisa dibuka di <a href="#/modul" data-close-modal>Menu tambahan</a>.</span>' : ''}</label>
      <label class="field">Gaji pokok / bulan<input class="input num" id="f-s" inputmode="numeric" data-money value="${num(p.base_salary || 0)}" ${modOn('gaji') ? '' : 'disabled'}></label>
      <label class="field">Uang makan / hari hadir<input class="input num" id="f-m" inputmode="numeric" data-money value="${num(p.meal_allowance || 0)}" ${modOn('gaji') ? '' : 'disabled'}></label>
      ${modOn('gaji') ? '' : `<div class="xs muted" style="grid-column:1/-1">${icon('lock', 12)} Gaji belum bisa diisi — menu <b>Penggajian</b> masih terkunci (<a href="#/modul" data-close-modal>Menu tambahan</a>).</div>`}
      <label class="field" style="grid-column:1/-1">No. HP<input class="input" id="f-h" value="${esc(p.phone || '')}" inputmode="tel"></label>
      ${p.id ? `<label class="check" style="grid-column:1/-1"><input type="checkbox" id="f-a" ${p.active ? 'checked' : ''}> Akun aktif (matikan kalau pegawai berhenti)</label>` : ''}
    </div>`;

    el.querySelector('#add').onclick = async () => {
      const r = await modal({
        title: 'Tambah pegawai', body: form() + `<div class="alert blue small" style="margin-top:12px">Berikan email & password ini ke pegawai. Mereka bisa ganti password sendiri di menu Akun saya.</div>`,
        actions: [{ label: 'Batal', value: null }, { label: 'Buat akun', cls: 'btn-primary', onClick: async (ov) => {
          const v = (id) => ov.querySelector('#' + id).value.trim();
          const email = v('f-e'), password = v('f-p'), full_name = v('f-n');
          if (!full_name || !email || password.length < 6) { toast('Isi nama, email, dan password minimal 6 karakter', 'err'); return false; }
          const tc = tempClient();
          const { data, error } = await tc.auth.signUp({ email, password, options: { data: { full_name, app: 'sp' } } });
          if (error) throw new Error(errMsg(error));
          const uid = data.user?.id;
          if (!uid) throw new Error('Akun tidak terbentuk. Cek pengaturan Auth di Supabase.');
          if (data.user.identities && data.user.identities.length === 0) throw new Error('Email ini sudah terdaftar.');
          const { error: e2 } = await supa.from('profiles').update({ full_name, role: v('f-r'), base_salary: parseNum(v('f-s')), meal_allowance: parseNum(v('f-m')), phone: v('f-h') || null }).eq('id', uid);
          if (e2) throw e2;
          await tc.auth.signOut().catch(() => {});
          return { email, password };
        } }]
      });
      if (r) {
        await modal({ title: 'Akun dibuat', body: `<p style="margin-top:0">Kirim data login ini ke pegawai:</p><div class="card" style="background:var(--paper)"><div class="line-row"><span>Alamat</span><b>${esc(location.origin + location.pathname)}</b></div><div class="line-row"><span>Email</span><b>${esc(r.email)}</b></div><div class="line-row"><span>Password</span><b class="mono">${esc(r.password)}</b></div></div>
          <p class="small muted">Kalau muncul pesan “Email not confirmed” saat pegawai login, matikan <b>Confirm email</b> di Supabase › Authentication › Sign In / Providers › Email (lihat README).</p>` });
        await loadProfiles(); load();
      }
    };

    on(el, 'click', '[data-edit]', async (e, b) => {
      const p = el._staff.find((x) => x.id === b.dataset.edit);
      if (!p || p.role === 'owner') return;
      const r = await modal({
        title: 'Ubah ' + p.full_name, body: form(p),
        actions: [{ label: 'Reset panduan', value: 'tour' }, { label: 'Batal', value: null }, { label: 'Simpan', cls: 'btn-primary', onClick: async (ov) => {
          const v = (id) => ov.querySelector('#' + id).value.trim();
          const { error } = await supa.from('profiles').update({ full_name: v('f-n'), role: v('f-r'), base_salary: parseNum(v('f-s')), meal_allowance: parseNum(v('f-m')), phone: v('f-h') || null, active: ov.querySelector('#f-a').checked }).eq('id', p.id);
          if (error) throw error; return 'ok';
        } }]
      });
      if (r === 'tour' && await confirmBox('Reset panduan?', `Panduan pengenalan akan muncul lagi saat ${esc(p.full_name)} login berikutnya.`)) {
        const { error } = await supa.from('profiles').update({ tour_done: {}, tour_auto: true }).eq('id', p.id);
        if (error) return toastErr(error);
        toast('Panduan direset', 'ok');
      }
      if (r === 'ok') { toast('Tersimpan', 'ok'); await loadProfiles(); load(); }
    });
    load();
  }
};
