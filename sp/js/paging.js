// Tampilan otomatis untuk semua halaman:
// 1) Daftar / tabel panjang dibagi per halaman (15 baris, bisa diganti 30/50/100) dengan tombol Sebelumnya / Berikutnya.
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
      const b = e.target.closest('[data-go]'); if (!b || b.disabled) return;
      const s = pages.get(key); s.page += +b.dataset.go; paint(c, key);
      const top = anchorOf(c).getBoundingClientRect().top;
      if (top < 0) window.scrollBy({ top: top - 90, behavior: 'smooth' });
    });
    pager.addEventListener('change', (e) => {
      if (!e.target.matches('select')) return;
      try { localStorage.setItem(KEY, e.target.value); } catch (_) {}
      pages.forEach((s) => { s.page = 0; });
      scan();
    });
  }
  const from = st.page * n + 1, to = Math.min(items.length, (st.page + 1) * n);
  pager.innerHTML = `<span class="pg-info">${from}–${to} dari ${items.length}</span>
    <div class="pg-ctl">
      <select class="pg-size" aria-label="Jumlah baris per halaman">${SIZES.map((s) => `<option value="${s}" ${s === n ? 'selected' : ''}>${s} / hal</option>`).join('')}</select>
      <button class="btn btn-sm" data-go="-1" ${st.page === 0 ? 'disabled' : ''} aria-label="Halaman sebelumnya">‹ <span class="hide-mobile">Sebelumnya</span></button>
      <span class="pg-num">${st.page + 1}/${total}</span>
      <button class="btn btn-sm" data-go="1" ${st.page >= total - 1 ? 'disabled' : ''} aria-label="Halaman berikutnya"><span class="hide-mobile">Berikutnya</span> ›</button>
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
