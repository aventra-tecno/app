/*! Aventra Leads · t.js v1.0.0
 * Pasang di landing page:
 *   <script src="https://app.aventra.id/app/ld/t.js" data-key="pk_xxx" defer></script>
 * Tombol WA:
 *   <a href="https://wa.me/6285778082138" data-aventra-wa="SBY">Chat WA</a>
 *   (atribut data-aventra-wa = label nomor di Aventra; boleh dikosongkan,
 *    link wa.me biasa juga otomatis ditangkap)
 */
(function () {
  'use strict';
  var TRACK_URL = 'https://ydpyiwrznodxskpcwfcr.supabase.co/functions/v1/track';

  var me = document.currentScript || document.querySelector('script[data-key][src*="t.js"]');
  if (!me) return;
  var KEY = me.getAttribute('data-key');
  var API = me.getAttribute('data-api') || TRACK_URL;
  if (!KEY) return;

  var ATTR_KEYS = ['fbclid', 'ad_id', 'ad_name', 'campaign_name', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_content'];
  var ABC = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

  function getCookie(n) {
    var m = document.cookie.match(new RegExp('(?:^|; )' + n + '=([^;]*)'));
    return m ? decodeURIComponent(m[1]) : null;
  }
  function setCookie(n, v, days) {
    var d = new Date(Date.now() + days * 864e5);
    document.cookie = n + '=' + encodeURIComponent(v) + '; expires=' + d.toUTCString() + '; path=/; SameSite=Lax';
  }
  function store(k, v) { try { sessionStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function load(k) { try { return JSON.parse(sessionStorage.getItem(k) || 'null'); } catch (e) { return null; } }

  // 1) Simpan jejak klik iklan dari URL (fbclid, ad_id, utm...)
  var qs = new URLSearchParams(location.search);
  var attr = load('av_attr') || {};
  if (qs.get('fbclid') || qs.get('utm_source') || qs.get('ad_id')) {
    attr = {};
    ATTR_KEYS.forEach(function (k) { if (qs.get(k)) attr[k] = qs.get(k); });
    store('av_attr', attr);
  }

  // 2) Cookie _fbc dari fbclid, _fbp bila Pixel belum membuatnya
  if (attr.fbclid) {
    var fbc = getCookie('_fbc');
    if (!fbc || fbc.split('.').pop() !== attr.fbclid) setCookie('_fbc', 'fb.1.' + Date.now() + '.' + attr.fbclid, 90);
  }
  if (!getCookie('_fbp')) setCookie('_fbp', 'fb.1.' + Date.now() + '.' + Math.floor(Math.random() * 1e10), 90);

  // 3) Ambil pengaturan nomor WA (disimpan selama sesi)
  var cfg = load('av_cfg_' + KEY);
  if (!cfg) {
    fetch(API + '?key=' + encodeURIComponent(KEY))
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) { if (j && j.numbers) { cfg = j; store('av_cfg_' + KEY, j); } })
      .catch(function () {});
  }

  function digits(s) { return String(s || '').replace(/\D/g, ''); }
  function normPhone(s) {
    var d = digits(s);
    if (d.charAt(0) === '0') return '62' + d.slice(1);
    if (d.charAt(0) === '8') return '62' + d;
    return d;
  }
  function pickNumber(el) {
    if (!cfg || !cfg.numbers || !cfg.numbers.length) return null;
    var want = (el.getAttribute('data-aventra-wa') || '').trim().toLowerCase();
    var i, n;
    if (want) {
      for (i = 0; i < cfg.numbers.length; i++) {
        n = cfg.numbers[i];
        if (n.label.toLowerCase() === want || n.id === want) return n;
      }
    }
    var href = el.getAttribute('href') || '';
    var m = href.match(/wa\.me\/(\d+)|phone=(\d+)/);
    if (m) {
      var p = normPhone(m[1] || m[2]);
      for (i = 0; i < cfg.numbers.length; i++) if (cfg.numbers[i].phone === p) return cfg.numbers[i];
    }
    return want ? null : cfg.numbers[0];
  }
  function makeKode() {
    var s = '', a = new Uint32Array(6);
    (window.crypto || window.msCrypto).getRandomValues(a);
    for (var i = 0; i < 6; i++) s += ABC.charAt(a[i] % ABC.length);
    return cfg.prefix + '-' + s;
  }

  // 4) Klik tombol WA -> kode promo -> catat -> buka WhatsApp
  document.addEventListener('click', function (e) {
    var el = e.target && e.target.closest && e.target.closest('[data-aventra-wa], a[href*="wa.me/"], a[href*="api.whatsapp.com/send"]');
    if (!el || el.getAttribute('data-aventra-skip') !== null) return;
    var num = pickNumber(el);
    if (!num) return; // pengaturan belum termuat: biarkan link berjalan normal

    e.preventDefault();
    var kode = makeKode();
    var eventId = 'ct_' + kode;
    var text = (num.template || 'Halo, kode promo: {kode}')
      .replace(/\{kode\}/g, kode)
      .replace(/\{promo\}/g, cfg.promo || '');

    var payload = {
      key: KEY, kode: kode, event_id: eventId, wa: num.id,
      page_url: location.href.split('#')[0],
      fbc: getCookie('_fbc'), fbp: getCookie('_fbp')
    };
    ATTR_KEYS.forEach(function (k) { if (attr[k]) payload[k] = attr[k]; });

    try {
      fetch(API, { method: 'POST', body: JSON.stringify(payload), keepalive: true, headers: { 'Content-Type': 'text/plain' } });
    } catch (err) {}
    if (typeof window.fbq === 'function') {
      try { window.fbq('track', 'Contact', {}, { eventID: eventId }); } catch (err) {}
    }
    window.AventraLeads = { kode: kode };

    var go = 'https://wa.me/' + num.phone + '?text=' + encodeURIComponent(text);
    setTimeout(function () { location.href = go; }, 150);
  }, true);
})();
