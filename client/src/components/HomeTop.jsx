import { useEffect, useMemo, useState } from 'react'
import { useLanguage } from '../LanguageContext'
import { track } from '../analytics'
import { briefParts } from '../portfolioBrief'
import { api } from '../api'
import usePrivateFmt from '../hooks/usePrivateFmt'
import CoinLogo from './CoinLogo'
import { THEMES } from '../ThemeContext'

// Gold and silver as the bars the themes use, rather than a letter tile.
const METAL = { gold: THEMES.find(t => t.id === 'gold')?.logo, silver: THEMES.find(t => t.id === 'silver')?.logo }
export function AssetLogo({ h, size }) {
  const src = METAL[h.coin_id]
  if (src) return <img className="nl-metal" src={src} alt="" style={{ '--s': `${size}px` }} />
  return <CoinLogo coinId={h.coin_id} symbol={h.coin_symbol} image={h.coin_image} size={size} />
}

// Home in the new look, laid out as the approved mockup: a line that reacts
// to the day, the net-worth card, one-tap imports, the watchlist and the news
// card (passed in as `newsSlot`). The holdings, chart and breakdown follow on
// the dashboard below it, each shown once.
//
// Everything shown is real. The day's change is the same figure the mood
// engine uses, the banner's second line is the dashboard's own summary
// sentence, and every sparkline is the asset's own last seven days from the
// app's cached chart data; a card with no history draws no line rather than
// an invented one.

const PASTELS = ['nl-cream', 'nl-rose', 'nl-lav', 'nl-mint']

const splitMoney = (v) => {
  const s = Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const i = s.lastIndexOf('.')
  return ['$' + s.slice(0, i), s.slice(i)]
}
const money = (v) => splitMoney(v).join('')
const price = (v) => {
  const n = Number(v || 0)
  const d = n >= 1000 ? 0 : n >= 1 ? 2 : 4
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })
}
const signed = (v) => `${v >= 0 ? '+' : ''}${Number(v || 0).toFixed(2)}%`

export function moodOf(dayPct) {
  if (dayPct >= 3) return 'big'
  if (dayPct >= 0.25) return 'up'
  if (dayPct <= -0.25) return 'down'
  return 'flat'
}

/** Seven days of closes per id, from the app's cached chart data. */
export function useSparks(ids) {
  const key = ids.join(',')
  const [map, setMap] = useState({})
  useEffect(() => {
    let alive = true
    ids.forEach(id => {
      Promise.resolve(api.getChartData(id, 7))
        .then(pts => {
          const v = (pts || []).map(p => Number(p.price)).filter(Number.isFinite)
          if (alive && v.length > 3) setMap(m => ({ ...m, [id]: v }))
        })
        .catch(() => {})
    })
    return () => { alive = false }
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps
  return map
}

export function sparkPath(values, w, h, pad = 3) {
  if (!values || values.length < 2) return null
  const lo = Math.min(...values), hi = Math.max(...values), span = hi - lo || 1
  const pts = values.map((v, i) => [i * w / (values.length - 1), pad + (1 - (v - lo) / span) * (h - pad * 2)])
  const line = 'M' + pts.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join(' L')
  return { line, area: `${line} L${w} ${h} L0 ${h} Z` }
}

export function Spark({ values, w = 120, h = 34, className }) {
  const p = sparkPath(values, w, h)
  const gid = useMemo(() => `nls${Math.random().toString(36).slice(2, 8)}`, [])
  if (!p) return <span className={`${className} nl-spark-empty`} aria-hidden="true" />
  const up = values[values.length - 1] >= values[0]
  const c = up ? '#16c784' : '#f04461'
  return (
    <svg className={className} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden="true">
      <defs><linearGradient id={gid} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={c} stopOpacity=".26" /><stop offset="1" stopColor={c} stopOpacity="0" /></linearGradient></defs>
      <path d={p.area} fill={`url(#${gid})`} />
      <path d={p.line} fill="none" stroke={up ? '#16a874' : '#e5484d'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

export default function HomeTop({ enriched = [], watch = [], totalValue = 0, todayPnL = 0, totalPnLPct = 0, newsSlot,
  onBuy, onSell, onHistory, onImport, onWatchAll, onAsset }) {
  const { t } = useLanguage()
  const { priv } = usePrivateFmt()

  const base = totalValue - todayPnL
  const dayPct = base > 0 ? (todayPnL / base) * 100 : 0
  const mood = moodOf(dayPct)
  const stack = enriched.slice(0, 3)
  // The user's own watchlist when they keep one, otherwise their biggest
  // holdings, which is what they would put on it.
  const watchItems = (watch.length ? watch : enriched).filter(h => h.price > 0).slice(0, 4)
  const sparks = useSparks(watchItems.map(h => h.coin_id))

  // Who moved: "2 winners and 1 loser. BTC leads at +3.7%."
  const movers = useMemo(() => briefParts(enriched, totalValue, dayPct, t)?.rest || '', [enriched, totalValue, dayPct, t])
  const banner = {
    big:  { icon: '🚀', title: t('nlMoodBig')(signed(dayPct)), sub: movers },
    up:   { icon: '✨', title: t('nlMoodUp')(signed(dayPct)), sub: movers },
    down: { icon: '🌙', title: t('nlMoodDown'), sub: [t('nlMoodDownSub')(signed(dayPct), signed(totalPnLPct)), movers].filter(Boolean).join(' ') },
    flat: { icon: '☁️', title: t('nlMoodFlat'), sub: movers },
  }[mood]

  const [whole, cents] = splitMoney(totalValue)
  const imp = (kind) => { track('home_import', { kind }); onImport?.(kind) }

  return (
    <div className={`nl-home nl-mood-${mood}`}>
      <div className={`nl-banner nl-banner-${mood}`}>
        <span className="nl-banner-ic" aria-hidden="true">{banner.icon}</span>
        <div><b>{banner.title}</b>{banner.sub && <small>{banner.sub}</small>}</div>
        {mood === 'big' && <span className="nl-confetti" aria-hidden="true" />}
      </div>

      <section className="nl-hero">
        <i className="nl-hero-mark" aria-hidden="true" />
        <div className="nl-hero-main">
          <small>{t('nlTotal')}</small>
          <div className="nl-hero-value">{priv(whole)}<span>{priv(cents)}</span></div>
          <div className={`nl-hero-day ${todayPnL >= 0 ? 'up' : 'down'}`}>
            <b>{todayPnL >= 0 ? '▲' : '▼'} {priv(money(Math.abs(todayPnL)))}</b> {t('nlToday')(`${Math.abs(dayPct).toFixed(2)}%`)}
          </div>
          <div className="nl-hero-actions">
            <button type="button" className="nl-btn-buy" onClick={onBuy}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>{t('buy')}
            </button>
            <button type="button" className="nl-btn-sell" onClick={onSell}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14" /></svg>{t('sell')}
            </button>
            <button type="button" className="nl-btn-icon" onClick={onHistory} aria-label={t('history')} title={t('history')}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5M12 7v5l3 2" /></svg>
            </button>
          </div>
        </div>
        {stack.length > 0 && (
          <div className="nl-stack" aria-hidden="true">
            {stack.map(h => <AssetLogo key={h.coin_id} h={h} size={30} />)}
            {enriched.length > 3 && <em>+{enriched.length - 3}</em>}
          </div>
        )}
      </section>

      <div className="nl-quick">
        <button type="button" onClick={() => imp('screenshot')}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" /><circle cx="12" cy="13.5" r="3.5" /></svg>
          <b>{t('nlScreenshot')}</b>
        </button>
        <button type="button" onClick={() => imp('voice')}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3" /></svg>
          <b>{t('nlVoice')}</b>
        </button>
        <button type="button" onClick={() => imp('excel')}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M4 9h16M4 15h16M10 3v18" /></svg>
          <b>{t('nlCsv')}</b>
        </button>
      </div>

      {watchItems.length > 0 && (
        <>
          <div className="nl-sec"><h3>{t('watchlist')}</h3>{onWatchAll && <button type="button" onClick={onWatchAll}>{t('nlSeeAll')}</button>}</div>
          <div className="nl-watch">
            {watchItems.map((h, i) => (
              <button type="button" key={h.coin_id} className={`nl-wc ${PASTELS[i % PASTELS.length]}`} onClick={() => onAsset?.(h)}>
                <div className="nl-wc-h">
                  <AssetLogo h={h} size={26} />
                  <b>{h.coin_symbol?.toUpperCase()}</b>
                  <small className={h.pct24h >= 0 ? 'up' : 'down'}>{signed(h.pct24h)}</small>
                </div>
                <div className="nl-wc-v">{price(h.price)}</div>
                <Spark values={sparks[h.coin_id]} className="nl-wc-spark" />
              </button>
            ))}
          </div>
        </>
      )}

      {newsSlot}
    </div>
  )
}
