import { supa } from './supa.js';
import { SUPABASE_URL, APP_NAME } from './config.js';
import { esc, icon, modal, toast } from './ui.js';

// "Pasang aplikasi": 2 cara — pasang langsung (PWA dari browser) atau unduh file APK Android.
// File APK diunggah super admin ke bucket publik "unduhan"; info-nya di unduhan/apk.json.
export const BUCKET = 'unduhan';
const pub = (path) => `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path}`;
export const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true || document.referrer.startsWith('android-app://');
const isIOS = () => /iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isAndroid = () => /Android/i.test(navigator.userAgent);
export const fmtSize = (b) => (b >= 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB');

let apkCache;
export async function apkInfo(fresh = false) {
  if (apkCache !== undefined && !fresh) return apkCache;
  try {
    const r = await fetch(pub('apk.json') + '?t=' + Date.now(), { cache: 'no-store' });
    apkCache = r.ok ? await r.json() : null;
    if (apkCache) apkCache.url = pub(apkCache.path);
  } catch (_) { apkCache = null; }
  return apkCache;
}

// tunggu sebentar kalau Chrome belum sempat mengirim tawaran pasang (beforeinstallprompt)
const waitPrompt = (ms = 1500) => new Promise((res) => {
  if (window.__installPrompt) return res(window.__installPrompt);
  const t = setTimeout(() => res(window.__installPrompt || null), ms);
  addEventListener('beforeinstallprompt', () => { clearTimeout(t); setTimeout(() => res(window.__installPrompt), 0); }, { once: true });
});
const IOS_STEPS = `<ol class="ins-steps">
  <li><span class="ins-n">1</span><div>Buka alamat ini di <b>Safari</b> (kalau sekarang di aplikasi lain, salin alamatnya ke Safari)</div></li>
  <li><span class="ins-n">2</span><div>Ketuk tombol <b>Bagikan</b> <span class="ins-k"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12M8 7l4-4 4 4"/><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/></svg></span> di bawah layar</div></li>
  <li><span class="ins-n">3</span><div>Gulir ke bawah, pilih <b>Tambah ke Layar Utama</b> <span class="ins-k"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><rect x="3" y="3" width="18" height="18" rx="4"/><path d="M12 8v8M8 12h8"/></svg></span></div></li>
  <li><span class="ins-n">4</span><div>Ketuk <b>Tambah</b> di kanan atas, lalu buka aplikasi dari ikon di layar utama</div></li></ol>`;
const ANDROID_STEPS = `<ol class="ins-steps">
  <li><span class="ins-n">1</span><div>Buka alamat ini di <b>Chrome</b></div></li>
  <li><span class="ins-n">2</span><div>Ketuk menu <b>titik tiga</b> <span class="ins-k">⋮</span> di kanan atas</div></li>
  <li><span class="ins-n">3</span><div>Pilih <b>Instal aplikasi</b> / <b>Tambahkan ke layar utama</b> › <b>Instal</b></div></li></ol>`;

export async function showInstall() {
  const ios = isIOS(), android = isAndroid();
  const apk = ios ? null : await apkInfo();
  const r = await modal({ title: 'Pasang aplikasi', body: `<div class="stack ins">
      <div class="ins-opt">
        <span class="ins-ic">${icon('install', 22, 2)}</span>
        <div class="grow"><b>${ios ? 'Pasang di iPhone' : 'Pasang langsung'}</b><span class="xs muted">${ios ? 'Lewat Safari · otomatis selalu versi terbaru' : 'Disarankan · otomatis selalu versi terbaru'}</span></div>
      </div>
      ${ios ? IOS_STEPS : `<button class="btn btn-primary btn-lg btn-block" data-ins="pwa">${icon('install', 20)} Pasang sekarang</button><div id="ins-fb"></div>`}
      ${!ios ? `<div class="ins-opt">
        <span class="ins-ic apk">${icon('download', 22, 2)}</span>
        <div class="grow"><b>Unduh aplikasi Android (APK)</b>
          <span class="xs muted">${apk ? `Versi ${esc(apk.version || '-')} · ${fmtSize(apk.size || 0)}${apk.uploaded_at ? ' · ' + esc(new Date(apk.uploaded_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })) : ''}` : 'Belum tersedia'}</span>
          ${apk ? `<span class="xs muted" style="display:block;margin-top:4px">Khusus Android. Setelah terunduh, buka filenya lalu izinkan <b>Instal aplikasi tak dikenal</b> bila diminta.${android ? '' : ' Unduh dari HP Android.'}</span>` : ''}</div>
      </div>
      ${apk ? `<a class="btn btn-block" href="${esc(apk.url)}" download="${esc((apk.name || APP_NAME).replace(/[^\w.-]+/g, '-'))}.apk" data-ins="apk">${icon('download', 18)} Unduh APK</a>` : ''}` : ''}
    </div>`, actions: [{ label: 'Tutup', value: false }],
    onOpen: (ov, close) => {
      const btn = ov.querySelector('[data-ins="pwa"]');
      btn?.addEventListener('click', async () => {
        btn.disabled = true; btn.textContent = 'Menyiapkan…';
        const p = await waitPrompt();
        if (p) {
          try {
            await p.prompt();                         // jendela "Instal aplikasi" dari Chrome / Android langsung muncul
            const c = await p.userChoice;
            window.__installPrompt = null;
            if (c?.outcome === 'accepted') { close(true); toast('Sedang dipasang… ikon muncul di layar utama sebentar lagi.', 'ok'); return; }
          } catch (_) {}
          btn.disabled = false; btn.innerHTML = `${icon('install', 20)} Pasang sekarang`;
          return;
        }
        // browser tidak memberi tawaran pasang (sudah terpasang, bukan Chrome, atau mode samaran): tampilkan cara manual
        btn.remove();
        ov.querySelector('#ins-fb').innerHTML = `<div class="alert blue small" style="margin:0 0 4px">Pemasangan otomatis tidak tersedia di browser ini${android ? '' : ' (atau aplikasi sudah terpasang)'}. Ikuti langkah berikut:</div>${android || !ios ? ANDROID_STEPS : IOS_STEPS}`;
      });
      ov.querySelector('[data-ins="apk"]')?.addEventListener('click', () => toast('Mengunduh APK…', 'ok'));
    } });
  return r;
}

// super admin: unggah / hapus APK
export async function uploadApk(file, version, prev) {
  if (!/\.apk$/i.test(file.name)) throw new Error('Pilih file berakhiran .apk');
  if (file.size > 50 * 1048576) throw new Error('File lebih dari 50 MB');
  const path = `apk/${Date.now()}.apk`;
  const up = await supa.storage.from(BUCKET).upload(path, file, { contentType: 'application/vnd.android.package-archive', cacheControl: '31536000', upsert: false });
  if (up.error) throw up.error;
  const info = { path, name: APP_NAME, version: version || '', size: file.size, file: file.name, uploaded_at: new Date().toISOString() };
  const meta = await supa.storage.from(BUCKET).upload('apk.json', new Blob([JSON.stringify(info)], { type: 'application/json' }), { contentType: 'application/json', cacheControl: '30', upsert: true });
  if (meta.error) { await supa.storage.from(BUCKET).remove([path]); throw meta.error; }
  if (prev?.path) await supa.storage.from(BUCKET).remove([prev.path]).catch(() => {});
  apkCache = undefined;
  return info;
}
export async function removeApk(prev) {
  const { error } = await supa.storage.from(BUCKET).remove(['apk.json', ...(prev?.path ? [prev.path] : [])]);
  if (error) throw error;
  apkCache = undefined;
}
