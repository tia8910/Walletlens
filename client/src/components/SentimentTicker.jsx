import { useEffect, useRef, useState } from 'react'

// ── Sentiment keyword scoring ─────────────────────────────────────────────
const BULLISH_KW = ['bullish','surge','rally','adoption','institutional','etf','approval','milestone','record high','all-time','growth','rises','soars','breakout','recovery','outperform','upgrade','inflows','accumulate','moon']
const BEARISH_KW = ['bearish','crash','drop','hack','ban','regulation','fear','sell-off','liquidation','decline','dump','plunge','correction','outflows','concern','warning','exploit','lawsuit','seizure','freeze']

function scoreText(text) {
  const t = (text || '').toLowerCase()
  const b = BULLISH_KW.filter(w => t.includes(w)).length
  const br = BEARISH_KW.filter(w => t.includes(w)).length
  return b - br
}

async function fetchSentiment() {
  try {
    const res = await fetch('/news.json?t=' + Math.floor(Date.now() / 3600000))
    if (res.ok) {
      const { articles = [] } = await res.json()
      let total = 0
      articles.slice(0, 30).forEach(a => { total += scoreText(a.title + ' ' + (a.description || '')) })
      return total
    }
  } catch {}
  return null
}

// ── Portfolio tips ────────────────────────────────────────────────────────
function buildTips(holdings, totalValue, totalPnLPct, sentimentScore) {
  const tips = []
  const isBullish = sentimentScore > 1
  const isBearish = sentimentScore < -1

  if (isBullish)  tips.push('📈 Market sentiment is BULLISH — momentum is on your side, watch for breakout entries')
  if (isBearish)  tips.push('📉 Market sentiment is BEARISH — tighten stop-losses and avoid over-leveraging')
  if (!isBullish && !isBearish) tips.push('😐 Market sentiment is NEUTRAL — wait for a clear directional signal before adding size')

  if (!holdings.length) return tips

  const sorted = [...holdings].sort((a, b) => b.value - a.value)
  const topHolding = sorted[0]
  const topPct = totalValue > 0 ? (topHolding.value / totalValue) * 100 : 0

  if (topPct > 50) tips.push(`⚖️ ${topHolding.coin_symbol?.toUpperCase()} makes up ${topPct.toFixed(0)}% of your portfolio — consider diversifying to reduce concentration risk`)

  const gainers = [...holdings].filter(h => h.pnlPct > 15).sort((a, b) => b.pnlPct - a.pnlPct)
  if (gainers.length) {
    const g = gainers[0]
    tips.push(`💹 ${g.coin_symbol?.toUpperCase()} is up ${g.pnlPct.toFixed(1)}% — consider taking partial profits to lock in gains`)
  }

  const losers = [...holdings].filter(h => h.pnlPct < -15).sort((a, b) => a.pnlPct - b.pnlPct)
  if (losers.length) {
    const l = losers[0]
    tips.push(`⚠️ ${l.coin_symbol?.toUpperCase()} is down ${Math.abs(l.pnlPct).toFixed(1)}% — review your thesis or set a stop-loss`)
  }

  const movers24 = [...holdings].filter(h => h.pct24h != null)
  const topMover = movers24.sort((a, b) => Math.abs(b.pct24h) - Math.abs(a.pct24h))[0]
  if (topMover && Math.abs(topMover.pct24h) > 5) {
    const dir = topMover.pct24h > 0 ? `+${topMover.pct24h.toFixed(1)}%` : `${topMover.pct24h.toFixed(1)}%`
    tips.push(`⚡ ${topMover.coin_symbol?.toUpperCase()} moved ${dir} in 24 h — monitor for continuation or reversal`)
  }

  if (totalPnLPct != null) {
    if (totalPnLPct > 30)  tips.push(`🎯 Portfolio up ${totalPnLPct.toFixed(1)}% overall — a great time to review your profit targets and rebalance`)
    if (totalPnLPct < -15) tips.push(`🔴 Portfolio down ${Math.abs(totalPnLPct).toFixed(1)}% overall — risk management and position sizing are key right now`)
  }

  if (holdings.length === 1) tips.push('🌐 You hold only one asset — adding 2–3 more uncorrelated assets can reduce overall risk')

  return tips.length ? tips : ['💡 Keep monitoring your portfolio — consistency and patience are key to long-term growth']
}

// ── Component ─────────────────────────────────────────────────────────────
export default function SentimentTicker({ holdings = [], totalValue = 0, totalPnLPct = null }) {
  const [sentimentScore, setSentimentScore] = useState(null)
  const [tips, setTips] = useState([])
  const trackRef = useRef(null)
  const animRef  = useRef(null)
  const posRef   = useRef(0)
  const pauseRef = useRef(false)

  // Fetch sentiment once on mount
  useEffect(() => {
    fetchSentiment().then(score => {
      setSentimentScore(score ?? 0)
    })
  }, [])

  // Rebuild tips whenever holdings or sentiment changes
  useEffect(() => {
    if (sentimentScore === null) return
    setTips(buildTips(holdings, totalValue, totalPnLPct, sentimentScore))
  }, [holdings, totalValue, totalPnLPct, sentimentScore])

  // Scroll animation
  useEffect(() => {
    const el = trackRef.current
    if (!el || tips.length === 0) return
    posRef.current = 0
    el.style.transform = 'translateX(0px)'

    function step() {
      if (!pauseRef.current) {
        posRef.current -= 0.6
        const half = el.scrollWidth / 2
        if (Math.abs(posRef.current) >= half) posRef.current = 0
        el.style.transform = `translateX(${posRef.current}px)`
      }
      animRef.current = requestAnimationFrame(step)
    }
    animRef.current = requestAnimationFrame(step)
    return () => cancelAnimationFrame(animRef.current)
  }, [tips])

  if (sentimentScore === null || tips.length === 0) return null

  const isBullish = sentimentScore > 1
  const isBearish = sentimentScore < -1
  const label     = isBullish ? 'BULLISH' : isBearish ? 'BEARISH' : 'NEUTRAL'
  const accent    = isBullish ? '#10b981' : isBearish ? '#ef4444' : '#94a3b8'
  const bgColor   = isBullish ? 'rgba(16,185,129,0.08)' : isBearish ? 'rgba(239,68,68,0.08)' : 'rgba(148,163,184,0.06)'
  const borderColor = isBullish ? 'rgba(16,185,129,0.25)' : isBearish ? 'rgba(239,68,68,0.25)' : 'rgba(148,163,184,0.18)'

  const doubled = [...tips, ...tips]

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 0,
      background: bgColor, border: `1px solid ${borderColor}`,
      borderRadius: '10px', overflow: 'hidden',
      margin: '0 0 0.75rem', minHeight: '36px',
      transition: 'background 0.4s, border-color 0.4s',
    }}>
      {/* Sentiment badge — fixed left */}
      <div style={{
        flexShrink: 0, display: 'flex', alignItems: 'center', gap: '0.35rem',
        padding: '0 0.75rem', height: '36px', background: accent,
        color: '#fff', fontWeight: 800, fontSize: '0.7rem', letterSpacing: '0.06em',
        whiteSpace: 'nowrap',
      }}>
        {isBullish ? '📈' : isBearish ? '📉' : '😐'} {label}
      </div>

      {/* Scrolling tips track */}
      <div style={{ flex: 1, overflow: 'hidden', position: 'relative', height: '36px',
        maskImage: 'linear-gradient(to right, transparent 0, black 3%, black 97%, transparent 100%)',
        WebkitMaskImage: 'linear-gradient(to right, transparent 0, black 3%, black 97%, transparent 100%)',
      }}
        onMouseEnter={() => { pauseRef.current = true }}
        onMouseLeave={() => { pauseRef.current = false }}
        onTouchStart={() => { pauseRef.current = true }}
        onTouchEnd={() => { pauseRef.current = false }}
      >
        <div ref={trackRef} style={{ display: 'flex', alignItems: 'center', height: '100%', willChange: 'transform' }}>
          {doubled.map((tip, i) => (
            <span key={i} style={{
              whiteSpace: 'nowrap', padding: '0 1.5rem',
              fontSize: '0.75rem', fontWeight: 600,
              color: 'var(--text, #0f172a)', lineHeight: 1,
            }}>
              {tip}
              <span style={{ marginLeft: '1.5rem', color: accent, opacity: 0.6 }}>●</span>
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
