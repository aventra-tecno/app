// Aventra Leads · Pengaturan
import { api } from '../api.js';
import { FUNCTIONS_URL, SCRIPT_URL } from '../config.js';
import { esc, waktu, modal, toast, icon, copyText, $, $$ } from '../ui.js';
import { loadTenantData } from '../app.js';

let tab = 'bisnis';
const TABS = { bisnis: 'Bisnis', pixel: 'Pixel & Token', wa: 'Nomor WA', pasang: 'Pasang di Landing Page', api: 'API untuk ERP' };

export async function render(el, ctx) {
  el.innerHTML = `<div class="tabs">${Object.entries(TABS).map(([k, v]) => `<button data-t="${k}" class="${k === tab ? 'on' : ''}">${v}</button>`).join('')}</div><div id="tabBody"></div>`;
  $('.tabs', el).onclick = (e) => {
    const b = e.target.closest('[data-t]'); if (!b) return;
    tab = b.dataset.t; $$('.tabs button', el).forEach((x) => x.classList.toggle('on', x === b)); draw();
  };
  const body = $('#tabBody', el);
  const draw = () => ({ bisnis, pixel, wa, pasang, api: apiTab })[tab](body, ctx);
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
      const patch = { pixel_id: f.pixel_id.value.replace(/\D/g, '') || null, test_event_code: f.test_event_code.value.trim() || null };
      await api.updateTenant(t.id, patch); Object.assign(t, patch);
      if (f.token.value.trim()) await api.saveToken(t.id, f.token.value.trim());
      toast('Tersimpan'); pixel(el, { state });
    } catch (err) { toast(err.message, 'err'); }
  };
  const h = $('#hapus', el);
  if (h) h.onclick = async () => { if (!confirm('Hapus token? Event berhenti terkirim ke Meta.')) return; await api.saveToken(t.id, ''); pixel(el, { state }); };
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
    <div class="card"><h3><span class="num">4</span>Uji</h3>
      <ol class="small"><li>Isi <b>Test event code</b> di tab Pixel & Token.</li><li>Buka landing page dari HP, klik tombol WA.</li>
      <li>Cek menu <b>Klik Tombol WA</b> dan tab Test events di Events Manager, lalu kosongkan lagi test event code.</li></ol></div>
  </div>`;
  bindCopy(el);
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
