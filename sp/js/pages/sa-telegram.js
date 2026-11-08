import { saGuard, tgBotUI } from './superadmin.js';

// Super admin › Bot Telegram
export default {
  async render(el) {
    if (!saGuard(el)) return;
    el.innerHTML = '<div class="stack" style="max-width:820px"><section class="card stack" id="tgbot"><div class="skeleton" style="height:120px"></div></section></div>';
    tgBotUI(el.querySelector('#tgbot'));
  }
};
