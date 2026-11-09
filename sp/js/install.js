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

export async function showInstall() {
  const apk = await apkInfo();
  const prompt = window.__installPrompt;
  const pwaHow = prompt ? '' : isIOS()
    ? '<ol class="ins-how"><li>Buka alamat ini di <b>Safari</b></li><li>Ketuk <b>Bagikan</b> (kotak panah ke atas)</li><li>Pilih <b>Tambah ke Layar Utama</b></li></ol>'
    : '<ol class="ins-how"><li>Buka alamat ini di <b>Chrome</b></li><li>Ketuk menu <b>titik tiga</b> di kanan atas</li><li>Pilih <b>Instal aplikasi</b> / <b>Tambahkan ke layar utama</b></li></ol>';
  const r = await modal({ title: 'Pasang aplikasi', body: `<div class="stack ins">
      <div class="ins-opt">
        <span class="ins-ic">${icon('install', 22, 2)}</span>
        <div class="grow"><b>Pasang langsung</b><span class="xs muted">Disarankan · ${isIOS() ? 'iPhone & Android' : 'HP Android, iPhone & laptop'} · otomatis selalu versi terbaru</span>${pwaHow}</div>
      </div>
      ${prompt ? '<button class="btn btn-primary btn-block" data-ins="pwa">Pasang sekarang</button>' : ''}
      <div class="ins-opt">
        <span class="ins-ic apk">${icon('download', 22, 2)}</span>
        <div class="grow"><b>Unduh aplikasi Android (APK)</b>
          <span class="xs muted">${apk ? `Versi ${esc(apk.version || '-')} · ${fmtSize(apk.size || 0)}${apk.uploaded_at ? ' · ' + esc(new Date(apk.uploaded_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })) : ''}` : 'Belum tersedia'}</span>
          ${apk ? `<span class="xs muted" style="display:block;margin-top:4px">Khusus Android. Setelah terunduh, buka filenya lalu izinkan <b>Instal aplikasi tak dikenal</b> bila diminta.${isAndroid() ? '' : ' Unduh dari HP Android.'}</span>` : ''}</div>
      </div>
      ${apk ? `<a class="btn btn-block" href="${esc(apk.url)}" download="${esc((apk.name || APP_NAME).replace(/[^\w.-]+/g, '-'))}.apk" data-ins="apk">${icon('download', 18)} Unduh APK</a>` : ''}
    </div>`, actions: [{ label: 'Tutup', value: false }],
    onOpen: (ov, close) => {
      ov.querySelector('[data-ins="pwa"]')?.addEventListener('click', async () => {
        try { await prompt.prompt(); const c = await prompt.userChoice; if (c?.outcome === 'accepted') { window.__installPrompt = null; close(true); toast('Aplikasi dipasang. Buka dari ikon di layar utama.', 'ok'); } } catch (_) {}
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
