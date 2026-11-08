import { saGuard, billingUI } from './superadmin.js';
import { icon } from '../ui.js';

// Super admin › Tagihan & Mayar
export default {
  async render(el) {
    if (!saGuard(el)) return;
    el.innerHTML = `<div class="stack" style="max-width:860px">
      <section class="card stack" id="billing"><h2 class="sec-title">${icon('receipt', 18)} Tagihan &amp; pembayaran (Mayar)</h2><div class="skeleton" style="height:120px"></div></section>
      <section class="card flush" id="bills"></section></div>`;
    billingUI(el)();
  }
};
