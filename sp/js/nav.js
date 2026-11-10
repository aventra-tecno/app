import { store } from './store.js';
import { modOn } from './modules.js';
// Daftar halaman, siapa yang boleh membuka, dan susunan menu per jabatan.
export const PAGES = {
  dashboard:  { label: 'Dashboard', short: 'Beranda', icon: 'home', roles: ['*'], group: '' },
  masalah:    { label: 'Kecurangan & masalah', short: 'Masalah', icon: 'shield', roles: ['owner'], group: '' },
  catat:      { label: 'Catat pesanan', short: 'Catat', icon: 'barcode', roles: ['owner', 'admin', 'kepala_gudang'], group: 'Penjualan' },
  pesanan:    { label: 'Pesanan', icon: 'bag', roles: ['owner', 'admin', 'cs'], group: 'Penjualan' },
  komplain:   { label: 'Komplain & garansi', short: 'Komplain', icon: 'alert', roles: ['owner', 'admin', 'cs'], group: 'Penjualan', mod: 'komplain' },
  katalog:    { label: 'Katalog grosir', short: 'Katalog', icon: 'tag', roles: ['owner', 'marketing'], group: 'Penjualan', mod: 'katalog' },
  offline:    { label: 'Toko offline', short: 'Offline', icon: 'receipt', roles: ['owner', 'kepala_gudang'], group: 'Penjualan' },
  upload:     { label: 'Upload file', short: 'Upload', icon: 'upload', roles: ['owner', 'admin', 'kepala_gudang'], group: 'Penjualan' },
  retur:      { label: 'Retur & cancel', short: 'Retur', icon: 'ret', roles: ['owner', 'admin', 'kepala_gudang'], group: 'Penjualan' },
  rekap:      { label: 'Rekap harian', short: 'Rekap', icon: 'calendar', roles: ['owner', 'admin'], group: 'Penjualan' },
  siapkan:    { label: 'Siapkan barang', short: 'Siapkan', icon: 'box', roles: ['owner', 'kepala_gudang'], group: 'Gudang' },
  beli:       { label: 'Beli WIN', icon: 'truck', roles: ['owner', 'kepala_gudang'], group: 'Gudang' },
  tugas:      { label: 'Tugas ambil', short: 'Tugas', icon: 'truck', roles: ['sopir'], group: 'Gudang' },
  terima:     { label: 'Terima barang WIN', short: 'Terima', icon: 'inbox', roles: ['owner', 'kepala_gudang'], group: 'Gudang' },
  ambil:      { label: 'Ambil dari rak', short: 'Ambil', icon: 'cart', roles: ['owner', 'picker', 'kepala_gudang'], group: 'Gudang' },
  packing:    { label: 'Packing', icon: 'bag', roles: ['owner', 'packing'], group: 'Gudang' },
  cek:        { label: 'Cek barcode', short: 'Cek', icon: 'search', roles: ['*'], group: 'Gudang' },
  qc:         { label: 'Cek QC paket', short: 'QC', icon: 'check', roles: ['owner', 'qc'], group: 'Gudang', mod: 'role_qc' },
  stok:       { label: 'Stok & rak', short: 'Stok', icon: 'box', roles: ['owner', 'admin', 'kepala_gudang', 'marketing'], group: 'Gudang' },
  gudang:     { label: 'Multi gudang', short: 'Gudang', icon: 'box', roles: ['owner', 'kepala_gudang'], group: 'Gudang', mod: 'gudang' },
  saran:      { label: 'Saran belanja stok', short: 'Saran', icon: 'cart', roles: ['owner', 'admin', 'kepala_gudang'], group: 'Gudang', mod: 'saran' },
  barang:     { label: 'Master barang', short: 'Barang', icon: 'grid', roles: ['owner', 'admin', 'kepala_gudang'], group: 'Gudang' },
  harga:      { label: 'Atur harga', short: 'Harga', icon: 'tag', roles: ['owner'], group: 'Keuangan' },
  laba:       { label: 'Laba per barang', short: 'Laba', icon: 'chart', roles: ['owner'], group: 'Keuangan' },
  gaji:       { label: 'Gaji & operasional', short: 'Gaji', icon: 'wallet', roles: ['owner'], group: 'Keuangan' },
  'rekap-absen': { label: 'Rekap absensi', short: 'Rekap absen', icon: 'calendar', roles: ['owner', 'supervisor', 'keuangan'], group: 'Keuangan', mod: 'rekap_absen' },
  kas:        { label: 'Keuangan & kas', short: 'Kas', icon: 'wallet', roles: ['owner', 'keuangan'], group: 'Keuangan', mod: 'kas' },
  laporan:    { label: 'Laporan premium', short: 'Laporan', icon: 'chart', roles: ['owner', 'keuangan'], group: 'Keuangan', mod: 'laporan' },
  pajak:      { label: 'Pajak UMKM', short: 'Pajak', icon: 'receipt', roles: ['owner', 'keuangan'], group: 'Keuangan', mod: 'pajak' },
  kinerja:    { label: 'Kinerja pegawai', short: 'Kinerja', icon: 'users', roles: ['owner', 'supervisor'], group: 'Pengaturan', mod: 'kinerja' },
  'laporan-tg': { label: 'Laporan Telegram', short: 'Lap. Telegram', icon: 'send', roles: ['owner'], group: 'Pengaturan', mod: 'tg_laporan' },
  pegawai:    { label: 'Pegawai & jabatan', short: 'Pegawai', icon: 'users', roles: ['owner'], group: 'Pengaturan' },
  log:        { label: 'Log aktivitas', short: 'Log', icon: 'clock', roles: ['owner'], group: 'Pengaturan' },
  pengumuman: { label: 'Pengumuman', short: 'Info', icon: 'bell', roles: ['owner'], group: 'Pengaturan' },
  pengaturan: { label: 'Pengaturan', icon: 'gear', roles: ['owner'], group: 'Pengaturan' },
  integrasi:  { label: 'Hubungkan Shopee / TikTok', short: 'Integrasi', icon: 'link', roles: ['owner'], group: 'Pengaturan', mod: 'integrasi' },
  modul:      { label: 'Menu tambahan', short: 'Tambahan', icon: 'lock', roles: ['owner'], group: 'Pengaturan' },
  tagihan:    { label: 'Tagihan', icon: 'receipt', roles: ['owner'], group: 'Pengaturan', hidden: true },   // dibuka dari ikon tagihan di bar atas
  absen:      { label: 'Absen', icon: 'clock', mod: 'absensi', roles: ['owner', 'admin', 'sopir', 'kepala_gudang', 'picker', 'packing', 'keuangan', 'qc', 'cs', 'marketing'], group: 'Saya' },
  notifikasi: { label: 'Notifikasi', icon: 'bell', roles: ['*'], group: 'Saya', hidden: true },
  'pengaturan-scanner': { label: 'Pengaturan scanner', short: 'Scanner', icon: 'bt', roles: ['*'], group: 'Saya' },
  // ----- menu khusus super admin (pembuat aplikasi) -----
  superadmin: { label: 'Ringkasan', short: 'Ringkasan', icon: 'home', roles: ['superadmin'], group: 'Super admin', sa: true },
  'sa-jabatan': { label: 'Masuk sebagai jabatan', short: 'Jabatan', icon: 'users', roles: ['superadmin'], group: 'Super admin', sa: true },
  'sa-modul': { label: 'Menu & harga', short: 'Menu', icon: 'lock', roles: ['superadmin'], group: 'Super admin', sa: true },
  'sa-tagihan': { label: 'Tagihan & Mayar', short: 'Tagihan', icon: 'receipt', roles: ['superadmin'], group: 'Super admin', sa: true },
  'sa-telegram': { label: 'Bot Telegram', short: 'Telegram', icon: 'send', roles: ['superadmin'], group: 'Super admin', sa: true },
  'sa-alat': { label: 'Alat & data', short: 'Alat', icon: 'gear', roles: ['superadmin'], group: 'Super admin', sa: true },
  panduan:    { label: 'Panduan aplikasi', short: 'Panduan', icon: 'compass', roles: ['*'], group: 'Saya' },
  akun:       { label: 'Akun saya', short: 'Akun', icon: 'user', roles: ['*'], group: 'Saya' },
  menu:       { label: 'Semua menu', short: 'Lainnya', icon: 'grid', roles: ['*'], group: '', hidden: true }
};

// menu ikon bawah di HP (maks 4 + "Lainnya")
export const TABS = {
  owner: ['dashboard', 'masalah', 'rekap', 'harga'],
  admin: ['dashboard', 'catat', 'pesanan', 'rekap'],
  sopir: ['dashboard', 'tugas', 'absen', 'notifikasi'],
  kepala_gudang: ['dashboard', 'siapkan', 'beli', 'terima'],
  picker: ['dashboard', 'ambil', 'absen', 'notifikasi'],
  packing: ['dashboard', 'packing', 'absen', 'notifikasi'],
  keuangan: ['dashboard', 'kas', 'laporan', 'pajak'],
  supervisor: ['dashboard', 'siapkan', 'stok', 'kinerja'],
  qc: ['dashboard', 'qc', 'cek', 'absen'],
  cs: ['dashboard', 'komplain', 'pesanan', 'absen'],
  marketing: ['dashboard', 'katalog', 'stok', 'absen'],
  superadmin: ['superadmin', 'sa-jabatan', 'sa-modul', 'sa-tagihan']
};

export const HOME = { owner: 'dashboard', admin: 'dashboard', sopir: 'dashboard', kepala_gudang: 'dashboard', picker: 'dashboard', packing: 'dashboard',
  keuangan: 'dashboard', supervisor: 'dashboard', qc: 'dashboard', cs: 'dashboard', marketing: 'dashboard', superadmin: 'superadmin' };

const SA_EXTRA = ['log', 'akun', 'notifikasi', 'panduan', 'menu'];
export function canOpen(page, role) {
  const k = page, p = PAGES[page];
  if (!p) return false;
  // menu super admin hanya di mode super admin; saat "masuk sebagai jabatan" menunya persis jabatan itu
  if (p.sa) return !!store.superadmin && role === 'superadmin';
  if (role === 'superadmin') return SA_EXTRA.includes(k);
  if (k === 'absen' && role === 'supervisor') return true;
  return p.roles.includes('*') || p.roles.includes(role) || (role === 'supervisor' && (p.roles.includes('kepala_gudang') || p.roles.includes('supervisor')));
}

// halaman terkunci (menu tambahan belum dibuka)?
export const isLocked = (page) => !!PAGES[page]?.mod && !modOn(PAGES[page].mod);

// owner tetap melihat menu yang terkunci (dengan gembok) supaya bisa membukanya; jabatan lain tidak
export function menuFor(role) {
  return Object.entries(PAGES).filter(([k, p]) => !p.hidden && canOpen(k, role) && (role === 'owner' || !isLocked(k)))
    .map(([k, p]) => ({ key: k, ...p, locked: isLocked(k) }))
    .sort((a, b) => (role === 'superadmin' ? (b.sa ? 1 : 0) - (a.sa ? 1 : 0) : 0));
}

// menu bawah HP: pilihan pengguna (maks 4, tersimpan per jabatan) atau bawaan jabatan
export const TAB_MAX = 4;
export function tabsFor(role, prefs) {
  const mine = prefs && Array.isArray(prefs[role]) ? prefs[role].filter((k) => PAGES[k] && !PAGES[k].hidden && k !== 'menu' && canOpen(k, role)).slice(0, TAB_MAX) : null;
  return mine && mine.length ? mine : (TABS[role] || []);
}

// menu pintas di Dashboard ("Menu utama"): pilihan pengguna atau bawaan (menu jabatan selain Dashboard)
export const SHORT_MAX = 8;
export function shortcutsFor(role, prefs) {
  const ok = (k) => PAGES[k] && !PAGES[k].hidden && k !== 'menu' && k !== 'dashboard' && canOpen(k, role);
  const mine = prefs && Array.isArray(prefs['dash:' + role]) ? prefs['dash:' + role].filter(ok).slice(0, SHORT_MAX) : null;
  if (mine && mine.length) return mine;
  return menuFor(role).map((m) => m.key).filter(ok).slice(0, SHORT_MAX);
}
