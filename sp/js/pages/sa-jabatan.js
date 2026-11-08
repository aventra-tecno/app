import { rpc } from '../supa.js';
import { store } from '../store.js';
import { esc, icon, toastErr, ROLE_LABEL } from '../ui.js';
import { saGuard } from './superadmin.js';
import { ROLE_MOD, modOn } from '../modules.js';

// Super admin › Masuk sebagai jabatan: aplikasi tampil & bekerja persis seperti jabatan itu.
export const SA_ROLES = [['owner', 'Semua menu toko, laporan, harga, pegawai'], ['admin', 'Pesanan, upload file, beli WIN'], ['kepala_gudang', 'Catat, terima, stok, retur, opname'],
  ['picker', 'Ambil barang dari rak'], ['packing', 'Packing & scan resi'], ['sopir', 'Tugas ambil barang WIN'],
  ['supervisor', 'Kepala gudang + kinerja, multi gudang'], ['keuangan', 'Kas, laporan, pajak'], ['qc', 'Cek paket sebelum kirim'], ['cs', 'Komplain pembeli'], ['marketing', 'Katalog grosir']];

export async function actAs(role) {
  await rpc('sa_act_as', { p_role: role });
  try { sessionStorage.setItem('sa-role', role); } catch (_) {}
  location.hash = ''; location.reload();
}

export default {
  async render(el) {
    if (!saGuard(el)) return;
    el.innerHTML = `<div class="stack" style="max-width:860px">
      <div class="alert blue small">Pilih jabatan untuk melihat dan memakai aplikasi <b>persis seperti jabatan itu</b> (menu, tombol, dan izin datanya sama). Semua tindakanmu tetap tercatat sebagai Super admin. Tekan <b>Kembali ke super admin</b> di bar merah untuk kembali ke menu ini.</div>
      <div class="sa-grid">${SA_ROLES.map(([r, d]) => { const lock = ROLE_MOD[r] && !modOn(ROLE_MOD[r]);
        return `<button class="sa-role" data-r="${r}"><b>${esc(ROLE_LABEL[r])}${lock ? ` <span class="tag">${icon('lock', 11)} terkunci</span>` : ''}</b><span>${esc(d)}</span></button>`; }).join('')}</div>
      <div class="xs muted">Jabatan yang masih terkunci tetap bisa dicoba: tampilannya sama dengan yang dilihat pegawai (halaman "minta owner membuka").</div></div>`;
    el.querySelectorAll('[data-r]').forEach((b) => b.addEventListener('click', async () => {
      el.querySelectorAll('[data-r]').forEach((x) => { x.disabled = true; });
      try { await actAs(b.dataset.r); } catch (e) { toastErr(e); el.querySelectorAll('[data-r]').forEach((x) => { x.disabled = false; }); }
    }));
    void store;
  }
};
