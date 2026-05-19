import { useEffect, useState, useRef } from 'react'
import { useTheme } from '../ThemeContext'

// Weighted keyword lists for sentiment scoring
const BULLISH = [
  'surge', 'surges', 'surging', 'rally', 'rallies', 'rallying', 'soar', 'soars', 'soaring',
  'breakout', 'all-time high', 'ath', 'record high', 'bull', 'bullish', 'pump', 'pumps',
  'gain', 'gains', 'gaining', 'rise', 'rises', 'rising', 'moon', 'mooning', 'explode',
  'skyrocket', 'outperform', 'upgrade', 'adoption', 'institutional', 'etf approval',
  'accumulate', 'buy', 'inflows', 'positive', 'growth', 'recover', 'recovery', 'bounce',
  'milestone', 'partnership', 'launch', 'mainstream', 'approved', 'listing',
]

const BEARISH = [
  'crash', 'crashes', 'crashing', 'plunge', 'plunges', 'plunging', 'dump', 'dumps', 'dumping',
  'collapse', 'collapses', 'collapsing', 'sell-off', 'selloff', 'bear', 'bearish', 'drop',
  'drops', 'dropping', 'slump', 'slumps', 'slumping', 'fall', 'falls', 'falling',
  'all-time low', 'atl', 'record low', 'hack', 'hacked', 'exploit', 'exploited', 'scam',
  'rug pull', 'ban', 'banned', 'regulation', 'sec', 'lawsuit', 'fraud', 'bankrupt',
  'outflows', 'fear', 'panic', 'liquidation', 'liquidated', 'warning', 'risk', 'concern',
  'loss', 'losses', 'losing', 'decline', 'declining', 'downgrade', 'negative',
]

const FEAR_WORDS = [
  'fear', 'panic', 'crash', 'hack', 'exploit', 'scam', 'rug', 'ban', 'banned',
  'lawsuit', 'fraud', 'bankrupt', 'liquidation', 'plunge', 'collapse', 'dump',
]

const GREED_WORDS = [
  'ath', 'all-time high', 'record high', 'moon', 'surge', 'soar', 'rally',
  'breakout', 'bull run', 'institutional', 'adoption', 'etf', 'skyrocket', 'explode',
]

function scoreText(text) {
  const lower = text.toLowerCase()
  let bull = 0, bear = 0, fear = 0, greed = 0

  for (const w of BULLISH)  if (lower.includes(w)) bull++
  for (const w of BEARISH)  if (lower.includes(w)) bear++
  for (const w of FEAR_WORDS)  if (lower.includes(w)) fear++
  for (const w of GREED_WORDS) if (lower.includes(w)) greed++

  return { bull, bear, fear, greed }
}

// Aggregate article scores into a 0-100 sentiment score
// 0 = extreme fear, 50 = neutral, 100 = extreme greed
function computeMood(articles) {
  if (!articles.length) return null

  let totalBull = 0, totalBear = 0, totalFear = 0, totalGreed = 0, n = 0

  for (const a of articles) {
    const text = (a.title || '') + ' ' + (a.description || '')
    const s = scoreText(text)
    totalBull += s.bull
    totalBear += s.bear
    totalFear += s.fear
    totalGreed += s.greed
    n++
  }

  if (n === 0) return null

  // Base sentiment: ratio of bullish to total sentiment signals
  const totalSignals = totalBull + totalBear
  const bullRatio = totalSignals > 0 ? totalBull / totalSignals : 0.5

  // Adjust for fear/greed extremes
  const fearBoost   = Math.min(totalFear  / n, 1) * 20   // pulls toward 0
  const greedBoost  = Math.min(totalGreed / n, 1) * 20   // pulls toward 100

  // Score: 0–100
  let score = bullRatio * 100
  score = score - fearBoost + greedBoost
  score = Math.max(0, Math.min(100, score))

  return { score: Math.round(score), n }
}

function moodLabel(score) {
  if (score >= 80) return { label: 'Extreme Greed', color: '#22c55e', emoji: '🤑' }
  if (score >= 60) return { label: 'Greed',         color: '#86efac', emoji: '😏' }
  if (score >= 45) return { label: 'Neutral',        color: '#94a3b8', emoji: '😐' }
  if (score >= 25) return { label: 'Fear',           color: '#fb923c', emoji: '😰' }
  return                  { label: 'Extreme Fear',   color: '#f87171', emoji: '😱' }
}

// Animated arc dial
function Dial({ score, isLight }) {
  const canvasRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const W = canvas.clientWidth, H = canvas.clientHeight
    canvas.width  = Math.floor(W * dpr)
    canvas.height = Math.floor(H * dpr)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    const cx = W / 2, cy = H * 0.82
    const r  = Math.min(W, H) * 0.62
    const startAngle = Math.PI        // left (180°)
    const endAngle   = 2 * Math.PI    // right (360°)

    const needleColor = isLight ? 'rgba(0,0,0,0.75)' : '#fff'
    const trackColor  = isLight ? 'rgba(0,0,0,0.08)'  : 'rgba(255,255,255,0.07)'

    // Background arc track
    ctx.beginPath()
    ctx.arc(cx, cy, r, startAngle, endAngle)
    ctx.strokeStyle = trackColor
    ctx.lineWidth   = 10
    ctx.lineCap     = 'round'
    ctx.stroke()

    // Colour gradient arc
    const grad = ctx.createLinearGradient(cx - r, cy, cx + r, cy)
    grad.addColorStop(0,    '#f87171') // extreme fear
    grad.addColorStop(0.25, '#fb923c') // fear
    grad.addColorStop(0.5,  '#94a3b8') // neutral
    grad.addColorStop(0.75, '#86efac') // greed
    grad.addColorStop(1,    '#22c55e') // extreme greed

    const fillEnd = startAngle + (score / 100) * Math.PI
    ctx.beginPath()
    ctx.arc(cx, cy, r, startAngle, fillEnd)
    ctx.strokeStyle = grad
    ctx.lineWidth   = 10
    ctx.lineCap     = 'round'
    ctx.stroke()

    // Needle
    const needleAngle = startAngle + (score / 100) * Math.PI
    const nx = cx + (r - 2) * Math.cos(needleAngle)
    const ny = cy + (r - 2) * Math.sin(needleAngle)
    ctx.beginPath()
    ctx.moveTo(cx, cy)
    ctx.lineTo(nx, ny)
    ctx.strokeStyle = needleColor
    ctx.lineWidth   = 2.5
    ctx.lineCap     = 'round'
    ctx.stroke()

    // Centre dot
    ctx.beginPath()
    ctx.arc(cx, cy, 5, 0, Math.PI * 2)
    ctx.fillStyle = needleColor
    ctx.fill()
  }, [score, isLight])

  return <canvas ref={canvasRef} style={{ width: '100%', height: '90px', display: 'block' }} />
}

const RSS_FEEDS = [
  { name: 'CoinTelegraph', url: 'https://cointelegraph.com/rss' },
  { name: 'CoinDesk',      url: 'https://www.coindesk.com/arc/outboundfeeds/rss/' },
  { name: 'Decrypt',       url: 'https://decrypt.co/feed' },
]

async function fetchHeadlines() {
  // 1. Try cached /news.json
  try {
    const res = await fetch('/news.json?t=' + Math.floor(Date.now() / 3600000))
    if (res.ok) {
      const d = await res.json()
      if (d.articles?.length) return d.articles
    }
  } catch { /* skip */ }

  // 2. Live RSS via CORS proxy
  const items = []
  await Promise.allSettled(RSS_FEEDS.map(async feed => {
    try {
      const res = await fetch('https://corsproxy.io/?' + encodeURIComponent(feed.url), { signal: AbortSignal.timeout(8000) })
      if (!res.ok) return
      const xml = await res.text()
      const doc = new DOMParser().parseFromString(xml, 'text/xml')
      for (const item of Array.from(doc.querySelectorAll('item')).slice(0, 20)) {
        const get = t => item.querySelector(t)?.textContent?.trim() || ''
        items.push({ title: get('title'), description: get('description').replace(/<[^>]+>/g, '').slice(0, 200) })
      }
    } catch { /* skip */ }
  }))
  return items
}

export default function MarketMood() {
  const { mode } = useTheme()
  const [mood, setMood] = useState(null)
  const [fetched, setFetched] = useState(false)

  useEffect(() => {
    if (fetched) return
    setFetched(true)
    fetchHeadlines().then(articles => {
      if (articles.length) setMood(computeMood(articles))
    })
  }, [])

  const info = mood ? moodLabel(mood.score) : null

  return (
    <div className="mm-root glass-card" style={{ padding: '1rem 1.2rem 0.9rem', marginBottom: '0.75rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.2rem' }}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.6 }}>
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z"/>
          <path d="M8 14s1.5 2 4 2 4-2 4-2"/>
          <line x1="9" y1="9" x2="9.01" y2="9"/>
          <line x1="15" y1="9" x2="15.01" y2="9"/>
        </svg>
        <span style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', opacity: 0.5 }}>
          Market Mood
        </span>
        <span style={{ fontSize: '0.68rem', color: 'var(--text-sub)', marginLeft: 'auto' }}>
          {mood ? `${mood.n} headlines` : ''}
        </span>
      </div>

      {mood ? (
        <>
          <Dial score={mood.score} isLight={mode === 'light'} />
          <div style={{ textAlign: 'center', marginTop: '-0.3rem', paddingBottom: '0.3rem' }}>
            <span style={{ fontSize: '1.3rem' }}>{info.emoji}</span>
            <span style={{ fontSize: '0.92rem', fontWeight: 800, color: info.color, marginLeft: '0.4rem' }}>
              {info.label}
            </span>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-sub)', marginLeft: '0.5rem' }}>
              {mood.score}/100
            </span>
          </div>
          <div style={{
            display: 'flex', justifyContent: 'space-between',
            fontSize: '0.62rem', color: 'var(--text-sub)',
            marginTop: '0.25rem', padding: '0 0.25rem',
          }}>
            <span>😱 Fear</span>
            <span>😐 Neutral</span>
            <span>🤑 Greed</span>
          </div>
        </>
      ) : (
        <div style={{ textAlign: 'center', padding: '1rem 0', color: 'var(--text-sub)', fontSize: '0.8rem' }}>
          Analysing headlines…
        </div>
      )}
    </div>
  )
}
