import { supa, rpc } from '../supa.js';
import { store } from '../store.js';
import { esc, num, rp, todayStr, monthStart, fmtTime, icon, ROLE_LABEL } from '../ui.js';
import { modOn } from '../modules.js';
import { renderShortcuts, greet, amtToggle, heroFit } from '../shortcuts.js';

// Dashboard untuk setiap jabatan selain owner: angka & tugas yang relevan + menu pintas.
const T0 = () => todayStr() + 'T00:00:00+07:00';
const M0 = () => monthStart() + 'T00:00:00+07:00';
// hitung baris dengan cepat (tanpa mengambil datanya); null kalau tabel / menu belum ada
async function cnt(table, f) {
  try { const q = f(supa.from(table).select('id', { count: 'exact', head: true })); const { count, error } = await q; return error ? null : count; } catch (_) { return null; }
}
const me = () => store.profile.id;

// isi dashboard per jabatan: main = kartu utama (angka + tombol), stats = kotak angka kecil
const ROLES = {
  admin: async () => {
    const [win, pack, po, ret, today] = await Promise.all([
      cnt('orders', (q) => q.eq('status', 'menunggu_win')), cnt('orders', (q) => q.eq('status', 'siap_packing')),
      cnt('purchase_orders', (q) => q.eq('status', 'draft')), cnt('returns', (q) => q.eq('status', 'menunggu')), cnt('orders', (q) => q.gte('created_at', T0()))]);
    return { main: { label: 'Pesanan menunggu barang WIN', value: num(win), sub: po ? `${num(po)} daftar beli belum ditugaskan ke sopir` : 'Semua daftar beli sudah ditugaskan', cta: ['Buka Beli WIN', 'beli', 'truck'] },
      stats: [['Pesanan masuk hari ini', today, 'pesanan', ''], ['Siap packing', pack, 'pesanan', 'green'], ['Retur menunggu', ret, 'retur', ret ? 'yellow' : '']] };
  },
  kepala_gudang: async () => {
    const [sampai, today, win, ret, pack] = await Promise.all([
      cnt('purchase_orders', (q) => q.eq('status', 'sampai')), cnt('orders', (q) => q.gte('created_at', T0())),
      cnt('orders', (q) => q.eq('status', 'menunggu_win')), cnt('returns', (q) => q.eq('status', 'menunggu')), cnt('orders', (q) => q.eq('status', 'siap_packing'))]);
    return { main: { label: 'Barang WIN sampai, perlu di-scan terima', value: num(sampai), sub: sampai ? 'Sopir sudah di gudang — scan barangnya sekarang' : 'Belum ada barang WIN yang sampai', cta: ['Terima barang WIN', 'terima', 'inbox'] },
      stats: [['Resi dicatat hari ini', today, 'catat', ''], ['Menunggu WIN', win, 'beli', 'yellow'], ['Retur perlu di-scan', ret, 'retur', ret ? 'red' : ''], ['Siap packing', pack, 'pesanan', 'green']] };
  },
  sopir: async () => {
    const [aktif, done] = await Promise.all([
      cnt('purchase_orders', (q) => q.eq('driver_id', me()).in('status', ['ditugaskan', 'berangkat', 'diambil'])),
      cnt('purchase_orders', (q) => q.eq('driver_id', me()).eq('status', 'selesai').gte('created_at', M0()))]);
    return { main: { label: 'Tugas ambil yang aktif', value: num(aktif), sub: aktif ? 'Buka tugas untuk melihat daftar barang' : 'Tidak ada tugas. Tunggu notifikasi dari admin.', cta: ['Buka tugas', 'tugas', 'truck'] },
      stats: [['Tugas selesai bulan ini', done, 'tugas', 'green']] };
  },
  picker: async () => {
    const [pick, mine, pack] = await Promise.all([
      cnt('orders', (q) => q.eq('status', 'siap_pick')), cnt('stock_movements', (q) => q.eq('user_id', me()).eq('type', 'pick').gte('created_at', T0())), cnt('orders', (q) => q.eq('status', 'siap_packing'))]);
    return { main: { label: 'Pesanan siap diambil dari rak', value: num(pick), sub: 'Daftar sudah diurutkan per rak', cta: ['Mulai ambil', 'ambil', 'cart'] },
      stats: [['Barang saya ambil hari ini', mine, 'ambil', 'green'], ['Menunggu packing', pack, '', '']] };
  },
  packing: async () => {
    const [pack, mine, all] = await Promise.all([
      cnt('orders', (q) => q.eq('status', 'siap_packing')), cnt('orders', (q) => q.eq('packed_by', me()).gte('packed_at', T0())), cnt('orders', (q) => q.gte('packed_at', T0()))]);
    return { main: { label: 'Pesanan siap dipacking', value: num(pack), sub: 'Scan resi, scan barang, foto paket', cta: ['Mulai packing', 'packing', 'bag'] },
      stats: [['Saya pack hari ini', mine, 'packing', 'green'], ['Semua dipacking hari ini', all, '', '']] };
  },
  keuangan: async () => {
    let k = null; if (modOn('kas')) { try { k = await rpc('kas_summary', { p_from: monthStart(), p_to: todayStr() }); } catch (_) {} }
    if (!k) return { main: { label: 'Keuangan & kas', value: '–', sub: 'Menu Keuangan & kas belum dibuka owner', cta: ['Buka menu', 'kas', 'wallet'] }, stats: [] };
    return { money: true, main: { label: 'Total saldo semua rekening', value: rp(k.accounts.filter((x) => x.active).reduce((s, x) => s + Number(x.saldo), 0)), sub: `${k.accounts.length} rekening`, cta: ['Catat uang', 'kas', 'wallet'] },
      stats: [['Uang masuk bulan ini', rp(k.masuk), 'kas', 'green'], ['Uang keluar bulan ini', rp(k.keluar), 'kas', 'red'], ['Hutang supplier', rp(k.hutang?.total || 0), 'kas', k.hutang?.n_telat ? 'red' : '']] };
  },
  qc: async () => {
    const [packed, ok, bad] = await Promise.all([
      cnt('orders', (q) => q.gte('packed_at', T0())), cnt('qc_checks', (q) => q.eq('checked_by', me()).eq('result', 'lolos').gte('created_at', T0())), cnt('qc_checks', (q) => q.eq('checked_by', me()).eq('result', 'gagal').gte('created_at', T0()))]);
    return { main: { label: 'Paket dipacking hari ini', value: num(packed), sub: 'Scan resi paket untuk diperiksa sebelum dikirim', cta: ['Mulai cek QC', 'qc', 'check'] },
      stats: [['Lolos QC (saya)', ok, 'qc', 'green'], ['Gagal QC (saya)', bad, 'qc', bad ? 'red' : '']] };
  },
  cs: async () => {
    const [baru, proses, done] = await Promise.all([
      cnt('complaints', (q) => q.eq('status', 'baru')), cnt('complaints', (q) => q.eq('status', 'proses')), cnt('complaints', (q) => q.in('status', ['selesai', 'ditolak']).gte('created_at', M0()))]);
    return { main: { label: 'Komplain baru', value: baru == null ? '–' : num(baru), sub: baru ? 'Cek bukti packing lalu tangani' : 'Belum ada komplain baru', cta: ['Buka komplain', 'komplain', 'alert'] },
      stats: [['Sedang diproses', proses, 'komplain', 'yellow'], ['Selesai bulan ini', done, 'komplain', 'green']] };
  },
  marketing: async () => {
    const [ready, all] = await Promise.all([cnt('products', (q) => q.eq('active', true).gt('stock', 0)), cnt('products', (q) => q.eq('active', true))]);
    let cat = null; try { const { data } = await supa.from('catalog_config').select('enabled').eq('id', 1).maybeSingle(); cat = data; } catch (_) {}
    return { main: { label: 'Barang ready stok', value: num(ready), sub: `dari ${num(all)} barang aktif`, cta: ['Buka katalog', 'katalog', 'tag'] },
      stats: [['Link katalog', cat ? (cat.enabled ? 'Aktif' : 'Mati') : '–', 'katalog', cat?.enabled ? 'green' : '']] };
  }
};
ROLES.supervisor = ROLES.kepala_gudang;

export default {
  tour: [
    { sel: '#hero', title: 'Ringkasan hari ini', body: 'Angka terpenting untuk jabatanmu. Tekan tombol di kartu untuk langsung bekerja.' },
    { sel: '#shortcuts', title: 'Menu utama', body: 'Menu pintas. Tekan "Atur" untuk memilih dan mengurutkan menu yang paling sering dipakai.' }
  ],
  async render(el) {
    const role = store.role;
    el.innerHTML = `<div class="stack" style="gap:16px">
      <section class="dash-hero" id="hero">
        <div class="dh-top">${greet()}<span class="dh-role">${esc(ROLE_LABEL[role] || role)}</span></div>
        <div class="card dh-main" id="main"><div class="skeleton" style="height:92px"></div></div>
      </section>
      <div id="absen"></div>
      <div id="stats"></div>
      <section class="card sc-card" id="shortcuts"></section>
    </div>`;
    renderShortcuts(el.querySelector('#shortcuts'));
    heroFit(el.querySelector('#hero'), '#main', 70);
    // absen hari ini
    (async () => {
      if (!modOn('absensi')) return;
      if (!['admin', 'sopir', 'kepala_gudang', 'picker', 'packing', 'keuangan', 'qc', 'cs', 'marketing', 'supervisor'].includes(role)) return;
      const { data } = await supa.from('attendance').select('check_in, check_out').eq('user_id', me()).eq('work_date', todayStr()).maybeSingle();
      el.querySelector('#absen').innerHTML = data
        ? `<a class="card dh-absen ok" href="#/absen">${icon('check', 18, 2.6)}<span class="grow">Sudah absen masuk <b>${fmtTime(data.check_in)}</b>${data.check_out ? ` · pulang <b>${fmtTime(data.check_out)}</b>` : ''}</span>${icon('chev', 16)}</a>`
        : `<a class="card dh-absen" href="#/absen">${icon('clock', 18, 2.4)}<span class="grow"><b>Belum absen hari ini</b><span class="xs muted" style="display:block">Tekan untuk absen masuk</span></span><span class="btn btn-sm btn-primary">Absen</span></a>`;
    })().catch(() => {});
    const f = ROLES[role];
    if (!f) { el.querySelector('#main').innerHTML = '<div class="muted">Selamat bekerja!</div>'; return; }
    const d = await f();
    const m = d.main;
    el.querySelector('#main').innerHTML = `<div class="dh-lbl">${esc(m.label)}</div><div class="dh-val">${esc(m.value)}</div><div class="dh-sub">${esc(m.sub)}</div>
      <a class="btn btn-primary dh-cta" href="#/${m.cta[1]}">${icon(m.cta[2], 18)} ${esc(m.cta[0])}</a>`;
    if (d.money) { el.querySelector('.dh-top').insertAdjacentHTML('beforeend', '<button class="dh-eye" data-eye></button>'); amtToggle(el.querySelector('#hero')); }
    el.querySelector('#stats').innerHTML = d.stats.length ? `<div class="grid gauto">${d.stats.map(([l, v, href, tone]) => `<${href ? `a href="#/${href}"` : 'div'} class="card kpi dh-stat ${tone}"><div class="label">${esc(l)}</div><div class="value">${v == null ? '–' : esc(typeof v === 'number' ? num(v) : v)}</div></${href ? 'a' : 'div'}>`).join('')}</div>` : '';
  }
};
