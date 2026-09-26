import { useState } from 'react'
import { useLanguage } from '../LanguageContext'
import {
  useBybitOffer, usePickedOffer, openBybit, stripHidden, hideStrip,
} from '../bybitOffer'
import './BybitOffer.css'

// The Bybit referral, in two flavours:
//   • crypto — the sign-up bonus, on a crypto asset's page, in Technical
//     Analysis and as a strip after the crypto holdings;
//   • TradFi — Bybit's stock, ETF, gold, silver and oil markets traded in
//     USDT: on a stock's or metal's page, in Technical Analysis, and as a
//     strip after the stock or metal holdings (one Bybit strip at most).
// The bonus amount comes from /offers.json. Everything renders nothing unless
// bybitAllowed() says so (remote switch on, region allowed).

function Wordmark() {
  return <span className="by-word">BYB<i>I</i>T</span>
}

function Gift({ className }) {
  return (
    <svg className={className} viewBox="0 0 100 100" aria-hidden="true">
      <defs>
        <linearGradient id="byGift" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffd46b" /><stop offset="1" stopColor="#c77f00" />
        </linearGradient>
      </defs>
      <rect x="18" y="42" width="64" height="46" rx="6" fill="url(#byGift)" />
      <rect x="12" y="30" width="76" height="16" rx="5" fill="#ffc13a" />
      <rect x="45" y="30" width="10" height="58" fill="#7a4a00" opacity=".55" />
      <path d="M50 30c-8-14-26-14-22-2 3 7 22 2 22 2zm0 0c8-14 26-14 22-2-3 7-22 2-22 2z" fill="#ffe08a" />
    </svg>
  )
}

/** Under the smart money flow card: on a crypto asset's page and in Technical Analysis. */
export function BybitCard({ symbol, placement = 'asset_page' }) {
  const { t } = useLanguage()
  const { allowed, bonus } = useBybitOffer()
  if (!allowed) return null
  const sym = String(symbol || '').toUpperCase()
  return (
    <section className="by-card" aria-label={t('byAria')}>
      <Gift className="by-gift" />
      <div className="by-top"><Wordmark /><span className="by-tag">{t('byPartner')}</span></div>
      <h3 className="by-h">{t('byHeadA')} <em>{bonus}</em><br />{t('byHeadB')}</h3>
      <p className="by-sub">{t('byTradeSym').replace('{sym}', sym)}</p>
      <ol className="by-steps">
        <li><b>1</b>{t('byStep1')}</li>
        <li><b>2</b>{t('byStep2')}</li>
        <li><b>3</b>{t('byStep3').replace('{amt}', bonus)}</li>
      </ol>
      <button type="button" className="by-cta" onClick={() => openBybit(placement)}>
        {t('byCta').replace('{amt}', bonus)} <span aria-hidden="true">→</span>
      </button>
      <p className="by-fine">{t('byFine')}</p>
    </section>
  )
}

/**
 * On the dashboard for someone who picked crypto as an interest but holds no
 * crypto yet (including an empty portfolio). Anyone holding crypto gets the
 * strip under that list instead, so it never appears twice.
 */
export function BybitInterestStrip({ holdsCrypto, holdsStocks, holdsMetals }) {
  const picked = usePickedOffer()
  // Holding any of these already puts a strip under that list.
  if (holdsCrypto || holdsStocks || holdsMetals || !picked) return null
  return <BybitStrip variant={picked} placement="dashboard_interest" />
}

// Illustrative tickers from Bybit's TradFi board, drawn as chips — the idea,
// not a claim about what is listed on a given day.
const CHIPS = { stocks: ['AAPL', 'TSLA', 'NVDA'], metals: ['XAU', 'XAG', 'CL'] }
// The mark inside each chip: a letter for a company, the element for a metal.
const GLYPH = { XAU: 'Au', XAG: 'Ag', CL: 'Oil' }

function TradFiChips({ kind }) {
  return (
    <div className="by-chips" aria-hidden="true">
      {CHIPS[kind].map((tk, i) => (
        <span key={tk} className="by-chip" style={{ '--i': i }}>
          <i className={GLYPH[tk] ? 'is-sm' : ''}>{GLYPH[tk] || tk[0]}</i>{tk}<small>USDT</small>
        </span>
      ))}
    </div>
  )
}

/**
 * Bybit's TradFi markets, on a stock's or metal's page and in Technical
 * Analysis. `kind` picks the headline: 'stocks' or 'metals'.
 */
export function BybitStockCard({ symbol, kind = 'stocks', placement = 'stock_page' }) {
  const { t } = useLanguage()
  const { allowed, bonus } = useBybitOffer()
  if (!allowed) return null
  const sym = String(symbol || '').toUpperCase()
  const k = kind === 'metals' ? 'Metals' : 'Stocks'
  return (
    <section className="by-card by-card--stocks" aria-label={t('byStocksAria')}>
      <TradFiChips kind={kind === 'metals' ? 'metals' : 'stocks'} />
      <div className="by-top"><Wordmark /><span className="by-tag">{t('byPartner')}</span></div>
      <h3 className="by-h">{t(`by${k}HeadA`)}<br /><em>{t(`by${k}HeadB`)}</em></h3>
      <p className="by-sub">{t(`by${k}Sub`).replace('{sym}', sym)}</p>
      <ol className="by-steps">
        <li><b>1</b>{t('byStep1')}</li>
        <li><b>2</b>{t('byStep2')}</li>
        <li><b>3</b>{t('byStocksStep3').replace('{amt}', bonus)}</li>
      </ol>
      <button type="button" className="by-cta" onClick={() => openBybit(placement)}>
        {t(`by${k}Cta`)} <span aria-hidden="true">→</span>
      </button>
      <p className="by-fine">{t('byStocksFine')}</p>
    </section>
  )
}

/** After the crypto holdings list. Dismissed, it stays hidden for 30 days. */
export function BybitStrip({ variant = 'crypto', placement = 'holdings' }) {
  const { t } = useLanguage()
  const { allowed, bonus } = useBybitOffer()
  const [hidden, setHidden] = useState(stripHidden)
  if (!allowed || hidden) return null
  if (variant === 'stocks' || variant === 'metals') {
    return (
      <div className="by-strip" role="complementary" aria-label={t('byStocksAria')}>
        <span className="by-strip-ic by-strip-ic--stocks" aria-hidden="true">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#f7a600" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 17l5-5 4 4 8-8" /><path d="M14 8h6v6" /></svg>
        </span>
        <span className="by-strip-txt">
          <b>{t(variant === 'metals' ? 'byMetalsStripHead' : 'byStocksStripHead')}</b>
          <small>{t('byStocksStripFine').replace('{amt}', bonus)}</small>
        </span>
        <button type="button" className="by-strip-go" onClick={() => openBybit(placement)}>{t('byExplore')}</button>
        <button type="button" className="by-strip-x" aria-label={t('byHide')}
          onClick={() => { hideStrip(); setHidden(true) }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><path d="M6 6l12 12M18 6 6 18" /></svg>
        </button>
      </div>
    )
  }
  return (
    <div className="by-strip" role="complementary" aria-label={t('byAria')}>
      <span className="by-strip-ic" aria-hidden="true">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#f7a600" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="8" width="18" height="4" rx="1" /><path d="M12 8v13M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7" /><path d="M7.5 8a2.5 2.5 0 0 1 0-5C11 3 12 8 12 8s1-5 4.5-5a2.5 2.5 0 0 1 0 5" /></svg>
      </span>
      <span className="by-strip-txt">
        <b>{t('byStripHead').split('{amt}')[0]}<em>{bonus}</em>{t('byStripHead').split('{amt}')[1] || ''}</b>
        <small>{t('byStripFine')}</small>
      </span>
      <button type="button" className="by-strip-go" onClick={() => openBybit(placement)}>{t('byClaimNow')}</button>
      <button type="button" className="by-strip-x" aria-label={t('byHide')}
        onClick={() => { hideStrip(); setHidden(true) }}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><path d="M6 6l12 12M18 6 6 18" /></svg>
      </button>
    </div>
  )
}
