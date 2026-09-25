import { useEffect, useState } from 'react'
import { useLanguage } from '../LanguageContext'
import {
  REFERRAL_EXCHANGES, REFERRAL_TOTAL, useOffersAllowed, openReferral,
  readVault, writeVault, starterPackSeen, markStarterPackSeen, setOffersSetting,
} from '../referrals'
import { track } from '../analytics'
import sfx from '../sfx'
import './PartnerOffers.css'

// The four referral placements. Each one renders nothing unless
// useOffersAllowed() says offers may be shown (the person's setting, the remote
// switch and the region check in referrals.js), and each carries the
// disclosure line.

/** An exchange's mark, drawn inline so it never waits on a CDN. */
export function ExchangeMark({ id, size = 24 }) {
  if (id === 'binance') return (
    <svg viewBox="0 0 40 40" width={size} height={size} aria-hidden="true">
      <polygon points="20,6 24,10 20,14 16,10" fill="#F0B90B"/><polygon points="20,26 24,30 20,34 16,30" fill="#F0B90B"/>
      <polygon points="6,20 10,16 14,20 10,24" fill="#F0B90B"/><polygon points="26,20 30,16 34,20 30,24" fill="#F0B90B"/>
      <polygon points="20,16 24,20 20,24 16,20" fill="#F0B90B"/>
    </svg>
  )
  if (id === 'okx') return (
    <svg viewBox="0 0 40 40" width={size} height={size} fill="#fff" aria-hidden="true">
      <rect x="4" y="4" width="10" height="10" rx="1.5"/><rect x="26" y="4" width="10" height="10" rx="1.5"/>
      <rect x="15" y="15" width="10" height="10" rx="1.5"/><rect x="4" y="26" width="10" height="10" rx="1.5"/>
      <rect x="26" y="26" width="10" height="10" rx="1.5"/>
    </svg>
  )
  if (id === 'bybit') return (
    <svg viewBox="0 0 44 16" width={size * 1.3} height={size * 0.5} aria-hidden="true">
      <text x="1" y="13" fontFamily="Sora, Arial, sans-serif" fontWeight="800" fontSize="13" fill="#fff">BYB<tspan fill="#F7A600">I</tspan>T</text>
    </svg>
  )
  return null
}

export function Disclosure({ long = false }) {
  const { t } = useLanguage()
  return <p className="po-disc">{long ? t('refDisclosure') : t('refDisclosureShort')}</p>
}

/** "Up to 100 USD" pill. */
function RewardPill({ ex }) {
  const { t } = useLanguage()
  return <span className="po-pill" style={{ background: ex.color, color: ex.ink }}>{t('refUpTo')(ex.reward)}</span>
}

/** A row per exchange: mark, name, one line about it, and the reward. */
export function OfferList({ placement, popular = false }) {
  const { t } = useLanguage()
  return (
    <div className="po-list">
      {REFERRAL_EXCHANGES.map((ex, i) => (
        <button key={ex.id} type="button" className="po-ex" onClick={() => openReferral(ex, placement)}>
          <span className="po-ex-mark" style={{ background: ex.bg }}><ExchangeMark id={ex.id} /></span>
          <span className="po-ex-t">
            <b>{ex.name}{popular && i === 0 && <span className="po-best">{t('refPopular')}</span>}</b>
            <small>{t(ex.subKey)}</small>
          </span>
          <RewardPill ex={ex} />
        </button>
      ))}
    </div>
  )
}

// ── 1. Dashboard: the Rewards Vault ─────────────────────────────────────────
// Three wrapped gifts. Tapping one unwraps it to show the exchange and its
// bonus; tapping an unwrapped one opens the link. Once all three are open the
// card folds down to a slim strip, and it can be hidden outright.

const BOX = { binance: ['#F0B90B', '#b88a00'], okx: ['#e5e7eb', '#9ca3af'], bybit: ['#F7A600', '#c27f00'] }

export function RewardsVault() {
  const { t } = useLanguage()
  const allowed = useOffersAllowed()
  const [vault, setVault] = useState(readVault)
  useEffect(() => { if (allowed && !vault.hidden) track('referral_vault_shown', { opened: vault.opened.length }) }, [allowed]) // eslint-disable-line react-hooks/exhaustive-deps
  if (!allowed || vault.hidden) return null

  const save = (v) => { setVault(v); writeVault(v) }
  const hide = () => { save({ ...vault, hidden: true }); track('referral_vault_hidden') }
  const unwrap = (ex) => {
    if (vault.opened.includes(ex.id)) { openReferral(ex, 'vault'); return }
    const opened = [...vault.opened, ex.id]
    save({ ...vault, opened })
    try { sfx.playSelect(opened.length + 1, true) } catch {}
    sfx.haptic(12)
    track('referral_vault_unwrap', { exchange: ex.name, count: opened.length })
  }
  const done = vault.opened.length >= REFERRAL_EXCHANGES.length
  const title = t('refVaultTitle')(REFERRAL_TOTAL)
  const [before, after] = title.split(REFERRAL_TOTAL)

  if (done) {
    return (
      <div className="po-vault po-vault-strip">
        <span className="po-strip-label">🎁 {t('refVaultStrip')}</span>
        <div className="po-strip-row">
          {REFERRAL_EXCHANGES.map(ex => (
            <button key={ex.id} type="button" className="po-strip-btn" onClick={() => openReferral(ex, 'vault_strip')} style={{ '--c': ex.color }}>
              <ExchangeMark id={ex.id} size={16} /><span>{ex.reward}</span>
            </button>
          ))}
        </div>
        <button type="button" className="po-x" onClick={hide} aria-label={t('refHide')} title={t('refHide')}>×</button>
        <Disclosure />
      </div>
    )
  }

  return (
    <div className="po-vault">
      <button type="button" className="po-x" onClick={hide} aria-label={t('refHide')} title={t('refHide')}>×</button>
      <div className="po-eyebrow">🎁 {t('refVaultEyebrow')}</div>
      <div className="po-title">{before}<em>{REFERRAL_TOTAL}</em>{after}</div>
      <div className="po-sub">{t('refVaultSub')}</div>
      <div className="po-gifts">
        {REFERRAL_EXCHANGES.map((ex, i) => {
          const open = vault.opened.includes(ex.id)
          return (
            <button key={ex.id} type="button" className={`po-gift${open ? ' open' : ''}`} onClick={() => unwrap(ex)}
              aria-label={open ? `${ex.name} · ${t('refUpTo')(ex.reward)} · ${t('refClaim')}` : t('refGift')(i + 1)}>
              <span className="po-face po-front">
                <span className="po-box" style={{ animationDelay: `${i * 0.4}s` }}>
                  <i style={{ background: `linear-gradient(${BOX[ex.id][0]}, ${BOX[ex.id][1]})` }} />
                  <s style={{ background: BOX[ex.id][0] }} /><u />
                </span>
                <span className="po-gift-lbl">{t('refGift')(i + 1)}</span>
              </span>
              <span className="po-face po-back" style={{ background: ex.bg }}>
                <span className="po-back-mark"><ExchangeMark id={ex.id} size={20} /></span>
                <span className="po-amt" style={{ color: ex.color }}>{ex.reward}</span>
                <span className="po-by">{ex.name}</span>
                <span className="po-claim" style={{ background: ex.color, color: ex.ink }}>{t('refClaim')} →</span>
              </span>
            </button>
          )
        })}
      </div>
      <div className="po-foot">
        <span className="po-prog">{t('refUnwrapped')(vault.opened.length, REFERRAL_EXCHANGES.length)}</span>
        <span className="po-bar"><span style={{ width: `${(vault.opened.length / REFERRAL_EXCHANGES.length) * 100}%` }} /></span>
      </div>
      <Disclosure long />
    </div>
  )
}

// ── 2. Asset page: where to buy ─────────────────────────────────────────────

export function WhereToBuy({ symbol }) {
  const { t } = useLanguage()
  const allowed = useOffersAllowed()
  if (!allowed) return null
  return (
    <div className="po-where">
      <h3>{t('refBuyWithBonus')(symbol || '')}</h3>
      <p>{t('refBuySub')}</p>
      <OfferList placement="asset_page" popular />
      <Disclosure />
    </div>
  )
}

// ── 3. Buy ticket: "no exchange yet?" ───────────────────────────────────────

export function NoExchangeOffer() {
  const { t } = useLanguage()
  const allowed = useOffersAllowed()
  const [open, setOpen] = useState(false)
  if (!allowed) return null
  return (
    <div className="po-noacct-wrap">
      <button type="button" className="po-noacct" aria-expanded={open}
        onClick={() => { setOpen(o => !o); if (!open) track('referral_trade_expand') }}>
        <span className="po-noacct-ico" aria-hidden="true">🎁</span>
        <span className="po-noacct-t"><b>{t('refNoExchange')}</b>{t('refNoExchangeSub')(REFERRAL_EXCHANGES[0].reward)}</span>
        <span className="po-pill po-pill-gold">{t('refPick')} {open ? '▴' : '▾'}</span>
      </button>
      {open && <><OfferList placement="trade_sheet" /><Disclosure /></>}
    </div>
  )
}

// ── 4. After setup: the starter pack ────────────────────────────────────────
// Shown once, a moment after the first dashboard appears, so it lands after
// the day's explode effect rather than on top of it.

export function StarterPack({ ready }) {
  const { t } = useLanguage()
  const allowed = useOffersAllowed()
  const [show, setShow] = useState(false)
  useEffect(() => {
    if (!ready || !allowed || starterPackSeen()) return undefined
    const timer = setTimeout(() => {
      markStarterPackSeen()
      setShow(true)
      track('referral_starter_shown')
      try { sfx.playTriumph() } catch {}
    }, 3200)
    return () => clearTimeout(timer)
  }, [ready, allowed])
  if (!show) return null
  const close = () => { setShow(false); track('referral_starter_later') }
  return (
    <div className="po-starter" role="dialog" aria-modal="true" aria-label={t('refStarterTitleB')} data-wl-starter-pack>
      <div className="po-confetti" aria-hidden="true">
        {Array.from({ length: 24 }, (_, i) => (
          <i key={i} style={{ left: `${(i * 37) % 100}%`, background: ['#facc15', '#12d47a', '#f59e0b', '#fff', '#60a5fa'][i % 5], animationDuration: `${3 + (i % 5) * 0.6}s`, animationDelay: `${-(i % 7) * 0.7}s` }} />
        ))}
      </div>
      <div className="po-starter-inner">
        <div className="po-badge" aria-hidden="true">🎁</div>
        <h2>{t('refStarterTitleA')}<br /><em>{t('refStarterTitleB')}</em></h2>
        <p>{t('refStarterSub')(REFERRAL_TOTAL)}</p>
        <OfferList placement="starter_pack" />
        <Disclosure long />
        <button type="button" className="po-later" onClick={close}>{t('refMaybeLater')}</button>
        <button type="button" className="po-never" onClick={() => { setOffersSetting(false); setShow(false); track('referral_offers_off', { source: 'starter_pack' }) }}>{t('refHideAll')}</button>
      </div>
    </div>
  )
}
