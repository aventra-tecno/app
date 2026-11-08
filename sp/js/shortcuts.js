import { store } from './store.js';
import { PAGES, menuFor, shortcutsFor, SHORT_MAX, isLocked } from './nav.js';
import { esc, icon, todayStr, longToday } from './ui.js';
import { GROUP_STYLE, editPicks } from './pages/menu.js';

// "Menu utama" di Dashboard: ikon pintas yang bisa dipilih & diatur urutannya sendiri (seperti aplikasi bank)
export function renderShortcuts(box) {
  const role = store.role;
  const keys = shortcutsFor(role, store.profile.tab_prefs);
  box.innerHTML = `<div class="sc-head"><h2>Menu utama</h2><button class="sc-edit" data-sc-edit>${icon('sliders', 16)} Atur</button></div>
    <div class="menu-grid sc-grid">${keys.map((k) => {
      const p = PAGES[k], [, c1, c2] = GROUP_STYLE[p.group || ''] || ['', '#6B706C', '#3A403C'], lk = isLocked(k);
      return `<a class="menu-tile ${lk ? 'locked' : ''}" href="#/${k}"><span class="mt-ic" style="--c1:${c1};--c2:${c2}">${icon(p.icon, 23, 1.9)}${k === 'masalah' ? '<span class="mt-badge hidden" data-cnt="masalah"></span>' : ''}${lk ? `<span class="mt-lock">${icon('lock', 11, 2.6)}</span>` : ''}</span><span class="mt-lbl">${esc(p.short || p.label)}</span></a>`;
    }).join('')}</div>`;
  box.querySelector('[data-sc-edit]').onclick = async () => {
    const all = menuFor(role).filter((m) => m.key !== 'dashboard' && m.key !== 'menu');
    if (await editPicks({ key: 'dash:' + role, max: SHORT_MAX, title: 'Atur menu utama', all, current: keys,
      intro: `Pilih sampai ${SHORT_MAX} menu pintas yang tampil di Dashboard. Urutan dari kiri atas ke kanan bawah.` })) renderShortcuts(box);
  };
  dispatchEvent(new Event('masalah-paint'));
}

// sapaan di bagian atas Dashboard
export function greet() {
  const h = new Date().getHours();
  const w = h < 11 ? 'Selamat pagi' : h < 15 ? 'Selamat siang' : h < 18 ? 'Selamat sore' : 'Selamat malam';
  const name = (store.profile.full_name || '').split(' ')[0];
  return `<div class="dh-hi"><div><span class="dh-w">${w},</span> <b>${esc(name)}</b></div><div class="dh-d">${esc(longToday())}</div></div>`;
}

// sembunyikan nominal (ikon mata), diingat per perangkat
export function amtToggle(root) {
  const on = (() => { try { return localStorage.getItem('hide-amt') === '1'; } catch (_) { return false; } })();
  root.classList.toggle('amt-hidden', on);
  const b = root.querySelector('[data-eye]'); if (!b) return;
  const paint = () => { b.innerHTML = icon(root.classList.contains('amt-hidden') ? 'eyeoff' : 'eye', 18); b.setAttribute('aria-label', root.classList.contains('amt-hidden') ? 'Tampilkan nominal' : 'Sembunyikan nominal'); };
  paint();
  b.onclick = () => { const v = !root.classList.contains('amt-hidden'); root.classList.toggle('amt-hidden', v); try { localStorage.setItem('hide-amt', v ? '1' : '0'); } catch (_) {} paint(); };
  void todayStr;
}

// tinggi bagian biru di dashboard HP mengikuti isi (sampai sedikit di bawah atas kartu pertama)
export function heroFit(hero, anchorSel, extra = 64) {
  if (!hero) return;
  const fit = () => { const a = hero.querySelector(anchorSel); if (a) hero.style.setProperty('--hero-h', Math.max(120, a.offsetTop + extra) + 'px'); };
  fit(); requestAnimationFrame(fit);
  if (!hero._ro && 'ResizeObserver' in window) { hero._ro = new ResizeObserver(fit); hero._ro.observe(hero); }
}
