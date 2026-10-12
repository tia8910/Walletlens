import { useState, useEffect, useRef } from 'react'
import { noteFeatureUse } from '../featureUse'
import { Link } from 'react-router-dom'
import { track } from '../analytics'
import { useTheme } from '../ThemeContext'
import { POSTS } from '../data/blogPosts'
import { useLanguage } from '../LanguageContext'
import { shareFile } from '../fileOut'
import { hacks as academyHacks } from '../data/academyContent'
import { videoForHack } from '../data/academyVideos'
import { academyCopy } from '../data/academyCopy'
import AcademyWatch from '../components/AcademyWatch'

// The Academy: video lessons first (AcademyWatch), then the reading, the
// investment hacks and the articles, each on a page of its own. There are no
// points, ranks, badges or games any more; what a lesson leaves behind is its
// takeaway and a way into the part of the app that puts it to work.

const CAT_COLORS = {
  Entry: 'var(--g)', Risk: '#f87171', Strategy: '#a78bfa',
  Portfolio: '#60a5fa', Profit: '#fbbf24', Psychology: '#f472b6',
  Research: '#38bdf8',
}
const CAT_COLORS_LIGHT = {
  Entry:      '#15803d',
  Risk:       '#dc2626',
  Strategy:   '#6d28d9',
  Portfolio:  '#1d4ed8',
  Profit:     '#b45309',
  Psychology: '#be185d',
  Research:   '#0369a1',
}

// ── Share hack as image ────────────────────────────────────────────────────
function drawHackImage(hack, color) {
  const W = 1200, H = 630
  const c = document.createElement('canvas')
  c.width = W; c.height = H
  const ctx = c.getContext('2d')
  const gRgb = getComputedStyle(document.documentElement).getPropertyValue('--g-rgb').trim() || '0,200,83'

  // Background
  ctx.fillStyle = '#071a0c'
  ctx.fillRect(0, 0, W, H)

  // Subtle grid lines
  ctx.strokeStyle = `rgba(${gRgb},0.06)`
  ctx.lineWidth = 1
  for (let x = 0; x < W; x += 60) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke() }
  for (let y = 0; y < H; y += 60) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke() }

  // Left accent bar
  ctx.fillStyle = color
  ctx.fillRect(0, 0, 6, H)

  // WalletLens logo — magnifying glass with chart bars (matches Logo.jsx @ 64×64 viewBox)
  // Scale factor: render at ~80px → scale = 80/64 = 1.25, offset to (32, 32)
  const logoScale = 1.25, ox = 32, oy = 32
  const lt = (x, y) => [ox + x * logoScale, oy + y * logoScale]
  // Gradient: #4ade80 → #16a34a
  const lg = ctx.createLinearGradient(...lt(5, 5), ...lt(52, 52))
  lg.addColorStop(0, '#4ade80'); lg.addColorStop(0.5, '#16a34a'); lg.addColorStop(1, '#14532d')
  // Main ring
  const [rcx, rcy] = lt(27, 25)
  ctx.strokeStyle = lg; ctx.lineWidth = 5.5 * logoScale; ctx.globalAlpha = 1
  ctx.beginPath(); ctx.arc(rcx, rcy, 19 * logoScale, 0, Math.PI * 2); ctx.stroke()
  // Small dot upper-right
  const [dcx, dcy] = lt(40.5, 11.5)
  ctx.fillStyle = '#4ade80'
  ctx.beginPath(); ctx.arc(dcx, dcy, 3.8 * logoScale, 0, Math.PI * 2); ctx.fill()
  // Ascending bars
  ctx.fillStyle = lg
  const bars = [[14.5, 26.5, 5, 7.5], [21.5, 21, 5, 13], [28.5, 15.5, 5, 18.5]]
  for (const [bx, by, bw, bh] of bars) {
    const [px, py] = lt(bx, by)
    ctx.beginPath(); ctx.roundRect(px, py, bw * logoScale, bh * logoScale, 1.2 * logoScale); ctx.fill()
  }
  // Handle
  ctx.strokeStyle = lg; ctx.lineWidth = 5.5 * logoScale; ctx.lineCap = 'round'
  ctx.beginPath(); ctx.moveTo(...lt(13.5, 39)); ctx.lineTo(...lt(4, 55)); ctx.stroke()

  // Brand name
  ctx.fillStyle = '#ffffff'
  ctx.font = 'bold 28px system-ui, sans-serif'
  ctx.fillText('WalletLens', 122, 65)
  ctx.fillStyle = 'rgba(255,255,255,0.45)'
  ctx.font = '18px system-ui, sans-serif'
  ctx.fillText('walletlens.live', 124, 90)

  // Category pill
  ctx.fillStyle = color + '33'
  const pillW = 140, pillH = 36
  ctx.beginPath(); ctx.roundRect(68, 150, pillW, pillH, 18); ctx.fill()
  ctx.fillStyle = color
  ctx.font = 'bold 17px system-ui, sans-serif'
  ctx.fillText(`${hack.icon}  ${hack.cat}`, 88, 174)

  // Title
  ctx.fillStyle = '#ffffff'
  ctx.font = 'bold 52px system-ui, sans-serif'
  const words = hack.title.split(' ')
  let line = '', y = 260, lineH = 64
  for (const w of words) {
    const test = line ? line + ' ' + w : w
    if (ctx.measureText(test).width > W - 136) { ctx.fillText(line, 68, y); line = w; y += lineH }
    else line = test
  }
  ctx.fillText(line, 68, y)

  // Body text (wrapped, smaller)
  ctx.fillStyle = 'rgba(255,255,255,0.65)'
  ctx.font = '24px system-ui, sans-serif'
  const bodyWords = hack.body.split(' ')
  let bl = '', by = y + 70, bLineH = 38, bLines = 0
  for (const w of bodyWords) {
    const test = bl ? bl + ' ' + w : w
    if (ctx.measureText(test).width > W - 136) {
      if (bLines < 3) { ctx.fillText(bl, 68, by); by += bLineH; bLines++ }
      bl = w
    } else bl = test
  }
  if (bLines < 3 && bl) ctx.fillText(bl, 68, by)

  // Bottom bar
  ctx.fillStyle = 'rgba(255,255,255,0.06)'
  ctx.fillRect(0, H - 60, W, 60)
  ctx.fillStyle = 'rgba(255,255,255,0.35)'
  ctx.font = '18px system-ui, sans-serif'
  ctx.fillText('💡 Investment Hack  •  walletlens.live/academy', 68, H - 22)

  return c.toDataURL('image/png')
}

async function shareHackToX(hack, color) {
  const dataUrl = drawHackImage(hack, color)
  const text = `${hack.icon} ${hack.title}\n\n${hack.body.slice(0, 160)}…\n\n#WalletLens #Crypto #InvestmentTips`
  const xUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent('https://walletlens.live')}`

  // The share sheet where there is one — the browser's, or Android's through
  // the bridge — and a saved file where there is not.
  try {
    if (await shareFile(dataUrl, 'walletlens-hack.png', { title: hack.title, text }) === 'shared') return
  } catch { /* fall through to the compose window */ }

  // Desktop: the image is saved above, so it can be attached to the post.
  setTimeout(() => window.open(xUrl, '_blank'), 400)
}

// ── Article helpers ───────────────────────────────────────────────────────
// Ids, not labels: getArticleCat returns these and the filter compares them.
const ARTICLE_CATS = ['All', 'Crypto', 'Strategy', 'Net Worth', 'Tracking', 'Tax & P&L']
const ARTICLE_CAT_KEYS = {
  All: 'txAll', Crypto: 'assetCrypto', Strategy: 'ayCatStrategy',
  'Net Worth': 'ayCatNetWorth', Tracking: 'ayCatTracking', 'Tax & P&L': 'ayCatTax',
}

function getArticleCat(slug) {
  if (/net-worth|grow-your-net|calculate-your-net|tracker-vs-spread|best-free-net-worth/.test(slug)) return 'Net Worth'
  if (/tax|profit-calculator|cost-basis/.test(slug)) return 'Tax & P&L'
  if (/diversif|profit-target|dca|dollar-cost|position-sizing|rebalance|portfolio-allocation/.test(slug)) return 'Strategy'
  if (/track|portfolio-tracker|alternatives|apple-stock|gold-silver|bitcoin-portfolio/.test(slug)) return 'Tracking'
  return 'Crypto'
}

const ARTICLE_CAT_COLORS = {
  Crypto:     { dark: '#60a5fa', light: '#1d4ed8' },
  Strategy:   { dark: '#a78bfa', light: '#6d28d9' },
  'Net Worth': { dark: 'var(--g)', light: '#15803d' },
  Tracking:   { dark: '#fbbf24', light: '#b45309' },
  'Tax & P&L': { dark: '#f87171', light: '#dc2626' },
}

// ── HackCard ──────────────────────────────────────────────────────────────
function HackCard({ hack, color, startOpen = false, video = null, onPlay }) {
  const { t } = useLanguage()
  const [open, setOpen] = useState(startOpen)
  const [sharing, setSharing] = useState(false)
  const cardRef = useRef(null)

  // Arrived from a notification about THIS hack. Opened above, and brought
  // into view here — a card that expands off-screen looks like a tap that did
  // nothing, which on this path is the second time the app has failed to take
  // the reader where it said it would.
  useEffect(() => {
    if (!startOpen || !cardRef.current) return
    // After paint: the list above this card is still laying out on mount, so
    // scrolling now would aim at a position that is about to move.
    const id = requestAnimationFrame(() => {
      try { cardRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' }) }
      catch { /* older WebViews: the card is open, which is the main thing */ }
    })
    return () => cancelAnimationFrame(id)
  }, [startOpen])

  async function handleShare(e) {
    e.stopPropagation()
    setSharing(true)
    track('hack_share', { title: hack.title })
    await shareHackToX(hack, color)
    setSharing(false)
  }

  return (
    <div ref={cardRef}
      className={`acad-hack-card ${open ? 'acad-hack-open' : ''}`}
      onClick={() => { if (!open) track('hack_expand', { title: hack.title, cat: hack.cat }); setOpen(o => !o) }}
      style={{ '--hack-color': color }}>
      <div className="acad-hack-header">
        <span className="acad-hack-icon">{hack.icon}</span>
        <div className="acad-hack-meta">
          <span className="acad-hack-cat" style={{ color }}>{t(hack.catKey)}</span>
          <div className="acad-hack-title">{hack.title}</div>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:'0.5rem' }}>
          {video && (
            <button type="button" className="hack-play-btn" onClick={(e) => { e.stopPropagation(); onPlay(video) }}
              aria-label={video.name} title={video.name}>
              <svg width="12" height="12" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z" fill="currentColor"/></svg>
            </button>
          )}
          <button className="hack-share-btn" onClick={handleShare} disabled={sharing}
            title={t('share')}>
            {sharing ? '⏳' : '𝕏'}
          </button>
          <span className="acad-hack-chevron">{open ? '▲' : '▼'}</span>
        </div>
      </div>
      {open && (
        <div className="acad-hack-body">{hack.body}</div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
export default function Academy() {
  // Records the discovery, so the feature tip for this page stops being
  // offered to someone who has already found it.
  useEffect(() => { noteFeatureUse('academy'); track('academy_view') }, [])

  const { t, lang } = useLanguage()
  const c = academyCopy(lang)
  const { mode: themeMode } = useTheme()
  const isLight = themeMode === 'light'

  // Where the reader arrived: a hack from a notification (?tab=hacks&hack=N),
  // the articles, or a video (?video=key) from the bell, a push or Home.
  // Links to the old game tabs land on the lessons.
  const [view, setView] = useState(() => {
    try {
      const tab = new URLSearchParams(window.location.search).get('tab')
      if (tab === 'hacks' || tab === 'articles') return tab
    } catch { /* no window */ }
    return 'lessons'
  })
  const [openVideo, setOpenVideo] = useState(() => {
    try { return new URLSearchParams(window.location.search).get('video') || null } catch { return null }
  })

  // Which hack a notification asked for, as an index into the list. The index
  // is the one the push worker's rotation recorded, so the link and the
  // rotation cannot disagree. Read once, on mount.
  const [deepLinkedHack] = useState(() => {
    try {
      const raw = new URLSearchParams(window.location.search).get('hack')
      if (raw === null) return -1
      const n = Number(raw)
      return Number.isInteger(n) && n >= 0 ? n : -1
    } catch { return -1 }
  })
  const [articleFilter, setArticleFilter] = useState('All')
  const hackList = academyHacks(lang)

  const go = (v) => { setView(v); track('academy_view_switch', { view: v }); try { window.scrollTo({ top: 0 }) } catch { /* old WebView */ } }

  return (
    <div className="acad-root">
      <div className="acad-header aw-page-head">
        {view !== 'lessons' && (
          <button type="button" className="aw-back-ic" onClick={() => go('lessons')} aria-label={c.back} title={c.back}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M15 18l-6-6 6-6" /></svg>
          </button>
        )}
        <div>
          <div className="acad-title">{view === 'hacks' ? c.hacks : view === 'articles' ? c.articles : c.title}</div>
          <div className="acad-subtitle muted">{view === 'lessons' ? c.sub : view === 'hacks' ? c.hacksSub(hackList.length) : c.articlesSub}</div>
        </div>
      </div>

      {view === 'lessons' && (
        <AcademyWatch openKey={openVideo} onOpened={() => setOpenVideo(null)}
          onOpenHacks={() => go('hacks')} onOpenArticles={() => go('articles')} hackCount={hackList.length} />
      )}

      {view === 'hacks' && (
        <div className="acad-hacks-list">
          {hackList.map((h, i) => {
            const palette = isLight ? CAT_COLORS_LIGHT : CAT_COLORS
            const color = palette[h.cat] || (isLight ? '#15803d' : '#a78bfa')
            return (
              <HackCard key={i} hack={h} color={color} startOpen={i === deepLinkedHack}
                video={videoForHack(i)} onPlay={(v) => { setOpenVideo(v.key); setView('lessons'); track('hack_video_click', { video: v.key }) }} />
            )
          })}
        </div>
      )}

      {view === 'articles' && (
        <div className="acad-articles-wrap">
          <div className="acad-articles-filters">
            {ARTICLE_CATS.map(cat => (
              <button
                key={cat}
                className={`acad-articles-filter-btn ${articleFilter === cat ? 'acad-articles-filter-active' : ''}`}
                onClick={() => { setArticleFilter(cat); track('academy_article_filter', { cat }) }}
              >
                {t(ARTICLE_CAT_KEYS[cat] || cat)}
              </button>
            ))}
          </div>
          <div className="acad-articles-list">
            {POSTS
              .filter(p => articleFilter === 'All' || getArticleCat(p.slug) === articleFilter)
              .map(post => {
                const cat = getArticleCat(post.slug)
                const catColor = isLight
                  ? (ARTICLE_CAT_COLORS[cat]?.light || '#15803d')
                  : (ARTICLE_CAT_COLORS[cat]?.dark || 'var(--g)')
                return (
                  <Link
                    key={post.slug}
                    to={`/blog/${post.slug}/`}
                    className="acad-article-card"
                    onClick={() => track('academy_article_click', { slug: post.slug, cat })}
                  >
                    <div className="acad-article-top">
                      <span className="acad-article-cat" style={{ color: catColor, borderColor: catColor + '44', background: catColor + '12' }}>{t(ARTICLE_CAT_KEYS[cat] || cat)}</span>
                      <span className="acad-article-time muted">{post.readTime}</span>
                    </div>
                    <div className="acad-article-title">{post.title}</div>
                    <div className="acad-article-summary muted">{post.summary.length > 120 ? post.summary.slice(0, 120) + '…' : post.summary}</div>
                    <div className="acad-article-cta">{t('ayReadArticle')} →</div>
                  </Link>
                )
              })}
          </div>
        </div>
      )}
    </div>
  )
}
