// Aventra Leads · Leads & Closing
import { api } from '../api.js';
import { esc, rp, num, waktu, jam, range, ymdLocal, modal, toast, icon, TAHAP, ALASAN, potong, pagerHtml, bindPager, petaIklan, opsiIklan, lolosIklan, $, $$ } from '../ui.js';

let filter = 'semua';
let fKode = '', fPel = '', fSumber = '', hal = 1;
let sel = { c: '', a: '', d: '' };
const SUMBER = { lp: 'Landing page', wa: 'Otomatis (WA)', ctwa: 'Iklan CTWA', manual: 'Manual', api: 'API / ERP' };

export async function render(el, ctx) {
  const { state } = ctx;
  const { from, to } = range(state.period);
  const tid = state.tenant.id;
  const [leads, clicks, ins] = await Promise.all([
    api.leads(tid, from, to), api.clicks(tid, new Date(Date.parse(from) - 7 * 864e5).toISOString(), to),
    api.insights(tid, ymdLocal(new Date(Date.parse(from) - 60 * 864e5)), ymdLocal(new Date(Date.parse(to) - 1))).catch(() => []),
  ]);
  const clickById = Object.fromEntries(clicks.map((c) => [c.id, c]));
  const waLabel = Object.fromEntries(state.wa.map((w) => [w.id, w.label]));
  const iklan = petaIklan(ins);
  leads.forEach((l) => {
    const c = clickById[l.click_id];
    l._c = c;
    l._m = c ? iklan(c) : l.ad_id || l.ad_name ? iklan({ ad_id: l.ad_id, ad_name: l.ad_name }) : iklan(null);
  });
  const ops = opsiIklan(leads.map((l) => l._m), sel);
  if (!ops.ada(sel)) sel = { c: '', a: '', d: '' };
  const sumberAda = [...new Set(leads.map((l) => l.sumber).filter(Boolean))];

  const lolos = (l, abaikanStatus = false) => {
    if (!lolosIklan(l._m, sel)) return false;
    if (fSumber && l.sumber !== fSumber) return false;
    const k = fKode.trim().toUpperCase();
    if (k && !(l._c?.kode || '').toUpperCase().includes(k)) return false;
    const p = fPel.trim().toLowerCase();
    if (p) {
      const d = p.replace(/\D/g, '').replace(/^0/, '').replace(/^62/, '');
      const okNama = (l.nama || '').toLowerCase().includes(p);
      const okHp = d.length >= 3 && (l.phone || '').replace(/\D/g, '').includes(d);
      if (!okNama && !okHp) return false;
    }
    if (abaikanStatus) return true;
    if (filter === 'proses' && l.paid_at) return false;
    if (filter === 'lunas' && !l.paid_at) return false;
    if (filter === 'gagal' && !(l.paid_at && !l.purchase_sent_at)) return false;
    return true;
  };

  el.innerHTML = `
  <div class="filters lipat" id="filters">
    <div class="search">${icon('search')}<input id="fKode" placeholder="Kode promo, mis. ${esc(state.tenant.prefix)}-6JD" value="${esc(fKode)}" autocapitalize="characters"></div>
    <div class="search">${icon('search')}<input id="fPel" placeholder="Nama atau nomor HP pelanggan" value="${esc(fPel)}"></div>
    <button type="button" class="btn flt-toggle" id="fltBtn">${icon('funnel')}Filter${sel.c || sel.a || sel.d || (typeof nomor !== 'undefined' && nomor) || (typeof status !== 'undefined' && status) || (typeof fSumber !== 'undefined' && fSumber) ? ' •' : ''}</button>
    ${ops.html}
    <select data-f="s"><option value="">Semua sumber</option>${sumberAda.map((k) => `<option value="${k}" ${fSumber === k ? 'selected' : ''}>${esc(SUMBER[k] || k)}</option>`).join('')}</select>
  </div>
  <div class="toolbar">
    <div class="chips" id="chips"></div>
    <button class="btn primary" id="add">${icon('plus')}Chat masuk</button>
  </div>
  <div class="card flush">
    <table class="tbl leads">
      <thead><tr><th>Masuk</th><th>Kode</th><th>Nama</th><th>No. HP</th><th>Iklan</th><th>Tahap</th><th>Alasan</th><th class="r">Nilai · Meta</th><th></th></tr></thead>
      <tbody id="rows"></tbody>
    </table>
    <div id="pager"></div>
  </div>`;

  function draw() {
    const dasar = leads.filter((l) => lolos(l, true));
    const counts = {
      semua: dasar.length,
      proses: dasar.filter((l) => !l.paid_at).length,
      lunas: dasar.filter((l) => l.paid_at).length,
      gagal: dasar.filter((l) => l.paid_at && !l.purchase_sent_at).length,
    };
    $('#chips', el).innerHTML = `${chip('semua', 'Semua', counts.semua)}${chip('proses', 'Belum lunas', counts.proses)}
      ${chip('lunas', 'Lunas', counts.lunas)}${counts.gagal ? chip('gagal', 'Gagal ke Meta', counts.gagal, 'bad') : ''}`;
    const pg = potong(dasar.filter((l) => lolos(l)), hal);
    hal = pg.page;
    $('#rows', el).innerHTML = pg.rows.map((l) => {
      const c = l._c;
      const paid = !!l.paid_at;
      const hp = l.phone ? '0' + String(l.phone).replace(/^62/, '') : '';
      return `<tr data-id="${l.id}" class="${paid ? 'is-paid' : ''}">
        <td data-l="Masuk" class="nw">${waktu(l.created_at)}</td>
        <td data-l="Kode">${c ? `<code>${esc(c.kode)}</code>` : l.sumber === 'ctwa' ? '<span class="tag">CTWA</span>' : '<span class="muted">tanpa kode</span>'}${l.sumber === 'wa' || (l.sumber === 'ctwa' && l.ctwa_clid) ? ' <span class="badge ok" title="Dicatat otomatis dari WhatsApp">auto</span>' : ''}</td>
        <td data-l="Nama"><b>${esc(l.nama || '-')}</b></td>
        <td data-l="No. HP" class="nw">${hp ? `<a class="wa-link" href="https://wa.me/${esc(l.phone)}" target="_blank" rel="noopener">${esc(hp)}</a>` : '<span class="muted">-</span>'}<small class="muted block">${esc(waLabel[l.wa_number_id] || '')}</small></td>
        <td data-l="Iklan" class="ad" title="${esc(l._m.cn)}${l._m.an ? ' › ' + esc(l._m.an) : ''}">${esc(c ? l._m.dn : l.ad_name || l._m.dn)}<small class="muted block">${esc(l._m.cn)}</small></td>
        <td data-l="Tahap">${paid ? '<span class="tag tE">E · Closing</span>'
          : `<select class="mini" data-f="stage">${['A', 'B', 'C', 'D'].map((k) => `<option value="${k}" ${l.stage === k ? 'selected' : ''}>${k} · ${TAHAP[k]}</option>`).join('')}</select>`}</td>
        <td data-l="Alasan">${paid ? '-' : `<select class="mini" data-f="alasan"><option value="">–</option>${Object.entries(ALASAN).map(([k, v]) => `<option value="${k}" ${String(l.alasan) === k ? 'selected' : ''}>${k} · ${v}</option>`).join('')}</select>`}</td>
        <td data-l="Nilai · Meta" class="r">${!paid ? '<span class="muted">–</span>' : `<span class="nw">${rp(l.nilai)}</span> ${l.purchase_sent_at ? '<span class="badge ok">Terkirim</span>' : '<span class="badge bad">Gagal</span>'}`}</td>
        <td class="act">${!paid ? '<button class="btn green sm" data-a="lunas">Lunas</button>'
          : !l.purchase_sent_at ? '<button class="btn sm" data-a="ulang">Kirim ulang</button>' : ''}</td>
      </tr>`;
    }).join('') || '<tr><td colspan="9" class="empty">Tidak ada chat di periode / filter ini</td></tr>';
    $('#pager', el).innerHTML = pagerHtml(pg);
    bindPager($('#pager', el), (n) => { hal = n; draw(); el.querySelector('.card.flush')?.scrollIntoView({ block: 'start', behavior: 'smooth' }); });
  }
  draw();
  $('#fltBtn', el).onclick = () => $('#filters', el).classList.toggle('buka');

  $('#fKode', el).oninput = (e) => { fKode = e.target.value; hal = 1; draw(); };
  $('#fPel', el).oninput = (e) => { fPel = e.target.value; hal = 1; draw(); };
  $('#filters', el).onchange = (e) => {
    const s = e.target.closest('select[data-f]'); if (!s) return;
    hal = 1;
    if (s.dataset.f === 's') { fSumber = s.value; draw(); return; }
    sel[s.dataset.f] = s.value;
    if (s.dataset.f === 'c') { sel.a = ''; sel.d = ''; }
    if (s.dataset.f === 'a') sel.d = '';
    render(el, ctx);
  };
  $('#chips', el).onclick = (e) => {
    const b = e.target.closest('[data-chip]'); if (!b) return;
    filter = b.dataset.chip; hal = 1; draw();
  };
  $('#add', el).onclick = () => openLeadModal(state, {}, () => ctx.refresh());

  $('#rows', el).onchange = async (e) => {
    const sel2 = e.target.closest('select[data-f]'); if (!sel2) return;
    const id = sel2.closest('tr').dataset.id;
    const patch = { [sel2.dataset.f]: sel2.value === '' ? null : sel2.dataset.f === 'alasan' ? Number(sel2.value) : sel2.value };
    try { await api.updateLead(id, patch); Object.assign(leads.find((l) => l.id === id), patch); toast('Tersimpan'); }
    catch (err) { toast(err.message, 'err'); }
  };
  $('#rows', el).onclick = (e) => {
    const b = e.target.closest('button[data-a]'); if (!b) return;
    const lead = leads.find((l) => l.id === b.closest('tr').dataset.id);
    if (b.dataset.a === 'lunas') openPaidModal(lead, leads, () => ctx.refresh());
    if (b.dataset.a === 'ulang') sendPaid(lead.id, lead.nilai, () => ctx.refresh());
  };
}

const chip = (k, label, n, cls = '') => `<button data-chip="${k}" class="chip ${cls} ${filter === k ? 'on' : ''}">${label}<b>${num(n)}</b></button>`;

// ------------------------------------------------------------------ MODAL: chat masuk
export async function openLeadModal(state, { click = null } = {}, onDone) {
  const tid = state.tenant.id;
  const m = modal('Catat chat masuk', `
    <form id="lf" class="form">
      <div class="seg block" id="mode"><button type="button" data-m="kode" class="on">Ada kode promo</button><button type="button" data-m="ctwa">Iklan CTWA</button><button type="button" data-m="tanpa">Tanpa kode</button></div>
      <div data-show="kode">
        <label>Kode promo dari chat<div class="input-btn"><input name="kode" placeholder="${esc(state.tenant.prefix)}-XXXXXX" autocapitalize="characters" value="${esc(click?.kode || '')}"><button type="button" class="btn" id="cek">Cek</button></div></label>
      </div>
      <div data-show="ctwa" hidden>
        <label>Dari iklan CTWA<select name="ctwa"><option value="">Memuat iklan…</option></select></label>
        <p class="muted small">Chat langsung dari iklan Click to WhatsApp (tanpa landing page). Lihat nama iklan di label "Iklan" pada chat WA Business.</p>
      </div>
      <div data-show="tanpa" hidden>
        <p class="muted small">Pilih klik yang waktunya paling dekat dengan chat ini. Kalau tidak ada yang cocok, pilih "catat manual".</p>
        <div id="unlinked" class="pick-list"><div class="loading">Memuat…</div></div>
      </div>
      <div id="clickInfo"></div>
      <div class="row2">
        <label>Nomor WA pelanggan<input name="phone" required inputmode="tel" placeholder="0812xxxx"></label>
        <label>Nama (opsional)<input name="nama"></label>
      </div>
      <div class="row2">
        <label>Masuk ke nomor<select name="wa">${state.wa.map((w) => `<option value="${w.id}">${esc(w.label)} · ${esc(w.phone)}</option>`).join('')}</select></label>
        <label>Tahap sekarang<select name="stage">${['A', 'B', 'C', 'D'].map((k) => `<option value="${k}" ${k === 'B' ? 'selected' : ''}>${k} · ${TAHAP[k]}</option>`).join('')}</select></label>
      </div>
      <button class="btn primary block">Simpan</button>
    </form>`);
  const f = m.el.querySelector('#lf');
  let chosen = null; // klik terpilih
  let mode = 'kode';

  const info = (c) => {
    chosen = c;
    m.el.querySelector('#clickInfo').innerHTML = c
      ? `<div class="note ok">${icon('check')}<div>Klik <b>${esc(c.kode)}</b> · ${waktu(c.created_at)}<br><small>${esc(c.ad_name || c.utm_content || 'iklan tidak diketahui')}${c.fbc ? ' · jejak iklan (fbc) ada' : ''}</small></div></div>`
      : '';
    if (c?.wa_number_id) f.wa.value = c.wa_number_id;
  };
  const cek = async () => {
    const k = f.kode.value.trim(); if (!k) return info(null);
    const c = await api.clickByKode(tid, k);
    if (!c) { info(null); m.el.querySelector('#clickInfo').innerHTML = '<div class="note bad">Kode tidak ditemukan. Cek ejaan, atau pakai "Tanpa kode".</div>'; return; }
    const ada = await api.leadByClick(c.id);
    if (ada) { info(null); m.el.querySelector('#clickInfo').innerHTML = `<div class="note warn">Kode ini sudah tercatat untuk ${esc(ada.nama || ada.phone || 'pelanggan lain')}.</div>`; return; }
    info(c);
  };
  m.el.querySelector('#cek').onclick = cek;
  f.kode.onchange = cek;
  if (click) info(click);

  m.el.querySelector('#mode').onclick = async (e) => {
    const b = e.target.closest('[data-m]'); if (!b) return;
    mode = b.dataset.m;
    m.el.querySelectorAll('#mode button').forEach((x) => x.classList.toggle('on', x === b));
    m.el.querySelectorAll('[data-show]').forEach((d) => { d.hidden = d.dataset.show !== mode; });
    info(null);
    if (mode === 'ctwa') {
      const sel = f.ctwa;
      const now = new Date();
      const ins = await api.insights(tid, ymdLocal(new Date(now - 30 * 864e5)), ymdLocal(now)).catch(() => []);
      const g = {};
      ins.forEach((r) => { const x = (g[r.ad_id] ??= { id: r.ad_id, name: r.ad_name || r.ad_id, camp: r.campaign_name || '', ms: 0, lpv: 0, last: '' });
        x.ms += r.msg_started || 0; x.lpv += r.lpv || 0; if (r.tanggal > x.last) x.last = r.tanggal; });
      const list = Object.values(g).filter((x) => x.ms > 0 && !x.lpv).sort((a, b) => b.last.localeCompare(a.last) || b.ms - a.ms);
      const last = localStorage.getItem('ld_last_ctwa_' + tid);
      sel.innerHTML = list.length
        ? list.map((x) => `<option value="${esc(x.id)}" ${x.id === last ? 'selected' : ''}>${esc(x.name)} · ${esc(x.camp)}</option>`).join('')
        : '<option value="">Belum ada iklan CTWA (sinkron data Meta dulu)</option>';
      sel._list = list;
    }
    if (mode === 'tanpa') {
      const now = Date.now();
      const cs = await api.clicks(tid, new Date(now - 3 * 3600e3).toISOString(), new Date(now + 60e3).toISOString());
      const free = [];
      for (const c of cs) if (!(await api.leadByClick(c.id))) free.push(c);
      const waLabel = Object.fromEntries(state.wa.map((w) => [w.id, w.label]));
      m.el.querySelector('#unlinked').innerHTML = free.map((c) => `
        <label class="pick"><input type="radio" name="pick" value="${c.id}"><span><b>${jam(c.created_at)}</b> · ${esc(waLabel[c.wa_number_id] || '-')} · ${esc(c.ad_name || c.utm_content || '-')}<small class="muted block">${esc(c.kode)}</small></span></label>`).join('')
        + '<label class="pick"><input type="radio" name="pick" value="" checked><span><b>Tidak ada yang cocok</b><small class="muted block">catat manual tanpa klik</small></span></label>';
      m.el.querySelector('#unlinked').onchange = (ev) => info(free.find((c) => c.id === ev.target.value) || null);
    }
  };

  f.onsubmit = async (e) => {
    e.preventDefault();
    if (mode === 'kode' && !chosen) { toast('Cek kode dulu, atau pilih "Tanpa kode"', 'err'); return; }
    const ad = mode === 'ctwa' ? (f.ctwa._list || []).find((x) => x.id === f.ctwa.value) : null;
    if (mode === 'ctwa' && !ad) { toast('Pilih iklan CTWA-nya', 'err'); return; }
    try {
      const baru = await api.createLead({
        tenant_id: tid, click_id: ad ? null : chosen?.id ?? null, wa_number_id: f.wa.value || null,
        phone: f.phone.value, nama: f.nama.value.trim() || null, stage: f.stage.value,
        sumber: ad ? 'ctwa' : chosen ? 'lp' : 'manual',
        ...(ad ? { ad_id: ad.id, ad_name: ad.name } : {}),
      });
      if (ad) localStorage.setItem('ld_last_ctwa_' + tid, ad.id);
      if (baru?.click_id) api.sendLead(baru.id).catch(() => {}); // event Lead ke Meta
      m.close(); toast('Chat tercatat'); onDone?.();
    } catch (err) { toast(err.message, 'err'); }
  };
  setTimeout(() => (click ? f.phone : f.kode).focus(), 50);
}

// ------------------------------------------------------------------ MODAL: lunas
export function openPaidModal(lead, leads, onDone) {
  const recent = [...new Set(leads.filter((l) => l.nilai).map((l) => l.nilai))].slice(0, 4);
  const chips = [...new Set([...recent, 100000, 135000, 200000])].slice(0, 5).sort((a, b) => a - b);
  const m = modal('Tandai lunas', `
    <form id="pf" class="form">
      <p class="muted">${esc(lead.nama || lead.phone || 'Pelanggan')} · tekan setelah layanan selesai dan <b>sudah dibayar</b>. Event Purchase langsung dikirim ke Meta.</p>
      <label>Nilai order (Rp)<input name="nilai" data-rp required inputmode="numeric" placeholder="135.000"></label>
      <div class="chips">${chips.map((v) => `<button type="button" class="chip" data-v="${v}">${rp(v)}</button>`).join('')}</div>
      <button class="btn green block">${icon('check')}Lunas & kirim ke Meta</button>
    </form>`);
  const f = m.el.querySelector('#pf');
  m.el.querySelector('.chips').onclick = (e) => { const b = e.target.closest('[data-v]'); if (b) f.nilai.value = Number(b.dataset.v).toLocaleString('id-ID'); };
  f.onsubmit = async (e) => {
    e.preventDefault();
    const nilai = Number(f.nilai.value.replace(/\D/g, ''));
    if (!nilai) return;
    f.querySelector('button.green').disabled = true;
    m.close();
    sendPaid(lead.id, nilai, onDone);
  };
  setTimeout(() => f.nilai.focus(), 50);
}

async function sendPaid(id, nilai, onDone) {
  try {
    const r = await api.markPaid(id, nilai);
    if (r.terkirim || r.sudah_terkirim) toast('Lunas tersimpan & Purchase terkirim ke Meta');
    else toast('Lunas tersimpan, tapi gagal kirim ke Meta. Cek Log Event.', 'warn');
  } catch (err) { toast(err.message, 'err'); }
  onDone?.();
}
