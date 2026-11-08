import { APP_VERSION, APP_BUILD } from './config.js';

// Versi yang sedang dipakai perangkat ini (diisi otomatis oleh GitHub Actions saat upload).
export const CURRENT = { version: APP_VERSION, build: APP_BUILD };
export const versionLabel = (v = CURRENT) => 'v' + v.version;

export function deviceLabel() {
  const ua = navigator.userAgent;
  const os = /Android/i.test(ua) ? 'Android' : /iPhone|iPad|iPod/i.test(ua) ? 'iPhone/iPad' : /Windows/i.test(ua) ? 'Windows' : /Mac OS/i.test(ua) ? 'Mac' : /Linux/i.test(ua) ? 'Linux' : 'Lainnya';
  const app = document.referrer.startsWith('android-app://') ? 'aplikasi Android'
    : (window.matchMedia('(display-mode: standalone)').matches || navigator.standalone) ? 'terpasang' : 'browser';
  return os + ' · ' + app;
}

// versi terbaru di server
let latest = null;
export async function fetchLatest() {
  try {
    const r = await fetch('version.json?t=' + Date.now(), { cache: 'no-store' });
    if (!r.ok) return latest;
    latest = await r.json();
  } catch (_) { /* offline */ }
  return latest;
}
export const getLatest = () => latest;
export const isOutdated = (v, l = latest) => !!(l && v && l.version && v !== l.version && l.build !== 'dev');

// cek berkala: kalau ada versi baru, tampilkan bar "Perbarui"
let timer = null;
export function watchUpdates() {
  const check = async () => {
    const l = await fetchLatest();
    if (l && CURRENT.build !== 'dev' && isOutdated(CURRENT.version, l)) showUpdateBar(l);
  };
  check();
  clearInterval(timer);
  timer = setInterval(check, 5 * 60 * 1000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check(); });
}

export async function applyUpdate() {
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    await reg?.update();
  } catch (_) {}
  location.reload();
}

function showUpdateBar(l) {
  if (document.getElementById('upd-bar')) return;
  const bar = document.createElement('div');
  bar.id = 'upd-bar';
  bar.className = 'upd-bar';
  bar.innerHTML = `<div class="grow"><b>Versi baru v${l.version} tersedia</b><div class="xs">Kamu masih memakai ${versionLabel()}. Simpan pekerjaan, lalu perbarui.</div></div><button class="btn btn-sm" data-upd>Perbarui</button><button class="upd-x" data-x aria-label="Nanti">×</button>`;
  bar.querySelector('[data-upd]').onclick = applyUpdate;
  bar.querySelector('[data-x]').onclick = () => bar.remove();
  document.body.appendChild(bar);
}
