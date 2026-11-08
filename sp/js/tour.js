import { esc, icon } from './ui.js';

// Panduan: sorot elemen satu per satu.
// steps: [{sel, title, body}]  — sel boleh beberapa selector dipisah koma; elemen yang terlihat dipakai
export function runTour({ steps, welcome, onFinish }) {
  return new Promise((resolve) => {
    let i = welcome ? -1 : 0;
    const block = document.createElement('div'); block.className = 'tour-block';
    const hole = document.createElement('div'); hole.className = 'tour-hole';
    const tip = document.createElement('div'); tip.className = 'tour-tip'; tip.setAttribute('role', 'dialog');
    let welcomeEl = null;

    const visible = (sel) => [...document.querySelectorAll(sel)].find((el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
    });
    const usable = steps.filter((s) => !s.sel || visible(s.sel));

    const finish = (status) => {
      block.remove(); hole.remove(); tip.remove(); welcomeEl && welcomeEl.remove();
      window.removeEventListener('resize', place);
      onFinish && onFinish(status);
      resolve(status);
    };

    function showWelcome() {
      welcomeEl = document.createElement('div');
      welcomeEl.className = 'tour-welcome';
      welcomeEl.innerHTML = `<div class="modal stack" role="dialog" aria-label="Selamat datang">
        <div style="width:52px;height:52px;border-radius:14px;background:var(--accent);display:grid;place-items:center">${icon('compass', 28)}</div>
        <h2 style="font-size:22px">${esc(welcome.title)}</h2>
        <p style="margin:0;color:var(--muted);line-height:1.5">${welcome.body}</p>
        <button class="btn btn-primary btn-lg" data-start>Mulai panduan</button>
        <button class="btn" data-skipall>Lewati semua</button>
      </div>`;
      document.body.appendChild(welcomeEl);
      welcomeEl.querySelector('[data-start]').onclick = () => { welcomeEl.remove(); welcomeEl = null; i = 0; mount(); show(); };
      welcomeEl.querySelector('[data-skipall]').onclick = () => finish('dilewati');
    }

    function mount() { document.body.append(block, hole, tip); window.addEventListener('resize', place); }

    function place() {
      const s = usable[i]; if (!s) return;
      const el = s.sel && visible(s.sel);
      const pad = 6;
      if (el) {
        el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        const r = el.getBoundingClientRect();
        Object.assign(hole.style, { display: '', left: r.left - pad + 'px', top: r.top - pad + 'px', width: r.width + pad * 2 + 'px', height: r.height + pad * 2 + 'px' });
        const tw = tip.offsetWidth || 340, th = tip.offsetHeight || 220;
        const vw = window.innerWidth, vh = window.innerHeight;
        let top, left;
        if (r.right + 16 + tw < vw && r.height < vh / 2 && vw >= 900) { left = r.right + 18; top = Math.max(12, Math.min(r.top - 10, vh - th - 12)); }
        else if (r.bottom + 14 + th < vh) { top = r.bottom + 14; left = Math.min(Math.max(16, r.left), vw - tw - 16); }
        else { top = Math.max(12, r.top - th - 14); left = Math.min(Math.max(16, r.left), vw - tw - 16); }
        Object.assign(tip.style, { top: top + 'px', left: left + 'px' });
      } else {
        hole.style.display = 'none';
        Object.assign(tip.style, { top: '30%', left: Math.max(16, (window.innerWidth - (tip.offsetWidth || 340)) / 2) + 'px' });
      }
    }

    function show() {
      const s = usable[i];
      if (!s) return finish('selesai');
      const last = i === usable.length - 1;
      tip.innerHTML = `<div class="row between"><span class="t-step">Langkah ${i + 1} dari ${usable.length}</span>
          <button class="btn btn-ghost btn-sm" data-skipall style="color:var(--blue)">Lewati semua</button></div>
        <h3>${esc(s.title)}</h3><p>${s.body}</p>
        <div class="tour-dots">${usable.map((_, k) => `<i class="${k === i ? 'on' : ''}"></i>`).join('')}</div>
        <div class="row"><button class="btn grow" data-back ${i === 0 ? 'disabled' : ''}>Kembali</button>
          <button class="btn grow" data-skip>Lewati</button>
          <button class="btn btn-primary grow" data-next>${last ? 'Selesai' : 'Lanjut'}</button></div>`;
      tip.querySelector('[data-back]').onclick = () => { i = Math.max(0, i - 1); show(); };
      tip.querySelector('[data-skip]').onclick = () => { i++; show(); };
      tip.querySelector('[data-next]').onclick = () => { i++; show(); };
      tip.querySelector('[data-skipall]').onclick = () => finish('dilewati');
      requestAnimationFrame(place);
    }

    if (!usable.length) return finish('selesai');
    if (i === -1) showWelcome(); else { mount(); show(); }
  });
}

const sel = (page) => `[data-tour="nav-${page}"]`;

export function mainSteps(role) {
  const bell = { sel: '[data-tour="bell"]', title: 'Lonceng notifikasi', body: role === 'owner'
    ? 'Semua laporan dan masalah dari <b>semua jabatan</b> (Admin, Sopir, Kepala Gudang, Picker, Packing) masuk ke sini. Angka merah = belum dibaca.'
    : 'Tugas dan info untuk jabatanmu masuk ke sini. Angka merah = belum dibaca.' };
  const help = { sel: '[data-tour="help"]', title: 'Tombol bantuan', body: 'Tekan tombol <b>?</b> kapan saja untuk melihat penjelasan halaman yang sedang dibuka.' };
  const lainnya = { sel: '[data-tour="nav-lainnya"]', title: 'Menu lainnya', body: 'Menu lain, akun, dan <b>Panduan aplikasi</b> untuk memutar ulang panduan ini.' };
  const S = {
    owner: [
      { sel: sel('dashboard'), title: 'Dashboard', body: 'Omzet penjualan, omzet lunas, profit kotor, rugi hilang/rusak, sampai laba bersih setelah gaji.' },
      { sel: sel('masalah'), title: 'Kecurangan & masalah', body: 'Kejadian yang tidak sesuai alur scan: barang hilang, resi dikirim tanpa scan, retur tidak kembali, harga beli dinaikkan. Lengkap dengan buktinya.' },
      { sel: sel('rekap'), title: 'Rekap harian', body: 'Margin per resi seperti rekap kertas: harga beli, harga Shopee, harga selesai, margin.' },
      { sel: sel('harga'), title: 'Atur harga', body: 'Ubah Macallan, Harga 5%, harga beli, dan harga Shopee. Harga yang dikunci tidak tertimpa upload file.' },
      { sel: sel('gaji'), title: 'Gaji & operasional', body: 'Gaji dihitung dari absen. Gaji dan biaya operasional otomatis mengurangi laba bersih.' },
      { sel: sel('pegawai'), title: 'Pegawai & jabatan', body: 'Buat akun login untuk setiap pegawai dan tentukan jabatannya.' },
      bell, help, lainnya
    ],
    admin: [
      { sel: sel('pesanan'), title: 'Pesanan', body: 'Semua pesanan Shopee dan statusnya: siap diambil, menunggu WIN, siap packing, dikirim.' },
      { sel: sel('upload'), title: 'Upload file Shopee', body: 'Setiap pagi upload file <b>Pesanan</b>. Sistem otomatis membuat daftar picker dan daftar beli WIN. Pembatalan, pengembalian, dan penghasilan juga di sini.' },
      { sel: sel('beli'), title: 'Beli WIN', body: 'Barang yang stoknya kurang muncul di sini. Buat daftar beli, isi no. order WIN, lalu tugaskan sopir.' },
      { sel: sel('barang'), title: 'Master barang', body: 'Daftar kode barang, rak, dan stok minimum.' },
      bell, help, lainnya
    ],
    sopir: [
      { sel: sel('tugas'), title: 'Tugas ambil', body: 'Daftar barang yang harus diambil di pabrik WIN. Tekan Berangkat, Barang diterima (foto nota), lalu Sudah sampai gudang.' },
      { sel: sel('absen'), title: 'Absen', body: 'Absen masuk dan pulang setiap hari. Dipakai untuk menghitung uang makan.' },
      bell, help
    ],
    kepala_gudang: [
      { sel: sel('catat'), title: 'Catat pesanan', body: 'Pilih toko, scan resi dari admin, lalu scan setiap barang. Barang yang ada di rak langsung diambil.' },
      { sel: sel('beli'), title: 'Beli WIN', body: 'Semua barang pesanan dibeli di WIN. Centang barang, isi no. order WIN, tugaskan sopir.' },
      { sel: sel('terima'), title: 'Terima barang WIN', body: 'Scan setiap barang yang dibawa sopir. Sistem langsung bilang: ke meja packing atau ke rak mana.' },
      { sel: sel('stok'), title: 'Stok & rak', body: 'Cari barang, lihat lokasi rak dan riwayat keluar-masuk. Stok opname juga di sini.' },
      { sel: sel('retur'), title: 'Retur & cancel', body: 'Scan barang retur / cancel, pilih kondisi baik atau rusak, ambil foto.' },
      bell, help, lainnya
    ],
    picker: [
      { sel: sel('ambil'), title: 'Ambil dari rak', body: 'Daftar barang yang harus diambil, diurutkan per rak. Scan barcode tiap barang yang diambil.' },
      { sel: sel('absen'), title: 'Absen', body: 'Absen masuk dan pulang setiap hari.' },
      bell, help
    ],
    packing: [
      { sel: sel('packing'), title: 'Packing', body: 'Scan resi, lalu scan tiap barang. Kalau barang tidak cocok, sistem langsung memberi peringatan.' },
      { sel: sel('absen'), title: 'Absen', body: 'Absen masuk dan pulang setiap hari.' },
      bell, help
    ],
    keuangan: [
      { sel: sel('kas'), title: 'Keuangan & kas', body: 'Catat uang masuk & keluar, saldo setiap rekening, dan hutang supplier.' },
      { sel: sel('laporan'), title: 'Laporan premium', body: 'Laba per toko per bulan, tren, dan barang paling untung.' },
      { sel: sel('pajak'), title: 'Pajak UMKM', body: 'Omzet bulanan dan perkiraan PPh final 0,5%.' },
      bell, help, lainnya
    ],
    supervisor: [
      { sel: sel('catat'), title: 'Catat pesanan', body: 'Semua tugas kepala gudang ada di jabatan ini.' },
      { sel: sel('kinerja'), title: 'Kinerja pegawai', body: 'Pantau jumlah kerja dan kesalahan setiap pegawai gudang.' },
      { sel: sel('gudang'), title: 'Multi gudang', body: 'Stok per lokasi dan pindahan barang antar gudang.' },
      bell, help, lainnya
    ],
    qc: [
      { sel: sel('qc'), title: 'Cek QC paket', body: 'Scan resi paket yang sudah dipacking, cocokkan isinya, lalu tandai lolos atau gagal.' },
      { sel: sel('absen'), title: 'Absen', body: 'Absen masuk dan pulang setiap hari.' },
      bell, help
    ],
    cs: [
      { sel: sel('komplain'), title: 'Komplain & garansi', body: 'Catat komplain pembeli. Cari resi untuk melihat isi paket dan foto packing sebagai bukti banding.' },
      { sel: sel('pesanan'), title: 'Pesanan', body: 'Lihat status pesanan untuk menjawab pertanyaan pembeli.' },
      bell, help
    ],
    marketing: [
      { sel: sel('katalog'), title: 'Katalog grosir', body: 'Atur harga grosir lalu bagikan link katalog atau PDF ke bengkel / reseller.' },
      { sel: sel('stok'), title: 'Stok & rak', body: 'Lihat stok barang untuk bahan konten jualan.' },
      bell, help
    ]
  };
  return S[role] || [bell];
}
