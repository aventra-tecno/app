// =====================================================================
// GANTI DUA NILAI DI BAWAH dengan milik project Supabase kamu:
// Supabase Dashboard › Project Settings › API
//   - Project URL        -> SUPABASE_URL
//   - publishable key (sb_publishable_...) / anon key -> SUPABASE_ANON_KEY
// Kunci "anon" memang aman ditaruh di sini (dibatasi oleh Row Level Security).
// JANGAN pernah menaruh "service_role" key di file ini.
// =====================================================================
export const SUPABASE_URL = 'https://ejifzuenpdeojqauazlg.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable_FnSdKP7-0YdzX5onpm49xg_NaljtdI7';

export const APP_NAME = 'Stok Gudang';
// Versi diisi OTOMATIS oleh GitHub Actions setiap upload (.github/workflows/deploy.yml).
// Ubah angka depan (mis. 1.7 -> 1.8) hanya kalau ada perubahan besar; angka terakhir = nomor build.
export const APP_VERSION = '2.26.0';
export const APP_BUILD = 'dev';
