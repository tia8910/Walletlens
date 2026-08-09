import { useEffect, useState, useMemo } from 'react'
import Icon from '../components/Icon'
import { Link } from 'react-router-dom'
import { api } from '../api'
import { track } from '../analytics'
import Logo from '../components/Logo'
import { useLanguage } from '../LanguageContext'
import { inline } from '../components/DocProse'
import { fngContent, FNG_ZONE_RANGES, FNG_ZONE_COLORS } from '../data/fngContent'
import { fngFaqs } from '../data/faqContent'

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n))

function computeScore(coins) {
  if (!coins?.length) return null
  const up = coins.filter(c => (c.price_change_percentage_24h || 0) > 0)
  const breadth = (up.length / coins.length) * 100
  const avgMove = coins.slice(0, 10).reduce((s, c) => s + (c.price_change_percentage_24h || 0), 0) / 10
  const normMomentum = clamp(50 + avgMove * 5, 0, 100)
  return Math.round(breadth * 0.6 + normMomentum * 0.4)
}

// The live-score badge. Index into FNG zone tables rather than carrying its
// own labels, so the badge and the "5 Zones" list can never disagree.
function zoneIndex(score) {
  if (score >= 75) return 4
  if (score >= 51) return 3
  if (score === 50) return 2
  if (score >= 25) return 1
  return 0
}

const ZONE_EMOJI = ['frown', 'frown', 'meh', 'smile', 'smile']

export default function FearAndGreedIndex() {
  const { t, lang } = useLanguage()
  const doc = fngContent(lang)
  const faqs = fngFaqs(lang)
  const [score, setScore] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    document.title = `${doc.title} — WalletLens`
    track('fear_greed_page_view')
    api.getWhaleMarketSnapshot().then(coins => {
      if (coins?.length) setScore(computeScore(coins))
    }).catch(() => {}).finally(() => setLoading(false))
  }, [doc.title])

  const zi = score != null ? zoneIndex(score) : null
  const zColor = zi != null ? FNG_ZONE_COLORS[zi] : null

  return (
    <div className="doc-page">
      <header className="doc-header">
        <Link to="/" className="doc-brand"><Logo size={26} /> WalletLens</Link>
      </header>

      <article className="doc-article fgi-article">
        <p className="doc-meta" style={{ marginBottom: '0.5rem' }}>{doc.meta}</p>
        <h1>{doc.title}</h1>
        <p className="blog-summary">{doc.summary}</p>

        {/* Live score card */}
        <div className="fgi-score-card" style={{ border: `2px solid ${zColor || 'var(--g-ink)'}` }}>
          {loading && <div className="fgi-loading">{doc.loading}</div>}
          {!loading && score == null && (
            <div className="fgi-loading">{inline(doc.unavailable)}</div>
          )}
          {!loading && score != null && (
            <>
              <div className="fgi-score-num" style={{ color: zColor }}>{score}</div>
              <div className="fgi-score-label" style={{ color: zColor }}>
                <Icon name={ZONE_EMOJI[zi]} size={15} style={{ verticalAlign: '-2px', marginInlineEnd: '0.35em' }} />
                {doc.zones[zi][0]}
              </div>
              <div className="fgi-score-sub">{inline(doc.outOf)}</div>
            </>
          )}
        </div>

        {doc.blocks.map(([kind, body], i) => {
          if (kind === 'h2') return <h2 key={i}>{body}</h2>
          if (kind === 'p') return <p key={i}>{inline(body)}</p>
          if (kind === 'ul') {
            return <ul key={i}>{body.map((item, j) => <li key={j}>{inline(item)}</li>)}</ul>
          }
          if (kind === 'zones') {
            return (
              <div key={i} className="fgi-zones">
                {doc.zones.map(([label, desc], j) => (
                  <div key={label} className="fgi-zone"
                    style={{ borderInlineStart: `4px solid ${FNG_ZONE_COLORS[j]}` }}>
                    <div className="fgi-zone-head">
                      <span className="fgi-zone-range" style={{ color: FNG_ZONE_COLORS[j] }}>{FNG_ZONE_RANGES[j]}</span>
                      <span className="fgi-zone-label" style={{ color: FNG_ZONE_COLORS[j] }}>{label}</span>
                    </div>
                    <p className="fgi-zone-desc">{desc}</p>
                  </div>
                ))}
              </div>
            )
          }
          return (
            <div key={i} className="fgi-faqs">
              {faqs.map(f => (
                <div key={f.q} className="fgi-faq">
                  <h3 className="fgi-faq-q">{f.q}</h3>
                  <p className="fgi-faq-a">{f.a}</p>
                </div>
              ))}
            </div>
          )
        })}

        <div className="blog-cta-box" style={{ marginTop: '2rem' }}>
          <strong>{doc.ctaTitle}</strong>
          <p>{doc.ctaBody}</p>
          <Link to="/dashboard/" className="blog-cta-btn">{doc.ctaButton}</Link>
        </div>
      </article>

      <footer className="doc-footer">
        <Link to="/">{t('docBackTo')}</Link>
        <Link to="/market-index">{t('navMarketIndex')}</Link>
        <Link to="/blog/">{t('blog')}</Link>
        <Link to="/privacy/">{t('privacy')}</Link>
      </footer>
    </div>
  )
}
