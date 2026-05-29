import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'
import { track, trackAI } from '../analytics'
import CoinLogo from '../components/CoinLogo'
import { computeMagic, aggregateMagic } from '../magicIndicator'
import { getAiVerdict } from '../magicAi'

const PILLAR_INFO = {
  technical:   'RSI, MACD, Bollinger Bands and trend from daily candles.',
  whales:      'Accumulation vs distribution from volume-weighted flow.',
  onchain:     'Flow + turnover (volume/market-cap) + supply dilution proxies.',
  fundamental: 'Market-cap tier, FDV/MC dilution and distance from all-time high.',
  volume:      'Whether volume is confirming the current price move.',
}

const money = (n) => {
  if (n == null || !isFinite(n)) return '—'
  if (Math.abs(n) >= 1) return '$' + Math.round(n).toLocaleString()
  return '$' + (+n).toPrecision(4)
}

// ── Diverging gauge (-100..100) ──────────────────────────────────────────
function MagicGauge({ score, direction, confidence, big }) {
  const pos = ((score + 100) / 200) * 100
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
        <span style={{ fontSize: big ? '1.35rem' : '1.05rem', fontWeight: 800, color: direction.color }}>
          {direction.emoji} {direction.label}
        </span>
        <span style={{ fontSize: '0.8rem', fontWeight: 700, color: direction.color }}>
          {score > 0 ? '+' : ''}{score}
        </span>
      </div>
      <div className="magic-track">
        <div className="magic-track-mid" />
        <div className="magic-marker" style={{ left: `${pos}%`, background: direction.color, boxShadow: `0 0 10px ${direction.color}` }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.65rem', color: 'var(--text2)', marginTop: '0.2rem' }}>
        <span>Distribute</span>
        <span>Neutral</span>
        <span>Accumulate</span>
      </div>
      {confidence != null && (
        <div style={{ fontSize: '0.72rem', color: 'var(--text2)', marginTop: '0.4rem' }}>
          Confidence <b style={{ color: 'var(--text)' }}>{confidence}%</b>
        </div>
      )}
    </div>
  )
}

// ── Five diverging pillar bars ───────────────────────────────────────────
function PillarBars({ pillars }) {
  return (
    <div className="pillar-list">
      {pillars.map((p) => {
        const avail = p.available
        const s = avail ? p.score : 0
        const color = !avail ? 'var(--text2)' : s >= 0 ? '#22c55e' : '#ef4444'
        const widthPct = Math.min(50, Math.abs(s) / 2) // half-track max
        return (
          <div key={p.key} className="pillar-row" title={PILLAR_INFO[p.key]}>
            <div className="pillar-name">{p.label}</div>
            <div className="pillar-track">
              <div className="pillar-zero" />
              {avail && (
                <div
                  className="pillar-fill"
                  style={{
                    background: color,
                    width: `${widthPct}%`,
                    left: s >= 0 ? '50%' : `${50 - widthPct}%`,
                  }}
                />
              )}
            </div>
            <div className="pillar-val" style={{ color }}>{avail ? (s > 0 ? '+' + s : s) : 'n/a'}</div>
          </div>
        )
      })}
    </div>
  )
}

// ── AI verdict (optional, uses the Anthropic key via the Deno endpoint) ────
function AiVerdict({ item }) {
  const [state, setState] = useState('idle') // idle | loading | done | error
  const [verdict, setVerdict] = useState(null)

  async function run() {
    if (state === 'loading') return
    setState('loading')
    trackAI({ action: 'magic_ai_verdict', symbol: item.coin_symbol })
    const payload = {
      asset: { symbol: item.coin_symbol?.toUpperCase(), name: item.coin_name },
      magic: { score: item.magic.score, direction: item.magic.direction.label, confidence: item.magic.confidence },
      pillars: item.magic.pillars.filter(p => p.available).map(p => ({ label: p.label, score: p.score, note: p.note })),
      stats: {
        rsi: item.ta?.rsi != null ? Math.round(item.ta.rsi) : undefined,
        trend: item.ta?.trend,
        macd: item.ta?.macd?.cross || (item.ta?.macd ? (item.ta.macd.hist > 0 ? 'positive' : 'negative') : undefined),
        whaleScore: item.signals?.whaleScore,
        marketCapRank: item.fundamental?.marketCapRank,
        pctFromATH: item.fundamental?.athChangePct != null ? Math.round(item.fundamental.athChangePct) + '%' : undefined,
        change30d: item.fundamental?.change30d != null ? Math.round(item.fundamental.change30d) + '%' : undefined,
        pnlPct: Math.round(item.pnlPct) + '%',
      },
    }
    const v = await getAiVerdict(item.coin_id, payload)
    if (v) { setVerdict(v); setState('done') }
    else setState('error')
  }

  if (state === 'idle') {
    return (
      <button className="magic-ai-btn" onClick={run}>🤖 AI Verdict</button>
    )
  }
  if (state === 'loading') {
    return <div className="magic-ai-loading">🤖 Claude is analysing {item.coin_symbol?.toUpperCase()}…</div>
  }
  if (state === 'error') {
    return (
      <div className="magic-ai-err">
        AI verdict unavailable — the indicator above still reflects the full analysis.
        <button className="magic-ai-btn" style={{ marginLeft: '0.5rem' }} onClick={run}>Retry</button>
      </div>
    )
  }
  return (
    <div className="magic-ai-card">
      <div className="magic-ai-head">🤖 AI Verdict{verdict.direction ? <span className="magic-ai-dir">{verdict.direction}</span> : null}</div>
      {verdict.oneLiner && <p className="magic-ai-line">{verdict.oneLiner}</p>}
      <div className="magic-ai-cols">
        {verdict.bull?.length > 0 && (
          <div>
            <div className="magic-ai-col-h" style={{ color: '#22c55e' }}>Bull</div>
            <ul>{verdict.bull.map((b, i) => <li key={i}>{b}</li>)}</ul>
          </div>
        )}
        {verdict.bear?.length > 0 && (
          <div>
            <div className="magic-ai-col-h" style={{ color: '#ef4444' }}>Bear</div>
            <ul>{verdict.bear.map((b, i) => <li key={i}>{b}</li>)}</ul>
          </div>
        )}
      </div>
      {verdict.action && <p className="magic-ai-action">→ {verdict.action}</p>}
    </div>
  )
}

// ── Per-asset card ─────────────────────────────────────────────────────────
function AssetCard({ item, onOpen }) {
  const m = item.magic
  const chg = item.fundamental?.change24h
  const ta = item.ta
  return (
    <div className="glass-card magic-card">
      <div className="magic-card-head" onClick={onOpen} style={{ cursor: 'pointer' }}>
        <CoinLogo image={item.coin_image} symbol={item.coin_symbol} coinId={item.coin_id} size={38} className="coin-logo" />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <span style={{ fontWeight: 800 }}>{item.coin_symbol?.toUpperCase()}</span>
            <span className="muted" style={{ fontSize: '0.78rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.coin_name}</span>
          </div>
          <div style={{ fontSize: '0.78rem', color: 'var(--text2)' }}>
            {money(item.price)}
            {chg != null && <span style={{ marginLeft: '0.4rem', color: chg >= 0 ? '#22c55e' : '#ef4444' }}>{chg >= 0 ? '+' : ''}{chg.toFixed(1)}%</span>}
            <span style={{ marginLeft: '0.4rem' }}>· {item.weight.toFixed(1)}% of book</span>
          </div>
        </div>
      </div>

      <div style={{ margin: '0.85rem 0' }}>
        <MagicGauge score={m.score} direction={m.direction} confidence={m.confidence} />
      </div>

      <PillarBars pillars={m.pillars} />

      {ta && (
        <div className="magic-ta-strip">
          {ta.trend && <span>{ta.trend}</span>}
          {ta.rsi != null && <span>RSI {Math.round(ta.rsi)}</span>}
          {ta.nearestSupport != null && <span>S {money(ta.nearestSupport)}</span>}
          {ta.nearestResistance != null && <span>R {money(ta.nearestResistance)}</span>}
          {item.fundamental?.marketCapRank && <span>#{item.fundamental.marketCapRank}</span>}
        </div>
      )}

      <div className="magic-card-foot">
        <AiVerdict item={item} />
        <button className="magic-detail-link" onClick={onOpen}>Full chart →</button>
      </div>
    </div>
  )
}

export default function Technicals() {
  const navigate = useNavigate()
  const [portfolio, setPortfolio] = useState([])
  const [prices, setPrices] = useState({})
  const [ta, setTa] = useState({})
  const [signals, setSignals] = useState({})
  const [fundamentals, setFundamentals] = useState({})
  const [loaded, setLoaded] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)

  useEffect(() => {
    track('technicals_page_view')
    let alive = true
    async function load() {
      let p = []
      try { p = (await api.getPortfolio()) || [] } catch {}
      if (!alive) return
      setPortfolio(p)
      const cryptoIds = p
        .map(h => h.coin_id)
        .filter(id => id && !/^(metal:|stock:|fiat:|bond:|other:|cash:|real:)/.test(id))
      if (p.length) {
        const ids = p.map(h => h.coin_id).join(',')
        api.getPrices(ids).then(px => alive && setPrices(px || {})).catch(() => {})
      }
      if (cryptoIds.length) {
        setAnalyzing(true)
        Promise.all([
          api.getBulkTechnicals(cryptoIds).catch(() => ({})),
          api.getBulkSmartSignals(cryptoIds).catch(() => ({})),
          api.getBulkFundamentals(cryptoIds).catch(() => ({})),
        ]).then(([t, s, f]) => {
          if (!alive) return
          setTa(t || {}); setSignals(s || {}); setFundamentals(f || {})
          setAnalyzing(false)
        })
      }
      setLoaded(true)
    }
    load()
    return () => { alive = false }
  }, [])

  const { cryptoItems, nonCryptoCount, compass } = useMemo(() => {
    const enriched = portfolio.map(h => {
      const price = prices[h.coin_id]?.usd ?? prices[h.coin_id]?.price ?? 0
      const value = h.amount * price
      const invested = h.total_invested || 0
      const pnl = value - invested
      return { ...h, price, value, invested, pnl, pnlPct: invested > 0 ? (pnl / invested) * 100 : 0 }
    })
    const totalValue = enriched.reduce((s, h) => s + h.value, 0)
    const isCrypto = (id) => id && !/^(metal:|stock:|fiat:|bond:|other:|cash:|real:)/.test(id)

    const cryptoItems = enriched
      .filter(h => isCrypto(h.coin_id))
      .map(h => {
        const magic = computeMagic({
          ta: ta[h.coin_id] || null,
          signals: signals[h.coin_id] || null,
          fundamental: fundamentals[h.coin_id] || null,
        })
        return {
          ...h,
          ta: ta[h.coin_id] || null,
          signals: signals[h.coin_id] || null,
          fundamental: fundamentals[h.coin_id] || null,
          magic,
          weight: totalValue > 0 ? (h.value / totalValue) * 100 : 0,
        }
      })
      .filter(it => it.magic)            // only those we could score
      .sort((a, b) => b.value - a.value)

    const compass = aggregateMagic(cryptoItems.map(it => ({ value: it.value, magic: it.magic })))
    const nonCryptoCount = enriched.filter(h => !isCrypto(h.coin_id)).length
    return { cryptoItems, nonCryptoCount, compass }
  }, [portfolio, prices, ta, signals, fundamentals])

  if (!loaded) {
    return <div className="dvx-page"><div className="glass-card" style={{ textAlign: 'center', padding: '2.5rem' }}>Loading analysis…</div></div>
  }

  if (portfolio.length === 0) {
    return (
      <div className="dvx-page">
        <div className="glass-card" style={{ textAlign: 'center', padding: '3rem 1.5rem' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>📐</div>
          <h2 style={{ margin: '0 0 0.4rem' }}>Technical & On-Chain Analysis</h2>
          <p className="muted" style={{ maxWidth: 420, margin: '0 auto 1.2rem' }}>
            Add a crypto holding and the Magic Indicator will merge technicals, on-chain flow,
            volume, whale activity and fundamentals into a single direction for each asset.
          </p>
          <button className="dvx-btn-primary" onClick={() => navigate('/dashboard')}>Go to Dashboard</button>
        </div>
      </div>
    )
  }

  return (
    <div className="dvx-page">
      <div className="magic-hero">
        <h1 className="magic-hero-title">📐 Technical & On-Chain Analysis</h1>
        <p className="magic-hero-sub">
          The <b>Magic Indicator</b> fuses five signals — technical, on-chain, volume, whales and
          fundamentals — into one direction per crypto holding.
        </p>
      </div>

      {compass && (
        <div className="glass-card magic-compass">
          <div className="magic-compass-label">PORTFOLIO COMPASS · {compass.assets} crypto asset{compass.assets === 1 ? '' : 's'}</div>
          <MagicGauge score={compass.score} direction={compass.direction} confidence={compass.confidence} big />
          <p className="muted" style={{ fontSize: '0.78rem', margin: '0.6rem 0 0' }}>
            Value-weighted blend across your crypto book. Not financial advice.
          </p>
        </div>
      )}

      {analyzing && cryptoItems.length === 0 && (
        <div className="glass-card" style={{ textAlign: 'center', padding: '2rem' }}>Crunching indicators…</div>
      )}

      <div className="magic-grid">
        {cryptoItems.map(item => (
          <AssetCard key={item.coin_id} item={item} onOpen={() => navigate(`/asset/${item.coin_id}`)} />
        ))}
      </div>

      {nonCryptoCount > 0 && (
        <div className="glass-card" style={{ marginTop: '1rem', padding: '0.9rem 1.1rem' }}>
          <p className="muted" style={{ margin: 0, fontSize: '0.82rem' }}>
            ℹ️ {nonCryptoCount} non-crypto holding{nonCryptoCount === 1 ? '' : 's'} (stocks, metals, cash, real estate)
            {nonCryptoCount === 1 ? ' is' : ' are'} not shown — technical & on-chain analysis needs crypto market data.
          </p>
        </div>
      )}
    </div>
  )
}
