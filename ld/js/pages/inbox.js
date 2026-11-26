// Aventra Leads · Inbox WA (v1.16.0) — hanya baca & tandai, data dari WA Gateway (scan QR)
import { api } from '../api.js';
import { esc, rp, tgl, jam, toast, icon, TAHAP, ALASAN, $, $$ } from '../ui.js';
import { openLeadModal, openPaidModal, openPelanggan } from './leads.js';

let fWa = '', fTanda = '', fCari = '';
let bukaId = null;
let timer = 0;

const TANDA = [['', 'Semua'], ['kode', 'Berkode'], ['ctwa', 'Iklan CTWA'], ['closing', 'Closing'], ['tanpa', 'Belum ditandai']];
const JENIS = { foto: ['image', 'Foto'], video: ['image', 'Video'], suara: ['mic', 'Pesan suara'], dokumen: ['file', 'Dokumen'], stiker: ['image', 'Stiker'], lokasi: ['file', 'Lokasi'], kontak: ['file', 'Kontak'], lainnya: ['file', 'Pesan'] };

const waktuPendek = (iso) => {
  const d = new Date(iso), now = new Date();
  if (d.toDateString() === now.toDateString()) return jam(iso);
  if (now - d < 6 * 864e5) return d.toLocaleDateString('id-ID', { weekday: 'short' });
  return tgl(iso);
};
const hp = (p) => (p ? '0' + String(p).replace(/^62/, '') : '');
const inisial = (n) => (n || '?').trim().split(/\s+/).slice(0, 2).map((x) => x[0]).join('').toUpperCase();

function tanda(c, besar = false) {
  const t = [];
  if (c.lead?.paid_at) t.push(`<span class="tg tg-close" title="Sudah closing">${icon('check')}Closing${besar && c.lead.nilai ? ' · ' + rp(c.lead.nilai) : ''}</span>`);
  if (c.kode) t.push(`<span class="tg tg-kode" title="Kode promo terbaca bot">${icon('check')}${esc(c.kode)}</span>`);
  if (c.ad_name) t.push(`<span class="tg tg-ctwa" title="Chat dari iklan Click to WhatsApp">CTWA${besar ? ' · ' + esc(c.ad_name) : ''}</span>`);
  if (c.lead && !c.kode && !c.ad_name && !c.lead.paid_at) t.push('<span class="tg tg-lead">Lead</span>');
  if (c.lead && !c.lead.paid_at && besar) t.push(`<span class="tg">Tahap ${esc(c.lead.stage)}</span>`);
  return t.join('');
}

function isiPesan(m, kode) {
  if (m.tipe !== 'teks') {
    const [ic, label] = JENIS[m.tipe] || JENIS.lainnya;
    return `<span class="ib-media">${icon(ic)}${label}</span>${m.teks ? `<div>${esc(m.teks)}</div>` : ''}`;
  }
  let t = esc(m.teks || '');
  const k = m.kode || kode;
  if (k) t = t.replace(new RegExp(k.replace(/[-]/g, '\\-'), 'gi'), (x) => `<mark>${x}</mark>`);
  return t.replace(/\n/g, '<br>');
}

export async function render(el, ctx) {
  const { state } = ctx;
  const tid = state.tenant.id;
  clearInterval(timer);
  let chats = [], habis = false, memuat = false;

  el.innerHTML = `
  <div class="inbox ${bukaId ? 'lihat-chat' : ''}" id="ib">
    <aside class="ib-list">
      <div class="ib-tools">
        <div class="search">${icon('search')}<input id="ibCari" placeholder="Cari nama, nomor, atau kode" value="${esc(fCari)}"></div>
        ${state.wa.length > 1 ? `<select id="ibWa"><option value="">Semua nomor CS</option>${state.wa.map((w) => `<option value="${w.id}" ${fWa === w.id ? 'selected' : ''}>${esc(w.label)} · ${esc(w.phone)}</option>`).join('')}</select>` : ''}
        <div class="ib-chips" id="ibTanda">${TANDA.map(([k, v]) => `<button class="chip ${fTanda === k ? 'on' : ''}" data-t="${k}">${v}</button>`).join('')}</div>
      </div>
      <div class="ib-rows" id="ibRows"><div class="loading">Memuat…</div></div>
    </aside>
    <section class="ib-chat" id="ibChat"></section>
  </div>`;

  const rowsEl = $('#ibRows', el);
  const drawList = () => {
    rowsEl.innerHTML = chats.map((c) => `
      <button class="ib-row ${c.id === bukaId ? 'on' : ''}" data-id="${c.id}">
        <span class="ib-av ${c.lead?.paid_at ? 'close' : c.kode || c.ad_name ? 'tag' : ''}">${esc(inisial(c.nama || c.phone))}</span>
        <span class="ib-mid">
          <span class="ib-top"><b>${esc(c.lead?.nama || c.nama || hp(c.phone) || 'Tanpa nama')}</b><small>${waktuPendek(c.last_at)}</small></span>
          <span class="ib-last">${c.last_from_me ? '<i class="ib-me">Anda:</i> ' : ''}${c.last_tipe && c.last_tipe !== 'teks' ? `${icon((JENIS[c.last_tipe] || JENIS.lainnya)[0])}${(JENIS[c.last_tipe] || JENIS.lainnya)[1]}` : esc(c.last_text || '')}</span>
          <span class="ib-tags">${tanda(c)}</span>
        </span>
      </button>`).join('')
      + (chats.length && !habis ? '<button class="btn sm ib-more" id="ibMore">Muat 20 chat lagi</button>' : '')
      || `<div class="ib-empty">${icon('chat')}<b>Belum ada chat</b><span>${fCari || fTanda || fWa ? 'Tidak ada chat yang cocok dengan filter.' : 'Sambungkan nomor CS lewat Pengaturan → Nomor WA → Scan QR. Chat masuk akan muncul di sini.'}</span></div>`;
    const more = $('#ibMore', rowsEl);
    if (more) more.onclick = () => muat(true);
  };
  const muat = async (lanjut = false) => {
    if (memuat) return; memuat = true;
    try {
      const baru = await api.inboxChats(tid, { wa: fWa, filter: fTanda, q: fCari, offset: lanjut ? chats.length : 0 });
      chats = lanjut ? chats.concat(baru) : baru;
      habis = baru.length < 20;
      drawList();
    } catch (e) {
      rowsEl.innerHTML = `<div class="note bad" style="margin:12px"><div>${esc(e.message)}. Jalankan update-1.16.sql dulu.</div></div>`;
    } finally { memuat = false; }
  };

  // ---------- panel chat ----------
  const chatEl = $('#ibChat', el);
  let pesan = [], chat = null, adaLebih = false;
  const drawChat = (gulirBawah = true) => {
    if (!chat) {
      chatEl.innerHTML = `<div class="ib-kosong">${icon('chat')}<b>Inbox WhatsApp</b><span>Pilih chat di sebelah kiri. Chat berkode promo dan dari iklan CTWA otomatis ditandai oleh bot.</span><small>${icon('lock')}Hanya baca. Balas tetap dari HP / WhatsApp CS.</small></div>`;
      return;
    }
    const l = chat.lead;
    const wa = state.wa.find((w) => w.id === chat.wa_number_id);
    chatEl.innerHTML = `
      <header class="ib-head">
        <button class="btn sm ib-back" id="ibBack">${icon('back')}</button>
        <span class="ib-av ${l?.paid_at ? 'close' : chat.kode || chat.ad_name ? 'tag' : ''}">${esc(inisial(chat.nama || chat.phone))}</span>
        <div class="ib-who"><span class="ib-nm"><b>${esc(l?.nama || chat.nama || hp(chat.phone) || 'Tanpa nama')}</b>${l ? `<button class="btn sm ib-edit" id="ibEdit" title="Ubah nama & nomor">${icon('edit')}</button>` : ''}</span>
          <small>${chat.phone ? `<a class="wa-link" href="https://wa.me/${esc(chat.phone)}" target="_blank" rel="noopener">${esc(hp(chat.phone))}</a>` : 'nomor disamarkan WhatsApp'}${wa ? ` · masuk ke ${esc(wa.label)}` : ''}</small></div>
      </header>
      <div class="ib-lead">
        <div class="ib-tags">${tanda(chat, true) || '<span class="muted small">Belum ditandai bot (tanpa kode & bukan dari iklan)</span>'}</div>
        ${l ? (l.paid_at ? '' : `<div class="ib-act">
            <select class="mini" data-f="stage">${['A', 'B', 'C', 'D'].map((k) => `<option value="${k}" ${l.stage === k ? 'selected' : ''}>${k} · ${TAHAP[k]}</option>`).join('')}</select>
            <select class="mini" data-f="alasan"><option value="">Alasan –</option>${Object.entries(ALASAN).map(([k, v]) => `<option value="${k}" ${String(l.alasan) === k ? 'selected' : ''}>${k} · ${v}</option>`).join('')}</select>
            <button class="btn green sm" id="ibLunas">${icon('check')}Lunas</button></div>`)
          : '<div class="ib-act"><button class="btn sm primary" id="ibCatat">' + icon('plus') + 'Catat sebagai lead</button></div>'}
      </div>
      <div class="ib-msgs" id="ibMsgs">
        ${adaLebih ? '<button class="btn sm ib-older" id="ibOlder">Pesan sebelumnya</button>' : ''}
        ${pesan.map((m, i) => {
          const hari = new Date(m.at).toDateString() !== (pesan[i - 1] ? new Date(pesan[i - 1].at).toDateString() : '');
          return `${hari ? `<div class="ib-day">${new Date(m.at).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long' })}</div>` : ''}
          <div class="ib-msg ${m.from_me ? 'me' : 'them'}">
            ${m.ctwa ? `<div class="ib-note ctwa">Dari iklan CTWA${chat.ad_name ? ': ' + esc(chat.ad_name) : ''}</div>` : ''}
            <div class="ib-bubble">${isiPesan(m, chat.kode)}<span class="ib-time">${jam(m.at)}</span></div>
            ${m.kode ? `<div class="ib-note kode">${icon('check')}Kode ${esc(m.kode)} terbaca bot · tercatat di Leads</div>` : ''}
          </div>`;
        }).join('') || '<div class="ib-day">Belum ada pesan tersimpan</div>'}
      </div>
      <footer class="ib-foot">${icon('lock')}Hanya baca · balas dari HP / WhatsApp CS. Isi chat disimpan ${esc(state.tenant.wa_simpan_hari || 60)} hari.</footer>`;
    const box = $('#ibMsgs', chatEl);
    if (gulirBawah) box.scrollTop = box.scrollHeight;
    $('#ibBack', chatEl).onclick = () => { bukaId = null; $('#ib', el).classList.remove('lihat-chat'); chat = null; drawList(); drawChat(); };
    const older = $('#ibOlder', chatEl);
    if (older) older.onclick = async () => {
      const lama = await api.inboxMessages(chat.id, pesan[0]?.at);
      adaLebih = lama.length >= 30; pesan = lama.concat(pesan);
      const h = box.scrollHeight; drawChat(false); const b2 = $('#ibMsgs', chatEl); b2.scrollTop = b2.scrollHeight - h;
    };
    $$('select[data-f]', chatEl).forEach((s) => (s.onchange = async () => {
      const patch = { [s.dataset.f]: s.value === '' ? null : s.dataset.f === 'alasan' ? Number(s.value) : s.value };
      try { await api.updateLead(l.id, patch); Object.assign(l, patch); toast('Tersimpan'); drawList(); } catch (e) { toast(e.message, 'err'); }
    }));
    const ed = $('#ibEdit', chatEl);
    if (ed && l) ed.onclick = () => openPelanggan(l, () => { drawChat(false); drawList(); });
    const lunas = $('#ibLunas', chatEl);
    if (lunas) lunas.onclick = () => openPaidModal({ ...l, nama: l.nama || chat.nama, phone: l.phone || chat.phone }, [], () => buka(chat.id, true));
    const catat = $('#ibCatat', chatEl);
    if (catat) catat.onclick = () => {
      openLeadModal(state, {}, () => { toast('Lead tercatat. Tanda muncul setelah pesan berikutnya masuk.'); });
      const f = document.querySelector('#lf');
      if (f) { f.phone.value = hp(chat.phone); f.nama.value = chat.nama || ''; if (chat.wa_number_id) f.wa.value = chat.wa_number_id; }
    };
  };
  const buka = async (id, segar = false) => {
    bukaId = id;
    $('#ib', el).classList.add('lihat-chat');
    $$('.ib-row', rowsEl).forEach((b) => b.classList.toggle('on', b.dataset.id === id));
    if (!segar) chatEl.innerHTML = '<div class="loading">Memuat chat…</div>';
    try {
      const [c, m] = await Promise.all([api.inboxChat(id), api.inboxMessages(id)]);
      if (bukaId !== id) return;
      chat = c; pesan = m; adaLebih = m.length >= 30;
      const i = chats.findIndex((x) => x.id === id);
      if (i >= 0 && c) chats[i] = c;
      drawChat();
    } catch (e) { chatEl.innerHTML = `<div class="note bad" style="margin:16px"><div>${esc(e.message)}</div></div>`; }
  };

  rowsEl.onclick = (e) => { const b = e.target.closest('.ib-row'); if (b) buka(b.dataset.id); };
  let tunda = 0;
  $('#ibCari', el).oninput = (e) => { fCari = e.target.value; clearTimeout(tunda); tunda = setTimeout(() => muat(), 300); };
  const waSel = $('#ibWa', el);
  if (waSel) waSel.onchange = () => { fWa = waSel.value; muat(); };
  $('#ibTanda', el).onclick = (e) => {
    const b = e.target.closest('[data-t]'); if (!b) return;
    fTanda = b.dataset.t; $$('#ibTanda .chip', el).forEach((x) => x.classList.toggle('on', x === b)); muat();
  };

  drawChat();
  await muat();
  if (bukaId) buka(bukaId);

  // segarkan tiap 15 detik: daftar chat (halaman pertama) + chat yang terbuka
  timer = setInterval(async () => {
    if (!el.isConnected) return clearInterval(timer);
    if (document.hidden || memuat) return;
    if (rowsEl.scrollTop < 40 && chats.length <= 20) await muat();
    if (chat) {
      const m = await api.inboxMessages(chat.id).catch(() => null);
      if (m && m.length && m[m.length - 1].id !== pesan[pesan.length - 1]?.id) {
        const box = $('#ibMsgs', chatEl);
        const diBawah = !box || box.scrollHeight - box.scrollTop - box.clientHeight < 80;
        const c = await api.inboxChat(chat.id).catch(() => chat);
        chat = c || chat; pesan = m; adaLebih = m.length >= 30;
        if (!document.activeElement?.closest?.('#ibChat select')) drawChat(diBawah);
      }
    }
  }, 15000);
}
