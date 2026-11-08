import { supa, rpc } from '../supa.js';
import { SUPABASE_URL } from '../config.js';
import { esc, icon, toast, toastErr, pageHead, skeleton, ago, confirmBox } from '../ui.js';

// Hubungkan toko Shopee / TikTok Shop lewat pihak ketiga atau API resmi.
// Kunci rahasia disimpan di server (app_secrets) dan tidak pernah bisa dibaca lagi dari aplikasi.
const P = {
  jubelio: { name: 'Jubelio', tag: 'Omnichannel Indonesia', color: '#1E5EFF', site: 'https://jubelio.com', docs: 'https://docs.jubelio.com',
    about: 'Satu dasbor untuk Shopee, TikTok Shop, Tokopedia, Lazada, dll. Aplikasi ini mengambil pesanan & mengirim stok lewat API Jubelio.',
    secrets: [['email', 'Email login Jubelio', 'email'], ['password', 'Password Jubelio', 'password']], fields: [],
    steps: ['Daftar / login di Jubelio, lalu hubungkan toko Shopee & TikTok Shop di menu Integrasi Jubelio.', 'Isi email & password akun Jubelio di bawah (dipakai untuk mengambil token API).', 'Di Jubelio › Pengaturan › Webhook, tempel alamat webhook di bawah untuk event pesanan & stok.', 'Simpan, lalu kirim satu pesanan uji untuk memastikan status "Terhubung".'] },
  ginee: { name: 'Ginee', tag: 'Omnichannel Indonesia', color: '#FF6A00', site: 'https://ginee.com', docs: 'https://doc.ginee.com',
    about: 'Ginee Omni + Open API resmi (pesanan, stok, gudang). Autentikasi memakai Access Key + Secret Key (HMAC-SHA256).',
    secrets: [['access_key', 'Access Key', 'text'], ['secret_key', 'Secret Key', 'password']], fields: [['country', 'Negara', 'ID']],
    steps: ['Daftar Ginee dan hubungkan toko Shopee & TikTok Shop di Ginee.', 'Ajukan akses Open API ke Ginee untuk mendapatkan Access Key & Secret Key.', 'Isi kedua kunci di bawah, negara: ID.', 'Di pengaturan Open API Ginee › Webhook, tempel alamat webhook di bawah.'] },
  bigseller: { name: 'BigSeller', tag: 'ERP marketplace Asia Tenggara', color: '#2F54EB', site: 'https://www.bigseller.com', docs: 'https://www.bigseller.com/blog/articleDetails/4701/open-api-bigseller.htm',
    about: 'BigSeller Open API bersifat berbayar & harus disetujui (kontrak). Setelah disetujui kamu mendapat app_id & app_key.',
    secrets: [['app_id', 'App ID', 'text'], ['app_key', 'App Key', 'password']], fields: [],
    steps: ['Hubungi customer service BigSeller untuk mengajukan Open API (ada biaya & kontrak).', 'Setelah disetujui, isi App ID & App Key di bawah.', 'Kirim alamat webhook di bawah ke tim BigSeller bila diminta.'] },
  shopee: { name: 'Shopee Open Platform', tag: 'API resmi Shopee', color: '#EE4D2D', site: 'https://open.shopee.com', docs: 'https://open.shopee.com/documents',
    about: 'Langsung ke Shopee tanpa perantara. Perlu akun developer Shopee Open Platform (verifikasi usaha) dan izin dari toko.',
    secrets: [['partner_key', 'Partner Key', 'password']], fields: [['partner_id', 'Partner ID', ''], ['shop_id', 'Shop ID', '']],
    steps: ['Daftar sebagai developer di open.shopee.com dan buat aplikasi (App) — menunggu persetujuan Shopee.', 'Isi Partner ID & Partner Key dari halaman App, dan Shop ID toko.', 'Pasang alamat webhook di bawah sebagai Push URL di pengaturan App Shopee.', 'Otorisasi toko lewat link otorisasi Shopee (dibantu pembuat aplikasi).'] },
  tiktok: { name: 'TikTok Shop Partner API', tag: 'API resmi TikTok Shop', color: '#111111', site: 'https://partner.tiktokshop.com', docs: 'https://partner.tiktokshop.com/docv2',
    about: 'Langsung ke TikTok Shop. Perlu akun TikTok Shop Partner Center, membuat aplikasi, lalu toko memberi izin.',
    secrets: [['app_secret', 'App Secret', 'password']], fields: [['app_key', 'App Key', ''], ['shop_id', 'Shop ID / Shop Cipher', '']],
    steps: ['Daftar di partner.tiktokshop.com dan buat aplikasi (Custom App / Seller App).', 'Isi App Key & App Secret, dan Shop ID toko.', 'Pasang alamat webhook di bawah di pengaturan Webhook aplikasi TikTok Shop.', 'Otorisasi toko dari Seller Center (dibantu pembuat aplikasi).'] }
};
const ST = { belum: ['Belum dihubungkan', ''], menunggu: ['Menunggu kiriman pertama', 'yellow'], terhubung: ['Terhubung', 'green'], gagal: ['Gagal', 'red'] };
const hook = (p, t) => `${SUPABASE_URL}/functions/v1/marketplace?p=${p}&t=${t}`;

export default {
  tour: [{ sel: '#prov', title: 'Pilih penyedia', body: 'Pilih cara menyambung: lewat pihak ketiga (Jubelio, Ginee, BigSeller) atau API resmi Shopee / TikTok Shop.' }],
  async render(el) {
    let cur = 'jubelio', st = {}, stores = [];
    el.innerHTML = `${pageHead('Hubungkan Shopee / TikTok Shop', 'Pesanan masuk otomatis dan stok tersinkron lewat penyedia integrasi. Kunci API disimpan aman di server.')}
      <div class="stack"><div class="prov-grid" id="prov"></div><section class="card stack" id="form">${skeleton(3)}</section></div>`;
    const load = async () => {
      try { [st, { data: stores }] = await Promise.all([rpc('integ_status'), supa.from('stores').select('id, name').order('id')]); } catch (e) { toastErr(e); }
      st = st || {}; stores = stores || [];
      paint();
    };
    const paint = () => {
      el.querySelector('#prov').innerHTML = Object.entries(P).map(([k, p]) => { const s = st[k]; const [l, c] = ST[s?.status || 'belum'];
        return `<button class="prov ${k === cur ? 'on' : ''}" data-p="${k}"><span class="prov-ic" style="background:${p.color}">${esc(p.name[0])}</span><span class="grow"><b>${esc(p.name)}</b><span class="xs muted">${esc(p.tag)}</span></span><span class="tag ${c}">${esc(l)}</span></button>`; }).join('');
      const p = P[cur], s = st[cur] || { settings: {}, keys: [] }, set = s.settings || {};
      el.querySelector('#form').innerHTML = `<div class="row between wrap"><h2 class="sec-title"><span class="prov-ic sm" style="background:${p.color}">${esc(p.name[0])}</span> ${esc(p.name)}</h2>
          <div class="row"><a class="btn btn-sm btn-ghost" href="${p.site}" target="_blank" rel="noopener">Situs</a><a class="btn btn-sm btn-ghost" href="${p.docs}" target="_blank" rel="noopener">Dokumentasi API</a></div></div>
        <div class="small muted">${esc(p.about)}</div>
        <ol class="small integ-steps">${p.steps.map((x) => `<li>${esc(x)}</li>`).join('')}</ol>
        <div class="grid g2">
          ${p.fields.map(([k, l, d]) => `<label class="field">${esc(l)}<input class="input" data-f="${k}" value="${esc(set[k] ?? d)}"></label>`).join('')}
          ${p.secrets.map(([k, l, t]) => `<label class="field">${esc(l)} ${s.keys?.includes(k) ? '<span class="tag green">tersimpan</span>' : ''}<input class="input" data-s="${k}" type="${t === 'password' ? 'password' : t}" autocomplete="off" placeholder="${s.keys?.includes(k) ? '•••••••• (kosongkan kalau tidak diganti)' : ''}"></label>`).join('')}
          <label class="field">Pesanan masuk ke toko<select class="input" data-f="store_id"><option value="">Sesuai nama toko di marketplace</option>${stores.map((x) => `<option value="${x.id}" ${String(set.store_id) === String(x.id) ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></label>
        </div>
        <div class="row wrap integ-opts">
          <label class="check"><input type="checkbox" data-b="orders" ${set.orders !== false ? 'checked' : ''}> Ambil pesanan baru otomatis</label>
          <label class="check"><input type="checkbox" data-b="stock" ${set.stock ? 'checked' : ''}> Kirim stok aplikasi ke marketplace</label>
          <label class="check"><input type="checkbox" data-b="status" ${set.status !== false ? 'checked' : ''}> Ikuti status cancel / retur</label>
        </div>
        <label class="field">Alamat webhook (tempel di pengaturan ${esc(p.name)})<div class="row"><input class="input mono grow" readonly value="${s.webhook_token ? esc(hook(cur, s.webhook_token)) : 'Simpan dulu untuk membuat alamat webhook'}"><button class="btn" data-copy ${s.webhook_token ? '' : 'disabled'}>Salin</button></div></label>
        ${s.webhook_token ? `<div class="xs muted">Status: <b>${esc(ST[s.status || 'belum'][0])}</b>${s.last_sync ? ' · kiriman terakhir ' + esc(ago(s.last_sync)) : ''} · ${s.events || 0} kiriman diterima${s.last_error ? ' · <span style="color:var(--red)">' + esc(s.last_error) + '</span>' : ''}</div>` : ''}
        <div class="alert blue small" style="margin:0">Setelah disimpan, pembuat aplikasi memasang fungsi <b>marketplace</b> di server dan mencocokkan format data ${esc(p.name)}. Kirim pesanan uji setelah status menjadi "Terhubung".</div>
        <div class="row wrap" style="justify-content:flex-end">${s.webhook_token ? '<button class="btn btn-ghost" data-reset style="color:var(--red)">Putuskan & hapus kunci</button>' : ''}<label class="check"><input type="checkbox" data-en ${s.enabled ? 'checked' : ''}> Aktifkan</label><button class="btn btn-primary" data-save>Simpan</button></div>`;
    };
    el.addEventListener('click', async (e) => {
      const pb = e.target.closest('[data-p]'); if (pb) { cur = pb.dataset.p; paint(); return; }
      if (e.target.closest('[data-copy]')) { const i = el.querySelector('#form input[readonly]'); try { await navigator.clipboard.writeText(i.value); } catch (_) { i.select(); document.execCommand('copy'); } toast('Alamat webhook disalin', 'ok'); return; }
      if (e.target.closest('[data-reset]')) { if (!await confirmBox('Putuskan ' + P[cur].name + '?', 'Kunci API dihapus dan alamat webhook diganti. Pesanan tidak lagi masuk otomatis.', 'Putuskan', true)) return; try { await rpc('integ_reset', { p_provider: cur }); toast('Diputuskan', 'ok'); load(); } catch (err) { toastErr(err); } return; }
      const sv = e.target.closest('[data-save]'); if (!sv) return;
      const f = el.querySelector('#form'), settings = {}, secrets = {};
      f.querySelectorAll('[data-f]').forEach((i) => { settings[i.dataset.f] = i.value.trim(); });
      f.querySelectorAll('[data-b]').forEach((i) => { settings[i.dataset.b] = i.checked; });
      f.querySelectorAll('[data-s]').forEach((i) => { if (i.value.trim()) secrets[i.dataset.s] = i.value.trim(); });
      sv.disabled = true;
      try { st = await rpc('integ_save', { p_provider: cur, p_settings: settings, p_secrets: secrets, p_enabled: f.querySelector('[data-en]').checked }); toast('Tersimpan. Kunci disimpan aman di server.', 'ok'); paint(); }
      catch (err) { toastErr(err); sv.disabled = false; }
    });
    load();
  }
};
