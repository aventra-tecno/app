// Aventra Leads · lapisan data (Supabase asli atau mode demo)
import { cleanName } from './ui.js';
import { SUPABASE_URL, SUPABASE_ANON_KEY, FUNCTIONS_URL, DEMO } from './config.js';

let sb = null;
// rapikan nama iklan/campaign yang tersandi dari URL
const rapi = (c) => { if (c) for (const k of ['ad_name', 'campaign_name', 'utm_campaign', 'utm_content']) if (c[k]) c[k] = cleanName(c[k]); return c; };
async function client() {
  if (!sb) {
    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
    sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
  return sb;
}
const must = ({ data, error }) => { if (error) throw new Error(error.message); return data; };

// ------------------------------------------------------------------ ASLI
const real = {
  async session() { const c = await client(); return (await c.auth.getSession()).data.session; },
  async signIn(email, password) { const c = await client(); must(await c.auth.signInWithPassword({ email, password })); },
  async signUp(email, password) { const c = await client(); must(await c.auth.signUp({ email, password })); },
  async signOut() { const c = await client(); await c.auth.signOut(); },

  async tenants() { const c = await client(); return must(await c.from('tenants').select('*').order('created_at')); },
  async createTenant(nama, prefix) { const c = await client(); return must(await c.rpc('buat_tenant', { p_nama: nama, p_prefix: prefix })); },
  async updateTenant(id, patch) { const c = await client(); must(await c.from('tenants').update(patch).eq('id', id)); },
  async myRole(tid) { return (await this.myMember(tid)).role; },
  async myMember(tid) {
    const c = await client(); const uid = (await c.auth.getUser()).data.user?.id;
    const r = must(await c.from('members').select('*').eq('tenant_id', tid).eq('user_id', uid).maybeSingle());
    return { role: r?.role ?? 'cs', jabatan: r?.jabatan ?? null, menus: r?.menus ?? null };
  },
  // ----- tim & akses -----
  async klaimUndangan() { const c = await client(); try { return must(await c.rpc('klaim_undangan')); } catch { return 0; } },
  async members(tid) { const c = await client(); return must(await c.rpc('daftar_anggota', { p_tenant: tid })); },
  async addMember(tid, email, role, jabatan, menus) { const c = await client(); return must(await c.rpc('tambah_anggota', { p_tenant: tid, p_email: email, p_role: role, p_jabatan: jabatan, p_menus: menus })); },
  async updateMember(tid, uid, role, jabatan, menus) { const c = await client(); must(await c.rpc('ubah_anggota', { p_tenant: tid, p_user: uid, p_role: role, p_jabatan: jabatan, p_menus: menus })); },
  async updateInvite(id, role, jabatan, menus) { const c = await client(); must(await c.rpc('ubah_undangan', { p_id: id, p_role: role, p_jabatan: jabatan, p_menus: menus })); },
  async removeMember(tid, uid) { const c = await client(); must(await c.rpc('hapus_anggota', { p_tenant: tid, p_user: uid })); },
  async removeInvite(id) { const c = await client(); must(await c.rpc('hapus_undangan', { p_id: id })); },

  async waNumbers(tid) { const c = await client(); return must(await c.from('wa_numbers').select('*').eq('tenant_id', tid).order('label')); },
  async saveWa(row) {
    const c = await client();
    if (row.id) return must(await c.from('wa_numbers').update(row).eq('id', row.id));
    return must(await c.from('wa_numbers').insert(row));
  },
  async deleteWa(id) { const c = await client(); must(await c.from('wa_numbers').delete().eq('id', id)); },

  async clicks(tid, from, to) {
    const c = await client();
    return must(await c.from('clicks').select('*').eq('tenant_id', tid).gte('created_at', from).lt('created_at', to)
      .order('created_at', { ascending: false }).limit(5000)).map(rapi);
  },
  async clickByKode(tid, kode) {
    const c = await client();
    return rapi(must(await c.from('clicks').select('*').eq('tenant_id', tid).eq('kode', kode.trim().toUpperCase()).maybeSingle()));
  },
  async leads(tid, from, to) {
    const c = await client();
    return must(await c.from('leads').select('*').eq('tenant_id', tid).gte('created_at', from).lt('created_at', to)
      .order('created_at', { ascending: false }).limit(5000));
  },
  async leadByClick(clickId) { const c = await client(); return must(await c.from('leads').select('*').eq('click_id', clickId).maybeSingle()); },
  async createLead(row) { const c = await client(); return must(await c.from('leads').insert(row).select('*').single()); },
  async updateLead(id, patch) { const c = await client(); must(await c.from('leads').update(patch).eq('id', id)); },
  async markPaid(leadId, nilai) {
    const c = await client(); const s = (await c.auth.getSession()).data.session;
    const r = await fetch(`${FUNCTIONS_URL}/convert`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${s.access_token}`, apikey: SUPABASE_ANON_KEY },
      body: JSON.stringify({ lead_id: leadId, nilai }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok && !j.lead_id) throw new Error(j.error || 'Gagal menghubungi server');
    return j;
  },
  async events(tid, limit = 200) {
    const c = await client();
    return must(await c.from('events_log').select('*').eq('tenant_id', tid).order('created_at', { ascending: false }).limit(limit));
  },
  async tokenStatus(tid) { const c = await client(); return must(await c.rpc('status_token', { p_tenant: tid })); },
  async testClicks(tid) {
    const c = await client();
    return must(await c.from('clicks').select('*').eq('tenant_id', tid).like('fbclid', 'TES%')
      .gte('created_at', new Date(Date.now() - 864e5).toISOString()).order('created_at', { ascending: false }).limit(20));
  },
  async leadsForClicks(ids) {
    if (!ids.length) return [];
    const c = await client(); return must(await c.from('leads').select('*').in('click_id', ids));
  },
  async deleteTestData(tid) { const c = await client(); return must(await c.rpc('hapus_data_tes', { p_tenant: tid })); },
  async insights(tid, fromDate, toDate) {
    const c = await client();
    return must(await c.from('ad_insights').select('*').eq('tenant_id', tid).gte('tanggal', fromDate).lte('tanggal', toDate).limit(5000));
  },
  async adsTokenStatus(tid) { const c = await client(); return must(await c.rpc('status_ads_token', { p_tenant: tid })); },
  async saveAdsToken(tid, token) { const c = await client(); must(await c.rpc('simpan_ads_token', { p_tenant: tid, p_token: token })); },
  async syncMeta(tid, since, until) {
    const c = await client(); const s = (await c.auth.getSession()).data.session;
    const r = await fetch(`${FUNCTIONS_URL}/meta-sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${s.access_token}`, apikey: SUPABASE_ANON_KEY },
      body: JSON.stringify({ tenant_id: tid, since, until }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || 'Gagal sinkron');
    return j;
  },
  async saveToken(tid, token) { const c = await client(); must(await c.rpc('simpan_token', { p_tenant: tid, p_token: token })); },
  async keys(tid) { const c = await client(); return must(await c.from('api_keys').select('id,nama,prefix,revoked,last_used,created_at').eq('tenant_id', tid).order('created_at', { ascending: false })); },
  async createKey(tid, nama) { const c = await client(); return must(await c.rpc('buat_api_key', { p_tenant: tid, p_nama: nama })); },
  async revokeKey(id) { const c = await client(); must(await c.rpc('cabut_api_key', { p_id: id })); },
};

// ------------------------------------------------------------------ DEMO
function seeded(seed) { return () => ((seed = (seed * 16807) % 2147483647) / 2147483647); }
const D = (() => {
  const rnd = seeded(42);
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const tid = 'demo-tenant';
  const now = Date.now();
  const tenant = { id: tid, nama: 'Mahyra Relaksia (contoh)', prefix: 'MR', teks_promo: 'bonus 15 menit',
    public_key: 'pk_demo1234567890abcdef', pixel_id: '123456789012345', test_event_code: 'TEST40462', pixel_browser: true, vc_name: 'Pijat Panggilan Surabaya', created_at: new Date(now - 30 * 864e5).toISOString() };
  const wa = [
    { id: 'w1', tenant_id: tid, label: 'SBY', phone: '6285778082138', template: 'Halo Mahyra Surabaya, saya mau pijat. Kode promo: {kode} ({promo})', aktif: true },
    { id: 'w2', tenant_id: tid, label: 'MLG', phone: '6285645188603', template: 'Halo Mahyra Malang, saya mau pijat. Kode promo: {kode} ({promo})', aktif: true },
  ];
  const ads = [
    { ad_id: '120210001', ad_name: 'FBM 90 Menit - Reels', campaign_name: 'Sales LP Mahyra' },
    { ad_id: '120210002', ad_name: 'Totok Wajah - Foto', campaign_name: 'Sales LP Mahyra' },
    { ad_id: '120210003', ad_name: 'Promo Malam - Carousel', campaign_name: 'Sales LP Mahyra' },
  ];
  const ABC = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const code = () => 'MR-' + Array.from({ length: 6 }, () => ABC[Math.floor(rnd() * ABC.length)]).join('');
  const clicks = [], leads = [], events = [];
  const nama = ['Rina', 'Dewi', 'Andi', 'Mario', 'Erwin', 'Sari', 'Budi', 'Tang', 'Jatmiko', 'Lia', 'Fajar', 'Nina'];
  for (let i = 0; i < 140; i++) {
    const t = now - Math.floor(rnd() * 14 * 864e5) - (i < 4 ? 0 : 3600e3);
    const ad = pick(ads); const w = rnd() < 0.68 ? wa[0] : wa[1];
    const c = { id: 'c' + i, tenant_id: tid, kode: code(), wa_number_id: w.id, ...ad, fbc: rnd() < 0.9 ? 'fb.1.x.y' : null,
      fbp: 'fb.1.x.z', utm_content: ad.ad_name, page_url: 'https://www.mahyrarelaksia.com/', contact_sent: true,
      created_at: new Date(i < 4 ? now - i * 6 * 60e3 : t).toISOString() };
    clicks.push(c);
    events.push({ id: events.length + 1, tenant_id: tid, click_id: c.id, event_name: 'Contact', ok: true, response: { events_received: 1 }, created_at: c.created_at });
    if (i >= 4 && rnd() < 0.55) {
      const r = rnd(); const st = r < 0.22 ? 'A' : r < 0.6 ? 'B' : r < 0.7 ? 'C' : r < 0.78 ? 'D' : 'E';
      const paid = st === 'E';
      const l = { id: 'l' + i, tenant_id: tid, click_id: c.id, wa_number_id: w.id, phone: '628' + Math.floor(1e9 + rnd() * 8e9),
        nama: pick(nama), stage: st, alasan: paid ? null : (st === 'A' ? 1 : pick([1, 1, 2, 4, 6, 7])),
        nilai: paid ? pick([135000, 135000, 140000, 200000, 100000]) : null,
        paid_at: paid ? new Date(t + 3 * 3600e3).toISOString() : null,
        purchase_sent_at: paid && rnd() < 0.92 ? new Date(t + 3 * 3600e3).toISOString() : null,
        sumber: 'lp', catatan: null, created_at: new Date(t + 5 * 60e3).toISOString() };
      leads.push(l);
      if (paid) events.push({ id: events.length + 1, tenant_id: tid, lead_id: l.id, event_name: 'Purchase', ok: !!l.purchase_sent_at,
        response: l.purchase_sent_at ? { events_received: 1 } : { error: { message: 'Invalid OAuth access token' } }, created_at: l.paid_at });
    }
  }
  clicks.unshift({ id: 'ctes', tenant_id: tid, kode: 'MR-TES9K2', wa_number_id: 'w1', fbclid: 'TESA81B', fbc: 'fb.1.x.TESA81B', fbp: 'fb.1.x.z',
    utm_content: 'TES-AVENTRA', page_url: 'https://mahyrarelaksia.com/mahyra-sby', contact_sent: true, created_at: new Date(now - 2 * 60e3).toISOString() });
  const keys = [{ id: 'k1', nama: 'ERP Mahyra', prefix: 'ak_3f9a21c', revoked: false, last_used: new Date(now - 2 * 3600e3).toISOString(), created_at: new Date(now - 9 * 864e5).toISOString() }];
  const insights = [];
  const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  for (let d = 0; d < 30; d++) {
    const day = ymd(new Date(now - d * 864e5));
    ads.forEach((ad, i) => {
      const spend = Math.round(28000 + rnd() * 18000);
      const adset = i === 0 ? ['as1', 'SBY · Broad 23-55'] : ['as2', 'SBY · Wanita 25-45'];
      const imp = Math.round(spend / (22 + rnd() * 10) * 1000 / 1000);
      const ctr = [0.016, 0.011, 0.007][i] * (0.8 + rnd() * 0.4);
      const k = Math.round(imp * ctr);
      const lpv = Math.round(k * (0.6 + rnd() * 0.2));
      insights.push({ tenant_id: tid, tanggal: day, ad_id: ad.ad_id, ad_name: ad.ad_name, campaign_name: ad.campaign_name, campaign_id: 'cmp1',
        adset_id: adset[0], adset_name: adset[1], msg_started: 0,
        spend, impressions: imp, reach: Math.round(imp * 0.8), link_clicks: k, lpv, view_content: Math.round(lpv * 0.95), contact: 0, purchase: 0,
        purchase_value: 0, synced_at: new Date(now - 40 * 60e3).toISOString() });
    });
  }
  for (let d = 0; d < 30; d++) {
    const spend = Math.round(55000 + rnd() * 20000), imp = Math.round(spend / 24), k = Math.round(imp * 0.018), ms = Math.round(k * 0.55);
    insights.push({ tenant_id: tid, tanggal: ymd(new Date(now - d * 864e5)), ad_id: '120219999', ad_name: 'CTWA Reels Pijat', campaign_id: 'cmp2',
      campaign_name: 'CTWA Mahyra SBY', adset_id: 'as3', adset_name: 'CTWA · LLA 1%', spend, impressions: imp, reach: Math.round(imp * 0.8), link_clicks: k,
      lpv: 0, view_content: 0, contact: 0, msg_started: ms, purchase: Math.round(ms * 0.1 * rnd() * 2), purchase_value: 0,
      synced_at: new Date(now - 40 * 60e3).toISOString() });
  }
  for (let d = 0; d < 14; d++) for (let j = 0; j < 3; j++) {
    const t = now - d * 864e5 - j * 3 * 3600e3 - 3600e3; const paid = rnd() < 0.2;
    leads.push({ id: `lc${d}_${j}`, tenant_id: tid, click_id: null, wa_number_id: 'w1', phone: '628' + Math.floor(1e9 + rnd() * 8e9), nama: pick(nama),
      stage: paid ? 'E' : pick(['A', 'B', 'B', 'C']), alasan: null, nilai: paid ? 135000 : null, paid_at: paid ? new Date(t + 2 * 3600e3).toISOString() : null,
      purchase_sent_at: paid ? new Date(t + 2 * 3600e3).toISOString() : null, sumber: 'ctwa', ad_id: '120219999', ad_name: 'CTWA Reels Pijat',
      created_at: new Date(t).toISOString() });
  }
  tenant.ad_account_id = '1234567890';
  tenant.auto_sync = true; tenant.last_sync_at = new Date(now - 12 * 60e3).toISOString(); tenant.last_sync_info = '96 baris · otomatis';
  const team = [
    { user_id: 'u1', email: 'akhmad@contoh.id', role: 'owner', jabatan: 'Pemilik', menus: null, status: 'aktif' },
    { user_id: 'u2', email: 'cs.surabaya@contoh.id', role: 'cs', jabatan: 'CS Surabaya', menus: ['leads', 'klik'], status: 'aktif' },
    { user_id: 'u3', email: 'marketing@contoh.id', role: 'admin', jabatan: 'Marketing', menus: ['ringkasan', 'funnel', 'klik', 'log'], status: 'aktif' },
    { user_id: null, undangan_id: 'i1', email: 'cs.malang@contoh.id', role: 'cs', jabatan: 'CS Malang', menus: ['leads'], status: 'diundang' },
  ];
  return { tenant, wa, clicks, leads, events, keys, insights, team, adsToken: new Date(now - 3 * 864e5).toISOString(), token: new Date(now - 5 * 864e5).toISOString(), session: { user: { email: 'akhmad@contoh.id' } } };
})();
const inRange = (iso, f, t) => iso >= f && iso < t;
const sortDesc = (a) => a.slice().sort((x, y) => (x.created_at < y.created_at ? 1 : -1));
const wait = (v) => new Promise((r) => setTimeout(() => r(v), 60));

const demo = {
  async session() { return D.session; },
  async signIn() { D.session = { user: { email: 'akhmad@contoh.id' } }; },
  async signUp() {},
  async signOut() { D.session = null; },
  async tenants() { return [D.tenant]; },
  async createTenant() { return D.tenant.id; },
  async updateTenant(id, p) { Object.assign(D.tenant, p); },
  async myRole() { return 'owner'; },
  async myMember() { return { role: 'owner', jabatan: 'Pemilik', menus: null }; },
  async klaimUndangan() { return 0; },
  async members() { return wait(D.team.slice()); },
  async addMember(t, email, role, jabatan, menus) { D.team.push({ user_id: null, undangan_id: 'u' + Date.now(), email, role, jabatan, menus, status: 'diundang' }); return 'diundang'; },
  async updateMember(t, uid, role, jabatan, menus) { Object.assign(D.team.find((m) => m.user_id === uid), { role, jabatan, menus }); },
  async updateInvite(id, role, jabatan, menus) { Object.assign(D.team.find((m) => m.undangan_id === id), { role, jabatan, menus }); },
  async removeMember(t, uid) { D.team = D.team.filter((m) => m.user_id !== uid); },
  async removeInvite(id) { D.team = D.team.filter((m) => m.undangan_id !== id); },
  async waNumbers() { return wait(D.wa.slice()); },
  async saveWa(row) { if (row.id) Object.assign(D.wa.find((w) => w.id === row.id), row); else D.wa.push({ ...row, id: 'w' + Date.now() }); },
  async deleteWa(id) { D.wa.splice(D.wa.findIndex((w) => w.id === id), 1); },
  async clicks(t, f, to) { return wait(sortDesc(D.clicks.filter((c) => inRange(c.created_at, f, to)).map(rapi))); },
  async clickByKode(t, k) { return D.clicks.find((c) => c.kode === k.trim().toUpperCase()) ?? null; },
  async leads(t, f, to) { return wait(sortDesc(D.leads.filter((l) => inRange(l.created_at, f, to)))); },
  async leadByClick(cid) { return D.leads.find((l) => l.click_id === cid) ?? null; },
  async createLead(row) { const l = { id: 'l' + Date.now(), stage: 'A', sumber: 'manual', created_at: new Date().toISOString(), ...row }; D.leads.push(l); return l; },
  async updateLead(id, p) { Object.assign(D.leads.find((l) => l.id === id), p); },
  async markPaid(id, nilai) {
    const l = D.leads.find((x) => x.id === id);
    Object.assign(l, { stage: 'E', alasan: null, nilai, paid_at: new Date().toISOString(), purchase_sent_at: new Date().toISOString() });
    D.events.push({ id: D.events.length + 1, lead_id: id, event_name: 'Purchase', ok: true, response: { events_received: 1 }, created_at: new Date().toISOString() });
    return { ok: true, terkirim: true };
  },
  async events() { return wait(sortDesc(D.events).slice(0, 200)); },
  async tokenStatus() { return D.token; },
  async testClicks() { return sortDesc(D.clicks.filter((c) => (c.fbclid || '').startsWith('TES'))); },
  async leadsForClicks(ids) { return D.leads.filter((l) => ids.includes(l.click_id)); },
  async insights(t, f, to) { return D.insights.filter((r) => r.tanggal >= f && r.tanggal <= to); },
  async adsTokenStatus() { return D.adsToken; },
  async saveAdsToken(t, v) { D.adsToken = v ? new Date().toISOString() : null; },
  async syncMeta() { await wait(); return { ok: true, baris: D.insights.length, spend: D.insights.reduce((s, r) => s + r.spend, 0) }; },
  async deleteTestData() {
    const ids = D.clicks.filter((c) => (c.fbclid || '').startsWith('TES')).map((c) => c.id);
    D.leads = D.leads.filter((l) => !ids.includes(l.click_id)); D.clicks = D.clicks.filter((c) => !ids.includes(c.id)); return ids.length;
  },
  async saveToken(t, v) { D.token = v ? new Date().toISOString() : null; },
  async keys() { return D.keys.slice(); },
  async createKey(t, nama) { const k = 'ak_' + 'd'.repeat(48); D.keys.unshift({ id: 'k' + Date.now(), nama, prefix: k.slice(0, 10), revoked: false, last_used: null, created_at: new Date().toISOString() }); return k; },
  async revokeKey(id) { D.keys.find((k) => k.id === id).revoked = true; },
};

export const api = DEMO ? demo : real;
