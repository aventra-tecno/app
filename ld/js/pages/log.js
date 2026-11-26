// Aventra Leads · Log event Meta (v1.12.3: filter tanggal & event)
import { api } from '../api.js';
import { esc, num, waktu, range, potong, pagerHtml, bindPager, $ } from '../ui.js';

let fEvent = '', fStatus = '', hal = 1;
const URUT = ['Contact', 'Lead', 'Purchase'];

export async function render(el, { state }) {
  const { from, to } = range(state.period);
  const all = await api.events(state.tenant.id, from, to);
  const names = [...new Set([...URUT, ...all.map((e) => e.event_name)])].filter((n) => all.some((e) => e.event_name === n));
  const pesan = (r) => {
    if (!r) return '';
    if (r.events_received) return `${r.events_received} event diterima`;
    return r.error?.message || r.error || JSON.stringify(r).slice(0, 140);
  };

  const draw = () => {
    const ev = all.filter((e) => (!fEvent || e.event_name === fEvent) && (!fStatus || (fStatus === 'ok' ? e.ok : !e.ok)));
    const gagal = ev.filter((e) => !e.ok).length;
    const pg = potong(ev, hal); hal = pg.page;
    const per = Object.fromEntries(names.map((n) => [n, all.filter((e) => e.event_name === n)]));
    el.innerHTML = `
    <div class="toolbar">
      <div class="chips" id="fe">
        <button class="chip ${!fEvent ? 'on' : ''}" data-e="">Semua <b>${num(all.length)}</b></button>
        ${names.map((n) => `<button class="chip ${fEvent === n ? 'on' : ''}" data-e="${esc(n)}">${esc(n)} <b>${num(per[n].length)}</b></button>`).join('')}
      </div>
      <div class="seg" id="fs"><button data-s="" class="${!fStatus ? 'on' : ''}">Semua status</button><button data-s="ok" class="${fStatus === 'ok' ? 'on' : ''}">Berhasil</button><button data-s="gagal" class="${fStatus === 'gagal' ? 'on' : ''}">Gagal</button></div>
    </div>
    <div class="kpis">
      ${names.slice(0, 3).map((n) => { const g = per[n].filter((e) => !e.ok).length; return `<div class="kpi ${g ? 'bad' : ''}"><small>${esc(n)}</small><b>${num(per[n].length - g)}</b><span>${g ? `${num(g)} gagal` : 'semua diterima Meta'}</span></div>`; }).join('')}
      <div class="kpi ${gagal ? 'bad' : ''}"><small>Gagal (filter ini)</small><b>${num(gagal)}</b><span>${gagal ? 'cek Pixel ID & token di Pengaturan' : 'aman'}</span></div>
    </div>
    <div class="card flush">
      <table class="tbl">
        <thead><tr><th>Waktu</th><th>Event</th><th>Status</th><th>Keterangan dari Meta</th></tr></thead>
        <tbody>${pg.rows.map((e) => `<tr>
          <td data-l="Waktu" class="nw">${waktu(e.created_at)}</td>
          <td data-l="Event"><span class="ev-tag ev-${esc(e.event_name).toLowerCase()}">${esc(e.event_name)}</span></td>
          <td data-l="Status">${e.ok ? '<span class="badge ok">Berhasil</span>' : '<span class="badge bad">Gagal</span>'}</td>
          <td data-l="Keterangan" class="${e.ok ? 'muted' : 'err-text'}">${esc(pesan(e.response))}</td></tr>`).join('')
          || '<tr><td colspan="4" class="empty">Tidak ada event di periode / filter ini</td></tr>'}</tbody>
      </table>
      <div id="pager">${pagerHtml(pg)}</div>
    </div>`;
    $('#fe', el).onclick = (e) => { const b = e.target.closest('[data-e]'); if (!b) return; fEvent = b.dataset.e; hal = 1; draw(); };
    $('#fs', el).onclick = (e) => { const b = e.target.closest('[data-s]'); if (!b) return; fStatus = b.dataset.s; hal = 1; draw(); };
    bindPager($('#pager', el), (n) => { hal = n; draw(); el.querySelector('.card.flush')?.scrollIntoView({ block: 'start', behavior: 'smooth' }); });
  };
  draw();
}
