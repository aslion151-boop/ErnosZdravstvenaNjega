// tap-shell.v1.js — styles ANY /tap/* page like the SPA, without changing its text.
(function () {
  if (!/^\/tap\//.test(location.pathname)) return;      // only run on /tap/*
  if (window.__ERNOS_TAP_SHELL__) return;               // run once
  window.__ERNOS_TAP_SHELL__ = true;

  // --- 1) Theme + meta (prevents old background flash) ---
  function ensureMeta(name, content){
    var m = document.querySelector('meta[name="'+name+'"]');
    if (!m) { m = document.createElement('meta'); m.setAttribute('name', name); document.head.prepend(m); }
    m.setAttribute('content', content);
  }
  ensureMeta('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover');
  ensureMeta('theme-color', '#F4F5F7');

  if (!document.getElementById('ernos-theme-vars')) {
    var s = document.createElement('style');
    s.id = 'ernos-theme-vars';
    s.textContent = ":root{--bg:#F4F5F7;--panel:#fff;--text:#2E2E2E;--muted:#606060;--accent:#7BA297;--border:#E1E3E8;--shadow:0 6px 20px rgba(20,31,50,.06);--ok:#2E7D5B;--warn:#B27B0B;--err:#B24444}html,body{background:var(--bg);color:var(--text)}";
    document.head.prepend(s);
  }

  // --- 2) Load SPA skin once (identical visuals) ---
  var hasSkin = Array.from(document.styleSheets || []).some(ss => (ss.href || '').includes('/skin/styles.css'));
  if (!hasSkin) {
    var l = document.createElement('link'); l.rel = 'stylesheet'; l.href = '/skin/styles.css?v=14';
    document.head.appendChild(l);
  }

  // --- 3) Wrap existing body content in branded header + centered card (no text changes) ---
  window.addEventListener('DOMContentLoaded', function () {
    if (document.querySelector('header.skin-header')) return; // already wrapped

    var body = document.body;

    var header = document.createElement('header');
    header.className = 'skin-header';
    header.innerHTML = "<img src='/skin/icons/logo.png' alt='Ernos' onerror=\"this.src='/skin/icons/icon.svg'\"><div style='margin-left:auto'></div>";

    var main = document.createElement('main');
    main.style.cssText = 'min-height:100dvh;display:grid;place-items:center;padding:16px';

    var card = document.createElement('div');
    card.className = 'card';
    card.style.cssText = 'width:min(720px,92vw)';

    while (body.firstChild) card.appendChild(body.firstChild);

    main.appendChild(card);
    body.appendChild(header);
    body.appendChild(main);
  });

  // --- 4) Optional: clean old service workers on tap pages ---
  if ('serviceWorker' in navigator) {
    try { navigator.serviceWorker.getRegistrations().then(rs => rs.forEach(r => r.unregister())); } catch {}
  }
})();
