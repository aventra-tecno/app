# Stok Gudang Sparepart — PWA + Supabase

Aplikasi stok untuk toko sparepart yang jualan di Shopee dan belanja barang di pabrik WIN.
Satu aplikasi, dua tampilan:

- **HP**: menu ikon di bawah, lonceng di kanan atas, bisa dipasang seperti aplikasi (PWA).
- **Laptop / komputer**: menu di kiri, tampilan melebar ke samping.

Jabatan: **Owner, Admin, Sopir, Kepala Gudang, Picker, Packing**. Setiap jabatan hanya melihat menu dan notifikasinya sendiri. Owner melihat semuanya.

---

## Isi folder

```
index.html          halaman utama (tidak perlu diubah)
manifest.json       pengaturan PWA (ikon, nama aplikasi)
sw.js               service worker (cache & bisa dipasang)
css/app.css         tampilan
js/config.js        ← ISI URL & KEY SUPABASE DI SINI
js/*.js             logika aplikasi
js/pages/*.js       satu file per halaman
assets/             ikon aplikasi
supabase/schema.sql ← JALANKAN SEKALI DI SUPABASE
.nojekyll           wajib ada untuk GitHub Pages
```

---

## Langkah 1 — Siapkan Supabase (±10 menit)

1. Buat project di [supabase.com](https://supabase.com). Pilih region **Southeast Asia (Singapore)** supaya cepat dari Indonesia.
2. Buka **SQL Editor › New query**, tempel **seluruh isi** `supabase/schema.sql`, lalu klik **Run**.
   Kalau sukses muncul “Success. No rows returned”. File ini aman dijalankan ulang.
3. Buka **Authentication › Sign In / Providers › Email**, lalu **matikan “Confirm email”**.
   Akun pegawai dibuat oleh owner, jadi pegawai tidak perlu konfirmasi email.
4. Buka **Project Settings › API**, lalu salin:
   - **Project URL**
   - **anon public** key (jangan pakai `service_role`)
5. Buka **Authentication › Users › Add user › Create new user**. Isi email & password **owner**, lalu centang “Auto Confirm User”.
   **Akun pertama yang dibuat otomatis menjadi Owner.**

## Langkah 2 — Isi konfigurasi

Buka `js/config.js` lalu ganti dua baris ini:

```js
export const SUPABASE_URL = 'https://xxxxx.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOi...';
```

## Langkah 3 — Upload ke GitHub & aktifkan GitHub Pages

1. Buat repository baru di GitHub (boleh private kalau akunnya mendukung Pages untuk private).
2. Upload **semua isi folder ini** (termasuk file `.nojekyll`) ke repository.
3. Buka **Settings › Pages**. Pilih **Deploy from a branch**, branch `main`, folder `/ (root)`, lalu **Save**.
4. Tunggu 1–2 menit. Alamat aplikasimu: `https://USERNAME.github.io/NAMA-REPO/`
5. Kembali ke Supabase **Authentication › URL Configuration**:
   - **Site URL**: alamat GitHub Pages tadi
   - **Redirect URLs**: tambahkan alamat yang sama (dipakai untuk fitur “Lupa password”)

## Langkah 4 — Mulai pakai (atau coba dulu dengan folder `simulasi/`)

Folder `simulasi/` berisi data contoh: 20 barang asli dari pricelist WIN, 10 rak, stok fisik, 12 pesanan Shopee, dan PDF barcode. Upload berurutan di menu **Upload file**: 1 → 2 → 3 (login sebagai owner / kepala gudang), lalu 4.


1. Buka alamat aplikasi, lalu login sebagai owner. Panduan pengenalan muncul otomatis (bisa dilewati).
2. **Pegawai & jabatan › Tambah pegawai**: buat akun untuk admin, sopir, kepala gudang, picker, dan packing.
   Isi gaji pokok dan uang makan per hari, lalu kirim email & password ke masing-masing pegawai.
3. **Upload file › Pricelist WIN**: upload file pricelist WIN apa adanya (sheet “ALL PRICELIST” dipilih otomatis; kolom PART NUMBER, NAMA BARANG, HARGA). Harga 5% dan harga beli dihitung otomatis.
4. **Upload file › Kode rak**: daftar kode rak (atau buat manual di Stok & rak › Rak & label), lalu cetak labelnya.
5. **Upload file › Stok fisik per rak** (owner / kepala gudang): file berisi Kode Rak, Part Number, Jumlah Fisik. Rak tiap barang dan stok awalnya terisi sekaligus.
6. Setiap pagi admin meng-upload file **Pesanan** dari Shopee Seller Center. Setelah itu sistem berjalan sendiri:
   - Barang yang ada di gudang → daftar **Picker**
   - Barang yang kurang → daftar **Beli WIN** → tugas **Sopir** → di-scan **Kepala Gudang** → langsung ke meja **Packing**
   - **Packing** scan resi + barang + foto → dikirim
   - **Pembatalan / Pengembalian** di-upload → Kepala Gudang scan barangnya kembali
   - **Penghasilan** di-upload saat dana cair → omzet lunas & margin pasti

## Memasang di HP (PWA)

- **Android (Chrome)**: buka alamat aplikasi, lalu ketuk menu ⋮ › **Tambahkan ke layar utama / Instal aplikasi**.
- **iPhone (Safari)**: ketuk tombol Bagikan › **Tambah ke Layar Utama**.

## Kode barang & barcode

Kode dicocokkan tanpa tanda baca dan huruf besar/kecil, jadi `01-B38-305-47AA` (pricelist), `01B3830547AA` dan barcode `01B3830547AA1` (seperti di rekap / label barang, ada angka tambahan di akhir) dianggap barang yang sama.

## Scan barcode

- **Scanner gun USB / Bluetooth** (paling cepat, disarankan untuk meja packing & terima barang): klik kolom scan, lalu tembak barcode. Alat ini bekerja seperti keyboard + Enter.
- **Kamera HP**: tombol kamera di sebelah kolom scan. Di Android Chrome memakai pembaca barcode bawaan; di iPhone memakai pembaca cadangan (sedikit lebih lambat).

## Rumus yang dipakai

| Angka | Rumus |
|---|---|
| Harga 5% | Macallan − 5% (bisa diubah di Atur harga) |
| Harga beli | Macallan − 30% (atau % per barang, mis. 25%) |
| Harga selesai | Dana cair dari file Penghasilan Shopee. Sebelum cair: total jual − estimasi potongan Shopee (12%, bisa diubah) |
| Margin per resi | Harga selesai − harga beli |
| Profit kotor | Total harga selesai − total modal |
| Rugi | Selisih stok opname (hilang) + retur rusak + ongkir retur |
| Laba bersih | Profit kotor − bahan packing − rugi − gaji per hari − biaya operasional |

## Deteksi kecurangan & masalah (dicatat otomatis, muncul di dashboard owner)

| Kejadian | Kapan terdeteksi |
|---|---|
| Barang hilang dari rak | Stok opname: fisik kurang dari sistem tanpa scan keluar (+ siapa yang terakhir memegang) |
| Resi dikirim tanpa scan packing | File pesanan Shopee berstatus dikirim, tetapi resi belum pernah di-scan packing |
| Retur / cancel tidak kembali | Lewat batas hari (default 2) belum di-scan masuk gudang |
| Barang WIN diterima kurang | Scan terima lebih sedikit dari daftar beli |
| Harga beli dinaikkan | Admin mengisi harga beli di atas harga master |
| Barang tidak ada di rak | Picker lapor tidak ada padahal stok sistem ada |
| Packing memaksa lanjut | Barang tidak cocok / kurang tapi tetap dikirim |
| Stok diubah di luar jam kerja | Penyesuaian manual di luar jam kerja |

## Biaya Supabase

- **Free**: database 500 MB, project dijeda kalau 1 minggu tidak dipakai. Cukup untuk uji coba.
- **Pro ($25/bulan)**: database 8 GB, storage 100 GB, tidak pernah dijeda. Cukup untuk ±1.000 input per hari selama bertahun-tahun.
  Foto otomatis dikompres ±80–150 KB sebelum di-upload.

## Kalau ada perubahan kode

Setiap kali mengubah file lalu upload ulang ke GitHub, naikkan `VERSION` di `sw.js` (mis. `v1.0.1`). Dengan begitu HP pegawai mengambil versi terbaru.

## Batasan versi ini

- **Butuh internet saat scan.** Aplikasi tetap terbuka saat offline, tetapi scan baru tersimpan kalau ada koneksi.
- **Notifikasi** muncul secara langsung (realtime) selama aplikasi terbuka, termasuk saat aplikasi di latar belakang. Push notification ketika aplikasi benar-benar ditutup butuh server Web Push (bisa ditambahkan nanti dengan Supabase Edge Function).
- **Nama kolom file Shopee** kadang berubah. Kalau kolom tidak terbaca otomatis, pilih manual di layar upload (pilihan tersimpan untuk upload berikutnya).
- **Data harga & modal** dibatasi lewat tampilan menu per jabatan. Tabel pesanan tetap bisa dibaca semua pegawai lewat API, karena picker & packing membutuhkannya.
