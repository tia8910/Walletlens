import { useState } from 'react'
import { useLanguage } from '../LanguageContext'
import {
  useBybitAllowed, usePickedCrypto, openBybit, stripHidden, hideStrip, BYBIT_BONUS,
} from '../bybitOffer'
import './BybitOffer.css'

// The Bybit $20 bonus, in two places: a card on a crypto asset's page and a
// slim strip after the crypto holdings. Both render nothing unless
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

/** On a crypto asset's page, under the smart money flow card. */
export function BybitCard({ symbol }) {
  const { t } = useLanguage()
  const allowed = useBybitAllowed()
  if (!allowed) return null
  const sym = String(symbol || '').toUpperCase()
  return (
    <section className="by-card" aria-label={t('byAria')}>
      <Gift className="by-gift" />
      <div className="by-top"><Wordmark /><span className="by-tag">{t('byPartner')}</span></div>
      <h3 className="by-h">{t('byHeadA')} <em>{BYBIT_BONUS}</em><br />{t('byHeadB')}</h3>
      <p className="by-sub">{t('byTradeSym').replace('{sym}', sym)}</p>
      <ol className="by-steps">
        <li><b>1</b>{t('byStep1')}</li>
        <li><b>2</b>{t('byStep2')}</li>
        <li><b>3</b>{t('byStep3').replace('{amt}', BYBIT_BONUS)}</li>
      </ol>
      <button type="button" className="by-cta" onClick={() => openBybit('asset_page')}>
        {t('byCta').replace('{amt}', BYBIT_BONUS)} <span aria-hidden="true">→</span>
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
export function BybitInterestStrip({ holdsCrypto }) {
  const picked = usePickedCrypto()
  if (holdsCrypto || !picked) return null
  return <BybitStrip placement="dashboard_interest" />
}

/** After the crypto holdings list. Dismissed, it stays hidden for 30 days. */
export function BybitStrip({ placement = 'holdings' }) {
  const { t } = useLanguage()
  const allowed = useBybitAllowed()
  const [hidden, setHidden] = useState(stripHidden)
  if (!allowed || hidden) return null
  return (
    <div className="by-strip" role="complementary" aria-label={t('byAria')}>
      <span className="by-strip-ic" aria-hidden="true">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#f7a600" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="8" width="18" height="4" rx="1" /><path d="M12 8v13M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7" /><path d="M7.5 8a2.5 2.5 0 0 1 0-5C11 3 12 8 12 8s1-5 4.5-5a2.5 2.5 0 0 1 0 5" /></svg>
      </span>
      <span className="by-strip-txt">
        <b>{t('byStripHead').split('{amt}')[0]}<em>{BYBIT_BONUS}</em>{t('byStripHead').split('{amt}')[1] || ''}</b>
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
