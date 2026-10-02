import { useEffect, useState } from 'react'
import { useLanguage } from '../LanguageContext'
import { track } from '../analytics'
import { marketMood } from '../sentiment'
import { dataUrl } from '../apiHosts.js'
import usePrivateFmt from '../hooks/usePrivateFmt'
import CoinLogo from './CoinLogo'

// The top of Home in the new look: the net-worth card, one-tap imports, a
// line that reacts to the user's day and to the market, the biggest holdings
// as watch cards. The news ticker follows right below it.
//
// Everything shown is real: the day's change is the same figure the app's
// mood engine already uses, the market read is the same one the sentiment
// ticker uses, and the news is the site's own feed. Nothing here replaces a
// feature below it; Buy, Sell and History are the same actions the quick
// strip offered.

const money = (v) => '$' + Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const pct = (v) => `${v >= 0 ? '+' : ''}${Number(v || 0).toFixed(2)}%`
const PASTELS = ['nl-cream', 'nl-rose', 'nl-lav', 'nl-mint']

export function moodOf(dayPct) {
  if (dayPct >= 3) return 'big'
  if (dayPct >= 0.25) return 'up'
  if (dayPct <= -0.25) return 'down'
  return 'flat'
}

function useMarket() {
  const [state, setState] = useState({ mood: null })
  useEffect(() => {
    let alive = true
    const bust = Math.floor(Date.now() / 3600000)
    Promise.all([
      fetch(`${dataUrl('news.json')}?t=${bust}`).then(r => r.ok ? r.json() : null).then(j => j?.articles || []).catch(() => []),
      fetch(`${dataUrl('market.json')}?t=${bust}`).then(r => r.ok ? r.json() : null).then(j => j?.coins || []).catch(() => []),
    ]).then(([articles, coins]) => {
      if (alive) setState({ mood: marketMood({ articles, coins }) })
    })
    return () => { alive = false }
  }, [])
  return state
}

export default function HomeTop({ enriched = [], totalValue = 0, todayPnL = 0, totalPnLPct = 0, onBuy, onSell, onHistory, onImport, onWatchAll, onAsset }) {
  const { t } = useLanguage()
  const { priv } = usePrivateFmt()
  const { mood: market } = useMarket()

  const base = totalValue - todayPnL
  const dayPct = base > 0 ? (todayPnL / base) * 100 : 0
  const mood = moodOf(dayPct)
  const top = enriched.filter(h => h.value > 0).slice(0, 4)
  const stack = enriched.slice(0, 3)

  const marketLine = market === 'bullish' ? t('nlMarketBull') : market === 'bearish' ? t('nlMarketBear') : market ? t('nlMarketSteady') : ''
  const banner = {
    big:  { icon: '🚀', title: t('nlMoodBig')(pct(dayPct)), sub: marketLine },
    up:   { icon: '✨', title: t('nlMoodUp')(pct(dayPct)), sub: marketLine },
    down: { icon: '🌙', title: t('nlMoodDown'), sub: t('nlMoodDownSub')(pct(dayPct), pct(totalPnLPct)) },
    flat: { icon: '☁️', title: t('nlMoodFlat'), sub: marketLine },
  }[mood]

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
          <div className="nl-hero-value">{priv(money(totalValue))}</div>
          <div className={`nl-hero-day ${todayPnL >= 0 ? 'up' : 'down'}`}>
            <b>{todayPnL >= 0 ? '▲' : '▼'} {priv(money(Math.abs(todayPnL)))}</b> {t('nlToday')(`${Math.abs(dayPct).toFixed(2)}%`)}
          </div>
          <div className="nl-hero-actions">
            <button type="button" className="nl-btn-pri" onClick={onBuy}>+ {t('buy')}</button>
            <button type="button" className="nl-btn-ghost" onClick={onSell}>− {t('sell')}</button>
            <button type="button" className="nl-btn-ghost" onClick={onHistory}>{t('history')}</button>
          </div>
        </div>
        {stack.length > 0 && (
          <div className="nl-stack" aria-hidden="true">
            {stack.map(h => <CoinLogo key={h.coin_id} coinId={h.coin_id} symbol={h.coin_symbol} image={h.coin_image} size={30} />)}
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

      {top.length > 0 && (
        <>
          <div className="nl-sec"><h3>{t('nlTopHoldings')}</h3>{onWatchAll && <button type="button" onClick={onWatchAll}>{t('nlSeeAll')}</button>}</div>
          <div className="nl-watch">
            {top.map((h, i) => (
              <button type="button" key={h.coin_id} className={`nl-wc ${PASTELS[i % PASTELS.length]}`} onClick={() => onAsset?.(h)}>
                <div className="nl-wc-h"><CoinLogo coinId={h.coin_id} symbol={h.coin_symbol} image={h.coin_image} size={24} /><b>{h.coin_symbol?.toUpperCase()}</b>
                  <small className={h.pct24h >= 0 ? 'up' : 'down'}>{pct(h.pct24h)}</small></div>
                <div className="nl-wc-v">{priv(money(h.value))}</div>
                <div className="nl-wc-bar"><i className={h.pct24h >= 0 ? 'up' : 'down'} style={{ width: `${Math.min(100, 8 + Math.abs(h.pct24h) * 12)}%` }} /></div>
              </button>
            ))}
          </div>
        </>
      )}

    </div>
  )
}
