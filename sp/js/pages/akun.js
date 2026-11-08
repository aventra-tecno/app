import { supa } from '../supa.js';
import { store } from '../store.js';
import { esc, toast, toastErr, pageHead, icon, ROLE_LABEL } from '../ui.js';
import { APP_VERSION } from '../config.js';

export default {
  async render(el) {
    const p = store.profile;
    el.innerHTML = `${pageHead('Akun saya')}
      <div class="stack" style="max-width:560px">
        <div class="card row"><div style="width:52px;height:52px;border-radius:14px;background:var(--accent);display:grid;place-items:center;font-weight:700;font-size:20px">${esc((p.full_name || '?').slice(0, 1).toUpperCase())}</div>
          <div class="grow"><b style="font-size:17px">${esc(p.full_name)}</b><div class="small muted">${esc(p.email || store.session.user.email)} · ${esc(ROLE_LABEL[p.role])}</div></div></div>
        <form class="card stack" id="nm"><h2 class="sec-title">Nama</h2><input class="input" id="n" value="${esc(p.full_name)}"><button class="btn">Simpan nama</button></form>
        <form class="card stack" id="pw"><h2 class="sec-title">Ganti password</h2>
          <label class="field">Password baru<input class="input" id="p1" type="password" autocomplete="new-password" minlength="6"></label>
          <label class="field">Ulangi password baru<input class="input" id="p2" type="password" autocomplete="new-password" minlength="6"></label>
          <button class="btn btn-primary">Simpan password</button></form>
        <button class="btn hidden" id="inst">${icon('install', 20)} Pasang aplikasi di perangkat ini</button>
        <button class="btn btn-dark btn-lg" id="lo">${icon('logout', 20)} Keluar</button>
        <div class="xs muted">Versi ${APP_VERSION}</div>
      </div>`;
    el.querySelector('#nm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const full_name = el.querySelector('#n').value.trim(); if (!full_name) return;
      const { error } = await supa.from('profiles').update({ full_name }).eq('id', p.id);
      if (error) return toastErr(error); p.full_name = full_name; toast('Nama tersimpan', 'ok');
    });
    el.querySelector('#pw').addEventListener('submit', async (e) => {
      e.preventDefault();
      const a = el.querySelector('#p1').value, b = el.querySelector('#p2').value;
      if (a.length < 6) return toast('Password minimal 6 karakter', 'err');
      if (a !== b) return toast('Password tidak sama', 'err');
      const { error } = await supa.auth.updateUser({ password: a });
      if (error) return toastErr(error);
      e.target.reset(); toast('Password diganti', 'ok');
    });
    const inst = el.querySelector('#inst');
    if (window.__installPrompt) { inst.classList.remove('hidden'); inst.onclick = () => window.__installPrompt.prompt(); }
    el.querySelector('#lo').onclick = async () => { await supa.auth.signOut(); location.hash = ''; };
  }
};
