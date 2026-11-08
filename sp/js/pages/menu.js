import { store, emit } from '../store.js';
import { supa } from '../supa.js';
import { TABS, menuFor, tabsFor, TAB_MAX, PAGES } from '../nav.js';
import { esc, icon, debounce, modal, toast } from '../ui.js';
import { versionLabel } from '../version.js';

// Halaman "Lainnya" (HP): semua menu sebagai ikon per kategori, seperti menu di aplikasi marketplace.
export const GROUP_STYLE = {
  '': ['Utama', '#3546A8', '#23307A'], Penjualan: ['Penjualan', '#F0765E', '#B8402A'], Gudang: ['Gudang', '#34B377', '#16663F'],
  Keuangan: ['Keuangan', '#F7C548', '#D58A00'], Pengaturan: ['Pengaturan', '#5A8DE0', '#22488F'], Saya: ['Saya', '#9C7BE0', '#5B3E9A'], 'Super admin': ['Super admin', '#E2614C', '#8A2E20']
};
const DESC = {
  catat: 'Scan resi & barang', pesanan: 'Daftar pesanan', upload: 'File Shopee & pricelist', retur: 'Retur & cancel', rekap: 'Rekap per toko',
  beli: 'Belanja ke WIN', terima: 'Barang datang', ambil: 'Ambil dari rak', packing: 'Kemas paket', cek: 'Cek kode', stok: 'Stok & rak', barang: 'Master barang',
  harga: 'Rumus harga', laba: 'Laba per barang', gaji: 'Gaji & biaya', pegawai: 'Akun pegawai', log: 'Riwayat aktivitas', pengumuman: 'Info ke pegawai', pengaturan: 'Pengaturan toko',
  absen: 'Absen harian', 'pengaturan-scanner': 'Scanner & kamera', panduan: 'Cara pakai', akun: 'Profil & password', dashboard: 'Ringkasan', masalah: 'Kecurangan', tugas: 'Tugas sopir', notifikasi: 'Notifikasi', superadmin: 'Alat teknis',
  kas: 'Kas, bank, hutang', laporan: 'Laba per toko', pajak: 'PPh 0,5%', kinerja: 'Nilai pegawai', 'laporan-tg': 'Rekap ke Telegram', modul: 'Buka menu baru',
  komplain: 'Komplain pembeli', katalog: 'Harga grosir', qc: 'Periksa paket', gudang: 'Stok per cabang', saran: 'Barang perlu dibeli'
};

export default {
  async render(el) {
    let tabs = new Set(tabsFor(store.role, store.profile.tab_prefs));
    const all = menuFor(store.role).filter((m) => m.key !== 'menu');
    el.innerHTML = `<div class="stack menu-page">
      <div class="row"><input class="input menu-search grow" id="mq" placeholder="Cari menu…" aria-label="Cari menu" autocomplete="off"><button class="btn tabs-edit" id="mt">${icon('grid', 16)} Atur menu bawah</button></div>
      <div id="mg"></div>
      <div class="menu-foot"><button class="btn btn-logout" id="m-lo">${icon('logout', 18)} Keluar</button><button class="btn btn-ghost" id="m-ver">${icon('refresh', 16)} Versi ${esc(versionLabel())}</button></div>
    </div>`;
    const paint = (q = '') => {
      q = q.trim().toLowerCase();
      // menu di bar bawah tetap ditampilkan juga, supaya halaman ini lengkap
      const list = all.filter((m) => !q || (m.label + ' ' + (m.short || '') + ' ' + (DESC[m.key] || '')).toLowerCase().includes(q));
      const groups = [];
      list.forEach((m) => { const g = m.group || ''; let x = groups.find((y) => y.g === g); if (!x) groups.push((x = { g, items: [] })); x.items.push(m); });
      el.querySelector('#mg').innerHTML = groups.length ? groups.map(({ g, items }) => {
        const [label, c1, c2] = GROUP_STYLE[g] || [g, '#6B706C', '#3A403C'];
        return `<section class="menu-cat"><h3><i style="background:${c1}"></i>${esc(label)}</h3><div class="menu-grid">${items.map((m) => `<a class="menu-tile ${m.locked ? 'locked' : ''}" href="#/${m.key}">
          <span class="mt-ic" style="--c1:${c1};--c2:${c2}">${icon(m.icon, 24, 2.1)}${m.key === 'masalah' ? '<span class="mt-badge hidden" data-cnt="masalah"></span>' : ''}${m.locked ? `<span class="mt-lock" title="Terkunci">${icon('lock', 11, 2.6)}</span>` : tabs.has(m.key) ? '<span class="mt-pin" title="Ada di menu bawah"></span>' : ''}</span>
          <span class="mt-lbl">${esc(m.short || m.label)}</span></a>`).join('')}</div></section>`;
      }).join('') : '<div class="muted small" style="text-align:center;padding:24px">Menu tidak ditemukan.</div>';
    };
    el.querySelector('#mq').addEventListener('input', debounce((e) => paint(e.target.value), 120));
    // tombol keluar & versi memakai tombol yang sama dengan menu samping
    el.querySelector('#m-lo').onclick = () => document.querySelector('[data-logout]')?.click();
    el.querySelector('#m-ver').onclick = () => document.querySelector('.side-ver[data-ver]')?.click();
    el.querySelector('#mt').onclick = async () => { if (await editTabs(all)) { tabs = new Set(tabsFor(store.role, store.profile.tab_prefs)); paint(el.querySelector('#mq').value); } };
    paint();
  }
};

// pilih menu (bar bawah HP / menu pintas Dashboard), disimpan per orang per jabatan di profiles.tab_prefs
export async function editPicks({ key, max, title, intro, current, all, fixedLast }) {
  let sel = [...current];
  const draw = (ov) => {
    ov.querySelector('#ts').innerHTML = `${sel.map((k, i) => `<div class="ts-row"><span class="ts-n">${i + 1}</span><span class="ts-ic">${icon(PAGES[k].icon, 18)}</span><b class="grow">${esc(PAGES[k].short || PAGES[k].label)}</b>
        <button class="btn btn-sm btn-ghost" data-up="${i}" ${i ? '' : 'disabled'} aria-label="Naikkan">▲</button><button class="btn btn-sm btn-ghost" data-dn="${i}" ${i < sel.length - 1 ? '' : 'disabled'} aria-label="Turunkan">▼</button><button class="btn btn-sm btn-ghost" data-rm="${i}" aria-label="Hapus">${icon('x', 15)}</button></div>`).join('')}
      ${sel.length < max ? `<div class="ts-row empty"><span class="ts-n">${sel.length + 1}</span><span class="muted small">Kosong — pilih menu di bawah (${max - sel.length} lagi)</span></div>` : ''}
      ${fixedLast ? `<div class="ts-row fixed"><span class="ts-n">${icon('lock', 12)}</span><span class="ts-ic">${icon('grid', 18)}</span><b class="grow">${esc(fixedLast)}</b><span class="xs muted">selalu ada</span></div>` : ''}`;
    ov.querySelector('#tp').innerHTML = all.map((m) => `<button class="ts-pick ${sel.includes(m.key) ? 'on' : ''}" data-add="${m.key}" ${sel.includes(m.key) || sel.length >= max ? 'disabled' : ''}>${icon(m.icon, 18)}<span>${esc(m.short || m.label)}</span></button>`).join('');
  };
  const r = await modal({ title, body: `<div class="stack"><div class="small muted">${intro}</div><div class="ts-list" id="ts"></div>
      <div class="sec-h" style="margin:4px 0 0">Pilih menu</div><div class="ts-grid" id="tp"></div></div>`,
    onOpen: (ov) => {
      draw(ov);
      ov.addEventListener('click', (e) => {
        const b = e.target.closest('[data-add],[data-up],[data-dn],[data-rm]'); if (!b || b.disabled) return;
        if (b.dataset.add) sel.push(b.dataset.add);
        else if (b.dataset.rm != null) sel.splice(+b.dataset.rm, 1);
        else { const i = +(b.dataset.up ?? b.dataset.dn), j = b.dataset.up != null ? i - 1 : i + 1; [sel[i], sel[j]] = [sel[j], sel[i]]; }
        draw(ov);
      });
    },
    actions: [{ label: 'Bawaan', cls: 'btn-ghost', value: 'reset' }, { label: 'Batal', value: null }, { label: 'Simpan', cls: 'btn-primary', onClick: () => { if (!sel.length) { toast('Pilih minimal 1 menu', 'err'); return false; } return 'save'; } }] });
  if (!r) return false;
  const prefs = { ...(store.profile.tab_prefs || {}) };
  if (r === 'reset') delete prefs[key]; else prefs[key] = sel;
  store.profile.tab_prefs = prefs;
  try { localStorage.setItem('tab-prefs-' + store.profile.id, JSON.stringify(prefs)); } catch (_) {}
  const { error } = await supa.from('profiles').update({ tab_prefs: prefs }).eq('id', store.profile.id);
  toast(error ? 'Tersimpan di perangkat ini (jalankan update-2.17.sql agar ikut ke HP lain)' : 'Tersimpan', error ? '' : 'ok');
  return true;
}

async function editTabs(all) {
  const ok = await editPicks({ key: store.role, max: TAB_MAX, title: 'Atur menu bawah', fixedLast: 'Lainnya', all,
    current: tabsFor(store.role, store.profile.tab_prefs),
    intro: `Pilih sampai ${TAB_MAX} menu yang paling sering dipakai. Urutan dari kiri ke kanan. Menu <b>Lainnya</b> selalu ada di ujung kanan.` });
  if (ok) emit('tabs');
  return ok;
}
