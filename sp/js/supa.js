import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.104.1/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

export const configured = !SUPABASE_URL.includes('ISI-PROJECT') && !SUPABASE_ANON_KEY.includes('ISI-ANON');

// Permintaan yang menggantung (sinyal jelek / HP baru bangun dari layar mati) dihentikan otomatis
// supaya tombol tidak "macet" menunggu selamanya.
// garis loading di atas layar: hanya muncul kalau ada data yang dimuat lebih dari 300 ms (yang cepat tidak berkedip)
let busy = 0, busyT = null;
function netBar(on) {
  let bar = document.getElementById('netbar');
  if (on && !bar) { bar = document.createElement('div'); bar.id = 'netbar'; bar.innerHTML = '<i></i>'; document.body.appendChild(bar); }
  if (bar) bar.classList.toggle('on', on);
}
function track(p, url) {
  if (/\/realtime\/|report_version|activity_|log_event|log_page/.test(String(url))) return p;   // permintaan latar belakang tidak ditampilkan
  if (busy++ === 0) { clearTimeout(busyT); busyT = setTimeout(() => busy && netBar(true), 300); }
  return p.finally(() => { if (--busy <= 0) { busy = 0; clearTimeout(busyT); netBar(false); } });
}
function fetchTimeout(url, opt = {}) {
  const ms = /\/storage\//.test(String(url)) ? 90000 : 25000;
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  if (opt.signal) opt.signal.addEventListener('abort', () => ctl.abort());
  return track(fetch(url, { ...opt, signal: ctl.signal }).finally(() => clearTimeout(t)), url);
}
// kunci sesi sederhana di dalam tab (kunci bawaan browser kadang tersangkut setelah tab lama di belakang)
let lockChain = Promise.resolve();
const tabLock = (_name, _timeout, fn) => { const run = lockChain.then(() => fn()); lockChain = run.catch(() => {}); return run; };

export const supa = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: 'stok-gudang-auth', lock: tabLock },
  global: { fetch: fetchTimeout }
});
// saat aplikasi dibuka lagi setelah lama di belakang: segarkan sesi
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') supa.auth.getSession().catch(() => {});
});

// klien sementara untuk membuat akun pegawai tanpa mengganti sesi owner
export function tempClient() {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: 'tmp-' + Date.now() }
  });
}

const MESSAGES = [
  [/Invalid login credentials/i, 'Email atau password salah.'],
  [/Email not confirmed/i, 'Email belum dikonfirmasi. Matikan "Confirm email" di Supabase atau buka email konfirmasi.'],
  [/User already registered/i, 'Email ini sudah terdaftar.'],
  [/Password should be at least/i, 'Password minimal 6 karakter.'],
  [/rate limit/i, 'Terlalu banyak percobaan. Tunggu sebentar lalu coba lagi.'],
  [/Failed to fetch|NetworkError|Load failed/i, 'Tidak ada koneksi internet / server tidak terjangkau.'],
  [/AbortError|aborted/i, 'Server terlalu lama menjawab (koneksi lambat). Coba tekan lagi.'],
  [/duplicate key|already exists/i, 'Data dengan kode itu sudah ada.'],
  [/Registration failed|push service error/i, 'HP menolak pendaftaran notifikasi. Pastikan notifikasi diizinkan untuk aplikasi ini (Setelan HP › Aplikasi › Stok Gudang › Notifikasi), lalu coba lagi.'],
  [/JWT expired/i, 'Sesi habis, silakan login ulang.'],
  [/schema cache|Could not find the function/i, 'Database belum diperbarui ke versi aplikasi ini. Buka Supabase › SQL Editor, jalankan ulang seluruh isi supabase/schema.sql (aman, data tidak hilang), lalu coba lagi.']
];
export function errMsg(e) {
  const m = (e && (e.message || e.error_description || e.msg)) || String(e || 'Terjadi kesalahan');
  for (const [re, t] of MESSAGES) if (re.test(m)) return t;
  return m;
}

export async function rpc(name, args = {}) {
  const { data, error } = await supa.rpc(name, args);
  if (error) throw error;
  return data;
}

export async function q(promise) {
  const { data, error, count } = await promise;
  if (error) throw error;
  return count !== undefined && count !== null && data === null ? count : data;
}

// catat aktivitas dari aplikasi (tidak pernah mengganggu kerja: gagal = diam)
export function logEvent(kind, summary, ref = null) {
  try { supa.rpc('log_event', { p_kind: kind, p_summary: summary, p_ref: ref }).then(() => {}, () => {}); } catch (_) {}
}
// buka halaman: dicatat paling sering 1× per 10 menit per halaman
const seen = {};
export function logPage(key, label) {
  const now = Date.now();
  if (seen[key] && now - seen[key] < 600000) return;
  seen[key] = now;
  logEvent('halaman', 'Buka halaman ' + label, key);
}

// Supabase membatasi 1000 baris per permintaan -> ambil bertahap sampai habis
export async function fetchAll(build, size = 1000, max = 50000) {
  const out = [];
  for (let from = 0; from < max; from += size) {
    const { data, error } = await build().range(from, from + size - 1);
    if (error) throw error;
    out.push(...(data || []));
    if (!data || data.length < size) break;
  }
  return out;
}
