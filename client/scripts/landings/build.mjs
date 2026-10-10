// Premium landing pages for Zakat and Portfolio Guardian, one per app
// language. Plain static HTML (no app bundle) so crawlers and answer engines
// read every word on first fetch. Written into dist/ by scripts/prerender.mjs
// and listed in the sitemap there.
import { LANGS, UI, ZAKAT, GUARDIAN } from './copy.mjs'

const ORIGIN = 'https://walletlens.live'
const PLAY = 'https://play.google.com/store/apps/details?id=live.walletlens.twa'
const MS = 'https://apps.microsoft.com/detail/9pkvkn0p9dx2'
const CHROME = 'https://chromewebstore.google.com/detail/walletlens-portfolio/ajmjdeobjjmabgonhaeaaehoepfafhbn'
const LOCALE = { en: 'en_US', ar: 'ar_AR', fr: 'fr_FR', es: 'es_ES', de: 'de_DE', it: 'it_IT' }
const UPDATED = '2026-10-10'

export const PAGES = {
  zakat: { copy: ZAKAT, slug: 'zakat', cta: (l) => (l === 'ar' ? '/ar/zakat-calculator/' : '/zakat-calculator/') },
  guardian: { copy: GUARDIAN, slug: 'portfolio-guardian', cta: () => '/guardian' },
}
export const pathFor = (page, lang) => (lang === 'en' ? '' : `/${lang}`) + `/${PAGES[page].slug}/`
export const LANDING_ROUTES = Object.keys(PAGES).flatMap(p => LANGS.map(l => pathFor(p, l)))

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const strip = (s) => String(s).replace(/<[^>]+>/g, '')
const ld = (o) => JSON.stringify(o).replace(/</g, '\\u003c')

const I = (d) => `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`
const ICONS = {
  coins: I('<ellipse cx="9" cy="7" rx="6" ry="3"/><path d="M3 7v4c0 1.7 2.7 3 6 3s6-1.3 6-3V7"/><path d="M9 14v3c0 1.7 2.7 3 6 3s6-1.3 6-3v-4c0-1.7-2.7-3-6-3"/>'),
  scale: I('<path d="M12 3v18M5 21h14M6 7h12M6 7l-3 7a3 3 0 0 0 6 0zM18 7l-3 7a3 3 0 0 0 6 0z"/>'),
  moon: I('<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>'),
  minus: I('<circle cx="12" cy="12" r="9"/><path d="M8 12h8"/>'),
  chart: I('<path d="M3 3v18h18"/><path d="M7 15l4-4 3 3 6-6"/>'),
  lock: I('<rect x="4" y="10" width="16" height="11" rx="2.5"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>'),
  shield: I('<path d="M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6z"/><path d="M9 12l2 2 4-4"/>'),
  mail: I('<rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="M3 7l9 6 9-6"/>'),
  qr: I('<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3h-3zM20 14v.01M14 20h.01M17 20h4v-3"/>'),
  key: I('<circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M17 6l3 3M15 8l2 2"/>'),
  test: I('<path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4z"/>'),
  pause: I('<circle cx="12" cy="12" r="9"/><path d="M10 9v6M14 9v6"/>'),
  phone: I('<rect x="7" y="2" width="10" height="20" rx="2.5"/><path d="M11 18h2"/>'),
  clock: I('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
}
const TL_ICONS = ['phone', 'mail', 'clock', 'shield']

const LOGO = `<svg viewBox="0 0 64 64" width="30" height="30" aria-hidden="true"><defs><linearGradient id="wlg" x1="5" y1="5" x2="52" y2="52" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#4ade80"/><stop offset=".5" stop-color="#16a34a"/><stop offset="1" stop-color="#14532d"/></linearGradient></defs><circle cx="27" cy="25" r="19" stroke="url(#wlg)" stroke-width="5.5" fill="none"/><rect x="14.5" y="26.5" width="5" height="7.5" rx="1.2" fill="url(#wlg)"/><rect x="21.5" y="21" width="5" height="13" rx="1.2" fill="url(#wlg)"/><rect x="28.5" y="15.5" width="5" height="18.5" rx="1.2" fill="url(#wlg)"/><line x1="13.5" y1="39" x2="4" y2="55" stroke="url(#wlg)" stroke-width="5.5" stroke-linecap="round"/><circle cx="40.5" cy="11.5" r="3.8" fill="#4ade80"/></svg>`

const CSS = `
@font-face{font-family:Sora;font-weight:400 800;font-display:swap;src:url(/fonts/sora-latin.woff2) format('woff2')}
@font-face{font-family:Manrope;font-weight:200 800;font-display:swap;src:url(/fonts/manrope-latin.woff2) format('woff2')}
@font-face{font-family:Plex;font-weight:400;font-display:swap;src:url(/fonts/ibm-plex-sans-arabic-400-arabic.woff2) format('woff2')}
@font-face{font-family:Plex;font-weight:500;font-display:swap;src:url(/fonts/ibm-plex-sans-arabic-500-arabic.woff2) format('woff2')}
@font-face{font-family:Plex;font-weight:600;font-display:swap;src:url(/fonts/ibm-plex-sans-arabic-600-arabic.woff2) format('woff2')}
@font-face{font-family:Plex;font-weight:700 800;font-display:swap;src:url(/fonts/ibm-plex-sans-arabic-700-arabic.woff2) format('woff2')}
:root{--bg:#07080a;--card:rgba(255,255,255,.04);--line:rgba(255,255,255,.1);--tx:#f5f6f7;--mu:rgba(255,255,255,.68);--a1:#fcd34d;--a2:#f59e0b;--a3:#10b981;--glow:rgba(245,158,11,.32);--glow2:rgba(16,185,129,.22);--hd:Sora,Plex,sans-serif;--bd:Manrope,Plex,sans-serif}
.guardian{--a1:#c4b5fd;--a2:#8b5cf6;--a3:#60a5fa;--glow:rgba(139,92,246,.36);--glow2:rgba(96,165,250,.2)}
[dir=rtl]{--hd:Plex,Sora,sans-serif;--bd:Plex,Manrope,sans-serif}
*{box-sizing:border-box;margin:0;padding:0}
html{scroll-behavior:smooth}
body{background:var(--bg);color:var(--tx);font-family:var(--bd);-webkit-font-smoothing:antialiased;overflow-x:hidden}
a{color:inherit;text-decoration:none}
.skip{position:absolute;inset-inline-start:-999px}.skip:focus{inset-inline-start:16px;top:16px;z-index:9;background:var(--a2);color:#111;padding:8px 12px;border-radius:8px}
.wrap{max-width:1160px;margin:0 auto;padding:0 32px;position:relative}
nav{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:22px 0;position:relative;z-index:2}
.brand{display:flex;align-items:center;gap:10px;font:700 19px Sora,sans-serif}
.nl{display:flex;gap:22px;align-items:center;font-weight:600;font-size:14px;color:var(--mu)}.nl a:hover{color:var(--tx)}
.lang{display:flex;gap:2px;padding:4px;border-radius:99px;background:var(--card);box-shadow:inset 0 0 0 1px var(--line)}
.lang a{padding:4px 9px;border-radius:99px;font:700 11px Manrope,sans-serif;letter-spacing:.06em;color:var(--mu)}.lang a[aria-current]{background:var(--a2);color:#111}
.btn{display:inline-flex;align-items:center;gap:8px;padding:14px 22px;border-radius:14px;font-weight:800;font-size:15px;color:#111;background:linear-gradient(135deg,var(--a1),var(--a2));box-shadow:0 10px 30px -8px var(--glow),inset 0 1px 0 rgba(255,255,255,.5);transition:transform .15s}
.btn:hover{transform:translateY(-1px)}.btn.g{color:var(--tx);background:var(--card);box-shadow:inset 0 0 0 1px var(--line)}
.hero{position:relative;padding:48px 0 72px;display:grid;grid-template-columns:1.05fr .95fr;gap:56px;align-items:center;z-index:1}
.top{position:relative;overflow:hidden}
.bgfx{position:absolute;inset:0;pointer-events:none;background:radial-gradient(40% 45% at 72% 40%,var(--glow),transparent 70%),radial-gradient(30% 35% at 12% 70%,var(--glow2),transparent 70%)}
.bgfx::after{content:"";position:absolute;inset:0;background-image:linear-gradient(rgba(255,255,255,.03) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.03) 1px,transparent 1px);background-size:56px 56px;-webkit-mask-image:radial-gradient(50% 50% at 60% 40%,#000,transparent 80%);mask-image:radial-gradient(50% 50% at 60% 40%,#000,transparent 80%)}
.kick{display:inline-flex;padding:7px 14px;border-radius:99px;font:800 12px var(--bd);letter-spacing:.14em;text-transform:uppercase;color:var(--a1);background:color-mix(in srgb,var(--a2) 14%,transparent);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--a1) 35%,transparent)}
[dir=rtl] .kick{letter-spacing:0}
h1{font:800 58px/1.04 var(--hd);letter-spacing:-.045em;margin:22px 0 20px}
h1 em,h2 em{font-style:normal;background:linear-gradient(100deg,var(--a1),var(--a2));-webkit-background-clip:text;background-clip:text;color:transparent}
[dir=rtl] h1,[dir=rtl] h2,[dir=rtl] h3{letter-spacing:0;line-height:1.3}
.sub{font-size:19px;line-height:1.6;color:var(--mu);max-width:540px}
.ctas{display:flex;gap:12px;margin-top:30px;flex-wrap:wrap}
.trust{display:flex;gap:8px 18px;margin-top:26px;flex-wrap:wrap;font-weight:700;font-size:13px;color:var(--mu);list-style:none}
.trust li::before{content:"✓";color:var(--a3);margin-inline-end:6px;font-weight:900}
.card{position:relative;border-radius:26px;padding:26px;background:linear-gradient(180deg,rgba(255,255,255,.07),rgba(255,255,255,.02));box-shadow:inset 0 0 0 1px var(--line),0 40px 80px -30px #000,0 0 120px -40px var(--glow)}
.ch{display:flex;justify-content:space-between;align-items:center;gap:8px;font-weight:700;font-size:13px;color:var(--mu);margin-bottom:18px}
.pill{padding:5px 10px;border-radius:99px;font-size:11px;font-weight:800;background:color-mix(in srgb,var(--a3) 16%,transparent);color:var(--a3);white-space:nowrap}
.ex{position:absolute;top:-11px;inset-inline-end:22px;padding:3px 10px;border-radius:99px;font:800 10px var(--bd);letter-spacing:.1em;text-transform:uppercase;background:#1b1c20;color:var(--mu);box-shadow:inset 0 0 0 1px var(--line)}
.due{font:800 52px Sora,sans-serif;letter-spacing:-.04em}.due small{font-size:16px;color:var(--mu);font-weight:600;letter-spacing:0;margin-inline-start:8px}
.row{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:12px 0;border-top:1px solid var(--line);font-size:14px}
.row b{font:700 14px Sora,sans-serif}.row .l{display:flex;align-items:center;gap:10px;color:var(--mu);font-weight:600}
.dot{width:28px;height:28px;border-radius:50%;display:grid;place-items:center;font:900 12px Sora,sans-serif;color:#111;flex-shrink:0}
.bar{height:8px;border-radius:9px;background:rgba(255,255,255,.08);overflow:hidden;margin:8px 0 4px}.bar i{display:block;height:100%;width:81%;border-radius:9px;background:linear-gradient(90deg,var(--a1),var(--a2))}
[dir=rtl] .bar i{margin-inline-start:auto;margin-inline-end:0}
.tiny{font-size:12px;color:var(--mu);font-weight:600}.sp{display:flex;justify-content:space-between;gap:8px}
section{padding:64px 0;position:relative}
h2{font:800 42px/1.1 var(--hd);letter-spacing:-.04em;margin-bottom:14px}
.lead{color:var(--mu);font-size:17px;line-height:1.65;max-width:680px}
.answer{display:grid;grid-template-columns:1.3fr 1fr;gap:28px;padding:30px;border-radius:24px;background:var(--card);box-shadow:inset 0 0 0 1px var(--line)}
.answer h2{font-size:24px;letter-spacing:-.02em}.answer p{color:var(--mu);line-height:1.7;font-size:16px}
dl{display:grid;gap:10px;align-content:start}dl div{display:flex;justify-content:space-between;gap:14px;padding-bottom:10px;border-bottom:1px solid var(--line);font-size:14px}
dt{color:var(--mu);font-weight:600}dd{font-weight:700;text-align:end}
.steps{display:grid;grid-template-columns:repeat(3,1fr);gap:18px;margin-top:34px;list-style:none;counter-reset:s}
.step{padding:26px;border-radius:22px;background:var(--card);box-shadow:inset 0 0 0 1px var(--line);counter-increment:s}
.step::before{content:counter(s);display:grid;place-items:center;width:38px;height:38px;border-radius:12px;font:800 16px Sora,sans-serif;color:#111;background:linear-gradient(135deg,var(--a1),var(--a2));margin-bottom:16px}
.step h3,.bx h3{font:700 19px var(--hd);letter-spacing:-.02em;margin-bottom:8px}.step p,.bx p{color:var(--mu);line-height:1.6;font-size:15px}
.bento{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-top:34px}
.bx{padding:26px;border-radius:22px;background:var(--card);box-shadow:inset 0 0 0 1px var(--line)}
.bx.w{grid-column:span 2;background:radial-gradient(70% 90% at 90% 0%,var(--glow),transparent 70%),var(--card)}.bx.full{grid-column:1/-1}
.ico{width:44px;height:44px;border-radius:14px;display:grid;place-items:center;margin-bottom:14px;color:var(--a1);background:color-mix(in srgb,var(--a2) 16%,transparent);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--a1) 30%,transparent)}
details{border-radius:18px;background:var(--card);box-shadow:inset 0 0 0 1px var(--line);padding:20px 24px;margin-top:12px}
summary{list-style:none;cursor:pointer;display:flex;justify-content:space-between;align-items:center;gap:16px}summary::-webkit-details-marker{display:none}
summary h3{font:700 17px var(--hd);letter-spacing:-.01em}summary::after{content:"+";color:var(--a1);font-size:22px;font-weight:700}
details[open] summary::after{content:"\\2212"}details p{color:var(--mu);line-height:1.65;margin-top:10px;font-size:15px}
.note{margin-top:22px;font-size:13px;color:var(--mu);font-style:italic}
.final{text-align:center;padding:64px 32px;border-radius:30px;background:radial-gradient(60% 100% at 50% 0%,var(--glow),transparent 70%),var(--card);box-shadow:inset 0 0 0 1px var(--line)}
.final .lead{margin:0 auto}.final .ctas{justify-content:center}
.stores{display:flex;gap:10px;justify-content:center;flex-wrap:wrap;margin-top:20px}.stores a{padding:10px 15px;border-radius:12px;background:#000;box-shadow:inset 0 0 0 1px rgba(255,255,255,.25);font-weight:700;font-size:13px}
footer{padding:36px 0 50px;color:var(--mu);font-size:13px;display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap}footer nav{padding:0;display:flex;gap:14px;flex-wrap:wrap;justify-content:flex-start}
.ring{position:relative;width:200px;height:200px;margin:4px auto 18px}.ring svg{transform:rotate(-90deg)}
.ring .c{position:absolute;inset:0;display:grid;place-items:center;text-align:center}.ring .c b{font:800 46px Sora,sans-serif;display:block;letter-spacing:-.04em}
.heir{display:flex;align-items:center;gap:12px;padding:11px 0;border-top:1px solid var(--line);font-size:14px;font-weight:600}.heir span:nth-child(2){flex:1}
.av{width:34px;height:34px;border-radius:50%;display:grid;place-items:center;font:800 13px Sora,sans-serif;color:#111}
.tl{display:grid;grid-template-columns:repeat(4,1fr);margin-top:40px;position:relative;list-style:none}
.tl::before{content:"";position:absolute;top:21px;inset-inline:6%;height:2px;background:linear-gradient(90deg,var(--a3),var(--a2),#f59e0b,#ef4444)}
[dir=rtl] .tl::before{background:linear-gradient(270deg,var(--a3),var(--a2),#f59e0b,#ef4444)}
.tl li{padding:0 14px;text-align:center;position:relative}.tl i{display:grid;place-items:center;margin:0 auto 14px;width:44px;height:44px;border-radius:50%;background:var(--bg);box-shadow:inset 0 0 0 2px var(--a2);color:var(--a1)}
.tl h3{font:700 16px var(--hd);margin-bottom:6px}.tl p{color:var(--mu);font-size:14px;line-height:1.5}
.chips{display:flex;gap:10px;flex-wrap:wrap;margin-top:26px;list-style:none}.chips li{padding:9px 14px;border-radius:12px;font-weight:700;font-size:13px}
.chips .ok{background:rgba(16,185,129,.1);color:#6ee7b7;box-shadow:inset 0 0 0 1px rgba(16,185,129,.3)}
.chips .no{background:rgba(239,68,68,.1);color:#fca5a5;box-shadow:inset 0 0 0 1px rgba(239,68,68,.3)}
@media (max-width:900px){.hero,.answer{grid-template-columns:1fr}.hero{gap:40px}}
@media (max-width:600px){.wrap{padding:0 16px}.nl>a{display:none}.hero{padding:16px 0 40px}h1{font-size:38px}.sub{font-size:16px}h2{font-size:30px}section{padding:44px 0}
.steps,.bento,.tl{grid-template-columns:1fr}.bx.w{grid-column:auto}.tl::before{display:none}.tl li{text-align:start;display:grid;grid-template-columns:44px 1fr;gap:4px 14px;margin-bottom:18px;padding:0}.tl i{margin:0;grid-row:span 2}
.final{padding:44px 20px}.due{font-size:42px}.answer{padding:22px}.lang a{padding:4px 6px}.brand span{display:none}}
@media (prefers-reduced-motion:reduce){html{scroll-behavior:auto}.btn{transition:none}}
`

// Same Microsoft Store rule as src/msStore.js and the extension page: the
// Store edition may not promote other stores, so it goes straight to the app.
const MS_SCRIPT = `<script>
(function () {
  try {
    var q = new URLSearchParams(location.search).get('store') === 'msstore'
    var mm = window.matchMedia
    var app = !!(mm && (mm('(display-mode: standalone)').matches || mm('(display-mode: window-controls-overlay)').matches))
    var s = localStorage.getItem('wl_store') === 'msstore'
    if (s && !app) { try { localStorage.removeItem('wl_store') } catch (e) {} s = false }
    if (q || s) {
      if (app) { try { localStorage.setItem('wl_store', 'msstore') } catch (e) {} }
      location.replace('/dashboard' + location.search)
    }
  } catch (e) {}
})()
</script>`

const GTAG = `<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('consent', 'default', { ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied', analytics_storage: 'granted',
    region: ['AT','BE','BG','HR','CY','CZ','DK','EE','FI','FR','DE','GR','HU','IE','IT','LV','LT','LU','MT','NL','PL','PT','RO','SK','SI','ES','SE','IS','LI','NO','GB','CH'] });
  gtag('consent', 'default', { ad_storage: 'granted', ad_user_data: 'granted', ad_personalization: 'denied', analytics_storage: 'granted' });
  gtag('js', new Date());
  gtag('config', 'G-69L5NCXNGB');
  gtag('config', 'AW-18295184733');
  addEventListener('load', function () { var g = document.createElement('script'); g.async = true; g.src = 'https://www.googletagmanager.com/gtag/js?id=G-69L5NCXNGB'; document.head.appendChild(g) }, { once: true });
</script>`

function zakatCard(c, ui) {
  const k = c.card
  const row = (dot, bg, label, val, color = '') => `<div class="row"><span class="l"><span class="dot" style="background:${bg}">${dot}</span>${esc(label)}</span><b${color}>${val}</b></div>`
  return `<div class="card" role="img" aria-label="${esc(ui.example)}: ${esc(k.title)}"><span class="ex">${esc(ui.example)}</span>
<div class="ch"><span>${esc(k.title)}</span><span class="pill">${esc(k.status)}</span></div>
<div class="tiny">${esc(k.due)}</div><div class="due" dir="ltr">$1,059<small>2.5%</small></div>
<div class="tiny" style="margin-top:16px">${esc(k.hawl)}</div><div class="bar"><i></i></div><div class="tiny sp"><span>${esc(k.start)}</span><span>${esc(k.end)}</span></div>
<div style="margin-top:16px">
${row('Au', '#fcd34d', k.gold, '$15,360')}
${row('₿', '#f7931a', k.crypto, '$12,140')}
${row('S', '#60a5fa', k.stocks, '$9,880')}
${row('$', '#34d399', k.cash, '$7,500')}
${row('−', '#f87171', k.debts, '<span dir="ltr">−$2,500</span>', ' style="color:#f87171"')}
<div class="row" style="font-size:15px"><span class="l" style="color:var(--tx)">${esc(k.total)}</span><b>$42,380</b></div>
<div class="row"><span class="l">${esc(k.nisab)}</span><b style="color:var(--a3)">$10,880 ✓</b></div></div></div>`
}

function guardianCard(c, ui) {
  const k = c.card
  const heir = (ch, bg, name) => `<div class="heir"><span class="av" style="background:${bg}">${ch}</span><span>${esc(name)}</span><span class="tiny">${esc(k.r)}</span></div>`
  return `<div class="card" role="img" aria-label="${esc(ui.example)}: ${esc(k.title)}"><span class="ex">${esc(ui.example)}</span>
<div class="ch"><span>${esc(k.title)}</span><span class="pill">${esc(k.status)}</span></div>
<div class="ring"><svg width="200" height="200" viewBox="0 0 200 200" aria-hidden="true"><defs><linearGradient id="rg"><stop offset="0" stop-color="#c4b5fd"/><stop offset="1" stop-color="#8b5cf6"/></linearGradient></defs><circle cx="100" cy="100" r="86" stroke="rgba(255,255,255,.08)" stroke-width="12" fill="none"/><circle cx="100" cy="100" r="86" stroke="url(#rg)" stroke-width="12" fill="none" stroke-linecap="round" stroke-dasharray="540" stroke-dashoffset="22"/></svg>
<div class="c"><div><b>87</b><span class="tiny">${esc(k.days)}</span></div></div></div>
<div class="tiny" style="text-align:center;margin-bottom:14px">${esc(k.reset)}</div>
${heir(strip(k.h1)[0], '#c4b5fd', k.h1)}${heir(strip(k.h2)[0], '#93c5fd', k.h2)}${heir(strip(k.h3)[0], '#6ee7b7', k.h3)}
<div class="row"><span class="l">${ICONS.lock.replace('width="22" height="22"', 'width="16" height="16"')}${esc(k.msg)}</span><b style="color:#6ee7b7">✓</b></div></div>`
}

function page(pageKey, lang) {
  const P = PAGES[pageKey], c = P.copy[lang], ui = UI[lang]
  const other = pageKey === 'zakat' ? 'guardian' : 'zakat'
  const url = ORIGIN + pathFor(pageKey, lang)
  const rtl = lang === 'ar'
  const arrow = rtl ? '←' : '→'
  const appName = pageKey === 'zakat' ? (lang === 'en' ? 'WalletLens Zakat Calculator' : `WalletLens ${strip(c.crumb)}`) : 'WalletLens Portfolio Guardian'

  const alternates = LANGS.map(l => `<link rel="alternate" hreflang="${l}" href="${ORIGIN + pathFor(pageKey, l)}">`).join('\n')
    + `\n<link rel="alternate" hreflang="x-default" href="${ORIGIN + pathFor(pageKey, 'en')}">`
  const ogAlt = LANGS.filter(l => l !== lang).map(l => `<meta property="og:locale:alternate" content="${LOCALE[l]}">`).join('\n')
  const switcher = LANGS.map(l => `<a href="${pathFor(pageKey, l)}" hreflang="${l}" lang="${l}" title="${esc(UI[l].name)}"${l === lang ? ' aria-current="page"' : ''}>${l.toUpperCase()}</a>`).join('')

  const graph = {
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'Organization', '@id': `${ORIGIN}/#org`, name: 'WalletLens', url: `${ORIGIN}/`, logo: `${ORIGIN}/icon-512.png`, sameAs: [PLAY, MS, CHROME] },
      { '@type': 'WebPage', '@id': `${url}#page`, url, name: strip(c.title), description: c.desc, inLanguage: lang, isPartOf: { '@type': 'WebSite', '@id': `${ORIGIN}/#site`, name: 'WalletLens', url: `${ORIGIN}/` }, publisher: { '@id': `${ORIGIN}/#org` }, dateModified: UPDATED, breadcrumb: { '@id': `${url}#crumbs` }, mainEntity: { '@id': `${url}#app` }, speakable: { '@type': 'SpeakableSpecification', cssSelector: ['h1', '#answer p'] } },
      { '@type': 'WebApplication', '@id': `${url}#app`, name: appName, url, applicationCategory: 'FinanceApplication', operatingSystem: 'Web, Android, Windows, ChromeOS', inLanguage: LANGS, isAccessibleForFree: true, offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' }, description: c.answer, featureList: c.feats.map(f => f[1]), publisher: { '@id': `${ORIGIN}/#org` } },
      { '@type': 'HowTo', name: c.howToName, inLanguage: lang, totalTime: 'PT5M', step: c.steps.map((s, i) => ({ '@type': 'HowToStep', position: i + 1, name: s[0], text: s[1], url: `${url}#how` })) },
      { '@type': 'FAQPage', '@id': `${url}#faq`, inLanguage: lang, mainEntity: c.faq.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) },
      { '@type': 'BreadcrumbList', '@id': `${url}#crumbs`, itemListElement: [
        { '@type': 'ListItem', position: 1, name: ui.home, item: `${ORIGIN}/` },
        { '@type': 'ListItem', position: 2, name: strip(c.crumb), item: url },
      ] },
    ],
  }

  const visual = pageKey === 'zakat' ? zakatCard(c, ui) : guardianCard(c, ui)
  const timeline = pageKey === 'guardian' ? `
<section aria-labelledby="safe"><div class="wrap"><h2 id="safe">${c.tlH}</h2><p class="lead">${esc(c.tlP)}</p>
<ol class="tl">${c.tl.map((x, i) => `<li><i>${ICONS[TL_ICONS[i]]}</i><div><h3>${esc(x[0])}</h3><p>${esc(x[1])}</p></div></li>`).join('')}</ol>
<ul class="chips">${c.shared.map(x => `<li class="ok">✓ ${esc(x)}</li>`).join('')}${c.never.map(x => `<li class="no">✕ ${esc(x)}</li>`).join('')}</ul></div></section>` : ''

  return `<!doctype html>
<html lang="${lang}" dir="${rtl ? 'rtl' : 'ltr'}">
<head>
<meta charset="utf-8">
${MS_SCRIPT}
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${esc(c.title)}</title>
<meta name="description" content="${esc(c.desc)}">
<meta name="keywords" content="${esc(c.keywords)}">
<link rel="canonical" href="${url}">
${alternates}
<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1">
<meta name="theme-color" content="#07080a">
<meta name="color-scheme" content="dark">
<meta property="og:type" content="website">
<meta property="og:site_name" content="WalletLens">
<meta property="og:locale" content="${LOCALE[lang]}">
${ogAlt}
<meta property="og:title" content="${esc(c.title)}">
<meta property="og:description" content="${esc(c.desc)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${ORIGIN}/og-image.png">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(c.title)}">
<meta name="twitter:description" content="${esc(c.desc)}">
<meta name="twitter:image" content="${ORIGIN}/og-image.png">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/icon-192.png">
<link rel="alternate" type="text/plain" title="LLM summary" href="${ORIGIN}/llms.txt">
${rtl
    ? '<link rel="preload" href="/fonts/ibm-plex-sans-arabic-700-arabic.woff2" as="font" type="font/woff2" crossorigin>\n<link rel="preload" href="/fonts/ibm-plex-sans-arabic-400-arabic.woff2" as="font" type="font/woff2" crossorigin>'
    : '<link rel="preload" href="/fonts/sora-latin.woff2" as="font" type="font/woff2" crossorigin>\n<link rel="preload" href="/fonts/manrope-latin.woff2" as="font" type="font/woff2" crossorigin>'}
<script type="application/ld+json">${ld(graph)}</script>
${GTAG}
<style>${CSS}</style>
</head>
<body class="${pageKey}">
<a class="skip" href="#main">${esc(ui.skip)}</a>
<main id="main">
<div class="top"><div class="bgfx" aria-hidden="true"></div><div class="wrap">
<nav aria-label="WalletLens"><a class="brand" href="/">${LOGO}<span>WalletLens</span></a><div class="nl"><a href="#features">${esc(ui.features)}</a><a href="#faq">${esc(ui.faq)}</a><div class="lang" role="navigation" aria-label="Language">${switcher}</div></div></nav>
<header class="hero"><div><span class="kick">${esc(c.kick)}</span><h1>${c.h1}</h1><p class="sub">${esc(c.sub)}</p>
<div class="ctas"><a class="btn" href="${P.cta(lang)}" data-cta="${pageKey}_hero">${esc(c.cta)} ${arrow}</a><a class="btn g" href="#how">${esc(c.cta2)}</a></div>
<ul class="trust">${c.trust.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>${visual}</header>
</div></div>
<section id="answer" aria-labelledby="answer-h"><div class="wrap"><div class="answer"><div><h2 id="answer-h">${esc(c.answerH)}</h2><p>${esc(c.answer)}</p></div>
<dl aria-label="${esc(ui.facts)}">${c.facts.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl></div></div></section>
<section id="how" aria-labelledby="how-h"><div class="wrap"><h2 id="how-h">${c.howH}</h2><p class="lead">${esc(c.howP)}</p>
<ol class="steps">${c.steps.map(x => `<li class="step"><h3>${esc(x[0])}</h3><p>${esc(x[1])}</p></li>`).join('')}</ol></div></section>
${timeline}
<section id="features" aria-labelledby="feat-h"><div class="wrap"><h2 id="feat-h">${c.fH}</h2>
<div class="bento">${c.feats.map((x, i) => `<article class="bx${i === 0 ? ' w' : i === 5 ? ' w full' : ''}"><div class="ico">${ICONS[x[0]]}</div><h3>${esc(x[1])}</h3><p>${esc(x[2])}</p></article>`).join('')}</div></div></section>
<section id="faq" aria-labelledby="faq-h"><div class="wrap"><h2 id="faq-h">${esc(ui.faqH)}</h2>
${c.faq.map(([q, a], i) => `<details${i === 0 ? ' open' : ''}><summary><h3>${esc(q)}</h3></summary><p>${esc(a)}</p></details>`).join('\n')}
<p class="note">${esc(c.note)}</p></div></section>
<section aria-labelledby="end-h"><div class="wrap"><div class="final"><h2 id="end-h">${c.endH}</h2><p class="lead">${esc(c.endP)}</p>
<div class="ctas"><a class="btn" href="${P.cta(lang)}" data-cta="${pageKey}_final">${esc(c.cta)} ${arrow}</a></div>
<div class="stores"><a href="${PLAY}" rel="noopener">Google Play</a><a href="${MS}" rel="noopener">Microsoft Store</a><a href="/chrome-extension/">Chrome</a></div></div></div></section>
</main>
<div class="wrap"><footer><span>© 2026 WalletLens · ${esc(ui.foot)} · <time datetime="${UPDATED}">${UPDATED}</time></span>
<nav aria-label="${esc(ui.more)}"><a href="${pathFor(other, lang)}">${esc(ui[other])}</a><a href="${pageKey === 'zakat' ? P.cta(lang) : PAGES.zakat.cta(lang)}">${esc(ui.calc)}</a><a href="/chrome-extension/">${esc(ui.ext)}</a><a href="/privacy">${esc(ui.privacy)}</a><a href="/terms">${esc(ui.terms)}</a><a href="/faq">${esc(ui.faq)}</a></nav></footer></div>
</body>
</html>
`
}

export function buildLandings() {
  return Object.keys(PAGES).flatMap(p => LANGS.map(l => ({ page: p, lang: l, path: pathFor(p, l), html: page(p, l) })))
}
