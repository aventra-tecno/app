// Tampilan otomatis untuk semua halaman:
// 1) Daftar / tabel panjang dibagi per halaman (15 baris, bisa diganti 30/50/100) dengan nomor halaman, awal/akhir & lompat ke halaman.
// 2) Di HP, tabel berubah menjadi kartu (label di kiri, nilai di kanan) supaya tidak perlu digeser ke samping.
// Tambahkan class "no-page" pada daftar yang tidak boleh dibagi halaman.
const KEY = 'page-size';
const SIZES = [15, 30, 50, 100];
const pages = new Map();          // posisi halaman per daftar (bertahan saat daftar digambar ulang)
let lastHash = location.hash.split('?')[0];

function size() { let n = 15; try { n = +localStorage.getItem(KEY) || 15; } catch (_) {} return SIZES.includes(n) ? n : 15; }

function containers(view) {
  const out = [];
  view.querySelectorAll('table.tbl > tbody, .list').forEach((c) => {
    if (c.closest('.no-page, .modal, .overlay')) return;
    if (c.classList.contains('list') && c.parentElement?.closest('.list')) return;
    out.push(c);
  });
  return out;
}
const itemsOf = (c) => [...c.children].filter((x) => !x.classList.contains('pager'));
const anchorOf = (c) => (c.tagName === 'TBODY' ? (c.closest('.table-wrap') || c.closest('table')) : c);

function paint(c, key) {
  const items = itemsOf(c), n = size();
  let pager = c.__pager;
  if (items.length <= n) {
    items.forEach((it) => it.classList.remove('pg-hide'));
    if (pager) { pager.remove(); c.__pager = null; }
    c.__pgSig = items.length + ':' + n;
    return;
  }
  const total = Math.ceil(items.length / n);
  let st = pages.get(key);
  if (!st || st.count !== items.length) st = { page: 0, count: items.length };
  st.page = Math.max(0, Math.min(st.page, total - 1));
  pages.set(key, st);
  items.forEach((it, i) => it.classList.toggle('pg-hide', i < st.page * n || i >= (st.page + 1) * n));
  if (!pager || !pager.isConnected) {
    pager = document.createElement('div');
    pager.className = 'pager';
    anchorOf(c).after(pager);
    c.__pager = pager;
    pager.addEventListener('click', (e) => {
      const b = e.target.closest('[data-go],[data-to]'); if (!b || b.disabled) return;
      const s = pages.get(key); s.page = b.dataset.to != null ? +b.dataset.to : s.page + +b.dataset.go; paint(c, key);
      const top = anchorOf(c).getBoundingClientRect().top;
      if (top < 0) window.scrollBy({ top: top - 90, behavior: 'smooth' });
    });
    pager.addEventListener('change', (e) => {
      if (e.target.matches('.pg-jump')) {   // 2.55 lompat ke halaman mana saja
        const s = pages.get(key); s.page = +e.target.value; paint(c, key);
        const top = anchorOf(c).getBoundingClientRect().top;
        if (top < 0) window.scrollBy({ top: top - 90, behavior: 'smooth' });
        return;
      }
      if (!e.target.matches('.pg-size')) return;
      try { localStorage.setItem(KEY, e.target.value); } catch (_) {}
      pages.forEach((s) => { s.page = 0; });
      scan();
    });
  }
  const from = st.page * n + 1, to = Math.min(items.length, (st.page + 1) * n);
  // 2.55 nomor halaman: 1 … 4 5 6 … 20, tombol awal/akhir, dan pilihan "Hal" untuk lompat ke halaman mana saja
  const p = st.page, nums = [...new Set([0, p - 1, p, p + 1, total - 1])].filter((x) => x >= 0 && x < total).sort((x, y) => x - y);
  let prev = -1, numBtns = '';
  for (const x of nums) {
    if (x - prev > 1) numBtns += '<span class="pg-gap">…</span>';
    numBtns += `<button class="btn btn-sm pg-n ${x === p ? 'on' : ''}" data-to="${x}" ${x === p ? 'aria-current="page"' : ''} aria-label="Halaman ${x + 1}">${x + 1}</button>`;
    prev = x;
  }
  pager.innerHTML = `<span class="pg-info">${from}–${to} dari ${items.length}</span>
    <div class="pg-ctl">
      <select class="pg-size" aria-label="Jumlah baris per halaman">${SIZES.map((s) => `<option value="${s}" ${s === n ? 'selected' : ''}>${s} / hal</option>`).join('')}</select>
      <button class="btn btn-sm" data-to="0" ${p === 0 ? 'disabled' : ''} aria-label="Halaman pertama">«</button>
      <button class="btn btn-sm" data-go="-1" ${p === 0 ? 'disabled' : ''} aria-label="Halaman sebelumnya">‹</button>
      <span class="pg-nums">${numBtns}</span>
      <button class="btn btn-sm" data-go="1" ${p >= total - 1 ? 'disabled' : ''} aria-label="Halaman berikutnya">›</button>
      <button class="btn btn-sm" data-to="${total - 1}" ${p >= total - 1 ? 'disabled' : ''} aria-label="Halaman terakhir">»</button>
      <label class="pg-jump-l"><span>Hal</span><select class="pg-jump" aria-label="Pilih halaman">${Array.from({ length: total }, (_, k) => `<option value="${k}" ${k === p ? 'selected' : ''}>${k + 1}</option>`).join('')}</select><span>/ ${total}</span></label>
    </div>`;
  c.__pgSig = items.length + ':' + n + ':' + st.page;
}

// judul kolom angka ikut rata kanan supaya sejajar dengan isinya (layar lebar)
function alignHeads(t, head) {
  const body = t.tBodies[0];
  if (!body || !body.rows.length) return;
  const rows = [...body.rows].filter((r) => [...r.cells].every((c) => c.colSpan === 1 && c.rowSpan === 1)).slice(0, 6);
  if (!rows.length) return;
  [...head.cells].forEach((th, i) => {
    if (th.colSpan !== 1 || th.classList.contains('right') || th.classList.contains('center') || th.style.textAlign) return;
    if (rows.every((r) => r.cells[i] && (r.cells[i].classList.contains('num') || r.cells[i].classList.contains('right')))) th.classList.add('right');
  });
}

// label kolom untuk mode kartu di HP
function labelTable(t) {
  const head = t.tHead?.rows[0];
  if (!head) return;
  alignHeads(t, head);
  t.classList.add('mcard');
  const labels = [];
  [...head.cells].forEach((th) => { for (let i = 0; i < th.colSpan; i++) labels.push(th.querySelector('input,select,button') ? '' : th.textContent.trim()); });
  [...t.tBodies, ...(t.tFoot ? [t.tFoot] : [])].forEach((sec) => [...sec.rows].forEach((tr) => {
    if (tr.__lb) return; tr.__lb = 1;
    let col = 0;
    let titled = false;
    [...tr.cells].forEach((td) => {
      const lb = td.colSpan > 1 ? '' : (labels[col] || '');
      td.dataset.label = lb;
      // kolom nama barang / keterangan jadi judul kartu
      if (!titled && col < 4 && sec.tagName === 'TBODY' && /barang|nama|keterangan|kejadian|pegawai|pesanan|biaya/i.test(lb)) { td.classList.add('mc-title'); titled = true; }
      if (!lb && td.querySelector('input[type=checkbox]') && td.textContent.trim() === '') td.classList.add('mc-check');
      col += td.colSpan;
    });
  }));
}

function scan() {
  const view = document.getElementById('view');
  if (!view) return;
  if (location.hash.split('?')[0] !== lastHash) { lastHash = location.hash.split('?')[0]; pages.clear(); }
  view.querySelectorAll('table.tbl').forEach((t) => { if (!t.closest('.no-card')) labelTable(t); });
  containers(view).forEach((c, i) => {
    const key = (location.hash.split('?')[0]) + '#' + i;
    const n = size(), cnt = itemsOf(c).length, st = pages.get(key);
    const sig = cnt + ':' + n + (cnt > n ? ':' + (st && st.count === cnt ? st.page : 0) : '');
    if (c.__pgSig === sig && (cnt <= n || c.__pager?.isConnected)) return;
    paint(c, key);
  });
}

let queued = false;
export function startPaging(root) {
  new MutationObserver(() => {
    if (queued) return; queued = true;
    requestAnimationFrame(() => { queued = false; scan(); });
  }).observe(root, { childList: true, subtree: true });
}
