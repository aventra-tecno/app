// Aventra Leads · Log event Meta
import { api } from '../api.js';
import { esc, num, waktu } from '../ui.js';

export async function render(el, { state }) {
  const ev = await api.events(state.tenant.id);
  const gagal = ev.filter((e) => !e.ok).length;
  const pesan = (r) => {
    if (!r) return '';
    if (r.events_received) return `${r.events_received} event diterima`;
    return r.error?.message || r.error || JSON.stringify(r).slice(0, 140);
  };
  el.innerHTML = `
  <div class="kpis three">
    <div class="kpi"><small>Event terakhir</small><b>${num(ev.length)}</b><span>maks. 200 terbaru</span></div>
    <div class="kpi"><small>Berhasil</small><b>${num(ev.length - gagal)}</b><span>diterima Meta</span></div>
    <div class="kpi ${gagal ? 'bad' : ''}"><small>Gagal</small><b>${num(gagal)}</b><span>${gagal ? 'cek Pixel ID & token di Pengaturan' : 'aman'}</span></div>
  </div>
  <div class="card flush">
    <table class="tbl">
      <thead><tr><th>Waktu</th><th>Event</th><th>Status</th><th>Keterangan dari Meta</th></tr></thead>
      <tbody>${ev.map((e) => `<tr>
        <td data-l="Waktu" class="nw">${waktu(e.created_at)}</td>
        <td data-l="Event"><b>${esc(e.event_name)}</b></td>
        <td data-l="Status">${e.ok ? '<span class="badge ok">Berhasil</span>' : '<span class="badge bad">Gagal</span>'}</td>
        <td data-l="Keterangan" class="${e.ok ? 'muted' : 'err-text'}">${esc(pesan(e.response))}</td></tr>`).join('')
        || '<tr><td colspan="4" class="empty">Belum ada event</td></tr>'}</tbody>
    </table>
  </div>`;
}
