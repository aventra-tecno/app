import { esc, icon, toast, beep, modal } from './ui.js';

// Kolom scan untuk 3 cara:
// 1) Scanner Bluetooth / USB (langsung bekerja di kolom isian) (langsung atau lewat OTG converter): alat bekerja seperti keyboard,
//    mengetik kode sangat cepat lalu Enter / Tab / tanpa akhiran. Semua didukung.
// 2) Ketik manual + Enter.
// 3) Kamera HP.
// Scan tetap tertangkap walau kolom tidak sedang dipilih (selama tidak sedang mengetik di kolom lain).
let active = null;          // handler scan halaman yang sedang tampil

// ---------- mode scan: Kamera HP / Ketik ----------
// 2.39: tab "Scanner alat" & halaman Pengaturan scanner dihapus. Scanner USB/Bluetooth tetap langsung
// bekerja di kolom isian (dikenali dari ketikan yang sangat cepat), tanpa perlu dipilih.
const MODE_KEY = 'scan-mode';
const MODES = [['kamera', 'camera', 'Kamera HP'], ['ketik', 'list', 'Ketik']];
const ls = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (_) {} return null; };
const isMobile = () => window.matchMedia('(max-width: 899px)').matches;
export function getScanMode() {
  const m = ls(MODE_KEY);
  if (MODES.some(([k]) => k === m)) return m;
  return isMobile() ? 'kamera' : 'ketik';
}
export function setScanMode(m) {
  ls(MODE_KEY, m);
  document.querySelectorAll('.scanwrap').forEach((w) => w.__applyMode && w.__applyMode(m));
}

export function scanBox(id, placeholder = 'Scan / ketik barcode lalu Enter') {
  return `<div class="scanwrap" data-ph="${esc(placeholder)}">
    <div class="scan-modes" role="group" aria-label="Cara scan">${MODES.map(([k, ic, l]) => `<button type="button" class="sm-btn" data-mode="${k}">${icon(ic, 16)}<span>${l}</span></button>`).join('')}</div>
    <form class="scanbox" id="${id}" autocomplete="off">
      <input class="input grow" name="code" placeholder="${esc(placeholder)}" inputmode="text" enterkeyhint="go" aria-label="${esc(placeholder)}" autocapitalize="characters" autocorrect="off" spellcheck="false">
      <button type="button" class="btn btn-dark" data-cam aria-label="Scan pakai kamera">${icon('camera')}<span class="cam-lbl">Kamera</span></button>
    </form>
    <div class="scan-hint" data-hint></div>
  </div>`;
}

export function bindScan(root, id, onScan, { autofocus = true } = {}) {
  const form = root.querySelector('#' + id);
  const wrap = form.closest('.scanwrap');
  const inp = form.querySelector('input');
  const ph = wrap?.dataset.ph || inp.placeholder;
  let busy = false, times = [], idleTimer = null;
  const fire = async (code, meta = { source: 'ketik' }) => {
    code = String(code || '').replace(/[\r\n\t]/g, '').trim();
    if (!code || busy) return null;
    busy = true;
    try {
      const res = await onScan(code, meta);
      const r = res && typeof res === 'object' ? res : { ok: res !== false };
      form.classList.remove('scan-flash', 'bad'); void form.offsetWidth;
      form.classList.add('scan-flash'); if (!r.ok) form.classList.add('bad');
      showScanResult({ code, ...r });
      return r;
    } finally { busy = false; }
  };
  const speed = () => { const n = times.length; return n >= 4 ? (times[n - 1] - times[0]) / (n - 1) : null; };
  const submit = (suffix) => {
    clearTimeout(idleTimer);
    const ms = speed();
    const meta = ms !== null && ms < 35 ? { source: 'alat', ms: Math.round(ms * 10) / 10, suffix } : { source: 'ketik' };
    const v = inp.value; inp.value = ''; times = []; fire(v, meta);
  };
  form.addEventListener('submit', (e) => { e.preventDefault(); submit('Enter'); });
  inp.addEventListener('keydown', (e) => {
    if (e.key === 'Tab' && inp.value.trim()) { e.preventDefault(); submit('Tab'); return; }   // scanner dengan akhiran Tab
    if (e.key.length === 1) times.push(performance.now());
  });
  // scanner tanpa akhiran: huruf masuk sangat cepat lalu berhenti -> kirim otomatis
  inp.addEventListener('input', () => {
    clearTimeout(idleTimer);
    const s = speed();
    if (s !== null && s < 35) idleTimer = setTimeout(() => submit('tanpa akhiran'), 120);
  });
  form.querySelector('[data-cam]').addEventListener('click', () => openCamera((c) => fire(c, { source: 'kamera' })));

  const applyMode = (m) => {
    if (!wrap) return;
    wrap.dataset.mode = m;
    wrap.querySelectorAll('[data-mode]').forEach((b) => { b.classList.toggle('on', b.dataset.mode === m); b.setAttribute('aria-pressed', b.dataset.mode === m); });
    inp.setAttribute('inputmode', 'text');
    inp.placeholder = m === 'kamera' ? 'Ketuk Kamera, atau ketik / scan kode' : ph;
    wrap.querySelector('[data-hint]').innerHTML = m === 'kamera' ? '<span class="muted">Ketuk tombol <b>Kamera</b> lalu arahkan ke barcode.</span>' : '<span class="muted">Ketik kode lalu tekan Enter, atau langsung tembak pakai scanner.</span>';
  };
  if (wrap) {
    wrap.__applyMode = applyMode;
    wrap.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click', () => {
      setScanMode(b.dataset.mode);
      if (b.dataset.mode === 'kamera') openCamera((c) => fire(c, { source: 'kamera' }));
    }));
    applyMode(getScanMode());
  }
  active = { fire, inp };
  if (autofocus && window.matchMedia('(min-width: 900px)').matches) setTimeout(() => inp.focus({ preventScroll: true }), 60);
  return { focus: () => inp.focus(), fire };
}

// Scan dari alat saat kolom scan tidak sedang dipilih.
// Di halaman TANPA menu scan, scan ditolak (app.js memasang pesan penjelasannya lewat setFallbackScan).
let fallback = null;
export function setFallbackScan(fn) { fallback = fn; }
function target() {
  if (active && document.body.contains(active.inp)) return active.fire;
  active = null;
  if (!fallback) return null;
  return (code, meta) => {
    code = String(code || '').trim();
    if (!code) return;
    const r = fallback(code) || { ok: false, title: 'Bukan menu scan' };
    beepSafe(false);
    showScanResult({ code, ...r });
  };
}
function beepSafe(ok) { try { beep(ok !== false); } catch (_) {} }
let buf = '', bufTimes = [], bufTimer = null;
const bufSpeed = () => { const n = bufTimes.length; return n > 1 ? (bufTimes[n - 1] - bufTimes[0]) / (n - 1) : 999; };
document.addEventListener('keydown', (e) => {
  const fire = target();
  if (!fire) return;
  const t = e.target;
  if (active && t === active.inp) return;
  if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
  if (document.querySelector('.overlay, .camera, .tour-block')) return;
  if (e.ctrlKey || e.altKey || e.metaKey) return;
  const now = performance.now();
  if ((e.key === 'Enter' || e.key === 'Tab') && buf.length >= 3) {
    const ms = bufSpeed();
    if (ms < 35) { e.preventDefault(); clearTimeout(bufTimer); const code = buf; buf = ''; bufTimes = []; fire(code, { source: 'alat', ms: Math.round(ms * 10) / 10, suffix: e.key }); }
    return;
  }
  if (e.key.length !== 1) return;
  if (bufTimes.length && now - bufTimes[bufTimes.length - 1] > 80) { buf = ''; bufTimes = []; }
  buf += e.key; bufTimes.push(now);
  clearTimeout(bufTimer);
  bufTimer = setTimeout(() => {   // tanpa akhiran
    const ms = bufSpeed();
    if (buf.length >= 4 && ms < 35) { const f = target(); f && f(buf, { source: 'alat', ms: Math.round(ms * 10) / 10, suffix: 'tanpa akhiran' }); }
    buf = ''; bufTimes = [];
  }, 150);
});

// Pop-up hasil scan: hijau = berhasil, merah = gagal. Hilang sendiri, atau ketuk untuk menutup.
let popEl = null, popTimer = null;
export function showScanResult({ ok, code, title, info }) {
  if (!popEl) {
    popEl = document.createElement('div');
    popEl.className = 'scan-pop';
    popEl.setAttribute('role', 'status');
    popEl.addEventListener('click', () => popEl.classList.remove('show'));
    document.body.appendChild(popEl);
  }
  popEl.className = 'scan-pop ' + (ok ? 'ok' : 'bad');
  popEl.innerHTML = `<div class="sp-ic">${icon(ok ? 'check' : 'x', 30, 3)}</div>
    <div class="sp-body"><div class="sp-st">${ok ? 'Scan berhasil' : 'Scan gagal'}</div>
    <div class="sp-title">${esc(title || (ok ? 'Kode diterima' : 'Kode tidak dikenali'))}</div>
    <div class="sp-code">${esc(code || '')}</div>${info ? `<div class="sp-info">${esc(info)}</div>` : ''}</div>`;
  document.body.appendChild(popEl);          // pastikan di atas kamera
  requestAnimationFrame(() => popEl.classList.add('show'));
  clearTimeout(popTimer);
  popTimer = setTimeout(() => popEl.classList.remove('show'), ok ? 1800 : 2800);
}

const FORMATS = ['code_128', 'ean_13', 'ean_8', 'code_39', 'code_93', 'upc_a', 'upc_e', 'itf', 'codabar', 'qr_code', 'data_matrix'];

// Kamera HP. Dibuat lebih tahan untuk barcode panjang (Code128 13+ karakter):
// resolusi tinggi, fokus otomatis terus-menerus, zoom, area tengah diperbesar,
// dan dua mesin pembaca (bawaan Chrome + ZXing) dipakai bergantian.
export async function openCamera(onCode, { continuous = true, title = 'Arahkan kamera ke barcode' } = {}) {
  if (!navigator.mediaDevices?.getUserMedia) { toast('Kamera tidak didukung di browser ini', 'err'); return; }
  const wrap = document.createElement('div');
  wrap.className = 'camera';
  wrap.innerHTML = `<video playsinline muted></video><div class="frame"></div>
    <div class="cam-top"><span>${esc(title)}</span><button class="btn btn-sm" data-close>Tutup</button></div>
    <div class="cam-bar"><div class="cam-tip">Isi kotak kuning dengan barcode (jarak ±10–20 cm). Dari layar laptop, miringkan HP sedikit supaya tidak ada garis-garis.</div>
      <div class="cam-last" aria-live="polite"></div>
      <label class="cam-keep"><input type="checkbox" data-keep> Scan terus (kamera tidak menutup setelah berhasil)</label>
      <div class="row"><button class="btn grow" data-torch style="display:none">Senter</button><button class="btn grow" data-zoom style="display:none">Zoom 2×</button><button class="btn btn-primary grow" data-close>Selesai</button></div></div>`;
  document.body.appendChild(wrap);
  const video = wrap.querySelector('video');
  const last = wrap.querySelector('.cam-last');
  let stream, stopped = false, lastCode = '', lastAt = 0;

  const stop = () => {
    stopped = true;
    stream && stream.getTracks().forEach((t) => t.stop());
    wrap.remove();
  };
  wrap.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', stop));

  const keep = wrap.querySelector('[data-keep]');
  try { keep.checked = localStorage.getItem('cam-keep') === '1'; } catch (_) {}
  keep.addEventListener('change', () => { try { localStorage.setItem('cam-keep', keep.checked ? '1' : '0'); } catch (_) {} });
  let handling = false;
  const handle = async (code) => {
    const now = Date.now();
    if (!code || handling || (code === lastCode && now - lastAt < 2500)) return;
    handling = true; lastCode = code; lastAt = now;
    last.textContent = code;
    try {
      const r = await onCode(code);
      const ok = r ? r.ok !== false : true;
      if (ok && !keep.checked) setTimeout(stop, 350);   // berhasil -> kamera menutup, hasil tetap tampil
    } finally { handling = false; }
  };

  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: {
      facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 },
      advanced: [{ focusMode: 'continuous' }] } });
  } catch (e) {
    try { stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false }); }
    catch (_) { stop(); toast('Izin kamera ditolak. Izinkan kamera di pengaturan browser.', 'err'); return; }
  }
  video.srcObject = stream;
  await video.play().catch(() => {});

  const track = stream.getVideoTracks()[0];
  const caps = track.getCapabilities ? track.getCapabilities() : {};
  const apply = (c) => track.applyConstraints({ advanced: [c] }).catch(() => {});
  if (caps.focusMode && caps.focusMode.includes('continuous')) apply({ focusMode: 'continuous' });
  if (caps.torch) {
    const tb = wrap.querySelector('[data-torch]'); tb.style.display = '';
    let on = false;
    tb.addEventListener('click', () => { on = !on; apply({ torch: on }); tb.textContent = on ? 'Senter mati' : 'Senter'; });
  }
  if (caps.zoom && caps.zoom.max >= 1.5) {
    const zb = wrap.querySelector('[data-zoom]'); zb.style.display = '';
    let z = 1;
    zb.addEventListener('click', () => { z = z === 1 ? Math.min(2, caps.zoom.max) : 1; apply({ zoom: z }); zb.textContent = z === 1 ? 'Zoom 2×' : 'Zoom 1×'; });
  }

  // potongan tengah gambar (sesuai kotak kuning), diperbesar supaya garis tipis terbaca
  const canvas = document.createElement('canvas');
  const cx = canvas.getContext('2d', { willReadFrequently: true });
  const crop = () => {
    const vw = video.videoWidth, vh = video.videoHeight;
    if (!vw || !vh) return null;
    const w = Math.round(vw * 0.9), h = Math.round(vh * 0.45);
    const scale = Math.min(2, 1600 / w);
    canvas.width = Math.round(w * scale); canvas.height = Math.round(h * scale);
    cx.imageSmoothingEnabled = false;
    cx.drawImage(video, (vw - w) / 2, (vh - h) / 2, w, h, 0, 0, canvas.width, canvas.height);
    return canvas;
  };

  let detector = null;
  if ('BarcodeDetector' in window) {
    try {
      const supported = await window.BarcodeDetector.getSupportedFormats();
      const f = FORMATS.filter((x) => supported.includes(x));
      if (f.length) detector = new window.BarcodeDetector({ formats: f });
    } catch (_) { detector = null; }
  }
  let zx = null, zxLoading = false;
  const loadZx = async () => {
    if (zx || zxLoading) return; zxLoading = true;
    try {
      const lib = await import('https://cdn.jsdelivr.net/npm/@zxing/library@0.21.3/+esm');
      const hints = new Map();
      hints.set(lib.DecodeHintType.TRY_HARDER, true);
      hints.set(lib.DecodeHintType.POSSIBLE_FORMATS, [lib.BarcodeFormat.CODE_128, lib.BarcodeFormat.EAN_13, lib.BarcodeFormat.EAN_8, lib.BarcodeFormat.CODE_39, lib.BarcodeFormat.UPC_A, lib.BarcodeFormat.ITF, lib.BarcodeFormat.QR_CODE]);
      const reader = new lib.MultiFormatReader(); reader.setHints(hints);
      zx = (c) => {
        const { width: w, height: h } = c;
        const px = cx.getImageData(0, 0, w, h).data;
        const lum = new Uint8ClampedArray(w * h);
        for (let i = 0, j = 0; i < lum.length; i++, j += 4) lum[i] = (px[j] * 299 + px[j + 1] * 587 + px[j + 2] * 114) / 1000;
        try { return reader.decode(new lib.BinaryBitmap(new lib.HybridBinarizer(new lib.RGBLuminanceSource(lum, w, h)))).getText(); }
        catch (_) { return null; }
      };
    } catch (e) { console.error(e); if (!detector) toast('Pembaca barcode gagal dimuat. Ketik kodenya atau pakai scanner.', 'err'); }
  };
  if (!detector) loadZx();
  const started = Date.now();
  let tick = 0;
  const loop = async () => {
    if (stopped) return;
    try {
      if (video.readyState >= 2) {
        tick++;
        let code = null;
        if (detector) {
          const src = tick % 2 ? crop() : video;      // bergantian: area tengah diperbesar & gambar penuh
          const r = src ? await detector.detect(src) : [];
          if (r.length) code = r[0].rawValue;
          if (!code && Date.now() - started > 2500) loadZx();   // belum terbaca -> bantu dengan ZXing
        }
        if (!code && zx && (!detector || tick % 3 === 0)) { const c = crop(); if (c) code = zx(c); }
        if (code) await handle(code);
      }
    } catch (_) {}
    setTimeout(loop, detector ? 90 : 160);
  };
  loop();
}
