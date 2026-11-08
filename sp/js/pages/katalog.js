import { supa, rpc } from '../supa.js';
import { esc, rp, num, on, toast, toastErr, pageHead, skeleton, icon, parseNum, debounce, confirmBox } from '../ui.js';

// Katalog / harga grosir: dibagikan lewat link (tanpa login) atau dicetak jadi PDF.
const BASIS = { beli: 'Harga beli + persen', shopee: 'Harga Shopee − persen', macallan: 'Macallan − persen' };
export const catalogLink = (token) => location.origin + location.pathname.replace(/[^/]*$/, '') + 'katalog.html?t=' + token;

export default {
  tour: [
    { sel: '#cfg', title: 'Aturan harga', body: 'Harga grosir dihitung otomatis dari harga beli / Shopee / Macallan, lalu dibulatkan ke atas.' },
    { sel: '#share', title: 'Bagikan', body: 'Salin link atau kirim lewat WhatsApp. Pembeli bisa membuka katalog tanpa login. Ganti link kalau ingin link lama tidak bisa dipakai lagi.' },
    { sel: '#pv', title: 'Pratinjau', body: 'Daftar harga seperti yang dilihat pembeli. Tekan Cetak / PDF untuk membuat file PDF.' }
  ],
  async render(el) {
    el.innerHTML = `${pageHead('Katalog grosir', 'Daftar harga untuk bengkel / reseller. Harga mengikuti harga barang terbaru secara otomatis.', `<button class="btn btn-primary" id="pdf">${icon('print', 18)} Cetak / PDF</button>`)}<div class="stack" id="b">${skeleton(3)}</div>`;
    const [{ data: c, error }, { data: cats }, { data: sups }] = await Promise.all([
      supa.from('catalog_config').select('*').eq('id', 1).maybeSingle(),
      supa.from('products').select('category').not('category', 'is', null).eq('active', true).limit(5000),
      supa.from('suppliers').select('code').order('code')]);
    if (error || !c) { el.querySelector('#b').innerHTML = `<div class="alert yellow">Jalankan <b>supabase/update-2.13.sql</b> dulu. ${esc(error?.message || '')}</div>`; return; }
    const catList = [...new Set((cats || []).map((x) => x.category))].sort();
    const link = () => catalogLink(c.token);
    el.querySelector('#b').innerHTML = `
      <section class="card stack" id="share"><div class="row between wrap"><h2 class="sec-title">${icon('send', 18)} Link katalog</h2><label class="check"><input type="checkbox" id="k-on" ${c.enabled ? 'checked' : ''}> <b>Katalog bisa dibuka lewat link</b></label></div>
        <div class="row"><input class="input grow mono" id="k-link" readonly value="${esc(link())}"><button class="btn" id="cp">Salin</button></div>
        <div class="row wrap"><a class="btn btn-sm" id="open" href="${esc(link())}" target="_blank" rel="noopener">${icon('eye', 16)} Buka</a><a class="btn btn-sm" id="wa" target="_blank" rel="noopener">Kirim lewat WhatsApp</a><button class="btn btn-sm btn-ghost" id="nt">${icon('refresh', 15)} Ganti link</button></div></section>
      <section class="card stack" id="cfg"><h2 class="sec-title">${icon('tag', 18)} Aturan harga & tampilan</h2>
        <div class="grid g2"><label class="field" style="grid-column:1/-1">Judul katalog<input class="input" id="k-t" value="${esc(c.title)}"></label>
          <label class="field" style="grid-column:1/-1">Keterangan (opsional)<textarea class="input" id="k-i" rows="2" placeholder="mis. Harga khusus bengkel. Pengiriman setiap hari jam 15.00.">${esc(c.intro || '')}</textarea></label>
          <label class="field">Harga grosir dari<select class="input" id="k-b">${Object.entries(BASIS).map(([k, l]) => `<option value="${k}" ${c.basis === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
          <label class="field">Persen<input class="input num" id="k-p" inputmode="decimal" value="${num(c.pct)}"></label>
          <label class="field">Bulatkan ke atas kelipatan<select class="input" id="k-r">${[1, 100, 500, 1000, 5000].map((v) => `<option value="${v}" ${+c.round_to === v ? 'selected' : ''}>${v === 1 ? 'Tidak dibulatkan' : rp(v)}</option>`).join('')}</select></label>
          <label class="field">Nomor WhatsApp pemesanan<input class="input" id="k-w" inputmode="tel" value="${esc(c.wa || '')}" placeholder="08xxxx"></label>
          <label class="field">Harga bertingkat: beli minimal (pcs)<input class="input num" id="k-tq" inputmode="numeric" value="${c.tier_qty}"></label>
          <label class="field">Potongan tambahan (%)<input class="input num" id="k-tp" inputmode="decimal" value="${num(c.tier_pct)}"></label>
          <label class="field" style="grid-column:1/-1">Syarat pemesanan (opsional)<input class="input" id="k-m" value="${esc(c.min_order || '')}" placeholder="mis. Minimal belanja Rp500.000"></label></div>
        <div class="row wrap"><label class="check"><input type="checkbox" id="k-ready" ${c.only_ready ? 'checked' : ''}> Hanya barang yang ada stok</label><label class="check"><input type="checkbox" id="k-st" ${c.show_stock ? 'checked' : ''}> Tampilkan keterangan stok (Ready / Sisa / Inden)</label></div>
        ${(sups || []).length > 1 ? `<div><div class="small muted" style="margin-bottom:4px">Supplier (kosong = semua)</div><div class="chips" id="k-sup">${sups.map((s) => `<button class="chip ${(c.suppliers || []).includes(s.code) ? 'on' : ''}" data-v="${esc(s.code)}">${esc(s.code)}</button>`).join('')}</div></div>` : ''}
        ${catList.length ? `<div><div class="small muted" style="margin-bottom:4px">Kategori (kosong = semua)</div><div class="chips" id="k-cat">${catList.map((x) => `<button class="chip ${(c.categories || []).includes(x) ? 'on' : ''}" data-v="${esc(x)}">${esc(x)}</button>`).join('')}</div></div>` : ''}
        <div><button class="btn btn-primary" id="sv">Simpan & perbarui pratinjau</button></div></section>
      <section class="card flush" id="pv"><div class="card-h"><h2>Pratinjau</h2><b id="pvn"></b></div><input class="input" id="pq" placeholder="Cari di pratinjau…" style="margin:0 16px 10px;width:calc(100% - 32px)"><div id="pvl">${skeleton(2)}</div></section>`;

    const waLink = () => 'https://wa.me/?text=' + encodeURIComponent(`${c.title}\nDaftar harga grosir terbaru:\n${link()}`);
    const setLink = () => { el.querySelector('#k-link').value = link(); el.querySelector('#open').href = link(); el.querySelector('#wa').href = waLink(); };
    setLink();
    let items = [];
    const paintPv = (q = '') => {
      q = q.trim().toLowerCase();
      const list = items.filter((i) => !q || (i.sku + ' ' + i.name).toLowerCase().includes(q));
      el.querySelector('#pvn').textContent = num(items.length) + ' barang';
      el.querySelector('#pvl').innerHTML = `<div class="table-wrap"><table class="tbl"><thead><tr><th>Kode</th><th>Nama barang</th><th>Kategori</th><th class="right">Harga</th>${c.tier_qty > 1 && Number(c.tier_pct) > 0 ? `<th class="right">≥ ${c.tier_qty} pcs</th>` : ''}${c.show_stock ? '<th>Stok</th>' : ''}</tr></thead><tbody>
        ${list.slice(0, 300).map((i) => `<tr><td class="mono small">${esc(i.sku)}</td><td>${esc(i.name)}</td><td class="small">${esc(i.category || '')}</td><td class="num"><b>${num(i.price)}</b></td>${i.tier != null ? `<td class="num">${num(i.tier)}</td>` : c.tier_qty > 1 && Number(c.tier_pct) > 0 ? '<td></td>' : ''}${c.show_stock ? `<td class="small">${esc(i.stock || '')}</td>` : ''}</tr>`).join('')}</tbody></table></div>
        ${list.length > 300 ? `<div class="xs muted" style="padding:10px 16px">Menampilkan 300 dari ${num(list.length)}. Semua barang tampil di link & PDF.</div>` : ''}`;
    };
    const preview = async () => { try { const r = await rpc('catalog_preview'); items = r.items || []; paintPv(el.querySelector('#pq').value); } catch (e) { toastErr(e); } };
    el.querySelector('#pq').addEventListener('input', debounce((e) => paintPv(e.target.value), 200));
    on(el, 'click', '#k-sup .chip, #k-cat .chip', (e, b) => b.classList.toggle('on'));
    const v = (id) => el.querySelector('#' + id);
    const save = async (extra = {}) => {
      const p = { enabled: v('k-on').checked, title: v('k-t').value, intro: v('k-i').value, basis: v('k-b').value, pct: parseNum(v('k-p').value), round_to: +v('k-r').value,
        wa: v('k-w').value, tier_qty: parseNum(v('k-tq').value), tier_pct: parseNum(v('k-tp').value), min_order: v('k-m').value, only_ready: v('k-ready').checked, show_stock: v('k-st').checked,
        suppliers: [...el.querySelectorAll('#k-sup .chip.on')].map((x) => x.dataset.v), categories: [...el.querySelectorAll('#k-cat .chip.on')].map((x) => x.dataset.v), ...extra };
      await rpc('catalog_save', { p });
      const { data } = await supa.from('catalog_config').select('*').eq('id', 1).single();
      Object.assign(c, data); setLink();
    };
    v('sv').onclick = async (e) => { e.target.disabled = true; try { await save(); toast('Tersimpan', 'ok'); await preview(); } catch (err) { toastErr(err); } e.target.disabled = false; };
    v('k-on').onchange = async () => { try { await save(); toast(c.enabled ? 'Link katalog aktif' : 'Link katalog dimatikan', 'ok'); } catch (err) { toastErr(err); } };
    v('cp').onclick = async () => { try { await navigator.clipboard.writeText(link()); toast('Link disalin', 'ok'); } catch (_) { v('k-link').select(); document.execCommand('copy'); toast('Link disalin', 'ok'); } };
    v('nt').onclick = async () => { if (!await confirmBox('Ganti link katalog?', 'Link lama tidak bisa dibuka lagi. Bagikan link baru ke pelanggan.')) return; try { await save({ new_token: true }); toast('Link baru dibuat', 'ok'); } catch (err) { toastErr(err); } };
    el.querySelector('#pdf').onclick = () => window.open(location.pathname.replace(/[^/]*$/, '') + 'katalog.html?preview=1&print=1', '_blank');
    preview();
  }
};
