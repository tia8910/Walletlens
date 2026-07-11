import { useEffect, useRef, useState } from 'react'
import Icon from './Icon'

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
const WISDOM_TIPS = [
  'Consistency beats timing — investors who stayed invested long-term outperformed those who tried to time the market',
  'Never invest more than you can afford to lose — protecting your downside matters as much as chasing upside',
  'Emotions are your biggest enemy — stick to your strategy and avoid FOMO or panic decisions',
  'Cash is a position too — keeping dry powder gives you the power to buy during dips',
  'Review your portfolio regularly, but avoid checking prices obsessively — short-term noise clouds long-term thinking',
  'Set price alerts and stop-losses — automating risk management removes emotion from the equation',
  'Diversification across asset classes helps smooth out volatility and protect against single-asset risk',
  'Long-term thinking wins — assets that feel risky short-term often reward patient holders',
  'Dollar-cost averaging (DCA) removes the stress of timing the market — small, regular buys add up over time',
  'Define your exit strategy before you enter a trade — knowing your target prevents greed from erasing gains',
]

function buildTips(holdings, totalValue, totalPnLPct, sentimentScore) {
  const tips = []
  const isBullish = sentimentScore > 1
  const isBearish = sentimentScore < -1

  // Market sentiment
  if (isBullish) tips.push('Market sentiment is BULLISH — momentum is on your side, watch for breakout entries')
  if (isBearish) {
    tips.push('Market sentiment is BEARISH — stay calm, every bear market in history has eventually ended')
    tips.push('Feeling the pressure? You\'re not alone — even seasoned investors feel anxiety in down markets. Breathe and stick to your plan')
    tips.push('Bear markets are where generational wealth is built — every dip is a potential accumulation opportunity for the patient')
  }
  if (!isBullish && !isBearish) tips.push('Market sentiment is NEUTRAL — wait for a clear directional signal before adding size')

  if (!holdings.length) {
    tips.push('Add your first holding to unlock personalised portfolio tips')
    tips.push(...WISDOM_TIPS.slice(0, 4))
    return tips
  }

  // Concentration risk
  const sorted = [...holdings].sort((a, b) => b.value - a.value)
  const topHolding = sorted[0]
  const topPct = totalValue > 0 ? (topHolding.value / totalValue) * 100 : 0
  if (topPct > 60) tips.push(`${topHolding.coin_symbol?.toUpperCase()} makes up ${topPct.toFixed(0)}% of your portfolio — heavy concentration amplifies both gains and losses`)
  else if (topPct > 40) tips.push(`${topHolding.coin_symbol?.toUpperCase()} is your largest position at ${topPct.toFixed(0)}% — consider whether that exposure matches your risk tolerance`)

  // Gainers
  const gainers = [...holdings].filter(h => h.pnlPct > 10).sort((a, b) => b.pnlPct - a.pnlPct)
  if (gainers.length) {
    const g = gainers[0]
    tips.push(`${g.coin_symbol?.toUpperCase()} is up ${g.pnlPct.toFixed(1)}% — consider taking partial profits to lock in gains and reduce risk`)
  }

  // Losers — extra support when things are rough
  const losers = [...holdings].filter(h => h.pnlPct < -10).sort((a, b) => a.pnlPct - b.pnlPct)
  if (losers.length) {
    const l = losers[0]
    tips.push(`${l.coin_symbol?.toUpperCase()} is down ${Math.abs(l.pnlPct).toFixed(1)}% — review your thesis or set a stop-loss to protect remaining capital`)
    tips.push(`${l.coin_symbol?.toUpperCase()} is hurting right now — every great asset has rough patches. DCA can lower your average entry if your conviction holds`)
  }

  // 24 h movers (lowered to 3 %)
  const movers24 = [...holdings].filter(h => h.pct24h != null).sort((a, b) => Math.abs(b.pct24h) - Math.abs(a.pct24h))
  const topMover = movers24[0]
  if (topMover && Math.abs(topMover.pct24h) > 3) {
    const dir = topMover.pct24h > 0 ? `+${topMover.pct24h.toFixed(1)}%` : `${topMover.pct24h.toFixed(1)}%`
    tips.push(`${topMover.coin_symbol?.toUpperCase()} moved ${dir} in 24 h — monitor for continuation or reversal before adding to the position`)
  }

  // Overall P&L — supportive tiers
  if (totalPnLPct != null) {
    if (totalPnLPct > 50) tips.push(`Portfolio up ${totalPnLPct.toFixed(1)}% overall — outstanding! Review profit targets and consider rebalancing to protect those gains`)
    else if (totalPnLPct > 20) tips.push(`Portfolio up ${totalPnLPct.toFixed(1)}% — solid performance. A great time to revisit your targets and lock in some profit`)
    else if (totalPnLPct > 5) tips.push(`Portfolio up ${totalPnLPct.toFixed(1)}% — you're in the green. Stay disciplined and keep risk in check`)
    else if (totalPnLPct < -30) {
      tips.push(`Portfolio down ${Math.abs(totalPnLPct).toFixed(1)}% — that's painful, but drawdowns are part of every investor's journey. Focus on what you can control: risk size and your exit plan`)
      tips.push(`Down ${Math.abs(totalPnLPct).toFixed(1)}% but not out — the investors who stayed the course through deep drawdowns often saw the biggest recoveries`)
    } else if (totalPnLPct < -15) {
      tips.push(`Portfolio down ${Math.abs(totalPnLPct).toFixed(1)}% — this is hard. Avoid panic selling; instead review position sizes and make sure you still believe in your thesis`)
      tips.push(`It\'s okay to feel stressed when your portfolio is down — what matters is acting calmly and not making fear-driven decisions`)
    } else if (totalPnLPct < -5) {
      tips.push(`Portfolio down ${Math.abs(totalPnLPct).toFixed(1)}% — tighten stops and revisit your position sizing. Small losses are manageable; let them stay small`)
    }
  }

  // Single asset
  if (holdings.length === 1) tips.push('You hold only one asset — adding 2–3 uncorrelated assets can significantly reduce your overall risk')
  else if (holdings.length < 4) tips.push('A portfolio of 5–10 assets across different sectors can balance risk and reward more effectively')

  // Always pad with wisdom so the ticker is never sparse
  tips.push(...WISDOM_TIPS)

  return tips
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
