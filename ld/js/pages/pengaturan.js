// Aventra Leads · Pengaturan
import { api } from '../api.js';
import { FUNCTIONS_URL, SCRIPT_URL } from '../config.js';
import { esc, waktu, jam, modal, toast, icon, copyText, metaDates, $, $$ } from '../ui.js';
import { loadTenantData } from '../app.js';

let tab = 'bisnis';
const TABS = { bisnis: 'Bisnis', pixel: 'Pixel & Token', meta: 'Meta Ads', wa: 'Nomor WA', pasang: 'Pasang di Landing Page', tes: 'Tes Pemasangan', api: 'API untuk ERP' };

export async function render(el, ctx) {
  el.innerHTML = `<div class="tabs">${Object.entries(TABS).map(([k, v]) => `<button data-t="${k}" class="${k === tab ? 'on' : ''}">${v}</button>`).join('')}</div><div id="tabBody"></div>`;
  $('.tabs', el).onclick = (e) => {
    const b = e.target.closest('[data-t]'); if (!b) return;
    tab = b.dataset.t; clearInterval(tesTimer); $$('.tabs button', el).forEach((x) => x.classList.toggle('on', x === b)); draw();
  };
  const body = $('#tabBody', el);
  const draw = () => ({ bisnis, pixel, meta: metaAds, wa, pasang, tes, api: apiTab })[tab](body, ctx);
  draw();
}

const codeBox = (txt) => `<div class="codebox"><pre>${esc(txt)}</pre><button class="btn sm" data-copy="${esc(txt)}">${icon('copy')}Salin</button></div>`;
const bindCopy = (el) => $$('[data-copy]', el).forEach((b) => { b.onclick = () => copyText(b.dataset.copy); });

// ---------------------------------------------------------------- Bisnis
function bisnis(el, { state }) {
  const t = state.tenant;
  el.innerHTML = `<form class="card form narrow" id="f">
    <label>Nama bisnis<input name="nama" required value="${esc(t.nama)}"></label>
    <div class="row2">
      <label>Awalan kode promo<input name="prefix" required pattern="[A-Za-z]{2,4}" maxlength="4" value="${esc(t.prefix)}"></label>
      <label>Teks promo di pesan WA<input name="teks_promo" value="${esc(t.teks_promo)}"></label>
    </div>
    <p class="muted small">Contoh kode: <code>${esc(t.prefix)}-8X4YSH</code>. Jadikan kode sebagai <b>kode promo</b> supaya pelanggan tidak menghapusnya dari pesan.</p>
    <button class="btn primary">Simpan</button>
  </form>`;
  const f = $('#f', el);
  f.onsubmit = async (e) => {
    e.preventDefault();
    const patch = { nama: f.nama.value.trim(), prefix: f.prefix.value.trim().toUpperCase(), teks_promo: f.teks_promo.value.trim() };
    try { await api.updateTenant(t.id, patch); Object.assign(t, patch); toast('Tersimpan'); } catch (err) { toast(err.message, 'err'); }
  };
}

// ---------------------------------------------------------------- Pixel
async function pixel(el, { state }) {
  const t = state.tenant;
  const ts = await api.tokenStatus(t.id);
  el.innerHTML = `<form class="card form narrow" id="f">
    <label>Pixel ID (dataset)<input name="pixel_id" inputmode="numeric" value="${esc(t.pixel_id || '')}" placeholder="123456789012345"></label>
    <label>Token Conversions API
      <input name="token" type="password" autocomplete="off" placeholder="${ts ? 'Token tersimpan · isi untuk mengganti' : 'Tempel token dari Events Manager'}">
    </label>
    <p class="small ${ts ? 'ok-text' : 'err-text'}">${ts ? `Token tersimpan sejak ${waktu(ts)}. Isinya tidak bisa dilihat lagi dari aplikasi.` : 'Token belum diisi. Event belum bisa dikirim ke Meta.'}</p>
    <label class="check"><input type="checkbox" name="pixel_browser" ${t.pixel_browser ? 'checked' : ''}> Pasang Pixel otomatis lewat script (PageView + ViewContent)</label>
    <label>Nama konten untuk ViewContent<input name="vc_name" value="${esc(t.vc_name || '')}" placeholder="Pijat Panggilan Surabaya"></label>
    <p class="muted small">Aktifkan kalau landing page <b>belum</b> punya kode Pixel. Kalau sudah ada kode Pixel manual, biarkan mati supaya PageView tidak dobel. Perubahan terasa di landing page paling lambat 5 menit.</p>
    <label>Test event code (opsional)<input name="test_event_code" value="${esc(t.test_event_code || '')}" placeholder="TEST12345"></label>
    <p class="muted small">Isi hanya saat uji coba, lalu kosongkan lagi. Selama terisi, event hanya muncul di tab <b>Test events</b> Events Manager dan tidak dipakai untuk optimasi iklan.</p>
    <div class="btn-row"><button class="btn primary">Simpan</button>${ts ? '<button type="button" class="btn danger-ghost" id="hapus">Hapus token</button>' : ''}</div>
  </form>
  <div class="card narrow help">
    <h3>Cara mengambil token</h3>
    <ol><li>Buka <b>Events Manager</b> → pilih Pixel/dataset bisnis ini.</li>
    <li>Tab <b>Settings</b> → bagian <b>Conversions API</b> → <b>Generate access token</b>.</li>
    <li>Salin token, tempel di atas, lalu Simpan.</li></ol>
  </div>`;
  const f = $('#f', el);
  f.onsubmit = async (e) => {
    e.preventDefault();
    try {
      const patch = {
        pixel_id: f.pixel_id.value.replace(/\D/g, '') || null, test_event_code: f.test_event_code.value.trim() || null,
        pixel_browser: f.pixel_browser.checked, vc_name: f.vc_name.value.trim() || null,
      };
      await api.updateTenant(t.id, patch); Object.assign(t, patch);
      if (f.token.value.trim()) await api.saveToken(t.id, f.token.value.trim());
      toast('Tersimpan'); pixel(el, { state });
    } catch (err) { toast(err.message, 'err'); }
  };
  const h = $('#hapus', el);
  if (h) h.onclick = async () => { if (!confirm('Hapus token? Event berhenti terkirim ke Meta.')) return; await api.saveToken(t.id, ''); pixel(el, { state }); };
}

// ---------------------------------------------------------------- Meta Ads (v1.2.0)
async function metaAds(el, { state }) {
  const t = state.tenant;
  const ts = await api.adsTokenStatus(t.id);
  el.innerHTML = `<div class="grid2 g-top">
  <form class="card form" id="f">
    <label>ID akun iklan<input name="acct" inputmode="numeric" value="${esc(t.ad_account_id || '')}" placeholder="1234567890 (tanpa act_)"></label>
    <label>Token Meta Ads (izin ads_read)
      <input name="token" type="password" autocomplete="off" placeholder="${ts ? 'Token tersimpan · isi untuk mengganti' : 'Tempel token system user'}"></label>
    <p class="small ${ts ? 'ok-text' : 'err-text'}">${ts ? `Token tersimpan sejak ${waktu(ts)}.` : 'Token belum diisi.'}</p>
    <label class="check"><input type="checkbox" name="auto" ${t.auto_sync !== false ? 'checked' : ''}> Sinkron otomatis (mengikuti jadwal, default tiap 30 menit)</label>
    <div class="note ${!t.last_sync_at ? '' : String(t.last_sync_info || '').startsWith('GAGAL') ? 'bad' : 'ok'}" style="${t.last_sync_at ? '' : 'display:none'}">
      <div>Sinkron terakhir: <b>${waktu(t.last_sync_at)}</b><br><small>${esc(t.last_sync_info || '')}</small></div></div>
    <div class="btn-row"><button class="btn primary">Simpan</button><button type="button" class="btn" id="tes">Simpan & sinkron 7 hari</button></div>
    <div id="hasil"></div>
  </form>
  <div class="card help">
    <h3>Cara mengambil token (sekali, tidak kedaluwarsa)</h3>
    <ol class="small">
      <li>Business Settings → <b>Users → System users</b> → Add (peran Admin).</li>
      <li><b>Assign assets</b>: pilih <b>akun iklan</b> bisnis ini (View performance cukup) dan app Meta Anda.</li>
      <li><b>Generate new token</b> → pilih app → centang izin <code>ads_read</code> → masa berlaku <b>Never</b>.</li>
      <li>Salin token, tempel di sini, lalu Simpan.</li>
      <li>ID akun iklan: Ads Manager → pojok kiri atas, angka setelah <code>act=</code> di alamat browser.</li>
    </ol>
    <p class="muted small">Data yang ditarik: spend, impresi, klik link, landing page view, ViewContent, Contact, chat dimulai, Purchase per iklan per hari. Dipakai di menu <b>Funnel & Target</b>.</p>
    <p class="muted small"><b>Sinkron otomatis</b> butuh jadwal di Supabase (file <code>jadwal-sinkron.sql</code>) dan secret <code>CRON_SECRET</code> di Edge Functions. Jadwal menarik data 3 hari terakhir supaya angka konversi yang telat masuk ikut diperbarui.</p>
  </div></div>`;
  const f = $('#f', el);
  const simpan = async () => {
    const acct = f.acct.value.replace(/\D/g, '') || null;
    await api.updateTenant(t.id, { ad_account_id: acct, auto_sync: f.auto.checked }); t.ad_account_id = acct; t.auto_sync = f.auto.checked;
    if (f.token.value.trim()) await api.saveAdsToken(t.id, f.token.value.trim());
  };
  f.onsubmit = async (e) => { e.preventDefault(); try { await simpan(); toast('Tersimpan'); metaAds(el, { state }); } catch (err) { toast(err.message, 'err'); } };
  $('#tes', el).onclick = async () => {
    const out = $('#hasil', el);
    out.innerHTML = '<div class="loading">Menyinkron…</div>';
    try {
      await simpan();
      const md = metaDates('7d', t.ad_tz);
      const r = await api.syncMeta(t.id, md.since, md.until);
      if (r.tz) t.ad_tz = r.tz;
      t.last_sync_at = new Date().toISOString(); t.last_sync_info = `${r.baris} baris`;
      out.innerHTML = `<div class="note ok"><div>Berhasil: ${r.baris} baris data, spend ${Number(r.spend).toLocaleString('id-ID')}. Buka menu <b>Funnel & Target</b>.</div></div>`;
    } catch (err) { out.innerHTML = `<div class="note bad"><div>${esc(err.message)}</div></div>`; }
  };
}

// ---------------------------------------------------------------- Nomor WA
function wa(el, ctx) {
  const { state } = ctx;
  el.innerHTML = `<div class="toolbar"><p class="muted small grow">Template pesan wajib memuat <code>{kode}</code>. <code>{promo}</code> diganti teks promo.</p>
    <button class="btn primary" id="add">${icon('plus')}Tambah nomor</button></div>
    <div class="card flush"><table class="tbl">
      <thead><tr><th>Label</th><th>Nomor</th><th>Template pesan</th><th>Status</th><th></th></tr></thead>
      <tbody>${state.wa.map((w) => `<tr data-id="${w.id}">
        <td data-l="Label"><b>${esc(w.label)}</b></td><td data-l="Nomor">${esc(w.phone)}</td>
        <td data-l="Template" class="muted">${esc(w.template)}</td>
        <td data-l="Status">${w.aktif ? '<span class="badge ok">Aktif</span>' : '<span class="badge">Nonaktif</span>'}</td>
        <td class="act"><button class="btn sm" data-a="edit">Ubah</button></td></tr>`).join('') || '<tr><td colspan="5" class="empty">Belum ada nomor</td></tr>'}</tbody>
    </table></div>`;
  const open = (w = {}) => {
    const m = modal(w.id ? 'Ubah nomor WA' : 'Tambah nomor WA', `<form class="form" id="wf">
      <div class="row2"><label>Label (mis. SBY)<input name="label" required value="${esc(w.label || '')}"></label>
      <label>Nomor WA<input name="phone" required inputmode="tel" value="${esc(w.phone || '')}" placeholder="0857xxxx"></label></div>
      <label>Template pesan<textarea name="template" rows="3" required>${esc(w.template || `Halo ${state.tenant.nama}, saya mau pesan. Kode promo: {kode} ({promo})`)}</textarea></label>
      <label class="check"><input type="checkbox" name="aktif" ${w.aktif !== false ? 'checked' : ''}> Aktif</label>
      <div class="btn-row"><button class="btn primary">Simpan</button>${w.id ? '<button type="button" class="btn danger-ghost" id="del">Hapus</button>' : ''}</div>
    </form>`);
    const f = m.el.querySelector('#wf');
    f.onsubmit = async (e) => {
      e.preventDefault();
      if (!f.template.value.includes('{kode}')) { toast('Template harus memuat {kode}', 'err'); return; }
      try {
        await api.saveWa({ ...(w.id ? { id: w.id } : { tenant_id: state.tenant.id }), label: f.label.value.trim().toUpperCase(), phone: f.phone.value, template: f.template.value.trim(), aktif: f.aktif.checked });
        m.close(); await loadTenantData(); wa(el, ctx); toast('Tersimpan');
      } catch (err) { toast(err.message, 'err'); }
    };
    const d = m.el.querySelector('#del');
    if (d) d.onclick = async () => { if (!confirm('Hapus nomor ini?')) return; await api.deleteWa(w.id); m.close(); await loadTenantData(); wa(el, ctx); };
  };
  $('#add', el).onclick = () => open();
  $('tbody', el).onclick = (e) => { const b = e.target.closest('[data-a="edit"]'); if (b) open(state.wa.find((w) => w.id === b.closest('tr').dataset.id)); };
}

// ---------------------------------------------------------------- Pasang
function pasang(el, { state }) {
  const t = state.tenant;
  const w = state.wa[0];
  const script = `<script src="${SCRIPT_URL}" data-key="${t.public_key}" defer></script>`;
  const btn = `<a href="https://wa.me/${w?.phone || '62xxxxxxxxxx'}" data-aventra-wa="${w?.label || 'SBY'}">Chat WhatsApp</a>`;
  const params = 'utm_source=facebook&utm_medium=paid&utm_campaign={{campaign.name}}&utm_content={{ad.name}}&ad_id={{ad.id}}&ad_name={{ad.name}}&campaign_name={{campaign.name}}';
  el.innerHTML = `<div class="steps">
    <div class="card"><h3><span class="num">1</span>Tempel script sebelum &lt;/body&gt; di landing page</h3>${codeBox(script)}
      <p class="muted small">Kalau Meta Pixel juga terpasang, event Contact dari browser dan dari server otomatis digabung (tidak dobel).</p></div>
    <div class="card"><h3><span class="num">2</span>Tombol WhatsApp</h3>${codeBox(btn)}
      <p class="muted small">Link <code>wa.me</code> yang sudah ada juga otomatis tertangkap. Pakai <code>data-aventra-wa="LABEL"</code> kalau satu halaman punya beberapa nomor.</p></div>
    <div class="card"><h3><span class="num">3</span>Isi "URL parameters" di setiap iklan Meta</h3>${codeBox(params)}
      <p class="muted small">Ads Manager → level iklan → Tracking → URL parameters. Dari sini laporan "Per iklan" terisi otomatis.</p></div>
    <div class="card"><h3><span class="num">4</span>Pixel PageView &amp; ViewContent</h3>
      ${t.pixel_browser ? `<p class="small ok-text">Pixel otomatis <b>aktif</b>: script di langkah 1 sudah memasang Pixel ${esc(t.pixel_id || '')} + PageView + ViewContent. Tidak perlu kode tambahan.</p>`
        : `<p class="muted small">Pilih salah satu: nyalakan <b>Pixel otomatis</b> di tab Pixel &amp; Token (paling mudah), atau tempel kode ini di &lt;head&gt;:</p>${codeBox(pixelCode(t))}`}
      <p class="muted small">Jangan menambahkan <code>fbq('track','Contact')</code> sendiri: Contact sudah dikirim script, tanpa dobel.</p></div>
    <div class="card"><h3><span class="num">5</span>Uji</h3>
      <p class="small">Pakai tab <b>Tes Pemasangan</b>: masukkan alamat landing page, buka link tesnya, lalu lihat hasilnya langsung.</p></div>
  </div>`;
  bindCopy(el);
}

const pixelCode = (t) => `<script>
!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,
document,'script','https://connect.facebook.net/en_US/fbevents.js');
fbq('init', '${t.pixel_id || 'PIXEL_ID'}');
fbq('track', 'PageView');
fbq('track', 'ViewContent', {content_name: '${(t.vc_name || t.nama).replace(/'/g, '')}'});
</script>`;

// ---------------------------------------------------------------- Tes
let tesTimer = null;
async function tes(el, { state }) {
  const t = state.tenant;
  const lpKey = `ld_lp_${t.id}`;
  const lp = localStorage.getItem(lpKey) || '';
  el.innerHTML = `<div class="grid2 g-top">
    <div class="stack">
      <div class="card">
        <h3><span class="num">1</span>Mode tes Meta</h3>
        <div id="modeTes"></div>
      </div>
      <div class="card">
        <h3><span class="num">2</span>Buat link tes</h3>
        <form class="form" id="lf">
          <label>Alamat landing page<input name="url" type="url" required placeholder="https://mahyrarelaksia.com/mahyra-sby" value="${esc(lp)}"></label>
          <button class="btn primary">Buat link tes</button>
        </form>
        <div id="linkOut"></div>
      </div>
      <div class="card help">
        <h3><span class="num">3</span>Lakukan tes</h3>
        <ol class="small"><li>Buka link tes dari HP (tab penyamaran), klik tombol WA. Pesan WA harus berisi kode promo.</li>
        <li>Catat chat lewat menu <b>Leads &amp; Closing → Chat masuk</b> memakai kode itu, lalu klik <b>Lunas</b> dengan nilai kecil (mis. 1.000).</li>
        <li>Lihat hasilnya di samping. Setelah semua hijau: <b>matikan mode tes</b> dan <b>hapus data tes</b>.</li></ol>
      </div>
    </div>
    <div class="card">
      <div class="card-head flat"><h3>Hasil tes 24 jam terakhir</h3><small class="muted" id="upd"></small></div>
      <div id="hasil"><div class="loading">Memuat…</div></div>
      <button class="btn danger-ghost block" id="hapusTes" style="margin-top:12px">Hapus data tes</button>
    </div>
  </div>`;

  const drawMode = () => {
    const box = $('#modeTes', el);
    box.innerHTML = t.test_event_code
      ? `<div class="note warn"><div>Mode tes <b>AKTIF</b> · kode <code>${esc(t.test_event_code)}</code><br><small>Event hanya masuk tab Test events dan tidak dipakai optimasi iklan.</small></div></div>
         <button class="btn block" id="off" style="margin-top:10px">Matikan mode tes</button>`
      : `<p class="muted small">Ambil kode dari Events Manager → Pixel → tab <b>Test events</b>.</p>
         <div class="input-btn"><input id="code" placeholder="TEST12345"><button class="btn primary" id="on">Aktifkan</button></div>`;
    const off = $('#off', box), on = $('#on', box);
    if (off) off.onclick = async () => { await api.updateTenant(t.id, { test_event_code: null }); t.test_event_code = null; drawMode(); toast('Mode tes dimatikan'); };
    if (on) on.onclick = async () => {
      const v = $('#code', box).value.trim(); if (!v) return;
      await api.updateTenant(t.id, { test_event_code: v }); t.test_event_code = v; drawMode(); toast('Mode tes aktif');
    };
  };
  drawMode();

  const f = $('#lf', el);
  const makeLink = () => {
    const raw = f.url.value.trim(); if (!raw) return;
    localStorage.setItem(lpKey, raw);
    const id = 'TES' + Math.random().toString(36).slice(2, 8).toUpperCase();
    let link;
    try {
      const u = new URL(raw); u.searchParams.set('fbclid', id); u.searchParams.set('utm_content', 'TES-AVENTRA'); link = u.toString();
    } catch { toast('Alamat tidak valid', 'err'); return; }
    $('#linkOut', el).innerHTML = `${codeBox(link)}<div class="btn-row" style="margin-top:8px">
      <a class="btn" href="${esc(link)}" target="_blank" rel="noopener">Buka di tab baru</a>
      <a class="btn" href="https://wa.me/?text=${encodeURIComponent(link)}" target="_blank" rel="noopener">Kirim ke WA saya</a></div>`;
    bindCopy($('#linkOut', el));
  };
  f.onsubmit = (e) => { e.preventDefault(); makeLink(); };
  if (lp) makeLink();

  const waLabel = Object.fromEntries(state.wa.map((w) => [w.id, w.label]));
  const ok = (b, txt) => `<span class="badge ${b ? 'ok' : 'bad'}">${b ? '✓' : '✗'} ${txt}</span>`;
  const load = async () => {
    if (!el.isConnected) { clearInterval(tesTimer); return; }
    const cs = await api.testClicks(t.id);
    const ls = await api.leadsForClicks(cs.map((c) => c.id));
    const byClick = Object.fromEntries(ls.map((l) => [l.click_id, l]));
    $('#hasil', el).innerHTML = cs.length ? cs.map((c) => {
      const l = byClick[c.id];
      return `<div class="tes-row"><div><b>${esc(c.kode)}</b> <span class="tag">${esc(waLabel[c.wa_number_id] || '-')}</span>
        <small class="muted block">${jam(c.created_at)} · ${esc(c.page_url || '')}</small></div>
        <div class="tes-badges">${ok(true, 'Klik tercatat')}${ok(!!c.fbc, 'Jejak iklan')}${ok(c.contact_sent, 'Contact ke Meta')}
        ${ok(!!l, 'Chat dicatat')}${ok(!!l?.purchase_sent_at, 'Purchase ke Meta')}</div></div>`;
    }).join('') : '<p class="empty muted">Belum ada klik tes. Buka link tes lalu klik tombol WA.</p>';
    $('#upd', el).textContent = 'diperbarui ' + jam(new Date().toISOString());
  };
  clearInterval(tesTimer);
  await load();
  tesTimer = setInterval(load, 5000);

  $('#hapusTes', el).onclick = async () => {
    if (!confirm('Hapus semua klik tes (fbclid berawalan TES) beserta chat & log-nya?')) return;
    try { const n = await api.deleteTestData(t.id); toast(`${n} klik tes dihapus`); load(); } catch (err) { toast(err.message, 'err'); }
  };
}

// ---------------------------------------------------------------- API
async function apiTab(el, { state }) {
  const keys = await api.keys(state.tenant.id);
  const curl = `curl -X POST ${FUNCTIONS_URL}/convert \\
  -H "Authorization: Bearer ak_xxxxxxxx" \\
  -H "Content-Type: application/json" \\
  -d '{"kode":"${state.tenant.prefix}-8X4YSH","phone":"081234567890","nilai":135000,"order_ref":"INV-001"}'`;
  el.innerHTML = `<div class="grid2">
    <div class="card flush">
      <div class="card-head"><h3>Kunci API</h3><button class="btn primary sm" id="new">${icon('plus')}Buat kunci</button></div>
      <table class="tbl"><thead><tr><th>Nama</th><th>Awalan</th><th>Terakhir dipakai</th><th></th></tr></thead>
      <tbody>${keys.map((k) => `<tr data-id="${k.id}"><td data-l="Nama"><b>${esc(k.nama)}</b></td><td data-l="Awalan"><code>${esc(k.prefix)}…</code></td>
        <td data-l="Dipakai">${k.revoked ? '<span class="badge bad">Dicabut</span>' : k.last_used ? waktu(k.last_used) : '<span class="muted">belum</span>'}</td>
        <td class="act">${k.revoked ? '' : '<button class="btn danger-ghost sm" data-a="cabut">Cabut</button>'}</td></tr>`).join('') || '<tr><td colspan="4" class="empty">Belum ada kunci</td></tr>'}</tbody></table>
    </div>
    <div class="card help">
      <h3>Kirim closing dari ERP</h3>
      <p class="muted small">Panggil saat order <b>lunas</b>. Kirim <code>kode</code> kalau ada; tanpa kode, nomor HP dipakai untuk mencocokkan. Satu chat hanya dikirim sekali ke Meta.</p>
      ${codeBox(curl)}
    </div>
  </div>`;
  bindCopy(el);
  $('#new', el).onclick = async () => {
    const nama = prompt('Nama kunci (mis. ERP Mahyra)', 'ERP'); if (nama === null) return;
    try {
      const key = await api.createKey(state.tenant.id, nama);
      const m = modal('Kunci API baru', `<p>Simpan sekarang. Kunci ini <b>tidak akan ditampilkan lagi</b>.</p>${codeBox(key)}`);
      bindCopy(m.el);
      apiTab(el, { state });
    } catch (err) { toast(err.message, 'err'); }
  };
  $('tbody', el).onclick = async (e) => {
    const b = e.target.closest('[data-a="cabut"]'); if (!b) return;
    if (!confirm('Cabut kunci ini? ERP yang memakainya berhenti bisa mengirim.')) return;
    await api.revokeKey(b.closest('tr').dataset.id); apiTab(el, { state });
  };
}
