import { supa, rpc } from './supa.js';
import { deviceLabel } from './version.js';

// Push notifikasi: muncul di HP / laptop walau aplikasi ditutup (seperti pesan WhatsApp).
export const isIOS = () => /iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
export const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
export const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
export const pushPermission = () => ('Notification' in window ? Notification.permission : 'unsupported');

function keyBytes(b64) {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

async function publicKey() {
  let key = await rpc('push_public_key').catch(() => null);
  if (typeof key !== 'string' || key.length < 40) {
    const { data, error } = await supa.functions.invoke('send-push', { body: { init: true } });
    if (error || !data?.publicKey) throw new Error('Server notifikasi belum dipasang (Edge Function send-push). Lihat panduan update 1.8.');
    key = data.publicKey;
  }
  return key;
}

async function registration() {
  const reg = await Promise.race([navigator.serviceWorker.ready, new Promise((_, rej) => setTimeout(() => rej(new Error('Service worker belum siap, muat ulang aplikasi')), 8000))]);
  return reg;
}

// daftarkan perangkat ini (dipanggil setelah izin diberikan)
export async function subscribePush() {
  if (!pushSupported()) throw new Error('Perangkat / browser ini tidak mendukung notifikasi');
  const reg = await registration();
  const key = await publicKey();
  let sub = await reg.pushManager.getSubscription();
  // kunci server berganti -> daftar ulang
  if (sub && sub.options?.applicationServerKey) {
    const cur = btoa(String.fromCharCode(...new Uint8Array(sub.options.applicationServerKey))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    if (cur !== key.replace(/=+$/, '')) { await sub.unsubscribe().catch(() => {}); sub = null; }
  }
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(key) });
  const j = sub.toJSON();
  await rpc('save_push_subscription', { p_endpoint: j.endpoint, p_p256dh: j.keys.p256dh, p_auth: j.keys.auth, p_device: deviceLabel() });
  return true;
}

// minta izin (harus dari ketukan tombol)
export async function enablePush() {
  if (!pushSupported()) throw new Error('Perangkat / browser ini tidak mendukung notifikasi');
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error(perm === 'denied'
    ? 'Notifikasi diblokir. Buka Setelan HP › Aplikasi › Stok Gudang › Notifikasi › izinkan, lalu coba lagi.'
    : 'Izin notifikasi belum diberikan');
  return subscribePush();
}

// saat keluar: HP ini berhenti menerima notifikasi akun tersebut
export async function unsubscribePush() {
  try {
    if (!pushSupported()) return;
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    if (!sub) return;
    await Promise.race([rpc('delete_push_subscription', { p_endpoint: sub.endpoint }), new Promise((r) => setTimeout(r, 1500))]).catch(() => {});
    await sub.unsubscribe().catch(() => {});
  } catch (_) {}
}

// dipanggil saat aplikasi dibuka: notifikasi langsung aktif tanpa tombol.
// Izin diminta otomatis; kalau HP mengharuskan ketukan dulu (iPhone), izin diminta pada ketukan pertama di layar.
let asking = false;
async function askNow() {
  if (asking || Notification.permission !== 'default') return;
  asking = true;
  try {
    const p = await Notification.requestPermission();
    if (p === 'granted') await subscribePush();
  } catch (_) {} finally { asking = false; }
}
export async function initPush() {
  if (!pushSupported()) return;
  if (Notification.permission === 'granted') { subscribePush().catch(() => {}); return; }
  if (Notification.permission !== 'default') return;
  await askNow();
  if (Notification.permission === 'default') {
    const once = () => { document.removeEventListener('pointerdown', once, true); askNow(); };
    document.addEventListener('pointerdown', once, true);
  }
}
export const sendTestPush = () => rpc('push_test');
