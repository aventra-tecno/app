// Aventra Leads · konfigurasi
// Isi dua nilai di bawah dengan milik proyek Supabase AVENTRA LEADS (bukan proyek Mahyra).
// Hanya publishable/anon key yang boleh ada di sini. JANGAN pernah taruh service_role key.
export const SUPABASE_URL = 'https://ydpyiwrznodxskpcwfcr.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable_UYQMNd2FcKM6teFf_3AVfA_NnyZyJbu';

export const APP_VERSION = '1.12.1';
export const FUNCTIONS_URL = `${SUPABASE_URL}/functions/v1`;
export const SCRIPT_URL = 'https://app.aventra.id/app/ld/t.js';

// Mode demo: buka dengan ?demo=1 (data contoh, tanpa server)
export const DEMO = new URLSearchParams(location.search).has('demo') || SUPABASE_ANON_KEY.startsWith('ISI_');
