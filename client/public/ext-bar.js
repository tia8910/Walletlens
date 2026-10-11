/* The extension toolbar for the static pages (the tour at "/" and the landing
   pages), which load no React. Same rules as components/ExtensionToolbar.jsx:
   desktop Chromium only, never in an app window, never when the extension has
   marked the page (<html data-wl-ext>), and 30 days of quiet after a close or
   a click through to the store. Keep the two in step. */
(function () {
  'use strict'
  var KEY = 'wl_ext_bar', MARK = 'data-wl-ext', SNOOZE = 30 * 864e5
  var STORE = 'https://chromewebstore.google.com/detail/walletlens-portfolio/ajmjdeobjjmabgonhaeaaehoepfafhbn'
  var COPY = {
    en: ['Your net worth in the toolbar', 'Add WalletLens to {b}. Free, no account, one click away.', 'Add to {b}', 'Learn more', 'Not now'],
    ar: ['ثروتك في شريط المتصفح', 'أضف WalletLens إلى {b}. مجاني وبدون حساب وبنقرة واحدة.', 'أضف إلى {b}', 'اعرف المزيد', 'ليس الآن'],
    fr: ['Votre patrimoine dans la barre d’outils', 'Ajoutez WalletLens à {b}. Gratuit, sans compte, à un clic.', 'Ajouter à {b}', 'En savoir plus', 'Plus tard'],
    es: ['Tu patrimonio en la barra de herramientas', 'Añade WalletLens a {b}. Gratis, sin cuenta, a un clic.', 'Añadir a {b}', 'Más información', 'Ahora no'],
    de: ['Dein Vermögen in der Symbolleiste', 'Füge WalletLens zu {b} hinzu. Kostenlos, ohne Konto, einen Klick entfernt.', 'Zu {b} hinzufügen', 'Mehr erfahren', 'Nicht jetzt'],
    it: ['Il tuo patrimonio nella barra degli strumenti', 'Aggiungi WalletLens a {b}. Gratis, senza account, a un clic.', 'Aggiungi a {b}', 'Scopri di più', 'Non ora'],
  }
  function browserName() {
    var n = navigator, ua = n.userAgent || ''
    if (/Android|iPhone|iPad|iPod|Mobile/i.test(ua) || (n.userAgentData && n.userAgentData.mobile)) return null
    if (!/Chrome\//.test(ua) || /Firefox\//.test(ua)) return null
    if (/Edg\//.test(ua)) return 'Edge'
    if (/OPR\//.test(ua)) return 'Opera'
    if (n.brave) return 'Brave'
    return 'Chrome'
  }
  function offer() {
    try {
      var root = document.documentElement
      if (!browserName() || root.hasAttribute(MARK) || root.classList.contains('wl-msstore')) return false
      if (localStorage.getItem('wl_store') === 'msstore') return false
      if (matchMedia('(display-mode: standalone)').matches || matchMedia('(display-mode: window-controls-overlay)').matches) return false
      if (!matchMedia('(pointer: fine)').matches || innerWidth < 900) return false
      return !(Number(localStorage.getItem(KEY) || 0) > Date.now())
    } catch (e) { return false }
  }
  function ev(name, extra) { try { if (typeof gtag === 'function') gtag('event', name, extra || {}) } catch (e) {} }
  if (!offer()) return
  var css = '.wl-extbar{position:fixed;z-index:2147483000;top:76px;right:20px;display:flex;align-items:center;gap:14px;max-width:min(560px,calc(100vw - 40px));padding:12px 12px 12px 14px;border-radius:18px;background:linear-gradient(135deg,rgba(15,23,42,.97),rgba(5,46,22,.97));color:#fff;font:14px/1.35 system-ui,-apple-system,"Segoe UI",sans-serif;box-shadow:0 0 0 1px rgba(74,222,128,.35),0 24px 60px -18px rgba(0,0,0,.55),0 12px 40px -20px rgba(34,197,94,.6)}' +
    '@media (prefers-reduced-motion:no-preference){.wl-extbar{animation:wl-extbar-in .45s cubic-bezier(.2,1.2,.3,1) both}}@keyframes wl-extbar-in{from{opacity:0;transform:translateY(-14px) scale(.97)}to{opacity:1;transform:none}}' +
    '.wl-extbar[dir=rtl]{right:auto;left:20px}.wl-extbar-icon{flex:none;width:42px;height:42px;display:grid;place-items:center;border-radius:12px;background:rgba(255,255,255,.08);box-shadow:inset 0 0 0 1px rgba(255,255,255,.12)}' +
    '.wl-extbar-text{display:flex;flex-direction:column;gap:2px;min-width:0}.wl-extbar-text b{font-weight:800;font-size:15px}.wl-extbar-text span{font-size:12.8px;color:rgba(226,232,240,.78)}.wl-extbar-text a{color:#4ade80;font-weight:700;text-decoration:none;white-space:nowrap}' +
    '.wl-extbar-add{flex:none;padding:10px 16px;border-radius:12px;text-decoration:none;white-space:nowrap;font-weight:800;font-size:13.8px;color:#04210f;background:linear-gradient(135deg,#4ade80,#16a34a);box-shadow:0 6px 18px -6px rgba(34,197,94,.7)}' +
    '.wl-extbar-close{flex:none;width:30px;height:30px;display:grid;place-items:center;border:0;border-radius:10px;background:rgba(255,255,255,.08);color:rgba(226,232,240,.85);cursor:pointer}.wl-extbar-close:hover{background:rgba(255,255,255,.16);color:#fff}'
  var ICON = '<svg width="26" height="26" viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="11" fill="#fff"/><path fill="#4caf50" d="M24 13h17.6A23.9 23.9 0 0 0 24 0 24 24 0 0 0 3.4 11.8L12 26.7A12 12 0 0 1 24 13z"/><path fill="#ffc107" d="M41.6 13H24a12 12 0 0 1 10.4 18l-8.6 14.9A24 24 0 0 0 41.6 13z"/><path fill="#f44336" d="M12 26.7 3.4 11.8A24 24 0 0 0 25.8 47.9L34.4 33A12 12 0 0 1 12 26.7z"/><circle cx="24" cy="24" r="6" fill="#2196f3"/></svg>'
  var timer = setTimeout(function () {
    if (!offer()) return
    var b = browserName()
    var lang = ((function () { try { return localStorage.getItem('wl_lang') } catch (e) { return '' } })() || document.documentElement.lang || 'en').slice(0, 2)
    var c = COPY[lang] || COPY.en
    var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st)
    var bar = document.createElement('div')
    bar.className = 'wl-extbar'; bar.setAttribute('role', 'dialog'); bar.setAttribute('aria-label', c[0]); bar.dir = lang === 'ar' ? 'rtl' : 'ltr'
    bar.innerHTML = '<span class="wl-extbar-icon">' + ICON + '</span><div class="wl-extbar-text"><b></b><span><i></i> <a href="/chrome-extension/"></a></span></div>' +
      '<a class="wl-extbar-add" target="_blank" rel="noopener noreferrer"></a><button type="button" class="wl-extbar-close"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button>'
    bar.querySelector('b').textContent = c[0]
    var it = bar.querySelector('i'); it.style.fontStyle = 'normal'; it.textContent = c[1].replace('{b}', b)
    var more = bar.querySelector('.wl-extbar-text a'); more.textContent = c[3]
    var add = bar.querySelector('.wl-extbar-add'); add.href = STORE; add.textContent = c[2].replace('{b}', b)
    var close = bar.querySelector('.wl-extbar-close'); close.setAttribute('aria-label', c[4]); close.title = c[4]
    function snooze() { try { localStorage.setItem(KEY, String(Date.now() + SNOOZE)) } catch (e) {} bar.remove() }
    more.addEventListener('click', function () { ev('extension_page_click', { source: 'toolbar_bar' }) })
    add.addEventListener('click', function () { ev('extension_install_click', { source: 'toolbar_bar', browser: b, can_install: true, transport_type: 'beacon' }); snooze() })
    close.addEventListener('click', function () { ev('extension_bar_dismiss', { browser: b }); snooze() })
    document.body.appendChild(bar)
    ev('extension_bar_view', { browser: b })
    if (typeof MutationObserver === 'function') new MutationObserver(function () { if (document.documentElement.hasAttribute(MARK)) bar.remove() })
      .observe(document.documentElement, { attributes: true, attributeFilter: [MARK] })
  }, 2500)
  if (typeof MutationObserver === 'function') new MutationObserver(function () { if (document.documentElement.hasAttribute(MARK)) clearTimeout(timer) })
    .observe(document.documentElement, { attributes: true, attributeFilter: [MARK] })
})()
