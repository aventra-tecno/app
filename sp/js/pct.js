// 2.35: persen harga dari Macallan — dipakai Atur harga & Master barang
export const beliPct = (p) => { const m = +p.macallan, b = +p.harga_beli; return m > 0 && b > 0 ? Math.round((1 - b / m) * 100) : null; };
export const shpPct = (p) => { const m = +p.macallan, sp = +p.harga_shopee; return m > 0 && sp > 0 ? Math.round((sp / m - 1) * 100) : null; };
export function pctBadges(p) {
  const d = beliPct(p), sp = shpPct(p);
  return `<span class="pct-badges">${d == null ? '' : d === 0 ? '<span class="pb pb-free">Tanpa potongan</span>' : `<span class="pb ${d >= 30 ? 'pb-set' : 'pb-cut'}">Beli ${d > 0 ? '−' : '+'}${Math.abs(d)}%</span>`}${sp == null ? '' : `<span class="pb ${sp >= 0 ? 'pb-up' : 'pb-down'}">Shopee ${sp >= 0 ? '+' : '−'}${Math.abs(sp)}%</span>`}${p.diskon_pct != null ? '<span class="pb pb-man">diskon manual</span>' : ''}</span>`;
}
// chip filter persen: [['d:25','Beli −25% (n)'], ...], [['s:20','Shopee +20% (n)'], ...]
export function pctChips(list, maxShopee = 4) {
  const dG = new Map(), sG = new Map();
  list.forEach((p) => { const d = beliPct(p), sp = shpPct(p); if (d != null) dG.set(d, (dG.get(d) || 0) + 1); if (sp != null) sG.set(sp, (sG.get(sp) || 0) + 1); });
  const d = [...dG].sort((a, b) => a[0] - b[0]).map(([v, n]) => ['d:' + v, `${v === 0 ? 'Tanpa potongan' : 'Beli ' + (v > 0 ? '−' : '+') + Math.abs(v) + '%'} (${n})`]);
  const s = [...sG].sort((a, b) => b[1] - a[1]).slice(0, maxShopee).map(([v, n]) => ['s:' + v, `Shopee ${v >= 0 ? '+' : '−'}${Math.abs(v)}% (${n})`]);
  return [...d, ...s];
}
export const pctMatch = (f, p) => (f.startsWith('d:') ? beliPct(p) === +f.slice(2) : f.startsWith('s:') ? shpPct(p) === +f.slice(2) : true);
