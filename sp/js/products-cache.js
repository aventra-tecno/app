// 2.36: daftar barang disimpan di HP (IndexedDB). Setelah pertama kali, yang diambil dari server
// hanya barang yang berubah sejak terakhir (kolom updated_at) -> hemat kuota data Supabase.
// Ambil penuh lagi sekali sehari (supaya barang yang dihapus ikut hilang dari HP).
import { supa, fetchAll } from './supa.js';
import { SUPABASE_URL } from './config.js';

const DB = 'sg-cache', ST = 'kv', KEY = 'products:' + String(SUPABASE_URL || '').replace(/^https?:\/\//, '');
const FULL_MS = 24 * 3600e3, FRESH_MS = 20e3;
let mem = null, busy = null;

function idb() {
  return new Promise((res, rej) => {
    try { const r = indexedDB.open(DB, 1); r.onupgradeneeded = () => r.result.createObjectStore(ST); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }
    catch (e) { rej(e); }
  });
}
async function idbGet(k) { try { const d = await idb(); return await new Promise((res) => { const q = d.transaction(ST).objectStore(ST).get(k); q.onsuccess = () => res(q.result || null); q.onerror = () => res(null); }); } catch (_) { return null; } }
async function idbSet(k, v) { try { const d = await idb(); await new Promise((res) => { const t = d.transaction(ST, 'readwrite'); t.objectStore(ST).put(v, k); t.oncomplete = res; t.onerror = res; }); } catch (_) { /* penyimpanan HP penuh / mode privat: tetap jalan dari memori */ } }

const maxTs = (rows, cur) => rows.reduce((m, r) => (r.updated_at && r.updated_at > m ? r.updated_at : m), cur || '');

async function sync(force) {
  if (!mem) mem = (await idbGet(KEY)) || null;
  if (mem && !force && Date.now() - (mem.at || 0) < FRESH_MS) return mem;
  const full = !mem || !mem.sync || Date.now() - (mem.fullAt || 0) > FULL_MS;
  if (full) {
    const rows = await fetchAll(() => supa.from('products').select('*').order('id'));
    mem = { rows: Object.fromEntries(rows.map((r) => [r.id, r])), sync: maxTs(rows), fullAt: Date.now(), at: Date.now() };
  } else {
    const rows = await fetchAll(() => supa.from('products').select('*').gte('updated_at', mem.sync).order('id'));
    rows.forEach((r) => { mem.rows[r.id] = r; });
    mem.sync = maxTs(rows, mem.sync); mem.at = Date.now();
  }
  idbSet(KEY, mem);
  return mem;
}

// semua barang (aktif & tidak aktif). opsi: { force: true } = cek perubahan sekarang juga
export async function allProductsCached({ force = false, active = null } = {}) {
  if (!busy) busy = sync(force).finally(() => { busy = null; });
  const m = await busy;
  let list = Object.values(m.rows);
  if (active !== null) list = list.filter((p) => !!p.active === active);
  return list;
}
// setelah menyimpan barang: ambil perubahan berikutnya tanpa menunggu
export function touchProducts() { if (mem) mem.at = 0; }
// keluar akun: hapus salinan di HP
export async function clearProductsCache() { mem = null; try { const d = await idb(); d.transaction(ST, 'readwrite').objectStore(ST).delete(KEY); } catch (_) {} }
