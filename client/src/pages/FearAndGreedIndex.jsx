import { useEffect, useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import { track } from '../analytics'
import Logo from '../components/Logo'

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n))

function computeScore(coins) {
  if (!coins?.length) return null
  const up = coins.filter(c => (c.price_change_percentage_24h || 0) > 0)
  const breadth = (up.length / coins.length) * 100
  const avgMove = coins.slice(0, 10).reduce((s, c) => s + (c.price_change_percentage_24h || 0), 0) / 10
  const normMomentum = clamp(50 + avgMove * 5, 0, 100)
  return Math.round(breadth * 0.6 + normMomentum * 0.4)
}

function zone(score) {
  if (score >= 75) return { label: 'Extreme Greed', color: '#f59e0b', emoji: '🤑' }
  if (score >= 51) return { label: 'Greed',         color: '#10b981', emoji: '😏' }
  if (score === 50) return { label: 'Neutral',        color: '#94a3b8', emoji: '😐' }
  if (score >= 25) return { label: 'Fear',            color: '#fb923c', emoji: '😰' }
  return               { label: 'Extreme Fear',    color: '#f87171', emoji: '😱' }
}

const ZONES = [
  { range: '0 – 24', label: 'Extreme Fear', color: '#f87171', desc: 'Widespread panic selling. Historically a contrarian buying opportunity, but the bottom is never guaranteed.' },
  { range: '25 – 49', label: 'Fear', color: '#fb923c', desc: 'Caution dominates. Most coins are under pressure. Accumulators begin watching for entries.' },
  { range: '50', label: 'Neutral', color: '#94a3b8', desc: 'Market is balanced — no clear directional edge. Watch for a break in either direction.' },
  { range: '51 – 74', label: 'Greed', color: '#10b981', desc: 'Healthy broad participation. Most coins trending up. Momentum is real but discipline still matters.' },
  { range: '75 – 100', label: 'Extreme Greed', color: '#f59e0b', desc: 'Broad euphoria. Historically a time for caution — peaks are often set in extreme greed.' },
]

const FAQS = [
  {
    q: 'What is the crypto fear and greed index?',
    a: 'The crypto fear and greed index is a 0–100 score that measures overall market sentiment. A low score (0–24) signals extreme fear — most investors are selling. A high score (75–100) signals extreme greed — most are buying aggressively. WalletLens computes it in real time from market breadth and momentum across the top coins.',
  },
  {
    q: 'How is the WalletLens fear and greed score calculated?',
    a: 'The score weighs two pillars: market breadth (60%) — the percentage of top coins up over 24 hours — and price momentum (40%) — the average 24-hour move of the top 10 coins, normalised to a 0–100 scale. The result updates continuously as new price data arrives.',
  },
  {
    q: 'What does a score of 50 mean?',
    a: 'A score of 50 is neutral — the market is balanced between buyers and sellers with no clear directional edge. It often precedes a sharper move; watch for which side breaks first.',
  },
  {
    q: 'Should I buy when fear is extreme?',
    a: 'Historically, extreme fear (0–24) has often preceded recoveries, which is why some investors treat it as a contrarian signal. However, it does not guarantee a bottom. Use the index as one data point alongside your own research. This is not financial advice.',
  },
  {
    q: 'How is this different from the original Crypto Fear & Greed Index?',
    a: 'The most-cited version from Alternative.me uses seven factors including social media and Google Trends. WalletLens focuses on pure on-market data — breadth and momentum — updated in real time directly from price feeds, with no external survey data.',
  },
  {
    q: 'Where can I track the live score?',
    a: 'The live WalletLens fear and greed index is on the Market Index page (walletlens.live/market-index). You can also see it inside the WalletLens app under AI Analysis, where it is overlaid against your own portfolio to help you interpret your exposure at current sentiment.',
  },
  {
    q: 'How often does the score update?',
    a: 'The score refreshes every 3 minutes on the Market Index page, pulling fresh price data from the top 20 coins. It reflects the most current market breadth and momentum available from public price feeds.',
  },
]

export default function FearAndGreedIndex() {
  const [score, setScore] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    document.title = 'Fear and Greed Index — Live Crypto Sentiment Score | WalletLens'
    track('fear_greed_page_view')
    api.getWhaleMarketSnapshot().then(coins => {
      if (coins?.length) setScore(computeScore(coins))
    }).catch(() => {}).finally(() => setLoading(false))
  }, [])

  const z = score != null ? zone(score) : null

  return (
    <div className="doc-page">
      <header className="doc-header">
        <Link to="/" className="doc-brand"><Logo size={26} /> WalletLens</Link>
      </header>

      <article className="doc-article fgi-article">

        <p className="doc-meta" style={{ marginBottom: '0.5rem' }}>
          Live crypto market sentiment · Updated every 3 min
        </p>
        <h1>Fear &amp; Greed Index</h1>
        <p className="blog-summary">
          A real-time 0–100 score measuring crypto market sentiment — from extreme fear to extreme greed —
          computed from breadth and momentum across the top coins.
        </p>

        {/* Live score card */}
        <div className="fgi-score-card" style={{ border: `2px solid ${z?.color || 'var(--g-ink)'}` }}>
          {loading && <div className="fgi-loading">Loading live score…</div>}
          {!loading && score == null && (
            <div className="fgi-loading">Score unavailable — check <Link to="/market-index">Market Index</Link> for live data.</div>
          )}
          {!loading && score != null && (
            <>
              <div className="fgi-score-num" style={{ color: z.color }}>{score}</div>
              <div className="fgi-score-label" style={{ color: z.color }}>{z.emoji} {z.label}</div>
              <div className="fgi-score-sub">out of 100 · <Link to="/market-index">Full market index →</Link></div>
            </>
          )}
        </div>

        <h2>What the Score Means</h2>
        <p>
          The fear and greed index condenses the entire crypto market's mood into one number. Markets in
          extreme fear tend to be oversold — historically a signal that a recovery may be near, though
          not guaranteed. Markets in extreme greed tend to be overbought — past peaks have often coincided
          with readings above 75.
        </p>

        <h2>The 5 Zones</h2>
        <div className="fgi-zones">
          {ZONES.map(z => (
            <div key={z.label} className="fgi-zone" style={{ borderLeft: `4px solid ${z.color}` }}>
              <div className="fgi-zone-head">
                <span className="fgi-zone-range" style={{ color: z.color }}>{z.range}</span>
                <span className="fgi-zone-label" style={{ color: z.color }}>{z.label}</span>
              </div>
              <p className="fgi-zone-desc">{z.desc}</p>
            </div>
          ))}
        </div>

        <h2>How WalletLens Calculates It</h2>
        <p>
          The WalletLens fear and greed score uses two pillars of pure market data — no surveys, no
          social media scrapers, no external APIs:
        </p>
        <ul>
          <li><strong>Market breadth (60%)</strong> — the percentage of the top 20 coins up over 24 hours.
            When most coins are green, breadth is high and the score rises.</li>
          <li><strong>Price momentum (40%)</strong> — the average 24-hour move of the top 10 coins,
            normalised to 0–100. Strong positive moves push the score toward greed.</li>
        </ul>
        <p>
          The score updates every 3 minutes. You can see the full breakdown — including the pillar
          contributions, BTC dominance, and top movers — on the{' '}
          <Link to="/market-index">WalletLens Market Index page</Link>.
        </p>

        <h2>How to Use the Fear &amp; Greed Index</h2>
        <p>
          The index is most useful as a <strong>context layer</strong> on top of your portfolio decisions,
          not as a buy or sell signal by itself:
        </p>
        <ul>
          <li>During <strong>extreme fear</strong>, review your allocation — are you under-exposed relative
            to your long-term target?</li>
          <li>During <strong>extreme greed</strong>, check your sell targets — are any assets approaching
            levels where you planned to take profit?</li>
          <li>In <strong>neutral</strong> conditions, the market gives fewer directional clues — focus on
            your DCA schedule and position sizes.</li>
        </ul>
        <p>
          Inside WalletLens, the AI Analysis tab shows the live fear and greed reading overlaid against
          your own portfolio — so you can see how your current exposure compares to market sentiment in
          one view. <Link to="/">Open WalletLens free →</Link>
        </p>

        <h2>Frequently Asked Questions</h2>
        <div className="fgi-faqs">
          {FAQS.map(f => (
            <div key={f.q} className="fgi-faq">
              <h3 className="fgi-faq-q">{f.q}</h3>
              <p className="fgi-faq-a">{f.a}</p>
            </div>
          ))}
        </div>

        <div className="blog-cta-box" style={{ marginTop: '2rem' }}>
          <strong>Track your portfolio alongside the fear &amp; greed index</strong>
          <p>WalletLens is 100% free, no account required, and all your data stays on your device.</p>
          <Link to="/dashboard/" className="blog-cta-btn">Open WalletLens →</Link>
        </div>

      </article>

      <footer className="doc-footer">
        <Link to="/">← Home</Link>
        <Link to="/market-index">Market Index</Link>
        <Link to="/blog/">Blog</Link>
        <Link to="/privacy/">Privacy Policy</Link>
      </footer>
    </div>
  )
}
