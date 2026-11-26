// Aventra Leads · Pengaturan
import { api } from '../api.js';
import { FUNCTIONS_URL, SCRIPT_URL } from '../config.js';
import { esc, num, waktu, jam, modal, toast, icon, copyText, metaDates, $, $$ } from '../ui.js';
import { loadTenantData } from '../app.js';

let tab = 'bisnis';
const TABS = { bisnis: 'Bisnis', pixel: 'Pixel & Token', meta: 'Meta Ads', wa: 'Nomor WA & Scan QR', pasang: 'Pasang di Landing Page', tes: 'Tes Pemasangan', ext: 'Ekstensi WhatsApp', api: 'API untuk ERP' };

export async function render(el, ctx) {
  el.innerHTML = `<div class="tabs">${Object.entries(TABS).map(([k, v]) => `<button data-t="${k}" class="${k === tab ? 'on' : ''}">${v}</button>`).join('')}</div><div id="tabBody"></div>`;
  $('.tabs', el).onclick = (e) => {
    const b = e.target.closest('[data-t]'); if (!b) return;
    tab = b.dataset.t; clearInterval(tesTimer); clearInterval(gwTimer); $$('.tabs button', el).forEach((x) => x.classList.toggle('on', x === b)); draw();
  };
  const body = $('#tabBody', el);
  const draw = () => ({ bisnis, pixel, meta: metaAds, wa, pasang, tes, ext: extTab, api: apiTab })[tab === 'wagw' ? (tab = 'wa') : tab](body, ctx);
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

    <label class="check"><input type="checkbox" name="lead_event" ${t.lead_event !== false ? 'checked' : ''}><span>Kirim event <b>Lead</b> ke Meta saat chat berkode tercatat (dari CS atau ekstensi WhatsApp)</span></label>
    <p class="muted small" style="margin:-6px 0 0 26px">Bisa dipakai campaign <b>Leads → Website → Lead</b> supaya Meta mencari orang yang benar-benar chat, bukan sekadar klik tombol WA.</p>
    <div class="backfill" id="backfill"></div>
    <div class="pxev">
      <label class="check"><input type="checkbox" name="pixel_browser" ${t.pixel_browser ? 'checked' : ''}><span><b>Kirim event Pixel dari landing page lewat script</b></span></label>
      <p class="muted small" style="margin:-4px 0 4px 26px">Kode dasar Pixel ikut dipasang otomatis kalau halaman belum punya. Kalau sudah ada kode Pixel manual, script hanya menambah event yang dipilih (PageView tidak dobel).</p>
      <div class="pxev-list" id="pxev">${EVENTS.map(([n, d]) => {
        const cur = evAktif(t).find((x) => x.e === n);
        return `<div class="pxev-row ${cur ? 'on' : ''}"><label class="check"><input type="checkbox" data-ev="${n}" ${cur ? 'checked' : ''}><span><b>${n}</b><small class="muted block">${d}</small></span></label>
          ${n === 'PageView' ? '<span class="muted small">saat halaman dibuka</span>' : `<select data-w="${n}">${Object.entries(KAPAN).map(([k, v]) => `<option value="${k}" ${(cur?.w || DEF_W[n] || 'load') === k ? 'selected' : ''}>${v}</option>`).join('')}</select>`}</div>`;
      }).join('')}
        <div class="pxev-row fixed"><span><b>Contact</b><small class="muted block">klik tombol WA · otomatis, browser + server</small></span><span class="badge ok">selalu</span></div>
        <div class="pxev-row fixed"><span><b>Lead</b><small class="muted block">chat berkode tercatat · dari server</small></span><span class="badge ${t.lead_event !== false ? 'ok' : ''}">${t.lead_event !== false ? 'aktif' : 'mati'}</span></div>
        <div class="pxev-row fixed"><span><b>Purchase</b><small class="muted block">CS menandai lunas · dari server</small></span><span class="badge ok">selalu</span></div>
      </div>
      <p class="muted small">Event pilihan dikirim dari browser pengunjung, tidak perlu disetel lagi di Events Manager. Event dengan <b>"Saat klik tombol khusus"</b> perlu atribut di tombolnya, lihat tab <b>Pasang di Landing Page</b>. Perubahan terasa di landing page paling lambat 5 menit.</p>
    </div>
    <label>Nama konten (content_name) untuk event Pixel<input name="vc_name" value="${esc(t.vc_name || '')}" placeholder="Pijat Panggilan Surabaya"></label>
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
        pixel_events: $$('[data-ev]', f).filter((c) => c.checked).map((c) => ({ e: c.dataset.ev, w: c.dataset.ev === 'PageView' ? 'load' : $(`[data-w="${c.dataset.ev}"]`, f).value })),
        lead_event: f.lead_event.checked,
      };
      await api.updateTenant(t.id, patch); Object.assign(t, patch);
      if (f.token.value.trim()) await api.saveToken(t.id, f.token.value.trim());
      toast('Tersimpan'); pixel(el, { state });
    } catch (err) { toast(err.message, 'err'); }
  };
  $('#pxev', el).onchange = (e) => { const c = e.target.closest('[data-ev]'); if (c) c.closest('.pxev-row').classList.toggle('on', c.checked); };
  const h = $('#hapus', el);
  if (h) h.onclick = async () => { if (!confirm('Hapus token? Event berhenti terkirim ke Meta.')) return; await api.saveToken(t.id, ''); pixel(el, { state }); };

  // kirim susulan event Lead untuk chat lama (maks. 7 hari, batas Meta)
  const bf = $('#backfill', el);
  const drawBf = async () => {
    let list = [];
    try { list = await api.pendingLeads(t.id); } catch { bf.innerHTML = ''; return; }
    if (!list.length) { bf.innerHTML = '<span class="ok-text small">✓ Semua chat berkode 7 hari terakhir sudah terkirim sebagai Lead.</span>'; return; }
    bf.innerHTML = `<div><b>${list.length} chat berkode</b> dalam 7 hari terakhir belum terkirim sebagai Lead.${t.test_event_code ? ' <span class="err-text">Kosongkan Test event code dulu supaya tidak masuk ke Test events.</span>' : ''}</div>
      <button type="button" class="btn sm primary" id="bfGo">Kirim sekarang</button>`;
    $('#bfGo', bf).onclick = async (e) => {
      const b = e.target; b.disabled = true;
      let ok = 0, lewat = 0, gagal = 0;
      for (let i = 0; i < list.length; i++) {
        b.textContent = `Mengirim ${i + 1}/${list.length}…`;
        try { const r = await api.sendLead(list[i].id); if (r?.terkirim) ok++; else if (r?.lewati) lewat++; else gagal++; } catch { gagal++; }
      }
      toast(`Lead terkirim: ${ok}${lewat ? ` · dilewati ${lewat}` : ''}${gagal ? ` · gagal ${gagal} (lihat Log Event Meta)` : ''}`, gagal ? 'warn' : 'ok');
      drawBf();
    };
  };
  drawBf();
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
    <div class="card"><h3><span class="num">4</span>Event Pixel</h3>
      ${t.pixel_browser ? `<p class="small ok-text">Event Pixel lewat script <b>aktif</b> (Pixel ${esc(t.pixel_id || '')}). Yang dikirim:</p>
        <ul class="small pxev-sum">${evAktif(t).map((x) => `<li><b>${esc(x.e)}</b> · ${x.e === 'PageView' ? 'saat halaman dibuka' : KAPAN[x.w].toLowerCase()}</li>`).join('')}<li><b>Contact</b> · saat klik tombol WA</li></ul>
        ${evAktif(t).filter((x) => x.w === 'klik').map((x) => `<p class="muted small">Tombol untuk <b>${esc(x.e)}</b>: tambahkan atribut ini di tombolnya</p>${codeBox(`<button data-aventra-event="${x.e}">${x.e === 'AddToCart' ? 'Pesan sekarang' : x.e === 'InitiateCheckout' ? 'Lanjut pesan' : 'Klik di sini'}</button>`)}`).join('')}
        <p class="muted small">Ubah daftar event di tab <b>Pixel &amp; Token</b>. Tidak perlu kode tambahan selain script di langkah 1.</p>`
        : `<p class="muted small">Pilih salah satu: nyalakan <b>Kirim event Pixel lewat script</b> di tab Pixel &amp; Token lalu pilih event-nya (paling mudah), atau tempel kode ini di &lt;head&gt;:</p>${codeBox(pixelCode(t))}`}
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

// ---------------------------------------------------------------- Ekstensi WhatsApp (v1.11.0)
const EXT_ZIP = 'ext/aventra-leads-wa.zip';
async function extTab(el, { state }) {
  el.innerHTML = '<div class="loading">Memuat…</div>';
  let st;
  try { st = await api.extStatus(state.tenant.id); } catch (e) { el.innerHTML = `<div class="note bad"><div>${esc(e.message)}. Jalankan update-1.11.sql dulu.</div></div>`; return; }
  const pro = st.plan === 'pro', pct = Math.min(100, Math.round(st.terpakai / st.kuota * 100));
  const row = (f, g, p) => `<tr><td>${f}</td><td class="c">${g}</td><td class="c">${p}</td></tr>`;
  const y = '<span class="ok-text">✓</span>', n = '<span class="muted">–</span>';
  el.innerHTML = `<div class="grid2 g-top">
    <div class="stack">
      <div class="card ext-plan ${pro ? 'pro' : ''}">
        <div class="ext-plan-top"><div><small>Paket bisnis ini</small><b>${pro ? 'Pro' : 'Gratis'}</b></div><span class="plan-badge ${pro ? 'pro' : ''}">${pro ? 'PRO' : 'GRATIS'}</span></div>
        ${pro ? `<p class="muted">Catat otomatis tanpa batas${st.plan_until ? ` · aktif sampai <b>${new Date(st.plan_until).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}</b>` : ''}.</p>`
          : `<div class="ext-quota"><span>Chat tercatat otomatis bulan ini</span><b>${st.terpakai} / ${st.kuota}</b></div><div class="bar"><i style="width:${pct}%"></i></div>
             <p class="muted small">Upgrade ke Pro: hubungi admin Aventra.</p>`}
      </div>
      <div class="card flush">
        <div class="card-head"><h3>Gratis vs Pro</h3></div>
        <table class="tbl ext-cmp"><thead><tr><th>Fitur</th><th class="c">Gratis</th><th class="c">Pro</th></tr></thead><tbody>
          ${row('Deteksi kode promo di WhatsApp Web', y, y)}
          ${row('Catat otomatis ke Leads (kode, nomor, nama, nomor CS)', `${st.kuota} chat/bulan`, 'Tanpa batas')}
          ${row('Notifikasi "tercatat" di WhatsApp Web', y, y)}
          ${row('Panel di samping chat: tahap A–D & alasan', n, y)}
          ${row('Tandai Lunas + nilai → Purchase ke Meta dari chat', n, y)}
          ${row('Panel muncul juga untuk chat tanpa kode (cari dari nomor)', n, y)}
        </tbody></table>
      </div>
    </div>
    <div class="card help">
      <h3>Cara pasang di Chrome laptop CS</h3>
      <ol>
        <li><a class="btn sm primary" href="${EXT_ZIP}" download>Unduh ekstensi</a> lalu <b>ekstrak</b> zip-nya ke satu folder.</li>
        <li>Buka <code>chrome://extensions</code>, nyalakan <b>Developer mode</b> (kanan atas).</li>
        <li>Klik <b>Load unpacked</b> → pilih folder hasil ekstrak.</li>
        <li>Klik ikon <b>Aventra Leads</b> di toolbar → masuk dengan akun Aventra → pilih bisnis.</li>
        <li>Buka <b>web.whatsapp.com</b> di Chrome yang sama dan biarkan tabnya terbuka. CS boleh tetap membalas dari HP.</li>
      </ol>
      <div class="note warn"><div>Ekstensi hanya <b>membaca</b> chat yang tampil di WhatsApp Web dan tidak pernah mengirim pesan. Yang dikirim ke Aventra hanya chat berisi kode <b>${esc(st.prefix || state.tenant.prefix)}-…</b>. Bila tampilan WhatsApp Web berubah, pencatatan bisa berhenti sementara sampai ekstensi diperbarui. Selama itu CS tetap bisa mencatat manual.</div></div>
    </div>
  </div>`;
}

// ---------------------------------------------------------------- Nomor WA + Scan QR (v1.16.0: tab digabung)
let gwTimer = 0;
const GW_STATUS = {
  baru: ['Menyiapkan QR…', 'warn'], qr: ['Menunggu scan', 'warn'], terhubung: ['Tersambung', 'ok'],
  terputus: ['Menyambung ulang…', 'warn'], keluar: ['Terputus', 'bad'], error: ['Perlu scan ulang', 'bad'],
};
const nHp = (p) => { const d = String(p || '').replace(/\D/g, ''); return d.startsWith('0') ? '62' + d.slice(1) : d.startsWith('8') ? '62' + d : d; };

async function wa(el, ctx) {
  const { state } = ctx;
  const t = state.tenant;
  clearInterval(gwTimer);
  let gwSiap = true;

  const draw = async (paksa = false) => {
    if (!el.isConnected) return clearInterval(gwTimer);
    let sesi = [], gw = null;
    try { [sesi, gw] = await Promise.all([api.waSessions(t.id), api.gatewayStatus().catch(() => null)]); }
    catch { gwSiap = false; }
    if (!paksa && document.activeElement?.closest?.('#waBox select')) return;
    const online = gw?.last_seen && Date.now() - Date.parse(gw.last_seen) < 90e3;
    // sesi lama (sebelum v1.16) dicocokkan lewat nomor HP lalu ditautkan
    for (const s of sesi) if (!s.wa_number_id && s.phone) {
      const w = state.wa.find((x) => nHp(x.phone) === nHp(s.phone));
      if (w) { s.wa_number_id = w.id; api.linkWaSession(s.id, w.id).catch(() => {}); }
    }
    const sesiOf = (w) => sesi.find((s) => s.wa_number_id === w.id);
    const lepas = sesi.filter((s) => !s.wa_number_id || !state.wa.some((w) => w.id === s.wa_number_id));

    const kartu = (w) => {
      const s = sesiOf(w);
      const [lbl, cls] = s ? GW_STATUS[s.status] || [s.status, ''] : ['Belum scan', ''];
      const beda = s?.status === 'terhubung' && s.phone && nHp(s.phone) !== nHp(w.phone);
      return `<div class="card wa-card" data-w="${w.id}">
        <div class="wa-card-top">
          <div class="wa-id"><span class="wa-ic">${icon('chat')}</span><div><b>${esc(w.label)}</b><small>+${esc(nHp(w.phone))}</small></div></div>
          <div class="wa-badges">${w.aktif ? '<span class="badge ok" title="Dipakai tombol WA di landing page">Landing aktif</span>' : '<span class="badge">Landing nonaktif</span>'}
            <span class="badge ${cls}" title="Status sambungan scan QR (baca chat otomatis)">${icon('chat')}${lbl}</span></div>
        </div>
        <p class="wa-tmpl">${esc(w.template)}</p>
        ${s?.status === 'qr' && s.qr ? `<div class="gw-qr"><img src="${esc(s.qr)}" alt="QR WhatsApp"><ol>
          <li>Buka <b>WhatsApp Business</b> di HP nomor <b>${esc(w.label)}</b>.</li><li>Ketuk <b>⋮ / Setelan → Perangkat tertaut</b>.</li>
          <li>Ketuk <b>Tautkan perangkat</b>, lalu arahkan kamera ke QR ini.</li><li>QR berganti otomatis setiap ±20 detik.</li></ol></div>` : ''}
        ${s?.status === 'baru' ? `<div class="note warn"><div>${online ? 'Menyiapkan QR… tunggu beberapa detik.' : 'Gateway offline. Jalankan program WA Gateway di VPS dulu.'}</div></div>` : ''}
        ${beda ? `<div class="note bad"><div>Yang di-scan nomor <b>+${esc(s.phone)}</b>, bukan nomor ini. Putuskan lalu scan dari HP yang benar.</div></div>` : ''}
        ${s?.info && !['qr', 'baru', 'terhubung'].includes(s.status) ? `<p class="muted small">${esc(s.info)}</p>` : ''}
        ${s ? `<div class="gw-meta"><span>Chat tercatat otomatis <b>${num(s.chat_tercatat || 0)}</b></span>${s.last_seen && s.status === 'terhubung' ? `<span>aktif ${waktu(s.last_seen)}</span>` : ''}</div>` : ''}
        <div class="btn-row">
          ${!s || ['keluar', 'error', 'terputus'].includes(s.status) ? `<button class="btn sm primary" data-a="scan">${icon('chat')}${s ? 'Scan ulang' : 'Scan QR'}</button>` : ''}
          ${s?.status === 'terhubung' ? '<button class="btn sm danger-ghost" data-a="putus">Putuskan</button>' : ''}
          ${s && s.status !== 'terhubung' ? '<button class="btn sm" data-a="batal">Batalkan</button>' : ''}
          <button class="btn sm" data-a="ubah">${icon('edit')}Ubah</button>
        </div></div>`;
    };

    el.innerHTML = `<div id="waBox">
      <div class="card wa-top">
        <div class="gw-st ${online ? 'on' : 'off'}"><span></span><div><b>WA Gateway ${!gwSiap ? 'belum dipasang' : online ? 'online' : 'offline'}</b>
          <small>${!gwSiap ? 'Jalankan update-1.14.sql & update-1.16.sql untuk fitur scan QR' : gw?.last_seen ? `detak terakhir ${waktu(gw.last_seen)}${gw.versi ? ` · v${esc(gw.versi)}` : ''}` : 'program gateway belum pernah berjalan di VPS'}</small></div></div>
        <div class="wa-top-r">
          <label class="wa-simpan">Simpan isi chat Inbox<select id="simpan">${[30, 60, 90, 180].map((d) => `<option value="${d}" ${(t.wa_simpan_hari || 60) === d ? 'selected' : ''}>${d} hari</option>`).join('')}</select></label>
          <button class="btn primary" id="add">${icon('plus')}Tambah nomor</button>
        </div>
      </div>
      <div class="wa-grid">${state.wa.map(kartu).join('') || '<div class="card empty muted">Belum ada nomor. Klik <b>Tambah nomor</b>.</div>'}</div>
      ${lepas.length ? `<h3 class="wa-sub">Sambungan tanpa nomor</h3><div class="wa-grid">${lepas.map((s) => `<div class="card wa-card"><div class="wa-card-top"><div class="wa-id"><span class="wa-ic">${icon('chat')}</span><div><b>${esc(s.label || 'Nomor WhatsApp')}</b><small>${s.phone ? '+' + esc(s.phone) : 'belum tersambung'}</small></div></div><span class="badge ${(GW_STATUS[s.status] || [])[1] || ''}">${(GW_STATUS[s.status] || [s.status])[0]}</span></div>
        <p class="muted small">Tambahkan nomor ini di daftar atas supaya chat-nya terhubung ke nomor CS yang benar.</p><div class="btn-row"><button class="btn sm" data-del="${s.id}">${icon('trash')}Hapus sambungan</button></div></div>`).join('')}</div>` : ''}
      <div class="card help wa-help"><h3>Cara kerja</h3><ol>
        <li><b>Nomor WA</b> dipakai tombol WhatsApp di landing page (template wajib memuat <code>{kode}</code>, <code>{promo}</code> diganti teks promo).</li>
        <li><b>Scan QR</b> menyambungkan nomor itu ke WA Gateway di VPS, sama seperti WhatsApp Web. Chat berkode & chat dari iklan CTWA tercatat otomatis, dan semua chat tampil di menu <b>Inbox WA</b>.</li>
        <li>Gateway hanya membaca: tidak pernah mengirim pesan dan tidak membuat pesan terbaca. CS tetap membalas dari HP.</li></ol>
        <div class="note warn"><div>Gateway memakai API WhatsApp tidak resmi. Nomor yang memakainya bisa diblokir WhatsApp. Uji 1 nomor dulu selama 1–2 minggu.</div></div></div>
    </div>`;

    $('#add', el).onclick = () => ubah();
    $('#simpan', el).onchange = async (e) => {
      try { await api.updateTenant(t.id, { wa_simpan_hari: Number(e.target.value) }); t.wa_simpan_hari = Number(e.target.value); toast('Tersimpan'); } catch (err) { toast(err.message, 'err'); }
    };
    $$('[data-w] [data-a]', el).forEach((b) => (b.onclick = async () => {
      const w = state.wa.find((x) => x.id === b.closest('[data-w]').dataset.w);
      const s = sesiOf(w);
      try {
        if (b.dataset.a === 'ubah') return ubah(w);
        if (b.dataset.a === 'scan') { await scan(w, s); toast('Menyiapkan QR…'); }
        if (b.dataset.a === 'putus') { if (!confirm(`Putuskan ${w.label} dari gateway? Chat berhenti tercatat otomatis.`)) return; await api.cmdWaSession(s.id, 'logout'); toast('Diputuskan'); }
        if (b.dataset.a === 'batal') { await api.delWaSession(s.id); }
        draw(true);
      } catch (err) { toast(err.message, 'err'); }
    }));
    $$('[data-del]', el).forEach((b) => (b.onclick = async () => {
      if (!confirm('Hapus sambungan ini? Gateway akan keluar dari WhatsApp di nomor tersebut.')) return;
      try { await api.delWaSession(b.dataset.del); draw(true); } catch (err) { toast(err.message, 'err'); }
    }));
  };

  const scan = async (w, s) => {
    if (!gwSiap) throw new Error('Jalankan update-1.14.sql & update-1.16.sql dulu');
    if (s) await api.cmdWaSession(s.id, 'restart');
    else await api.addWaSession(t.id, w.label, w.id);
  };

  const ubah = (w = {}) => {
    const m = modal(w.id ? 'Ubah nomor WA' : 'Tambah nomor WA', `<form class="form" id="wf">
      <div class="row2"><label>Label (mis. SBY)<input name="label" required value="${esc(w.label || '')}"></label>
      <label>Nomor WA<input name="phone" required inputmode="tel" value="${esc(w.phone || '')}" placeholder="0857xxxx"></label></div>
      <label>Template pesan<textarea name="template" rows="3" required>${esc(w.template || `Halo ${t.nama}, saya mau pesan. Kode promo: {kode} ({promo})`)}</textarea></label>
      <label class="check"><input type="checkbox" name="aktif" ${w.aktif !== false ? 'checked' : ''}> Aktif di tombol WA landing page</label>
      <div class="btn-row">
        ${w.id ? '<button class="btn primary">Simpan</button><button type="button" class="btn danger-ghost" id="del">Hapus</button>'
          : `<button class="btn primary" data-scan="1">${icon('chat')}Simpan & Scan QR</button><button class="btn">Simpan saja</button>`}
      </div>
    </form>`);
    const f = m.el.querySelector('#wf');
    f.onsubmit = async (e) => {
      e.preventDefault();
      if (!f.template.value.includes('{kode}')) { toast('Template harus memuat {kode}', 'err'); return; }
      const mauScan = e.submitter?.dataset.scan === '1';
      try {
        const row = { label: f.label.value.trim().toUpperCase(), phone: f.phone.value, template: f.template.value.trim(), aktif: f.aktif.checked };
        const baru = await api.saveWa(w.id ? { id: w.id, ...row } : { tenant_id: t.id, ...row });
        if (w.id) { const s = (await api.waSessions(t.id).catch(() => [])).find((x) => x.wa_number_id === w.id); if (s && s.label !== row.label) api.linkWaSession(s.id, w.id, row.label).catch(() => {}); }
        m.close(); await loadTenantData();
        if (mauScan && baru?.id) { try { await scan(baru, null); toast('Tersimpan. Menyiapkan QR…'); } catch (err) { toast(err.message, 'err'); } }
        else toast('Tersimpan');
        draw(true);
      } catch (err) { toast(err.message, 'err'); }
    };
    const d = m.el.querySelector('#del');
    if (d) d.onclick = async () => { if (!confirm('Hapus nomor ini?')) return; await api.deleteWa(w.id); m.close(); await loadTenantData(); draw(true); };
  };

  el.innerHTML = '<div class="loading">Memuat…</div>';
  await draw(true);
  gwTimer = setInterval(draw, 3000);
}

// ---------------------------------------------------------------- daftar event Pixel (v1.15.0)
const EVENTS = [
  ['PageView', 'Halaman dibuka'],
  ['ViewContent', 'Melihat isi halaman / layanan'],
  ['Search', 'Mencari sesuatu'],
  ['AddToCart', 'Menambah ke keranjang / mau pesan'],
  ['AddToWishlist', 'Menyimpan ke favorit'],
  ['InitiateCheckout', 'Mulai proses pesan'],
  ['AddPaymentInfo', 'Mengisi info pembayaran'],
  ['CompleteRegistration', 'Selesai daftar'],
  ['Schedule', 'Membuat jadwal / booking'],
  ['FindLocation', 'Mencari lokasi'],
  ['CustomizeProduct', 'Memilih varian / paket'],
  ['SubmitApplication', 'Mengirim formulir'],
  ['Subscribe', 'Berlangganan'],
  ['StartTrial', 'Mulai coba gratis'],
  ['Donate', 'Donasi'],
];
const KAPAN = { load: 'Saat halaman dibuka', scroll: 'Saat scroll 50% halaman', lama: 'Setelah 30 detik di halaman', wa: 'Saat klik tombol WA', klik: 'Saat klik tombol khusus' };
const DEF_W = { ViewContent: 'load', Search: 'klik', AddToCart: 'wa', InitiateCheckout: 'wa', Schedule: 'wa', FindLocation: 'klik', CustomizeProduct: 'klik', SubmitApplication: 'klik' };
const evAktif = (t) => (Array.isArray(t.pixel_events) ? t.pixel_events : [{ e: 'PageView', w: 'load' }, { e: 'ViewContent', w: 'load' }]);
