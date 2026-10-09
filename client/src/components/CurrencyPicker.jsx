import { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { FlagImg, flagCodeFor } from './CoinLogo'
import { currencyList, currencyName } from '../data/currencies'
import { useLanguage } from '../LanguageContext'
import './CurrencyPicker.css'

/** A currency's flag, as a round badge; its code when there is no flag. */
export function CurFlag({ code, size = 18 }) {
  return <FlagImg cc={flagCodeFor(code) || code} size={size} className="cp-flag" />
}

/**
 * Every currency the FX feed covers, with its flag: popular ones first, then
 * the rest by name, searchable by code or name. Opens over the trade ticket.
 */
export default function CurrencyPicker({ open, title, value, rates, onPick, onClose, withBtc = false }) {
  const { t, lang } = useLanguage()
  const [q, setQ] = useState('')
  const { popular, rest } = useMemo(() => currencyList(rates, lang), [rates, lang])
  if (!open) return null
  const s = q.trim().toLowerCase()
  const nameOf = c => c === 'BTC' ? 'Bitcoin' : currencyName(c, lang)
  const match = c => !s || c.toLowerCase().includes(s) || nameOf(c).toLowerCase().includes(s)
  const row = c => (
    <button key={c} type="button" className={`cp-row${c === value ? ' on' : ''}`} onClick={() => { onPick(c); setQ('') }}>
      {c === 'BTC' ? <span className="cp-btc" aria-hidden="true">₿</span> : <CurFlag code={c} size={26} />}
      <b>{c}</b><span>{nameOf(c)}</span>
      {c === value && <i aria-hidden="true">✓</i>}
    </button>
  )
  // Bitcoin, for the dashboard's "view in BTC", after the dollar and the euro.
  const pop = (withBtc ? [...popular.slice(0, 2), 'BTC', ...popular.slice(2)] : popular).filter(match)
  const others = rest.filter(match)
  // On the body: the trade sheet is transformed, which would pin a fixed
  // child to the sheet instead of the screen.
  return createPortal(
    <div className="cp-back" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="cp" role="dialog" aria-modal="true" aria-label={title || t('tkCurrency')}>
        <div className="cp-head">
          <b>{title || t('tkCurrency')}</b>
          <button type="button" className="cp-x" aria-label={t('close')} onClick={onClose}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><path d="M6 6l12 12M18 6 6 18" /></svg>
          </button>
        </div>
        <input className="cp-search" type="search" autoComplete="off" placeholder={t('tkSearchCurrency')} value={q} onChange={e => setQ(e.target.value)} />
        <div className="cp-list">
          {pop.length > 0 && <p className="cp-sec">{t('tkPopularCur')}</p>}
          {pop.map(row)}
          {others.length > 0 && <p className="cp-sec">{t('tkAllCurrencies')}</p>}
          {others.map(row)}
          {!pop.length && !others.length && <p className="cp-empty">{t('tkNoCurrency')}</p>}
        </div>
      </div>
    </div>,
    document.body,
  )
}
