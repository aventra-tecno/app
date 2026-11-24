import { supa, rpc, fetchAll } from '../supa.js';
import { allProductsCached } from '../products-cache.js';
import { store, nameOf } from '../store.js';
import { esc, rp, num, fmtDateTime, chips, on, modal, toast, toastErr, pageHead, emptyState, skeleton, debounce, icon, loadScript, beep, skuMatch, normSku, codeOr, copyBtn } from '../ui.js';
import { pickRack } from '../rak-pilih.js';
import { bindProductSearch } from '../daftar-file.js';
import { scanBox, bindScan } from '../scanner.js';

const MOV = { initial: 'Stok awal', in_win: 'Masuk dari WIN', pick: 'Keluar untuk pesanan', to_packing: 'Langsung ke packing', pack_no_pick: 'Dipacking tanpa pick', return_good: 'Retur baik kembali', return_damaged: 'Retur rusak → karantina', opname: 'Stok opname', adjust: 'Penyesuaian manual', move_rack: 'Pindah rak', cancel_back: 'Cancel, kembali ke rak', to_meja: 'Belum ditaruh di rak', meja_back: 'Ditaruh di rak', karantina_bagus: 'Karantina dicek: bagus, kembali ke rak', karantina_jelek: 'Karantina dicek: jelek', rusak_masuk: 'Barang jelek dari rak', tukar_win: 'Barang jelek ditukar WIN' };

export default {
  tour: [
    { sel: '[data-chips="tab"]', title: 'Barang, stok opname, rak', body: 'Cari barang & lokasinya, hitung stok fisik per rak (stok opname), dan kelola label rak.' },
    { sel: '#q', title: 'Cari atau scan', body: 'Ketik nama / kode, atau scan barcode barang untuk langsung melihat lokasi rak dan riwayatnya.' }
  ],
  async render(el, { params }) {
    let tab = params.tab || 'barang';
    el.innerHTML = `${pageHead('Stok & rak', 'Stok berubah hanya lewat scan: masuk WIN, ambil, retur, stok opname.')}
      <div class="stack">${chips('tab', [['barang', 'Barang & lokasi'], ['opname', 'Stok opname'], ['rak', 'Rak & label'], ['karantina', 'Karantina']], tab)}<div id="body"></div></div>`;
    const show = () => {
      // isi tab digambar di elemen baru -> klik dari tab sebelumnya tidak ikut terbawa (tidak ada pop-up dobel)
      const old = el.querySelector('#body'), box = old.cloneNode(false);
      old.replaceWith(box);
      return ({ barang: tabBarang, opname: tabOpname, rak: tabRak, karantina: tabKarantina }[tab])(box, params);
    };
    on(el, 'click', '[data-chips="tab"] .chip', (e, b) => { tab = b.dataset.v; b.parentElement.querySelectorAll('.chip').forEach((c) => c.classList.toggle('on', c === b)); show(); });
    show();
  }
};

async function tabBarang(box) {
  const seeValue = ['owner', 'admin'].includes(store.role);
  const canAdj = ['owner', 'kepala_gudang'].includes(store.role);
  // tampilan awal: barang yang ada di rak (stok > 0), bukan semua barang pricelist
  let filter = 'rak', search = '', rak = '', sort = 'rak', days = 30, laku = null, ganda = null;
  const SORTS = [['rak', 'Rak (A → Z)'], ['banyak', 'Stok terbanyak'], ['sedikit', 'Stok tersedikit'], ['fast', 'Paling laku (fast moving)'], ['slow', 'Jarang laku (slow moving)']];
  const { data: racks } = await supa.from('racks').select('code').order('code');
  box.innerHTML = `<div class="stack"><div class="grid gauto" id="kpi"></div>
    <section class="card stack s8 sf-box">
      <input class="input" id="q" placeholder="Cari nama / kode / rak, atau scan barcode" aria-label="Cari barang">
      <div class="sf-chips">${chips('f', [['rak', 'Ada di rak'], ['win', 'Barang WIN (belum di rak)'], ['ganda', 'Di beberapa rak'], ['low', 'Stok menipis'], ['zero', 'Habis'], ['all', 'Semua barang ›']], filter)}</div>
      <div class="sf-row" id="sfrow">
        <label class="sf-sel"><span>Rak</span><select class="input sm" id="fr"><option value="">Semua rak</option><option value="-">Tanpa rak</option>${(racks || []).map((r) => `<option>${esc(r.code)}</option>`).join('')}</select></label>
        <label class="sf-sel"><span>Urutkan</span><select class="input sm" id="so">${SORTS.map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select></label>
        <label class="sf-sel hidden" id="ddw"><span>Laku dalam</span><select class="input sm" id="dd"><option value="7">7 hari</option><option value="30" selected>30 hari</option><option value="90">90 hari</option></select></label>
      </div>
      <div class="row between xs muted" id="sfinfo"></div>
    </section>
    <div id="winbar"></div>
    <div class="card flush" id="list">${skeleton()}</div></div>`;
  const kpi = async () => {
    const data = await allProductsCached({ force: true, active: true }).catch(() => []);
    const low = (data || []).filter((p) => p.min_stock > 0 && p.stock <= p.min_stock).length;
    const val = (data || []).reduce((a, p) => a + (Math.max(0, p.stock) + (p.meja_qty || 0)) * p.harga_beli, 0);
    const win = (data || []).reduce((a, p) => a + (p.meja_qty || 0), 0);
    const inRack = (data || []).filter((p) => p.stock > 0);
    box.querySelector('#kpi').innerHTML = `<div class="card kpi"><div class="label">Barang ada di rak</div><div class="value">${num(inRack.length)}</div><div class="sub">${num(inRack.reduce((a, p) => a + p.stock, 0))} pcs · dari ${num(data?.length || 0)} jenis</div></div>
      <div class="card kpi" data-fwin style="cursor:pointer"><div class="label">Barang WIN belum di rak</div><div class="value">${num(win)}</div><div class="sub">pcs · siap dipakai admin</div></div>
      ${seeValue ? `<div class="card kpi"><div class="label">Nilai stok (modal)</div><div class="value">${rp(val)}</div></div>` : ''}
      <div class="card kpi" style="${low ? 'border:1.5px solid var(--accent)' : ''}"><div class="label">Stok menipis</div><div class="value">${low}</div></div>`;
  };
  const setChip = (v) => box.querySelectorAll('[data-chips="f"] .chip').forEach((c) => c.classList.toggle('on', c.dataset.v === v));
  const lakuTag = (p) => (sort === 'fast' || sort === 'slow') ? `<div><span class="tag ${laku[p.id] ? 'green' : ''}">laku ${num(laku[p.id] || 0)} / ${days} hr</span></div>` : '';

  // ---- barang yang ketemu di beberapa rak (hasil penataan ulang) ----
  const loadGanda = async () => {
    box.querySelector('#sfrow').classList.add('hidden'); box.querySelector('#winbar').innerHTML = '';
    try { ganda = await rpc('rak_ganda'); } catch (e) { box.querySelector('#list').innerHTML = `<div style="padding:16px" class="alert yellow small">Butuh update database. Jalankan <b>supabase/update-2.47.sql</b>.</div>`; return; }
    const q = search.toLowerCase(), nq = normSku(search);
    const list = ganda.filter((g) => !q || g.name.toLowerCase().includes(q) || normSku(g.sku).includes(nq) || g.racks.some((r) => r.rack.toLowerCase().includes(q)))
      .filter((g) => !rak || (rak === '-' ? !g.rack_code : g.racks.some((r) => r.rack === rak)));
    box.querySelector('#sfinfo').innerHTML = `<span>${num(list.length)} barang ketemu di lebih dari 1 rak${ganda[0] ? ` · dari penataan ulang ${ganda[0].status === 'aktif' ? 'yang sedang berjalan' : 'terakhir'}` : ''}</span>`;
    box.querySelector('#list').innerHTML = list.length ? `<div class="alert blue small" style="margin:12px 12px 0">Barang yang sama ditemukan di beberapa rak (salah taruh / lupa saat penataan). Pindahkan fisiknya ke 1 rak, lalu tekan <b>Satukan ke …</b> supaya lokasi di aplikasi juga 1 rak.</div>
      <div class="list">${list.map((g) => `<div class="list-item rg-item" style="align-items:flex-start;flex-wrap:wrap">
        <button class="grow rg-name" data-p="${g.product_id}" style="min-width:0;text-align:left;background:none;border:0;padding:0;color:inherit;font:inherit;cursor:pointer"><b>${esc(g.name)}</b><div class="xs muted mono">${esc(g.sku)}${copyBtn(g.sku)} · lokasi di aplikasi: <b>${esc(g.rack_code || '—')}</b> · stok ${num(g.stock)}</div></button>
        <div class="rg-racks">${g.racks.map((r) => `<div class="rg-rack ${r.rack === g.rack_code ? 'main' : ''}"><span class="mono"><b>${esc(r.rack)}</b></span><span>${num(r.qty)} pcs</span>
          ${canAdj ? `<button class="btn btn-sm ${r.qty === g.racks[0].qty ? 'btn-primary' : ''}" data-satu="${g.product_id}:${esc(r.rack)}">Satukan ke ${esc(r.rack)}</button>` : ''}</div>`).join('')}
          <div class="xs muted" style="text-align:right">total dihitung ${num(g.total)} pcs</div></div></div>`).join('')}</div>`
      : `<div style="padding:16px">${emptyState(ganda.length ? 'Tidak ada yang cocok dengan pencarian.' : 'Tidak ada barang yang tercecer di beberapa rak. 👍', 'check')}</div>`;
  };

  // ---- barang WIN belum di rak: pindahkan semua ke rak masing-masing ----
  const winBar = (list) => {
    const withRack = list.filter((p) => p.rack_code), none = list.length - withRack.length;
    box.querySelector('#winbar').innerHTML = list.length && canAdj ? `<div class="card stack s8 win-move">
      <div class="row between wrap"><div><b>Taruh barang WIN ke rak</b><div class="xs muted">Barang otomatis masuk ke rak masing-masing (rak di stok). Barang yang belum punya rak dipilih satu per satu.</div></div>
        ${withRack.length ? `<button class="btn btn-primary" id="mvall">${icon('box', 16)} Pindahkan ${num(withRack.length)} barang ke rak (${num(withRack.reduce((a, p) => a + p.meja_qty, 0))} pcs)</button>` : ''}</div>
      ${none ? `<div class="small"><span class="tag yellow">${num(none)} barang belum punya rak</span> <span class="xs muted">tekan <b>Pilih rak</b> di daftar bawah</span></div>` : ''}</div>` : '';
    box.querySelector('#mvall')?.addEventListener('click', async (e) => {
      if (!(await modal({ title: 'Pindahkan ke rak?', body: `<p style="margin:0">${num(withRack.length)} barang WIN ditaruh ke raknya masing-masing:</p><div class="list no-page" style="max-height:40vh;overflow:auto;margin-top:8px">${withRack.map((p) => `<div class="list-item" style="padding:6px 0"><span class="mono" style="width:60px;flex:none"><b>${esc(p.rack_code)}</b></span><span class="grow small">${esc(p.name)}</span><b>${num(p.meja_qty)}</b></div>`).join('')}</div>`,
        actions: [{ label: 'Batal', value: false }, { label: 'Ya, pindahkan', cls: 'btn-primary', value: true }] }))) return;
      e.target.disabled = true;
      try { const x = await rpc('meja_semua_ke_rak'); toast(`${x.barang} barang (${x.pcs} pcs) ditaruh di rak${x.tanpa_rak ? ` · ${x.tanpa_rak} belum punya rak` : ''}`, 'ok'); load(); kpi(); }
      catch (err) { toastErr(err); e.target.disabled = false; }
    });
  };

  const load = async () => {
    if (filter === 'ganda') return loadGanda();
    box.querySelector('#sfrow').classList.remove('hidden');
    box.querySelector('#ddw').classList.toggle('hidden', !(sort === 'fast' || sort === 'slow'));
    let data;
    try {
      [data] = await Promise.all([fetchAll(() => {
        let qy = supa.from('products').select('id, sku, name, rack_code, stock, meja_qty, stock_karantina, min_stock, harga_beli').eq('active', true).order('rack_code', { nullsFirst: false }).order('name').order('id');
        { const f = codeOr(search, ['rack_code']); if (f) qy = qy.or(f); } // kode dengan / tanpa strip sama
        if (rak === '-') qy = qy.is('rack_code', null); else if (rak) qy = qy.eq('rack_code', rak);
        if (filter === 'rak') qy = qy.gt('stock', 0);
        if (filter === 'win') qy = qy.gt('meja_qty', 0);
        if (filter === 'zero') qy = qy.lte('stock', 0);
        return qy;
      }), (sort === 'fast' || sort === 'slow') && !laku ? rpc('stok_laku', { p_days: days }).then((x) => { laku = x || {}; }).catch(() => { laku = {}; }) : null]);
    } catch (error) { return toastErr(error); }
    let list = filter === 'low' ? data.filter((p) => p.min_stock > 0 && p.stock <= p.min_stock) : data;
    const qty = (p) => (filter === 'win' ? p.meja_qty : p.stock);
    if (sort === 'banyak') list = list.slice().sort((a, b) => qty(b) - qty(a) || a.name.localeCompare(b.name));
    if (sort === 'sedikit') list = list.slice().sort((a, b) => qty(a) - qty(b) || a.name.localeCompare(b.name));
    if (sort === 'fast') list = list.slice().sort((a, b) => (laku[b.id] || 0) - (laku[a.id] || 0) || qty(b) - qty(a));
    if (sort === 'slow') list = list.slice().sort((a, b) => (laku[a.id] || 0) - (laku[b.id] || 0) || qty(b) - qty(a));
    box.querySelector('#sfinfo').innerHTML = `<span>${num(list.length)} barang · ${num(list.reduce((a, p) => a + Math.max(0, qty(p)), 0))} pcs${rak ? ` · rak ${rak === '-' ? 'kosong' : esc(rak)}` : ''}</span>${rak || sort !== 'rak' || search ? '<button class="btn btn-ghost btn-sm" data-reset style="padding:0 8px">Atur ulang filter</button>' : ''}`;
    if (filter === 'win') winBar(list); else box.querySelector('#winbar').innerHTML = '';
    box.querySelector('#list').innerHTML = list.length ? `<div class="list">${list.slice(0, 1500).map((p) => `<button class="list-item" data-p="${p.id}">
      <span class="mono" style="width:64px;flex:none;font-weight:600">${esc(p.rack_code || '—')}</span>
      <div class="grow"><b>${esc(p.name)}</b><div class="xs muted mono">${esc(p.sku)}${copyBtn(p.sku)}</div></div>
      <div class="right"><b style="font-size:18px" class="${p.stock <= 0 ? 'neg' : ''}">${p.stock}</b>${p.meja_qty > 0 ? `<div><span class="tag blue">+${p.meja_qty} WIN belum di rak</span></div>` : ''}${p.min_stock > 0 && p.stock <= p.min_stock ? '<div><span class="tag yellow">menipis</span></div>' : ''}${lakuTag(p)}
        ${filter === 'win' && canAdj ? `<div style="margin-top:4px"><span class="btn btn-sm ${p.rack_code ? '' : 'btn-primary'}" data-torack="${p.id}">${p.rack_code ? 'Rak lain' : 'Pilih rak'}</span></div>` : ''}</div></button>`).join('')}</div>${list.length > 1500 ? '<div class="xs muted" style="padding:8px 16px">Menampilkan 1.500 barang pertama. Persempit dengan pencarian / rak.</div>' : ''}`
      : filter === 'rak' ? `${emptyState(search || rak ? 'Tidak ada barang di rak dengan filter ini.' : 'Belum ada barang di rak.', 'box')}<div class="row" style="justify-content:center;padding:0 16px 16px"><button class="btn btn-sm" data-allp>Cari di Master barang</button></div>`
      : emptyState(filter === 'win' ? 'Semua barang WIN sudah di rak. 👍' : 'Tidak ada barang.', 'box');
  };
  box.querySelector('#q').addEventListener('input', debounce((e) => { search = e.target.value.trim().replace(/[,%()]/g, ''); load(); }, 300));
  box.querySelector('#q').addEventListener('keydown', async (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    // 2.58 kolom cari hanya MEMBUKA detail barang (tidak pernah mengubah stok). Enter kosong / Enter kedua dari alat scanner diabaikan.
    const code = e.target.value.trim();
    if (!code || document.querySelector('.overlay')) return;
    const id = await rpc('find_product', { p_code: code }).catch(() => null);
    if (id && !document.querySelector('.overlay')) { e.target.value = ''; search = ''; e.target.blur(); openProduct(id, load); }
  });
  box.querySelector('#fr').onchange = (e) => { rak = e.target.value; load(); };
  box.querySelector('#so').onchange = (e) => { sort = e.target.value; load(); };
  box.querySelector('#dd').onchange = (e) => { days = +e.target.value; laku = null; load(); };
  const toMaster = () => { location.hash = '#/barang' + (search ? '?q=' + encodeURIComponent(search) : ''); };
  on(box, 'click', '[data-chips="f"] .chip', (e, b) => { if (b.dataset.v === 'all') return toMaster(); filter = b.dataset.v; setChip(filter); load(); });
  on(box, 'click', '[data-fwin]', () => { filter = 'win'; setChip('win'); load(); });
  on(box, 'click', '[data-allp]', toMaster);
  on(box, 'click', '[data-reset]', () => { rak = ''; sort = 'rak'; search = ''; box.querySelector('#fr').value = ''; box.querySelector('#so').value = 'rak'; box.querySelector('#q').value = ''; load(); });
  on(box, 'click', '[data-torack]', async (e, b) => {
    e.stopPropagation(); e.preventDefault();
    const { data: p } = await supa.from('products').select('*').eq('id', +b.dataset.torack).single();
    const k = await pickRack({ title: 'Taruh di rak', product: p, qtyMax: p.meja_qty, okLabel: 'Taruh di rak', note: p.rack_code ? 'Pilih rak lain kalau barang ini mau dipindah. Lokasi barang ikut berubah.' : 'Barang ini belum punya rak. Pilih raknya.' });
    if (k) { try { const x = await rpc('meja_to_rack', { p_product: p.id, p_qty: k.qty, p_rack: k.rack }); toast(`${x.qty} pcs ditaruh di rak ${x.rack}`, 'ok'); load(); kpi(); } catch (err) { toastErr(err); } }
  });
  on(box, 'click', '[data-satu]', async (e, b) => {
    e.stopPropagation();
    const [pid, r] = [+b.dataset.satu.split(':')[0], b.dataset.satu.split(':').slice(1).join(':')];
    const g = ganda.find((x) => x.product_id === pid);
    if (!(await modal({ title: `Satukan ke rak ${r}?`, body: `<p style="margin:0">${esc(g.name)}: pindahkan dulu fisik barang dari ${g.racks.filter((x) => x.rack !== r).map((x) => `<b>${esc(x.rack)}</b> (${x.qty} pcs)`).join(', ')} ke rak <b>${esc(r)}</b>. Lokasi barang di aplikasi menjadi <b>${esc(r)}</b>.</p>`,
      actions: [{ label: 'Batal', value: false }, { label: 'Sudah, satukan', cls: 'btn-primary', value: true }] }))) return;
    try { const x = await rpc('rak_satukan', { p_product: pid, p_rack: r }); toast(`Disatukan di rak ${x.rack}`, 'ok'); loadGanda(); } catch (err) { toastErr(err); }
  });
  on(box, 'click', '[data-p]', (e, b) => { if (e.target.closest('[data-torack],.copy-btn,[data-copy]')) return; openProduct(+b.dataset.p, () => { load(); kpi(); }); });
  kpi(); load();
}

// 2.54 efek tiap baris ke stok total (rak + barang WIN belum di rak): pindah ke/dari meja = 0
function movCell(m) {
  if (m.type === 'to_meja') return `<td class="num xs muted nowrap">${Math.abs(m.qty)} belum di rak</td>`;
  if (m.type === 'meja_back') return `<td class="num xs muted nowrap">${Math.abs(m.qty)} → rak</td>`;
  const e = (m.qty || 0) + (m.qty_meja || 0);
  if (!e) return `<td class="num"><b>${m.qty_karantina ? 'K' + (m.qty_karantina > 0 ? '+' : '') + m.qty_karantina : '0'}</b></td>`;
  return `<td class="num ${e < 0 ? 'neg' : 'pos'}"><b>${e > 0 ? '+' : ''}${e}</b>${m.qty_meja ? '<div class="xs muted">barang WIN</div>' : ''}</td>`;
}

export async function openProduct(id, after) {
  const [{ data: p }, { data: mv }] = await Promise.all([
    supa.from('products').select('*').eq('id', id).single(),
    supa.from('stock_movements').select('*').eq('product_id', id).order('created_at', { ascending: false }).limit(60)
  ]);
  const canAdj = ['owner', 'kepala_gudang', 'supervisor'].includes(store.role);
  const r = await modal({
    title: p.name, wide: true,
    body: `<div class="stack">
      <div class="grid gauto"><div class="stat gray"><b>${p.stock}</b><span>stok di rak</span></div>${p.meja_qty > 0 ? `<div class="stat blue"><b>${p.meja_qty}</b><span>barang WIN belum di rak</span></div>` : ''}<div class="stat gray"><b class="mono">${esc(p.rack_code || '—')}</b><span>lokasi rak</span></div>
        ${p.stock_karantina ? `<div class="stat red"><b>${p.stock_karantina}</b><span>karantina (rusak)</span></div>` : ''}${['owner', 'admin'].includes(store.role) ? `<div class="stat gray"><b>${rp(p.harga_beli)}</b><span>harga beli</span></div>` : ''}</div>
      <div class="mono small muted">${esc(p.sku)}${copyBtn(p.sku)}</div>
      <h3 style="font-size:15px">Riwayat keluar-masuk</h3>
      <div class="xs muted" style="margin-top:-6px">Angka = perubahan <b>stok total</b> (rak + barang WIN belum di rak). Barang WIN dihitung sekali saat <b>Masuk dari WIN</b>; <b>Ditaruh di rak</b> hanya memindah, tidak menambah.</div>
      ${mv.length ? `<div class="table-wrap"><table class="tbl small"><tbody>${mv.map((m) => `<tr><td class="nowrap">${fmtDateTime(m.created_at)}</td><td>${esc(MOV[m.type] || m.type)}${m.note ? `<div class="xs muted">${esc(m.note)}</div>` : ''}</td><td>${esc(nameOf(m.user_id))}</td>
        ${movCell(m)}</tr>`).join('')}</tbody></table></div>` : '<div class="muted small">Belum ada pergerakan.</div>'}
    </div>`,
    actions: [
      { label: 'Cetak label', value: 'label' },
      ...(p.meja_qty > 0 && canAdj ? [{ label: 'Tambah ke rak', cls: 'btn-primary', value: 'torack' }] : [{ label: 'Pindah rak', value: 'rack' }]),
      ...(canAdj ? [{ label: p.stock === 0 && !mv.length ? 'Isi stok awal' : 'Sesuaikan stok', value: 'adj' }] : []),
      { label: 'Tutup', cls: p.meja_qty > 0 && canAdj ? '' : 'btn-primary', value: null }
    ]
  });
  if (r === 'label') printLabels([p]);
  if (r === 'rack') {
    const k = await pickRack({ title: 'Pindah rak', product: p, okLabel: 'Pindahkan' });
    if (k) { try { await rpc('move_rack', { p_product: id, p_rack: k.rack }); toast('Dipindah ke rak ' + k.rack, 'ok'); } catch (e) { toastErr(e); } }
  }
  if (r === 'torack') {
    const k = await pickRack({ title: 'Tambah ke rak', product: p, qtyMax: p.meja_qty, okLabel: 'Tambah ke rak', note: p.rack_code ? `Pilih rak lain kalau barang ini mau dipindah. Lokasi barang ikut berubah.` : '' });
    if (k) { try { const x = await rpc('meja_to_rack', { p_product: id, p_qty: k.qty, p_rack: k.rack }); toast(`${x.qty} pcs ditaruh di rak ${x.rack}`, 'ok'); } catch (e) { toastErr(e); } }
  }
  if (r === 'adj') {
    const initial = p.stock === 0 && !mv.length;
    // 2.49: keyboard angka di HP tidak punya tanda minus -> pilih Tambah / Kurangi + tombol − / +
    const res = await modal({ title: initial ? 'Isi stok awal' : 'Sesuaikan stok', body: `<div class="stack">
      ${initial ? '' : `<div class="adj-seg" role="group" aria-label="Tambah atau kurangi"><button type="button" class="seg-b on" data-sign="1">+ Tambah stok</button><button type="button" class="seg-b" data-sign="-1">− Kurangi stok</button></div>`}
      <div class="field"><span>${initial ? 'Jumlah stok sekarang' : 'Jumlah'}</span>
        <div class="adj-step"><button type="button" class="btn" data-st="-1" aria-label="Kurangi">−</button><input class="input num" id="aq" type="number" inputmode="numeric" min="0" value="${initial ? '' : 1}" placeholder="${initial ? 'mis. 12' : ''}"><button type="button" class="btn" data-st="1" aria-label="Tambah">+</button></div></div>
      <div class="small" id="aprev"></div>
      <label class="field">Alasan (wajib)<input class="input" id="ar" value="${initial ? 'Stok awal' : ''}" placeholder="mis. salah hitung"></label>
      ${initial ? '' : '<div class="alert yellow small">Untuk menghitung ulang seluruh rak, lebih baik pakai Stok opname. Perubahan manual di luar jam kerja dilaporkan ke owner.</div>'}</div>`,
      onOpen: (ov) => {
        let sign = 1;
        const q = ov.querySelector('#aq');
        const prev = () => { const n = Math.abs(parseInt(q.value, 10) || 0); ov.querySelector('#aprev').innerHTML = initial ? '' : n ? `Stok <b>${p.stock}</b> → <b class="${sign < 0 ? 'neg' : 'pos'}">${p.stock + sign * n}</b> (${sign < 0 ? '−' : '+'}${n})` : ''; };
        ov.querySelectorAll('[data-sign]').forEach((b) => b.onclick = () => { sign = +b.dataset.sign; ov.querySelectorAll('[data-sign]').forEach((x) => x.classList.toggle('on', x === b)); ov._sign = sign; prev(); });
        ov.querySelectorAll('[data-st]').forEach((b) => b.onclick = () => { q.value = Math.max(0, (parseInt(q.value, 10) || 0) + +b.dataset.st); prev(); });
        q.addEventListener('input', () => { q.value = q.value.replace(/[^0-9]/g, ''); prev(); });
        ov._sign = 1; prev();
      },
      actions: [{ label: 'Batal', value: null }, { label: 'Simpan', cls: 'btn-primary', onClick: async (ov) => {
        const n = Math.abs(parseInt(ov.querySelector('#aq').value, 10) || 0), reason = ov.querySelector('#ar').value.trim();
        const qv = initial ? n : (ov._sign || 1) * n;
        if (!qv || !reason) { toast('Isi jumlah dan alasan', 'err'); return false; }
        await rpc('adjust_stock', { p_product: id, p_qty: qv, p_reason: reason, p_initial: initial }); return true;
      } }] });
    if (res) toast('Stok disesuaikan', 'ok');
  }
  after && after();
}

// 2.37: Stok opname punya 2 cara — hitung ulang 1 rak (biasa) dan penataan ulang semua rak (pertama kali / tata ulang gudang)
async function tabOpname(box) {
  if (!['owner', 'kepala_gudang', 'supervisor'].includes(store.role)) { box.innerHTML = `<div class="card">${emptyState('Stok opname dilakukan oleh kepala gudang.', 'clip')}</div>`; return; }
  let st = { aktif: false };
  try { st = await rpc('penataan_status'); } catch (_) { /* update-2.37 belum dijalankan */ st = { aktif: false, off: true }; }
  let mode = st.aktif ? 'tata' : 'hitung';
  box.innerHTML = `<div class="stack">${st.off ? '' : chips('om', [['hitung', 'Hitung ulang rak'], ['tata', st.aktif ? 'Penataan ulang · berjalan' : 'Penataan ulang rak']], mode)}<div id="ombody"></div></div>`;
  const show = () => { const b = box.querySelector('#ombody'); mode === 'tata' ? tabPenataan(b) : opnameRak(b); };
  on(box, 'click', '[data-chips="om"] .chip', (e, b) => { mode = b.dataset.v; b.parentElement.querySelectorAll('.chip').forEach((c) => c.classList.toggle('on', c === b)); show(); });
  show();
}

async function opnameRak(box) {
  const { data: racks } = await supa.from('racks').select('code').order('code');
  box.innerHTML = `<div class="stack"><div class="card stack">
      <div class="alert blue small">Hitung barang fisik di satu rak, isi jumlahnya, lalu simpan. Stok sistem sengaja tidak ditampilkan supaya hitungan jujur. Selisih kurang langsung dilaporkan ke owner beserta siapa yang terakhir memegang barang itu.</div>
      <label class="field">Pilih rak<select class="input" id="rk"><option value="">— pilih rak —</option>${(racks || []).map((r) => `<option>${esc(r.code)}</option>`).join('')}</select></label></div>
    <div id="op"></div></div>`;
  box.querySelector('#rk').addEventListener('change', async (e) => {
    const rack = e.target.value; const op = box.querySelector('#op');
    if (!rack) { op.innerHTML = ''; return; }
    const { data } = await supa.from('products').select('id, sku, name').eq('rack_code', rack).eq('active', true).order('name');
    if (!data.length) { op.innerHTML = `<div class="card">${emptyState('Belum ada barang di rak ini.', 'box')}</div>`; return; }
    op.innerHTML = `<div class="card stack">${scanBox('osb', 'Scan barang untuk menambah hitungan +1')}
      <div class="list">${data.map((p) => `<div class="list-item" style="padding:10px 0"><div class="grow"><b>${esc(p.name)}</b><div class="xs muted mono">${esc(p.sku)}</div></div>
        <input class="input num" style="width:90px" inputmode="numeric" data-count="${p.id}" data-sku="${esc(p.sku)}" placeholder="0" aria-label="Jumlah fisik ${esc(p.name)}"></div>`).join('')}</div>
      <button class="btn btn-primary btn-lg" id="save">Simpan stok opname rak ${esc(rack)}</button></div>`;
    bindScan(op, 'osb', (code) => {
      const inp = [...op.querySelectorAll('[data-sku]')].find((i) => skuMatch(code, i.dataset.sku));
      if (!inp) { beep(false); return { ok: false, title: 'Bukan barang rak ' + rack, info: 'Barang ini tidak terdaftar di rak ini' }; }
      inp.value = (parseInt(inp.value, 10) || 0) + 1; beep(true); return { ok: true, title: inp.closest('.list-item')?.querySelector('b')?.textContent || 'Barang', info: 'Hitungan sekarang: ' + inp.value };
    });
    op.querySelector('#save').onclick = async (ev) => {
      const items = [...op.querySelectorAll('[data-count]')].filter((i) => i.value !== '').map((i) => ({ product_id: +i.dataset.count, counted: parseInt(i.value, 10) || 0 }));
      if (!items.length) return toast('Isi minimal satu jumlah', 'err');
      ev.target.disabled = true;
      try {
        const r = await rpc('opname_submit', { p: { rack_code: rack, items } });
        toast(`Tersimpan. ${r.kurang} barang kurang${r.kurang ? ' (' + rp(r.nilai_hilang) + ')' : ''}, ${r.lebih} lebih.`, r.kurang ? 'err' : 'ok');
        box.querySelector('#rk').value = ''; op.innerHTML = ''; toTop();
      } catch (e) { toastErr(e); ev.target.disabled = false; }
    };
  });
}

async function tabRak(box) {
  const [{ data: racks }, { data: prods }] = await Promise.all([supa.from('racks').select('*').order('code'), fetchAll(() => supa.from('products').select('rack_code, stock').eq('active', true).order('id')).then((data) => ({ data })).catch(() => ({ data: [] }))]);
  const cnt = {}; (prods || []).forEach((p) => { if (p.rack_code) { cnt[p.rack_code] ||= [0, 0]; cnt[p.rack_code][0]++; cnt[p.rack_code][1] += p.stock; } });
  const canEdit = ['owner', 'admin', 'kepala_gudang', 'supervisor'].includes(store.role);
  box.innerHTML = `<div class="stack">
    ${canEdit ? `<form class="card stack s8" id="addf" autocomplete="off"><label class="small" for="nr" style="font-weight:600">Tambah rak baru</label><div class="row" style="flex-wrap:nowrap"><input class="input grow mono" id="nr" placeholder="Kode rak, mis. A-01" autocapitalize="characters" enterkeyhint="done" style="text-transform:uppercase"><button class="btn btn-primary" id="add" type="submit" style="flex:none">${icon('plus', 18)}<span>Tambah</span></button></div><button class="btn" id="prt" type="button">${icon('print', 18)} Cetak label semua rak</button></form>` : ''}
    <div class="card flush">${racks?.length ? `<div class="list">${racks.map((r) => `<div class="list-item" data-rack="${esc(r.code)}"><b class="mono" style="min-width:58px">${esc(r.code)}</b><div class="grow"><div class="small">${cnt[r.code]?.[0] || 0} jenis · ${cnt[r.code]?.[1] || 0} pcs</div>${r.note ? `<div class="xs muted">${esc(r.note)}</div>` : ''}</div><button class="btn btn-sm" data-rq="${esc(r.code)}" aria-label="Cetak label barang di rak ${esc(r.code)}">${icon('print', 16)}<span>Label</span></button></div>`).join('')}</div>` : emptyState('Belum ada rak. Tambahkan kode rak dulu.', 'box')}</div></div>`;
  box.querySelector('#addf')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const inp = box.querySelector('#nr'), btn = box.querySelector('#add');
    const code = inp.value.trim().toUpperCase().replace(/\s+/g, '-');
    if (!code) { toast('Ketik kode rak dulu, mis. A-01', 'err'); inp.focus(); return; }
    if ((racks || []).some((r) => r.code.toUpperCase() === code)) { toast('Rak ' + code + ' sudah ada', 'err'); return; }
    btn.disabled = true; btn.innerHTML = 'Menyimpan…';
    try {
      const { error } = await supa.from('racks').insert({ code });
      if (error) throw error;
      toast('Rak ' + code + ' ditambahkan', 'ok');
      await tabRak(box);
      box.querySelector(`[data-rack="${CSS.escape(code)}"]`)?.classList.add('hl-new');
    } catch (err) { toastErr(err); btn.disabled = false; btn.innerHTML = `${icon('plus', 18)}<span>Tambah</span>`; }
  });
  box.querySelector('#prt')?.addEventListener('click', () => printLabels((racks || []).map((r) => ({ sku: r.code, name: 'RAK ' + r.code, note: r.note })), 'rak'));
  on(box, 'click', '[data-rq]', async (e, b) => {
    e.preventDefault();
    if (b.disabled) return; b.disabled = true; setTimeout(() => { b.disabled = false; }, 1200);
    const { data } = await supa.from('products').select('sku, name, rack_code, stock').eq('rack_code', b.dataset.rq).eq('active', true).order('name');
    printLabels(data || []);
  });
}

// 2.49 Karantina: barang retur rusak & barang jelek.
//   Menunggu dicek -> Bagus (kembali ke rak, rugi berkurang) / Jelek (tunggu tukar ke WIN)
//   Barang jelek -> Tukar WIN (pengganti datang, masuk rak, rugi berkurang)
//   Barang jelek ketahuan di rak -> scan -> masuk barang jelek
async function tabKarantina(box) {
  const canAdj = ['owner', 'kepala_gudang', 'supervisor'].includes(store.role);
  const seeValue = ['owner', 'admin'].includes(store.role);
  const COLS = 'id, sku, name, rack_code, stock, stock_karantina, stock_jelek, harga_beli';
  box.innerHTML = `<div class="stack">
    <div class="alert blue small">Karantina = barang retur rusak & barang jelek. Cek satu per satu: <b>Bagus</b> → kembali ke rak, <b>Jelek</b> → tunggu ditukar WIN. Saat barang pengganti dari WIN datang, tekan <b>Tukar WIN</b>: barang masuk rak dan rugi berkurang.</div>
    ${canAdj ? `<section class="card stack"><h2 class="sec-title" style="margin:0">Scan barang</h2>${scanBox('skr', 'Scan barang karantina / barang jelek')}
      <div class="row wrap"><button class="btn btn-sm" id="kjelek">${icon('plus', 16)} Barang jelek dari rak</button></div></section>` : ''}
    <section class="card flush" id="kwait"></section>
    <section class="card flush" id="kjel"></section></div>`;
  const val = (n, p) => (seeValue ? `<div class="xs muted">${rp(n * p.harga_beli)}</div>` : '');
  const load = async () => {
    const { data, error } = await supa.from('products').select(COLS).or('stock_karantina.gt.0,stock_jelek.gt.0').order('name');
    if (error) { box.querySelector('#kwait').innerHTML = `<div style="padding:16px" class="alert yellow small">Butuh update database. Jalankan <b>supabase/update-2.49.sql</b>. (${esc(error.message)})</div>`; return; }
    const wait = data.filter((p) => p.stock_karantina > 0), jel = data.filter((p) => p.stock_jelek > 0);
    const sum = (l, f) => l.reduce((a, p) => a + p[f], 0);
    box.querySelector('#kwait').innerHTML = `<div class="card-h"><h2>Menunggu dicek</h2><span class="small muted">${num(sum(wait, 'stock_karantina'))} pcs${seeValue ? ' · ' + rp(wait.reduce((a, p) => a + p.stock_karantina * p.harga_beli, 0)) : ''}</span></div>
      ${wait.length ? `<div class="list">${wait.map((p) => `<div class="list-item kr-row"><div class="grow" style="min-width:0"><b>${esc(p.name)}</b><div class="xs muted mono">${esc(p.sku)}${copyBtn(p.sku)} · rak ${esc(p.rack_code || '–')}</div></div>
        <div class="right"><b style="font-size:18px">${p.stock_karantina}</b>${val(p.stock_karantina, p)}</div>
        ${canAdj ? `<div class="kr-act"><button class="btn btn-sm kr-ok" data-kact="bagus:${p.id}">Bagus</button><button class="btn btn-sm kr-bad" data-kact="jelek:${p.id}">Jelek</button></div>` : ''}</div>`).join('')}</div>`
        : `<div style="padding:16px">${emptyState('Tidak ada barang yang menunggu dicek.', 'check')}</div>`}`;
    box.querySelector('#kjel').innerHTML = `<div class="card-h"><h2>Barang jelek · tunggu tukar WIN</h2><span class="small muted">${num(sum(jel, 'stock_jelek'))} pcs${seeValue ? ' · ' + rp(jel.reduce((a, p) => a + p.stock_jelek * p.harga_beli, 0)) : ''}</span></div>
      ${jel.length ? `<div class="list">${jel.map((p) => `<div class="list-item kr-row"><div class="grow" style="min-width:0"><b>${esc(p.name)}</b><div class="xs muted mono">${esc(p.sku)}${copyBtn(p.sku)} · rak ${esc(p.rack_code || '–')}</div></div>
        <div class="right"><b style="font-size:18px">${p.stock_jelek}</b>${val(p.stock_jelek, p)}</div>
        ${canAdj ? `<div class="kr-act"><button class="btn btn-sm btn-primary" data-kact="tukar:${p.id}">Tukar WIN</button></div>` : ''}</div>`).join('')}</div>`
        : `<div style="padding:16px">${emptyState('Tidak ada barang jelek.', 'check')}</div>`}`;
    box._list = data;
  };
  const ACT = {
    bagus: ['Bagus → kembali ke rak', 'stock_karantina', 'kr-ok'],
    jelek: ['Jelek → tunggu tukar WIN', 'stock_karantina', 'kr-bad'],
    tukar: ['Tukar WIN → pengganti masuk rak', 'stock_jelek', 'btn-primary'],
    rusak: ['Barang jelek dari rak', 'stock', 'kr-bad']
  };
  // pilih jumlah & aksi untuk 1 barang
  const act = async (p, only) => {
    const acts = only ? [only] : Object.keys(ACT).filter((k) => p[ACT[k][1]] > 0);
    if (!acts.length) { toast(`${p.name}: tidak ada di karantina & stok rak 0`, 'err'); return; }
    const r = await modal({ title: p.name, body: `<div class="stack">
        <div class="xs muted mono">${esc(p.sku)} · rak ${esc(p.rack_code || '–')} · stok rak ${p.stock} · karantina ${p.stock_karantina} · jelek ${p.stock_jelek}</div>
        <div class="field"><span>Jumlah</span><div class="adj-step"><button type="button" class="btn" data-st="-1">−</button><input class="input num" id="kq" type="number" inputmode="numeric" min="1" value="1"><button type="button" class="btn" data-st="1">+</button></div></div>
        ${acts.includes('rusak') ? '<label class="field">Catatan (opsional)<input class="input" id="kn" placeholder="mis. retak, baret"></label>' : ''}</div>`,
      onOpen: (ov) => { const q = ov.querySelector('#kq'); ov.querySelectorAll('[data-st]').forEach((b) => b.onclick = () => { q.value = Math.max(1, (parseInt(q.value, 10) || 1) + +b.dataset.st); }); },
      actions: [{ label: 'Batal', value: null }, ...acts.map((k) => ({ label: ACT[k][0], cls: ACT[k][2], onClick: (ov) => {
        const n = parseInt(ov.querySelector('#kq').value, 10) || 0;
        if (n < 1) { toast('Isi jumlah', 'err'); return false; }
        if (n > p[ACT[k][1]]) { toast(`Maksimal ${p[ACT[k][1]]}`, 'err'); return false; }
        return { k, n, note: ov.querySelector('#kn')?.value || null };
      } }))] });
    if (!r) return;
    try {
      if (r.k === 'bagus' || r.k === 'jelek') await rpc('karantina_putus', { p_product: p.id, p_qty: r.n, p_hasil: r.k });
      if (r.k === 'tukar') await rpc('tukar_win', { p_product: p.id, p_qty: r.n });
      if (r.k === 'rusak') await rpc('rusak_masuk', { p_product: p.id, p_qty: r.n, p_note: r.note });
      toast({ bagus: `${r.n} pcs kembali ke rak ${p.rack_code || ''}`, jelek: `${r.n} pcs masuk barang jelek`, tukar: `${r.n} pcs pengganti WIN masuk rak ${p.rack_code || ''}`, rusak: `${r.n} pcs masuk barang jelek` }[r.k], 'ok');
      load();
    } catch (e) { toastErr(e); }
  };
  const byId = async (id) => (await supa.from('products').select(COLS).eq('id', id).single()).data;
  on(box, 'click', '[data-kact]', async (e, b) => { const [k, id] = b.dataset.kact.split(':'); const p = await byId(+id); if (p) act(p, k); });
  box.querySelector('#kjelek')?.addEventListener('click', async () => {
    const { pickProduct } = await import('../daftar-file.js');
    const x = await pickProduct('Barang jelek dari rak', ''); if (!x) return;
    const p = await byId(x.id); if (p) act(p, 'rusak');
  });
  if (canAdj) bindScan(box, 'skr', async (code) => {
    const id = await rpc('find_product', { p_code: code }).catch(() => null);
    if (!id) { beep(false); return { ok: false, unknown: true, title: 'Kode barang tidak dikenal', info: code }; }
    const p = await byId(id); beep(true);
    act(p, p.stock_karantina > 0 || p.stock_jelek > 0 ? null : 'rusak');
    return { ok: true, title: p.name, info: `karantina ${p.stock_karantina} · jelek ${p.stock_jelek} · rak ${p.stock}` };
  });
  load();
}

export async function printLabels(items, kind = 'barang') {
  const { openLabelDialog } = await import('../labels.js');
  return openLabelDialog(items, kind);
}

// ---------- 2.37 penataan ulang rak ----------
const draftKey = (id, rack) => `penataan:${id}:${rack}`;
const draftGet = (k) => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (_) { return null; } };
const draftSet = (k, v) => { try { v ? localStorage.setItem(k, JSON.stringify(v)) : localStorage.removeItem(k); } catch (_) {} };

async function tabPenataan(box) {
  box.innerHTML = skeleton(3);
  const st = await rpc('penataan_status').catch((e) => { toastErr(e); return null; });
  if (!st) return;
  if (!st.aktif) {
    box.innerHTML = `<div class="card stack"><h2 class="sec-title" style="margin:0">Penataan ulang rak</h2>
      <div class="small">Untuk stok opname pertama atau saat gudang ditata ulang. Barang boleh dipindah ke rak mana saja.</div>
      <ol class="small steps-ol"><li>Pastikan semua rak sudah terdaftar di <b>Rak & label</b> (dan labelnya ditempel).</li>
        <li>Pilih rak, lalu <b>scan setiap barang</b> yang ditaruh di rak itu (1 scan = 1 pcs). Simpan per rak.</li>
        <li>Barang otomatis pindah ke rak itu dan stoknya mengikuti hitungan. Selisih tidak dicatat sebagai barang hilang.</li>
        <li>Setelah semua rak selesai, tekan <b>Selesai penataan</b>.</li></ol>
      <div class="alert yellow small">Sebelum mulai, taruh dulu barang WIN yang belum di rak lewat <b>Tambah ke rak</b>, supaya tidak terhitung dua kali.</div>
      <button class="btn btn-primary btn-lg" id="pmulai">Mulai penataan ulang</button></div>`;
    box.querySelector('#pmulai').onclick = async (e) => { e.target.disabled = true; try { await rpc('penataan_mulai'); tabPenataan(box); } catch (err) { toastErr(err); e.target.disabled = false; } };
    return;
  }
  box.innerHTML = `<div class="stack">
    <div class="hero"><div class="label">Penataan ulang berjalan</div><div class="big">${num(st.pcs)} <span style="font-size:18px;opacity:.75">pcs</span></div>
      <div class="small" style="color:#C9CCC8">${st.racks.length} rak · ${num(st.jenis)} jenis barang · dimulai ${fmtDateTime(st.started_at)}${st.started_by ? ' oleh ' + esc(st.started_by) : ''}</div></div>
      ${(Date.now() - new Date(st.started_at)) / 864e5 >= 2 ? `<div class="alert yellow small" style="margin-top:8px">Penataan ini sudah berjalan <b>${Math.floor((Date.now() - new Date(st.started_at)) / 864e5)} hari</b>. Kalau semua rak sudah dihitung, tekan <b>Selesai penataan</b>. Selama belum selesai, menyimpan ulang rak akan mengubah stok barang di rak itu.</div>` : ''}
    <button class="btn btn-primary btn-lg" id="prak">${icon('scan', 20)} Pilih rak & mulai scan</button>
    <div class="card flush"><div class="card-h"><h2>Rak yang sudah ditata</h2></div>${st.racks.length ? `<div class="list no-page">${st.racks.map((r) => `<button class="list-item" data-prak="${esc(r.rack)}"><b class="mono" style="min-width:58px">${esc(r.rack)}</b><span class="grow small">${num(r.jenis)} jenis · ${num(r.pcs)} pcs<div class="xs muted">${fmtDateTime(r.at)}</div></span><span class="btn btn-sm">Ubah</span></button>`).join('')}</div>` : emptyState('Belum ada rak yang ditata.', 'box')}</div>
    <div class="card stack"><div class="row between wrap"><span><b>Belum di-scan di rak mana pun</b><div class="small muted">${num(st.belum_jenis)} jenis · ${num(st.belum_pcs)} pcs menurut stok sistem</div></span>${st.belum_jenis ? '<button class="btn btn-sm btn-see" id="pbelum">Lihat</button>' : ''}</div><div id="pbelumlist"></div></div>
    <button class="btn btn-lg" id="pselesai">${icon('check', 18)} Selesai penataan</button></div>`;
  const openRack = (rack) => rackScan(box, st, rack);
  box.querySelector('#prak').onclick = async () => { const k = await pickRack({ title: 'Pilih rak yang akan ditata', okLabel: 'Mulai scan' }); if (k) openRack(k.rack); };
  on(box, 'click', '[data-prak]', (e, b) => openRack(b.dataset.prak));
  box.querySelector('#pbelum')?.addEventListener('click', async (e) => {
    e.target.disabled = true;
    const list = await rpc('penataan_belum', { p_limit: 300 }).catch(() => []);
    box.querySelector('#pbelumlist').innerHTML = `<div class="list no-page">${list.map((p) => `<div class="list-item" style="padding:8px 0"><span class="mono small" style="min-width:52px">${esc(p.rack_code || '–')}</span><div class="grow" style="min-width:0"><span class="small">${esc(p.name)}</span><div class="xs muted mono">${esc(p.sku)}${copyBtn(p.sku)}</div></div><b>${p.stock}</b></div>`).join('')}</div>${list.length >= 300 ? '<div class="xs muted">Menampilkan 300 barang pertama.</div>' : ''}`;
  });
  box.querySelector('#pselesai').onclick = async () => {
    const r = await modal({ title: 'Selesai penataan?', body: `<p style="margin-top:0">${st.racks.length} rak sudah ditata (${num(st.pcs)} pcs).</p>
      ${st.belum_jenis ? `<div class="alert yellow small"><b>${num(st.belum_jenis)} jenis barang (${num(st.belum_pcs)} pcs)</b> punya stok di sistem tapi tidak di-scan di rak mana pun. Kalau semua rak sudah selesai, barang itu memang tidak ada → pilih <b>Jadikan stok 0</b>.</div>` : '<div class="small muted">Semua barang yang punya stok sudah di-scan.</div>'}`,
      actions: [{ label: 'Batal', value: null }, ...(st.belum_jenis ? [{ label: 'Biarkan stoknya', value: 'keep' }, { label: 'Jadikan stok 0', cls: 'btn-primary', value: 'zero' }] : [{ label: 'Selesai', cls: 'btn-primary', value: 'keep' }])] });
    if (!r) return;
    try { const x = await rpc('penataan_selesai', { p_nolkan: r === 'zero' }); toast(`Penataan selesai: ${x.rak} rak, ${x.pcs} pcs${x.dinolkan ? `, ${x.dinolkan} barang dijadikan 0` : ''}`, 'ok'); await tabPenataan(box); toTop(); } catch (err) { toastErr(err); }
  };
}

async function rackScan(box, st, rack) {
  const key = draftKey(st.id, rack);
  let rows = draftGet(key);
  if (!rows) {
    const { data } = await supa.from('penataan_items').select('qty, products(id, sku, name)').eq('penataan_id', st.id).eq('rack_code', rack);
    rows = (data || []).map((r) => ({ id: r.products.id, sku: r.products.sku, name: r.products.name, qty: r.qty }));
  }
  const products = await allProductsCached({ active: true }).catch(() => []);
  box.innerHTML = `<div class="stack">
    <div class="row between wrap"><button class="btn btn-ghost btn-sm" id="pback">${icon('back', 16)} Kembali</button><span class="row"><span class="small muted">Rak</span><b class="mono" style="font-size:22px">${esc(rack)}</b></span></div>
    <div class="card stack">${scanBox('psb', 'Scan setiap barang yang ditaruh di rak ' + rack)}<div id="plast" aria-live="polite"></div>
      <input class="input" id="pq" placeholder="atau cari nama / kode barang" autocomplete="off"></div>
    <div class="card flush" id="prows"></div>
    <button class="btn btn-primary btn-lg" id="psave">Simpan rak ${esc(rack)}</button></div>`;
  const save = () => draftSet(key, rows);
  const paint = () => {
    const t = rows.reduce((a, r) => a + r.qty, 0);
    box.querySelector('#prows').innerHTML = `<div class="card-h"><h2>Isi rak ${esc(rack)}</h2><span class="small"><b>${t}</b> pcs · ${rows.length} jenis</span></div>${rows.length ? `<div class="list no-page">${rows.map((r, i) => `<div class="list-item" style="padding:8px 14px"><div class="grow" style="min-width:0"><b class="small">${esc(r.name)}</b><div class="xs muted mono">${esc(r.sku)}</div></div>
      <button class="btn btn-ghost btn-sm" data-pm="${i}" aria-label="Kurangi 1">−</button><input class="input sm num" style="width:64px" inputmode="numeric" data-pqty="${i}" value="${r.qty}" aria-label="Jumlah ${esc(r.name)}"><button class="btn btn-ghost btn-sm" data-pp="${i}" aria-label="Tambah 1">+</button></div>`).join('')}</div>` : `<div style="padding:14px">${emptyState('Belum ada barang. Scan barang pertama.', 'box')}</div>`}`;
  };
  const add = (p, n = 1) => {
    const i = rows.findIndex((r) => r.id === p.id);
    if (i >= 0) { rows[i].qty += n; const [x] = rows.splice(i, 1); rows.unshift(x); } else rows.unshift({ id: p.id, sku: p.sku, name: p.name, qty: n });
    save(); paint(); return rows[0];
  };
  paint();
  bindScan(box, 'psb', (code) => {
    const p = products.find((x) => skuMatch(code, x.sku));
    const last = box.querySelector('#plast');
    if (!p) { beep(false); last.innerHTML = `<div class="alert red small">Kode ${esc(code)} tidak ada di master barang.</div>`; return { ok: false, title: 'Kode tidak dikenal', info: code }; }
    const r = add(p); beep(true);
    last.innerHTML = `<div class="alert green small"><b>${esc(p.name)}</b> × ${r.qty}${p.rack_code && p.rack_code !== rack ? ` · pindah dari rak ${esc(p.rack_code)}` : ''}</div>`;
    return { ok: true, title: p.name, info: `× ${r.qty} di rak ${rack}` };
  });
  bindProductSearch(box.querySelector('#pq'), (p) => add(p));
  on(box, 'click', '[data-pp]', (e, b) => { rows[+b.dataset.pp].qty++; save(); paint(); });
  on(box, 'click', '[data-pm]', (e, b) => { const i = +b.dataset.pm; rows[i].qty--; if (rows[i].qty <= 0) rows.splice(i, 1); save(); paint(); });
  on(box, 'change', '[data-pqty]', (e) => { const i = +e.target.dataset.pqty; rows[i].qty = Math.max(0, parseInt(e.target.value, 10) || 0); if (!rows[i].qty) rows.splice(i, 1); save(); paint(); });
  box.querySelector('#pback').onclick = () => tabPenataan(box);
  box.querySelector('#psave').onclick = async (e) => {
    e.target.disabled = true;
    try {
      const r = await rpc('penataan_rak', { p: { rack, items: rows.map((x) => ({ product_id: x.id, qty: x.qty })) } });
      draftSet(key, null);
      toast(`Rak ${r.rack} tersimpan: ${r.jenis} jenis, ${r.pcs} pcs`, 'ok');
      if (r.dobel?.length) await modal({ title: 'Barang ada di beberapa rak', body: `<p style="margin-top:0" class="small">Stoknya dijumlah, lokasinya dicatat di rak dengan jumlah terbanyak. Sebaiknya satukan di satu rak.</p><div class="list no-page">${r.dobel.map((d) => `<div class="list-item" style="padding:6px 0"><span class="grow small">${esc(d.name)}</span><span class="mono xs">${esc(d.racks)}</span></div>`).join('')}</div>`, actions: [{ label: 'Oke', cls: 'btn-primary', value: true }] });
      import('../products-cache.js').then((m) => m.touchProducts());
      await tabPenataan(box); toTop();
    } catch (err) { toastErr(err); e.target.disabled = false; }
  };
}

// 2.58 sesudah Simpan / Selesai di Stok opname: kembali ke atas halaman (tidak tertinggal di bawah)
function toTop() { requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })); }
