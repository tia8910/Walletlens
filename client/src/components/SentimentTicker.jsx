import { useEffect, useRef, useState } from 'react'
import Icon from './Icon'
import { useLanguage } from '../LanguageContext'

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
// Keys, not sentences: buildTips runs outside any component, so the translator
// is passed in rather than pulled from a hook.
const WISDOM_KEYS = ['stW1','stW2','stW3','stW4','stW5','stW6','stW7','stW8','stW9','stW10']


function buildTips(holdings, totalValue, totalPnLPct, sentimentScore, t) {
  const tips = []
  const isBullish = sentimentScore > 1
  const isBearish = sentimentScore < -1

  // Market sentiment
  if (isBullish) tips.push(t('stBullish'))
  if (isBearish) {
    tips.push(t('stBearish'))
    tips.push(t('stBearish2'))
    tips.push(t('stBearish3'))
  }
  if (!isBullish && !isBearish) tips.push(t('stNeutral'))

  if (!holdings.length) {
    tips.push(t('stFirstHolding'))
    tips.push(...WISDOM_KEYS.slice(0, 4).map(t))
    return tips
  }

  // Concentration risk
  const sorted = [...holdings].sort((a, b) => b.value - a.value)
  const topHolding = sorted[0]
  const topPct = totalValue > 0 ? (topHolding.value / totalValue) * 100 : 0
  if (topPct > 60) tips.push(t('stConcHeavy')(topHolding.coin_symbol?.toUpperCase(), topPct.toFixed(0)))
  else if (topPct > 40) tips.push(t('stConcLargest')(topHolding.coin_symbol?.toUpperCase(), topPct.toFixed(0)))

  // Gainers
  const gainers = [...holdings].filter(h => h.pnlPct > 10).sort((a, b) => b.pnlPct - a.pnlPct)
  if (gainers.length) {
    const g = gainers[0]
    tips.push(t('stGainer')(g.coin_symbol?.toUpperCase(), g.pnlPct.toFixed(1)))
  }

  // Losers — extra support when things are rough
  const losers = [...holdings].filter(h => h.pnlPct < -10).sort((a, b) => a.pnlPct - b.pnlPct)
  if (losers.length) {
    const l = losers[0]
    tips.push(t('stLoser')(l.coin_symbol?.toUpperCase(), Math.abs(l.pnlPct).toFixed(1)))
    tips.push(t('stLoserSupport')(l.coin_symbol?.toUpperCase()))
  }

  // 24 h movers (lowered to 3 %)
  const movers24 = [...holdings].filter(h => h.pct24h != null).sort((a, b) => Math.abs(b.pct24h) - Math.abs(a.pct24h))
  const topMover = movers24[0]
  if (topMover && Math.abs(topMover.pct24h) > 3) {
    const dir = topMover.pct24h > 0 ? `+${topMover.pct24h.toFixed(1)}%` : `${topMover.pct24h.toFixed(1)}%`
    tips.push(t('stMover24')(topMover.coin_symbol?.toUpperCase(), dir))
  }

  // Overall P&L — supportive tiers
  if (totalPnLPct != null) {
    if (totalPnLPct > 50) tips.push(t('stPnlGreat')(totalPnLPct.toFixed(1)))
    else if (totalPnLPct > 20) tips.push(t('stPnlSolid')(totalPnLPct.toFixed(1)))
    else if (totalPnLPct > 5) tips.push(t('stPnlGreen')(totalPnLPct.toFixed(1)))
    else if (totalPnLPct < -30) {
      tips.push(t('stPnlDeep')(Math.abs(totalPnLPct).toFixed(1)))
      tips.push(t('stPnlDeep2')(Math.abs(totalPnLPct).toFixed(1)))
    } else if (totalPnLPct < -15) {
      tips.push(t('stPnlMid')(Math.abs(totalPnLPct).toFixed(1)))
      tips.push(t('stPnlMid2')())
    } else if (totalPnLPct < -5) {
      tips.push(t('stPnlSmall')(Math.abs(totalPnLPct).toFixed(1)))
    }
  }

  // Single asset
  if (holdings.length === 1) tips.push(t('stOneAsset'))
  else if (holdings.length < 4) tips.push(t('stFewAssets'))

  // Always pad with wisdom so the ticker is never sparse
  tips.push(...WISDOM_KEYS.map(t))

  return tips
}

// ── Component ─────────────────────────────────────────────────────────────
export default function SentimentTicker({ holdings = [], totalValue = 0, totalPnLPct = null }) {
  const { t } = useLanguage()
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
    setTips(buildTips(holdings, totalValue, totalPnLPct, sentimentScore, t))
    // `t` is a dependency: the ticker rebuilds when the language changes.
  }, [holdings, totalValue, totalPnLPct, sentimentScore, t])

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
        <Icon name={isBullish ? 'trend-up' : isBearish ? 'trend-down' : 'meh'} size={14} style={{ verticalAlign:'-2px', marginRight:'0.35em' }} />{label}
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
            <span key={i} className="wl-sentiment-tip" style={{
              whiteSpace: 'nowrap', padding: '0 1.5rem',
              fontSize: '0.75rem', fontWeight: 600, lineHeight: 1,
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
