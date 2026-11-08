import { esc, icon } from '../ui.js';
import { scanBox, bindScan, getScanMode, setScanMode, scannerStatusText, scannerMeta } from '../scanner.js';

// Pengaturan scanner: cara menyambung, tes scan, dan pilihan cara scan default di perangkat ini.
const MODES = [
  ['alat', 'scan', 'Scanner alat', 'Scanner USB / Bluetooth. Keyboard HP disembunyikan, tinggal tembak barcode.'],
  ['kamera', 'camera', 'Kamera HP', 'Pakai kamera belakang HP. Cocok kalau tidak ada scanner.'],
  ['ketik', 'list', 'Ketik manual', 'Ketik kode lalu Enter. Untuk barcode yang rusak / tidak terbaca.']
];

export default {
  tour: [
    { sel: '#st', title: 'Status scanner', body: 'Hijau berarti scanner sudah mengirim scan ke aplikasi di perangkat ini.' },
    { sel: '#modes', title: 'Cara scan', body: 'Pilih cara scan yang dipakai di semua menu scan pada perangkat ini.' },
    { sel: '#test', title: 'Tes scanner', body: 'Scan barcode apa saja di sini. Aplikasi menunjukkan apakah scanner terbaca dengan benar.' }
  ],
  async render(el) {
    el.innerHTML = `<div class="stack" style="max-width:760px">
      <section class="card stack" id="st"></section>
      <section class="card stack" id="modes"><h2 class="sec-title">Cara scan di perangkat ini</h2><div class="mode-grid"></div>
        <div class="small muted">Pilihan ini juga bisa diganti langsung lewat tombol di atas setiap kolom scan.</div></section>
      <section class="card stack" id="test"><h2 class="sec-title">Tes scanner</h2>
        <div class="small muted">Scan barcode apa saja (barang, resi, atau label rak). Tidak mengubah stok.</div>
        ${scanBox('tst', 'Scan barcode apa saja untuk tes')}
        <div id="res"></div></section>
      <section class="card stack"><h2 class="sec-title">Cara menyambungkan scanner</h2>
        <details open><summary><b>Scanner Bluetooth</b></summary><ol class="guide">
          <li>Nyalakan scanner. Pastikan mode <b>HID / Keyboard</b> (lihat buku panduan scanner: biasanya scan barcode "HID" atau "Bluetooth Keyboard").</li>
          <li>HP: <b>Setelan › Koneksi › Bluetooth</b>, nyalakan, pilih nama scanner, lalu sambungkan. Kalau diminta PIN, coba 0000 atau 1234, atau scan barcode PIN di buku panduan.</li>
          <li>Buka aplikasi, pilih menu scan (Ambil, Packing, Terima, Retur, atau Cek barcode), lalu tembak barcode. Muncul tulisan <b>"Scanner terhubung ✓"</b>.</li></ol></details>
        <details><summary><b>Scanner USB (kabel)</b></summary><ol class="guide">
          <li>Laptop: colok langsung ke port USB.</li>
          <li>HP: pakai <b>kabel / converter OTG</b> (USB ke Type-C atau micro USB). Samsung biasanya langsung bisa.</li>
          <li>Scanner mengetik seperti keyboard, jadi tidak perlu aplikasi tambahan.</li></ol></details>
        <details><summary><b>Kalau ada masalah</b></summary><ul class="guide">
          <li><b>Keyboard HP muncul menutupi layar:</b> pilih cara scan <b>Scanner alat</b>.</li>
          <li><b>Huruf hasil scan berantakan / salah:</b> atur bahasa keyboard scanner ke <b>US English</b> (biasanya lewat barcode pengaturan di buku panduan scanner).</li>
          <li><b>Harus tekan Enter manual:</b> aktifkan akhiran <b>Enter / CR</b> di scanner. Tanpa akhiran tetap bisa, hanya sedikit lebih lambat.</li>
          <li><b>Scan diabaikan:</b> scanner hanya bekerja di <b>menu scan</b>. Di menu lain, scan sengaja ditolak supaya tidak salah input.</li>
          <li><b>Scanner Bluetooth putus sendiri:</b> scanner masuk mode tidur. Tekan tombolnya sekali, lalu tunggu 2–3 detik sampai tersambung lagi.</li></ul></details>
        <div class="alert blue small">Browser dan aplikasi web tidak bisa melihat daftar alat Bluetooth/USB di HP. Karena itu scanner baru dikenali <b>setelah scan pertama</b>, bukan saat dicolok atau dipasangkan.</div>
      </section>
    </div>`;

    const paintStatus = () => {
      const st = scannerStatusText(), m = scannerMeta();
      el.querySelector('#st').innerHTML = `<div class="row between wrap"><h2 class="sec-title">${icon('scan', 18)} Status scanner</h2><span class="tag ${st.on ? 'green' : 'yellow'}">${st.on ? 'Terhubung' : 'Belum terdeteksi'}</span></div>
        <div class="sc-status big ${st.on ? 'on' : ''}"><i></i><span>${esc(st.text)}</span></div>
        ${m ? `<div class="grid gkpi"><div class="stat gray"><b>${m.ms ?? '–'} ms</b><span>jeda per huruf (makin kecil makin cepat)</span></div><div class="stat gray"><b>${esc(m.suffix)}</b><span>akhiran kode</span></div></div>` : ''}`;
    };
    const paintModes = () => {
      const cur = getScanMode();
      el.querySelector('.mode-grid').innerHTML = MODES.map(([k, ic, l, d]) => `<button class="mode-card ${k === cur ? 'on' : ''}" data-m="${k}">${icon(ic, 22)}<b>${l}</b><span>${d}</span>${k === cur ? `<em>${icon('check', 14, 3)} Dipakai</em>` : ''}</button>`).join('');
    };
    el.querySelector('.mode-grid').addEventListener('click', (e) => { const b = e.target.closest('[data-m]'); if (b) { setScanMode(b.dataset.m); paintModes(); } });
    const onMode = () => paintModes();
    const onDet = () => paintStatus();
    window.addEventListener('scan-mode', onMode);
    window.addEventListener('scanner-detected', onDet);
    this._off = () => { window.removeEventListener('scan-mode', onMode); window.removeEventListener('scanner-detected', onDet); };

    bindScan(el, 'tst', (code, meta) => {
      const src = meta?.source === 'alat' ? 'Scanner alat' : meta?.source === 'kamera' ? 'Kamera HP' : 'Ketik manual';
      el.querySelector('#res').innerHTML = `<div class="card outline stack s8"><div class="row between wrap"><b class="mono" style="font-size:18px;overflow-wrap:anywhere">${esc(code)}</b><span class="tag ${meta?.source === 'alat' ? 'green' : 'blue'}">${src}</span></div>
        <div class="small muted">${code.length} karakter${meta?.source === 'alat' ? ` · jeda ${meta.ms} ms/huruf · akhiran ${esc(meta.suffix)}` : ''}</div>
        ${meta?.source === 'ketik' && code.length > 6 ? '<div class="alert yellow small">Terbaca sebagai ketikan biasa. Kalau ini dari scanner, berarti scanner lambat atau ada yang menahan. Coba scan sekali lagi.</div>' : ''}</div>`;
      paintStatus();
      return { ok: true, title: 'Tes berhasil · ' + src, info: code.length + ' karakter' };
    });
    paintStatus(); paintModes();
  },
  destroy() { this._off && this._off(); }
};
