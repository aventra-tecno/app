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
  async resetPassword(email) {
    const c = await client();
    must(await c.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname }));
  },
  async updatePassword(pw) { const c = await client(); must(await c.auth.updateUser({ password: pw })); },

  async tenants() { const c = await client(); return must(await c.from('tenants').select('*').order('created_at')); },
  async createTenant(nama, prefix) { const c = await client(); return must(await c.rpc('buat_tenant', { p_nama: nama, p_prefix: prefix })); },
  async updateTenant(id, patch) { const c = await client(); must(await c.from('tenants').update(patch).eq('id', id)); },
  async myRole(tid) { return (await this.myMember(tid)).role; },
  async myMember(tid) {
    const c = await client(); const uid = (await c.auth.getUser()).data.user?.id;
    const r = must(await c.from('members').select('*').eq('tenant_id', tid).eq('user_id', uid).maybeSingle());
    return { role: r?.role ?? 'cs', nama: r?.nama ?? null, jabatan: r?.jabatan ?? null, menus: r?.menus ?? null };
  },
  async extStatus(tid) { const c = await client(); return must(await c.rpc('ext_status', { p_tenant: tid })); },
  // ----- WhatsApp Gateway (scan QR) -----
  async waSessions(tid) { const c = await client(); return must(await c.from('wa_sessions').select('*').eq('tenant_id', tid).order('created_at')); },
  async addWaSession(tid, label, waNumberId = null) { const c = await client(); return must(await c.from('wa_sessions').insert({ tenant_id: tid, label, wa_number_id: waNumberId }).select('*').single()); },
  // ----- Inbox WA (hanya baca) -----
  async inboxChats(tid, { wa = '', filter = '', q = '', offset = 0 } = {}) {
    const c = await client();
    const LEAD = 'id, stage, alasan, paid_at, nilai, purchase_sent_at, nama, phone, sumber, click_id, created_at';
    let r = c.from('wa_chats').select(`*, lead:leads${filter === 'closing' ? '!inner' : ''}(${LEAD})`).eq('tenant_id', tid);
    if (wa) r = r.eq('wa_number_id', wa);
    if (filter === 'kode') r = r.not('kode', 'is', null);
    if (filter === 'ctwa') r = r.not('ad_name', 'is', null);
    if (filter === 'tanpa') r = r.is('kode', null).is('ad_name', null).is('lead_id', null);
    if (filter === 'closing') r = r.not('lead.paid_at', 'is', null);
    const bersih = q.replace(/[^\p{L}\p{N} -]/gu, '').trim();
    if (bersih) {
      const d = bersih.replace(/\D/g, '').replace(/^0/, '');
      r = r.or([`nama.ilike.*${bersih}*`, `kode.ilike.*${bersih}*`, ...(d.length >= 3 ? [`phone.ilike.*${d}*`] : [])].join(','));
    }
    return must(await r.order('last_at', { ascending: false }).range(offset, offset + 19));
  },
  async lengkapiLeads(tid) { const c = await client(); return must(await c.rpc('lengkapi_leads', { p_tenant: tid })); },
  async inboxChat(id) {
    const c = await client();
    return must(await c.from('wa_chats').select('*, lead:leads(id, stage, alasan, paid_at, nilai, purchase_sent_at, nama, phone, sumber, click_id, created_at)').eq('id', id).maybeSingle());
  },
  async inboxMessages(chatId, before = null) {
    const c = await client();
    let r = c.from('wa_messages').select('*').eq('chat_id', chatId);
    if (before) r = r.lt('at', before);
    return must(await r.order('at', { ascending: false }).limit(30)).reverse();
  },
  async cmdWaSession(id, perintah) { const c = await client(); must(await c.from('wa_sessions').update({ perintah }).eq('id', id)); },
  async linkWaSession(id, waNumberId, label) { const c = await client(); must(await c.from('wa_sessions').update(label ? { wa_number_id: waNumberId, label } : { wa_number_id: waNumberId }).eq('id', id)); },
  async delWaSession(id) { const c = await client(); must(await c.from('wa_sessions').delete().eq('id', id)); },
  async gatewayStatus() { const c = await client(); return must(await c.from('gateway_status').select('*').eq('id', 1).maybeSingle()); },
  // ----- tim & akses -----
  async klaimUndangan() { const c = await client(); try { return must(await c.rpc('klaim_undangan')); } catch { return 0; } },
  async members(tid) { const c = await client(); return must(await c.rpc('daftar_anggota', { p_tenant: tid })); },
  async addMember(tid, email, nama, role, jabatan, menus) { const c = await client(); return must(await c.rpc('tambah_anggota', { p_tenant: tid, p_email: email, p_nama: nama, p_role: role, p_jabatan: jabatan, p_menus: menus })); },
  async updateMember(tid, uid, nama, role, jabatan, menus) { const c = await client(); must(await c.rpc('ubah_anggota', { p_tenant: tid, p_user: uid, p_nama: nama, p_role: role, p_jabatan: jabatan, p_menus: menus })); },
  async updateInvite(id, nama, role, jabatan, menus) { const c = await client(); must(await c.rpc('ubah_undangan', { p_id: id, p_nama: nama, p_role: role, p_jabatan: jabatan, p_menus: menus })); },
  async renameMe(tid, nama) { const c = await client(); must(await c.rpc('ubah_nama_saya', { p_tenant: tid, p_nama: nama })); },
  async removeMember(tid, uid) { const c = await client(); must(await c.rpc('hapus_anggota', { p_tenant: tid, p_user: uid })); },
  async removeInvite(id) { const c = await client(); must(await c.rpc('hapus_undangan', { p_id: id })); },

  async waNumbers(tid) { const c = await client(); return must(await c.from('wa_numbers').select('*').eq('tenant_id', tid).order('label')); },
  async saveWa(row) {
    const c = await client();
    if (row.id) return must(await c.from('wa_numbers').update(row).eq('id', row.id).select('*').single());
    return must(await c.from('wa_numbers').insert(row).select('*').single());
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
  // chat berkode 7 hari terakhir yang event Lead-nya belum terkirim (untuk kirim susulan)
  async pendingLeads(tid) {
    const c = await client(); const sejak = new Date(Date.now() - 7 * 864e5 + 3600e3).toISOString();
    return must(await c.from('leads').select('id, created_at').eq('tenant_id', tid).not('click_id', 'is', null)
      .is('lead_sent_at', null).gte('created_at', sejak).order('created_at').limit(500));
  },
  // kirim event Lead ke Meta (hanya chat yang terhubung ke klik iklan; dicek di server)
  async sendLead(leadId) {
    const c = await client(); const s = (await c.auth.getSession()).data.session;
    const r = await fetch(`${FUNCTIONS_URL}/lead`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${s.access_token}`, apikey: SUPABASE_ANON_KEY },
      body: JSON.stringify({ lead_id: leadId }),
    });
    return r.json().catch(() => ({}));
  },
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
  async events(tid, from, to, limit = 2000) {
    const c = await client();
    let q = c.from('events_log').select('*').eq('tenant_id', tid);
    if (from) q = q.gte('created_at', from);
    if (to) q = q.lt('created_at', to);
    return must(await q.order('created_at', { ascending: false }).limit(limit));
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
        sumber: 'lp', catatan: null, created_at: new Date(t + 5 * 60e3).toISOString(),
        cs_id: w.id === 'w1' ? pick(['u2', 'u2', 'u1']) : 'u3', lead_sent_at: rnd() < 0.9 ? new Date(t + 6 * 60e3).toISOString() : null };
      if (i % 9 === 4) Object.assign(l, { sumber: 'wa', phone: null });           // contoh: dicatat ekstensi, nomor tak terbaca
      l.nama_sumber = l.sumber === 'wa' ? 'kontak' : i % 4 === 0 ? 'manual' : 'profil';
      leads.push(l);
      events.push({ id: events.length + 1, tenant_id: tid, lead_id: l.id, click_id: c.id, event_name: 'Lead', ok: true, response: { events_received: 1 }, created_at: l.created_at });
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
      purchase_sent_at: paid ? new Date(t + 2 * 3600e3).toISOString() : null, sumber: 'ctwa', cs_id: pick(['u2', 'u3']), ad_id: '120219999', ad_name: 'CTWA Reels Pijat',
      created_at: new Date(t).toISOString() });
  }
  tenant.ad_account_id = '1234567890';
  tenant.auto_sync = true; tenant.last_sync_at = new Date(now - 12 * 60e3).toISOString(); tenant.last_sync_info = '96 baris · otomatis';
  const wa_sessions = [{ id: 's1', label: 'SBY', status: 'terhubung', phone: '6285778082138', chat_tercatat: 23, last_seen: new Date(now - 20e3).toISOString() }];
  const team = [
    { user_id: 'u1', email: 'akhmad@contoh.id', nama: 'Akhmad Janni', role: 'owner', jabatan: 'Pemilik', menus: null, status: 'aktif' },
    { user_id: 'u2', email: 'cs.surabaya@contoh.id', nama: 'Rina', role: 'cs', jabatan: 'CS Surabaya', menus: ['leads', 'klik'], status: 'aktif' },
    { user_id: 'u3', email: 'marketing@contoh.id', nama: 'Dimas', role: 'admin', jabatan: 'Marketing', menus: ['ringkasan', 'funnel', 'klik', 'log'], status: 'aktif' },
    { user_id: null, undangan_id: 'i1', email: 'cs.malang@contoh.id', nama: 'Sari', role: 'cs', jabatan: 'CS Malang', menus: ['leads'], status: 'diundang' },
  ];
  return { tenant, wa, clicks, leads, events, keys, insights, team, wa_sessions, adsToken: new Date(now - 3 * 864e5).toISOString(), token: new Date(now - 5 * 864e5).toISOString(), session: { user: { email: 'akhmad@contoh.id' } } };
})();
const inRange = (iso, f, t) => iso >= f && iso < t;
const sortDesc = (a) => a.slice().sort((x, y) => (x.created_at < y.created_at ? 1 : -1));
const wait = (v) => new Promise((r) => setTimeout(() => r(v), 60));

// QR contoh untuk mode demo (bukan QR WhatsApp asli)
const DEMO_QR = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 29 29" shape-rendering="crispEdges"><rect width="29" height="29" fill="#fff"/>' +
  Array.from({ length: 29 * 29 }, (_, i) => { const x = i % 29, y = (i / 29) | 0; const f = (a, b) => x >= a && x < a + 7 && y >= b && y < b + 7; const fin = f(1, 1) || f(21, 1) || f(1, 21);
    const on = fin ? !(x % 6 === 0 || y % 6 === 0) || (x - 1) % 6 === 0 || (y - 1) % 6 === 0 : ((x * 7 + y * 13 + x * y) % 5 < 2);
    return on && x > 0 && y > 0 && x < 28 && y < 28 ? `<rect x="${x}" y="${y}" width="1" height="1"/>` : ''; }).join('') + '</svg>');

// ---- data contoh Inbox (dibuat dari leads contoh + beberapa chat biasa) ----
let _chats = null;
const _msgs = {};
function demoChats() {
  if (_chats) return _chats;
  const now = Date.now();
  const byClick = Object.fromEntries(D.clicks.map((c) => [c.id, c]));
  _chats = D.leads.filter((l) => l.phone).sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 45).map((l, i) => {
    const c = byClick[l.click_id];
    const at = new Date(Math.min(now - i * 37 * 60e3, Date.parse(l.created_at) + 3600e3 * (i % 5))).toISOString();
    return { id: 'ch' + l.id, wa_number_id: l.wa_number_id || D.wa[0]?.id, jid: l.phone + '@s.whatsapp.net', phone: l.phone, nama: l.nama, lead_id: l.id,
      kode: c?.kode || null, ad_id: l.sumber === 'ctwa' ? l.ad_id || '1201' : null, ad_name: l.sumber === 'ctwa' ? l.ad_name || 'CTWA Reels Pijat' : null,
      last_text: l.paid_at ? 'Terima kasih kak, sudah transfer ya 🙏' : i % 3 ? 'Baik kak, ditunggu ya' : 'Kak masih ada slot jam 7 malam?', last_tipe: 'teks', last_from_me: !!(i % 3), last_at: at, jumlah: 6 };
  });
  ['Rudi', 'Lina', 'Pak Harto', 'Mbak Ayu', 'Doni', 'Sinta'].forEach((n, i) => _chats.push({ id: 'cx' + i, wa_number_id: D.wa[i % D.wa.length]?.id, jid: '62813000' + i + '@s.whatsapp.net',
    phone: '62813000111' + i, nama: n, lead_id: null, kode: null, ad_id: null, ad_name: null, last_text: i % 2 ? 'Oke makasih' : 'Halo, alamatnya di mana ya?', last_tipe: 'teks',
    last_from_me: !!(i % 2), last_at: new Date(now - (i * 95 + 20) * 60e3).toISOString(), jumlah: 3 }));
  return _chats;
}
function demoMsgs(id) {
  if (_msgs[id]) return _msgs[id];
  const c = demoChats().find((x) => x.id === id); if (!c) return [];
  const t = Date.parse(c.last_at); const m = [];
  const add = (menit, from_me, teks, extra = {}) => m.push({ id: id + m.length, chat_id: id, msg_id: 'm' + m.length, from_me, tipe: 'teks', teks, at: new Date(t - menit * 60e3).toISOString(), ...extra });
  if (c.kode) add(95, false, `Halo ${D.tenant.nama}, saya mau pesan. Kode promo: ${c.kode} (${D.tenant.teks_promo || 'promo'})`, { kode: c.kode });
  else if (c.ad_name) add(95, false, 'Halo, saya mau tanya soal pijat panggilan', { ctwa: true });
  else add(95, false, 'Halo kak, mau tanya');
  add(90, true, 'Halo kak, terima kasih sudah menghubungi 🙏 Untuk area mana ya kak?');
  add(70, false, 'Daerah Rungkut kak. Harganya berapa?');
  add(65, true, 'Untuk 90 menit Rp135.000 kak, sudah termasuk transport.');
  if (c.kode || c.ad_name) add(40, false, '', { tipe: 'foto' });
  add(0, c.last_from_me, c.last_text);
  return (_msgs[id] = m);
}

const demo = {
  async session() { return D.session; },
  async signIn() { D.session = { user: { email: 'akhmad@contoh.id' } }; },
  async signUp() {},
  async signOut() { D.session = null; },
  async resetPassword() { await wait(); },
  async updatePassword() { await wait(); },
  async tenants() { return [D.tenant]; },
  async createTenant() { return D.tenant.id; },
  async updateTenant(id, p) { Object.assign(D.tenant, p); },
  async myRole() { return 'owner'; },
  async myMember() { const m = D.team[0]; return { role: 'owner', nama: m.nama, jabatan: m.jabatan, menus: null }; },
  async klaimUndangan() { return 0; },
  async waSessions() { return D.wa_sessions.map((s) => { if (s.status === 'qr' && Date.now() - s._t > 7000) Object.assign(s, { status: 'terhubung', qr: null, phone: D.wa.find((w) => w.id === s.wa_number_id)?.phone || '6285778082138' }); return { ...s }; }); },
  async addWaSession(t, label, waNumberId = null) { const s = { id: 's' + Date.now(), label, wa_number_id: waNumberId, status: 'qr', qr: DEMO_QR, chat_tercatat: 0, _t: Date.now(), last_seen: new Date().toISOString() }; D.wa_sessions.push(s); return s; },
  async inboxChats(t, { wa = '', filter = '', q = '', offset = 0 } = {}) {
    const lead = (c) => D.leads.find((l) => l.id === c.lead_id) || null;
    const s = q.trim().toLowerCase(), d = s.replace(/\D/g, '').replace(/^0/, '');
    const list = demoChats().map((c) => ({ ...c, lead: lead(c) })).filter((c) => (!wa || c.wa_number_id === wa)
      && (filter !== 'kode' || c.kode) && (filter !== 'ctwa' || c.ad_name) && (filter !== 'tanpa' || (!c.kode && !c.ad_name && !c.lead_id))
      && (filter !== 'closing' || c.lead?.paid_at)
      && (!s || (c.nama || '').toLowerCase().includes(s) || (c.kode || '').toLowerCase().includes(s) || (d.length >= 3 && (c.phone || '').includes(d))));
    return wait(list.sort((a, b) => b.last_at.localeCompare(a.last_at)).slice(offset, offset + 20));
  },
  async lengkapiLeads() { return wait(0); },
  async inboxChat(id) { const c = demoChats().find((x) => x.id === id); return c ? { ...c, lead: D.leads.find((l) => l.id === c.lead_id) || null } : null; },
  async inboxMessages(id, before = null) { const m = demoMsgs(id).filter((x) => !before || x.at < before); return wait(m.slice(-30)); },
  async cmdWaSession(id, p) { const s = D.wa_sessions.find((x) => x.id === id); if (p === 'logout') Object.assign(s, { status: 'keluar', phone: null }); else Object.assign(s, { status: 'qr', qr: DEMO_QR, _t: Date.now() }); },
  async delWaSession(id) { D.wa_sessions = D.wa_sessions.filter((x) => x.id !== id); },
  async gatewayStatus() { return { versi: '1.0.0', last_seen: new Date(Date.now() - 12e3).toISOString() }; },
  async extStatus() { return { plan: 'free', plan_until: null, kuota: 100, terpakai: 37, prefix: 'MR' }; },
  async members() { return wait(D.team.slice()); },
  async addMember(t, email, nama, role, jabatan, menus) { D.team.push({ user_id: null, undangan_id: 'u' + Date.now(), email, nama, role, jabatan, menus, status: 'diundang' }); return 'diundang'; },
  async updateMember(t, uid, nama, role, jabatan, menus) { const m = D.team.find((x) => x.user_id === uid); Object.assign(m, m.role === 'owner' ? { nama, jabatan } : { nama, role, jabatan, menus }); },
  async updateInvite(id, nama, role, jabatan, menus) { Object.assign(D.team.find((m) => m.undangan_id === id), { nama, role, jabatan, menus }); },
  async renameMe(t, nama) { D.team[0].nama = nama; },
  async removeMember(t, uid) { D.team = D.team.filter((m) => m.user_id !== uid); },
  async removeInvite(id) { D.team = D.team.filter((m) => m.undangan_id !== id); },
  async waNumbers() { return wait(D.wa.slice()); },
  async saveWa(row) { if (row.id) return Object.assign(D.wa.find((w) => w.id === row.id), row); const w = { ...row, id: 'w' + Date.now() }; D.wa.push(w); return w; },
  async linkWaSession(id, waNumberId, label) { Object.assign(D.wa_sessions.find((s) => s.id === id), { wa_number_id: waNumberId }, label ? { label } : {}); },
  async deleteWa(id) { D.wa.splice(D.wa.findIndex((w) => w.id === id), 1); },
  async clicks(t, f, to) { return wait(sortDesc(D.clicks.filter((c) => inRange(c.created_at, f, to)).map(rapi))); },
  async clickByKode(t, k) { return D.clicks.find((c) => c.kode === k.trim().toUpperCase()) ?? null; },
  async leads(t, f, to) { return wait(sortDesc(D.leads.filter((l) => inRange(l.created_at, f, to)))); },
  async leadByClick(cid) { return D.leads.find((l) => l.click_id === cid) ?? null; },
  async createLead(row) { const l = { id: 'l' + Date.now(), stage: 'A', sumber: 'manual', created_at: new Date().toISOString(), ...row }; D.leads.push(l); return l; },
  async updateLead(id, p) { Object.assign(D.leads.find((l) => l.id === id), p); },
  async pendingLeads() { return D.leads.filter((l) => l.click_id && !l.lead_sent_at && Date.now() - Date.parse(l.created_at) < 6.9 * 864e5).map((l) => ({ id: l.id, created_at: l.created_at })); },
  async sendLead(id) { const l = D.leads.find((x) => x.id === id); if (l?.click_id) { l.lead_sent_at = new Date().toISOString(); return { ok: true, terkirim: true }; } return { ok: true, lewati: 'tanpa klik' }; },
  async markPaid(id, nilai) {
    const l = D.leads.find((x) => x.id === id);
    Object.assign(l, { stage: 'E', alasan: null, nilai, paid_at: new Date().toISOString(), purchase_sent_at: new Date().toISOString() });
    D.events.push({ id: D.events.length + 1, lead_id: id, event_name: 'Purchase', ok: true, response: { events_received: 1 }, created_at: new Date().toISOString() });
    return { ok: true, terkirim: true };
  },
  async events(t, f, to) { return wait(sortDesc(D.events.filter((e) => (!f || e.created_at >= f) && (!to || e.created_at < to)))); },
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
