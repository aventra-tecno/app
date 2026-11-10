// 2.35: pilih rak — ketik (default) dengan saran rak yang sudah ada, atau scan label rak pakai kamera.
// Dipakai: "Tambah ke rak" (barang WIN belum di rak) dan "Pindah rak".
import { supa } from './supa.js';
import { esc, modal, toast, icon } from './ui.js';
import { openCamera } from './scanner.js';

let cache = null;
async function racks() {
  if (cache && Date.now() - cache.t < 60000) return cache.list;
  const { data } = await supa.from('racks').select('code').order('code');
  cache = { t: Date.now(), list: (data || []).map((r) => r.code) };
  return cache.list;
}
const norm = (s) => String(s || '').toUpperCase().replace(/\s+/g, '').trim();
// label rak bisa berisi "RAK:A-05" / "A-05"
const fromScan = (code) => norm(String(code).replace(/^.*?RAK[:\s-]*/i, ''));

// opts: { title, product, qty (jumlah default), qtyMax, okLabel, note }
export async function pickRack(opts = {}) {
  const list = await racks();
  const p = opts.product || {};
  let picked = null;
  const r = await modal({
    title: opts.title || 'Pilih rak',
    body: `<div class="stack s8">
      <div><b>${esc(p.name || '')}</b><div class="xs muted mono">${esc(p.sku || '')}${p.rack_code ? ' · sekarang di rak <b>' + esc(p.rack_code) + '</b>' : ''}</div></div>
      ${opts.note ? `<div class="small muted">${opts.note}</div>` : ''}
      ${opts.qtyMax ? `<label class="field">Jumlah yang ditaruh (maks ${opts.qtyMax})<input class="input num" id="rq" inputmode="numeric" value="${opts.qty ?? opts.qtyMax}"></label>` : ''}
      <div class="seg rk-mode" role="group" aria-label="Cara isi rak"><button type="button" class="on" data-rm="ketik">${icon('list', 14)} Ketik</button><button type="button" data-rm="kamera">${icon('camera', 14)} Scan kamera</button></div>
      <input class="input mono" id="rk" placeholder="Ketik rak, mis. A" autocapitalize="characters" autocomplete="off" spellcheck="false">
      <div class="rk-sug" id="rks"></div>
      ${list.length ? '' : '<div class="alert yellow small">Belum ada rak terdaftar. Tambah dulu di Stok & rak › Rak & label.</div>'}
    </div>`,
    actions: [{ label: 'Batal', value: null }, { label: opts.okLabel || 'Simpan', cls: 'btn-primary', onClick: (ov) => {
      const code = norm(ov.querySelector('#rk').value);
      const hit = list.find((c) => norm(c) === code);
      if (!code) { toast('Pilih / ketik rak dulu', 'err'); return false; }
      if (!hit) { toast(`Rak ${code} tidak ada. Pilih dari rak yang sudah terdaftar.`, 'err'); return false; }
      const q = opts.qtyMax ? Math.min(opts.qtyMax, Math.max(1, parseInt(ov.querySelector('#rq').value, 10) || 0)) : null;
      if (opts.qtyMax && !q) { toast('Isi jumlahnya', 'err'); return false; }
      picked = { rack: hit, qty: q }; return true;
    } }],
    onOpen: (ov) => {
      const inp = ov.querySelector('#rk'), sug = ov.querySelector('#rks');
      const paint = () => {
        const q = norm(inp.value);
        if (!q) { sug.innerHTML = ''; return; }
        const starts = list.filter((c) => norm(c).startsWith(q)), has = list.filter((c) => !norm(c).startsWith(q) && norm(c).includes(q));
        const m = [...starts, ...has].slice(0, 24);
        sug.innerHTML = m.length ? m.map((c) => `<button type="button" class="chip ${norm(c) === q ? 'on' : ''}" data-rk="${esc(c)}">${esc(c)}</button>`).join('')
          : `<span class="xs muted">Tidak ada rak "${esc(q)}".</span>`;
      };
      inp.addEventListener('input', paint);
      sug.addEventListener('click', (e) => { const b = e.target.closest('[data-rk]'); if (b) { inp.value = b.dataset.rk; paint(); } });
      ov.querySelector('.rk-mode').addEventListener('click', (e) => {
        const b = e.target.closest('[data-rm]'); if (!b) return;
        ov.querySelectorAll('[data-rm]').forEach((x) => x.classList.toggle('on', x === b));
        if (b.dataset.rm === 'kamera') {
          openCamera((code) => { inp.value = fromScan(code); paint(); ov.querySelectorAll('[data-rm]').forEach((x) => x.classList.toggle('on', x.dataset.rm === 'ketik')); return { ok: true, title: 'Rak ' + inp.value }; }, { continuous: false, title: 'Arahkan kamera ke label rak' });
        } else inp.focus();
      });
      setTimeout(() => inp.focus(), 60);
    }
  });
  return r ? picked : null;
}
